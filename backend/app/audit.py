"""Writes to the append-only audit trail (RF024). Never pass images, vectors or passwords."""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models import AuditLog


def record(db: Session, action: str, actor_id: uuid.UUID | None = None,
           target_type: str | None = None, target_id: str | uuid.UUID | None = None,
           **details) -> None:
    db.add(AuditLog(actor_account_id=actor_id, action=action, target_type=target_type,
                    target_id=str(target_id) if target_id else None, details=details))
