"""Evaluation harness for the matching engine against dataset/ground_truth.csv.

The engine is an entity-resolution system, so this file scores IT, not the
extractor: ground-truth mentions are turned into ExtractedEvents using the
same deterministic prepass the extractor uses (tags, quantities, dates,
discipline, status) — extraction alignment noise is deliberately excluded.

Printed tables (screenshot-ready):
  * Headline metrics — Top-1 accuracy, precision, recall, coverage,
    auto-link precision
  * Precision-at-coverage curve (sweep of tau_high)
  * Confusion table of failure modes
  * Threshold calibration report
  * Granularity rollup demo (many-to-one, quantity-based percent complete)

Usage:
  python eval.py                # calibrate on the full dataset, evaluate
  python eval.py --cv           # 5-fold CV calibration for held-out metrics
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from extraction.extractor import Extractor
from extraction.models import (
    DateBasis,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    Provenance,
)
from extraction.prepass import (
    extract_dates_with_basis,
    extract_fractions,
    extract_percentages,
    extract_quantities,
    extract_tags,
    infer_discipline,
    infer_status,
)

from matching import (
    Decision,
    MatchingEngine,
    RollupAccumulator,
    Thresholds,
    decide_outcome,
)
from evalstats import (
    BOOTSTRAP_RESAMPLES,
    BOOTSTRAP_SEED,
    bootstrap_ci,
    brier_score,
    expected_calibration_error,
    macro_f1,
    micro_f1,
    per_discipline_f1,
    reliability_bins,
)
from matching.providers import check_ground_truth_agreement

DATASET = PROJECT_ROOT / "dataset"

#: The baseline this harness measures against. `ground_truth.csv` was labelled
#: against it; `baseline_schedule_v2.json` shares no activity ids with it, so
#: pointing this at v2 without re-labelling produces numbers that describe
#: nothing. `--schedule` overrides it, and the agreement guard below is what
#: stops a wrong choice from being reported as a result.
SCHEDULE = DATASET / "baseline_schedule.json"
GROUND_TRUTH = DATASET / "ground_truth.csv"

GOLD_POSITIVE = "GOLD_POSITIVE"   # mention maps to a schedule activity
GOLD_NO_MATCH = "GOLD_NO_MATCH"   # mention must NOT be linked (NO_MATCH)


# ══════════════════════════════════════════════════════════════════════════════
# Data loading
# ══════════════════════════════════════════════════════════════════════════════

def ground_truth_activity_ids(path=None) -> list[str]:
    """Every activity id the ground truth references, NO_MATCH excluded."""
    ids: list[str] = []
    for row in _open_ground_truth(path):
        aid = (row.get("activity_id") or "").strip()
        if aid and aid != "NO_MATCH":
            ids.append(aid)
    return ids


def assert_baseline_matches_ground_truth(
    engine: MatchingEngine, ground_truth_path=None
) -> None:
    """Refuse to evaluate a baseline the ground truth does not describe.

    `load_ground_truth` skips any labelled mention whose activity id is not in
    the schedule, and prints one quiet NOTE line. That is the exact shape of a
    silent zeroing: point the harness at `baseline_schedule_v2.json`, whose 218
    activity ids do not intersect the 120 the labels were written against, and
    it drops 78 of 141 ids, keeps the 63 that collide by numeric suffix alone,
    and reports confident metrics computed from coincidences.

    So the check runs before any of that, and exits non-zero rather than
    printing a number. Resolvable coverage - not exact matching - is the
    measure, because resolution is what decides whether a row is evaluable:
    against `baseline_schedule.json` that is 141/141, and exact matching would
    be 111/141, which would fail a threshold the working baseline should pass.
    """
    agreement = check_ground_truth_agreement(
        engine.index,
        ground_truth_activity_ids(ground_truth_path),
        baseline=engine.index.baseline,
    )
    if agreement.ok:
        return
    print()
    print(rule("="))
    print(agreement.report())
    print(rule("="))
    sys.exit(2)


def _open_ground_truth(path):
    """Ground-truth files differ in encoding: the v1 key is cp1252, the v2 key
    is written as UTF-8. Decode explicitly rather than by platform default —
    a mangled activity id is a silently unresolvable label."""
    path = path or GROUND_TRUTH
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            with open(path, encoding=encoding, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    with open(path, encoding="cp1252", errors="replace", newline="") as f:
        return list(csv.DictReader(f))


def load_ground_truth(engine: MatchingEngine, path=None) -> list[dict]:
    """Load ground truth and build one ExtractedEvent per labelled mention."""
    rows: list[dict] = []
    unresolved = 0
    for i, row in enumerate(_open_ground_truth(path)):
        mention = (row["raw_mention"] or "").strip()
        if not mention:
            continue
        gold_raw = (row["activity_id"] or "").strip()
        gold = engine.index.resolve_id(gold_raw)
        if gold_raw == "NO_MATCH":
            gold_class, gold = GOLD_NO_MATCH, None
        elif gold:
            gold_class = GOLD_POSITIVE
        else:
            unresolved += 1
            continue  # cannot evaluate against a non-existent activity
        rows.append({
            "source": row["source"],
            "gold": gold,
            "gold_class": gold_class,
            "event": _build_event(mention, row["source"], row.get("source_date")),
            "mention": mention,
            "index": i,
            # Present only in the v2 key. Absent → every row is usable for
            # both calibration and reporting, which is v1's behaviour.
            "split": (row.get("split") or "").strip().lower(),
            # The date the mention text itself states, as the generator
            # recorded it. Not fed to the matcher — it is the check that
            # eval's own date resolution agrees with the corpus.
            "mention_date": (row.get("mention_date") or "").strip(),
            "discipline": (row.get("discipline") or "").strip(),
            # Near-miss instrumentation. `confusable_with` is the rest of
            # the ambiguity set the mention is compatible with.
            "match_type": (row.get("match_type") or "").strip(),
            "near_miss_kind": (row.get("near_miss_kind") or "").strip(),
            "missing_discriminator": (row.get("missing_discriminator") or "").strip(),
            "confusable_with": [
                a for a in (row.get("confusable_with") or "").split("|") if a
            ],
        })
    if unresolved:
        print(f"NOTE: {unresolved} rows skipped (gold id not in schedule)")
    return rows


def _parse_date(value) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


_STATUS_MAP = {
    "completed": EventStatus.COMPLETED,
    "in_progress": EventStatus.IN_PROGRESS,
    "not_started": EventStatus.NOT_STARTED,
    "delayed": EventStatus.DELAYED,
    "unknown": EventStatus.UNKNOWN,
}


def _build_event(mention: str, source: str, source_date) -> ExtractedEvent:
    """Turn a labelled mention into an ExtractedEvent via the shared prepass."""
    tags = extract_tags(mention)
    quantities = extract_quantities(mention)
    percentages = extract_percentages(mention)
    fractions = extract_fractions(mention)
    discipline = infer_discipline(mention)
    status, _conf = infer_status(mention)

    pct = percentages[0] if percentages else None
    if pct is None and fractions:
        num, den = fractions[0]
        if den > 0:
            pct = round(num / den * 100, 1)

    qty, uom = (quantities[0] if quantities else (None, None))
    if qty is not None and tags:
        digits = str(int(qty)) if float(qty).is_integer() else str(qty)
        if any(digits in t for t in tags):
            # quantity regex swallowed tag digits (e.g. 'P-1001 flange' → 1001)
            qty, uom = None, None

    # Start and finish claims, bound by the same code the extractor runs, so the
    # rollup below is scored against production date behaviour rather than a
    # simplification of it. reported_date deliberately stays the ground-truth
    # source_date — it is the only date the matcher scores against, and changing
    # it would move the metrics this file exists to measure. Its basis is
    # DEFAULTED_TO_REPORT_DATE because it comes from the report, not the mention.
    reported = _parse_date(source_date)
    dated, _warnings = extract_dates_with_basis(mention, reported)
    hints = {
        "dates": [d.isoformat() for d, _b in dated],
        "date_bases": [b.value for _d, b in dated],
    }
    start, start_basis, finish, finish_basis = Extractor._bind_assertion_dates(
        mention, status, hints, reported
    )

    return ExtractedEvent(
        raw_text=mention,
        tags=tags,
        reported_date=reported,
        reported_date_basis=(
            DateBasis.DEFAULTED_TO_REPORT_DATE if reported else None
        ),
        asserted_start=start,
        asserted_start_basis=start_basis,
        asserted_finish=finish,
        asserted_finish_basis=finish_basis,
        discipline=discipline,
        status=_STATUS_MAP.get(status, EventStatus.UNKNOWN),
        quantity=qty,
        uom=uom,
        percentage=pct,
        provenance=Provenance(
            source_file=source,
            source_span=mention,
            method=ExtractionMethod.PREPASS,
        ),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Threshold calibration (precision-first)
# ══════════════════════════════════════════════════════════════════════════════

TAU_LOW_GRID = [0.30, 0.35, 0.40, 0.45, 0.50]
TAU_HIGH_GRID = [round(0.55 + 0.025 * i, 3) for i in range(17)]  # 0.55 .. 0.95
MARGIN_GRID = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12]


def _decision_for(candidates, t: Thresholds):
    outcome, chosen, _margin, _why = decide_outcome(candidates, t)
    return outcome, chosen


def calibrate(scored_rows: list[dict], coverage_floor: float = 0.45) -> Thresholds:
    """Grid search. Objective, precision-first:
      1. maximise auto-link precision subject to coverage >= floor
      2. tie-break: higher coverage, then higher auto-link recall
    """
    best, best_key = None, None
    for tau_low in TAU_LOW_GRID:
        for tau_high in TAU_HIGH_GRID:
            if tau_high <= tau_low + 0.1:
                continue
            for margin in MARGIN_GRID:
                t = Thresholds(tau_low=tau_low, tau_high=tau_high, margin_min=margin)
                m = evaluate(scored_rows, t)
                if m["coverage"] < coverage_floor:
                    continue
                key = (
                    m["auto_precision"],
                    m["coverage"],
                    m["auto_recall"],
                    m["neg_rejection"],
                )
                if best_key is None or key > best_key:
                    best_key, best = key, t
    if best is None:  # no combo met the floor — maximise precision overall
        for tau_low in TAU_LOW_GRID:
            for tau_high in TAU_HIGH_GRID:
                if tau_high <= tau_low + 0.1:
                    continue
                for margin in MARGIN_GRID:
                    t = Thresholds(tau_low=tau_low, tau_high=tau_high, margin_min=margin)
                    m = evaluate(scored_rows, t)
                    key = (m["auto_precision"], m["coverage"])
                    if best_key is None or key > best_key:
                        best_key, best = key, t
    return best or Thresholds()


# ══════════════════════════════════════════════════════════════════════════════
# Metrics
# ══════════════════════════════════════════════════════════════════════════════

def evaluate(scored_rows: list[dict], t: Thresholds) -> dict:
    """Decide under thresholds `t` and compute all metrics.

    Definitions (consistent with a precision-first operating point):
      Top-1 accuracy      — gold-positive mentions whose highest-scored
                            candidate is the gold activity
      Precision           — of all concrete suggestions (AUTO_LINK + REVIEW),
                            fraction pointing at the gold activity
      Recall              — correct suggestions / gold-positive mentions
      Coverage            — fraction of ALL mentions auto-linked
      Auto-link precision — correct AUTO_LINKs / all AUTO_LINKs
      Auto-link recall    — correct AUTO_LINKs / gold-positive mentions
      NO_MATCH rejection  — gold NO_MATCH mentions sent to NEW_ACTIVITY
    """
    n = len(scored_rows)
    gold_pos = [r for r in scored_rows if r["gold_class"] == GOLD_POSITIVE]
    gold_neg = [r for r in scored_rows if r["gold_class"] == GOLD_NO_MATCH]

    tp_auto = fp_auto = 0
    tp_review = fp_review = 0
    top1_correct = top1_total = 0
    neg_rejected = neg_review = neg_auto = 0
    pos_new = pos_review_ok = pos_review_bad = pos_auto_bad = 0
    no_cand_pos = 0

    for r in scored_rows:
        cands = r["decision"].candidates
        outcome, chosen = _decision_for(cands, t)
        gold = r["gold"]

        if r["gold_class"] == GOLD_POSITIVE:
            top1_total += 1
            if cands and cands[0].activity_id == gold:
                top1_correct += 1
            if not cands:
                no_cand_pos += 1

        if outcome is Decision.AUTO_LINK:
            if gold is not None and chosen == gold:
                tp_auto += 1
            else:
                fp_auto += 1
                if r["gold_class"] == GOLD_POSITIVE:
                    pos_auto_bad += 1
                else:
                    neg_auto += 1
        elif outcome is Decision.REVIEW:
            if gold is not None and chosen == gold:
                tp_review += 1
                if r["gold_class"] == GOLD_POSITIVE:
                    pos_review_ok += 1
            else:
                fp_review += 1
                if r["gold_class"] == GOLD_POSITIVE:
                    pos_review_bad += 1
                else:
                    neg_review += 1
        else:  # NEW_ACTIVITY
            if r["gold_class"] == GOLD_NO_MATCH:
                neg_rejected += 1
            else:
                pos_new += 1

    tp_sugg = tp_auto + tp_review
    fp_sugg = fp_auto + fp_review

    return {
        "n": n,
        "n_pos": len(gold_pos),
        "n_neg": len(gold_neg),
        "top1_acc": top1_correct / top1_total if top1_total else 0.0,
        "top1_total": top1_total,
        "top1_correct": top1_correct,
        "sugg_precision": tp_sugg / (tp_sugg + fp_sugg) if (tp_sugg + fp_sugg) else 0.0,
        "recall": tp_sugg / len(gold_pos) if gold_pos else 0.0,
        "coverage": (tp_auto + fp_auto) / n if n else 0.0,
        "auto_precision": tp_auto / (tp_auto + fp_auto) if (tp_auto + fp_auto) else 0.0,
        "auto_recall": tp_auto / len(gold_pos) if gold_pos else 0.0,
        "neg_rejection": neg_rejected / len(gold_neg) if gold_neg else 0.0,
        # failure-mode counts for the confusion table
        "pos_new": pos_new,
        "pos_review_ok": pos_review_ok,
        "pos_review_bad": pos_review_bad,
        "pos_auto_bad": pos_auto_bad,
        "pos_no_cand": no_cand_pos,
        "neg_review": neg_review,
        "neg_auto": neg_auto,
        "neg_rejected": neg_rejected,
        "tp_auto": tp_auto,
        "tp_sugg": tp_sugg,
    }


def precision_at_coverage(scored_rows: list[dict], base: Thresholds) -> list[dict]:
    """Sweep tau_high — the coverage/precision trade-off frontier."""
    points = []
    for tau_high in TAU_HIGH_GRID:
        t = Thresholds(tau_low=base.tau_low, tau_high=tau_high,
                       margin_min=base.margin_min)
        m = evaluate(scored_rows, t)
        points.append({
            "tau_high": tau_high,
            "coverage": m["coverage"],
            "auto_precision": m["auto_precision"],
            "auto_recall": m["auto_recall"],
        })
    return points


# ══════════════════════════════════════════════════════════════════════════════
# Reporting — clean ASCII tables, screenshot-ready
# ══════════════════════════════════════════════════════════════════════════════

W = 78


def rule(char="-"):
    return char * W


def title(text):
    print()
    print(rule("="))
    print(f" {text}")
    print(rule("="))


def table(headers, rows, aligns=None):
    aligns = aligns or ["<"] * len(headers)
    widths = [
        max(len(str(h)), *(len(str(r[i])) for r in rows)) if rows else len(h)
        for i, h in enumerate(headers)
    ]
    fmt = "  ".join(f"{{:{a}{w}}}" for a, w in zip(aligns, widths))
    print("  " + fmt.format(*headers))
    print("  " + "-+-".join("-" * w for w in widths))
    for r in rows:
        print("  " + fmt.format(*[str(c) for c in r]))


def pct(x):
    return f"{x * 100:.1f}%"


def _baseline_line(engine) -> str:
    b = getattr(getattr(engine, "index", None), "baseline", None)
    return b.describe() if b is not None else "unknown baseline"


def print_headline(m: dict, t: Thresholds, mode: str):
    title("MATCHING ENGINE - HEADLINE METRICS")
    print(f"  evaluation mode : {mode}")
    print(f"  baseline        : {_baseline_line(_ENGINE)}")
    print(f"  mentions        : {m['n']}  (gold-positive {m['n_pos']}, NO_MATCH {m['n_neg']})")
    print(f"  thresholds      : tau_high={t.tau_high}  tau_low={t.tau_low}  margin_min={t.margin_min}")
    print()
    table(
        ["Metric", "Value", "Detail"],
        [
            ["Top-1 accuracy", pct(m["top1_acc"]),
             f"{m['top1_correct']}/{m['top1_total']} gold positives"],
            ["Precision (suggestions)", pct(m["sugg_precision"]),
             f"{m['tp_sugg']} correct suggestions"],
            ["Recall (suggestions)", pct(m["recall"]),
             f"of {m['n_pos']} gold positives"],
            ["Coverage (% auto-linked)", pct(m["coverage"]),
             f"{m['tp_auto']} correct AUTO_LINKs / {m['n']} mentions"],
            ["Auto-link precision", pct(m["auto_precision"]),
             f"correct AUTO_LINKs / all AUTO_LINKs"],
            ["Auto-link recall", pct(m["auto_recall"]),
             f"correct AUTO_LINKs / {m['n_pos']} gold positives"],
            ["NO_MATCH rejection", pct(m["neg_rejection"]),
             f"{m['neg_rejected']}/{m['n_neg']} correctly refused"],
        ],
    )


def print_confusion(m: dict):
    title("CONFUSION TABLE - FAILURE MODES")
    table(
        ["Gold \\ Decision", "AUTO_LINK", "REVIEW", "NEW_ACTIVITY"],
        [
            ["Gold activity, correct", m["tp_auto"], m["pos_review_ok"], "-"],
            ["Gold activity, WRONG", f"{m['pos_auto_bad']} (! corrupting)",
             f"{m['pos_review_bad']} (misleading)", f"{m['pos_new']} (miss)"],
            ["NO_MATCH, refused", "-", f"{m['neg_review']} (safe)",
             f"{m['neg_rejected']} (correct)"],
            ["NO_MATCH, linked", f"{m['neg_auto']} (! corrupting)", "-", "-"],
        ],
        aligns=["<", ">", ">", ">"],
    )
    print()
    load = m["pos_review_ok"] + m["pos_review_bad"] + m["neg_review"]
    print(f"  Review-queue load: {load} items (~10 s each for the planner)")


def print_pr_curve(points: list[dict], operating: Thresholds):
    title("PRECISION-AT-COVERAGE CURVE (sweep tau_high)")
    rows = []
    for p in points:
        marker = "<-- operating point" if abs(p["tau_high"] - operating.tau_high) < 1e-9 else ""
        rows.append([
            f"{p['tau_high']:.3f}", pct(p["coverage"]),
            pct(p["auto_precision"]), pct(p["auto_recall"]), marker,
        ])
    table(["tau_high", "coverage", "auto-precision", "auto-recall", ""], rows,
          aligns=[">", ">", ">", ">", "<"])
    print()
    print("  Read: raising tau_high trades coverage for precision.")


def print_near_miss(rows: list[dict], t: Thresholds):
    """Top-1 split three ways: overall, near-misses only, everything else.

    A near-miss is a mention whose deciding token has been REMOVED — the sibling
    activity is genuinely not recoverable from the text. Two consequences for
    how this table should be read:

      * Strict top-1 on this subset is partly a measure of luck. When "Sleeper
        and column footings, pipe rack" could mean Module 1, 2 or 3, picking
        the gold one is a coin toss the system cannot reason its way out of.
      * So in-family top-1 is reported beside it: did the ranker at least land
        inside the ambiguity set? That is the question the text can answer.
      * And the REVIEW rate, because on genuinely ambiguous text a confident
        auto-link is the WRONG behaviour even when it happens to be correct.
    """
    positives = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]
    near = [r for r in positives if r.get("match_type") == "near_miss"]
    rest = [r for r in positives if r.get("match_type") != "near_miss"]
    if not near:
        return

    def top1(subset):
        if not subset:
            return None, 0, 0
        hits = sum(1 for r in subset
                   if r["decision"].top1 and r["decision"].top1.activity_id == r["gold"])
        return hits / len(subset), hits, len(subset)

    title("NEAR-MISS BREAKDOWN - WHERE THE DISCRIMINATOR IS MISSING")
    rows_out = []
    for label, subset in (("Overall", positives), ("Near-miss only", near),
                          ("All the rest", rest)):
        acc, hits, n = top1(subset)
        rows_out.append([label, n, f"{hits}/{n}", pct(acc) if acc is not None else "-"])
    table(["Subset", "n", "Correct", "Top-1"], rows_out, aligns=["<", ">", ">", ">"])
    print()

    # In-family: did top-1 land anywhere in the ambiguity set?
    in_family = 0
    for r in near:
        c = r["decision"].top1
        if c and (c.activity_id == r["gold"] or c.activity_id in r["confusable_with"]):
            in_family += 1
    print(f"  In-family top-1 (gold OR a sibling it is genuinely confusable")
    print(f"  with): {in_family}/{len(near)} = {pct(in_family / len(near))}")
    print("  Strict top-1 on this subset is partly luck; in-family is the")
    print("  question the text can actually answer.")
    print()

    # Behaviour: on ambiguous text, REVIEW is correct and AUTO_LINK is not.
    outcomes = Counter()
    for r in near:
        outcome, _chosen = _decision_for(r["decision"].candidates, t)
        outcomes[outcome.value] += 1
    table(
        ["Outcome on near-misses", "n", "Share"],
        [[k, v, pct(v / len(near))] for k, v in outcomes.most_common()],
        aligns=["<", ">", ">"],
    )
    print()
    print("  On text whose discriminator is missing, REVIEW is the correct")
    print("  outcome. An AUTO_LINK here is wrong even when it hits the gold id.")
    print()

    by_kind = defaultdict(lambda: [0, 0])
    for r in near:
        k = r.get("near_miss_kind") or "?"
        by_kind[k][1] += 1
        if r["decision"].top1 and r["decision"].top1.activity_id == r["gold"]:
            by_kind[k][0] += 1
    table(
        ["Near-miss kind", "n", "Top-1"],
        [[k, v[1], pct(v[0] / v[1])] for k, v in sorted(by_kind.items())],
        aligns=["<", ">", ">"],
    )


RECALL_KS = (1, 3, 5, 10, 20)

# The planner never sees 20 candidates. Review items store their alternatives
# as `decision.candidates[:3]` (server/main.py:443, :1052, :3188), and the
# Reconcile screen builds its list as the de-duplicated
# `[suggested_activity_id, ...alternatives]` (the `candidates` useMemo in
# frontend/src/pages/Reconcile.tsx - that file is being restructured, so the
# symbol is cited rather than a line number).
# Since `Decision.top1` IS `candidates[0]` (matching/models.py:96), the suggested
# id collapses into the first alternative and the planner is shown exactly THREE
# distinct activities. k=3 is therefore the depth at which "the planner can fix
# it from the queue" is a true statement; Recall@20 does not establish that.
PLANNER_K = 3


def recall_at_k(subset: list[dict], k: int) -> tuple[float | None, int, int]:
    """Share of positives whose gold activity is anywhere in the top k.

    A candidate list shorter than k counts as a MISS, not a skip: if retrieval
    returned two candidates and neither is gold, the planner cannot resolve the
    item, and that is the thing being measured.
    """
    if not subset:
        return None, 0, 0
    hits = 0
    for r in subset:
        ids = [c.activity_id for c in r["decision"].candidates[:k]]
        if r["gold"] in ids:
            hits += 1
    return hits / len(subset), hits, len(subset)


#: Activity-id prefix -> discipline. The ids encode it; the v1 ground-truth CSV
#: does not carry a discipline column.
_ID_DISCIPLINE = {
    "CIV": "civil", "PIP": "piping", "SEQ": "static_equipment",
    "ELE": "electrical", "INS": "instrumentation", "HSE": "hse",
}


def _gold_discipline(row: dict) -> str:
    """The discipline of the mention's gold activity, or `no_match`."""
    gold = (row.get("gold") or "").strip().upper()
    if not gold or row.get("gold_class") != GOLD_POSITIVE:
        return "no_match"
    return _ID_DISCIPLINE.get(gold.split("-", 1)[0], "other")


