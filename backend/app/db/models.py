"""Relational model (PostgreSQL + pgvector).

Mirrors the requirements document v1.6. The schema itself is created by the Alembic
migrations in backend/migrations — these classes are how Python code reads and writes it.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (Boolean, CheckConstraint, Column, Date, DateTime, Enum, Float,
                        ForeignKey, Integer, BigInteger, SmallInteger, String, Table, Text,
                        UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    # Store the enum's value (e.g. "published"), not its Python name.
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])


# ---------------------------------------------------------------- accounts (RF001-RF003)

class AccountRole(str, enum.Enum):
    ADMIN = "admin"
    PHOTOGRAPHER = "photographer"


class AccountStatus(str, enum.Enum):
    PENDING = "pending"        # "Acesso Pendente": no password yet, cannot log in
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class Account(Base):
    __tablename__ = "accounts"

    # Random UUIDs everywhere: ids cannot be guessed or enumerated (RF007 note 6).
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(100))  # unique case-insensitively (see migration)
    role: Mapped[AccountRole] = mapped_column(_enum(AccountRole, "account_role"))
    photographer_signature: Mapped[str | None] = mapped_column(String(80))
    # bcrypt/Argon2 hash only; NULL while "Acesso Pendente" (RF001 note 5).
    password_hash: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AccountStatus] = mapped_column(_enum(AccountStatus, "account_status"),
                                                  default=AccountStatus.PENDING)
    failed_login_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())


class Session(Base):
    """Server-side login session (RF002). Only the SHA-256 of the cookie value is stored."""
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    account: Mapped[Account] = relationship()


class PasswordTokenPurpose(str, enum.Enum):
    ACTIVATION = "activation"  # first access: the account has no password yet (RF001)
    RESET = "reset"            # forgot my password (RF002)


class PasswordToken(Base):
    """Single-use link sent by e-mail. Only the SHA-256 of the token is stored."""
    __tablename__ = "password_tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    purpose: Mapped[PasswordTokenPurpose] = mapped_column(_enum(PasswordTokenPurpose, "password_token_purpose"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    account: Mapped[Account] = relationship()


# ---------------------------------------------------------------- themes (RF027)

class Theme(Base):
    __tablename__ = "themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


event_themes = Table(
    "event_themes", Base.metadata,
    Column("event_id", UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), primary_key=True),
    Column("theme_id", Integer, ForeignKey("themes.id", ondelete="RESTRICT"), primary_key=True),
)


# ---------------------------------------------------------------- events (RF004-RF006, RF025)

class DatePrecision(str, enum.Enum):
    DAY = "day"                # "21/08/2026"
    MONTH = "month"            # "Agosto/2026"
    MONTH_RANGE = "month_range"  # "Junho a Agosto/2026"


class EventStatus(str, enum.Enum):
    EDITING = "editing"        # "Em Edição"
    PROCESSING = "processing"  # "Em Processamento"
    PUBLISHED = "published"    # "Publicado"
    EXPIRED = "expired"        # "Expirado"


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("name", "date_start", name="uq_event_name_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150))
    date_precision: Mapped[DatePrecision] = mapped_column(_enum(DatePrecision, "date_precision"))
    date_start: Mapped[date] = mapped_column(Date)
    date_end: Mapped[date] = mapped_column(Date)
    location: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(String(300))
    cover_object_key: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    status: Mapped[EventStatus] = mapped_column(_enum(EventStatus, "event_status"),
                                                default=EventStatus.EDITING)
    collaboration_open: Mapped[bool] = mapped_column(Boolean, default=False)  # RF025
    expires_on: Mapped[date] = mapped_column(Date)  # RNF12: computed from the event date
    expiry_notice_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # RF006 note 5
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())

    owner: Mapped[Account] = relationship()
    themes: Mapped[list[Theme]] = relationship(secondary=event_themes)


# ---------------------------------------------------------------- images (RF007-RF011)

class ImageReviewStatus(str, enum.Enum):
    IN_REVIEW = "in_review"    # "Em Conferência"
    DISCARDED = "discarded"    # "Descartada" (recoverable until the set is published)
    PUBLISHED = "published"    # "Publicada"


class ImageIndexingStatus(str, enum.Enum):
    NOT_QUEUED = "not_queued"  # never indexed: not published yet (RNF13)
    PENDING = "pending"
    PROCESSED = "processed"
    NO_FACES = "no_faces"      # "Sem faces detectadas"
    FAILED = "failed"          # "Falha"


class Image(Base):
    __tablename__ = "images"
    __table_args__ = (UniqueConstraint("event_id", "sha256", name="uq_image_event_checksum"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    object_key: Mapped[str] = mapped_column(Text, unique=True)
    sha256: Mapped[str] = mapped_column(String(64))  # deduplication (RF007 note 10)
    delivered_sha256: Mapped[str] = mapped_column(String(64))  # of the file downloaded (removal by file, RF023)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_status: Mapped[ImageReviewStatus] = mapped_column(
        _enum(ImageReviewStatus, "image_review_status"), default=ImageReviewStatus.IN_REVIEW)
    indexing_status: Mapped[ImageIndexingStatus] = mapped_column(
        _enum(ImageIndexingStatus, "image_indexing_status"), default=ImageIndexingStatus.NOT_QUEUED)
    indexing_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    faces_count: Mapped[int | None] = mapped_column(SmallInteger)
    removal_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # RF023
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    credit_signature: Mapped[str] = mapped_column(String(80))      # fixed at upload (RF007 note 7)
    thumb_key: Mapped[str | None] = mapped_column(Text)            # reduced copies for the screens
    preview_key: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    indexing_model_version: Mapped[str | None] = mapped_column(String(80))
    last_error: Mapped[str | None] = mapped_column(String(200))    # technical cause, never personal data
    reprocess_requests: Mapped[int] = mapped_column(SmallInteger, default=0)
    reprocess_window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    event: Mapped[Event] = relationship()
    uploader: Mapped[Account] = relationship()


# ---------------------------------------------------------------- face vectors (RF010)

class FaceEmbedding(Base):
    """SENSITIVE biometric data (LGPD Art. 5, II) — kept in its own table.

    Segregated from the rest so access, logging and deletion can be reasoned about in one
    place. The database itself refuses a row whose image is not published (RNF13) and
    deletes the rows together with the image or event (ON DELETE CASCADE, RF011 note 4).
    """
    __tablename__ = "face_embeddings"
    __table_args__ = (CheckConstraint("vector_dims(embedding) = dim", name="ck_embedding_dim"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"))
    # Repeated from images.event_id so every search is filtered by event without a join:
    # the search scope is ONE event, by design (RF010 note 4, RF016 note 1).
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    model_version: Mapped[str] = mapped_column(String(80))
    dim: Mapped[int] = mapped_column(SmallInteger)
    # No fixed dimension in the column: a future model with another size coexists during
    # re-indexing without a schema change (RNF22, RF028 note 3).
    embedding = mapped_column(Vector())
    bbox_x: Mapped[int] = mapped_column(Integer)
    bbox_y: Mapped[int] = mapped_column(Integer)
    bbox_width: Mapped[int] = mapped_column(Integer)
    bbox_height: Mapped[int] = mapped_column(Integer)
    detection_score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:  # never print the vector
        return f"FaceEmbedding(id={self.id}, image_id={self.image_id}, model={self.model_version})"


# ---------------------------------------------------------------- packages (RF012)

class PackageStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"
    EXPIRED = "expired"


class ReindexScope(str, enum.Enum):
    EVENT = "event"
    MODEL_VERSION = "model_version"
    ALL = "all"


class ReindexJob(Base):
    """RF028: one re-indexing request (scope, versions, who, progress)."""
    __tablename__ = "reindex_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope: Mapped[ReindexScope] = mapped_column(_enum(ReindexScope, "reindex_scope"))
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    from_version: Mapped[str | None] = mapped_column(String(60))
    to_version: Mapped[str] = mapped_column(String(60))
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total: Mapped[int] = mapped_column(Integer)


class ReindexItem(Base):
    """One image in the re-indexing queue — a queue of its own, apart from publication (note 2)."""
    __tablename__ = "reindex_items"

    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reindex_jobs.id", ondelete="CASCADE"), primary_key=True)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0)


class PackageJob(Base):
    __tablename__ = "package_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    only_own: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[PackageStatus] = mapped_column(_enum(PackageStatus, "package_status"), default=PackageStatus.PENDING)
    file_name: Mapped[str] = mapped_column(String(220))
    object_key: Mapped[str | None] = mapped_column(Text)
    image_count: Mapped[int] = mapped_column(Integer, default=0)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    progress: Mapped[int] = mapped_column(SmallInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    event: Mapped[Event] = relationship()


# ---------------------------------------------------------------- public area (RF013-RF019, RF023)

class ConsentRecord(Base):
    """RF015 note 7: occurrence only — no link to the person, the selfie or the device."""
    __tablename__ = "consent_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    text_version: Mapped[str] = mapped_column(String(20))
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VisitorSession(Base):
    __tablename__ = "visitor_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    consent_id: Mapped[int] = mapped_column(ForeignKey("consent_records.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    searches: Mapped[int] = mapped_column(SmallInteger, default=0)
    result_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)


class RemovalStatus(str, enum.Enum):
    RECEIVED = "received"                                   # "Recebida"
    DELETED_BY_PHOTOGRAPHER = "deleted_by_photographer"     # "Excluída pelo fotógrafo"
    DELETED_AUTOMATICALLY = "deleted_automatically"         # "Excluída automaticamente"


class RemovalRequest(Base):
    __tablename__ = "removal_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(String(500))
    contact_email: Mapped[str | None] = mapped_column(String(120))   # erased on conclusion (RF023 note 3)
    status: Mapped[RemovalStatus] = mapped_column(_enum(RemovalStatus, "removal_status"), default=RemovalStatus.RECEIVED)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    concluded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- parameters (RF026)

class SystemParameter(Base):
    __tablename__ = "system_parameters"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[object] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))


# ---------------------------------------------------------------- audit trail (RF024)

class AuditLog(Base):
    """Append-only: a database trigger rejects UPDATE and DELETE, for every role,
    including the administrator (RF024 note 1). Never stores images or vectors (note 6)."""
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actor_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(80))
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
