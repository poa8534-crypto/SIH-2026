"""Unit tests for the matching engine.

Run with: python -m pytest matching/test_matching.py -v
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

import pytest

from extraction.models import (
    DateBasis,
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    Provenance,
)
from matching.models import (
    Decision,
    LinkCandidate,
    LinkDecision,
    FeatureVector,
    Thresholds,
)
from matching.textutils import parse_tag, tokenize, normalize_uom, extract_size_mentions
from matching.schedule_index import ScheduleIndex
from matching.features import final_score
from matching.engine import MatchingEngine, RollupAccumulator, decide_outcome
from matching.retrieval import HybridRetriever, _hashed_embeddings

DATASET = PROJECT_ROOT / "dataset"
SCHEDULE = DATASET / "baseline_schedule.json"


def make_event(
    raw_text: str,
    tags=None,
    reported: date | None = None,
    discipline=Discipline.UNKNOWN,
    status=EventStatus.UNKNOWN,
    quantity=None,
    uom=None,
    percentage=None,
    reported_basis=DateBasis.EXPLICIT,
    asserted_start: date | None = None,
    asserted_finish: date | None = None,
    start_basis=DateBasis.EXPLICIT,
    finish_basis=DateBasis.EXPLICIT,
):
    return ExtractedEvent(
        raw_text=raw_text,
        tags=tags or [],
        reported_date=reported,
        reported_date_basis=reported_basis if reported else None,
        asserted_start=asserted_start,
        asserted_start_basis=start_basis if asserted_start else None,
        asserted_finish=asserted_finish,
        asserted_finish_basis=finish_basis if asserted_finish else None,
        discipline=discipline,
        status=status,
        quantity=quantity,
        uom=uom,
        percentage=percentage,
        provenance=Provenance(
            source_file="test.txt",
            source_span=raw_text,
            method=ExtractionMethod.PREPASS,
        ),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Text utilities
# ══════════════════════════════════════════════════════════════════════════════

class TestTagParsing:
    def test_full_pipe_tag(self):
        k = parse_tag('24"-P-1001-A1A')
        assert k == {"size": 24, "line": "p-1001", "spec": "a1a"}

    def test_bare_line_number(self):
        k = parse_tag("P-1001")
        assert k == {"size": None, "line": "p-1001", "spec": None}

    def test_equipment_tag(self):
        k = parse_tag("TK-1")
        assert k["line"] == "tk-1"

    def test_size_mentions(self):
        assert extract_size_mentions('12 inch P-1002') == {12}
        assert extract_size_mentions('24" main header') == {24}


class TestTokenize:
    def test_keeps_tag_tokens(self):
        assert "p-1001" in tokenize('Spool erection 24"-P-1001')

    def test_synonym_expansion(self):
        assert "fabrication" in tokenize("spool fab — 12 spools completed")

    def test_uom_normalisation(self):
        assert normalize_uom("MTR") == "m"
        assert normalize_uom("nos") == "nos"


# ══════════════════════════════════════════════════════════════════════════════
# Schedule index
# ══════════════════════════════════════════════════════════════════════════════

class TestScheduleIndex:
    @pytest.fixture(scope="class")
    def index(self):
        return ScheduleIndex.from_json(SCHEDULE)

    def test_loaded(self, index):
        assert len(index.records) == 120

    def test_tag_extraction_from_description(self, index):
        rec = index.by_id["PIP-ERC-1030"]
        assert any(t["line"] == "p-1001" and t["size"] == 24 for t in rec.tag_keys)

    def test_line_index(self, index):
        assert len(index.line_index["p-1001"]) >= 4  # fab/erect/flange/hydro/insul

    def test_resolve_short_gold_id(self, index):
        assert index.resolve_id("PIP-1024") == "PIP-RCK-1024"
        assert index.resolve_id("CIV-FDN-1007") == "CIV-FDN-1007"
        assert index.resolve_id("NO_MATCH") is None
        assert index.resolve_id("ZZZ-9999") is None


# ══════════════════════════════════════════════════════════════════════════════
# Retrieval
# ══════════════════════════════════════════════════════════════════════════════

class TestRetrieval:
    @pytest.fixture(scope="class")
    def retriever(self):
        index = ScheduleIndex.from_json(SCHEDULE)
        return HybridRetriever(index)

    def test_tag_channel_finds_line(self, retriever):
        hits = retriever.tag_channel([parse_tag("P-1001")], {24})
        ids = [retriever.index.records[i].activity_id for i, _ in hits]
        assert "PIP-ERC-1030" in ids
        assert "PIP-SPL-1025" in ids

    def test_rrf_fusion_topk(self, retriever):
        cand_ids, info = retriever.retrieve(
            '24 inch main header P-1001 spool erection', ['P-1001']
        )
        assert 1 <= len(cand_ids) <= 20
        top_rec = retriever.index.records[cand_ids[0]]
        assert top_rec.line_keys  # tag-anchored text puts a tagged activity on top

    def test_hashed_embedding_fallback(self):
        v = _hashed_embeddings(["spool erection", "spool erection"], dim=64)
        assert v.shape == (2, 64)
        assert abs(float(v[0] @ v[1]) - 1.0) < 1e-5  # identical → cosine 1


# ══════════════════════════════════════════════════════════════════════════════
# Features
# ══════════════════════════════════════════════════════════════════════════════

class TestFeatures:
    @pytest.fixture(scope="class")
    def index(self):
        return ScheduleIndex.from_json(SCHEDULE)

    def test_size_mismatch_penalised(self, index):
        ev = make_event('insulation on 12 inch P-1015', tags=["P-1015"])
        rec = index.by_id["PIP-HYT-1044"]  # Hydrotest — 6"-P-1015-A1A
        from matching.features import _tag_overlap
        score, _ = _tag_overlap(ev, rec, ev.raw_text)
        assert score <= 0.5  # 12" text vs 6" line → hard conflict

    def test_size_match_locked(self, index):
        ev = make_event('24 inch main header P-1001 spool erection', tags=["P-1001"])
        rec = index.by_id["PIP-ERC-1030"]  # 24"-P-1001-A1A
        from matching.features import _tag_overlap
        score, locked = _tag_overlap(ev, rec, ev.raw_text)
        assert score >= 0.9 and locked

    def test_date_proximity_window(self, index):
        from matching.features import _date_proximity
        rec = index.by_id["CIV-FDN-1007"]
        assert _date_proximity(rec, date(2026, 7, 8)) == 1.0  # inside window
        far = _date_proximity(rec, date(2026, 10, 30))
        assert far is not None and far < 0.3

    def test_predecessor_startability(self, index):
        from matching.features import _predecessor_plausibility
        rec = index.by_id["CIV-SIT-1002"]  # predecessor: CIV-SIT-1001 (June)
        assert _predecessor_plausibility(index, rec, date(2026, 8, 20)) == 1.0
        # Reporting before the predecessor finishes → not startable
        assert _predecessor_plausibility(index, rec, date(2026, 5, 15)) <= 0.5


# ══════════════════════════════════════════════════════════════════════════════
# Decision logic
# ══════════════════════════════════════════════════════════════════════════════

def _cand(score, disc=1.0):
    fv = FeatureVector(discipline_agreement=disc)
    fv.tag_overlap = 1.0
    return LinkCandidate(activity_id="A", features=fv, final_score=score)


class TestDecision:
    T = Thresholds(tau_high=0.8, tau_low=0.45, margin_min=0.06)

    def test_auto_link(self):
        outcome, chosen, _, _ = decide_outcome([_cand(0.9), _cand(0.5)], self.T)
        assert outcome is Decision.AUTO_LINK and chosen == "A"

    def test_review_on_small_margin(self):
        outcome, _, _, why = decide_outcome([_cand(0.9), _cand(0.88)], self.T)
        assert outcome is Decision.REVIEW
        assert "margin_too_small" in why

    def test_new_activity_below_tau_low(self):
        outcome, chosen, _, _ = decide_outcome([_cand(0.3)], self.T)
        assert outcome is Decision.NEW_ACTIVITY and chosen is None

    def test_discipline_conflict_never_auto(self):
        outcome, _, _, why = decide_outcome(
            [_cand(0.9, disc=0.0), _cand(0.5)], self.T
        )
        assert outcome is Decision.REVIEW
        assert "discipline_conflict" in why


# ══════════════════════════════════════════════════════════════════════════════
# End-to-end engine (uses the real MiniLM model, cached offline)
# ══════════════════════════════════════════════════════════════════════════════

class TestEngineEndToEnd:
    @pytest.fixture(scope="class")
    def engine(self):
        return MatchingEngine(SCHEDULE)

    def test_tagged_erection_match(self, engine):
        ev = make_event(
            '24 inch main header P-1001 spool erection',
            tags=["P-1001"],
            reported=date(2026, 8, 3),
            discipline=Discipline.PIPING,
            status=EventStatus.IN_PROGRESS,
        )
        d = engine.match_event(ev)
        assert d.top1 is not None
        assert d.top1.activity_id == "PIP-ERC-1030"

    def test_hard_negative_size_mismatch_not_auto(self, engine):
        # Ground truth says NO_MATCH: the field says 12" but P-1015 is a 6" line
        ev = make_event(
            'insulation on 12 inch P-1015',
            tags=["P-1015"],
            reported=date(2026, 8, 20),
            discipline=Discipline.PIPING,
        )
        d = engine.match_event(ev)
        assert d.outcome is not Decision.AUTO_LINK

    def test_untagged_description_match(self, engine):
        ev = make_event(
            'Foundation concreting for pipe rack pedestals P7 to P12',
            reported=date(2026, 8, 3),
            discipline=Discipline.CIVIL,
            status=EventStatus.IN_PROGRESS,
        )
        d = engine.match_event(ev)
        assert d.top1 is not None
        assert d.top1.activity_id == "CIV-FDN-1007"


# ══════════════════════════════════════════════════════════════════════════════
# Granularity: rollup
# ══════════════════════════════════════════════════════════════════════════════

class TestRollup:
    @pytest.fixture(scope="class")
    def engine(self):
        return MatchingEngine(SCHEDULE)

    def _auto(self, aid, text):
        fv = FeatureVector(tag_overlap=1.0)
        return LinkDecision(
            event_index=0, raw_text=text, source_file="t.txt",
            outcome=Decision.AUTO_LINK, chosen_activity_id=aid,
            candidates=[LinkCandidate(activity_id=aid, features=fv, final_score=0.9)],
        )

    def test_quantity_based_percent(self, engine):
        # Spec example pattern: quantity-based percent complete
        acc = RollupAccumulator(engine)
        ev = make_event("graded 400 m2", quantity=400, uom="m2",
                        reported=date(2026, 6, 3))
        acc.add(self._auto("CIV-SIT-1001", "graded 400 m2"), ev)  # planned 1200 m2
        r = acc.results()[0]
        assert r.percent_complete == 33.3  # 400/1200
        assert r.actual_start == date(2026, 6, 3)
        assert r.actual_finish is None  # NOT complete → no Actual Finish

    def test_actual_finish_only_when_complete(self, engine):
        acc = RollupAccumulator(engine)
        for qty, day in [(600, 3), (600, 6)]:
            ev = make_event("graded", quantity=qty, uom="m2",
                            reported=date(2026, 6, day))
            acc.add(self._auto("CIV-SIT-1001", "graded"), ev)
        r = acc.results()[0]
        assert r.installed_qty == 1200 and r.is_complete
        assert r.actual_finish == date(2026, 6, 6)

    def test_many_to_one_rollup(self, engine):
        acc = RollupAccumulator(engine)
        for i, text in enumerate(["spool erected", "another spool erected"]):
            ev = make_event(text, quantity=6, uom="nos",
                            reported=date(2026, 8, 3 + i))
            acc.add(self._auto("PIP-SPL-1025", text), ev)
        r = [x for x in acc.results() if x.activity_id == "PIP-SPL-1025"][0]
        assert r.n_events == 2 and r.installed_qty == 12

    def test_review_never_writes_progress(self, engine):
        acc = RollupAccumulator(engine)
        d = self._auto("PIP-SPL-1025", "x")
        d.outcome = Decision.REVIEW
        acc.add(d, make_event("x", quantity=6, uom="nos"))
        assert acc.results() == []


# ══════════════════════════════════════════════════════════════════════════════
# Date basis: an inferred date is not an asserted one
# ══════════════════════════════════════════════════════════════════════════════

class TestDefaultedFinishDates:
    """A finish date nobody asserted must not reach the schedule.

    A DPR line that says work is done but never says when is handed the report
    header's own date to carry the claim. Writing that stamps every completion
    in a report with the day the report was typed - eleven activities sharing
    one Actual Finish, two of them with zero duration.
    """

    @pytest.fixture(scope="class")
    def engine(self):
        return MatchingEngine(SCHEDULE)

    def _auto(self, aid, text="x"):
        fv = FeatureVector(tag_overlap=1.0)
        return LinkDecision(
            event_index=0, raw_text=text, source_file="dpr_day_10.txt",
            outcome=Decision.AUTO_LINK, chosen_activity_id=aid,
            candidates=[LinkCandidate(activity_id=aid, features=fv, final_score=0.9)],
        )

    def _complete_zone_a(self, acc, **event_kwargs):
        """Roll 1200 m2 - the full planned quantity of CIV-SIT-1001."""
        acc.add(self._auto("CIV-SIT-1001"),
                make_event("graded", quantity=1200, uom="m2", **event_kwargs))
        return [r for r in acc.results() if r.activity_id == "CIV-SIT-1001"][0]

    def test_defaulted_finish_assertion_is_not_written(self, engine):
        r = self._complete_zone_a(
            RollupAccumulator(engine),
            reported=date(2026, 9, 15),
            reported_basis=DateBasis.DEFAULTED_TO_REPORT_DATE,
            asserted_finish=date(2026, 9, 15),
            finish_basis=DateBasis.DEFAULTED_TO_REPORT_DATE,
        )
        assert r.is_complete and r.percent_complete == 100.0
        assert r.actual_finish is None, "a defaulted finish date reached the schedule"
        assert r.withheld_finish == date(2026, 9, 15)
        assert r.review_reasons and "defaulted to" in r.review_reasons[0]

    def test_defaulted_report_date_is_not_written_as_a_finish(self, engine):
        """The other half of the same defect: no finish claim at all, and the
        bare report date standing in for one."""
        r = self._complete_zone_a(
            RollupAccumulator(engine),
            reported=date(2026, 9, 15),
            reported_basis=DateBasis.DEFAULTED_TO_REPORT_DATE,
        )
        assert r.is_complete
        assert r.actual_finish is None
        assert r.withheld_finish == date(2026, 9, 15)
        assert r.withheld_finish_assertions, "no evidence carried to the planner"

    def test_asserted_finish_keeps_its_behaviour(self, engine):
        r = self._complete_zone_a(
            RollupAccumulator(engine),
            reported=date(2026, 6, 3),
            asserted_finish=date(2026, 6, 6),
            finish_basis=DateBasis.EXPLICIT,
        )
        assert r.actual_finish == date(2026, 6, 6)
        assert r.actual_finish_basis is DateBasis.EXPLICIT
        assert r.withheld_finish is None and not r.review_reasons

    def test_relative_resolved_finish_is_written(self, engine):
        """'completed yesterday' names a day. It is resolved, not defaulted."""
        r = self._complete_zone_a(
            RollupAccumulator(engine),
            reported=date(2026, 6, 6),
            asserted_finish=date(2026, 6, 5),
            finish_basis=DateBasis.RELATIVE_RESOLVED,
        )
        assert r.actual_finish == date(2026, 6, 5)
        assert r.actual_finish_basis is DateBasis.RELATIVE_RESOLVED

    def test_no_zero_duration_from_two_defaulted_dates(self, engine):
        """PIP-FLG-1036 and PIP-FLG-1038: a single mention in the last DPR,
        start and finish both stamped with the report's own date."""
        r = self._complete_zone_a(
            RollupAccumulator(engine),
            reported=date(2026, 9, 15),
            reported_basis=DateBasis.DEFAULTED_TO_REPORT_DATE,
            asserted_start=date(2026, 9, 15),
            start_basis=DateBasis.DEFAULTED_TO_REPORT_DATE,
            asserted_finish=date(2026, 9, 15),
            finish_basis=DateBasis.DEFAULTED_TO_REPORT_DATE,
        )
        assert not (r.actual_start and r.actual_finish and r.actual_start == r.actual_finish)
        assert r.actual_start == date(2026, 9, 15)
        assert r.actual_start_basis is DateBasis.DEFAULTED_TO_REPORT_DATE
        assert r.actual_finish is None

    def test_dated_mention_still_dates_the_finish(self, engine):
        """A line that carried its own date, with no completion verb, still
        closes the node when the quantity does. Only the report header's date
        is refused."""
        acc = RollupAccumulator(engine)
        for qty, day in [(600, 3), (600, 6)]:
            acc.add(self._auto("CIV-SIT-1001"),
                    make_event("graded", quantity=qty, uom="m2",
                               reported=date(2026, 6, day),
                               reported_basis=DateBasis.EXPLICIT))
        r = [x for x in acc.results() if x.activity_id == "CIV-SIT-1001"][0]
        assert r.actual_finish == date(2026, 6, 6)
        assert r.actual_finish_basis is DateBasis.EXPLICIT


