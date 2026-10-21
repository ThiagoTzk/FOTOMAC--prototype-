"""Public area (RF013-RF019, RF023) — the privacy guarantees, proven through the real API.

RNF20 asks explicitly for tests proving "the impossibility of accessing images without a
prior search". RS001 and RS005 too.
"""
from __future__ import annotations

import time
import uuid
from datetime import date, datetime, timedelta, timezone

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api import public as public_api
from app.auth import passwords
from app.db import models as m
from app.db.session import get_session
from app.face.factory import build_engine, get_face_engine
from app.images import service as images
from app.indexing.worker import delete_due_removals, index_next
from app.main import app
from app.notifications.factory import get_email_sender
from app.storage.factory import get_storage
from tests.conftest import FIXTURES
from tests.support import FakeFaceEngine, MemoryStorage, PosedEngine, jpeg, posed


class Outbox:
    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)


@pytest.fixture(scope="module")
def engine():
    # The real YuNet + SFace; PosedEngine only shifts the face landmarks of test frames to simulate
    # the head movements of the guided capture (tests/support.py).
    return PosedEngine(build_engine("sface"))


@pytest.fixture
def env(db, engine):
    storage, outbox = MemoryStorage(), Outbox()
    for limiter in (public_api.search_limiter, public_api.download_limiter, public_api.consent_limiter,
                    public_api.removal_limiter):
        limiter.reset()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_email_sender] = lambda: outbox
    app.dependency_overrides[get_face_engine] = lambda: engine
    yield storage, outbox
    app.dependency_overrides.clear()


def photographer(db) -> m.Account:
    a = m.Account(full_name="Moacir Barbosa", email=f"{uuid.uuid4().hex[:8]}@cesmac.edu.br",
                  role=m.AccountRole.PHOTOGRAPHER, photographer_signature="Moacir Barbosa",
                  password_hash=passwords.hash_password("Fotomac#2026"), status=m.AccountStatus.ACTIVE)
    db.add(a)
    db.flush()
    return a


def make_event(db, owner, name="FeCiAL 2026 - Dia 3", status=m.EventStatus.EDITING) -> m.Event:
    e = m.Event(name=f"{name} {uuid.uuid4().hex[:4]}", date_precision=m.DatePrecision.DAY, date_start=date(2026, 12, 21),
                date_end=date(2026, 12, 21), location="Centro Cultural", description="Feira", owner_id=owner.id,
                expires_on=date(2027, 6, 21), status=status, cover_object_key=None)
    db.add(e)
    db.flush()
    return e


# Public-domain NASA photos, never CESMAC participants (tests/fixtures/README.md).
CREW = cv2.imread(str(FIXTURES / "apollo11_crew.jpg"))
GROUP = cv2.imencode(".jpg", CREW)[1].tobytes()


def person_crop() -> bytes:
    """A 'selfie' of the astronaut at the centre of the group photo (Michael Collins): similarity
    0.98 with his own face, at most 0.32 with the other two (measured with SFace)."""
    return cv2.imencode(".jpg", CREW[40:420, 450:780])[1].tobytes()


def stranger() -> bytes:
    """Someone who is NOT in the group photo (Eileen Collins): at most 0.24 with any of them."""
    return cv2.imencode(".jpg", cv2.imread(str(FIXTURES / "astronaut_eileen_collins.png")))[1].tobytes()


def publish_and_index(db, storage, engine, owner, event, photos):
    ids = [images.upload_image(db, storage, owner, event, p).id for p in photos]
    images.publish(db, storage, owner, event)
    while index_next(db, storage, engine):
        pass
    db.refresh(event)
    return ids


def consent(client, event):
    assert client.post(f"/api/v1/public/events/{event.id}/consent").status_code == 204


FRAMES_PER_STEP = 3  # the browser sends 6; 3 keep the tests fast


