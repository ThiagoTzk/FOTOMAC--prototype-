"""The YuNet + SFace adapter, run for real against the models (integration test), and the builder."""
import shutil

import numpy as np
import pytest

from app.face import factory, sface_engine
from app.face.factory import ENGINES, build_engine
from app.face.port import FaceEngine, FaceEngineUnavailable
from app.face.selection import select_query_face


@pytest.fixture(scope="module")
def engine():
    return build_engine("sface")


def test_adapter_fulfils_the_port(engine):
    assert isinstance(engine, FaceEngine)
    assert engine.vector_dim == 128
    assert engine.model_version == "opencv-5.0.0/yunet-2023mar+sface-2021dec/teste1"


def test_runs_with_the_configuration_of_test_1():
    """The score 89.5 of fotomac-lab's Test 1 only holds for this exact configuration
    (fotomac_face.py). The adapter was also compared face by face with the lab engine on 302
    faces: identical vectors (cosine 1.000000) — 16/10/2026."""
    assert (sface_engine.MAX_SIDE, sface_engine.NMS_THRESHOLD, sface_engine.TOP_K, sface_engine.MIN_FACE_SIDE) == (1920, 0.3, 5000, 10)
    assert ENGINES["sface"].similarity_threshold == 0.3741   # best F1 of Test 1 (48 of 59 found, 1 wrong)


def test_detects_every_face_in_group_photo(engine, group_photo_bgr):
    faces = engine.detect(group_photo_bgr)
    assert len(faces) == 3                                   # the three astronauts
    for f in faces:
        assert f.embedding.shape == (128,) and f.embedding.dtype == np.float32
        assert abs(np.linalg.norm(f.embedding) - 1.0) < 1e-3  # L2-normalised: cosine = dot product
        assert f.detection_score >= 0.5
        assert f.bbox.width > 0 and f.bbox.height > 0


def test_boxes_are_in_pixels_of_the_original_image(engine, group_photo_bgr):
    """Images larger than 1920 px are reduced to detect; the boxes must come back in the
    ORIGINAL pixels, or the selfie size filter (RF017) would measure the wrong thing."""
    big = np.ascontiguousarray(np.kron(group_photo_bgr, np.ones((2, 2, 1), dtype=np.uint8)))   # 2560 px wide
    small = sorted((f.bbox.x, f.bbox.width) for f in engine.detect(group_photo_bgr))
    large = sorted(f.bbox.x for f in engine.detect(big))
    # Detecting at another resolution moves a box by a few pixels (measured: up to 9 px); boxes left
    # in the reduced scale would be off by more than 100 px. Tolerance: 10% of the face width.
    assert len(small) == len(large) == 3
    assert all(abs(b - 2 * x) <= 0.1 * 2 * w for (x, w), b in zip(small, large))


def test_same_person_is_more_similar_than_different_people(engine, group_photo_bgr):
    faces = engine.detect(group_photo_bgr)
    mirrored = engine.detect(np.ascontiguousarray(group_photo_bgr[:, ::-1]))   # same people, new pixels
    for face in faces:
        sims = sorted(float(face.embedding @ g.embedding) for g in mirrored)
        assert sims[-1] > 0.9                                # the same face found again
        assert sims[-2] < ENGINES["sface"].similarity_threshold   # everyone else stays below the threshold


def test_query_selection_picks_one_face_from_group(engine, group_photo_bgr):
    faces = engine.detect(group_photo_bgr)
    h, w = group_photo_bgr.shape[:2]
    chosen = select_query_face(faces, w, h, min_detection_score=0.5, min_face_side=40)
    assert chosen.bbox.area == max(f.bbox.area for f in faces if f.bbox.min_side >= 40)


def test_altered_or_missing_model_file_is_refused(tmp_path):
    """A different file would produce vectors that do not compare with the stored ones: the
    engine refuses to load (safe failure) instead of indexing garbage in silence."""
    with pytest.raises(FaceEngineUnavailable, match="não encontrado"):
        build_engine("sface", models_dir=tmp_path)
    for name in sface_engine.CHECKSUMS:
        shutil.copy(factory.get_settings().face_models_dir / name, tmp_path / name)
    (tmp_path / sface_engine.YUNET_FILE).write_bytes(b"not the official model")
    with pytest.raises(FaceEngineUnavailable, match="diferente do oficial"):
        build_engine("sface", models_dir=tmp_path)


def test_unknown_engine_is_rejected():
    with pytest.raises(ValueError, match="Unknown face engine"):
        build_engine("does-not-exist")
    assert list(ENGINES) == ["sface", "sface-2560", "sface-3840", "insightface"]
    # InsightFace is back ONLY as the yardstick of the quality test (licence: non-commercial research).
    assert [k for k, s in ENGINES.items() if s.reference_only] == ["insightface"]


def test_resolution_variants_are_other_models(engine):
    """Detecting on a larger image changes the vectors: a variant has its own version, so a swap
    to it re-indexes the collection instead of mixing incomparable vectors."""
    big = build_engine("sface-3840")
    assert big.model_version.endswith("/max3840") and big.model_version != engine.model_version


def test_detected_face_repr_never_prints_the_vector(engine, group_photo_bgr):
    text = repr(engine.detect(group_photo_bgr)[0])
    assert "hidden" in text and "[" not in text.split("embedding=")[1]
