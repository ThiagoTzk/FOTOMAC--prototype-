"""RF026 (parameters), RF027 (themes), RF028 (re-indexing) and RF006/RNF12 (expiry)."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api import public as public_api
from app.db import models as m
from app.db.session import get_session
from app.events import dates
from app.events.expiry import expire_due, notify_expiring
from app.face import factory
from app.face.factory import EngineSpec, build_engine, get_face_engine
from app.images import service as images
from app.indexing.reindex import reindex_next
from app.main import app
from app.notifications.factory import get_email_sender
from app.security.rate_limit import login_limiter, password_link_limiter
from app.storage.factory import get_storage
from tests.support import MemoryStorage, PosedEngine, jpeg
from tests.test_accounts import PASSWORD, Outbox, make_account
from tests.test_public import GROUP, consent, make_event, person_crop, photographer, publish_and_index, search


@pytest.fixture(scope="module")
def engine():
    # Real SFace; PosedEngine simulates the head movements of the guided capture (tests/support.py).
    return PosedEngine(build_engine("sface"))


@pytest.fixture
def env(db, engine):
    storage, outbox = MemoryStorage(), Outbox()
    for limiter in (login_limiter, password_link_limiter, public_api.search_limiter, public_api.download_limiter,
                    public_api.consent_limiter):
        limiter.reset()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_email_sender] = lambda: outbox
    app.dependency_overrides[get_face_engine] = lambda: engine
    yield storage, outbox
    app.dependency_overrides.clear()
    public_api.search_limiter.max_requests, public_api.download_limiter.max_requests = 20, 60


def login(account) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"email": account.email, "password": PASSWORD}).status_code == 200
    return c


def put(c, values, ack=False):
    return c.put("/api/v1/admin/parameters", json={"values": values, "threshold_warning_acknowledged": ack})


# ----------------------------------------------------------------- parameters (RF026)

def test_only_admins_and_the_engine_is_not_a_plain_parameter(env, db, engine):
    p = login(make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER))
    assert p.get("/api/v1/admin/parameters").status_code == 403
    body = login(make_account(db)).get("/api/v1/admin/parameters").json()
    assert {i["key"] for i in body["items"]} >= {"similarity_threshold", "min_detection_score", "min_query_face_side",
                                                "max_results_per_search", "searches_per_session", "retention_months"}
    model = body["model"]
    assert (model["key"], model["version"], model["vector_dim"], model["error"]) == ("sface", engine.model_version, 128, None)
    assert model["calibrated_threshold"] == 0.3741 and model["outdated_images"] == 0
    assert [e["key"] for e in body["engines"]] == ["sface", "sface-2560", "sface-3840", "insightface"]
    # The engine is swapped only through its own route, with its consequences (PUT /admin/face-engine).
    assert put(login(make_account(db, "Bia Admin")), {"model_version": 2}).status_code == 400
    assert p.put("/api/v1/admin/face-engine", json={"engine": "sface", "consequences_acknowledged": True}).status_code == 403


def test_threshold_needs_the_warning_and_every_change_is_logged(env, db):
    me = make_account(db)
    c = login(me)
    r = put(c, {"similarity_threshold": 0.35})
    assert r.status_code == 400 and "advertência" in r.json()["detail"]          # note 1, on the server
    assert put(c, {"similarity_threshold": 0.35}, ack=True).json()["changed"] == ["similarity_threshold"]
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "parameter.changed"))
    assert log.actor_account_id == me.id and log.details == {"previous": 0.3741, "new": 0.35}   # note 4
    assert c.get("/api/v1/admin/parameters").json()["history"][0]["new"] == 0.35


@pytest.mark.parametrize("values", [{"similarity_threshold": 0.95}, {"retention_months": 0},
                                    {"min_query_face_side": 40.5}, {"min_detection_score": 0.3}])
def test_values_outside_the_allowed_range_are_refused(env, db, values):
    assert put(login(make_account(db)), values, ack=True).status_code == 400


def test_parameters_change_the_real_search(env, db, engine):
    storage, _ = env
    admin = login(make_account(db))
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    # A blurred selfie of the same person: similarity 0.53 (measured with SFace) — found with the
    # default 0.3741, NOT found once the administrator raises the threshold to 0.60.
    blurred = cv2.imencode(".jpg", cv2.GaussianBlur(cv2.imdecode(np.frombuffer(person_crop(), np.uint8), 1), (0, 0), 5))[1].tobytes()
    visitor = TestClient(app)
    consent(visitor, e)
    assert len(search(visitor, e, blurred).json()["items"]) == 1
    put(admin, {"similarity_threshold": 0.6}, ack=True)
    assert search(visitor, e, blurred).json()["items"] == []
    put(admin, {"searches_per_session": 2, "searches_per_address": 7})
    assert search(visitor, e, person_crop()).status_code == 429                 # 3rd search of the session
    assert public_api.search_limiter.max_requests == 7                          # per-address limit applied at once


def test_retention_change_moves_expiry_but_never_skips_the_30_day_notice(env, db):
    admin = login(make_account(db))
    owner = photographer(db)
    recent, old = make_event(db, owner, "Recente"), make_event(db, owner, "Antigo")
    recent.date_start = recent.date_end = date.today() + timedelta(days=10)
    old.date_start = old.date_end = date.today() - timedelta(days=60)
    old.expiry_notice_sent_at = None
    db.flush()
    impact = admin.get("/api/v1/admin/parameters/retention-impact", params={"months": 1}).json()
    assert impact["held_by_notice"] >= 1
    put(admin, {"retention_months": 1})
    db.refresh(recent), db.refresh(old)
    assert recent.expires_on == dates.expiry_date(recent.date_end, 1)              # applied immediately
    assert old.expires_on == date.today() + timedelta(days=30)                  # would be in the past: held 30 days
    pub = TestClient(app).get("/api/v1/public/privacy").json()
    assert pub["retention"] == "1 mês"                                          # declared publicly at once (RF022 n5)


# ----------------------------------------------------------------- themes (RF027)

def test_themes_unique_inactivate_and_delete_only_unused(env, db):
    admin = login(make_account(db))
    photographer_client = login(make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER))
    name = f"Robótica {uuid.uuid4().hex[:4]}"
    t = admin.post("/api/v1/admin/themes", json={"name": name}).json()
    assert admin.post("/api/v1/admin/themes", json={"name": name.upper()}).status_code == 400   # unique
    assert admin.post("/api/v1/admin/themes", json={"name": "x" * 51}).status_code == 400
    e = make_event(db, photographer(db))
    e.themes = [db.get(m.Theme, t["id"])]
    db.flush()
    row = next(r for r in admin.get("/api/v1/admin/themes").json() if r["id"] == t["id"])
    assert row["events"] == 1
    r = admin.delete(f"/api/v1/admin/themes/{t['id']}")
    assert r.status_code == 400 and "inative" in r.json()["detail"]
    assert admin.post(f"/api/v1/admin/themes/{t['id']}/status", json={"active": False}).json()["active"] is False
    assert name not in [x["name"] for x in photographer_client.get("/api/v1/themes").json()]    # not offered
    assert name not in [x["name"] for x in TestClient(app).get("/api/v1/public/themes").json()]
    db.refresh(e)
    assert [x.name for x in e.themes] == [name]                                  # the event keeps it
    spare = admin.post("/api/v1/admin/themes", json={"name": f"Sem uso {uuid.uuid4().hex[:4]}"}).json()
    assert admin.put(f"/api/v1/admin/themes/{spare['id']}", json={"name": "Renomeado " + spare["name"]}).status_code == 200
    assert admin.delete(f"/api/v1/admin/themes/{spare['id']}").status_code == 204


def test_theme_icon_is_chosen_validated_audited_and_public(env, db):
    admin = login(make_account(db))
    t = admin.post("/api/v1/admin/themes", json={"name": f"Jaleco {uuid.uuid4().hex[:4]}", "icon": "stethoscope"}).json()
    assert t["icon"] == "stethoscope"
    plain = admin.post("/api/v1/admin/themes", json={"name": f"Sem ícone {uuid.uuid4().hex[:4]}"}).json()
    assert plain["icon"] == "tag"                                                # default symbol
    for bad in ("<svg>", "Trophy", "a" * 41, "x y"):
        assert admin.post("/api/v1/admin/themes", json={"name": f"Ruim {uuid.uuid4().hex[:6]}", "icon": bad}).status_code in (400, 422)
    assert admin.put(f"/api/v1/admin/themes/{t['id']}", json={"name": t["name"], "icon": "heart-pulse"}).json()["icon"] == "heart-pulse"
    assert admin.put(f"/api/v1/admin/themes/{t['id']}", json={"name": t["name"]}).json()["icon"] == "heart-pulse"  # kept when omitted
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "theme.icon_changed", m.AuditLog.target_id == str(t["id"])))
    assert log is not None
    public = {x["name"]: x["icon"] for x in TestClient(app).get("/api/v1/public/themes").json()}
    assert public[t["name"]] == "heart-pulse"                                   # the visitor strip draws it


# ----------------------------------------------------------------- re-indexing (RF028)

def test_reindex_replaces_vectors_only_after_new_ones_exist(env, db, engine):
    storage, _ = env
    admin = login(make_account(db))
    owner = photographer(db)
    e = make_event(db, owner)
    (img,) = publish_and_index(db, storage, engine, owner, e, [GROUP])
    in_review = images.upload_image(db, storage, owner, e, jpeg(41))            # never published
    old_ids = set(db.scalars(select(m.FaceEmbedding.id).where(m.FaceEmbedding.image_id == img)))
    job = admin.post("/api/v1/admin/reindex", json={"scope": "event", "event_id": str(e.id)}).json()
    assert job["total"] == 1                                                     # note 1: published only
    assert admin.post("/api/v1/admin/reindex", json={"scope": "event", "event_id": str(e.id)}).status_code == 400
    while reindex_next(db, storage, engine):
        pass
    new_ids = set(db.scalars(select(m.FaceEmbedding.id).where(m.FaceEmbedding.image_id == img)))
    assert len(new_ids) == 3 and not (new_ids & old_ids)                         # replaced
    assert db.scalar(select(func.count()).select_from(m.FaceEmbedding).where(m.FaceEmbedding.image_id == in_review.id)) == 0
    detail = admin.get(f"/api/v1/admin/reindex/{job['id']}").json()
    assert detail["job"]["percent"] == 100 and detail["job"]["finished_at"] and detail["events"][0]["percent"] == 100
    actions = db.scalars(select(m.AuditLog.action).where(m.AuditLog.target_id == job["id"])).all()
    assert set(actions) == {"reindex.requested", "reindex.finished"}
    visitor = TestClient(app)
    consent(visitor, e)
    assert len(search(visitor, e, person_crop()).json()["items"]) == 1           # still searchable


# ----------------------------------------------------------------- engine swap (builder, RF026 note 3, RF028)

def _other_engine(monkeypatch, key="outro", target="tests.support:PosedStableFake"):
    """A second technology in the builder's catalogue, as a developer would add one."""
    monkeypatch.setitem(factory.ENGINES, key, EngineSpec(key=key, label="Outro modelo (teste)", target=target, vector_dim=128,
                                                         license="teste", similarity_threshold=0.5, calibration="teste"))
    monkeypatch.setattr(factory, "_engines", {})


