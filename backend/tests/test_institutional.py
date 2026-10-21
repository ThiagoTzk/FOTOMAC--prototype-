"""RF020-RF021: institutional people — registration by the administrator, electronic signature by an
e-mailed link, the search across the whole collection, the human confirmation and the revocation.

Real YuNet + SFace on public-domain NASA photos (never a CESMAC participant): the "institutional
person" is the astronaut at the centre of the Apollo 11 crew portrait.
"""
from __future__ import annotations

import base64
import re
import uuid
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError

from app import parameters
from app.api import institutional as institutional_api
from app.auth import passwords
from app.db import models as m
from app.indexing.worker import index_next
from app.institutional import form, service
from app.main import app
from app.security.rate_limit import login_limiter, password_link_limiter
from tests.test_profiles_v2 import CPF
from tests.test_public import CREW, GROUP, env, engine, make_event, person_crop, photographer, publish_and_index, stranger  # noqa: F401

PASSWORD = "Fotomac#2026"


def account(db, role: m.AccountRole) -> m.Account:
    a = m.Account(full_name=f"Conta {role.value}", email=f"{uuid.uuid4().hex[:8]}@cesmac.edu.br", role=role,
                  photographer_signature="Conta" if role in m.AUTHOR_ROLES else None,
                  password_hash=passwords.hash_password(PASSWORD), status=m.AccountStatus.ACTIVE)
    if role == m.AccountRole.CONTRACTOR:
        a.status = m.AccountStatus.ACTIVE
    db.add(a)
    db.flush()
    return a


def client_for(a: m.Account) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).status_code == 200
    return c


def signature_png(strokes: bool = True) -> str:
    canvas = np.zeros((200, 600, 4), np.uint8)
    if strokes:
        pts = np.array([[40, 150], [120, 60], [200, 140], [300, 50], [420, 150], [560, 70]], np.int32)
        cv2.polylines(canvas, [pts], False, (20, 20, 20, 255), 4)
    return "data:image/png;base64," + base64.b64encode(cv2.imencode(".png", canvas)[1].tobytes()).decode()


def hired_photographer(env, admin_client, event) -> TestClient:
    """A temporary account the real way: created by the administrator, first access with CPF and birth date."""
    _, outbox = env
    email = f"contratado.{uuid.uuid4().hex[:6]}@exemplo.com"
    assert admin_client.post("/api/v1/admin/accounts", json={
        "full_name": "Carlos Contratado", "email": email, "role": "contractor", "photographer_signature": "Carlos C.",
        "bound_event_id": str(event.id), "contract_number": "CT-2026/045"}).status_code == 201
    token = re.search(r"primeiro-acesso\?token=([\w-]+)", next(x.body for x in reversed(outbox.sent) if x.to == email)).group(1)
    c = TestClient(app)
    assert c.post("/api/v1/auth/first-access", json={"token": token, "password": PASSWORD, "password_confirmation": PASSWORD,
                                                     "cpf": CPF, "birth_date": "1990-05-20"}).status_code == 200
    return c


def register(c, photos=None, email=None):
    photos = photos if photos is not None else [person_crop()]
    return c.post("/api/v1/admin/institutional", data={
        "full_name": "Michael Collins", "position": "Pró-reitor de Extensão", "unit": "Reitoria",
        "email": email or f"m.collins.{uuid.uuid4().hex[:4]}@cesmac.edu.br"},
        files=[("photos", (f"ref{n}.jpg", p, "image/jpeg")) for n, p in enumerate(photos)])


def link_token(outbox) -> str:
    return re.search(r"/autorizacao\?token=([\w-]+)", outbox.sent[-1].body).group(1)


@pytest.fixture
def admin(db):
    institutional_api.link_limiter.reset()
    login_limiter.reset()
    password_link_limiter.reset()
    return account(db, m.AccountRole.ADMIN)


