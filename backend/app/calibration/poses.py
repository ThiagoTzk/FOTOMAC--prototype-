"""Picks, from many frames of a short video (or several photos), at most 5 — one per pose: front,
both sides, up, down.

Why not every frame: 3 seconds are ~90 nearly identical frames. Comparing each photo with all of
them and keeping the best multiplies the chances of a stranger matching ONE frame by luck; and
keeping them would be more biometric data than needed (LGPD Art. 6, III). One sharp frame per pose
gives the angles a single selfie lacks.

The pose comes from the 5 points the detector already returns (eyes, nose tip, mouth corners),
read through the face port — no model is touched here:
- turn (yaw): how far the nose is from the middle of the eyes, in eye-distances, compared with the frontal frame;
- tilt (pitch): where the nose sits between the eyes and the mouth (0 = at the eyes, 1 = at the mouth),
  compared with the frontal frame.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass

import cv2
import numpy as np

from app.face.port import DetectedFace, FaceEngine

MIN_SCORE = 0.6     # a frame whose face the detector doubts is not a reference
# Both measured RELATIVE to the person's own frontal frame: nobody's "front" is exactly 0 for every
# camera. A still video (16/10/2026) wobbled by ±0.04 in turn and ±0.035 in tilt; a real head turn of
# ~30° gives ~0.3. The limits sit well above that noise, so a still face never counts as a pose.
TURN = 0.20         # minimum turn to count as a side pose (eye-distances)
TILT = 0.08         # minimum tilt to count as up / down


@dataclass(frozen=True)
class Frame:
    index: int
    yaw: float
    pitch: float
    sharpness: float
    score: float


def describe(engine: FaceEngine, index: int, image: np.ndarray) -> Frame | None:
    """The pose of the largest face of one frame, or None (no face, or no landmarks)."""
    return frame_from_faces(index, image, engine.detect(image))


def frame_from_faces(index: int, image: np.ndarray, detected: list[DetectedFace]) -> Frame | None:
    """Same as describe(), for faces already detected (the public search detects each frame once
    and reuses the faces for the query)."""
    faces = [f for f in detected if f.landmarks]
    if not faces:
        return None
    face = max(faces, key=lambda f: f.bbox.area)
    (rex, rey), (lex, ley), (nx, ny), (rmx, rmy), (lmx, lmy) = face.landmarks
    eye_x, eye_y = (rex + lex) / 2, (rey + ley) / 2
    mouth_y = (rmy + lmy) / 2
    eyes = float(np.hypot(lex - rex, ley - rey)) or 1.0
    b = face.bbox
    crop = cv2.cvtColor(image[b.y:b.y + b.height, b.x:b.x + b.width], cv2.COLOR_BGR2GRAY) if b.width and b.height else None
    # Sharpness: variance of the Laplacian on the face, at a fixed size (a blurred frame scores low).
    sharp = float(cv2.Laplacian(cv2.resize(crop, (112, 112)), cv2.CV_64F).var()) if crop is not None and crop.size else 0.0
    return Frame(index=index, yaw=(nx - eye_x) / eyes, pitch=(ny - eye_y) / ((mouth_y - eye_y) or 1.0),
                 sharpness=sharp, score=face.detection_score)


def select(frames: list[Frame | None]) -> list[tuple[int, str]]:
    """[(frame index, pose label)], the frontal frame first. Empty when no frame has a usable face."""
    valid = [f for f in frames if f is not None and f.score >= MIN_SCORE]
    if not valid:
        return []
    floor = 0.5 * statistics.median(f.sharpness for f in valid)  # drop the blurred ones (moving head)
    valid = [f for f in valid if f.sharpness >= floor] or valid
    # The guided video starts and ends facing the camera: the median pose is the person's "front".
    yaw0, pitch0 = statistics.median(f.yaw for f in valid), statistics.median(f.pitch for f in valid)
    front = min(valid, key=lambda f: abs(f.yaw - yaw0) + abs(f.pitch - pitch0))
    chosen = [(front.index, "frente")]
    candidates = [
        ("lado 1", min(valid, key=lambda f: f.yaw), lambda f: f.yaw - front.yaw < -TURN),
        ("lado 2", max(valid, key=lambda f: f.yaw), lambda f: f.yaw - front.yaw > TURN),
        ("cima", min(valid, key=lambda f: f.pitch - front.pitch), lambda f: f.pitch - front.pitch < -TILT),
        ("baixo", max(valid, key=lambda f: f.pitch - front.pitch), lambda f: f.pitch - front.pitch > TILT),
    ]
    for label, frame, enough in candidates:
        if enough(frame) and frame.index not in {i for i, _ in chosen}:
            chosen.append((frame.index, label))
    return chosen


# ------------------------------------------------------------------ guided recording (liveness)

STEPS = ("frente", "esquerda", "direita", "cima", "baixo")
# The steps that DECIDE the liveness check. Measured with real faces (17/10/2026, 3 captures): a turn
# gives 0.25-0.46 against a still-camera noise of ±0.04 — a clear signal; a nod gives only 0.03-0.10,
# the same size as the noise (the 5 landmarks barely move when the head tilts). Up/down are still asked
# and kept as poses when they show, but they never fail a real person. The order of the 4 movements is
# drawn per capture, so a recording made before still cannot know WHEN to turn to each side.
REQUIRED = ("esquerda", "direita")


def _movement(step: str, frame: Frame, front: Frame) -> float:
    """How far the head went in the asked direction (positive = the right way). Frames are the
    camera's real image (not the mirrored preview): turning to the person's LEFT moves the nose to
    the image's right (yaw grows); looking UP brings the nose closer to the eyes (pitch shrinks)."""
    return {"esquerda": frame.yaw - front.yaw, "direita": front.yaw - frame.yaw,
            "cima": front.pitch - frame.pitch, "baixo": frame.pitch - front.pitch}[step]