def swap(c, name, ack=True):
    return c.put("/api/v1/admin/face-engine", json={"engine": name, "consequences_acknowledged": ack})


def test_engine_swap_from_the_panel(env, db, engine, monkeypatch):
    storage, _ = env
    _other_engine(monkeypatch)
    me = make_account(db)
    admin = login(me)
    owner = photographer(db)
    e = make_event(db, owner)
    (img,) = publish_and_index(db, storage, engine, owner, e, [GROUP])
    put(admin, {"similarity_threshold": 0.40}, ack=True)                        # tuned for SFace

    assert swap(admin, "outro", ack=False).status_code == 400                  # consequences confirmed first
    assert swap(admin, "sface").json()["detail"] == "Esse já é o modelo em uso."
    assert swap(admin, "nao-existe").status_code == 400
    body = swap(admin, "outro").json()
    assert body["model"]["key"] == "outro" and body["model"]["version"] == "fake-1.0"
    assert body["job"]["total"] == 1 and body["job"]["to_version"] == "fake-1.0"   # the collection is queued
    threshold = next(i for i in body["items"] if i["key"] == "similarity_threshold")
    assert threshold["value"] == 0.5                                            # back to the NEW model's calibration
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "face_engine.changed"))
    assert log.actor_account_id == me.id and (log.details["previous"], log.details["new"]) == ("sface", "outro")
    # Both thresholds depend on the model: the swap brings each back to the new model's calibration.
    assert body["history"][0]["label"] in {"Modelo de reconhecimento", "Limiar de similaridade", "Limiar da marcação institucional"}

    # Until re-indexed, the photo is not found: SFace vectors never meet the new model's query.
    app.dependency_overrides.pop(get_face_engine)
    visitor = TestClient(app)
    consent(visitor, e)
    assert search(visitor, e, person_crop()).json()["items"] == []
    assert admin.get("/api/v1/admin/parameters").json()["model"]["outdated_images"] == 1
    while reindex_next(db, storage, factory.engine_for("outro")):
        pass
    versions = set(db.scalars(select(m.FaceEmbedding.model_version).where(m.FaceEmbedding.image_id == img)))
    assert versions == {"fake-1.0"}                     # the old biometric vectors are gone (LGPD Art. 6, III)
    assert admin.get("/api/v1/admin/parameters").json()["model"]["outdated_images"] == 0


