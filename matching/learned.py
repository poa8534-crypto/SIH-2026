"""Fitted replacements for three hand-set pieces of the decision path.

  LearnedRanker      the weighted feature blend  →  a fitted model
  AbstentionModel    "low score means no match"  →  an explicit classifier
  Calibrator         a score                     →  a probability

All three are OPTIONAL and DEGRADING, on the same contract as the dense
retriever: when the artefact is missing the engine uses the hand-set
behaviour and logs once. None of them is allowed to invent a link — the
abstainer can only ever refuse, and the calibrator only rewrites a
confidence, never a choice.

Two properties the whole file is built around:

  * `rationale` stays a list of deterministic feature NAMES. A fitted model
    changes how the features are weighed; it never becomes the explanation.
    That is why the ranker exposes `weights()` and why nothing here emits
    prose. See D-003.
  * NaN means "signal absent" everywhere, exactly as in features.py. A model
    that imputed zero would read a missing tag as evidence AGAINST, which is
    the opposite of what the blend does. Logistic regression gets explicit
    missingness indicators; the gradient-boosted model handles NaN natively.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from .features import ALL_FEATURE_ORDER, BASE_FEATURE_ORDER

logger = logging.getLogger(__name__)


def _design(M: np.ndarray, extra: bool) -> np.ndarray:
    """Feature matrix → model design matrix.

    Columns: the features with NaN replaced by the column's neutral value,
    then one 0/1 "was this present" indicator per feature. The indicators are
    what let a linear model distinguish "no tag in the text" from "a tag that
    matched nothing", which are opposite pieces of evidence that share a
    single imputed value.
    """
    names = ALL_FEATURE_ORDER if extra else BASE_FEATURE_ORDER
    n_f = len(names)
    M = np.asarray(M, dtype=np.float64)
    if M.ndim == 1:
        M = M.reshape(1, -1)
    M = M[:, :n_f]
    present = ~np.isnan(M)
    filled = np.where(present, M, 0.5)      # 0.5 = "no opinion", not 0.0
    return np.hstack([filled, present.astype(np.float64)])


def _design_names(extra: bool) -> list[str]:
    names = ALL_FEATURE_ORDER if extra else BASE_FEATURE_ORDER
    return list(names) + [f"{n}__present" for n in names]


# ══════════════════════════════════════════════════════════════════════════════
# Ranker
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class LearnedRanker:
    model: object
    extra: bool
    kind: str = "logreg"

    def score(self, M: np.ndarray) -> np.ndarray:
        """P(this candidate is the gold activity), per candidate."""
        if M.shape[0] == 0:
            return np.zeros(0)
        try:
            if self.kind == "hgb":
                names = ALL_FEATURE_ORDER if self.extra else BASE_FEATURE_ORDER
                X = np.asarray(M, dtype=np.float64)[:, :len(names)]
            else:
                X = _design(M, self.extra)
            p = self.model.predict_proba(X)[:, 1]
        except Exception as e:
            logger.warning("ranker failed (%s) — falling back to the blend", e)
            from .features import blend_matrix
            return blend_matrix(M, extra=self.extra)
        return np.round(p, 6)

    def weights(self) -> dict[str, float]:
        """Learned weight per design column. Empty for a non-linear model."""
        coef = getattr(self.model, "coef_", None)
        if coef is None:
            return {}
        return dict(zip(_design_names(self.extra), np.asarray(coef).ravel().tolist()))

    def importances(self) -> dict[str, float]:
        imp = getattr(self.model, "feature_importances_", None)
        if imp is None:
            return {}
        names = ALL_FEATURE_ORDER if self.extra else BASE_FEATURE_ORDER
        return dict(zip(names, np.asarray(imp).ravel().tolist()))


def fit_ranker(
    M: np.ndarray, y: np.ndarray, extra: bool = False, kind: str = "logreg",
    seed: int = 20260901,
) -> LearnedRanker:
    """Fit a pointwise ranker on (candidate features, is-gold) pairs.

    Pointwise rather than pairwise, deliberately: the decision layer needs a
    per-candidate score it can threshold and calibrate, and a pairwise
    objective returns an order without a scale. `class_weight="balanced"`
    because at most one of twenty candidates is positive.
    """
    y = np.asarray(y).astype(int)
    if kind == "hgb":
        from sklearn.ensemble import HistGradientBoostingClassifier
        names = ALL_FEATURE_ORDER if extra else BASE_FEATURE_ORDER
        X = np.asarray(M, dtype=np.float64)[:, :len(names)]   # NaN handled natively
        model = HistGradientBoostingClassifier(
            max_depth=4, max_iter=250, learning_rate=0.06,
            l2_regularization=1.0, random_state=seed,
            class_weight="balanced",
        )
    else:
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        X = _design(M, extra)
        model = make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=4000, C=1.0, class_weight="balanced",
                               random_state=seed),
        )
    model.fit(X, y)
    if kind == "logreg":
        # Surface the coefficients on the pipeline itself so weights() works.
        model.coef_ = model[-1].coef_
    return LearnedRanker(model=model, extra=extra, kind=kind)


# ══════════════════════════════════════════════════════════════════════════════
# Abstention — classification with a reject option
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class AbstentionModel:
    model: object
    threshold: float = 0.5

    def probability_no_match(self, X: np.ndarray) -> float:
        return float(self.model.predict_proba(np.asarray(X).reshape(1, -1))[0, 1])

    def should_abstain(self, X: np.ndarray) -> bool:
        return self.probability_no_match(X) >= self.threshold


def fit_abstention(X: np.ndarray, y: np.ndarray, seed: int = 20260901,
                   threshold: float = 0.5) -> AbstentionModel:
    """Fit "does ANY correct activity exist for this mention?".

    y = 1 means NO correct activity exists (the mention must be refused).
    The features are pool-SHAPE statistics, not the top-1 score alone — see
    `engine.abstention_features` for why that distinction is the whole point.
    """
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    model = make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=4000, class_weight="balanced",
                           random_state=seed),
    )
    model.fit(np.asarray(X, dtype=np.float64), np.asarray(y).astype(int))
    return AbstentionModel(model=model, threshold=threshold)


# ══════════════════════════════════════════════════════════════════════════════
# Calibration
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Calibrator:
    model: object
    kind: str = "isotonic"

    def predict_proba(self, X) -> float:
        x = np.asarray(X, dtype=np.float64).ravel()
        v = float(x[0])              # top-1 score is the first abstention feature
        if self.kind == "isotonic":
            return float(self.model.predict([v])[0])
        return float(self.model.predict_proba([[v]])[0, 1])

    def transform(self, scores: np.ndarray) -> np.ndarray:
        s = np.asarray(scores, dtype=np.float64)
        if self.kind == "isotonic":
            return np.asarray(self.model.predict(s))
        return self.model.predict_proba(s.reshape(-1, 1))[:, 1]


def fit_calibrator(scores: np.ndarray, correct: np.ndarray,
                   kind: str = "isotonic", seed: int = 20260901) -> Calibrator:
    """Map a raw top-1 score to P(top-1 is correct).

    Fitted on DEV, never on test: a calibration curve fitted on the split it
    is then scored against reports its own training error as an ECE.
    """
    s = np.asarray(scores, dtype=np.float64)
    c = np.asarray(correct, dtype=np.float64)
    if kind == "platt":
        from sklearn.linear_model import LogisticRegression
        m = LogisticRegression(max_iter=4000, random_state=seed)
        m.fit(s.reshape(-1, 1), c.astype(int))
        return Calibrator(model=m, kind="platt")
    from sklearn.isotonic import IsotonicRegression
    m = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    m.fit(s, c)
    return Calibrator(model=m, kind="isotonic")
