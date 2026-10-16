# ニュースデスク 仕様書（現行ソース準拠）

この文書は、**いまリポジトリに実装されている動き**をまとめた製品仕様のマスターです。

---

## 1. 概要

**ニュースデスク**は、トピック（話題の箱）ごとに RSS（ニュース配信の一覧）から記事を集め、要約と重要度を付けて読むアプリです。

| 役割 | 担当 | 補足 |
|------|------|------|
| 画面・トピック追加・既読 | `frontend/`（Next.js） | ブラウザで見える部分。DB には直接つながない |
| RSS 取得・AI 要約・DB 読み書き | `backend/`（FastAPI） | 裏方。ローカル PostgreSQL に接続 |
| データの保管 | PostgreSQL（DB 名 `newsdesk`） | 表（テーブル）に保存する倉庫 |

```text
Google News RSS → backend（rss → 最新1件 → 重複除外 → ai → article_store）→ PostgreSQL newsdesk
frontend → backend REST API → PostgreSQL newsdesk
```

---

## 2. できること / できないこと

### できること（実装済み）

- ユーザー登録・ログイン・ログアウト（JWT を httpOnly Cookie に保存）
- 未ログイン時はログイン画面へ誘導（トピック／記事／取得 API はログイン必須）
- トピックの一覧表示・追加・名前編集・削除（記事が残っているトピックは削除不可）
- トピックごとの記事一覧（公開日時の新しい順）
- 未読のみ表示 / 既読も含めて表示の切替
- 記事を既読にする
- 記事をお気に入り登録／解除（全員共有のフラグ）
- 記事を削除する（全員共有。誰かが消すと全員の一覧から消える）
- 「今すぐ取得」で Google News（日本向け）から、選択中トピック名の**最新記事 1 件**を取得（重複除外 → AI 要約 → DB 書き込み）
- AI キー未設定・失敗時のフォールバック（短い要約と `importance=low`）

**データの共有:** ログインは「門番」だけです。トピックや記事に「誰のものか」は付けていません。ログインした人は**全員が同じトピック・記事・お気に入り**を見ます（共有ホワイトボードのようなイメージ）。

### できないこと（未実装）

- ユーザーごとのデータ分離（個人用のトピック／記事／お気に入り）
- 定期自動取得（cron など）
- 任意の RSS URL を指定して取得すること（取得元は Google News 固定）
- 記事全文のクロール（RSS に載っている情報を使う）

---

## 3. 構成

```text
RSS_App/
  frontend/   … 画面（Next.js）。backend API 経由で表示・操作
  backend/    … 収集・要約・DB API（FastAPI → PostgreSQL newsdesk）
  db/         … DB スキーマ定義（SQLAlchemy）と Alembic
  terraform/  … ローカル PostgreSQL の DB / ユーザー作成
  spec.md     … 本仕様書（マスター）
```

| パス | 役割 |
|------|------|
| `db/models.py` | DB スキーマ定義の正（users / topics / articles） |
| `db/alembic/` | テーブル作成・変更のマイグレーション |
| `terraform/` | ローカル PostgreSQL の DB・ロール作成 |
| `frontend/app/page.tsx` | 画面本体（ログイン後） |
| `frontend/app/login/page.tsx` | ログイン画面 |
| `frontend/app/register/page.tsx` | 新規登録画面 |
| `frontend/lib/types.ts` | Topic / Article 型と重要度ヘルパ（`toImportanceLevel` 等） |
| `frontend/lib/auth.ts` | 登録／ログイン／ログアウト／`/auth/me` |
| `frontend/lib/backend.ts` | backend REST（topics / articles / curate）。Cookie 付き |
| `frontend/lib/logging.ts` | フロントの開始／終了／例外ログ（`withLog`） |
| `frontend/app/api/logs/route.ts` | フロントログを `Logs/frontend_*.log` に書く受け口 |
| `backend/app/main.py` | FastAPI 入口・`GET /health` |
| `backend/app/config.py` | 環境変数（`DATABASE_URL`・`JWT_SECRET` 等） |
| `backend/app/auth.py` | JWT Cookie・パスワードハッシュ・`get_current_user` |
| `backend/app/db.py` | SQLAlchemy セッション |
| `backend/app/schemas.py` | API レスポンス用スキーマ |
| `backend/app/routers/auth.py` | `POST /auth/register`・`/login`・`/logout`・`GET /auth/me` |
| `backend/app/routers/topics.py` | `GET/POST/PATCH/DELETE /topics`（ログイン必須） |
| `backend/app/routers/articles.py` | `GET /articles`・既読・お気に入り・削除（ログイン必須） |
| `backend/app/routers/jobs.py` | `POST /jobs/curate`（ログイン必須） |
| `backend/app/services/curate.py` | パイプラインの司令塔 |
| `backend/app/services/rss.py` | RSS 取得 |
| `backend/app/services/ai.py` | 要約・重要度 |
| `backend/app/services/article_store.py` | articles の照会・INSERT |

