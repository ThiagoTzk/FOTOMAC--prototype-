from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.storage.port import ObjectStorage
from app.storage.s3_storage import S3ObjectStorage


@lru_cache
def get_storage() -> ObjectStorage:
    s = get_settings()
    return S3ObjectStorage(endpoint=s.s3_endpoint, access_key=s.s3_access_key,
                           secret_key=s.s3_secret_key, bucket=s.s3_bucket, region=s.s3_region)
