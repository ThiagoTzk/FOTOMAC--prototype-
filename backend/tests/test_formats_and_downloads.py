"""Requirements v2.0, stage 4: photo formats (RF007 notes 2, 9, 11 and 13), the watermark only on the
visitor's download (RF019 note 9), the ownership notice in every file (RF019 note 6) and marketing's
download for institutional publicity (RF012 note 2, RF030).

The sample files (tests/fixtures/formats) are synthetic — colour blocks, no person — and carry a fake
GPS position, so the tests can prove that it is removed.
"""
from __future__ import annotations

import io
import json
import subprocess
import uuid
import zipfile
from datetime import datetime, timezone

import cv2
import numpy as np
import piexif
import pytest
from sqlalchemy import select

from app import parameters
from app.auth import passwords
from app.db import models as m
from app.images import exiftool, watermark
from app.images.processing import ownership_notice
from app.packages.service import build_next
from tests.conftest import FIXTURES
from tests.support import jpeg
from tests.test_images import PASSWORD, account, api, event, owner, storage, upload  # noqa: F401 (fixtures)

pytestmark = pytest.mark.skipif(not exiftool.available(), reason="ExifTool is required for non-JPEG formats")

FORMATS = FIXTURES / "formats"
NOTICE = ownership_notice("Moacir Barbosa")


def sample(ext: str) -> bytes:
    return (FORMATS / f"sample.{ext}").read_bytes()


def send(client, event, ext: str, name: str | None = None):
    return client.post(f"/api/v1/events/{event.id}/images",
                       files={"file": (name or f"foto.{ext}", sample(ext), "application/octet-stream")})


def tags(data: bytes, ext: str, *names: str) -> dict:
    """What ExifTool itself reads in a file (the same program the photo editors trust)."""
    path = FIXTURES.parent / f"_tmp_{uuid.uuid4().hex}.{ext}"
    path.write_bytes(data)
    try:
        out = subprocess.run([exiftool.path(), "-json", "-a", "-G1", *[f"-{n}" for n in names], str(path)],
                             capture_output=True, check=True).stdout
    finally:
        path.unlink()
    return {k: v for k, v in json.loads(out)[0].items() if k != "SourceFile"}


def enable_raw(db, max_mb: int = 100):
    for key, value in (("raw_formats_enabled", 1), ("raw_max_mb", max_mb)):
        db.merge(m.SystemParameter(key=key, value=value))
    db.flush()


def marketing_account(db) -> m.Account:
    a = m.Account(full_name="Lucas Bezerra", email=f"{uuid.uuid4().hex[:8]}@cesmac.edu.br", role=m.AccountRole.MARKETING,
                  photographer_signature="Lucas Bezerra", password_hash=passwords.hash_password(PASSWORD),
                  status=m.AccountStatus.ACTIVE)
    db.add(a)
    db.flush()
    return a


