"""FastAPI の入口。

起動例（backend フォルダで）:
  uvicorn app.main:app --reload --port 8000

GET  /health
POST /jobs/curate
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.logging_utils import log_call, setup_logging
from app.routers import jobs

setup_logging()
settings = get_settings()

app = FastAPI(
    title="ニュースデスク API",
    description=(
        "RSS 取得・AI 要約・Supabase 書き込みを担当するバックエンド。"
        "画面表示は frontend（Next.js）が Supabase を直接読む。"
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

app.include_router(jobs.router)


@app.get("/health")
@log_call
def health() -> dict[str, object]:
    """生存確認と設定の有無を返す。"""
    return {
        "status": "ok",
        "supabase_configured": settings.is_supabase_configured,
        "gemini_configured": settings.is_gemini_configured,
        "gemini_model": settings.gemini_model,
    }
