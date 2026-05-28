"""Importance / schedule / todo classification (AI + keyword).

Ports the classification logic from ``server/routes/email.mjs``:
``buildKeywordMatcher``, ``compactForLlm`` (via imap.compact_for_llm),
``heuristicSchedule`` (TIME_RE + am/pm/中文时段), AI branch with TTL cache, and
keyword fallback on LLM failure (without poisoning the cache).

The cache key MUST include the accountId (e.g. ``f"{accountId}:imp:{uid}"``).
Pure logic (matcher, heuristic schedule) is importable for unit tests; the AI
branch takes an injectable ``llm_fn`` so tests run without network.
"""

from __future__ import annotations

import json
import re
from typing import Any, Awaitable, Callable

from cachetools import TTLCache

from .imap import FetchedEmail, compact_for_llm
from .llm import LLMError, llm_json

# Fallback keyword lists when the frontend omits one (resilience only).
FALLBACK_IMPORTANT_KEYWORDS = [
    "urgent", "important", "asap", "action required", "invoice", "pay",
    "security", "verify", "reset password",
    "会议", "面试", "合同", "发票", "账单", "逾期", "验证", "紧急", "重要",
]
FALLBACK_SCHEDULE_KEYWORDS = [
    "meeting", "appointment", "call", "interview", "deadline", "due",
    "会议", "约会", "面试", "预约", "截止", "提醒",
]
FALLBACK_TODO_KEYWORDS = [
    "please", "could you", "can you", "action required", "need", "submit",
    "reply", "respond", "confirm", "review", "deadline", "due", "todo",
    "请", "需要", "提交", "回复", "确认", "审核", "截止", "待办",
]

TIME_RE = re.compile(
    r"(?:(\d{1,2}):(\d{2}))"
    r"|(?:(\d{1,2})\s*(am|pm))"
    r"|(?:(上午|下午|中午|晚上|早上)\s*(\d{1,2})\s*[点时])",
    re.IGNORECASE,
)

_REGEX_SPECIAL = re.compile(r"[.*+?^${}()|[\]\\]")

# Per-process TTL cache (6h) replacing the Node aiCache. Key includes accountId.
CACHE_TTL_SECONDS = 60 * 60 * 6
_cache: TTLCache = TTLCache(maxsize=10_000, ttl=CACHE_TTL_SECONDS)


def cache_get(key: str) -> Any:
    return _cache.get(key, _MISSING)


def cache_set(key: str, value: Any) -> None:
    _cache[key] = value


_MISSING = object()


# Type of an injectable async LLM call returning a parsed dict.
LlmFn = Callable[..., Awaitable[dict[str, Any]]]


def build_keyword_matcher(keywords: list[str] | None) -> Callable[[str], bool]:
    """Compile a case-insensitive regex matching any keyword. Pure.

    Empty/whitespace-only list → matcher that always returns False.
    """
    cleaned = [str(k).strip() for k in (keywords or []) if str(k).strip()]
    if not cleaned:
        return lambda _text: False
    escaped = [_REGEX_SPECIAL.sub(lambda m: "\\" + m.group(0), k) for k in cleaned]
    regex = re.compile("|".join(escaped), re.IGNORECASE)
    return lambda text: bool(regex.search(text or ""))


def heuristic_schedule(
    messages: list[FetchedEmail],
    match_hint: Callable[[str], bool],
    *,
    account_id: str,
) -> list[dict[str, Any]]:
    """Keyword + TIME_RE schedule extraction. Pure (port of heuristicSchedule)."""
    out: list[dict[str, Any]] = []
    for m in messages:
        text = f"{m.get('subject', '')}\n{m.get('snippet', '')}"
        if not match_hint(text):
            continue
        match = TIME_RE.search(text)
        time = "—"
        if match:
            if match.group(1):
                time = f"{match.group(1).zfill(2)}:{match.group(2)}"
            elif match.group(3):
                time = f"{match.group(3).zfill(2)}:00 {match.group(4)}"
            elif match.group(6):
                time = f"{match.group(6).zfill(2)}:00"
        out.append(
            {
                "id": f"s-{account_id}-{m['uid']}",
                "time": time,
                "title": (m.get("subject") or "(无主题)")[:80],
                "source": m.get("from") or "邮件",
                "sourceAccountId": account_id,
            }
        )
    return out


