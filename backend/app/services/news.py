"""RSS news fetching via feedparser.

Port of ``server/routes/news.mjs``. Pure normalization is separated from the
blocking network fetch so it can be unit-tested without I/O. Broken feeds are
skipped individually (no whole-request failure).
"""

from __future__ import annotations

import asyncio
import calendar
import time
from typing import Any
from urllib.parse import urlparse

# Caps mirror the Node version.
PER_FEED_CAP = 8
TOTAL_CAP = 30


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc or url
    except Exception:
        return url


def _published_ms(entry: Any) -> int:
    """Best-effort published timestamp in epoch ms; falls back to now."""
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        try:
            # feedparser's *_parsed struct_time is UTC; calendar.timegm
            # interprets it as UTC (time.mktime would assume local time).
            return int(calendar.timegm(parsed) * 1000)
        except (OverflowError, ValueError, TypeError):
            pass
    return int(time.time() * 1000)


def normalize_feed(url: str, feed: Any) -> list[dict[str, Any]]:
    """Turn one parsed feedparser result into normalized news items.

    Pure: takes an already-parsed feed (dict-like) and returns up to
    ``PER_FEED_CAP`` items. Used directly by tests with stub feed objects.
    """
    feed_meta = feed.get("feed", {}) if hasattr(feed, "get") else {}
    feed_title = feed_meta.get("title") or _host(url)
    entries = feed.get("entries", []) if hasattr(feed, "get") else []

    out: list[dict[str, Any]] = []
    for entry in entries[:PER_FEED_CAP]:
        title = entry.get("title") or "(no title)"
        link = entry.get("link") or url
        item_id = (
            entry.get("id")
            or entry.get("guid")
            or f"{feed_title}:{title}:{entry.get('published', '')}"
        )
        out.append(
            {
                "id": item_id,
                "title": title,
                "source": feed_title,
                "url": link,
                "publishedAt": _published_ms(entry),
            }
        )
    return out


def merge_news(item_lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Flatten, sort by publishedAt desc, cap at TOTAL_CAP. Pure."""
    items: list[dict[str, Any]] = []
    for lst in item_lists:
        items.extend(lst)
    items.sort(key=lambda it: it["publishedAt"], reverse=True)
    return items[:TOTAL_CAP]


def _parse_one_blocking(url: str) -> list[dict[str, Any]]:
    import feedparser

    feed = feedparser.parse(url)
    return normalize_feed(url, feed)


async def fetch_news(feeds: list[str]) -> list[dict[str, Any]]:
    """Fetch all feeds concurrently; skip broken ones; return merged items."""
    if not feeds:
        return []

    async def one(url: str) -> list[dict[str, Any]]:
        try:
            return await asyncio.to_thread(_parse_one_blocking, url)
        except Exception:
            return []  # skip broken feed individually

    results = await asyncio.gather(*(one(u) for u in feeds))
    return merge_news(list(results))
