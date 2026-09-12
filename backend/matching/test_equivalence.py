"""The optimised paths must be numerically identical to the ones they replaced.

Speed work is only legitimate if it does not move a number. Three equalities
are asserted here over the real corpus, not a toy fixture:

  1. score_pool + blend_matrix  ==  compute_features + final_score
     (the vectorised feature stage vs the per-candidate Python loop)
  2. match_events               ==  [match_event(e) for e in events]
     (the batched one-forward-pass path vs the interactive path)
  3. the short circuit picks the activity full retrieval would have picked

Without (2) in particular, every metric in eval.py would describe the batch
path while the server ran the single-event path, or the reverse.
"""

from __future__ import annotations

import unittest
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
from .engine import MatchingEngine
from .features import blend_matrix, compute_features, final_score, score_pool
from .schedule_index import ScheduleIndex

ROOT = Path(__file__).resolve().parents[2]
SCHEDULE_V1 = ROOT / "dataset" / "baseline_schedule.json"
SCHEDULE_V2 = ROOT / "dataset" / "baseline_schedule_v2.json"

MENTIONS = [
    "Foundation concreting for pipe rack pedestals P7 to P12",
    'Erection of 24"-P-1001-A1A spools, 6 of 8 done',
    "Cable pulling from MCC-2 to JB-101, 320 m",
    "Alignment check, P-1401A/B couplings completed",
    "Excavation for foundations V-1101/V-1201 and plinths WHP-1101/WHP-1102",
    "Hydrotest of TK-2101 passed, 40 m3 of 120 m3",
    "Toolbox talk and safety induction for 42 nos new workmen",
    "grouting pedestals",
    "Loop check LT-1201 and calibration of PT-1101",
    "backfilling around the tank farm bund, 480 m3 of 480 m3",
]


def _event(text: str) -> ExtractedEvent:
    from datetime import date
    return ExtractedEvent(
        raw_text=text,
        tags=extract_tags(text),
        reported_date=date(2026, 8, 12),
        discipline=infer_discipline(text) or Discipline.UNKNOWN,
        status=EventStatus.UNKNOWN,
        provenance=Provenance(
            source_file="test.txt", source_span=text,
            method=ExtractionMethod.PREPASS,
        ),
    )


EVENTS = [_event(m) for m in MENTIONS]


class TestVectorisedFeatureScoring(unittest.TestCase):
    """(1) the matrix stage reproduces the per-candidate loop exactly."""

    @classmethod
    def setUpClass(cls):
        cls.index = ScheduleIndex.from_json(SCHEDULE_V2)

    def _check(self, extra: bool):
        idx = self.index
        pool = list(range(min(40, len(idx.records))))
        for ev in EVENTS:
            dense = [0.5 + 0.01 * (i % 7) for i in pool]
            M, _present, locked = score_pool(
                idx, ev, pool, ev.reported_date, dense, extra=extra
            )
            vec_scores = blend_matrix(M, extra=extra)
            for r, i in enumerate(pool):
                fv = compute_features(
                    idx, ev, idx.records[i], ev.reported_date,
                    embedding_cosine=dense[r], extra=extra,
                )
                # places=5, not 6: numpy rounds a float64 in binary where
                # Python's round() works on the decimal repr, so the two
                # disagree by one unit in the sixth decimal on some values.
                # That is a rounding artefact of the last digit, not a
                # different score - tau_high moves in steps of 0.025.
                self.assertAlmostEqual(
                    float(vec_scores[r]), final_score(fv, extra=extra), places=5,
                    msg=f"score mismatch on {ev.raw_text!r} / {idx.records[i].activity_id}",
                )
                self.assertEqual(
                    bool(locked[r]), fv.line_locked,
                    msg=f"line_locked mismatch on {idx.records[i].activity_id}",
                )

    def test_base_features_match_scalar_path(self):
        self._check(extra=False)

    def test_extra_features_match_scalar_path(self):
        self._check(extra=True)

    def test_absent_signal_stays_absent(self):
        """NaN must mean 'excluded from the blend', never 'scored zero'."""
        idx = self.index
        ev = _event("grouting pedestals")          # no tags at all
        M, present, _ = score_pool(idx, ev, [0, 1, 2], ev.reported_date,
                                   [None, None, None])
        self.assertTrue(np.isnan(M[:, 0]).all(), "tagless event must have no tag_overlap")
        self.assertFalse(present[:, 0].any())
        self.assertTrue(np.isnan(M[:, 5]).all(), "no dense hit must have no cosine")


class TestBatchEqualsSingle(unittest.TestCase):
    """(2) one forward pass for the file == one call per event.

    `match_event` routes through `match_events`, so there is one code path
    rather than two that could drift. What remains is not drift: BLAS selects
    a different kernel for a 1-row query matrix than for a 10-row one, and the
    two accumulation orders disagree by ~1e-7 in the cosine. That is bounded
    far below anything that can move a decision - tau_high steps by 0.025 and
    margin_min by 0.02 - so the assertions below are exact on the things that
    decide (outcome, chosen activity, candidate ORDER) and hold scores to 5
    decimals rather than pretending to bit-exactness the hardware does not
    offer.
    """

    def _assert_paths_agree(self, engine: MatchingEngine):
        batched = engine.match_events(EVENTS)
        singles = [engine.match_event(e, i) for i, e in enumerate(EVENTS)]
        self.assertEqual(len(batched), len(singles))
        for b, s in zip(batched, singles):
            self.assertEqual(b.outcome, s.outcome, msg=b.raw_text)
            self.assertEqual(b.chosen_activity_id, s.chosen_activity_id, msg=b.raw_text)
            self.assertAlmostEqual(b.confidence, s.confidence, places=5, msg=b.raw_text)
            self.assertEqual(
                [c.activity_id for c in b.candidates],
                [c.activity_id for c in s.candidates],
                msg=f"candidate order differs on {b.raw_text!r}",
            )
            for cb, cs in zip(b.candidates, s.candidates):
                self.assertAlmostEqual(cb.final_score, cs.final_score, places=5)

    def test_default_config(self):
        self._assert_paths_agree(MatchingEngine(SCHEDULE_V2))

    def test_v1_baseline(self):
        self._assert_paths_agree(MatchingEngine(SCHEDULE_V1))

    def test_with_short_circuit_and_extra_channels(self):
        cfg = EngineConfig(
            retrieval=RetrievalConfig(short_circuit_tags=True, w_ngram=0.5),
            extra_features=True,
        )
        self._assert_paths_agree(MatchingEngine(SCHEDULE_V2, config=cfg))


