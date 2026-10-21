"""Quality test of facial recognition (RNF18) — fotomac-lab's Test 1, run by the administrator in
the panel on the system's own collection.

Flow: the administrator creates a test (one published event + one photo, several photos or the
frames of a short video of a person who consented, LGPD Art. 11, I), adds runs (one per candidate engine of the builder, InsightFace
included as the reference), marks each photo "está" / "não está" once — the marks are shared by
every run — and reads score, speed and the best threshold of each candidate.

Runs are processed by the background worker a few photos at a time, only when publication and
re-indexing have nothing waiting. A run computes its own vectors IN MEMORY from the photos (it
never touches the production vectors, so it can measure a candidate that is not in use) and
keeps only, per photo, the best similarity and the box of that face. Closing the test keeps the
aggregated result and deletes the query photo, the marks and the per-photo data (Art. 6, III).
"""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, parameters
from app.calibration import poses
from app.calibration.metrics import Row, evaluate
from app.db.models import (Account, Event, EventStatus, Image, ImageReviewStatus, RecognitionRun, RecognitionRunScore,
                           RecognitionTest, RecognitionTestMark)
from app.face import factory
from app.face.port import FaceEngine, FaceEngineError
from app.face.selection import select_query_face
from app.imaging import decode_image
from app.storage.port import ObjectStorage

log = logging.getLogger("fotomac.calibration")

MAX_QUERY_BYTES = 15 * 1024 * 1024
MAX_FRAMES = 60      # frames of a short video (the browser sends ~40)
# How the poses are used against each photo — all computed in the same run, compared on the same marks.
VIEWS = {"single": "1 quadro (de frente)", "max": "poses: a mais parecida", "mean": "poses: rosto médio"}
CHUNK = 3            # photos per worker round: publication never waits long behind a test
STALE_DAYS = 30      # an open test is closed by the system after this (its per-photo data deleted)


