"""Adapter: InsightFace (SCRFD detector + ArcFace vector, model pack buffalo_l) — REFERENCE ONLY.

It won fotomac-lab's Test 1 (97.6/100), but the buffalo_l models are licensed for non-commercial
research only, and CESMAC chose YuNet + SFace (15/10/2026). So it exists here only as the yardstick
of the precision test in the panel ("Teste de precisão"): the builder refuses to make it the engine
in use (factory.ENGINES, reference_only). Its vectors are computed in memory during a test run and
never stored. The ONLY file in the system that imports `insightface`; official API, factory
parameters, no pre-processing of our own.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from app.face.port import BoundingBox, DetectedFace

MODEL_PACK = "buffalo_l"


class InsightFaceEngine:
    vector_dim = 512

    def __init__(self, model_pack: str = MODEL_PACK, min_detection_score: float = 0.5, models_dir: Path | None = None):
        # models_dir is the folder of the OpenCV models; InsightFace keeps its own (~/.insightface).
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

    def locate(self, image: np.ndarray) -> list[BoundingBox]:
        """The SCRFD detector only: the recogniser is not run, so no vector exists (RNF13)."""
        h, w = image.shape[:2]
        bboxes, _ = self._app.det_model.detect(image, max_num=0, metric="default")
        boxes = []
        for x1, y1, x2, y2, _score in bboxes:
            x1, y1, x2, y2 = max(0, int(x1)), max(0, int(y1)), min(w, int(x2)), min(h, int(y2))
            boxes.append(BoundingBox(x1, y1, max(0, x2 - x1), max(0, y2 - y1)))
        return boxes

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
                landmarks=tuple((float(x), float(y)) for x, y in face.kps) if face.kps is not None else None,
            ))
        return faces
