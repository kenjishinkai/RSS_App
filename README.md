# ニュースデスク（RSS キュレーション）

トピックごとにニュースを集め、AI 要約と重要度付きで読むアプリです。

このリポジトリは **フロント** と **バック** をフォルダで分けています。

## 仕様書（マスター）

- [spec.md](spec.md) … 機能・画面・API・データ・構成の正

```text
RSS_App/
  frontend/   … 画面（Next.js）。backend API 経由で表示・操作
  backend/    … 収集・要約・DB API（FastAPI → PostgreSQL newsdesk）
  db/         … DB スキーマ定義（SQLAlchemy）と Alembic
  terraform/  … ローカル PostgreSQL の DB / ユーザー作成
  spec.md     … 製品仕様のマスター
```

## 役割分担（たとえ）

| 役割 | 担当 | たとえ |
|------|------|--------|
| 画面・トピック追加・既読 | `frontend/` | 新聞売り場のカウンター |
| RSS 取得 | `backend/` | 配達員が各紙を集める |
| AI 要約・重要度 | `backend/` | 編集部が要約して札を付ける |
| DB 読み書き | `backend/` → PostgreSQL（`newsdesk`） | 倉庫の入出庫係 |
| 画面からの操作 | `frontend/` → backend REST | カウンターから倉庫へ注文する |

```text
Google News RSS → backend（rss → 最新1件 → 重複除外 → ai → article_store）→ PostgreSQL newsdesk
frontend → backend REST API → PostgreSQL newsdesk
```

バックエンドのパイプライン入口は `POST /jobs/curate` です。  
実装の骨組みは `backend/app/services/` にあります。

## 鍵（環境変数）の置き場所

| 置き場 | 変数 | 意味 |
|--------|------|------|
| `frontend/.env.local` | `NEXT_PUBLIC_BACKEND_URL` | バックエンドの住所（省略時 `http://localhost:8000`） |
| `backend/.env` | `DATABASE_URL` | ローカル PostgreSQL（例: `postgresql+psycopg://newsdesk:***@127.0.0.1:5432/newsdesk`） |
| `backend/.env` | `GEMINI_API_KEY` | Gemini 用 API キー（要約・重要度。未設定でも取得・書き込みは動く） |
| `backend/.env` | `GEMINI_MODEL` | 省略可（既定: `gemini-2.0-flash`） |
| `backend/.env` | `CORS_ORIGINS` | 許可するフロント起源（既定 `http://localhost:3000`） |
| `backend/.env` | `JWT_SECRET` | ログイン用 JWT の署名鍵（長いランダム文字列） |
| `backend/.env` | `JWT_EXPIRE_MINUTES` | 省略可（既定: `10080` = 7 日） |

テンプレート:

- フロント: [`frontend/.env.example`](frontend/.env.example)
- バック: [`backend/.env.example`](backend/.env.example)

`.env` / `.env.local` は Git に上げません。

DB の箱づくりは `terraform/`、テーブル作成は `alembic -c db/alembic.ini upgrade head`（詳細は [spec.md](spec.md) §5）。  
自動テスト用 DB は `newsdesk_test`（本番用 `newsdesk` とは別）。

## 自動テスト

たとえ: 倉庫（DB）を本番用と練習用に分け、練習用で何度も試し打ちするイメージです。

### 準備（初回）

```powershell
# テスト用 DB を作る（terraform/）
cd terraform
terraform apply

# テーブルを作る
cd ..
$env:DATABASE_URL = "postgresql+psycopg://newsdesk:newsdesk@127.0.0.1:5432/newsdesk_test"
alembic -c db/alembic.ini upgrade head
```

### 1. バックエンド API（pytest）

```powershell
cd backend
.\.venv\Scripts\activate
pip install -r requirements-dev.txt
pytest
```

未設定時は `newsdesk_test` を使います。別 URL にするときは `TEST_DATABASE_URL` を設定。

### 2. フロント関数（Vitest）

```powershell
cd frontend
npm test
```

### 3. ブラウザ E2E（Playwright）

先に **テスト DB** で backend を起動します（本番 DB を汚さないため）。

```powershell
# ターミナル A
cd backend
$env:DATABASE_URL = "postgresql+psycopg://newsdesk:newsdesk@127.0.0.1:5432/newsdesk_test"
$env:JWT_SECRET = "test-jwt-secret-for-e2e-only"
$env:CORS_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
uvicorn app.main:app --host 127.0.0.1 --port 8000

# ターミナル B
cd frontend
npx playwright install chromium   # 初回のみ
npm run test:e2e
```

## 起動方法

### 1. フロント（画面）

```powershell
cd frontend
npm install
npm run dev
```

→ http://localhost:3000

### 2. バック（収集・DB API）

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# .env を編集してから
uvicorn app.main:app --reload --port 8000
```

→ ヘルスチェック: http://localhost:8000/health  
→ API ドキュメント: http://localhost:8000/docs

手動キュレーションの例（トピック名で Google News 最新 1 件）:

```powershell
curl -X POST http://localhost:8000/jobs/curate `
  -H "Content-Type: application/json" `
  -d "{\"topic_id\":\"あなたのトピックID\",\"topic_name\":\"人工知能\"}"
```

## 主なファイル案内

| パス | 役割 |
|------|------|
| `frontend/app/page.tsx` | 画面本体 |
| `frontend/lib/backend.ts` | backend REST の呼び出し |
| `backend/app/main.py` | FastAPI の入口・`/health` |
| `backend/app/routers/topics.py` | `GET/POST /topics` |
| `backend/app/routers/articles.py` | `GET /articles`・`PATCH /articles/{id}/read` |
| `backend/app/routers/jobs.py` | `POST /jobs/curate` |
| `backend/app/services/curate.py` | パイプラインの司令塔 |
| `backend/app/services/article_store.py` | articles の照会・INSERT |
| `db/models.py` | DB スキーマ定義の正 |