def signed_person(db, env, admin) -> m.InstitutionalPerson:
    storage, outbox = env
    person_id = register(client_for(admin)).json()["id"]
    r = TestClient(app).post("/api/v1/public/institutional/authorization",
                             json={"token": link_token(outbox), "signature": signature_png()})
    assert r.status_code == 200, r.text
    return db.get(m.InstitutionalPerson, uuid.UUID(person_id))


def shade(n: int) -> bytes:
    """The same group photo, a different file each time (a duplicate is refused in the same event)."""
    return cv2.imencode(".jpg", CREW, [cv2.IMWRITE_JPEG_QUALITY, 70 + n])[1].tobytes()


# ----------------------------------------------------------------- registration (RF020)

def test_only_the_administrator_registers_with_an_institutional_email_and_1_to_5_photos(env, db, admin):
    assert register(client_for(account(db, m.AccountRole.PHOTOGRAPHER))).status_code == 403
    c = client_for(admin)
    assert register(c, email="maria@gmail.com").status_code == 400                    # RF020 note 5
    assert register(c, photos=[]).status_code in (400, 422)
    assert register(c, photos=[person_crop()] * 6).status_code == 400
    assert register(c, photos=[b"GIF89a" + b"0" * 50]).status_code == 400
    ok = register(c, email="maria.silva@reitoria.cesmac.edu.br")
    assert ok.status_code == 201 and ok.json()["status"] == "awaiting"
    assert register(c, email="maria.silva@reitoria.cesmac.edu.br").status_code == 400  # one open registration per e-mail


def test_nothing_is_processed_before_the_signature(env, db, engine, admin):
    storage, outbox = env
    person = db.get(m.InstitutionalPerson, uuid.UUID(register(client_for(admin)).json()["id"]))
    photo = person.photos[0]
    stored = storage.get(photo.object_key)
    assert stored[:3] == b"\xff\xd8\xff" and b"Exif" not in stored[:200]               # reduced, no metadata
    assert "/autorizacao?token=" in outbox.sent[-1].body and outbox.sent[-1].to == person.email
    assert service.refresh_next(db, storage, engine) is False                         # nobody to search
    assert db.scalar(select(func.count()).select_from(m.InstitutionalVector)) == 0
    with pytest.raises(DBAPIError):                                                   # the database refuses it too
        with db.begin_nested():
            db.add(m.InstitutionalVector(person_id=person.id, photo_id=photo.id, model_version="x", dim=3,
                                         embedding=[0.1, 0.2, 0.3]))
            db.flush()


# ----------------------------------------------------------------- the electronic signature

def test_the_person_reads_signs_and_the_link_is_single_use(env, db, admin):
    storage, outbox = env
    person_id = uuid.UUID(register(client_for(admin)).json()["id"])
    token = link_token(outbox)
    public = TestClient(app)
    page = public.get("/api/v1/public/institutional/authorization", params={"token": token}).json()
    assert page["full_name"] == "Michael Collins" and page["term"]["version"] == "2026-10-v1"
    assert any("Art. 11" in p for p in page["term"]["paragraphs"])
    photo = page["photos"][0]
    assert public.get(f"/api/v1/public/institutional/authorization/photos/{photo}", params={"token": token}).status_code == 200
    assert public.get(f"/api/v1/public/institutional/authorization/photos/{photo}", params={"token": "x"}).status_code == 404
    blank = public.post("/api/v1/public/institutional/authorization", json={"token": token, "signature": signature_png(False)})
    assert blank.status_code == 400                                                   # an empty box is not a signature
    r = public.post("/api/v1/public/institutional/authorization", json={"token": token, "signature": signature_png()},
                    headers={"user-agent": "Navegador de teste"})
    assert r.status_code == 200 and "/autorizacao/revogar?token=" in r.json()["revoke_url"]
    person = db.get(m.InstitutionalPerson, person_id)
    assert person.status == m.InstitutionalStatus.ACTIVE and person.scan_status == "pending"
    assert person.authorized_user_agent == "Navegador de teste" and person.signed_term[0].startswith("Termo de autorização")
    assert person.document_sha256 == service.document_hash(person, __import__("hashlib").sha256(storage.get(person.signature_key)).hexdigest())
    assert "revogar" in outbox.sent[-1].body                                          # confirmation with the revocation link
    assert public.get("/api/v1/public/institutional/authorization", params={"token": token}).status_code == 404   # single use
    actions = db.scalars(select(m.AuditLog.action).where(m.AuditLog.target_id == str(person_id))).all()
    assert "institutional.authorized" in actions


