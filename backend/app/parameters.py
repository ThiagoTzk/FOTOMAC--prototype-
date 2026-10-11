"""Administrator-configurable parameters of facial recognition and retention (RF026).

Values live in system_parameters (one row per changed key); a key never changed uses its
default. Every change is written to the append-only audit log with the previous and the new
value and the administrator (note 4) — nobody can rewrite that history.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.config import get_settings
from app.db.models import Account, AuditLog, Event, EventStatus, SystemParameter
from app.events import dates


@dataclass(frozen=True)
class Spec:
    label: str
    default: float
    minimum: float
    maximum: float
    step: float
    unit: str
    group: str
    help: str
    integer: bool = True


_factory = get_settings()  # .env holds the factory defaults; the administrator's changes live in the DB

SPECS: dict[str, Spec] = {
    "similarity_threshold": Spec(
        "Limiar de similaridade", _factory.similarity_threshold, 0.20, 0.80, 0.01, "", "Comparação",
        "Semelhança mínima (0 a 1) para uma foto ser entregue ao visitante. Mais alto = menos falsos positivos "
        "e mais fotos verdadeiras perdidas. Padrão calibrado no Teste 1: 0,30.", integer=False),
    "max_results_per_search": Spec(
        "Teto de resultados por busca", _factory.max_results_per_search, 10, 1000, 10, "fotos", "Comparação",
        "Quantidade máxima de fotos devolvidas numa busca."),
    "min_detection_score": Spec(
        "Confiança mínima da detecção", _factory.min_detection_score, 0.50, 0.95, 0.01, "", "Detecção",
        "Abaixo disso o rosto é ignorado, na indexação e na foto de busca. O detector já descarta tudo abaixo "
        "de 0,50 (configuração de fábrica), por isso não é possível baixar mais.", integer=False),
    "min_query_face_side": Spec(
        "Lado mínimo do rosto da foto de busca", _factory.min_query_face_side, 20, 400, 1, "pixels", "Detecção",
        "Rostos menores que isso na foto enviada pelo visitante são recusados por qualidade insuficiente (RF017)."),
    "searches_per_session": Spec(
        "Buscas por sessão de visitante", 10, 1, 100, 1, "buscas", "Limites de requisição",
        "Depois disso o visitante precisa voltar ao evento e dar ciência de novo."),
    "searches_per_address": Spec(
        "Buscas por endereço de origem (a cada 10 min)", 20, 1, 500, 1, "buscas", "Limites de requisição",
        "Protege contra varredura automatizada do acervo e o custo da inferência (RF016 nota 8)."),
    "downloads_per_address": Spec(
        "Downloads por endereço de origem (a cada 10 min)", 60, 1, 1000, 1, "downloads", "Limites de requisição",
        "Desestimula a extração automatizada das fotos (RF019 nota 3)."),
    "retention_months": Spec(
        "Prazo de retenção do acervo", 6, 1, 60, 1, "meses", "Retenção",
        "Por quanto tempo, após a data do evento, as fotos ficam disponíveis. Ao mudar, a expiração dos eventos "
        "ainda não expirados é recalculada na hora e o prazo exibido ao público também muda (RF026 nota 2)."),
}

DEFAULTS = {k: s.default for k, s in SPECS.items()}


class ParameterError(ValueError):
    pass


def get(db: Session, key: str):
    row = db.get(SystemParameter, key)
    value = row.value if row is not None else SPECS[key].default
    return int(value) if SPECS[key].integer else float(value)


def all_values(db: Session) -> dict[str, float]:
    return {k: get(db, k) for k in SPECS}


def retention_months(db: Session) -> int:
    return int(get(db, "retention_months"))


def update(db: Session, admin: Account, values: dict[str, float], threshold_warning_acknowledged: bool) -> list[str]:
    """Validates every value first, then applies all of them (all or nothing). Returns the keys
    actually changed."""
    current = all_values(db)
    changes: dict[str, float] = {}
    for key, raw in values.items():
        spec = SPECS.get(key)
        if spec is None:
            raise ParameterError(f"Parâmetro desconhecido: {key}.")
        try:
            value = int(raw) if spec.integer else round(float(raw), 4)
        except (TypeError, ValueError):
            raise ParameterError(f"{spec.label}: informe um número.") from None
        if spec.integer and float(raw) != int(raw):
            raise ParameterError(f"{spec.label}: informe um número inteiro.")
        if not spec.minimum <= value <= spec.maximum:
            raise ParameterError(f"{spec.label}: o valor deve estar entre {_fmt(spec.minimum)} e {_fmt(spec.maximum)}.")
        if value != current[key]:
            changes[key] = value
    if "similarity_threshold" in changes and not threshold_warning_acknowledged:
        # RF026 note 1: the change must be preceded by the warning — enforced here, not only on screen.
        raise ParameterError("Confirme a advertência sobre o limiar de similaridade antes de salvar.")
    for key, value in changes.items():
        row = db.get(SystemParameter, key)
        if row is None:
            db.add(SystemParameter(key=key, value=value, updated_by=admin.id))
        else:
            row.value, row.updated_by = value, admin.id
        audit.record(db, "parameter.changed", admin.id, "parameter", key, previous=current[key], new=value)
    if "retention_months" in changes:
        _recompute_expiry(db, changes["retention_months"])
    db.commit()
    return list(changes)


NOTICE_DAYS = 30  # RF006 note 5: photographers are warned at least 30 days before


def new_expiry(event_end: date, months: int, today: date) -> date:
    """The expiry an event gets under a new retention. A REDUCED retention never makes an event
    expire in less than 30 days from now: RF026 note 2 (applies at once) and RF006 note 5
    (30-day notice so the photographers can download the package) must both hold."""
    return max(dates.expiry_date(event_end, months), today + timedelta(days=NOTICE_DAYS))


def retention_impact(db: Session, months: int, today: date) -> dict:
    """What a new retention would do, shown to the administrator BEFORE saving."""
    changed = held = 0
    for event in db.scalars(select(Event).where(Event.status != EventStatus.EXPIRED)):
        target = dates.expiry_date(event.date_end, months)
        if target != event.expires_on:
            changed += 1
        if target < today + timedelta(days=NOTICE_DAYS):
            held += 1
    return {"events_changed": changed, "held_by_notice": held, "notice_days": NOTICE_DAYS}


def _recompute_expiry(db: Session, months: int) -> None:
    """RF026 note 2: events not yet expired get the new expiry date immediately."""
    today = date.today()
    for event in db.scalars(select(Event).where(Event.status != EventStatus.EXPIRED)):
        target = new_expiry(event.date_end, months, today)
        if target != event.expires_on:
            event.expires_on = target
            event.expiry_notice_sent_at = None  # warn again, about the NEW date


def history(db: Session, limit: int = 50) -> list[AuditLog]:
    return db.scalars(select(AuditLog).where(AuditLog.action == "parameter.changed")
                      .order_by(AuditLog.id.desc()).limit(limit)).all()


def _fmt(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:.2f}".replace(".", ",")
