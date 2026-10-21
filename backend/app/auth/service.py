"""Authentication business rules (RF001, RF002, RF003).

Isolated from HTTP and from the rest of the application (RF001 note 9): a future
integration with CESMAC's institutional accounts replaces this module, not the screens
nor the other rules.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import audit
from app.auth import passwords
from app.auth.tokens import new_token, token_hash
from app.config import get_settings
from app.db.models import (AUTHOR_ROLES, Account, AccountRole, AccountStatus, PasswordToken, PasswordTokenPurpose,
                           Session as LoginSession)
from app.notifications.port import EmailMessage, EmailSender

# One message for every login failure: never reveal whether the e-mail exists, the
# password is wrong, or the account is locked/suspended (RF002 note 1).
GENERIC_LOGIN_ERROR = "Não foi possível entrar. Verifique suas credenciais e tente novamente."
INVALID_LINK_ERROR = ("Este link é inválido, já foi usado ou expirou. "
                      "Solicite um novo link para continuar.")


class AuthError(Exception):
    """Message safe to show to the user."""


class WeakPasswordError(AuthError):
    def __init__(self, failed: list[str]):
        super().__init__("A nova senha ainda não atende aos requisitos.")
        self.failed = failed


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class LoginResult:
    account: Account
    session_token: str  # goes ONLY into the HttpOnly cookie, never into a response body


# ------------------------------------------------------------------- login / logout

def login(db: Session, email: str, password: str) -> LoginResult:
    settings = get_settings()
    account = db.scalar(select(Account).where(func.lower(Account.email) == email.strip().lower()))

    if account is None or account.password_hash is None:
        passwords.verify_password(passwords.DUMMY_HASH, password)  # same response time
        audit.record(db, "auth.login_failed")  # the typed e-mail is NOT stored
        db.commit()
        raise AuthError(GENERIC_LOGIN_ERROR)

    locked = account.locked_until is not None and account.locked_until > _now()
    password_ok = passwords.verify_password(account.password_hash, password)

    if locked or not password_ok or account.status != AccountStatus.ACTIVE:
        if not locked and not password_ok:
            account.failed_login_attempts += 1
            if account.failed_login_attempts >= settings.max_failed_logins:
                account.locked_until = _now() + timedelta(minutes=settings.lockout_minutes)
                audit.record(db, "auth.account_locked", account.id, "account", account.id)
        audit.record(db, "auth.login_failed", account.id, "account", account.id,
                     reason="locked" if locked else ("password" if not password_ok else account.status.value))
        db.commit()
        raise AuthError(GENERIC_LOGIN_ERROR)

    account.failed_login_attempts = 0
    account.locked_until = None
    token = new_token()  # a brand-new token on every login (RF002 note 8)
    db.add(LoginSession(token_hash=token_hash(token), account_id=account.id,
                        expires_at=_now() + timedelta(hours=settings.session_hours)))
    audit.record(db, "auth.login", account.id, "account", account.id)
    db.commit()
    return LoginResult(account, token)


def account_for_session(db: Session, token: str | None) -> Account | None:
    """The account behind a session cookie, or None. Status is re-checked on EVERY request,
    so suspending an account takes effect immediately (RF002 note 4)."""
    if not token:
        return None
    row = db.scalar(select(LoginSession).where(
        LoginSession.token_hash == token_hash(token), LoginSession.revoked_at.is_(None),
        LoginSession.expires_at > _now()))
    if row is None or row.account.status != AccountStatus.ACTIVE:
        return None
    account = row.account
    # A temporary account stops working the moment its 24 h end, even mid-session (RF031 note 4).
    if account.role == AccountRole.CONTRACTOR and account.valid_until and account.valid_until <= _now():
        account.status = AccountStatus.EXPIRED
        _revoke_all_sessions(db, account.id)
        audit.record(db, "account.expired", None, "account", account.id)
        db.commit()
        return None
    return account


def logout(db: Session, token: str | None) -> None:
    if not token:
        return
    row = db.scalar(select(LoginSession).where(LoginSession.token_hash == token_hash(token)))
    if row and row.revoked_at is None:
        row.revoked_at = _now()
        audit.record(db, "auth.logout", row.account_id, "account", row.account_id)
        db.commit()


def _revoke_all_sessions(db: Session, account_id: uuid.UUID) -> None:
    db.execute(update(LoginSession).where(LoginSession.account_id == account_id,
                                          LoginSession.revoked_at.is_(None))
               .values(revoked_at=_now()))


# ------------------------------------------------------------------- password links

def _issue_link(db: Session, account: Account, purpose: PasswordTokenPurpose) -> str:
    settings = get_settings()
    # Only the newest link of each kind works: older unused ones are invalidated.
    db.execute(update(PasswordToken).where(PasswordToken.account_id == account.id,
                                           PasswordToken.purpose == purpose,
                                           PasswordToken.used_at.is_(None))
               .values(used_at=_now()))
    lifetime = (timedelta(hours=settings.activation_link_hours) if purpose == PasswordTokenPurpose.ACTIVATION
                else timedelta(minutes=settings.reset_link_minutes))
    token = new_token()
    db.add(PasswordToken(token_hash=token_hash(token), account_id=account.id, purpose=purpose,
                         expires_at=_now() + lifetime))
    return token


def send_activation_link(db: Session, account: Account, sender: EmailSender) -> None:
    """RF001 note 5: the account is created WITHOUT a password; the holder defines it."""
    if account.status != AccountStatus.PENDING:
        raise AuthError("Esta conta já foi ativada.")
    settings = get_settings()
    token = _issue_link(db, account, PasswordTokenPurpose.ACTIVATION)
    db.commit()
    sender.send(EmailMessage(
        to=account.email, subject="FOTOMAC — defina sua senha de acesso",
        body=(f"Olá, {account.full_name}.\n\nUma conta foi criada para você no FOTOMAC. Para ativá-la, "
              f"defina sua senha pessoal no link abaixo (válido por {settings.activation_link_hours} horas "
              f"e de uso único):\n\n{settings.frontend_url}/primeiro-acesso?token={token}\n\n"
              "Se você não esperava esta mensagem, ignore-a.\n\nEquipe FOTOMAC — Centro Universitário CESMAC")))


def request_password_reset(db: Session, email: str, sender: EmailSender) -> None:
    """Always "succeeds" from the caller's point of view (RF002 note 1)."""
    account = db.scalar(select(Account).where(func.lower(Account.email) == email.strip().lower()))
    # RF002 note 6: no self-service recovery for a temporary account; the administrator issues a new link.
    if account is None or account.status != AccountStatus.ACTIVE or account.role == AccountRole.CONTRACTOR:
        return
    settings = get_settings()
    token = _issue_link(db, account, PasswordTokenPurpose.RESET)
    audit.record(db, "auth.password_reset_requested", account.id, "account", account.id)
    db.commit()
    sender.send(EmailMessage(
        to=account.email, subject="FOTOMAC — redefinição de senha",
        body=(f"Olá, {account.full_name}.\n\nRecebemos um pedido para redefinir sua senha. Use o link abaixo "
              f"(válido por {settings.reset_link_minutes} minutos e de uso único):\n\n"
              f"{settings.frontend_url}/redefinir-senha?token={token}\n\n"
              "Se você não fez este pedido, ignore esta mensagem: sua senha continua a mesma.\n\n"
              "Equipe FOTOMAC — Centro Universitário CESMAC")))


