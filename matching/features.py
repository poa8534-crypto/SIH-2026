"""Feature scoring per (event, candidate) pair — the precision-oriented stage.

Features:
  * tag_overlap                  — exact/near-exact tag match (near-decisive)
  * discipline_agreement
  * date_proximity               — closeness of the reported date to the
                                   activity's planned window
  * predecessor_plausibility     — incl. whether the activity is logically
                                   startable at the reported date
  * fuzzy_similarity             — rapidfuzz token-set ratio
  * embedding_cosine             — MiniLM cosine similarity

`None` means the signal is absent (e.g. no tag in the text) — the feature is
excluded from the blend and the weights renormalise.
"""

from __future__ import annotations

import math
from datetime import date

from rapidfuzz import fuzz

from .models import FeatureVector
from .schedule_index import ActivityRecord, ScheduleIndex
from .textutils import (
    extract_size_mentions,
    normalize_uom,
    parse_tag,
    tag_variants,
)

# Feature weights for the final score. Tag evidence dominates; discipline is
# a soft signal (inference from field text is noisy — e.g. "pipe rack" reads
# as piping even in a civil sentence).
FEATURE_WEIGHTS = {
    "tag_overlap": 0.32,
    "discipline_agreement": 0.06,
    "date_proximity": 0.10,
    "predecessor_plausibility": 0.06,
    "fuzzy_similarity": 0.20,
    "embedding_cosine": 0.22,
}

DISCIPLINE_MISMATCH_SCORE = 0.3  # not 0.0 — inference errors shouldn't nuke truth

DATE_WINDOW_START_GRACE = 3     # days before planned_start that work may begin
DATE_WINDOW_END_GRACE = 10      # days after planned_finish still "on plan"
DATE_DECAY_DAYS = 21.0          # exponential decay beyond the grace window
PRED_GRACE_DAYS = 7             # predecessor finish tolerance
PRED_HARD_LATE_DAYS = 21        # predecessor this late → activity not startable


def compute_features(
    index: ScheduleIndex,
    event,            # extraction.models.ExtractedEvent
    cand: ActivityRecord,
    reported_date: date | None,
    embedding_cosine: float | None,
) -> FeatureVector:
    text = event.raw_text
    fv = FeatureVector()

    # ── 1. Tag overlap ──
    fv.tag_overlap, fv.line_locked = _tag_overlap(event, cand, text)

    # ── 2. Discipline agreement ──
    if event.discipline is not None and event.discipline.value != "unknown":
        fv.discipline_agreement = (
            1.0 if event.discipline.value == cand.discipline
            else DISCIPLINE_MISMATCH_SCORE
        )

    # ── 3. Date proximity to the planned window ──
    fv.date_proximity = _date_proximity(cand, reported_date)

    # ── 4. Predecessor-state plausibility / startability ──
    fv.predecessor_plausibility = _predecessor_plausibility(index, cand, reported_date)

    # ── 5. String similarity (rapidfuzz) ──
    base = cand.description
    extended = f"{cand.description} {cand.detail}".strip()
    fv.fuzzy_similarity = max(
        fuzz.token_set_ratio(text, base),
        fuzz.token_set_ratio(text, extended),
    ) / 100.0

    # ── 6. Embedding cosine ──
    fv.embedding_cosine = embedding_cosine

    return fv


def _tag_overlap(event, cand: ActivityRecord, text: str) -> tuple[float | None, bool]:
    """Returns (score, line_locked). A full line+size+spec match sets
    line_locked=True — the line number is identified with near-decisive force."""
    if not event.tags:
        return None, False
    if not cand.tag_keys:
        return 0.0, False
    event_tag_keys = [
        parse_tag(v) for t in event.tags for v in tag_variants(t)
    ]
    text_sizes = extract_size_mentions(text)

    best, locked = 0.0, False
    for ekey in event_tag_keys:
        if not ekey.get("line"):
            continue
        for ckey in cand.tag_keys:
            if ckey["line"] != ekey["line"]:
                continue
            s = 0.85  # line identified, no contradicting evidence
            if ekey.get("spec") and ckey.get("spec"):
                s = 1.0 if ekey["spec"] == ckey["spec"] else 0.5
            # Size agreement: from the event tag, else the single size in text
            esize = ekey.get("size")
            csize = ckey.get("size")
            if esize is None and len(text_sizes) == 1:
                esize = next(iter(text_sizes))
            if esize is not None and csize is not None:
                if esize == csize:
                    s = min(1.0, s + 0.05)
                else:
                    # 12" field mention vs 6" schedule line — hard conflict
                    best = max(best, 0.35)
                    continue
            locked = True  # line number identified, no contradicting evidence
            best = max(best, s)
    return best, locked


def _date_proximity(cand: ActivityRecord, reported: date | None) -> float | None:
    if reported is None or cand.planned_start is None or cand.planned_finish is None:
        return None
    lo = cand.planned_start.toordinal() - DATE_WINDOW_START_GRACE
    hi = cand.planned_finish.toordinal() + DATE_WINDOW_END_GRACE
    d = reported.toordinal()
    if lo <= d <= hi:
        return 1.0
    dist = min(abs(d - lo), abs(d - hi))
    return max(0.0, math.exp(-dist / DATE_DECAY_DAYS))


def _predecessor_plausibility(
    index: ScheduleIndex, cand: ActivityRecord, reported: date | None
) -> float | None:
    """1.0  — no predecessors, or all finished (with grace) by report date
       0.7  — predecessors started but not yet finished (overlap: plausible)
       0.3  — a predecessor finishes far after the report date: the activity
              is logically not startable yet
       0.5  — anything else"""
    if not cand.predecessors:
        return 1.0
    if reported is None:
        return None
    d = reported.toordinal()
    results = []
    for pid in cand.predecessors:
        pred = index.by_id.get(str(pid).strip())
        if pred is None or pred.planned_finish is None:
            continue
        pf = pred.planned_finish.toordinal() + PRED_GRACE_DAYS
        ps = pred.planned_start.toordinal() if pred.planned_start else pf
        if pf <= d:
            results.append(1.0)
        elif ps <= d:
            results.append(0.7)
        elif pf > d + PRED_HARD_LATE_DAYS:
            results.append(0.3)
        else:
            results.append(0.5)
    if not results:
        return 1.0
    return min(results)


def final_score(fv: FeatureVector) -> float:
    """Weighted blend over present features, renormalised."""
    num, den = 0.0, 0.0
    for name, w in FEATURE_WEIGHTS.items():
        v = getattr(fv, name)
        if v is None:
            continue
        num += w * max(0.0, min(1.0, v))
        den += w
    return round(num / den, 6) if den > 0 else 0.0


def blend_with_line_lock(score: float, fv: FeatureVector, unique_line: bool) -> float:
    """Near-decisive tag rule, applied at decision time:
    * full line+size+spec match resolving to a UNIQUE schedule activity
      → floor 0.93 (the line number pins down the node almost alone)
    * any line-locked candidate → floor just above tau_low: the line is
      identified, so NEW_ACTIVITY is wrong even if the activity type is not.
    """
    if unique_line and fv.line_locked and (fv.tag_overlap or 0) >= 1.0:
        return max(score, 0.93)
    if fv.line_locked:
        return max(score, 0.46)
    return score

