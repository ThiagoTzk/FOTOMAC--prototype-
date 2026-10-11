"""Event themes maintained by the administrator (RF027)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.db.models import Account, Theme, event_themes
from app.events.service import EventError, NotFound


def list_with_counts(db: Session) -> list[tuple[Theme, int]]:
    """"Relação de Temas": name, situation and how many events use each one."""
    count = select(func.count()).select_from(event_themes).where(event_themes.c.theme_id == Theme.id).scalar_subquery()
    return list(db.execute(select(Theme, count).order_by(Theme.active.desc(), func.lower(Theme.name))).all())


def _get(db: Session, theme_id: int) -> Theme:
    theme = db.get(Theme, theme_id)
    if theme is None:
        raise NotFound("Tema não encontrado.")
    return theme


def _clean(db: Session, name: str, ignore_id: int | None = None) -> str:
    name = " ".join(name.split())
    if not name:
        raise EventError("Informe o nome do tema.")
    if len(name) > 50:
        raise EventError("O nome do tema pode ter até 50 caracteres.")
    clash = db.scalar(select(Theme.id).where(func.lower(Theme.name) == name.lower(), Theme.id != (ignore_id or -1)))
    if clash:
        raise EventError("Já existe um tema com esse nome.")  # unique in the system
    return name


def create(db: Session, admin: Account, name: str) -> Theme:
    theme = Theme(name=_clean(db, name), active=True)
    db.add(theme)
    db.flush()
    audit.record(db, "theme.created", admin.id, "theme", str(theme.id), name=theme.name)
    db.commit()
    return theme


def rename(db: Session, admin: Account, theme_id: int, name: str) -> Theme:
    theme = _get(db, theme_id)
    new = _clean(db, name, theme.id)
    if new != theme.name:
        audit.record(db, "theme.renamed", admin.id, "theme", str(theme.id), previous=theme.name, new=new)
        theme.name = new
    db.commit()
    return theme


def set_active(db: Session, admin: Account, theme_id: int, active: bool) -> Theme:
    """Inactive: no longer offered for new events nor in the public filters; events that already
    use it keep it (RF027 note 1)."""
    theme = _get(db, theme_id)
    if theme.active != active:
        theme.active = active
        audit.record(db, "theme.activated" if active else "theme.deactivated", admin.id, "theme", str(theme.id))
    db.commit()
    return theme


def delete(db: Session, admin: Account, theme_id: int) -> None:
    """Only a theme NO event uses can be deleted; otherwise it is inactivated (note 1)."""
    theme = _get(db, theme_id)
    used = db.scalar(select(func.count()).select_from(event_themes).where(event_themes.c.theme_id == theme.id))
    if used:
        raise EventError(f"Este tema está em {used} evento(s) e não pode ser excluído — inative-o.")
    audit.record(db, "theme.deleted", admin.id, "theme", str(theme.id), name=theme.name)
    db.delete(theme)
    db.commit()
