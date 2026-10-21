"""Accounts managed by the administrator (RF001, RF002 note 7, RF003).

There is NO self-registration anywhere (RF001 note 8): accounts exist only because an
administrator created them here. The account is born without a password; the holder defines
it through a single-use link (RF001 note 5). Accounts are never deleted (RF003 note 4).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit, parameters
from app.accounts import identity
from app.auth import service as auth
from app.auth.service import _revoke_all_sessions
from app.db.models import (AUTHOR_ROLES, Account, AccountRole, AccountStatus, Event, EventStatus, Image, PasswordToken,
                           PasswordTokenPurpose)
from app.events.service import EventError, NotFound, PermissionDenied
from app.notifications.port import EmailMessage, EmailSender

ROLE_LABEL = {AccountRole.ADMIN: "Administrador", AccountRole.PHOTOGRAPHER: "Fotógrafo",
              AccountRole.MARKETING: "Marketing", AccountRole.CONTRACTOR: "Fotógrafo contratado"}
STATUS_LABEL = {AccountStatus.PENDING: "Acesso Pendente", AccountStatus.ACTIVE: "Ativa",
                AccountStatus.INACTIVE: "Inativa", AccountStatus.SUSPENDED: "Suspensa",
                AccountStatus.EXPIRED: "Expirada"}
CONTRACTOR_HOURS = 24  # RF031 note 2: from the moment the password is defined
INSTITUTIONAL_DOMAIN = "cesmac.edu.br"


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class AccountInput:
    full_name: str
    email: str
    role: AccountRole
    photographer_signature: str | None
    bound_event_id: uuid.UUID | None = None   # temporary account only (RF031)
    contract_number: str | None = None


def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if len(name.split()) < 2:
        raise EventError("Informe o nome completo (nome e sobrenome).")  # RF001 note 1
    if len(name) > 120:
        raise EventError("O nome completo pode ter até 120 caracteres.")
    return name


def is_institutional(email: str) -> bool:
    """cesmac.edu.br or one of its subdomains (e.g. academico.cesmac.edu.br)."""
    domain = email.rsplit("@", 1)[-1].lower()
    return domain == INSTITUTIONAL_DOMAIN or domain.endswith("." + INSTITUTIONAL_DOMAIN)


def _clean_signature(role: AccountRole, signature: str | None) -> str | None:
    signature = " ".join((signature or "").split()) or None
    if role in AUTHOR_ROLES and not signature:
        raise EventError("A assinatura é obrigatória para quem envia fotos (é o crédito nas fotos).")  # note 4
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
    # Whoever works for the CESMAC has an institutional e-mail; only the hired photographer, who does
    # not, may use a personal one (decision of 17/10/2026, RF001 note 2 of requirements v2.0).
    if data.role != AccountRole.CONTRACTOR and not is_institutional(email):
        raise EventError(f"Use o e-mail institucional (@{INSTITUTIONAL_DOMAIN}). E-mail pessoal só para fotógrafo contratado.")
    if db.scalar(select(Account.id).where(func.lower(Account.email) == email.lower())):
        raise EventError("Já existe uma conta com este e-mail.")
    account = Account(full_name=name, email=email, role=data.role,
                      photographer_signature=_clean_signature(data.role, data.photographer_signature),
                      status=AccountStatus.PENDING)  # no password: RF001 notes 5 and 6
    if data.role == AccountRole.CONTRACTOR:  # RF031: one event, one contract
        identity._key()  # refuse early if the server cannot encrypt the identification later
        event = db.get(Event, data.bound_event_id) if data.bound_event_id else None
        if event is None or event.status == EventStatus.EXPIRED:
            raise EventError("Escolha o evento para o qual o fotógrafo foi contratado.")
        contract = " ".join((data.contract_number or "").split())
        if not 1 <= len(contract) <= 60:
            raise EventError("Informe o número do contrato de prestação de serviço (até 60 caracteres).")
        account.bound_event_id, account.contract_number = event.id, contract
    db.add(account)
    db.flush()
    audit.record(db, "account.created", admin.id, "account", account.id, role=data.role.value,
                 **({"event_id": str(account.bound_event_id)} if account.bound_event_id else {}))
    auth.send_activation_link(db, account, sender)  # commits
    return account


def resend_activation(db: Session, admin: Account, sender: EmailSender, account: Account) -> None:
    """RF001 note 5/7: a new single-use link; the previous one stops working."""
    if account.status != AccountStatus.PENDING:
        raise EventError("Só contas em “Acesso Pendente” recebem o link de definição de senha.")
    audit.record(db, "account.activation_resent", admin.id, "account", account.id)
    auth.send_activation_link(db, account, sender)


# TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO (pedido do Thiago, 14/10/2026, demonstração ao fotógrafo).
# Shows the activation link to the administrator instead of e-mailing it. In production that would
# let any administrator take over any pending account, which is exactly what RF001 note 5 forbids
# (the link goes ONLY to the holder's e-mail). So it exists only while e-mails are not really sent
# (email_sender == "outbox", development); on the CESMAC server it answers "not found".
def dev_mode_link_available() -> bool:
    from app.config import get_settings
    return get_settings().email_sender == "outbox"


def dev_activation_link(db: Session, admin: Account, account: Account) -> str:
    from app.config import get_settings
    if not dev_mode_link_available():
        raise NotFound("Recurso indisponível.")
    if account.status != AccountStatus.PENDING:
        raise EventError("Só contas em “Acesso Pendente” têm link de definição de senha.")
    token = auth._issue_link(db, account, PasswordTokenPurpose.ACTIVATION)  # the previous link stops working
    audit.record(db, "account.activation_link_shown_dev", admin.id, "account", account.id)
    db.commit()
    return f"{get_settings().frontend_url}/primeiro-acesso?token={token}"
# FIM DO TRECHO TEMPORÁRIO


# ------------------------------------------------------------------ edit (name, role, signature)

def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Account).where(
        Account.role == AccountRole.ADMIN, Account.status == AccountStatus.ACTIVE)) or 0


def update_account(db: Session, admin: Account, account: Account, full_name: str, role: AccountRole,
                   signature: str | None) -> Account:
    if role != account.role:
        if account.id == admin.id:
            raise PermissionDenied("Você não pode alterar o seu próprio perfil.")
        if AccountRole.CONTRACTOR in (role, account.role):  # RF001 note 3
            raise EventError("A conta de fotógrafo contratado não pode ser convertida em outro perfil, nem o contrário.")
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
    if target in (AccountStatus.PENDING, AccountStatus.EXPIRED):
        raise EventError("Essa situação é controlada pelo sistema.")
    if account.status == AccountStatus.EXPIRED:  # RF003 note 6
        raise EventError("Conta temporária expirada não pode ser reativada. Para nova cobertura, crie uma nova conta.")
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


# ------------------------------------------------------------------ temporary account (RF031)

def contractor_identity(db: Session, account: Account) -> dict | None:
    """What the administrator sees of the identification: CPF masked, birth date (RF031 note 7)."""
    if account.role != AccountRole.CONTRACTOR:
        return None
    if account.identity_erased_at:
        return {"cpf": None, "birth_date": None, "erased_at": account.identity_erased_at}
    birth = identity.decrypt(db, account.birth_date_encrypted)
    return {"cpf": identity.masked_cpf(identity.decrypt(db, account.cpf_encrypted)), "birth_date": birth, "erased_at": None}


def expire_contractors(db: Session) -> int:
    """24 h after the password was defined the temporary account becomes "Expirada": sessions end
    at once and it is never reactivated (RF031 note 4, RF003 note 6). It is kept — never deleted."""
    due = db.scalars(select(Account).where(Account.role == AccountRole.CONTRACTOR,
                                           Account.status == AccountStatus.ACTIVE,
                                           Account.valid_until.is_not(None), Account.valid_until <= _now())).all()
    for account in due:
        account.status = AccountStatus.EXPIRED
        _revoke_all_sessions(db, account.id)
        audit.record(db, "account.expired", None, "account", account.id)
    if due:
        db.commit()
    return len(due)


def erase_contractor_identities(db: Session) -> int:
    """RF031 note 7: CPF and birth date are kept while the photos sent by the account are in the
    collection, plus the period set by the administrator (provisional, to be defined by the legal
    department). Then they are erased; the name stays in the operation records (RF003 note 4)."""
    months = parameters.get(db, "contractor_identity_months")
    erased = 0
    for account in db.scalars(select(Account).where(Account.role == AccountRole.CONTRACTOR,
                                                    Account.status == AccountStatus.EXPIRED,
                                                    Account.identity_erased_at.is_(None))).all():
        if db.scalar(select(func.count()).select_from(Image).where(Image.uploaded_by == account.id)):
            account.media_gone_at = None
            continue
        if account.media_gone_at is None:
            account.media_gone_at = _now()
        elif account.media_gone_at + timedelta(days=30 * months) <= _now():
            account.cpf_encrypted = account.birth_date_encrypted = None
            account.identity_erased_at = _now()
            audit.record(db, "account.identity_erased", None, "account", account.id)
            erased += 1
    db.commit()
    return erased


def unlock(db: Session, admin: Account, account: Account) -> Account:
    """RF002 note 7: the administrator may lift the temporary lock (5 wrong passwords)."""
    account.failed_login_attempts = 0
    account.locked_until = None
    audit.record(db, "account.unlocked", admin.id, "account", account.id)
    db.commit()
    return account
