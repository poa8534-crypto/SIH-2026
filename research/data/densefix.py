"""ROOT CAUSE TEST (read-only).

MatchingEngine._dense_cos returns None unless the candidate surfaced in the
dense channel's own top-20. final_score() then DROPS that feature and
renormalises the remaining weights - so a candidate with no embedding score
is judged only on the features it does well on, while a candidate carrying a
real but mediocre cosine (0.63) is dragged down by it.

Absent evidence therefore outranks mediocre evidence.

Counterfactual: score every candidate in the pool with its true cosine
against the already-in-memory doc matrix (one dot product each), changing
nothing else. Repository untouched.
"""
import sys, json
import numpy as np
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
import eval as navis_eval
from matching import MatchingEngine, Decision, Thresholds, decide_outcome
from matching.features import compute_features, final_score, blend_with_line_lock
from matching.models import LinkCandidate

engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
pos = [r for r in rows if r["gold_class"] == navis_eval.GOLD_POSITIVE]
nom = [r for r in rows if r["gold_class"] == navis_eval.GOLD_NO_MATCH]
index, retr = engine.index, engine.retriever
T = Thresholds(tau_high=0.775, tau_low=0.5, margin_min=0.03)

def all_cosines(query: str) -> np.ndarray:
    q = retr.embedder.encode([query])[0]
    n = np.linalg.norm(q)
    if n > 0: q = q / n
    return retr.doc_matrix @ q

def run(fill_dense: bool):
    top1 = auto_ok = auto_all = 0
    nomatch_refused = 0
    for r in pos + nom:
        ev, gold = r["event"], r["gold"]
        cand, info = retr.retrieve(ev.raw_text, ev.tags)
        cos = all_cosines(ev.raw_text) if fill_dense else None
        scored = []
        for i in cand:
            rec = index.records[i]
            if fill_dense:
                emb = float(cos[i])
            else:
                emb = info[i].get("dense_cos") if "DENSE" in info[i]["sources"] else None
            fv = compute_features(index, ev, rec, ev.reported_date, embedding_cosine=emb)
            uniq = any(len(index.line_index.get(l, [])) == 1 for l in rec.line_keys)
            s = blend_with_line_lock(final_score(fv), fv, unique_line=uniq)
            scored.append(LinkCandidate(activity_id=rec.activity_id, features=fv, final_score=s))
        scored.sort(key=lambda c: (-c.final_score, c.activity_id))
        outcome, chosen, _m, _w = decide_outcome(scored, T)
        if r["gold_class"] == navis_eval.GOLD_POSITIVE:
            if scored and scored[0].activity_id == gold: top1 += 1
            if outcome is Decision.AUTO_LINK:
                auto_all += 1
                if chosen == gold: auto_ok += 1
        else:
            if outcome is not Decision.AUTO_LINK: nomatch_refused += 1
            if outcome is Decision.AUTO_LINK: auto_all += 1
    n = len(pos)
    return {"top1": top1/n, "auto_precision": (auto_ok/auto_all if auto_all else 0.0),
            "coverage": auto_all/len(rows), "nomatch_not_autolinked": nomatch_refused/len(nom)}

a = run(False); b = run(True)
print(f"{'':34s} {'top-1':>8} {'auto-prec':>10} {'coverage':>9} {'NO_MATCH safe':>14}")
print(f"{'shipped (dense only if retrieved)':34s} {a['top1']:>7.1%} {a['auto_precision']:>10.1%} "
      f"{a['coverage']:>8.1%} {a['nomatch_not_autolinked']:>13.1%}")
print(f"{'counterfactual (dense for all)':34s} {b['top1']:>7.1%} {b['auto_precision']:>10.1%} "
      f"{b['coverage']:>8.1%} {b['nomatch_not_autolinked']:>13.1%}")
json.dump({"shipped": a, "dense_filled": b}, open(sys.argv[1], "w"), indent=2)
