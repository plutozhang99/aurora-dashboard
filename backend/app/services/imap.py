"""Multi-account IMAP fetch + concurrency + dedup.

The blocking ``imap-tools`` work happens inside :func:`fetch_account_blocking`
(run via ``asyncio.to_thread``). Concurrency across accounts is bounded by an
``asyncio.Semaphore``. Per-account failures are isolated and surfaced as
``errors[]`` (AE6) rather than failing the whole request.

The merge/dedup/sort logic is pure and importable for unit tests — no IMAP or
network involved. ``FetchedEmail`` is a plain dict with keys:
``uid, from, subject, snippet, date, messageId``.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from ..config import IMAP_CONCURRENCY
from ..models import EmailAccount

# A fetched email is a plain dict so tests can construct them without IMAP.
FetchedEmail = dict[str, Any]


def enabled_accounts(accounts: list[EmailAccount]) -> list[EmailAccount]:
    """Filter to enabled accounts only (R3/R6)."""
    return [a for a in accounts if a.enabled]


def dedup_key(email: FetchedEmail) -> str:
    """Cross-account dedup key.

    Prefer the IMAP ``Message-ID``; fall back to a hash of
    ``from|subject|date`` when it is missing (avoids false merges).
    """
    mid = (email.get("messageId") or "").strip()
    if mid:
        return f"mid:{mid}"
    raw = f"{email.get('from', '')}|{email.get('subject', '')}|{email.get('date', '')}"
    return "h:" + hashlib.sha1(raw.encode("utf-8", "ignore")).hexdigest()


def compact_for_llm(email: FetchedEmail) -> dict[str, Any]:
    """Trim an email to (uid, from, subject, body) for the LLM prompt.

    Body is the first 400 chars of the snippet (matches ``compactForLlm``).
    """
    return {
        "uid": email["uid"],
        "from": email.get("from", ""),
        "subject": email.get("subject", ""),
        "body": (email.get("snippet", "") or "")[:400],
    }


def local_email_id(account_id: str, uid: Any) -> str:
    """Account-namespaced id to avoid cross-account uid collisions."""
    return f"m-{account_id}-{uid}"


def dedup_merge_sort(
    per_account: list[tuple[str, list[FetchedEmail]]],
) -> list[FetchedEmail]:
    """Merge fetched emails from multiple accounts.

    ``per_account`` is a list of ``(account_id, [emails])``. Each email is
    tagged with ``sourceAccountId`` and ``localId``; duplicates (same
    :func:`dedup_key`) collapse to the first seen. Result sorted by ``date``
    descending. Pure — tested without IMAP.
    """
    seen: set[str] = set()
    merged: list[FetchedEmail] = []
    for account_id, emails in per_account:
        for email in emails:
            key = dedup_key(email)
            if key in seen:
                continue
            seen.add(key)
            tagged = dict(email)
            tagged["sourceAccountId"] = account_id
            tagged["localId"] = local_email_id(account_id, email["uid"])
            merged.append(tagged)
    merged.sort(key=lambda e: e.get("date", 0), reverse=True)
    return merged


# ---------------------------------------------------------------------------
# Blocking IMAP fetch (thin wrapper — mocked in tests)
# ---------------------------------------------------------------------------
def _collapse_ws(text: str) -> str:
    return " ".join((text or "").split())


def fetch_account_blocking(account: EmailAccount, since: datetime) -> list[FetchedEmail]:
    """Blocking fetch of one account's INBOX since ``since`` via imap-tools.

    Runs inside a worker thread. Raises on connection/auth failure so the
    caller can record it in ``errors[]``.
    """
    from imap_tools import AND, MailBox, MailBoxUnencrypted

    box_cls = MailBox if account.secure else MailBoxUnencrypted
    out: list[FetchedEmail] = []
    with box_cls(account.host, port=account.port).login(
        account.user, account.password, "INBOX"
    ) as mailbox:
        criteria = AND(date_gte=since.date())
        for msg in mailbox.fetch(criteria, mark_seen=False):
            try:
                date_ms = int(msg.date.timestamp() * 1000) if msg.date else 0
            except (OverflowError, ValueError, AttributeError):
                date_ms = 0
            out.append(
                {
                    "uid": msg.uid,
                    "from": msg.from_ or "",
                    "subject": msg.subject or "",
                    "snippet": _collapse_ws(msg.text or "")[:400],
                    "date": date_ms,
                    "messageId": (msg.headers.get("message-id", ("",)) or ("",))[0]
                    if msg.headers
                    else "",
                }
            )
    return out


async def fetch_all(
    accounts: list[EmailAccount],
    since: datetime,
    *,
    fetch_fn: Callable[[EmailAccount, datetime], list[FetchedEmail]] | None = None,
    concurrency: int = IMAP_CONCURRENCY,
) -> tuple[list[tuple[str, list[FetchedEmail]]], list[dict[str, str]]]:
    """Fetch all enabled accounts concurrently with bounded parallelism.

    Returns ``(per_account, errors)`` where ``per_account`` is
    ``[(account_id, [emails])]`` for successful accounts and ``errors`` is
    ``[{accountId, message}]`` for failed ones (AE6 — failures isolated).

    ``fetch_fn`` defaults to :func:`fetch_account_blocking` and is injected in
    tests to avoid real IMAP.
    """
    enabled = enabled_accounts(accounts)
    if not enabled:
        return [], []  # never connect IMAP for empty/all-disabled accounts

    fn = fetch_fn or fetch_account_blocking
    sem = asyncio.Semaphore(max(1, concurrency))

    async def one(account: EmailAccount):
        async with sem:
            try:
                emails = await asyncio.to_thread(fn, account, since)
                return (account.id, emails, None)
            except Exception as exc:  # isolate per-account failure
                return (account.id, None, str(exc))

    results = await asyncio.gather(*(one(a) for a in enabled))

    per_account: list[tuple[str, list[FetchedEmail]]] = []
    errors: list[dict[str, str]] = []
    for account_id, emails, err in results:
        if err is not None:
            errors.append({"accountId": account_id, "message": err})
        else:
            per_account.append((account_id, emails or []))
    return per_account, errors


def since_48h(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now - timedelta(hours=48)


def since_today(today_iso: str | None = None, now: datetime | None = None) -> datetime:
    """Start of today (00:00). Uses ``today_iso`` (YYYY-MM-DD) if provided."""
    if today_iso:
        try:
            base = datetime.strptime(today_iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            return base
        except ValueError:
            pass
    now = now or datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