def _calibration_observations(rows: list[dict], t: Thresholds) -> tuple[list, list]:
    """Two views of the same predictions, for calibration and for F1.

    `pairs` is (confidence, was_correct) over every mention that produced a
    concrete suggestion — the predictions whose confidence the thresholds act
    on. `observations` adds the discipline and whether the mention was a gold
    positive, for the per-discipline breakdown.

    Nothing here re-scores or re-ranks: it reads the decisions `evaluate` acted
    on.
    """
    pairs, observations = [], []
    for r in rows:
        cands = r["decision"].candidates
        outcome, chosen = _decision_for(cands, t)
        gold_positive = r["gold_class"] == GOLD_POSITIVE
        suggested = outcome in (Decision.AUTO_LINK, Decision.REVIEW) and chosen is not None
        correct = bool(suggested and chosen == r["gold"])

        if suggested and cands:
            pairs.append((float(cands[0].final_score), correct))

        observations.append({
            # From the GOLD activity id prefix, not from the row: the v1 ground
            # truth has no discipline column, so reading it there collapsed
            # every mention into one "unknown" bucket and made the macro
            # average meaningless. The gold id encodes the discipline as a
            # fact, and a NO_MATCH mention has no gold activity to take one
            # from — it is bucketed as such rather than guessed.
            "discipline": _gold_discipline(r),
            "suggested": suggested,
            "correct": correct,
            "gold_positive": gold_positive,
        })
    return pairs, observations


