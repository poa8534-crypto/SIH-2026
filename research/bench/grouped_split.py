"""Grouped (family-level) re-split of the v2 corpus — the HARD split.

Why
---
`dataset/v2/splits.json` splits by MENTION, keeping identical mention texts
together. The audit found no exact cross-split duplicates BUT many highly
similar template siblings ("Sleeper and column footings, pipe rack Module
1/2/3") whose near-identical mention texts leak across train and test. A
mention-level "held-out" therefore does not measure generalisation to new
activity families — it partly measures recognition of an almost-identical
training template.

Grouping key (most defensible given what the corpus actually encodes):

  1. equipment tag LINE (e.g. "P-1001" inside 24"-P-1001-A1A) — activities
     on the same line are true siblings (fabricate / erect / support / test
     that line);
  2. otherwise the level-4 WBS parent (wbs_path[-2]) within the discipline —
     e.g. "Survey and Earthworks", which groups the sibling work types;
  3. NO_MATCH rows carry no activity: they keep their existing split (they
     are not template-leaking and are too few to split reliably, n=44).

Assignment: greedy fill — families shuffled (seed 20260901), sorted by size
descending, each assigned to the split with the largest remaining positive
deficit (targets = the original split's positive counts). A family NEVER
spans two splits; the script asserts that after writing.

Outputs:
  dataset/v2/ground_truth_v2_grouped.csv   (same rows, `split` reassigned)
  dataset/v2/splits_grouped.json           (construction record + leak check)

Usage:  .venv/bin/python research/bench/grouped_split.py
"""

from __future__ import annotations

import csv
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEDULE = ROOT / "dataset" / "baseline_schedule_v2.json"
GT_IN = ROOT / "dataset" / "v2" / "ground_truth_v2.csv"
GT_OUT = ROOT / "dataset" / "v2" / "ground_truth_v2_grouped.csv"
META_OUT = ROOT / "dataset" / "v2" / "splits_grouped.json"
SEED = 20260901

sys.path.insert(0, str(ROOT / "backend"))
from matching.schedule_index import ScheduleIndex  # noqa: E402
from matching.textutils import parse_tag  # noqa: E402


def family_key(index: ScheduleIndex, aid: str) -> str:
    rec = index.records[index.index_of(aid)]
    lines = sorted({parse_tag(t).get("line") for t in rec.tags} - {None})
    if lines:
        return "tag:" + "|".join(lines)
    parent = rec.wbs_path[-2] if len(rec.wbs_path) >= 2 else rec.wbs_path[-1]
    return f"wbs:{rec.discipline}:{parent}"


def main() -> None:
    index = ScheduleIndex.from_json(SCHEDULE)
    with open(GT_IN, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    fieldnames = list(rows[0].keys())

    # ── families over positive rows; negatives keep their split ──
    fam_rows: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if (r["activity_id"] or "").strip() and r["activity_id"] != "NO_MATCH":
            r["_fam"] = family_key(index, r["activity_id"])
            fam_rows[r["_fam"]].append(r)
        else:
            r["_fam"] = None

    old_pos_counts = Counter(
        r["split"] for r in rows if r["_fam"] is not None
    )
    targets = {s: old_pos_counts[s] for s in ("train", "dev", "test")}
    no_match_kept = Counter(
        r["split"] for r in rows if r["_fam"] is None
    )

    families = list(fam_rows.items())
    random.Random(SEED).shuffle(families)
    families.sort(key=lambda kv: -len(kv[1]))

    fills = {s: 0 for s in targets}
    nm_targets = {
        s: sum(1 for r in rows
               if r["split"] == s and r["_fam"] is not None
               and r["match_type"] == "near_miss")
        for s in targets
    }
    nm_fills = {s: 0 for s in nm_targets}
    assignment: dict[str, str] = {}
    for fam, rs in families:
        fam_nm = sum(1 for r in rs if r["match_type"] == "near_miss")
        # Split with the largest RELATIVE deficit on BOTH axes (positives and
        # near-misses) wins this family. A near-miss-blind fill would dump the
        # shared-tag families into one split and make its test artificially
        # easy — exactly the composition artifact this split exists to avoid.
        def score(s):
            pd = (targets[s] - fills[s]) / max(targets[s], 1)
            nd = (nm_targets[s] - nm_fills[s]) / max(nm_targets[s], 1)
            return pd + nd
        s = max(targets, key=score)
        assignment[fam] = s
        fills[s] += len(rs)
        nm_fills[s] += fam_nm

    for r in rows:
        if r["_fam"] is not None:
            r["split"] = assignment[r["_fam"]]

    # ── leak check: no family in two splits ──
    spans = defaultdict(set)
    for r in rows:
        if r["_fam"] is not None:
            spans[r["_fam"]].add(r["split"])
    leaks = {f: sorted(s) for f, s in spans.items() if len(s) > 1}
    assert not leaks, f"family leaked across splits: {leaks}"

    with open(GT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in fieldnames})

    example_families = {
        fam: sorted({r["activity_id"] for r in rs})
        for fam, rs in families[:3]
    }
    meta = {
        "seed": SEED,
        "grouping_key": [
            "1. equipment tag line (parse_tag of the activity's tag)",
            "2. else level-4 WBS parent (wbs_path[-2]) within the discipline",
            "3. NO_MATCH rows keep their original mention-level split",
        ],
        "assignment": "greedy fill: families shuffled + sorted by size desc, "
                      "each to the split with the largest positive deficit",
        "targets_from_original_positives": targets,
        "near_miss_targets_from_original": nm_targets,
        "near_miss_counts": {
            s: sum(1 for r in rows if r["split"] == s
                   and r["match_type"] == "near_miss")
            for s in ("train", "dev", "test")
        },
        "counts": dict(Counter(r["split"] for r in rows)),
        "no_match_rows_kept": dict(no_match_kept),
        "families_total": len(families),
        "families_leaking_across_splits": len(leaks),
        "example_families": example_families,
        "note": "This split answers a stronger question than the mention-level "
                "split: can the matcher generalise to an activity family it "
                "never saw a sibling of during training/dev?",
    }
    META_OUT.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"wrote {GT_OUT.relative_to(ROOT)} ({len(rows)} rows)")
    print(json.dumps({k: meta[k] for k in
                      ("counts", "families_total",
                       "families_leaking_across_splits")}, indent=1))
    print("example families:")
    for fam, ids in example_families.items():
        print(f"  {fam}: {ids}")


if __name__ == "__main__":
    main()