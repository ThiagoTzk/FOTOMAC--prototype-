"""RF007-RF012 + RF025: upload, review, publication, facial indexing queue and packages."""
from __future__ import annotations

import io
import time
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone

import cv2
import insightface.data
import piexif
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.auth import passwords
from app.db import models as m
from app.db.session import get_session
from app.face.factory import build_engine
from app.indexing.worker import index_next
from app.main import app
from app.auth.tokens import token_hash
from app.packages.service import build_next
from app.security import signed_links
from app.security.rate_limit import login_limiter
from app.storage.factory import get_storage
from tests.support import FakeFaceEngine, MemoryStorage, jpeg

PASSWORD = "Fotomac#2026"


@pytest.fixture
def storage():
    return MemoryStorage()


def account(db, name, role=m.AccountRole.PHOTOGRAPHER) -> m.Account:
    a = m.Account(full_name=name, email=f"{uuid.uuid4().hex[:8]}@cesmac.edu.br", role=role,
                  photographer_signature=name if role == m.AccountRole.PHOTOGRAPHER else None,
                  password_hash=passwords.hash_password(PASSWORD), status=m.AccountStatus.ACTIVE)
    db.add(a)
    db.flush()
    return a


@pytest.fixture
def api(db, storage):
    login_limiter.reset()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage

    def client_for(a: m.Account) -> TestClient:
        c = TestClient(app)
        assert c.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).status_code == 200
        return c
    yield client_for
    app.dependency_overrides.clear()


@pytest.fixture
def owner(db):
    return account(db, "Moacir Barbosa")


@pytest.fixture
def event(db, owner) -> m.Event:
    e = m.Event(name=f"FECIAL {uuid.uuid4().hex[:4]}", date_precision=m.DatePrecision.DAY, date_start=date(2026, 9, 18),
                date_end=date(2026, 9, 18), location="Campus I", description="Feira", owner_id=owner.id,
                expires_on=date(2027, 3, 18))
    db.add(e)
    db.flush()
    return e


def upload(client, event, data, name="foto.jpg"):
    return client.post(f"/api/v1/events/{event.id}/images", files={"file": (name, data, "image/jpeg")})


def images_of(db, event):
    return db.scalars(select(m.Image).where(m.Image.event_id == event.id)).all()


# ----------------------------------------------------------------- upload (RF007, RF008)

def test_upload_stores_original_with_credit_and_without_gps(api, owner, event, storage, db):
    r = upload(api(owner), event, jpeg(1, gps=True))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["review_status"] == "in_review" and body["indexing_status"] == "not_queued"     # RF007 note 8
    assert body["credit"] == "Fotografia por: Moacir Barbosa — Centro Universitário CESMAC"
    image = db.get(m.Image, uuid.UUID(body["id"]))
    original = storage.get(image.object_key)
    exif = piexif.load(original)
    assert not exif["GPS"]                                                                    # RF007 note 11
    assert exif["0th"][piexif.ImageIFD.Artist] == b"Moacir Barbosa"                           # RF019 note 6
    assert {image.thumb_key, image.preview_key} <= set(storage.objects)


@pytest.mark.parametrize("data,reason", [
    (b"\x89PNG\r\n\x1a\n" + b"0" * 100, "format"),
    (b"\xff\xd8\xff\xe0" + b"garbage" * 50, "corrupted"),
    (b"\xff\xd8\xff" + b"0" * (25 * 1024 * 1024), "too_large"),
])
def test_rejected_files_carry_the_reason(api, owner, event, data, reason):
    r = upload(api(owner), event, data)
    assert r.status_code == 400 and r.json()["detail"]["reason"] == reason
    assert "\\" not in r.json()["detail"]["message"]          # plain Portuguese, no internals (RF008 note 4)


def test_duplicate_is_detected_before_and_on_upload(api, owner, event):
    c = api(owner)
    data = jpeg(2)
    assert upload(c, event, data).status_code == 201
    import hashlib
    check = c.post(f"/api/v1/events/{event.id}/images/check", json={"checksums": [hashlib.sha256(data).hexdigest(), "0" * 64]})
    assert check.json()["existing"] == [hashlib.sha256(data).hexdigest()]
    again = upload(c, event, data)
    assert again.status_code == 409 and again.json()["detail"]["reason"] == "duplicate"   # RF007 note 10


def test_image_ids_are_random_not_sequential(api, owner, event):
    c = api(owner)
    a, b = upload(c, event, jpeg(3)).json()["id"], upload(c, event, jpeg(4)).json()["id"]
    assert uuid.UUID(a).version == 4 and uuid.UUID(b).version == 4                        # RF007 note 6


# ----------------------------------------------------------------- collaboration (RF025)

