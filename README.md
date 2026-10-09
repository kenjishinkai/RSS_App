# ニュースデスク（RSS キュレーション）

トピックごとにニュースを集め、AI 要約と重要度付きで読むアプリです。

このリポジトリは **フロント** と **バック** をフォルダで分けています。

```text
RSS_App/
  frontend/   … 画面（Next.js）。Supabase を読んで表示する
  backend/    … 収集・要約（FastAPI）。RSS を取り、記事を Supabase に書く
```

## 役割分担（たとえ）

| 役割 | 担当 | たとえ |
|------|------|--------|
| 画面・トピック追加・既読 | `frontend/` | 新聞売り場のカウンター |
| RSS 取得 | `backend/` | 配達員が各紙を集める |
| AI 要約・重要度 | `backend/` | 編集部が要約して札を付ける |
| 記事の書き込み（INSERT） | `backend/` → Supabase | 倉庫への入庫 |
| 記事の表示・既読更新 | `frontend/` → Supabase | 倉庫から客に見せる |

```text
RSS → backend（rss → ai → supabase_writer）→ Supabase ← frontend ← ブラウザ
```

バックエンドのパイプライン入口は `POST /jobs/curate` です。  
実装の骨組みは `backend/app/services/` にあります。

## 鍵（環境変数）の置き場所

| 置き場 | 変数 | 意味 |
|--------|------|------|
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | プロジェクトの住所 |
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開してよい入場券（anon） |
| `frontend/.env.local` | `NEXT_PUBLIC_BACKEND_URL` | バックエンドの住所（省略時 `http://localhost:8000`） |
| `backend/.env` | `SUPABASE_URL` | 同じ住所 |
| `backend/.env` | `SUPABASE_SERVICE_ROLE_KEY` | **秘密のマスターキー**（ブラウザに出さない） |
| `backend/.env` | `OPENAI_API_KEY` | AI 用（要約・重要度） |
| `backend/.env` | `OPENAI_MODEL` | 省略可（既定: `gpt-4o-mini`） |

テンプレート:

- フロント: [`frontend/.env.example`](frontend/.env.example)
- バック: [`backend/.env.example`](backend/.env.example)

`.env` / `.env.local` は Git に上げません。

## 起動方法

### 1. フロント（画面）

```powershell
cd frontend
npm install
npm run dev
```

→ http://localhost:3000

### 2. バック（収集 API）

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

手動キュレーション（骨組み）の例:

```powershell
curl -X POST http://localhost:8000/jobs/curate `
  -H "Content-Type: application/json" `
  -d "{\"topic_id\":\"あなたのトピックID\",\"feed_url\":\"https://example.com/feed.xml\"}"
```

## バックエンドのファイル案内

| パス | 役割 |
|------|------|
| `backend/app/main.py` | FastAPI の入口・`/health` |
| `backend/app/routers/jobs.py` | `POST /jobs/curate` |
| `backend/app/services/curate.py` | パイプラインの司令塔 |
| `backend/app/services/rss.py` | RSS 取得 |
| `backend/app/services/ai.py` | 要約・重要度 |
| `backend/app/services/supabase_writer.py` | articles への書き込み |

## 次にやること（実装フェーズ）

1. ~~`rss.py` で feedparser + httpx を実装する~~ ✅  
2. ~~`supabase_writer.py` で重複チェックと INSERT を実装する~~ ✅  
3. ~~`ai.py` で LLM 要約・重要度を実装する~~ ✅  
4. ~~（任意）フロントに「今すぐ取得」ボタンを付けて `/jobs/curate` を呼ぶ~~ ✅  
5. （任意）OS のタスクスケジューラや GitHub Actions で定期実行する  
6. （任意）`topics` に `feed_url` 列を追加し、ブラウザの localStorage メモから卒業する  
