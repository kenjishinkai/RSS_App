# ニュースデスク 仕様書（現行ソース準拠）

この文書は、**いまリポジトリに実装されている動き**だけをまとめた製品仕様です。  
設計の詳細は [`docs/`](docs/) を参照してください。

---

## 1. 概要

**ニュースデスク**は、トピック（話題の箱）ごとに RSS（ニュース配信の一覧）から記事を集め、要約と重要度を付けて読むアプリです。

| 役割 | 担当 | 補足 |
|------|------|------|
| 画面・トピック追加・既読 | `frontend/`（Next.js） | ブラウザで見える部分 |
| RSS 取得・AI 要約・記事の書き込み | `backend/`（FastAPI） | 裏方の処理 |
| データの保管 | Supabase（PostgreSQL） | 表（テーブル）に保存する倉庫 |

```text
Google News RSS → backend（rss → 最新1件 → ai → supabase_writer）→ Supabase ← frontend ← ブラウザ
```

---

## 2. できること / できないこと

### できること（実装済み）

- トピックの一覧表示・追加
- トピックごとの記事一覧（公開日時の新しい順）
- 未読のみ表示 / 既読も含めて表示の切替
- 記事を既読にする
- 「今すぐ取得」で Google News（日本向け）から、選択中トピック名の**最新記事 1 件**を取得（重複除外 → AI 要約 → DB 書き込み）
- AI キー未設定・失敗時のフォールバック（短い要約と `importance=low`）

### できないこと（未実装）

- ログイン / 認証
- 定期自動取得（cron など）
- トピックの編集・削除 UI
- 任意の RSS URL を指定して取得すること（取得元は Google News 固定）
- 記事全文のクロール（RSS に載っている情報を使う）

---

## 3. 構成

```text
RSS_App/
  frontend/   … 画面（Next.js）。Supabase を読んで表示する
  backend/    … 収集・要約（FastAPI）。RSS を取り、記事を Supabase に書く
  docs/       … 基本・詳細・プログラム設計書
  spec.md     … 本仕様書（現状の製品仕様）
```

| パス | 役割 |
|------|------|
| `frontend/app/page.tsx` | 画面本体（1 ページ） |
| `frontend/lib/supabase/` | Supabase クライアントと型 |
| `frontend/lib/backend.ts` | `POST /jobs/curate` の呼び出し |
| `frontend/lib/logging.ts` | フロントの開始／終了／例外ログ（`withLog`） |
| `frontend/app/api/logs/route.ts` | フロントログを `Logs/frontend_*.log` に書く受け口 |
| `backend/app/main.py` | FastAPI 入口・`GET /health` |
| `backend/app/routers/jobs.py` | `POST /jobs/curate` |
| `backend/app/services/curate.py` | パイプラインの司令塔 |
| `backend/app/services/rss.py` | RSS 取得 |
| `backend/app/services/ai.py` | 要約・重要度 |
| `backend/app/services/supabase_writer.py` | articles への書き込み |

フロント側に Next.js の API Route はありません。画面のデータ操作は Supabase 直アクセスです。

---

## 4. 画面仕様

画面は `frontend/app/page.tsx` の 1 画面です。

### 4.1 レイアウト

- ヘッダー: アプリ名「ニュースデスク」
- 左（または上）: トピック一覧と新規追加
- 右（または下）: 「今すぐ取得」・記事一覧

### 4.2 トピック

| 操作 | 動き |
|------|------|
| 一覧 | Supabase `topics` を `created_at` 昇順で取得 |
| 選択 | そのトピックの記事を読み込む |
| 追加 | 名前を入力して `topics` に INSERT。追加後にそのトピックを選択 |

トピックの編集・削除 UI はありません。

### 4.3 「今すぐ取得」

| 項目 | 内容 |
|------|------|
| 取得元 | Google News RSS（日本向け固定） |
| 検索語 | 選択中トピックの `name` |
| 件数 | フィード内で公開日時が最も新しい **1 件** |
| API | `topic_id` と `topic_name` を `POST /jobs/curate` に送る。成功後に記事一覧を再読込 |

トピック未選択時は取得できません。バックエンド未起動時はエラーメッセージを表示します。  
同じ最新記事が既に DB にある場合は書き込み 0 件になります。

### 4.4 記事一覧

| 項目 | 内容 |
|------|------|
| 取得 | 選択中 `topic_id` の `articles` を `published_at` 降順 |
| 既定表示 | 未読のみ（`is_read = false`） |
| 切替 | 「既読も表示」で全件 |
| 表示内容 | タイトル、要約、重要度（高/中/低）、公開日時、元記事リンク |
| 既読 | `articles.is_read = true` に UPDATE |

