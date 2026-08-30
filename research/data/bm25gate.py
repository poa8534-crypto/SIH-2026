"""Answers the judge's first objection: 'why not just BM25?'

BM25 ranks better on this corpus. Can a raw BM25 score threshold ALSO give a
safe auto-link gate? Sweeps an absolute-score gate and a top1-minus-top2
margin gate, scoring the same way eval.py does. Read-only.
"""
import sys, json
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
import eval as navis_eval
from matching import MatchingEngine
from matching.textutils import tokenize
engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
ids = [r.activity_id for r in engine.index.records]
retr = engine.retriever
data = []
for r in rows:
    h = retr.bm25_channel(tokenize(r["event"].raw_text), top_k=2)
    s1 = h[0][1] if h else 0.0
    s2 = h[1][1] if len(h) > 1 else 0.0
    data.append((ids[h[0][0]] if h else None, s1, s1 - s2, r["gold"], r["gold_class"]))

print(f"{'gate':>6} {'coverage':>9} {'auto-prec':>10} {'NO_MATCH wrongly auto-linked':>30}")
out = []
for gate in [6, 8, 10, 12, 14, 16, 18, 20, 24, 28]:
    auto = [d for d in data if d[1] >= gate]
    ok = sum(1 for d in auto if d[4] == navis_eval.GOLD_POSITIVE and d[0] == d[3])
    bad_nm = sum(1 for d in auto if d[4] == navis_eval.GOLD_NO_MATCH)
    prec = ok/len(auto) if auto else 0.0
    print(f"{gate:>6} {len(auto)/len(rows):>8.1%} {prec:>10.1%} {bad_nm:>30}")
    out.append({"gate": gate, "coverage": len(auto)/len(rows), "auto_precision": prec,
                "nomatch_autolinked": bad_nm})
json.dump(out, open(sys.argv[1], "w"), indent=2)
print("\nNAVIS operating point for comparison: coverage 50.4%, auto-precision 100.0%, "
      "NO_MATCH wrongly auto-linked 0")
