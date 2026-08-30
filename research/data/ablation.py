"""Read-only ablation of the NAVIS retrieval/ranking stack.

Reuses eval.load_ground_truth so the mention set, event construction and gold
resolution are IDENTICAL to the repo's own harness. Writes nothing to the repo.

Arms:
  EXACT   tag channel only
  BM25    lexical channel only
  DENSE   MiniLM cosine only
  RRF     hybrid fusion, retrieval order only (no feature scoring)
  FULL    hybrid fusion + feature scoring + line-lock (the shipped engine)

Also runs FULL on tag-stripped mention text (ARCHITECTURE.md 5.A robustness
test) to measure how much of the accuracy is carried by line numbers alone.
"""
import json, re, sys, time
from pathlib import Path

ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026")
sys.path.insert(0, str(ROOT))

import eval as navis_eval
from matching import MatchingEngine
from matching.textutils import tokenize, extract_size_mentions, parse_tag, tag_variants
from extraction.prepass import extract_tags

GOLD_POSITIVE = navis_eval.GOLD_POSITIVE

engine = MatchingEngine(str(ROOT / "dataset" / "baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
pos = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]
print(f"mentions: {len(rows)}  gold-positive: {len(pos)}")
ids = [rec.activity_id for rec in engine.index.records]
retr = engine.retriever


def rank_exact(ev):
    tags = [parse_tag(v) for t in ev.tags for v in tag_variants(t)]
    sizes = extract_size_mentions(ev.raw_text)
    return [ids[i] for i, _ in retr.tag_channel(tags, sizes)]

def rank_bm25(ev):
    return [ids[i] for i, _ in retr.bm25_channel(tokenize(ev.raw_text), top_k=20)]

def rank_dense(ev):
    return [ids[i] for i, _ in retr.dense_channel(ev.raw_text, top_k=20)]

def rank_rrf(ev):
    cand, _info = retr.retrieve(ev.raw_text, ev.tags)
    return [ids[i] for i in cand]

def rank_full(ev):
    d = engine.match_event(ev)
    return [c.activity_id for c in d.candidates]


ARMS = [("EXACT (tag only)", rank_exact), ("BM25 (lexical only)", rank_bm25),
        ("DENSE (MiniLM only)", rank_dense), ("HYBRID RRF (no scoring)", rank_rrf),
        ("HYBRID + feature scoring", rank_full)]

results = []
for name, fn in ARMS:
    t0 = time.perf_counter()
    top1 = r3 = r5 = r20 = 0
    for r in pos:
        ranked = fn(r["event"])
        g = r["gold"]
        if ranked and ranked[0] == g: top1 += 1
        if g in ranked[:3]: r3 += 1
        if g in ranked[:5]: r5 += 1
        if g in ranked[:20]: r20 += 1
    el = time.perf_counter() - t0
    n = len(pos)
    row = {"arm": name, "top1": top1/n, "recall3": r3/n, "recall5": r5/n,
           "recall20": r20/n, "ms_per_mention": el/n*1000}
    results.append(row)
    print(f"{name:26s} top1={top1/n:6.1%}  r@3={r3/n:6.1%}  r@5={r5/n:6.1%}  "
          f"r@20={r20/n:6.1%}  {el/n*1000:6.1f} ms/mention")

# ── Tag-stripped robustness (ARCHITECTURE.md 5.A) ───────────────────────────
TAGRE = re.compile(r'\d{0,2}\s*"?\s*-?\s*[A-Z]{1,3}\s*-\s*\d{1,4}(-[A-Z]\d[A-Z])?', re.I)
strip_top1 = strip_n = 0
auto_ok = auto_all = 0
for r in pos:
    ev = r["event"].model_copy(deep=True)
    stripped = TAGRE.sub(" ", ev.raw_text)
    if stripped == ev.raw_text and not ev.tags:
        continue                      # mention had no tag: excludes it from the delta
    ev.raw_text = stripped
    ev.tags = []
    d = engine.match_event(ev)
    strip_n += 1
    if d.chosen_activity_id == r["gold"] or (d.candidates and d.candidates[0].activity_id == r["gold"]):
        strip_top1 += 1
print(f"\nTag-stripped subset: {strip_n} mentions that carried a tag; "
      f"top-1 without the tag = {strip_top1/strip_n:.1%}" if strip_n else "\nno tagged mentions")

out = {"n_gold_positive": len(pos), "arms": results,
       "tag_stripped": {"n": strip_n, "top1": (strip_top1/strip_n) if strip_n else None}}
Path(sys.argv[1]).write_text(json.dumps(out, indent=2))
print("\nwrote", sys.argv[1])
