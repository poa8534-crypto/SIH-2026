"""Grid-search the retrieval layer on the TRAIN split only.

Two objectives, in order:
  1. recall@20  — can the pool contain the gold activity at all
  2. MRR@20     — how near the top it sits, as a tie-break

Recall first because a candidate retrieval cannot fix is unrecoverable; MRR
second because when recall saturates (which on this corpus it does), rank is
the only thing left for retrieval to move.

Writes research/bench/tuned.json, which ablation.py reads.

Usage:  python research/bench/tune_retrieval.py
"""

from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import harness as H  # noqa: E402
from matching import MatchingEngine  # noqa: E402
from matching.config import EngineConfig, RetrievalConfig  # noqa: E402
from matching.textutils import extract_size_mentions, tokenize  # noqa: E402

OUT = Path(__file__).parent / "tuned.json"


def _gold_indices(engine, rows):
    return [engine.index.index_of(r["gold"]) if r["gold"] else None for r in rows]


def score_bm25(rows, k1: float, b: float) -> tuple[float, float]:
    """recall@20 and MRR@20 of the BM25 channel ALONE under (k1, b)."""
    engine = MatchingEngine(
        H.SCHEDULE_V2,
        config=EngineConfig(retrieval=RetrievalConfig(bm25_k1=k1, bm25_b=b)),
    )
    golds = _gold_indices(engine, rows)
    rec, rr = [], []
    for row, g in zip(rows, golds):
        if g is None:
            continue
        hits = [i for i, _ in engine.retriever.bm25_channel(
            tokenize(row["event"].raw_text))]
        rec.append(1.0 if g in hits[:20] else 0.0)
        rr.append(1.0 / (hits.index(g) + 1) if g in hits[:20] else 0.0)
    return float(np.mean(rec)), float(np.mean(rr))


def score_fusion(rows, **retr) -> tuple[float, float]:
    """recall@20 and MRR@20 of the FUSED pool."""
    engine = MatchingEngine(
        H.SCHEDULE_V2, config=EngineConfig(retrieval=RetrievalConfig(**retr))
    )
    r = engine.retriever
    golds = _gold_indices(engine, rows)
    events = [row["event"] for row in rows]
    retrieved = r.retrieve_many(
        [e.raw_text for e in events], [e.tags for e in events],
        [getattr(e.discipline, "value", None) for e in events],
    )
    rec, rr = [], []
    for g, (cand_ids, _info) in zip(golds, retrieved):
        if g is None:
            continue
        rec.append(1.0 if g in cand_ids[:20] else 0.0)
        rr.append(1.0 / (cand_ids.index(g) + 1) if g in cand_ids[:20] else 0.0)
    return float(np.mean(rec)), float(np.mean(rr))


def main():
    corpus = H.load()
    train = [r for r in corpus.split("train") if r["gold"]]
    print(f"Tuning on TRAIN only: {len(train)} gold-positive mentions")
    _ = extract_size_mentions  # imported for parity with the retriever's path

    # ── BM25 k1, b ──
    H.title("BM25 GRID SEARCH  (train split, BM25 channel alone)")
    k1_grid = [0.6, 0.9, 1.2, 1.5, 1.8, 2.2]
    b_grid = [0.0, 0.2, 0.4, 0.6, 0.75, 0.9]
    best, rows = None, []
    for k1, b in itertools.product(k1_grid, b_grid):
        rec, mrr = score_bm25(train, k1, b)
        rows.append([f"{k1:.1f}", f"{b:.2f}", f"{rec * 100:5.1f}%", f"{mrr:.4f}"])
        key = (round(rec, 4), round(mrr, 4))
        if best is None or key > best[0]:
            best = (key, k1, b)
    rows.sort(key=lambda r: (-float(r[2].rstrip('%')), -float(r[3])))
    H.table(["k1", "b", "recall@20", "MRR@20"], rows[:10],
            aligns=[">", ">", ">", ">"])
    _, bk1, bb = best
    print(f"\n  default (k1=1.5, b=0.75) -> recall {score_bm25(train, 1.5, 0.75)[0] * 100:.1f}%"
          f"  MRR {score_bm25(train, 1.5, 0.75)[1]:.4f}")
    print(f"  best    (k1={bk1}, b={bb}) -> recall {best[0][0] * 100:.1f}%"
          f"  MRR {best[0][1]:.4f}")

    # ── RRF constant + channel weights ──
    H.title("RRF GRID SEARCH  (train split, fused pool)")
    best_f, frows = None, []
    for rrf_k in (10, 20, 40, 60, 80):
        for w_bm25 in (0.4, 0.7, 1.0):
            for w_dense in (0.4, 0.7, 1.0):
                rec, mrr = score_fusion(
                    train, rrf_k=rrf_k, w_tag=1.0,
                    w_bm25=w_bm25, w_dense=w_dense,
                    bm25_k1=bk1, bm25_b=bb,
                )
                frows.append([rrf_k, f"{w_bm25:.1f}", f"{w_dense:.1f}",
                              f"{rec * 100:5.1f}%", f"{mrr:.4f}"])
                key = (round(rec, 4), round(mrr, 4))
                if best_f is None or key > best_f[0]:
                    best_f = (key, rrf_k, w_bm25, w_dense)
    frows.sort(key=lambda r: (-float(r[3].rstrip('%')), -float(r[4])))
    H.table(["rrf_k", "w_bm25", "w_dense", "recall@20", "MRR@20"], frows[:10],
            aligns=[">", ">", ">", ">", ">"])
    _, brrf, bwb, bwd = best_f
    d_rec, d_mrr = score_fusion(train, rrf_k=60, w_tag=1.0, w_bm25=0.7, w_dense=0.7)
    print(f"\n  default (k=60, 1.0/0.7/0.7) -> recall {d_rec * 100:.1f}%  MRR {d_mrr:.4f}")
    print(f"  best    (k={brrf}, 1.0/{bwb}/{bwd}) -> "
          f"recall {best_f[0][0] * 100:.1f}%  MRR {best_f[0][1]:.4f}")

    tuned = {
        "bm25_k1": bk1, "bm25_b": bb,
        "rrf_k": brrf, "w_tag": 1.0, "w_bm25": bwb, "w_dense": bwd,
        "_fitted_on": "train split of dataset/v2/ground_truth_v2.csv",
        "_train_recall20": best_f[0][0], "_train_mrr20": best_f[0][1],
    }
    OUT.write_text(json.dumps(tuned, indent=2), encoding="utf-8")
    print(f"\n  wrote {OUT}")


if __name__ == "__main__":
    main()
