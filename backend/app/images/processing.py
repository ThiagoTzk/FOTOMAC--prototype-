"""What happens to each photo file when it arrives (RF007) — independent of HTTP and DB.

- a JPEG keeps its compressed image data byte for byte (RF007 note 9): only the metadata
  changes (GPS removed, credits and the ownership notice written);
- PNG, WebP, HEIC and camera RAW (RF007 note 13) are kept as received, cleaned by ExifTool, and get
  a high-quality JPEG COPY that the screens, the facial indexing and the downloads use;
- two REDUCED copies (thumbnail and preview) are generated for the screens (RF018 note 2).
"""
from __future__ import annotations

import io
import struct
from dataclasses import dataclass

import cv2
import numpy as np
import piexif

from app.config import get_settings
from app.images import exiftool, formats

MB = 1024 * 1024
MAX_BYTES = 25 * MB                 # RF007: photo
JPEG_COPY_QUALITY = 95              # the copy of a non-JPEG photo: high quality (RF007 note 13)
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
    original: bytes            # the JPEG of work: a JPEG upload itself, or the copy of another format
    thumb: bytes
    preview: bytes
    width: int
    height: int
    source: bytes | None = None      # the original in another format, cleaned (RF007 note 9)
    source_ext: str | None = None
    kind: str = formats.JPEG


def credit_line(signature: str) -> str:
    """The credit format of v1.6 (RF018 note 3)."""
    return f"Fotografia por: {signature} — {INSTITUTION}"


def ownership_notice(signature: str) -> str:
    """RF019 note 6: who holds the rights and who took the photo, written in the file itself.
    Provisional text: the final one is validated by marketing and the legal area (section 11)."""
    return f"Imagem do acervo do {INSTITUTION} — Fotografia: {signature}"


def origin_address() -> str:
    """The "endereço de origem" of RF019 note 6: the FOTOMAC site."""
    return get_settings().frontend_url


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


def with_metadata(jpeg: bytes, signature: str) -> bytes:
    """GPS removed (RF007 note 11); credits and the ownership notice written in EXIF, XMP and IPTC
    (RF019 note 6). The image data is untouched."""
    try:
        exif = piexif.load(jpeg)
    except Exception:
        exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    exif["GPS"] = {}
    exif["1st"], exif["thumbnail"] = {}, None
    notice = ownership_notice(signature)
    exif["0th"][piexif.ImageIFD.Artist] = signature.encode("utf-8")
    exif["0th"][piexif.ImageIFD.Copyright] = notice.encode("utf-8")
    exif["0th"][piexif.ImageIFD.ImageDescription] = notice.encode("utf-8")
    # Windows shows XPAuthor/XPComment (UTF-16) in the file properties, accents included.
    exif["0th"][piexif.ImageIFD.XPAuthor] = tuple((signature + "\0").encode("utf-16-le"))
    exif["0th"][piexif.ImageIFD.XPComment] = tuple((notice + "\0").encode("utf-16-le"))
    out = io.BytesIO()
    piexif.insert(piexif.dump(exif), jpeg, out)
    return _with_segments(out.getvalue(), [_xmp_segment(signature, notice), _iptc_segment(signature, notice)])


def _xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _xmp_segment(signature: str, notice: str) -> bytes:
    """The same data as XMP — the format the macOS Finder, Spotlight and photo editors read."""
    xmp = ('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
           '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" '
           'xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">'
           f'<dc:creator><rdf:Seq><rdf:li>{_xml(signature)}</rdf:li></rdf:Seq></dc:creator>'
           f'<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{_xml(notice)}</rdf:li></rdf:Alt></dc:rights>'
           f'<dc:description><rdf:Alt><rdf:li xml:lang="x-default">{_xml(notice)}</rdf:li></rdf:Alt></dc:description>'
           f'<photoshop:Credit>{_xml(INSTITUTION)}</photoshop:Credit>'
           f'<xmpRights:Marked>True</xmpRights:Marked><xmpRights:WebStatement>{_xml(origin_address())}</xmpRights:WebStatement>'
           '</rdf:Description></rdf:RDF></x:xmpmeta>').encode("utf-8")
    payload = _XMP_HEADER + xmp
    return b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload


def _iim(record: int, dataset: int, value: bytes) -> bytes:
    return bytes([0x1C, record, dataset]) + struct.pack(">H", len(value)) + value


def _utf8(text: str, limit: int) -> bytes:
    """Cut at the IPTC field limit without splitting an accented letter in half."""
    return text.encode("utf-8")[:limit].decode("utf-8", "ignore").encode("utf-8")


