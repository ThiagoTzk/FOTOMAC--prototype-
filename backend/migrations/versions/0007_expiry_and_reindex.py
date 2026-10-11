"""Event expiry notice (RF006 note 5) and the re-indexing queue (RF028).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-04
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    -- When the "your event expires on ..." e-mail went out (at least 30 days before). Cleared when
    -- the expiry date changes, so the photographers are warned again about the new date.
    ALTER TABLE events ADD COLUMN expiry_notice_sent_at timestamptz;

    -- RF028: re-indexing runs in its OWN queue (note 2), apart from the publication queue.
    CREATE TYPE reindex_scope AS ENUM ('event', 'model_version', 'all');
    CREATE TABLE reindex_jobs (
        id            uuid PRIMARY KEY,
        scope         reindex_scope NOT NULL,
        event_id      uuid REFERENCES events(id) ON DELETE SET NULL,
        from_version  varchar(60),
        to_version    varchar(60) NOT NULL,
        requested_by  uuid REFERENCES accounts(id) ON DELETE SET NULL,  -- the audit log keeps who
        created_at    timestamptz NOT NULL DEFAULT now(),
        finished_at   timestamptz,
        total         integer NOT NULL
    );
    CREATE TABLE reindex_items (
        job_id    uuid NOT NULL REFERENCES reindex_jobs(id) ON DELETE CASCADE,
        image_id  uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        status    varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
        attempts  smallint NOT NULL DEFAULT 0,
        PRIMARY KEY (job_id, image_id)
    );
    CREATE INDEX ix_reindex_items_pending ON reindex_items (image_id) WHERE status = 'pending';
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS reindex_items, reindex_jobs;
    DROP TYPE IF EXISTS reindex_scope;
    ALTER TABLE events DROP COLUMN IF EXISTS expiry_notice_sent_at;
    """)
