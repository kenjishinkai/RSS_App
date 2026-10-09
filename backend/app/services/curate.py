"""キュレーション・パイプラインの司令塔。

処理の流れ（設計の固定）:
1. トピック（またはフィード URL）を決める
2. RSS を取得・パースする（rss.py）
3. 既に DB にある URL を除く（supabase_writer.py）
4. AI で summary / importance を付ける（ai.py）
5. articles に INSERT する（supabase_writer.py）

たとえ: 編集長が「集める → 重複を捨てる → 要約する → 倉庫に入れる」を順番に指示する。
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services import ai, rss, supabase_writer


@dataclass(frozen=True)
class CurateResult:
    fetched: int
    new_items: int
    inserted: int
    message: str


def run_curation(topic_id: str, feed_url: str) -> CurateResult:
    """1 トピック分のキュレーションを実行する。

    いまは各サービスの骨組みをつなぐだけ。本実装は TODO を埋めていく。
    """
    items = rss.fetch_feed_items(feed_url)
    existing = supabase_writer.list_existing_urls(topic_id)
    fresh = [item for item in items if item.url not in existing]

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
        ai_note = "AI は未使用（OPENAI_API_KEY 未設定、または呼び出し失敗でフォールバック）。"
    else:
        ai_note = f"AI 要約 {ai_count} 件。"

    return CurateResult(
        fetched=len(items),
        new_items=len(fresh),
        inserted=inserted,
        message=(
            f"RSS から {len(items)} 件取得し、新規 {len(fresh)} 件、"
            f"書き込み {inserted} 件です。{ai_note}"
        ),
    )
