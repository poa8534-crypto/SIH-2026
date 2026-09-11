"""Tests for the fitted and optional stages: alias channel, ranker,
abstention, calibration, cross-encoder.

The alias-channel tests exist for a specific reason. On the shipped v2 corpus
the channel's measured contribution is exactly 0.000, because the generator
gave every mention unique text and no held-out mention can therefore match a
train-split alias. That is a property of the CORPUS, not of the channel, and
without a direct test there would be no evidence which of the two it is. These
tests supply that evidence: the channel is exercised with a lexicon that does
contain the mention, and it fires.
"""

from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path

import numpy as np

from extraction.models import (
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    Provenance,
)
from extraction.prepass import extract_tags, infer_discipline

from .config import EngineConfig, RetrievalConfig
from .engine import MatchingEngine, abstention_features, decide_outcome
from .features import BASE_FEATURE_ORDER
from .learned import fit_abstention, fit_calibrator, fit_ranker
from .models import Decision, LinkCandidate, Thresholds
from .textutils import alias_key

ROOT = Path(__file__).resolve().parents[2]
SCHEDULE_V2 = ROOT / "dataset" / "baseline_schedule_v2.json"


def _event(text: str) -> ExtractedEvent:
    return ExtractedEvent(
        raw_text=text,
        tags=extract_tags(text),
        reported_date=date(2026, 8, 12),
        discipline=infer_discipline(text) or Discipline.UNKNOWN,
        status=EventStatus.UNKNOWN,
        provenance=Provenance(source_file="t.txt", source_span=text,
                              method=ExtractionMethod.PREPASS),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Alias lexicon channel
# ══════════════════════════════════════════════════════════════════════════════

class TestAliasChannel(unittest.TestCase):
    def setUp(self):
        self.plain = MatchingEngine(SCHEDULE_V2)
        # An activity the mention text below does NOT describe, so that any
        # effect can only have come from the lexicon.
        self.target = self.plain.index.records[-1].activity_id
        self.text = "zzz unrelated field note about nothing in particular"

    def _engine_with(self, lex):
        return MatchingEngine(
            SCHEDULE_V2,
            config=EngineConfig(
                retrieval=RetrievalConfig(w_alias=1.0), alias_lexicon=lex
            ),
        )

    def test_alias_injects_the_mapped_activity(self):
        lex = {alias_key(self.text): [(self.target, 3.0)]}
        eng = self._engine_with(lex)
        ids = [c.activity_id for c in eng.match_event(_event(self.text)).candidates]
        self.assertIn(self.target, ids,
                      "a confirmed alias must put its activity in the pool")

    def test_alias_is_recorded_as_a_retrieval_source(self):
        lex = {alias_key(self.text): [(self.target, 3.0)]}
        eng = self._engine_with(lex)
        cand = next(c for c in eng.match_event(_event(self.text)).candidates
                    if c.activity_id == self.target)
        self.assertIn("ALIAS", cand.retrieval_sources)
        self.assertIn("planner_confirmed_alias", _rationale_of(cand))

    def test_alias_does_not_bypass_feature_scoring(self):
        """An alias is a RETRIEVAL channel, never a decision. The mention text
        supports nothing, so the feature stage must still refuse to auto-link
        it — otherwise one stale correction could write to the schedule."""
        lex = {alias_key(self.text): [(self.target, 5.0)]}
        eng = self._engine_with(lex)
        d = eng.match_event(_event(self.text))
        self.assertIsNot(d.outcome, Decision.AUTO_LINK)

    def test_missing_lexicon_changes_nothing(self):
        a = self.plain.match_event(_event(self.text))
        b = self._engine_with({}).match_event(_event(self.text))
        self.assertEqual([c.activity_id for c in a.candidates],
                         [c.activity_id for c in b.candidates])

    def test_key_matches_what_the_server_writes(self):
        """The server's write key and this read key must be one function.
        If they drift, corrections stop being findable and nothing errors."""
        import inspect

        from server import main as server_main
        src = inspect.getsource(server_main._upsert_alias)
        self.assertIn("alias_key(source_text)", src)
        self.assertEqual(alias_key("  Foo   BAR  "), "foo bar")


def _rationale_of(cand: LinkCandidate) -> list[str]:
    from .engine import _rationale
    return _rationale(cand)


# ══════════════════════════════════════════════════════════════════════════════
# Learned ranker
# ══════════════════════════════════════════════════════════════════════════════

def _toy_training_set(n=400, seed=0):
    """tag_overlap and fuzzy carry the signal; the rest is noise."""
    rng = np.random.default_rng(seed)
    f = len(BASE_FEATURE_ORDER)
    M = rng.random((n, f))
    y = (M[:, 0] > 0.7).astype(int)          # tag_overlap decides
    M[rng.random((n, f)) < 0.15] = np.nan    # realistic missingness
    M[:, 0] = np.where(np.isnan(M[:, 0]), 0.9, M[:, 0])   # keep the label honest
    y = (M[:, 0] > 0.7).astype(int)
    return M, y


class TestLearnedRanker(unittest.TestCase):
    def test_logreg_learns_the_signal(self):
        M, y = _toy_training_set()
        r = fit_ranker(M, y, kind="logreg")
        s = r.score(M)
        self.assertGreater(s[y == 1].mean(), s[y == 0].mean())

    def test_gradient_boosted_learns_the_signal(self):
        M, y = _toy_training_set()
        r = fit_ranker(M, y, kind="hgb")
        s = r.score(M)
        self.assertGreater(s[y == 1].mean(), s[y == 0].mean())

    def test_weights_are_named_features_not_prose(self):
        M, y = _toy_training_set()
        w = fit_ranker(M, y, kind="logreg").weights()
        self.assertTrue(w)
        for k in w:
            self.assertTrue(
                k in BASE_FEATURE_ORDER or k.endswith("__present"),
                f"unexpected weight name {k!r}",
            )

    def test_missingness_is_distinguished_from_zero(self):
        """A feature that is ABSENT and a feature that scored 0.0 are opposite
        evidence; the design matrix must not collapse them."""
        from .learned import _design
        absent = np.full((1, len(BASE_FEATURE_ORDER)), np.nan)
        zero = np.zeros((1, len(BASE_FEATURE_ORDER)))
        self.assertFalse(np.allclose(_design(absent, False), _design(zero, False)))

    def test_ranker_failure_falls_back_to_the_blend(self):
        class Broken:
            def predict_proba(self, X):
                raise RuntimeError("boom")

        from .features import blend_matrix
        from .learned import LearnedRanker
        M, _y = _toy_training_set(n=20)
        r = LearnedRanker(model=Broken(), extra=False, kind="logreg")
        np.testing.assert_allclose(r.score(M), blend_matrix(M), rtol=0, atol=1e-9)

    def test_engine_with_a_ranker_still_produces_feature_rationale(self):
        M, y = _toy_training_set()
        eng = MatchingEngine(
            SCHEDULE_V2, config=EngineConfig(ranker=fit_ranker(M, y, kind="logreg"))
        )
        d = eng.match_event(_event('Erection of 24"-P-1001-A1A spools'))
        self.assertTrue(d.rationale)
        for token in d.rationale:
            self.assertIsInstance(token, str)
            self.assertNotIn(" the ", token, "rationale must be feature names, not prose")


# ══════════════════════════════════════════════════════════════════════════════
# Abstention
# ══════════════════════════════════════════════════════════════════════════════

class TestAbstention(unittest.TestCase):
    def test_features_separate_a_flat_pool_from_a_decisive_one(self):
        decisive = [_cand(0.95), _cand(0.30), _cand(0.28), _cand(0.27), _cand(0.26)]
        flat = [_cand(0.42), _cand(0.41), _cand(0.41), _cand(0.40), _cand(0.40)]
        fd, ff = abstention_features(decisive)[0], abstention_features(flat)[0]
        self.assertGreater(fd[0], ff[0], "top-1 score")
        self.assertGreater(fd[1], ff[1], "margin")
        self.assertLess(fd[2], ff[2], "a flat pool must have HIGHER entropy")

    def test_abstainer_can_only_refuse_never_promote(self):
        class AlwaysAbstain:
            def should_abstain(self, X):
                return True

        scored = [_cand(0.99), _cand(0.10)]
        t = Thresholds(tau_low=0.2, tau_high=0.5, margin_min=0.02)
        self.assertIs(decide_outcome(scored, t)[0], Decision.AUTO_LINK)
        out = decide_outcome(scored, t, abstainer=AlwaysAbstain())
        self.assertIs(out[0], Decision.NEW_ACTIVITY)
        self.assertIsNone(out[1])
        self.assertIn("abstention_model_no_match", out[3])

    def test_a_broken_abstainer_does_not_break_the_decision(self):
        class Broken:
            def should_abstain(self, X):
                raise RuntimeError("boom")

        scored = [_cand(0.99), _cand(0.10)]
        t = Thresholds(tau_low=0.2, tau_high=0.5, margin_min=0.02)
        self.assertIs(decide_outcome(scored, t, abstainer=Broken())[0],
                      Decision.AUTO_LINK)

    def test_fitted_abstainer_prefers_flat_pools(self):
        rng = np.random.default_rng(1)
        pos = np.column_stack([rng.normal(0.9, 0.05, 200), rng.normal(0.4, 0.05, 200),
                               rng.normal(1.2, 0.1, 200)] + [rng.random(200)] * 6)
        neg = np.column_stack([rng.normal(0.45, 0.05, 60), rng.normal(0.03, 0.02, 60),
                               rng.normal(1.6, 0.1, 60)] + [rng.random(60)] * 6)
        X = np.vstack([pos, neg])
        y = np.r_[np.zeros(200), np.ones(60)]
        m = fit_abstention(X, y)
        self.assertLess(m.probability_no_match(pos[0]),
                        m.probability_no_match(neg[0]))


def _cand(score: float) -> LinkCandidate:
    from .models import FeatureVector
    return LinkCandidate(activity_id=f"A-{score}", final_score=score,
                         features=FeatureVector(tag_overlap=0.5,
                                                discipline_agreement=1.0))


# ══════════════════════════════════════════════════════════════════════════════
# Calibration
# ══════════════════════════════════════════════════════════════════════════════

class TestCalibration(unittest.TestCase):
    def _data(self, n=600, seed=3):
        rng = np.random.default_rng(seed)
        s = rng.random(n)
        # True accuracy is a squashed function of the score: an overconfident
        # system, which is what calibration is for.
        y = (rng.random(n) < np.clip(s ** 2, 0, 1)).astype(float)
        return s, y

    def test_calibration_improves_ece(self):
        import sys
        sys.path.insert(0, str(ROOT / "research" / "bench"))
        import harness as H

        s, y = self._data()
        fit, holdout = slice(0, 300), slice(300, None)
        before = H.ece(s[holdout], y[holdout])
        for kind in ("platt", "isotonic"):
            cal = fit_calibrator(s[fit], y[fit], kind=kind)
            after = H.ece(np.clip(cal.transform(s[holdout]), 0, 1), y[holdout])
            self.assertLess(after, before, f"{kind} must reduce ECE")

    def test_calibrated_confidence_never_changes_the_choice(self):
        """Calibration rewrites a confidence, never a decision."""
        s, y = self._data()
        cal = fit_calibrator(s, y, kind="isotonic")
        eng_plain = MatchingEngine(SCHEDULE_V2)
        eng_cal = MatchingEngine(SCHEDULE_V2, config=EngineConfig(calibrator=cal))
        ev = _event('Erection of 24"-P-1001-A1A spools')
        a, b = eng_plain.match_event(ev), eng_cal.match_event(ev)
        self.assertEqual([c.activity_id for c in a.candidates],
                         [c.activity_id for c in b.candidates])
        self.assertEqual(a.outcome, b.outcome)
        self.assertEqual(a.chosen_activity_id, b.chosen_activity_id)


# ══════════════════════════════════════════════════════════════════════════════
# Cross-encoder — the degradation contract
# ══════════════════════════════════════════════════════════════════════════════

class TestCrossEncoderDegrades(unittest.TestCase):
    """The model is not cached on this machine and there is no network, so its
    ACCURACY is unmeasured. What must still hold, and is tested here, is that
    its absence is a missing option and not an outage — the same contract the
    dense retriever already keeps."""

    def test_uncached_model_leaves_the_ranking_untouched(self):
        plain = MatchingEngine(SCHEDULE_V2)
        ce = MatchingEngine(SCHEDULE_V2, config=EngineConfig(cross_encoder=True))
        ev = _event('Erection of 24"-P-1001-A1A spools, 6 of 8 done')
        a, b = plain.match_event(ev), ce.match_event(ev)
        if ce._load_cross_encoder() is not None:
            self.skipTest("cross-encoder IS cached here; degradation not exercised")
        self.assertEqual([c.activity_id for c in a.candidates],
                         [c.activity_id for c in b.candidates])
        self.assertEqual(a.outcome, b.outcome)

    def test_failure_is_recorded_once_not_retried_per_event(self):
        ce = MatchingEngine(SCHEDULE_V2, config=EngineConfig(cross_encoder=True))
        if ce._load_cross_encoder() is not None:
            self.skipTest("cross-encoder IS cached here")
        self.assertTrue(ce._cross_encoder_failed,
                        "a failed load must be latched, not retried per event")

    def test_blend_puts_the_cross_encoder_on_the_same_scale(self):
        """A raw ms-marco logit is unbounded; blending it with a [0,1] feature
        score without squashing would make magnitude, not evidence, decide."""
        class FakeCE:
            def predict(self, pairs, show_progress_bar=False):
                return np.array([12.0] + [-12.0] * (len(pairs) - 1))

        ce = MatchingEngine(
            SCHEDULE_V2,
            config=EngineConfig(cross_encoder=True, cross_encoder_weight=0.5),
        )
        ce._cross_encoder = FakeCE()
        ce._cross_encoder_failed = False
        out = ce._cross_encode("some text", [0, 1, 2], [0.5, 0.5, 0.5])
        for v in out:
            self.assertGreaterEqual(v, 0.0)
            self.assertLessEqual(v, 1.0)
        self.assertGreater(out[0], out[1], "the highest-logit pair must rank up")


if __name__ == "__main__":
    unittest.main()
