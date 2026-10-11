"""Operation-area image routes (RF007-RF012). All require a session; none is public."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import SESSION_COOKIE, current_account
from app.auth.tokens import token_hash
from app.db.models import Account, Image, PackageJob
from app.db.session import get_session
from app.events import service as events
from app.images import service
from app.images.processing import MAX_BYTES, FileRejected, credit_line
from app.packages import service as packages
from app.security import signed_links
from app.storage.factory import get_storage
from app.storage.port import ObjectStorage

router = APIRouter(tags=["images"])
REMOVAL_HOURS = 72  # RF023


class ImageOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    review_status: str
    indexing_status: str
    faces_count: int | None
    credit: str
    signature: str
    uploaded_at: datetime
    captured_at: datetime | None
    size_bytes: int
    width: int
    height: int
    mine: bool
    can_manage: bool
    removal_deadline: datetime | None
    version: str          # changes when the file is replaced: part of the image address


def _out(account: Account, image: Image) -> ImageOut:
    return ImageOut(
        id=image.id, event_id=image.event_id, review_status=image.review_status.value,
        indexing_status=image.indexing_status.value, faces_count=image.faces_count,
        credit=credit_line(image.credit_signature), signature=image.credit_signature, uploaded_at=image.uploaded_at,
        captured_at=image.captured_at, size_bytes=image.size_bytes, width=image.width, height=image.height,
        mine=image.uploaded_by == account.id, can_manage=service.can_manage_image(account, image),
        removal_deadline=image.removal_requested_at + timedelta(hours=REMOVAL_HOURS) if image.removal_requested_at else None,
        version=image.sha256[:12])


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, FileRejected):
        code = status.HTTP_409_CONFLICT if exc.reason == "duplicate" else status.HTTP_400_BAD_REQUEST
        return HTTPException(code, {"message": str(exc), "reason": exc.reason})
    if isinstance(exc, events.NotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    if isinstance(exc, events.PermissionDenied):
        return HTTPException(status.HTTP_403_FORBIDDEN, str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


def _event(db: Session, account: Account, event_id: uuid.UUID):
    try:
        return events.get_visible(db, account, event_id)
    except events.EventError as exc:
        raise _http(exc) from None


def _image(db: Session, account: Account, image_id: uuid.UUID) -> Image:
    try:
        return service.get_image(db, image_id, account)
    except events.EventError as exc:
        raise _http(exc) from None


# ------------------------------------------------------------------ upload

class ChecksumsIn(BaseModel):
    checksums: list[str] = Field(max_length=300)  # RF007: at most 300 files per operation


@router.post("/events/{event_id}/images/check")
def check_duplicates(event_id: uuid.UUID, body: ChecksumsIn, account: Account = Depends(current_account),
                     db: Session = Depends(get_session)):
    event = _event(db, account, event_id)
    if not service.can_upload(account, event):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não pode enviar imagens a este evento.")
    c = service.counts(db, event, account)
    return {"existing": sorted(service.existing_checksums(db, event, body.checksums)),
            "remaining_capacity": max(0, service.MAX_PER_EVENT - (c["all"] - c["discarded"]))}


@router.post("/events/{event_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload(event_id: uuid.UUID, file: UploadFile = File(...), account: Account = Depends(current_account),
                 db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    event = _event(db, account, event_id)
    data = await file.read(MAX_BYTES + 1)
    try:
        return _out(account, service.upload_image(db, storage, account, event, data))
    except (FileRejected, events.EventError) as exc:
        raise _http(exc) from None


# ------------------------------------------------------------------ listing and files

@router.get("/events/{event_id}/images")
def list_images(event_id: uuid.UUID, filter: str = Query("all"), mine: bool = False,
                account: Account = Depends(current_account), db: Session = Depends(get_session)):
    event = _event(db, account, event_id)
    return {"items": [_out(account, i) for i in service.list_images(db, account, event, filter, mine)],
            "counts": service.counts(db, event, account)}


@router.get("/images/{image_id}", response_model=ImageOut)
def get_image(image_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    return _out(account, _image(db, account, image_id))


@router.get("/images/{image_id}/{variant}")
def image_file(image_id: uuid.UUID, variant: str, account: Account = Depends(current_account),
               db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    """Reduced copies for the screens (RF011 note 3: viewing an event's images without facial
    search exists ONLY for accounts, for technical review).

    Served by the API at a STABLE address so the browser can reuse it while scrolling: a
    signed storage link changes on every request and defeated the cache. "private" keeps it
    in this browser only; the session is checked on every request that reaches the server."""
    image = _image(db, account, image_id)
    key = {"thumb": image.thumb_key, "preview": image.preview_key}.get(variant)
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return Response(storage.get(key), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


# ------------------------------------------------------------------ review

@router.post("/images/{image_id}/discard", response_model=ImageOut)
def discard(image_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    try:
        return _out(account, service.set_discarded(db, account, _image(db, account, image_id), True))
    except events.EventError as exc:
        raise _http(exc) from None


@router.post("/images/{image_id}/restore", response_model=ImageOut)
def restore(image_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    try:
        return _out(account, service.set_discarded(db, account, _image(db, account, image_id), False))
    except events.EventError as exc:
        raise _http(exc) from None


@router.put("/images/{image_id}/file", response_model=ImageOut)
async def replace(image_id: uuid.UUID, file: UploadFile = File(...), account: Account = Depends(current_account),
                  db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    image = _image(db, account, image_id)
    data = await file.read(MAX_BYTES + 1)
    try:
        return _out(account, service.replace_file(db, storage, account, image, data))
    except (FileRejected, events.EventError) as exc:
        raise _http(exc) from None


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(image_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session),
           storage: ObjectStorage = Depends(get_storage)):
    try:
        service.delete_image(db, storage, account, _image(db, account, image_id))
    except events.EventError as exc:
        raise _http(exc) from None


class IdsIn(BaseModel):
    ids: list[uuid.UUID] = Field(max_length=1000)


@router.post("/events/{event_id}/images/delete")
def delete_many(event_id: uuid.UUID, body: IdsIn, account: Account = Depends(current_account),
                db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    """Batch deletion; the screen shows the quantity before confirming (RF011 note 4).
    Each image is checked on its own: a collaborator's selection never deletes others' work."""
    event = _event(db, account, event_id)
    deleted, refused = 0, 0
    for image_id in body.ids:
        image = db.get(Image, image_id)
        if image is None or image.event_id != event.id or not service.can_manage_image(account, image):
            refused += 1
            continue
        service.delete_image(db, storage, account, image)
        deleted += 1
    return {"deleted": deleted, "refused": refused}


@router.post("/events/{event_id}/publish")
def publish(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session),
            storage: ObjectStorage = Depends(get_storage)):
    try:
        s = service.publish(db, storage, account, _event(db, account, event_id))
    except events.EventError as exc:
        raise _http(exc) from None
    return {"sent": s.sent, "discarded": s.discarded, "published": s.published}


# ------------------------------------------------------------------ indexing

@router.get("/events/{event_id}/processing")
def processing(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    return service.processing_status(db, _event(db, account, event_id))


@router.post("/images/{image_id}/reprocess", response_model=ImageOut)
def reprocess(image_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    try:
        return _out(account, service.request_reprocess(db, account, _image(db, account, image_id)))
    except events.EventError as exc:
        raise _http(exc) from None


@router.post("/events/{event_id}/images/reprocess-failed")
def reprocess_failed(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    """"Reprocessar elegíveis": failed images the account may manage, within the daily limit."""
    event = _event(db, account, event_id)
    queued = 0
    for image in service.list_images(db, account, event, "failed"):
        if service.can_manage_image(account, image):
            try:
                service.request_reprocess(db, account, image)
                queued += 1
            except events.EventError:
                pass
    return {"queued": queued}


# ------------------------------------------------------------------ package (RF012)

class PackageOut(BaseModel):
    id: uuid.UUID
    status: str
    file_name: str
    image_count: int
    size_bytes: int
    progress: int
    only_own: bool


def _package_out(job: PackageJob) -> PackageOut:
    return PackageOut(id=job.id, status=job.status.value, file_name=job.file_name, image_count=job.image_count,
                      size_bytes=job.size_bytes, progress=job.progress, only_own=job.only_own)


@router.get("/events/{event_id}/package/estimate")
def package_estimate(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    return packages.estimate(db, account, _event(db, account, event_id))


@router.post("/events/{event_id}/package", response_model=PackageOut, status_code=status.HTTP_202_ACCEPTED)
def request_package(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    try:
        return _package_out(packages.request_package(db, account, _event(db, account, event_id)))
    except events.EventError as exc:
        raise _http(exc) from None


@router.get("/packages/{package_id}", response_model=PackageOut)
def package_status(package_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    job = db.get(PackageJob, package_id)
    if job is None or job.account_id != account.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pacote não encontrado.")
    return _package_out(job)


def _package(db: Session, account: Account, package_id: uuid.UUID) -> PackageJob:
    job = db.get(PackageJob, package_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pacote não encontrado.")
    try:
        packages.check_downloadable(account, job)
    except events.EventError as exc:
        raise _http(exc) from None
    return job


@router.post("/packages/{package_id}/download-link")
def package_download_link(package_id: uuid.UUID, request: Request, account: Account = Depends(current_account),
                          db: Session = Depends(get_session)):
    """RF012 note 5: link valid for 30 minutes, for THIS account and THIS login session only."""
    _package(db, account, package_id)
    token = signed_links.sign(token_hash(request.cookies[SESSION_COOKIE]), f"package:{package_id}",
                              packages.LINK_MINUTES * 60)
    return {"url": f"/api/v1/packages/{package_id}/download?t={token}"}


@router.get("/packages/{package_id}/download")
def package_download(package_id: uuid.UUID, request: Request, t: str | None = None,
                     account: Account = Depends(current_account), db: Session = Depends(get_session),
                     storage: ObjectStorage = Depends(get_storage)):
    """Streams the ZIP piece by piece through the API (it can exceed 10 GB): the storage address
    never reaches the browser — nor the "Where from" the browser writes into the file."""
    job = _package(db, account, package_id)
    if not signed_links.verify(token_hash(request.cookies[SESSION_COOKIE]), f"package:{package_id}", t):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Link de download expirado. Prepare ou baixe o arquivo de novo.")
    packages.record_download(db, account, job)
    size, chunks = storage.stream(job.object_key)
    return StreamingResponse(chunks, media_type="application/zip", headers={
        "Content-Length": str(size), "Cache-Control": "no-store",
        "Content-Disposition": f"attachment; filename=\"FOTOMAC.zip\"; filename*=UTF-8''{quote(job.file_name)}"})