画面のデータ操作（トピック・記事）は backend API 経由です。  
ログ書き込みだけ、Next.js の API Route（`POST /api/logs`）を使います。

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
| 一覧 | `GET /topics`（`created_at` 昇順） |
| 選択 | そのトピックの記事を読み込む |
| 追加 | 名前を入力して `POST /topics`。追加後にそのトピックを選択 |
| 編集 | 選択中トピックの名前を `PATCH /topics/{id}` で更新 |
| 削除 | `DELETE /topics/{id}`。**記事が1件でもあると 409 で拒否**（空の箱だけ捨てられる） |

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
| 取得 | `GET /articles?topic_id=`（`published_at` 降順） |
| 既定表示 | 未読のみ（画面側で `is_read = false` を絞り込み） |
| 切替 | 「既読を表示」で全件、「既読を隠す」で未読のみに戻す |
| 表示内容 | タイトル、要約、重要度（高/中/低）、公開日時、元記事リンク、お気に入り状態 |
| 既読 | `PATCH /articles/{id}/read` |
| お気に入り | `PATCH /articles/{id}/favorite` で登録、`DELETE /articles/{id}/favorite` で解除（全員共有） |
| 削除 | `DELETE /articles/{id}`（確認ダイアログあり。全員の一覧から消える） |

未読／既読の切替は DB クエリではなく、取得済み一覧を画面側でフィルタします。  
重要度の表示は `high` / `medium` / `low`（および日本語の高・中、英語の `mid`→medium）を受け付けます。  
お気に入りは `articles.is_favorite`（共有）。誰かが付けると全員の画面に星が付きます。

---

## 5. データ仕様

**実行時**は backend がローカル PostgreSQL（データベース `newsdesk`）へ SQLAlchemy で接続します。  
フロントは DB パスワードを持たず、REST API のみを呼びます。  
**DB 箱づくり**は Terraform、**テーブル作成**は Alembic です。

| 役割 | 正となる定義 / 手順 |
|------|---------------------|
| DB スキーマ（テーブル・列・制約） | [`db/models.py`](db/models.py)（SQLAlchemy） |
| クライアント型（TypeScript） | [`frontend/lib/types.ts`](frontend/lib/types.ts)（Topic / Article と重要度ヘルパ） |
| ローカル DB・ユーザー作成 | [`terraform/`](terraform/)（`terraform apply`） |
| テーブル適用 | `alembic -c db/alembic.ini upgrade head`（要 `DATABASE_URL`） |

テーブルは `public.users` / `public.topics` / `public.articles`。`feed_url` 列は無い（取得元 URL は backend が Google News から組み立てる）。

| テーブル | 役割 |
|----------|------|
| `users` | ログイン用（email / password_hash）。topics・articles とは紐づけない |
| `topics` | 話題の箱（全員共有） |
| `articles` | 記事（全員共有）。`is_read` / `is_favorite` 含む |

自動テストは別 DB `newsdesk_test`（同じスキーマ）を使う。

### 5.1 誰が読む・書くか

| 操作 | 担当 |
|------|------|
| 登録・ログイン・ログアウト | frontend → `/auth/*` → PostgreSQL（users） |
| topics の読・追加・編集・削除、articles の読・既読・お気に入り・削除 | frontend → backend REST（要ログイン）→ PostgreSQL |
| articles の新規 INSERT、既存 URL 照会 | backend（キュレーション、要ログイン）→ PostgreSQL |

接続文字列は `backend/.env` の `DATABASE_URL` のみ（ブラウザには出さない）。  
セッションは JWT を Cookie（名前 `newsdesk_token`、httpOnly）に載せます。

---

## 6. API 仕様

