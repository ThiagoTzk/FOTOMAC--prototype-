"""What needs the attention of THIS account: the bell of the panel and the "Avisos" card of the
overview (17/10/2026).

Computed from the data on every request — nothing is stored. A notice disappears by itself when the
situation is solved (there is no "mark as read" to forget, and no new record about people is kept).
Each notice says what happened, in which event, and where to act; "urgent" ones (something will be
lost or someone is waiting) light the bell's counter, the others only inform.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (Account, AccountRole, Event, EventStatus, Image, ImageIndexingStatus,
                           ImageReviewStatus)
from app.parameters import NOTICE_DAYS
from app.public.service import REMOVAL_HOURS


@dataclass
class Notice:
    kind: str          # removal | deletion | approval | failed | expiring | ready | processing | contractor | own_pending
    tone: str          # danger | warning | info
    urgent: bool
    title: str
    description: str
    href: str


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _br(moment: datetime) -> str:
    return moment.astimezone().strftime("%d/%m às %H:%M")


def for_account(db: Session, account: Account) -> list[dict]:
    now = datetime.now(timezone.utc)
    out: list[Notice] = []

    if account.role == AccountRole.CONTRACTOR:  # RF031: its validity and its photos waiting
        if account.valid_until:
            out.append(Notice("contractor", "warning", account.valid_until - now < timedelta(hours=3),
                              f"Sua conta temporária vale até {_br(account.valid_until)}",
                              "Depois disso o acesso termina automaticamente. Envie as imagens antes.",
                              f"/eventos/{account.bound_event_id}/imagens" if account.bound_event_id else "/painel"))
        waiting = db.scalar(select(func.count()).select_from(Image).where(
            Image.uploaded_by == account.id, Image.approval == "pending")) or 0
        if waiting:
            out.append(Notice("own_pending", "info", False, f"{_plural(waiting, 'imagem aguarda', 'imagens aguardam')} aprovação",
                              "A administração revisa antes da publicação.",
                              f"/eventos/{account.bound_event_id}/imagens?filtro=pending_approval"))
        return [asdict(n) for n in out]

    # The events this account answers for: all of them for the administrator, its own for the others.
    managed = select(Event).where(Event.status != EventStatus.EXPIRED)
    if account.role != AccountRole.ADMIN:
        managed = managed.where(Event.owner_id == account.id)
    events = {e.id: e for e in db.scalars(managed)}
    ids = list(events)
    if not ids:
        return []

    # Someone asked for an image to be removed: it goes automatically at the deadline (RF023).
    for event_id, n, first in db.execute(
            select(Image.event_id, func.count(), func.min(Image.removal_requested_at))
            .where(Image.event_id.in_(ids), Image.removal_requested_at.is_not(None)).group_by(Image.event_id)):
        hours = max(0, round((first + timedelta(hours=REMOVAL_HOURS) - now).total_seconds() / 3600))
        out.append(Notice("removal", "danger", True,
                          f"{events[event_id].name}: {_plural(n, 'pedido', 'pedidos')} de remoção",
                          f"A imagem já saiu das buscas e é excluída automaticamente em até {hours} h.",
                          f"/eventos/{event_id}/imagens?filtro=removal"))

    for e in events.values():  # "Excluir evento": the photos are eliminated at the end of the period (RF038)
        if e.deletion_due_at:
            out.append(Notice("deletion", "danger", True, f"{e.name}: exclusão agendada",
                              f"Tudo é eliminado em {_br(e.deletion_due_at)}. Até lá, a exclusão pode ser desfeita.",
                              f"/eventos/{e.id}"))

    if account.role == AccountRole.ADMIN:  # RF031: a hired photographer's photos wait for the administrator
        for event_id, n in db.execute(select(Image.event_id, func.count()).where(
                Image.event_id.in_(ids), Image.approval == "pending").group_by(Image.event_id)):
            out.append(Notice("approval", "warning", True,
                              f"{events[event_id].name}: {_plural(n, 'imagem aguarda', 'imagens aguardam')} aprovação",
                              "Enviadas por fotógrafo contratado. Só entram na publicação depois de aprovadas.",
                              f"/eventos/{event_id}/imagens?filtro=pending_approval"))

    for event_id, n in db.execute(select(Image.event_id, func.count()).where(
            Image.event_id.in_(ids), Image.indexing_status == ImageIndexingStatus.FAILED).group_by(Image.event_id)):
        out.append(Notice("failed", "warning", True,
                          f"{events[event_id].name}: {_plural(n, 'falha', 'falhas')} no reconhecimento facial",
                          "Essas imagens não aparecem nas buscas. Dá para reprocessar.",
                          f"/eventos/{event_id}/imagens?filtro=failed"))

    soon = date.today() + timedelta(days=NOTICE_DAYS)  # RF006 note 5: download before the collection is eliminated
    for e in events.values():
        if not e.deletion_due_at and e.expires_on <= soon:
            out.append(Notice("expiring", "warning", True, f"{e.name}: expira em {e.expires_on.strftime('%d/%m/%Y')}",
                              "Nessa data as imagens e os dados de reconhecimento facial são eliminados. Baixe o acervo antes.",
                              f"/eventos/{e.id}/download"))

    # Information only: the next step of the account's OWN events.
    own = [i for i, e in events.items() if e.owner_id == account.id and not e.deletion_due_at]
    if own:
        for event_id, n in db.execute(select(Image.event_id, func.count()).where(
                Image.event_id.in_(own), Image.review_status == ImageReviewStatus.IN_REVIEW,
                Image.approval.is_distinct_from("pending")).group_by(Image.event_id)):
            out.append(Notice("ready", "info", False,
                              f"{events[event_id].name}: {_plural(n, 'imagem pronta', 'imagens prontas')} para publicação",
                              "Confira e publique na aba Imagens.", f"/eventos/{event_id}/imagens?filtro=in_review"))
        for event_id in own:
            if events[event_id].status == EventStatus.PROCESSING:
                out.append(Notice("processing", "info", False, f"{events[event_id].name}: reconhecimento facial em andamento",
                                  "O evento entra no site sozinho quando terminar.", f"/eventos/{event_id}/processamento"))

    order = {"danger": 0, "warning": 1, "info": 2}
    out.sort(key=lambda n: (order[n.tone], n.title))
    return [asdict(n) for n in out]
