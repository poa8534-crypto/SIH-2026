"""Read-only sensitivity sweep on FEATURE_WEIGHTS['tag_overlap'].

The shipped weighting gives tag_overlap 0.32 - the largest single weight -
and _tag_overlap() awards 0.85-1.0 to ANY candidate sharing the line number.
16 of 20 line keys in the baseline are shared by more than one activity
(up to 7), so every activity on a line scores alike on that feature and the
operation verb has to win from fuzzy (0.20) + embedding (0.22) alone.

Sweeps the weight in memory; the repository is not modified.
"""
import sys, json, copy
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
import eval as navis_eval
from matching import MatchingEngine, Decision, Thresholds, decide_outcome
from matching.features import compute_features, final_score, blend_with_line_lock
from matching.models import LinkCandidate
import matching.features as F

engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
pos = [r for r in rows if r["gold_class"] == navis_eval.GOLD_POSITIVE]
index, retr = engine.index, engine.retriever
ORIG = dict(F.FEATURE_WEIGHTS)
T = Thresholds(tau_high=0.775, tau_low=0.5, margin_min=0.03)

# cache retrieval once - it does not depend on the weights
cache = []
for r in pos:
    ev = r["event"]
    cand, info = retr.retrieve(ev.raw_text, ev.tags)
    feats = []
    for i in cand:
        rec = index.records[i]
        fv = compute_features(index, ev, rec, ev.reported_date,
                              embedding_cosine=(info[i].get("dense_cos")
                                                if "DENSE" in info[i]["sources"] else None))
        uniq = any(len(index.line_index.get(l, [])) == 1 for l in rec.line_keys)
        feats.append((rec.activity_id, fv, uniq))
    cache.append((r["gold"], feats))

print(f"{'tag_w':>6} {'top1':>7} {'auto-prec':>10} {'coverage':>9}")
out = []
for tw in [0.32, 0.28, 0.24, 0.20, 0.16, 0.12, 0.08]:
    F.FEATURE_WEIGHTS.clear(); F.FEATURE_WEIGHTS.update(ORIG)
    F.FEATURE_WEIGHTS["tag_overlap"] = tw
    ok = auto_ok = auto_all = 0
    for gold, feats in cache:
        scored = []
        for aid, fv, uniq in feats:
            s = blend_with_line_lock(final_score(fv), fv, unique_line=uniq)
            scored.append(LinkCandidate(activity_id=aid, features=fv, final_score=s))
        scored.sort(key=lambda c: (-c.final_score, c.activity_id))
        if scored and scored[0].activity_id == gold: ok += 1
        outcome, chosen, _m, _w = decide_outcome(scored, T)
        if outcome is Decision.AUTO_LINK:
            auto_all += 1
            if chosen == gold: auto_ok += 1
    n = len(pos)
    ap = auto_ok/auto_all if auto_all else 0.0
    print(f"{tw:>6.2f} {ok/n:>6.1%} {ap:>10.1%} {auto_all/n:>8.1%}")
    out.append({"tag_weight": tw, "top1": ok/n, "auto_precision": ap, "coverage": auto_all/n})
F.FEATURE_WEIGHTS.clear(); F.FEATURE_WEIGHTS.update(ORIG)
json.dump(out, open(sys.argv[1], "w"), indent=2)