重要度の表示は `high` / `medium` / `low`（および日本語の高・中）を受け付けます。

---

## 5. データ仕様

実体は Supabase（PostgreSQL）です。型の正は [`frontend/lib/supabase/types.ts`](frontend/lib/supabase/types.ts) です。

### 5.1 `topics`

| 列 | 型（想定） | 説明 |
|----|------------|------|
| `id` | UUID（string） | 主キー |
| `name` | string | トピック名 |
| `created_at` | timestamptz（string） | 作成日時 |

`feed_url` 列はありません。取得元 URL は backend が Google News から組み立てます。

### 5.2 `articles`

| 列 | 型（想定） | 説明 |
|----|------------|------|
| `id` | UUID（string） | 主キー |
| `topic_id` | string | 所属トピック |
| `title` | string | タイトル |
| `url` | string | 元記事 URL（トピック内の重複判定に使う） |
| `summary` | string \| null | 要約 |
| `importance` | string \| null | `high` / `medium` / `low` など |
| `is_read` | boolean | 既読フラグ |
| `published_at` | string \| null | 公開日時 |

### 5.3 誰が読む・書くか

| 操作 | 担当 | 鍵の種類 |
|------|------|----------|
| topics 読・書、articles 読・既読更新 | frontend | anon（公開してよい入場券） |
| articles の新規 INSERT、既存 URL 照会 | backend | service_role（秘密のマスターキー。ブラウザに出さない） |

開発時は Supabase の RLS（行単位のアクセス制限）で、上記操作が通るように設定する必要があります。

---

## 6. API 仕様

バックエンド（既定: `http://localhost:8000`）のみ。OpenAPI は `/docs` で確認できます。

### 6.1 `GET /health`

生存確認と設定の有無を返します。

```json
{
  "status": "ok",
  "supabase_configured": true,
  "gemini_configured": true,
  "gemini_model": "gemini-2.0-flash"
}
```

### 6.2 `POST /jobs/curate`

選択トピック名で Google News（日本）を検索し、最新 1 件を取り込んで手動実行します。

**リクエスト**

```json
{
  "topic_id": "トピックのUUID",
  "topic_name": "人工知能"
}
```

`topic_id` / `topic_name` が空文字のときは検証エラー（通常 422）です。

内部で使う RSS URL の形（参考）:

```text
https://news.google.com/rss/search?q={topic_name}&hl=ja&gl=JP&ceid=JP:ja
```

**成功レスポンス**

```json
{
  "fetched": 1,
  "new_items": 1,
  "inserted": 1,
  "message": "Google News から最新 1 件を選び、新規 1 件、書き込み 1 件です。AI 要約 1 件。"
}
```

| フィールド | 意味 |
|------------|------|
| `fetched` | 最新候補として選んだ件数（最大 1） |
| `new_items` | DB にまだ無い URL の件数（0 または 1） |
| `inserted` | 実際に書き込んだ件数（0 または 1） |
| `message` | 人向けの結果説明 |

**失敗**

- RSS 取得失敗、Supabase 書き込み失敗 → HTTP **502**（`detail` に理由）
- リクエスト形式不正 → FastAPI の検証エラー（通常 422）

CORS は `CORS_ORIGINS`（既定 `http://localhost:3000`）で許可します。

---

## 7. 処理の流れ（キュレーション）

入口: `POST /jobs/curate` → `run_curation`（`backend/app/services/curate.py`）

```text
1. topic_name から Google News（日本）RSS URL を組み立てる
2. rss.fetch_feed_items(...)               … RSS を取得・パース
3. 公開日時が最も新しい 1 件だけ残す
4. supabase_writer.list_existing_urls(...) … 同一トピックの既存 URL を取得
5. 既存 URL ならスキップ、新規なら続行
6. ai.enrich_article(...)                  … 要約・重要度を付与
7. supabase_writer.insert_articles(...)    … articles に INSERT
```

AI（`GEMINI_API_KEY`）が無い、または呼び出しに失敗した場合でも、取得と書き込みは続行します（フォールバック要約、`importance=low`）。  
要約には Google Gemini を使い、認証は API キーのみ（OAuth ログインは不要）です。

---

## 8. 環境変数と起動

### 8.1 環境変数