def test_a_model_that_does_not_load_never_becomes_the_one_in_use(env, db, monkeypatch):
    _other_engine(monkeypatch, "quebrado", target="tests.support:DoesNotExist")
    admin = login(make_account(db))
    r = swap(admin, "quebrado")
    assert r.status_code == 400 and r.json()["detail"].startswith("O modelo não foi trocado")
    assert factory.active_engine_name(db) == "sface"


def test_safe_failure_when_the_engine_in_use_is_gone(env, db):
    """An engine removed from the code (or a broken model file): the search pauses with a plain
    notice — never another model in its place — and the panel still opens to show why."""
    db.add(m.SystemParameter(key=factory.ACTIVE_KEY, value="removido"))
    db.flush()
    app.dependency_overrides.pop(get_face_engine)
    owner = photographer(db)
    e = make_event(db, owner, status=m.EventStatus.PUBLISHED)
    visitor = TestClient(app)
    consent(visitor, e)
    r = search(visitor, e, person_crop())
    assert r.status_code == 503 and r.json()["detail"]["reason"] == "engine_unavailable"
    assert "removido" not in r.json()["detail"]["message"]                     # technical detail stays inside
    model = login(make_account(db)).get("/api/v1/admin/parameters").json()["model"]
    assert model["version"] is None and "não existe mais" in model["error"]


