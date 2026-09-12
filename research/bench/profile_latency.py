"""Stage-by-stage latency profile of the matching engine.

Reports, for one baseline:
  * cold start  - process start to first answered event (model load + index build)
  * warm per-event latency - median / p95 over the whole ground truth
  * a per-stage breakdown: embedding, BM25, tag, fusion, feature scoring
  * per-file throughput - one DPR file's worth of mentions

Run:  python research/bench/profile_latency.py [--schedule ...] [--ground-truth ...]
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import eval as evalmod  # noqa: E402
from matching import MatchingEngine  # noqa: E402
from matching.features import blend_with_line_lock, compute_features, final_score  # noqa: E402
from matching.textutils import extract_size_mentions, parse_tag, tag_variants, tokenize  # noqa: E402

TIMER = time.perf_counter


def _ms(seconds: float) -> float:
    return seconds * 1000.0


def profile(schedule: str, ground_truth: str, repeats: int = 3,
            short_circuit: bool = False, cold_cache: bool = False) -> dict:
    out: dict = {}
    from matching.config import EngineConfig, RetrievalConfig
    cfg = EngineConfig(retrieval=RetrievalConfig(short_circuit_tags=short_circuit))
    if cold_cache:
        import shutil
        from matching import embedcache
        shutil.rmtree(embedcache.cache_dir(), ignore_errors=True)

    # ── Cold start: everything a fresh process pays before answer #1 ──
    t0 = TIMER()
    engine = MatchingEngine(schedule, config=cfg)
    t_index_and_embed = TIMER() - t0

    # Split index build from doc embedding by rebuilding the index alone.
    t0 = TIMER()
    from matching.schedule_index import ScheduleIndex
    idx = ScheduleIndex.from_json(schedule)
    t_index = TIMER() - t0
    out["n_activities"] = len(idx.records)

    # Model load is inside the first encode; measure it on a fresh embedder.
    from matching.retrieval import MiniLMEmbedder
    emb = MiniLMEmbedder()
    t0 = TIMER()
    emb._load()
    t_model_load = TIMER() - t0
    out["is_neural"] = emb.is_neural

    t0 = TIMER()
    emb.encode(idx.precomputed_texts())
    t_doc_embed = TIMER() - t0

    out["cold"] = {
        "index_build": _ms(t_index),
        "model_load": _ms(t_model_load),
        "doc_embed": _ms(t_doc_embed),
        "total_engine_ctor": _ms(t_index_and_embed),
    }

    # ── Warm per-event, with a per-stage breakdown ──
    rows = evalmod.load_ground_truth(engine, ground_truth)
    events = [r["event"] for r in rows]
    out["n_events"] = len(events)

    engine.match_event(events[0])  # warm caches / lazy imports

    stage = defaultdict(list)
    totals = []
    r = engine.retriever
    for _ in range(repeats):
        for ev in events:
            e0 = TIMER()

            t = TIMER()
            etags = [parse_tag(v) for x in ev.tags for v in tag_variants(x)]
            sizes = extract_size_mentions(ev.raw_text)
            tag_hits = r.tag_channel(etags, sizes)
            stage["tag"].append(TIMER() - t)

            t = TIMER()
            toks = tokenize(ev.raw_text)
            bm_hits = r.bm25_channel(toks)
            stage["bm25"].append(TIMER() - t)

            t = TIMER()
            dense_hits = r.dense_channel(ev.raw_text)
            stage["dense"].append(TIMER() - t)

            t = TIMER()
            cand_ids, info = r.retrieve(ev.raw_text, ev.tags)  # includes fusion
            stage["fusion (incl. re-run channels)"].append(TIMER() - t)

            t = TIMER()
            scored = []
            for i in cand_ids:
                rec = engine.index.records[i]
                fv = compute_features(
                    engine.index, ev, rec, ev.reported_date,
                    embedding_cosine=info[i].get("dense_cos"),
                )
                s = blend_with_line_lock(final_score(fv), fv, engine._unique_line(i))
                scored.append(s)
            stage["features"].append(TIMER() - t)

            totals.append(TIMER() - e0)
            _ = (tag_hits, bm_hits, dense_hits)

    # True end-to-end warm latency (no instrumentation overhead)
    e2e = []
    for _ in range(repeats):
        for ev in events:
            t = TIMER()
            engine.match_event(ev)
            e2e.append(TIMER() - t)

    def summarise(xs):
        xs = sorted(xs)
        return {
            "mean_ms": _ms(statistics.fmean(xs)),
            "median_ms": _ms(statistics.median(xs)),
            "p95_ms": _ms(xs[int(0.95 * (len(xs) - 1))]),
            "total_s": sum(xs),
        }

    out["stages"] = {k: summarise(v) for k, v in stage.items()}
    out["end_to_end"] = summarise(e2e)

    # ── Per-file throughput: the batch path, which is how a DPR is actually
    # processed. This is the number that moved. ──
    by_file = defaultdict(list)
    for row in rows:
        by_file[row["source"]].append(row["event"])
    file_times = []
    engine.retriever.reset_stats()
    for _fname, evs in by_file.items():
        t = TIMER()
        engine.match_events(evs)
        file_times.append((TIMER() - t, len(evs)))
    out["per_file"] = {
        "n_files": len(by_file),
        "mean_events_per_file": statistics.fmean(n for _, n in file_times),
        "mean_file_ms": _ms(statistics.fmean(s for s, _ in file_times)),
        "p95_file_ms": _ms(sorted(s for s, _ in file_times)[int(0.95 * (len(file_times) - 1))]),
        "events_per_second": sum(n for _, n in file_times) / sum(s for s, _ in file_times),
        "ms_per_event_batched": _ms(sum(s for s, _ in file_times) / sum(n for _, n in file_times)),
    }
    out["retriever_stats"] = engine.retriever.stats()
    return out


def report(label: str, p: dict) -> None:
    print()
    print("=" * 78)
    print(f" LATENCY PROFILE - {label}")
    print("=" * 78)
    print(f"  activities {p['n_activities']}   events {p['n_events']}   "
          f"dense model neural={p['is_neural']}")
    print()
    print("  COLD START (paid once per process)")
    for k, v in p["cold"].items():
        print(f"    {k:24s} {v:9.1f} ms")
    print()
    print("  WARM PER-EVENT, BY STAGE")
    print(f"    {'stage':24s} {'mean':>9s} {'median':>9s} {'p95':>9s} {'share':>7s}")
    tot = p["end_to_end"]["mean_ms"]
    for k, v in sorted(p["stages"].items(), key=lambda kv: -kv[1]["mean_ms"]):
        print(f"    {k:24s} {v['mean_ms']:9.3f} {v['median_ms']:9.3f} "
              f"{v['p95_ms']:9.3f} {v['mean_ms'] / tot * 100:6.1f}%")
    e = p["end_to_end"]
    print(f"    {'END TO END':24s} {e['mean_ms']:9.3f} {e['median_ms']:9.3f} "
          f"{e['p95_ms']:9.3f} {100.0:6.1f}%")
    print()
    print("  PER-FILE, BATCHED (one DPR — the production path)")
    f = p["per_file"]
    print(f"    files {f['n_files']}, mean {f['mean_events_per_file']:.1f} events/file")
    print(f"    mean {f['mean_file_ms']:.1f} ms/file, p95 {f['p95_file_ms']:.1f} ms/file")
    print(f"    per-event, batched {f['ms_per_event_batched']:.3f} ms")
    print(f"    throughput {f['events_per_second']:.1f} events/s")
    st = p.get("retriever_stats", {})
    if st:
        print(f"    short circuits {st['short_circuits']}/"
              f"{st['short_circuits'] + st['full_retrievals']} "
              f"({st['short_circuit_rate'] * 100:.1f}%)  "
              f"doc matrix from cache: {st['doc_matrix_from_cache']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schedule", default=str(ROOT / "dataset" / "baseline_schedule.json"))
    ap.add_argument("--ground-truth", default=str(ROOT / "dataset" / "ground_truth.csv"))
    ap.add_argument("--label", default="v1")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--short-circuit", action="store_true")
    ap.add_argument("--cold-cache", action="store_true",
                    help="delete the embedding cache first, to time a true cold start")
    a = ap.parse_args()
    report(a.label, profile(a.schedule, a.ground_truth, a.repeats,
                            a.short_circuit, a.cold_cache))


if __name__ == "__main__":
    main()
