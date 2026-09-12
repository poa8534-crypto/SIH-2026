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

Optional extras (off unless EngineConfig.extra_features is set — each has to
earn its place in the ablation before it is on by default):
  * uom_compatibility            — event unit vs the activity's planned unit
  * quantity_proximity           — reported quantity vs the planned quantity
  * predecessor_progress         — has the predecessor actually started
  * report_position              — where the report date sits in the window
  * area_match                   — shared area / WBS branch

`None` means the signal is absent (e.g. no tag in the text) — the feature is
excluded from the blend and the weights renormalise.

Scoring runs as a MATRIX operation over the whole candidate pool. The
per-candidate Python loop it replaced spent most of its time in two places:
forty `fuzz.token_set_ratio` calls per event, and a nested loop over
predecessors. Both are now single vectorised calls; see `score_pool`.
"""

from __future__ import annotations

import math
from datetime import date

import numpy as np
from rapidfuzz import fuzz, process as rf_process

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

# Extra features carry weight only when enabled. Deliberately small: they are
# refinements on an already-strong blend, not new primary evidence.
EXTRA_FEATURE_WEIGHTS = {
    "uom_compatibility": 0.05,
    "quantity_proximity": 0.05,
    "predecessor_progress": 0.03,
    "report_position": 0.03,
    "area_match": 0.04,
}

#: Order of the columns in the matrix returned by `feature_matrix`.
BASE_FEATURE_ORDER = [
    "tag_overlap",
    "discipline_agreement",
    "date_proximity",
    "predecessor_plausibility",
    "fuzzy_similarity",
    "embedding_cosine",
]
EXTRA_FEATURE_ORDER = [
    "uom_compatibility",
    "quantity_proximity",
    "predecessor_progress",
    "report_position",
    "area_match",
]
ALL_FEATURE_ORDER = BASE_FEATURE_ORDER + EXTRA_FEATURE_ORDER

DISCIPLINE_MISMATCH_SCORE = 0.3  # not 0.0 — inference errors shouldn't nuke truth

DATE_WINDOW_START_GRACE = 3     # days before planned_start that work may begin
DATE_WINDOW_END_GRACE = 10      # days after planned_finish still "on plan"
DATE_DECAY_DAYS = 21.0          # exponential decay beyond the grace window
PRED_GRACE_DAYS = 7             # predecessor finish tolerance
PRED_HARD_LATE_DAYS = 21        # predecessor this late → activity not startable


# ══════════════════════════════════════════════════════════════════════════════
# Scalar path — one (event, candidate) pair
# ══════════════════════════════════════════════════════════════════════════════

def compute_features(
    index: ScheduleIndex,
    event,            # extraction.models.ExtractedEvent
    cand: ActivityRecord,
    reported_date: date | None,
    embedding_cosine: float | None,
    extra: bool = False,
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

    if extra:
        fv.uom_compatibility = _uom_compatibility(event, cand)
        fv.quantity_proximity = _quantity_proximity(event, cand)
        fv.predecessor_progress = _predecessor_progress(index, cand, reported_date)
        fv.report_position = _report_position(cand, reported_date)
        fv.area_match = _area_match(event, cand)

    return fv


def _tag_overlap(event, cand: ActivityRecord, text: str) -> tuple[float | None, bool]:
    """Returns (score, line_locked). A full line+size+spec match sets
    line_locked=True — the line number is identified with near-decisive force.

    The scalar entry point: derives the event's tag keys, then delegates. The
    pool path derives them once and calls `_tag_overlap_keys` directly.
    """
    if not event.tags:
        return None, False
    ekeys = [
        k for t in event.tags for v in tag_variants(t)
        if (k := parse_tag(v)).get("line")
    ]
    return _tag_overlap_keys(ekeys, extract_size_mentions(text), cand)


def _tag_overlap_keys(
    event_tag_keys: list[dict], text_sizes: set[int], cand: ActivityRecord
) -> tuple[float | None, bool]:
    """Tag overlap given the event's already-parsed tag keys and sizes."""
    if not cand.tag_keys:
        return 0.0, False

    best, locked = 0.0, False
    for ekey in event_tag_keys:
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


