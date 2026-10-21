"""Deleting an event with a grace period to undo it (decision of 17/10/2026)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import models as m
from app.events import deletion
from app.indexing.worker import finish_events, index_next
from app.main import app
from tests.support import FakeFaceEngine, jpeg
from tests.test_profiles_v2 import account, env, login  # noqa: F401  (env is a fixture)
from tests.test_public import make_event, publish_and_index


def vectors(db, event):
    return db.scalar(select(func.count()).select_from(m.FaceEmbedding).where(m.FaceEmbedding.event_id == event.id))


def published_event(db, storage, owner):
    e = make_event(db, owner, "Evento para excluir")
    engine = FakeFaceEngine()
    publish_and_index(db, storage, engine, owner, e, [jpeg(50, w=400, h=300), jpeg(51, w=400, h=300)])
    finish_events(db)
    db.refresh(e)
    assert e.status == m.EventStatus.PUBLISHED and vectors(db, e) == 4
    return e, engine


def test_deleting_takes_the_event_off_the_site_and_erases_the_vectors_at_once(env, db):
    storage, _ = env
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    e, _ = published_event(db, storage, owner)
    other = account(db, m.AccountRole.PHOTOGRAPHER, "Outro Fotografo")
    assert login(other).post(f"/api/v1/events/{e.id}/deletion").status_code in (403, 404)
    c = login(owner)
    r = c.post(f"/api/v1/events/{e.id}/deletion")
    assert r.status_code == 200 and r.json()["deletion_due_at"]
    due = datetime.fromisoformat(r.json()["deletion_due_at"])
    assert timedelta(days=6, hours=23) < due - datetime.now(timezone.utc) <= timedelta(days=7)   # default grace
    assert vectors(db, e) == 0                                                    # sensitive data: now
    db.refresh(e)
    assert e.status == m.EventStatus.EDITING                                      # unpublished, not "Publicado"
    assert {i.review_status for i in db.scalars(select(m.Image).where(m.Image.event_id == e.id))} == {
        m.ImageReviewStatus.IN_REVIEW}
    public = TestClient(app)
    assert e.name not in [x["name"] for x in public.get("/api/v1/public/events").json()["items"]]
    assert public.get(f"/api/v1/public/events/{e.id}").status_code == 404
    assert c.post(f"/api/v1/events/{e.id}/images", files={"file": ("f.jpg", jpeg(52), "image/jpeg")}).status_code == 403
    assert c.post(f"/api/v1/events/{e.id}/publish").status_code == 400
    assert len([k for k in storage.objects if str(e.id) in k]) >= 6                # the photos are still kept
    assert c.post(f"/api/v1/events/{e.id}/deletion").status_code == 400           # asked once
    # Audit M4: frozen on the SERVER while the deletion is scheduled, not only hidden on screen.
    assert c.put(f"/api/v1/events/{e.id}/collaboration", json={"open": True}).status_code == 400
    form = {"name": "Outro nome", "theme_ids": [str(db.scalar(select(m.Theme.id).limit(1)))], "date_precision": "day",
            "date_start": "2026-12-21", "location": "Centro", "description": "Feira"}
    assert c.put(f"/api/v1/events/{e.id}", data=form).status_code == 400
    assert c.post(f"/api/v1/events/{e.id}/minors-authorization", json={"reference": "Arquivo da escola", "declared": True}).status_code == 400


def test_undoing_leaves_the_event_unpublished_until_published_again(env, db):
    """Thiago's decision (17/10/2026): undoing does not put the event back on the site by itself — the
    responsible may still remove images, then publishes again, which re-indexes."""
    storage, _ = env
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    e, engine = published_event(db, storage, owner)
    c = login(owner)
    c.post(f"/api/v1/events/{e.id}/deletion")
    r = c.delete(f"/api/v1/events/{e.id}/deletion")
    assert r.status_code == 200 and r.json()["deletion_due_at"] is None and r.json()["status"] == "editing"
    assert r.json()["published"] == 0 and r.json()["photos"] == 2
    assert not index_next(db, storage, engine)                                    # nothing re-indexes by itself
    assert TestClient(app).get(f"/api/v1/public/events/{e.id}").status_code == 404
    assert c.post(f"/api/v1/events/{e.id}/publish").json()["published"] == 2
    while index_next(db, storage, engine):
        pass
    finish_events(db)
    db.refresh(e)
    assert e.status == m.EventStatus.PUBLISHED and vectors(db, e) == 4
    assert {a for a in db.scalars(select(m.AuditLog.action).where(m.AuditLog.target_id == str(e.id)))} >= {
        "event.deletion_requested", "event.deletion_cancelled"}


def test_at_the_end_of_the_period_everything_is_eliminated(env, db):
    storage, outbox = env
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    e, _ = published_event(db, storage, owner)
    assert TestClient(app).post(f"/api/v1/public/events/{e.id}/consent").status_code == 204
    event_id, name = e.id, e.name
    login(owner).post(f"/api/v1/events/{e.id}/deletion")
    assert deletion.delete_due(db, storage, outbox) == 0                          # not yet
    e.deletion_due_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    assert deletion.delete_due(db, storage, outbox) == 1
    assert db.get(m.Event, event_id) is None
    assert not [k for k in storage.objects if str(event_id) in k]                 # files, copies and cover
    assert db.scalar(select(func.count()).select_from(m.Image).where(m.Image.event_id == event_id)) == 0
    assert db.scalar(select(func.count()).select_from(m.ConsentRecord).where(m.ConsentRecord.event_id.is_(None))) >= 1
    log = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "event.deleted", m.AuditLog.target_id == str(event_id)))
    assert log.details["name"] == name and log.details["images"] == 2


def test_the_bell_tells_who_answers_for_the_event_and_nobody_else(env, db):
    """17/10/2026: the bell works. A scheduled deletion and the photos ready to publish appear to the
    responsible; another photographer sees nothing about an event that is not theirs."""
    storage, _ = env
    owner = account(db, m.AccountRole.PHOTOGRAPHER, "Moacir Barbosa")
    e, _ = published_event(db, storage, owner)
    c = login(owner)
    c.post(f"/api/v1/events/{e.id}/images", files={"file": ("n.jpg", jpeg(53), "image/jpeg")})
    kinds = {n["kind"]: n for n in c.get("/api/v1/notifications").json()["items"]}
    assert kinds["ready"]["urgent"] is False and kinds["ready"]["href"].endswith("filtro=in_review")
    c.post(f"/api/v1/events/{e.id}/deletion")
    bell = c.get("/api/v1/notifications").json()
    assert [n["kind"] for n in bell["items"]] == ["deletion"] and bell["urgent"] == 1
    other = login(account(db, m.AccountRole.PHOTOGRAPHER, "Outro Fotografo"))
    assert other.get("/api/v1/notifications").json() == {"items": [], "urgent": 0}
    assert TestClient(app).get("/api/v1/notifications").status_code == 401