def test_reindex_validation(env, db):
    admin = login(make_account(db))
    assert admin.post("/api/v1/admin/reindex", json={"scope": "model_version", "from_version": "nao-existe"}).status_code == 400
    assert admin.post("/api/v1/admin/reindex", json={"scope": "event"}).status_code == 400


# ----------------------------------------------------------------- expiry (RF006, RNF12)

def test_notice_30_days_before_then_consistent_elimination(env, db, engine):
    storage, outbox = env
    owner = photographer(db)
    e = make_event(db, owner)
    (img,) = publish_and_index(db, storage, engine, owner, e, [GROUP])
    e.cover_object_key = "covers/x.jpg"
    storage.put("covers/x.jpg", jpeg(42), "image/jpeg")
    e.expires_on = date.today() + timedelta(days=20)
    db.flush()
    assert notify_expiring(db, outbox) >= 1 and outbox.sent[-1].to == owner.email
    assert "Baixar acervo" in outbox.sent[-1].body
    sent = len(outbox.sent)
    notify_expiring(db, outbox)
    assert len(outbox.sent) == sent                                              # only once
    e.expires_on = date.today() - timedelta(days=1)
    db.flush()
    assert expire_due(db, storage, outbox) >= 1
    db.refresh(e)
    assert e.status == m.EventStatus.EXPIRED and e.cover_object_key is None
    assert db.get(m.Image, img) is None
    assert db.scalar(select(func.count()).select_from(m.FaceEmbedding).where(m.FaceEmbedding.event_id == e.id)) == 0
    assert not [k for k in storage.objects if str(e.id) in k] and "covers/x.jpg" not in storage.objects
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "event.expired", m.AuditLog.target_id == str(e.id)))
    assert log.details["images"] == 1 and log.details["vectors"] == 3               # note 7: proof kept
    assert TestClient(app).get(f"/api/v1/public/events/{e.id}").status_code == 404


