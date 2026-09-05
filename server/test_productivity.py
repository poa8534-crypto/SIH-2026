"""Three productivity rates, and the refusals that keep them honest.

Phase 2 of the Granularity Resolution Engine (D-087). The rates themselves are
division; what needs asserting is when the module declines to divide:

  * one reported day is not a rate, it is a reading with a denominator of one
  * fewer than three comparables is not an average, it is an anecdote
  * an activity that never started has no window to divide by

and that the two observed rates disagree in the direction they are supposed to,
because that disagreement is the reason all three are reported.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, Job, LinkedEvent
from server.productivity import (
    BASIS_ELAPSED,
    BASIS_PLANNED,
    BASIS_REPORTED,
    MIN_COMPARABLES,
    MIN_REPORTED_DAYS,
    activity_type,
    comparables,
    rates,
)

AS_OF = date(2026, 9, 15)


@pytest.fixture(autouse=True)
def _clean(db_session):
    db_session.query(LinkedEvent).delete()
    db_session.query(Job).delete()
    db_session.commit()
    yield
    db_session.query(LinkedEvent).delete()
    db_session.query(Job).delete()
    db_session.commit()


def _job(db):
    job = Job(id=str(uuid.uuid4()), filename="dpr.txt", file_type="txt",
              status="completed")
    db.add(job)
    db.flush()
    return job


def _reading(db, job, activity_id, quantity, uom, reported_date):
    db.add(LinkedEvent(
        id=str(uuid.uuid4()), job_id=job.id, activity_id=activity_id,
        source_file=job.filename, source_span="x", raw_text="x",
        quantity=quantity, uom=uom, reported_date=reported_date,
        confidence=0.9,
    ))


def _setup(db, activity_id, *, planned_qty, uom, planned_start, planned_finish,
           actual_start=None, actual_finish=None, actual_qty=None):
    act = db.query(Activity).filter(Activity.activity_id == activity_id).first()
    act.planned_qty = planned_qty
    act.uom = uom
    act.planned_start = planned_start
    act.planned_finish = planned_finish
    act.actual_start = actual_start
    act.actual_finish = actual_finish
    act.actual_qty = actual_qty
    return act


def _by_basis(result):
    return {r["basis"]: r for r in result["rates"]}


class TestTheThreeRates:
    def test_the_planned_rate_is_the_schedule_s_own_assumption(self, db_session):
        _setup(db_session, "CIV-SIT-1001", planned_qty=1200, uom="m",
               planned_start=date(2026, 8, 1), planned_finish=date(2026, 8, 10))
        db_session.commit()

        planned = _by_basis(rates(db_session, "CIV-SIT-1001", AS_OF))[BASIS_PLANNED]
        # 1200 m over 10 inclusive days.
        assert planned["value"] == pytest.approx(120.0)
        assert planned["days"] == 10

    def test_the_two_observed_rates_disagree_in_the_expected_direction(
            self, db_session):
        """The whole reason three are reported. 800 m reported on two days,
        20 calendar days after the start: elapsed says 40/day, reported says
        400/day, and the truth is somewhere a planner has to judge."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=1200, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 8, 27), actual_qty=800)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 500, "m", date(2026, 8, 28))
        _reading(db_session, job, act.activity_id, 300, "m", date(2026, 9, 3))
        db_session.commit()

        by = _by_basis(rates(db_session, act.activity_id, AS_OF))
        # 27 Aug .. 15 Sep inclusive = 20 days.
        assert by[BASIS_ELAPSED]["days"] == 20
        assert by[BASIS_ELAPSED]["value"] == pytest.approx(40.0)
        assert by[BASIS_REPORTED]["days"] == 2
        assert by[BASIS_REPORTED]["value"] == pytest.approx(400.0)
        assert by[BASIS_ELAPSED]["value"] < by[BASIS_REPORTED]["value"]

    def test_two_readings_on_one_day_are_one_day(self, db_session):
        """Distinct dates, not distinct readings - counting both would halve
        the rate."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=1200, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 9, 1), actual_qty=800)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 500, "m", date(2026, 9, 2))
        _reading(db_session, job, act.activity_id, 300, "m", date(2026, 9, 2))
        db_session.commit()

        assert rates(db_session, act.activity_id, AS_OF)["reported_days"] == 1


class TestItRefusesToDivideWhenItCannot:
    def test_one_reported_day_is_not_a_rate(self, db_session):
        """`ELE-CBL-1076` on the real corpus: one reading of 800 m. Dividing by
        one reported day gives 800 m/day, which is the reading wearing a
        rate's units - and Phase 3 would forecast off it."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=1200, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 8, 11), actual_qty=800)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 800, "m", date(2026, 8, 11))
        db_session.commit()

        by = _by_basis(rates(db_session, act.activity_id, AS_OF))
        assert by[BASIS_REPORTED]["value"] is None
        assert str(MIN_REPORTED_DAYS) in by[BASIS_REPORTED]["note"]
        # The elapsed rate survives: Actual Start is itself a second point in
        # time, so one reading against it still yields a defensible figure.
        assert by[BASIS_ELAPSED]["value"] is not None

    def test_an_activity_that_never_started_has_no_window(self, db_session):
        _setup(db_session, "CIV-SIT-1001", planned_qty=1200, uom="m",
               planned_start=date(2026, 8, 1), planned_finish=date(2026, 8, 10),
               actual_start=None, actual_qty=None)
        db_session.commit()

        by = _by_basis(rates(db_session, "CIV-SIT-1001", AS_OF))
        assert by[BASIS_ELAPSED]["value"] is None
        assert by[BASIS_ELAPSED]["days"] is None
        # The planned rate is still available - it needs no actuals at all.
        assert by[BASIS_PLANNED]["value"] is not None

    def test_a_finished_activity_measures_to_its_finish_not_the_data_date(
            self, db_session):
        """Otherwise every completed activity would look slower the longer the
        project ran after it."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=100, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 8, 1),
                     actual_finish=date(2026, 8, 10), actual_qty=100)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 100, "m", date(2026, 8, 10))
        db_session.commit()

        by = _by_basis(rates(db_session, act.activity_id, AS_OF))
        assert by[BASIS_ELAPSED]["days"] == 10
        assert by[BASIS_ELAPSED]["value"] == pytest.approx(10.0)

    def test_an_unknown_activity_is_none(self, db_session):
        assert rates(db_session, "NOT-AN-ACTIVITY", AS_OF) is None


class TestComparables:
    def test_the_type_prefix_is_the_first_two_segments(self):
        assert activity_type("PIP-SPL-1025") == "PIP-SPL"
        assert activity_type("SOLO") == "SOLO"
        assert activity_type("") == ""

    def test_fewer_than_three_is_not_an_average(self, db_session):
        """A mean of two is an anecdote with a decimal point."""
        act = db_session.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first()
        # Give exactly one sibling a completed, measured history.
        other = db_session.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1002").first()
        other.actual_start = date(2026, 6, 1)
        other.actual_finish = date(2026, 6, 10)
        other.actual_qty = 1000
        db_session.commit()

        found = comparables(db_session, act)
        assert found["count"] < MIN_COMPARABLES
        assert found["enough"] is False
        assert found["median_qty_per_day"] is None
        assert "needed before an average means anything" in found["note"]

    def test_an_incomplete_sibling_is_not_a_comparable(self, db_session):
        """It has no rate to contribute: a comparable must have finished and
        carry both actual dates and a measured quantity."""
        act = db_session.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first()
        other = db_session.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1002").first()
        other.actual_start = date(2026, 6, 1)
        other.actual_finish = None          # still running
        other.actual_qty = 1000
        db_session.commit()

        assert other.activity_id not in comparables(db_session, act)["members"]

    def test_an_activity_is_not_its_own_comparable(self, db_session):
        act = db_session.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first()
        act.actual_start = date(2026, 6, 1)
        act.actual_finish = date(2026, 6, 10)
        act.actual_qty = 1200
        db_session.commit()

        assert act.activity_id not in comparables(db_session, act)["members"]


class TestTheEndpoint:
    def test_it_returns_all_three_rates(self, client, db_session):
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=1200, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 8, 27), actual_qty=800)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 500, "m", date(2026, 8, 28))
        _reading(db_session, job, act.activity_id, 300, "m", date(2026, 9, 3))
        db_session.commit()

        body = client.get(f"/activity/{act.activity_id}/productivity").json()
        assert {r["basis"] for r in body["rates"]} == {
            BASIS_PLANNED, BASIS_ELAPSED, BASIS_REPORTED}
        assert body["remaining_qty"] == 400
        assert body["counted_qty"] == 800
        # The caveats travel in the payload, not only in the docs.
        assert "calendar days" in body["calendar_basis"]
        assert "none of them is the productivity" in body["basis_note"]

    def test_an_unknown_activity_is_404(self, client, db_session):
        assert client.get("/activity/NOPE/productivity").status_code == 404
