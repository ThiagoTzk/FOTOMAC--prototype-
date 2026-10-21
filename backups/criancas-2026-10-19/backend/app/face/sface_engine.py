"""Adapter: YuNet (detector) + SFace (128-dim vector), both run by OpenCV from local ONNX files.

The ONLY file in the system that touches these models. It reproduces EXACTLY the configuration
measured in fotomac-lab's Test 1 (score 89.5/100, `fotomac_face.py`, 24/09/2026) — the score
only holds for this configuration, so every value below is the lab's, not a new guess:

- the larger side of the image is reduced to 1920 px before detecting;
- YuNet with NMS 0.3, top_k 5000 and the minimum confidence chosen in the panel (0.50);
- faces smaller than 10 px (on the reduced image) are ignored;
- each face is aligned by its 5 landmarks (alignCrop) before SFace, and the vector is
  L2-normalised, so cosine similarity is a plain dot product in pgvector.

Licences: YuNet is MIT, SFace is Apache 2.0 — both free for institutional/commercial use, which
is why CESMAC chose them (15/10/2026). Model files: backend/models/ (see models/README.md).
"""
from __future__ import annotations

import hashlib
import threading
from pathlib import Path

import cv2
import numpy as np

from app.face.port import BoundingBox, DetectedFace, FaceEngineUnavailable

YUNET_FILE = "face_detection_yunet_2023mar.onnx"
SFACE_FILE = "face_recognition_sface_2021dec.onnx"
# SHA-256 of the official opencv_zoo files (identical to the ones used in Test 1). A different
# file would produce vectors that do not compare with the stored ones — refused, never silent.
CHECKSUMS = {
    YUNET_FILE: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    SFACE_FILE: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
}

# Test 1 configuration (fotomac-lab/fotomac_face.py). Changing any of these changes the vectors:
# the model version below must change too, so the collection is re-indexed (RF028).
# MAX_SIDE is the one knob the builder can turn (variants in factory.ENGINES): event photos have
# 20+ megapixels, and a face at the back of the audience shrinks to a few pixels at 1920 px.
MAX_SIDE = 1920
NMS_THRESHOLD = 0.3
TOP_K = 5000
MIN_FACE_SIDE = 10
CONFIG_TAG = "teste1"


class SFaceEngine:
    vector_dim = 128

    def __init__(self, models_dir: Path, min_detection_score: float = 0.5, max_side: int = MAX_SIDE):
        paths = {name: Path(models_dir) / name for name in CHECKSUMS}
        for name, path in paths.items():
            if not path.is_file():
                raise FaceEngineUnavailable(f"Arquivo do modelo não encontrado: {path}. Rode infra/setup_local.sh.")
            if hashlib.sha256(path.read_bytes()).hexdigest() != CHECKSUMS[name]:
                raise FaceEngineUnavailable(f"Arquivo do modelo diferente do oficial: {path.name}.")
        self._min_score, self._max_side = min_detection_score, max_side
        self._detector = cv2.FaceDetectorYN.create(model=str(paths[YUNET_FILE]), config="", input_size=(320, 320),
                                                   score_threshold=min_detection_score, nms_threshold=NMS_THRESHOLD,
                                                   top_k=TOP_K)
        self._recognizer = cv2.FaceRecognizerSF.create(model=str(paths[SFACE_FILE]), config="")
        # The detector keeps the input size as state: the indexing worker and the visitors' searches
        # run in different threads, so one image at a time goes through it.
        self._lock = threading.Lock()
        tag = CONFIG_TAG if max_side == MAX_SIDE else f"max{max_side}"
        self.model_version = f"opencv-{cv2.__version__}/yunet-2023mar+sface-2021dec/{tag}"

    def locate(self, image: np.ndarray) -> list[BoundingBox]:
        """YuNet only: the SFace recogniser is never called, so no vector exists (RNF13)."""
        h, w = image.shape[:2]
        scale = min(1.0, self._max_side / max(h, w))
        small = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else image
        with self._lock:
            self._detector.setInputSize((small.shape[1], small.shape[0]))
            _, rows = self._detector.detect(small)
        boxes = []
        for row in rows if rows is not None else []:
            x, y, bw, bh = (float(v) for v in row[:4])
            if min(bw, bh) < MIN_FACE_SIDE or float(row[14]) < self._min_score:
                continue
            x1, y1 = max(0, int(x / scale)), max(0, int(y / scale))
            x2, y2 = min(w, int((x + bw) / scale)), min(h, int((y + bh) / scale))
            boxes.append(BoundingBox(x1, y1, max(0, x2 - x1), max(0, y2 - y1)))
        return boxes

    def detect(self, image: np.ndarray) -> list[DetectedFace]:
        h, w = image.shape[:2]
        scale = min(1.0, self._max_side / max(h, w))
        small = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else image
        with self._lock:
            self._detector.setInputSize((small.shape[1], small.shape[0]))
            _, rows = self._detector.detect(small)
            faces = []
            for index, row in enumerate(rows if rows is not None else []):
                x, y, bw, bh = (float(v) for v in row[:4])
                score = float(row[14])
                if min(bw, bh) < MIN_FACE_SIDE or score < self._min_score:
                    continue
                vector = self._recognizer.feature(self._recognizer.alignCrop(small, row)).flatten().astype(np.float32)
                norm = float(np.linalg.norm(vector))
                # Box back in pixels of the ORIGINAL image, clipped to it (YuNet may return
                # negative corners for a face cut by the edge).
                x1, y1 = max(0, int(x / scale)), max(0, int(y / scale))
                x2, y2 = min(w, int((x + bw) / scale)), min(h, int((y + bh) / scale))
                # YuNet row: box (4), 5 points (10: right eye, left eye, nose, mouth corners), score.
                points = tuple((float(row[4 + 2 * i]) / scale, float(row[5 + 2 * i]) / scale) for i in range(5))
                faces.append(DetectedFace(bbox=BoundingBox(x1, y1, max(0, x2 - x1), max(0, y2 - y1)),
                                          detection_score=score, embedding=vector / norm if norm > 0 else vector,
                                          detector_index=index, landmarks=points))
        return faces
