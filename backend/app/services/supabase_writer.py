"""Supabase への書き込みサービス。

service_role キーで articles の既存 URL 照会と INSERT を行う。
フロント（anon）からは INSERT しない。
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app.config import Settings, get_settings
from app.logging_utils import log_call

_PAGE_SIZE = 1000


@dataclass(frozen=True)
class ArticleDraft:
    topic_id: str
    title: str
    url: str
    summary: str | None = None
    importance: str | None = None
    published_at: str | None = None


class SupabaseWriterError(Exception):
    """Supabase への読み書きに失敗したときのエラー。"""


@lru_cache
def _cached_client(url: str, key: str) -> Client:
    return create_client(url, key)


@log_call
def get_client(settings: Settings | None = None) -> Client:
    """設定済みの Supabase クライアントを返す。"""
    cfg = settings or get_settings()
    if not cfg.is_supabase_configured:
        raise SupabaseWriterError(
            "Supabase が未設定です。backend/.env に "
            "SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を入れてください。"
        )
    return _cached_client(cfg.supabase_url, cfg.supabase_service_role_key)


@log_call
def list_existing_urls(topic_id: str, settings: Settings | None = None) -> set[str]:
    """トピック内の既存 URL 集合を返す（重複防止用）。"""
    cfg = settings or get_settings()
    if not cfg.is_supabase_configured:
        return set()

    topic = (topic_id or "").strip()
    if not topic:
        return set()

    client = get_client(cfg)
    urls: set[str] = set()
    offset = 0

    while True:
        response = (
            client.table("articles")
            .select("url")
            .eq("topic_id", topic)
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        )
        rows: list[dict[str, Any]] = response.data or []
        for row in rows:
            url = row.get("url")
            if isinstance(url, str) and url.strip():
                urls.add(url.strip())

        if len(rows) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE

    return urls


@log_call
def insert_articles(
    drafts: list[ArticleDraft],
    settings: Settings | None = None,
) -> int:
    """記事の下書きを articles に書き込む。戻り値は挿入件数。"""
    cfg = settings or get_settings()
    if not cfg.is_supabase_configured or not drafts:
        return 0

    topic_id = drafts[0].topic_id
    if any(draft.topic_id != topic_id for draft in drafts):
        raise SupabaseWriterError("一度に書き込めるのは、同じトピックの記事だけです。")

    existing = list_existing_urls(topic_id, cfg)
    seen_in_batch: set[str] = set()
    rows: list[dict[str, Any]] = []

    for draft in drafts:
        url = (draft.url or "").strip()
        title = (draft.title or "").strip()
        if not url or not title:
            continue
        if url in existing or url in seen_in_batch:
            continue

        seen_in_batch.add(url)
        row: dict[str, Any] = {
            "topic_id": draft.topic_id,
            "title": title,
            "url": url,
            "summary": draft.summary,
            "importance": draft.importance,
            "is_read": False,
        }
        if draft.published_at:
            row["published_at"] = draft.published_at
        rows.append(row)

    if not rows:
        return 0

    client = get_client(cfg)
    try:
        response = client.table("articles").insert(rows).execute()
    except Exception as exc:
        raise SupabaseWriterError(
            "articles への書き込みに失敗しました。"
            " テーブル名・RLS・service_role キーを確認してください。"
        ) from exc

    inserted = response.data or []
    return len(inserted)