バックエンド（既定: `http://localhost:8000`）のみ。OpenAPI は `/docs` で確認できます。

### 6.1 `GET /health`

生存確認と設定の有無を返します。

```json
{
  "status": "ok",
  "database_configured": true,
  "gemini_configured": true,
  "gemini_model": "gemini-2.0-flash"
}
```

### 6.2 認証 API

| メソッド | パス | 用途 |
|----------|------|------|
| POST | `/auth/register` | 新規登録（成功時 Cookie をセット） |
| POST | `/auth/login` | ログイン（成功時 Cookie をセット） |
| POST | `/auth/logout` | ログアウト（Cookie 削除） |
| GET | `/auth/me` | いまログイン中のユーザー |

主なエラー:

| 状況 | HTTP |
|------|------|
| メール形式不正・パスワード短すぎ | 422 |
| ログイン失敗 | 401 |
| メール重複 | 409 |
| 未ログインで `/auth/me` | 401 |

### 6.3 データ API（いずれもログイン必須。Cookie が無いと 401）

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/topics` | トピック一覧（共有データ） |
| POST | `/topics` | トピック追加（`{ "name": "..." }`） |
| PATCH | `/topics/{id}` | トピック名を更新（`{ "name": "..." }`） |
| DELETE | `/topics/{id}` | トピック削除（記事があると 409） |
| GET | `/articles?topic_id=` | トピック別記事一覧（`published_at` 降順、null は末尾） |
| PATCH | `/articles/{id}/read` | 既読にする（成功時は更新後の記事を返す） |
| PATCH | `/articles/{id}/favorite` | お気に入りにする |
| DELETE | `/articles/{id}/favorite` | お気に入りを解除 |
| DELETE | `/articles/{id}` | 記事を削除 |

主なエラー:

| 状況 | HTTP |
|------|------|
| 未ログイン | 401 |
| トピック名が空、`topic_id` が不正な UUID | 422 |
| トピック／記事が無い | 404 |
| 記事があるトピックを削除しようとした | 409 |
| DB 未設定や書き込み失敗 | 502（または未設定時は依存解決で失敗） |

### 6.4 `POST /jobs/curate`（ログイン必須）

選択トピック名で Google News（日本）を検索し、最新 1 件を取り込んで手動実行します。

**リクエスト**

```json
{
  "topic_id": "トピックのUUID",
  "topic_name": "人工知能"
}
```

`topic_id` / `topic_name` が空文字のときは検証エラー（通常 422）です。

内部で使う RSS URL の形（参考）。`topic_name` は URL エンコードして埋めます:

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

**成功だが書き込み 0 件になる例**

- 同じ最新記事の URL が既に DB にある → `inserted=0`（HTTP 200）
- `DATABASE_URL` が空 → 例外にせず `inserted=0`（HTTP 200）

**失敗**

- RSS 取得失敗、または DB 設定済みでの書き込み例外 → HTTP **502**（`detail` に理由）
- リクエスト形式不正 → FastAPI の検証エラー（通常 422）

CORS は `CORS_ORIGINS`（既定 `http://localhost:3000`）で許可します。

---

## 7. 処理の流れ（キュレーション）

入口: `POST /jobs/curate` → `run_curation`（`backend/app/services/curate.py`）

```text
1. topic_name から Google News（日本）RSS URL を組み立てる
2. rss.fetch_feed_items(...)               … RSS を取得・パース
3. 公開日時が最も新しい 1 件だけ残す
4. article_store.list_existing_urls(...)   … 同一トピックの既存 URL を取得
5. 既存 URL ならスキップ、新規なら続行
6. ai.enrich_article(...)                  … 要約・重要度を付与
7. article_store.insert_articles(...)      … articles に INSERT
```

AI（`GEMINI_API_KEY`）が無い、または呼び出しに失敗した場合でも、取得と書き込みは続行します（フォールバック要約、`importance=low`）。  
要約には Google Gemini を使い、認証は API キーのみ（OAuth ログインは不要）です。

---

## 8. 環境変数と起動

### 8.1 環境変数