| 置き場 | 変数 | 意味 |
|--------|------|------|
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの URL |
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開してよい入場券（anon） |
| `frontend/.env.local` | `NEXT_PUBLIC_BACKEND_URL` | バックエンド URL（省略時 `http://localhost:8000`） |
| `backend/.env` | `SUPABASE_URL` | 同じ Supabase URL |
| `backend/.env` | `SUPABASE_SERVICE_ROLE_KEY` | 秘密のマスターキー（ブラウザに出さない） |
| `backend/.env` | `GEMINI_API_KEY` | Gemini API キー（未設定でも取得・書き込みは動く） |
| `backend/.env` | `GEMINI_MODEL` | 省略可（既定 `gemini-2.0-flash`） |
| `backend/.env` | `CORS_ORIGINS` | 許可するフロント起源（既定 `http://localhost:3000`） |

テンプレート: [`frontend/.env.example`](frontend/.env.example)、[`backend/.env.example`](backend/.env.example)

### 8.2 起動

**フロント（画面）**

```powershell
cd frontend
npm install
npm run dev
```

→ http://localhost:3000

**バック（収集 API）**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

→ http://localhost:8000/health  
→ http://localhost:8000/docs

---

## 9. ログ仕様

backend / frontend とも、対象メソッドで **開始／終了／例外** を出し、アプリルートの `Logs/` に日付付きファイルへ書く。  
コンソールには出さない（ファイルのみ）。

### 9.1 共通ルール

| タイミング | レベル | メッセージの形 |
|------------|--------|----------------|
| 開始 | INFO | `開始: 関数名(引数…)` |
| 正常終了 | INFO | `終了: 関数名` |
| 例外 | ERROR | `例外: 関数名` ＋ 例外の内容（スタックトレース付き）。例外はそのまま再送出 |

- フォルダ: アプリルート直下の `Logs/`（無ければ作成）
- 日付は当日。日付が変わると新しいファイル名になる
- API キー／秘密鍵はログに出さない

### 9.2 backend

| 項目 | 内容 |
|------|------|
| ファイル名 | `backend_YYYY-MM-DD.log` |
| パス例 | `RSS_App/Logs/backend_2026-10-15.log` |
| 実装 | [`backend/app/logging_utils.py`](backend/app/logging_utils.py) の `@log_call` と `setup_logging()` |

対象メソッド:

| 場所 | 関数 |
|------|------|
| `main.py` | `health` |
| `routers/jobs.py` | `curate_now` |
| `services/curate.py` | `run_curation`, `build_google_news_feed_url`, `pick_latest_item` |
| `services/rss.py` | `fetch_feed_items` |
| `services/ai.py` | `enrich_article`, `_enrich_with_gemini` |
| `services/supabase_writer.py` | `get_client`, `list_existing_urls`, `insert_articles` |

小さな内部ヘルパー（例: `_clean_text`）は対象外。

### 9.3 frontend

ブラウザから直接ディスクには書けないため、Next.js の受け口経由でファイルに書く。

| 項目 | 内容 |
|------|------|
| ファイル名 | `frontend_YYYY-MM-DD.log` |
| パス例 | `RSS_App/Logs/frontend_2026-10-15.log` |
| 受け口 | `POST /api/logs`（[`frontend/app/api/logs/route.ts`](frontend/app/api/logs/route.ts)） |
| クライアント | [`frontend/lib/logging.ts`](frontend/lib/logging.ts) の `withLog` |

対象メソッド:

| 場所 | 関数 |
|------|------|
| `lib/backend.ts` | `runCurateJob` |
| `app/page.tsx` | `loadTopics`, `loadArticles`, `handleAddTopic`, `handleMarkAsRead`, `handleCurateNow` |

---

## 10. 既知の制限

- 取得元は Google News（日本）固定。任意の RSS サイトは指定できない
- 1 回の取得で取り込むのは最新 1 件のみ。同じ最新記事が既にあると書き込み 0 件
- 画面にログインがないため、RLS と鍵の扱いを誤るとデータが広く見える可能性がある
- AI 未設定時は要約品質が下がる（タイトルや RSS 説明の切り出し相当）
- 定期取得は手動の「今すぐ取得」か、外部スケジューラで API を叩く必要がある
- リポジトリ内に SQL マイグレーションは無い。テーブルは Supabase 側で用意する

---

## 11. 関連ドキュメント

| 文書 | 内容 |
|------|------|
| [README.md](README.md) | 起動方法・環境変数の案内 |
| [docs/基本設計書.md](docs/基本設計書.md) | 全体像・役割分担 |
| [docs/詳細設計書.md](docs/詳細設計書.md) | API・DB・画面状態の詳細 |
| [docs/プログラム設計書.md](docs/プログラム設計書.md) | プログラム設計書の索引 |
| [docs/プログラム設計書_バックエンド.md](docs/プログラム設計書_バックエンド.md) | バックエンド関数単位 |
| [docs/プログラム設計書_フロントエンド.md](docs/プログラム設計書_フロントエンド.md) | フロントエンド関数単位 |
