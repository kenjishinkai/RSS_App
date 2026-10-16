"""トピック API。"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db  # path setup for db.models
from app.logging_utils import log_call
from app.schemas import TopicCreate, TopicOut, TopicUpdate
from db.models import Article, Topic, User

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicOut])
@log_call
def list_topics(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[TopicOut]:
    rows = db.scalars(select(Topic).order_by(Topic.created_at.asc())).all()
    return [TopicOut.from_orm_row(row) for row in rows]


@router.post("", response_model=TopicOut)
@log_call
def create_topic(
    body: TopicCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> TopicOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="トピック名を入力してください。")

    topic = Topic(name=name)
    db.add(topic)
    try:
        db.commit()
        db.refresh(topic)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="トピックを追加できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return TopicOut.from_orm_row(topic)


@router.patch("/{topic_id}", response_model=TopicOut)
@log_call
def update_topic(
    topic_id: UUID,
    body: TopicUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> TopicOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="トピック名を入力してください。")

    topic = db.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="トピックが見つかりません。")

    topic.name = name
    try:
        db.commit()
        db.refresh(topic)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="トピックを更新できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return TopicOut.from_orm_row(topic)


@router.delete("/{topic_id}")
@log_call
def delete_topic(
    topic_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict[str, bool]:
    topic = db.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="トピックが見つかりません。")

    article_count = db.scalar(
        select(func.count()).select_from(Article).where(Article.topic_id == topic_id)
    )
    if article_count and article_count > 0:
        raise HTTPException(
            status_code=409,
            detail="このトピックには記事があるため削除できません。",
        )

    try:
        db.delete(topic)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="トピックを削除できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return {"ok": True}
