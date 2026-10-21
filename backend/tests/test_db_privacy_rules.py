"""Privacy rules enforced by the DATABASE itself (second line of defence after the code).

RNF20 asks for tests proving "the impossibility of indexing without prior publication".
"""
import numpy as np
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.db import models as m


def vector(seed: int, dim: int = 128) -> np.ndarray:
    v = np.random.default_rng(seed).normal(size=dim).astype(np.float32)
    return v / np.linalg.norm(v)


def add_face(db, image: m.Image, emb: np.ndarray, event_id=None) -> m.FaceEmbedding:
    row = m.FaceEmbedding(image_id=image.id, event_id=event_id or image.event_id,
                          model_version="opencv-5.0.0/yunet-2023mar+sface-2021dec/teste1", dim=emb.shape[0], embedding=emb,
                          bbox_x=0, bbox_y=0, bbox_width=100, bbox_height=100, detection_score=0.9)
    db.add(row)
    db.flush()
    return row


@pytest.mark.parametrize("status", [m.ImageReviewStatus.IN_REVIEW, m.ImageReviewStatus.DISCARDED])
def test_vector_refused_for_unpublished_image(db, make_event, make_image, status):
    image = make_image(make_event(), status)
    with pytest.raises(DBAPIError, match="RNF13"):
        add_face(db, image, vector(1))


def test_unpublished_image_cannot_be_queued_for_indexing(db, make_event, make_image):
    image = make_image(make_event())
    image.indexing_status = m.ImageIndexingStatus.PENDING
    with pytest.raises(IntegrityError, match="ck_index_only_published"):
        db.flush()


def test_vector_accepted_for_published_image(db, make_event, make_image):
    image = make_image(make_event(), m.ImageReviewStatus.PUBLISHED)
    assert add_face(db, image, vector(1)).id is not None


def test_vector_cannot_be_attached_to_another_event(db, make_event, make_image):
    image = make_image(make_event(), m.ImageReviewStatus.PUBLISHED)
    other = make_event("Outro evento")
    with pytest.raises(DBAPIError, match="does not match"):
        add_face(db, image, vector(1), event_id=other.id)


def test_deleting_image_deletes_its_vectors(db, make_event, make_image):
    """RF011 note 4: removing a photo removes every biometric vector derived from it."""
    image = make_image(make_event(), m.ImageReviewStatus.PUBLISHED)
    add_face(db, image, vector(1))
    add_face(db, image, vector(2))
    db.delete(image)
    db.flush()
    assert db.scalar(select(text("count(*)")).select_from(m.FaceEmbedding).where(
        m.FaceEmbedding.image_id == image.id)) == 0


def test_search_is_scoped_to_one_event(db, make_event, make_image):
    """RF010 note 4: the same face in another event is never returned."""
    query = vector(42)
    near = query + 0.05 * vector(7)
    near /= np.linalg.norm(near)

    event_a, event_b = make_event("Evento A"), make_event("Evento B")
    add_face(db, make_image(event_a, m.ImageReviewStatus.PUBLISHED), near)
    add_face(db, make_image(event_b, m.ImageReviewStatus.PUBLISHED), near)   # same person elsewhere

    distance = m.FaceEmbedding.embedding.cosine_distance(query)
    rows = db.execute(select(m.FaceEmbedding.event_id, (1 - distance).label("similarity"))
                      .where(m.FaceEmbedding.event_id == event_a.id)
                      .order_by(distance)).all()
    assert [r.event_id for r in rows] == [event_a.id]
    assert rows[0].similarity > 0.95


def test_wrong_vector_size_is_rejected(db, make_event, make_image):
    image = make_image(make_event(), m.ImageReviewStatus.PUBLISHED)
    row = m.FaceEmbedding(image_id=image.id, event_id=image.event_id, model_version="x", dim=512,
                          embedding=vector(1), bbox_x=0, bbox_y=0, bbox_width=1,
                          bbox_height=1, detection_score=0.9)
    db.add(row)
    with pytest.raises(IntegrityError, match="ck_embedding_dim"):
        db.flush()


def test_audit_log_cannot_be_altered(db, photographer):
    """RF024 note 1: not even the administrator can edit or erase the trail."""
    entry = m.AuditLog(actor_account_id=photographer.id, action="event.create", target_type="event")
    db.add(entry)
    db.flush()
    with pytest.raises(DBAPIError, match="append-only"):
        with db.begin_nested():
            db.execute(text("UPDATE audit_log SET action = 'tampered' WHERE id = :id"), {"id": entry.id})
    with pytest.raises(DBAPIError, match="append-only"):
        with db.begin_nested():
            db.execute(text("DELETE FROM audit_log WHERE id = :id"), {"id": entry.id})


def test_email_is_unique_ignoring_case(db, photographer):
    twin = m.Account(full_name="Outro Nome", email=photographer.email.upper(),
                     role=m.AccountRole.ADMIN)
    db.add(twin)
    with pytest.raises(IntegrityError, match="uq_accounts_email_ci"):
        db.flush()


@pytest.mark.parametrize("role", [m.AccountRole.PHOTOGRAPHER, m.AccountRole.MARKETING])
def test_whoever_sends_photos_needs_a_signature(db, role):
    """The credit of every photo (RF001 note 4) — also for the marketing team (v2.0)."""
    db.add(m.Account(full_name="Sem Assinatura", email="sem@cesmac.edu.br", role=role))
    with pytest.raises(IntegrityError, match="ck_author_signature"):
        db.flush()


def test_an_active_contractor_always_has_its_identification(db):
    """RF031 note 6: the temporary account works only with CPF and birth date — the database refuses
    an active hired photographer without them (encrypted), even if the code forgot."""
    db.add(m.Account(full_name="Contratado Sem Dados", email="contratado@exemplo.com", role=m.AccountRole.CONTRACTOR,
                     photographer_signature="Contratado", contract_number="CT-1", password_hash="x",
                     status=m.AccountStatus.ACTIVE))
    with pytest.raises(IntegrityError, match="ck_contractor_identity"):
        db.flush()


def test_identification_fields_exist_only_for_contractors(db):
    db.add(m.Account(full_name="Fotografo Com Contrato", email="foto@cesmac.edu.br", role=m.AccountRole.PHOTOGRAPHER,
                     photographer_signature="Foto", contract_number="CT-2"))
    with pytest.raises(IntegrityError, match="ck_contractor_fields_only"):
        db.flush()
