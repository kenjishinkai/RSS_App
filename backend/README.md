# backend（収集・要約 API）

FastAPI のバックエンドです。RSS 取得 → AI 要約 → Supabase 書き込みを担当します。

起動方法・役割分担・環境変数の説明は、リポジトリ直下の [README.md](../README.md) を見てください。

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

- ヘルスチェック: http://localhost:8000/health
- API ドキュメント: http://localhost:8000/docs
- 手動キュレート: `POST /jobs/curate`

## パイプライン（設計）

1. `services/rss.py` … RSS を取る  
2. `services/supabase_writer.py` … 既存 URL を除く  
3. `services/ai.py` … 要約・重要度  
4. `services/supabase_writer.py` … articles に INSERT  
5. `routers/jobs.py` … 上記を `POST /jobs/curate` で手動実行  

司令塔は `services/curate.py` です。各ファイルの TODO を埋めて本実装に進みます。
