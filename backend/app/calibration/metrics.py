"""Metrics of the quality test — the same formulas as fotomac-lab (metricas.py, avaliar_todos.py),
so a score here is read on the same ruler as Test 1 (SFace 89.5, InsightFace 97.6).

Only photos someone MARKED count ("never assume a negative by omission": unchecked easy photos
inflate any metric). Two readings of the same marks:
- model: a photo where the person is, but the matched face is someone else's, is an ERROR —
  it compares technologies, because it measures what the technology really did;
- product: that photo is a HIT — the visitor does receive a photo where they appear.

Score = 100 × best F1 (the threshold that maximises F1). It is optimistic on purpose: the
threshold is chosen looking at the answers, so it measures a technology's potential. The
threshold itself does not change the score — it only picks the operating point.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Row:
    similarity: float | None  # None: no face of this photo was detected by the engine
    present: bool             # the ground truth: the person is in the photo
    wrong_face: bool = False  # present, but the matched face is someone else's


def _auc(pos: list[float], neg: list[float]) -> float | None:
    """Chance of a random hit ranking above a random error (Mann-Whitney; ties count half)."""
    if not pos or not neg:
        return None
    p, n = np.asarray(pos, float)[:, None], np.asarray(neg, float)[None, :]
    return float(((p > n).sum() + 0.5 * (p == n).sum()) / (len(pos) * len(neg)))


def _average_precision(ranked: list[tuple[float, bool]], expected: int) -> float | None:
    """Precision at each hit, down the ranking, divided by ALL expected hits: a photo the detector
    never indexed counts as precision zero — which is what the visitor feels."""
    if not expected:
        return None
    hits, total = 0, 0.0
    for i, (_, positive) in enumerate(sorted(ranked, key=lambda t: -t[0]), 1):
        if positive:
            hits += 1
            total += hits / i
    return total / expected


def _counts(ranked: list[tuple[float, bool]], expected: int, cut: float) -> dict:
    tp = sum(1 for s, p in ranked if s >= cut and p)
    fp = sum(1 for s, p in ranked if s >= cut and not p)
    fn = expected - tp
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / expected if expected else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else 0.0
    return {"threshold": round(cut, 4), "found": tp, "wrong": fp, "missed": fn,
            "precision": precision, "recall": recall, "f1": f1}


def _reading(rows: list[Row], threshold: float, product: bool) -> dict:
    positive = [r.present and (product or not r.wrong_face) for r in rows]
    ranked = [(r.similarity, p) for r, p in zip(rows, positive) if r.similarity is not None]
    expected = sum(positive)
    pos = [s for s, p in ranked if p]
    neg = [s for s, p in ranked if not p]
    # Every distinct similarity is a candidate cut, from the top down (lab: _melhor_f1).
    curve, best = [], None
    for cut in sorted({s for s, _ in ranked}, reverse=True):
        point = _counts(ranked, expected, cut)
        curve.append(point)
        if point["found"] and (best is None or point["f1"] > best["f1"]):  # ties keep the higher cut
            best = point
    return {
        "expected": expected,
        "lost_in_detection": expected - len(pos),
        "f1_best": best["f1"] if best else 0.0,
        "best": best,
        "at_threshold": _counts(ranked, expected, threshold),
        "map": _average_precision(ranked, expected),
        "auc": _auc(pos, neg),
        # Errors at or above the worst hit: 0 means one threshold gets everything right.
        "intruders": int(sum(1 for s in neg if s >= min(pos))) if pos and neg else None,
        "separation": float(np.mean(np.asarray(neg) < min(pos))) if pos and neg else None,
        "worst_hit": min(pos) if pos else None,
        "best_error": max(neg) if neg else None,
        "curve": curve,
    }


BINS = np.round(np.arange(-0.2, 1.0001, 0.025), 4)


def evaluate(rows: list[Row], threshold: float) -> dict:
    """Everything the panel shows for one run, from the MARKED photos only."""
    model, product = _reading(rows, threshold, False), _reading(rows, threshold, True)
    hist = lambda values: [int(x) for x in np.histogram(np.clip(values, -0.2, 1.0), bins=BINS)[0]] if values else [0] * (len(BINS) - 1)
    sims = lambda pred: [r.similarity for r in rows if r.similarity is not None and pred(r)]
    return {
        "marked": len(rows),
        "present": sum(r.present for r in rows),
        "wrong_face": sum(r.present and r.wrong_face for r in rows),
        "score": round(100 * model["f1_best"], 1) if model["expected"] else None,
        "score_product": round(100 * product["f1_best"], 1) if product["expected"] else None,
        "model": model,
        "product": product,
        # The chart that convinces a committee: where the hits and the errors fall, and the threshold.
        "distribution": {"bins": [float(b) for b in BINS],
                         "present": hist(sims(lambda r: r.present and not r.wrong_face)),
                         "wrong_face": hist(sims(lambda r: r.present and r.wrong_face)),
                         "absent": hist(sims(lambda r: not r.present))},
    }
