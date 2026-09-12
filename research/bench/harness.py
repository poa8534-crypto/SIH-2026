"""Shared measurement harness for matching-engine experiments.

Measurement discipline this module enforces, so an experiment cannot quietly
break it:

  * SPLITS ARE REAL. `load()` returns train/dev/test separately. Anything that
    fits a parameter takes `train`; anything that picks a threshold takes
    `dev`; every headline number is computed on `test`. A function that
    reports a number takes the split as an argument and prints it.
  * EVERY NUMBER CARRIES ITS n AND A 95% INTERVAL. `bootstrap_ci` resamples
    mentions, not decisions, because mentions are the sampling unit.
  * NEAR-MISSES ARE REPORTED SEPARATELY. Overall top-1 on this corpus is
    dominated by the easy 63%; the near-miss subset is where a ranker change
    shows up at all.
  * NO_MATCH IS POOLED OVER 5-FOLD CV. The test split holds 13 negatives. A
    rejection rate quoted on 13 items has a 95% interval roughly ±25 points,
    which is not a measurement.
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import eval as evalmod  # noqa: E402
from matching import Decision, MatchingEngine, Thresholds  # noqa: E402
from matching.config import EngineConfig  # noqa: E402
from matching.engine import decide_outcome  # noqa: E402
from matching.schedule_index import ScheduleIndex  # noqa: E402
from matching.textutils import alias_key, tokenize  # noqa: E402

SCHEDULE_V1 = ROOT / "dataset" / "baseline_schedule.json"
GT_V1 = ROOT / "dataset" / "ground_truth.csv"
SCHEDULE_V2 = ROOT / "dataset" / "baseline_schedule_v2.json"
GT_V2 = ROOT / "dataset" / "v2" / "ground_truth_v2.csv"

GOLD_POSITIVE = evalmod.GOLD_POSITIVE
GOLD_NO_MATCH = evalmod.GOLD_NO_MATCH

RNG = np.random.default_rng(20260901)


# ══════════════════════════════════════════════════════════════════════════════
# Corpus
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Corpus:
    rows: list[dict]
    index: ScheduleIndex

    def split(self, name: str) -> list[dict]:
        if name == "all":
            return self.rows
        return [r for r in self.rows if r["split"] == name]

    @property
    def has_splits(self) -> bool:
        return any(r["split"] in ("train", "dev", "test") for r in self.rows)


_CORPUS_CACHE: dict[tuple, Corpus] = {}


def load(schedule=SCHEDULE_V2, ground_truth=GT_V2) -> Corpus:
    """Load labelled mentions once per process; events are deterministic."""
    key = (str(schedule), str(ground_truth))
    if key in _CORPUS_CACHE:
        return _CORPUS_CACHE[key]
    engine = MatchingEngine(schedule)
    rows = evalmod.load_ground_truth(engine, ground_truth)
    _CORPUS_CACHE[key] = Corpus(rows=rows, index=engine.index)
    return _CORPUS_CACHE[key]


def alias_lexicon_from(rows: list[dict]) -> dict[str, list[tuple[str, float]]]:
    """Build an alias lexicon from CONFIRMED rows, in the shape the server
    writes.

    Fed only ever from the TRAIN split. A lexicon built from dev or test is
    not a learning loop, it is the answer key: every mention it contains is a
    mention the matcher is about to be scored on.
    """
    lex: dict[str, list[tuple[str, float]]] = defaultdict(list)
    seen: dict[tuple[str, str], float] = {}
    for r in rows:
        if r["gold_class"] != GOLD_POSITIVE or not r["gold"]:
            continue
        k = alias_key(r["mention"])
        pair = (k, r["gold"])
        seen[pair] = seen.get(pair, 0.0) + 1.0
    for (k, aid), n in seen.items():
        lex[k].append((aid, min(1.0 + 0.1 * (n - 1), 5.0)))
    return dict(lex)


# ══════════════════════════════════════════════════════════════════════════════
# Running a configuration
# ══════════════════════════════════════════════════════════════════════════════

def run(
    cfg: EngineConfig,
    corpus: Corpus,
    schedule=SCHEDULE_V2,
    thresholds: Thresholds | None = None,
) -> list[dict]:
    """Score every mention under `cfg`. Returns rows carrying their decision."""
    engine = MatchingEngine(schedule, config=cfg, thresholds=thresholds)
    engine.retriever.reset_stats()
    decisions = engine.match_events([r["event"] for r in corpus.rows])
    out = []
    for r, d in zip(corpus.rows, decisions):
        out.append({**r, "decision": d})
    return out


def timed_run(cfg: EngineConfig, corpus: Corpus, schedule=SCHEDULE_V2,
              repeats: int = 3) -> tuple[list[dict], float]:
    """Rows plus the batched per-event latency in ms, best of `repeats`."""
    import time
    engine = MatchingEngine(schedule, config=cfg)
    events = [r["event"] for r in corpus.rows]
    engine.match_events(events[:20])                 # warm
    best = float("inf")
    decisions = None
    for _ in range(repeats):
        t = time.perf_counter()
        decisions = engine.match_events(events)
        best = min(best, time.perf_counter() - t)
    rows = [{**r, "decision": d} for r, d in zip(corpus.rows, decisions)]
    return rows, best * 1000.0 / max(len(events), 1)


def training_pairs(cfg: EngineConfig, corpus: Corpus, rows_subset: list[dict],
                   schedule=SCHEDULE_V2):
    """(feature matrix, is-gold label) over every candidate of every mention.

    Built under the SAME retrieval config the ranker will run beside, because
    the feature distribution a ranker sees depends on which candidates
    retrieval put in front of it. Fitting on one pool and scoring another is
    how a ranker looks good on paper and worse in the engine.
    """
    from matching.features import score_pool

    engine = MatchingEngine(schedule, config=cfg)
    events = [r["event"] for r in rows_subset]
    retrieved = engine.retriever.retrieve_many(
        [e.raw_text for e in events], [e.tags for e in events],
        [getattr(e.discipline, "value", None) for e in events],
    )
    Ms, ys = [], []
    for row, ev, (cand_ids, info) in zip(rows_subset, events, retrieved):
        if not cand_ids:
            continue
        dense = [
            info[i].get("dense_cos") if "DENSE" in info[i]["sources"] else None
            for i in cand_ids
        ]
        M, _p, _l = score_pool(engine.index, ev, cand_ids, ev.reported_date,
                               dense, extra=cfg.extra_features)
        Ms.append(M)
        gold_idx = engine.index.index_of(row["gold"]) if row["gold"] else None
        ys.append(np.array([1 if i == gold_idx else 0 for i in cand_ids]))
    if not Ms:
        return np.zeros((0, 6)), np.zeros(0)
    return np.vstack(Ms), np.concatenate(ys)


def abstention_pairs(rows_subset: list[dict]):
    """(pool-shape features, must-refuse label) — one row per MENTION."""
    from matching.engine import abstention_features

    X, y = [], []
    for r in rows_subset:
        X.append(abstention_features(r["decision"].candidates)[0])
        y.append(1 if r["gold_class"] == GOLD_NO_MATCH else 0)
    return np.array(X), np.array(y)


# ══════════════════════════════════════════════════════════════════════════════
# Metrics
# ══════════════════════════════════════════════════════════════════════════════

def top1_hits(rows: list[dict]) -> np.ndarray:
    """Per-mention 0/1 top-1 correctness over gold POSITIVES only."""
    pos = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]
    return np.array([
        1.0 if (r["decision"].top1 and r["decision"].top1.activity_id == r["gold"]) else 0.0
        for r in pos
    ])


def in_family_hits(rows: list[dict]) -> np.ndarray:
    pos = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]
    out = []
    for r in pos:
        c = r["decision"].top1
        ok = bool(c and (c.activity_id == r["gold"]
                         or c.activity_id in r.get("confusable_with", [])))
        out.append(1.0 if ok else 0.0)
    return np.array(out)


def recall_at_k(rows: list[dict], k: int = 20) -> np.ndarray:
    pos = [r for r in rows if r["gold_class"] == GOLD_POSITIVE]
    return np.array([
        1.0 if any(c.activity_id == r["gold"] for c in r["decision"].candidates[:k])
        else 0.0
        for r in pos
    ])


def near_miss(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r.get("match_type") == "near_miss"]


def not_near_miss(rows: list[dict]) -> list[dict]:
    return [r for r in rows
            if r.get("match_type") != "near_miss" and r["gold_class"] == GOLD_POSITIVE]


def decide_all(rows: list[dict], t: Thresholds) -> list[tuple]:
    return [decide_outcome(r["decision"].candidates, t)[:2] for r in rows]


def operating_metrics(rows: list[dict], t: Thresholds) -> dict:
    """Coverage / auto-link precision / NO_MATCH rejection at one threshold."""
    n = len(rows)
    auto_ok = auto_bad = 0
    neg_total = neg_rejected = 0
    for r in rows:
        outcome, chosen = decide_outcome(r["decision"].candidates, t)[:2]
        if r["gold_class"] == GOLD_NO_MATCH:
            neg_total += 1
            if outcome is Decision.NEW_ACTIVITY:
                neg_rejected += 1
        if outcome is Decision.AUTO_LINK:
            if r["gold"] is not None and chosen == r["gold"]:
                auto_ok += 1
            else:
                auto_bad += 1
    auto_n = auto_ok + auto_bad
    return {
        "n": n,
        "coverage": auto_n / n if n else 0.0,
        "auto_precision": auto_ok / auto_n if auto_n else float("nan"),
        "auto_n": auto_n,
        "auto_ok": auto_ok,
        "auto_bad": auto_bad,
        "neg_rejection": neg_rejected / neg_total if neg_total else float("nan"),
        "neg_n": neg_total,
    }


# ── Bootstrap ────────────────────────────────────────────────────────────────

def bootstrap_ci(values: np.ndarray, n_boot: int = 5000, alpha: float = 0.05):
    """Percentile bootstrap over the MENTION as the sampling unit."""
    values = np.asarray(values, dtype=float)
    n = len(values)
    if n == 0:
        return float("nan"), float("nan"), float("nan"), 0
    point = float(values.mean())
    idx = RNG.integers(0, n, size=(n_boot, n))
    means = values[idx].mean(axis=1)
    lo, hi = np.percentile(means, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return point, float(lo), float(hi), n


def fmt_ci(values: np.ndarray, n_boot: int = 5000) -> str:
    p, lo, hi, n = bootstrap_ci(values, n_boot)
    if n == 0:
        return "-"
    return f"{p * 100:5.1f}% [{lo * 100:4.1f}, {hi * 100:4.1f}]  n={n}"


def bootstrap_delta(a: np.ndarray, b: np.ndarray, n_boot: int = 5000):
    """Paired bootstrap of (b - a) — the two arrays must be the same mentions
    in the same order, which they are when two configs are run over one
    corpus. Paired, because the between-mention variance dwarfs the effect."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    assert len(a) == len(b), "paired bootstrap needs aligned arrays"
    n = len(a)
    if n == 0:
        return float("nan"), float("nan"), float("nan")
    idx = RNG.integers(0, n, size=(n_boot, n))
    d = (b[idx] - a[idx]).mean(axis=1)
    lo, hi = np.percentile(d, [2.5, 97.5])
    return float((b - a).mean()), float(lo), float(hi)


