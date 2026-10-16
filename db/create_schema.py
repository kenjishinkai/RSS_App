"""DATABASE_URL を使ってテーブルを作成する簡易スクリプト。

正規の手順は Terraform（DB/ユーザー）→ Alembic（テーブル）です。

  alembic -c db/alembic.ini upgrade head

使い方（プロジェクトルートで・簡易用）:
  set DATABASE_URL=postgresql+psycopg://newsdesk:***@127.0.0.1:5432/newsdesk
  python -m db.create_schema
"""

from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine

from db.base import Base
from db import models  # noqa: F401  — メタデータへモデルを登録


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print(
            "DATABASE_URL が未設定です。"
            " ローカルなら terraform で DB を作ったあと、"
            " postgresql+psycopg://newsdesk:***@127.0.0.1:5432/newsdesk を設定してください。"
            " テーブル作成の正規手順は: alembic -c db/alembic.ini upgrade head",
            file=sys.stderr,
        )
        return 1

    print(
        "注意: create_schema は簡易用です。通常は Alembic を使ってください。",
        file=sys.stderr,
    )
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    print("テーブルを作成しました（topics / articles）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
