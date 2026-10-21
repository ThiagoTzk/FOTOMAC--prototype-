"""Which photo formats are accepted and how each becomes the JPEG copy (RF007 notes 2 and 13).

The type always comes from the first bytes of the file (its binary signature), never from the
name. The name is only used to tell apart camera RAW formats that share the TIFF signature (a DNG
and a NEF start the same way) — and a plain TIFF is refused even so: it is not a camera format.
"""
from __future__ import annotations

import io
from pathlib import PurePath

import numpy as np
import pi_heif
import rawpy
from PIL import Image, ImageOps

pi_heif.register_heif_opener()
# A 61 MP camera is the largest in use; above ~120 MP the file is refused instead of filling the
# server's memory (Pillow's "decompression bomb" guard, raised from its default of 89 MP).
Image.MAX_IMAGE_PIXELS = 120_000_000

JPEG, PNG, WEBP, HEIC, RAW = "jpeg", "png", "webp", "heic", "raw"
LABELS = {JPEG: "JPEG", PNG: "PNG", WEBP: "WebP", HEIC: "HEIC", RAW: "RAW"}
RAW_EXTENSIONS = ("dng", "cr2", "cr3", "nef", "arw", "orf", "rw2", "raf")
_HEIF_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx"}
CONTENT_TYPES = {"png": "image/png", "webp": "image/webp", "heic": "image/heic", "dng": "image/x-adobe-dng"}


class UnreadableImage(Exception):
    pass


def _heif(data: bytes) -> bool:
    if data[4:8] != b"ftyp":
        return False
    size = int.from_bytes(data[:4], "big")
    major, compatible = data[8:12], [data[i:i + 4] for i in range(16, min(size, 64), 4)]
    # "mif1" is the generic HEIF brand, also used by AVIF: it only counts with an HEVC brand beside it.
    return major in _HEIF_BRANDS or (major in (b"mif1", b"msf1") and any(b in _HEIF_BRANDS for b in compatible))


def detect(data: bytes, filename: str = "") -> tuple[str, str] | None:
    """(kind, file extension) from the signature, or None when the format is not accepted."""
    if data[:3] == b"\xff\xd8\xff":
        return JPEG, "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return PNG, "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return WEBP, "webp"
    if _heif(data):
        return HEIC, "heic"
    ext = PurePath(filename).suffix.lower().lstrip(".")
    if data[4:12] == b"ftypcrx ":                                   # Canon CR3 (ISO media container)
        return RAW, "cr3"
    if data[:16] == b"FUJIFILMCCD-RAW ":                            # Fujifilm RAF
        return RAW, "raf"
    if data[:4] in (b"II*\x00", b"MM\x00*", b"IIRO", b"IIRS", b"IIU\x00") and ext in RAW_EXTENSIONS:
        return RAW, ext                                              # TIFF-based: DNG, CR2, NEF, ARW, ORF, RW2
    return None


def decode(data: bytes, kind: str) -> np.ndarray:
    """The photo as an upright BGR uint8 array, ready to become the JPEG copy.

    RAW is developed with the camera's own white balance and no editing (RF007 note 13): whoever
    wants the edited photo sends the exported file."""
    try:
        if kind == RAW:
            with rawpy.imread(io.BytesIO(data)) as raw:
                rgb = raw.postprocess(use_camera_wb=True, output_bps=8)   # applies the camera's rotation
            return np.ascontiguousarray(rgb[:, :, ::-1])
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        if image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info):
            # JPEG has no transparency: transparent areas become white, never black.
            rgba = image.convert("RGBA")
            white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            image = Image.alpha_composite(white, rgba)
        return np.ascontiguousarray(np.asarray(image.convert("RGB"))[:, :, ::-1])
    except Exception as exc:  # any decoder error (corrupted file, bomb, unsupported variant)
        raise UnreadableImage(str(exc)[:200]) from None