# ── Risk-coverage ────────────────────────────────────────────────────────────

def risk_coverage(rows: list[dict], tau_low: float, margin_min: float,
                  grid=None) -> list[dict]:
    """Sweep tau_high. Reports the whole frontier, never one point."""
    grid = grid or [round(0.40 + 0.025 * i, 3) for i in range(25)]
    out = []
    for th in grid:
        t = Thresholds(tau_low=tau_low, tau_high=th, margin_min=margin_min)
        m = operating_metrics(rows, t)
        out.append({"tau_high": th, **m})
    return out


# ── Calibration ──────────────────────────────────────────────────────────────

def calibration_arrays(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """(predicted confidence, was top-1 actually correct) over ALL mentions.

    NO_MATCH rows count as label 0: a confidence of 0.9 on a mention with no
    correct activity is exactly the miscalibration that matters.
    """
    conf, correct = [], []
    for r in rows:
        d = r["decision"]
        if not d.candidates:
            conf.append(0.0)
            correct.append(0.0)
            continue
        conf.append(float(d.confidence))
        ok = (r["gold_class"] == GOLD_POSITIVE
              and d.top1 is not None and d.top1.activity_id == r["gold"])
        correct.append(1.0 if ok else 0.0)
    return np.array(conf), np.array(correct)


def ece(conf: np.ndarray, correct: np.ndarray, bins: int = 10) -> float:
    """Expected calibration error, equal-width bins."""
    edges = np.linspace(0.0, 1.0, bins + 1)
    n = len(conf)
    if n == 0:
        return float("nan")
    total = 0.0
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        m = (conf > lo) & (conf <= hi) if i else (conf >= lo) & (conf <= hi)
        if not m.any():
            continue
        total += m.sum() / n * abs(correct[m].mean() - conf[m].mean())
    return float(total)


def brier(conf: np.ndarray, correct: np.ndarray) -> float:
    if len(conf) == 0:
        return float("nan")
    return float(((conf - correct) ** 2).mean())


def reliability_table(conf: np.ndarray, correct: np.ndarray, bins: int = 10):
    edges = np.linspace(0.0, 1.0, bins + 1)
    out = []
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        m = (conf > lo) & (conf <= hi) if i else (conf >= lo) & (conf <= hi)
        if not m.any():
            out.append({"lo": lo, "hi": hi, "n": 0,
                        "mean_conf": float("nan"), "acc": float("nan")})
            continue
        out.append({
            "lo": lo, "hi": hi, "n": int(m.sum()),
            "mean_conf": float(conf[m].mean()),
            "acc": float(correct[m].mean()),
        })
    return out


# ── Per-channel recall ───────────────────────────────────────────────────────

def channel_recall(cfg: EngineConfig, corpus: Corpus, rows_subset: list[dict],
                   schedule=SCHEDULE_V2, k: int = 20) -> dict:
    """recall@k for each retrieval channel ALONE, and for the fusion.

    A channel that never surfaces the gold activity within k is contributing
    ranks to the fusion and nothing else — which is precisely the thing a
    fusion weight cannot tell you.
    """
    engine = MatchingEngine(schedule, config=cfg)
    r = engine.retriever
    names = ["TAG", "BM25", "DENSE"]
    if cfg.retrieval.use_ngram:
        names.append("NGRAM")
    if cfg.retrieval.use_alias:
        names.append("ALIAS")

    pos = [x for x in rows_subset if x["gold_class"] == GOLD_POSITIVE]
    hits = {n: [] for n in names}
    hits["FUSION"] = []
    for row in pos:
        ev = row["event"]
        gold_idx = engine.index.index_of(row["gold"])
        etags = r.parse_event_tags(ev.tags)
        from matching.textutils import extract_size_mentions
        chans = {
            "TAG": r.tag_channel(etags, extract_size_mentions(ev.raw_text)),
            "BM25": r.bm25_channel(tokenize(ev.raw_text)),
            "DENSE": r.dense_channel(ev.raw_text),
        }
        if "NGRAM" in names:
            chans["NGRAM"] = r.ngram_channel(ev.raw_text)
        if "ALIAS" in names:
            chans["ALIAS"] = r.alias_channel(ev.raw_text)
        for n in names:
            top = [i for i, _ in chans[n][:k]]
            hits[n].append(1.0 if gold_idx in top else 0.0)
        cand_ids, _info = r.retrieve(ev.raw_text, ev.tags,
                                     discipline=getattr(ev.discipline, "value", None))
        hits["FUSION"].append(1.0 if gold_idx in cand_ids[:k] else 0.0)
    return {n: np.array(v) for n, v in hits.items()}


# ── NO_MATCH over 5-fold CV, pooled ──────────────────────────────────────────

def pooled_no_match(rows: list[dict], folds: int = 5,
                    coverage_floor: float = 0.35) -> dict:
    """Calibrate on 4/5, decide the held-out 1/5, pool the held-out negatives.

    The point is the DENOMINATOR: the test split holds 13 negatives, and a
    rate on 13 items cannot distinguish 85% from 60%. Pooling the held-out
    folds uses all of them while keeping every decision out-of-sample.
    """
    n = len(rows)
    order = RNG.permutation(n)
    per_fold_flags: list[float] = []
    chosen: list[Thresholds] = []
    for f in range(folds):
        test_idx = set(order[f::folds].tolist())
        train = [r for i, r in enumerate(rows) if i not in test_idx]
        test = [r for i, r in enumerate(rows) if i in test_idx]
        t = evalmod.calibrate(train, coverage_floor=coverage_floor)
        chosen.append(t)
        for r in test:
            if r["gold_class"] != GOLD_NO_MATCH:
                continue
            outcome = decide_outcome(r["decision"].candidates, t)[0]
            per_fold_flags.append(1.0 if outcome is Decision.NEW_ACTIVITY else 0.0)
    return {"flags": np.array(per_fold_flags), "thresholds": chosen}


# ══════════════════════════════════════════════════════════════════════════════
# Printing
# ══════════════════════════════════════════════════════════════════════════════

W = 100


def rule(c="-"):
    return c * W


def title(text):
    print()
    print(rule("="))
    print(f" {text}")
    print(rule("="))


def table(headers, rows, aligns=None):
    rows = [[str(c) for c in r] for r in rows]
    aligns = aligns or ["<"] * len(headers)
    widths = [
        max([len(str(h))] + [len(r[i]) for r in rows]) if rows else len(str(h))
        for i, h in enumerate(headers)
    ]
    fmt = "  ".join(f"{{:{a}{w}}}" for a, w in zip(aligns, widths))
    print("  " + fmt.format(*[str(h) for h in headers]))
    print("  " + "-+-".join("-" * w for w in widths))
    for r in rows:
        print("  " + fmt.format(*r))
