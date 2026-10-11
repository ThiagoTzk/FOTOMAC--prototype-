"""Test doubles shared by the test modules."""
from __future__ import annotations

import io

import cv2
import numpy as np
import piexif

from app.face.port import BoundingBox, DetectedFace


class MemoryStorage:
    """Object storage in a dict: same contract as the SeaweedFS adapter (app/storage/port.py)."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def ensure_bucket(self): ...

    def put(self, key, data, content_type): self.objects[key] = data

    def put_file(self, key, path, content_type):
        with open(path, "rb") as f:
            self.objects[key] = f.read()

    def get(self, key): return self.objects[key]

    def exists(self, key): return key in self.objects

    def delete(self, key): self.objects.pop(key, None)

    def stream(self, key, chunk_size=1024 * 1024):
        data = self.objects[key]
        return len(data), (data[i:i + chunk_size] for i in range(0, len(data), chunk_size))


class FakeFaceEngine:
    """Facial recognition double: returns `faces` vectors per image, or raises."""

    model_version = "fake-1.0"
    vector_dim = 512

    def __init__(self, faces: int = 2, error: Exception | None = None):
        self.faces, self.error, self.calls = faces, error, 0

    def detect(self, image):
        self.calls += 1
        if self.error:
            raise self.error
        rng = np.random.default_rng(self.calls)
        out = []
        for i in range(self.faces):
            v = rng.normal(size=512).astype(np.float32)
            out.append(DetectedFace(BoundingBox(10 * i, 10, 50, 60), 0.9, v / np.linalg.norm(v), i))
        return out


def jpeg(seed: int = 0, w: int = 120, h: int = 80, gps: bool = False) -> bytes:
    """A distinct, valid JPEG per seed (optionally with GPS in the EXIF)."""
    img = np.full((h, w, 3), (seed * 37) % 255, np.uint8)
    cv2.putText(img, str(seed), (5, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    data = cv2.imencode(".jpg", img)[1].tobytes()
    if gps:
        exif = piexif.dump({"0th": {}, "Exif": {}, "GPS": {piexif.GPSIFD.GPSLatitudeRef: b"S"}, "1st": {}, "thumbnail": None})
        out = io.BytesIO()
        piexif.insert(exif, data, out)
        data = out.getvalue()
    return data
