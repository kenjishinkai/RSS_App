"""API レスポンス用スキーマ（フロントの Topic / Article 型に合わせる）。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

import app.db  # noqa: F401  — プロジェクトルートを sys.path に追加
from db.models import Article, Topic


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


class TopicCreate(BaseModel):
    name: str = Field(..., min_length=1)


class TopicUpdate(BaseModel):
    name: str = Field(..., min_length=1)


class TopicOut(BaseModel):
    id: str
    name: str
    created_at: str

    @classmethod
    def from_orm_row(cls, row: Topic) -> TopicOut:
        return cls(
            id=str(row.id),
            name=row.name,
            created_at=_iso(row.created_at) or "",
        )


class ArticleOut(BaseModel):
    id: str
    topic_id: str
    title: str
    url: str
    summary: str | None
    importance: str | None
    is_read: bool
    is_favorite: bool
    published_at: str | None

    @classmethod
    def from_orm_row(cls, row: Article) -> ArticleOut:
        return cls(
            id=str(row.id),
            topic_id=str(row.topic_id),
            title=row.title,
            url=row.url,
            summary=row.summary,
            importance=row.importance,
            is_read=row.is_read,
            is_favorite=row.is_favorite,
            published_at=_iso(row.published_at),
        )


def parse_uuid(value: str, label: str = "id") -> UUID:
    try:
        return UUID(str(value).strip())
    except ValueError as exc:
        raise ValueError(f"不正な {label} です") from exc
