"""Configuration for retrieval and ranking.

Every knob that an experiment might move lives here rather than as a module
constant, for one reason: an ablation is only real if a single change can be
turned off in isolation while everything else stays byte-identical. Module
constants cannot be ablated; a config field can.

Defaults reproduce the hand-tuned engine exactly, so constructing
`MatchingEngine(path)` with no config is the pre-existing behaviour.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from pathlib import Path

from matching.models import Thresholds


@dataclass(frozen=True)
class RetrievalConfig:
    # ── BM25 ──
    # rank_bm25's own defaults. Fitted values live in tuned.json; see the
    # grid search in research/bench/tune_retrieval.py.
    bm25_k1: float = 1.5
    bm25_b: float = 0.75

    # ── Reciprocal rank fusion ──
    rrf_k: int = 60
    w_tag: float = 1.0
    w_bm25: float = 0.7
    w_dense: float = 0.7
    w_ngram: float = 0.0        # 0.0 = channel off
    # ── Alias lexicon ──
    w_alias: float = 0.0        # 0.0 = channel off

    # ── Controlled terminology expansion (matching/terminology.py) ──
    # Appends canonical schedule vocabulary to the QUERY side (BM25 tokens,
    # dense/ngram query text, and the event text the fuzzy feature reads)
    # when field language drifts from schedule language ("hydrotest" vs
    # "hydrostatic testing"). OFF by default: it must earn its place in an
    # ablation on the terminology-drift benchmark before anything enables it.
    term_expansion: bool = False

    top_k: int = 20

    # ── Character n-gram channel ──
    ngram_min: int = 3
    ngram_max: int = 5

    # ── Exact-tag short circuit ──
    # When a mention's tag resolves to exactly ONE activity, dense retrieval
    # and the fuzzy stage cannot change the answer, only its cost.
    short_circuit_tags: bool = False

    # ── Discipline soft gate ──
    # Restrict the pool to the inferred discipline, but keep an escape hatch:
    # discipline inference from field text is noisy, so a gate with no
    # fallback trades recall for nothing.
    discipline_gate: bool = False
    discipline_gate_min_pool: int = 6   # below this many survivors, do not gate

    @property
    def channel_weights(self) -> dict[str, float]:
        return {
            "TAG": self.w_tag,
            "BM25": self.w_bm25,
            "DENSE": self.w_dense,
            "NGRAM": self.w_ngram,
            "ALIAS": self.w_alias,
        }

    @property
    def use_ngram(self) -> bool:
        return self.w_ngram > 0.0

    @property
    def use_alias(self) -> bool:
        return self.w_alias > 0.0


@dataclass(frozen=True)
class EngineConfig:
    retrieval: RetrievalConfig = field(default_factory=RetrievalConfig)

    # ── Ranking ──
    # Extra features (quantity/UOM compatibility, numeric proximity,
    # predecessor state, report position, contractor/area). Off by default
    # until each has earned its place in the ablation.
    extra_features: bool = False

    # A fitted ranker (logistic regression or a gradient-boosted ranker),
    # either already in memory or on disk. None = the hand-set
    # FEATURE_WEIGHTS blend. The in-memory field exists so an experiment can
    # fit on train and evaluate without a pickle round trip; production
    # loads from a path.
    ranker: object | None = None
    ranker_path: Path | None = None

    # Cross-encoder rerank of the top-N after fusion. Optional and
    # degrading: an uncached model logs once and leaves the order alone,
    # exactly as the dense retriever already does.
    cross_encoder: bool = False
    cross_encoder_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    cross_encoder_top_n: int = 20
    cross_encoder_weight: float = 0.5

    # Binary "does ANY correct activity exist" classifier. None = infer
    # NO_MATCH from a low score, which is the weakest metric the engine has.
    abstainer: object | None = None
    abstention_path: Path | None = None

    # Platt / isotonic map from raw score to a calibrated probability.
    calibrator: object | None = None
    calibrator_path: Path | None = None

    # Alias lexicon: {normalised source text: [(activity_id, weight), ...]}
    alias_lexicon: dict | None = None

    def with_(self, **kw) -> "EngineConfig":
        return replace(self, **kw)

    def with_retrieval(self, **kw) -> "EngineConfig":
        return replace(self, retrieval=replace(self.retrieval, **kw))


DEFAULT = EngineConfig()

#: The decision thresholds the SERVER RUNS. One constant, imported by
#: `server/main.py` and by `eval.py`, so a quoted accuracy figure describes the
#: build that ships rather than a threshold set chosen for the occasion.
#:
#: HOW THESE WERE CHOSEN, and why they are not the dev-optimal ones.
#: `dataset/ground_truth.csv` carries a `split` column assigned BY SOURCE FILE
#: (D-093) - mentions from one DPR describe one day's work in one writer's
#: phrasing, so splitting by row would put near-duplicates on both sides. The
#: rule, applied to the 100 dev mentions and never to test:
#:
#:     among threshold sets holding 100% auto-link precision on dev with at
#:     least 45% dev coverage, take the highest tau_high, then the largest
#:     margin - the most CONSERVATIVE point rather than the highest-coverage
#:     one.
#:
#: That conservatism is the whole point. The dev-optimal set (0.75/0.30/0.02)
#: also reaches 100% on dev and collapses to 93.2% on the 154 held-out test
#: mentions - seven auto-links onto the wrong activity. The previously shipped
#: set (0.70/0.40/0.03) scores 95.2% there. These score:
#:
#:     auto-link precision   100.0%   0 wrong auto-links out of 67
#:     coverage               43.5%   67 of 154 mentions auto-linked
#:     top-1 accuracy         86.9%   126 of 145 gold positives
#:     wrong review rows      28      queued for a planner, not written
#:     NO_MATCH rejection     0/9     all nine routed to REVIEW, never linked
#:
#: measured on data no threshold was tuned against. Reproduce with:
#:
#:     python eval.py
#:
#: The coverage cost is real - 43.5% against 68.2% for the old set - and it is
#: the price of the constraint this project actually claims: a wrong auto-link
#: writes a wrong date onto a schedule, and a REVIEW row costs a planner ten
#: seconds. See D-093.
SHIPPED_THRESHOLDS = Thresholds(tau_high=0.80, tau_low=0.40, margin_min=0.03)

#: Where `fit_production.py` writes the fitted ranker and calibrator.
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"


def production(baseline_sha256: str | None = None) -> EngineConfig:
    """The configuration the ablation selected, if its artefacts are present.

    Row 8b: extra features, a pointwise logistic ranker fitted on the train
    split, and isotonic calibration fitted on dev. Measured on the HELD-OUT
    test split against the hand-tuned baseline:

        top-1                71.4% -> 74.1%   (+2.7, 95% CI [-1.6, +7.6])
        near-miss top-1      26.5% -> 29.4%   (+2.9, 95% CI [-8.8, +14.7])
        coverage             39.4% -> 47.0%   (+7.6)
        auto-link precision  100%  -> 100%    (the floor holds)
        NO_MATCH rejection   80.0% -> 100%    (pooled 5-fold, n=70)
        ECE                  0.129 -> 0.042
        latency              2.07  -> 2.50 ms/event

    The top-1 and near-miss intervals SPAN ZERO: at n=185 and n=68 those moves
    are directional, not established. What is established is the coverage gain
    at an unchanged precision floor, and the NO_MATCH improvement, whose
    intervals do not overlap the baseline's.

    Chosen under the >= 99% auto-link precision constraint rather than on
    top-1: the gradient-boosted ranker matched this top-1 with 58.6% coverage
    and 97.4% auto-link precision, and was disqualified.

    Falls back to `DEFAULT` when the artefacts are missing — the engine logs
    and uses the hand-set blend, so a checkout without them is slower to
    improve, never broken.

    It ALSO falls back when `baseline_sha256` is given and does not match the
    baseline the artefacts were fitted against. A ranker learns the feature
    distribution of one schedule: the v2 baseline has 218 activities and
    four-digit tags, v1 has 120 and three-digit ones, and the server still
    defaults to v1. Transferring the model across them silently would be the
    exact failure this whole exercise exists to measure away, so the mismatch
    is refused rather than warned about.
    """
    import json
    import logging

    ranker = ARTIFACT_DIR / "ranker.joblib"
    calibrator = ARTIFACT_DIR / "calibrator.joblib"
    meta_path = ARTIFACT_DIR / "metadata.json"
    if not ranker.exists():
        return DEFAULT

    if baseline_sha256 is not None:
        fitted_on = None
        if meta_path.exists():
            try:
                fitted_on = json.loads(
                    meta_path.read_text(encoding="utf-8")
                ).get("baseline_sha256")
            except (OSError, ValueError):
                fitted_on = None
        if fitted_on != baseline_sha256:
            logging.getLogger(__name__).warning(
                "fitted ranker was built against baseline %s but this index is "
                "%s — using the hand-set blend instead",
                (fitted_on or "unknown")[:12], (baseline_sha256 or "unknown")[:12],
            )
            return DEFAULT

    return EngineConfig(
        extra_features=True,
        ranker_path=ranker,
        calibrator_path=calibrator if calibrator.exists() else None,
    )
