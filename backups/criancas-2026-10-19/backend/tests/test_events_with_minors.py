"""Events with minors (LGPD Art. 14): the guardians' prior authorisation is mandatory to publish
(decision of 16/10/2026); blurring faces in the file is a manual extra, never a substitute."""
from __future__ import annotations

import cv2
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import models as m
from app.images import service as images
from app.indexing.worker import index_next
from app.main import app
from tests.test_accounts import make_account
from tests.test_admin_config import engine, env, login  # noqa: F401 — shared fixtures
from tests.test_public import GROUP, make_event


def vectors(db, image_id):
    return db.scalar(select(func.count()).select_from(m.FaceEmbedding).where(m.FaceEmbedding.image_id == image_id))


def _setup(env, db, has_minors=True):
    storage, _ = env
    owner = make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER)
    e = make_event(db, owner)
    e.has_minors = has_minors
    image = images.upload_image(db, storage, owner, e, GROUP)
    db.flush()
    return storage, owner, e, image, login(owner)


def test_an_event_with_minors_is_not_published_without_the_prior_authorisation(env, db):
    storage, owner, e, image, c = _setup(env, db)
    r = c.post(f"/api/v1/events/{e.id}/publish")
    assert r.status_code == 400 and "autorização prévia" in r.json()["detail"]
    assert c.get(f"/api/v1/events/{e.id}").json()["minors_photos_pending"] == 1


def test_manual_blur_is_in_the_file_and_the_blurred_face_gives_no_vector(env, db, engine):
    storage, owner, e, image, c = _setup(env, db)
    before = storage.get(image.object_key)
    found = c.get(f"/api/v1/images/{image.id}/faces").json()
    assert len(found["faces"]) == 3 and vectors(db, image.id) == 0               # boxes only, no vector (RNF13)
    child = found["faces"][0]
    out = c.post(f"/api/v1/images/{image.id}/blur", json={"boxes": [child]}).json()
    assert out["minors_reviewed"] and out["faces_blurred"] == 1
    after = storage.get(image.object_key)
    assert after != before                                                        # the original with the face is gone
    x, y, w, h = child
    a, b = (cv2.imdecode(np.frombuffer(d, np.uint8), 1)[y:y + h, x:x + w].astype(int) for d in (before, after))
    assert np.abs(a - b).mean() > 10                                              # that face really changed
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 400            # blurring does NOT replace the authorisation
    c.post(f"/api/v1/events/{e.id}/minors-authorization", json={"reference": "Secretaria, pasta 2026/14", "declared": True})
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 200
    while index_next(db, storage, engine):
        pass
    assert vectors(db, image.id) == 2                                             # the blurred face is not indexed
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "image.faces_blurred", m.AuditLog.target_id == str(image.id)))
    assert log.details["faces"] == 1


def test_checking_every_photo_does_not_replace_the_authorisation(env, db):
    storage, owner, e, image, c = _setup(env, db)
    assert c.put(f"/api/v1/images/{image.id}/minors-check", json={"reviewed": True}).json()["minors_reviewed"]
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 400


def test_the_prior_authorisation_is_declared_with_where_it_is_kept(env, db, engine):
    storage, owner, e, image, c = _setup(env, db)
    url = f"/api/v1/events/{e.id}/minors-authorization"
    assert c.post(url, json={"reference": "Secretaria", "declared": False}).status_code == 400
    ok = c.post(url, json={"reference": "Termos assinados — Secretaria da OBR, pasta 2026/14", "declared": True}).json()
    assert ok["minors_authorized_at"] and ok["minors_authorization_ref"].startswith("Termos")
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 200            # authorised: publishes
    actions = set(db.scalars(select(m.AuditLog.action).where(m.AuditLog.target_id == str(e.id))))
    assert "event.minors_authorized" in actions
    while index_next(db, storage, engine):
        pass
    assert TestClient(app).get(f"/api/v1/public/events/{e.id}").json()["has_minors"] is True   # the visitor notice knows
    assert c.delete(url).json()["minors_authorized_at"] is None


def test_blurring_a_published_photo_removes_its_vectors_and_reindexes(env, db, engine):
    storage, owner, e, image, c = _setup(env, db, has_minors=False)
    c.post(f"/api/v1/events/{e.id}/publish")
    while index_next(db, storage, engine):
        pass
    assert vectors(db, image.id) == 3
    child = c.get(f"/api/v1/images/{image.id}/faces").json()["faces"][1]
    out = c.post(f"/api/v1/images/{image.id}/blur", json={"boxes": [child]}).json()
    assert out["indexing_status"] == "pending" and vectors(db, image.id) == 0      # out of the search at once
    while index_next(db, storage, engine):
        pass
    assert vectors(db, image.id) == 2


def test_only_whoever_manages_the_photo_blurs_it(env, db):
    storage, owner, e, image, c = _setup(env, db)
    other = login(make_account(db, "Outra Pessoa", m.AccountRole.PHOTOGRAPHER))
    assert other.post(f"/api/v1/images/{image.id}/blur", json={"boxes": [[0, 0, 10, 10]]}).status_code in (403, 404)
    assert c.post(f"/api/v1/images/{image.id}/blur", json={"boxes": [[0, 0, 99999, 10]]}).status_code == 400   # outside the photo
