"""PUBLIC routes: /api/v1/public/* — no account, no login (RF002 note 5).

Only consultation is exposed here: it is technically impossible to create, change or delete
anything from these routes, except a visitor's consent record and a removal REQUEST.
"""
from __future__ import annotations

import uuid
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db.models import Theme
from app.db.session import get_session
from app.events import dates
from app.events.service import EventError, NotFound
from app.face.factory import get_face_engine
from app.face.port import FaceEngine
from app.images.processing import credit_line
from app.notifications.factory import get_email_sender
from app.notifications.port import EmailSender
from app.public import service
from app.security.rate_limit import RateLimiter
from app.storage.factory import get_storage
from app.storage.port import ObjectStorage

router = APIRouter(prefix="/public", tags=["public"])
VISIT_COOKIE = "fotomac_visit"

# RF016 note 8 / RS004 / RS017: inference is expensive and could be used to sweep a collection.
search_limiter = RateLimiter(max_requests=20, window_seconds=600)
download_limiter = RateLimiter(max_requests=60, window_seconds=600)
consent_limiter = RateLimiter(max_requests=30, window_seconds=600)
removal_limiter = RateLimiter(max_requests=10, window_seconds=3600)


def apply_limits(db: Session) -> None:
    """The administrator sets these numbers (RF026 "Limites de Requisição"); applied at startup
    and right after every change. (In-process limiters: with several API processes, each one
    keeps its own count — a shared store such as Redis would be the next step.)"""
    from app import parameters
    search_limiter.max_requests = parameters.get(db, "searches_per_address")
    download_limiter.max_requests = parameters.get(db, "downloads_per_address")


class ThemeOut(BaseModel):
    id: int
    name: str


class PublicEvent(BaseModel):
    id: uuid.UUID
    name: str
    date_label: str
    date_start: date
    date_end: date
    date_precision: str
    location: str
    description: str
    themes: list[ThemeOut]
    photos: int
    credits: list[str]
    expires_on: date


def _out(db: Session, e) -> PublicEvent:
    return PublicEvent(id=e.id, name=e.name, date_label=dates.label(e.date_precision, e.date_start, e.date_end),
                       date_start=e.date_start, date_end=e.date_end, date_precision=e.date_precision.value,
                       location=e.location, description=e.description,
                       themes=[ThemeOut(id=t.id, name=t.name) for t in sorted(e.themes, key=lambda t: t.name)],
                       photos=service.published_count(db, e.id), credits=service.credits(db, e), expires_on=e.expires_on)


def _event(db: Session, event_id: uuid.UUID):
    try:
        return service.get_public_event(db, event_id)
    except NotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None


def _visit(request: Request, db: Session, event_id: uuid.UUID | None = None):
    return service.get_session(db, request.cookies.get(VISIT_COOKIE), event_id)


# ------------------------------------------------------------------ listing (RF013, RF014)

@router.get("/themes", response_model=list[ThemeOut])
def themes(db: Session = Depends(get_session)):
    return [ThemeOut(id=t.id, name=t.name) for t in db.scalars(select(Theme).where(Theme.active.is_(True)).order_by(Theme.name))]


@router.get("/events")
def list_events(q: str | None = Query(None, max_length=150), theme_id: list[int] = Query([]), day: date | None = None,
                period_start: date | None = None, period_end: date | None = None, page: int = Query(1, ge=1),
                db: Session = Depends(get_session)):
    items, total = service.list_public_events(db, q, theme_id, day, period_start, period_end, page)
    return {"items": [_out(db, e) for e in items], "total": total, "page": page, "page_size": 20}  # RF013 note 7


@router.get("/events/{event_id}", response_model=PublicEvent)
def get_event(event_id: uuid.UUID, db: Session = Depends(get_session)):
    return _out(db, _event(db, event_id))


