"""Public area rules (RF013-RF019, RF022, RF023) — what a visitor WITHOUT an account can do.

Privacy guarantees enforced here, on the server (RF014 note 1, RF019 note 1):
- only "Publicado" events exist publicly; everything else is "not found";
- no image is served unless it is in the result of THIS visitor session's last search;
- the search reference comes only from the camera, through the guided capture with liveness check
  (RF036): the frames and their vectors live only in memory during the search (RF016 note 4);
- the search compares only against vectors of ONE event (RF010 note 4, RF016 note 1).
"""
from __future__ import annotations

import json
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import Select, func, or_, select, text
from sqlalchemy.orm import Session

from app import audit, parameters
from app.auth.tokens import token_hash
from app.calibration import poses
from app.config import get_settings
from app.db.models import (Account, AccountRole, AccountStatus, ConsentRecord, Event, EventStatus, FaceEmbedding,
                           Image, ImageIndexingStatus, ImageReviewStatus, RemovalRequest, RemovalStatus, Theme,
                           VisitorSession)
from app.events.service import EventError, NotFound
from app.face.port import FaceEngine, FaceQualityTooLowError, NoFaceDetectedError
from app.face.selection import NO_FACE_MESSAGE, select_query_face
from app.imaging import decode_image, is_jpeg
from app.notifications.port import EmailMessage, EmailSender
from app.security import signed_links

SESSION_HOURS = 2
REMOVAL_HOURS = 72                 # RF023

# Guided capture (RF036). The browser takes ~6 frames per step (front + 4 movements) at most 1280 px.
MOVES = ("esquerda", "direita", "cima", "baixo")
CAPTURE_SECONDS = 120              # the drawn order is valid for one capture, right after it is asked
MIN_FRAMES, MAX_FRAMES = 5, 40
MAX_FRAME_BYTES = 2 * 1024 * 1024
# The poses of one capture must be the same person: otherwise someone could turn their own head for
# the liveness check while showing another person's photo in the frontal frame. Same person across
# poses scores ~0.4-0.9 with SFace; different people stay below ~0.25 (NASA fixtures: at most 0.24).
# The development log (diagnostics_log) records the real values, to tune this with real faces.
SAME_PERSON = 0.30

log = logging.getLogger("fotomac.liveness")

# ------------------------------------------------------------------ consent text (RF015)
# Versioned: the version goes to every consent record, so it is always possible to prove
# WHICH text a visitor accepted (RF015 note 7). Change the text → change the version.
CONSENT_VERSION = "2026-10-v2"   # v2 (17/10/2026): guided capture with liveness check (requirements v2.0, RF015)
CONSENT_TITLE = "Permissão para uso de imagem"
CONSENT_PARAGRAPHS = [
    "Para encontrar suas fotos, precisamos de uma captura rápida do seu rosto: olhe para a câmera e siga os "
    "movimentos indicados na tela.",
    "Sua privacidade é nossa prioridade e seus dados serão tratados de acordo com a Lei Geral de Proteção de Dados "
    "(Lei nº 13.709/2018).",
    "A captura será utilizada apenas para comparar com as fotos deste evento e para confirmar que há uma pessoa real "
    "diante da câmera. Somente alguns quadros são enviados, e eles são excluídos após o processamento; o vídeo não é "
    "gravado. Não compartilhamos sua imagem com terceiros.",
    "Este serviço não se destina a pessoas menores de 18 anos sem o consentimento de um dos pais ou do responsável legal.",
    "Para mais informações, acesse nossa Política de Privacidade e LGPD. Ao clicar em “Estou ciente”, concordo com os "
    "termos e condições.",
]


class PublicError(EventError):
    """reason lets the screen pick the right guidance; message is safe to show."""

    def __init__(self, message: str, reason: str = "error"):
        super().__init__(message)
        self.reason = reason


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ events (RF013, RF014)

def published_events() -> Select:
    # RF013 note 8: only "Publicado"; "Em Edição", "Em Processamento" and "Expirado" do not
    # exist for the public — not even by direct address.
    return select(Event).where(Event.status == EventStatus.PUBLISHED,
                               Event.deletion_due_at.is_(None))  # an event being deleted left the site at once


