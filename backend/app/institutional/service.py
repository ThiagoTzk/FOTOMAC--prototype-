"""Institutional people (RF020) and their photos across the collection (RF021) — independent of HTTP.

The life of a registration:
1. the ADMINISTRATOR registers the person with 1 to 5 reference photos (stored, never processed) and the
   system e-mails a single-use link;
2. the person opens the link, reads the term, sees the photos and SIGNS on the screen (electronic
   signature) — or refuses, and everything is deleted;
3. signed: the photos become reference vectors and the whole published collection is searched; from then
   on every newly indexed photo is compared with the active people (the only comparison across events);
4. the person revokes whenever they want (or the administrator ends it, e.g. the person left the role):
   photos, vectors and marks are eliminated at once; the signed term stays as proof.
"""
from __future__ import annotations

import hashlib
import io
import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import cv2
import numpy as np
from PIL import Image as PILImage
from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app import audit, parameters
from app.accounts.service import is_institutional
from app.auth.tokens import new_token, token_hash
from app.config import get_settings
from app.db.models import (Account, Event, FaceEmbedding, Image, ImageIndexingStatus, ImageReviewStatus,
                           InstitutionalMark, InstitutionalPerson, InstitutionalPhoto, InstitutionalStatus,
                           InstitutionalVector, event_themes)
from app.events import dates
from app.events.service import EventError, NotFound
from app.images import formats
from app.imaging import decode_image
from app.institutional import term
from app.notifications.port import EmailMessage, EmailSender
from app.storage.port import ObjectStorage

LINK_DAYS = 7              # RF020 note 3: single use, limited validity
PENDING_DAYS = 30          # never signed: photos and data are eliminated (LGPD Art. 6, III and Art. 15)
MAX_PEOPLE = 50            # RF020: initial capacity, can grow
MAX_PHOTOS = 5
MAX_PHOTO_BYTES = 25 * 1024 * 1024
PHOTO_SIDE = 1600          # enough for the face; the rest of the camera file is not kept
MAX_SIGNATURE_BYTES = 300_000
MIN_INK_PIXELS = 150       # an empty (or almost empty) signature box is not a signature


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class PersonInput:
    full_name: str
    position: str
    unit: str | None
    email: str


# ------------------------------------------------------------------ registration (administrator)

def _clean(data: PersonInput) -> PersonInput:
    name = " ".join(data.full_name.split())
    if len(name.split()) < 2 or len(name) > 120:
        raise EventError("Informe o nome completo (nome e sobrenome, até 120 caracteres).")
    position = " ".join(data.position.split())
    if not 2 <= len(position) <= 100:
        raise EventError("Informe o cargo ou a função (até 100 caracteres).")
    unit = " ".join((data.unit or "").split()) or None
    if unit and len(unit) > 100:
        raise EventError("A unidade ou o curso pode ter até 100 caracteres.")
    email = data.email.strip().lower()
    if "@" not in email or len(email) > 254 or " " in email:
        raise EventError("Informe um e-mail válido.")
    # RF020 note 5: only people in an institutional role — their e-mail is the institution's.
    if not is_institutional(email):
        raise EventError("Use o e-mail institucional da pessoa (@cesmac.edu.br).")
    return PersonInput(name, position, unit, email)