| 置き場 | 変数 | 意味 |
|--------|------|------|
| `frontend/.env.local` | `NEXT_PUBLIC_BACKEND_URL` | バックエンド URL（省略時 `http://localhost:8000`） |
| `backend/.env` | `DATABASE_URL` | ローカル PostgreSQL（例: `postgresql+psycopg://newsdesk:***@127.0.0.1:5432/newsdesk`） |
| `backend/.env` | `GEMINI_API_KEY` | Gemini API キー（未設定でも取得・書き込みは動く） |
| `backend/.env` | `GEMINI_MODEL` | 省略可（既定 `gemini-2.0-flash`） |
| `backend/.env` | `CORS_ORIGINS` | 許可するフロント起源（既定 `http://localhost:3000`）。Cookie 利用のため credentials 対応が必要 |
| `backend/.env` | `JWT_SECRET` | ログイン用 JWT の署名鍵（長いランダム文字列） |
| `backend/.env` | `JWT_EXPIRE_MINUTES` | 省略可（既定 `10080` = 7 日） |
| （pytest / E2E） | `TEST_DATABASE_URL` | テスト専用 DB（未設定時は `.../newsdesk_test`） |

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

### 8.3 自動テスト

テスト用 DB は Terraform の `newsdesk_test`（アプリ用 `newsdesk` とは別）。たとえ: 本番の倉庫と練習用倉庫を分ける。

| 層 | ツール | 実行 |
|----|--------|------|
| API | pytest（`backend/tests/`） | `cd backend` → `pip install -r requirements-dev.txt` → `pytest` |
| フロント関数 | Vitest（`frontend/lib/*.test.ts`） | `cd frontend` → `npm test` |
| ブラウザ E2E | Playwright（`frontend/e2e/`） | テスト DB で uvicorn 起動後 → `cd frontend` → `npm run test:e2e` |

E2E の backend 起動例:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://newsdesk:***@127.0.0.1:5432/newsdesk_test"
$env:JWT_SECRET = "test-jwt-secret-for-e2e-only"
$env:CORS_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

詳細手順は [README.md](README.md) の「自動テスト」を参照。

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
| `routers/auth.py` | `register`, `login`, `logout`, `me` |
| `routers/topics.py` | `list_topics`, `create_topic`, `update_topic`, `delete_topic` |
| `routers/articles.py` | `list_articles`, `mark_article_read`, `mark_article_favorite`, `unmark_article_favorite`, `delete_article` |
| `routers/jobs.py` | `curate_now` |
| `services/curate.py` | `run_curation`, `build_google_news_feed_url`, `pick_latest_item` |
| `services/rss.py` | `fetch_feed_items` |
| `services/ai.py` | `enrich_article`, `_enrich_with_gemini` |
| `services/article_store.py` | `list_existing_urls`, `insert_articles` |

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
| `lib/auth.ts` | `fetchMe`, `registerUser`, `loginUser`, `logoutUser` |
| `lib/backend.ts` | `fetchTopics`, `createTopic`, `updateTopic`, `deleteTopic`, `fetchArticles`, `markArticleRead`, `markArticleFavorite`, `unmarkArticleFavorite`, `deleteArticle`, `runCurateJob` |
| `app/page.tsx` | `checkAuthAndLoadTopics`, `loadArticles`, `handleAddTopic`, `handleUpdateTopic`, `handleDeleteTopic`, `handleMarkAsRead`, `handleToggleFavorite`, `handleDeleteArticle`, `handleCurateNow`, `handleLogout` |
| `app/login/page.tsx` | `handleLogin` |
| `app/register/page.tsx` | `handleRegister` |

---

## 10. 既知の制限

- 取得元は Google News（日本）固定。任意の RSS サイトは指定できない
- 1 回の取得で取り込むのは最新 1 件のみ。同じ最新記事が既にあると書き込み 0 件
- ログインは門番のみ。ユーザーごとのトピック／記事／お気に入りの分離はしない（共有データ）
- 記事が残っているトピックは削除できない（先に各記事を `DELETE /articles/{id}` で空にしてからトピックを削除する）
- AI 未設定時は要約品質が下がる（タイトルや RSS 説明の切り出し相当）
- 定期取得は手動の「今すぐ取得」か、外部スケジューラで API を叩く必要がある
- DB はローカル PostgreSQL（`newsdesk`）。箱は Terraform、テーブルは Alembic（`db/models.py` が正）

---

## 11. 関連ドキュメント

| 文書 | 内容 |
|------|------|
| [README.md](README.md) | 起動方法・環境変数の案内 |
| [spec.md](spec.md) | 製品仕様のマスター（本ファイル） |