class TestZeroPlannedQuantity:
    """planned_qty == 0 is a MISSING planned quantity on a node measured in a
    unit, not a zero one. PIP-PCD-1053 reported '0/0 nos, 100.0%'."""

    @pytest.fixture(scope="class")
    def engine(self):
        return MatchingEngine(SCHEDULE)

    def _auto(self, aid, text="x"):
        fv = FeatureVector(tag_overlap=1.0)
        return LinkDecision(
            event_index=0, raw_text=text, source_file="t.txt",
            outcome=Decision.AUTO_LINK, chosen_activity_id=aid,
            candidates=[LinkCandidate(activity_id=aid, features=fv, final_score=0.9)],
        )

    def _rollup(self, engine, event):
        acc = RollupAccumulator(engine)
        acc.add(self._auto("PIP-PCD-1053"), event)          # planned 0 nos
        return acc.results()[0]

    def test_completion_claim_yields_no_percentage(self, engine):
        r = self._rollup(engine, make_event(
            "P&ID punch list close-out", status=EventStatus.COMPLETED,
            reported=date(2026, 9, 2),
        ))
        assert r.planned_qty == 0
        assert r.percent_complete == 0.0, "0/0 reported as a percentage"
        assert not r.is_complete
        assert r.actual_finish is None

    def test_quantity_yields_no_percentage(self, engine):
        r = self._rollup(engine, make_event(
            "12 punch items closed", quantity=12, uom="nos",
            reported=date(2026, 9, 2),
        ))
        assert r.installed_qty == 0.0
        assert r.percent_complete == 0.0
        assert any("no planned quantity" in n for n in r.notes)

    def test_source_asserted_percentage_still_counts(self, engine):
        """A percentage the source stated is evidence in its own right; only a
        percentage DERIVED from a missing planned quantity is refused."""
        r = self._rollup(engine, make_event(
            "punch list 100% closed", percentage=100.0,
            reported=date(2026, 9, 2),
        ))
        assert r.percent_complete == 100.0 and r.is_complete


