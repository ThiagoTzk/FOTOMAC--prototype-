"""Switching the facial recognition engine from the administrator's panel (RF026 note 3, RF028).

Order matters:
1. the new engine is LOADED first — a model that does not load never becomes the one in use;
2. the choice is stored and logged (who, from what, to what);
3. the model-dependent parameters (similarity threshold) go back to the values calibrated for
   the new model;
4. the whole published collection enters the re-indexing queue. Until each photo is re-indexed it
   is not found by the search (the search only compares vectors of the model in use), and its old
   vectors are deleted as soon as the new ones exist — biometric data of a model no longer in use
   has no purpose left (LGPD Art. 6, III).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import audit, parameters
from app.db.models import Account, ReindexJob, ReindexScope, SystemParameter
from app.events.service import EventError
from app.face import factory
from app.indexing import reindex


class EngineSwitchError(ValueError):
    pass


def switch(db: Session, admin: Account, name: str, acknowledged: bool) -> ReindexJob | None:
    if name not in factory.ENGINES:
        raise EngineSwitchError("Modelo de reconhecimento desconhecido.")
    if factory.ENGINES[name].reference_only:  # licence: comparison only (CESMAC decision, 15/10/2026)
        raise EngineSwitchError(f"{factory.ENGINES[name].label} serve só de comparação no teste de precisão "
                                "e não pode ser o modelo em uso.")
    current = factory.active_engine_name(db)
    if name == current:
        raise EngineSwitchError("Esse já é o modelo em uso.")
    if not acknowledged:  # the consequences are shown on screen AND required here
        raise EngineSwitchError("Confirme que leu as consequências da troca antes de continuar.")
    try:
        engine = factory.engine_for(name)
    except factory.FaceEngineUnavailable as exc:
        raise EngineSwitchError(f"O modelo não foi trocado: {exc}") from None

    previous_values = parameters.all_values(db)
    row = db.get(SystemParameter, factory.ACTIVE_KEY)
    if row is None:
        db.add(SystemParameter(key=factory.ACTIVE_KEY, value=name, updated_by=admin.id))
    else:
        row.value, row.updated_by = name, admin.id
    audit.record(db, "face_engine.changed", admin.id, "parameter", factory.ACTIVE_KEY, previous=current, new=name,
                 version=engine.model_version)
    db.flush()
    parameters.reset_engine_scoped(db, admin, previous_values)
    db.commit()
    try:
        return reindex.request(db, admin, engine, ReindexScope.ALL)
    except EventError:  # nothing published yet: nothing to re-index
        return None
