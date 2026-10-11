"""See the facial recognition adapter working, from the terminal.

    .venv/bin/python scripts/detect_faces.py FOTO.jpg
    .venv/bin/python scripts/detect_faces.py FOTO.jpg --compare SELFIE.jpg

Goes through the same path the system uses (decode → FaceEngine port → RF017 selection),
so it only ever talks to the adapter, never to InsightFace directly.

Privacy: everything happens in memory. Vectors are never printed or saved. The only file
written is the annotated copy in backend/samples/, a folder excluded from git — delete it
when you are done looking.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.face.factory import get_face_engine  # noqa: E402
from app.face.port import FaceEngineError  # noqa: E402
from app.face.selection import select_query_face  # noqa: E402
from app.imaging import decode_image  # noqa: E402

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


def main() -> int:
    parser = argparse.ArgumentParser(description="Detecta rostos com o adaptador configurado.")
    parser.add_argument("photo", type=Path, help="foto do evento (JPEG)")
    parser.add_argument("--compare", type=Path, help="autorretrato: procura essa pessoa na foto")
    args = parser.parse_args()
    settings = get_settings()

    t0 = time.perf_counter()
    engine = get_face_engine()
    print(f"Motor: {engine.model_version} (vetor de {engine.vector_dim} dimensões) "
          f"— carregado em {time.perf_counter() - t0:.1f} s")

    image = decode_image(args.photo.read_bytes())
    t0 = time.perf_counter()
    faces = engine.detect(image)
    print(f"\n{args.photo.name}: {image.shape[1]}x{image.shape[0]} px, "
          f"{len(faces)} rosto(s) em {time.perf_counter() - t0:.2f} s")

    similarities: dict[int, float] = {}
    if args.compare:
        selfie = decode_image(args.compare.read_bytes())
        try:
            query = select_query_face(engine.detect(selfie), selfie.shape[1], selfie.shape[0],
                                      settings.min_detection_score, settings.min_query_face_side)
        except FaceEngineError as exc:
            print(f"\nAutorretrato recusado: {exc}")
            return 1
        similarities = {f.detector_index: float(query.embedding @ f.embedding) for f in faces}
        print(f"Comparando com {args.compare.name} — limiar de similaridade {settings.similarity_threshold}")

    annotated = image.copy()
    for f in faces:
        b = f.bbox
        line = f"  #{f.detector_index}: caixa ({b.x},{b.y}) {b.width}x{b.height} px, confiança {f.detection_score:.2f}"
        color = (200, 120, 0)
        if f.detector_index in similarities:
            sim = similarities[f.detector_index]
            match = sim >= settings.similarity_threshold
            line += f", similaridade {sim:+.3f}" + ("  ← É A PESSOA" if match else "")
            color = (0, 200, 0) if match else (0, 0, 220)
        print(line)
        cv2.rectangle(annotated, (b.x, b.y), (b.x + b.width, b.y + b.height), color, max(2, image.shape[1] // 500))
        cv2.putText(annotated, f"#{f.detector_index}", (b.x, max(0, b.y - 8)), cv2.FONT_HERSHEY_SIMPLEX,
                    max(0.6, image.shape[1] / 1600), color, 2)

    if similarities:
        found = sum(s >= settings.similarity_threshold for s in similarities.values())
        print(f"\nResultado: {'a pessoa APARECE nesta foto' if found else 'a pessoa NÃO aparece nesta foto'}")

    SAMPLES.mkdir(exist_ok=True)
    out = SAMPLES / f"{args.photo.stem}_rostos.jpg"
    cv2.imwrite(str(out), annotated)
    print(f"\nCópia com as caixas: {out}\n(azul = rosto detectado; verde = é a pessoa; vermelho = não é)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
