"""The S3 adapter against the real local SeaweedFS (start it with infra/seaweedfs.sh start)."""
import uuid

import boto3
import httpx
import pytest
from botocore import UNSIGNED
from botocore.config import Config

from app.config import get_settings
from app.storage.factory import get_storage

JPEG = b"\xff\xd8\xff\xe0" + b"fake-jpeg-body" * 10


@pytest.fixture(scope="module")
def storage():
    s = get_storage()
    s.ensure_bucket()
    return s


@pytest.fixture
def key():
    return f"tests/{uuid.uuid4()}.jpg"


def test_put_get_delete_roundtrip(storage, key):
    storage.put(key, JPEG, "image/jpeg")
    assert storage.exists(key)
    assert storage.get(key) == JPEG          # stored byte-for-byte, no recompression (RF007 note 9)
    storage.delete(key)
    assert not storage.exists(key)
    storage.delete(key)                       # idempotent: deleting twice is fine


def test_bucket_refuses_anonymous_access(storage, key):
    """RS020 / RNF10: without credentials nobody can read or list the photos."""
    storage.put(key, JPEG, "image/jpeg")
    try:
        s = get_settings()
        assert httpx.get(f"{s.s3_endpoint}/{s.s3_bucket}/{key}").status_code in (401, 403)
        anonymous = boto3.client("s3", endpoint_url=s.s3_endpoint, region_name=s.s3_region,
                                 config=Config(signature_version=UNSIGNED, s3={"addressing_style": "path"}))
        with pytest.raises(Exception):
            anonymous.list_objects_v2(Bucket=s.s3_bucket)
    finally:
        storage.delete(key)


def test_stream_returns_the_object_in_chunks(storage, key):
    """Large files (packages) reach the browser piece by piece, never whole in memory."""
    data = JPEG * 50
    storage.put(key, data, "image/jpeg")
    try:
        size, chunks = storage.stream(key, chunk_size=4096)
        parts = list(chunks)
        assert size == len(data) and b"".join(parts) == data and len(parts) > 1
    finally:
        storage.delete(key)
