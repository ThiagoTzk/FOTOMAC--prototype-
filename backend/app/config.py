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

    # Facial recognition adapter, chosen by name (see app/face/factory.py).
    face_engine: str = "insightface"

    # FACTORY defaults of parameters the administrator can change in the panel (RF026, app/parameters.py).
    # Detection confidence: 0.5 is InsightFace's own factory value (FaceAnalysis det_thresh),
    # kept unchanged so production behaves like the model measured in fotomac-lab's Test 1.
    min_detection_score: float = 0.5
    # Query face only (RF017): smallest accepted face side, in pixels, in the visitor's selfie.
    min_query_face_side: int = 40
    # Cosine similarity threshold (RF016). Test 1: the highest-scoring WRONG photo was 0.2783,
    # so 0.30 returned no third-party photo. Precision over recall (RF016 note 6, RNF18).
    similarity_threshold: float = 0.30
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
