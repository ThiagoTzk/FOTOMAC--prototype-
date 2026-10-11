"""RF017 — query face selection. Pure unit tests: no model, no database."""
import numpy as np
import pytest

from app.face.port import BoundingBox, DetectedFace, FaceQualityTooLowError, NoFaceDetectedError
from app.face.selection import select_query_face

W, H = 1000, 800
PARAMS = dict(image_width=W, image_height=H, min_detection_score=0.5, min_face_side=40)


def face(x, y, w, h, score=0.9, index=0) -> DetectedFace:
    return DetectedFace(BoundingBox(x, y, w, h), score, np.zeros(512, np.float32), index)


def test_no_face_raises_specific_message():
    with pytest.raises(NoFaceDetectedError, match="Não encontramos um rosto"):
        select_query_face([], **PARAMS)


def test_only_low_quality_faces_is_distinct_from_no_face():
    # RF017 note 5: "quality too low" must be told apart from "no face at all".
    tiny = face(10, 10, 20, 20)
    unsure = face(100, 100, 200, 200, score=0.3)
    with pytest.raises(FaceQualityTooLowError):
        select_query_face([tiny, unsure], **PARAMS)


def test_largest_area_wins():
    small, big = face(0, 0, 100, 100, index=0), face(500, 400, 300, 300, index=1)
    assert select_query_face([small, big], **PARAMS) is big


def test_quality_filter_runs_before_area():
    # A huge but unreliable detection must not beat a real, smaller face (RF017 note 2).
    spurious = face(0, 0, 600, 600, score=0.4, index=0)
    real = face(400, 300, 150, 150, score=0.95, index=1)
    assert select_query_face([spurious, real], **PARAMS) is real


def test_tie_on_area_uses_detection_score():
    a, b = face(0, 0, 100, 100, score=0.80, index=0), face(800, 600, 100, 100, score=0.95, index=1)
    assert select_query_face([a, b], **PARAMS) is b


def test_tie_on_area_and_score_uses_distance_to_centre():
    corner = face(0, 0, 100, 100, index=0)
    centre = face(450, 350, 100, 100, index=1)
    assert select_query_face([corner, centre], **PARAMS) is centre


def test_full_tie_uses_detector_index():
    # Mirror-image faces: same area, score and distance to the centre.
    left, right = face(200, 350, 100, 100, index=1), face(700, 350, 100, 100, index=0)
    assert select_query_face([left, right], **PARAMS) is right


def test_deterministic_regardless_of_input_order():
    faces = [face(0, 0, 100, 100, index=0), face(450, 350, 100, 100, index=1),
             face(10, 600, 100, 100, score=0.7, index=2)]
    chosen = {select_query_face(list(order), **PARAMS).detector_index
              for order in (faces, faces[::-1], faces[1:] + faces[:1])}
    assert chosen == {1}