def published_images() -> Select:
    return (select(Image).join(Event, Event.id == Image.event_id)
            .where(Event.status == EventStatus.PUBLISHED, Image.review_status == ImageReviewStatus.PUBLISHED))


def get_public_event(db: Session, event_id: uuid.UUID) -> Event:
    event = db.scalar(published_events().where(Event.id == event_id))
    if event is None:
        raise NotFound("Evento não encontrado.")
    return event


def list_public_events(db: Session, q: str | None, theme_ids: list[int], day: datetime | None,
                       period_start, period_end, page: int, page_size: int = 20) -> tuple[list[Event], int]:
    query = published_events()
    if q and q.strip():
        term = q.strip().lower()
        # RF013 note 1: partial, accent-insensitive AND tolerant to simple spelling mistakes
        # (trigram similarity, pg_trgm): "fecil" finds "FeCiAL", "colacao" finds "Colação".
        name = func.unaccent(func.lower(Event.name))
        query = query.where(or_(name.like(func.unaccent(f"%{term}%")),
                                func.word_similarity(func.unaccent(term), name) > 0.4))
    if theme_ids:  # several themes combined (RF013 note 4): an event with ANY of them
        query = query.where(Event.themes.any(Theme.id.in_(theme_ids)))
    if day:  # by the EVENT date, not the upload date (RF013 note 5)
        query = query.where(Event.date_start <= day, Event.date_end >= day)
    if period_start:
        query = query.where(Event.date_end >= period_start)
    if period_end:
        query = query.where(Event.date_start <= period_end)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(Event.date_start.desc(), Event.created_at.desc())
                       .offset((max(page, 1) - 1) * page_size).limit(page_size)).all()
    return list(items), total


def published_count(db: Session, event_id: uuid.UUID) -> int:
    """RF013 note 6: counts only published images — and shows none of them."""
    return db.scalar(select(func.count()).select_from(Image).where(
        Image.event_id == event_id, Image.review_status == ImageReviewStatus.PUBLISHED)) or 0


def credits(db: Session, event: Event) -> list[str]:
    """RF014 note 3: every photographer of the coverage (collaboration may add several)."""
    names = db.scalars(select(Image.credit_signature).where(
        Image.event_id == event.id, Image.review_status == ImageReviewStatus.PUBLISHED).distinct()).all()
    return sorted(names) or [event.owner.photographer_signature or event.owner.full_name]


# ------------------------------------------------------------------ consent and session

def give_consent(db: Session, event: Event) -> str:
    """Records the "Estou ciente" and opens an anonymous session for this event. Returns the
    session token (goes only into an HttpOnly cookie)."""
    record = ConsentRecord(event_id=event.id, text_version=CONSENT_VERSION)
    db.add(record)
    db.flush()
    token = secrets.token_urlsafe(32)
    db.add(VisitorSession(token_hash=token_hash(token), event_id=event.id, consent_id=record.id,
                          expires_at=_now() + timedelta(hours=SESSION_HOURS), result_ids=[]))
    db.commit()
    return token


def get_session(db: Session, token: str | None, event_id: uuid.UUID | None = None) -> VisitorSession | None:
    if not token:
        return None
    s = db.get(VisitorSession, token_hash(token))
    if s is None or s.expires_at < _now() or (event_id and s.event_id != event_id):
        return None
    return s


def end_session(db: Session, token: str | None) -> None:
    """The visitor left the event page: the result and the consent of that visit are erased.
    Nothing of the search survives the page — on a shared computer the next person must not
    see someone else's photos (RF014, RS001)."""
    if token:
        db.query(VisitorSession).filter(VisitorSession.token_hash == token_hash(token)).delete()
        db.commit()


# ------------------------------------------------------------------ search (RF016, RF017)

@dataclass
class Match:
    image_id: uuid.UUID
    similarity: float


