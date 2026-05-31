"""Persisted single-user data: todos, scratchpad note, and the dismissed
email/suggestion markers. Backed by the JSON file store (no database).

These endpoints make the data survive a browser/machine switch — point every
client at the same backend (``serverUrl``) or sync the ``AURORA_DATA_DIR``
folder, and the todos/note/dismiss-state follow.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..models import (
    EmailListResponse,
    OkResponse,
    StoredEmail,
    StoredNote,
    StoredSuggestion,
    StoredTodo,
    SuggestionListResponse,
    TodoListResponse,
)
from ..services import store

router = APIRouter(prefix="/api/store")


# ── Todos ────────────────────────────────────────────────────────────────────
@router.get("/todos", response_model=TodoListResponse)
async def list_todos() -> TodoListResponse:
    rows = await store.get_list("todos")
    items = [StoredTodo.model_validate(r) for r in rows]
    # Newest first, mirroring the previous IndexedDB ordering.
    items.sort(key=lambda t: t.createdAt, reverse=True)
    return TodoListResponse(items=items)


@router.put("/todos/{todo_id}", response_model=StoredTodo)
async def put_todo(todo_id: str, body: StoredTodo) -> StoredTodo:
    record = body.model_copy(update={"id": todo_id})
    await store.upsert_item("todos", record.model_dump(by_alias=True))
    return record


@router.delete("/todos/{todo_id}", response_model=OkResponse)
async def delete_todo(todo_id: str) -> OkResponse:
    await store.delete_item("todos", todo_id)
    return OkResponse()


# ── Note (scratchpad) ─────────────────────────────────────────────────────────
@router.get("/note", response_model=StoredNote)
async def get_note() -> StoredNote:
    value = await store.get_value("note", "")
    return StoredNote(text=value if isinstance(value, str) else "")


@router.put("/note", response_model=StoredNote)
async def put_note(body: StoredNote) -> StoredNote:
    await store.set_value("note", body.text)
    return body


# ── Email dismiss state ───────────────────────────────────────────────────────
@router.get("/emails", response_model=EmailListResponse)
async def list_emails() -> EmailListResponse:
    rows = await store.get_list("emails")
    return EmailListResponse(items=[StoredEmail.model_validate(r) for r in rows])


@router.put("/emails/{email_id}", response_model=StoredEmail)
async def put_email(email_id: str, body: StoredEmail) -> StoredEmail:
    record = body.model_copy(update={"id": email_id})
    await store.upsert_item("emails", record.model_dump(by_alias=True))
    return record


# ── Suggestion dismiss markers ────────────────────────────────────────────────
@router.get("/suggestions", response_model=SuggestionListResponse)
async def list_suggestions() -> SuggestionListResponse:
    rows = await store.get_list("suggestions")
    return SuggestionListResponse(items=[StoredSuggestion.model_validate(r) for r in rows])


@router.put("/suggestions/{suggestion_id}", response_model=StoredSuggestion)
async def put_suggestion(suggestion_id: str, body: StoredSuggestion) -> StoredSuggestion:
    record = body.model_copy(update={"id": suggestion_id})
    await store.upsert_item("suggestions", record.model_dump(by_alias=True))
    return record


@router.delete("/suggestions/{suggestion_id}", response_model=OkResponse)
async def delete_suggestion(suggestion_id: str) -> OkResponse:
    await store.delete_item("suggestions", suggestion_id)
    return OkResponse()
