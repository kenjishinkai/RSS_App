"""記事 API。"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.logging_utils import log_call
from app.schemas import ArticleOut, parse_uuid
from db.models import Article, User

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("", response_model=list[ArticleOut])
@log_call
def list_articles(
    topic_id: str = Query(..., description="所属トピックの UUID"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[ArticleOut]:
    try:
        topic_uuid = parse_uuid(topic_id, "topic_id")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    rows = db.scalars(
        select(Article)
        .where(Article.topic_id == topic_uuid)
        .order_by(Article.published_at.desc().nulls_last())
    ).all()
    return [ArticleOut.from_orm_row(row) for row in rows]


@router.patch("/{article_id}/read", response_model=ArticleOut)
@log_call
def mark_article_read(
    article_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> ArticleOut:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="記事が見つかりません。")

    article.is_read = True
    try:
        db.commit()
        db.refresh(article)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="既読に更新できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return ArticleOut.from_orm_row(article)


@router.patch("/{article_id}/favorite", response_model=ArticleOut)
@log_call
def mark_article_favorite(
    article_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> ArticleOut:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="記事が見つかりません。")

    article.is_favorite = True
    try:
        db.commit()
        db.refresh(article)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="お気に入りに登録できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return ArticleOut.from_orm_row(article)


@router.delete("/{article_id}/favorite", response_model=ArticleOut)
@log_call
def unmark_article_favorite(
    article_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> ArticleOut:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="記事が見つかりません。")

    article.is_favorite = False
    try:
        db.commit()
        db.refresh(article)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="お気に入りを解除できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return ArticleOut.from_orm_row(article)


@router.delete("/{article_id}")
@log_call
def delete_article(
    article_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict[str, bool]:
    article = db.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="記事が見つかりません。")

    try:
        db.delete(article)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="記事を削除できませんでした。DATABASE_URL を確認してください。",
        ) from exc

    return {"ok": True}
