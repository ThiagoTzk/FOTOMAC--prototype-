"""Removes everything about minors — decided by Thiago on 19/10/2026.

The rules for children (events FOR children with the guardians' authorisation, RF032; blurring a child
who appears by chance, RF033) leave the system until the advisor and the coordination give an official
answer (docs/DUVIDAS-CRIANCAS-2026-10-19.md). Keeping the columns would keep a half rule: a flag nobody
sets and a "reviewed for minors" mark nobody reads. The development database holds no event (emptied on
17/10/2026), so nothing in use is lost. If a rule comes back, it comes in a new migration, designed for
the answer received.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-19
"""
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE images DROP COLUMN faces_blurred;
        ALTER TABLE images DROP COLUMN minors_reviewed_at;
        ALTER TABLE events DROP COLUMN minors_authorized_at;
        ALTER TABLE events DROP COLUMN minors_authorized_by;
        ALTER TABLE events DROP COLUMN minors_authorization_ref;
        ALTER TABLE events DROP COLUMN has_minors;
    """)


def downgrade() -> None:  # the columns of 0016, empty
    op.execute("""
        ALTER TABLE events ADD COLUMN has_minors boolean NOT NULL DEFAULT false;
        ALTER TABLE events ADD COLUMN minors_authorization_ref varchar(300);
        ALTER TABLE events ADD COLUMN minors_authorized_by uuid REFERENCES accounts(id) ON DELETE SET NULL;
        ALTER TABLE events ADD COLUMN minors_authorized_at timestamptz;
        ALTER TABLE images ADD COLUMN minors_reviewed_at timestamptz;
        ALTER TABLE images ADD COLUMN faces_blurred smallint NOT NULL DEFAULT 0;
    """)
