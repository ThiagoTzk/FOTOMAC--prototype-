"""Adapter: InsightFace (SCRFD detector + ArcFace vector, model pack buffalo_l).

This is the ONLY file in the system that imports `insightface`. It uses the library's
official API with its factory parameters — the configuration that won fotomac-lab's
Test 1 (score 97.6/100). No pre-processing of our own around it.
"""
from __future__ import annotations

import numpy as np

from app.face.port import BoundingBox, DetectedFace

MODEL_PACK = "buffalo_l"


class InsightFaceEngine:
    vector_dim = 512

    def __init__(self, model_pack: str = MODEL_PACK, min_detection_score: float = 0.5):
        # Imported here so the rest of the system (and other adapters) never load it.
        import insightface
        from insightface.app import FaceAnalysis

        # allowed_modules: we only need detection + recognition. The pack also ships
        # age/gender and landmark models; loading them would compute data the system has
        # no purpose for (LGPD Art. 6, III — necessity) and RF007 forbids age estimation.
        self._app = FaceAnalysis(name=model_pack, allowed_modules=["detection", "recognition"],
                                 providers=["CPUExecutionProvider"])
        # ctx_id=-1 → CPU; det_size left at the library default (640x640).
        self._app.prepare(ctx_id=-1, det_thresh=min_detection_score)
        self.model_version = f"insightface-{insightface.__version__}/{model_pack}"

    def detect(self, image: np.ndarray) -> list[DetectedFace]:
        faces = []
        for index, face in enumerate(self._app.get(image)):
            x1, y1, x2, y2 = (int(round(v)) for v in face.bbox)
            # Boxes can extend past the image edge; clip so area comparisons are fair.
            h, w = image.shape[:2]
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
            faces.append(DetectedFace(
                bbox=BoundingBox(x1, y1, max(0, x2 - x1), max(0, y2 - y1)),
                detection_score=float(face.det_score),
                embedding=np.asarray(face.normed_embedding, dtype=np.float32),
                detector_index=index,
            ))
        return faces