def _require_session(db: Session, session: VisitorSession | None, event: Event) -> VisitorSession:
    # RF016 note 3 / RF015 note 1: without the recorded consent, NO vector is generated.
    if session is None or session.event_id != event.id:
        raise PublicError("Antes da busca, leia o aviso de permissão para uso de imagem e confirme que está ciente.",
                          "consent_required")
    if session.searches >= parameters.get(db, "searches_per_session"):
        raise PublicError("Você atingiu o limite de buscas desta sessão. Volte ao evento e tente novamente mais tarde.",
                          "limit")
    return session


def issue_challenge(db: Session, session: VisitorSession | None, event: Event) -> list[str]:
    """Draws the order of the 4 head movements for ONE guided capture (RF036 note 2). Drawn here, not
    in the browser, so nobody can choose the order of a video recorded beforehand."""
    session = _require_session(db, session, event)
    order = secrets.SystemRandom().sample(MOVES, len(MOVES))
    session.capture_order, session.capture_issued_at = order, _now()
    db.commit()
    return order


def _refuse(db: Session, session: VisitorSession, event: Event, outcome: str, message: str, diagnostics: dict) -> None:
    session.searches += 1
    audit.record(db, "public.search", None, "event", event.id, outcome=outcome)  # aggregated, anonymous (RF024)
    db.commit()
    if get_settings().diagnostics_log:
        log.info("busca recusada (%s): %s", outcome, json.dumps(diagnostics, ensure_ascii=False))
    raise PublicError(message, outcome)


LIVENESS_MESSAGE = ("Não conseguimos confirmar os movimentos. Busque de novo e siga o bonequinho, virando o rosto "
                    "devagar, com o rosto inteiro no círculo e boa luz.")


