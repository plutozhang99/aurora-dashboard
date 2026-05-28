"""Shared pytest fixtures and helpers.

No real network/IMAP is ever touched: the IMAP fetch and LLM layer are injected
or monkeypatched in tests.
"""

from __future__ import annotations

import pytest

from app.models import EmailAccount


def make_email(uid, *, frm="a@x.com", subject="Subject", snippet="body", date=1000, message_id=""):
    """Construct a FetchedEmail dict like imap.fetch_account_blocking returns."""
    return {
        "uid": uid,
        "from": frm,
        "subject": subject,
        "snippet": snippet,
        "date": date,
        "messageId": message_id,
    }


def make_account(account_id="acc1", *, enabled=True, user="u@x.com"):
    return EmailAccount(
        id=account_id,
        enabled=enabled,
        host="imap.example.com",
        port=993,
        user=user,
        password="secret",
        secure=True,
    )


@pytest.fixture
def email_factory():
    return make_email


@pytest.fixture
def account_factory():
    return make_account


@pytest.fixture(autouse=True)
def clear_classify_cache():
    """Reset the classify TTL cache between tests to avoid cross-test leakage."""
    from app.services import classify

    classify._cache.clear()
    yield
    classify._cache.clear()
