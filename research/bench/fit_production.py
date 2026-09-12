"""Fit and persist the configuration the ablation selected.

Selected: extra features + a pointwise logistic ranker + isotonic calibration
(row 8b). Chosen under the auto-link precision floor, NOT on top-1 alone —
the gradient-boosted ranker matches its top-1 with far higher coverage and
was disqualified at 97.4% auto-link precision.

Fitting discipline, reproduced here exactly as in the ablation:
  ranker      TRAIN candidate pools
  calibrator  DEV top-1 scores
  test        never touched

Writes matching/artifacts/. Re-run after any change to the feature set, the
retrieval config, or the baseline: a ranker fitted against a different feature
distribution than it scores is worse than no ranker.

Usage:  python research/bench/fit_production.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import harness as H  # noqa: E402
from matching.config import EngineConfig  # noqa: E402
from matching.learned import fit_calibrator, fit_ranker  # noqa: E402

ART = Path(__file__).resolve().parents[2] / "backend" / "matching" / "artifacts"


def main():
    ART.mkdir(parents=True, exist_ok=True)
    corpus = H.load()
    cfg = EngineConfig(extra_features=True)

    print("Fitting the ranker on TRAIN candidate pools ...")
    M, y = H.training_pairs(cfg, corpus, corpus.split("train"))
    ranker = fit_ranker(M, y, extra=True, kind="logreg")
    print(f"  {M.shape[0]} (candidate, label) pairs, {int(y.sum())} positive")

    print("Fitting the calibrator on DEV top-1 scores ...")
    rows = H.run(cfg.with_(ranker=ranker), corpus)
    dev = [r for r in rows if r["split"] == "dev"]
    conf, correct = H.calibration_arrays(dev)
    cal = fit_calibrator(conf, correct, kind="isotonic")

    joblib.dump(ranker, ART / "ranker.joblib")
    joblib.dump(cal, ART / "calibrator.joblib")

    test = [r for r in rows if r["split"] == "test"]
    meta = {
        "selected_row": "8b. extra features + learned logistic ranker",
        "ranker": "logistic regression, pointwise, class_weight=balanced",
        "calibrator": "isotonic",
        "extra_features": True,
        "fitted_on": {
            "ranker": f"train split, n={M.shape[0]} candidate rows",
            "calibrator": f"dev split, n={len(conf)} mentions",
        },
        "held_out_test": {
            "n_mentions": len(test),
            "top1": float(H.top1_hits(test).mean()),
            "near_miss_top1": float(H.top1_hits(H.near_miss(test)).mean()),
            "recall_at_20": float(H.recall_at_k(test).mean()),
        },
        "corpus": "dataset/v2/ground_truth_v2.csv",
        "baseline": "dataset/baseline_schedule_v2.json",
        # The identity these artefacts are only valid against. config.production()
        # refuses to apply them to any other baseline.
        "baseline_sha256": corpus.index.baseline.sha256,
        "WARNING": (
            "These artefacts are fitted against baseline_schedule_v2 and its "
            "feature set. Changing either invalidates them. The engine falls "
            "back to the hand-set blend when they cannot be loaded, so a stale "
            "or missing file degrades rather than fails — but a stale one that "
            "still LOADS is the dangerous case, which is why this file records "
            "what it was fitted against."
        ),
    }
    (ART / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nWrote {ART}:")
    for p in sorted(ART.iterdir()):
        print(f"  {p.name}  ({p.stat().st_size} bytes)")
    print(f"\nHeld-out test top-1 {meta['held_out_test']['top1'] * 100:.1f}%  "
          f"near-miss {meta['held_out_test']['near_miss_top1'] * 100:.1f}%")


if __name__ == "__main__":
    main()