def print_calibration(rows: list[dict], t: Thresholds, label: str):
    """Brier, ECE, reliability table, bootstrap CIs and macro/micro F1.

    ROADMAP §12. Additive: every figure above this section is unchanged. If
    calibration is poor it is printed poorly — see D-051.
    """
    pairs, observations = _calibration_observations(rows, t)

    title("CALIBRATION - DOES THE CONFIDENCE SCORE MEAN ANYTHING?")
    print(f"  basis           : {label}, {len(pairs)} concrete suggestions")
    if not pairs:
        print("  no concrete suggestions - nothing to calibrate.")
        return

    brier = brier_score(pairs)
    ece = expected_calibration_error(pairs)
    print(f"  Brier score     : {brier:.4f}   (0 is perfect, lower is better)")
    print(f"  Expected Cal Err: {ece:.4f}   (mean gap between claimed and observed)")
    print()
    table(
        ["confidence bin", "n", "mean conf", "observed acc", "gap"],
        [
            [
                f"{b['lo']:.1f}-{b['hi']:.1f}",
                b["n"],
                f"{b['mean_confidence']:.3f}",
                f"{b['observed_accuracy']:.3f}",
                f"{b['observed_accuracy'] - b['mean_confidence']:+.3f}",
            ]
            for b in reliability_bins(pairs)
        ],
        ["<", ">", ">", ">", ">"],
    )
    print()
    print("  A positive gap means the system is better than it claims;")
    print("  negative means it is overconfident in that band. Empty bins are")
    print("  omitted: the score is bimodal by construction, and printing zero")
    print("  rows would misrepresent an absence as a measurement.")

    # ── Confidence intervals ────────────────────────────────────────────────
    title("95% CONFIDENCE INTERVALS (percentile bootstrap)")
    gold_pos = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]

    def _top1(sample):
        scored = [r for r in sample if r["decision"].candidates]
        if not scored:
            return None
        return sum(
            1 for r in scored if r["decision"].candidates[0].activity_id == r["gold"]
        ) / len(scored)

    def _auto_precision(sample):
        autos = []
        for r in sample:
            outcome, chosen = _decision_for(r["decision"].candidates, t)
            if outcome is Decision.AUTO_LINK and chosen is not None:
                autos.append(chosen == r["gold"])
        return (sum(autos) / len(autos)) if autos else None

    def _coverage(sample):
        if not sample:
            return None
        autos = sum(
            1 for r in sample
            if _decision_for(r["decision"].candidates, t)[0] is Decision.AUTO_LINK
        )
        return autos / len(sample)

    ci_rows = []
    for name, items, fn in (
        ("Top-1 accuracy", gold_pos, _top1),
        ("Coverage (auto-linked)", rows, _coverage),
        ("Auto-link precision", rows, _auto_precision),
    ):
        point = fn(items)
        ci = bootstrap_ci(items, fn)
        ci_rows.append([
            name,
            len(items),
            "-" if point is None else pct(point),
            "-" if ci is None else f"{pct(ci[0])} - {pct(ci[1])}",
        ])
    table(["metric", "n", "point", "95% CI"], ci_rows, ["<", ">", ">", ">"])
    print()
    print(f"  {BOOTSTRAP_RESAMPLES} resamples, seed {BOOTSTRAP_SEED} so the interval is")
    print("  reproducible. The interval covers SAMPLING variation only - it says")
    print("  nothing about whether this corpus represents other projects.")

    # ── Macro vs micro F1 ───────────────────────────────────────────────────
    title("PER-DISCIPLINE F1 - MACRO ALONGSIDE MICRO")
    per_discipline = per_discipline_f1(observations)
    table(
        ["discipline", "n", "suggested", "correct", "precision", "recall", "F1"],
        [
            [
                r["discipline"], r["n"], r["suggested"], r["correct"],
                "-" if r["precision"] is None else f"{r['precision']:.3f}",
                "-" if r["recall"] is None else f"{r['recall']:.3f}",
                "-" if r["f1"] is None else f"{r['f1']:.3f}",
            ]
            for r in per_discipline
        ],
        ["<", ">", ">", ">", ">", ">", ">"],
    )
    macro = macro_f1(per_discipline)
    micro = micro_f1(observations)
    print()
    print(f"  macro-F1 : {'-' if macro is None else f'{macro:.3f}'}"
          "   (every discipline counted equally)")
    print(f"  micro-F1 : {'-' if micro is None else f'{micro:.3f}'}"
          "   (dominated by the frequent disciplines)")
    print("  A macro well below micro means a rare discipline is being carried")
    print("  by a common one. Disciplines with no suggestions have an undefined")
    print("  F1 and are excluded from the macro rather than scored as zero.")


