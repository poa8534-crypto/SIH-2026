"""EVM arithmetic, asserted to the decimal against hand-computed fixtures.

ROADMAP §15 Phase 4 done-criterion. Every expected number below is worked out
in the comment beside it, so a future change that moves a figure has to argue
with the arithmetic rather than just re-baseline the assertion.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, Base, LinkedEvent
from server.evm import (
    SOURCE_ACTUAL_FINISH,
    SOURCE_LINKED_EVENT,
    SOURCE_NO_EVIDENCE,
    compute_evm,
    planned_fraction,
    planned_weight,
)

DATA_DATE = date(2026, 9, 15)


@pytest.fixture
def db():
    """An in-memory database — this module tests arithmetic, not persistence."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _activity(db, activity_id, start, finish, *, discipline="civil",
              actual_finish=None):
    act = Activity(
        activity_id=activity_id,
        wbs_path="1.1",
        description=activity_id,
        discipline=discipline,
        planned_start=start,
        planned_finish=finish,
        planned_qty=0,
        uom="",
        predecessors="[]",
        actual_finish=actual_finish,
    )
    db.add(act)
    return act


def _event(db, activity_id, percentage):
    db.add(
        LinkedEvent(
            job_id="j1",
            activity_id=activity_id,
            source_file="f.txt",
            raw_text="x",
            percentage=percentage,
        )
    )


# ── The weight and fraction primitives ──────────────────────────────────────

class TestWeighting:
    def test_weight_is_inclusive_day_count(self, db):
        # 1 Sep .. 10 Sep inclusive = 10 days
        act = _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        assert planned_weight(act) == 10

    def test_single_day_activity_weighs_one(self, db):
        act = _activity(db, "A", date(2026, 9, 1), date(2026, 9, 1))
        assert planned_weight(act) == 1

    def test_missing_dates_weigh_one_not_zero(self, db):
        """It must not vanish silently from the denominator."""
        act = _activity(db, "A", None, None)
        assert planned_weight(act) == 1

    def test_fraction_before_after_and_straddling(self, db):
        wholly_before = _activity(db, "B", date(2026, 8, 1), date(2026, 8, 10))
        wholly_after = _activity(db, "C", date(2026, 10, 1), date(2026, 10, 10))
        # 1 Sep .. 20 Sep = 20 days; by 15 Sep, 15 elapsed -> 15/20 = 0.75
        straddling = _activity(db, "D", date(2026, 9, 1), date(2026, 9, 20))

        assert planned_fraction(wholly_before, DATA_DATE) == 1.0
        assert planned_fraction(wholly_after, DATA_DATE) == 0.0
        assert planned_fraction(straddling, DATA_DATE) == pytest.approx(0.75)


# ── The full computation, hand-checked ──────────────────────────────────────

class TestHandComputedProject:
    """Four activities with arithmetic worked out in the comments.

    A  1-10 Sep  (10 d)  finished        -> PV 10 x 1.00 = 10.0   EV 10 x 1.00 = 10.0
    B  1-20 Sep  (20 d)  event 50%       -> PV 20 x 0.75 = 15.0   EV 20 x 0.50 = 10.0
    C  1-10 Oct  (10 d)  no evidence     -> PV 10 x 0.00 =  0.0   EV 10 x 0.00 =  0.0
    D  1-5  Sep  ( 5 d)  no evidence     -> PV  5 x 1.00 =  5.0   EV  5 x 0.00 =  0.0
                                            ------------------    ------------------
                                            PV            = 30.0  EV            = 20.0
    SV  = 20.0 - 30.0 = -10.0
    SPI = 20.0 / 30.0 = 0.666666...
    total weight = 10 + 20 + 10 + 5 = 45
    """

    @pytest.fixture(autouse=True)
    def _seed(self, db):
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10),
                  actual_finish=date(2026, 9, 9))
        _activity(db, "B", date(2026, 9, 1), date(2026, 9, 20))
        _activity(db, "C", date(2026, 10, 1), date(2026, 10, 10))
        _activity(db, "D", date(2026, 9, 1), date(2026, 9, 5))
        _event(db, "B", 50.0)
        db.commit()

    def test_pv_ev_sv_spi_to_the_decimal(self, db):
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["planned_value"] == pytest.approx(30.0)
        assert p["earned_value"] == pytest.approx(20.0)
        assert p["schedule_variance"] == pytest.approx(-10.0)
        assert p["spi"] == pytest.approx(0.6667, abs=1e-4)
        assert p["total_weight"] == pytest.approx(45.0)
        assert p["activity_count"] == 4

    def test_straddling_activity_contributes_pro_rata_pv(self, db):
        """B alone: 20 days, 15 elapsed of 20 -> 15.0, not 0 and not 20."""
        # Remove everything but B and recompute.
        for aid in ("A", "C", "D"):
            db.delete(db.query(Activity).filter_by(activity_id=aid).one())
        db.commit()
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["planned_value"] == pytest.approx(15.0)

    def test_percent_source_counts_explain_the_ev(self, db):
        counts = compute_evm(db, DATA_DATE)["project"]["percent_source_counts"]
        assert counts[SOURCE_ACTUAL_FINISH] == 1      # A
        assert counts[SOURCE_LINKED_EVENT] == 1       # B
        assert counts[SOURCE_NO_EVIDENCE] == 2        # C and D
        assert sum(counts.values()) == 4

    def test_per_discipline_totals_reconcile_to_the_project(self, db):
        result = compute_evm(db, DATA_DATE)
        buckets = result["by_discipline"].values()
        assert sum(b["planned_value"] for b in buckets) == pytest.approx(
            result["project"]["planned_value"]
        )
        assert sum(b["earned_value"] for b in buckets) == pytest.approx(
            result["project"]["earned_value"]
        )
        assert sum(b["activity_count"] for b in buckets) == result["project"][
            "activity_count"
        ]


