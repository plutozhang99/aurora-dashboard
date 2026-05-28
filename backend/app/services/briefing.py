"""Morning briefing assembly (U9).

Assembles aggregated important emails + today's schedule + news into a
conversational ``text`` via the LLM. Degrades to a structured concatenation
when no AI key is present (the LLM is NOT called in that case). Empty materials
yield a sensible empty-state text. A failing account still produces a briefing
from whatever materials are available.

``build_structured_text`` is pure and unit-tested without network.
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from .llm import LLMError, llm_json

LlmFn = Callable[..., Awaitable[dict[str, Any]]]


def build_structured_text(
    *,
    emails: list[dict[str, Any]],
    schedule: list[dict[str, Any]],
    news: list[dict[str, Any]],
    today: str | None = None,
) -> str:
    """Build a human-readable briefing without an LLM. Pure."""
    lines: list[str] = []
    header = "早安" if not today else f"早安,今天是 {today}"
    lines.append(header)

    if not emails and not schedule and not news:
        lines.append("今天暂时没有需要关注的重要邮件、日程或新闻。祝你拥有平静高效的一天。")
        return "\n".join(lines)

    if schedule:
        lines.append("")
        lines.append(f"今日日程({len(schedule)} 项):")
        for item in schedule:
            time = item.get("time") or "—"
            title = item.get("title") or "(无标题)"
            lines.append(f"- {time} {title}")
    else:
        lines.append("")
        lines.append("今日暂无日程安排。")

    if emails:
        lines.append("")
        lines.append(f"重要邮件({len(emails)} 封):")
        for item in emails:
            sender = item.get("from") or item.get("from_") or "未知发件人"
            subject = item.get("subject") or "(无主题)"
            lines.append(f"- 来自 {sender}:{subject}")
    else:
        lines.append("")
        lines.append("暂无需要立即处理的重要邮件。")

    if news:
        lines.append("")
        lines.append("新闻速览:")
        for item in news[:5]:
            title = item.get("title") or "(无标题)"
            source = item.get("source") or ""
            lines.append(f"- {title}（{source}）" if source else f"- {title}")

    return "\n".join(lines)


def _materials_payload(
    *,
    emails: list[dict[str, Any]],
    schedule: list[dict[str, Any]],
    news: list[dict[str, Any]],
    today: str | None,
) -> dict[str, Any]:
    """Compact materials handed to the LLM."""
    return {
        "today": today or "",
        "schedule": [
            {"time": s.get("time"), "title": s.get("title"), "source": s.get("source")}
            for s in schedule
        ],
        "emails": [
            {
                "from": e.get("from") or e.get("from_"),
                "subject": e.get("subject"),
                "snippet": e.get("snippet", ""),
            }
            for e in emails
        ],
        "news": [
            {"title": n.get("title"), "source": n.get("source")} for n in news[:8]
        ],
    }


async def generate_briefing(
    *,
    emails: list[dict[str, Any]],
    schedule: list[dict[str, Any]],
    news: list[dict[str, Any]],
    ai: Any,
    prompt: str,
    today: str | None = None,
    llm_fn: LlmFn = llm_json,
) -> dict[str, Any]:
    """Produce ``{text, sections?}``.

    No AI key → structured concatenation (LLM not called). With AI key → call
    the LLM; on failure degrade to structured text. Pure assembly otherwise.
    Returns a dict; the router stamps ``generatedAt``.
    """
    has_ai = bool(ai and getattr(ai, "apiKey", None))

    if not has_ai:
        return {"text": build_structured_text(
            emails=emails, schedule=schedule, news=news, today=today
        ), "sections": None}

    try:
        out = await llm_fn(
            provider=ai.provider,
            api_key=ai.apiKey,
            model=ai.model,
            system=prompt or "",
            user=json.dumps(
                _materials_payload(emails=emails, schedule=schedule, news=news, today=today)
            ),
        )
        text = ""
        sections = None
        if isinstance(out, dict):
            text = str(out.get("text") or "").strip()
            secs = out.get("sections")
            if isinstance(secs, dict):
                sections = secs
        if not text:
            text = build_structured_text(
                emails=emails, schedule=schedule, news=news, today=today
            )
        return {"text": text, "sections": sections}
    except LLMError:
        return {"text": build_structured_text(
            emails=emails, schedule=schedule, news=news, today=today
        ), "sections": None}
