"""LLM service tests (no network — parsing + error paths only)."""

from __future__ import annotations

import pytest

from app.services.llm import LLMError, llm_json, parse_json_loose


def test_parse_json_loose_plain():
    assert parse_json_loose('{"a": 1}') == {"a": 1}


def test_parse_json_loose_fenced():
    assert parse_json_loose('```json\n{"a": 2}\n```') == {"a": 2}
    assert parse_json_loose('```\n{"b": 3}\n```') == {"b": 3}


def test_parse_json_loose_embedded():
    assert parse_json_loose('here is the result: {"x": [1,2]} thanks') == {"x": [1, 2]}


def test_parse_json_loose_raises_on_non_json():
    with pytest.raises(LLMError):
        parse_json_loose("totally not json at all")


async def test_llm_json_requires_provider_and_key():
    with pytest.raises(LLMError):
        await llm_json(provider=None, api_key="k", model=None, system="s", user="u")
    with pytest.raises(LLMError):
        await llm_json(provider="anthropic", api_key=None, model=None, system="s", user="u")


async def test_llm_json_unknown_provider():
    with pytest.raises(LLMError):
        await llm_json(provider="mystery", api_key="k", model=None, system="s", user="u")


async def test_llm_json_parses_anthropic(monkeypatch):
    async def fake_call(api_key, model, system, user):
        return '{"important": [{"uid": 1}]}'

    monkeypatch.setattr("app.services.llm._call_anthropic", fake_call)
    out = await llm_json(provider="anthropic", api_key="k", model=None, system="s", user="u")
    assert out == {"important": [{"uid": 1}]}


async def test_llm_json_transport_error_becomes_llmerror(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr("app.services.llm._call_openai", boom)
    with pytest.raises(LLMError):
        await llm_json(provider="openai", api_key="k", model=None, system="s", user="u")


async def test_llm_json_non_json_response_raises(monkeypatch):
    async def fake_call(api_key, model, system, user):
        return "I cannot do that"

    monkeypatch.setattr("app.services.llm._call_anthropic", fake_call)
    with pytest.raises(LLMError):
        await llm_json(provider="anthropic", api_key="k", model=None, system="s", user="u")


async def test_llm_json_routes_deepseek(monkeypatch):
    async def fake_call(api_key, model, system, user, base_url=None):
        return '{"ok": true}'

    monkeypatch.setattr("app.services.llm._call_deepseek", fake_call)
    out = await llm_json(provider="deepseek", api_key="k", model=None, system="s", user="u")
    assert out == {"ok": True}


async def test_llm_json_ollama_needs_no_api_key(monkeypatch):
    seen = {}

    async def fake_call(api_key, model, system, user, base_url=None):
        seen["api_key"] = api_key
        seen["base_url"] = base_url
        return '{"ok": true}'

    monkeypatch.setattr("app.services.llm._call_ollama", fake_call)
    # No api_key supplied — Ollama is local and keyless, so this must NOT raise.
    out = await llm_json(provider="ollama", api_key=None, model="llama3.1", system="s", user="u")
    assert out == {"ok": True}
    assert seen["api_key"] is None  # the wrapper substitutes a dummy key downstream


async def test_llm_json_base_url_passed_through(monkeypatch):
    seen = {}

    async def fake_call(api_key, model, system, user, base_url=None):
        seen["base_url"] = base_url
        return "{}"

    monkeypatch.setattr("app.services.llm._call_ollama", fake_call)
    await llm_json(
        provider="ollama", api_key=None, model=None,
        system="s", user="u", base_url="http://192.168.1.9:11434/v1",
    )
    assert seen["base_url"] == "http://192.168.1.9:11434/v1"
