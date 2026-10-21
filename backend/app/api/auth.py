"""Authentication routes: /api/v1/auth/*"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import SESSION_COOKIE, current_account
from app.auth import service
from app.auth.passwords import PASSWORD_RULES
from app.config import get_settings
from app.db.models import Account, PasswordTokenPurpose
from app.db.session import get_session
from app.notifications.factory import get_email_sender
from app.notifications.port import EmailSender
from app.security.rate_limit import login_limiter, password_link_limiter

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str = Field(max_length=100)
    password: str = Field(max_length=200)


class AccountOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    role_label: str
    photographer_signature: str | None
    valid_until: datetime | None = None      # temporary account: when it stops working (RF031)
    bound_event_id: uuid.UUID | None = None  # temporary account: the only event it works on


class EmailIn(BaseModel):
    email: str = Field(max_length=100)


class TokenIn(BaseModel):
    token: str = Field(max_length=200)


class NewPasswordIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=200)
    password_confirmation: str = Field(max_length=200)


class FirstAccessIn(NewPasswordIn):
    # Hired photographer only (RF031 note 6): identification required before the account works.
    cpf: str | None = Field(None, max_length=20)
    birth_date: date | None = None


class PasswordRule(BaseModel):
    key: str
    label: str


def _account_out(a: Account) -> AccountOut:
    from app.accounts.service import ROLE_LABEL
    return AccountOut(id=a.id, full_name=a.full_name, email=a.email, role=a.role.value, role_label=ROLE_LABEL[a.role],
                      photographer_signature=a.photographer_signature, valid_until=a.valid_until,
                      bound_event_id=a.bound_event_id)


def _set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    # HttpOnly: page JavaScript cannot read it, so an injected script cannot steal it.
    # SameSite=Lax: other sites cannot make the browser send it on POST requests (CSRF).
    response.set_cookie(SESSION_COOKIE, token, max_age=s.session_hours * 3600, httponly=True,
                        secure=s.cookie_secure, samesite="lax", path="/api")


def _password_error(exc: service.AuthError) -> HTTPException:
    detail: dict = {"message": str(exc)}
    if isinstance(exc, service.WeakPasswordError):
        detail["failed_rules"] = exc.failed
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail)


@router.post("/login", response_model=AccountOut, dependencies=[Depends(login_limiter)])
def login(body: LoginIn, response: Response, db: Session = Depends(get_session)):
    try:
        result = service.login(db, body.email, body.password)
    except service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from None
    _set_session_cookie(response, result.session_token)
    return _account_out(result.account)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_session)):
    service.logout(db, request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/api")


@router.get("/me", response_model=AccountOut)
def me(account: Account = Depends(current_account)):
    return _account_out(account)


@router.get("/password-rules", response_model=list[PasswordRule])
def password_rules():
    """Single source of truth for the checklist shown on the password screens."""
    return [PasswordRule(key=k, label=label) for k, label in PASSWORD_RULES]


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(password_link_limiter)])
def forgot_password(body: EmailIn, db: Session = Depends(get_session),
                    sender: EmailSender = Depends(get_email_sender)):
    service.request_password_reset(db, body.email, sender)
    # Same answer whether or not the account exists (RF002 note 1).
    return {"message": "Se o e-mail pertencer a uma conta cadastrada, as instruções de recuperação serão enviadas."}


@router.post("/password/reset/check")
def check_reset_link(body: TokenIn, db: Session = Depends(get_session)):
    return {"valid": service.link_is_valid(db, body.token, PasswordTokenPurpose.RESET)}


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(password_link_limiter)])
def reset_password(body: NewPasswordIn, db: Session = Depends(get_session)):
    try:
        service.reset_password(db, body.token, body.password, body.password_confirmation)
    except service.AuthError as exc:
        raise _password_error(exc) from None


@router.post("/first-access/check")
def check_activation_link(body: TokenIn, db: Session = Depends(get_session)):
    return service.activation_info(db, body.token)


@router.post("/first-access", response_model=AccountOut, dependencies=[Depends(password_link_limiter)])
def first_access(body: FirstAccessIn, response: Response, db: Session = Depends(get_session)):
    try:
        result = service.activate_account(db, body.token, body.password, body.password_confirmation,
                                          body.cpf, body.birth_date)
    except service.AuthError as exc:
        raise _password_error(exc) from None
    _set_session_cookie(response, result.session_token)
    return _account_out(result.account)


class SignatureIn(BaseModel):
    photographer_signature: str = Field(max_length=80)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    password: str = Field(max_length=200)
    password_confirmation: str = Field(max_length=200)


@router.patch("/me", response_model=AccountOut)
def update_me(body: SignatureIn, account: Account = Depends(current_account), db: Session = Depends(get_session)):
    """Only the signature is editable by the holder; name, e-mail and role belong to the
    administrator (RF001 note 3)."""
    try:
        return _account_out(service.update_signature(db, account, body.photographer_signature))
    except service.AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


@router.post("/password/change", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(login_limiter)])
def change_password(body: ChangePasswordIn, request: Request, account: Account = Depends(current_account),
                    db: Session = Depends(get_session)):
    try:
        service.change_password(db, account, request.cookies.get(SESSION_COOKIE, ""), body.current_password,
                                body.password, body.password_confirmation)
    except service.AuthError as exc:
        raise _password_error(exc) from None
