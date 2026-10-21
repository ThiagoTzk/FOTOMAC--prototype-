"""Quality test with several poses of the person (a short video or several photos).

The browser extracts frames from the video (the video itself never reaches the server); the
server keeps at most 5 frames, one per pose, and discards the rest at once (LGPD Art. 6, III).
Each run then scores every photo in three ways ("views"), so they are compared on the same
ground truth: one frame (like a selfie), the maximum over the poses, the mean of the poses.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-16
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE recognition_tests ADD COLUMN query_poses jsonb;   -- e.g. ["frente","esquerda",...]; NULL = one photo
        ALTER TABLE recognition_run_scores ADD COLUMN view varchar(8) NOT NULL DEFAULT 'single'
            CHECK (view IN ('single', 'max', 'mean'));
        ALTER TABLE recognition_run_scores DROP CONSTRAINT recognition_run_scores_pkey;
        ALTER TABLE recognition_run_scores ADD PRIMARY KEY (run_id, image_id, view);
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM recognition_run_scores WHERE view <> 'single';
        ALTER TABLE recognition_run_scores DROP CONSTRAINT recognition_run_scores_pkey;
        ALTER TABLE recognition_run_scores ADD PRIMARY KEY (run_id, image_id);
        ALTER TABLE recognition_run_scores DROP COLUMN view;
        ALTER TABLE recognition_tests DROP COLUMN query_poses;
    """)
