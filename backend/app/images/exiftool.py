"""ExifTool, for the photo formats other than JPEG (RF007 notes 9, 11 and 13).

Why an external program: the original must be kept in the format received, WITHOUT recompression,
but without the GPS position (iPhones write it in almost every HEIC photo) and with the credits.
Editing only the metadata of HEIC, PNG, WebP and the camera RAW formats, byte-safe, is what ExifTool
does — the JPEG path does it in Python (processing.py), because JPEG is simple enough.

It runs as a separate process on a private temporary copy that is removed in every case. Nothing
goes through a shell: the file names are arguments, never text the shell could interpret.
Installation: `brew install exiftool` (macOS) or `apt install libimage-exiftool-perl` (server).
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

TIMEOUT_SECONDS = 60
# -m: minor warnings (a camera's odd tag) are not errors; -q -q: silent. UTF-8 for the accents.
_BASE = ["-q", "-q", "-m", "-charset", "exif=UTF8", "-overwrite_original"]


class ExifToolUnavailable(Exception):
    """The program is missing or failed: the file is refused, never stored half processed."""


def path() -> str | None:
    return shutil.which("exiftool")


def available() -> bool:
    return path() is not None


def _run(args: list[str]) -> None:
    exe = path()
    if exe is None:
        raise ExifToolUnavailable("exiftool não está instalado")
    try:
        done = subprocess.run([exe, *_BASE, *args], capture_output=True, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        raise ExifToolUnavailable("exiftool demorou demais") from None
    if done.returncode != 0:
        raise ExifToolUnavailable(done.stderr.decode(errors="replace")[:200])


def clean_original(data: bytes, ext: str, signature: str, notice: str, institution: str, origin: str) -> bytes:
    """The original as stored: no location anywhere, the credits and the ownership notice written in
    EXIF and XMP (RF019 note 6), the image data untouched."""
    with tempfile.TemporaryDirectory(prefix="fotomac-") as tmp:
        f = Path(tmp) / f"original.{ext}"
        f.write_bytes(data)
        # "-gps*=" removes every GPS tag in every group (EXIF and XMP). The camera's XMP and IPTC go
        # as a whole, as in the JPEG path: they can carry a place (city, sublocation) too.
        _run(["-gps*=", "-xmp:all=", "-iptc:all=",
              f"-Artist={signature}", f"-Copyright={notice}", f"-ImageDescription={notice}",
              f"-XMP-dc:Creator={signature}", f"-XMP-dc:Rights={notice}", f"-XMP-dc:Description={notice}",
              f"-XMP-photoshop:Credit={institution}", f"-XMP-xmpRights:WebStatement={origin}",
              "-XMP-xmpRights:Marked=True", str(f)])
        return f.read_bytes()


def copy_capture_tags(source: bytes, ext: str, jpeg: bytes) -> bytes:
    """Date, time and the technical capture data (camera, exposure, lens) of the original go into its
    JPEG copy (RF007 note 11) — never the GPS, and never the orientation: the pixels of the copy are
    already upright, so the tag would rotate them a second time."""
    with tempfile.TemporaryDirectory(prefix="fotomac-") as tmp:
        src, dst = Path(tmp) / f"original.{ext}", Path(tmp) / "copia.jpg"
        src.write_bytes(source)
        dst.write_bytes(jpeg)
        _run(["-tagsFromFile", str(src), "-exif:all", "--gps:all", "--Orientation", "--ThumbnailImage",
              "--PreviewImage", str(dst)])
        return dst.read_bytes()
