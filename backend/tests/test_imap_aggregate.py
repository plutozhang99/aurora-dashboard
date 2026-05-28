"""Multi-account aggregation tests (no real IMAP).

Covers merge/sort/sourceAccountId, AE6 (single account failure isolation),
Message-ID dedup, fallback-key dedup (no false merge), and empty accounts.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services import imap
from app.services.imap import dedup_key, dedup_merge_sort, fetch_all

from .conftest import make_account, make_email

client = TestClient(app)


# --- pure dedup / merge / sort -------------------------------------------------
def test_merge_sorted_with_source_account():
    per_account = [
        ("accA", [make_email(1, date=100), make_email(2, date=300)]),
        ("accB", [make_email(3, date=200)]),
    ]
    merged = dedup_merge_sort(per_account)
    assert [m["date"] for m in merged] == [300, 200, 100]
    src = {m["uid"]: m["sourceAccountId"] for m in merged}
    assert src == {1: "accA", 2: "accA", 3: "accB"}
    assert {m["localId"] for m in merged} == {"m-accA-1", "m-accA-2", "m-accB-3"}


def test_same_message_id_dedups_across_accounts():
    per_account = [
        ("accA", [make_email(1, message_id="<shared@x>", date=100)]),
        ("accB", [make_email(99, message_id="<shared@x>", date=200)]),
    ]
    merged = dedup_merge_sort(per_account)
    assert len(merged) == 1
    # First account wins (accA), even though accB had a newer date.
    assert merged[0]["sourceAccountId"] == "accA"


def test_missing_message_id_uses_fallback_key_no_false_merge():
    # Two different emails, both without Message-ID, must NOT merge.
    a = make_email(1, frm="a@x.com", subject="Hi", date=100, message_id="")
    b = make_email(2, frm="b@y.com", subject="Bye", date=200, message_id="")
    assert dedup_key(a) != dedup_key(b)
    merged = dedup_merge_sort([("accA", [a]), ("accB", [b])])
    assert len(merged) == 2


def test_identical_no_message_id_emails_merge_via_fallback():
    a = make_email(1, frm="a@x.com", subject="Hi", date=100, message_id="")
    a2 = make_email(2, frm="a@x.com", subject="Hi", date=100, message_id="")
    merged = dedup_merge_sort([("accA", [a]), ("accB", [a2])])
    assert len(merged) == 1


# --- fetch_all isolation / empty ----------------------------------------------
async def test_fetch_all_isolates_account_failure():
    accounts = [make_account("accA"), make_account("accB")]

    def fake_fetch(account, since):
        if account.id == "accB":
            raise RuntimeError("auth failed")
        return [make_email(1, date=100)]

    per_account, errors = await fetch_all(accounts, since=None, fetch_fn=fake_fetch)
    assert [a for a, _ in per_account] == ["accA"]
    assert len(errors) == 1
    assert errors[0]["accountId"] == "accB"
    assert "auth failed" in errors[0]["message"]


async def test_fetch_all_empty_accounts_no_imap():
    called = False

    def fake_fetch(account, since):
        nonlocal called
        called = True
        return []

    per_account, errors = await fetch_all([], since=None, fetch_fn=fake_fetch)
    assert per_account == []
    assert errors == []
    assert called is False


async def test_fetch_all_skips_disabled_accounts():
    accounts = [make_account("accA", enabled=True), make_account("accB", enabled=False)]
    seen = []

    def fake_fetch(account, since):
        seen.append(account.id)
        return []

    await fetch_all(accounts, since=None, fetch_fn=fake_fetch)
    assert seen == ["accA"]


# --- endpoint level: AE6 via monkeypatched fetch_all --------------------------
def test_important_endpoint_isolates_failure(monkeypatch):
    async def fake_fetch_all(accounts, since, **kwargs):
        per_account = [("accA", [make_email(1, subject="urgent meeting", snippet="please", date=500)])]
        errors = [{"accountId": "accB", "message": "boom"}]
        return per_account, errors

    monkeypatch.setattr("app.routers.email.fetch_all", fake_fetch_all)

    res = client.post(
        "/api/email/important",
        json={
            "accounts": [
                {"id": "accA", "enabled": True, "host": "h", "port": 993, "user": "u", "password": "p", "secure": True},
                {"id": "accB", "enabled": True, "host": "h", "port": 993, "user": "u2", "password": "p", "secure": True},
            ],
            "mode": "keyword",
            "keywords": ["urgent"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["sourceAccountId"] == "accA"
    assert body["items"][0]["from"] == "a@x.com"
    assert body["errors"] == [{"accountId": "accB", "message": "boom"}]


def test_schedule_cap_keeps_earliest_across_accounts(monkeypatch):
    # Regression: with total events > SCHEDULE_CAP, the kept subset must be the
    # earliest by time across ALL accounts, not whichever account was appended
    # first. accB (appended second) holds the earliest times; they must survive.
    from app.routers.email import SCHEDULE_CAP

    # accA: late times 13:00..22:00 (10 events). accB: early times 01:00..05:00
    # plus one no-time "—" event. Total = 16 > cap (12).
    a_emails = [
        make_email(i, subject=f"meeting at {h:02d}:00", snippet="join", date=100)
        for i, h in enumerate(range(13, 23), start=1)
    ]
    b_emails = [
        make_email(100 + i, subject=f"meeting at {h:02d}:00", snippet="join", date=100)
        for i, h in enumerate(range(1, 6), start=1)
    ]
    b_emails.append(make_email(200, subject="meeting sometime", snippet="join", date=100))

    async def fake_fetch_all(accounts, since, **kwargs):
        return [("accA", a_emails), ("accB", b_emails)], []

    monkeypatch.setattr("app.routers.email.fetch_all", fake_fetch_all)

    res = client.post(
        "/api/schedule/today",
        json={
            "accounts": [
                {"id": "accA", "enabled": True, "host": "h", "port": 993, "user": "u", "password": "p", "secure": True},
                {"id": "accB", "enabled": True, "host": "h", "port": 993, "user": "u2", "password": "p", "secure": True},
            ],
            "mode": "keyword",
            "keywords": ["meeting"],
        },
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == SCHEDULE_CAP
    times = [it["time"] for it in items]
    # Sorted ascending; "—" (no time) would sort last and be dropped by the cap.
    assert times == sorted(times)
    assert "—" not in times
    # The earliest accB events (01:00..05:00) must be kept.
    assert "01:00" in times and "05:00" in times


def test_important_empty_accounts_returns_empty(monkeypatch):
    res = client.post("/api/email/important", json={"accounts": [], "mode": "keyword"})
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body.get("errors") is None
