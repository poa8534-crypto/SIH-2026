"""Configuration settings that a measurement disqualified, pinned so they
cannot be switched on again without re-measuring.

Both flags below LOOK like free wins. Both were measured. Neither is.

This file deliberately asserts configuration rather than re-running eval.py:
a full evaluation is ~2 minutes and does not belong in the unit suite. The
numbers each assertion protects are recorded in DECISIONS.md D-061 and D-062,
and `python eval.py` remains the thing that proves them.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from matching.config import DEFAULT, EngineConfig, RetrievalConfig


class TestAliasChannelStaysOff:
    """D-061. The alias channel cannot help, so it stays off.

    Measured on the 814-mention v2 corpus:
      - ALIAS recall@20 on the test split: 0.0%
      - "+ alias lexicon channel" ablation delta: +0.00 on every metric
      - 0 of 185 test mentions share an alias key with the train split
      - across all 814 mentions only 16 of 793 distinct keys repeat at all

    The cause is structural, not tunable. The lexicon is keyed on exact
    normalised mention text and free-text DPR lines do not recur verbatim.
    And it could not help even with a perfect key: fusion recall@20 is already
    100%, so the gold activity is ALWAYS in the pool and no RETRIEVAL channel
    has anything left to contribute.
    """

    def test_w_alias_is_zero(self):
        assert RetrievalConfig().w_alias == 0.0
        assert RetrievalConfig().use_alias is False
        assert DEFAULT.retrieval.w_alias == 0.0

    def test_no_alias_lexicon_is_configured_by_default(self):
        assert EngineConfig().alias_lexicon is None
        assert DEFAULT.alias_lexicon is None


class TestExtraFeaturesStayOffWithoutAFittedRanker:
    """D-062. `extra_features=True` breaches the precision floor on v1.

    Row 8a of the v2 ablation reported the hand-weighted extra features at
    100.0% auto-link precision, which reads as a free +0.5 coverage. It does
    NOT transfer. Measured on the v1 baseline the server actually runs, at the
    shipped thresholds (tau_high=0.775):

        coverage         50.39%  ->  53.54%   (+3.15)
        auto precision  100.00%  ->  94.85%
        wrong auto-links      0  ->       7
        top-1 accuracy   87.19%  ->  84.71%

    Seven false actual dates written onto the schedule to buy three points of
    coverage. CLAUDE.md is explicit that this is a correctness regression, not
    a trade-off, so the flag is off in DEFAULT.

    It is legitimate ONLY as part of `production()`, where it travels with a
    ranker fitted against the same baseline AND a sha256 check that refuses
    the pairing on any other schedule.
    """

    def test_default_has_extra_features_off(self):
        assert EngineConfig().extra_features is False
        assert DEFAULT.extra_features is False

    def test_default_ships_no_fitted_ranker(self):
        """The hand-set blend is what the v1 demo runs, by design."""
        assert DEFAULT.ranker_path is None
        assert DEFAULT.calibrator_path is None

    def test_extra_features_is_reachable_but_only_deliberately(self):
        """Not removed — it is correct under a matched fitted ranker. The
        point is that turning it on is a decision, never a default."""
        assert EngineConfig(extra_features=True).extra_features is True
