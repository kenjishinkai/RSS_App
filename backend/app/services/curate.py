"""キュレーション・パイプラインの司令塔。

処理の流れ:
1. トピック名で Google News（日本向け）RSS URL を組み立てる
2. rss.fetch_feed_items(...)
3. 公開日時が最も新しい 1 件だけ残す
4. supabase_writer.list_existing_urls(topic_id) で重複除外
5. ai.enrich_article(...)
6. supabase_writer.insert_articles(...)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote_plus

from app.logging_utils import log_call
from app.services import ai, rss, supabase_writer
from app.services.rss import FeedFetchError, FeedItem

_GOOGLE_NEWS_RSS = (
    "https://news.google.com/rss/search?q={query}&hl=ja&gl=JP&ceid=JP:ja"
)
_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


@dataclass(frozen=True)
class CurateResult:
    fetched: int
    new_items: int
    inserted: int
    message: str


@log_call
def build_google_news_feed_url(topic_name: str) -> str:
    """トピック名から日本向け Google News RSS URL を作る。"""
    name = (topic_name or "").strip()
    if not name:
        raise FeedFetchError("topic_name が空です。")
    return _GOOGLE_NEWS_RSS.format(query=quote_plus(name))


def _published_sort_key(item: FeedItem) -> datetime:
    """新しいほど大きい。日時が無い／不正なものは最古扱いにする。"""
    raw = item.published_at
    if not raw:
        return _EPOCH
    try:
        normalized = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return _EPOCH


@log_call
def pick_latest_item(items: list[FeedItem]) -> list[FeedItem]:
    """公開日時が最も新しい 1 件だけ返す（無いときは空）。"""
    if not items:
        return []
    newest = max(items, key=_published_sort_key)
    return [newest]


@log_call
def run_curation(topic_id: str, topic_name: str) -> CurateResult:
    """1 トピック分のキュレーションを実行する（Google News 最新 1 件）。"""
    feed_url = build_google_news_feed_url(topic_name)
    items = rss.fetch_feed_items(feed_url)
    candidates = pick_latest_item(items)

    existing = supabase_writer.list_existing_urls(topic_id)
    fresh = [item for item in candidates if item.url not in existing]

    drafts: list[supabase_writer.ArticleDraft] = []
    ai_count = 0
    for item in fresh:
        enrichment = ai.enrich_article(item.title, item.raw_summary)
        if enrichment.used_ai:
            ai_count += 1
        drafts.append(
            supabase_writer.ArticleDraft(
                topic_id=topic_id,
                title=item.title,
                url=item.url,
                summary=enrichment.summary,
                importance=enrichment.importance,
                published_at=item.published_at,
            )
        )

    inserted = supabase_writer.insert_articles(drafts)
    if fresh and ai_count == 0:
        ai_note = (
            "AI は未使用（GEMINI_API_KEY 未設定、または呼び出し失敗でフォールバック）。"
        )
    else:
        ai_note = f"AI 要約 {ai_count} 件。"

    return CurateResult(
        fetched=len(candidates),
        new_items=len(fresh),
        inserted=inserted,
        message=(
            f"Google News から最新 {len(candidates)} 件を選び、"
            f"新規 {len(fresh)} 件、書き込み {inserted} 件です。{ai_note}"
        ),
    )
