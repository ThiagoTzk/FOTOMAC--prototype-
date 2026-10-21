"""Application settings, read from environment variables / backend/.env.

Everything that changes between the developer's machine and the CESMAC server lives here,
so moving to production is a configuration change, never a code change.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FOTOMAC_", env_file=BACKEND_DIR / ".env", extra="ignore"
    )

    database_url: str
    test_database_url: str | None = None

    # Object storage (SeaweedFS speaks the S3 protocol).
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str = "fotomac-acervo"
    s3_region: str = "us-east-1"  # S3 clients require one; SeaweedFS ignores it.

    # Facial recognition engine of a FRESH installation (see app/face/factory.py). After that, the
    # administrator chooses it in the panel and the choice lives in the database.
    face_engine: str = "sface"
    # Folder with the model files (ONNX). Not versioned: infra/setup_local.sh downloads them.
    face_models_dir: Path = BACKEND_DIR / "models"

    # FACTORY defaults of parameters the administrator can change in the panel (RF026, app/parameters.py).
    # Detection confidence: 0.50 is the value of fotomac-lab's Test 1 for YuNet (MIN_DET_SCORE), kept
    # so production behaves like the model that was measured. The similarity threshold is not here:
    # each engine brings its own calibrated value (factory.ENGINES).
    min_detection_score: float = 0.5
    # Query face only (RF017): smallest accepted face side, in pixels, in the visitor's selfie.
    min_query_face_side: int = 40
    max_results_per_search: int = 200

    # Web front-end (Expo) — used to build the links sent by e-mail and for CORS.
    frontend_url: str = "http://localhost:8081"
    cors_origins: list[str] = ["http://localhost:8081"]

    # Authentication (RF001, RF002).
    session_hours: int = 8                  # one working day; then log in again
    cookie_secure: bool = False             # True in production (HTTPS only, RNF10)
    activation_link_hours: int = 24         # RF001 note 5
    reset_link_minutes: int = 30            # RF002 note 6
    max_failed_logins: int = 5              # RF002 note 7
    lockout_minutes: int = 15

    # E-mail adapter: "outbox" writes the messages to backend/outbox/ (development only).
    email_sender: str = "outbox"

    # Background queue (facial indexing, packages) inside the API process. Tests turn it off
    # and drive the queue step by step.
    background_worker: bool = True

    # DEVELOPMENT ONLY: logs the numbers measured by the liveness check of the public search
    # (how far the head turned in each step, how alike the poses are). Numbers only — never an
    # image, a frame or a vector. Used to confirm the movement convention with real faces; off
    # in production (RF024 note 6).
    diagnostics_log: bool = False

    # Key of the pgcrypto encryption of the hired photographer's CPF and birth date (RF031 note 7).
    # Lives ONLY here (backend/.env, outside the database): a copy of the database alone does not
    # reveal them. Required to create temporary accounts.
    identity_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
