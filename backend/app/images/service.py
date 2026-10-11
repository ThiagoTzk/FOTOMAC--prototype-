"""Image rules (RF007, RF009, RF011, RF025) — independent of HTTP."""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.db.models import (Account, AccountStatus, Event, EventStatus, Image, ImageIndexingStatus,
                           ImageReviewStatus)
from app.events.service import EventError, NotFound, PermissionDenied, can_manage
from app.imaging_meta import captured_at
from app.images.processing import FileRejected, prepare
from app.storage.port import ObjectStorage

MAX_PER_EVENT = 1000          # RF007
MAX_REPROCESS_PER_DAY = 3     # RF011 note 5


@dataclass
class UploadResult:
    image: Image


class DuplicateImage(FileRejected):
    def __init__(self):
        super().__init__("duplicate", "Esta imagem já está no acervo do evento e não será enviada novamente.")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ permissions

def can_upload(account: Account, event: Event) -> bool:
    """Responsible, administrator, or any active photographer when collaboration is open (RF025 note 1)."""
    if event.status == EventStatus.EXPIRED:
        return False
    return can_manage(account, event) or (event.collaboration_open and account.status == AccountStatus.ACTIVE)


def can_manage_image(account: Account, image: Image) -> bool:
    """A collaborator manages only the images they sent; responsible and admin manage all
    (RF011 note 1, RF025 note 5)."""
    return can_manage(account, image.event) or image.uploaded_by == account.id


def get_image(db: Session, image_id: uuid.UUID, account: Account) -> Image:
    from app.events.service import get_visible  # local: avoids a circular import
    image = db.get(Image, image_id)
    if image is None:
        raise NotFound("Imagem não encontrada.")
    get_visible(db, account, image.event_id)  # raises NotFound if the event is not visible
    return image


# ------------------------------------------------------------------ upload (RF007, RF008)

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def existing_checksums(db: Session, event: Event, checksums: list[str]) -> set[str]:
    """Lets the screen flag duplicates BEFORE sending (RF007 note 10)."""
    rows = db.scalars(select(Image.sha256).where(Image.event_id == event.id, Image.sha256.in_(checksums[:300])))
    return set(rows)


def upload_image(db: Session, storage: ObjectStorage, account: Account, event: Event, data: bytes) -> Image:
    if not can_upload(account, event):
        raise PermissionDenied("Você não pode enviar imagens a este evento.")
    if not account.photographer_signature and account.role.value == "photographer":
        raise EventError("Defina sua assinatura em Meu perfil antes de enviar imagens.")
    checksum = sha256(data)  # of the file AS SENT, so the same file is recognised again
    if db.scalar(select(Image.id).where(Image.event_id == event.id, Image.sha256 == checksum)):
        raise DuplicateImage()
    count = db.scalar(select(func.count()).select_from(Image).where(
        Image.event_id == event.id, Image.review_status != ImageReviewStatus.DISCARDED)) or 0
    if count >= MAX_PER_EVENT:
        raise FileRejected("event_limit", "O evento atingiu o limite de 1.000 imagens.")

    signature = account.photographer_signature or account.full_name
    prepared = prepare(data, signature)
    image_id = uuid.uuid4()  # random, not sequential: the collection cannot be enumerated (RF007 note 6)
    base = f"events/{event.id}/{image_id}"
    keys = (f"{base}.jpg", f"{base}_thumb.jpg", f"{base}_preview.jpg")
    storage.put(keys[0], prepared.original, "image/jpeg")
    storage.put(keys[1], prepared.thumb, "image/jpeg")
    storage.put(keys[2], prepared.preview, "image/jpeg")
    image = Image(id=image_id, event_id=event.id, uploaded_by=account.id, object_key=keys[0], thumb_key=keys[1],
                  preview_key=keys[2], sha256=checksum, delivered_sha256=sha256(prepared.original), size_bytes=len(prepared.original), width=prepared.width,
                  height=prepared.height, captured_at=captured_at(data), credit_signature=signature,
                  review_status=ImageReviewStatus.IN_REVIEW)  # RF007 note 8
    db.add(image)
    audit.record(db, "image.upload", account.id, "image", image.id, event_id=str(event.id),
                 collaborator=event.owner_id != account.id)
    db.commit()
    return image