def test_an_expired_link_does_not_sign(env, db, admin):
    storage, outbox = env
    person = db.get(m.InstitutionalPerson, uuid.UUID(register(client_for(admin)).json()["id"]))
    person.link_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    r = TestClient(app).post("/api/v1/public/institutional/authorization",
                             json={"token": link_token(outbox), "signature": signature_png()})
    assert r.status_code == 404


def test_refusing_deletes_the_registration_and_the_photos(env, db, admin):
    storage, outbox = env
    person = db.get(m.InstitutionalPerson, uuid.UUID(register(client_for(admin)).json()["id"]))
    key = person.photos[0].object_key
    assert TestClient(app).post("/api/v1/public/institutional/refusal", json={"token": link_token(outbox)}).status_code == 204
    db.expire_all()
    assert db.get(m.InstitutionalPerson, person.id) is None and key not in storage.objects


def test_a_registration_nobody_signs_is_eliminated_after_30_days(env, db, admin):
    storage, _ = env
    person = db.get(m.InstitutionalPerson, uuid.UUID(register(client_for(admin)).json()["id"]))
    key = person.photos[0].object_key
    person.link_sent_at = datetime.now(timezone.utc) - timedelta(days=31)
    db.flush()
    assert service.expire_pending(db, storage) == 1
    assert db.get(m.InstitutionalPerson, person.id) is None and key not in storage.objects


# ----------------------------------------------------------------- the whole collection (RF021)

def test_signing_finds_the_person_in_every_event_without_the_visitors_cap(env, db, engine, admin):
    storage, _ = env
    owner = photographer(db)
    first, second, other = make_event(db, owner, "Colação"), make_event(db, owner, "Semana acadêmica"), make_event(db, owner, "Feira")
    publish_and_index(db, storage, engine, owner, first, [shade(n) for n in range(7)])
    publish_and_index(db, storage, engine, owner, second, [shade(n) for n in range(7, 12)])
    publish_and_index(db, storage, engine, owner, other, [cv2.imencode(".jpg", cv2.imread(
        str(__import__("tests.conftest", fromlist=["FIXTURES"]).FIXTURES / "astronaut_eileen_collins.png")))[1].tobytes()])
    db.merge(m.SystemParameter(key="max_results_per_search", value=10))   # the visitor's cap: 10
    db.flush()
    person = signed_person(db, env, admin)
    assert service.refresh_next(db, storage, engine) is True
    marks = db.scalars(select(m.InstitutionalMark).where(m.InstitutionalMark.person_id == person.id)).all()
    assert len(marks) == 12 and {mk.event_id for mk in marks} == {first.id, second.id}   # 12 > 10: no cap
    assert all(mk.similarity >= parameters.institutional_threshold(db) for mk in marks)
    c = client_for(account(db, m.AccountRole.PHOTOGRAPHER))
    events = c.get(f"/api/v1/institutional/people/{person.id}/events").json()["events"]
    assert [(e["marked"], e["total"]) for e in events] == [(7, 7), (5, 5)] or [(e["marked"], e["total"]) for e in events] == [(5, 5), (7, 7)]
    assert db.scalar(select(func.count()).select_from(m.AuditLog).where(m.AuditLog.action == "institutional.query")) == 1


