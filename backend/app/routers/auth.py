"""認証 API。"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.db import get_db
from app.logging_utils import log_call
from db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthBody(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8)


class UserOut(BaseModel):
    id: str
    email: str
    created_at: str

    @classmethod
    def from_orm_row(cls, user: User) -> UserOut:
        return cls(
            id=str(user.id),
            email=user.email,
            created_at=user.created_at.isoformat() if user.created_at else "",
        )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_credentials(email: str, password: str) -> str:
    normalized = _normalize_email(email)
    if not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=422, detail="メールアドレスの形式が正しくありません。")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="パスワードは8文字以上にしてください。")
    return normalized


@router.post("/register", response_model=UserOut)
@log_call
def register(
    body: AuthBody,
    response: Response,
    db: Session = Depends(get_db),
) -> UserOut:
    email = _validate_credentials(body.email, body.password)
    exists = db.scalar(select(User).where(User.email == email))
    if exists is not None:
        raise HTTPException(status_code=409, detail="このメールアドレスは既に登録されています。")

    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="ユーザー登録に失敗しました。",
        ) from exc

    token = create_access_token(user.id)
    set_auth_cookie(response, token)
    return UserOut.from_orm_row(user)


@router.post("/login", response_model=UserOut)
@log_call
def login(
    body: AuthBody,
    response: Response,
    db: Session = Depends(get_db),
) -> UserOut:
    email = _validate_credentials(body.email, body.password)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが違います。")

    token = create_access_token(user.id)
    set_auth_cookie(response, token)
    return UserOut.from_orm_row(user)


@router.post("/logout")
@log_call
def logout(response: Response) -> dict[str, bool]:
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
@log_call
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.from_orm_row(user)
