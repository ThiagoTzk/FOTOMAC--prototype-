"""Themes created from the event form: who created each theme (its owner).

Photographers now create themes (tags) themselves, while filling in an event, instead of asking
the administrator beforehand (decision after the 1st committee: "the tags are the photographer's").
The owner is the basis of "each tag is edited by its owner; the administrator may edit all" (2.0).
Existing themes keep no owner (created by the administrator).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-16
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE themes ADD COLUMN created_by uuid REFERENCES accounts(id) ON DELETE SET NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE themes DROP COLUMN created_by")
