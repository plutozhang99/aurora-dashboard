"""News endpoint + service tests (no network)."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app
from app.services import news as news_service

client = TestClient(app)


def _stub_feed(title, entries):
    return {"feed": {"title": title}, "entries": entries}


def test_health_ok():
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert isinstance(body["time"], int)
    assert body["time"] > 0


def test_news_happy(monkeypatch):
    now_struct = time.gmtime(1_700_000_000)
    feeds_data = {
        "http://a.com/rss": _stub_feed(
            "Feed A",
            [
                {"id": "a1", "title": "Older", "link": "http://a.com/1", "published_parsed": time.gmtime(1_600_000_000)},
                {"id": "a2", "title": "Newer", "link": "http://a.com/2", "published_parsed": now_struct},
            ],
        ),
        "http://b.com/rss": _stub_feed(
            "Feed B",
            [{"id": "b1", "title": "B item", "link": "http://b.com/1", "published_parsed": time.gmtime(1_650_000_000)}],
        ),
    }

    def fake_parse(url):
        return feeds_data[url]

    monkeypatch.setattr(news_service, "_parse_one_blocking", lambda url: news_service.normalize_feed(url, fake_parse(url)))

    res = client.post("/api/news", json={"feeds": list(feeds_data)})
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 3
    # Sorted by publishedAt desc.
    assert items[0]["title"] == "Newer"
    assert items[-1]["title"] == "Older"
    assert all({"id", "title", "source", "url", "publishedAt"} <= set(it) for it in items)
    assert items[0]["source"] == "Feed A"


def test_news_broken_feed_skipped(monkeypatch):
    def fake_parse_one(url):
        if "broken" in url:
            raise RuntimeError("boom")
        return [
            {"id": "ok1", "title": "OK", "source": "Good", "url": url, "publishedAt": 123}
        ]

    monkeypatch.setattr(news_service, "_parse_one_blocking", fake_parse_one)

    res = client.post("/api/news", json={"feeds": ["http://broken.com", "http://good.com"]})
    assert res.status_code == 200  # no whole-request 500
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "OK"


def test_news_empty_feeds():
    res = client.post("/api/news", json={"feeds": []})
    assert res.status_code == 200
    assert res.json()["items"] == []


def test_normalize_feed_caps_per_feed():
    entries = [{"id": f"e{i}", "title": f"t{i}", "link": "x"} for i in range(20)]
    out = news_service.normalize_feed("http://x.com", _stub_feed("X", entries))
    assert len(out) == news_service.PER_FEED_CAP


def test_published_ms_treats_struct_time_as_utc():
    # Regression: feedparser's *_parsed is a UTC struct_time. The result must be
    # the UTC epoch (calendar.timegm), independent of the server's local tz, not
    # time.mktime which would assume local time and skew by the UTC offset.
    epoch = 1_700_000_000
    entry = {"published_parsed": time.gmtime(epoch)}
    assert news_service._published_ms(entry) == epoch * 1000


def test_merge_news_total_cap():
    lists = [[{"publishedAt": i} for i in range(20)] for _ in range(3)]
    merged = news_service.merge_news(lists)
    assert len(merged) == news_service.TOTAL_CAP
