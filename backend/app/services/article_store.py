"""ローカル PostgreSQL（newsdesk）への articles 書き込み。

既存 URL 照会と INSERT を行う。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import Settings, get_settings
from app.db import get_session_factory
from app.logging_utils import log_call
from db.models import Article


@dataclass(frozen=True)
class ArticleDraft:
    topic_id: str
    title: str
    url: str
    summary: str | None = None
    importance: str | None = None
    published_at: str | None = None


class ArticleStoreError(Exception):
    """articles の読み書きに失敗したときのエラー。"""


def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value).strip())
    except ValueError as exc:
        raise ArticleStoreError(f"不正な topic_id です: {value}") from exc


def _parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


@log_call
def list_existing_urls(topic_id: str, settings: Settings | None = None) -> set[str]:
    """トピック内の既存 URL 集合を返す（重複防止用）。"""
    cfg = settings or get_settings()
    if not cfg.is_database_configured:
        return set()

    topic = (topic_id or "").strip()
    if not topic:
        return set()

    topic_uuid = _parse_uuid(topic)
    session = get_session_factory()()
    try:
        rows = session.scalars(
            select(Article.url).where(Article.topic_id == topic_uuid)
        ).all()
        return {url.strip() for url in rows if isinstance(url, str) and url.strip()}
    except ArticleStoreError:
        raise
    except Exception as exc:
        raise ArticleStoreError(
            "articles の URL 照会に失敗しました。DATABASE_URL とテーブルを確認してください。"
        ) from exc
    finally:
        session.close()


@log_call
def insert_articles(
    drafts: list[ArticleDraft],
    settings: Settings | None = None,
) -> int:
    """記事の下書きを articles に書き込む。戻り値は挿入件数。"""
    cfg = settings or get_settings()
    if not cfg.is_database_configured or not drafts:
        return 0

    topic_id = drafts[0].topic_id
    if any(draft.topic_id != topic_id for draft in drafts):
        raise ArticleStoreError("一度に書き込めるのは、同じトピックの記事だけです。")

    existing = list_existing_urls(topic_id, cfg)
    seen_in_batch: set[str] = set()
    topic_uuid = _parse_uuid(topic_id)
    to_insert: list[Article] = []

    for draft in drafts:
        url = (draft.url or "").strip()
        title = (draft.title or "").strip()
        if not url or not title:
            continue
        if url in existing or url in seen_in_batch:
            continue

        seen_in_batch.add(url)
        to_insert.append(
            Article(
                topic_id=topic_uuid,
                title=title,
                url=url,
                summary=draft.summary,
                importance=draft.importance,
                is_read=False,
                is_favorite=False,
                published_at=_parse_published_at(draft.published_at),
            )
        )

    if not to_insert:
        return 0

    session = get_session_factory()()
    try:
        session.add_all(to_insert)
        session.commit()
        return len(to_insert)
    except Exception as exc:
        session.rollback()
        raise ArticleStoreError(
            "articles への書き込みに失敗しました。"
            " DATABASE_URL とテーブル定義を確認してください。"
        ) from exc
    finally:
        session.close()