def _reference_jpeg(data: bytes, filename: str) -> bytes:
    """A clean JPEG of the reference photo: reduced, upright, WITHOUT any metadata (no GPS, no camera
    data) — only what is needed to recognise the face (LGPD Art. 6, III)."""
    if len(data) > MAX_PHOTO_BYTES:
        raise EventError("Cada fotografia de referência pode ter até 25 MB.")
    found = formats.detect(data, filename)
    if found is None or found[0] == formats.RAW:
        raise EventError("Envie as fotografias de referência em JPEG, PNG, HEIC ou WebP.")
    try:
        pixels = decode_image(data) if found[0] == formats.JPEG else formats.decode(data, found[0])
    except (formats.UnreadableImage, Exception):
        raise EventError("Uma das fotografias de referência está corrompida e não pôde ser lida.") from None
    h, w = pixels.shape[:2]
    scale = PHOTO_SIDE / max(h, w)
    if scale < 1:
        pixels = cv2.resize(pixels, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", pixels, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise EventError("Uma das fotografias de referência não pôde ser lida.")
    return buf.tobytes()


def create(db: Session, storage: ObjectStorage, admin: Account, data: PersonInput,
           photos: list[tuple[bytes, str]], sender: EmailSender) -> InstitutionalPerson:
    data = _clean(data)
    if not 1 <= len(photos) <= MAX_PHOTOS:
        raise EventError("Envie de 1 a 5 fotografias de referência do rosto, em ângulos variados.")
    open_rows = db.scalar(select(func.count()).select_from(InstitutionalPerson)
                          .where(InstitutionalPerson.status != InstitutionalStatus.REVOKED)) or 0
    if open_rows >= MAX_PEOPLE:
        raise EventError(f"O cadastro chegou ao limite de {MAX_PEOPLE} pessoas.")
    if db.scalar(select(InstitutionalPerson.id).where(func.lower(InstitutionalPerson.email) == data.email,
                                                      InstitutionalPerson.status != InstitutionalStatus.REVOKED)):
        raise EventError("Já existe um cadastro em andamento ou ativo com este e-mail.")
    cleaned = [_reference_jpeg(content, name) for content, name in photos]   # everything checked first
    person = InstitutionalPerson(id=uuid.uuid4(), full_name=data.full_name, position=data.position, unit=data.unit,
                                 email=data.email, created_by=admin.id)
    db.add(person)
    for n, jpeg in enumerate(cleaned, start=1):
        key = f"institutional/{person.id}/referencia-{n}.jpg"
        storage.put(key, jpeg, "image/jpeg")
        db.add(InstitutionalPhoto(id=uuid.uuid4(), person_id=person.id, object_key=key,
                                  sha256=hashlib.sha256(jpeg).hexdigest(), position=n))
    token = _issue_link(person)
    audit.record(db, "institutional.created", admin.id, "institutional_person", person.id, photos=len(cleaned))
    db.commit()
    _send_link(person, token, sender)
    return person


def _issue_link(person: InstitutionalPerson) -> str:
    token = new_token()
    person.link_token_hash, person.link_sent_at = token_hash(token), _now()
    person.link_expires_at = _now() + timedelta(days=LINK_DAYS)   # the previous link stops working
    return token


def link_url(token: str) -> str:
    return f"{get_settings().frontend_url}/autorizacao?token={token}"


def revoke_url(token: str) -> str:
    return f"{get_settings().frontend_url}/autorizacao/revogar?token={token}"


def _send_link(person: InstitutionalPerson, token: str, sender: EmailSender) -> None:
    sender.send(EmailMessage(
        to=person.email, subject="FOTOMAC — autorização de uso de imagem (pessoa institucional)",
        body=(f"Olá, {person.full_name}.\n\nA administração do FOTOMAC, o sistema de fotografias de eventos do "
              "Centro Universitário CESMAC, cadastrou você como pessoa institucional. Com a sua autorização, o "
              "sistema localiza as fotos dos eventos em que você aparece, para a comunicação institucional.\n\n"
              f"Leia o termo e, se concordar, assine no link abaixo (válido por {LINK_DAYS} dias e de uso único). "
              f"Você também pode recusar; nesse caso, os seus dados são apagados.\n\n{link_url(token)}\n\n"
              "Se você não esperava esta mensagem, ignore-a.\n\nEquipe FOTOMAC — Centro Universitário CESMAC")))


def resend_link(db: Session, admin: Account, person: InstitutionalPerson, sender: EmailSender) -> None:
    if person.status != InstitutionalStatus.AWAITING:
        raise EventError("Só cadastros aguardando autorização recebem o link.")
    token = _issue_link(person)
    audit.record(db, "institutional.link_resent", admin.id, "institutional_person", person.id)
    db.commit()
    _send_link(person, token, sender)


# TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO (mesmo motivo de accounts.service.dev_activation_link): while
# e-mails are not really sent (email_sender == "outbox"), the administrator can see the link to test the
# flow. In production it would let an administrator sign in someone else's name, so it answers "not found".
def dev_link(db: Session, admin: Account, person: InstitutionalPerson) -> str:
    if get_settings().email_sender != "outbox":
        raise NotFound("Recurso indisponível.")
    if person.status != InstitutionalStatus.AWAITING:
        raise EventError("Só cadastros aguardando autorização têm link.")
    token = _issue_link(person)
    audit.record(db, "institutional.link_shown_dev", admin.id, "institutional_person", person.id)
    db.commit()
    return link_url(token)
# FIM DO TRECHO TEMPORÁRIO


def delete_awaiting(db: Session, storage: ObjectStorage, admin: Account, person: InstitutionalPerson) -> None:
    """A registration never signed can be withdrawn: nothing was processed, nothing needs to be kept."""
    if person.status != InstitutionalStatus.AWAITING:
        raise EventError("Cadastro já assinado: encerre a autorização em vez de excluir (o termo fica como prova).")
    _delete_photos(db, storage, person)
    audit.record(db, "institutional.deleted", admin.id, "institutional_person", person.id)
    db.delete(person)
    db.commit()


def expire_pending(db: Session, storage: ObjectStorage) -> int:
    """Registrations nobody signed in PENDING_DAYS since the last link: eliminated (LGPD Art. 15, I)."""
    due = db.scalars(select(InstitutionalPerson).where(
        InstitutionalPerson.status == InstitutionalStatus.AWAITING,
        InstitutionalPerson.link_sent_at < _now() - timedelta(days=PENDING_DAYS))).all()
    for person in due:
        _delete_photos(db, storage, person)
        audit.record(db, "institutional.expired", None, "institutional_person", person.id)
        db.delete(person)
    db.commit()
    return len(due)


def _delete_photos(db: Session, storage: ObjectStorage, person: InstitutionalPerson) -> None:
    for photo in list(person.photos):   # storage first: the database cascade does not reach it
        storage.delete(photo.object_key)
        db.delete(photo)                # its vectors go with it (ON DELETE CASCADE)
    db.flush()


# ------------------------------------------------------------------ the person: sign, refuse, revoke (public)

def by_link(db: Session, token: str | None) -> InstitutionalPerson:
    person = db.scalar(select(InstitutionalPerson).where(InstitutionalPerson.link_token_hash == token_hash(token or "")))
    if (person is None or person.status != InstitutionalStatus.AWAITING or not person.link_expires_at
            or person.link_expires_at < _now()):
        raise NotFound("Link inválido ou expirado. Peça à administração do FOTOMAC um novo link.")
    return person


def _check_signature(png: bytes) -> None:
    if not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) > MAX_SIGNATURE_BYTES:
        raise EventError("Assinatura inválida. Assine de novo no quadro.")
    try:
        image = PILImage.open(io.BytesIO(png))
        image.load()
    except Exception:
        raise EventError("Assinatura inválida. Assine de novo no quadro.") from None
    if image.width > 2400 or image.height > 1200:
        raise EventError("Assinatura inválida. Assine de novo no quadro.")
    rgba = np.asarray(image.convert("RGBA"))
    ink = (rgba[:, :, 3] > 40) & (rgba[:, :, :3].min(axis=2) < 160)   # visible, dark strokes
    if int(ink.sum()) < MIN_INK_PIXELS:
        raise EventError("Faça a sua assinatura no quadro antes de confirmar.")


