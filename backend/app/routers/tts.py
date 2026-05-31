"""Cloud text-to-speech endpoint (edge-tts).

Synthesizes briefing text to MP3 using Microsoft Edge's free online neural
voices via the ``edge-tts`` library — no API key, but it needs network access
to Microsoft's TTS service. On any failure we return a 502 so the frontend's
cloud engine can fall back to the browser's Web Speech engine.
"""

from __future__ import annotations

import edge_tts
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..models import TtsRequest

router = APIRouter()

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
# Cap synthesis size: a morning briefing is short, and this bounds the
# round-trip to Microsoft's service for a single-user setup.
MAX_TEXT_CHARS = 8000


def _rate_str(rate: float) -> str:
    """Map a Web-Speech-style multiplier (1.0 = normal) to edge-tts ``"+N%"``.

    Clamped to a sane band so a stray value can't ask for unintelligible speech.
    """
    pct = round((max(0.5, min(2.0, rate)) - 1.0) * 100)
    return f"{pct:+d}%"


@router.post("/api/tts")
async def tts(body: TtsRequest) -> Response:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    text = text[:MAX_TEXT_CHARS]
    voice = body.voice.strip() or DEFAULT_VOICE

    try:
        communicate = edge_tts.Communicate(text, voice, rate=_rate_str(body.rate))
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
    except Exception as exc:  # network / service / bad-voice failure
        raise HTTPException(status_code=502, detail=f"tts synthesis failed: {exc}") from exc

    if not audio:
        raise HTTPException(status_code=502, detail="tts produced no audio")

    return Response(
        content=bytes(audio),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