def test_a_photo_published_later_is_marked_when_indexed(env, db, engine, admin):
    storage, _ = env
    person = signed_person(db, env, admin)
    assert service.refresh_next(db, storage, engine) is True                          # empty collection: nothing yet
    owner = photographer(db)
    later = make_event(db, owner, "Aula inaugural")
    [image_id] = publish_and_index(db, storage, engine, owner, later, [GROUP])
    mark = db.get(m.InstitutionalMark, (person.id, image_id))
    assert mark is not None and mark.status == "pending"
    detail = client_for(admin).get(f"/api/v1/images/{image_id}").json()
    assert detail["institutional"] == ["Michael Collins"]                             # "pessoa institucional localizada"


def test_confirming_and_rejecting_and_a_rejection_is_not_undone(env, db, engine, admin):
    storage, _ = env
    owner = photographer(db)
    ev = make_event(db, owner, "Colação")
    a, b = publish_and_index(db, storage, engine, owner, ev, [shade(1), shade(2)])
    person = signed_person(db, env, admin)
    service.refresh_next(db, storage, engine)
    marketing = client_for(account(db, m.AccountRole.MARKETING))
    page = marketing.get(f"/api/v1/institutional/people/{person.id}/events/{ev.id}/images").json()
    assert page["event"]["total"] == 2 and page["person"]["full_name"] == "Michael Collins"
    assert {i["image_id"] for i in page["images"]} == {str(a), str(b)}
    assert marketing.get(f"/api/v1/institutional/people/{person.id}/images/{a}/thumb").status_code == 200
    assert marketing.post(f"/api/v1/institutional/people/{person.id}/marks", json={"image_ids": [str(a)], "confirm": True}).json()["decided"] == 1
    assert marketing.post(f"/api/v1/institutional/people/{person.id}/marks", json={"image_ids": [str(b)], "confirm": False}).json()["decided"] == 1
    person.scan_status = "pending"
    db.flush()
    service.refresh_next(db, storage, engine)                                         # the search runs again
    images = marketing.get(f"/api/v1/institutional/people/{person.id}/events/{ev.id}/images").json()["images"]
    assert [(i["image_id"], i["status"]) for i in images] == [(str(a), "confirmed")]  # the rejected one stays out
    assert marketing.get(f"/api/v1/institutional/people/{person.id}/images/{b}/thumb").status_code == 404


def test_who_consults_and_what_they_see(env, db, engine, admin):
    storage, _ = env
    awaiting = db.get(m.InstitutionalPerson, uuid.UUID(register(client_for(admin)).json()["id"]))
    person = signed_person(db, env, admin)
    owner = photographer(db)
    ev = make_event(db, owner)
    [marked, plain] = publish_and_index(db, storage, engine, owner, ev, [GROUP, cv2.imencode(".jpg", np.full((400, 600, 3), 90, np.uint8))[1].tobytes()])
    service.refresh_next(db, storage, engine)
    assert TestClient(app).get("/api/v1/institutional/people").status_code == 401                         # never public
    assert hired_photographer(env, client_for(admin), ev).get("/api/v1/institutional/people").status_code == 403   # RF021 note 1
    c = client_for(account(db, m.AccountRole.PHOTOGRAPHER))
    listed = c.get("/api/v1/institutional/people").json()
    assert [p["id"] for p in listed] == [str(person.id)]                              # only active people
    assert set(listed[0]) == {"id", "full_name", "position", "unit"}                  # never e-mail or photos (RF020 note 1)
    assert c.get(f"/api/v1/institutional/people/{awaiting.id}/events").status_code == 404
    assert c.get(f"/api/v1/institutional/people/{person.id}/images/{plain}/thumb").status_code == 404   # not marked
    assert c.get(f"/api/v1/institutional/people/{person.id}/images/{marked}/preview").status_code == 200
    assert c.get(f"/api/v1/admin/institutional/{person.id}").status_code == 403       # the registration is the admin's


# ----------------------------------------------------------------- revocation and the official copy