@router.get("/events/{event_id}/cover")
def cover(event_id: uuid.UUID, db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    """The ONLY image of an event shown without facial search (RF013 note 2)."""
    event = _event(db, event_id)
    if not event.cover_object_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento sem capa.")
    return Response(storage.get(event.cover_object_key), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


# ------------------------------------------------------------------ consent (RF015)

@router.get("/consent")
def consent_text(db: Session = Depends(get_session)):
    return {"version": service.CONSENT_VERSION, "title": service.CONSENT_TITLE,
            "paragraphs": service.CONSENT_PARAGRAPHS, "retention": service.retention_text(db)}


@router.post("/events/{event_id}/consent", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(consent_limiter)])
def give_consent(event_id: uuid.UUID, response: Response, db: Session = Depends(get_session)):
    """The explicit "Estou ciente" (RF015 note 5: no pre-checked option, no tacit acceptance)."""
    token = service.give_consent(db, _event(db, event_id))
    response.set_cookie(VISIT_COOKIE, token, max_age=service.SESSION_HOURS * 3600, httponly=True,
                        secure=get_settings().cookie_secure, samesite="lax", path="/api/v1/public")


# ------------------------------------------------------------------ search (RF016-RF018)

class ResultItem(BaseModel):
    id: uuid.UUID
    captured_at: str | None
    credit: str


def _result_items(db: Session, ids: list[uuid.UUID]) -> list[ResultItem]:
    from app.db.models import Image
    images = {i.id: i for i in db.scalars(select(Image).where(Image.id.in_(ids)))} if ids else {}
    return [ResultItem(id=i, captured_at=images[i].captured_at.isoformat() if images[i].captured_at else None,
                       credit=credit_line(images[i].credit_signature))
            for i in ids if i in images and images[i].removal_requested_at is None]


@router.post("/events/{event_id}/search", dependencies=[Depends(search_limiter)])
async def search(event_id: uuid.UUID, request: Request, selfie: UploadFile = File(...), db: Session = Depends(get_session),
                 engine: FaceEngine = Depends(get_face_engine)):
    """Camera capture and gallery upload are treated IDENTICALLY (RF016 note 2)."""
    event = _event(db, event_id)
    data = await selfie.read(service.MAX_SELFIE_BYTES + 1)
    try:
        matches = service.search(db, engine, _visit(request, db, event_id), event, data)
    except service.PublicError as exc:
        code = status.HTTP_403_FORBIDDEN if exc.reason == "consent_required" else (
            status.HTTP_429_TOO_MANY_REQUESTS if exc.reason == "limit" else status.HTTP_422_UNPROCESSABLE_ENTITY)
        raise HTTPException(code, {"message": str(exc), "reason": exc.reason}) from None
    finally:
        del data  # the selfie bytes are dropped as soon as the search ends (RF016 note 4)
    return {"items": _result_items(db, [m.image_id for m in matches])}


@router.post("/session/end", status_code=status.HTTP_204_NO_CONTENT)
def end_visit(request: Request, db: Session = Depends(get_session)):
    """Called when the visitor leaves the event page (or closes/reloads the tab). The session
    row is deleted, which makes the cookie worthless; the cookie itself is not touched, so a
    late answer can never erase the cookie of a NEW consent given meanwhile."""
    service.end_session(db, request.cookies.get(VISIT_COOKIE))


def _allowed(request: Request, db: Session, image_id: uuid.UUID):
    try:
        return service.allowed_image(db, _visit(request, db), image_id)
    except EventError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None


@router.post("/images/{image_id}/download-link", dependencies=[Depends(download_limiter)])
def download_link(image_id: uuid.UUID, request: Request, db: Session = Depends(get_session)):
    """RF019: the download address — signed, 15 minutes, this session and this image only."""
    _allowed(request, db, image_id)
    token = service.download_token(_visit(request, db), image_id)
    return {"url": f"/api/v1/public/images/{image_id}/download?t={token}"}


@router.get("/images/{image_id}/download")
def download(image_id: uuid.UUID, request: Request, t: str | None = None, db: Session = Depends(get_session),
             storage: ObjectStorage = Depends(get_storage)):
    """Delivers the ORIGINAL (credits in the metadata, no GPS, no recompression), one image per
    operation. Served by the API itself: the storage address never reaches the browser — nor
    the "Where from" that the browser writes into the downloaded file."""
    image = _allowed(request, db, image_id)
    if not service.valid_download_token(_visit(request, db), image_id, t):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Link de download expirado. Abra a foto e toque em “Baixar” de novo.")
    audit.record(db, "public.download", None, "image", image.id, event_id=str(image.event_id))  # no visitor data (note 8)
    db.commit()
    name = f"FOTOMAC - {image.event.name}.jpg".replace("/", "-").replace('"', "")
    disposition = f"attachment; filename=\"FOTOMAC.jpg\"; filename*=UTF-8''{quote(name)}"
    return Response(storage.get(image.object_key), media_type="image/jpeg",
                    headers={"Content-Disposition": disposition, "Cache-Control": "no-store"})


@router.get("/images/{image_id}/{variant}")
def image_file(image_id: uuid.UUID, variant: str, request: Request, db: Session = Depends(get_session),
               storage: ObjectStorage = Depends(get_storage)):
    image = _allowed(request, db, image_id)
    key = {"thumb": image.thumb_key, "preview": image.preview_key}.get(variant)
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    # Reduced copy for the screen (RF018 note 2). "no-store": not even the browser cache keeps
    # it — on a shared computer the cache would show the photos to the next person.
    return Response(storage.get(key), media_type="image/jpeg", headers={"Cache-Control": "no-store"})


# ------------------------------------------------------------------ removal (RF023)

class RemovalIn(BaseModel):
    contact_email: str = Field(max_length=120)
    reason: str | None = Field(None, max_length=500)


@router.post("/images/{image_id}/removal", dependencies=[Depends(removal_limiter)])
def request_removal(image_id: uuid.UUID, body: RemovalIn, request: Request, db: Session = Depends(get_session),
                    sender: EmailSender = Depends(get_email_sender)):
    try:
        req = service.request_removal(db, sender, _visit(request, db), image_id, body.contact_email, body.reason)
    except service.PublicError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {"message": str(exc), "reason": exc.reason}) from None
    except EventError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    return {"deadline": req.deadline_at.isoformat()}


@router.post("/removal", dependencies=[Depends(removal_limiter)])
async def request_removal_by_file(file: UploadFile = File(...), contact_email: str = Form(..., max_length=120),
                                  reason: str | None = Form(None, max_length=500), db: Session = Depends(get_session),
                                  sender: EmailSender = Depends(get_email_sender)):
    """For anyone, with or without a search: identifies the image by the downloaded file itself."""
    data = await file.read(service.MAX_SELFIE_BYTES * 3 + 1)
    try:
        req = service.request_removal_by_file(db, sender, data, contact_email, reason)
    except service.PublicError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {"message": str(exc), "reason": exc.reason}) from None
    finally:
        del data  # the file is used only to compute its checksum
    return {"deadline": req.deadline_at.isoformat()}


@router.get("/privacy")
def privacy(db: Session = Depends(get_session)):
    """Data for the Privacy Policy page (RF022): the retention shown is the one in force (note 5)."""
    return {"retention": service.retention_text(db), "consent_version": service.CONSENT_VERSION,
            "controller": "Centro Universitário CESMAC",
            "dpo": None}  # RF022 note 7: to be appointed by the institution (requirements §11, item 5)