class CalibrationError(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _photos(db: Session, event_id: uuid.UUID) -> list[Image]:
    """Published photos only, not on their way out (RF023 note 4).

    Requirements v2.0, RF029 note 2 (17/10/2026): the precision test never reaches a photo still in
    review or discarded, so no face of an unpublished photo is processed (RNF13)."""
    return list(db.scalars(select(Image).where(Image.event_id == event_id,
                                               Image.review_status == ImageReviewStatus.PUBLISHED,
                                               Image.removal_requested_at.is_(None)).order_by(Image.id)))


# ------------------------------------------------------------------ tests

def query_keys(test: RecognitionTest) -> list[str]:
    if not test.query_key:
        return []
    return [f"{test.query_key}-{n}" for n in range(len(test.query_poses))] if test.query_poses else [test.query_key]


def views(test: RecognitionTest) -> list[str]:
    return list(VIEWS) if test.query_poses and len(test.query_poses) > 1 else ["single"]


def create_test(db: Session, storage: ObjectStorage, admin: Account, event_id: uuid.UUID, label: str,
                photos: list[bytes], consent: bool, steps: list[str] | None = None) -> RecognitionTest:
    if not consent:  # LGPD Art. 11, I — enforced here, not only on the screen
        raise CalibrationError("Confirme que a pessoa da foto de consulta autorizou o uso da imagem neste teste.")
    label = (label or "").strip()
    if not 2 <= len(label) <= 80:
        raise CalibrationError("Dê um nome ao teste (de 2 a 80 caracteres), sem o nome da pessoa.")
    event = db.get(Event, event_id)
    if event is None or event.status == EventStatus.EXPIRED or not _photos(db, event_id):
        raise CalibrationError("Escolha um evento com fotos publicadas.")
    if not 1 <= len(photos) <= MAX_FRAMES or any(len(p) > MAX_QUERY_BYTES for p in photos):
        raise CalibrationError(f"Envie de 1 a {MAX_FRAMES} imagens de até 15 MB (ou um vídeo curto).")
    if steps is not None and (len(steps) != len(photos) or any(s not in poses.STEPS for s in steps)):
        raise CalibrationError("Gravação guiada inválida: cada quadro precisa do movimento pedido.")
    try:
        images = [decode_image(p) for p in photos]
    except FaceEngineError as exc:
        raise CalibrationError("Não foi possível ler a consulta. Envie JPEG, PNG ou um vídeo curto.") from exc
    test = RecognitionTest(id=uuid.uuid4(), label=label, event_id=event.id, event_name=event.name,
                           created_by=admin.id, consent_confirmed=True)
    test.query_key = f"calibration/{test.id}/query"
    if len(photos) == 1:
        storage.put(test.query_key, photos[0], "application/octet-stream")
    else:
        # One frame per pose; every other frame is dropped here and never stored.
        engine = factory.active_engine(db)
        frames = [poses.describe(engine, n, img) for n, img in enumerate(images)]
        if steps:  # guided recording: one frame per asked movement + the liveness check
            chosen, test.query_liveness = poses.select_guided(frames, steps)
        else:
            chosen = poses.select(frames)
        if not chosen:
            raise CalibrationError("Nenhum quadro com o rosto nítido. Grave de novo, com boa luz e o rosto inteiro na tela.")
        test.query_poses = [label_ for _, label_ in chosen]
        for n, (index, _) in enumerate(chosen):
            storage.put(f"{test.query_key}-{n}", photos[index], "application/octet-stream")
    del images
    db.add(test)
    audit.record(db, "calibration.test_created", admin.id, "calibration", test.id, event_id=str(event.id),
                 consent=True, frames_received=len(photos), frames_kept=len(test.query_poses or [1]),
                 guided=steps is not None, liveness=(test.query_liveness or {}).get("passed"))
    db.flush()
    add_run(db, admin, test, factory.active_engine_name(db), commit=False)  # the engine in use, always
    db.commit()
    return test


def _open(test: RecognitionTest) -> None:
    if test.closed_at is not None:
        raise CalibrationError("Este teste já foi encerrado: só o resultado ficou guardado.")


def add_run(db: Session, admin: Account, test: RecognitionTest, engine_key: str, commit: bool = True) -> RecognitionRun:
    _open(test)
    if engine_key not in factory.ENGINES:
        raise CalibrationError("Modelo desconhecido.")
    runs = db.scalars(select(RecognitionRun).where(RecognitionRun.test_id == test.id,
                                                   RecognitionRun.engine_key == engine_key)).all()
    if any(r.status in ("pending", "running", "done") for r in runs):
        raise CalibrationError("Esse modelo já tem uma rodada neste teste.")
    for r in runs:  # a failed one is replaced
        db.delete(r)
    spec = factory.ENGINES[engine_key]
    run = RecognitionRun(id=uuid.uuid4(), test_id=test.id, engine_key=engine_key, engine_label=spec.label,
                         status="pending", total=len(_photos(db, test.event_id)) if test.event_id else 0, done=0)
    db.add(run)
    audit.record(db, "calibration.run_requested", admin.id, "calibration", test.id, engine=engine_key)
    if commit:
        db.commit()
    return run


def delete_run(db: Session, admin: Account, test: RecognitionTest, run: RecognitionRun) -> None:
    _open(test)
    if run.status == "running":
        raise CalibrationError("A rodada está em andamento. Espere terminar para excluir.")
    _LIVE.pop(run.id, None)
    db.delete(run)
    audit.record(db, "calibration.run_deleted", admin.id, "calibration", test.id, engine=run.engine_key)
    db.commit()


def mark(db: Session, test: RecognitionTest, image_id: uuid.UUID, value: str | None) -> None:
    """The ground truth of one photo, shared by every run. None clears it."""
    _open(test)
    image = db.get(Image, image_id)
    if image is None or image.event_id != test.event_id:
        raise CalibrationError("Foto fora do evento deste teste.")
    row = db.get(RecognitionTestMark, (test.id, image_id))
    if value is None:
        if row is not None:
            db.delete(row)
    elif value not in ("present", "absent"):
        raise CalibrationError("Marcação inválida.")
    elif row is None:
        db.add(RecognitionTestMark(test_id=test.id, image_id=image_id, mark=value))
    else:
        row.mark, row.marked_at = value, _now()
    db.commit()


def set_wrong_face(db: Session, test: RecognitionTest, run: RecognitionRun, image_id: uuid.UUID, wrong: bool,
                   view: str = "single") -> None:
    """The person is in the photo, but the face THIS candidate (and view) matched is someone else's."""
    _open(test)
    score = db.get(RecognitionRunScore, (run.id, image_id, view))
    if score is None:
        raise CalibrationError("Este modelo não encontrou rosto nesta foto.")
    score.wrong_face = wrong
    db.commit()


def run_result(db: Session, test: RecognitionTest, run: RecognitionRun, threshold: float | None = None,
               view: str = "single") -> dict:
    """Live metrics of a run (one view) over the MARKED photos (lab formulas, app/calibration/metrics.py)."""
    marks = {m.image_id: m.mark for m in db.scalars(select(RecognitionTestMark).where(RecognitionTestMark.test_id == test.id))}
    scores = {s.image_id: s for s in db.scalars(select(RecognitionRunScore).where(RecognitionRunScore.run_id == run.id,
                                                                                RecognitionRunScore.view == view))}
    rows = [Row(scores[i].similarity if i in scores else None, m == "present", bool(i in scores and scores[i].wrong_face))
            for i, m in marks.items()]
    return evaluate(rows, threshold if threshold is not None else parameters.get(db, "similarity_threshold"))


def _hold_runs(db: Session, test: RecognitionTest) -> list[RecognitionRun]:
    """Locks the test's runs BEFORE touching the test, in the same order the worker uses (run row
    first). If the worker is in the middle of a round it finishes it, and from then on it skips these
    runs (SKIP LOCKED) — closing or discarding never deadlocks with it (found 16/10/2026: a discard
    during a run's start was cancelled by the database after the photo was already deleted)."""
    return list(db.scalars(select(RecognitionRun).where(RecognitionRun.test_id == test.id)
                           .order_by(RecognitionRun.id).with_for_update()))


def close(db: Session, storage: ObjectStorage, admin: Account | None, test: RecognitionTest) -> None:
    """Keeps the aggregated result of every finished run; deletes the query photo, the marks and
    the per-photo data. No image id, no box and no similarity of a given photo is kept."""
    _open(test)
    threshold = parameters.get(db, "similarity_threshold")
    for run in _hold_runs(db, test):
        _LIVE.pop(run.id, None)
        if run.status == "done":
            run.result = {v: run_result(db, test, run, threshold, v) for v in views(test)}
        elif run.status in ("pending", "running"):
            run.status, run.error = "failed", "Teste encerrado antes de a rodada terminar."
        db.query(RecognitionRunScore).filter(RecognitionRunScore.run_id == run.id).delete()
    db.query(RecognitionTestMark).filter(RecognitionTestMark.test_id == test.id).delete()
    for key in query_keys(test):
        storage.delete(key)
    test.query_key, test.closed_at = None, _now()
    audit.record(db, "calibration.test_closed", admin.id if admin else None, "calibration", test.id,
                 automatic=admin is None)
    db.commit()


def discard(db: Session, storage: ObjectStorage, admin: Account, test: RecognitionTest) -> None:
    for run in _hold_runs(db, test):
        _LIVE.pop(run.id, None)
    for key in query_keys(test):
        storage.delete(key)
    db.delete(test)
    audit.record(db, "calibration.test_discarded", admin.id, "calibration", test.id)
    db.commit()


def close_stale(db: Session, storage: ObjectStorage) -> int:
    """An open test older than 30 days is closed by the system: nobody keeps a person's photo and
    per-photo matches indefinitely because they forgot to press a button."""
    stale = db.scalars(select(RecognitionTest).where(RecognitionTest.closed_at.is_(None),
                                                     RecognitionTest.created_at < _now() - timedelta(days=STALE_DAYS))).all()
    for test in stale:
        close(db, storage, None, test)
    return len(stale)


# ------------------------------------------------------------------ runs (background worker)

@dataclass
class _Live:
    """What a run keeps in memory between worker rounds — never written anywhere."""
    engine: FaceEngine
    queries: np.ndarray           # one row per pose kept (the frontal one first)
    pending: list[uuid.UUID]
    vectors: list[np.ndarray] = field(default_factory=list)
    owners: list[int] = field(default_factory=list)
    detect_s: float = 0.0
    photos: int = 0


_LIVE: dict[uuid.UUID, _Live] = {}


def _fail(db: Session, run: RecognitionRun, message: str) -> None:
    _LIVE.pop(run.id, None)
    run.status, run.error, run.finished_at = "failed", message[:300], _now()
    db.commit()


def _start(db: Session, storage: ObjectStorage, run: RecognitionRun, test: RecognitionTest) -> None:
    db.query(RecognitionRunScore).filter(RecognitionRunScore.run_id == run.id).delete()
    t0 = time.perf_counter()
    engine = factory.build_engine(run.engine_key)  # a fresh instance: comparable load time, no shared state
    run.load_s = time.perf_counter() - t0
    vectors, elapsed = [], []
    for key in query_keys(test):
        image = decode_image(storage.get(key))
        t0 = time.perf_counter()
        faces = engine.detect(image)
        try:
            vectors.append(select_query_face(faces, image.shape[1], image.shape[0], parameters.get(db, "min_detection_score"),
                                             parameters.get(db, "min_query_face_side")).embedding)
        except FaceEngineError as exc:
            if not vectors and len(query_keys(test)) == 1:
                raise CalibrationError(f"Foto de consulta: {exc}") from None
            continue  # a pose this engine cannot read is left out
        finally:
            elapsed.append(time.perf_counter() - t0)
            del image, faces
    if not vectors:
        raise CalibrationError("Foto de consulta: nenhum quadro com rosto legível para este modelo.")
    run.query_ms = 1000 * sum(elapsed) / len(elapsed)  # per frame, comparable with a single selfie
    ids = [i.id for i in _photos(db, test.event_id)]
    _LIVE[run.id] = _Live(engine=engine, queries=np.vstack(vectors), pending=ids)
    run.model_version, run.status, run.total, run.done = engine.model_version, "running", len(ids), 0
    db.commit()


def run_next(db: Session, storage: ObjectStorage) -> bool:
    """One worker round: starts or advances ONE run by a few photos. False when nothing waits."""
    run = db.scalar(select(RecognitionRun).where(RecognitionRun.status.in_(["pending", "running"]))
                    .order_by(RecognitionRun.created_at).limit(1).with_for_update(skip_locked=True))
    if run is None:
        return False
    test = db.get(RecognitionTest, run.test_id)
    try:
        if run.status == "running" and run.id not in _LIVE:  # the process restarted mid-run: start over
            run.status = "pending"
        if run.status == "pending":
            _start(db, storage, run, test)
            return True
        live = _LIVE[run.id]
        floor = parameters.get(db, "min_detection_score")
        for image_id in live.pending[:CHUNK]:
            image = db.get(Image, image_id)
            if image is not None and image.removal_requested_at is None:
                pixels = decode_image(storage.get(image.object_key))
                t0 = time.perf_counter()
                faces = [f for f in live.engine.detect(pixels) if f.detection_score >= floor]
                live.detect_s += time.perf_counter() - t0
                live.photos += 1
                if faces:
                    for view, sims in _view_scores(np.vstack([f.embedding for f in faces]), live.queries,
                                                   views(test)).items():
                        best = faces[int(np.argmax(sims))]
                        db.add(RecognitionRunScore(run_id=run.id, image_id=image_id, view=view, similarity=float(sims.max()),
                                                   bbox_x=best.bbox.x, bbox_y=best.bbox.y,
                                                   bbox_width=best.bbox.width, bbox_height=best.bbox.height))
                    live.vectors.extend(f.embedding for f in faces)
                    live.owners.extend([live.photos] * len(faces))
                del pixels, faces
            run.done += 1
        live.pending = live.pending[CHUNK:]
        if not live.pending:
            _finish(run, live)
        db.commit()
    except Exception as exc:  # noqa: BLE001 — one broken run never stops the worker
        db.rollback()
        run = db.get(RecognitionRun, run.id)
        message = str(exc) if isinstance(exc, (CalibrationError, FaceEngineError)) else f"Falha ao processar ({type(exc).__name__})."
        log.warning("quality test run %s failed: %s", run.id, type(exc).__name__)
        _fail(db, run, message)
    return True


def _view_scores(faces: np.ndarray, queries: np.ndarray, wanted: list[str]) -> dict[str, np.ndarray]:
    """Similarity of every face of a photo with the query, in each view (vectors are L2-normalised)."""
    by_pose = faces @ queries.T                      # faces × poses
    out = {"single": by_pose[:, 0]}                  # the frontal frame: what a selfie gives
    if "max" in wanted:
        out["max"] = by_pose.max(axis=1)             # the pose most like this face
    if "mean" in wanted:
        centre = queries.mean(axis=0)                # one "average face" of the poses
        out["mean"] = faces @ (centre / (np.linalg.norm(centre) or 1.0))
    return {v: out[v] for v in wanted}


def _finish(run: RecognitionRun, live: _Live) -> None:
    # Search time, measured like the lab: the query against every face of the event, best per photo.
    if live.vectors:
        matrix, owners = np.vstack(live.vectors), np.asarray(live.owners)
        t0 = time.perf_counter()
        scores = matrix @ live.queries[0]
        order = np.argsort(owners, kind="stable")
        np.maximum.reduceat(scores[order], np.unique(owners[order], return_index=True)[1])
        run.search_ms = (time.perf_counter() - t0) * 1000
    run.faces = len(live.vectors)
    run.index_s_per_photo = live.detect_s / live.photos if live.photos else None
    run.status, run.finished_at = "done", _now()
    _LIVE.pop(run.id, None)  # the engine and every vector of this run are released here
