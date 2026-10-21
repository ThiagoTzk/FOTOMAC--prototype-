"""Institutional people (RF020, RF021): the administrator's registration, the public page where the person
signs (or refuses, or revokes), and the consultation by photographers, marketing and the administrator."""
from __future__ import annotations

import base64
import binascii
import uuid
from datetime import date, datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.api.deps import require_role
from app.config import get_settings
from app.db.models import Account, AccountRole, Event, Image, ImageReviewStatus, InstitutionalPerson, InstitutionalStatus
from app.db.session import get_session
from app.events import dates
from app.events.service import EventError, NotFound, PermissionDenied
from app.images.processing import credit_line
from app.institutional import form, service, term
from app.institutional.service import MAX_PHOTO_BYTES
from app.notifications.factory import get_email_sender
from app.notifications.port import EmailSender
from app.security.rate_limit import RateLimiter
from app.storage.factory import get_storage
from app.storage.port import ObjectStorage

admin_only = require_role(AccountRole.ADMIN)
# RF021 note 1: never public, and not for the temporary account.
consulting = require_role(AccountRole.PHOTOGRAPHER, AccountRole.MARKETING, AccountRole.ADMIN)
link_limiter = RateLimiter(max_requests=30, window_seconds=600)   # the public page: guessing tokens is pointless, but cheap to limit

admin_router = APIRouter(prefix="/admin/institutional", tags=["admin: pessoas institucionais"])
public_router = APIRouter(prefix="/public/institutional", tags=["público: autorização institucional"])
router = APIRouter(prefix="/institutional", tags=["pessoas institucionais"])


def _http(exc: EventError) -> HTTPException:
    code = (status.HTTP_404_NOT_FOUND if isinstance(exc, NotFound)
            else status.HTTP_403_FORBIDDEN if isinstance(exc, PermissionDenied) else status.HTTP_400_BAD_REQUEST)
    return HTTPException(code, str(exc))


def _jpeg(data: bytes) -> Response:
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


STATUS_LABEL = {InstitutionalStatus.AWAITING: "Aguardando autorização", InstitutionalStatus.ACTIVE: "Ativo",
                InstitutionalStatus.REVOKED: "Revogado"}


# ------------------------------------------------------------------ administrator (RF020)

class PersonRow(BaseModel):
    id: uuid.UUID
    full_name: str
    position: str
    unit: str | None
    email: str
    status: str
    status_label: str
    created_at: datetime
    link_expires_at: datetime | None
    authorized_at: datetime | None
    revoked_at: datetime | None
    marks: dict


class PersonDetail(PersonRow):
    photos: list[dict]
    term_version: str | None
    document_sha256: str | None
    authorized_ip: str | None
    revoked_by: str | None
    scan_status: str
    scanned_at: datetime | None
    signed: bool
    dev_link_available: bool   # TEMPORÁRIO — remover antes da implantação (service.dev_link)


def _row(db: Session, p: InstitutionalPerson) -> dict:
    return dict(id=p.id, full_name=p.full_name, position=p.position, unit=p.unit, email=p.email, status=p.status.value,
                status_label=STATUS_LABEL[p.status], created_at=p.created_at, link_expires_at=p.link_expires_at,
                authorized_at=p.authorized_at, revoked_at=p.revoked_at, marks=service.counts(db, p.id))


def _detail(db: Session, p: InstitutionalPerson) -> PersonDetail:
    return PersonDetail(**_row(db, p), photos=[{"id": ph.id, "position": ph.position, "faces_found": ph.faces_found}
                                               for ph in p.photos],
                        term_version=p.term_version, document_sha256=p.document_sha256, authorized_ip=p.authorized_ip,
                        revoked_by=p.revoked_by, scan_status=p.scan_status, scanned_at=p.scanned_at,
                        signed=p.signature_key is not None,
                        dev_link_available=get_settings().email_sender == "outbox" and p.status == InstitutionalStatus.AWAITING)


@admin_router.get("", response_model=list[PersonRow])
def list_people(_: Account = Depends(admin_only), db: Session = Depends(get_session)):
    people = db.scalars(select(InstitutionalPerson).order_by(InstitutionalPerson.full_name)).all()
    return [PersonRow(**_row(db, p)) for p in people]


@admin_router.post("", response_model=PersonDetail, status_code=status.HTTP_201_CREATED)
async def create_person(full_name: str = Form(...), position: str = Form(...), unit: str | None = Form(None),
                        email: str = Form(...), photos: list[UploadFile] = File(...),
                        admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                        storage: ObjectStorage = Depends(get_storage), sender: EmailSender = Depends(get_email_sender)):
    files = [(await f.read(MAX_PHOTO_BYTES + 1), f.filename or "") for f in photos[:service.MAX_PHOTOS + 1]]
    try:
        person = service.create(db, storage, admin, service.PersonInput(full_name, position, unit, email), files, sender)
    except EventError as exc:
        raise _http(exc) from None
    return _detail(db, person)


