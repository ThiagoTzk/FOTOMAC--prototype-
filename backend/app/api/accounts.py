"""ADMINISTRATOR routes for accounts: /api/v1/admin/accounts/* (RF001, RF002 note 7, RF003).

Every route requires an active administrator session — checked on the server before any
processing (RF002 note 4). There is deliberately no DELETE (RF003 note 4).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.accounts import service
from app.api.deps import require_role
from app.db.models import Account, AccountRole, AccountStatus
from app.db.session import get_session
from app.events.service import EventError, NotFound, PermissionDenied
from app.notifications.factory import get_email_sender
from app.notifications.port import EmailSender

router = APIRouter(prefix="/admin/accounts", tags=["admin: contas"])
admin_only = require_role(AccountRole.ADMIN)


class AccountRow(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    role_label: str
    status: str
    status_label: str
    photographer_signature: str | None
    locked: bool
    activation_link: str | None   # "valid" | "expired" for pending accounts
    created_at: datetime


class AccountDetail(AccountRow):
    owned_events: int
    is_me: bool


def _row(db: Session, a: Account) -> dict:
    return dict(id=a.id, full_name=a.full_name, email=a.email, role=a.role.value, role_label=service.ROLE_LABEL[a.role],
                status=a.status.value, status_label=service.STATUS_LABEL[a.status],
                photographer_signature=a.photographer_signature, locked=service.is_locked(a),
                activation_link=service.activation_link_state(db, a), created_at=a.created_at)


def _detail(db: Session, a: Account, admin: Account) -> AccountDetail:
    return AccountDetail(**_row(db, a), owned_events=service.owned_events(db, a), is_me=a.id == admin.id)


def _http(exc: EventError) -> HTTPException:
    code = (status.HTTP_404_NOT_FOUND if isinstance(exc, NotFound)
            else status.HTTP_403_FORBIDDEN if isinstance(exc, PermissionDenied) else status.HTTP_400_BAD_REQUEST)
    return HTTPException(code, str(exc))


def _get(db: Session, account_id: uuid.UUID) -> Account:
    try:
        return service.get_account(db, account_id)
    except EventError as exc:
        raise _http(exc) from None


@router.get("")
def list_accounts(q: str | None = Query(None, max_length=120), role: AccountRole | None = None,
                  status_: AccountStatus | None = Query(None, alias="status"),
                  admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    items, counts = service.list_accounts(db, q, role, status_)
    return {"items": [AccountRow(**_row(db, a)) for a in items], "counts": counts,
            "institutional_domain": service.INSTITUTIONAL_DOMAIN}


class AccountIn(BaseModel):
    full_name: str = Field(max_length=200)
    email: str = Field(max_length=200)
    role: AccountRole
    photographer_signature: str | None = Field(None, max_length=200)


@router.post("", response_model=AccountDetail, status_code=status.HTTP_201_CREATED)
def create_account(body: AccountIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                   sender: EmailSender = Depends(get_email_sender)):
    try:
        account = service.create_account(db, admin, sender, service.AccountInput(
            body.full_name, body.email, body.role, body.photographer_signature))
    except EventError as exc:
        raise _http(exc) from None
    return _detail(db, account, admin)


@router.get("/{account_id}", response_model=AccountDetail)
def get_account(account_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    return _detail(db, _get(db, account_id), admin)


class AccountUpdate(BaseModel):
    full_name: str = Field(max_length=200)
    role: AccountRole
    photographer_signature: str | None = Field(None, max_length=200)


@router.put("/{account_id}", response_model=AccountDetail)
def update_account(account_id: uuid.UUID, body: AccountUpdate, admin: Account = Depends(admin_only),
                   db: Session = Depends(get_session)):
    account = _get(db, account_id)
    try:
        service.update_account(db, admin, account, body.full_name, body.role, body.photographer_signature)
    except EventError as exc:
        raise _http(exc) from None
    return _detail(db, account, admin)


class StatusIn(BaseModel):
    status: AccountStatus


@router.post("/{account_id}/status", response_model=AccountDetail)
def change_status(account_id: uuid.UUID, body: StatusIn, admin: Account = Depends(admin_only),
                  db: Session = Depends(get_session), sender: EmailSender = Depends(get_email_sender)):
    account = _get(db, account_id)
    try:
        service.change_status(db, admin, sender, account, body.status)
    except EventError as exc:
        raise _http(exc) from None
    return _detail(db, account, admin)


@router.post("/{account_id}/activation-link", status_code=status.HTTP_204_NO_CONTENT)
def resend_activation(account_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
                      sender: EmailSender = Depends(get_email_sender)):
    try:
        service.resend_activation(db, admin, sender, _get(db, account_id))
    except EventError as exc:
        raise _http(exc) from None


@router.post("/{account_id}/unlock", response_model=AccountDetail)
def unlock(account_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    account = _get(db, account_id)
    service.unlock(db, admin, account)
    return _detail(db, account, admin)
