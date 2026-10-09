"""手動ジョブ用 API。

POST /jobs/curate … 「今すぐキュレーションを走らせる」ボタン用の入口。
たとえ: 工場の「手動スタート」スイッチ。定期実行は後から OS タスクや cron で足す。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.curate import run_curation
from app.services.rss import FeedFetchError
from app.services.supabase_writer import SupabaseWriterError

router = APIRouter(prefix="/jobs", tags=["jobs"])


class CurateRequest(BaseModel):
    topic_id: str = Field(..., description="Supabase topics.id")
    feed_url: str = Field(..., description="そのトピックの RSS URL")


class CurateResponse(BaseModel):
    fetched: int
    new_items: int
    inserted: int
    message: str


@router.post("/curate", response_model=CurateResponse)
def curate_now(body: CurateRequest) -> CurateResponse:
    """RSS → AI → Supabase のパイプラインを手動実行する。"""
    try:
        result = run_curation(topic_id=body.topic_id, feed_url=body.feed_url)
    except FeedFetchError as exc:
        # 502 = 向こうの RSS サーバー側でうまく取れなかった、という意味に近い
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except SupabaseWriterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CurateResponse(
        fetched=result.fetched,
        new_items=result.new_items,
        inserted=result.inserted,
        message=result.message,
    )
