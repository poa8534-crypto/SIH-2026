"""Hypothesis: the tag identifies the OBJECT (line/equipment), not the
OPERATION. Where several schedule activities share a line number, the
line-lock floor outranks the verb and the engine picks the wrong operation.

Measures, read-only:
  1. how many FULL-vs-BM25 losses sit on a NON-unique line
  2. how many schedule activities share each line key
  3. the effect of a counterfactual: suppress the line-lock floor when the
     line is shared by >1 activity (measured by re-scoring, repo untouched)
"""
import sys, json
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
import eval as navis_eval
from matching import MatchingEngine
from matching.features import compute_features, final_score
from matching.textutils import tokenize
import matching.features as F

engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
pos = [r for r in rows if r["gold_class"] == navis_eval.GOLD_POSITIVE]
ids = [rec.activity_id for rec in engine.index.records]
idx_of = {a: i for i, a in enumerate(ids)}
retr, index = engine.retriever, engine.index

shared = {k: len(v) for k, v in index.line_index.items()}
print("line keys in schedule:", len(shared))
print("  lines owned by exactly 1 activity :", sum(1 for v in shared.values() if v == 1))
print("  lines shared by >1 activity       :", sum(1 for v in shared.values() if v > 1))
print("  max activities on one line        :", max(shared.values()))
top = sorted(shared.items(), key=lambda kv: -kv[1])[:5]
print("  busiest lines:", ", ".join(f"{k}×{v}" for k, v in top))

def bm25_top1(ev):
    h = retr.bm25_channel(tokenize(ev.raw_text), top_k=1)
    return ids[h[0][0]] if h else None

# ── counterfactual scoring: line-lock floor only on a UNIQUE line ────────────
def score_variant(ev, use_shared_floor: bool):
    cand, info = retr.retrieve(ev.raw_text, ev.tags)
    best, best_id = -1.0, None
    for i in cand:
        rec = index.records[i]
        fv = compute_features(index, ev, rec, ev.reported_date,
                              embedding_cosine=(info[i].get("dense_cos")
                                                if "DENSE" in info[i]["sources"] else None))
        s = final_score(fv)
        uniq = any(len(index.line_index.get(l, [])) == 1 for l in rec.line_keys)
        if use_shared_floor:
            s = F.blend_with_line_lock(s, fv, unique_line=uniq)
        else:
            # floors apply ONLY when the line pins down a single activity
            if uniq and fv.line_locked and (fv.tag_overlap or 0) >= 1.0:
                s = max(s, 0.93)
            elif uniq and fv.line_locked:
                s = max(s, 0.46)
        if s > best:
            best, best_id = s, rec.activity_id
    return best_id

shipped_ok = variant_ok = 0
losses_on_shared = losses_total = 0
for r in pos:
    ev, g = r["event"], r["gold"]
    f = engine.match_event(ev).candidates[0].activity_id
    b = bm25_top1(ev)
    if f != g and b == g:
        losses_total += 1
        rec = index.records[idx_of[f]]
        if any(len(index.line_index.get(l, [])) > 1 for l in rec.line_keys):
            losses_on_shared += 1
    if f == g: shipped_ok += 1
    if score_variant(ev, use_shared_floor=False) == g: variant_ok += 1

n = len(pos)
print(f"\nFULL-loses-to-BM25 cases: {losses_total}; "
      f"of those, wrong pick sits on a SHARED line: {losses_on_shared}")
print(f"\nshipped engine        top-1: {shipped_ok}/{n} = {shipped_ok/n:.1%}")
print(f"counterfactual variant top-1: {variant_ok}/{n} = {variant_ok/n:.1%}  "
      f"(line-lock floor restricted to unique lines)")
json.dump({"shipped_top1": shipped_ok/n, "variant_top1": variant_ok/n,
           "losses_total": losses_total, "losses_on_shared_line": losses_on_shared,
           "lines_unique": sum(1 for v in shared.values() if v == 1),
           "lines_shared": sum(1 for v in shared.values() if v > 1)},
          open(sys.argv[1], "w"), indent=2)
