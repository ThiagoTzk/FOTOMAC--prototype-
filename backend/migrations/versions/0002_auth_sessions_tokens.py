"""Authentication: server-side sessions and single-use password links.

Only HASHES of tokens are stored: whoever reads the database (a backup, a leaked dump)
cannot reuse a session or a password link (LGPD Art. 46).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TYPE password_token_purpose AS ENUM ('activation', 'reset');

    -- RF002 note 8: a server-side row per session, so logout and password change can
    -- revoke it immediately (a self-contained token could not be revoked).
    -- No IP address or browser fingerprint is kept: not needed for the purpose (Art. 6, III).
    CREATE TABLE sessions (
        id          bigserial PRIMARY KEY,
        token_hash  char(64) NOT NULL UNIQUE,
        account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        revoked_at  timestamptz
    );
    CREATE INDEX ix_sessions_account ON sessions (account_id) WHERE revoked_at IS NULL;

    -- RF001 note 5 (activation, 24 h) and RF002 note 6 (reset, 30 min): single-use links.
    CREATE TABLE password_tokens (
        id          bigserial PRIMARY KEY,
        token_hash  char(64) NOT NULL UNIQUE,
        account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        purpose     password_token_purpose NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz
    );
    CREATE INDEX ix_password_tokens_account ON password_tokens (account_id, purpose) WHERE used_at IS NULL;
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS password_tokens, sessions;
    DROP TYPE IF EXISTS password_token_purpose;
    """)
