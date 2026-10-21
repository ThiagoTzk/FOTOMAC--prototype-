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
                        ForeignKey, Integer, BigInteger, LargeBinary, SmallInteger, String, Table, Text,
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
    MARKETING = "marketing"      # requirements v2.0, RF030: same functions as the photographer
    CONTRACTOR = "contractor"    # RF031: hired photographer, temporary account bound to one event


# Profiles that send photos and therefore sign them (credit, RF001 note 4).
AUTHOR_ROLES = frozenset({AccountRole.PHOTOGRAPHER, AccountRole.MARKETING, AccountRole.CONTRACTOR})
# Profiles that create events and themes and collaborate (RF004, RF025, RF027).
PRODUCER_ROLES = frozenset({AccountRole.PHOTOGRAPHER, AccountRole.MARKETING})


class AccountStatus(str, enum.Enum):
    PENDING = "pending"        # "Acesso Pendente": no password yet, cannot log in
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    EXPIRED = "expired"        # temporary account after its 24 h (RF003 note 6): never reactivated


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
    # Temporary account of the hired photographer (RF031). CPF and birth date are ENCRYPTED with
    # pgcrypto (key in the settings, never in the database) and erased when their retention ends.
    bound_event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    contract_number: Mapped[str | None] = mapped_column(String(60))
    cpf_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    birth_date_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    media_gone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    identity_erased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:  # keeps the encrypted identity out of logs and tracebacks
        return f"Account(id={self.id}, role={self.role.value}, status={self.status.value})"


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
    # Symbol chosen by whoever creates the theme (a lucide icon name), shown in the public strip.
    icon: Mapped[str] = mapped_column(String(40), default="tag", server_default="tag")
    # Who created it (owner). None for the themes created before photographers could create them.
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))


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
    # "Excluir evento" with a grace period (17/10/2026): out of the public area and without face
    # vectors at once; the photos are eliminated at deletion_due_at unless the deletion is undone.
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())

    # Two links to accounts (owner, who asked for the deletion): the owner is owner_id.
    owner: Mapped[Account] = relationship(foreign_keys="Event.owner_id")
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
    # Photos of a temporary account: "pending" until the administrator approves them (RF031 note 3).
    approval: Mapped[str | None] = mapped_column(String(10))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    credit_signature: Mapped[str] = mapped_column(String(80))      # fixed at upload (RF007 note 7)
    thumb_key: Mapped[str | None] = mapped_column(Text)            # reduced copies for the screens
    preview_key: Mapped[str | None] = mapped_column(Text)
    # A photo sent in PNG, WebP, HEIC or camera RAW: object_key is its JPEG copy and the original, as
    # received (without GPS, with the credits), stays here (RF007 notes 9 and 13). NULL for a JPEG.
    source_key: Mapped[str | None] = mapped_column(Text)
    source_format: Mapped[str | None] = mapped_column(String(8))    # file extension: heic, png, dng...
    source_bytes: Mapped[int | None] = mapped_column(BigInteger)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    indexing_model_version: Mapped[str | None] = mapped_column(String(80))
    last_error: Mapped[str | None] = mapped_column(String(200))    # technical cause, never personal data
    reprocess_requests: Mapped[int] = mapped_column(SmallInteger, default=0)
    reprocess_window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    event: Mapped[Event] = relationship()
    uploader: Mapped[Account] = relationship(foreign_keys="Image.uploaded_by")

    @property
    def storage_keys(self) -> list[str]:
        """Every file of this image in the storage: deleting one means deleting all (RF011 note 4)."""
        return [k for k in (self.object_key, self.thumb_key, self.preview_key, self.source_key) if k]
    approver: Mapped[Account | None] = relationship(foreign_keys="Image.approved_by")


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
    # Marketing's package of someone else's event, for institutional publicity (RF030 note 3): the
    # JPEG copies. Every other package is the guard copy, with the originals as received (RF012 note 2).
    publicity: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
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
    # Guided capture (RF036): the order of movements drawn by the server, used by ONE search.
    capture_order: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    capture_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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


# ---------------------------------------------------------------- recognition quality test (RNF18, RF026)

class RecognitionTest(Base):
    """fotomac-lab's Test 1 inside the panel: one event, one consented query photo, one ground truth."""
    __tablename__ = "recognition_tests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label: Mapped[str] = mapped_column(String(80))
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    event_name: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_confirmed: Mapped[bool] = mapped_column(Boolean)
    query_key: Mapped[str | None] = mapped_column(Text)
    # Several poses (video or photos): the label of each kept frame, stored at f"{query_key}-{n}".
    # None = one photo, stored at query_key itself.
    query_poses: Mapped[list | None] = mapped_column(JSONB)
    # Guided recording: movements asked, movement measured in each, and whether all were made.
    query_liveness: Mapped[dict | None] = mapped_column(JSONB)


