"""FastAPI の入口。

起動例（backend フォルダで）:
  python -m venv .venv
  .venv\\Scripts\\activate
  pip install -r requirements.txt
  uvicorn app.main:app --reload --port 8000

ヘルスチェック: GET http://localhost:8000/health
手動キュレート: POST http://localhost:8000/jobs/curate
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import jobs

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
def health() -> dict[str, object]:
    """サーバーが生きているかの簡単な確認。"""
    return {
        "status": "ok",
        "supabase_configured": settings.is_supabase_configured,
        "openai_configured": settings.is_openai_configured,
        "openai_model": settings.openai_model,
    }
