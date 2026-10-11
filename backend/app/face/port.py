"""The facial recognition PORT: the only thing the rest of the system knows about faces.

Requirement RNF22: "the facial recognition component must be accessed exclusively through
its own internal interface, so that no other layer depends on the adopted library."

How it works (ports & adapters):
- This file defines the "socket" (FaceEngine). It imports no face library at all.
- Each technology is an "adapter" in its own file (insightface_engine.py today) that
  implements this socket.
- app/face/factory.py picks the adapter by name from the configuration.

Swapping technology = writing a new adapter + changing FOTOMAC_FACE_ENGINE.
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

    def __repr__(self) -> str:  # keeps the vector out of logs and tracebacks
        return (f"DetectedFace(bbox={self.bbox}, detection_score={self.detection_score:.3f}, "
                f"detector_index={self.detector_index}, embedding=<{self.embedding.shape[0]} dims hidden>)")


@runtime_checkable
class FaceEngine(Protocol):
    """Contract every facial recognition adapter must fulfil."""

    #: Identifier stored with every vector, e.g. "insightface-1.0.1/buffalo_l".
    model_version: str
    #: Size of the vectors this engine produces (512 for buffalo_l).
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
