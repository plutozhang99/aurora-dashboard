"""Classification tests: keyword matcher, importance AI/keyword, heuristic schedule."""

from __future__ import annotations

from app.models import AIConfig
from app.services import classify
from app.services.classify import (
    build_keyword_matcher,
    classify_important,
    classify_schedule,
    heuristic_schedule,
)

from .conftest import make_email


def test_keyword_matcher_basic():
    m = build_keyword_matcher(["urgent", "发票"])
    assert m("This is URGENT")
    assert m("您的发票已生成")
    assert not m("hello world")


def test_keyword_matcher_empty_always_false():
    m = build_keyword_matcher([])
    assert not m("urgent important")
    m2 = build_keyword_matcher(None)
    assert not m2("anything")


def test_keyword_matcher_escapes_special_chars():
    m = build_keyword_matcher(["c++", "a.b"])
    assert m("learning c++ today")
    assert m("file a.b here")
    assert not m("axb")  # the dot must be literal


def test_heuristic_schedule_extracts_time():
    msgs = [
        make_email(1, subject="Meeting at 14:30", snippet="join the call"),
        make_email(2, subject="random", snippet="nothing here"),
        make_email(3, subject="Call 3 pm", snippet="meeting reminder"),
    ]
    matcher = build_keyword_matcher(["meeting", "call"])
    out = heuristic_schedule(msgs, matcher, account_id="accA")
    titles = {o["title"]: o["time"] for o in out}
    assert "Meeting at 14:30" in titles and titles["Meeting at 14:30"] == "14:30"
    assert "Call 3 pm" in titles and titles["Call 3 pm"] == "03:00 pm"
    assert "random" not in titles
    assert all(o["sourceAccountId"] == "accA" for o in out)
    assert all(o["id"].startswith("s-accA-") for o in out)


def test_heuristic_schedule_chinese_time():
    msgs = [make_email(1, subject="下午3点开会", snippet="会议")]
    matcher = build_keyword_matcher(["会议", "开会"])
    out = heuristic_schedule(msgs, matcher, account_id="x")
    assert out[0]["time"] == "03:00"


async def test_classify_important_keyword_mode():
    msgs = [
        make_email(1, subject="urgent action", snippet="x"),
        make_email(2, subject="newsletter", snippet="y"),
    ]
    uids = await classify_important(
        "accA", msgs, ai=None, prompt="", mode="keyword", keywords=["urgent"]
    )
    assert uids == {1}


async def test_classify_important_ai_mode(monkeypatch):
    msgs = [make_email(1), make_email(2), make_email(3)]

    async def fake_llm(**kwargs):
        return {"important": [{"uid": 2}, {"uid": 3}]}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    uids = await classify_important(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=["urgent"], llm_fn=fake_llm
    )
    assert uids == {2, 3}


async def test_classify_important_ai_string_uid_int_llm(monkeypatch):
    # Regression: prod uids are STRINGS (imap-tools) but the LLM returns ints.
    # The match must still succeed via str-coercion on both sides.
    msgs = [make_email("123"), make_email("456")]

    async def fake_llm(**kwargs):
        return {"important": [{"uid": 123}]}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    uids = await classify_important(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=["urgent"], llm_fn=fake_llm
    )
    assert uids == {"123"}


async def test_classify_important_ai_caches_per_account(monkeypatch):
    msgs = [make_email(1)]
    calls = {"n": 0}

    async def fake_llm(**kwargs):
        calls["n"] += 1
        return {"important": [{"uid": 1}]}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    await classify_important("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    await classify_important("accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert calls["n"] == 1  # second call served from cache

    # Different account → cache key differs → new LLM call.
    await classify_important("accB", msgs, ai=ai, prompt="p", mode="ai", keywords=[], llm_fn=fake_llm)
    assert calls["n"] == 2


async def test_classify_important_llm_failure_falls_back_to_keyword():
    msgs = [make_email(1, subject="urgent now", snippet="x"), make_email(2, subject="meh", snippet="y")]

    async def boom(**kwargs):
        raise classify.LLMError("down")

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    uids = await classify_important(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=["urgent"], llm_fn=boom
    )
    assert uids == {1}
    # Cache must not be poisoned by the failed batch.
    assert classify.cache_get("accA:imp:1") is classify._MISSING


async def test_classify_schedule_ai_mode():
    msgs = [make_email(1, frm="boss@x.com"), make_email(2)]

    async def fake_llm(**kwargs):
        return {"events": [{"uid": 1, "time": "10:00", "title": "Standup"}]}

    ai = AIConfig(provider="openai", apiKey="k", model=None)
    out = await classify_schedule(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], today_iso="2026-05-27", llm_fn=fake_llm
    )
    assert len(out) == 1
    assert out[0]["title"] == "Standup"
    assert out[0]["time"] == "10:00"
    assert out[0]["sourceAccountId"] == "accA"


async def test_classify_schedule_ai_string_uid_int_llm():
    # Regression: prod uids are STRINGS but the LLM returns the uid as an int.
    msgs = [make_email("123", frm="boss@x.com"), make_email("456")]

    async def fake_llm(**kwargs):
        return {"events": [{"uid": 123, "time": "10:00", "title": "Standup"}]}

    ai = AIConfig(provider="openai", apiKey="k", model=None)
    out = await classify_schedule(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=[], today_iso="2026-05-27", llm_fn=fake_llm
    )
    assert len(out) == 1
    assert out[0]["title"] == "Standup"
    assert out[0]["id"] == "s-accA-123"


async def test_classify_schedule_llm_failure_falls_back_to_heuristic():
    msgs = [make_email(1, subject="meeting at 09:00", snippet="join")]

    async def boom(**kwargs):
        raise classify.LLMError("down")

    ai = AIConfig(provider="openai", apiKey="k", model=None)
    out = await classify_schedule(
        "accA", msgs, ai=ai, prompt="p", mode="ai", keywords=["meeting"], today_iso=None, llm_fn=boom
    )
    assert len(out) == 1
    assert out[0]["time"] == "09:00"
