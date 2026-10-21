"""Deleting an event, with a grace period to undo it (decision of 17/10/2026).

- "Excluir evento" (responsible or administrator): the event leaves the public area at once, its
  face vectors are erased at once (sensitive data — LGPD Art. 6, III) and nobody sends photos to it.
- The event is unpublished at once: its published images go back under review. During the grace
  period (parameter "event_deletion_days", 7 by default) the photos are kept and the deletion can be
  undone; the event then stays UNPUBLISHED, so the responsible can still remove images before
  publishing again — nothing returns to the public area without someone pressing "Publicar"
  (Thiago's decision, 17/10/2026). Republishing re-indexes, as any publication does.
- When the period ends the whole collection is eliminated (as on expiry, RF006 note 6) and the event
  row removed. The audit log keeps who asked, when, and how much was eliminated.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import audit, parameters
from app.db.models import (Account, ConsentRecord, Event, EventStatus, FaceEmbedding, Image, ImageIndexingStatus,
                           ImageReviewStatus, VisitorSession)
from app.events.expiry import eliminate_collection
from app.events.service import EventError, PermissionDenied, can_manage
from app.notifications.port import EmailSender
from app.storage.port import ObjectStorage


def _now() -> datetime:
    return datetime.now(timezone.utc)


def request_deletion(db: Session, account: Account, event: Event) -> Event:
    if not can_manage(account, event):
        raise PermissionDenied("Somente o responsável pelo evento ou o administrador excluem o evento.")
    if event.status == EventStatus.EXPIRED:
        raise EventError("Este evento já expirou: o acervo dele já foi eliminado.")
    if event.deletion_due_at:
        raise EventError("A exclusão deste evento já foi pedida.")
    days = int(parameters.get(db, "event_deletion_days"))
    event.deletion_requested_at, event.deletion_requested_by = _now(), account.id
    event.deletion_due_at = event.deletion_requested_at + timedelta(days=days)
    # The face vectors go NOW: nobody searches a deleted event, so there is no reason to keep them.
    vectors = db.query(FaceEmbedding).filter(FaceEmbedding.event_id == event.id).delete(synchronize_session=False)
    unpublished = db.execute(
        update(Image).where(Image.event_id == event.id, Image.review_status == ImageReviewStatus.PUBLISHED)
        .values(review_status=ImageReviewStatus.IN_REVIEW, indexing_status=ImageIndexingStatus.NOT_QUEUED,
                faces_count=None, next_attempt_at=None, published_at=None)).rowcount
    event.status = EventStatus.EDITING
    db.query(VisitorSession).filter(VisitorSession.event_id == event.id).delete()  # results end at once
    audit.record(db, "event.deletion_requested", account.id, "event", event.id, name=event.name, days=days,
                 vectors_erased=vectors, unpublished=unpublished)
    db.commit()
    return event


def cancel_deletion(db: Session, account: Account, event: Event) -> Event:
    if not can_manage(account, event):
        raise PermissionDenied("Somente o responsável pelo evento ou o administrador desfazem a exclusão.")
    if not event.deletion_due_at:
        raise EventError("Este evento não está com exclusão agendada.")
    event.deletion_requested_at = event.deletion_due_at = event.deletion_requested_by = None
    # The event stays unpublished, its images under review: the responsible reviews and publishes again.
    audit.record(db, "event.deletion_cancelled", account.id, "event", event.id)
    db.commit()
    return event


def delete_due(db: Session, storage: ObjectStorage, sender: EmailSender) -> int:
    """Worker: eliminates the events whose grace period ended."""
    due = db.scalars(select(Event).where(Event.deletion_due_at.is_not(None), Event.deletion_due_at <= _now())).all()
    for event in due:
        counts = eliminate_collection(db, storage, sender, event)
        db.query(VisitorSession).filter(VisitorSession.event_id == event.id).delete()
        # Consent records stay as evidence of what visitors accepted (RF015 note 7), without the event.
        db.execute(update(ConsentRecord).where(ConsentRecord.event_id == event.id).values(event_id=None))
        audit.record(db, "event.deleted", None, "event", event.id, name=event.name,
                     requested_by=str(event.deletion_requested_by) if event.deletion_requested_by else None, **counts)
        db.delete(event)
        db.commit()
    return len(due)
