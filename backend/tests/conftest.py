"""pytest 共通設定。本物の PostgreSQL（newsdesk_test）を使う。"""

from __future__ import annotations

import os
import sys
import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import text

# backend/ を import パスに入れる
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

_DEFAULT_TEST_DB = (
    "postgresql+psycopg://newsdesk:newsdesk@127.0.0.1:5432/newsdesk_test"
)

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    _DEFAULT_TEST_DB,
).strip() or _DEFAULT_TEST_DB
os.environ["JWT_SECRET"] = os.environ.get(
    "JWT_SECRET",
    "test-jwt-secret-for-pytest-only-not-for-production",
)
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("GEMINI_API_KEY", "")

from app.config import get_settings  # noqa: E402
from app.db import get_session_factory, reset_engine  # noqa: E402
from db.models import Article, Topic  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_db() -> Generator[None, None, None]:
    """各テストの前後でテーブルを空にする。"""
    get_settings.cache_clear()
    reset_engine()
    session = get_session_factory()()
    try:
        session.execute(
            text("TRUNCATE TABLE articles, topics, users RESTART IDENTITY CASCADE")
        )
        session.commit()
    finally:
        session.close()
    yield
    get_settings.cache_clear()
    reset_engine()
    session = get_session_factory()()
    try:
        session.execute(
            text("TRUNCATE TABLE articles, topics, users RESTART IDENTITY CASCADE")
        )
        session.commit()
    finally:
        session.close()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    get_settings.cache_clear()
    reset_engine()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_client(client):
    """登録済みユーザーで Cookie 付きの TestClient を返す。"""
    email = f"user-{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    response = client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return client, email, password


def create_topic_via_api(client, name: str = "テスト話題") -> dict:
    response = client.post("/topics", json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()


def seed_article(
    topic_id: str,
    *,
    title: str = "サンプル記事",
    url: str | None = None,
    summary: str = "要約テキスト",
    importance: str = "medium",
) -> Article:
    """DB に直接記事を1件入れる（API に INSERT が無いため）。"""
    session = get_session_factory()()
    try:
        article = Article(
            topic_id=uuid.UUID(topic_id),
            title=title,
            url=url or f"https://example.com/{uuid.uuid4().hex}",
            summary=summary,
            importance=importance,
            is_read=False,
            is_favorite=False,
        )
        session.add(article)
        session.commit()
        session.refresh(article)
        session.expunge(article)
        return article
    finally:
        session.close()


def get_topic_row(topic_id: str) -> Topic | None:
    session = get_session_factory()()
    try:
        return session.get(Topic, uuid.UUID(topic_id))
    finally:
        session.close()