def print_recall_at_k(rows: list[dict], label: str = ""):
    """Recall@k at the depths that matter, split the same three ways as top-1.

    Reported next to the near-miss table because the two answer one question
    together: near-miss top-1 is 26.5% and every near-miss routes to REVIEW
    (D-024). That is only defensible behaviour rather than a defect if the gold
    activity is inside the short list the planner is actually shown.
    """
    positives = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]
    if not positives:
        return
    near = [r for r in positives if r.get("match_type") == "near_miss"]
    rest = [r for r in positives if r.get("match_type") != "near_miss"]

    suffix = f" - {label}" if label else ""
    title(f"RECALL@K - IS THE GOLD ACTIVITY IN THE LIST THE PLANNER SEES?{suffix}")
    subsets = [("Overall", positives)]
    if near:
        subsets += [("Near-miss only", near), ("All the rest", rest)]

    rows_out = []
    for name, subset in subsets:
        row = [name, len(subset)]
        for k in RECALL_KS:
            acc, hits, n = recall_at_k(subset, k)
            row.append(pct(acc) if acc is not None else "-")
        rows_out.append(row)
    table(
        ["Subset", "n"] + [f"R@{k}" for k in RECALL_KS],
        rows_out,
        aligns=["<", ">"] + [">"] * len(RECALL_KS),
    )
    print()

    acc3, hits3, n3 = recall_at_k(positives, PLANNER_K)
    acc20, _, _ = recall_at_k(positives, 20)
    print(f"  The planner is shown {PLANNER_K} candidates, not 20 - alternatives are")
    print(f"  stored as candidates[:3] (server/main.py:443) and the suggested id")
    print(f"  de-duplicates against the first (Reconcile.tsx, candidates useMemo).")
    print(f"  R@{PLANNER_K} = {pct(acc3)} ({hits3}/{n3}) is therefore the honest")
    print(f"  'a planner can resolve this from the queue' figure; R@20 = {pct(acc20)}")
    print("  is a retrieval-ceiling number and does not establish it.")
    if near:
        accn, hitsn, nn = recall_at_k(near, PLANNER_K)
        print()
        print(f"  On near-misses specifically: R@{PLANNER_K} = {pct(accn)} "
              f"({hitsn}/{nn}).")
        print("  Read with the near-miss table above: a low top-1 on text whose")
        print("  discriminator was deleted is defensible ONLY to the extent the")
        print("  gold activity is still in front of the planner.")
    print()


