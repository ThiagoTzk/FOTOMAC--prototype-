"""Requirements v2.0 — marketing profile (RF030) and temporary account of the hired photographer
(RF031), through the real HTTP API."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.accounts import service as accounts
from app.auth import passwords
from app.db import models as m
from app.db.session import get_session
from app.images import service as images
from app.main import app
from app.notifications.factory import get_email_sender
from app.security.rate_limit import login_limiter, password_link_limiter
from app.storage.factory import get_storage
from tests.support import MemoryStorage, jpeg

PASSWORD = "Fotomac#2026"
CPF = "529.982.247-25"   # a valid test CPF (check digits), not of a real person


class Outbox:
    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)

    def link_for(self, email):
        body = next(msg.body for msg in reversed(self.sent) if msg.to == email)
        return re.search(r"primeiro-acesso\?token=([\w-]+)", body).group(1)


@pytest.fixture
def env(db):
    storage, outbox = MemoryStorage(), Outbox()
    login_limiter.reset()
    password_link_limiter.reset()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_email_sender] = lambda: outbox
    yield storage, outbox
    app.dependency_overrides.clear()


def account(db, role, name="Ana Lima", signature=True) -> m.Account:
    a = m.Account(full_name=name, email=f"{uuid.uuid4().hex[:8]}@cesmac.edu.br", role=role,
                  photographer_signature=name if signature and role != m.AccountRole.ADMIN else None,
                  password_hash=passwords.hash_password(PASSWORD), status=m.AccountStatus.ACTIVE)
    db.add(a)
    db.flush()
    return a


def login(a: m.Account) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).status_code == 200
    return c


def event_of(db, owner, *, published=False, collaboration=False) -> m.Event:
    e = m.Event(name=f"Evento {uuid.uuid4().hex[:6]}", date_precision=m.DatePrecision.DAY, date_start=date(2026, 12, 19),
                date_end=date(2026, 12, 19), location="Campus I", description="Evento", owner_id=owner.id,
                expires_on=date(2027, 6, 19), collaboration_open=collaboration,
                status=m.EventStatus.PUBLISHED if published else m.EventStatus.EDITING)
    db.add(e)
    db.flush()
    return e


def contractor(db, env, admin_client, event) -> tuple[m.Account, TestClient]:
    """Created by the administrator, activated by the hired photographer with CPF and birth date."""
    _, outbox = env
    email = f"contratado.{uuid.uuid4().hex[:6]}@exemplo.com"   # personal e-mail allowed (RF001 note 2)
    r = admin_client.post("/api/v1/admin/accounts", json={
        "full_name": "Carlos Contratado", "email": email, "role": "contractor", "photographer_signature": "Carlos C.",
        "bound_event_id": str(event.id), "contract_number": "CT-2026/045"})
    assert r.status_code == 201, r.text
    c = TestClient(app)
    token = outbox.link_for(email)
    check = c.post("/api/v1/auth/first-access/check", json={"token": token}).json()
    assert check == {"valid": True, "needs_identity": True, "full_name": "Carlos Contratado"}
    r = c.post("/api/v1/auth/first-access", json={"token": token, "password": PASSWORD, "password_confirmation": PASSWORD,
                                                  "cpf": CPF, "birth_date": "1990-05-20"})
    assert r.status_code == 200, r.text
    return db.get(m.Account, r.json()["id"]), c


# ----------------------------------------------------------------- marketing (RF030)

def test_marketing_produces_like_a_photographer_with_its_own_label(env, db):
    storage, _ = env
    mkt = account(db, m.AccountRole.MARKETING, "Lucas Bezerra")
    c = login(mkt)
    theme = c.post("/api/v1/themes", json={"name": f"Divulgação {uuid.uuid4().hex[:4]}"})
    assert theme.status_code == 201                                             # creates themes (RF027)
    r = c.post("/api/v1/events", data={"name": "Semana de Marketing", "theme_ids": [str(theme.json()["id"])],
                                       "date_precision": "day", "date_start": "2026-09-18", "location": "Campus I",
                                       "description": "Cobertura da equipe."},
               files={"cover": ("capa.jpg", jpeg(1), "image/jpeg")})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["owner"]["team"] == "Equipe de marketing" and body["relation"] == "owner"   # RF030 note 2
    up = c.post(f"/api/v1/events/{body['id']}/images", files={"file": ("f.jpg", jpeg(2, w=400, h=300), "image/jpeg")})
    assert up.status_code == 201 and up.json()["approval"] is None               # no approval for staff
    assert c.post(f"/api/v1/events/{body['id']}/publish").status_code == 200


def test_marketing_sees_only_the_published_photos_of_other_events(env, db):
    storage, _ = env
    photographer, mkt = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa"), account(db, m.AccountRole.MARKETING)
    e = event_of(db, photographer, published=True)
    published = images.upload_image(db, storage, photographer, e, jpeg(3, w=400, h=300))
    images.publish(db, storage, photographer, e)
    in_review = images.upload_image(db, storage, photographer, e, jpeg(4, w=400, h=300))
    hidden = event_of(db, photographer)                                       # still being edited
    c = login(mkt)
    names = [x["name"] for x in c.get("/api/v1/events").json()["items"]]
    assert e.name in names and hidden.name not in names
    detail = c.get(f"/api/v1/events/{e.id}").json()
    assert detail["relation"] == "viewer" and not detail["can_manage"] and detail["photos"] == 1
    listed = c.get(f"/api/v1/events/{e.id}/images").json()
    assert [i["id"] for i in listed["items"]] == [str(published.id)] and listed["counts"]["all"] == 1
    assert c.get(f"/api/v1/images/{in_review.id}").status_code == 404           # under review: not for viewers
    assert c.post(f"/api/v1/events/{e.id}/images", files={"file": ("f.jpg", jpeg(5), "image/jpeg")}).status_code == 403
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 403


# ----------------------------------------------------------------- hired photographer (RF031)

def test_the_temporary_account_is_created_for_one_event_and_one_contract(env, db):
    admin = login(account(db, m.AccountRole.ADMIN))
    base = {"full_name": "Carlos Contratado", "email": "carlos@exemplo.com", "role": "contractor",
            "photographer_signature": "Carlos C."}
    assert "evento" in admin.post("/api/v1/admin/accounts", json=base).json()["detail"]
    e = event_of(db, account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa"))
    no_contract = admin.post("/api/v1/admin/accounts", json={**base, "bound_event_id": str(e.id)})
    assert "contrato" in no_contract.json()["detail"]
    ok = admin.post("/api/v1/admin/accounts", json={**base, "bound_event_id": str(e.id), "contract_number": "CT-1"})
    assert ok.status_code == 201 and ok.json()["contractor"]["event_name"] == e.name
    created = db.get(m.Account, ok.json()["id"])
    assert admin.put(f"/api/v1/admin/accounts/{created.id}", json={
        "full_name": created.full_name, "role": "photographer", "photographer_signature": "Carlos C."}).status_code == 400


def test_first_access_requires_a_valid_cpf_and_starts_the_24_hours(env, db):
    _, outbox = env
    admin = login(account(db, m.AccountRole.ADMIN))
    e = event_of(db, account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa"))
    admin.post("/api/v1/admin/accounts", json={"full_name": "Carlos Contratado", "email": "c2@exemplo.com",
                                              "role": "contractor", "photographer_signature": "Carlos C.",
                                              "bound_event_id": str(e.id), "contract_number": "CT-2"})
    c, token = TestClient(app), outbox.link_for("c2@exemplo.com")
    base = {"token": token, "password": PASSWORD, "password_confirmation": PASSWORD, "birth_date": "1990-05-20"}
    assert c.post("/api/v1/auth/first-access", json=base).json()["detail"]["message"] == "Informe um CPF válido."
    assert c.post("/api/v1/auth/first-access", json={**base, "cpf": "111.111.111-11"}).status_code == 400
    assert c.post("/api/v1/auth/first-access", json={**base, "cpf": "529.982.247-24"}).status_code == 400  # wrong digit
    r = c.post("/api/v1/auth/first-access", json={**base, "cpf": CPF})
    assert r.status_code == 200 and r.json()["role_label"] == "Fotógrafo contratado"
    a = db.get(m.Account, r.json()["id"])
    assert a.status == m.AccountStatus.ACTIVE
    assert timedelta(hours=23, minutes=59) < a.valid_until - datetime.now(timezone.utc) <= timedelta(hours=24)
    assert b"52998224725" not in a.cpf_encrypted and b"1990" not in a.birth_date_encrypted      # encrypted at rest
    detail = admin.get(f"/api/v1/admin/accounts/{a.id}").json()["contractor"]
    assert detail["cpf"] == "***.***.***-25" and detail["birth_date"] == "1990-05-20"          # masked (RF031 note 7)


def test_contractor_works_only_on_its_event_and_its_photos_wait_for_approval(env, db):
    storage, _ = env
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    admin_account = account(db, m.AccountRole.ADMIN)
    admin = login(admin_account)
    e = event_of(db, owner)
    other = event_of(db, owner, collaboration=True)                            # open, but not its event
    own_photo = images.upload_image(db, storage, owner, e, jpeg(10, w=400, h=300))
    hired, c = contractor(db, env, admin, e)

    assert [x["id"] for x in c.get("/api/v1/events").json()["items"]] == [str(e.id)]
    assert c.get(f"/api/v1/events/{other.id}").status_code == 404
    assert c.post(f"/api/v1/events/{other.id}/images", files={"file": ("f.jpg", jpeg(11), "image/jpeg")}).status_code == 404
    assert c.post("/api/v1/themes", json={"name": "Tema do contratado"}).status_code == 403
    assert c.post("/api/v1/events", data={"name": "x"}).status_code in (403, 422)
    up = c.post(f"/api/v1/events/{e.id}/images", files={"file": ("f.jpg", jpeg(12, w=400, h=300), "image/jpeg")})
    assert up.status_code == 201 and up.json()["approval"] == "pending"
    mine = c.get(f"/api/v1/events/{e.id}/images").json()["items"]
    assert [i["id"] for i in mine] == [up.json()["id"]]                       # only its own photos
    assert c.get(f"/api/v1/images/{own_photo.id}").status_code == 404
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 403         # never publishes

    owner_client = login(owner)
    assert owner_client.post(f"/api/v1/events/{e.id}/publish").json()["published"] == 1   # its photo waits
    waiting = db.get(m.Image, up.json()["id"])
    assert waiting.review_status == m.ImageReviewStatus.IN_REVIEW
    assert owner_client.post(f"/api/v1/images/{waiting.id}/approval", json={"approve": True}).status_code == 403
    assert admin.post(f"/api/v1/images/{waiting.id}/approval", json={"approve": True}).json()["image"]["approval"] == "approved"
    assert owner_client.post(f"/api/v1/events/{e.id}/publish").json()["published"] == 1
    assert db.get(m.Image, waiting.id).review_status == m.ImageReviewStatus.PUBLISHED

    rejected = c.post(f"/api/v1/events/{e.id}/images", files={"file": ("g.jpg", jpeg(13, w=400, h=300), "image/jpeg")}).json()
    assert admin.post(f"/api/v1/images/{rejected['id']}/approval", json={"approve": False}).json() == {"image": None}
    assert db.get(m.Image, rejected["id"]) is None
    assert not [k for k in storage.objects if rejected["id"] in k]             # no file, never a vector
    actions = set(db.scalars(select(m.AuditLog.action).where(m.AuditLog.target_id.in_([str(waiting.id), rejected["id"]]))))
    assert {"image.approved", "image.rejected"} <= actions


def test_the_account_expires_after_24_hours_and_is_never_reactivated(env, db):
    _, outbox = env
    admin_account = account(db, m.AccountRole.ADMIN)
    admin = login(admin_account)
    e = event_of(db, account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa"))
    hired, c = contractor(db, env, admin, e)
    assert c.get("/api/v1/auth/me").status_code == 200
    hired.valid_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    assert c.get("/api/v1/auth/me").status_code == 401                          # mid-session (RF031 note 4)
    assert hired.status == m.AccountStatus.EXPIRED
    assert TestClient(app).post("/api/v1/auth/login", json={"email": hired.email, "password": PASSWORD}).status_code == 401
    r = admin.post(f"/api/v1/admin/accounts/{hired.id}/status", json={"status": "active"})
    assert r.status_code == 400 and "não pode ser reativada" in r.json()["detail"]
    assert db.get(m.Account, hired.id) is not None                              # kept, never deleted
    sent = len(outbox.sent)
    TestClient(app).post("/api/v1/auth/password/forgot", json={"email": hired.email})
    assert len(outbox.sent) == sent                                              # no self-service reset (RF002 note 6)


def test_identity_is_erased_after_the_retention(env, db):
    storage, _ = env
    admin = login(account(db, m.AccountRole.ADMIN))
    e = event_of(db, account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa"))
    hired, c = contractor(db, env, admin, e)
    photo = c.post(f"/api/v1/events/{e.id}/images", files={"file": ("f.jpg", jpeg(20, w=400, h=300), "image/jpeg")}).json()
    hired.valid_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    assert accounts.expire_contractors(db) == 1
    assert accounts.erase_contractor_identities(db) == 0 and hired.media_gone_at is None   # its photo is in the collection
    images.delete_image(db, storage, None, db.get(m.Image, photo["id"]))
    accounts.erase_contractor_identities(db)
    assert hired.media_gone_at is not None and hired.cpf_encrypted is not None              # the period starts now
    hired.media_gone_at -= timedelta(days=30 * 36 + 1)                                     # provisional: 36 months
    db.flush()
    assert accounts.erase_contractor_identities(db) == 1
    assert hired.cpf_encrypted is None and hired.birth_date_encrypted is None and hired.identity_erased_at
    assert hired.full_name == "Carlos Contratado"                                          # the name stays (RF003 note 4)
    assert db.scalar(select(func.count()).select_from(m.AuditLog).where(
        m.AuditLog.action == "account.identity_erased", m.AuditLog.target_id == str(hired.id))) == 1


@pytest.mark.parametrize("email, role, ok", [
    ("moacir@gmail.com", "photographer", False),
    ("lucas@hotmail.com", "marketing", False),
    ("chefe@exemplo.com", "admin", False),
    ("moacir@cesmac.edu.br", "photographer", True),
    ("aluno@academico.cesmac.edu.br", "marketing", True),     # a subdomain of the institution
    ("falso@cesmac.edu.br.exemplo.com", "photographer", False),
])
def test_only_the_hired_photographer_may_use_a_personal_email(env, db, email, role, ok):
    """Decision of 17/10/2026: whoever works for the CESMAC has an institutional e-mail."""
    admin = login(account(db, m.AccountRole.ADMIN))
    r = admin.post("/api/v1/admin/accounts", json={"full_name": "Pessoa de Teste", "email": email, "role": role,
                                                   "photographer_signature": "Pessoa"})
    assert (r.status_code == 201) is ok, r.text
    if not ok:
        assert "e-mail institucional" in r.json()["detail"]


def test_batch_approval_records_who_approved_and_the_dashboard_points_to_the_event(env, db):
    """17/10/2026: approving 200 photos one by one is not a safety requirement — the record is. Each
    approved photo says who sent it and who approved it; the overview shows where photos wait."""
    storage, _ = env
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    admin_account = account(db, m.AccountRole.ADMIN, "Ana Lima")
    admin = login(admin_account)
    e = event_of(db, owner)
    hired, c = contractor(db, env, admin, e)
    ids = [c.post(f"/api/v1/events/{e.id}/images", files={"file": (f"{n}.jpg", jpeg(30 + n, w=400, h=300), "image/jpeg")}).json()["id"]
           for n in range(3)]
    board = admin.get("/api/v1/dashboard").json()
    assert board["approvals_pending"] == [{"event_id": str(e.id), "event_name": e.name, "photos": 3}]
    assert board["attention"] >= 1 and board["approvals_total"] == 3        # one situation, three photos
    bell = admin.get("/api/v1/notifications").json()
    assert any(n["kind"] == "approval" and n["urgent"] and "3 imagens aguardam" in n["title"] for n in bell["items"])
    assert bell["urgent"] == board["attention"]
    assert login(owner).post(f"/api/v1/events/{e.id}/images/approval", json={"image_ids": ids, "approve": True}).status_code == 403
    assert admin.post(f"/api/v1/events/{e.id}/images/approval", json={"image_ids": ids[:2], "approve": True}).json() == {"decided": 2}
    detail = admin.get(f"/api/v1/images/{ids[0]}").json()
    assert detail["approval"] == "approved" and detail["approved_by_name"] == "Ana Lima"
    assert detail["uploaded_by_name"] == "Carlos Contratado" and detail["approved_at"]
    assert admin.post(f"/api/v1/events/{e.id}/images/approval", json={"image_ids": ids, "approve": False}).json() == {"decided": 1}
    assert db.get(m.Image, ids[2]) is None                                       # only the pending one was rejected
    assert admin.get("/api/v1/dashboard").json()["approvals_pending"] == []


def test_replacing_an_approved_photo_sends_it_back_to_approval(env, db):
    """Audit A1 (17/10/2026): the approval is about ONE file. Swapping the file after the approval must not
    keep "approved by" — the administrator never saw the new content."""
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    admin = login(account(db, m.AccountRole.ADMIN, "Ana Lima"))
    e = event_of(db, owner)
    _, c = contractor(db, env, admin, e)
    image_id = c.post(f"/api/v1/events/{e.id}/images", files={"file": ("a.jpg", jpeg(40, w=400, h=300), "image/jpeg")}).json()["id"]
    admin.post(f"/api/v1/images/{image_id}/approval", json={"approve": True})
    r = c.put(f"/api/v1/images/{image_id}/file", files={"file": ("b.jpg", jpeg(41, w=400, h=300), "image/jpeg")})
    assert r.status_code == 200
    assert r.json()["approval"] == "pending" and r.json()["approved_by_name"] is None and r.json()["approved_at"] is None
    assert login(owner).post(f"/api/v1/events/{e.id}/publish").status_code == 400   # nothing approved to publish
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "image.replace", m.AuditLog.target_id == image_id))
    assert log.details["approval_reset"] is True