# ── Optional extra features ──────────────────────────────────────────────────

def _uom_compatibility(event, cand: ActivityRecord) -> float | None:
    """Do the event's unit and the activity's planned unit describe the same
    kind of measurement? A metre reported against a node planned in m3 is
    evidence AGAINST the pairing, not neutral."""
    ev = normalize_uom(getattr(event, "uom", None))
    ac = normalize_uom(cand.uom)
    if not ev or not ac:
        return None
    return 1.0 if ev == ac else 0.0


def _quantity_proximity(event, cand: ActivityRecord) -> float | None:
    """A reported quantity should not exceed what the node plans. 120 m
    reported against a 40 m node is almost certainly the wrong node."""
    qty = getattr(event, "quantity", None)
    if qty is None or cand.planned_qty <= 0:
        return None
    if normalize_uom(getattr(event, "uom", None)) and normalize_uom(cand.uom):
        if normalize_uom(event.uom) != normalize_uom(cand.uom):
            return None      # incomparable; _uom_compatibility carries that
    ratio = qty / cand.planned_qty
    if ratio <= 1.0:
        return 1.0
    # Overshoot decays: 2x planned is implausible, 10x is nonsense.
    return max(0.0, math.exp(-(ratio - 1.0)))


def _predecessor_progress(
    index: ScheduleIndex, cand: ActivityRecord, reported: date | None
) -> float | None:
    """Predecessor STATE rather than plausibility: the share of predecessors
    that have actually started by the report date."""
    if not cand.predecessors or reported is None:
        return None
    d = reported.toordinal()
    started = total = 0
    for pid in cand.predecessors:
        pred = index.by_id.get(str(pid).strip())
        if pred is None or pred.planned_start is None:
            continue
        total += 1
        if pred.planned_start.toordinal() <= d:
            started += 1
    return started / total if total else None


def _report_position(cand: ActivityRecord, reported: date | None) -> float | None:
    """Where the mention sits inside the planned window, 0 at the start and
    1 at the finish. Distinct from date_proximity, which saturates at 1.0
    anywhere inside the window and so cannot separate two overlapping
    activities the way a position can."""
    if reported is None or cand.planned_start is None or cand.planned_finish is None:
        return None
    lo = cand.planned_start.toordinal()
    hi = cand.planned_finish.toordinal()
    if hi <= lo:
        return 1.0 if reported.toordinal() == lo else 0.0
    frac = (reported.toordinal() - lo) / (hi - lo)
    return float(min(1.0, max(0.0, frac)))


def _area_match(event, cand: ActivityRecord) -> float | None:
    """Shared area / WBS branch between the mention text and the activity.

    Only the WBS path is available on both sides of the corpus, so this reads
    as: does the mention name any WBS branch token this activity sits under?
    """
    if not cand.wbs_path:
        return None
    text = (event.raw_text or "").lower()
    parts = [p.strip().lower() for p in cand.wbs_path.split(".") if p.strip()]
    parts = [p for p in parts if len(p) >= 4]
    if not parts:
        return None
    return 1.0 if any(p in text for p in parts) else 0.0


# ══════════════════════════════════════════════════════════════════════════════
# Blend
# ══════════════════════════════════════════════════════════════════════════════

def final_score(fv: FeatureVector, extra: bool = False) -> float:
    """Weighted blend over present features, renormalised."""
    weights = dict(FEATURE_WEIGHTS)
    if extra:
        weights.update(EXTRA_FEATURE_WEIGHTS)
    num, den = 0.0, 0.0
    for name, w in weights.items():
        v = getattr(fv, name, None)
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


# ══════════════════════════════════════════════════════════════════════════════
# Vectorised path — the whole candidate pool at once
# ══════════════════════════════════════════════════════════════════════════════

