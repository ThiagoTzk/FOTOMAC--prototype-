"""Guided recording in the quality test: which movement was asked at each frame, and whether the
head really made it ("prova de pessoa viva") — a diagnostic now, the gate of the visitor's video
search in version 2.0.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-16
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE recognition_tests ADD COLUMN query_liveness jsonb")  # steps asked, movement measured, passed


def downgrade() -> None:
    op.execute("ALTER TABLE recognition_tests DROP COLUMN query_liveness")
