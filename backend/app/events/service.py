"""Event rules (RF004, RF005, RF006, RF025) — independent of HTTP."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit, parameters
from app.db.models import (PRODUCER_ROLES, Account, AccountRole, DatePrecision, Event, EventStatus, Image,
                           ImageIndexingStatus, ImageReviewStatus, Theme)
from app.events import dates
from app.imaging import is_jpeg
from app.imaging_meta import strip_gps
from app.storage.port import ObjectStorage

MAX_COVER_BYTES = 25 * 1024 * 1024
PAGE_SIZE = 20


class EventError(Exception):
    """Message safe to show to the user."""


class PermissionDenied(EventError):
    pass


class NotFound(EventError):
    """Also used for events the account cannot see: the answer must not reveal that a
    private event exists."""


@dataclass
class EventInput:
    name: str
    theme_ids: list[int]
    date_precision: DatePrecision
    date_start: date
    date_end: date | None
    location: str
    description: str


# ------------------------------------------------------------------ permissions

def can_manage(account: Account, event: Event) -> bool:
    """Exclusive prerogatives of the responsible photographer (RF025 note 4): edit the event,
    open collaboration, publish, download the package. Always also the administrator, which
    covers RF003 note 5 (responsible account suspended → admin takes over)."""
    return account.role == AccountRole.ADMIN or event.owner_id == account.id


def _visible_to(account: Account) -> Select:
    """Events an account may see in the operation area."""
    query = select(Event)
    if account.role == AccountRole.ADMIN:
        return query
    if account.role == AccountRole.CONTRACTOR:  # RF031 note 1: only the event it was hired for
        return query.where(Event.id == account.bound_event_id)
    uploaded = select(Image.event_id).where(Image.uploaded_by == account.id)
    seen = [Event.owner_id == account.id,
            and_(Event.collaboration_open.is_(True), Event.status != EventStatus.EXPIRED),
            Event.id.in_(uploaded)]
    if account.role == AccountRole.MARKETING:  # RF030 note 3: the published collection, to choose from
        seen.append(Event.status == EventStatus.PUBLISHED)
    return query.where(or_(*seen))


def get_visible(db: Session, account: Account, event_id: uuid.UUID) -> Event:
    event = db.scalar(_visible_to(account).where(Event.id == event_id))
    if event is None:
        raise NotFound("Evento não encontrado.")
    return event


def relation(account: Account, event: Event, uploaded: bool = False) -> str:
    """owner | admin | contractor | collaborator | viewer. "viewer": the marketing team looking at a
    published event of someone else, with collaboration closed and no photo of theirs in it — it
    sees the published photos only and changes nothing (RF030 note 3)."""
    if event.owner_id == account.id:
        return "owner"
    if account.role == AccountRole.ADMIN:
        return "admin"
    if account.role == AccountRole.CONTRACTOR:
        return "contractor"
    if account.role == AccountRole.MARKETING and not event.collaboration_open and not uploaded:
        return "viewer"
    return "collaborator"


def has_uploaded(db: Session, account: Account, event_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """The events (among event_ids) where the account has photos of its own."""
    if not event_ids:
        return set()
    return set(db.scalars(select(Image.event_id).where(Image.uploaded_by == account.id,
                                                       Image.event_id.in_(event_ids)).distinct()))


# ------------------------------------------------------------------ create / edit

def _validate(db: Session, data: EventInput, current: Event | None = None) -> tuple[list[Theme], date, date]:
    name, location, description = data.name.strip(), data.location.strip(), data.description.strip()
    if not name or len(name) > 150:
        raise EventError("Informe o nome do evento (até 150 caracteres).")
    if not location or len(location) > 150:
        raise EventError("Informe o local do evento (até 150 caracteres).")
    if not description or len(description) > 300:
        raise EventError("Informe a descrição do evento (até 300 caracteres).")
    # Active themes — plus, when editing, the ones the event already has even if inactivated
    # since: they stay in the events that use them (RF027 note 1).
    kept = [t.id for t in current.themes] if current else []
    themes = db.scalars(select(Theme).where(Theme.id.in_(data.theme_ids),
                                            or_(Theme.active.is_(True), Theme.id.in_(kept)))).all()
    if not themes or len(themes) != len(set(data.theme_ids)):
        raise EventError("Selecione um ou mais temas válidos.")
    try:
        start, end = dates.normalize(data.date_precision, data.date_start, data.date_end)
    except dates.EventDateError as exc:
        raise EventError(str(exc)) from None
    return list(themes), start, end


def _store_cover(storage: ObjectStorage, event_id: uuid.UUID, cover: bytes) -> str:
    if len(cover) > MAX_COVER_BYTES:
        raise EventError("A capa deve ter no máximo 25 MB.")
    if not is_jpeg(cover):  # by binary signature, not extension (RF007 note 2)
        raise EventError("A capa deve ser uma imagem JPEG.")
    key = f"covers/{event_id}/{uuid.uuid4()}.jpg"
    # The cover is the only image shown publicly without facial search: no geolocation.
    storage.put(key, strip_gps(cover), "image/jpeg")
    return key


def create_event(db: Session, storage: ObjectStorage, account: Account, data: EventInput,
                 cover: bytes | None) -> Event:
    if account.role not in PRODUCER_ROLES and account.role != AccountRole.ADMIN:  # RF031 note 1
        raise PermissionDenied("Esta conta não cadastra eventos.")
    if cover is None:
        raise EventError("Selecione a imagem de capa do evento (JPEG).")
    themes, start, end = _validate(db, data)
    event = Event(id=uuid.uuid4(), name=data.name.strip(), date_precision=data.date_precision,
                  date_start=start, date_end=end, location=data.location.strip(),
                  description=data.description.strip(), owner_id=account.id,  # RF004 note 7
                  expires_on=parameters.new_expiry(end, parameters.retention_months(db), date.today()))
    event.themes = themes
    event.cover_object_key = _store_cover(storage, event.id, cover)
    db.add(event)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        storage.delete(event.cover_object_key)
        raise EventError("Já existe um evento com este nome nesta data.") from None
    audit.record(db, "event.create", account.id, "event", event.id, name=event.name)
    db.commit()
    return event


def update_event(db: Session, storage: ObjectStorage, account: Account, event: Event,
                 data: EventInput, cover: bytes | None) -> Event:
    if not can_manage(account, event):
        raise PermissionDenied("Somente o fotógrafo responsável pelo evento pode editá-lo.")
    if event.status == EventStatus.EXPIRED:
        raise EventError("Este evento expirou e não pode mais ser alterado.")
    _refuse_while_deleting(event)
    themes, start, end = _validate(db, data, event)

    before = {"name": event.name, "location": event.location, "description": event.description,
              "date": dates.label(event.date_precision, event.date_start, event.date_end),
              "themes": sorted(t.name for t in event.themes)}
    event.name, event.location, event.description = data.name.strip(), data.location.strip(), data.description.strip()
    event.date_precision, event.date_start, event.date_end = data.date_precision, start, end
    expires_on = parameters.new_expiry(end, parameters.retention_months(db), date.today())  # RF005 note 3
    if expires_on != event.expires_on:
        event.expires_on, event.expiry_notice_sent_at = expires_on, None
    event.themes = themes
    after = {"name": event.name, "location": event.location, "description": event.description,
             "date": dates.label(event.date_precision, event.date_start, event.date_end),
             "themes": sorted(t.name for t in themes)}

    old_cover = None
    if cover is not None:
        old_cover = event.cover_object_key
        event.cover_object_key = _store_cover(storage, event.id, cover)
        after["cover"] = "substituída"
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise EventError("Já existe um evento com este nome nesta data.") from None

    # RF005 note 6: auditable history with the changed fields.
    changed = {k: {"de": before.get(k), "para": v} for k, v in after.items() if before.get(k) != v}
    if changed:
        audit.record(db, "event.update", account.id, "event", event.id, changes=changed)
    db.commit()
    if old_cover:
        storage.delete(old_cover)
    return event


def _refuse_while_deleting(event: Event) -> None:
    """An event with a deletion scheduled is frozen until the deletion is undone (RF038). Enforced
    here, not only by hiding buttons: a rule that lives only in the screen is no rule at all."""
    if event.deletion_due_at:
        raise EventError("Este evento está com exclusão agendada. Desfaça a exclusão para alterá-lo.")


def set_collaboration(db: Session, account: Account, event: Event, open_: bool) -> Event:
    if not can_manage(account, event):
        raise PermissionDenied("Somente o fotógrafo responsável pode liberar a colaboração.")
    _refuse_while_deleting(event)
    if event.collaboration_open != open_:
        event.collaboration_open = open_
        # RF025 note 6: every release and suspension is recorded.
        audit.record(db, "event.collaboration_" + ("opened" if open_ else "suspended"),
                     account.id, "event", event.id)
        db.commit()
    return event


# ------------------------------------------------------------------ queries

@dataclass
class EventStats:
    photos: int = 0           # images that are part of the collection (not discarded)
    published: int = 0
    by_photographer: dict = field(default_factory=dict)
    approvals_pending: int = 0  # photos of a hired photographer awaiting the administrator (RF031 note 3)


def stats_for(db: Session, event_ids: list[uuid.UUID]) -> dict[uuid.UUID, EventStats]:
    out = {eid: EventStats() for eid in event_ids}
    if not event_ids:
        return out
    rows = db.execute(
        select(Image.event_id, Image.review_status, Account.photographer_signature, func.count())
        .join(Account, Account.id == Image.uploaded_by)
        .where(Image.event_id.in_(event_ids), Image.review_status != ImageReviewStatus.DISCARDED)
        .group_by(Image.event_id, Image.review_status, Account.photographer_signature)).all()
    for event_id, status, signature, n in rows:
        s = out[event_id]
        s.photos += n
        if status == ImageReviewStatus.PUBLISHED:
            s.published += n
        s.by_photographer[signature] = s.by_photographer.get(signature, 0) + n
    for event_id, n in db.execute(select(Image.event_id, func.count()).where(
            Image.event_id.in_(event_ids), Image.approval == "pending").group_by(Image.event_id)):
        out[event_id].approvals_pending = n
    return out


def list_events(db: Session, account: Account, *, q: str | None = None, theme_id: int | None = None,
                status: EventStatus | None = None, period_start: date | None = None,
                period_end: date | None = None, scope: str = "all", page: int = 1) -> tuple[list[Event], int]:
    query = _visible_to(account)
    if scope == "mine":
        query = query.where(Event.owner_id == account.id)
    elif scope == "collaborations":
        query = query.where(Event.owner_id != account.id)
    if q:
        # Accent- and case-insensitive (RF013 note 1): "fecial" finds "FeCiAL".
        query = query.where(func.unaccent(func.lower(Event.name)).like(
            func.unaccent(func.lower(f"%{q.strip()}%"))))
    if theme_id:
        query = query.where(Event.themes.any(Theme.id == theme_id))
    if status:
        query = query.where(Event.status == status)
    # By the EVENT date, not the upload date (RF013 note 5); overlapping intervals match.
    if period_start:
        query = query.where(Event.date_end >= period_start)
    if period_end:
        query = query.where(Event.date_start <= period_end)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(Event.date_start.desc(), Event.name)
                       .offset((max(page, 1) - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
    return list(items), total or 0


def dashboard(db: Session, account: Account) -> dict:
    """Numbers of the "Visão geral" screen, computed from real data."""
    owned = db.scalars(select(Event).where(Event.owner_id == account.id,
                                           Event.status != EventStatus.EXPIRED)).all()
    owned_ids = [e.id for e in owned]
    manageable = select(Event.id).where(Event.owner_id == account.id) if account.role != AccountRole.ADMIN \
        else select(Event.id)
    failed = db.scalar(select(func.count()).select_from(Image).where(
        Image.event_id.in_(manageable), Image.indexing_status == ImageIndexingStatus.FAILED)) or 0
    removal = db.execute(select(func.count(), func.min(Image.removal_requested_at)).where(
        Image.event_id.in_(manageable), Image.removal_requested_at.is_not(None))).one()
    published_mine = db.scalar(select(func.count()).select_from(Image).where(
        Image.uploaded_by == account.id, Image.review_status == ImageReviewStatus.PUBLISHED)) or 0
    # RF031 note 3: the administrator must see, without opening each event, where photos of a hired
    # photographer wait for approval.
    approvals = db.execute(select(Event.id, Event.name, func.count(Image.id)).join(Image, Image.event_id == Event.id)
                           .where(Image.approval == "pending").group_by(Event.id, Event.name)
                           .order_by(func.count(Image.id).desc())).all() if account.role == AccountRole.ADMIN else []
    from app.events.notifications import for_account  # local: notifications → public.service → this module
    admin = account.role == AccountRole.ADMIN
    return {
        "events_owned": len(owned_ids),
        "processing": sum(1 for e in owned if e.status == EventStatus.PROCESSING),
        # Situations that need someone (the bell's counter): one per event and kind, not one per photo.
        "attention": sum(1 for n in for_account(db, account) if n["urgent"]),
        # The administrator creates few events: its overview counts the whole system (17/10/2026, D2).
        "active_events": db.scalar(select(func.count()).select_from(Event).where(
            Event.status != EventStatus.EXPIRED)) if admin else None,
        "approvals_total": sum(n for _, _, n in approvals) if admin else None,
        "approvals_pending": [{"event_id": str(i), "event_name": name, "photos": n} for i, name, n in approvals],
        "photos_published": published_mine,
        "indexing_failures": failed,
        "removal_requests": removal[0],
        "oldest_removal_request": removal[1],
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)

