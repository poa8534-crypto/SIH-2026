"""True cold start, measured in a FRESH process.

An in-process timer cannot see the cold start: by the time it runs, torch and
sentence-transformers are already imported. This runs the phases in a new
interpreter and reports each, so the part the embedding cache can remove is
separated from the part it cannot.

Usage:
  python research/bench/cold_start.py [--schedule ...] [--warm|--cold]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CHILD = r'''
import json, sys, time
sys.path.insert(0, r"{root}")
T = time.perf_counter
out = {{}}
t0 = T()

t = T(); import numpy; out["import numpy"] = T() - t
t = T(); from matching.schedule_index import ScheduleIndex; out["import matching"] = T() - t
t = T(); idx = ScheduleIndex.from_json(r"{schedule}"); out["index build (BM25 + tag + columns)"] = T() - t
t = T(); from matching.retrieval import shared_embedder; emb = shared_embedder(); out["embedder ctor"] = T() - t
t = T(); import sentence_transformers; out["import sentence_transformers (torch)"] = T() - t
t = T(); emb._load(); out["model weights load"] = T() - t
t = T()
from matching.engine import MatchingEngine
eng = MatchingEngine(r"{schedule}", index=idx)
out["retriever + doc matrix"] = T() - t
out["_cached"] = eng.retriever.doc_matrix_cached

from extraction.models import ExtractedEvent, Provenance, ExtractionMethod
ev = ExtractedEvent(
    raw_text="Foundation concreting for pipe rack pedestals",
    tags=[],
    provenance=Provenance(source_file="x", source_span="y",
                          method=ExtractionMethod.PREPASS),
)
t = T(); eng.match_event(ev); out["first answer"] = T() - t
out["TOTAL to first answer"] = T() - t0
print("@@" + json.dumps(out))
'''


def run(schedule: str, cold: bool) -> dict:
    if cold:
        import shutil
        sys.path.insert(0, str(ROOT / "backend"))
        from matching import embedcache
        shutil.rmtree(embedcache.cache_dir(), ignore_errors=True)
    code = CHILD.format(root=str(ROOT / "backend"), schedule=schedule)
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                       cwd=str(ROOT))
    for line in r.stdout.splitlines():
        if line.startswith("@@"):
            return json.loads(line[2:])
    raise RuntimeError(f"child failed:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schedule",
                    default=str(ROOT / "dataset" / "baseline_schedule_v2.json"))
    a = ap.parse_args()

    cold = run(a.schedule, cold=True)
    warm = run(a.schedule, cold=False)

    print()
    print("=" * 78)
    print(" COLD START, FRESH PROCESS (ms)")
    print("=" * 78)
    print(f"  {'phase':40s} {'cold cache':>12s} {'warm cache':>12s}")
    print("  " + "-" * 66)
    for k in cold:
        if k.startswith("_"):
            continue
        print(f"  {k:40s} {cold[k] * 1000:12.1f} {warm[k] * 1000:12.1f}")
    print()
    print(f"  doc matrix read from cache: cold={cold['_cached']}  warm={warm['_cached']}")
    saved = (cold["retriever + doc matrix"] - warm["retriever + doc matrix"]) * 1000
    print(f"  embedding cache saves {saved:.0f} ms of the cold start.")
    print("  The rest is the torch import, which no cache can remove while the")
    print("  dense channel exists — it is the floor for a process that must")
    print("  encode a query it has never seen.")


if __name__ == "__main__":
    main()
