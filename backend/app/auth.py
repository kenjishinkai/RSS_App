"""JWT Cookie 認証。ログイン済みかどうかだけを見る（データは共有）。"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from db.models import User

COOKIE_NAME = "newsdesk_token"
_JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


def create_access_token(user_id: uuid.UUID, settings: Settings | None = None) -> str:
    cfg = settings or get_settings()
    if not cfg.jwt_secret.strip():
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET が未設定です。backend/.env を確認してください。",
        )
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=cfg.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, cfg.jwt_secret, algorithm=_JWT_ALG)


def set_auth_cookie(response: Response, token: str, settings: Settings | None = None) -> None:
    cfg = settings or get_settings()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=cfg.jwt_expire_minutes * 60,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    # Settings を引数にすると FastAPI が JSON body と誤認するため、内部で読む
    cfg = get_settings()
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="ログインが必要です。")
    if not cfg.jwt_secret.strip():
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET が未設定です。backend/.env を確認してください。",
        )

    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=[_JWT_ALG])
        user_id = uuid.UUID(str(payload.get("sub")))
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="ログインが必要です。") from exc

    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=401, detail="ログインが必要です。")
    return user
