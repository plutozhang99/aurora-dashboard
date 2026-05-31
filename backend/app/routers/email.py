"""Email endpoints: important emails, today's schedule, and email→todos.

All three share the multi-account fetch (``imap.fetch_all``) + per-account
classification (``classify``). Per-account failures are isolated into
``errors[]`` (AE6). Results are merged, deduped by Message-ID (fallback hash),
and sorted by time descending.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..models import (
    AccountError,
    EmailItem,
    EmailRequest,
    EmailResponse,
    ScheduleItem,
    ScheduleResponse,
    TodoSuggestion,
    TodosResponse,
)
from ..services import classify
from ..services.imap import (
    dedup_merge_sort,
    fetch_all,
    since_48h,
    since_today,
)

router = APIRouter()

IMPORTANT_CAP = 20
SCHEDULE_CAP = 12


def _errors_or_none(errors: list[dict[str, str]]) -> list[AccountError] | None:
    return [AccountError(**e) for e in errors] if errors else None


@router.post("/api/email/important", response_model=EmailResponse)
async def important(body: EmailRequest) -> EmailResponse:
    per_account, errors = await fetch_all(body.accounts, since_48h())

    items: list[EmailItem] = []
    deduped = dedup_merge_sort(per_account)
    # Group deduped emails back by their source account so classification keys
    # (and caches) stay account-scoped while we only classify the surviving set.
    by_account: dict[str, list] = {}
    for email in deduped:
        by_account.setdefault(email["sourceAccountId"], []).append(email)

    for account_id, emails in by_account.items():
        important_uids = await classify.classify_important(
            account_id,
            emails,
            ai=body.ai,
            prompt=body.prompt,
            mode=body.mode,
            keywords=body.keywords,
        )
        for m in emails:
            if m["uid"] not in important_uids:
                continue
            items.append(
                EmailItem(
                    id=m["localId"],
                    **{"from": m.get("from", "")},
                    subject=m.get("subject", ""),
                    snippet=(m.get("snippet", "") or "")[:140],
                    body=(m.get("body", "") or "")[:20000],
                    receivedAt=m.get("date", 0),
                    important=True,
                    dismissed=False,
                    sourceAccountId=account_id,
                )
            )

    items.sort(key=lambda it: it.receivedAt, reverse=True)
    return EmailResponse(items=items[:IMPORTANT_CAP], errors=_errors_or_none(errors))


@router.post("/api/schedule/today", response_model=ScheduleResponse)
async def schedule_today(body: EmailRequest) -> ScheduleResponse:
    per_account, errors = await fetch_all(body.accounts, since_today(body.today))

    deduped = dedup_merge_sort(per_account)
    by_account: dict[str, list] = {}
    for email in deduped:
        by_account.setdefault(email["sourceAccountId"], []).append(email)

    items: list[ScheduleItem] = []
    for account_id, emails in by_account.items():
        events = await classify.classify_schedule(
            account_id,
            emails,
            ai=body.ai,
            prompt=body.prompt,
            mode=body.mode,
            keywords=body.keywords,
            today_iso=body.today,
        )
        items.extend(ScheduleItem(**ev) for ev in events)

    # Sort by time ascending before capping so the kept subset is the earliest
    # events across all accounts, not whichever accounts were appended first.
    # Items with no time ("—") sort last.
    items.sort(key=lambda it: (it.time == "—", it.time))

    return ScheduleResponse(items=items[:SCHEDULE_CAP], errors=_errors_or_none(errors))


@router.post("/api/email/todos", response_model=TodosResponse)
async def email_todos(body: EmailRequest) -> TodosResponse:
    per_account, errors = await fetch_all(body.accounts, since_48h())

    # Dedup across accounts first so the same email seen on two accounts doesn't
    # produce duplicate suggestions.
    deduped = dedup_merge_sort(per_account)
    by_account: dict[str, list] = {}
    for email in deduped:
        by_account.setdefault(email["sourceAccountId"], []).append(email)

    suggestions: list[TodoSuggestion] = []
    for account_id, emails in by_account.items():
        extracted = await classify.extract_todos(
            account_id,
            emails,
            ai=body.ai,
            prompt=body.prompt,
            mode=body.mode,
            keywords=body.keywords,
        )
        for s in extracted:
            suggestions.append(
                TodoSuggestion(
                    id=s["id"],
                    text=s["text"],
                    sourceAccountId=s["sourceAccountId"],
                    sourceEmailId=s["sourceEmailId"],
                    **{"from": s.get("from", "")},
                    subject=s.get("subject", ""),
                )
            )

    return TodosResponse(suggestions=suggestions, errors=_errors_or_none(errors))
