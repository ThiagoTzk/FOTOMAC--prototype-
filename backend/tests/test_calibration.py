"""Quality test of facial recognition in the panel — fotomac-lab's Test 1 inside the system."""
from __future__ import annotations

from datetime import timedelta

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.calibration import poses, service
from app.calibration.metrics import Row, evaluate
from app.db import models as m
from app.face import factory
from app.main import app
from tests.support import jpeg
from tests.test_accounts import make_account
from tests.test_admin_config import engine, env, login, swap  # noqa: F401 — shared fixtures
from tests.test_public import CREW, GROUP, make_event, person_crop, photographer, publish_and_index, stranger


# ----------------------------------------------------------------- metrics (the lab's formulas)

def test_score_is_the_best_f1_and_the_threshold_only_picks_the_operating_point():
    rows = [Row(0.9, True), Row(0.6, True), Row(0.5, False), Row(0.4, True), Row(0.2, False), Row(None, True)]
    a, b = evaluate(rows, 0.30), evaluate(rows, 0.70)
    assert a["score"] == b["score"]                          # the threshold does not change the score
    best = a["model"]["best"]
    # Cut 0.4: 3 found, 1 wrong, 1 lost in detection → P 3/4, R 3/4, F1 0.75.
    assert (best["threshold"], best["found"], best["wrong"], best["missed"]) == (0.4, 3, 1, 1) and a["score"] == 75.0
    assert a["model"]["lost_in_detection"] == 1               # a photo without a detected face is a miss
    assert a["model"]["intruders"] == 1 and a["model"]["auc"] == pytest.approx(5 / 6)
    assert a["model"]["map"] == pytest.approx((1 + 1 + 3 / 4) / 4)   # divided by ALL expected hits
    assert (b["model"]["at_threshold"]["found"], b["model"]["at_threshold"]["wrong"]) == (1, 0)


def test_wrong_face_is_an_error_for_the_model_and_a_hit_for_the_product():
    rows = [Row(0.9, True), Row(0.8, True, wrong_face=True), Row(0.1, False)]
    e = evaluate(rows, 0.3)
    assert e["model"]["expected"] == 1 and e["product"]["expected"] == 2
    assert e["score"] == 100.0 and e["score_product"] == 100.0
    assert e["model"]["intruders"] == 0                      # the wrong face (0.8) stays below the worst hit (0.9)
    assert e["wrong_face"] == 1


def test_nothing_marked_means_no_score():
    assert evaluate([], 0.3)["score"] is None


# ----------------------------------------------------------------- the bench, through the API

def _run_all(db, storage):
    while service.run_next(db, storage):
        pass


@pytest.fixture
def bench(env, db, engine):
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)
    flipped = cv2.imencode(".jpg", cv2.flip(CREW, 1))[1].tobytes()
    ids = publish_and_index(db, storage, engine, owner, e, [GROUP, flipped, stranger(), jpeg(91, w=600, h=400)])
    me = make_account(db)
    return storage, e, ids, me, login(me)


def create(c, event, consent=True, label="Teste 2"):
    return c.post("/api/v1/admin/quality-tests", data={"event_id": str(event.id), "label": label, "consent": str(consent).lower()},
                  files=[("photos", ("consulta.jpg", person_crop(), "image/jpeg"))])


def test_only_with_consent_and_only_admins(bench, db):
    storage, e, _, _, admin = bench
    r = create(admin, e, consent=False)
    assert r.status_code == 400 and "autorizou" in r.json()["detail"]                 # LGPD Art. 11, I
    p = login(make_account(db, "Moacir Barbosa", m.AccountRole.PHOTOGRAPHER))
    assert p.get("/api/v1/admin/quality-tests").status_code == 403
    assert create(p, e).status_code == 403


