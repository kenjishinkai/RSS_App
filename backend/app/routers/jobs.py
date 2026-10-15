"""手動ジョブ用 API。

POST /jobs/curate … 選択トピック名で Google News 最新 1 件を取得する。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.logging_utils import log_call
from app.services.curate import run_curation
from app.services.rss import FeedFetchError
from app.services.supabase_writer import SupabaseWriterError

router = APIRouter(prefix="/jobs", tags=["jobs"])


class CurateRequest(BaseModel):
    topic_id: str = Field(..., description="Supabase topics.id")
    topic_name: str = Field(..., description="検索に使うトピック名")

    @field_validator("topic_id", "topic_name", mode="before")
    @classmethod
    def coerce_and_require_text(cls, value: Any) -> str:
        # JSON で数字で来ても文字列に揃える（例: topic_id: 1 → "1"）
        if value is None:
            raise ValueError("空にはできません")
        trimmed = str(value).strip()
        if not trimmed:
            raise ValueError("空にはできません")
        return trimmed


class CurateResponse(BaseModel):
    fetched: int
    new_items: int
    inserted: int
    message: str


@router.post("/curate", response_model=CurateResponse)
@log_call
def curate_now(body: CurateRequest) -> CurateResponse:
    """Google News → 最新1件 → AI → Supabase を手動実行する。"""
    try:
        result = run_curation(topic_id=body.topic_id, topic_name=body.topic_name)
    except FeedFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except SupabaseWriterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CurateResponse(
        fetched=result.fetched,
        new_items=result.new_items,
        inserted=result.inserted,
        message=result.message,
    )
