"""Marketing profile and temporary account for the hired photographer (requirements v2.0, RF030, RF031).

- account_role gains "marketing" and "contractor"; account_status gains "expired" (RF003 note 6: the
  temporary account expires and is NEVER deleted).
- The contractor is bound to ONE event and identified by name, CPF, birth date and contract number.
  CPF and birth date are personal data kept to know for certain who answers for the photos sent (RF031
  note 6). They are stored ENCRYPTED (pgcrypto, key outside the database — RF031 note 7, RS038) and
  erased when the retention ends; the name stays in the operation records (RF003 note 4).
- The signature (credit) becomes mandatory for every profile that sends photos.
- images.approval: photos of a contractor wait for the administrator's approval before they can be
  published (RF031 note 3).

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-17
"""
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A new enum value cannot be used in the transaction that created it: these run on their own.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE account_role ADD VALUE IF NOT EXISTS 'marketing'")
        op.execute("ALTER TYPE account_role ADD VALUE IF NOT EXISTS 'contractor'")
        op.execute("ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'expired'")
    op.execute("""
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        ALTER TABLE accounts ADD COLUMN bound_event_id uuid REFERENCES events(id) ON DELETE SET NULL;
        ALTER TABLE accounts ADD COLUMN contract_number varchar(60);
        ALTER TABLE accounts ADD COLUMN cpf_encrypted bytea;          -- pgp_sym_encrypt, never plain text
        ALTER TABLE accounts ADD COLUMN birth_date_encrypted bytea;
        ALTER TABLE accounts ADD COLUMN valid_until timestamptz;      -- 24 h from the password definition
        ALTER TABLE accounts ADD COLUMN media_gone_at timestamptz;    -- when no photo of the account remained
        ALTER TABLE accounts ADD COLUMN identity_erased_at timestamptz;

        ALTER TABLE accounts DROP CONSTRAINT ck_photographer_signature;
        ALTER TABLE accounts ADD CONSTRAINT ck_author_signature
            CHECK (role NOT IN ('photographer', 'marketing', 'contractor') OR photographer_signature IS NOT NULL);
        ALTER TABLE accounts ADD CONSTRAINT ck_contractor_contract
            CHECK (role <> 'contractor' OR contract_number IS NOT NULL);
        -- A contractor is activated only with the identification (RF031 note 6), unless already erased.
        ALTER TABLE accounts ADD CONSTRAINT ck_contractor_identity
            CHECK (role <> 'contractor' OR status = 'pending' OR identity_erased_at IS NOT NULL
                   OR (cpf_encrypted IS NOT NULL AND birth_date_encrypted IS NOT NULL));
        ALTER TABLE accounts ADD CONSTRAINT ck_contractor_fields_only
            CHECK (role = 'contractor' OR (bound_event_id IS NULL AND contract_number IS NULL
                                           AND cpf_encrypted IS NULL AND birth_date_encrypted IS NULL));

        ALTER TABLE images ADD COLUMN approval varchar(10) CHECK (approval IN ('pending', 'approved'));
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE images DROP COLUMN approval;
        ALTER TABLE accounts DROP CONSTRAINT ck_contractor_fields_only;
        ALTER TABLE accounts DROP CONSTRAINT ck_contractor_identity;
        ALTER TABLE accounts DROP CONSTRAINT ck_contractor_contract;
        ALTER TABLE accounts DROP CONSTRAINT ck_author_signature;
        ALTER TABLE accounts ADD CONSTRAINT ck_photographer_signature
            CHECK (role <> 'photographer' OR photographer_signature IS NOT NULL);
        ALTER TABLE accounts DROP COLUMN identity_erased_at;
        ALTER TABLE accounts DROP COLUMN media_gone_at;
        ALTER TABLE accounts DROP COLUMN valid_until;
        ALTER TABLE accounts DROP COLUMN birth_date_encrypted;
        ALTER TABLE accounts DROP COLUMN cpf_encrypted;
        ALTER TABLE accounts DROP COLUMN contract_number;
        ALTER TABLE accounts DROP COLUMN bound_event_id;
    """)
    # Postgres cannot remove enum values; "marketing", "contractor" and "expired" stay unused.
