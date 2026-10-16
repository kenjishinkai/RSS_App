"""add articles.is_favorite

Revision ID: 20261016_0003
Revises: 20261016_0002
Create Date: 2026-10-16

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261016_0003"
down_revision: Union[str, Sequence[str], None] = "20261016_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column(
            "is_favorite",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("articles", "is_favorite")