def _valid_link(db: Session, token: str, purpose: PasswordTokenPurpose) -> PasswordToken | None:
    return db.scalar(select(PasswordToken).where(
        PasswordToken.token_hash == token_hash(token), PasswordToken.purpose == purpose,
        PasswordToken.used_at.is_(None), PasswordToken.expires_at > _now()))


def link_is_valid(db: Session, token: str, purpose: PasswordTokenPurpose) -> bool:
    return _valid_link(db, token, purpose) is not None


def _set_password(db: Session, token: str, purpose: PasswordTokenPurpose,
                  password: str, confirmation: str) -> Account:
    link = _valid_link(db, token, purpose)
    if link is None:
        raise AuthError(INVALID_LINK_ERROR)
    expected = AccountStatus.PENDING if purpose == PasswordTokenPurpose.ACTIVATION else AccountStatus.ACTIVE
    if link.account.status != expected:
        raise AuthError(INVALID_LINK_ERROR)
    if failed := passwords.failed_rules(password):
        raise WeakPasswordError(failed)
    if password != confirmation:
        raise AuthError("As senhas não coincidem.")
    account = link.account
    if purpose == PasswordTokenPurpose.ACTIVATION:
        # Status and password change together: the database forbids a pending account
        # with a password and an active one without it (RF001 note 6).
        account.status = AccountStatus.ACTIVE
    account.password_hash = passwords.hash_password(password)
    account.failed_login_attempts = 0
    account.locked_until = None  # RF002 note 7: recovery e-mail also unlocks
    link.used_at = _now()        # invalidated immediately after use (RF002 notes 3 and 6)
    _revoke_all_sessions(db, account.id)  # RF002 note 8
    return account


