"""Terminology-drift benchmark: quality audit + engine evaluation + failures.

Three jobs, in one reproducible run:

1. QUALITY (Phase 2). Is the drift corpus actually a hard, honest test?
   Reports, for BOTH the drift corpus and the legacy v2 test split:
     * % of mentions with a verbatim >=6-token run shared with the gold
       description (the circularity metric the audit flagged at ~72.6%);
     * mean/median token-Jaccard against the gold description;
     * % that name the activity id / the equipment tag outright.
2. EVALUATION (Phase 4). The engine under `--config` runs the drift corpus
   with thresholds calibrated ONLY on the legacy dev split — nothing about
   the drift corpus feeds calibration, so the number is a real held-out
   result. Metrics: Top-1, Recall@3/@20 (gold inside the top-k candidate
   pool), auto-link precision, coverage, review rate, in-sibling top-1,
   latency, breakdown by drift_kind.
3. FAILURES (Phase 5). Every failure categorised:
     retrieval_failure   gold not in the top-20 candidate pool
     sibling_confusion   top-1 shares the gold's tag/term-family
     term_mapping_miss   gold in pool but top-1 unrelated and few shared
                         tokens — the terminology mapping failed
     ranking_other       gold in pool, top-1 unrelated but lexically close
   plus five worked examples for the report.

Usage:
  .venv/bin/python research/bench/drift_eval.py --config baseline --out research/bench/DRIFT_baseline.txt
  .venv/bin/python research/bench/drift_eval.py --config term      --out research/bench/DRIFT_term.txt
"""

from __future__ import annotations

import argparse
import csv
import re
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import eval as evalmod  # noqa: E402
from matching import MatchingEngine, Thresholds  # noqa: E402
from matching.config import EngineConfig  # noqa: E402
from matching.textutils import parse_tag, tokenize  # noqa: E402

SCHEDULE = ROOT / "dataset" / "baseline_schedule_v2.json"
GT_LEGACY = ROOT / "dataset" / "v2" / "ground_truth_v2.csv"
GT_DRIFT = ROOT / "dataset" / "v2" / "ground_truth_drift.csv"

CONFIGS = {
    "baseline": lambda: EngineConfig(),
    "term": lambda: EngineConfig().with_retrieval(term_expansion=True),
}
W = 78


def rule(c="-") -> str:
    return c * W


def title(text: str) -> None:
    print()
    print(rule("="))
    print(f" {text}")
    print(rule("="))


# ══════════════════════════════════════════════════════════════════════════════
# Quality metrics (Phase 2)
# ══════════════════════════════════════════════════════════════════════════════

def longest_common_run(a: list[str], b: list[str]) -> int:
    """Longest CONTIGUOUS token run shared by two token lists."""
    best = 0
    for i in range(len(a)):
        for j in range(len(b)):
            k = 0
            while i + k < len(a) and j + k < len(b) and a[i + k] == b[j + k]:
                k += 1
            best = max(best, k)
    return best


def jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def gold_text(index, gold_id: str) -> str:
    rec = index.records[index.index_of(gold_id)]
    return f"{rec.description} {rec.detail or ''}".strip()


def gold_description(index, gold_id: str) -> str:
    return index.records[index.index_of(gold_id)].description


def load_drift_kinds(path: str) -> dict[str, str]:
    """raw_mention -> drift_kind (evalmod's shared loader drops that column)."""
    with open(path, encoding="utf-8", newline="") as f:
        return {r["raw_mention"]: r.get("drift_kind", "") for r in csv.DictReader(f)}


