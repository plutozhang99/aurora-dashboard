"""Morning briefing endpoint (U9).

Assembles aggregated important emails + today's schedule + news, then delegates
to the briefing service which either summarizes via LLM (AI key present) or
degrades to structured text. A failing account still yields a briefing from the
available materials.
"""

from __future__ import annotations

import time

from fastapi import APIRouter

from ..models import BriefingRequest, BriefingResponse
from ..services import classify, news as news_service
from ..services.briefing import generate_briefing
from ..services.imap import dedup_merge_sort, fetch_all, since_48h, since_today

router = APIRouter()


def _group_by_account(deduped: list) -> dict[str, list]:
    out: dict[str, list] = {}
    for email in deduped:
        out.setdefault(email["sourceAccountId"], []).append(email)
    return out


@router.post("/api/briefing", response_model=BriefingResponse)
async def briefing(body: BriefingRequest) -> BriefingResponse:
    # Reuse the aggregation kernel. Briefing uses keyword classification of the
    # aggregated materials (the briefing prompt drives the *summary*, not the
    # per-email importance call), keeping the request lightweight and robust.
    important_accounts, _imp_errors = await fetch_all(body.accounts, since_48h())
    schedule_accounts, _sch_errors = await fetch_all(body.accounts, since_today(body.today))

    imp_by_account = _group_by_account(dedup_merge_sort(important_accounts))
    sch_by_account = _group_by_account(dedup_merge_sort(schedule_accounts))

    emails: list[dict] = []
    for account_id, msgs in imp_by_account.items():
        important_uids = await classify.classify_important(
            account_id, msgs, ai=body.ai, prompt="", mode="keyword", keywords=[]
        )
        for m in msgs:
            if m["uid"] in important_uids:
                emails.append(
                    {
                        "from": m.get("from", ""),
                        "subject": m.get("subject", ""),
                        "snippet": m.get("snippet", ""),
                        "receivedAt": m.get("date", 0),
                        "sourceAccountId": account_id,
                    }
                )
    emails.sort(key=lambda e: e.get("receivedAt", 0), reverse=True)

    schedule: list[dict] = []
    for account_id, msgs in sch_by_account.items():
        events = await classify.classify_schedule(
            account_id, msgs, ai=body.ai, prompt="", mode="keyword",
            keywords=[], today_iso=body.today,
        )
        schedule.extend(events)

    news_items = await news_service.fetch_news(body.newsFeeds)

    result = await generate_briefing(
        emails=emails,
        schedule=schedule,
        news=news_items,
        ai=body.ai,
        prompt=body.prompts.briefing,
        today=body.today,
    )

    return BriefingResponse(
        text=result["text"],
        sections=result.get("sections"),
        generatedAt=int(time.time() * 1000),
    )