def test_collaborator_rules(api, db, owner, event):
    ana = account(db, "Ana Souza")
    c_ana, c_owner = api(ana), api(owner)
    assert upload(c_ana, event, jpeg(5)).status_code == 404                     # event not even visible
    event.collaboration_open = True
    db.flush()
    mine = upload(c_ana, event, jpeg(6)).json()
    assert mine["credit"].startswith("Fotografia por: Ana Souza")              # individual credit
    owners = upload(c_owner, event, jpeg(7)).json()
    assert c_ana.post(f"/api/v1/images/{owners['id']}/discard").status_code == 403      # not her work
    assert c_ana.post(f"/api/v1/images/{mine['id']}/discard").json()["review_status"] == "discarded"
    assert c_ana.post(f"/api/v1/events/{event.id}/publish").status_code == 403           # RF009 note 5
    batch = c_ana.post(f"/api/v1/events/{event.id}/images/delete", json={"ids": [owners["id"]]}).json()
    assert batch == {"deleted": 0, "refused": 1}


# ----------------------------------------------------------------- publication (RF009, RNF13)

def test_publication_deletes_discarded_and_queues_only_published(api, db, owner, event, storage):
    c = api(owner)
    keep = upload(c, event, jpeg(8)).json()["id"]
    drop = upload(c, event, jpeg(9)).json()["id"]
    c.post(f"/api/v1/images/{drop}/discard")
    dropped_keys = {k for k in storage.objects if drop in k}
    assert dropped_keys

    # Before publishing: the queue is empty, nothing is indexed (RNF13).
    assert index_next(db, storage, FakeFaceEngine()) is False

    r = c.post(f"/api/v1/events/{event.id}/publish")
    assert r.json() == {"sent": 2, "discarded": 1, "published": 1}
    assert not dropped_keys & set(storage.objects)                    # definitive with publication (RF009 note 6)
    assert db.get(m.Image, uuid.UUID(drop)) is None
    kept = db.get(m.Image, uuid.UUID(keep))
    assert kept.review_status == m.ImageReviewStatus.PUBLISHED and kept.indexing_status == m.ImageIndexingStatus.PENDING
    db.refresh(event)
    assert event.status == m.EventStatus.PROCESSING                   # RF006 note 2
    assert db.scalar(select(m.AuditLog).where(m.AuditLog.action == "event.publish")).details["publicadas"] == 1


def test_queue_indexes_and_publishes_the_event(api, db, owner, event, storage):
    c = api(owner)
    for seed in (10, 11):
        upload(c, event, jpeg(seed))
    c.post(f"/api/v1/events/{event.id}/publish")
    engine = FakeFaceEngine(faces=3)
    assert index_next(db, storage, engine) and index_next(db, storage, engine)
    assert index_next(db, storage, engine) is False
    status = c.get(f"/api/v1/events/{event.id}/processing").json()
    assert status["processed"] == 2 and status["faces"] == 6 and status["percent"] == 100
    db.refresh(event)
    assert event.status == m.EventStatus.PUBLISHED
    rows = db.scalars(select(m.FaceEmbedding).where(m.FaceEmbedding.event_id == event.id)).all()
    assert {r.model_version for r in rows} == {"fake-1.0"}            # RF010 note 7


def test_failures_retry_three_times_then_fail_without_stopping_the_queue(api, db, owner, event, storage):
    c = api(owner)
    bad = upload(c, event, jpeg(12)).json()["id"]
    c.post(f"/api/v1/events/{event.id}/publish")
    broken = FakeFaceEngine(error=RuntimeError("modelo indisponível"))
    for attempt in range(3):
        image = db.get(m.Image, uuid.UUID(bad))
        image.next_attempt_at = None                                  # skip the progressive wait in the test
        db.flush()
        assert index_next(db, storage, broken)
    image = db.get(m.Image, uuid.UUID(bad))
    assert image.indexing_status == m.ImageIndexingStatus.FAILED and image.indexing_attempts == 3
    assert image.last_error == "RuntimeError"                         # class name only, no content
    db.refresh(event)
    assert event.status == m.EventStatus.PUBLISHED                    # the event is not stuck


def test_real_insightface_indexes_the_group_photo(api, db, owner, event):
    """End to end with the REAL model (via the real SeaweedFS-free path): 6 faces → 6 vectors."""
    storage = MemoryStorage()
    app.dependency_overrides[get_storage] = lambda: storage
    c = api(owner)
    photo = cv2.imencode(".jpg", insightface.data.get_image("t1"))[1].tobytes()
    upload(c, event, photo)
    c.post(f"/api/v1/events/{event.id}/publish")
    assert index_next(db, storage, build_engine("insightface"))
    image = images_of(db, event)[0]
    assert image.indexing_status == m.ImageIndexingStatus.PROCESSED and image.faces_count == 6
    assert image.indexing_model_version.startswith("insightface-1.0.1/buffalo_l")


