"""List the available models for the configured AI provider.

Calls the provider's own list-models API so the frontend picker can offer the
*live* catalog instead of a stale hardcoded list:
 - Anthropic  → ``AsyncAnthropic().models.list()``
 - OpenAI / DeepSeek / Ollama → OpenAI-wire ``GET /models`` (one client, base_url
   differs; reuses the URLs in :mod:`app.services.llm`).
Failures (bad key, provider down, backend can't reach Ollama) surface as a 502
so the UI can fall back to its curated list.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models import AIConfig
from ..services import llm

router = APIRouter()

# Cap how many models we return — OpenAI's catalog is large and the picker only
# needs a usable shortlist.
MAX_MODELS = 100


class ModelInfo(BaseModel):
    id: str
    label: str | None = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


def _is_openai_chat_model(model_id: str) -> bool:
    """Heuristic: keep chat/reasoning models, drop embeddings/tts/image/etc."""
    return model_id.startswith(("gpt-", "chatgpt", "o1", "o3", "o4", "o5"))


async def _list_anthropic(api_key: str) -> list[ModelInfo]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key)
    out: list[ModelInfo] = []
    async for m in client.models.list():
        out.append(ModelInfo(id=m.id, label=getattr(m, "display_name", None)))
        if len(out) >= MAX_MODELS:
            break
    return out


async def _list_openai_compatible(
    api_key: str | None, base_url: str | None, *, chat_only: bool
) -> list[ModelInfo]:
    from openai import AsyncOpenAI

    # Ollama needs no real key, but the SDK requires a non-empty string.
    client = AsyncOpenAI(api_key=api_key or "ollama", base_url=base_url)
    ids: list[str] = []
    async for m in client.models.list():
        mid = m.id
        if chat_only and not _is_openai_chat_model(mid):
            continue
        ids.append(mid)
        if len(ids) >= MAX_MODELS:
            break
    ids.sort(reverse=True)  # newer gpt-5.x before gpt-4.x, roughly
    return [ModelInfo(id=mid) for mid in ids]


@router.post("/api/models", response_model=ModelsResponse)
async def list_models(body: AIConfig) -> ModelsResponse:
    provider = (body.provider or "").strip()
    if not provider or provider == "none":
        raise HTTPException(status_code=400, detail="provider required")
    if provider != "ollama" and not body.apiKey:
        raise HTTPException(status_code=400, detail="api key required")

    try:
        if provider == "anthropic":
            models = await _list_anthropic(body.apiKey or "")
        elif provider == "openai":
            models = await _list_openai_compatible(body.apiKey, body.baseUrl or None, chat_only=True)
        elif provider == "deepseek":
            models = await _list_openai_compatible(
                body.apiKey, body.baseUrl or llm.DEEPSEEK_BASE_URL, chat_only=False
            )
        elif provider == "ollama":
            models = await _list_openai_compatible(
                body.apiKey, body.baseUrl or llm.OLLAMA_BASE_URL, chat_only=False
            )
        else:
            raise HTTPException(status_code=400, detail=f"unknown provider {provider}")
    except HTTPException:
        raise
    except Exception as exc:  # transport / API / auth failure
        raise HTTPException(status_code=502, detail=f"list models failed: {exc}") from exc

    return ModelsResponse(models=models)
