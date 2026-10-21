"""YuNet + SFace replaces InsightFace (CESMAC decision, 15/10/2026): vector index for 128 dimensions.

The table needs no change — the column has no fixed dimension (see 0001). Only the approximate
nearest-neighbour index follows the model: one partial index per vector size. The 512-dim index
belonged to InsightFace (buffalo_l), which is no longer part of the system; its vectors are
replaced by the re-indexing (RF028) and the index would only cost disk and writes.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-16
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_face_embeddings_hnsw_128 ON face_embeddings
            USING hnsw ((embedding::vector(128)) vector_cosine_ops) WHERE dim = 128;
        DROP INDEX IF EXISTS ix_face_embeddings_hnsw_512;
    """)


def downgrade() -> None:
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_face_embeddings_hnsw_512 ON face_embeddings
            USING hnsw ((embedding::vector(512)) vector_cosine_ops) WHERE dim = 512;
        DROP INDEX IF EXISTS ix_face_embeddings_hnsw_128;
    """)
