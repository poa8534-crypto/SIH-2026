import sys
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
import eval as navis_eval
from matching import MatchingEngine
engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
rows = navis_eval.load_ground_truth(engine)
want = {"8 inch P-1003 hydrotest complete", "Pipe insulation 12 inch P-1002",
        "Cable termination LT", "permit for confined space entry in TK-1"}
for r in rows:
    if r["mention"] not in want: continue
    d = engine.match_event(r["event"])
    print("="*78); print("MENTION:", r["mention"]); print("GOLD   :", r["gold"],
          "|", engine.index.by_id[r["gold"]].description if r["gold"] in engine.index.by_id else "")
    print(f"tags parsed by prepass: {r['event'].tags}  discipline={r['event'].discipline.value}")
    for c in d.candidates[:4]:
        rec = engine.index.by_id[c.activity_id]
        f = c.features
        mark = "<-- GOLD" if c.activity_id == r["gold"] else ""
        print(f"  {c.rank}. {c.activity_id} score={c.final_score:.3f} {mark}")
        print(f"     desc={rec.description[:62]}")
        print(f"     tag={f.tag_overlap} locked={f.line_locked} disc={f.discipline_agreement} "
              f"date={None if f.date_proximity is None else round(f.date_proximity,2)} "
              f"fuzzy={None if f.fuzzy_similarity is None else round(f.fuzzy_similarity,2)} "
              f"emb={None if f.embedding_cosine is None else round(f.embedding_cosine,2)} "
              f"src={c.retrieval_sources}")
