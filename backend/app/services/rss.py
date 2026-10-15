"""RSS 取得サービス。

feed_url から XML を取得し、title / url / published_at / raw_summary の一覧にする。
記事全文のクロールはしない（RSS に載っている情報のみ）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from time import struct_time
from typing import Any

import feedparser
import httpx

from app.logging_utils import log_call

_USER_AGENT = "RSS-App-Curation/0.1 (+https://localhost; feed fetcher)"
_TAG_RE = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class FeedItem:
    title: str
    url: str
    published_at: str | None = None
    raw_summary: str | None = None


class FeedFetchError(Exception):
    """RSS の取得や解析に失敗したときのエラー。"""


@log_call
def fetch_feed_items(feed_url: str, *, timeout: float = 20.0) -> list[FeedItem]:
    """指定した RSS / Atom URL から記事候補を返す。

    Raises:
        FeedFetchError: URL が空、通信失敗、有効な記事が無いとき
    """
    url = (feed_url or "").strip()
    if not url:
        raise FeedFetchError("feed_url が空です。")

    try:
        response = httpx.get(
            url,
            timeout=timeout,
            follow_redirects=True,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": (
                    "application/rss+xml, application/atom+xml, "
                    "application/xml, text/xml;q=0.9, */*;q=0.8"
                ),
            },
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise FeedFetchError(f"RSS の取得に失敗しました: {url}") from exc

    parsed = feedparser.parse(response.content)
    entries = getattr(parsed, "entries", None) or []
    if not entries:
        detail = getattr(parsed, "bozo_exception", None)
        hint = f" ({detail})" if detail else ""
        raise FeedFetchError(f"RSS から記事を読み取れませんでした: {url}{hint}")

    items: list[FeedItem] = []
    seen_urls: set[str] = set()

    for entry in entries:
        item = _entry_to_item(entry)
        if item is None or item.url in seen_urls:
            continue
        seen_urls.add(item.url)
        items.append(item)

    if not items:
        raise FeedFetchError(
            f"有効なタイトルと URL を持つ記事がありませんでした: {url}"
        )

    return items


def _entry_to_item(entry: Any) -> FeedItem | None:
    title = _clean_text(getattr(entry, "title", None))
    link = _clean_text(getattr(entry, "link", None))
    if not title or not link:
        return None

    summary = _clean_text(
        getattr(entry, "summary", None) or getattr(entry, "description", None)
    )
    return FeedItem(
        title=title,
        url=link,
        published_at=_resolve_published_at(entry),
        raw_summary=summary,
    )


def _resolve_published_at(entry: Any) -> str | None:
    for parsed_key in ("published_parsed", "updated_parsed"):
        iso = _struct_time_to_iso(getattr(entry, parsed_key, None))
        if iso:
            return iso

    for raw_key in ("published", "updated"):
        iso = _raw_date_to_iso(getattr(entry, raw_key, None))
        if iso:
            return iso

    return None


def _struct_time_to_iso(value: Any) -> str | None:
    if not isinstance(value, struct_time):
        return None
    try:
        dt = datetime(
            value.tm_year,
            value.tm_mon,
            value.tm_mday,
            value.tm_hour,
            value.tm_min,
            value.tm_sec,
            tzinfo=timezone.utc,
        )
    except (TypeError, ValueError, OverflowError):
        return None
    return dt.isoformat()


def _raw_date_to_iso(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = _TAG_RE.sub("", value)
    text = " ".join(text.split()).strip()
    return text or None