class TestMilestoneNode:
    """A node with no planned quantity AND no unit of measure is a milestone:
    a completion claim is the only evidence it will ever have."""

    def test_milestone_completes_on_a_completion_claim(self, tmp_path):
        schedule = tmp_path / "milestones.json"
        schedule.write_text(json.dumps([{
            "activity_id": "MIL-RFC-9001",
            "wbs_path": "1.9.9.1",
            "description": "Ready for Commissioning certificate issued",
            "detail": "Milestone - no measurable quantity",
            "discipline": "piping",
            "planned_start": "2026-09-20",
            "planned_finish": "2026-09-20",
            "planned_qty": 0,
            "uom": "",
            "predecessors": [],
            "tag": None,
        }]), encoding="utf-8")
        engine = MatchingEngine(schedule)
        fv = FeatureVector(tag_overlap=1.0)
        acc = RollupAccumulator(engine)
        acc.add(
            LinkDecision(
                event_index=0, raw_text="RFC issued", source_file="t.txt",
                outcome=Decision.AUTO_LINK, chosen_activity_id="MIL-RFC-9001",
                candidates=[LinkCandidate(
                    activity_id="MIL-RFC-9001", features=fv, final_score=0.9)],
            ),
            make_event("RFC issued", status=EventStatus.COMPLETED,
                       reported=date(2026, 9, 20),
                       asserted_finish=date(2026, 9, 20)),
        )
        r = acc.results()[0]
        assert r.percent_complete == 100.0 and r.is_complete
        assert r.actual_finish == date(2026, 9, 20)


