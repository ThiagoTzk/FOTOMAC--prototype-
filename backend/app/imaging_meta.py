"""JPEG metadata handling WITHOUT recompressing the image (RF007 notes 9 and 11, RF019).

piexif rewrites only the EXIF block of the file; the compressed image data stays byte for
byte the same, so the photographer's original quality is preserved.
"""
from __future__ import annotations

import io
from datetime import datetime

import piexif


def strip_gps(jpeg: bytes) -> bytes:
    """Remove the geolocation of the photo, keeping date, time and technical capture data."""
    try:
        exif = piexif.load(jpeg)
    except Exception:
        return jpeg  # no readable EXIF block: nothing to remove
    if not exif.get("GPS"):
        return jpeg
    exif["GPS"] = {}
    # The embedded thumbnail may carry its own copy of the metadata; it is not needed.
    exif["thumbnail"] = None
    exif["1st"] = {}
    out = io.BytesIO()
    piexif.insert(piexif.dump(exif), jpeg, out)
    return out.getvalue()


def has_gps(jpeg: bytes) -> bool:
    try:
        return bool(piexif.load(jpeg).get("GPS"))
    except Exception:
        return False


def captured_at(jpeg: bytes) -> datetime | None:
    """Capture date written by the camera (shown to the visitor, RF018 note 4)."""
    try:
        raw = piexif.load(jpeg)["Exif"].get(piexif.ExifIFD.DateTimeOriginal)
        return datetime.strptime(raw.decode(), "%Y:%m:%d %H:%M:%S") if raw else None
    except Exception:
        return None
