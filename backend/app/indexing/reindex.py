"""Re-indexing of the published collection (RF028) — e.g. after replacing the face engine.

Its own queue (reindex_items), served by the worker only when the publication queue is empty,
so re-indexing never delays a new event (note 2). Only published images are touched (note 1).
For each image the NEW vectors are written first and the old ones deleted after, in the same
transaction: the image is never left unsearchable (note 3). Vectors of different dimensions can
coexist (the column has no fixed dimension; see migration 0001).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit, parameters
from app.db.models import (Account, Event, FaceEmbedding, Image, ImageIndexingStatus, ImageReviewStatus, ReindexItem,
                           ReindexJob, ReindexScope)
from app.events.service import EventError
from app.face.port import FaceEngine
from app.imaging import decode_image
from app.institutional import service as institutional
from app.storage.port import ObjectStorage

MAX_ATTEMPTS = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def model_versions(db: Session) -> list[str]:
    stored = set(db.scalars(select(FaceEmbedding.model_version).distinct()))
    stored |= {v for v in db.scalars(select(Image.indexing_model_version).distinct()) if v}
    return sorted(stored)


def outdated_count(db: Session, version: str | None) -> int:
    """Published photos whose vectors are NOT of the engine in use — the search does not find them
    until they are re-indexed. Shown in the panel so the administrator never misses it."""
    if version is None:
        return 0
    return db.scalar(select(func.count()).select_from(Image).where(
        Image.review_status == ImageReviewStatus.PUBLISHED, Image.removal_requested_at.is_(None),
        Image.indexing_status.in_([ImageIndexingStatus.PROCESSED, ImageIndexingStatus.NO_FACES]),
        Image.indexing_model_version != version)) or 0


def request(db: Session, admin: Account, engine: FaceEngine, scope: ReindexScope,
            event_id: uuid.UUID | None = None, from_version: str | None = None) -> ReindexJob:
    query = select(Image.id).where(Image.review_status == ImageReviewStatus.PUBLISHED,
                                   Image.removal_requested_at.is_(None))
    if scope == ReindexScope.EVENT:
        if event_id is None or db.get(Event, event_id) is None:
            raise EventError("Escolha o evento a reindexar.")
        query = query.where(Image.event_id == event_id)
    elif scope == ReindexScope.MODEL_VERSION:
        if not from_version:
            raise EventError("Escolha a versão de modelo a substituir.")
        with_vectors = select(FaceEmbedding.image_id).where(FaceEmbedding.model_version == from_version)
        query = query.where(or_(Image.indexing_model_version == from_version, Image.id.in_(with_vectors)))
    # An image already waiting in another re-indexing is not queued twice.
    queued = select(ReindexItem.image_id).where(ReindexItem.status == "pending")
    ids = db.scalars(query.where(Image.id.not_in(queued))).all()
    if not ids:
        raise EventError("Nenhuma imagem publicada a reindexar nesse escopo (ou elas já estão na fila).")
    job = ReindexJob(id=uuid.uuid4(), scope=scope, event_id=event_id, from_version=from_version,
                     to_version=engine.model_version, requested_by=admin.id, total=len(ids))
    db.add(job)
    db.flush()
    db.add_all([ReindexItem(job_id=job.id, image_id=i) for i in ids])
    # RF028 "Registro da Operação": scope, source version, target version, administrator.
    audit.record(db, "reindex.requested", admin.id, "reindex", job.id, scope=scope.value, images=len(ids),
                 event_id=str(event_id) if event_id else None, from_version=from_version, to_version=engine.model_version)
    db.commit()
    return job


def reindex_next(db: Session, storage: ObjectStorage, engine: FaceEngine) -> bool:
    item = db.scalar(select(ReindexItem).where(ReindexItem.status == "pending")
                     .order_by(ReindexItem.job_id).limit(1).with_for_update(skip_locked=True))
    if item is None:
        return False
    image = db.get(Image, item.image_id)
    if (image is None or image.review_status != ImageReviewStatus.PUBLISHED or image.removal_requested_at
            or image.event.deletion_due_at):  # an event being deleted never gets its vectors back
        item.status = "skipped"  # deleted, or on its way out, since the request
        db.commit()
        _finish(db, item.job_id)
        return True
    try:
        floor = parameters.get(db, "min_detection_score")
        faces = [f for f in engine.detect(decode_image(storage.get(image.object_key))) if f.detection_score >= floor]
        old = list(db.scalars(select(FaceEmbedding.id).where(FaceEmbedding.image_id == image.id)))
        for face in faces:  # 1) the new vectors...
            db.add(FaceEmbedding(image_id=image.id, event_id=image.event_id, model_version=engine.model_version,
                                 dim=engine.vector_dim, embedding=face.embedding, bbox_x=face.bbox.x,
                                 bbox_y=face.bbox.y, bbox_width=face.bbox.width, bbox_height=face.bbox.height,
                                 detection_score=face.detection_score))
        db.flush()
        if old:  # 2) ...only then the previous ones (note 3)
            db.query(FaceEmbedding).filter(FaceEmbedding.id.in_(old)).delete(synchronize_session=False)
        image.faces_count = len(faces)
        image.indexing_status = ImageIndexingStatus.PROCESSED if faces else ImageIndexingStatus.NO_FACES
        image.indexed_at, image.indexing_model_version, image.last_error = _now(), engine.model_version, None
        db.flush()
        institutional.mark_image(db, image, engine.model_version)   # RF021: the new vectors are compared too
        item.status = "done"
    except Exception as exc:  # one bad file never stops the queue
        db.rollback()
        item = db.get(ReindexItem, (item.job_id, item.image_id))
        item.attempts += 1
        if item.attempts >= MAX_ATTEMPTS:
            item.status = "failed"  # the old vectors are still there: the photo stays searchable
        image = db.get(Image, item.image_id)
        image.last_error = type(exc).__name__[:200]
    db.commit()
    _finish(db, item.job_id)
    return True


def _finish(db: Session, job_id: uuid.UUID) -> None:
    job = db.get(ReindexJob, job_id)
    if job.finished_at is not None:
        return
    pending = db.scalar(select(func.count()).select_from(ReindexItem).where(
        ReindexItem.job_id == job_id, ReindexItem.status == "pending"))
    if pending:
        return
    job.finished_at = _now()
    counts = progress(db, job)
    audit.record(db, "reindex.finished", None, "reindex", job.id, done=counts["done"], failed=counts["failed"],
                 skipped=counts["skipped"])
    db.commit()


def progress(db: Session, job: ReindexJob) -> dict:
    rows = dict(db.execute(select(ReindexItem.status, func.count()).where(ReindexItem.job_id == job.id)
                           .group_by(ReindexItem.status)).all())
    counts = {s: rows.get(s, 0) for s in ("pending", "done", "failed", "skipped")}
    finished = counts["done"] + counts["failed"] + counts["skipped"]
    counts["percent"] = round(100 * finished / job.total) if job.total else 100
    return counts


def progress_by_event(db: Session, job: ReindexJob) -> list[dict]:
    """RF028 "Indicador de Progresso": per event and for the whole job."""
    done = func.count().filter(ReindexItem.status != "pending")
    rows = db.execute(select(Event.id, Event.name, func.count(), done)
                      .join(Image, Image.id == ReindexItem.image_id).join(Event, Event.id == Image.event_id)
                      .where(ReindexItem.job_id == job.id).group_by(Event.id, Event.name).order_by(Event.name)).all()
    return [{"event_id": r[0], "name": r[1], "total": r[2], "finished": r[3],
             "percent": round(100 * r[3] / r[2]) if r[2] else 100} for r in rows]
