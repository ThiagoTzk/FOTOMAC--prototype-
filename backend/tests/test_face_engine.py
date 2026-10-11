"""The InsightFace adapter, run for real against the model (integration test)."""
import numpy as np
import pytest

from app.face.factory import ENGINES, build_engine
from app.face.port import FaceEngine
from app.face.selection import select_query_face


@pytest.fixture(scope="module")
def engine():
    return build_engine("insightface")


def test_adapter_fulfils_the_port(engine):
    assert isinstance(engine, FaceEngine)
    assert engine.vector_dim == 512
    assert engine.model_version.startswith("insightface-1.0.1/buffalo_l")


def test_detects_every_face_in_group_photo(engine, group_photo_bgr):
    faces = engine.detect(group_photo_bgr)
    # t1.jpg is a group of 6 people (the library's own demo image).
    assert len(faces) == 6
    for f in faces:
        assert f.embedding.shape == (512,) and f.embedding.dtype == np.float32
        assert abs(np.linalg.norm(f.embedding) - 1.0) < 1e-3  # L2-normalised
        assert f.detection_score >= 0.5
        assert f.bbox.width > 0 and f.bbox.height > 0


def test_same_person_is_more_similar_than_different_people(engine, group_photo_bgr):
    faces = engine.detect(group_photo_bgr)
    target = faces[0]
    # A slightly shifted, re-encoded copy of the same photo: same people, new pixels.
    shifted = np.ascontiguousarray(group_photo_bgr[4:, 4:])
    again = engine.detect(shifted)
    sims = [float(target.embedding @ g.embedding) for g in again]
    best = int(np.argmax(sims))
    assert sims[best] > 0.9                     # the same face found again
    assert sorted(sims)[-2] < 0.3               # everyone else clearly different


def test_engine_does_not_change_factory_vectors(group_photo_bgr):
    """We load only detection + recognition (LGPD necessity: no age/gender model).
    Prove this produces EXACTLY the vectors of the library's default, measured in Test 1."""
    from insightface.app import FaceAnalysis

    full = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    full.prepare(ctx_id=-1)
    reference = sorted((tuple(np.round(f.bbox, 1)), f.normed_embedding) for f in full.get(group_photo_bgr))
    ours = sorted(((f.bbox.x, f.bbox.y), f.embedding) for f in build_engine("insightface").detect(group_photo_bgr))
    assert len(reference) == len(ours)
    for (_, ref_vec), (_, our_vec) in zip(reference, ours):
        assert float(ref_vec @ our_vec) > 0.9999


def test_query_selection_picks_one_face_from_group(engine, group_photo_bgr):
    faces = engine.detect(group_photo_bgr)
    h, w = group_photo_bgr.shape[:2]
    chosen = select_query_face(faces, w, h, min_detection_score=0.5, min_face_side=40)
    assert chosen.bbox.area == max(f.bbox.area for f in faces if f.bbox.min_side >= 40)


def test_unknown_engine_is_rejected():
    with pytest.raises(ValueError, match="Unknown face engine"):
        build_engine("does-not-exist")
    assert "insightface" in ENGINES


def test_detected_face_repr_never_prints_the_vector(engine, group_photo_bgr):
    text = repr(engine.detect(group_photo_bgr)[0])
    assert "hidden" in text and "[" not in text.split("embedding=")[1]
