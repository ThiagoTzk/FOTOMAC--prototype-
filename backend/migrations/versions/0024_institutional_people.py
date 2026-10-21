"""Institutional people (RF020) and the marking of their photos across the collection (RF021).

- institutional_people: who the administrator registered, the single-use authorization link, and the
  proof of the electronic signature (term version, date and time, IP, browser, signature image,
  document hash). After a revocation the row stays, without photos or vectors, as the proof that the
  authorization existed and ended (LGPD Art. 8 §2 — the burden of proof is the controller's).
- institutional_photos: the 1 to 5 reference photos. Stored while awaiting the authorization, but
  NEVER processed before it.
- institutional_vectors: SENSITIVE biometric data (Art. 5, II), segregated like face_embeddings. The
  database itself refuses a vector of someone who has not authorized (same idea as RNF13).
- institutional_marks: "pessoa institucional localizada" in a published image, waiting for a person
  of the team to confirm or reject it (RF021 note 7).

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-21
"""
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TYPE institutional_status AS ENUM ('awaiting', 'active', 'revoked');

        CREATE TABLE institutional_people (
            id                      uuid PRIMARY KEY,
            full_name               varchar(120) NOT NULL,
            position                varchar(100) NOT NULL,          -- cargo ou função
            unit                    varchar(100),                   -- unidade ou curso
            email                   varchar(254) NOT NULL,
            status                  institutional_status NOT NULL DEFAULT 'awaiting',
            created_by              uuid REFERENCES accounts(id) ON DELETE SET NULL,
            created_at              timestamptz NOT NULL DEFAULT now(),
            link_token_hash         varchar(64) UNIQUE,             -- single use: cleared once signed
            link_expires_at         timestamptz,
            link_sent_at            timestamptz,
            term_version            varchar(20),
            signed_term             jsonb,                          -- the exact text signed: title + paragraphs
            signed_photos           jsonb,                          -- SHA-256 of the reference photos signed (not the photos)
            authorized_at           timestamptz,
            authorized_ip           varchar(45),
            authorized_user_agent   varchar(300),
            signature_key           text,
            document_sha256         varchar(64),
            revoke_token_hash       varchar(64) UNIQUE,
            revoked_at              timestamptz,
            revoked_by              varchar(10) CHECK (revoked_by IN ('holder', 'admin')),
            scan_status             varchar(10) NOT NULL DEFAULT 'idle' CHECK (scan_status IN ('idle', 'pending', 'done')),
            scanned_at              timestamptz,
            references_model_version varchar(80),
            CONSTRAINT ck_institutional_signed CHECK (
                status = 'awaiting' OR (authorized_at IS NOT NULL AND signature_key IS NOT NULL AND signed_term IS NOT NULL
                                        AND document_sha256 IS NOT NULL AND term_version IS NOT NULL)),
            CONSTRAINT ck_institutional_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
        );
        CREATE UNIQUE INDEX uq_institutional_email_open ON institutional_people (lower(email)) WHERE status <> 'revoked';

        CREATE TABLE institutional_photos (
            id          uuid PRIMARY KEY,
            person_id   uuid NOT NULL REFERENCES institutional_people(id) ON DELETE CASCADE,
            object_key  text NOT NULL UNIQUE,
            sha256      varchar(64) NOT NULL,
            position    smallint NOT NULL,
            faces_found smallint,                                   -- known only after the authorization
            created_at  timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE institutional_vectors (
            id            bigserial PRIMARY KEY,
            person_id     uuid NOT NULL REFERENCES institutional_people(id) ON DELETE CASCADE,
            photo_id      uuid NOT NULL REFERENCES institutional_photos(id) ON DELETE CASCADE,
            model_version varchar(80) NOT NULL,
            dim           smallint NOT NULL,
            embedding     vector NOT NULL,
            CONSTRAINT ck_institutional_vector_dim CHECK (vector_dims(embedding) = dim)
        );

        -- RF020 note 2 enforced by the database: no vector before the authorization, none after a revocation.
        CREATE FUNCTION guard_institutional_vector() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF (SELECT status FROM institutional_people WHERE id = NEW.person_id) <> 'active' THEN
                RAISE EXCEPTION 'RF020: biometric vector refused, person % has not authorized', NEW.person_id
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER trg_guard_institutional_vector BEFORE INSERT OR UPDATE ON institutional_vectors
            FOR EACH ROW EXECUTE FUNCTION guard_institutional_vector();

        CREATE TABLE institutional_marks (
            person_id   uuid NOT NULL REFERENCES institutional_people(id) ON DELETE CASCADE,
            image_id    uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            similarity  real NOT NULL,
            status      varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
            decided_by  uuid REFERENCES accounts(id) ON DELETE SET NULL,
            decided_at  timestamptz,
            created_at  timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (person_id, image_id)
        );
        CREATE INDEX ix_institutional_marks_event ON institutional_marks (person_id, event_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE institutional_marks;
        DROP TRIGGER trg_guard_institutional_vector ON institutional_vectors;
        DROP FUNCTION guard_institutional_vector();
        DROP TABLE institutional_vectors;
        DROP TABLE institutional_photos;
        DROP TABLE institutional_people;
        DROP TYPE institutional_status;
    """)