class RecognitionTestMark(Base):
    """Ground truth of one photo: the person is in it or not. Shared by every candidate engine."""
    __tablename__ = "recognition_test_marks"

    test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recognition_tests.id", ondelete="CASCADE"), primary_key=True)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    mark: Mapped[str] = mapped_column(String(10))
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecognitionRun(Base):
    """One candidate engine run over the test's event: its ranking, speed and (when closed) result."""
    __tablename__ = "recognition_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recognition_tests.id", ondelete="CASCADE"))
    engine_key: Mapped[str] = mapped_column(String(40))
    engine_label: Mapped[str] = mapped_column(String(120))
    model_version: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(10), default="pending")
    total: Mapped[int] = mapped_column(Integer, default=0)
    done: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    load_s: Mapped[float | None] = mapped_column(Float)
    index_s_per_photo: Mapped[float | None] = mapped_column(Float)
    query_ms: Mapped[float | None] = mapped_column(Float)
    search_ms: Mapped[float | None] = mapped_column(Float)
    faces: Mapped[int | None] = mapped_column(Integer)
    result: Mapped[dict | None] = mapped_column(JSONB)


class RecognitionRunScore(Base):
    """Best face of one photo against the query, for one run. Deleted when the test is closed."""
    __tablename__ = "recognition_run_scores"

    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recognition_runs.id", ondelete="CASCADE"), primary_key=True)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    # How the query was used: one frame ("single"), the best of the poses ("max"), the mean of the poses ("mean").
    view: Mapped[str] = mapped_column(String(8), primary_key=True, default="single")
    similarity: Mapped[float] = mapped_column(Float)
    bbox_x: Mapped[int] = mapped_column(Integer)
    bbox_y: Mapped[int] = mapped_column(Integer)
    bbox_width: Mapped[int] = mapped_column(Integer)
    bbox_height: Mapped[int] = mapped_column(Integer)
    wrong_face: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------- institutional people (RF020, RF021)

class InstitutionalStatus(str, enum.Enum):
    AWAITING = "awaiting"   # "Aguardando autorização": photos stored, NEVER processed
    ACTIVE = "active"       # signed: reference vectors exist and the collection is searched
    REVOKED = "revoked"     # photos, vectors and marks gone; the signed term stays as proof


class InstitutionalPerson(Base):
    """Someone in an institutional representation role who signs, by an e-mailed link, the term that
    allows FOTOMAC to find them in the whole published collection (RF020) — the only search across
    events the system makes, and only for those who authorized it (RF021 note 3)."""
    __tablename__ = "institutional_people"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(120))
    position: Mapped[str] = mapped_column(String(100))
    unit: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254))
    status: Mapped[InstitutionalStatus] = mapped_column(_enum(InstitutionalStatus, "institutional_status"),
                                                        default=InstitutionalStatus.AWAITING)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    link_token_hash: Mapped[str | None] = mapped_column(String(64))
    link_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    link_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Proof of the electronic signature (RF020 note 3; LGPD Art. 8 §2).
    term_version: Mapped[str | None] = mapped_column(String(20))
    # The exact text signed (title + paragraphs): a later version of the term never rewrites an old signature.
    signed_term: Mapped[list | None] = mapped_column(JSONB)
    # SHA-256 of the photos shown when signing: the verification code can still be recomputed after a
    # revocation has eliminated the photos (a hash does not allow rebuilding a face).
    signed_photos: Mapped[list | None] = mapped_column(JSONB)
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    authorized_ip: Mapped[str | None] = mapped_column(String(45))
    authorized_user_agent: Mapped[str | None] = mapped_column(String(300))
    signature_key: Mapped[str | None] = mapped_column(Text)
    document_sha256: Mapped[str | None] = mapped_column(String(64))
    revoke_token_hash: Mapped[str | None] = mapped_column(String(64))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[str | None] = mapped_column(String(10))
    scan_status: Mapped[str] = mapped_column(String(10), default="idle", server_default="idle")
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    references_model_version: Mapped[str | None] = mapped_column(String(80))

    photos: Mapped[list["InstitutionalPhoto"]] = relationship(order_by="InstitutionalPhoto.position",
                                                               cascade="all, delete-orphan", passive_deletes=True)


class InstitutionalPhoto(Base):
    __tablename__ = "institutional_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutional_people.id", ondelete="CASCADE"))
    object_key: Mapped[str] = mapped_column(Text, unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    position: Mapped[int] = mapped_column(SmallInteger)
    faces_found: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InstitutionalVector(Base):
    """SENSITIVE biometric data (LGPD Art. 5, II), segregated from the collection's vectors and used
    only for RF021. The database refuses a row of someone who has not authorized (migration 0024)."""
    __tablename__ = "institutional_vectors"
    __table_args__ = (CheckConstraint("vector_dims(embedding) = dim", name="ck_institutional_vector_dim"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutional_people.id", ondelete="CASCADE"))
    photo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutional_photos.id", ondelete="CASCADE"))
    model_version: Mapped[str] = mapped_column(String(80))
    dim: Mapped[int] = mapped_column(SmallInteger)
    embedding = mapped_column(Vector())


class InstitutionalMark(Base):
    """"Pessoa institucional localizada" in a published image (RF021 note 3), confirmed or rejected by
    a person of the team before any institutional use (note 7)."""
    __tablename__ = "institutional_marks"

    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutional_people.id", ondelete="CASCADE"), primary_key=True)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    similarity: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
