"""Public area: consent records, anonymous visitor sessions and removal requests.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-03
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    -- RF015 note 7: proof that the notice was shown and accepted — occurrence, date/time, event
    -- and text version ONLY. No link to the selfie, to the visitor or to their device.
    CREATE TABLE consent_records (
        id            bigserial PRIMARY KEY,
        event_id      uuid REFERENCES events(id) ON DELETE SET NULL,
        text_version  varchar(20) NOT NULL,
        accepted_at   timestamptz NOT NULL DEFAULT now()
    );

    -- Anonymous session of a visitor in ONE event: holds the consent and the ids of the images
    -- the last search found. The image routes only serve ids listed here (RF014 note 6,
    -- RF016 note 7, RF019 note 1). Random token, stored hashed; no IP, no device data.
    CREATE TABLE visitor_sessions (
        token_hash    char(64) PRIMARY KEY,
        event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        consent_id    bigint NOT NULL REFERENCES consent_records(id),
        created_at    timestamptz NOT NULL DEFAULT now(),
        expires_at    timestamptz NOT NULL,
        searches      smallint NOT NULL DEFAULT 0,
        result_ids    uuid[] NOT NULL DEFAULT '{}'
    );
    CREATE INDEX ix_visitor_sessions_expires ON visitor_sessions (expires_at);

    -- RF023: removal requested by anyone portrayed. The image leaves the searches at once and
    -- is deleted within 72 h. The contact e-mail is erased when the request is concluded
    -- (note 3); the record itself stays, without the file, for audit (note 8).
    CREATE TYPE removal_status AS ENUM ('received', 'deleted_by_photographer', 'deleted_automatically');
    CREATE TABLE removal_requests (
        id            uuid PRIMARY KEY,
        image_id      uuid REFERENCES images(id) ON DELETE SET NULL,
        event_id      uuid REFERENCES events(id) ON DELETE SET NULL,
        reason        varchar(500),
        contact_email varchar(120),
        status        removal_status NOT NULL DEFAULT 'received',
        created_at    timestamptz NOT NULL DEFAULT now(),
        deadline_at   timestamptz NOT NULL,
        concluded_at  timestamptz
    );
    CREATE INDEX ix_removal_requests_open ON removal_requests (deadline_at) WHERE status = 'received';
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS removal_requests, visitor_sessions, consent_records;
    DROP TYPE IF EXISTS removal_status;
    """)
