"""TTS endpoint tests — edge-tts is mocked, no network is ever touched."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import tts as tts_router

client = TestClient(app)

FAKE_MP3 = b"ID3fake-mp3-bytes"


class _FakeCommunicate:
    """Stand-in for edge_tts.Communicate yielding one audio chunk."""

    captured: dict = {}

    def __init__(self, text, voice, rate="+0%"):
        _FakeCommunicate.captured = {"text": text, "voice": voice, "rate": rate}

    async def stream(self):
        yield {"type": "WordBoundary"}  # non-audio chunk must be ignored
        yield {"type": "audio", "data": FAKE_MP3}


@pytest.fixture
def fake_edge(monkeypatch):
    monkeypatch.setattr(tts_router.edge_tts, "Communicate", _FakeCommunicate)
    return _FakeCommunicate


def test_tts_returns_mp3(fake_edge):
    res = client.post("/api/tts", json={"text": "早安，今天有三封重要邮件。"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/mpeg"
    assert res.content == FAKE_MP3
    # Default voice applied; non-audio chunks dropped.
    assert fake_edge.captured["voice"] == "zh-CN-XiaoxiaoNeural"


def test_tts_passes_voice_and_maps_rate(fake_edge):
    res = client.post(
        "/api/tts",
        json={"text": "hello", "voice": "zh-CN-YunxiNeural", "rate": 1.2},
    )
    assert res.status_code == 200
    assert fake_edge.captured["voice"] == "zh-CN-YunxiNeural"
    assert fake_edge.captured["rate"] == "+20%"


def test_tts_empty_text_is_400(fake_edge):
    res = client.post("/api/tts", json={"text": "   "})
    assert res.status_code == 400


def test_tts_synthesis_failure_is_502(monkeypatch):
    class _Boom:
        def __init__(self, *a, **k):
            pass

        async def stream(self):
            raise RuntimeError("network down")
            yield  # pragma: no cover — makes this an async generator

    monkeypatch.setattr(tts_router.edge_tts, "Communicate", _Boom)
    res = client.post("/api/tts", json={"text": "hi"})
    assert res.status_code == 502


def test_tts_no_audio_is_502(monkeypatch):
    class _Silent:
        def __init__(self, *a, **k):
            pass

        async def stream(self):
            yield {"type": "WordBoundary"}

    monkeypatch.setattr(tts_router.edge_tts, "Communicate", _Silent)
    res = client.post("/api/tts", json={"text": "hi"})
    assert res.status_code == 502


def test_rate_str_clamps_and_formats():
    assert tts_router._rate_str(1.0) == "+0%"
    assert tts_router._rate_str(1.25) == "+25%"
    assert tts_router._rate_str(0.8) == "-20%"
    # Clamped to the [0.5, 2.0] band.
    assert tts_router._rate_str(10.0) == "+100%"
    assert tts_router._rate_str(0.1) == "-50%"
