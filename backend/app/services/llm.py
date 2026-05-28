"""Provider-agnostic async LLM JSON helper.

Port of ``server/lib/llm.mjs``. Uses the official async SDKs
(``anthropic.AsyncAnthropic``, ``openai.AsyncOpenAI``). The function returns a
parsed ``dict`` on success and raises :class:`LLMError` on any failure
(bad provider/key, transport error, or unparseable output) so callers can
degrade to keyword/heuristic logic.
"""

from __future__ import annotations

import json
import re
from typing import Any

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

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


async def _call_openai(api_key: str, model: str | None, system: str, user: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    resp = await client.chat.completions.create(
        model=model or DEFAULT_OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


async def llm_json(
    *,
    provider: str | None,
    api_key: str | None,
    model: str | None,
    system: str,
    user: str,
) -> dict[str, Any]:
    """Ask an LLM to return strict JSON; parse and return it.

    Raises :class:`LLMError` for missing config, unknown provider, transport
    errors, or unparseable output.
    """
    if not provider or not api_key:
        raise LLMError("llm: provider/apiKey required")

    try:
        if provider == "anthropic":
            raw = await _call_anthropic(api_key, model, system, user)
        elif provider == "openai":
            raw = await _call_openai(api_key, model, system, user)
        else:
            raise LLMError(f"llm: unknown provider {provider}")
    except LLMError:
        raise
    except Exception as exc:  # transport / API errors → controlled error
        raise LLMError(f"llm: request failed: {exc}") from exc

    return parse_json_loose(raw)