def test_full_test_compares_engines_scores_and_forgets_on_close(bench, db):
    storage, e, ids, me, admin = bench
    group, flipped, other, landscape = (str(i) for i in ids)
    test_id = create(admin, e).json()["id"]
    test = db.get(m.RecognitionTest, test_id)
    assert storage.get(test.query_key)                                                 # kept while open
    assert admin.post(f"/api/v1/admin/quality-tests/{test_id}/runs", json={"engine": "insightface"}).status_code == 201
    assert admin.post(f"/api/v1/admin/quality-tests/{test_id}/runs", json={"engine": "sface"}).status_code == 400  # already there
    _run_all(db, storage)

    body = admin.get(f"/api/v1/admin/quality-tests/{test_id}").json()
    runs = {r["engine_key"]: r for r in body["runs"]}
    assert set(runs) == {"sface", "insightface"} and all(r["status"] == "done" for r in runs.values())
    assert runs["insightface"]["reference_only"] and runs["insightface"]["lab_score"] == 97.6
    assert runs["sface"]["index_s_per_photo"] > 0 and runs["sface"]["search_ms"] is not None
    assert runs["sface"]["faces"] == 7                                                 # 3 + 3 astronauts + Eileen
    items = {i["id"]: i for i in body["items"]}
    assert items[landscape]["scores"] == {}                                            # no face, no score
    assert runs["sface"]["result"]["score"] is None                                    # nothing marked yet

    for image, mark in ((group, "present"), (flipped, "present"), (other, "absent"), (landscape, "absent")):
        r = admin.put(f"/api/v1/admin/quality-tests/{test_id}/marks/{image}", json={"mark": mark})
    scores = {x["engine_key"]: x["result"]["score"] for x in r.json()["runs"]}
    assert scores == {"sface": 100.0, "insightface": 100.0}                            # Collins found in both, Eileen not

    sface_run = runs["sface"]["run_id"]
    # The best-scoring photo matched someone else's face: for the model that is an error ABOVE the real hit.
    r = admin.put(f"/api/v1/admin/quality-tests/{test_id}/runs/{sface_run}/wrong-face/{group}", json={"wrong": True})
    sface = next(x for x in r.json()["runs"] if x["engine_key"] == "sface")["result"]
    assert sface["score"] == 66.7 and sface["score_product"] == 100.0                  # model vs product reading

    assert admin.post(f"/api/v1/admin/quality-tests/{test_id}/close").status_code == 200
    db.expire_all()
    assert test.query_key is None and test.closed_at is not None
    for table in (m.RecognitionTestMark, m.RecognitionRunScore):                       # LGPD Art. 6, III
        assert db.scalar(select(func.count()).select_from(table)) == 0
    assert not [k for k in storage.objects if k.startswith("calibration/")]
    after = admin.get(f"/api/v1/admin/quality-tests/{test_id}").json()
    assert after["items"] == [] and {r["engine_key"]: r["result"]["score"] for r in after["runs"]}["insightface"] == 100.0
    kept = db.scalar(select(m.RecognitionRun.result).where(m.RecognitionRun.engine_key == "sface"))
    assert "image" not in str(kept)                                                    # no photo id in the kept result
    actions = set(db.scalars(select(m.AuditLog.action).where(m.AuditLog.target_id == str(test_id))))
    assert {"calibration.test_created", "calibration.run_requested", "calibration.test_closed"} <= actions


def test_a_run_with_no_face_in_the_query_fails_with_a_clear_message(bench, db):
    storage, e, _, _, admin = bench
    r = admin.post("/api/v1/admin/quality-tests", data={"event_id": str(e.id), "label": "Sem rosto", "consent": "true"},
                   files=[("photos", ("x.jpg", jpeg(92, w=400, h=300), "image/jpeg"))])
    _run_all(db, storage)
    run = admin.get(f"/api/v1/admin/quality-tests/{r.json()['id']}").json()["runs"][0]
    assert run["status"] == "failed" and run["error"].startswith("Foto de consulta")


def test_forgotten_tests_are_closed_by_the_system(bench, db):
    storage, e, _, _, admin = bench
    test = db.get(m.RecognitionTest, create(admin, e).json()["id"])
    test.created_at = test.created_at - timedelta(days=31)
    db.flush()
    assert service.close_stale(db, storage) == 1
    assert test.closed_at is not None and test.query_key is None


def test_insightface_is_only_a_yardstick(env, db):
    admin = login(make_account(db))
    r = swap(admin, "insightface")
    assert r.status_code == 400 and "só de comparação" in r.json()["detail"]
    assert factory.active_engine_name(db) == "sface"


# ----------------------------------------------------------------- several poses (short video / photos)

