"""Latency of the shipped pipeline, rules-only (the default provider).
Read-only: extracts + matches, persists nothing."""
import sys, time, json
from pathlib import Path
ROOT = Path(r"C:/Users/tcgxu/OneDrive/Desktop/SIH 2026"); sys.path.insert(0, str(ROOT))
from extraction.extractor import Extractor
from matching import MatchingEngine

t0 = time.perf_counter()
engine = MatchingEngine(str(ROOT/"dataset"/"baseline_schedule.json"))
cold = time.perf_counter() - t0
ex = Extractor(schedule_path=str(ROOT/"dataset"/"baseline_schedule.json"))
print(f"cold start (index + embed 120 activities): {cold:.2f} s")
print(f"LLM backend in use: {type(ex.llm).__name__}")
rows = []
for f in sorted((ROOT/"dataset").glob("dpr_day_*.txt")) + sorted((ROOT/"dataset").glob("*_progress.xlsx")):
    t = time.perf_counter(); r = ex.extract(str(f)); te = time.perf_counter()-t
    t = time.perf_counter(); d = engine.match_events(r.events); tm = time.perf_counter()-t
    rows.append({"file": f.name, "events": len(r.events), "extract_s": te, "match_s": tm})
    print(f"  {f.name:26s} events={len(r.events):3d}  extract={te*1000:7.1f} ms  match={tm*1000:7.1f} ms  total={(te+tm)*1000:7.1f} ms")
tot_e = sum(r["events"] for r in rows); tot_t = sum(r["extract_s"]+r["match_s"] for r in rows)
print(f"\n{len(rows)} files, {tot_e} events, {tot_t:.2f} s total = {tot_t/tot_e*1000:.1f} ms/event")
json.dump({"cold_start_s": cold, "files": rows, "total_events": tot_e, "total_s": tot_t},
          open(sys.argv[1], "w"), indent=2)