def _use_ai(mode: str, ai: Any) -> bool:
    return mode == "ai" and bool(ai and getattr(ai, "apiKey", None))


async def classify_important(
    account_id: str,
    messages: list[FetchedEmail],
    *,
    ai: Any,
    prompt: str,
    mode: str,
    keywords: list[str],
    llm_fn: LlmFn = llm_json,
) -> set[Any]:
    """Return the set of UIDs deemed important for one account's messages.

    AI mode uses the LLM with a per-(account,uid) TTL cache; LLM failure falls
    back to keyword matching for the uncached batch (cache not poisoned).
    """
    matcher = build_keyword_matcher(keywords or FALLBACK_IMPORTANT_KEYWORDS)

    if not _use_ai(mode, ai) or not messages:
        return {
            m["uid"]
            for m in messages
            if matcher(f"{m.get('subject', '')}\n{m.get('snippet', '')}\n{m.get('from', '')}")
        }

    cached: dict[Any, bool] = {}
    need_llm: list[FetchedEmail] = []
    for m in messages:
        key = f"{account_id}:imp:{m['uid']}"
        hit = cache_get(key)
        if hit is not _MISSING:
            cached[m["uid"]] = hit
        else:
            need_llm.append(m)

    llm_important: set[Any] = set()
    if need_llm:
        try:
            out = await llm_fn(
                provider=ai.provider,
                api_key=ai.apiKey,
                model=ai.model,
                system=prompt or "",
                user=json.dumps({"emails": [compact_for_llm(m) for m in need_llm]}),
            )
            arr = out.get("important") if isinstance(out, dict) else None
            arr = arr if isinstance(arr, list) else []
            # Coerce both sides to str: prod uids are strings (imap-tools),
            # while the LLM returns uids as JSON ints.
            flagged = {
                str(e.get("uid"))
                for e in arr
                if isinstance(e, dict) and e.get("uid") is not None
            }
            for m in need_llm:
                is_imp = str(m["uid"]) in flagged
                llm_important.add(m["uid"]) if is_imp else None
                cache_set(f"{account_id}:imp:{m['uid']}", is_imp)
        except LLMError:
            # Don't poison cache on transient LLM failure — keyword fallback.
            for m in need_llm:
                if matcher(f"{m.get('subject', '')}\n{m.get('snippet', '')}\n{m.get('from', '')}"):
                    llm_important.add(m["uid"])

    return llm_important | {uid for uid, v in cached.items() if v}