def test_pose_selection_keeps_one_sharp_frame_per_pose():
    F = poses.Frame
    frames = [F(0, 0.01, 0.50, 100, 0.9), F(1, 0.02, 0.51, 5, 0.9),     # front; a blurred twin
              F(2, -0.40, 0.50, 90, 0.9), F(3, 0.35, 0.49, 95, 0.9),    # both sides
              F(4, 0.0, 0.38, 80, 0.9), F(5, 0.0, 0.62, 85, 0.9),       # up, down
              F(6, -0.20, 0.50, 99, 0.9), None, F(8, 0.9, 0.5, 100, 0.3)]  # a milder side; no face; doubtful face
    assert poses.select(frames) == [(0, "frente"), (2, "lado 1"), (3, "lado 2"), (4, "cima"), (5, "baixo")]
    assert poses.select([F(0, 0.0, 0.5, 50, 0.9)]) == [(0, "frente")]     # a still face: one pose only
    # Measured on a still video (16/10/2026): turn 0.055–0.131, tilt 0.60–0.67 — noise, not poses.
    still = [F(i, 0.055 + 0.076 * (i % 5) / 4, 0.60 + 0.069 * (i % 3) / 2, 140, 0.92) for i in range(40)]
    assert poses.select(still) == [(poses.select(still)[0][0], "frente")]
    assert poses.select([None, None]) == []


def test_video_frames_keep_only_the_chosen_poses_and_score_three_views(bench, db, monkeypatch):
    storage, e, ids, me, admin = bench
    # The astronaut faces are all frontal, so the pose READING is fixed here (it is tested above with
    # controlled numbers): frame 1 counts as a side pose, frame 2 is blurred, frame 3 has no face.
    readings = {0: (0.0, 0.5, 200), 1: (-0.3, 0.5, 190), 2: (0.0, 0.5, 3)}
    monkeypatch.setattr(service.poses, "describe", lambda engine, n, img: (
        poses.Frame(n, readings[n][0], readings[n][1], readings[n][2], 0.9) if n in readings else None))
    crop = cv2.imdecode(np.frombuffer(person_crop(), np.uint8), 1)
    frames = [person_crop(), cv2.imencode(".jpg", cv2.flip(crop, 1))[1].tobytes(),
              cv2.imencode(".jpg", cv2.GaussianBlur(crop, (0, 0), 6))[1].tobytes(), jpeg(93, w=300, h=300)]
    r = admin.post("/api/v1/admin/quality-tests", data={"event_id": str(e.id), "label": "Vídeo", "consent": "true"},
                   files=[("photos", (f"q{n}.jpg", f, "image/jpeg")) for n, f in enumerate(frames)])
    assert r.status_code == 201, r.text
    test = db.get(m.RecognitionTest, r.json()["id"])
    kept = [k for k in storage.objects if k.startswith(f"calibration/{test.id}/")]
    assert test.query_poses == ["frente", "lado 1"] and len(kept) == 2                 # the other frames are dropped
    assert admin.get(f"/api/v1/admin/quality-tests/{test.id}/query/0").status_code == 200
    _run_all(db, storage)
    body = admin.get(f"/api/v1/admin/quality-tests/{test.id}").json()
    assert [x["view"] for x in body["runs"]] == ["single", "max", "mean"]
    group = str(ids[0])
    admin.put(f"/api/v1/admin/quality-tests/{test.id}/marks/{group}", json={"mark": "present"})
    out = admin.put(f"/api/v1/admin/quality-tests/{test.id}/marks/{ids[2]}", json={"mark": "absent"}).json()["runs"]
    assert all(x["result"]["score"] == 100.0 for x in out)                   # Collins found, Eileen not, in every view
    assert admin.post(f"/api/v1/admin/quality-tests/{test.id}/close").status_code == 200
    assert not [k for k in storage.objects if k.startswith(f"calibration/{test.id}/")]
    closed = admin.get(f"/api/v1/admin/quality-tests/{test.id}").json()["runs"]
    assert all(x["result"]["score"] == 100.0 for x in closed)                # kept per view after closing


# ----------------------------------------------------------------- guided recording: liveness

def _guided(moves):
    """Frames of a guided recording: 4 facing the camera, then 4 per asked movement."""
    F, frames, steps = poses.Frame, [], []
    for step, (yaw, pitch) in [("frente", (0.10, 0.60))] + moves:
        for k in range(4):
            frames.append(F(len(frames), 0.10 + (yaw - 0.10) * k / 3, 0.60 + (pitch - 0.60) * k / 3, 150, 0.92))
            steps.append(step)
    return frames, steps


def test_a_head_that_follows_the_asked_order_passes():
    frames, steps = _guided([("direita", (-0.25, 0.60)), ("cima", (0.10, 0.48)), ("esquerda", (0.45, 0.60)), ("baixo", (0.10, 0.75))])
    chosen, live = poses.select_guided(frames, steps)
    assert live["passed"] and live["order"] == ["direita", "cima", "esquerda", "baixo"] and not live["inverted"]
    assert [label for _, label in chosen] == ["frente", "direita", "cima", "esquerda", "baixo"]


