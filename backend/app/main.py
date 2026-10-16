"""FastAPI の入口。

起動例（backend フォルダで）:
  uvicorn app.main:app --reload --port 8000

GET  /health
GET  /topics
POST /topics
GET  /articles
PATCH /articles/{id}/read
POST /jobs/curate
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.logging_utils import log_call, setup_logging
from app.routers import articles, auth, jobs, topics

setup_logging()
settings = get_settings()

app = FastAPI(
    title="ニュースデスク API",
    description=(
        "RSS 取得・AI 要約・ローカル PostgreSQL（newsdesk）への読み書きを担当する。"
        "画面は frontend（Next.js）が本 API 経由でデータを操作する。"
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(topics.router)
app.include_router(articles.router)
app.include_router(jobs.router)


@app.get("/health")
@log_call
def health() -> dict[str, object]:
    """生存確認と設定の有無を返す。"""
    # .env 変更を拾えるよう、都度読み直す
    get_settings.cache_clear()
    cfg = get_settings()
    return {
        "status": "ok",
        "database_configured": cfg.is_database_configured,
        "gemini_configured": cfg.is_gemini_configured,
        "gemini_model": cfg.gemini_model,
    }
