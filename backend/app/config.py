"""Runtime configuration sourced from environment variables.

All values are read at import time but kept simple so tests can override via
monkeypatching the environment before importing dependent modules. Defaults
mirror the Node backend (port 5174 to reuse the existing Vite dev proxy).
"""

from __future__ import annotations

import os
from pathlib import Path

# Host/port for uvicorn. Dev binds 127.0.0.1; prod (Docker) overrides to 0.0.0.0.
HOST: str = os.environ.get("AURORA_HOST", "127.0.0.1")
PORT: int = int(os.environ.get("AURORA_PORT", "5174"))

# Max concurrent IMAP connections across accounts (R21 — avoid connection storms).
IMAP_CONCURRENCY: int = int(os.environ.get("AURORA_IMAP_CONCURRENCY", "3"))


def dist_dir() -> Path | None:
    """Return the built frontend directory if it exists, else None.

    Resolved lazily so tests and dev (no ``dist/``) skip static mounting.
    Defaults to ``<repo-root>/dist`` (i.e. ``backend/../dist``).
    """
    raw = os.environ.get("AURORA_DIST_DIR")
    if raw:
        path = Path(raw)
    else:
        # backend/app/config.py -> backend/app -> backend -> repo root
        path = Path(__file__).resolve().parents[2] / "dist"
    return path if path.is_dir() else None
