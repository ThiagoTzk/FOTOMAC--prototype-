"""Guided capture in the public search (requirements v2.0, RF036): the server draws the order of
the head movements and keeps it in the visitor session until the search uses it.

Why the server and not the browser: if the page drew the order, whoever wanted to fool the liveness
check could pick the order that matches a video recorded beforehand. Drawn here, used once and valid
for a couple of minutes, the order is unknown until the capture starts.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-17
"""
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE visitor_sessions ADD COLUMN capture_order jsonb;
        ALTER TABLE visitor_sessions ADD COLUMN capture_issued_at timestamptz;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE visitor_sessions DROP COLUMN capture_issued_at;
        ALTER TABLE visitor_sessions DROP COLUMN capture_order;
    """)
