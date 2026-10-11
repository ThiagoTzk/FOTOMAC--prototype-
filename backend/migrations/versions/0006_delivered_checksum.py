"""Checksum of the file the visitor DOWNLOADS, to identify an image in a removal request.

RF023 note 1 lets anyone identify an image "pelo envio do arquivo obtido" — including a person
who appears incidentally and never ran a search (RF022 note 6). The file delivered is not the
one the photographer sent (GPS removed, credits written), so its own SHA-256 is kept here.
An exact checksum is the only identification precise enough for an irreversible deletion.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-03
"""
import hashlib

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE images ADD COLUMN delivered_sha256 char(64)")
    # Existing images: hash the stored original once (read from SeaweedFS).
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, object_key FROM images")).all()
    if rows:
        from app.storage.factory import get_storage
        storage = get_storage()
        for image_id, key in rows:
            digest = hashlib.sha256(storage.get(key)).hexdigest()
            bind.execute(sa.text("UPDATE images SET delivered_sha256 = :d WHERE id = :i"), {"d": digest, "i": image_id})
    op.execute("ALTER TABLE images ALTER COLUMN delivered_sha256 SET NOT NULL")
    op.execute("CREATE INDEX ix_images_delivered_sha256 ON images (delivered_sha256)")


def downgrade() -> None:
    op.execute("ALTER TABLE images DROP COLUMN delivered_sha256")