def activation_info(db: Session, token: str) -> dict:
    """What the first-access screen needs before asking anything: is the link valid, and must the
    holder identify themselves (temporary account, RF031 note 6)?"""
    link = _valid_link(db, token, PasswordTokenPurpose.ACTIVATION)
    if link is None or link.account.status != AccountStatus.PENDING:
        return {"valid": False, "needs_identity": False, "full_name": None}
    contractor = link.account.role == AccountRole.CONTRACTOR
    return {"valid": True, "needs_identity": contractor, "full_name": link.account.full_name if contractor else None}


def activate_account(db: Session, token: str, password: str, confirmation: str,
                     cpf: str | None = None, birth_date: date | None = None) -> LoginResult:
    """First access: defines the password, "Acesso Pendente" → "Ativa" (RF001 note 6). A hired
    photographer also informs CPF and birth date, and the 24 h start now (RF031 notes 2 and 6)."""
    from app.accounts import identity  # local: identity → events.service → … would import this module
    from app.events.service import EventError

    link = _valid_link(db, token, PasswordTokenPurpose.ACTIVATION)
    contractor = link is not None and link.account.role == AccountRole.CONTRACTOR
    encrypted = None
    if contractor:
        try:
            digits, born = identity.clean_cpf(cpf or ""), identity.clean_birth_date(birth_date)
            # Encrypted BEFORE the password is set: the database refuses an active contractor
            # without identification, and the query below would flush a half-done account.
            encrypted = identity.encrypt(db, digits), identity.encrypt(db, born.isoformat())
        except EventError as exc:
            raise AuthError(str(exc)) from None
    # No autoflush in between: setting the password ends the old sessions with a query, which would
    # write the account as "active" before its identification is in place (the database refuses it).
    with db.no_autoflush:
        account = _set_password(db, token, PasswordTokenPurpose.ACTIVATION, password, confirmation)
        if encrypted:
            account.cpf_encrypted, account.birth_date_encrypted = encrypted
            account.valid_until = _now() + timedelta(hours=24)
    if encrypted:
        audit.record(db, "account.contractor_identified", account.id, "account", account.id)
    audit.record(db, "auth.account_activated", account.id, "account", account.id)
    session_token = new_token()
    db.add(LoginSession(token_hash=token_hash(session_token), account_id=account.id,
                        expires_at=_now() + timedelta(hours=get_settings().session_hours)))
    db.commit()
    return LoginResult(account, session_token)


def reset_password(db: Session, token: str, password: str, confirmation: str) -> None:
    account = _set_password(db, token, PasswordTokenPurpose.RESET, password, confirmation)
    audit.record(db, "auth.password_reset", account.id, "account", account.id)
    db.commit()


# ------------------------------------------------------------------- own profile

def update_signature(db: Session, account: Account, signature: str) -> Account:
    """RF001 note 4: the photographer may change the professional name used as credit.
    Only the name is stored; "— Centro Universitário CESMAC" is added when displayed."""
    signature = signature.strip()
    if account.role not in AUTHOR_ROLES:
        raise AuthError("Somente contas que enviam fotos possuem assinatura.")
    if not signature or len(signature) > 80:
        raise AuthError("Informe a assinatura (até 80 caracteres).")
    if signature != account.photographer_signature:
        audit.record(db, "account.signature_changed", account.id, "account", account.id,
                     de=account.photographer_signature, para=signature)
        account.photographer_signature = signature
        db.commit()
    return account


def change_password(db: Session, account: Account, current_token: str, current: str,
                    password: str, confirmation: str) -> None:
    """Logged-in password change. Ends every OTHER session (RF002 note 8) and keeps this one."""
    if not account.password_hash or not passwords.verify_password(account.password_hash, current):
        raise AuthError("A senha atual não confere.")
    if failed := passwords.failed_rules(password):
        raise WeakPasswordError(failed)
    if password != confirmation:
        raise AuthError("As senhas não coincidem.")
    if passwords.verify_password(account.password_hash, password):
        raise AuthError("A nova senha deve ser diferente da atual.")
    account.password_hash = passwords.hash_password(password)
    db.execute(update(LoginSession).where(LoginSession.account_id == account.id,
                                          LoginSession.revoked_at.is_(None),
                                          LoginSession.token_hash != token_hash(current_token))
               .values(revoked_at=_now()))
    audit.record(db, "auth.password_changed", account.id, "account", account.id)
    db.commit()