def select_guided(frames: list[Frame | None], steps: list[str]) -> tuple[list[tuple[int, str]], dict]:
    """For a guided recording, where each frame carries the movement asked at that moment: one
    frame per pose (the most pronounced of its step) and the liveness check — did the head go the
    way it was asked, in the order asked? A photo held to the camera cannot turn in 3D, and a video
    recorded before does not follow an order drawn at random for this recording."""
    by_step: dict[str, list[Frame]] = {}
    for frame, step in zip(frames, steps):
        if frame is not None and frame.score >= MIN_SCORE:
            by_step.setdefault(step, []).append(frame)
    fronts = by_step.get("frente") or []
    if not fronts:
        return [], {"passed": False, "steps": [], "reason": "nenhum rosto de frente"}
    yaw0, pitch0 = statistics.median(f.yaw for f in fronts), statistics.median(f.pitch for f in fronts)
    front = min(fronts, key=lambda f: abs(f.yaw - yaw0) + abs(f.pitch - pitch0))
    chosen, report = [(front.index, "frente")], []
    order = [s for i, s in enumerate(steps) if s != "frente" and (i == 0 or steps[i - 1] != s)]
    for step in order:
        candidates = by_step.get(step) or []
        best = max(candidates, key=lambda f: _movement(step, f, front), default=None)
        moved = _movement(step, best, front) if best else None
        # The most pronounced move the OTHER way, only for the "inverted" diagnostic below.
        against = min((_movement(step, f, front) for f in candidates), default=None)
        limit = TURN if step in ("esquerda", "direita") else TILT
        ok = moved is not None and moved > limit
        report.append({"step": step, "movement": round(moved, 3) if moved is not None else None,
                       "against": round(against, 3) if against is not None else None, "limit": limit, "ok": ok,
                       "required": step in REQUIRED})
        if ok:
            chosen.append((best.index, step))
    required = [r for r in report if r["required"]]
    # Diagnostic: every required move clear but in the opposite direction = a sign convention to fix, not a fake.
    inverted = bool(required) and all(r["against"] is not None and -r["against"] > r["limit"] for r in required)
    passed = {r["step"] for r in required} == set(REQUIRED) and all(r["ok"] for r in required)
    return chosen, {"passed": passed, "order": order, "steps": report, "inverted": inverted}
