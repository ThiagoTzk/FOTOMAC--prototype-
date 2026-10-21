"""Minors test: could an age model help the photographer's human screening (blurring children)?

Runs on the photos of an event — preferably NOT published (no biometric vector exists for them).
Per face: the box and the estimated age; per face, the administrator's ground truth (minor / adult
/ ignore); per photo, whether it was reviewed. All of it is deleted when the test closes, keeping
only aggregated numbers (LGPD Art. 6, III; Art. 14: children's data only in their best interest).

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-16
"""
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE age_tests (
            id                uuid PRIMARY KEY,
            label             varchar(80) NOT NULL,
            event_id          uuid REFERENCES events(id) ON DELETE SET NULL,
            event_name        varchar(200) NOT NULL,
            estimator_key     varchar(40) NOT NULL,
            model_version     varchar(80),
            created_by        uuid REFERENCES accounts(id) ON DELETE SET NULL,
            created_at        timestamptz NOT NULL DEFAULT now(),
            closed_at         timestamptz,
            status            varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
            total             integer NOT NULL DEFAULT 0,
            done              integer NOT NULL DEFAULT 0,
            error             varchar(300),
            seconds_per_photo real,
            result            jsonb                 -- aggregated snapshot written when the test is closed
        );
        CREATE TABLE age_test_photos (
            test_id      uuid NOT NULL REFERENCES age_tests(id) ON DELETE CASCADE,
            image_id     uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            reviewed_at  timestamptz,               -- the administrator went through every face of it
            PRIMARY KEY (test_id, image_id)
        );
        CREATE TABLE age_test_faces (
            test_id      uuid NOT NULL REFERENCES age_tests(id) ON DELETE CASCADE,
            image_id     uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            n            smallint NOT NULL,
            bbox_x       integer NOT NULL,
            bbox_y       integer NOT NULL,
            bbox_width   integer NOT NULL,
            bbox_height  integer NOT NULL,
            age          real NOT NULL,             -- an ESTIMATE, never stored beyond the test
            mark         varchar(6) CHECK (mark IN ('minor', 'ignore')),   -- NULL = adult (once the photo is reviewed)
            PRIMARY KEY (test_id, image_id, n)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE age_test_faces; DROP TABLE age_test_photos; DROP TABLE age_tests;")