def search(db: Session, engine: FaceEngine, session: VisitorSession | None, event: Event,
           frames: list[bytes], steps: list[str]) -> list[Match]:
    """Public search from a guided capture (RF016, RF017, RF036): frames taken while the visitor
    followed the movements drawn by issue_challenge(), each tagged with its step."""
    session = _require_session(db, session, event)
    # The drawn order is used once, whatever happens next: a failed capture asks for a new order.
    order, issued = session.capture_order, session.capture_issued_at
    session.capture_order = session.capture_issued_at = None
    if not order or not issued or (_now() - issued).total_seconds() > CAPTURE_SECONDS:
        db.commit()
        raise PublicError("A captura expirou. Toque em “Buscar minhas fotos” e grave de novo.", "challenge")
    if not MIN_FRAMES <= len(frames) <= MAX_FRAMES or len(frames) != len(steps) or \
            any(st not in ("frente", *MOVES) for st in steps) or \
            any(len(f) > MAX_FRAME_BYTES or not is_jpeg(f) for f in frames):
        db.commit()
        raise PublicError("A captura chegou incompleta. Grave de novo.", "format")

    # Each frame is decoded and detected ONCE, in memory only (RF016 note 4).
    images = [decode_image(f) for f in frames]
    detected = [engine.detect(img) for img in images]
    described = [poses.frame_from_faces(n, img, faces) for n, (img, faces) in enumerate(zip(images, detected))]
    chosen, liveness = poses.select_guided(described, steps)
    diagnostics = {"pedido": ["frente", *order], "liveness": liveness}
    if not any(described):  # no face in any frame: say so (RF017 note 4), not "movements not confirmed"
        _refuse(db, session, event, "no_face", NO_FACE_MESSAGE, diagnostics)
    if liveness.get("order") != order:
        liveness["passed"] = False
        diagnostics["ordem_recebida"] = liveness.get("order")
    if not liveness["passed"]:
        _refuse(db, session, event, "liveness", LIVENESS_MESSAGE, diagnostics)

    # One query face per pose (RF017); the frontal pose is required, the others are a bonus.
    min_score, min_side = parameters.get(db, "min_detection_score"), parameters.get(db, "min_query_face_side")
    vectors = []
    for index, pose in chosen:
        img = images[index]
        try:
            face = select_query_face(detected[index], img.shape[1], img.shape[0], min_score, min_side)
        except (NoFaceDetectedError, FaceQualityTooLowError) as exc:
            if pose == "frente":  # user-safe messages (RF017 notes 4-5)
                reason = "no_face" if isinstance(exc, NoFaceDetectedError) else "low_quality"
                _refuse(db, session, event, reason, str(exc), diagnostics)
            continue
        vectors.append((pose, face.embedding))
    # RF017 note 7: every pose must be the same person as the frontal one.
    front = vectors[0][1]
    alike = {pose: round(float(front @ v), 3) for pose, v in vectors[1:]}
    diagnostics["mesma_pessoa"] = alike
    if any(value < SAME_PERSON for value in alike.values()):
        _refuse(db, session, event, "consistency",
                "Durante a captura o rosto mudou ou apareceu outra pessoa. Busque de novo com só o seu rosto na câmera.",
                diagnostics)

    # RF016 note 7: a photo is returned when ANY pose reaches the threshold; it keeps its best similarity.
    threshold, limit = parameters.get(db, "similarity_threshold"), parameters.get(db, "max_results_per_search")
    best_of: dict[uuid.UUID, float] = {}
    for _, vector in vectors:
        best = func.max(1 - FaceEmbedding.embedding.cosine_distance(vector)).label("similarity")
        rows = db.execute(
            select(FaceEmbedding.image_id, best)
            .join(Image, Image.id == FaceEmbedding.image_id)
            .where(FaceEmbedding.event_id == event.id,                       # ONE event, always
                   FaceEmbedding.model_version == engine.model_version,      # comparable vectors only
                   Image.review_status == ImageReviewStatus.PUBLISHED,
                   Image.indexing_status == ImageIndexingStatus.PROCESSED,
                   Image.removal_requested_at.is_(None))                     # RF023 note 4
            .group_by(FaceEmbedding.image_id)
            .having(best >= threshold)
            .order_by(best.desc())
            .limit(limit)).all()
        for r in rows:
            best_of[r.image_id] = max(best_of.get(r.image_id, 0.0), float(r.similarity))
    del vectors, front, detected, described, images, frames  # nothing derived from the capture survives

    matches = sorted((Match(i, sim) for i, sim in best_of.items()), key=lambda m: -m.similarity)[:limit]
    session.searches += 1
    session.result_ids = [m.image_id for m in matches]  # RF016 note 8: results bound to the session
    audit.record(db, "public.search", None, "event", event.id, found=len(matches), poses=len(alike) + 1)
    db.commit()
    if get_settings().diagnostics_log:
        log.info("busca aceita: %s", json.dumps(diagnostics, ensure_ascii=False))
    return matches


def allowed_image(db: Session, session: VisitorSession | None, image_id: uuid.UUID) -> Image:
    """RF014 note 6 / RF019 note 1: an image is served ONLY if it is in this session's result."""
    if session is None or image_id not in (session.result_ids or []):
        raise NotFound("Imagem não encontrada.")
    image = db.get(Image, image_id)
    if image is None or image.review_status != ImageReviewStatus.PUBLISHED or image.removal_requested_at:
        raise NotFound("Imagem não encontrada.")
    return image


DOWNLOAD_SECONDS = 15 * 60  # RF019 note 7: at most 15 minutes


def download_token(session: VisitorSession, image_id: uuid.UUID, now: float | None = None) -> str:
    """RF019 note 7: signed address, valid for 15 minutes, bound to the session that asked for
    it and limited to this one image."""
    return signed_links.sign(session.token_hash, f"image:{image_id}", DOWNLOAD_SECONDS, now)


def valid_download_token(session: VisitorSession, image_id: uuid.UUID, token: str | None) -> bool:
    return signed_links.verify(session.token_hash, f"image:{image_id}", token)


# ------------------------------------------------------------------ removal (RF023)

def _staff_emails(db: Session, event: Event) -> list[str]:
    admins = db.scalars(select(Account.email).where(Account.role == AccountRole.ADMIN,
                                                    Account.status == AccountStatus.ACTIVE)).all()
    return sorted({event.owner.email, *admins})


