"""ADMINISTRATOR: quality test of facial recognition (fotomac-lab's Test 1 inside the panel, RNF18).

Shows thumbnails and per-photo matches of ONE consented person: administrator only, like the
other recognition settings (RF026).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import parameters
from app.api.deps import require_role
from app.calibration import service
from app.db.models import (Account, AccountRole, Event, EventStatus, Image, ImageReviewStatus, RecognitionRun, RecognitionRunScore,
                           RecognitionTest, RecognitionTestMark)
from app.db.session import get_session
from app.face import factory
from app.storage.factory import get_storage
from app.storage.port import ObjectStorage

router = APIRouter(prefix="/admin/quality-tests", tags=["admin: teste de precisão"])
admin_only = require_role(AccountRole.ADMIN)


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


def _test(db: Session, test_id: uuid.UUID) -> RecognitionTest:
    test = db.get(RecognitionTest, test_id)
    if test is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teste não encontrado.")
    return test


def _run(db: Session, test: RecognitionTest, run_id: uuid.UUID) -> RecognitionRun:
    run = db.get(RecognitionRun, run_id)
    if run is None or run.test_id != test.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rodada não encontrada.")
    return run


def _closed_result(run: RecognitionRun, view: str) -> dict | None:
    if not run.result:
        return None
    if "score" in run.result:  # closed before the poses existed: one result, the single view
        return run.result if view == "single" else None
    return run.result.get(view)


def _runs_out(db: Session, test: RecognitionTest, threshold: float, with_curve: bool = True) -> list[dict]:
    """One entry per run AND view (1 frame / poses: best / poses: mean), all on the same marks."""
    out = []
    for run in db.scalars(select(RecognitionRun).where(RecognitionRun.test_id == test.id).order_by(RecognitionRun.created_at)):
        spec = factory.ENGINES.get(run.engine_key)
        for view in service.views(test):
            if test.closed_at:
                result = _closed_result(run, view)
            else:
                result = service.run_result(db, test, run, threshold, view) if run.status == "done" else None
            if result and not with_curve:
                result = {k: v for k, v in result.items() if k not in ("model", "product", "distribution")} | {
                    "best_threshold": (result["model"]["best"] or {}).get("threshold")}
            out.append({"id": f"{run.id}:{view}", "run_id": run.id, "view": view, "view_label": service.VIEWS[view],
                        "engine_key": run.engine_key, "engine_label": run.engine_label,
                        "model_version": run.model_version, "status": run.status, "total": run.total, "done": run.done,
                        "error": run.error, "load_s": run.load_s, "index_s_per_photo": run.index_s_per_photo,
                        "query_ms": run.query_ms, "search_ms": run.search_ms, "faces": run.faces,
                        "reference_only": bool(spec and spec.reference_only),
                        "lab_score": spec.lab_score if spec and view == "single" else None, "result": result})
    return out


@router.get("")
def overview(_: Account = Depends(admin_only), db: Session = Depends(get_session)):
    threshold = parameters.get(db, "similarity_threshold")
    names = {a.id: a.full_name for a in db.scalars(select(Account))}
    tests = db.scalars(select(RecognitionTest).order_by(RecognitionTest.created_at.desc()).limit(50)).all()
    # Only published photos take part in a precision test (RF029 note 2, RNF13).
    photos = dict(db.execute(select(Image.event_id, func.count()).where(
        Image.review_status == ImageReviewStatus.PUBLISHED, Image.removal_requested_at.is_(None)).group_by(Image.event_id)).all())
    events = db.scalars(select(Event).where(Event.status != EventStatus.EXPIRED).order_by(Event.date_start.desc())).all()
    return {
        "tests": [{"id": t.id, "label": t.label, "event_name": t.event_name, "created_at": t.created_at,
                   "closed_at": t.closed_at, "created_by": names.get(t.created_by, "conta removida"),
                   "runs": _runs_out(db, t, threshold, with_curve=False)} for t in tests],
        "events": [{"id": e.id, "name": e.name, "photos": photos[e.id]} for e in events if e.id in photos],
        "candidates": factory.catalogue(),
        "active_engine": factory.active_engine_name(db),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(event_id: uuid.UUID = Form(...), label: str = Form(..., max_length=80), consent: bool = Form(False),
                 photos: list[UploadFile] = File(...), steps: list[str] | None = Form(None),
                 admin: Account = Depends(admin_only),
                 db: Session = Depends(get_session), storage: ObjectStorage = Depends(get_storage)):
    """One photo, several photos, or the frames the browser extracted from a short video (the video
    itself is never sent)."""
    if len(photos) > service.MAX_FRAMES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Envie no máximo {service.MAX_FRAMES} imagens.")
    data = [await p.read(service.MAX_QUERY_BYTES + 1) for p in photos]
    try:
        test = service.create_test(db, storage, admin, event_id, label, data, consent, steps)
    except service.CalibrationError as exc:
        raise _bad(exc) from None
    finally:
        del data
    return {"id": test.id}


@router.get("/{test_id}")
def detail(test_id: uuid.UUID, threshold: float | None = Query(None, ge=-1, le=1), _: Account = Depends(admin_only),
           db: Session = Depends(get_session)):
    test = _test(db, test_id)
    current = parameters.get(db, "similarity_threshold")
    runs = _runs_out(db, test, threshold if threshold is not None else current)
    items = []
    if not test.closed_at and test.event_id:
        marks = {m.image_id: m.mark for m in db.scalars(select(RecognitionTestMark).where(RecognitionTestMark.test_id == test.id))}
        scores: dict[uuid.UUID, dict] = {}
        for s in db.scalars(select(RecognitionRunScore).join(RecognitionRun).where(RecognitionRun.test_id == test.id)):
            scores.setdefault(s.image_id, {})[f"{s.run_id}:{s.view}"] = {
                "similarity": round(s.similarity, 4), "wrong_face": s.wrong_face,
                "box": [s.bbox_x, s.bbox_y, s.bbox_width, s.bbox_height]}
        items = [{"id": i.id, "width": i.width, "height": i.height, "mark": marks.get(i.id), "scores": scores.get(i.id, {})}
                 for i in service._photos(db, test.event_id)]
    return {"id": test.id, "label": test.label, "event_name": test.event_name, "created_at": test.created_at,
            "closed_at": test.closed_at, "threshold": current, "active_engine": factory.active_engine_name(db),
            "query_poses": (test.query_poses or ["foto"]) if test.query_key else [],
            "query_liveness": test.query_liveness,
            "candidates": factory.catalogue(), "runs": runs, "items": items}


class RunIn(BaseModel):
    engine: str = Field(max_length=40)


@router.post("/{test_id}/runs", status_code=status.HTTP_201_CREATED)
def add_run(test_id: uuid.UUID, body: RunIn, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    try:
        run = service.add_run(db, admin, _test(db, test_id), body.engine)
    except service.CalibrationError as exc:
        raise _bad(exc) from None
    return {"id": run.id}


@router.delete("/{test_id}/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(test_id: uuid.UUID, run_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session)):
    test = _test(db, test_id)
    try:
        service.delete_run(db, admin, test, _run(db, test, run_id))
    except service.CalibrationError as exc:
        raise _bad(exc) from None


class MarkIn(BaseModel):
    mark: str | None = Field(None, max_length=10)


@router.put("/{test_id}/marks/{image_id}")
def put_mark(test_id: uuid.UUID, image_id: uuid.UUID, body: MarkIn, _: Account = Depends(admin_only),
             db: Session = Depends(get_session)):
    test = _test(db, test_id)
    try:
        service.mark(db, test, image_id, body.mark)
    except service.CalibrationError as exc:
        raise _bad(exc) from None
    return {"runs": _runs_out(db, test, parameters.get(db, "similarity_threshold"))}


class WrongFaceIn(BaseModel):
    wrong: bool
    view: str = Field("single", pattern="^(single|max|mean)$")


@router.put("/{test_id}/runs/{run_id}/wrong-face/{image_id}")
def put_wrong_face(test_id: uuid.UUID, run_id: uuid.UUID, image_id: uuid.UUID, body: WrongFaceIn,
                   _: Account = Depends(admin_only), db: Session = Depends(get_session)):
    test = _test(db, test_id)
    try:
        service.set_wrong_face(db, test, _run(db, test, run_id), image_id, body.wrong, body.view)
    except service.CalibrationError as exc:
        raise _bad(exc) from None
    return {"runs": _runs_out(db, test, parameters.get(db, "similarity_threshold"))}


@router.get("/{test_id}/query/{n}")
def query_frame(test_id: uuid.UUID, n: int, _: Account = Depends(admin_only), db: Session = Depends(get_session),
                storage: ObjectStorage = Depends(get_storage)):
    """The kept poses, so the administrator can check the selection. Only while the test is open."""
    keys = service.query_keys(_test(db, test_id))
    if not 0 <= n < len(keys):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quadro não encontrado.")
    return Response(storage.get(keys[n]), media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.post("/{test_id}/close")
def close(test_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
          storage: ObjectStorage = Depends(get_storage)):
    try:
        service.close(db, storage, admin, _test(db, test_id))
    except service.CalibrationError as exc:
        raise _bad(exc) from None
    return {"closed": True}


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard(test_id: uuid.UUID, admin: Account = Depends(admin_only), db: Session = Depends(get_session),
            storage: ObjectStorage = Depends(get_storage)):
    service.discard(db, storage, admin, _test(db, test_id))