def replace_file(db: Session, storage: ObjectStorage, account: Account, image: Image, data: bytes) -> Image:
    """RF009 note 7: an edited version (e.g. a minor's face blurred IN the file) replaces the
    original before publication — the old file is deleted, never kept."""
    if not can_manage_image(account, image):
        raise PermissionDenied("Você só pode substituir as imagens que enviou.")
    if image.review_status != ImageReviewStatus.IN_REVIEW:
        raise EventError("Só é possível substituir imagens em conferência, antes da publicação.")
    checksum = sha256(data)
    if db.scalar(select(Image.id).where(Image.event_id == image.event_id, Image.sha256 == checksum, Image.id != image.id)):
        raise DuplicateImage()
    prepared = prepare(data, image.credit_signature)
    storage.put(image.object_key, prepared.original, "image/jpeg")
    storage.put(image.thumb_key, prepared.thumb, "image/jpeg")
    storage.put(image.preview_key, prepared.preview, "image/jpeg")
    image.sha256, image.size_bytes = checksum, len(prepared.original)
    image.delivered_sha256 = sha256(prepared.original)
    image.width, image.height, image.captured_at = prepared.width, prepared.height, captured_at(data)
    audit.record(db, "image.replace", account.id, "image", image.id)
    db.commit()
    return image


# ------------------------------------------------------------------ review (RF009)

def set_discarded(db: Session, account: Account, image: Image, discarded: bool) -> Image:
    if not can_manage_image(account, image):
        raise PermissionDenied("Você só pode descartar as imagens que enviou.")
    if image.review_status == ImageReviewStatus.PUBLISHED:
        raise EventError("Imagem já publicada: use a exclusão.")
    image.review_status = ImageReviewStatus.DISCARDED if discarded else ImageReviewStatus.IN_REVIEW
    audit.record(db, "image.discard" if discarded else "image.restore", account.id, "image", image.id)
    db.commit()
    return image


def _delete_objects(storage: ObjectStorage, image: Image) -> None:
    for key in (image.object_key, image.thumb_key, image.preview_key):
        if key:
            storage.delete(key)


def delete_image(db: Session, storage: ObjectStorage, account: Account | None, image: Image,
                 sender=None) -> None:
    """Consistent removal (RF011 note 4): file, reduced copies, metadata and every biometric
    vector (ON DELETE CASCADE in face_embeddings). account=None means the SYSTEM itself
    (automatic deletion at the end of the 72 h removal deadline, RF023 note 6)."""
    if account is not None and not can_manage_image(account, image):
        raise PermissionDenied("Você só pode excluir as imagens que enviou.")
    if image.removal_requested_at is not None:
        from app.db.models import RemovalStatus
        from app.notifications.factory import get_email_sender
        from app.public.service import conclude_removals
        conclude_removals(db, sender or get_email_sender(), image.id,
                          RemovalStatus.DELETED_AUTOMATICALLY if account is None else RemovalStatus.DELETED_BY_PHOTOGRAPHER)
    # Files first, record last: if the storage fails, nothing in the database changed and the
    # deletion can simply be retried. The reverse order could leave a photo in the storage
    # with no record pointing to it — a file nobody would ever find to delete.
    _delete_objects(storage, image)
    audit.record(db, "image.delete", account.id if account else None, "image", image.id, event_id=str(image.event_id),
                 was_published=image.review_status == ImageReviewStatus.PUBLISHED,
                 removal_requested=image.removal_requested_at is not None)
    db.delete(image)
    db.commit()


@dataclass
class PublishSummary:
    sent: int
    discarded: int
    published: int


def publish(db: Session, storage: ObjectStorage, account: Account, event: Event) -> PublishSummary:
    """RF009 note 5: only the responsible photographer or the administrator publish. This is
    the act that allows biometric processing: only published images enter the queue."""
    if not can_manage(account, event):
        raise PermissionDenied("Somente o fotógrafo responsável pelo evento pode publicar as imagens.")
    if event.status == EventStatus.EXPIRED:
        raise EventError("Este evento expirou.")
    in_review = db.scalars(select(Image).where(Image.event_id == event.id,
                                               Image.review_status == ImageReviewStatus.IN_REVIEW)).all()
    discarded = db.scalars(select(Image).where(Image.event_id == event.id,
                                               Image.review_status == ImageReviewStatus.DISCARDED)).all()
    if not in_review:
        raise EventError("Não há imagens em conferência para publicar.")
    now = _now()
    for image in in_review:
        image.review_status = ImageReviewStatus.PUBLISHED
        image.indexing_status = ImageIndexingStatus.PENDING
        image.published_at = now
    # RF009 note 6: discarding becomes definitive with the publication.
    for image in discarded:
        _delete_objects(storage, image)
        db.delete(image)
    # RF006 note 2: "Em Processamento" until indexing ends, so the public never sees a
    # half-indexed event. An already published event stays public while new images index.
    if event.status == EventStatus.EDITING:
        event.status = EventStatus.PROCESSING
    summary = PublishSummary(sent=len(in_review) + len(discarded), discarded=len(discarded), published=len(in_review))
    audit.record(db, "event.publish", account.id, "event", event.id, enviadas=summary.sent,
                 descartadas=summary.discarded, publicadas=summary.published)  # RF009 note 8
    db.commit()
    return summary


