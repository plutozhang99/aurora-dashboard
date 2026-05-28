"""Health check endpoint."""

from __future__ import annotations

import time

from fastapi import APIRouter

from ..models import HealthResponse

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, time=int(time.time() * 1000))
