"""Operation-area event routes: /api/v1/events/*, /api/v1/themes, /api/v1/dashboard.
Every route requires a valid session (RF002 note 5): there is no public write path."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_account
from app.db.models import Account, DatePrecision, Event, EventStatus, Theme
from app.db.session import get_session
from app.events import dates, service
from app.parameters import new_expiry, retention_months
from app.storage.factory import get_storage
from app.storage.port import ObjectStorage

router = APIRouter(tags=["events"])


class ThemeOut(BaseModel):
    id: int
    name: str


class PersonOut(BaseModel):
    id: uuid.UUID
    full_name: str


class CollaboratorOut(BaseModel):
    signature: str
    photos: int


class EventOut(BaseModel):
    id: uuid.UUID
    name: str
    date_precision: str
    date_start: date
    date_end: date
    date_label: str
    location: str
    description: str
    themes: list[ThemeOut]
    status: str
    collaboration_open: bool
    expires_on: date
    owner: PersonOut
    relation: str          # owner | collaborator | admin
    can_manage: bool
    photos: int
    published: int
    collaborators: list[CollaboratorOut]


class EventPage(BaseModel):
    items: list[EventOut]
    total: int
    page: int
    page_size: int


def _out(account: Account, event: Event, stats: service.EventStats) -> EventOut:
    return EventOut(
        id=event.id, name=event.name, date_precision=event.date_precision.value,
        date_start=event.date_start, date_end=event.date_end,
        date_label=dates.label(event.date_precision, event.date_start, event.date_end),
        location=event.location, description=event.description,
        themes=[ThemeOut(id=t.id, name=t.name) for t in sorted(event.themes, key=lambda t: t.name)],
        status=event.status.value, collaboration_open=event.collaboration_open, expires_on=event.expires_on,
        owner=PersonOut(id=event.owner.id, full_name=event.owner.full_name),
        relation=service.relation(account, event), can_manage=service.can_manage(account, event),
        photos=stats.photos, published=stats.published,
        collaborators=[CollaboratorOut(signature=s, photos=n) for s, n in sorted(stats.by_photographer.items())])


def _event_input(name, theme_ids, date_precision, date_start, date_end, location, description) -> service.EventInput:
    try:
        precision = DatePrecision(date_precision)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo de data inválido.") from None
    return service.EventInput(name=name, theme_ids=theme_ids, date_precision=precision, date_start=date_start,
                              date_end=date_end, location=location, description=description)


async def _read_cover(cover: UploadFile | None) -> bytes | None:
    if cover is None or not cover.filename:
        return None
    data = await cover.read(service.MAX_COVER_BYTES + 1)
    return data


def _error(exc: service.EventError) -> HTTPException:
    code = (status.HTTP_404_NOT_FOUND if isinstance(exc, service.NotFound)
            else status.HTTP_403_FORBIDDEN if isinstance(exc, service.PermissionDenied)
            else status.HTTP_400_BAD_REQUEST)
    return HTTPException(code, str(exc))


@router.get("/themes", response_model=list[ThemeOut])
def list_themes(_: Account = Depends(current_account), db: Session = Depends(get_session)):
    """Active themes only: inactive ones are no longer offered (RF027 note 1)."""
    return [ThemeOut(id=t.id, name=t.name)
            for t in db.scalars(select(Theme).where(Theme.active.is_(True)).order_by(Theme.name))]


@router.get("/dashboard")
def dashboard(account: Account = Depends(current_account), db: Session = Depends(get_session)):
    return service.dashboard(db, account)


@router.get("/events", response_model=EventPage)
def list_events(q: str | None = Query(None, max_length=150), theme_id: int | None = None,
                status_: str | None = Query(None, alias="status"), period_start: date | None = None,
                period_end: date | None = None, scope: str = Query("all", pattern="^(all|mine|collaborations)$"),
                page: int = Query(1, ge=1),
                account: Account = Depends(current_account), db: Session = Depends(get_session)):
    try:
        event_status = EventStatus(status_) if status_ else None
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Status inválido.") from None
    items, total = service.list_events(db, account, q=q, theme_id=theme_id, status=event_status,
                                       period_start=period_start, period_end=period_end, scope=scope, page=page)
    stats = service.stats_for(db, [e.id for e in items])
    return EventPage(items=[_out(account, e, stats[e.id]) for e in items], total=total,
                     page=page, page_size=service.PAGE_SIZE)


@router.get("/events/expiry-preview")
def expiry_preview(date_precision: str, date_start: date, date_end: date | None = None,
                   _: Account = Depends(current_account), db: Session = Depends(get_session)):
    """Lets the edit screen show the NEW expiry date before saving (RF005 note 3)."""
    try:
        start, end = dates.normalize(DatePrecision(date_precision), date_start, date_end)
    except (ValueError, dates.EventDateError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc) or "Data inválida.") from None
    months = retention_months(db)
    return {"expires_on": new_expiry(end, months, date.today()), "retention_months": months,
            "date_label": dates.label(DatePrecision(date_precision), start, end)}


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(name: str = Form(...), theme_ids: list[int] = Form(...), date_precision: str = Form(...),
                       date_start: date = Form(...), date_end: date | None = Form(None),
                       location: str = Form(...), description: str = Form(...),
                       cover: UploadFile | None = File(None),
                       account: Account = Depends(current_account), db: Session = Depends(get_session),
                       storage: ObjectStorage = Depends(get_storage)):
    data = _event_input(name, theme_ids, date_precision, date_start, date_end, location, description)
    try:
        event = service.create_event(db, storage, account, data, await _read_cover(cover))
    except service.EventError as exc:
        raise _error(exc) from None
    return _out(account, event, service.stats_for(db, [event.id])[event.id])


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    try:
        event = service.get_visible(db, account, event_id)
    except service.EventError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    return _out(account, event, service.stats_for(db, [event.id])[event.id])


@router.put("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: uuid.UUID, name: str = Form(...), theme_ids: list[int] = Form(...),
                       date_precision: str = Form(...), date_start: date = Form(...),
                       date_end: date | None = Form(None), location: str = Form(...),
                       description: str = Form(...), cover: UploadFile | None = File(None),
                       account: Account = Depends(current_account), db: Session = Depends(get_session),
                       storage: ObjectStorage = Depends(get_storage)):
    data = _event_input(name, theme_ids, date_precision, date_start, date_end, location, description)
    try:
        event = service.get_visible(db, account, event_id)
        event = service.update_event(db, storage, account, event, data, await _read_cover(cover))
    except service.EventError as exc:
        raise _error(exc) from None
    return _out(account, event, service.stats_for(db, [event.id])[event.id])


class CollaborationIn(BaseModel):
    open: bool


@router.put("/events/{event_id}/collaboration", response_model=EventOut)
def set_collaboration(event_id: uuid.UUID, body: CollaborationIn, account: Account = Depends(current_account),
                      db: Session = Depends(get_session)):
    try:
        event = service.set_collaboration(db, account, service.get_visible(db, account, event_id), body.open)
    except service.EventError as exc:
        raise _error(exc) from None
    return _out(account, event, service.stats_for(db, [event.id])[event.id])


@router.get("/events/{event_id}/cover")
def event_cover(event_id: uuid.UUID, account: Account = Depends(current_account), db: Session = Depends(get_session),
                storage: ObjectStorage = Depends(get_storage)):
    """The cover, served by the API (the storage address never reaches the browser)."""
    try:
        event = service.get_visible(db, account, event_id)
    except service.EventError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    if not event.cover_object_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento sem capa.")
    return Response(storage.get(event.cover_object_key), media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=300"})