def test_revocation_erases_photos_vectors_and_marks_and_keeps_the_proof(env, db, engine, admin):
    storage, outbox = env
    owner = photographer(db)
    publish_and_index(db, storage, engine, owner, make_event(db, owner), [GROUP])
    person = signed_person(db, env, admin)
    service.refresh_next(db, storage, engine)
    photo_key = person.photos[0].object_key
    assert db.scalar(select(func.count()).select_from(m.InstitutionalMark)) == 1
    revoke_token = re.search(r"/autorizacao/revogar\?token=([\w-]+)", outbox.sent[-1].body).group(1)
    public = TestClient(app)
    assert public.get("/api/v1/public/institutional/revocation", params={"token": revoke_token}).json()["status"] == "active"
    assert public.post("/api/v1/public/institutional/revocation", json={"token": revoke_token}).status_code == 200
    db.expire_all()
    person = db.get(m.InstitutionalPerson, person.id)
    assert person.status == m.InstitutionalStatus.REVOKED and person.revoked_by == "holder"
    assert photo_key not in storage.objects and not person.photos
    for table in (m.InstitutionalVector, m.InstitutionalMark):
        assert db.scalar(select(func.count()).select_from(table)) == 0
    assert person.signature_key in storage.objects and person.document_sha256                     # the proof stays
    signature_sha = __import__("hashlib").sha256(storage.get(person.signature_key)).hexdigest()
    assert service.document_hash(person, signature_sha) == person.document_sha256                 # still verifiable
    assert public.post("/api/v1/public/institutional/revocation", json={"token": revoke_token}).status_code == 400
    assert client_for(account(db, m.AccountRole.PHOTOGRAPHER)).get(f"/api/v1/institutional/people/{person.id}/events").status_code == 404
    pdf = form.build(person, storage)                                                 # the copy says it was revoked
    assert pdf.startswith(b"%PDF")


def test_the_administrator_downloads_the_signed_form(env, db, engine, admin):
    storage, _ = env
    c = client_for(admin)
    awaiting = register(c).json()["id"]
    assert c.get(f"/api/v1/admin/institutional/{awaiting}/form.pdf").status_code == 400   # nothing signed yet
    person = signed_person(db, env, admin)
    r = c.get(f"/api/v1/admin/institutional/{person.id}/form.pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"]
    assert c.get(f"/api/v1/admin/institutional/{person.id}/signature").headers["content-type"] == "image/png"
    assert db.scalar(select(func.count()).select_from(m.AuditLog).where(m.AuditLog.action == "institutional.form_downloaded")) == 1
    assert c.post(f"/api/v1/admin/institutional/{person.id}/end").json()["status"] == "revoked"   # yearly review
    assert c.delete(f"/api/v1/admin/institutional/{person.id}").status_code == 400                # signed: the term stays


def test_the_institutional_threshold_is_never_below_the_public_one(db):
    admin = account(db, m.AccountRole.ADMIN)
    public = parameters.get(db, "similarity_threshold")
    with pytest.raises(parameters.ParameterError):
        parameters.update(db, admin, {"institutional_threshold": public - 0.05}, False)
    parameters.update(db, admin, {"similarity_threshold": public + 0.05}, True)       # the public one goes up...
    assert parameters.institutional_threshold(db) == pytest.approx(public + 0.05)    # ...and the marking follows


def test_a_new_model_rebuilds_the_reference_vectors(env, db, engine, admin):
    storage, _ = env
    person = signed_person(db, env, admin)
    service.refresh_next(db, storage, engine)
    assert person.references_model_version == engine.model_version
    person.references_model_version = "modelo-antigo"
    db.flush()
    assert service.refresh_next(db, storage, engine) is True
    vectors = db.scalars(select(m.InstitutionalVector).where(m.InstitutionalVector.person_id == person.id)).all()
    assert len(vectors) == 1 and vectors[0].model_version == engine.model_version and person.photos[0].faces_found >= 1