def decoded(data: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


# ----------------------------------------------------------------- formats (RF007)

@pytest.mark.parametrize("ext", ["heic", "png", "webp"])
def test_each_format_is_kept_as_received_and_gets_a_jpeg_copy(api, db, owner, event, storage, ext):
    r = send(api(owner), event, ext)
    assert r.status_code == 201, r.text
    image = db.get(m.Image, uuid.UUID(r.json()["id"]))
    assert image.source_format == ext and r.json()["source_format"] == ext
    assert storage.get(image.source_key)[:4] == sample(ext)[:4]                 # the original, same format
    copy = storage.get(image.object_key)
    assert copy[:3] == b"\xff\xd8\xff"                                          # the JPEG of work
    pixels = decoded(copy)
    assert pixels.shape[:2] == (400, 600) and (image.width, image.height) == (600, 400)
    b, g, r_ = pixels[200, 100].astype(int)
    assert r_ > b + 100                                                          # red on the left
    b, g, r_ = pixels[200, 500].astype(int)
    assert b > r_ + 100                                                          # blue on the right: not mirrored
    assert image.captured_at == datetime(2026, 10, 15, 19, 30, tzinfo=timezone.utc).replace(tzinfo=image.captured_at.tzinfo)
    assert {image.thumb_key, image.preview_key} <= set(storage.objects)


def test_transparent_areas_become_white_not_black(api, db, owner, event, storage):
    image = db.get(m.Image, uuid.UUID(send(api(owner), event, "png").json()["id"]))
    assert decoded(storage.get(image.object_key))[10, 10].min() > 240           # the transparent corner


@pytest.mark.parametrize("ext", ["heic", "png", "webp", "dng"])
def test_no_location_and_the_credits_in_the_original_and_in_the_copy(api, db, owner, event, storage, ext):
    """RF007 note 11 and RF019 note 6: every sample arrives with a GPS position."""
    if ext == "dng":
        enable_raw(db)
    assert "GPS:GPSLatitude" in tags(sample(ext), ext, "gps*")                   # the sample does have it
    image = db.get(m.Image, uuid.UUID(send(api(owner), event, ext).json()["id"]))
    original = storage.get(image.source_key)
    found = tags(original, ext, "gps*", "Artist", "Copyright", "XMP-dc:Creator", "DateTimeOriginal")
    assert not [k for k in found if "GPS" in k]                                  # no position anywhere
    assert found["IFD0:Artist"] == "Moacir Barbosa" and found["IFD0:Copyright"] == NOTICE
    assert found["XMP-dc:Creator"] == "Moacir Barbosa"
    assert found["ExifIFD:DateTimeOriginal"] == "2026:10:15 19:30:00"           # capture data kept
    copy = storage.get(image.object_key)
    exif = piexif.load(copy)
    assert not exif["GPS"] and exif["0th"][piexif.ImageIFD.Artist] == b"Moacir Barbosa"
    assert exif["0th"][piexif.ImageIFD.ImageDescription].decode() == NOTICE
    in_copy = tags(copy, "jpg", "gps*", "IPTC:By-line", "IPTC:CopyrightNotice", "XMP-dc:Description",
                   "XMP-xmpRights:WebStatement")
    assert not [k for k in in_copy if "GPS" in k]
    assert in_copy["IPTC:By-line"] == "Moacir Barbosa" and in_copy["IPTC:CopyrightNotice"] == NOTICE
    assert in_copy["XMP-dc:Description"] == NOTICE and in_copy["XMP-xmpRights:WebStatement"].startswith("http")


def test_raw_is_refused_until_the_administrator_enables_it(api, db, owner, event, storage):
    """Decision of 21/10/2026: a RAW photo reaches the visitor WITHOUT the photographer's editing, so it is
    off by default; only the administrator turns it on."""
    c = api(owner)
    r = send(c, event, "dng")
    assert r.status_code == 400 and r.json()["detail"]["reason"] == "raw_disabled"
    assert c.get("/api/v1/upload-rules").json()["raw_enabled"] is False
    enable_raw(db, max_mb=25)
    rules = c.get("/api/v1/upload-rules").json()
    assert rules["raw_enabled"] and rules["max_raw_bytes"] == 25 * 1024 * 1024 and "dng" in rules["raw_extensions"]
    ok = send(c, event, "dng")
    assert ok.status_code == 201 and ok.json()["source_format"] == "dng"
    big = b"II*\x00" + b"0" * (25 * 1024 * 1024)
    r = c.post(f"/api/v1/events/{event.id}/images", files={"file": ("grande.dng", big, "application/octet-stream")})
    assert r.status_code == 400 and r.json()["detail"]["reason"] == "raw_too_large"


def test_the_raw_parameters_are_choices(db):
    admin = account(db, "Admin", m.AccountRole.ADMIN)
    with pytest.raises(parameters.ParameterError):
        parameters.update(db, admin, {"watermark_corner": 2}, False)
    assert parameters.update(db, admin, {"watermark_corner": 0}, False) == ["watermark_corner"]


def test_deleting_or_replacing_takes_the_original_away_too(api, db, owner, event, storage):
    c = api(owner)
    first = db.get(m.Image, uuid.UUID(send(c, event, "heic").json()["id"]))
    heic_key = first.source_key
    r = c.put(f"/api/v1/images/{first.id}/file", files={"file": ("editada.jpg", jpeg(41), "image/jpeg")})
    assert r.status_code == 200 and r.json()["source_format"] is None
    db.refresh(first)
    assert first.source_key is None and heic_key not in storage.objects          # a JPEG edit has no other original
    second = db.get(m.Image, uuid.UUID(send(c, event, "webp").json()["id"]))
    keys = second.storage_keys
    assert len(keys) == 4
    assert c.delete(f"/api/v1/images/{second.id}").status_code == 204
    assert not set(keys) & set(storage.objects)                                  # RF011 note 4


# ----------------------------------------------------------------- watermark (RF019 note 9)

def _corner_change(before: np.ndarray, after: np.ndarray, side: str) -> float:
    h, w = before.shape[:2]
    box = (slice(int(h * 0.85), h), slice(int(w * 0.70), w) if side == "right" else slice(0, int(w * 0.30)))
    return float(np.abs(before[box].astype(int) - after[box].astype(int)).mean())


@pytest.mark.parametrize("corner,marked,clean", [(watermark.RIGHT, "right", "left"), (watermark.LEFT, "left", "right")])
def test_the_watermark_goes_in_the_chosen_bottom_corner(corner, marked, clean):
    base = cv2.imencode(".jpg", np.full((800, 1200, 3), 120, np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tobytes()
    out = watermark.apply(base, "Moacir Barbosa", corner)
    before, after = decoded(base), decoded(out)
    assert after.shape == before.shape                                           # original resolution
    assert _corner_change(before, after, marked) > 3 and _corner_change(before, after, clean) < 1.5
    centre = (slice(300, 500), slice(400, 800))
    assert np.abs(before[centre].astype(int) - after[centre].astype(int)).mean() < 1.5   # never over the centre
    exif = piexif.load(out)
    assert exif["0th"][piexif.ImageIFD.Artist] == b"Moacir Barbosa"
    assert exif["0th"][piexif.ImageIFD.ImageDescription].decode() == ownership_notice("Moacir Barbosa")


def test_the_watermark_follows_the_photo_as_it_is_seen():
    """A phone photo stored sideways (EXIF orientation 6): the mark goes where the person SEES the bottom."""
    sideways = cv2.imencode(".jpg", np.full((1200, 800, 3), 120, np.uint8))[1].tobytes()
    exif = {"0th": {piexif.ImageIFD.Orientation: 6}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    buf = io.BytesIO()
    piexif.insert(piexif.dump(exif), sideways, buf)
    out = watermark.apply(buf.getvalue(), "Moacir Barbosa", watermark.RIGHT)
    assert decoded(out).shape[:2] == (800, 1200)                                 # turned upright
    assert piexif.load(out)["0th"][piexif.ImageIFD.Orientation] == 1


# ----------------------------------------------------------------- downloads of the accounts (RF012, RF030)

def _publish(db, event, *images):
    event.status = m.EventStatus.PUBLISHED
    for image in images:
        image.review_status = m.ImageReviewStatus.PUBLISHED
    db.flush()


def test_the_accounts_download_without_watermark(api, db, owner, event, storage):
    c = api(owner)
    image = db.get(m.Image, uuid.UUID(upload(c, event, jpeg(42)).json()["id"]))
    assert c.get(f"/api/v1/images/{image.id}").json()["can_download"] is True
    link = c.post(f"/api/v1/images/{image.id}/download-link").json()["url"]
    got = c.get(link)
    assert got.status_code == 200 and got.content == storage.get(image.object_key)   # no mark, nothing changed
    assert got.headers["cache-control"] == "no-store" and "attachment" in got.headers["content-disposition"]
    assert c.get(f"/api/v1/images/{image.id}/download").status_code == 403           # without the signed link
    record = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "image.download"))
    assert record.details["publicity"] is False


def test_marketing_downloads_published_photos_for_publicity(api, db, owner, event, storage):
    c_owner = api(owner)
    shown, hidden, asked = (db.get(m.Image, uuid.UUID(upload(c_owner, event, jpeg(n)).json()["id"])) for n in (43, 44, 45))
    _publish(db, event, shown, asked)                      # "hidden" stays under review
    asked.removal_requested_at = datetime.now(timezone.utc)
    db.flush()
    marketing = marketing_account(db)
    c = api(marketing)
    link = c.post(f"/api/v1/images/{shown.id}/download-link").json()["url"]
    assert c.get(link).content == storage.get(shown.object_key)
    record = db.scalar(select(m.AuditLog).where(m.AuditLog.action == "image.download", m.AuditLog.actor_account_id == marketing.id))
    assert record.details["publicity"] is True                                     # RF030 note 4
    for image in (hidden, asked):                                                  # RF030 note 3
        assert c.post(f"/api/v1/images/{image.id}/download-link").status_code in (403, 404)


def test_a_collaborator_does_not_download_someone_elses_photo(api, db, owner, event, storage):
    ana = account(db, "Ana Souza")
    event.collaboration_open = True
    db.flush()
    image = db.get(m.Image, uuid.UUID(upload(api(owner), event, jpeg(46)).json()["id"]))
    c_ana = api(ana)
    assert c_ana.get(f"/api/v1/images/{image.id}").json()["can_download"] is False
    assert c_ana.post(f"/api/v1/images/{image.id}/download-link").status_code == 403


def test_guard_package_has_the_originals_and_publicity_package_the_jpeg_copies(api, db, owner, event, storage):
    c_owner = api(owner)
    heic = db.get(m.Image, uuid.UUID(send(c_owner, event, "heic").json()["id"]))
    plain = db.get(m.Image, uuid.UUID(upload(c_owner, event, jpeg(47)).json()["id"]))
    gone = db.get(m.Image, uuid.UUID(upload(c_owner, event, jpeg(48)).json()["id"]))
    _publish(db, event, heic, plain, gone)
    gone.removal_requested_at = datetime.now(timezone.utc)                         # RF012 note 8
    db.flush()

    estimate = c_owner.get(f"/api/v1/events/{event.id}/package/estimate").json()
    assert estimate["images"] == 2 and estimate["other_formats"] == 1 and estimate["publicity"] is False
    guard = c_owner.post(f"/api/v1/events/{event.id}/package").json()
    marketing = marketing_account(db)
    c_mkt = api(marketing)
    assert c_mkt.get(f"/api/v1/events/{event.id}/package/estimate").json()["publicity"] is True
    publicity = c_mkt.post(f"/api/v1/events/{event.id}/package").json()
    assert publicity["publicity"] is True and publicity["file_name"].endswith("- divulgação.zip")
    assert build_next(db, storage) and build_next(db, storage)

    def contents(job_id):
        job = db.get(m.PackageJob, uuid.UUID(job_id))
        z = zipfile.ZipFile(io.BytesIO(storage.get(job.object_key)))
        return {n.rsplit(".", 1)[1]: z.read(n) for n in z.namelist()}

    guard_files = contents(guard["id"])
    assert sorted(guard_files) == ["heic", "jpg"]                                  # the HEIC as received
    assert guard_files["heic"] == storage.get(heic.source_key)
    publicity_files = zipfile.ZipFile(io.BytesIO(storage.get(db.get(m.PackageJob, uuid.UUID(publicity["id"])).object_key))).namelist()
    assert len(publicity_files) == 2 and all(n.endswith(".jpg") for n in publicity_files)
    details = db.scalars(select(m.AuditLog.details).where(m.AuditLog.action == "package.request")).all()
    assert sorted(d["publicity"] for d in details) == [False, True]
