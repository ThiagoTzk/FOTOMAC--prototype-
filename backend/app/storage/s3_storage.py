"""Adapter: any S3-compatible object storage — SeaweedFS at CESMAC.

This is the ONLY file that imports boto3 (the AWS S3 client library, which talks to any
server that speaks the S3 protocol, not only Amazon).
"""
from __future__ import annotations

from collections.abc import Iterator

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


class S3ObjectStorage:
    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str,
                 region: str = "us-east-1"):
        self.bucket = bucket
        self._client = boto3.client(
            "s3", endpoint_url=endpoint, aws_access_key_id=access_key,
            aws_secret_access_key=secret_key, region_name=region,
            # SeaweedFS addresses buckets by path (host/bucket/key), not by subdomain.
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                          retries={"max_attempts": 3, "mode": "standard"}),
        )

    def ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except ClientError as exc:
            if exc.response["Error"]["Code"] not in ("404", "NoSuchBucket", "NotFound"):
                raise
            # Created WITHOUT any public ACL or policy: private by default (RS020).
            self._client.create_bucket(Bucket=self.bucket)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def put_file(self, key: str, path: str, content_type: str) -> None:
        # boto3 switches to multipart upload automatically for big files.
        self._client.upload_file(path, self.bucket, key, ExtraArgs={"ContentType": content_type})

    def get(self, key: str) -> bytes:
        return self._client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            if exc.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key)  # S3 delete is idempotent

    def stream(self, key: str, chunk_size: int = 1024 * 1024) -> tuple[int, Iterator[bytes]]:
        obj = self._client.get_object(Bucket=self.bucket, Key=key)
        return obj["ContentLength"], obj["Body"].iter_chunks(chunk_size)
