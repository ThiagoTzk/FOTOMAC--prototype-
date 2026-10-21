"""Photo formats other than JPEG and marketing's publicity package (requirements v2.0, stage 4).

- images.source_*: a photo sent in PNG, WebP, HEIC or camera RAW keeps its original, as received
  (without GPS, with the credits), beside the JPEG copy that object_key points to (RF007 note 13).
- package_jobs.publicity: marketing's package of someone else's event, made of the JPEG copies,
  for institutional publicity (RF012 note 2, RF030 note 3).

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-21
"""
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE images ADD COLUMN source_key text UNIQUE;
        ALTER TABLE images ADD COLUMN source_format varchar(8);
        ALTER TABLE images ADD COLUMN source_bytes bigint;
        ALTER TABLE images ADD CONSTRAINT images_source_complete
            CHECK ((source_key IS NULL) = (source_format IS NULL) AND (source_key IS NULL) = (source_bytes IS NULL));
        ALTER TABLE package_jobs ADD COLUMN publicity boolean NOT NULL DEFAULT false;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE package_jobs DROP COLUMN publicity;
        ALTER TABLE images DROP CONSTRAINT images_source_complete;
        ALTER TABLE images DROP COLUMN source_bytes;
        ALTER TABLE images DROP COLUMN source_format;
        ALTER TABLE images DROP COLUMN source_key;
    """)
