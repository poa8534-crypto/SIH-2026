"""Where do the arms disagree, and does the shipped engine buy anything for
the top-1 it loses to BM25? Read-only."""
import re, sys, json
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
import eval as navis_eval
from matching import MatchingEngine, Decision
from matching.textutils import tokenize

engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
pos = [r for r in rows if r["gold_class"] == navis_eval.GOLD_POSITIVE]
nom = [r for r in rows if r["gold_class"] == navis_eval.GOLD_NO_MATCH]
ids = [rec.activity_id for rec in engine.index.records]
retr = engine.retriever

def bm25_top1(ev):
    h = retr.bm25_channel(tokenize(ev.raw_text), top_k=1)
    return ids[h[0][0]] if h else None
def bm25_score(ev):
    h = retr.bm25_channel(tokenize(ev.raw_text), top_k=2)
    return ([s for _,s in h] + [0.0,0.0])[:2]

both=bm25_only=full_only=neither=0
full_only_examples=[]; bm25_only_examples=[]
for r in pos:
    ev=r["event"]; g=r["gold"]
    d=engine.match_event(ev)
    f = d.candidates[0].activity_id if d.candidates else None
    b = bm25_top1(ev)
    if f==g and b==g: both+=1
    elif b==g: bm25_only+=1; bm25_only_examples.append((r["mention"][:70], g, f))
    elif f==g: full_only+=1; full_only_examples.append((r["mention"][:70], g, b))
    else: neither+=1
print(f"gold-positive n={len(pos)}")
print(f"  both correct            : {both}")
print(f"  BM25 right, FULL wrong  : {bm25_only}")
print(f"  FULL right, BM25 wrong  : {full_only}")
print(f"  both wrong              : {neither}")

print("\n-- BM25 right / FULL wrong (first 12) --")
for m,g,f in bm25_only_examples[:12]: print(f"   {m!r}\n     gold={g} full_top1={f}")
print("\n-- FULL right / BM25 wrong (all) --")
for m,g,b in full_only_examples[:12]: print(f"   {m!r}\n     gold={g} bm25_top1={b}")

# Can a raw BM25 score threshold give a calibrated auto-link at all?
print("\n-- BM25 raw score separability on NO_MATCH mentions --")
import statistics as st
p_top=[bm25_score(r["event"])[0] for r in pos]
n_top=[bm25_score(r["event"])[0] for r in nom]
print(f"   gold-positive top1 BM25 score: min={min(p_top):.2f} median={st.median(p_top):.2f} max={max(p_top):.2f}")
print(f"   NO_MATCH      top1 BM25 score: min={min(n_top):.2f} median={st.median(n_top):.2f} max={max(n_top):.2f}")
print(f"   NO_MATCH scores above gold-positive median: {sum(1 for s in n_top if s>st.median(p_top))}/{len(n_top)}")

# Full engine confidence separability on the same split
cp=[engine.match_event(r["event"]).confidence for r in pos]
cn=[engine.match_event(r["event"]).confidence for r in nom]
print("\n-- FULL engine confidence separability --")
print(f"   gold-positive confidence: min={min(cp):.2f} median={st.median(cp):.2f} max={max(cp):.2f}")
print(f"   NO_MATCH      confidence: min={min(cn):.2f} median={st.median(cn):.2f} max={max(cn):.2f}")
json.dump({"both":both,"bm25_only":bm25_only,"full_only":full_only,"neither":neither},
          open(sys.argv[1],"w"), indent=2)
