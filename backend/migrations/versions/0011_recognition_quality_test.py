"""Quality test of facial recognition in the administrator's panel — fotomac-lab's Test 1, inside the system.

A test = one event + one photo of a person who CONSENTED (LGPD Art. 11, I) + one ground truth
("está" / "não está" per photo, shared by every candidate) + runs (one per candidate engine,
each with its ranking). The query photo and the per-photo data exist only while the test is
open: closing it keeps the aggregated result and deletes the rest (Art. 6, III). Deleting an
image or an event deletes its rows here too (removal requests and expiry keep working).

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-16
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE recognition_tests (
            id                uuid PRIMARY KEY,
            label             varchar(80) NOT NULL,
            event_id          uuid REFERENCES events(id) ON DELETE SET NULL,
            event_name        varchar(200) NOT NULL,   -- kept for the history after the event expires
            created_by        uuid REFERENCES accounts(id) ON DELETE SET NULL,
            created_at        timestamptz NOT NULL DEFAULT now(),
            closed_at         timestamptz,
            consent_confirmed boolean NOT NULL CHECK (consent_confirmed),
            query_key         text                     -- the consented photo; NULL once the test is closed
        );
        CREATE TABLE recognition_test_marks (
            test_id   uuid NOT NULL REFERENCES recognition_tests(id) ON DELETE CASCADE,
            image_id  uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            mark      varchar(10) NOT NULL CHECK (mark IN ('present', 'absent')),
            marked_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (test_id, image_id)
        );
        CREATE TABLE recognition_runs (
            id                uuid PRIMARY KEY,
            test_id           uuid NOT NULL REFERENCES recognition_tests(id) ON DELETE CASCADE,
            engine_key        varchar(40) NOT NULL,
            engine_label      varchar(120) NOT NULL,
            model_version     varchar(80),
            status            varchar(10) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'done', 'failed')),
            total             integer NOT NULL DEFAULT 0,
            done              integer NOT NULL DEFAULT 0,
            error             varchar(300),
            created_at        timestamptz NOT NULL DEFAULT now(),
            finished_at       timestamptz,
            load_s            real,
            index_s_per_photo real,
            query_ms          real,
            search_ms         real,
            faces             integer,
            result            jsonb                   -- aggregated snapshot written when the test is closed
        );
        CREATE INDEX ix_recognition_runs_test ON recognition_runs (test_id);
        CREATE TABLE recognition_run_scores (
            run_id       uuid NOT NULL REFERENCES recognition_runs(id) ON DELETE CASCADE,
            image_id     uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            similarity   real NOT NULL,              -- best face of the photo against the query
            bbox_x       integer NOT NULL,
            bbox_y       integer NOT NULL,
            bbox_width   integer NOT NULL,
            bbox_height  integer NOT NULL,
            wrong_face   boolean NOT NULL DEFAULT false,  -- the person is there, but THIS face is someone else
            PRIMARY KEY (run_id, image_id)
        );
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE recognition_run_scores;
        DROP TABLE recognition_runs;
        DROP TABLE recognition_test_marks;
        DROP TABLE recognition_tests;
    """)
