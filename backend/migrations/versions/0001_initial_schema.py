"""Initial schema: accounts, themes, events, images, face vectors, audit log.

Written as plain SQL on purpose: the privacy guarantees below (triggers, partial vector
index, cascades) are database features, and reading them as SQL is the clearest way to
review them — for the developer and for the TCC committee.

Revision ID: 0001
Revises:
Create Date: 2026-10-01
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("""
    CREATE TYPE account_role AS ENUM ('admin', 'photographer');
    CREATE TYPE account_status AS ENUM ('pending', 'active', 'inactive', 'suspended');
    CREATE TYPE date_precision AS ENUM ('day', 'month', 'month_range');
    CREATE TYPE event_status AS ENUM ('editing', 'processing', 'published', 'expired');
    CREATE TYPE image_review_status AS ENUM ('in_review', 'discarded', 'published');
    CREATE TYPE image_indexing_status AS ENUM ('not_queued', 'pending', 'processed', 'no_faces', 'failed');
    """)

    op.execute("""
    CREATE TABLE accounts (
        id                      uuid PRIMARY KEY,
        full_name               varchar(120) NOT NULL,
        email                   varchar(100) NOT NULL CHECK (position('@' in email) > 1),
        role                    account_role NOT NULL,
        photographer_signature  varchar(80),
        password_hash           text,
        status                  account_status NOT NULL DEFAULT 'pending',
        failed_login_attempts   smallint NOT NULL DEFAULT 0,
        locked_until            timestamptz,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        -- RF001 note 4: the signature is the photo credit, mandatory for photographers.
        CONSTRAINT ck_photographer_signature CHECK (role <> 'photographer' OR photographer_signature IS NOT NULL),
        -- RF001 note 6: a pending account has no password and an active one must have it.
        CONSTRAINT ck_pending_without_password CHECK (status <> 'pending' OR password_hash IS NULL),
        CONSTRAINT ck_active_with_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
    );
    -- E-mail is the login identifier: unique regardless of letter case (RF001 note 2).
    CREATE UNIQUE INDEX uq_accounts_email_ci ON accounts (lower(email));

    CREATE TABLE themes (
        id      serial PRIMARY KEY,
        name    varchar(50) NOT NULL UNIQUE,
        active  boolean NOT NULL DEFAULT true
    );

    CREATE TABLE events (
        id                  uuid PRIMARY KEY,
        name                varchar(150) NOT NULL,
        date_precision      date_precision NOT NULL,
        date_start          date NOT NULL,
        date_end            date NOT NULL,
        location            varchar(150) NOT NULL,
        description         varchar(300) NOT NULL,
        cover_object_key    text,
        owner_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        status              event_status NOT NULL DEFAULT 'editing',
        collaboration_open  boolean NOT NULL DEFAULT false,
        expires_on          date NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_event_name_date UNIQUE (name, date_start),
        -- RF004 note 3: the range cannot end before it starts nor exceed 12 months.
        CONSTRAINT ck_event_date_order CHECK (date_end >= date_start),
        CONSTRAINT ck_event_date_span CHECK (date_end < date_start + interval '12 months')
    );
    CREATE INDEX ix_events_status_date ON events (status, date_start DESC);

    CREATE TABLE event_themes (
        event_id  uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        theme_id  integer NOT NULL REFERENCES themes(id) ON DELETE RESTRICT,
        PRIMARY KEY (event_id, theme_id)
    );

    CREATE TABLE images (
        id                    uuid PRIMARY KEY,
        event_id              uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        uploaded_by           uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        object_key            text NOT NULL UNIQUE,
        sha256                char(64) NOT NULL,
        size_bytes            bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 25 * 1024 * 1024),
        width                 integer NOT NULL,
        height                integer NOT NULL,
        captured_at           timestamptz,
        review_status         image_review_status NOT NULL DEFAULT 'in_review',
        indexing_status       image_indexing_status NOT NULL DEFAULT 'not_queued',
        indexing_attempts     smallint NOT NULL DEFAULT 0,
        faces_count           smallint,
        removal_requested_at  timestamptz,
        uploaded_at           timestamptz NOT NULL DEFAULT now(),
        published_at          timestamptz,
        CONSTRAINT uq_image_event_checksum UNIQUE (event_id, sha256),
        -- RNF13: an image that is not published can never be queued for indexing.
        CONSTRAINT ck_index_only_published CHECK (review_status = 'published' OR indexing_status = 'not_queued')
    );
    CREATE INDEX ix_images_event_status ON images (event_id, review_status);
    CREATE INDEX ix_images_indexing_queue ON images (indexing_status) WHERE indexing_status IN ('pending', 'failed');
    """)

    # ---- Sensitive biometric data, segregated (LGPD Art. 5, II; Art. 46 §2).
    op.execute("""
    CREATE TABLE face_embeddings (
        id               bigserial PRIMARY KEY,
        image_id         uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        event_id         uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        model_version    varchar(80) NOT NULL,
        dim              smallint NOT NULL,
        embedding        vector NOT NULL,
        bbox_x           integer NOT NULL,
        bbox_y           integer NOT NULL,
        bbox_width       integer NOT NULL,
        bbox_height      integer NOT NULL,
        detection_score  double precision NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_embedding_dim CHECK (vector_dims(embedding) = dim)
    );
    CREATE INDEX ix_face_embeddings_event_model ON face_embeddings (event_id, model_version);
    CREATE INDEX ix_face_embeddings_image ON face_embeddings (image_id);
    -- Approximate nearest-neighbour index (RNF17: sublinear search) for 512-dim vectors.
    -- Expression + partial index: one per vector size, so a future model with another size
    -- gets its own index during re-indexing (RF028 note 3) with no change to the table.
    CREATE INDEX ix_face_embeddings_hnsw_512 ON face_embeddings
        USING hnsw ((embedding::vector(512)) vector_cosine_ops) WHERE dim = 512;

    -- RNF13 / RS003 enforced by the database itself: even a bug in the application cannot
    -- store a vector for a photo that was not published, or attach it to another event.
    CREATE FUNCTION guard_face_embedding() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE img record;
    BEGIN
        SELECT event_id, review_status INTO img FROM images WHERE id = NEW.image_id;
        IF img.review_status IS DISTINCT FROM 'published' THEN
            RAISE EXCEPTION 'RNF13: biometric vector refused, image % is not published', NEW.image_id
                USING ERRCODE = 'check_violation';
        END IF;
        IF img.event_id <> NEW.event_id THEN
            RAISE EXCEPTION 'face vector event does not match its image event'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END $$;
    CREATE TRIGGER trg_guard_face_embedding BEFORE INSERT OR UPDATE ON face_embeddings
        FOR EACH ROW EXECUTE FUNCTION guard_face_embedding();
    """)

    # ---- Append-only audit trail (RF024 note 1, RF026 note 4).
    op.execute("""
    CREATE TABLE audit_log (
        id                bigserial PRIMARY KEY,
        occurred_at       timestamptz NOT NULL DEFAULT now(),
        actor_account_id  uuid REFERENCES accounts(id) ON DELETE RESTRICT,
        action            varchar(80) NOT NULL,
        target_type       varchar(40),
        target_id         varchar(64),
        details           jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX ix_audit_log_time ON audit_log (occurred_at);

    CREATE FUNCTION audit_log_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        RAISE EXCEPTION 'audit_log is append-only (RF024): % is not allowed', TG_OP
            USING ERRCODE = 'insufficient_privilege';
    END $$;
    CREATE TRIGGER trg_audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
    CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
        FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS audit_log, face_embeddings, images, event_themes, events, themes, accounts CASCADE;
    DROP FUNCTION IF EXISTS audit_log_is_append_only, guard_face_embedding;
    DROP TYPE IF EXISTS image_indexing_status, image_review_status, event_status,
                        date_precision, account_status, account_role;
    """)