def request_reprocess(db: Session, account: Account, image: Image) -> Image:
    """RF011 note 5: at most 3 manual requests per image in 24 h."""
    if not can_manage_image(account, image):
        raise PermissionDenied("Você só pode reprocessar as imagens que enviou.")
    if image.review_status != ImageReviewStatus.PUBLISHED:
        raise EventError("Só imagens publicadas passam pela indexação facial.")
    now = _now()
    if image.reprocess_window_start is None or now - image.reprocess_window_start > timedelta(hours=24):
        image.reprocess_window_start, image.reprocess_requests = now, 0
    if image.reprocess_requests >= MAX_REPROCESS_PER_DAY:
        raise EventError("Limite de 3 reprocessamentos em 24 horas atingido para esta imagem.")
    image.reprocess_requests += 1
    image.indexing_status = ImageIndexingStatus.PENDING
    image.indexing_attempts, image.next_attempt_at, image.last_error = 0, None, None
    audit.record(db, "image.reprocess", account.id, "image", image.id)
    db.commit()
    return image


# ------------------------------------------------------------------ queries

FILTERS = {
    "in_review": Image.review_status == ImageReviewStatus.IN_REVIEW,
    "discarded": Image.review_status == ImageReviewStatus.DISCARDED,
    "published": Image.review_status == ImageReviewStatus.PUBLISHED,
    "no_faces": Image.indexing_status == ImageIndexingStatus.NO_FACES,
    "failed": Image.indexing_status == ImageIndexingStatus.FAILED,
    "removal": Image.removal_requested_at.is_not(None),
}


def list_images(db: Session, account: Account, event: Event, filter_: str = "all", mine: bool = False) -> list[Image]:
    q = select(Image).where(Image.event_id == event.id)
    if filter_ in FILTERS:
        q = q.where(FILTERS[filter_])
    if mine:
        q = q.where(Image.uploaded_by == account.id)
    return list(db.scalars(q.order_by(Image.uploaded_at, Image.id)))


def counts(db: Session, event: Event, account: Account) -> dict:
    out = {key: db.scalar(select(func.count()).select_from(Image).where(Image.event_id == event.id, cond)) or 0
           for key, cond in FILTERS.items()}
    out["all"] = db.scalar(select(func.count()).select_from(Image).where(Image.event_id == event.id)) or 0
    out["mine"] = db.scalar(select(func.count()).select_from(Image).where(
        Image.event_id == event.id, Image.uploaded_by == account.id)) or 0
    return out


def processing_status(db: Session, event: Event) -> dict:
    """Progress of the indexing of the published images (RF006 note 2, RF011 note 6)."""
    rows = dict(db.execute(select(Image.indexing_status, func.count()).where(
        Image.event_id == event.id, Image.review_status == ImageReviewStatus.PUBLISHED)
        .group_by(Image.indexing_status)).all())
    total = sum(rows.values())
    pending = rows.get(ImageIndexingStatus.PENDING, 0)
    from app.db.models import FaceEmbedding
    faces = db.scalar(select(func.count()).select_from(FaceEmbedding).where(FaceEmbedding.event_id == event.id)) or 0
    done = total - pending
    return {"total": total, "processed": rows.get(ImageIndexingStatus.PROCESSED, 0), "pending": pending,
            "no_faces": rows.get(ImageIndexingStatus.NO_FACES, 0), "failed": rows.get(ImageIndexingStatus.FAILED, 0),
            "faces": faces, "percent": round(100 * done / total) if total else 100, "event_status": event.status.value}