@admin_router.get("/{person_id}", response_model=PersonDetail)
def get_person(person_id: uuid.UUID, _: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        return _detail(db, service.get_person(db, person_id))
    except EventError as exc:
        raise _http(exc) from None


@admin_router.get("/{person_id}/photos/{photo_id}")
def person_photo(person_id: uuid.UUID, photo_id: uuid.UUID, _: Account = Depends(admin_only),
                 db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    photo = next((ph for ph in service.get_person(db, person_id).photos if ph.id == photo_id), None)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    return _jpeg(storage.get(photo.object_key))


@admin_router.get("/{person_id}/signature")
def person_signature(person_id: uuid.UUID, _: Account = Depends(admin_only), db: Session = Depends(get_session),
                     storage: ObjectStorage = Depends(get_storage)):
    """The signature is shown on the site, in the registration (decision of 21/10/2026)."""
    person = service.get_person(db, person_id)
    if not person.signature_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ainda não assinado.")
    return Response(storage.get(person.signature_key), media_type="image/png", headers={"Cache-Control": "no-store"})


@admin_router.get("/{person_id}/form.pdf")
def person_form(person_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                storage: ObjectStorage = Depends(get_storage)):
    """The official copy of the signed authorization (photo, data, term, signature, proof)."""
    person = service.get_person(db, person_id)
    if not person.signature_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O formulário existe depois da assinatura.")
    pdf = form.build(person, storage)
    audit.record(db, "institutional.form_downloaded", admin.id, "institutional_person", person.id)
    db.commit()
    name = f"Autorização FOTOMAC - {person.full_name}.pdf"
    return Response(pdf, media_type="application/pdf", headers={
        "Cache-Control": "no-store", "Content-Disposition": f"attachment; filename=\"autorizacao.pdf\"; filename*=UTF-8''{quote(name)}"})


@admin_router.post("/{person_id}/link", status_code=status.HTTP_204_NO_CONTENT)
def resend_link(person_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                sender: EmailSender = Depends(get_email_sender)):
    try:
        service.resend_link(db, admin, service.get_person(db, person_id), sender)
    except EventError as exc:
        raise _http(exc) from None


# TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO: development-only link display (service.dev_link).
@admin_router.post("/{person_id}/link/dev")
def dev_link(person_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        return {"url": service.dev_link(db, admin, service.get_person(db, person_id))}
    except EventError as exc:
        raise _http(exc) from None
# FIM DO TRECHO TEMPORÁRIO


@admin_router.post("/{person_id}/end", response_model=PersonDetail)
def end_authorization(person_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                      storage: ObjectStorage = Depends(get_storage)):
    try:
        person = service.get_person(db, person_id)
        service.end_by_admin(db, storage, admin, person)
    except EventError as exc:
        raise _http(exc) from None
    return _detail(db, person)


@admin_router.post("/{person_id}/rescan", status_code=status.HTTP_204_NO_CONTENT)
def rescan(person_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        service.schedule_rescan(db, admin, service.get_person(db, person_id))
    except EventError as exc:
        raise _http(exc) from None


@admin_router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(person_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                  storage: ObjectStorage = Depends(get_storage)):
    try:
        service.delete_awaiting(db, storage, admin, service.get_person(db, person_id))
    except EventError as exc:
        raise _http(exc) from None


# ------------------------------------------------------------------ the person (public, by link)

@public_router.get("/authorization", dependencies=[Depends(link_limiter)])
def authorization_page(token: str = Query(...), db: Session = Depends(get_session)):
    try:
        person = service.by_link(db, token)
    except EventError as exc:
        raise _http(exc) from None
    return {"full_name": person.full_name, "position": person.position, "unit": person.unit,
            "photos": [str(ph.id) for ph in person.photos], "expires_at": person.link_expires_at,
            "term": {"version": term.TERM_VERSION, "title": term.TERM_TITLE,
                     "paragraphs": term.paragraphs(person.full_name, person.position, person.unit)}}


@public_router.get("/authorization/photos/{photo_id}", dependencies=[Depends(link_limiter)])
def authorization_photo(photo_id: uuid.UUID, token: str = Query(...), db: Session = Depends(get_session),
                        storage: ObjectStorage = Depends(get_storage)):
    """The person sees exactly which photos of them will be used — only with their own link."""
    try:
        person = service.by_link(db, token)
    except EventError as exc:
        raise _http(exc) from None
    photo = next((ph for ph in person.photos if ph.id == photo_id), None)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    return _jpeg(storage.get(photo.object_key))


class SignatureIn(BaseModel):
    token: str = Field(max_length=200)
    signature: str = Field(max_length=500_000)   # PNG drawn on the screen, as a data URL


@public_router.post("/authorization", dependencies=[Depends(link_limiter)])
def sign(body: SignatureIn, request: Request, db: Session = Depends(get_session),
         storage: ObjectStorage = Depends(get_storage), sender: EmailSender = Depends(get_email_sender)):
    try:
        png = base64.b64decode(body.signature.split(",", 1)[-1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assinatura inválida. Assine de novo no quadro.") from None
    try:
        url = service.authorize(db, storage, sender, body.token, png, request.client.host if request.client else None,
                                request.headers.get("user-agent"))
    except EventError as exc:
        raise _http(exc) from None
    return {"revoke_url": url}


class TokenIn(BaseModel):
    token: str = Field(max_length=200)


@public_router.post("/refusal", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(link_limiter)])
def refuse(body: TokenIn, db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    try:
        service.refuse(db, storage, body.token)
    except EventError as exc:
        raise _http(exc) from None


@public_router.get("/revocation", dependencies=[Depends(link_limiter)])
def revocation_page(token: str = Query(...), db: Session = Depends(get_session)):
    try:
        person = service.by_revoke_link(db, token)
    except EventError as exc:
        raise _http(exc) from None
    return {"full_name": person.full_name, "status": person.status.value, "authorized_at": person.authorized_at,
            "revoked_at": person.revoked_at}


@public_router.post("/revocation", dependencies=[Depends(link_limiter)])
def revoke(body: TokenIn, db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    try:
        person = service.revoke_by_holder(db, storage, body.token)
    except EventError as exc:
        raise _http(exc) from None
    return {"revoked_at": person.revoked_at}


# ------------------------------------------------------------------ consultation (RF021)

@router.get("/people")
def people(_: Account = Depends(consulting), db: Session = Depends(get_session)):
    """RF020 note 1: only the name and the role of the active people — never e-mail, photos or proof."""
    return [{"id": p.id, "full_name": p.full_name, "position": p.position, "unit": p.unit} for p in service.active_people(db)]


@router.get("/people/{person_id}/events")
def person_events(person_id: uuid.UUID, date_from: date | None = None, date_to: date | None = None,
                  theme_id: int | None = None, account: Account = Depends(consulting), db: Session = Depends(get_session)):
    try:
        person = service.active_person(db, person_id)
    except EventError as exc:
        raise _http(exc) from None
    return {"person": {"id": person.id, "full_name": person.full_name, "position": person.position, "unit": person.unit},
            "events": service.person_events(db, account, person, date_from, date_to, theme_id)}


@router.get("/people/{person_id}/events/{event_id}/images")
def person_event_images(person_id: uuid.UUID, event_id: uuid.UUID, _: Account = Depends(consulting),
                        db: Session = Depends(get_session)):
    try:
        person = service.active_person(db, person_id)
    except EventError as exc:
        raise _http(exc) from None
    rows = service.person_event_images(db, person, event_id)
    event = db.get(Event, event_id)
    if event is None or not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nenhuma imagem desta pessoa neste evento.")
    total = db.scalar(select(func.count()).select_from(Image).where(
        Image.event_id == event_id, Image.review_status == ImageReviewStatus.PUBLISHED, Image.removal_requested_at.is_(None)))
    return {"person": {"id": person.id, "full_name": person.full_name, "position": person.position, "unit": person.unit},
            "event": {"id": event.id, "name": event.name, "location": event.location, "total": total,
                      "date_label": dates.label(event.date_precision, event.date_start, event.date_end),
                      "themes": sorted(t.name for t in event.themes)},
            "images": [{"image_id": image.id, "status": mark.status, "similarity": round(mark.similarity, 4),
                        "credit": credit_line(image.credit_signature), "signature": image.credit_signature,
                        "captured_at": image.captured_at, "version": image.sha256[:12]} for mark, image in rows]}


@router.get("/people/{person_id}/images/{image_id}/{variant}")
def marked_image_file(person_id: uuid.UUID, image_id: uuid.UUID, variant: str, _: Account = Depends(consulting),
                      db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    """Only the images marked for that person (a photographer sees them even in someone else's event,
    because the person authorized exactly this, RF021)."""
    try:
        image = service.marked_image(db, service.active_person(db, person_id), image_id)
    except EventError as exc:
        raise _http(exc) from None
    key = {"thumb": image.thumb_key, "preview": image.preview_key}.get(variant)
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return Response(storage.get(key), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


class DecisionIn(BaseModel):
    image_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)
    confirm: bool


@router.post("/people/{person_id}/marks")
def decide(person_id: uuid.UUID, body: DecisionIn, account: Account = Depends(consulting), db: Session = Depends(get_session)):
    try:
        return {"decided": service.decide(db, account, service.active_person(db, person_id), body.image_ids, body.confirm)}
    except EventError as exc:
        raise _http(exc) from None