def test_event_keeps_an_inactivated_theme_when_edited(env, db):
    """Found while building RF027: editing an event whose theme was inactivated must not fail
    nor drop the theme; a NEW event cannot pick it."""
    admin = login(make_account(db))
    owner = photographer(db)
    theme = db.get(m.Theme, admin.post("/api/v1/admin/themes", json={"name": f"Antigo {uuid.uuid4().hex[:4]}"}).json()["id"])
    e = make_event(db, owner)
    e.themes = [theme]
    db.flush()
    admin.post(f"/api/v1/admin/themes/{theme.id}/status", json={"active": False})
    c = login(owner)
    form = {"name": e.name, "theme_ids": [str(theme.id)], "date_precision": "day", "date_start": "2026-12-21",
            "location": "Centro Cultural", "description": "Feira"}
    assert c.put(f"/api/v1/events/{e.id}", data=form).status_code == 200
    db.refresh(e)
    assert [t.id for t in e.themes] == [theme.id]
    new = c.post("/api/v1/events", data={**form, "name": "Outro"},
                 files={"cover": ("c.jpg", jpeg(50), "image/jpeg")})
    assert new.status_code == 400


def test_a_photographer_creates_a_theme_while_filling_in_an_event(env, db):
    """Decision after the 1st committee: the tags are the photographer's — created in the event form."""
    owner = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER)
    c = login(owner)
    name = f"Robótica {uuid.uuid4().hex[:4]}"
    r = c.post("/api/v1/themes", json={"name": name, "icon": "cpu"})
    assert r.status_code == 201 and r.json()["icon"] == "cpu"
    theme = db.get(m.Theme, r.json()["id"])
    assert theme.created_by == owner.id and theme.active                       # the creator owns it
    assert name in [t["name"] for t in c.get("/api/v1/themes").json()]          # offered at once in the form
    assert c.post("/api/v1/themes", json={"name": name.upper()}).status_code == 400   # one list, no duplicates
    assert c.post("/api/v1/themes", json={"name": "Outro", "icon": "<script>"}).status_code == 400
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "theme.created", m.AuditLog.target_id == str(theme.id)))
    assert log.actor_account_id == owner.id
    assert TestClient(app).post("/api/v1/themes", json={"name": "Anônimo"}).status_code == 401
