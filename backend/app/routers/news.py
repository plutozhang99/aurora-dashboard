"""News (RSS) endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from ..models import NewsRequest, NewsResponse
from ..services import news as news_service

router = APIRouter()


@router.post("/api/news", response_model=NewsResponse)
async def news(body: NewsRequest) -> NewsResponse:
    items = await news_service.fetch_news(body.feeds)
    return NewsResponse(items=items)