def quality_table(engine, rows: list[dict], label: str) -> dict:
    stats = []
    for r in rows:
        if r["gold_class"] != evalmod.GOLD_POSITIVE:
            continue
        text = r["mention"].lower()
        rec = engine.index.records[engine.index.index_of(r["gold"])]
        g = tokenize(gold_text(engine.index, r["gold"]))
        gd = tokenize(gold_description(engine.index, r["gold"]))
        m = tokenize(text)
        stats.append({
            "run": longest_common_run(m, g),
            "run_desc": longest_common_run(m, gd),
            "jac": jaccard(m, g),
            "jac_desc": jaccard(m, gd),
            "id": r["gold"].lower() in text,
            "tag": bool(rec.tags) and any(t.lower() in text for t in rec.tags),
        })
    n = len(stats)
    out = {
        "n": n,
        "ge6": sum(1 for s in stats if s["run"] >= 6) / n,
        "ge6_desc": sum(1 for s in stats if s["run_desc"] >= 6) / n,
        "ge4": sum(1 for s in stats if s["run"] >= 4) / n,
        "mean_jac": statistics.mean(s["jac"] for s in stats),
        "med_jac": statistics.median(s["jac"] for s in stats),
        "mean_jac_desc": statistics.mean(s["jac_desc"] for s in stats),
        "id": sum(1 for s in stats if s["id"]) / n,
    }
    title(f"QUALITY — {label}")
    print(f"  gold positives              : {n}")
    print(f"  >=6-token verbatim overlap  : {out['ge6']*100:5.1f}%  (desc+detail)   "
          f"{out['ge6_desc']*100:5.1f}%  (description only)   <- copy-circularity")
    print(f"  >=4-token verbatim overlap  : {out['ge4']*100:5.1f}%")
    print(f"  token-Jaccard mean / median : {out['mean_jac']:.3f} / {out['med_jac']:.3f}"
          f"   (description-only mean {out['mean_jac_desc']:.3f})")
    print(f"  activity id named outright  : {out['id']*100:5.1f}%")
    print(f"  equipment tag named outright: {sum(1 for s in stats if s['tag'])/n*100:5.1f}%")
    out["tag"] = sum(1 for s in stats if s["tag"]) / n
    return out


# ══════════════════════════════════════════════════════════════════════════════
# Evaluation (Phase 4) + failure analysis (Phase 5)
# ══════════════════════════════════════════════════════════════════════════════

def score_rows(engine, rows: list[dict]) -> list[dict]:
    decisions = engine.match_events([r["event"] for r in rows])
    return [{**r, "decision": d} for r, d in zip(rows, decisions)]


def recall_at_k(rows: list[dict], k: int) -> float:
    pos = [r for r in rows if r["gold_class"] == evalmod.GOLD_POSITIVE]
    hits = sum(
        1 for r in pos
        if any(c.activity_id == r["gold"] for c in r["decision"].candidates[:k])
    )
    return hits / len(pos) if pos else 0.0


def family_of(index, aid: str) -> tuple:
    """The ambiguity family of an activity: tag line, else WBS parent."""
    rec = index.records[index.index_of(aid)]
    if rec.tags:
        lines = {parse_tag(t).get("line") for t in rec.tags} - {None}
        if lines:
            return ("tag", tuple(sorted(lines)))
    return ("wbs", rec.discipline,
            rec.wbs_path[-2] if len(rec.wbs_path) >= 2 else rec.wbs_path[-1])


def categorise(rows: list[dict], engine) -> Counter:
    cats: Counter = Counter()
    for r in rows:
        if r["gold_class"] != evalmod.GOLD_POSITIVE:
            continue
        cands = r["decision"].candidates
        top1 = cands[0].activity_id if cands else None
        if not cands:
            cats["no_candidates"] += 1
        elif top1 == r["gold"]:
            cats["correct"] += 1
        elif not any(c.activity_id == r["gold"] for c in cands):
            cats["retrieval_failure"] += 1
        elif family_of(engine.index, top1) == family_of(engine.index, r["gold"]):
            cats["sibling_confusion"] += 1
        elif jaccard(tokenize(r["mention"].lower()),
                     tokenize(gold_text(engine.index, r["gold"]))) < 0.15:
            cats["term_mapping_miss"] += 1
        else:
            cats["ranking_other"] += 1
    return cats


def _row_cat(r, engine) -> str:
    cands = r["decision"].candidates
    top1 = cands[0].activity_id if cands else None
    if not cands:
        return "no_candidates"
    if top1 == r["gold"]:
        return "correct"
    if not any(c.activity_id == r["gold"] for c in cands):
        return "retrieval_failure"
    if family_of(engine.index, top1) == family_of(engine.index, r["gold"]):
        return "sibling_confusion"
    if jaccard(tokenize(r["mention"].lower()),
               tokenize(gold_text(engine.index, r["gold"]))) < 0.15:
        return "term_mapping_miss"
    return "ranking_other"


