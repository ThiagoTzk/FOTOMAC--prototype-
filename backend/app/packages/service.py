"""Download of the whole collection as a ZIP (RF012) — generated in the background.

Two kinds of package (RF012 note 2):
- the GUARD copy (responsible, administrator, an author's own photos): the originals as received,
  RAW and HEIC included — they already carry the credits and no GPS (done at upload), so the
  package is a plain copy of them, without recompression;
- marketing's PUBLICITY package of someone else's event (RF030 note 3): the JPEG copies.
Neither has a watermark: the accounts work for CESMAC (RF019 note 9).
"""
from __future__ import annotations

import os
import re
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.db.models import Account, AccountRole, Event, EventStatus, Image, ImageReviewStatus, PackageJob, PackageStatus
from app.events.service import EventError, PermissionDenied, can_manage
from app.storage.port import ObjectStorage

LINK_MINUTES = 30        # RF012 note 5
KEEP_MINUTES = 60        # the ZIP itself is deleted after this (a new one can be prepared)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe(name: str) -> str:
    """File/folder name from the event name: accents kept, path characters removed."""
    return re.sub(r"[\\/:*?\"<>|]+", "-", name).strip(" .") or "evento"


def _scope(account: Account, event: Event):
    """(only_own, publicity, query). Responsible/admin: every published image. Marketing on someone
    else's published event: every published image, as JPEG copies (RF030). Collaborator: only their
    own (RF012 note 7). Never an image whose removal was asked (RF012 note 8)."""
    q = select(Image).where(Image.event_id == event.id, Image.review_status == ImageReviewStatus.PUBLISHED,
                            Image.removal_requested_at.is_(None))
    if can_manage(account, event):
        return False, False, q
    if account.role == AccountRole.MARKETING and event.status == EventStatus.PUBLISHED:
        return False, True, q
    return True, False, q.where(Image.uploaded_by == account.id)


def _entry(image: Image, publicity: bool) -> tuple[str, str]:
    """(storage key, file extension) of what goes into the package for this image."""
    if image.source_key and not publicity:
        return image.source_key, image.source_format
    return image.object_key, "jpg"


def estimate(db: Session, account: Account, event: Event) -> dict:
    """RF012 note 4: the volume is shown before preparing."""
    own_only, publicity, q = _scope(account, event)
    sub = q.subquery()
    size = sub.c.size_bytes if publicity else func.coalesce(sub.c.source_bytes, sub.c.size_bytes)
    count, total, others = db.execute(select(func.count(), func.coalesce(func.sum(size), 0),
                                             func.count(sub.c.source_key))).one()
    return {"images": count, "size_bytes": int(total), "only_own": own_only, "publicity": publicity,
            "other_formats": 0 if publicity else others}


def request_package(db: Session, account: Account, event: Event) -> PackageJob:
    own_only, publicity, q = _scope(account, event)
    if own_only and not db.scalar(select(func.count()).select_from(q.subquery())):
        raise PermissionDenied("Você não tem imagens publicadas neste evento.")
    if not db.scalar(select(func.count()).select_from(q.subquery())):
        raise EventError("O evento ainda não tem imagens publicadas.")
    base = _safe(event.name)
    if own_only:
        name = f"{base} - {_safe(account.photographer_signature or account.full_name)}.zip"
    else:
        name = f"{base} - divulgação.zip" if publicity else f"{base}.zip"
    job = PackageJob(id=uuid.uuid4(), event_id=event.id, account_id=account.id, only_own=own_only,
                     publicity=publicity, file_name=name)
    db.add(job)
    # RF012 note 6 and RF030 note 4: mandatory audit trail of who extracted which collection, and when.
    audit.record(db, "package.request", account.id, "event", event.id, only_own=own_only, publicity=publicity)
    db.commit()
    return job


def build_next(db: Session, storage: ObjectStorage) -> bool:
    job = db.scalar(select(PackageJob).where(PackageJob.status == PackageStatus.PENDING)
                    .order_by(PackageJob.created_at).limit(1).with_for_update(skip_locked=True))
    if job is None:
        return False
    job.status = PackageStatus.RUNNING
    db.commit()
    account = db.get(Account, job.account_id)
    _, publicity, q = _scope(account, job.event)
    images = db.scalars(q.order_by(Image.uploaded_at, Image.id)).all()
    folder = _safe(job.event.name)  # one single folder named after the event (RF012 note 3)
    # The ZIP is assembled in a private temporary file (it contains personal data) that is
    # removed in every case, success or failure.
    fd, path = tempfile.mkstemp(prefix="fotomac-", suffix=".zip")
    os.close(fd)
    try:
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as z:  # JPEG does not compress further
            for n, image in enumerate(images, start=1):
                key, ext = _entry(image, publicity)
                z.writestr(f"{folder}/{folder} {n:04d}.{ext}", storage.get(key))
                if n % 20 == 0:
                    job.progress = round(100 * n / len(images))
                    db.commit()
        key = f"packages/{job.id}.zip"
        storage.put_file(key, path, "application/zip")
        job.object_key, job.image_count, job.size_bytes = key, len(images), os.path.getsize(path)
        job.status, job.progress, job.finished_at = PackageStatus.READY, 100, _now()
        job.expires_at = _now() + timedelta(minutes=KEEP_MINUTES)
    except Exception:
        db.rollback()
        job = db.get(PackageJob, job.id)
        job.status = PackageStatus.FAILED
    finally:
        os.remove(path)
    db.commit()
    return True


def check_downloadable(account: Account, job: PackageJob) -> None:
    """Only the account that asked, and only while the ZIP exists (RF012 note 5)."""
    if job.account_id != account.id:
        raise PermissionDenied("Este pacote foi solicitado por outra conta.")
    if job.status != PackageStatus.READY or not job.object_key:
        raise EventError("O pacote não está disponível. Prepare um novo arquivo.")


def record_download(db: Session, account: Account, job: PackageJob) -> None:
    audit.record(db, "package.download", account.id, "event", job.event_id, package=str(job.id))  # RF012 note 6
    db.commit()


def expire_packages(db: Session, storage: ObjectStorage) -> None:
    for job in db.scalars(select(PackageJob).where(PackageJob.status == PackageStatus.READY,
                                                   PackageJob.expires_at < _now())):
        if job.object_key:
            storage.delete(job.object_key)
        job.status, job.object_key = PackageStatus.EXPIRED, None
    db.commit()
