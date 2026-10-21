"""Shared test fixtures.

Database tests run inside a transaction that is rolled back at the end, so the test
database is always left clean — and the append-only audit trigger is never in the way.
"""
from __future__ import annotations

import uuid
from datetime import date

import os
from pathlib import Path

import cv2
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

FIXTURES = Path(__file__).parent / "fixtures"

# Tests drive the queue step by step: no background thread.
os.environ.setdefault("FOTOMAC_BACKGROUND_WORKER", "false")

from app.config import get_settings  # noqa: E402
from app.db import models as m


@pytest.fixture(scope="session")
def db_engine():
    url = get_settings().test_database_url
    assert url and url.endswith("/fotomac_test"), "tests must never touch the main database"
    return create_engine(url)


@pytest.fixture
def db(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def photographer(db) -> m.Account:
    account = m.Account(full_name="Moacir Barbosa", email=f"moacir.{uuid.uuid4().hex[:6]}@cesmac.edu.br",
                        role=m.AccountRole.PHOTOGRAPHER, photographer_signature="Moacir Barbosa")
    db.add(account)
    db.flush()
    return account


@pytest.fixture
def make_event(db, photographer):
    def _make(name: str = "FECIAL 2026 - Dia 1") -> m.Event:
        event = m.Event(name=f"{name} {uuid.uuid4().hex[:4]}", date_precision=m.DatePrecision.DAY,
                        date_start=date(2026, 12, 19), date_end=date(2026, 12, 19),
                        location="Centro Cultural Reitor João Sampaio", description="Feira de ciências",
                        owner_id=photographer.id, expires_on=date(2027, 6, 19))
        db.add(event)
        db.flush()
        return event
    return _make


@pytest.fixture
def make_image(db, photographer):
    def _make(event: m.Event, review_status=m.ImageReviewStatus.IN_REVIEW) -> m.Image:
        image = m.Image(event_id=event.id, uploaded_by=photographer.id,
                        object_key=f"events/{event.id}/{uuid.uuid4()}.jpg", sha256=uuid.uuid4().hex * 2, delivered_sha256=uuid.uuid4().hex * 2,
                        size_bytes=1000, width=1920, height=1080, review_status=review_status,
                        credit_signature="Moacir Barbosa")
        db.add(image)
        db.flush()
        return image
    return _make


@pytest.fixture(scope="session")
def group_photo_bgr():
    """Apollo 11 crew portrait (3 faces), a public-domain NASA photo — see tests/fixtures/README.md.

    Deliberately not a CESMAC photo: the test suite must not carry personal data of event
    participants (LGPD Art. 6, III).
    """
    return cv2.imread(str(FIXTURES / "apollo11_crew.jpg"))
