"""email→todos tests: extraction, keyword fallback, dedup, no-todo case."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import AIConfig
from app.services import classify
from app.services.classify import extract_todos, keyword_todos, build_keyword_matcher

from .conftest import make_email

client = TestClient(app)


async def test_extract_todos_ai_clear_todo():
    msgs = [make_email(1, frm="boss@x.com", subject="Report"), make_email(2, subject="newsletter")]

    async def fake_llm(**kwargs):
        return {"todos": [{"uid": 1, "text": "Send the quarterly report"}]}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert len(out) == 1
    s = out[0]
    assert s["text"] == "Send the quarterly report"
    assert s["sourceAccountId"] == "accA"
    assert s["sourceEmailId"] == "m-accA-1"
    assert s["from"] == "boss@x.com"
    assert s["subject"] == "Report"


async def test_extract_todos_ai_string_uid_int_llm():
    # Regression: prod uids are STRINGS (imap-tools) but the LLM returns the uid
    # as a JSON int. Match must succeed, and ids must use the canonical email
    # uid so sourceEmailId == the email's local_email_id.
    msgs = [make_email("123", frm="boss@x.com", subject="Report"), make_email("456")]

    async def fake_llm(**kwargs):
        return {"todos": [{"uid": 123, "text": "Send the quarterly report"}]}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert len(out) == 1
    s = out[0]
    assert s["text"] == "Send the quarterly report"
    assert s["id"] == "t-accA-123"
    assert s["sourceEmailId"] == "m-accA-123"
    assert s["from"] == "boss@x.com"
    assert s["subject"] == "Report"


async def test_extract_todos_notification_only_yields_none():
    msgs = [make_email(1, subject="Your weekly digest", snippet="here is news")]

    async def fake_llm(**kwargs):
        return {"todos": []}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert out == []


async def test_extract_todos_llm_error_falls_back_to_keyword():
    msgs = [make_email(1, subject="please submit the form", snippet="action required")]

    async def boom(**kwargs):
        raise classify.LLMError("down")

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await extract_todos(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=["please", "submit"], llm_fn=boom
    )
    assert len(out) == 1
    assert out[0]["sourceEmailId"] == "m-accA-1"


def test_keyword_todos_pure():
    msgs = [
        make_email(1, subject="please review", snippet="x"),
        make_email(2, subject="fyi only", snippet="nothing"),
    ]
    matcher = build_keyword_matcher(["please", "review"])
    out = keyword_todos("accA", msgs, matcher)
    assert len(out) == 1
    assert out[0]["sourceEmailId"] == "m-accA-1"


def test_todos_endpoint_dedups_same_email_across_accounts(monkeypatch):
    shared = make_email(1, subject="please confirm", snippet="action", message_id="<same@x>")
    other = make_email(7, subject="please confirm", snippet="action", message_id="<same@x>")

    async def fake_fetch_all(accounts, since, **kwargs):
        return [("accA", [shared]), ("accB", [other])], []

    monkeypatch.setattr("app.routers.email.fetch_all", fake_fetch_all)

    res = client.post(
        "/api/email/todos",
        json={
            "accounts": [
                {"id": "accA", "enabled": True, "host": "h", "port": 993, "user": "u", "password": "p", "secure": True},
                {"id": "accB", "enabled": True, "host": "h", "port": 993, "user": "u2", "password": "p", "secure": True},
            ],
            "mode": "keyword",
            "keywords": ["confirm", "please"],
        },
    )
    assert res.status_code == 200
    suggestions = res.json()["suggestions"]
    # Deduped to one even though seen on two accounts (same Message-ID).
    assert len(suggestions) == 1
    assert suggestions[0]["sourceAccountId"] == "accA"


async def test_extract_todos_ai_caches_per_account():
    msgs = [make_email(1, frm="boss@x.com", subject="Report")]
    calls = {"n": 0}

    async def fake_llm(**kwargs):
        calls["n"] += 1
        return {"todos": [{"uid": 1, "text": "Send the report"}]}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    a = await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    b = await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert calls["n"] == 1  # second call served from cache, no re-analysis
    assert a == b
    assert b[0]["text"] == "Send the report"

    # Different account -> cache key differs -> new LLM call.
    await extract_todos("accB", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert calls["n"] == 2


async def test_extract_todos_negative_result_is_cached():
    # An email the LLM judged to have no todo must still be cached so the next
    # poll does not re-send it to the LLM.
    msgs = [make_email(1, subject="newsletter")]
    calls = {"n": 0}

    async def fake_llm(**kwargs):
        calls["n"] += 1
        return {"todos": []}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    assert await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm) == []
    assert await extract_todos("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm) == []
    assert calls["n"] == 1


async def test_extract_todos_llm_error_does_not_poison_cache():
    msgs = [make_email(1, subject="please submit", snippet="x")]

    async def boom(**kwargs):
        raise classify.LLMError("down")

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await extract_todos(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=["please"], llm_fn=boom
    )
    assert len(out) == 1  # keyword fallback for the uncached batch
    assert classify.cache_get("accA:todo:1") is classify._MISSING


async def test_extract_todos_mixed_cached_and_new():
    # First poll analyses uid 1; second poll adds uid 2 -> only uid 2 hits the
    # LLM, and both suggestions come back.
    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    calls = {"n": 0}

    async def fake_llm(**kwargs):
        calls["n"] += 1
        # Return a todo for both uids each call; classify only matches uids it
        # actually sent (need_llm), so cached ones are ignored.
        return {"todos": [{"uid": 1, "text": "do 1"}, {"uid": 2, "text": "do 2"}]}

    await extract_todos("accA", [make_email(1)], ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    out = await extract_todos(
        "accA", [make_email(1), make_email(2)], ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm
    )
    assert calls["n"] == 2  # second call still hit the LLM (uid 2 was uncached)
    assert {s["sourceEmailId"] for s in out} == {"m-accA-1", "m-accA-2"}
