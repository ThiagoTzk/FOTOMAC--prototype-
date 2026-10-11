"""Dependencies shared by the API routes."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import service
from app.db.models import Account, AccountRole
from app.db.session import get_session

SESSION_COOKIE = "fotomac_session"


def current_account(request: Request, db: Session = Depends(get_session)) -> Account:
    """Rejects the request BEFORE any processing when there is no valid session
    (RF002 note 4, RS014). The check runs on the server, never only in the screen."""
    account = service.account_for_session(db, request.cookies.get(SESSION_COOKIE))
    if account is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sua sessão expirou. Entre novamente.")
    return account


def require_role(*roles: AccountRole):
    def checker(account: Account = Depends(current_account)) -> Account:
        if account.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não tem permissão para esta ação.")
        return account
    return checker
