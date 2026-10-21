"""Test doubles shared by the test modules."""
from __future__ import annotations

import dataclasses
import io

import cv2
import numpy as np
import piexif
import zlib

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
    vector_dim = 128

    def __init__(self, faces: int = 2, error: Exception | None = None, **_options):  # builder options ignored
        self.faces, self.error, self.calls = faces, error, 0

    def detect(self, image):
        self.calls += 1
        if self.error:
            raise self.error
        rng = np.random.default_rng(self.calls)
        out = []
        for i in range(self.faces):
            v = rng.normal(size=128).astype(np.float32)
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


# ------------------------------------------------------------------ guided capture (RF036)

POSE_CODES = {"frente": 0, "esquerda": 1, "direita": 2, "cima": 3, "baixo": 4}
_STRIPE = 12


def posed(photo: bytes, pose: str) -> bytes:
    """A frame of a guided capture made from a still photo: a 12-px stripe on top tells
    PosedEngine which way the head 'turned' (left half = code, right half = its complement)."""
    img = cv2.imdecode(np.frombuffer(photo, np.uint8), cv2.IMREAD_COLOR)
    value = 20 + 40 * POSE_CODES[pose]
    stripe = np.zeros((_STRIPE, img.shape[1], 3), np.uint8)
    stripe[:, : img.shape[1] // 2] = value
    stripe[:, img.shape[1] // 2:] = 255 - value
    return cv2.imencode(".jpg", np.vstack([stripe, img]), [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tobytes()


def _pose_of(image) -> str | None:
    top = image[2:_STRIPE - 2]
    if top.shape[0] < 4:
        return None
    left, right = top[:, : image.shape[1] // 2], top[:, image.shape[1] // 2:]
    if left.std() > 6 or right.std() > 6 or abs(float(left.mean()) + float(right.mean()) - 255) > 12:
        return None  # an ordinary photo, not a test frame
    code = round((float(left.mean()) - 20) / 40)
    return next((p for p, c in POSE_CODES.items() if c == code), None)


class PosedEngine:
    """The REAL engine (detection + vectors untouched) with simulated head poses: on a test frame
    the 5 landmarks are shifted as a turned or tilted head would shift them, so the liveness check
    of the public search can be exercised with still photos. Never used outside the tests."""

    TURN, TILT = 0.35, 0.25   # well above the limits of app/calibration/poses.py (0.20 / 0.08)

    def __init__(self, inner):
        self.inner, self.model_version, self.vector_dim = inner, inner.model_version, inner.vector_dim

    def detect(self, image):
        faces, pose = self.inner.detect(image), _pose_of(image)
        if pose in (None, "frente"):
            return faces
        return [self._turn(f, pose) for f in faces]

    def _turn(self, face, pose):
        if not face.landmarks:
            return face
        (rex, rey), (lex, ley), (nx, ny), right_mouth, left_mouth = face.landmarks
        eyes = float(np.hypot(lex - rex, ley - rey))
        span = (right_mouth[1] + left_mouth[1]) / 2 - (rey + ley) / 2
        nx += {"esquerda": self.TURN * eyes, "direita": -self.TURN * eyes}.get(pose, 0.0)
        ny += {"cima": -self.TILT * span, "baixo": self.TILT * span}.get(pose, 0.0)
        return dataclasses.replace(face, landmarks=((rex, rey), (lex, ley), (nx, ny), right_mouth, left_mouth))


class StableFakeEngine:
    """A fake engine that can go through the guided capture: one face per image, frontal landmarks,
    and a vector that depends only on the picture BELOW the pose stripe — so all the frames of one
    capture are 'the same person' (FakeFaceEngine draws a new random vector on every call)."""

    model_version = "fake-1.0"
    vector_dim = 128

    def __init__(self, **_options):
        pass

    def detect(self, image):
        seed = zlib.crc32(np.ascontiguousarray(image[24:]).tobytes())   # rows the stripe never touches
        v = np.random.default_rng(seed).normal(size=128).astype(np.float32)
        landmarks = ((32.0, 35.0), (58.0, 35.0), (45.0, 50.0), (35.0, 62.0), (55.0, 62.0))
        return [DetectedFace(BoundingBox(10, 10, 50, 60), 0.9, v / np.linalg.norm(v), 0, landmarks)]


class PosedStableFake(PosedEngine):
    """StableFakeEngine with the simulated head poses: a second 'technology' for the engine-swap tests."""

    def __init__(self, **_options):
        super().__init__(StableFakeEngine())
