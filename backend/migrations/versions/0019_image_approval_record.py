"""Who approved a hired photographer's photo, and when (RF031 note 3).

The approval may be done in batch (17/10/2026: approving 200 photos one by one is not a safety
requirement). What keeps the accountability is the record: the photo itself says who sent it
(uploaded_by) and who reviewed and approved it — besides the audit log.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-17
"""
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE images ADD COLUMN approved_by uuid REFERENCES accounts(id) ON DELETE RESTRICT;
        ALTER TABLE images ADD COLUMN approved_at timestamptz;
        ALTER TABLE images ADD CONSTRAINT ck_approval_record
            CHECK (approval IS DISTINCT FROM 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL));
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE images DROP CONSTRAINT ck_approval_record;
        ALTER TABLE images DROP COLUMN approved_at;
        ALTER TABLE images DROP COLUMN approved_by;
    """)