def test_deleting_a_published_image_removes_files_and_vectors(api, db, owner, event, storage):
    c = api(owner)
    image_id = upload(c, event, jpeg(13)).json()["id"]
    c.post(f"/api/v1/events/{event.id}/publish")
    index_next(db, storage, FakeFaceEngine(faces=2))
    assert c.delete(f"/api/v1/images/{image_id}").status_code == 204
    assert not [k for k in storage.objects if image_id in k]
    assert db.scalar(select(func.count()).select_from(m.FaceEmbedding).where(
        m.FaceEmbedding.image_id == uuid.UUID(image_id))) == 0       # RF011 note 4


def test_reprocess_limit(api, db, owner, event, storage):
    c = api(owner)
    image_id = upload(c, event, jpeg(14)).json()["id"]
    c.post(f"/api/v1/events/{event.id}/publish")
    index_next(db, storage, FakeFaceEngine())
    codes = [c.post(f"/api/v1/images/{image_id}/reprocess").status_code for _ in range(4)]
    assert codes == [200, 200, 200, 400]                              # RF011 note 5


def test_replace_file_only_before_publication(api, owner, event):
    c = api(owner)
    image_id = upload(c, event, jpeg(15)).json()["id"]
    r = c.put(f"/api/v1/images/{image_id}/file", files={"file": ("editada.jpg", jpeg(16), "image/jpeg")})
    assert r.status_code == 200
    c.post(f"/api/v1/events/{event.id}/publish")
    late = c.put(f"/api/v1/images/{image_id}/file", files={"file": ("x.jpg", jpeg(17), "image/jpeg")})
    assert late.status_code == 400


def test_thumbnails_require_a_session(api, owner, event):
    image_id = upload(api(owner), event, jpeg(18)).json()["id"]
    assert TestClient(app).get(f"/api/v1/images/{image_id}/thumb", follow_redirects=False).status_code == 401
    r = api(owner).get(f"/api/v1/images/{image_id}/thumb")
    assert r.status_code == 200 and r.content[:3] == b"\xff\xd8\xff"
    assert r.headers["cache-control"] == "private, max-age=600"     # browser-only cache, stable address


# ----------------------------------------------------------------- packages (RF012)

def test_full_package_and_collaborator_package(api, db, owner, event, storage):
    ana = account(db, "Ana Souza")
    event.collaboration_open = True
    db.flush()
    c_owner, c_ana = api(owner), api(ana)
    upload(c_owner, event, jpeg(20))
    upload(c_owner, event, jpeg(21))
    upload(c_ana, event, jpeg(22))
    c_owner.post(f"/api/v1/events/{event.id}/publish")

    assert c_owner.get(f"/api/v1/events/{event.id}/package/estimate").json()["images"] == 3
    full = c_owner.post(f"/api/v1/events/{event.id}/package").json()
    own = c_ana.post(f"/api/v1/events/{event.id}/package").json()
    assert own["only_own"] is True and own["file_name"].endswith("- Ana Souza.zip")
    assert build_next(db, storage) and build_next(db, storage)

    job = db.get(m.PackageJob, uuid.UUID(full["id"]))
    names = zipfile.ZipFile(io.BytesIO(storage.get(job.object_key))).namelist()
    assert len(names) == 3 and len({n.split("/")[0] for n in names}) == 1     # one folder (RF012 note 3)
    assert names[0].split("/")[0] == event.name
    ana_job = db.get(m.PackageJob, uuid.UUID(own["id"]))
    assert len(zipfile.ZipFile(io.BytesIO(storage.get(ana_job.object_key))).namelist()) == 1

    # RF012 note 5: signed link, 30 min, only for the account (and login session) that asked.
    link = c_owner.post(f"/api/v1/packages/{full['id']}/download-link").json()["url"]
    assert "storage" not in link and "X-Amz" not in link
    got = c_owner.get(link)
    assert got.status_code == 200 and got.content == storage.get(job.object_key)       # streamed through the API
    assert "attachment" in got.headers["content-disposition"]
    assert c_owner.get(f"/api/v1/packages/{full['id']}/download").status_code == 403   # without the signed link
    assert c_ana.post(f"/api/v1/packages/{full['id']}/download-link").status_code == 403
    assert c_ana.get(link).status_code == 403                                          # another account
    owner_hash = token_hash(c_owner.cookies.get("fotomac_session"))
    old = signed_links.sign(owner_hash, f"package:{full['id']}", 30 * 60, now=time.time() - 31 * 60)
    assert c_owner.get(f"/api/v1/packages/{full['id']}/download?t={old}").status_code == 403   # expired
    actions = db.scalars(select(m.AuditLog.action).where(m.AuditLog.action.like("package.%"))).all()
    assert actions.count("package.request") == 2 and "package.download" in actions   # RF012 note 6
