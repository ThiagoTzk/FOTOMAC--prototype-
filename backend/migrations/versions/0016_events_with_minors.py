"""Events with minors (LGPD Art. 14): two ways to publish them.

A) The organisation collected the guardians' signed authorisation (image + facial search). Someone
   declares it in the system, saying WHERE the signed forms are kept (the forms themselves stay
   with the organisation: FOTOMAC stores only the reference, not more data of children and parents).
B) Without it, every photo is checked for minors before publication, and their faces are blurred
   IN THE FILE (RF009 note 7) — the original is replaced, never kept.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-16
"""
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE events ADD COLUMN has_minors boolean NOT NULL DEFAULT false;
        ALTER TABLE events ADD COLUMN minors_authorization_ref varchar(300);
        ALTER TABLE events ADD COLUMN minors_authorized_by uuid REFERENCES accounts(id) ON DELETE SET NULL;
        ALTER TABLE events ADD COLUMN minors_authorized_at timestamptz;
        ALTER TABLE images ADD COLUMN minors_reviewed_at timestamptz;   -- checked for minors (blurred or none found)
        ALTER TABLE images ADD COLUMN faces_blurred smallint NOT NULL DEFAULT 0;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE images DROP COLUMN faces_blurred;
        ALTER TABLE images DROP COLUMN minors_reviewed_at;
        ALTER TABLE events DROP COLUMN minors_authorized_at;
        ALTER TABLE events DROP COLUMN minors_authorized_by;
        ALTER TABLE events DROP COLUMN minors_authorization_ref;
        ALTER TABLE events DROP COLUMN has_minors;
    """)
