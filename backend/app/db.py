"""SQLAlchemy セッション。モデルはプロジェクトルートの db.models を正とする。"""

from __future__ import annotations

import sys
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine():
    """DATABASE_URL から engine を返す（未設定なら ValueError）。"""
    global _engine, _SessionLocal
    cfg = get_settings()
    if not cfg.is_database_configured:
        raise ValueError(
            "DATABASE_URL が未設定です。backend/.env に "
            "postgresql+psycopg://newsdesk:***@127.0.0.1:5432/newsdesk を入れてください。"
        )
    if _engine is None:
        _engine = create_engine(cfg.database_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def reset_engine() -> None:
    """テスト用: キャッシュした engine / セッション工場を破棄する。"""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依存性注入用。"""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