def search(client, event, selfie, *, order=None, still=False, sides=None):
    """A complete guided capture (RF036): asks the server for the order of the movements, then sends
    FRAMES_PER_STEP frames per step. `order` forces another order, `still` makes every frame frontal
    (a photo held to the camera), `sides` uses another photo for the movements (another person)."""
    r = client.post(f"/api/v1/public/events/{event.id}/capture")
    if r.status_code != 200:
        return r
    steps = ["frente", *(order or r.json()["order"])]
    files, labels = [], []
    for step in steps:
        frame = posed(sides if sides is not None and step != "frente" else selfie, "frente" if still else step)
        for _ in range(FRAMES_PER_STEP):
            files.append(("frames", (f"q{len(files)}.jpg", frame, "image/jpeg")))
            labels.append(step)
    return client.post(f"/api/v1/public/events/{event.id}/search", files=files, data={"steps": labels})


# ----------------------------------------------------------------- visibility (RF013, RF014)

def test_only_published_events_exist_publicly(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    editing = make_event(db, owner, "Em edição")
    published = make_event(db, owner, "Publicado")
    publish_and_index(db, storage, engine, owner, published, [GROUP])
    c = TestClient(app)
    names = [e["name"] for e in c.get("/api/v1/public/events").json()["items"]]
    assert published.name in names and editing.name not in names
    assert c.get(f"/api/v1/public/events/{editing.id}").status_code == 404     # not even by direct address
    body = c.get(f"/api/v1/public/events/{published.id}").json()
    assert body["photos"] == 1 and body["credits"] == ["Moacir Barbosa"]


def test_search_tolerates_accents_and_typos(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner, "FeCiAL Edição")
    publish_and_index(db, storage, engine, owner, e, [jpeg(1)])
    c = TestClient(app)
    for q in ("fecial", "FECIAL EDICAO", "fecil"):                              # RF013 note 1
        assert e.name in [x["name"] for x in c.get("/api/v1/public/events", params={"q": q}).json()["items"]], q


# ----------------------------------------------------------------- consent before anything (RF015, RF016 note 3)

def test_search_without_consent_is_refused_before_any_processing(env, db):
    storage, _ = env
    fake = FakeFaceEngine()
    app.dependency_overrides[get_face_engine] = lambda: fake
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, fake, owner, e, [jpeg(2)])
    calls_before = fake.calls
    r = search(TestClient(app), e, person_crop())
    assert r.status_code == 403 and r.json()["detail"]["reason"] == "consent_required"
    assert fake.calls == calls_before                                             # no vector was generated


def test_consent_record_has_no_link_to_the_person(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [jpeg(3)])
    c = TestClient(app)
    r = c.post(f"/api/v1/public/events/{e.id}/consent")
    header = r.headers["set-cookie"].lower()
    assert "httponly" in header and "path=/api/v1/public" in header
    record = db.scalar(select(m.ConsentRecord).where(m.ConsentRecord.event_id == e.id))
    assert record.text_version == public_api.service.CONSENT_VERSION
    assert set(m.ConsentRecord.__table__.columns.keys()) == {"id", "event_id", "text_version", "accepted_at"}  # RF015 note 7


# ----------------------------------------------------------------- the real search (YuNet + SFace)

