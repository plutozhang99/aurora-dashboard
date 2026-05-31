"""FastAPI application entrypoint.

Mounts the API routers, enables permissive CORS for local dev, and — in
production, when a built ``dist/`` exists — serves the SPA via StaticFiles with
an index.html fallback for non-``/api`` routes. Dev (no ``dist/``) skips static
mounting and relies on the Vite dev proxy.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .routers import briefing, email, health, models, news, store, tts


def safe_static_file(dist_root: Path, full_path: str) -> Path | None:
    """Resolve ``full_path`` under ``dist_root`` for SPA static serving.

    Returns the file to serve only when it is a real file confined to
    ``dist_root``; returns ``None`` for empty paths, missing files, or any path
    that escapes the build directory. This is the path-traversal guard: a raw or
    percent-encoded ``..`` must never resolve outside ``dist_root`` (uvicorn does
    not normalize ``../`` for us, so we cannot rely on the framework).
    """
    if not full_path:
        return None
    candidate = (dist_root / full_path).resolve()
    try:
        candidate.relative_to(dist_root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None

app = FastAPI(title="Aurora Dashboard API", version="0.1.0")

# Permissive CORS for local dev (the Vite dev server proxies /api, but direct
# cross-origin access during development is also allowed).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(news.router)
app.include_router(email.router)
app.include_router(briefing.router)
app.include_router(store.router)
app.include_router(tts.router)
app.include_router(models.router)


def _mount_static() -> None:
    """Serve the built frontend when dist/ exists (production)."""
    dist = config.dist_dir()
    if dist is None:
        return

    dist_root = dist.resolve()
    index_file = dist_root / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # API routes are handled by the routers above; never shadow them.
        # Confine to dist_root (path-traversal guard); anything outside or
        # missing falls through to index.html for client-side SPA routing.
        served = safe_static_file(dist_root, full_path)
        return FileResponse(served if served is not None else index_file)

    # Mount assets dir for hashed build output if present.
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")


_mount_static()
