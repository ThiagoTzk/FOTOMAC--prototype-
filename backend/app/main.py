"""FOTOMAC API — the single REST contract consumed by the web site and the mobile app (RNF19).

Run:  .venv/bin/uvicorn app.main:app --reload
Docs: http://127.0.0.1:8000/api/docs  (OpenAPI generated automatically by FastAPI)
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import accounts, admin_config, auth, calibration, events, images, institutional, public
from app.config import get_settings
from app.db.session import get_engine
from app.face import factory
from app.face.port import FaceEngineUnavailable
from app.storage.factory import get_storage

API_PREFIX = "/api/v1"  # versioned: the mobile app keeps working while v2 is introduced

if get_settings().diagnostics_log:  # DEVELOPMENT ONLY: the liveness numbers go to the API log (config.py)
    _diag = logging.getLogger("fotomac.liveness")
    if not _diag.handlers:
        _handler = logging.StreamHandler()
        _handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(message)s"))
        _diag.addHandler(_handler)
    _diag.setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_storage().ensure_bucket()
    from sqlalchemy.orm import Session as DbSession

    with DbSession(get_engine()) as db:  # request limits chosen by the administrator (RF026)
        public.apply_limits(db)
        # Loading the model takes a moment: do it at startup, not on the first visitor. If it fails
        # the API still starts (safe failure): the search answers 503 and the panel shows why.
        try:
            factory.active_engine(db)
        except FaceEngineUnavailable as exc:
            logging.getLogger("fotomac.face").error("face engine unavailable at startup: %s", exc)
    worker = None
    if get_settings().background_worker:
        from sqlalchemy.orm import sessionmaker

        from app.indexing.worker import Worker
        worker = Worker(sessionmaker(bind=get_engine(), expire_on_commit=False), get_storage(), factory.active_engine)
        worker.start()
    yield
    if worker:
        worker.stop()


app = FastAPI(title="FOTOMAC API", version="0.1.0", lifespan=lifespan,
              docs_url=f"{API_PREFIX}/docs", openapi_url=f"{API_PREFIX}/openapi.json")

# The web front-end runs on another origin (port 8081 in development). Only the listed
# origins may call the API with the session cookie.
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type"])

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def refuse_foreign_writes(request: Request, call_next):
    """CSRF (one site making the browser of a logged-in person send a request): the session cookie is
    SameSite=Lax, which blocks OTHER sites — but every *.cesmac.edu.br counts as the same site. So a
    write is refused when the browser says it comes from an origin that is not ours. Requests without
    Origin (the mobile app, scripts, tests) are not from a browser page and pass to the normal checks."""
    origin = request.headers.get("origin")
    if request.method in WRITE_METHODS and origin and origin not in get_settings().cors_origins:
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": "Origem não permitida."})
    return await call_next(request)



@app.exception_handler(FaceEngineUnavailable)
async def engine_unavailable(_: Request, __: FaceEngineUnavailable) -> JSONResponse:
    """Safe failure: no search with a broken (or another) model. The visitor gets a plain notice —
    the technical reason stays in the log and in the administrator's panel."""
    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"detail": {
        "message": "A busca por reconhecimento facial está temporariamente indisponível. Tente novamente mais tarde.",
        "reason": "engine_unavailable"}})


app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(images.router, prefix=API_PREFIX)
app.include_router(public.router, prefix=API_PREFIX)
app.include_router(accounts.router, prefix=API_PREFIX)
app.include_router(admin_config.router, prefix=API_PREFIX)
app.include_router(calibration.router, prefix=API_PREFIX)
app.include_router(institutional.admin_router, prefix=API_PREFIX)
app.include_router(institutional.public_router, prefix=API_PREFIX)
app.include_router(institutional.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["infra"])
def health() -> dict:
    """Checks the three dependencies. Exposes no personal data and no secrets."""
    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    get_storage().ensure_bucket()
    from sqlalchemy.orm import Session as DbSession

    with DbSession(get_engine()) as db:  # request limits chosen by the administrator (RF026)
        public.apply_limits(db)
        engine = factory.engine_status(db)
    return {"status": "ok" if engine["version"] else "degraded", "database": "ok", "storage": "ok",
            "face_engine": {"model_version": engine["version"], "vector_dim": engine["vector_dim"],
                            "available": engine["version"] is not None}}
