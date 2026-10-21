"""Image decoding and validation, independent of any face library."""
from __future__ import annotations

import cv2
import numpy as np

from app.face.port import InvalidImageError

JPEG_SIGNATURE = b"\xff\xd8\xff"


def is_jpeg(data: bytes) -> bool:
    """RF007 note 2: the type is checked by the binary signature, never by the extension."""
    return data[:3] == JPEG_SIGNATURE


def decode_image(data: bytes) -> np.ndarray:
    """Bytes → BGR uint8 array, in memory only (no temporary file is ever written).

    OpenCV applies the EXIF orientation flag, so a phone selfie taken sideways is upright.
    """
    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise InvalidImageError("Não foi possível ler a imagem. Envie um arquivo JPEG válido.")
    return image


def blur_regions(pixels: np.ndarray, boxes: list[tuple[int, int, int, int]], pad: float = 0.25) -> np.ndarray:
    """Hides faces IN the image (RF009 note 7): each box, widened by `pad` to take hair and chin, is
    reduced to a 6-block-wide grid and then blurred — too little is left to recognise anyone.
    Works in place and returns the same array."""
    h, w = pixels.shape[:2]
    for bx, by, bw, bh in boxes:
        x0, y0 = max(0, int(bx - pad * bw)), max(0, int(by - pad * bh))
        x1, y1 = min(w, int(bx + (1 + pad) * bw)), min(h, int(by + (1 + pad) * bh))
        if x1 <= x0 or y1 <= y0:
            continue
        region = pixels[y0:y1, x0:x1]
        small = cv2.resize(region, (6, max(1, round(6 * (y1 - y0) / (x1 - x0)))), interpolation=cv2.INTER_AREA)
        pixels[y0:y1, x0:x1] = cv2.GaussianBlur(cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST),
                                                (0, 0), max(2, (x1 - x0) / 12))
    return pixels