def print_date_basis(rows: list[dict]):
    """How the dates on these mentions were obtained.

    The v1 harness could not answer this: its events carried only the report
    date, so every finish came out DEFAULTED_TO_REPORT_DATE and the roll-up
    withheld all of them. The v2 key states the date inside the mention text,
    so this table is the check that the corpus and the extractor agree.
    """
    from extraction.models import DateBasis

    title("DATE BASIS - WHERE EACH DATE CAME FROM")
    counts = Counter()
    stated = 0
    agreed = 0
    for r in rows:
        ev = r["event"]
        basis = ev.asserted_finish_basis or ev.asserted_start_basis
        counts[basis.value if basis else "no date asserted"] += 1
        if r.get("mention_date"):
            stated += 1
            asserted = ev.asserted_finish or ev.asserted_start
            if asserted and asserted.isoformat() == r["mention_date"]:
                agreed += 1
    table(
        ["Basis", "Mentions", "Share"],
        [[k, v, pct(v / len(rows))] for k, v in counts.most_common()],
        aligns=["<", ">", ">"],
    )
    print()
    print(f"  {stated} mentions state a date in their own text;")
    print(f"  {agreed} of those resolve to exactly the date the corpus recorded.")
    print("  A date the text states is EXPLICIT or RELATIVE_RESOLVED and may be")
    print("  written; one defaulted to the report date is withheld (D-015).")


