"""Calibration, confidence intervals and macro-F1 for `eval.py`.

ROADMAP §12. Additive only: nothing here changes a threshold, a score, a
ranking or any existing printed number. It is a second reading of the same
predictions `eval.py` already produced.

WHY CALIBRATION IS THE METRIC THAT MATTERS HERE
-----------------------------------------------
This system's whole claim is "we know when we don't know" — it auto-links above
`tau_high`, asks a planner in the middle, and refuses below `tau_low`. That
claim is only meaningful if the confidence score means something. If mentions
scored 0.8 are correct about 80% of the time, the thresholds are principled. If
they are correct 40% of the time, the thresholds are tuned to a number that does
not carry the meaning the design assumes.

Brier score and Expected Calibration Error measure exactly that, and the
reliability table shows where the score is honest and where it is not, bin by
bin. **If the result is poor it is printed poorly** — a badly calibrated score
reported plainly is worth more than a hidden one.

CONFIDENCE INTERVALS
--------------------
At n = 254, "87.2%" invites "how sure are you?". A percentile bootstrap answers
it: resample the mentions with replacement, recompute, and report the 2.5th and
97.5th percentiles. The interval is over *sampling* variation only — it says
nothing about whether the corpus is representative, which is a separate and
larger question the corpus documents address.

MACRO VS MICRO
--------------
Six disciplines of very unequal frequency mean a micro average is dominated by
the common ones. Macro-F1 weights each discipline equally, so a discipline the
system is bad at cannot be hidden behind one it is good at. Both are reported;
neither replaces the other.

See D-051.
"""

from __future__ import annotations

import random
from typing import Callable, Iterable, Optional, Sequence

#: Reliability bins. Ten equal-width buckets over [0, 1].
BIN_EDGES = [i / 10 for i in range(11)]

#: Percentile bootstrap resamples. 2000 is enough for a stable 95% interval at
#: this n and still runs in well under a second.
BOOTSTRAP_RESAMPLES = 2000

#: Fixed so a reported interval is reproducible. A CI that moves between runs of
#: the same command is not a number anyone can quote.
BOOTSTRAP_SEED = 20260902


# ── Calibration ─────────────────────────────────────────────────────────────

def brier_score(pairs: Sequence[tuple[float, bool]]) -> Optional[float]:
    """Mean squared error between confidence and outcome. Lower is better.

    `None` on an empty input rather than 0.0 — a perfect score and no data are
    not the same thing.
    """
    if not pairs:
        return None
    return sum((conf - (1.0 if hit else 0.0)) ** 2 for conf, hit in pairs) / len(pairs)


def reliability_bins(pairs: Sequence[tuple[float, bool]]) -> list[dict]:
    """One row per confidence decile that contains at least one prediction.

    Empty bins are omitted rather than printed as zeros: this dataset's scores
    are bimodal by construction (the engine either identifies a line number or
    it does not), so the empty middle is a real property, not missing data, and
    a row of zeros would misrepresent it.
    """
    buckets: list[list[tuple[float, bool]]] = [[] for _ in range(10)]
    for conf, hit in pairs:
        index = min(9, max(0, int(conf * 10)))
        buckets[index].append((conf, hit))

    out = []
    for i, bucket in enumerate(buckets):
        if not bucket:
            continue
        n = len(bucket)
        out.append(
            {
                "lo": BIN_EDGES[i],
                "hi": BIN_EDGES[i + 1],
                "n": n,
                "mean_confidence": sum(c for c, _ in bucket) / n,
                "observed_accuracy": sum(1 for _, h in bucket if h) / n,
            }
        )
    return out


def expected_calibration_error(pairs: Sequence[tuple[float, bool]]) -> Optional[float]:
    """ECE: bin-size-weighted mean gap between claimed and observed accuracy."""
    if not pairs:
        return None
    total = len(pairs)
    return sum(
        (b["n"] / total) * abs(b["mean_confidence"] - b["observed_accuracy"])
        for b in reliability_bins(pairs)
    )


# ── Bootstrap confidence intervals ──────────────────────────────────────────

def bootstrap_ci(
    items: Sequence,
    statistic: Callable[[Sequence], Optional[float]],
    resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
    confidence: float = 0.95,
) -> Optional[tuple[float, float]]:
    """Percentile bootstrap interval for `statistic` over `items`.

    Returns `None` when there is nothing to resample, or when the statistic is
    undefined on every resample — never a fabricated interval.
    """
    if not items:
        return None
    rng = random.Random(seed)
    n = len(items)
    values: list[float] = []
    for _ in range(resamples):
        sample = [items[rng.randrange(n)] for _ in range(n)]
        value = statistic(sample)
        if value is not None:
            values.append(value)
    if not values:
        return None
    values.sort()
    tail = (1.0 - confidence) / 2.0
    lo = values[int(tail * (len(values) - 1))]
    hi = values[int((1.0 - tail) * (len(values) - 1))]
    return lo, hi


# ── Per-discipline F1 ───────────────────────────────────────────────────────

def per_discipline_f1(observations: Iterable[dict]) -> list[dict]:
    """Precision, recall and F1 per discipline over concrete suggestions.

    Each observation is `{discipline, suggested: bool, correct: bool,
    gold_positive: bool}`. A discipline with no suggestions has undefined
    precision, reported as `None` rather than 0.0.
    """
    grouped: dict[str, list[dict]] = {}
    for obs in observations:
        grouped.setdefault(obs.get("discipline") or "unknown", []).append(obs)

    rows = []
    for discipline, group in sorted(grouped.items()):
        suggested = [o for o in group if o["suggested"]]
        correct = sum(1 for o in suggested if o["correct"])
        positives = sum(1 for o in group if o["gold_positive"])

        precision = (correct / len(suggested)) if suggested else None
        recall = (correct / positives) if positives else None
        if precision is None or recall is None or (precision + recall) == 0:
            f1 = None
        else:
            f1 = 2 * precision * recall / (precision + recall)

        rows.append(
            {
                "discipline": discipline,
                "n": len(group),
                "suggested": len(suggested),
                "correct": correct,
                "precision": precision,
                "recall": recall,
                "f1": f1,
            }
        )
    return rows


def macro_f1(rows: Sequence[dict]) -> Optional[float]:
    """Unweighted mean F1 across disciplines that have one.

    Disciplines with an undefined F1 are excluded rather than counted as 0 —
    scoring a discipline the system was never asked about as a failure would
    understate it as surely as ignoring it would overstate it.
    """
    defined = [r["f1"] for r in rows if r["f1"] is not None]
    if not defined:
        return None
    return sum(defined) / len(defined)


def micro_f1(observations: Sequence[dict]) -> Optional[float]:
    """F1 over the pooled observations — what the headline figures imply.

    Computed from the observations directly rather than from the per-discipline
    rows, so it cannot drift from them by a rounding or a bucketing choice.
    """
    suggested = [o for o in observations if o["suggested"]]
    correct = sum(1 for o in suggested if o["correct"])
    positives = sum(1 for o in observations if o["gold_positive"])
    if not suggested or not positives:
        return None
    precision = correct / len(suggested)
    recall = correct / positives
    if precision + recall == 0:
        return None
    return 2 * precision * recall / (precision + recall)