def test_finds_the_person_and_not_a_stranger(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    group_id, landscape_id = publish_and_index(db, storage, engine, owner, e, [GROUP, jpeg(4, w=600, h=400)])
    c = TestClient(app)
    consent(c, e)
    found = search(c, e, person_crop())
    assert found.status_code == 200 and [i["id"] for i in found.json()["items"]] == [str(group_id)]
    assert found.json()["items"][0]["credit"] == "Fotografia por: Moacir Barbosa — Centro Universitário CESMAC"
    assert search(c, e, stranger()).json()["items"] == []                          # RS002: no third-party photo


def test_no_face_and_search_limit(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    r = search(c, e, jpeg(5, w=400, h=300))
    assert r.status_code == 422 and r.json()["detail"]["reason"] == "no_face"      # RF017 note 4
    codes = [search(c, e, jpeg(6, w=400, h=300)).status_code for _ in range(10)]
    assert codes[-1] == 429                                                        # RF016 note 8


# ----------------------------------------------------------------- guided capture and liveness (RF036, RS028)

def test_the_drawn_order_is_needed_and_used_once(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    frame = posed(person_crop(), "frente")
    files = [("frames", (f"q{n}.jpg", frame, "image/jpeg")) for n in range(6)]
    r = c.post(f"/api/v1/public/events/{e.id}/search", files=files, data={"steps": ["frente"] * 6})
    assert r.status_code == 422 and r.json()["detail"]["reason"] == "challenge"      # no order was drawn
    orders = {tuple(c.post(f"/api/v1/public/events/{e.id}/capture").json()["order"]) for _ in range(12)}
    assert len(orders) > 1 and all(sorted(o) == ["baixo", "cima", "direita", "esquerda"] for o in orders)
    assert search(c, e, person_crop()).status_code == 200
    r = c.post(f"/api/v1/public/events/{e.id}/search", files=files, data={"steps": ["frente"] * 6})
    assert r.json()["detail"]["reason"] == "challenge"                               # used once


def test_a_photo_held_to_the_camera_fails_the_liveness_check(env, db, engine):
    """RS028: a still photo cannot turn — and a recording made before cannot follow an order
    drawn now. Neither returns any photo."""
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    still = search(c, e, person_crop(), still=True)
    assert still.status_code == 422 and still.json()["detail"]["reason"] == "liveness"
    drawn = c.post(f"/api/v1/public/events/{e.id}/capture").json()["order"]
    replay = search(c, e, person_crop(), order=list(reversed(drawn)))                # a new draw is made inside
    assert replay.status_code == 422 and replay.json()["detail"]["reason"] == "liveness"
    session = db.scalar(select(m.VisitorSession).where(m.VisitorSession.event_id == e.id))
    assert session.result_ids == [] and session.capture_order is None


def test_another_persons_face_in_the_capture_is_refused(env, db, engine):
    """RF017 note 7: turning one's own head while the frontal frame shows someone else."""
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    r = search(c, e, person_crop(), sides=stranger())
    assert r.status_code == 422 and r.json()["detail"]["reason"] == "consistency"


def test_a_single_uploaded_photo_is_not_accepted(env, db, engine):
    """The gallery upload is gone (requirements v2.0): no route takes a lone photo any more."""
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    old = c.post(f"/api/v1/public/events/{e.id}/search", files={"selfie": ("eu.jpg", person_crop(), "image/jpeg")})
    assert old.status_code == 422
    c.post(f"/api/v1/public/events/{e.id}/capture")
    one = c.post(f"/api/v1/public/events/{e.id}/search", files=[("frames", ("eu.jpg", person_crop(), "image/jpeg"))],
                 data={"steps": ["frente"]})
    assert one.status_code == 422 and one.json()["detail"]["reason"] == "format"


def test_the_diagnostics_log_holds_numbers_only(env, db, engine, monkeypatch, caplog):
    """Development aid to confirm the movement convention with real faces: numbers only — no image,
    no frame, no vector (RF024 note 6). Off unless FOTOMAC_DIAGNOSTICS_LOG=true."""
    from types import SimpleNamespace
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    monkeypatch.setattr(public_api.service, "get_settings", lambda: SimpleNamespace(diagnostics_log=True))
    c = TestClient(app)
    consent(c, e)
    with caplog.at_level("INFO", logger="fotomac.liveness"):
        search(c, e, person_crop())
    (line,) = [r.getMessage() for r in caplog.records if r.name == "fotomac.liveness"]
    assert line.startswith("busca aceita") and "esquerda" in line and "mesma_pessoa" in line
    assert len(line) < 1500                                                          # no 128-number vector in it


def test_search_never_crosses_events(env, db, engine):
    """RF010 note 4 / RF016 note 1: the same person in another event is never returned."""
    storage, _ = env
    owner = photographer(db)
    a, b = make_event(db, owner, "Evento A"), make_event(db, owner, "Evento B")
    publish_and_index(db, storage, engine, owner, a, [GROUP])
    (in_b,) = publish_and_index(db, storage, engine, owner, b, [GROUP])
    c = TestClient(app)
    consent(c, a)
    ids = [i["id"] for i in search(c, a, person_crop()).json()["items"]]
    assert ids and str(in_b) not in ids
    assert search(c, b, person_crop()).status_code == 403          # the session belongs to event A only


def test_selfie_is_not_stored_anywhere(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    publish_and_index(db, storage, engine, owner, e, [GROUP])
    objects_before = set(storage.objects)
    vectors_before = db.scalar(select(func.count()).select_from(m.FaceEmbedding))
    c = TestClient(app)
    consent(c, e)
    search(c, e, person_crop())
    assert set(storage.objects) == objects_before                                   # RF016 note 4
    assert db.scalar(select(func.count()).select_from(m.FaceEmbedding)) == vectors_before
    entry = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "public.search").order_by(m.AuditLog.id.desc()))
    assert entry.actor_account_id is None and set(entry.details) == {"found", "poses"}  # aggregated, anonymous (RF024)
    assert entry.details["poses"] == 5                                              # front + the 4 movements


# ----------------------------------------------------------------- private gallery (RF014, RF019, RS001)

def test_images_are_served_only_from_this_sessions_result(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    group_id, landscape_id = publish_and_index(db, storage, engine, owner, e, [GROUP, jpeg(7, w=600, h=400)])
    nobody = TestClient(app)
    for variant in ("thumb", "preview", "download"):
        assert nobody.get(f"/api/v1/public/images/{group_id}/{variant}", follow_redirects=False).status_code == 404
    c = TestClient(app)
    consent(c, e)
    search(c, e, person_crop())
    assert c.get(f"/api/v1/public/images/{group_id}/thumb").status_code == 200
    assert c.get(f"/api/v1/public/images/{landscape_id}/thumb").status_code == 404   # same event, not in the result
    link = c.post(f"/api/v1/public/images/{group_id}/download-link").json()["url"]
    dl = c.get(link)
    original = storage.get(db.get(m.Image, group_id).object_key)
    assert dl.status_code == 200 and dl.content != original                     # a marked copy (RF019 note 9)
    assert cv2.imdecode(np.frombuffer(dl.content, np.uint8), 1).shape == cv2.imdecode(np.frombuffer(original, np.uint8), 1).shape
    assert "attachment" in dl.headers["content-disposition"] and dl.headers["cache-control"] == "no-store"
    assert c.get(f"/api/v1/public/images/{group_id}/download").status_code == 403    # no signed link, no file


# ----------------------------------------------------------------- removal (RF023)

def test_removal_takes_effect_at_once_and_deletes_after_72h(env, db, engine):
    storage, outbox = env
    owner = photographer(db)
    e = make_event(db, owner)
    (group_id,) = publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    search(c, e, person_crop())
    r = c.post(f"/api/v1/public/images/{group_id}/removal", json={"contact_email": "eu@exemplo.com"})
    assert r.status_code == 200
    assert c.get(f"/api/v1/public/images/{group_id}/thumb").status_code == 404        # out at once (note 4)
    assert search(c, e, person_crop()).json()["items"] == []
    assert {msg.to for msg in outbox.sent} >= {owner.email, "eu@exemplo.com"}         # note 5

    image = db.get(m.Image, group_id)
    image.removal_requested_at = datetime.now(timezone.utc) - timedelta(hours=73)     # deadline passed
    db.flush()
    assert delete_due_removals(db, storage, outbox) == 1                                     # automatic (note 6)
    assert db.get(m.Image, group_id) is None and not [k for k in storage.objects if str(group_id) in k]
    assert db.scalar(select(func.count()).select_from(m.FaceEmbedding).where(m.FaceEmbedding.image_id == group_id)) == 0
    req = db.scalar(select(m.RemovalRequest).where(m.RemovalRequest.event_id == e.id))
    assert req.status == m.RemovalStatus.DELETED_AUTOMATICALLY and req.contact_email is None   # note 3
    assert outbox.sent[-1].subject == "FOTOMAC — imagem removida"


def test_photographer_deletion_concludes_the_request(env, db, engine):
    storage, outbox = env
    owner = photographer(db)
    e = make_event(db, owner)
    (group_id,) = publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    search(c, e, person_crop())
    c.post(f"/api/v1/public/images/{group_id}/removal", json={"contact_email": "eu@exemplo.com", "reason": "Não quero"})
    images.delete_image(db, storage, owner, db.get(m.Image, group_id), sender=outbox)
    req = db.scalar(select(m.RemovalRequest).where(m.RemovalRequest.event_id == e.id))
    assert req.status == m.RemovalStatus.DELETED_BY_PHOTOGRAPHER and req.contact_email is None


def test_no_public_route_receives_a_file_for_removal(env, db, engine):
    """Removal by sending the downloaded file was dropped (16/10/2026): removal is asked from the
    photo itself, in the search result, which pins the exact image. A public route that accepts
    files nobody uses would only be attack surface (LGPD Art. 46) — it must not come back unnoticed."""
    r = TestClient(app).post("/api/v1/public/removal", data={"contact_email": "terceiro@exemplo.com"},
                             files={"file": ("foto.jpg", GROUP, "image/jpeg")})
    assert r.status_code in (404, 405)


def test_several_themes_combined(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    science, tech, art = (m.Theme(name=f"{n} {uuid.uuid4().hex[:4]}") for n in ("Ciência", "Tecnologia", "Arte"))
    db.add_all([science, tech, art])
    a, b, c_ = make_event(db, owner, "A"), make_event(db, owner, "B"), make_event(db, owner, "C")
    a.themes, b.themes, c_.themes = [science], [tech], [art]
    for ev, seed in ((a, 8), (b, 9), (c_, 10)):
        publish_and_index(db, storage, engine, owner, ev, [jpeg(seed)])
    names = [x["name"] for x in TestClient(app).get(
        "/api/v1/public/events", params=[("theme_id", science.id), ("theme_id", tech.id)]).json()["items"]]
    assert a.name in names and b.name in names and c_.name not in names


def test_leaving_the_event_erases_the_result(env, db, engine):
    """Thiago's report: after leaving and coming back, the photos were still there. Leaving the
    page ends the visit on the SERVER: the result and the consent are gone, and the photos are
    never kept in the browser cache (shared computers)."""
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    (group_id,) = publish_and_index(db, storage, engine, owner, e, [GROUP])
    c = TestClient(app)
    consent(c, e)
    search(c, e, person_crop())
    thumb = c.get(f"/api/v1/public/images/{group_id}/thumb")
    assert thumb.status_code == 200 and thumb.headers["cache-control"] == "no-store"
    assert c.post("/api/v1/public/session/end").status_code == 204
    assert c.get(f"/api/v1/public/images/{group_id}/thumb").status_code == 404
    assert search(c, e, person_crop()).json()["detail"]["reason"] == "consent_required"   # asks again
    assert db.scalar(select(func.count()).select_from(m.VisitorSession).where(m.VisitorSession.event_id == e.id)) == 0


def test_download_link_is_bound_to_session_image_and_time(env, db, engine):
    """RF019 note 7: signed, valid 15 min, bound to the session that asked, this image only.
    (Before, the link pointed straight to the storage and worked for anyone for 15 minutes.)"""
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    a, b = publish_and_index(db, storage, engine, owner, e, [GROUP, cv2.imencode(".jpg", cv2.flip(CREW, 1))[1].tobytes()])
    mine, other = TestClient(app), TestClient(app)
    for client in (mine, other):
        consent(client, e)
        assert len(search(client, e, person_crop()).json()["items"]) == 2
    link = mine.post(f"/api/v1/public/images/{a}/download-link").json()["url"]
    assert "8333" not in link and "X-Amz" not in link                       # no storage address
    assert mine.get(link).status_code == 200
    assert other.get(link).status_code == 403                                # another session: refused
    assert mine.get(link.replace(str(a), str(b))).status_code == 403         # another image: refused
    visit = public_api.service.get_session(db, mine.cookies.get("fotomac_visit"))
    old = public_api.service.download_token(visit, a, now=time.time() - 16 * 60)
    assert mine.get(f"/api/v1/public/images/{a}/download?t={old}").status_code == 403   # expired
