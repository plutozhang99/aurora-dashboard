"""Lightweight single-file JSON persistence for single-user local data.

No database — the whole document is tiny (a handful of todos, one scratchpad
note, dismissed email/suggestion markers). The whole doc is rewritten on every
mutation. Writes are atomic (temp file + ``os.replace``) so a crash mid-write
can never corrupt the store, and an ``asyncio.Lock`` serializes concurrent
requests within the single event loop.

Shape of ``store.json``::

    {
      "todos":       [ {TodoItem}, ... ],
      "note":        "free text",
      "suggestions": [ {dismissed TodoSuggestion}, ... ],
      "emails":      [ {dismissed EmailItem}, ... ]
    }
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from .. import config

# Serializes read-modify-write cycles. The blocking file IO is trivially small,
# so doing it under the lock (rather than a thread pool) keeps things simple.
_lock = asyncio.Lock()

# List-valued collections in the document, keyed by id.
COLLECTIONS = ("todos", "suggestions", "emails")


def _default_doc() -> dict[str, Any]:
    return {"todos": [], "note": "", "suggestions": [], "emails": []}


def _path() -> Path:
    return config.data_dir() / "store.json"


def _read_unlocked() -> dict[str, Any]:
    path = _path()
    if not path.is_file():
        return _default_doc()
    try:
        data = json.loads(path.read_text("utf-8"))
    except (json.JSONDecodeError, OSError):
        # A corrupt/unreadable file falls back to empty rather than 500ing.
        return _default_doc()
    if not isinstance(data, dict):
        return _default_doc()
    return {**_default_doc(), **data}


def _write_unlocked(doc: dict[str, Any]) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(doc, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, path)  # atomic on POSIX + Windows
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


# ── List collections (todos / suggestions / emails) ─────────────────────────


async def get_list(key: str) -> list[dict]:
    async with _lock:
        return list(_read_unlocked().get(key, []))


async def upsert_item(key: str, item: dict) -> dict:
    """Insert or replace ``item`` (matched by ``id``). Idempotent by id."""
    async with _lock:
        doc = _read_unlocked()
        rows = [x for x in doc.get(key, []) if x.get("id") != item.get("id")]
        rows.append(item)
        doc[key] = rows
        _write_unlocked(doc)
        return item


async def delete_item(key: str, item_id: str) -> None:
    async with _lock:
        doc = _read_unlocked()
        doc[key] = [x for x in doc.get(key, []) if x.get("id") != item_id]
        _write_unlocked(doc)


# ── Scalar values (note) ─────────────────────────────────────────────────────


async def get_value(key: str, default: Any) -> Any:
    async with _lock:
        return _read_unlocked().get(key, default)


async def set_value(key: str, value: Any) -> None:
    async with _lock:
        doc = _read_unlocked()
        doc[key] = value
        _write_unlocked(doc)
