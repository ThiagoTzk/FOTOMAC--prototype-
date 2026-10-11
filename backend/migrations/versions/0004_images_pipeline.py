"""Image pipeline: credit per image, derived previews, indexing queue control, packages.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-03
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    -- RF007 note 7: the credit is fixed per image AT UPLOAD; a later signature change does not
    -- rewrite the authorship of photos already sent.
    ALTER TABLE images ADD COLUMN credit_signature varchar(80) NOT NULL DEFAULT '';
    ALTER TABLE images ALTER COLUMN credit_signature DROP DEFAULT;

    -- Reduced copies for the screens (RF018 note 2, RNF06). The original is never recompressed.
    ALTER TABLE images ADD COLUMN thumb_key text, ADD COLUMN preview_key text;

    -- Indexing queue control (RF010 notes 7 and 8, RF011 note 5).
    ALTER TABLE images
        ADD COLUMN next_attempt_at timestamptz,
        ADD COLUMN indexed_at timestamptz,
        ADD COLUMN indexing_model_version varchar(80),
        ADD COLUMN last_error varchar(200),
        ADD COLUMN reprocess_requests smallint NOT NULL DEFAULT 0,
        ADD COLUMN reprocess_window_start timestamptz;

    -- Full-collection download packages (RF012), generated in the background.
    CREATE TYPE package_status AS ENUM ('pending', 'running', 'ready', 'failed', 'expired');
    CREATE TABLE package_jobs (
        id           uuid PRIMARY KEY,
        event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        only_own     boolean NOT NULL,            -- collaborator package (RF012 note 7)
        status       package_status NOT NULL DEFAULT 'pending',
        file_name    varchar(220) NOT NULL,
        object_key   text,
        image_count  integer NOT NULL DEFAULT 0,
        size_bytes   bigint NOT NULL DEFAULT 0,
        progress     smallint NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now(),
        finished_at  timestamptz,
        expires_at   timestamptz
    );
    CREATE INDEX ix_package_jobs_pending ON package_jobs (status) WHERE status IN ('pending', 'ready');
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS package_jobs;
    DROP TYPE IF EXISTS package_status;
    ALTER TABLE images DROP COLUMN credit_signature, DROP COLUMN thumb_key, DROP COLUMN preview_key,
        DROP COLUMN next_attempt_at, DROP COLUMN indexed_at, DROP COLUMN indexing_model_version,
        DROP COLUMN last_error, DROP COLUMN reprocess_requests, DROP COLUMN reprocess_window_start;
    """)