def print_examples(rows: list[dict], engine, n: int = 10) -> None:
    title("WORKED EXAMPLES")
    order = {"correct": 0, "sibling_confusion": 1, "term_mapping_miss": 2,
             "ranking_other": 3, "retrieval_failure": 4, "no_candidates": 5}
    shown = 0
    for r in sorted(rows, key=lambda r: order[_row_cat(r, engine)]):
        if r["gold_class"] != evalmod.GOLD_POSITIVE or shown >= n:
            continue
        cands = r["decision"].candidates
        top3 = "; ".join(f"{c.activity_id} {c.final_score:.3f}" for c in cands[:3]) or "-"
        print(f"  FIELD : {r['mention']}")
        print(f"  GOLD  : {r['gold']} — {gold_text(engine.index, r['gold'])[:60]}")
        print(f"  TOP-3 : {top3}")
        print(f"  DECIDE: {r['decision'].outcome.value} conf={r['decision'].confidence:.3f} "
              f"margin={r['decision'].margin:.3f}")
        print(f"  CLASS : {_row_cat(r, engine)}")
        print()
        shown += 1


def main() -> None:
    ap = argparse.ArgumentParser(description="Terminology-drift benchmark")
    ap.add_argument("--config", choices=sorted(CONFIGS), default="baseline")
    ap.add_argument("--schedule", default=str(SCHEDULE))
    ap.add_argument("--drift", default=str(GT_DRIFT))
    ap.add_argument("--legacy", default=str(GT_LEGACY))
    ap.add_argument("--dev-source", choices=["legacy", "eval"], default="legacy",
                    help="legacy: calibrate thresholds on the legacy dev split "
                         "(drift protocol). eval: calibrate on the dev split of "
                         "--drift itself (grouped-split protocol, when the eval "
                         "corpus carries its own train/dev/test rows).")
    ap.add_argument("--out", default=None, help="tee the report to this file too")
    args = ap.parse_args()

    if args.out:
        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            _run(args)
        text = buf.getvalue()
        sys.stdout.write(text)
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        _run(args)


