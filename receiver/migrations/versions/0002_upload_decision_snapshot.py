"""persist upload placement decision

Revision ID: 0002
Revises: 0001
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("uploads") as batch:
        batch.add_column(sa.Column("requested_target_id", sa.String(64), nullable=True))
        batch.add_column(sa.Column("resolved_filename", sa.String(512), nullable=True))
        batch.add_column(sa.Column("conflict_policy", sa.String(16), nullable=True))
        batch.add_column(sa.Column("decision_fingerprint", sa.String(64), nullable=True))
        batch.create_index("ix_uploads_decision_fingerprint", ["decision_fingerprint"])


def downgrade() -> None:
    with op.batch_alter_table("uploads") as batch:
        batch.drop_index("ix_uploads_decision_fingerprint")
        batch.drop_column("decision_fingerprint")
        batch.drop_column("conflict_policy")
        batch.drop_column("resolved_filename")
        batch.drop_column("requested_target_id")
