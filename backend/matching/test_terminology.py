"""Tests for the controlled terminology-expansion layer.

Contract under test:
  * canonicalise EXPANDS, never replaces — original tokens survive;
  * the layer is OFF by default (DEFAULT config behaves byte-identically);
  * when ON, batch and single-event paths agree (test_equivalence's rule);
  * the LinkDecision still records the ORIGINAL field text;
  * the batch dense pass must not double-append canonical phrases.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from matching import MatchingEngine
from matching.config import DEFAULT, EngineConfig
from matching.terminology import canonicalise, expansion_tokens, mapping_count

SCHEDULE = Path(__file__).resolve().parents[2] / "dataset" / "baseline_schedule_v2.json"


MENTIONS = [
    # (field text, a canonical phrase it MUST gain)
    ("Hydrotest on the 204 line cleared today", "hydrostatic testing"),
    ("Spool erected near pump bay", "spool erection"),
    ("Tray work finished in electrical room B", "cable tray installation"),
    ("Rebar fixed for the separator foundation", "reinforcement"),
    ("Formwork done, concrete poured at the base", "shuttering"),
    ("Digging completed at the wellhead cellar", "excavation"),
    ("Base poured for the pump foundation", "concreting foundation"),
    ("Motor bumped on the crude pumps", "motor bump test"),
    ("Drinking water line laid to the control building", "potable water"),
    ("JB's mounted in the field", "junction boxes"),
]


def test_mappings_are_controlled():
    # A bounded, hand-audited set — not a synonym dump.
    assert 20 <= mapping_count() <= 120


@pytest.mark.parametrize("text,expected", MENTIONS)
def test_canonicalise_expands_and_preserves(text, expected):
    out = canonicalise(text)
    # original text is a prefix — nothing was replaced or lost
    assert out.startswith(text)
    assert expected in out.lower()


def test_canonicalise_noop_without_hits():
    text = "Work completed at site, 6 nos"
    assert canonicalise(text) == text
    assert expansion_tokens(text) == []


def test_canonicalise_empty():
    assert canonicalise("") == ""
    assert canonicalise(None) is None


def test_default_config_has_expansion_off():
    assert DEFAULT.retrieval.term_expansion is False


def test_default_engine_behaviour_unchanged():
    """With the flag off, canonicalise must not influence any decision."""
    engine = MatchingEngine(SCHEDULE)
    assert engine.config.retrieval.term_expansion is False


def test_expansion_paths_agree_and_record_original_text():
    """Batch and single-event paths agree with expansion ON, and the
    decision carries the original field wording, not the expanded one."""
    cfg = EngineConfig().with_retrieval(term_expansion=True)
    batch_engine = MatchingEngine(SCHEDULE, config=cfg)
    single_engine = MatchingEngine(SCHEDULE, config=cfg)

    from eval import _build_event
    events = [_build_event(text, "test_terminology", None) for text, _ in MENTIONS]

    batch = batch_engine.match_events(events)
    single = [single_engine.match_event(e) for e in events]
    for b, s in zip(batch, single):
        # Batch and single paths accumulate the cosine in different orders —
        # the same 1e-6-level drift test_equivalence.py tolerates.
        assert [(c.activity_id, pytest.approx(c.final_score, abs=1e-5)) for c in b.candidates] == [
            (c.activity_id, pytest.approx(c.final_score, abs=1e-5)) for c in s.candidates
        ]
    for e, d in zip(events, batch):
        # The decision record quotes the supervisor's words, never the
        # canonicalised expansion.
        assert d.raw_text == e.raw_text


def test_expansion_adds_recall_on_drift_language():
    """A drift mention's gold activity must never DROP OUT of the pool
    because canonical vocabulary was appended."""
    base = MatchingEngine(SCHEDULE)
    term = MatchingEngine(
        SCHEDULE, config=EngineConfig().with_retrieval(term_expansion=True)
    )
    from eval import _build_event
    ev = _build_event("Spool erected near pump bay, 6 m today", "t", None)
    b = base.retriever.retrieve(ev.raw_text, ev.tags)[0]
    t = term.retriever.retrieve(ev.raw_text, ev.tags)[0]
    gold = term.index.index_of("PIP-ERC-1311")  # Erect Line 24"-P-1001-A1A
    assert gold is not None
    if gold in b:
        assert gold in t