def _run(args) -> None:
    print(f"config          : {args.config}")
    engine = MatchingEngine(args.schedule, config=CONFIGS[args.config]())

    legacy = evalmod.load_ground_truth(engine, args.legacy)
    legacy_test = [r for r in legacy if r["split"] == "test"]
    drift = evalmod.load_ground_truth(engine, args.drift)
    if Path(args.drift).name.startswith("ground_truth_drift"):
        kinds = load_drift_kinds(args.drift)
        for r in drift:
            r["drift_kind"] = kinds.get(r["mention"], "?")

    print("Scoring calibration rows ...")
    t0 = time.perf_counter()
    if args.dev_source == "eval":
        dev = [r for r in drift if r["split"] == "dev"]
        eval_target = [r for r in drift if r["split"] == "test"]
        protocol = (f"thresholds calibrated on THIS corpus's dev split "
                    f"({len(dev)} rows), metrics on its test split "
                    f"({len(eval_target)} rows)")
    else:
        dev = [r for r in legacy if r["split"] == "dev"]
        eval_target = drift
        protocol = ("thresholds calibrated on the LEGACY dev split only; "
                    "no eval row participates in calibration")
    dev_scored = score_rows(engine, dev)
    t = evalmod.calibrate(dev_scored)
    print(f"  thresholds: tau_high={t.tau_high} tau_low={t.tau_low} "
          f"margin={t.margin_min} ({time.perf_counter()-t0:.1f}s)")
    print(f"  protocol  : {protocol}")

    quality_table(engine, legacy_test, "LEGACY v2 test split (audit comparison)")
    quality_table(engine, eval_target, f"EVAL CORPUS ({Path(args.drift).name})")

    title(f"EVALUATION — {Path(args.drift).name}, config={args.config}")
    t0 = time.perf_counter()
    drift_scored = score_rows(engine, eval_target)
    wall = time.perf_counter() - t0
    m = evalmod.evaluate(drift_scored, t)
    n = m["n"]
    print(f"  mentions            : {n}")
    print(f"  Top-1 accuracy      : {m['top1_acc']*100:5.1f}%  ({m['top1_correct']}/{m['top1_total']})")
    print(f"  Recall@3            : {recall_at_k(drift_scored, 3)*100:5.1f}%")
    print(f"  Recall@20           : {recall_at_k(drift_scored, 20)*100:5.1f}%")
    print(f"  suggestion precision: {m['sugg_precision']*100:5.1f}%")
    print(f"  coverage (auto)     : {m['coverage']*100:5.1f}%")
    print(f"  auto-link precision : {m['auto_precision']*100:5.1f}%")
    print(f"  review rate         : {(m['pos_review_ok']+m['pos_review_bad']+m['neg_review'])/n*100:5.1f}%")
    print(f"  NO_MATCH rejection  : {m['neg_rejection']*100:5.1f}%  (n_neg={m['n_neg']})")
    print(f"  latency             : {wall*1000/n:.2f} ms/mention (batched, cold caches)")

    # The eval corpus's own near-miss mix — Top-1 numbers are NOT comparable
    # across corpora with different near-miss shares, so print the mix.
    ev_nm = [r for r in drift_scored if r["gold_class"] == evalmod.GOLD_POSITIVE
             and r.get("match_type") == "near_miss"]
    ev_nm_ok = sum(1 for r in ev_nm if r["decision"].candidates
                   and r["decision"].candidates[0].activity_id == r["gold"])
    print(f"  near-miss mix       : {len(ev_nm)}/{n} mentions, "
          f"top-1 {ev_nm_ok}/{len(ev_nm)} = {ev_nm_ok/max(len(ev_nm),1)*100:.1f}%")

    # The same config on the LEGACY held-out test split — the check that a
    # drift-oriented change did not pay for itself with a legacy regression.
    legacy_scored = score_rows(engine, legacy_test)
    ml = evalmod.evaluate(legacy_scored, t)
    title(f"LEGACY v2 HELD-OUT TEST under the same config ({args.config})")
    print(f"  Top-1 accuracy      : {ml['top1_acc']*100:5.1f}%  ({ml['top1_correct']}/{ml['top1_total']})")
    print(f"  coverage (auto)     : {ml['coverage']*100:5.1f}%")
    print(f"  auto-link precision : {ml['auto_precision']*100:5.1f}%")
    print(f"  suggestion precision: {ml['sugg_precision']*100:5.1f}%")
    nm = [r for r in legacy_scored if r["gold_class"] == evalmod.GOLD_POSITIVE
          and r.get("match_type") == "near_miss"]
    nm_ok = sum(1 for r in nm if r["decision"].candidates
                and r["decision"].candidates[0].activity_id == r["gold"])
    print(f"  near-miss top-1     : {nm_ok}/{len(nm)} = {nm_ok/max(len(nm),1)*100:.1f}%")
    print(f"  Recall@20           : {recall_at_k(legacy_scored, 20)*100:5.1f}%")

    hard = [r for r in drift_scored
            if r["gold_class"] == evalmod.GOLD_POSITIVE and r.get("drift_kind") == "sibling_hard"]
    hard_top1 = sum(1 for r in hard
                    if r["decision"].candidates
                    and r["decision"].candidates[0].activity_id == r["gold"]) / max(len(hard), 1)
    outcomes = Counter(
        evalmod._decision_for(r["decision"].candidates, t)[0].value for r in hard
    )
    title("SIBLING-HARD SUBSET (deliberately ambiguous)")
    print(f"  n                   : {len(hard)}")
    print(f"  strict top-1        : {hard_top1*100:5.1f}%  (partly luck, as on near-misses)")
    print(f"  outcomes            : " + ", ".join(f"{k}={v}" for k, v in outcomes.most_common()))

    title("FAILURE CATEGORIES (drift benchmark)")
    cats = categorise(drift_scored, engine)
    total = max(sum(cats.values()), 1)
    for k, v in cats.most_common():
        print(f"  {k:22s}: {v:4d}  ({v/total*100:.1f}%)")

    by_kind: dict[str, list] = {}
    for r in drift_scored:
        if r["gold_class"] != evalmod.GOLD_POSITIVE:
            continue
        by_kind.setdefault(r.get("drift_kind") or "?", []).append(r)
    if by_kind != {"?": by_kind.get("?")} and "?" not in by_kind:
        title("TOP-1 BY DRIFT KIND")
        for kind, rs in sorted(by_kind.items()):
            ok = sum(1 for r in rs if r["decision"].candidates
                     and r["decision"].candidates[0].activity_id == r["gold"])
            print(f"  {kind:12s}: {ok}/{len(rs)} = {ok/len(rs)*100:.1f}%")

    print_examples(drift_scored, engine)


if __name__ == "__main__":
    main()
