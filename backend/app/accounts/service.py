"""Accounts managed by the administrator (RF001, RF002 note 7, RF003).

There is NO self-registration anywhere (RF001 note 8): accounts exist only because an
administrator created them here. The account is born without a password; the holder defines
it through a single-use link (RF001 note 5). Accounts are never deleted (RF003 note 4).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit
from app.auth import service as auth
from app.auth.service import _revoke_all_sessions
from app.db.models import Account, AccountRole, AccountStatus, Event, PasswordToken, PasswordTokenPurpose
from app.events.service import EventError, NotFound, PermissionDenied
from app.notifications.port import EmailMessage, EmailSender

ROLE_LABEL = {AccountRole.ADMIN: "Administrador", AccountRole.PHOTOGRAPHER: "Fotógrafo"}
STATUS_LABEL = {AccountStatus.PENDING: "Acesso Pendente", AccountStatus.ACTIVE: "Ativa",
                AccountStatus.INACTIVE: "Inativa", AccountStatus.SUSPENDED: "Suspensa"}
INSTITUTIONAL_DOMAIN = "cesmac.edu.br"


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class AccountInput:
    full_name: str
    email: str
    role: AccountRole
    photographer_signature: str | None


def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if len(name.split()) < 2:
        raise EventError("Informe o nome completo (nome e sobrenome).")  # RF001 note 1
    if len(name) > 120:
        raise EventError("O nome completo pode ter até 120 caracteres.")
    return name


def _clean_signature(role: AccountRole, signature: str | None) -> str | None:
    signature = " ".join((signature or "").split()) or None
    if role == AccountRole.PHOTOGRAPHER and not signature:
        raise EventError("A assinatura é obrigatória para o perfil Fotógrafo (é o crédito nas fotos).")  # note 4
    if signature and len(signature) > 80:
        raise EventError("A assinatura pode ter até 80 caracteres.")
    return signature


# ------------------------------------------------------------------ list / read

def list_accounts(db: Session, q: str | None, role: AccountRole | None, status: AccountStatus | None):
    query = select(Account)
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(Account.full_name).like(term), func.lower(Account.email).like(term)))
    if role:
        query = query.where(Account.role == role)
    if status:
        query = query.where(Account.status == status)
    # RF001 note 7: pending accounts come first, highlighted.
    pending_first = (Account.status != AccountStatus.PENDING)
    items = db.scalars(query.order_by(pending_first, func.lower(Account.full_name))).all()
    counts = dict(db.execute(select(Account.status, func.count()).group_by(Account.status)).all())
    return items, {s.value: counts.get(s, 0) for s in AccountStatus}


def get_account(db: Session, account_id: uuid.UUID) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise NotFound("Conta não encontrada.")
    return account


def activation_link_state(db: Session, account: Account) -> str | None:
    """For a pending account: "valid" (a link is waiting) or "expired" (must be re-sent)."""
    if account.status != AccountStatus.PENDING:
        return None
    alive = db.scalar(select(func.count()).select_from(PasswordToken).where(
        PasswordToken.account_id == account.id, PasswordToken.purpose == PasswordTokenPurpose.ACTIVATION,
        PasswordToken.used_at.is_(None), PasswordToken.expires_at > _now()))
    return "valid" if alive else "expired"


def owned_events(db: Session, account: Account) -> int:
    return db.scalar(select(func.count()).select_from(Event).where(Event.owner_id == account.id)) or 0


def is_locked(account: Account) -> bool:
    return account.locked_until is not None and account.locked_until > _now()


# ------------------------------------------------------------------ create

def create_account(db: Session, admin: Account, sender: EmailSender, data: AccountInput) -> Account:
    name = _clean_name(data.full_name)
    email = data.email.strip()
    if "@" not in email or len(email) > 100 or " " in email:
        raise EventError("Informe um e-mail válido, com até 100 caracteres.")  # RF001 note 2
    if db.scalar(select(Account.id).where(func.lower(Account.email) == email.lower())):
        raise EventError("Já existe uma conta com este e-mail.")
    account = Account(full_name=name, email=email, role=data.role,
                      photographer_signature=_clean_signature(data.role, data.photographer_signature),
                      status=AccountStatus.PENDING)  # no password: RF001 notes 5 and 6
    db.add(account)
    db.flush()
    audit.record(db, "account.created", admin.id, "account", account.id, role=data.role.value)
    auth.send_activation_link(db, account, sender)  # commits
    return account


def resend_activation(db: Session, admin: Account, sender: EmailSender, account: Account) -> None:
    """RF001 note 5/7: a new single-use link; the previous one stops working."""
    if account.status != AccountStatus.PENDING:
        raise EventError("Só contas em “Acesso Pendente” recebem o link de definição de senha.")
    audit.record(db, "account.activation_resent", admin.id, "account", account.id)
    auth.send_activation_link(db, account, sender)


# ------------------------------------------------------------------ edit (name, role, signature)

def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Account).where(
        Account.role == AccountRole.ADMIN, Account.status == AccountStatus.ACTIVE)) or 0


def update_account(db: Session, admin: Account, account: Account, full_name: str, role: AccountRole,
                   signature: str | None) -> Account:
    if role != account.role:
        if account.id == admin.id:
            raise PermissionDenied("Você não pode alterar o seu próprio perfil.")
        if account.role == AccountRole.ADMIN and account.status == AccountStatus.ACTIVE and _active_admins(db) <= 1:
            raise EventError("Esta é a única conta de administrador ativa; o sistema ficaria sem administrador.")
    changes = {}
    name = _clean_name(full_name)
    signature = _clean_signature(role, signature)
    if name != account.full_name:
        changes["name"] = True
    if signature != account.photographer_signature:
        changes["signature"] = True
    if role != account.role:
        # RF001 note 3: a role change is the administrator's prerogative and is logged.
        changes["role"] = f"{account.role.value}->{role.value}"
    account.full_name, account.role, account.photographer_signature = name, role, signature
    if changes:
        audit.record(db, "account.updated", admin.id, "account", account.id, **changes)
    db.commit()
    return account


# ------------------------------------------------------------------ status (RF003)

def change_status(db: Session, admin: Account, sender: EmailSender, account: Account,
                  target: AccountStatus) -> Account:
    """Ativa / Inativa / Suspensa, decided by the administrator (RF003). The screen asks for an
    explicit confirmation first (note 1); the change is logged and e-mailed to the holder (note 3).
    Events and photos of the account stay in the collection with their credit (note 2)."""
    if account.id == admin.id:
        raise PermissionDenied("Você não pode alterar a situação da sua própria conta.")
    if target == AccountStatus.PENDING:
        raise EventError("“Acesso Pendente” é controlado pelo sistema.")
    if target == account.status:
        return account
    if (account.role == AccountRole.ADMIN and account.status == AccountStatus.ACTIVE
            and _active_admins(db) <= 1):
        raise EventError("Esta é a única conta de administrador ativa; o sistema ficaria sem administrador.")
    previous = account.status
    if target == AccountStatus.ACTIVE and account.password_hash is None:
        # Never defined a password: it goes back to waiting for the holder (RF001 note 6).
        account.status = AccountStatus.PENDING
    else:
        account.status = target
    if account.status != AccountStatus.ACTIVE:
        _revoke_all_sessions(db, account.id)  # takes effect immediately, on every device
    audit.record(db, "account.status_changed", admin.id, "account", account.id,
                 previous=previous.value, current=account.status.value)
    db.commit()
    message = {
        AccountStatus.ACTIVE: "foi reativada. Você já pode entrar novamente no FOTOMAC.",
        AccountStatus.PENDING: "foi reativada. Você receberá um link para definir sua senha.",
        AccountStatus.INACTIVE: "foi desativada temporariamente pela administração. Enquanto estiver "
                                "inativa, não será possível entrar no sistema.",
        AccountStatus.SUSPENDED: "foi suspensa pela administração. Enquanto estiver suspensa, não será "
                                 "possível entrar no sistema.",
    }[account.status]
    sender.send(EmailMessage(
        to=account.email, subject="FOTOMAC — situação da sua conta",
        body=(f"Olá, {account.full_name}.\n\nSua conta no FOTOMAC {message}\n\nOs eventos e as fotos que você "
              "enviou continuam no acervo institucional, com o seu crédito.\n\nEm caso de dúvida, procure a "
              "administração do sistema.\n\nEquipe FOTOMAC — Centro Universitário CESMAC")))
    if account.status == AccountStatus.PENDING:
        auth.send_activation_link(db, account, sender)
    return account


def unlock(db: Session, admin: Account, account: Account) -> Account:
    """RF002 note 7: the administrator may lift the temporary lock (5 wrong passwords)."""
    account.failed_login_attempts = 0
    account.locked_until = None
    audit.record(db, "account.unlocked", admin.id, "account", account.id)
    db.commit()
    return account
