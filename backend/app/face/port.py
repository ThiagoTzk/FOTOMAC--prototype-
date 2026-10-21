"""The facial recognition PORT: the only thing the rest of the system knows about faces.

Requirement RNF22: "the facial recognition component must be accessed exclusively through
its own internal interface, so that no other layer depends on the adopted library."

How it works (ports & adapters):
- This file defines the "socket" (FaceEngine). It imports no face library at all.
- Each technology is an "adapter" in its own file (sface_engine.py today: YuNet + SFace)
  that implements this socket.
- app/face/factory.py (the builder) lists the adapters and builds the one the administrator
  chose in the panel.

Swapping technology = writing a new adapter + one line in factory.ENGINES; the administrator
then switches to it in the panel ("Reconhecimento facial"), which re-indexes the collection.
Vectors from different models are NOT comparable, which is why every vector is stored
with `model_version` and a model swap triggers re-indexing (RF010 note 7, RF028).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np


@dataclass(frozen=True)
class BoundingBox:
    """Face region in pixels of the analysed image: top-left corner + size."""

    x: int
    y: int
    width: int
    height: int

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def min_side(self) -> int:
        return min(self.width, self.height)


@dataclass(frozen=True)
class DetectedFace:
    bbox: BoundingBox
    detection_score: float
    # L2-normalised feature vector: cosine similarity is a plain dot product.
    # Sensitive biometric personal data (LGPD Art. 5, II) — never log or print it.
    embedding: np.ndarray
    # Position in the list the detector returned; last tie-breaker of RF017.
    detector_index: int
    # The 5 points of the face (eyes, nose tip, mouth corners), in pixels, when the detector gives
    # them — used only to tell the POSE of a frame in the guided capture (public search and precision
    # test). Never stored.
    landmarks: tuple[tuple[float, float], ...] | None = None

    def __repr__(self) -> str:  # keeps the vector out of logs and tracebacks
        return (f"DetectedFace(bbox={self.bbox}, detection_score={self.detection_score:.3f}, "
                f"detector_index={self.detector_index}, embedding=<{self.embedding.shape[0]} dims hidden>)")


@runtime_checkable
class FaceEngine(Protocol):
    """Contract every facial recognition adapter must fulfil."""

    #: Identifier stored with every vector, e.g. "opencv-5.0.0/yunet-2023mar+sface-2021dec/teste1".
    model_version: str
    #: Size of the vectors this engine produces (128 for SFace).
    vector_dim: int

    def detect(self, image: np.ndarray) -> list[DetectedFace]:
        """Detect every face in a BGR uint8 image and return one vector per face.

        Must work purely in memory: never write the image, the crops or the vectors to
        disk, logs or caches (RF016 note 4, RF024 note 6).
        """
        ...


class FaceEngineError(Exception):
    """Base class for face processing errors. Messages are safe to show to end users."""


class InvalidImageError(FaceEngineError):
    pass


class NoFaceDetectedError(FaceEngineError):
    pass


class FaceQualityTooLowError(FaceEngineError):
    pass


class FaceEngineUnavailable(FaceEngineError):
    """The engine could not be loaded (model file missing or altered). Safe failure: the search
    pauses with a notice and the indexing queue waits — the system never falls back to another
    model by itself, because vectors of different models do not compare."""
