"""ADMINISTRATOR routes: facial-recognition engine and parameters (RF026), event themes (RF027)
and re-indexing (RF028). Every route requires an active administrator session (RF002 note 4).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import parameters
from app.api import public
from app.api.deps import require_role
from app.db.models import Account, AccountRole, Event, EventStatus, ReindexJob, ReindexScope
from app.db.session import get_session
from app.events.service import EventError, NotFound, PermissionDenied
from app.face import factory
from app.face import switch as engine_switch
from app.face.port import FaceEngineUnavailable
from app.indexing import reindex
from app.themes import service as themes

router = APIRouter(prefix="/admin", tags=["admin: configuração"])
admin_only = require_role(AccountRole.ADMIN)


def _http(exc: Exception) -> HTTPException:
    code = (status.HTTP_404_NOT_FOUND if isinstance(exc, NotFound)
            else status.HTTP_403_FORBIDDEN if isinstance(exc, PermissionDenied) else status.HTTP_400_BAD_REQUEST)
    return HTTPException(code, str(exc))


# ------------------------------------------------------------------ parameters (RF026)

def _model_out(db: Session) -> dict:
    """The engine in use (works even when it is broken) and how many photos still wait for it."""
    status_ = factory.engine_status(db)
    return {**status_, "outdated_images": reindex.outdated_count(db, status_["version"])}


def _parameters_out(db: Session) -> dict:
    values = parameters.all_values(db)
    names = {a.id: a.full_name for a in db.scalars(select(Account))}
    labels = {k: s.label for k, s in parameters.SPECS.items()} | {factory.ACTIVE_KEY: "Modelo de reconhecimento"}
    return {
        "items": [{"key": k, "label": s.label, "value": values[k], "default": parameters.default(db, k),
                   "minimum": s.minimum, "maximum": s.maximum, "step": s.step, "unit": s.unit, "group": s.group,
                   "help": s.help, "integer": s.integer,
                   "choices": [list(c) for c in s.choices] if s.choices else None} for k, s in parameters.SPECS.items()],
        # The engine is chosen in its own card (PUT /admin/face-engine): a swap re-indexes (RF028).
        "model": _model_out(db),
        "engines": factory.catalogue(),
        "history": [{"at": h.occurred_at, "key": h.target_id, "label": labels.get(h.target_id, h.target_id),
                     "previous": h.details.get("previous"), "new": h.details.get("new"),
                     "by": names.get(h.actor_account_id, "conta removida")} for h in parameters.history(db)],
    }


@router.get("/parameters")
def get_parameters(_: Account = Depends(admin_only), db: Session = Depends(get_session)):
    return _parameters_out(db)


@router.get("/parameters/retention-impact")
def retention_impact(months: int = Query(ge=1, le=60), _: Account = Depends(admin_only),
                     db: Session = Depends(get_session)):
    """Shown BEFORE saving a new retention: how many events change and how many are held by the
    30-day notice (RF026 note 2 + RF006 note 5)."""
    return parameters.retention_impact(db, months, date.today())


class ParametersIn(BaseModel):
    values: dict[str, float]
    threshold_warning_acknowledged: bool = False


@router.put("/parameters")
def update_parameters(body: ParametersIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        changed = parameters.update(db, admin, body.values, body.threshold_warning_acknowledged)
    except parameters.ParameterError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    public.apply_limits(db)
    return {"changed": changed, **_parameters_out(db)}


class EngineIn(BaseModel):
    engine: str = Field(max_length=40)
    consequences_acknowledged: bool = False


@router.put("/face-engine")
def switch_face_engine(body: EngineIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    """Swaps the facial recognition engine (built by app/face/factory.py) and queues the
    re-indexing of the published collection with it."""
    try:
        job = engine_switch.switch(db, admin, body.engine, body.consequences_acknowledged)
    except engine_switch.EngineSwitchError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    return {"job": _job(db, job) if job else None, **_parameters_out(db)}


# ------------------------------------------------------------------ themes (RF027)

class ThemeRow(BaseModel):
    id: int
    name: str
    icon: str
    active: bool
    events: int


class ThemeIn(BaseModel):
    name: str = Field(max_length=200)
    icon: str | None = Field(None, max_length=40)


class ThemeStatusIn(BaseModel):
    active: bool


@router.get("/themes", response_model=list[ThemeRow])
def list_themes(_: Account = Depends(admin_only), db: Session = Depends(get_session)):
    return [ThemeRow(id=t.id, name=t.name, icon=t.icon, active=t.active, events=n) for t, n in themes.list_with_counts(db)]


@router.post("/themes", response_model=ThemeRow, status_code=status.HTTP_201_CREATED)
def create_theme(body: ThemeIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        t = themes.create(db, admin, body.name, body.icon)
    except EventError as exc:
        raise _http(exc) from None
    return ThemeRow(id=t.id, name=t.name, icon=t.icon, active=t.active, events=0)


def _row(db: Session, theme_id: int) -> ThemeRow:
    for t, n in themes.list_with_counts(db):
        if t.id == theme_id:
            return ThemeRow(id=t.id, name=t.name, icon=t.icon, active=t.active, events=n)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Tema não encontrado.")


@router.put("/themes/{theme_id}", response_model=ThemeRow)
def rename_theme(theme_id: int, body: ThemeIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        themes.rename(db, admin, theme_id, body.name, body.icon)
    except EventError as exc:
        raise _http(exc) from None
    return _row(db, theme_id)


@router.post("/themes/{theme_id}/status", response_model=ThemeRow)
def theme_status(theme_id: int, body: ThemeStatusIn, admin: Account = Depends(admin_only),
                 db: Session = Depends(get_session)):
    try:
        themes.set_active(db, admin, theme_id, body.active)
    except EventError as exc:
        raise _http(exc) from None
    return _row(db, theme_id)


@router.delete("/themes/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_theme(theme_id: int, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        themes.delete(db, admin, theme_id)
    except EventError as exc:
        raise _http(exc) from None


# ------------------------------------------------------------------ re-indexing (RF028)

class JobOut(BaseModel):
    id: uuid.UUID
    scope: str
    event_name: str | None
    from_version: str | None
    to_version: str
    requested_by: str
    created_at: datetime
    finished_at: datetime | None
    total: int
    pending: int
    done: int
    failed: int
    skipped: int
    percent: int


def _job(db: Session, job: ReindexJob) -> JobOut:
    event = db.get(Event, job.event_id) if job.event_id else None
    who = db.get(Account, job.requested_by) if job.requested_by else None
    return JobOut(id=job.id, scope=job.scope.value, event_name=event.name if event else None,
                  from_version=job.from_version, to_version=job.to_version,
                  requested_by=who.full_name if who else "conta removida", created_at=job.created_at,
                  finished_at=job.finished_at, total=job.total, **reindex.progress(db, job))


@router.get("/reindex")
def reindex_overview(_: Account = Depends(admin_only), db: Session = Depends(get_session)):
    jobs = db.scalars(select(ReindexJob).order_by(ReindexJob.created_at.desc()).limit(20)).all()
    events = db.scalars(select(Event).where(Event.status.in_([EventStatus.PUBLISHED, EventStatus.PROCESSING]))
                        .order_by(Event.date_start.desc())).all()
    return {"model": _model_out(db),
            "versions": reindex.model_versions(db),
            "events": [{"id": e.id, "name": e.name} for e in events],
            "jobs": [_job(db, j) for j in jobs]}


class ReindexIn(BaseModel):
    scope: ReindexScope
    event_id: uuid.UUID | None = None
    from_version: str | None = Field(None, max_length=60)


@router.post("/reindex", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def request_reindex(body: ReindexIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        job = reindex.request(db, admin, factory.active_engine(db), body.scope, body.event_id, body.from_version)
    except EventError as exc:
        raise _http(exc) from None
    except FaceEngineUnavailable as exc:  # the administrator sees the real reason
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None
    return _job(db, job)


@router.get("/reindex/{job_id}")
def reindex_job(job_id: uuid.UUID, _: Account = Depends(admin_only), db: Session = Depends(get_session)):
    job = db.get(ReindexJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reindexação não encontrada.")
    return {"job": _job(db, job), "events": reindex.progress_by_event(db, job)}