def _dated(value, basis) -> str:
    """A date with a marker when it was inferred rather than asserted."""
    if value is None:
        return "-"
    mark = "~" if basis is DateBasis.DEFAULTED_TO_REPORT_DATE else ""
    return f"{value.isoformat()}{mark}"


def print_rollup(scored_rows: list[dict], t: Thresholds):
    title("GRANULARITY - MANY-TO-ONE ROLLUP + QUANTITY-BASED % COMPLETE")
    acc = _rollup_from_decisions(scored_rows, t)
    all_results = acc.results()
    results = [r for r in all_results if r.percent_complete > 0][:12]
    if not results:
        print("  (no rollup-able auto-links at this operating point)")
        return
    rows = []
    for r in results:
        rows.append([
            r.activity_id, r.n_events,
            f"{r.installed_qty:g}/{r.planned_qty:g} {r.uom}".rstrip(),
            pct(r.percent_complete / 100),
            _dated(r.actual_start, r.actual_start_basis),
            _dated(r.actual_finish, r.actual_finish_basis)
            if r.actual_finish or not r.withheld_finish
            else "withheld",
        ])
    table(
        ["Activity", "Mentions", "Installed/Planned", "% Complete",
         "Actual Start", "Actual Finish"],
        rows,
        aligns=["<", ">", ">", ">", ">", ">"],
    )
    touched = len(all_results)
    silent = touched - len(results)
    withheld = [r for r in all_results if r.withheld_finish]
    print()
    print(f"  {touched} schedule nodes received auto-linked mentions;")
    print(f"  {silent} had no measurable quantity/percent -> 0% written, no dates.")
    print("  Actual Finish is written ONLY for nodes at 100% whose finish date")
    print("  a source actually named. '~' marks a date inferred from the report")
    print("  date rather than asserted by the source.")
    if withheld:
        print(f"  {len(withheld)} complete nodes had their finish date withheld and")
        print("  routed to the planner: the only candidate was the report date.")


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════

