"""Deleting an event, with a grace period to undo it (decision of 17/10/2026).

"Excluir evento" takes the event out of the public area at once and erases its face vectors at once
(sensitive data, no reason to wait — LGPD Art. 6, III). The photos wait for the grace period (a
parameter, 7 days by default): an event created by mistake can still be restored, and is then
re-indexed. When the period ends the collection is eliminated and the event row removed; the audit
log keeps the record.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-17
"""
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE events ADD COLUMN deletion_requested_at timestamptz;
        ALTER TABLE events ADD COLUMN deletion_due_at timestamptz;
        ALTER TABLE events ADD COLUMN deletion_requested_by uuid REFERENCES accounts(id) ON DELETE SET NULL;
        ALTER TABLE events ADD CONSTRAINT ck_deletion_dates
            CHECK ((deletion_requested_at IS NULL) = (deletion_due_at IS NULL));
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE events DROP CONSTRAINT ck_deletion_dates;
        ALTER TABLE events DROP COLUMN deletion_requested_by;
        ALTER TABLE events DROP COLUMN deletion_due_at;
        ALTER TABLE events DROP COLUMN deletion_requested_at;
    """)
