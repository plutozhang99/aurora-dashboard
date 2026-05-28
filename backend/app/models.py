"""Pydantic request/response models for the Aurora API.

Field names mirror the frontend's TypeScript interfaces exactly — the React
frontend depends on these JSON shapes. Epoch timestamps are integer ms.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared request shapes
# ---------------------------------------------------------------------------
class EmailAccount(BaseModel):
    """One IMAP account as configured in the frontend (credentials stay local)."""

    id: str
    label: str | None = None
    enabled: bool = True
    host: str
    port: int = 993
    user: str
    password: str
    secure: bool = True


class AIConfig(BaseModel):
    provider: Literal["anthropic", "openai"] | str | None = None
    apiKey: str | None = None
    model: str | None = None


class EmailRequest(BaseModel):
    """Shared body for /email/important, /schedule/today, /email/todos."""

    accounts: list[EmailAccount] = Field(default_factory=list)
    ai: AIConfig | None = None
    prompt: str = ""
    mode: Literal["ai", "keyword"] = "keyword"
    keywords: list[str] = Field(default_factory=list)
    # Only used by /schedule/today (optional ISO date "YYYY-MM-DD").
    today: str | None = None


class NewsRequest(BaseModel):
    feeds: list[str] = Field(default_factory=list)


class BriefingPrompts(BaseModel):
    briefing: str = ""


class BriefingRequest(BaseModel):
    accounts: list[EmailAccount] = Field(default_factory=list)
    newsFeeds: list[str] = Field(default_factory=list)
    ai: AIConfig | None = None
    prompts: BriefingPrompts = Field(default_factory=BriefingPrompts)
    today: str | None = None


# ---------------------------------------------------------------------------
# Response shapes
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    ok: bool
    time: int


class NewsItem(BaseModel):
    id: str
    title: str
    source: str
    url: str
    publishedAt: int


class NewsResponse(BaseModel):
    items: list[NewsItem]


class AccountError(BaseModel):
    accountId: str
    message: str


class EmailItem(BaseModel):
    id: str
    from_: str = Field(serialization_alias="from", validation_alias="from")
    subject: str
    snippet: str
    receivedAt: int
    important: bool = True
    dismissed: bool = False
    sourceAccountId: str

    model_config = {"populate_by_name": True}


class EmailResponse(BaseModel):
    items: list[EmailItem]
    errors: list[AccountError] | None = None


class ScheduleItem(BaseModel):
    id: str
    time: str
    title: str
    source: str
    sourceAccountId: str


class ScheduleResponse(BaseModel):
    items: list[ScheduleItem]
    errors: list[AccountError] | None = None


class TodoSuggestion(BaseModel):
    id: str
    text: str
    sourceAccountId: str
    sourceEmailId: str
    from_: str = Field(serialization_alias="from", validation_alias="from")
    subject: str

    model_config = {"populate_by_name": True}


class TodosResponse(BaseModel):
    suggestions: list[TodoSuggestion]
    errors: list[AccountError] | None = None


class BriefingResponse(BaseModel):
    text: str
    sections: dict | None = None
    generatedAt: int