def _rollup_from_decisions(scored_rows: list[dict], t: Thresholds) -> RollupAccumulator:
    """Feed AUTO_LINK decisions through the granularity accumulator."""
    # The accumulator needs the engine to resolve activities — build a light
    # shim by re-using the module-level engine created in main().
    acc = RollupAccumulator(_ENGINE)
    for r in scored_rows:
        outcome, chosen = _decision_for(r["decision"].candidates, t)
        if outcome is Decision.AUTO_LINK:
            d = r["decision"]
            d.outcome = Decision.AUTO_LINK
            d.chosen_activity_id = chosen
            acc.add(d, r["event"])
        else:
            r["decision"].outcome = outcome
            r["decision"].chosen_activity_id = chosen if outcome is Decision.REVIEW else None
    return acc


_ENGINE: MatchingEngine | None = None


def run_cv(rows: list[dict], folds: int = 5) -> Thresholds:
    """5-fold CV: calibrate on 4/5 of the data, decide the held-out fifth.

    Because decisions are a pure function of (candidates, thresholds), the
    CV-calibrated threshold is applied to the pooled held-out predictions.
    Returns the median-fold threshold actually used for the pooled metrics.
    """
    n = len(rows)
    chosen: list[Thresholds] = []
    pooled: list[dict] = []
    for k in range(folds):
        test_idx = set(range(k, n, folds))
        train = [r for i, r in enumerate(rows) if i not in test_idx]
        test = [r for i, r in enumerate(rows) if i in test_idx]
        t = calibrate(train)
        chosen.append(t)
        pooled.extend(test)
    # median-fold thresholds → evaluate on pooled held-out rows
    mids = sorted(
        (t.tau_high, t.tau_low, t.margin_min) for t in chosen
    )[len(chosen) // 2]
    t_med = Thresholds(tau_high=mids[0], tau_low=mids[1], margin_min=mids[2])
    m = evaluate(pooled, t_med)
    # stash pooled metrics for the report
    global _CV_METRICS
    _CV_METRICS = m
    return t_med


_CV_METRICS: dict | None = None


def main():
    global _ENGINE
    ap = argparse.ArgumentParser(description="Matching engine evaluation")
    ap.add_argument("--cv", action="store_true",
                    help="5-fold cross-validated calibration (held-out metrics)")
    ap.add_argument("--coverage-floor", type=float, default=0.45,
                    help="minimum auto-link coverage during calibration")
    ap.add_argument("--schedule", default=str(SCHEDULE),
                    help="baseline schedule to evaluate against "
                         "(default: dataset/baseline_schedule.json)")
    ap.add_argument("--ground-truth", default=str(GROUND_TRUTH),
                    help="labelled mentions to evaluate with "
                         "(default: dataset/ground_truth.csv)")
    ap.add_argument("--production", action="store_true",
                    help="use the fitted ranker + calibrator from "
                         "matching/artifacts (only applies to the baseline they "
                         "were fitted against; otherwise falls back and says so)")
    args = ap.parse_args()

    print("Loading schedule + ground truth ...")
    cfg = None
    if args.production:
        from matching.config import production
        from matching.schedule_index import ScheduleIndex
        sha = ScheduleIndex.from_json(args.schedule).baseline.sha256
        cfg = production(sha)
        print("  ranking: fitted ranker + calibrator"
              if cfg.ranker_path else
              "  ranking: hand-set blend (no artefact for this baseline)")
    _ENGINE = MatchingEngine(args.schedule, config=cfg)
    embed_info = (
        "sentence-transformers all-MiniLM-L6-v2 (local, offline)"
        if _ENGINE.retriever.embedder.is_neural
        else "hashed-ngram FALLBACK (MiniLM unavailable)"
    )
    baseline = _ENGINE.index.baseline
    if baseline is not None:
        # Every number below is only meaningful next to the baseline that
        # produced it. Print it before the metrics, not in a footnote.
        print(f"  baseline: {baseline.describe()}")
    print(f"  schedule: {len(_ENGINE.index.records)} activities | dense: {embed_info}")
    assert_baseline_matches_ground_truth(_ENGINE, args.ground_truth)

    rows = load_ground_truth(_ENGINE, args.ground_truth)
    print(f"  ground truth: {Path(args.ground_truth).name} — "
          f"{len(rows)} labelled mentions")

    print("Scoring candidates (hybrid retrieval + feature scoring) ...")
    decisions = _ENGINE.match_events([r["event"] for r in rows])
    for r, d in zip(rows, decisions):
        r["decision"] = d

    # Splits, when the key carries them. Thresholds are tuned on dev and the
    # headline is reported on test — a threshold chosen on the rows it is then
    # scored against is not a measurement, it is a memory of them.
    dev = [r for r in rows if r["split"] == "dev"]
    test = [r for r in rows if r["split"] == "test"]
    split_mode = bool(dev and test)

    if args.cv:
        t = run_cv(rows)
        m = _CV_METRICS or evaluate(rows, t)
        mode = "5-fold cross-validated thresholds (pooled held-out)"
        report_rows = rows
    elif split_mode:
        t = calibrate(dev, coverage_floor=args.coverage_floor)
        m = evaluate(test, t)
        mode = (f"thresholds calibrated on dev ({len(dev)} mentions), "
                f"metrics reported on HELD-OUT test ({len(test)} mentions)")
        report_rows = test
        print(f"  splits: train {sum(1 for r in rows if r['split'] == 'train')} | "
              f"dev {len(dev)} | test {len(test)}")
    else:
        t = calibrate(rows, coverage_floor=args.coverage_floor)
        m = evaluate(rows, t)
        mode = "calibrated + evaluated on the full dataset"
        report_rows = rows

    print_headline(m, t, mode)
    print_confusion(m)
    print_pr_curve(precision_at_coverage(report_rows, t), t)
    print_near_miss(report_rows, t)
    # Retrieval depth is a property of the ranked candidate list, not of the
    # thresholds, so this reports on whichever rows the mode held out.
    if args.cv:
        recall_label = "pooled out-of-fold"
    elif split_mode:
        recall_label = "held-out test"
    else:
        recall_label = "full dataset"
    print_recall_at_k(report_rows, recall_label)
    print_calibration(report_rows, t, recall_label)
    print_date_basis(report_rows)
    print_rollup(report_rows, t)
    print()
    print(rule("="))
    print(" Definitions: precision = correct suggestions / all concrete")
    print(" suggestions (AUTO_LINK + REVIEW); recall = correct suggestions")
    print(" / gold positives; coverage = auto-linked / all mentions.")
    print(rule("="))


if __name__ == "__main__":
    main()