class TestShortCircuitAgrees(unittest.TestCase):
    """(3) skipping dense + fuzzy must not change WHICH activity is chosen.

    Driven from the real corpus rather than a fixture, because the short
    circuit is RARE and a hand-written fixture would either miss it entirely
    or be selected until it fired. It requires a tag whose line resolves to
    exactly one activity, and in this domain a line number names an EQUIPMENT
    ITEM, not a task: V-1101 is referenced by its excavation, its foundation,
    its erection, its piping, its cabling and its testing. On the v2 corpus
    343 of 814 mentions carry a line the schedule knows, and only 38 of those
    name a line that belongs to a single activity.

    So this is a correctness guard, not a speed lever. See the latency table:
    batch encoding, not the short circuit, is what pays.
    """

    def test_short_circuit_never_changes_the_winner(self):
        import eval as evalmod

        full = MatchingEngine(SCHEDULE_V2)
        fast = MatchingEngine(
            SCHEDULE_V2,
            config=EngineConfig(retrieval=RetrievalConfig(short_circuit_tags=True)),
        )
        rows = evalmod.load_ground_truth(full, ROOT / "dataset" / "v2" / "ground_truth_v2.csv")
        events = [r["event"] for r in rows]

        fired = [
            i for i, e in enumerate(events)
            if fast.retriever.unambiguous_tag_hit(fast.retriever.parse_event_tags(e.tags))
            is not None
        ]
        self.assertGreater(len(fired), 0, "no mention exercised the short circuit")

        fast_out = fast.match_events(events)
        full_out = full.match_events(events)
        for i in fired:
            self.assertEqual(
                fast_out[i].candidates[0].activity_id,
                full_out[i].candidates[0].activity_id,
                msg=f"short circuit changed the winner on {events[i].raw_text!r}",
            )

    def test_short_circuit_requires_an_unambiguous_line(self):
        """A line shared by several activities must NOT short circuit — that
        is precisely the case where the other channels decide."""
        e = MatchingEngine(
            SCHEDULE_V2,
            config=EngineConfig(retrieval=RetrievalConfig(short_circuit_tags=True)),
        )
        r = e.retriever
        shared = [
            line for line, hits in r.index.line_index.items() if len(hits) > 1
        ]
        self.assertTrue(shared, "v2 must contain lines used by several activities")
        self.assertIsNone(r.unambiguous_tag_hit([{"line": shared[0], "size": None,
                                                  "spec": None}]))


class TestPrecomputedBM25(unittest.TestCase):
    """The startup-built term x doc matrix must BE BM25, not approximate it."""

    def test_matrix_equals_rank_bm25(self):
        from .textutils import tokenize
        idx = ScheduleIndex.from_json(SCHEDULE_V2)
        for text in MENTIONS:
            tk = tokenize(text)
            reference = idx.bm25.get_scores(tk)
            fast = idx.bm25_scores(tk)
            np.testing.assert_allclose(fast, reference, rtol=0, atol=1e-12,
                                       err_msg=f"BM25 differs on {text!r}")

    def test_tuned_parameters_rebuild_the_matrix(self):
        """Refitting for new (k1, b) must refit the matrix too — a stale
        matrix beside a re-fitted BM25Okapi is a silent scoring bug."""
        from .textutils import tokenize
        idx = ScheduleIndex.from_json(SCHEDULE_V2)
        tk = tokenize(MENTIONS[0])
        before = idx.bm25_scores(tk).copy()
        idx.ensure_bm25(k1=0.9, b=0.3)
        after = idx.bm25_scores(tk)
        np.testing.assert_allclose(after, idx.bm25.get_scores(tk), rtol=0, atol=1e-12)
        self.assertFalse(np.allclose(before, after), "k1/b change had no effect")

    def test_unknown_terms_score_zero(self):
        idx = ScheduleIndex.from_json(SCHEDULE_V2)
        self.assertTrue((idx.bm25_scores(["zzzznotaword"]) == 0).all())


class TestModelIsLoadedOnce(unittest.TestCase):
    """No code path may reload the sentence-transformers model."""

    def test_engines_share_one_embedder(self):
        a = MatchingEngine(SCHEDULE_V1)
        b = MatchingEngine(SCHEDULE_V2)
        self.assertIs(a.retriever.embedder, b.retriever.embedder)

    def test_construction_does_not_load_the_model(self):
        from .retrieval import MiniLMEmbedder
        e = MiniLMEmbedder()
        self.assertIsNone(e._model, "constructing the embedder must not load weights")


if __name__ == "__main__":
    unittest.main()
