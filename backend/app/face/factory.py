"""Builds the configured facial recognition adapter.

To add a technology: write `app/face/<name>_engine.py` implementing FaceEngine and add one
line to ENGINES. Nothing else in the system changes.
"""
from __future__ import annotations

from functools import lru_cache
from importlib import import_module

from app.config import get_settings
from app.face.port import FaceEngine

# name in FOTOMAC_FACE_ENGINE -> "module:Class". Imported lazily, so the libraries of
# adapters that are not in use do not even need to be installed.
ENGINES: dict[str, str] = {
    "insightface": "app.face.insightface_engine:InsightFaceEngine",
}


def build_engine(name: str, **kwargs) -> FaceEngine:
    if name not in ENGINES:
        raise ValueError(f"Unknown face engine '{name}'. Available: {', '.join(ENGINES)}")
    module_name, class_name = ENGINES[name].split(":")
    engine = getattr(import_module(module_name), class_name)(**kwargs)
    if not isinstance(engine, FaceEngine):
        raise TypeError(f"{class_name} does not implement the FaceEngine port")
    return engine


@lru_cache
def get_face_engine() -> FaceEngine:
    """Process-wide engine: loading the model takes seconds, so it is done once."""
    settings = get_settings()
    return build_engine(settings.face_engine, min_detection_score=settings.min_detection_score)
