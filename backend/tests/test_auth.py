"""RF001 / RF002 / RF003 — authentication through the real HTTP API."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.deps import SESSION_COOKIE
from app.auth import service
from app.db import models as m
from app.db.session import get_session
from app.main import app
from app.notifications.factory import get_email_sender
from app.security.rate_limit import login_limiter, password_link_limiter

STRONG = "Fotomac#2026"


class FakeSender:
    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)

    def last_token(self) -> str:
        return re.search(r"token=([\w-]+)", self.sent[-1].body).group(1)


@pytest.fixture
def sender():
    return FakeSender()


@pytest.fixture
def client(db, sender):
    login_limiter.reset()
    password_link_limiter.reset()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_email_sender] = lambda: sender
    # Without "with": the startup (model loading) is not needed for these routes.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def pending(db, sender) -> m.Account:
    account = m.Account(full_name="Moacir Barbosa", email="moacir.teste@cesmac.edu.br",
                        role=m.AccountRole.PHOTOGRAPHER, photographer_signature="Moacir Barbosa")
    db.add(account)
    db.flush()
    service.send_activation_link(db, account, sender)
    return account


@pytest.fixture
def active(client, pending, sender) -> m.Account:
    r = client.post("/api/v1/auth/first-access", json={
        "token": sender.last_token(), "password": STRONG, "password_confirmation": STRONG})
    assert r.status_code == 200
    client.cookies.clear()
    return pending


def login(client, email="moacir.teste@cesmac.edu.br", password=STRONG):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


# ----------------------------------------------------------------- first access (RF001)

def test_account_is_created_without_password_and_cannot_log_in(client, pending):
    assert pending.status == m.AccountStatus.PENDING and pending.password_hash is None
    assert login(client, password="").status_code == 401


def test_first_access_full_flow(client, pending, sender, db):
    token = sender.last_token()
    assert client.post("/api/v1/auth/first-access/check", json={"token": token}).json() == {
        "valid": True, "needs_identity": False, "full_name": None}   # identification: hired photographer only

    weak = client.post("/api/v1/auth/first-access",
                       json={"token": token, "password": "abc", "password_confirmation": "abc"})
    assert weak.status_code == 400
    assert set(weak.json()["detail"]["failed_rules"]) == {"min_length", "upper_lower", "digit_special"}

    mismatch = client.post("/api/v1/auth/first-access",
                           json={"token": token, "password": STRONG, "password_confirmation": STRONG + "x"})
    assert mismatch.json()["detail"]["message"] == "As senhas não coincidem."

    ok = client.post("/api/v1/auth/first-access",
                     json={"token": token, "password": STRONG, "password_confirmation": STRONG})
    assert ok.status_code == 200 and SESSION_COOKIE in ok.cookies
    db.refresh(pending)
    assert pending.status == m.AccountStatus.ACTIVE
    assert pending.password_hash.startswith("$argon2id$")       # never the plain password
    assert STRONG not in pending.password_hash
    assert client.get("/api/v1/auth/me").json()["full_name"] == "Moacir Barbosa"

    # Single use: the same link cannot be used again (RF002 note 3).
    again = client.post("/api/v1/auth/first-access",
                        json={"token": token, "password": STRONG, "password_confirmation": STRONG})
    assert again.status_code == 400 and "inválido" in again.json()["detail"]["message"]


def test_expired_activation_link_is_refused(client, pending, sender, db):
    token = sender.last_token()
    link = db.scalar(select(m.PasswordToken).where(m.PasswordToken.account_id == pending.id))
    link.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.flush()
    assert client.post("/api/v1/auth/first-access/check", json={"token": token}).json()["valid"] is False


def test_reissuing_the_link_invalidates_the_previous_one(client, pending, sender, db):
    first = sender.last_token()
    service.send_activation_link(db, pending, sender)
    assert client.post("/api/v1/auth/first-access/check", json={"token": first}).json()["valid"] is False
    assert client.post("/api/v1/auth/first-access/check", json={"token": sender.last_token()}).json()["valid"] is True


def test_tokens_are_stored_only_as_hashes(pending, sender, db):
    token = sender.last_token()
    stored = db.scalar(select(m.PasswordToken.token_hash).where(m.PasswordToken.account_id == pending.id))
    assert stored != token and len(stored) == 64


# ----------------------------------------------------------------- login (RF002)

def test_login_and_logout(client, active, db):
    r = login(client)
    assert r.status_code == 200 and SESSION_COOKIE in r.cookies
    assert "token" not in r.text                                 # the token is only in the cookie
    assert client.get("/api/v1/auth/me").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_cookie_is_httponly_and_samesite(client, active):
    header = login(client).headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header and "path=/api" in header


def test_wrong_password_and_unknown_email_get_the_same_answer(client, active):
    """RF002 note 1: no hint about which accounts exist."""
    wrong = login(client, password="Errada#123")
    unknown = login(client, email="ninguem@cesmac.edu.br")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": service.GENERIC_LOGIN_ERROR}


def test_email_is_case_insensitive(client, active):
    assert login(client, email="MOACIR.TESTE@cesmac.edu.br").status_code == 200


def test_lockout_after_five_failures_and_reset_unlocks(client, active, sender):
    for _ in range(5):
        assert login(client, password="Errada#123").status_code == 401
    assert login(client).status_code == 401                      # right password, but locked

    client.post("/api/v1/auth/password/forgot", json={"email": "moacir.teste@cesmac.edu.br"})
    r = client.post("/api/v1/auth/password/reset", json={
        "token": sender.last_token(), "password": "Nova#Senha9", "password_confirmation": "Nova#Senha9"})
    assert r.status_code == 204
    assert login(client, password="Nova#Senha9").status_code == 200   # recovery e-mail unlocks


def test_password_reset_ends_all_other_sessions(client, active, sender):
    """RF002 note 8: changing the password logs out every other device."""
    assert login(client).status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200
    client.post("/api/v1/auth/password/forgot", json={"email": active.email})
    client.post("/api/v1/auth/password/reset", json={
        "token": sender.last_token(), "password": "Outra#Senha1", "password_confirmation": "Outra#Senha1"})
    assert client.get("/api/v1/auth/me").status_code == 401


def test_forgot_password_does_not_reveal_unknown_emails(client, active, sender):
    before = len(sender.sent)
    known = client.post("/api/v1/auth/password/forgot", json={"email": active.email})
    unknown = client.post("/api/v1/auth/password/forgot", json={"email": "ninguem@cesmac.edu.br"})
    assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json()
    assert len(sender.sent) == before + 1                        # e-mail only to the real account


def test_reset_link_cannot_activate_and_vice_versa(client, active, sender):
    client.post("/api/v1/auth/password/forgot", json={"email": active.email})
    reset_token = sender.last_token()
    r = client.post("/api/v1/auth/first-access",
                    json={"token": reset_token, "password": STRONG, "password_confirmation": STRONG})
    assert r.status_code == 400


def test_suspension_cuts_an_open_session_immediately(client, active, db):
    """RF002 note 4 / RF003: status is re-checked on every request, on the server."""
    assert login(client).status_code == 200
    active.status = m.AccountStatus.SUSPENDED
    db.flush()
    assert client.get("/api/v1/auth/me").status_code == 401
    assert login(client).status_code == 401


def test_protected_route_without_cookie_is_refused(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_login_rate_limit(client, active):
    codes = [login(client, password="Errada#123").status_code for _ in range(11)]
    assert codes[-1] == 429


def test_audit_trail_records_logins_without_typed_emails(client, active, db):
    login(client)
    login(client, email="intruso@exemplo.com")
    actions = db.scalars(select(m.AuditLog.action).order_by(m.AuditLog.id)).all()
    assert "auth.login" in actions and "auth.login_failed" in actions
    details = db.scalars(select(m.AuditLog.details)).all()
    assert "intruso@exemplo.com" not in str(details)


def test_password_rules_endpoint_matches_the_screens(client):
    labels = [r["label"] for r in client.get("/api/v1/auth/password-rules").json()]
    assert labels == ["No mínimo 8 caracteres", "Uma letra maiúscula e uma minúscula",
                      "Um número e um caractere especial"]
