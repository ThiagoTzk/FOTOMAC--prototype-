"""A similarity threshold saved while InsightFace was the engine does not apply to YuNet + SFace.

Each model has its own similarity scale: 0.30 was calibrated for InsightFace and, on SFace, would
deliver photos of OTHER people (RF016 note 6). A swap made in the panel already resets it
(app/face/switch.py); this one happened by configuration, so the stored value is removed here and
the threshold goes back to the one calibrated for SFace (0.3741, factory.ENGINES). Logged in the
audit trail like any other change, with the reason.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-16
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO audit_log (action, target_type, target_id, details)
        SELECT 'parameter.changed', 'parameter', 'similarity_threshold',
               jsonb_build_object('previous', value, 'new', 0.3741,
                                  'reason', 'troca do InsightFace pelo YuNet + SFace (migração 0010)')
          FROM system_parameters WHERE key = 'similarity_threshold';
        DELETE FROM system_parameters WHERE key = 'similarity_threshold';
    """)


def downgrade() -> None:
    pass  # the InsightFace threshold has no meaning without InsightFace
