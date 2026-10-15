"""バックエンド共通のログ設定と開始／終了／例外ログ用デコレータ。"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date
from functools import wraps
from pathlib import Path
from typing import Any, TypeVar

F = TypeVar("F", bound=Callable[..., Any])

_CONFIGURED = False

# backend/app/logging_utils.py → parents[2] = アプリルート（RSS_App）
_APP_ROOT = Path(__file__).resolve().parents[2]
_LOGS_DIR = _APP_ROOT / "Logs"


def setup_logging() -> None:
    """Logs/backend_YYYY-MM-DD.log へ INFO 以上を出す（コンソールには出さない）。"""
    global _CONFIGURED
    if _CONFIGURED:
        return

    _LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = _LOGS_DIR / f"backend_{date.today():%Y-%m-%d}.log"

    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    # app.* だけファイルへ。propagate=False で uvicorn のコンソールに流れない
    app_logger = logging.getLogger("app")
    app_logger.handlers.clear()
    app_logger.addHandler(file_handler)
    app_logger.setLevel(logging.INFO)
    app_logger.propagate = False

    _CONFIGURED = True


def _short_repr(value: Any, *, limit: int = 80) -> str:
    """ログ用の短い表示。設定オブジェクトや秘密っぽい値は伏せる。"""
    type_name = type(value).__name__
    if type_name == "Settings":
        return "Settings(***)"
    text = repr(value)
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return text


def _format_args(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    sensitive = {"api_key", "key", "password", "token", "secret", "service_role"}
    parts: list[str] = [_short_repr(arg) for arg in args]
    for name, value in kwargs.items():
        lowered = name.lower()
        if any(word in lowered for word in sensitive):
            parts.append(f"{name}=***")
        else:
            parts.append(f"{name}={_short_repr(value)}")
    return ", ".join(parts)


def log_call(func: F) -> F:
    """関数の開始・終了・例外をログに出すデコレータ。例外は再送出する。"""
    logger = logging.getLogger(func.__module__)

    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        arg_text = _format_args(args, kwargs)
        logger.info("開始: %s(%s)", func.__qualname__, arg_text)
        try:
            result = func(*args, **kwargs)
        except Exception:
            logger.exception("例外: %s", func.__qualname__)
            raise
        logger.info("終了: %s", func.__qualname__)
        return result

    return wrapper  # type: ignore[return-value]
