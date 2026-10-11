"""FOTOMAC API — the single REST contract consumed by the web site and the mobile app (RNF19).

Run:  .venv/bin/uvicorn app.main:app --reload
Docs: http://127.0.0.1:8000/api/docs  (OpenAPI generated automatically by FastAPI)
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import accounts, admin_config, auth, events, images, public
from app.config import get_settings
from app.db.session import get_engine
from app.face.factory import get_face_engine
from app.storage.factory import get_storage

API_PREFIX = "/api/v1"  # versioned: the mobile app keeps working while v2 is introduced


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_storage().ensure_bucket()
    from sqlalchemy.orm import Session as DbSession

    with DbSession(get_engine()) as db:  # request limits chosen by the administrator (RF026)
        public.apply_limits(db)
    # Loading the model takes a few seconds: do it at startup, not on the first visitor.
    engine = get_face_engine()
    worker = None
    if get_settings().background_worker:
        from sqlalchemy.orm import sessionmaker

        from app.indexing.worker import Worker
        worker = Worker(sessionmaker(bind=get_engine(), expire_on_commit=False), get_storage(), engine)
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

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(images.router, prefix=API_PREFIX)
app.include_router(public.router, prefix=API_PREFIX)
app.include_router(accounts.router, prefix=API_PREFIX)
app.include_router(admin_config.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["infra"])
def health() -> dict:
    """Checks the three dependencies. Exposes no personal data and no secrets."""
    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    get_storage().ensure_bucket()
    from sqlalchemy.orm import Session as DbSession

    with DbSession(get_engine()) as db:  # request limits chosen by the administrator (RF026)
        public.apply_limits(db)
    engine = get_face_engine()
    return {"status": "ok", "database": "ok", "storage": "ok",
            "face_engine": {"model_version": engine.model_version, "vector_dim": engine.vector_dim}}
