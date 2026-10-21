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