# ── The precedence rules ────────────────────────────────────────────────────

class TestPercentPrecedence:
    def test_actual_finish_beats_a_lower_event_percentage(self, db):
        """A finished activity is 100% even if its last report said 40%."""
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10),
                  actual_finish=date(2026, 9, 9))
        _event(db, "A", 40.0)
        db.commit()
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["earned_value"] == pytest.approx(10.0)   # 10 x 100%, not 10 x 40%
        assert p["percent_source_counts"][SOURCE_ACTUAL_FINISH] == 1

    def test_highest_event_percentage_wins(self, db):
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        _event(db, "A", 30.0)
        _event(db, "A", 70.0)
        _event(db, "A", 50.0)
        db.commit()
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["earned_value"] == pytest.approx(7.0)    # 10 x 70%

    def test_no_events_is_zero_and_counted_as_a_floor(self, db):
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        db.commit()
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["earned_value"] == 0.0
        assert p["percent_source_counts"][SOURCE_NO_EVIDENCE] == 1


class TestZeroPlannedValue:
    def test_spi_is_none_not_zero_and_never_raises(self, db):
        """Everything scheduled after the data date: PV = 0.

        SPI must be None. `0.0` would read as "measured and catastrophic" when
        the truth is "nothing was due to have happened yet".
        """
        _activity(db, "A", date(2026, 10, 1), date(2026, 10, 10))
        db.commit()
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["planned_value"] == 0.0
        assert p["spi"] is None
        assert p["spi"] is not 0.0  # noqa: F632 — the point is it is not a zero

    def test_empty_schedule_does_not_raise(self, db):
        p = compute_evm(db, DATA_DATE)["project"]
        assert p["spi"] is None
        assert p["activity_count"] == 0


# ── The cost half is absent, and says so ────────────────────────────────────

class TestCostMetricsAbsent:
    def test_no_cost_key_appears_anywhere(self, db):
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        db.commit()
        result = compute_evm(db, DATA_DATE)

        forbidden = {
            "actual_cost", "ac", "cost_variance", "cv", "cpi", "eac", "vac",
            "tcpi", "budget", "bac",
        }
        seen = set(result["project"]) | set(result)
        for bucket in result["by_discipline"].values():
            seen |= set(bucket)
        assert not (seen & forbidden), seen & forbidden

    def test_absence_is_stated_with_a_reason(self, db):
        result = compute_evm(db, DATA_DATE)
        assert result["cost_metrics_available"] is False
        assert "cost" in result["cost_metrics_reason"].lower()
        assert len(result["cost_metrics_reason"]) > 40

    def test_response_declares_its_weighting_and_precedence(self, db):
        result = compute_evm(db, DATA_DATE)
        assert result["weighting"] == "planned_duration_days"
        assert len(result["percent_complete_precedence"]) == 3
        assert result["data_date"] == "2026-09-15"


class TestEvidenceCoverage:
    """The guard that stops a coverage artefact being read as performance."""

    def test_low_coverage_marks_the_headline_unsafe_with_a_reason(self, db):
        # One evidenced activity, three silent ones -> coverage well under 60%.
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        _event(db, "A", 50.0)
        for aid in ("B", "C", "D"):
            _activity(db, aid, date(2026, 9, 1), date(2026, 9, 10))
        db.commit()

        r = compute_evm(db, DATA_DATE)
        assert r["spi_headline_safe"] is False
        assert r["spi_headline_reason"]
        assert "coverage" in r["spi_headline_reason"].lower()
        assert r["evidence_coverage"]["activities_with_evidence"] == 1
        assert r["evidence_coverage"]["activities_total"] == 4
        assert r["evidence_coverage"]["fraction"] == pytest.approx(0.25)

    def test_full_coverage_marks_the_headline_safe(self, db):
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        _event(db, "A", 50.0)
        db.commit()
        r = compute_evm(db, DATA_DATE)
        assert r["spi_headline_safe"] is True
        assert r["spi_headline_reason"] is None

    def test_evidenced_subset_excludes_the_floor_activities(self, db):
        """A alone: 10 days, all elapsed, 50% -> PV 10, EV 5, SPI 0.5.

        The whole-project SPI is dragged to 0.125 by three silent activities;
        the evidenced subset is the number that means something.
        """
        _activity(db, "A", date(2026, 9, 1), date(2026, 9, 10))
        _event(db, "A", 50.0)
        for aid in ("B", "C", "D"):
            _activity(db, aid, date(2026, 9, 1), date(2026, 9, 10))
        db.commit()

        r = compute_evm(db, DATA_DATE)
        sub = r["evidenced_subset"]
        assert sub["activity_count"] == 1
        assert sub["planned_value"] == pytest.approx(10.0)
        assert sub["earned_value"] == pytest.approx(5.0)
        assert sub["spi"] == pytest.approx(0.5)
        # And the whole-project figure is the misleading one it protects against.
        assert r["project"]["spi"] == pytest.approx(0.125)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