async def classify_schedule(
    account_id: str,
    messages: list[FetchedEmail],
    *,
    ai: Any,
    prompt: str,
    mode: str,
    keywords: list[str],
    today_iso: str | None,
    llm_fn: LlmFn = llm_json,
) -> list[dict[str, Any]]:
    """Extract today's schedule items for one account (AI + heuristic)."""
    matcher = build_keyword_matcher(keywords or FALLBACK_SCHEDULE_KEYWORDS)

    if not _use_ai(mode, ai) or not messages:
        return heuristic_schedule(messages, matcher, account_id=account_id)

    cached: list[dict[str, Any]] = []
    need_llm: list[FetchedEmail] = []
    for m in messages:
        key = f"{account_id}:sch:{m['uid']}"
        hit = cache_get(key)
        if hit is not _MISSING:
            if hit:
                cached.append(hit)
        else:
            need_llm.append(m)

    extracted: list[dict[str, Any]] = []
    if need_llm:
        try:
            out = await llm_fn(
                provider=ai.provider,
                api_key=ai.apiKey,
                model=ai.model,
                system=prompt or "",
                user=json.dumps(
                    {
                        "today": today_iso or "",
                        "emails": [compact_for_llm(m) for m in need_llm],
                    }
                ),
            )
            arr = out.get("events") if isinstance(out, dict) else None
            arr = arr if isinstance(arr, list) else []
            # Coerce both sides to str: prod uids are strings (imap-tools),
            # while the LLM returns uids as JSON ints.
            by_uid = {str(e.get("uid")): e for e in arr if isinstance(e, dict)}
            for m in need_llm:
                ev = by_uid.get(str(m["uid"]))
                if ev and ev.get("title"):
                    item = {
                        "id": f"s-{account_id}-{m['uid']}",
                        "time": str(ev.get("time") or "—"),
                        "title": str(ev["title"])[:80],
                        "source": m.get("from") or "邮件",
                        "sourceAccountId": account_id,
                    }
                    extracted.append(item)
                    cache_set(f"{account_id}:sch:{m['uid']}", item)
                else:
                    cache_set(f"{account_id}:sch:{m['uid']}", None)
        except LLMError:
            # Fall back to heuristic for the uncached batch.
            extracted = heuristic_schedule(need_llm, matcher, account_id=account_id)

    return cached + extracted


def keyword_todos(
    account_id: str,
    messages: list[FetchedEmail],
    matcher: Callable[[str], bool],
) -> list[dict[str, Any]]:
    """Heuristic todo extraction: one suggestion per matching email. Pure."""
    out: list[dict[str, Any]] = []
    for m in messages:
        text = f"{m.get('subject', '')}\n{m.get('snippet', '')}"
        if not matcher(text):
            continue
        out.append(
            {
                "id": f"t-{account_id}-{m['uid']}",
                "text": (m.get("subject") or "(无主题)")[:140],
                "sourceAccountId": account_id,
                "sourceEmailId": f"m-{account_id}-{m['uid']}",
                "from": m.get("from", ""),
                "subject": m.get("subject", ""),
            }
        )
    return out


async def extract_todos(
    account_id: str,
    messages: list[FetchedEmail],
    *,
    ai: Any,
    prompt: str,
    mode: str,
    keywords: list[str],
    llm_fn: LlmFn = llm_json,
) -> list[dict[str, Any]]:
    """Extract actionable todo suggestions for one account (AI + keyword)."""
    matcher = build_keyword_matcher(keywords or FALLBACK_TODO_KEYWORDS)

    if not _use_ai(mode, ai) or not messages:
        return keyword_todos(account_id, messages, matcher)

    try:
        out = await llm_fn(
            provider=ai.provider,
            api_key=ai.apiKey,
            model=ai.model,
            system=prompt or "",
            user=json.dumps({"emails": [compact_for_llm(m) for m in messages]}),
        )
        arr = out.get("todos") if isinstance(out, dict) else None
        arr = arr if isinstance(arr, list) else []
        # Coerce both sides to str: prod uids are strings (imap-tools), while
        # the LLM returns uids as JSON ints.
        by_uid = {str(m["uid"]): m for m in messages}
        suggestions: list[dict[str, Any]] = []
        for e in arr:
            if not isinstance(e, dict):
                continue
            uid = e.get("uid")
            text = str(e.get("text") or "").strip()
            src = by_uid.get(str(uid))
            if not text or src is None:
                continue
            # Build ids from the canonical email uid (src["uid"]), not the
            # LLM-returned uid, so sourceEmailId == the email's local_email_id.
            canonical_uid = src["uid"]
            suggestions.append(
                {
                    "id": f"t-{account_id}-{canonical_uid}",
                    "text": text[:140],
                    "sourceAccountId": account_id,
                    "sourceEmailId": f"m-{account_id}-{canonical_uid}",
                    "from": src.get("from", ""),
                    "subject": src.get("subject", ""),
                }
            )
        return suggestions
    except LLMError:
        # LLM failure → keyword fallback for this batch (no whole-request fail).
        return keyword_todos(account_id, messages, matcher)