def score_pool(
    index: ScheduleIndex,
    event,
    cand_ids: list[int],
    reported_date: date | None,
    dense_cos: list[float | None],
    extra: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Score every candidate in one pass.

    Returns (matrix, present_mask, line_locked):
      matrix       (n_cands, n_features)  values in [0, 1], NaN where absent
      present_mask (n_cands, n_features)  True where the signal exists
      line_locked  (n_cands,)             bool

    NaN, not 0.0, marks an absent signal — a missing feature must drop out of
    the renormalised blend, and a zero would instead be read as strong
    evidence AGAINST the candidate.
    """
    names = ALL_FEATURE_ORDER if extra else BASE_FEATURE_ORDER
    n, f = len(cand_ids), len(names)
    M = np.full((n, f), np.nan)
    locked = np.zeros(n, dtype=bool)
    if n == 0:
        return M, np.zeros((0, f), dtype=bool), locked

    idx = np.asarray(cand_ids, dtype=np.intp)
    col = {name: i for i, name in enumerate(names)}
    text = event.raw_text or ""

    # ── tag_overlap ──
    # Dict-driven rather than arithmetic, so it stays a loop — but the event's
    # own tag keys and size mentions are properties of the EVENT, not of the
    # candidate, and re-deriving them per candidate made parse_tag and
    # extract_size_mentions the third and fourth hottest calls in the stage.
    if event.tags:
        ekeys = [parse_tag(v) for t in event.tags for v in tag_variants(t)]
        ekeys = [k for k in ekeys if k.get("line")]
        text_sizes = extract_size_mentions(text)
        for r, i in enumerate(cand_ids):
            ov, lk = _tag_overlap_keys(ekeys, text_sizes, index.records[i])
            M[r, col["tag_overlap"]] = np.nan if ov is None else ov
            locked[r] = lk

    # ── discipline_agreement ──
    if event.discipline is not None and event.discipline.value != "unknown":
        ev_disc = event.discipline.value
        same = np.array(
            [index.disciplines[i] == ev_disc for i in cand_ids], dtype=bool
        )
        M[:, col["discipline_agreement"]] = np.where(
            same, 1.0, DISCIPLINE_MISMATCH_SCORE
        )

    # ── date_proximity + report_position ──
    if reported_date is not None:
        d = float(reported_date.toordinal())
        ps = index.col_planned_lo[idx]
        pf = index.col_planned_hi[idx]
        have = ~(np.isnan(ps) | np.isnan(pf))
        lo = ps - DATE_WINDOW_START_GRACE
        hi = pf + DATE_WINDOW_END_GRACE
        inside = (lo <= d) & (d <= hi)
        with np.errstate(invalid="ignore"):
            dist = np.minimum(np.abs(d - lo), np.abs(d - hi))
            decayed = np.maximum(0.0, np.exp(-dist / DATE_DECAY_DAYS))
        prox = np.where(inside, 1.0, decayed)
        M[:, col["date_proximity"]] = np.where(have, prox, np.nan)

        if extra:
            with np.errstate(invalid="ignore", divide="ignore"):
                span = pf - ps
                frac = np.where(span > 0, (d - ps) / np.where(span > 0, span, 1.0),
                                np.where(d == ps, 1.0, 0.0))
            M[:, col["report_position"]] = np.where(
                have, np.clip(frac, 0.0, 1.0), np.nan
            )

    # ── predecessor_plausibility (+ progress) ──
    has_pred = index.col_has_pred[idx]
    if reported_date is None:
        # No report date: activities WITH predecessors have no signal, ones
        # without still score 1.0 — mirrors the scalar function exactly.
        M[:, col["predecessor_plausibility"]] = np.where(has_pred, np.nan, 1.0)
    else:
        d = float(reported_date.toordinal())
        pfin = index.col_pred_finish[idx] + PRED_GRACE_DAYS   # (n, w)
        pstart = index.col_pred_start[idx]
        valid = ~np.isnan(pfin)
        with np.errstate(invalid="ignore"):
            finished = valid & (pfin <= d)
            started = valid & ~finished & (pstart <= d)
            hard_late = valid & ~finished & ~started & (pfin > d + PRED_HARD_LATE_DAYS)
            middling = valid & ~finished & ~started & ~hard_late
        # min() over predecessors, taken by bucket rather than elementwise:
        # 0.3 dominates 0.5 dominates 0.7 dominates 1.0.
        plaus = np.ones(len(cand_ids))
        plaus = np.where(started.any(axis=1), 0.7, plaus)
        plaus = np.where(middling.any(axis=1), 0.5, plaus)
        plaus = np.where(hard_late.any(axis=1), 0.3, plaus)
        M[:, col["predecessor_plausibility"]] = plaus

        if extra:
            with np.errstate(invalid="ignore"):
                sv = ~np.isnan(pstart)
                started_any = sv & (pstart <= d)
            tot = sv.sum(axis=1)
            M[:, col["predecessor_progress"]] = np.where(
                tot > 0, started_any.sum(axis=1) / np.maximum(tot, 1), np.nan
            )

    # ── fuzzy_similarity: ONE rapidfuzz call for the whole pool ──
    # process.cdist runs the comparisons in C++ and releases the GIL; the
    # loop it replaces made 2 * len(pool) Python-level calls per event.
    choices = []
    for i in cand_ids:
        rec = index.records[i]
        choices.append(rec.description)
        choices.append(f"{rec.description} {rec.detail}".strip())
    sims = rf_process.cdist(
        [text], choices, scorer=fuzz.token_set_ratio, dtype=np.float32
    )[0]
    M[:, col["fuzzy_similarity"]] = np.maximum(sims[0::2], sims[1::2]) / 100.0

    # ── embedding_cosine ──
    M[:, col["embedding_cosine"]] = [
        np.nan if c is None else c for c in dense_cos
    ]

    # ── remaining extras (cheap scalar helpers, no schedule-wide structure) ──
    if extra:
        ev_uom = normalize_uom(getattr(event, "uom", None))
        qty = getattr(event, "quantity", None)
        for r, i in enumerate(cand_ids):
            rec = index.records[i]
            u = _uom_compatibility(event, rec)
            if u is not None:
                M[r, col["uom_compatibility"]] = u
            q = _quantity_proximity(event, rec)
            if q is not None:
                M[r, col["quantity_proximity"]] = q
            a = _area_match(event, rec)
            if a is not None:
                M[r, col["area_match"]] = a
        _ = (ev_uom, qty)

    return M, ~np.isnan(M), locked


def blend_matrix(M: np.ndarray, extra: bool = False) -> np.ndarray:
    """Weighted blend of a feature matrix, renormalised over present features.

    The scalar `final_score` computes exactly this for one row; this computes
    it for the pool without a Python loop.
    """
    names = ALL_FEATURE_ORDER if extra else BASE_FEATURE_ORDER
    weights = dict(FEATURE_WEIGHTS)
    if extra:
        weights.update(EXTRA_FEATURE_WEIGHTS)
    w = np.array([weights[n] for n in names])
    present = ~np.isnan(M)
    clipped = np.clip(np.nan_to_num(M, nan=0.0), 0.0, 1.0)
    num = clipped @ w
    den = present @ w
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(den > 0, num / np.where(den > 0, den, 1.0), 0.0)
    return np.round(out, 6)


def matrix_to_vectors(
    M: np.ndarray, locked: np.ndarray, extra: bool = False
) -> list[FeatureVector]:
    """Turn the scored matrix back into the audited per-candidate contract.

    `rationale` and the API both read FeatureVector, so the matrix is an
    implementation detail of HOW the numbers are produced, never a change to
    what is recorded about them.
    """
    names = ALL_FEATURE_ORDER if extra else BASE_FEATURE_ORDER
    absent = {n: None for n in ALL_FEATURE_ORDER}
    present = ~np.isnan(M)
    vals = M.tolist()          # one C-level conversion beats per-cell float()
    flags = present.tolist()
    lock = locked.tolist()
    out = []
    for r in range(M.shape[0]):
        kw = dict(absent)
        row, ok = vals[r], flags[r]
        for c, name in enumerate(names):
            if ok[c]:
                kw[name] = row[c]
        # model_construct skips pydantic validation. Every value here was
        # produced by this module as a float or None and the field types are
        # exactly that, so validation can only cost time — 32,560 validations
        # per corpus pass were the single hottest call in the stage.
        out.append(FeatureVector.model_construct(
            line_locked=bool(lock[r]), **kw
        ))
    return out
