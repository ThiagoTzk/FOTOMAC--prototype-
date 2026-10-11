"""RF017 — deterministic choice of the single query face in the visitor's selfie.

Library-independent business rule: it works on the DetectedFace objects of any adapter.
"""
from __future__ import annotations

import math

from app.face.port import DetectedFace, FaceQualityTooLowError, NoFaceDetectedError

NO_FACE_MESSAGE = ("Não encontramos um rosto na imagem enviada. Tente novamente em um local "
                   "bem iluminado, com o rosto de frente e inteiro no enquadramento.")
LOW_QUALITY_MESSAGE = ("O rosto ficou pequeno ou pouco nítido na imagem. Aproxime-se da câmera, "
                       "melhore a iluminação e evite fotos tremidas.")


def select_query_face(faces: list[DetectedFace], image_width: int, image_height: int,
                      min_detection_score: float, min_face_side: int) -> DetectedFace:
    """Return exactly one face, always the same for the same input.

    1. Quality filters first (RF017 note 2), so a background face is never elected.
    2. Largest bounding-box area (main criterion).
    3. Ties: higher detection score → closer to the image centre → lower detector index.

    Only ONE face is ever returned (RF017 note 6): a group photo must not return the
    photos of everyone in it.
    """
    if not faces:
        raise NoFaceDetectedError(NO_FACE_MESSAGE)

    eligible = [f for f in faces
                if f.detection_score >= min_detection_score and f.bbox.min_side >= min_face_side]
    if not eligible:
        raise FaceQualityTooLowError(LOW_QUALITY_MESSAGE)

    diagonal = math.hypot(image_width, image_height) or 1.0

    def centre_distance(face: DetectedFace) -> float:
        cx = face.bbox.x + face.bbox.width / 2
        cy = face.bbox.y + face.bbox.height / 2
        return math.hypot(cx - image_width / 2, cy - image_height / 2) / diagonal

    # min() over a tuple key: negate what must be maximised. Python's tuple ordering applies
    # the criteria strictly in sequence, which is exactly RF017 note 3.
    return min(eligible, key=lambda f: (-f.bbox.area, -f.detection_score,
                                        centre_distance(f), f.detector_index))