def request_removal(db: Session, sender: EmailSender, session: VisitorSession | None, image_id: uuid.UUID,
                    contact: str, reason: str | None) -> RemovalRequest:
    """From the enlarged photo of a search result (RF023 note 1, preferred way)."""
    return _open_removal(db, sender, [allowed_image(db, session, image_id)], contact, reason)[0]


def _open_removal(db: Session, sender: EmailSender, images: list[Image], contact: str,
                  reason: str | None) -> list[RemovalRequest]:
    contact = contact.strip()
    if "@" not in contact or len(contact) > 120:
        raise PublicError("Informe um e-mail válido para receber a confirmação.", "contact")
    pending = [i for i in images if i.removal_requested_at is None]
    if not pending:  # already on its way out: no second deadline
        raise PublicError("Já existe uma solicitação de remoção para esta imagem. Ela será excluída em até 72 horas.",
                          "already_requested")
    now = _now()
    deadline = now + timedelta(hours=REMOVAL_HOURS)
    requests = []
    for image in pending:
        req = RemovalRequest(id=uuid.uuid4(), image_id=image.id, event_id=image.event_id,
                             reason=(reason or "").strip()[:500] or None, contact_email=contact, deadline_at=deadline)
        image.removal_requested_at = now  # out of every search immediately (RF023 note 4)
        db.add(req)
        audit.record(db, "removal.request", None, "image", image.id, deadline=deadline.isoformat())
        requests.append(req)
    db.commit()
    # RF023 note 5: responsible photographer and administrators are notified at once — one
    # message per event concerned.
    for event in {i.event_id: i.event for i in pending}.values():
        for email in _staff_emails(db, event):
            sender.send(EmailMessage(
                to=email, subject="FOTOMAC — solicitação de remoção de imagem",
                body=(f"Uma pessoa retratada solicitou a remoção de uma imagem do evento “{event.name}”.\n\n"
                      "A imagem já foi retirada das buscas e será excluída AUTOMATICAMENTE em 72 horas "
                      f"({deadline.astimezone().strftime('%d/%m/%Y às %H:%M')}), mesmo sem ação sua. Ela aparece "
                      "destacada como “Remoção solicitada” na área de imagens do evento.\n\nEquipe FOTOMAC")))
    sender.send(EmailMessage(
        to=contact, subject="FOTOMAC — recebemos sua solicitação de remoção",
        body=("Recebemos sua solicitação. A imagem foi retirada imediatamente dos resultados de busca e será "
              "excluída definitivamente em até 72 horas. Você receberá outra mensagem quando a exclusão for "
              "concluída.\n\nEquipe FOTOMAC — Centro Universitário CESMAC")))
    return requests


def conclude_removals(db: Session, sender: EmailSender, image_id: uuid.UUID, status: RemovalStatus) -> None:
    """Called when the image is deleted (by the photographer or automatically): tells the
    requester and then ERASES their contact data (RF023 note 3)."""
    for req in db.scalars(select(RemovalRequest).where(RemovalRequest.image_id == image_id,
                                                       RemovalRequest.status == RemovalStatus.RECEIVED)):
        if req.contact_email:
            sender.send(EmailMessage(
                to=req.contact_email, subject="FOTOMAC — imagem removida",
                body=("A imagem que você pediu para remover foi excluída definitivamente do FOTOMAC, junto com os "
                      "dados de reconhecimento facial associados.\n\nEquipe FOTOMAC — Centro Universitário CESMAC")))
        req.status, req.concluded_at, req.contact_email = status, _now(), None


def due_removals(db: Session) -> list[Image]:
    """RF023 note 6: never let a missed deadline keep the image in the collection."""
    return list(db.scalars(select(Image).where(
        Image.removal_requested_at.is_not(None),
        Image.removal_requested_at <= _now() - timedelta(hours=REMOVAL_HOURS))))


def retention_text(db: Session) -> str:
    months = parameters.retention_months(db)
    return f"{months} meses" if months != 1 else "1 mês"
