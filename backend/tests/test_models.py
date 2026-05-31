"""AI list-models endpoint — provider routing + validation, SDK calls mocked."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import models as models_router

client = TestClient(app)


@pytest.fixture
def fake_lists(monkeypatch):
    """Replace the SDK-backed helpers with deterministic stubs."""
    calls: dict = {}

    async def fake_anthropic(api_key):
        calls["anthropic"] = api_key
        return [models_router.ModelInfo(id="claude-opus-4-7", label="Claude Opus 4.7")]

    async def fake_openai(api_key, base_url, *, chat_only):
        calls["openai"] = {"key": api_key, "base_url": base_url, "chat_only": chat_only}
        return [models_router.ModelInfo(id="gpt-5.4"), models_router.ModelInfo(id="gpt-4o-mini")]

    monkeypatch.setattr(models_router, "_list_anthropic", fake_anthropic)
    monkeypatch.setattr(models_router, "_list_openai_compatible", fake_openai)
    return calls


def test_anthropic_models(fake_lists):
    res = client.post("/api/models", json={"provider": "anthropic", "apiKey": "sk-x"})
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["models"]]
    assert ids == ["claude-opus-4-7"]
    assert fake_lists["anthropic"] == "sk-x"


def test_deepseek_uses_default_base_url(fake_lists):
    res = client.post("/api/models", json={"provider": "deepseek", "apiKey": "sk-y"})
    assert res.status_code == 200
    assert fake_lists["openai"]["base_url"] == models_router.llm.DEEPSEEK_BASE_URL
    assert fake_lists["openai"]["chat_only"] is False


def test_openai_requests_chat_only(fake_lists):
    res = client.post("/api/models", json={"provider": "openai", "apiKey": "sk-z"})
    assert res.status_code == 200
    assert fake_lists["openai"]["chat_only"] is True


def test_ollama_needs_no_key(fake_lists):
    res = client.post("/api/models", json={"provider": "ollama"})
    assert res.status_code == 200
    assert fake_lists["openai"]["base_url"] == models_router.llm.OLLAMA_BASE_URL


def test_non_ollama_requires_key(fake_lists):
    res = client.post("/api/models", json={"provider": "openai"})
    assert res.status_code == 400


def test_missing_provider_is_400(fake_lists):
    res = client.post("/api/models", json={"provider": "none"})
    assert res.status_code == 400


def test_sdk_failure_is_502(monkeypatch):
    async def boom(api_key):
        raise RuntimeError("bad key")

    monkeypatch.setattr(models_router, "_list_anthropic", boom)
    res = client.post("/api/models", json={"provider": "anthropic", "apiKey": "sk-x"})
    assert res.status_code == 502
