"""Persisted store router + service tests (isolated temp data dir, no real fs state)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import store

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    """Point AURORA_DATA_DIR at a fresh tmp dir so each test starts empty."""
    monkeypatch.setenv("AURORA_DATA_DIR", str(tmp_path))
    yield tmp_path


def test_todos_empty_by_default():
    res = client.get("/api/store/todos")
    assert res.status_code == 200
    assert res.json() == {"items": []}


def test_todo_crud_roundtrip():
    todo = {"id": "t1", "text": "买牛奶", "done": False, "createdAt": 1000}
    put = client.put("/api/store/todos/t1", json=todo)
    assert put.status_code == 200
    assert put.json()["text"] == "买牛奶"

    listed = client.get("/api/store/todos").json()["items"]
    assert len(listed) == 1
    assert listed[0]["id"] == "t1"

    # Toggle done via re-PUT (upsert by id, no duplicate).
    client.put("/api/store/todos/t1", json={**todo, "done": True})
    listed = client.get("/api/store/todos").json()["items"]
    assert len(listed) == 1
    assert listed[0]["done"] is True

    client.delete("/api/store/todos/t1")
    assert client.get("/api/store/todos").json()["items"] == []


def test_todos_sorted_newest_first():
    client.put("/api/store/todos/a", json={"id": "a", "text": "old", "createdAt": 100})
    client.put("/api/store/todos/b", json={"id": "b", "text": "new", "createdAt": 200})
    items = client.get("/api/store/todos").json()["items"]
    assert [it["id"] for it in items] == ["b", "a"]


def test_note_roundtrip():
    assert client.get("/api/store/note").json() == {"text": ""}
    client.put("/api/store/note", json={"text": "随手记一笔"})
    assert client.get("/api/store/note").json()["text"] == "随手记一笔"


def test_email_dismiss_preserves_from_alias():
    body = {
        "id": "m-acc1-9",
        "from": "boss@corp.com",
        "subject": "Q3",
        "dismissed": True,
        "sourceAccountId": "acc1",
    }
    res = client.put("/api/store/emails/m-acc1-9", json=body)
    assert res.status_code == 200
    assert res.json()["from"] == "boss@corp.com"

    items = client.get("/api/store/emails").json()["items"]
    assert items[0]["from"] == "boss@corp.com"
    assert items[0]["dismissed"] is True


def test_suggestion_dismiss_and_delete():
    body = {
        "id": "s1",
        "text": "支付发票",
        "sourceAccountId": "acc1",
        "sourceEmailId": "m-acc1-1",
        "from": "billing@x.com",
        "subject": "发票",
    }
    client.put("/api/store/suggestions/s1", json=body)
    items = client.get("/api/store/suggestions").json()["items"]
    assert items[0]["dismissed"] is True
    assert items[0]["from"] == "billing@x.com"

    client.delete("/api/store/suggestions/s1")
    assert client.get("/api/store/suggestions").json()["items"] == []


def test_schedules_empty_by_default():
    assert client.get("/api/store/schedules").json() == {"items": []}


def test_schedule_dismiss_roundtrip():
    body = {
        "id": "s-acc1-7",
        "time": "09:30",
        "title": "晨会",
        "source": "team@corp.com",
        "sourceAccountId": "acc1",
        "dismissed": True,
    }
    res = client.put("/api/store/schedules/s-acc1-7", json=body)
    assert res.status_code == 200
    assert res.json()["dismissed"] is True

    items = client.get("/api/store/schedules").json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == "s-acc1-7"
    assert items[0]["title"] == "晨会"
    assert items[0]["dismissed"] is True

    # Re-PUT (upsert by id) must not duplicate the marker.
    client.put("/api/store/schedules/s-acc1-7", json=body)
    assert len(client.get("/api/store/schedules").json()["items"]) == 1


async def test_corrupt_file_falls_back_to_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("AURORA_DATA_DIR", str(tmp_path))
    (tmp_path / "store.json").write_text("{ not valid json", encoding="utf-8")
    assert await store.get_list("todos") == []
    # And a subsequent write repairs the file to valid JSON.
    await store.set_value("note", "ok")
    assert json.loads((tmp_path / "store.json").read_text("utf-8"))["note"] == "ok"
