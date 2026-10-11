"""RF001 / RF002 note 7 / RF003 — accounts managed by the administrator, through the real API."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import passwords
from app.db import models as m
from app.db.session import get_session
from app.main import app
from app.notifications.factory import get_email_sender
from app.security.rate_limit import login_limiter, password_link_limiter

PASSWORD = "Fotomac#2026"


class Outbox:
    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)

    def link(self):
        return re.search(r"primeiro-acesso\?token=([\w-]+)", self.sent[-1].body).group(1)


def make_account(db, name="Ana Lima", role=m.AccountRole.ADMIN, status=m.AccountStatus.ACTIVE) -> m.Account:
    a = m.Account(full_name=name, email=f"{uuid.uuid4().hex[:8]}@cesmac.edu.br", role=role,
                  photographer_signature=name if role == m.AccountRole.PHOTOGRAPHER else None,
                  password_hash=passwords.hash_password(PASSWORD) if status != m.AccountStatus.PENDING else None,
                  status=status)
    db.add(a)
    db.flush()
    return a


@pytest.fixture
def outbox():
    return Outbox()


@pytest.fixture
def client(db, outbox):
    login_limiter.reset()
    password_link_limiter.reset()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_email_sender] = lambda: outbox

    def for_account(account: m.Account) -> TestClient:
        c = TestClient(app)
        assert c.post("/api/v1/auth/login", json={"email": account.email, "password": PASSWORD}).status_code == 200
        return c
    yield for_account
    app.dependency_overrides.clear()


def new_photographer(c, email=None, **over):
    body = {"full_name": "Moacir Barbosa", "email": email or f"{uuid.uuid4().hex[:8]}@cesmac.edu.br",
            "role": "photographer", "photographer_signature": "Moacir Barbosa"}
    body.update(over)
    return c.post("/api/v1/admin/accounts", json=body)


# ----------------------------------------------------------------- access (RF002 note 4)

def test_only_administrators_reach_these_routes(client, db):
    photographer = client(make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER))
    assert photographer.get("/api/v1/admin/accounts").status_code == 403
    assert new_photographer(photographer).status_code == 403
    assert TestClient(app).get("/api/v1/admin/accounts").status_code == 401


def test_there_is_no_delete(client, db):
    admin = client(make_account(db))
    target = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER)
    assert admin.delete(f"/api/v1/admin/accounts/{target.id}").status_code == 405   # RF003 note 4


# ----------------------------------------------------------------- create (RF001)

def test_created_without_password_and_activated_by_single_use_link(client, db, outbox):
    admin = client(make_account(db))
    r = new_photographer(admin)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending" and body["status_label"] == "Acesso Pendente" and body["activation_link"] == "valid"
    account = db.get(m.Account, uuid.UUID(body["id"]))
    assert account.password_hash is None                                  # note 5: never a system password
    assert outbox.sent[-1].to == account.email and PASSWORD not in outbox.sent[-1].body
    token = outbox.link()
    anon = TestClient(app)
    assert anon.post("/api/v1/auth/first-access", json={"token": token, "password": PASSWORD,
                                                        "password_confirmation": PASSWORD}).status_code == 200
    db.refresh(account)
    assert account.status == m.AccountStatus.ACTIVE                       # note 6
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "account.created", m.AuditLog.target_id == str(account.id)))
    assert log.actor_account_id is not None


@pytest.mark.parametrize("over,message", [
    ({"full_name": "Moacir"}, "nome completo"),                              # note 1: two words
    ({"email": "sem-arroba.cesmac.edu.br"}, "e-mail válido"),                 # note 2
    ({"photographer_signature": ""}, "assinatura é obrigatória"),             # note 4
    ({"full_name": "Moacir " + "B" * 120}, "120 caracteres"),
])
def test_validation(client, db, over, message):
    r = new_photographer(client(make_account(db)), **over)
    assert r.status_code == 400 and message in r.json()["detail"]


def test_email_is_unique_regardless_of_case(client, db):
    admin = client(make_account(db))
    assert new_photographer(admin, email="Moacir.Barbosa@cesmac.edu.br").status_code == 201
    r = new_photographer(admin, email="moacir.barbosa@CESMAC.edu.br")
    assert r.status_code == 400 and "Já existe" in r.json()["detail"]


def test_pending_first_and_link_can_be_resent(client, db, outbox):
    admin = client(make_account(db, "Ana Admin"))   # alphabetically BEFORE the pending one
    pending_id = new_photographer(admin, full_name="Zuleica Prado", photographer_signature="Zuleica").json()["id"]
    rows = admin.get("/api/v1/admin/accounts").json()["items"]
    assert rows[0]["id"] == pending_id                                    # note 7: pending highlighted first
    old = outbox.link()
    # Expired link → the list says so, and the administrator re-sends (note 5).
    db.execute(m.PasswordToken.__table__.update().values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
    assert admin.get(f"/api/v1/admin/accounts/{pending_id}").json()["activation_link"] == "expired"
    assert admin.post(f"/api/v1/admin/accounts/{pending_id}/activation-link").status_code == 204
    new = outbox.link()
    assert new != old
    anon = TestClient(app)
    first = lambda t: anon.post("/api/v1/auth/first-access", json={"token": t, "password": PASSWORD, "password_confirmation": PASSWORD})
    assert first(old).status_code == 400 and first(new).status_code == 200
    assert admin.post(f"/api/v1/admin/accounts/{pending_id}/activation-link").status_code == 400   # already active


# ----------------------------------------------------------------- edit and role (RF001 note 3)

def test_role_change_is_logged_and_never_on_yourself(client, db):
    me = make_account(db)
    admin = client(me)
    target = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER)
    r = admin.put(f"/api/v1/admin/accounts/{target.id}", json={"full_name": "Moacir Barbosa", "role": "admin"})
    assert r.status_code == 200 and r.json()["role"] == "admin"
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "account.updated", m.AuditLog.target_id == str(target.id)))
    assert log.details["role"] == "photographer->admin" and log.actor_account_id == me.id
    assert admin.put(f"/api/v1/admin/accounts/{me.id}", json={"full_name": me.full_name, "role": "photographer",
                                                              "photographer_signature": "X"}).status_code == 403


# ----------------------------------------------------------------- status (RF003)

def test_suspension_logs_emails_and_cuts_access_immediately(client, db, outbox):
    me = make_account(db)
    admin = client(me)
    target = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER)
    photographer = client(target)
    assert photographer.get("/api/v1/dashboard").status_code == 200
    r = admin.post(f"/api/v1/admin/accounts/{target.id}/status", json={"status": "suspended"})
    assert r.status_code == 200 and r.json()["status_label"] == "Suspensa"
    assert photographer.get("/api/v1/dashboard").status_code == 401        # on every device, at once
    assert outbox.sent[-1].to == target.email and "suspensa" in outbox.sent[-1].body   # note 3
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "account.status_changed"))
    assert log.actor_account_id == me.id and log.details == {"previous": "active", "current": "suspended"}
    login = TestClient(app).post("/api/v1/auth/login", json={"email": target.email, "password": PASSWORD})
    assert login.status_code == 401                                       # generic, as any failure
    admin.post(f"/api/v1/admin/accounts/{target.id}/status", json={"status": "active"})
    assert TestClient(app).post("/api/v1/auth/login", json={"email": target.email, "password": PASSWORD}).status_code == 200


def test_photos_and_events_stay_when_the_photographer_is_suspended(client, db, make_event, photographer):
    """RF003 notes 2 and 5: nothing is deleted; the administrator answers for the events."""
    me = make_account(db)
    admin = client(me)
    event = make_event()
    assert admin.post(f"/api/v1/admin/accounts/{photographer.id}/status", json={"status": "inactive"}).status_code == 200
    assert db.get(m.Event, event.id) is not None
    assert admin.get(f"/api/v1/events/{event.id}").json()["can_manage"] is True


def test_cannot_lock_yourself_out_or_leave_the_system_without_admin(client, db):
    me = make_account(db)
    admin = client(me)
    assert admin.post(f"/api/v1/admin/accounts/{me.id}/status", json={"status": "suspended"}).status_code == 403
    other = make_account(db, "Bruno Admin")
    assert admin.post(f"/api/v1/admin/accounts/{other.id}/status", json={"status": "inactive"}).status_code == 200
    assert admin.post(f"/api/v1/admin/accounts/{other.id}/status", json={"status": "pending"}).status_code == 400


def test_reactivating_an_account_that_never_had_a_password_waits_for_the_holder(client, db, outbox):
    admin = client(make_account(db))
    pending = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER, m.AccountStatus.PENDING)
    admin.post(f"/api/v1/admin/accounts/{pending.id}/status", json={"status": "inactive"})
    r = admin.post(f"/api/v1/admin/accounts/{pending.id}/status", json={"status": "active"})
    assert r.json()["status"] == "pending"                                 # cannot be "Ativa" without a password
    assert "primeiro-acesso?token=" in outbox.sent[-1].body


# ----------------------------------------------------------------- unlock (RF002 note 7)

def test_administrator_unlocks_after_five_wrong_passwords(client, db):
    admin = client(make_account(db))
    target = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER)
    anon = TestClient(app)
    for _ in range(5):
        anon.post("/api/v1/auth/login", json={"email": target.email, "password": "Errada#123"})
    assert admin.get(f"/api/v1/admin/accounts/{target.id}").json()["locked"] is True
    assert anon.post("/api/v1/auth/login", json={"email": target.email, "password": PASSWORD}).status_code == 401
    assert admin.post(f"/api/v1/admin/accounts/{target.id}/unlock").json()["locked"] is False
    assert anon.post("/api/v1/auth/login", json={"email": target.email, "password": PASSWORD}).status_code == 200