def _iptc_segment(signature: str, notice: str) -> bytes:
    """IPTC (the APP13 block news agencies and Windows read): by-line, credit, copyright, caption."""
    iim = (_iim(1, 90, b"\x1b%G")                      # coded character set: UTF-8
           + _iim(2, 0, b"\x00\x04")                    # record version
           + _iim(2, 80, _utf8(signature, 32))          # by-line (author)
           + _iim(2, 110, _utf8(INSTITUTION, 32))       # credit
           + _iim(2, 116, _utf8(notice, 128))           # copyright notice
           + _iim(2, 120, _utf8(notice, 2000)))         # caption / description
    if len(iim) % 2:
        iim += b"\x00"
    resource = b"8BIM" + struct.pack(">H", 0x0404) + b"\x00\x00" + struct.pack(">I", len(iim)) + iim
    payload = _IPTC_HEADER + resource
    return b"\xff\xed" + struct.pack(">H", len(payload) + 2) + payload


_XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\x00"
_IPTC_HEADER = b"Photoshop 3.0\x00"


def _with_segments(jpeg: bytes, segments: list[bytes]) -> bytes:
    """Our XMP and IPTC blocks right after the EXIF one. The camera's XMP and IPTC are dropped (they
    can carry a GPS position or the name of a place); everything else is kept and the compressed
    image data is not touched."""
    block = b"".join(segments)
    i, out = 2, bytearray(jpeg[:2])
    inserted = False
    while i + 4 <= len(jpeg) and jpeg[i] == 0xFF and jpeg[i + 1] != 0xDA:
        length = struct.unpack(">H", jpeg[i + 2:i + 4])[0]
        chunk = jpeg[i:i + 2 + length]
        is_xmp = jpeg[i + 1] == 0xE1 and chunk[4:4 + len(_XMP_HEADER)] == _XMP_HEADER
        is_iptc = jpeg[i + 1] == 0xED and chunk[4:4 + len(_IPTC_HEADER)] == _IPTC_HEADER
        if not (is_xmp or is_iptc):
            out += chunk
        if jpeg[i + 1] == 0xE1 and chunk[4:10] == b"Exif\x00\x00" and not inserted:
            out += block
            inserted = True
        i += 2 + length
    if not inserted:
        out = bytearray(jpeg[:2]) + block + out[2:]
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


FORMAT_MESSAGE = "Formato não permitido: envie fotografias em JPEG, PNG, HEIC ou WebP."


def prepare(data: bytes, signature: str, filename: str = "", raw_max_bytes: int | None = None) -> PreparedImage:
    """Validates and prepares one uploaded file. Raises FileRejected with the RF008 cause.

    raw_max_bytes is None while the administrator has camera RAW formats disabled (RF026)."""
    found = formats.detect(data, filename)  # binary signature, not the extension (RF007 note 2)
    if found is None:
        raise FileRejected("format", FORMAT_MESSAGE)
    kind, ext = found
    if kind == formats.RAW and raw_max_bytes is None:
        raise FileRejected("raw_disabled", "Formatos brutos (RAW) não estão habilitados. Envie a fotografia exportada em JPEG.")
    if kind == formats.RAW and len(data) > raw_max_bytes:
        raise FileRejected("raw_too_large", f"O arquivo ultrapassa o limite de {raw_max_bytes // MB} MB por arquivo RAW.")
    if kind != formats.RAW and len(data) > MAX_BYTES:
        raise FileRejected("too_large", "O arquivo ultrapassa o limite de 25 MB por imagem.")
    if kind == formats.JPEG:
        return _prepare_jpeg(data, signature)
    return _prepare_other(data, kind, ext, signature)


def _prepare_jpeg(data: bytes, signature: str) -> PreparedImage:
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
    return PreparedImage(original=with_metadata(data, signature), thumb=_reduced(decoded, THUMB_SIDE),
                         preview=_reduced(decoded, PREVIEW_SIDE), width=dims[0], height=dims[1])


def _prepare_other(data: bytes, kind: str, ext: str, signature: str) -> PreparedImage:
    """PNG, WebP, HEIC or RAW: the original is kept as received (cleaned) and gets a JPEG copy."""
    if not exiftool.available():  # fail closed: never store an original that still has its GPS
        raise FileRejected("format_unavailable",
                           f"Este servidor ainda não recebe fotografias em {formats.LABELS[kind]}. Envie em JPEG.")
    try:
        pixels = formats.decode(data, kind)
    except formats.UnreadableImage:
        raise FileRejected("corrupted", "O arquivo está corrompido e não pôde ser lido.") from None
    ok, buf = cv2.imencode(".jpg", pixels, [cv2.IMWRITE_JPEG_QUALITY, JPEG_COPY_QUALITY])
    if not ok:
        raise FileRejected("corrupted", "O arquivo está corrompido e não pôde ser lido.")
    try:
        copy = exiftool.copy_capture_tags(data, ext, buf.tobytes())
        source = exiftool.clean_original(data, ext, signature, ownership_notice(signature), INSTITUTION, origin_address())
    except exiftool.ExifToolUnavailable:
        raise FileRejected("corrupted", "O arquivo está corrompido e não pôde ser lido.") from None
    h, w = pixels.shape[:2]
    return PreparedImage(original=with_metadata(copy, signature), thumb=_reduced(pixels, THUMB_SIDE),
                         preview=_reduced(pixels, PREVIEW_SIDE), width=w, height=h,
                         source=source, source_ext=ext, kind=kind)