def test_a_still_face_like_a_photo_on_a_phone_fails():
    frames, steps = _guided([("esquerda", (0.12, 0.61)), ("direita", (0.08, 0.59)), ("cima", (0.11, 0.62)), ("baixo", (0.09, 0.60))])
    chosen, live = poses.select_guided(frames, steps)
    assert not live["passed"] and not any(s["ok"] for s in live["steps"]) and [l for _, l in chosen] == ["frente"]


def test_a_weak_nod_does_not_fail_a_real_face():
    """Real captures (17/10/2026): turns of 0.25-0.46, nods of only 0.03-0.10. The turns decide; a nod too
    small to measure is not counted as a pose, but does not fail the person."""
    frames, steps = _guided([("esquerda", (0.42, 0.60)), ("direita", (-0.20, 0.60)), ("baixo", (0.10, 0.65)), ("cima", (0.10, 0.57))])
    chosen, live = poses.select_guided(frames, steps)
    assert live["passed"] and [label for _, label in chosen] == ["frente", "esquerda", "direita"]
    assert [s["ok"] for s in live["steps"] if not s["required"]] == [False, False]


def test_a_turn_too_small_fails_even_with_good_nods():
    frames, steps = _guided([("esquerda", (0.42, 0.60)), ("direita", (0.02, 0.60)), ("cima", (0.10, 0.45)), ("baixo", (0.10, 0.78))])
    _, live = poses.select_guided(frames, steps)
    assert not live["passed"]


def test_moves_all_in_the_opposite_direction_are_flagged_as_inverted():
    frames, steps = _guided([("esquerda", (-0.25, 0.60)), ("direita", (0.40, 0.60)), ("cima", (0.10, 0.75)), ("baixo", (0.10, 0.48))])
    _, live = poses.select_guided(frames, steps)
    assert not live["passed"] and live["inverted"]          # a sign convention to fix, not a fake


def test_guided_recording_through_the_api_keeps_the_liveness_report(bench, db, monkeypatch):
    storage, e, ids, me, admin = bench
    frames, steps = _guided([("esquerda", (0.45, 0.60)), ("direita", (-0.25, 0.60)), ("cima", (0.10, 0.48)), ("baixo", (0.10, 0.75))])
    monkeypatch.setattr(service.poses, "describe", lambda engine, n, img: frames[n])
    r = admin.post("/api/v1/admin/quality-tests", data={"event_id": str(e.id), "label": "Guiado", "consent": "true", "steps": steps},
                   files=[("photos", (f"q{n}.jpg", person_crop(), "image/jpeg")) for n in range(len(steps))])
    assert r.status_code == 201, r.text
    body = admin.get(f"/api/v1/admin/quality-tests/{r.json()['id']}").json()
    assert body["query_liveness"]["passed"] and body["query_poses"] == ["frente", "esquerda", "direita", "cima", "baixo"]
    bad = admin.post("/api/v1/admin/quality-tests", data={"event_id": str(e.id), "label": "Guiado", "consent": "true", "steps": ["pulo"]},
                     files=[("photos", ("q.jpg", person_crop(), "image/jpeg"))])
    assert bad.status_code == 400


def test_discarding_while_a_run_is_in_progress_works_and_can_be_repeated(bench, db):
    """Regression (16/10/2026): a discard during a run's start deadlocked with the worker."""
    storage, e, _, _, admin = bench
    test_id = create(admin, e).json()["id"]
    assert service.run_next(db, storage)                                  # the run started: engine + query in memory
    assert service._LIVE
    assert admin.delete(f"/api/v1/admin/quality-tests/{test_id}").status_code == 204
    assert not service._LIVE and db.get(m.RecognitionTest, test_id) is None
    assert not service.run_next(db, storage)                              # nothing left for the worker


def test_refuses_unpublished_photos(env, db):
    """Requirements v2.0, RF029 note 2: the precision test never processes a photo still in review (RNF13)."""
    storage, _ = env
    owner = photographer(db)
    e = make_event(db, owner)                                                  # still being edited
    from app.images import service as images
    image = images.upload_image(db, storage, owner, e, GROUP)                  # in review
    admin = login(make_account(db))
    assert str(e.id) not in [x["id"] for x in admin.get("/api/v1/admin/quality-tests").json()["events"]]
    r = create(admin, e)
    assert r.status_code == 400 and "publicadas" in r.text
    assert db.scalar(select(func.count()).select_from(m.RecognitionTest)) == 0
    assert db.get(m.Image, image.id).review_status == m.ImageReviewStatus.IN_REVIEW