def document_hash(person: InstitutionalPerson, signature_sha: str) -> str:
    """Verification code of the signed document: changes if any word, photo or stroke changes."""
    record = {"term_version": person.term_version, "term": person.signed_term,
              "full_name": person.full_name, "position": person.position, "unit": person.unit, "email": person.email,
              "photos": person.signed_photos, "signature": signature_sha,
              # Always in UTC: the database may give the moment back in another time zone, and the code must
              # come out the same whenever it is recomputed (that is what makes it a proof).
              "authorized_at": person.authorized_at.astimezone(timezone.utc).isoformat(timespec="microseconds"),
              "ip": person.authorized_ip}
    return hashlib.sha256(json.dumps(record, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def authorize(db: Session, storage: ObjectStorage, sender: EmailSender, token: str | None, signature_png: bytes,
              ip: str | None, user_agent: str | None) -> str:
    """The electronic signature (RF020 note 3). Returns the revocation link, also e-mailed."""
    person = by_link(db, token)
    _check_signature(signature_png)
    key = f"institutional/{person.id}/assinatura.png"
    storage.put(key, signature_png, "image/png")
    person.term_version, person.authorized_at = term.TERM_VERSION, _now()
    person.signed_term = [term.TERM_TITLE, *term.paragraphs(person.full_name, person.position, person.unit)]
    person.signed_photos = [p.sha256 for p in person.photos]
    person.authorized_ip, person.authorized_user_agent = (ip or "")[:45] or None, (user_agent or "")[:300] or None
    person.signature_key = key
    person.document_sha256 = document_hash(person, hashlib.sha256(signature_png).hexdigest())
    person.link_token_hash = person.link_expires_at = None          # single use
    revoke_token = new_token()
    person.revoke_token_hash = token_hash(revoke_token)
    person.status, person.scan_status = InstitutionalStatus.ACTIVE, "pending"   # the worker searches the collection
    audit.record(db, "institutional.authorized", None, "institutional_person", person.id,
                 term_version=term.TERM_VERSION, document_sha256=person.document_sha256)
    db.commit()
    sender.send(EmailMessage(
        to=person.email, subject="FOTOMAC — autorização registrada",
        body=(f"Olá, {person.full_name}.\n\nA sua autorização foi registrada em "
              f"{person.authorized_at.astimezone().strftime('%d/%m/%Y às %H:%M')} (termo {term.TERM_VERSION}, código de "
              f"verificação {person.document_sha256[:16]}).\n\nVocê pode revogá-la a qualquer momento, sem "
              f"justificativa, neste link:\n\n{revoke_url(revoke_token)}\n\n"
              "Guarde esta mensagem.\n\nEquipe FOTOMAC — Centro Universitário CESMAC")))
    return revoke_url(revoke_token)


def refuse(db: Session, storage: ObjectStorage, token: str | None) -> None:
    """The person does not authorize: the registration and the photos are deleted (free consent, Art. 5, XII)."""
    person = by_link(db, token)
    _delete_photos(db, storage, person)
    audit.record(db, "institutional.refused", None, "institutional_person", person.id)
    db.delete(person)
    db.commit()


def by_revoke_link(db: Session, token: str | None) -> InstitutionalPerson:
    person = db.scalar(select(InstitutionalPerson).where(InstitutionalPerson.revoke_token_hash == token_hash(token or "")))
    if person is None:
        raise NotFound("Link de revogação inválido.")
    return person


def _revoke(db: Session, storage: ObjectStorage, person: InstitutionalPerson, by: str, actor: uuid.UUID | None) -> None:
    """RF020 note 4 / RF021 note 9: at once and irreversibly — reference photos, vectors and every mark."""
    if person.status != InstitutionalStatus.ACTIVE:
        raise EventError("Esta autorização não está ativa.")
    _delete_photos(db, storage, person)
    db.query(InstitutionalVector).filter(InstitutionalVector.person_id == person.id).delete()
    db.query(InstitutionalMark).filter(InstitutionalMark.person_id == person.id).delete()
    person.status, person.revoked_at, person.revoked_by = InstitutionalStatus.REVOKED, _now(), by
    person.scan_status, person.references_model_version = "idle", None
    audit.record(db, "institutional.revoked", actor, "institutional_person", person.id, by=by)
    db.commit()


def revoke_by_holder(db: Session, storage: ObjectStorage, token: str | None) -> InstitutionalPerson:
    person = by_revoke_link(db, token)
    _revoke(db, storage, person, "holder", None)
    return person


def end_by_admin(db: Session, storage: ObjectStorage, admin: Account, person: InstitutionalPerson) -> None:
    """RF020 note 6: the yearly review, or the person left the role."""
    _revoke(db, storage, person, "admin", admin.id)


# ------------------------------------------------------------------ finding the person (RF021 note 3)

def schedule_rescan_all(db: Session) -> None:
    db.query(InstitutionalPerson).filter(InstitutionalPerson.status == InstitutionalStatus.ACTIVE).update(
        {InstitutionalPerson.scan_status: "pending"})


def schedule_rescan(db: Session, admin: Account, person: InstitutionalPerson) -> None:
    if person.status != InstitutionalStatus.ACTIVE:
        raise EventError("Só pessoas com autorização ativa são procuradas no acervo.")
    person.scan_status = "pending"
    audit.record(db, "institutional.rescan", admin.id, "institutional_person", person.id)
    db.commit()


def refresh_next(db: Session, storage: ObjectStorage, engine) -> bool:
    """One person per round: (re)builds the reference vectors when the model changed, then searches the
    whole published collection. Returns False when nobody is waiting."""
    person = db.scalar(select(InstitutionalPerson).where(
        InstitutionalPerson.status == InstitutionalStatus.ACTIVE,
        (InstitutionalPerson.scan_status == "pending")
        | InstitutionalPerson.references_model_version.is_distinct_from(engine.model_version))
        .order_by(InstitutionalPerson.authorized_at).limit(1).with_for_update(skip_locked=True))
    if person is None:
        return False
    if person.references_model_version != engine.model_version:
        db.query(InstitutionalVector).filter(InstitutionalVector.person_id == person.id).delete()
        floor = parameters.get(db, "min_detection_score")
        for photo in person.photos:
            faces = [f for f in engine.detect(decode_image(storage.get(photo.object_key))) if f.detection_score >= floor]
            photo.faces_found = len(faces)
            if faces:   # the reference photo shows the person: its largest face is theirs
                face = max(faces, key=lambda f: f.bbox.width * f.bbox.height)
                db.add(InstitutionalVector(person_id=person.id, photo_id=photo.id, model_version=engine.model_version,
                                           dim=engine.vector_dim, embedding=face.embedding))
        person.references_model_version = engine.model_version
        db.flush()
    _scan(db, person, engine.model_version)
    person.scan_status, person.scanned_at = "done", _now()
    db.commit()
    return True


def _visible_images():
    """Published, indexed, not on their way out (RF023 note 4)."""
    return and_(Image.review_status == ImageReviewStatus.PUBLISHED, Image.indexing_status == ImageIndexingStatus.PROCESSED,
                Image.removal_requested_at.is_(None))


def _scan(db: Session, person: InstitutionalPerson, model_version: str) -> None:
    """The whole published collection, with NO cap of results: the visitor's limit of 200 is about what one
    public search exposes and does not apply here (decision of 17/10/2026)."""
    threshold = parameters.institutional_threshold(db)
    vectors = db.scalars(select(InstitutionalVector.embedding).where(
        InstitutionalVector.person_id == person.id, InstitutionalVector.model_version == model_version)).all()
    found: dict[uuid.UUID, tuple[uuid.UUID, float]] = {}
    for vector in vectors:
        best = func.max(1 - FaceEmbedding.embedding.cosine_distance(vector)).label("similarity")
        rows = db.execute(select(FaceEmbedding.image_id, FaceEmbedding.event_id, best)
                          .join(Image, Image.id == FaceEmbedding.image_id)
                          .where(FaceEmbedding.model_version == model_version, _visible_images())
                          .group_by(FaceEmbedding.image_id, FaceEmbedding.event_id)
                          .having(best >= threshold)).all()
        for r in rows:
            if r.image_id not in found or r.similarity > found[r.image_id][1]:
                found[r.image_id] = (r.event_id, float(r.similarity))
    marks = {m.image_id: m for m in db.scalars(select(InstitutionalMark).where(InstitutionalMark.person_id == person.id))}
    for image_id, mark in marks.items():   # a pending mark the new search no longer supports goes away
        if mark.status == "pending" and image_id not in found:
            db.delete(mark)
        elif image_id in found:
            mark.similarity = found[image_id][1]
    for image_id, (event_id, similarity) in found.items():
        if image_id not in marks:   # a decision already taken (confirmed or rejected) is never undone
            db.add(InstitutionalMark(person_id=person.id, image_id=image_id, event_id=event_id, similarity=similarity))
    audit.record(db, "institutional.scanned", None, "institutional_person", person.id, found=len(found))


def mark_image(db: Session, image: Image, model_version: str) -> None:
    """Called right after an image is (re)indexed: it is compared with every active person (RF021 note 3)."""
    threshold = parameters.institutional_threshold(db)
    similarity = func.max(1 - InstitutionalVector.embedding.cosine_distance(FaceEmbedding.embedding)).label("similarity")
    rows = db.execute(
        select(InstitutionalVector.person_id, similarity)
        .join(FaceEmbedding, and_(FaceEmbedding.image_id == image.id, FaceEmbedding.model_version == InstitutionalVector.model_version))
        .join(InstitutionalPerson, InstitutionalPerson.id == InstitutionalVector.person_id)
        .where(InstitutionalVector.model_version == model_version, InstitutionalPerson.status == InstitutionalStatus.ACTIVE)
        .group_by(InstitutionalVector.person_id).having(similarity >= threshold)).all()
    for person_id, value in rows:
        db.execute(insert(InstitutionalMark).values(person_id=person_id, image_id=image.id, event_id=image.event_id,
                                                    similarity=float(value)).on_conflict_do_nothing())


# ------------------------------------------------------------------ consultation (RF021)

def get_person(db: Session, person_id: uuid.UUID) -> InstitutionalPerson:
    person = db.get(InstitutionalPerson, person_id)
    if person is None:
        raise NotFound("Pessoa não encontrada.")
    return person


def active_person(db: Session, person_id: uuid.UUID) -> InstitutionalPerson:
    """RF021 note 2: only people already registered and active can be consulted."""
    person = get_person(db, person_id)
    if person.status != InstitutionalStatus.ACTIVE:
        raise NotFound("Pessoa não encontrada.")
    return person


def active_people(db: Session) -> list[InstitutionalPerson]:
    return db.scalars(select(InstitutionalPerson).where(InstitutionalPerson.status == InstitutionalStatus.ACTIVE)
                      .order_by(InstitutionalPerson.full_name)).all()


def _shown_marks(person_id: uuid.UUID):
    return and_(InstitutionalMark.person_id == person_id, InstitutionalMark.status != "rejected",
                InstitutionalMark.image_id == Image.id, _visible_images())


def person_events(db: Session, account: Account, person: InstitutionalPerson, date_from: date | None,
                  date_to: date | None, theme_id: int | None) -> list[dict]:
    """RF021 notes 4 and 5: the events with the person, most recent first, with "N de M imagens".
    The consultation is recorded BEFORE anything is returned (note 8)."""
    audit.record(db, "institutional.query", account.id, "institutional_person", person.id,
                 date_from=str(date_from) if date_from else None, date_to=str(date_to) if date_to else None,
                 theme_id=theme_id)
    db.commit()
    q = (select(Event, func.count(InstitutionalMark.image_id).label("marked"))
         .join(InstitutionalMark, InstitutionalMark.event_id == Event.id).join(Image, Image.id == InstitutionalMark.image_id)
         .where(_shown_marks(person.id), Event.deletion_due_at.is_(None)).group_by(Event.id)
         .order_by(Event.date_start.desc()))
    if date_from:
        q = q.where(Event.date_end >= date_from)
    if date_to:
        q = q.where(Event.date_start <= date_to)
    if theme_id:
        q = q.where(Event.id.in_(select(event_themes.c.event_id).where(event_themes.c.theme_id == theme_id)))
    rows = db.execute(q).all()
    totals = dict(db.execute(select(Image.event_id, func.count()).where(
        Image.event_id.in_([e.id for e, _ in rows]), Image.review_status == ImageReviewStatus.PUBLISHED,
        Image.removal_requested_at.is_(None)).group_by(Image.event_id)).all()) if rows else {}
    return [{"id": e.id, "name": e.name, "date_label": dates.label(e.date_precision, e.date_start, e.date_end),
             "location": e.location, "marked": marked, "total": totals.get(e.id, marked)} for e, marked in rows]


def person_event_images(db: Session, person: InstitutionalPerson, event_id: uuid.UUID) -> list[tuple[InstitutionalMark, Image]]:
    """RF021 note 6: only the person's images in that event."""
    return db.execute(select(InstitutionalMark, Image).join(Image, Image.id == InstitutionalMark.image_id)
                      .where(_shown_marks(person.id), InstitutionalMark.event_id == event_id)
                      .order_by(InstitutionalMark.similarity.desc())).all()


def marked_image(db: Session, person: InstitutionalPerson, image_id: uuid.UUID) -> Image:
    image = db.scalar(select(Image).join(InstitutionalMark, InstitutionalMark.image_id == Image.id)
                      .where(_shown_marks(person.id), Image.id == image_id))
    if image is None:
        raise NotFound("Imagem não encontrada.")
    return image


def decide(db: Session, account: Account, person: InstitutionalPerson, image_ids: list[uuid.UUID], confirm: bool) -> int:
    """RF021 note 7: a person of the team confirms or rejects; a rejected mark leaves the list for good."""
    marks = db.scalars(select(InstitutionalMark).join(Image, Image.id == InstitutionalMark.image_id)
                       .where(_shown_marks(person.id), InstitutionalMark.image_id.in_(image_ids))).all()
    if not marks:
        raise EventError("Selecione ao menos uma imagem.")
    for mark in marks:
        mark.status, mark.decided_by, mark.decided_at = ("confirmed" if confirm else "rejected"), account.id, _now()
    audit.record(db, "institutional.marks_confirmed" if confirm else "institutional.marks_rejected", account.id,
                 "institutional_person", person.id, images=len(marks))
    db.commit()
    return len(marks)


def counts(db: Session, person_id: uuid.UUID) -> dict:
    rows = dict(db.execute(select(InstitutionalMark.status, func.count()).join(Image, Image.id == InstitutionalMark.image_id)
                           .where(InstitutionalMark.person_id == person_id, _visible_images())
                           .group_by(InstitutionalMark.status)).all())
    return {"pending": rows.get("pending", 0), "confirmed": rows.get("confirmed", 0), "rejected": rows.get("rejected", 0)}


def names_on_image(db: Session, image_id: uuid.UUID) -> list[str]:
    """"Pessoa institucional localizada" on the image, in the panel (RF021 note 3)."""
    return list(db.scalars(select(InstitutionalPerson.full_name).join(
        InstitutionalMark, InstitutionalMark.person_id == InstitutionalPerson.id).where(
        InstitutionalMark.image_id == image_id, InstitutionalMark.status != "rejected",
        InstitutionalPerson.status == InstitutionalStatus.ACTIVE).order_by(InstitutionalPerson.full_name)))

