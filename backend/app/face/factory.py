"""The BUILDER of the facial recognition engine: the catalogue of available technologies, the one
in use, and the safe swap between them.

To add a technology: write `app/face/<name>_engine.py` implementing FaceEngine and add one entry
to ENGINES, with the similarity threshold calibrated for it. Nothing else in the system changes;
the administrator then switches to it in the panel ("Reconhecimento facial").

Which engine is in use is stored in the database (system_parameters, key "face_engine"), so the
administrator chooses it in the panel; FOTOMAC_FACE_ENGINE in the .env is only the value of a
fresh installation. The system NEVER switches by itself — not even when the engine fails: a
broken engine pauses the search (safe failure), because vectors of different models do not compare.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from importlib import import_module

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import SystemParameter
from app.db.session import get_session
from app.face.port import FaceEngine, FaceEngineUnavailable

log = logging.getLogger("fotomac.face")

ACTIVE_KEY = "face_engine"  # row in system_parameters holding the engine chosen in the panel


@dataclass(frozen=True)
class EngineSpec:
    key: str
    label: str
    target: str  # "module:Class", imported only when built
    vector_dim: int
    license: str
    # Thresholds do not carry over between models (each one has its own similarity scale):
    # every engine brings the value calibrated for it, and a swap goes back to it.
    similarity_threshold: float
    calibration: str
    options: dict = field(default_factory=dict)  # passed to the adapter (e.g. a variant's resolution)
    # Only for comparison in the quality test; the builder never makes it the engine in use.
    reference_only: bool = False
    # Score of fotomac-lab's Test 1 (100 × best F1, 388 photos, 1 person), when it was measured.
    lab_score: float | None = None


ENGINES: dict[str, EngineSpec] = {
    "sface": EngineSpec(
        key="sface", label="YuNet + SFace (OpenCV)", target="app.face.sface_engine:SFaceEngine", vector_dim=128,
        license="YuNet: MIT · SFace: Apache 2.0 — uso institucional sem custo",
        similarity_threshold=0.3741,
        calibration="Teste 1 do fotomac-lab (24/09/2026), ponto de melhor F1 (89%): achou 48 das 59 fotos da pessoa "
                    "com 1 foto errada (precisão de 98%).",
        lab_score=89.5),
    # Variants: the same models, detecting on a larger image (small faces of the audience keep more
    # pixels). Slower. Not calibrated yet: the quality test in the panel measures them.
    "sface-2560": EngineSpec(
        key="sface-2560", label="YuNet + SFace — foto a 2560 px", target="app.face.sface_engine:SFaceEngine",
        vector_dim=128, license="YuNet: MIT · SFace: Apache 2.0 — uso institucional sem custo",
        similarity_threshold=0.3741, options={"max_side": 2560},
        calibration="Variante ainda não calibrada: o limiar inicial é o do Teste 1; meça no teste de precisão."),
    "sface-3840": EngineSpec(
        key="sface-3840", label="YuNet + SFace — foto a 3840 px", target="app.face.sface_engine:SFaceEngine",
        vector_dim=128, license="YuNet: MIT · SFace: Apache 2.0 — uso institucional sem custo",
        similarity_threshold=0.3741, options={"max_side": 3840},
        calibration="Variante ainda não calibrada: o limiar inicial é o do Teste 1; meça no teste de precisão."),
    "insightface": EngineSpec(
        key="insightface", label="InsightFace buffalo_l (referência)", target="app.face.insightface_engine:InsightFaceEngine",
        vector_dim=512, license="buffalo_l: somente pesquisa não comercial — por isso não pode ser o modelo em uso",
        similarity_threshold=0.30, reference_only=True, lab_score=97.6,
        calibration="Teste 1 do fotomac-lab: vencedor (97,6). Serve só de régua no teste de precisão."),
}


def spec_for(name: str) -> EngineSpec:
    if name not in ENGINES:
        raise ValueError(f"Unknown face engine '{name}'. Available: {', '.join(ENGINES)}")
    return ENGINES[name]


def build_engine(name: str, **options) -> FaceEngine:
    """Builds a NEW instance of the engine `name`. Model loading problems become FaceEngineUnavailable."""
    spec = spec_for(name)
    settings = get_settings()
    options = {"models_dir": settings.face_models_dir, "min_detection_score": settings.min_detection_score,
               **spec.options, **options}
    module_name, class_name = spec.target.split(":")
    try:
        engine = getattr(import_module(module_name), class_name)(**options)
    except FaceEngineUnavailable:
        raise
    except Exception as exc:  # missing library, unreadable model...
        raise FaceEngineUnavailable(f"Não foi possível carregar o modelo {spec.label} ({type(exc).__name__}).") from exc
    if not isinstance(engine, FaceEngine):
        raise TypeError(f"{class_name} does not implement the FaceEngine port")
    return engine


# Loading a model takes a moment: each engine is built once per process and reused. A failed
# build is not kept, so fixing the file (or setup) is picked up without restarting.
_engines: dict[str, FaceEngine] = {}
_engines_lock = threading.Lock()


def engine_for(name: str) -> FaceEngine:
    with _engines_lock:
        if name not in _engines:
            _engines[name] = build_engine(name)
        return _engines[name]


def active_engine_name(db: Session) -> str:
    row = db.get(SystemParameter, ACTIVE_KEY)
    return str(row.value) if row is not None else get_settings().face_engine


def active_spec(db: Session) -> EngineSpec:
    name = active_engine_name(db)
    if name not in ENGINES or ENGINES[name].reference_only:  # e.g. an adapter removed from the code
        raise FaceEngineUnavailable(f"O modelo configurado ({name}) não existe mais no sistema. Escolha outro no painel.")
    return ENGINES[name]


def active_engine(db: Session) -> FaceEngine:
    return engine_for(active_spec(db).key)


def get_face_engine(db: Session = Depends(get_session)) -> FaceEngine:
    """FastAPI dependency: the engine chosen by the administrator. Raises FaceEngineUnavailable
    (answered with 503 by app.main) when it cannot be loaded."""
    return active_engine(db)


def engine_status(db: Session) -> dict:
    """What the panel shows about the engine in use — works even when it is broken, so the
    administrator can still see the problem and act."""
    name = active_engine_name(db)
    spec = ENGINES.get(name)
    status = {"key": name, "label": spec.label if spec else name, "vector_dim": spec.vector_dim if spec else None,
              "license": spec.license if spec else None,
              "calibrated_threshold": spec.similarity_threshold if spec else None,
              "calibration": spec.calibration if spec else None, "version": None, "error": None}
    try:
        status["version"] = active_engine(db).model_version
    except FaceEngineUnavailable as exc:
        status["error"] = str(exc)
        log.error("face engine unavailable: %s", exc)
    return status


def catalogue() -> list[dict]:
    return [{"key": s.key, "label": s.label, "vector_dim": s.vector_dim, "license": s.license,
             "similarity_threshold": s.similarity_threshold, "reference_only": s.reference_only,
             "lab_score": s.lab_score} for s in ENGINES.values()]
