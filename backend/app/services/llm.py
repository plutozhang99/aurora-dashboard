"""Provider-agnostic async LLM JSON helper.

Uses the official async SDKs (``anthropic.AsyncAnthropic``, ``openai.AsyncOpenAI``).
Anthropic is native; OpenAI, **DeepSeek**, and **Ollama** all speak the OpenAI
chat-completions wire format, so they share one ``AsyncOpenAI`` client that only
differs by ``base_url`` (and, for the cloud ones, an API key) — DeepSeek at
``https://api.deepseek.com`` and Ollama at a local ``.../v1`` endpoint that
ignores the key. The function returns a parsed ``dict`` on success and raises
:class:`LLMError` on any failure (bad provider/key, transport error, or
unparseable output) so callers can degrade to keyword/heuristic logic.
"""

from __future__ import annotations

import json
import re
from typing import Any

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
# Ollama has no canonical default — it depends on what the user has `ollama pull`ed.
# llama3.1 is a common, widely-pulled choice; the UI nudges the user to set theirs.
DEFAULT_OLLAMA_MODEL = "llama3.1"

# OpenAI-compatible base URLs. OpenAI itself uses the SDK default (base_url=None).
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
OLLAMA_BASE_URL = "http://localhost:11434/v1"

_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]+?)\s*```")


class LLMError(Exception):
    """Raised when the LLM cannot be called or its output is not JSON."""


def parse_json_loose(text: str) -> dict[str, Any]:
    """Recover a JSON object from possibly-fenced / noisy model output.

    Mirrors ``parseJsonLoose`` in llm.mjs: try raw, then ```json fences, then
    the outermost ``{...}``. Raises :class:`LLMError` if nothing parses.
    """
    trimmed = str(text).strip()
    try:
        return json.loads(trimmed)
    except (ValueError, TypeError):
        pass

    fenced = _FENCE_RE.search(trimmed)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except (ValueError, TypeError):
            pass

    first = trimmed.find("{")
    last = trimmed.rfind("}")
    if first != -1 and last > first:
        try:
            return json.loads(trimmed[first : last + 1])
        except (ValueError, TypeError):
            pass

    raise LLMError(f"llm: response was not JSON: {trimmed[:200]}")


async def _call_anthropic(api_key: str, model: str | None, system: str, user: str) -> str:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key)
    resp = await client.messages.create(
        model=model or DEFAULT_ANTHROPIC_MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    parts = getattr(resp, "content", None) or []
    for block in parts:
        text = getattr(block, "text", None)
        if text:
            return text
    return ""


async def _call_openai_compatible(
    api_key: str,
    model: str | None,
    system: str,
    user: str,
    *,
    base_url: str | None,
    default_model: str,
) -> str:
    """One code path for every OpenAI-wire provider (OpenAI / DeepSeek / Ollama).

    ``base_url=None`` targets OpenAI itself; pass a provider base URL otherwise.
    All three honour ``response_format=json_object``; anything that slips through
    is still recovered by :func:`parse_json_loose`.
    """
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    resp = await client.chat.completions.create(
        model=model or default_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


async def _call_openai(api_key: str, model: str | None, system: str, user: str, base_url: str | None = None) -> str:
    return await _call_openai_compatible(
        api_key, model, system, user, base_url=base_url, default_model=DEFAULT_OPENAI_MODEL
    )


async def _call_deepseek(api_key: str, model: str | None, system: str, user: str, base_url: str | None = None) -> str:
    return await _call_openai_compatible(
        api_key, model, system, user, base_url=base_url or DEEPSEEK_BASE_URL, default_model=DEFAULT_DEEPSEEK_MODEL
    )


async def _call_ollama(api_key: str | None, model: str | None, system: str, user: str, base_url: str | None = None) -> str:
    # Ollama needs no real key, but the OpenAI SDK still requires a non-empty string.
    return await _call_openai_compatible(
        api_key or "ollama", model, system, user, base_url=base_url or OLLAMA_BASE_URL, default_model=DEFAULT_OLLAMA_MODEL
    )


async def llm_json(
    *,
    provider: str | None,
    api_key: str | None,
    model: str | None,
    system: str,
    user: str,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Ask an LLM to return strict JSON; parse and return it.

    ``base_url`` overrides the provider default (used to point Ollama at a
    non-default host, or DeepSeek/OpenAI at a proxy). Raises :class:`LLMError`
    for missing config, unknown provider, transport errors, or unparseable
    output.
    """
    if not provider:
        raise LLMError("llm: provider required")
    # Every provider except Ollama (local, keyless) needs an API key.
    if provider != "ollama" and not api_key:
        raise LLMError("llm: provider/apiKey required")

    try:
        if provider == "anthropic":
            raw = await _call_anthropic(api_key, model, system, user)
        elif provider == "openai":
            raw = await _call_openai(api_key, model, system, user, base_url)
        elif provider == "deepseek":
            raw = await _call_deepseek(api_key, model, system, user, base_url)
        elif provider == "ollama":
            raw = await _call_ollama(api_key, model, system, user, base_url)
        else:
            raise LLMError(f"llm: unknown provider {provider}")
    except LLMError:
        raise
    except Exception as exc:  # transport / API errors → controlled error
        raise LLMError(f"llm: request failed: {exc}") from exc

    return parse_json_loose(raw)
