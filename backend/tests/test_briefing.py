"""Briefing tests: LLM text, no-AI structured fallback, empty state, account failure."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import AIConfig
from app.services.briefing import build_structured_text, generate_briefing

from .conftest import make_email

client = TestClient(app)


def _emails():
    return [{"from": "boss@x.com", "subject": "Q3 plan", "snippet": "review", "receivedAt": 5}]


def _schedule():
    return [{"id": "s-accA-1", "time": "10:00", "title": "Standup", "source": "a@x.com", "sourceAccountId": "accA"}]


def _news():
    return [{"id": "n1", "title": "Big news", "source": "Feed A", "url": "x", "publishedAt": 9}]


# --- pure structured text -----------------------------------------------------
def test_structured_text_with_materials():
    text = build_structured_text(emails=_emails(), schedule=_schedule(), news=_news(), today="2026-05-27")
    assert "2026-05-27" in text
    assert "Standup" in text
    assert "Q3 plan" in text
    assert "Big news" in text


def test_structured_text_empty_state():
    text = build_structured_text(emails=[], schedule=[], news=[])
    assert text.strip()  # non-empty
    assert "没有" in text or "平静" in text


# --- generate_briefing service ------------------------------------------------
async def test_generate_briefing_no_ai_does_not_call_llm():
    called = {"n": 0}

    async def llm_should_not_run(**kwargs):
        called["n"] += 1
        return {"text": "nope"}

    out = await generate_briefing(
        emails=_emails(), schedule=_schedule(), news=_news(),
        ai=None, prompt="p", today="2026-05-27", llm_fn=llm_should_not_run,
    )
    assert called["n"] == 0
    assert "Standup" in out["text"]


async def test_generate_briefing_with_ai_returns_text():
    async def fake_llm(**kwargs):
        return {"text": "Good morning! Big day ahead.", "sections": {"emails": 1}}

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await generate_briefing(
        emails=_emails(), schedule=_schedule(), news=_news(),
        ai=ai, prompt="p", today="2026-05-27", llm_fn=fake_llm,
    )
    assert out["text"] == "Good morning! Big day ahead."
    assert out["sections"] == {"emails": 1}


async def test_generate_briefing_llm_failure_degrades():
    from app.services.llm import LLMError

    async def boom(**kwargs):
        raise LLMError("down")

    ai = AIConfig(provider="anthropic", apiKey="k", model=None)
    out = await generate_briefing(
        emails=_emails(), schedule=_schedule(), news=_news(),
        ai=ai, prompt="p", today=None, llm_fn=boom,
    )
    assert "Standup" in out["text"]  # structured fallback


# --- endpoint level -----------------------------------------------------------
def test_briefing_endpoint_no_ai_structured(monkeypatch):
    async def fake_fetch_all(accounts, since, **kwargs):
        return [("accA", [make_email(1, subject="urgent invoice", snippet="pay now", date=100)])], []

    async def fake_news(feeds):
        return _news()

    monkeypatch.setattr("app.routers.briefing.fetch_all", fake_fetch_all)
    monkeypatch.setattr("app.routers.briefing.news_service.fetch_news", fake_news)

    res = client.post(
        "/api/briefing",
        json={
            "accounts": [{"id": "accA", "enabled": True, "host": "h", "port": 993, "user": "u", "password": "p", "secure": True}],
            "newsFeeds": ["http://a.com"],
            "prompts": {"briefing": ""},
            "today": "2026-05-27",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["text"], str) and body["text"].strip()
    assert isinstance(body["generatedAt"], int) and body["generatedAt"] > 0
    assert "Big news" in body["text"]


def test_briefing_endpoint_all_empty(monkeypatch):
    async def fake_fetch_all(accounts, since, **kwargs):
        return [], []

    async def fake_news(feeds):
        return []

    monkeypatch.setattr("app.routers.briefing.fetch_all", fake_fetch_all)
    monkeypatch.setattr("app.routers.briefing.news_service.fetch_news", fake_news)

    res = client.post(
        "/api/briefing",
        json={"accounts": [], "newsFeeds": [], "prompts": {"briefing": ""}, "today": "2026-05-27"},
    )
    assert res.status_code == 200
    assert res.json()["text"].strip()


def test_briefing_endpoint_account_failure_still_produces(monkeypatch):
    async def fake_fetch_all(accounts, since, **kwargs):
        # accA ok, accB failed — still produce briefing from accA's materials.
        return [("accA", [make_email(1, subject="meeting at 09:00", snippet="join", date=100)])], [
            {"accountId": "accB", "message": "boom"}
        ]

    async def fake_news(feeds):
        return []

    monkeypatch.setattr("app.routers.briefing.fetch_all", fake_fetch_all)
    monkeypatch.setattr("app.routers.briefing.news_service.fetch_news", fake_news)

    res = client.post(
        "/api/briefing",
        json={
            "accounts": [
                {"id": "accA", "enabled": True, "host": "h", "port": 993, "user": "u", "password": "p", "secure": True},
                {"id": "accB", "enabled": True, "host": "h", "port": 993, "user": "u2", "password": "p", "secure": True},
            ],
            "newsFeeds": [],
            "prompts": {"briefing": ""},
            "today": "2026-05-27",
        },
    )
    assert res.status_code == 200
    assert res.json()["text"].strip()
