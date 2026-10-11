"""What happens to each photo file when it arrives (RF007) — independent of HTTP and DB.

- the ORIGINAL keeps its compressed image data byte for byte (RF007 note 9): only the EXIF
  block changes (GPS removed, credits written);
- two REDUCED copies (thumbnail and preview) are generated for the screens (RF018 note 2).
"""
from __future__ import annotations

import io
import struct
from dataclasses import dataclass

import cv2
import numpy as np
import piexif

from app.imaging import is_jpeg

MAX_BYTES = 25 * 1024 * 1024        # RF007
THUMB_SIDE = 480                    # grid cards (150 px wide, sharp on retina screens)
PREVIEW_SIDE = 1600                 # viewer (RF018 note 2: resolution adequate to the screen)
INSTITUTION = "Centro Universitário CESMAC"


class FileRejected(Exception):
    """reason is one of the RF008 note 4 causes; message is safe to show."""

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason


@dataclass
class PreparedImage:
    original: bytes
    thumb: bytes
    preview: bytes
    width: int
    height: int


def credit_line(signature: str) -> str:
    """The credit format of v1.6 (RF018 note 3)."""
    return f"Fotografia por: {signature} — {INSTITUTION}"


def jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    """Read width x height from the JPEG frame header (SOFn) without decoding the image."""
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack(">HH", data[i + 5:i + 9])
            return width, height
        i += 2 + length
    return None


def _with_metadata(jpeg: bytes, signature: str) -> bytes:
    """GPS removed (RF007 note 11) and credits written (RF019 note 6), image data untouched."""
    try:
        exif = piexif.load(jpeg)
    except Exception:
        exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    exif["GPS"] = {}
    exif["1st"], exif["thumbnail"] = {}, None
    credit = credit_line(signature)
    exif["0th"][piexif.ImageIFD.Artist] = signature.encode("utf-8")
    exif["0th"][piexif.ImageIFD.Copyright] = credit.encode("utf-8")
    # Windows shows XPAuthor (UTF-16) in the file properties, accents included.
    exif["0th"][piexif.ImageIFD.XPAuthor] = tuple((signature + "\0").encode("utf-16-le"))
    out = io.BytesIO()
    piexif.insert(piexif.dump(exif), jpeg, out)
    return _with_xmp(out.getvalue(), signature, credit)


def _xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _with_xmp(jpeg: bytes, signature: str, credit: str) -> bytes:
    """Same credits as an XMP block (dc:creator / dc:rights), the format the macOS Finder,
    Spotlight and photo editors read. Inserted as one more APP1 segment right after the EXIF
    one: the compressed image data is not touched."""
    xmp = ('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
           '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" '
           'xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">'
           f'<dc:creator><rdf:Seq><rdf:li>{_xml(signature)}</rdf:li></rdf:Seq></dc:creator>'
           f'<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{_xml(credit)}</rdf:li></rdf:Alt></dc:rights>'
           f'<photoshop:Credit>{_xml(INSTITUTION)}</photoshop:Credit>'
           '</rdf:Description></rdf:RDF></x:xmpmeta>').encode("utf-8")
    payload = b"http://ns.adobe.com/xap/1.0/\x00" + xmp
    segment = b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload
    # Drop any XMP the camera wrote (it could carry its own GPS), keep everything else.
    i, out = 2, bytearray(jpeg[:2])
    inserted = False
    while i + 4 <= len(jpeg) and jpeg[i] == 0xFF and jpeg[i + 1] != 0xDA:
        length = struct.unpack(">H", jpeg[i + 2:i + 4])[0]
        chunk = jpeg[i:i + 2 + length]
        is_xmp = jpeg[i + 1] == 0xE1 and chunk[4:33] == b"http://ns.adobe.com/xap/1.0/\x00"
        if not is_xmp:
            out += chunk
        if jpeg[i + 1] == 0xE1 and chunk[4:10] == b"Exif\x00\x00" and not inserted:
            out += segment
            inserted = True
        i += 2 + length
    if not inserted:
        out = bytearray(jpeg[:2]) + segment + out[2:]
    return bytes(out + jpeg[i:])


def _reduced(image: np.ndarray, side: int) -> bytes:
    h, w = image.shape[:2]
    scale = side / max(h, w)
    if scale < 1:
        image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 82])  # no EXIF at all
    if not ok:
        raise FileRejected("corrupted", "O arquivo está corrompido e não pôde ser lido.")
    return buf.tobytes()


def prepare(data: bytes, signature: str) -> PreparedImage:
    """Validates and prepares one uploaded file. Raises FileRejected with the RF008 cause."""
    if len(data) > MAX_BYTES:
        raise FileRejected("too_large", "O arquivo ultrapassa o limite de 25 MB por imagem.")
    if not is_jpeg(data):  # binary signature, not the extension (RF007 note 2)
        raise FileRejected("format", "Formato não permitido: envie apenas imagens JPEG.")
    dims = jpeg_dimensions(data)
    if dims is None:
        raise FileRejected("corrupted", "O arquivo está corrompido e não pôde ser lido.")
    # Decode at the largest reduction that still yields >= PREVIEW_SIDE: proves the file is
    # readable (not corrupted) at a fraction of the cost of a full 20 MP decode.
    flag = cv2.IMREAD_COLOR
    for factor, reduced in ((8, cv2.IMREAD_REDUCED_COLOR_8), (4, cv2.IMREAD_REDUCED_COLOR_4), (2, cv2.IMREAD_REDUCED_COLOR_2)):
        if max(dims) / factor >= PREVIEW_SIDE:
            flag = reduced
            break
    decoded = cv2.imdecode(np.frombuffer(data, np.uint8), flag)
    if decoded is None:
        raise FileRejected("corrupted", "O arquivo está corrompido e não pôde ser lido.")
    return PreparedImage(original=_with_metadata(data, signature), thumb=_reduced(decoded, THUMB_SIDE),
                         preview=_reduced(decoded, PREVIEW_SIDE), width=dims[0], height=dims[1])
