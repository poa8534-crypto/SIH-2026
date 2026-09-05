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
    NO_FORECAST_AWAITING_FINISH_DATE,
    NO_FORECAST_FINISHED,
    NO_FORECAST_NOT_STARTED,
    activity_type,
    comparables,
    forecast,
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


class TestTheForecast:
    """`remaining / rate -> finish -> variance` (D-088). The division is
    trivial; what needs asserting is which rate goes in the denominator, what
    the answer is allowed to claim, and every case where it declines."""

    def _running(self, db, *, uom="m"):
        act = _setup(db, "CIV-SIT-1001", planned_qty=1200, uom=uom,
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 8, 27), actual_qty=800)
        job = _job(db)
        _reading(db, job, act.activity_id, 500, uom, date(2026, 8, 28))
        _reading(db, job, act.activity_id, 300, uom, date(2026, 9, 3))
        db.commit()
        return act

    def test_it_forecasts_from_the_elapsed_rate_and_says_why(self, db_session):
        """The reading a contract argues from, available on far more
        activities than the reported rate, and it errs late."""
        self._running(db_session)

        f = forecast(db_session, "CIV-SIT-1001", AS_OF)["forecast"]
        assert f["basis"] == BASIS_ELAPSED
        # 400 m remaining at 40 m/day = 10 days from the data date.
        assert f["remaining_days"] == 10
        assert f["forecast_finish"] == date(2026, 9, 25)
        assert f["baseline_finish"] == date(2026, 8, 10)
        assert f["variance_days"] == 46
        assert "contract argues from" in f["why"]

    def test_every_usable_rate_produces_a_candidate(self, db_session):
        """A single figure would hide that the same evidence supports a
        range."""
        self._running(db_session)

        d = forecast(db_session, "CIV-SIT-1001", AS_OF)
        by = {c["basis"]: c for c in d["candidates"]}
        assert {BASIS_ELAPSED, BASIS_REPORTED, BASIS_PLANNED} <= set(by)
        # The spread is real: the optimistic reading finishes sooner.
        assert by[BASIS_REPORTED]["forecast_finish"] < by[BASIS_ELAPSED]["forecast_finish"]

    def test_remaining_days_round_up(self, db_session):
        """An activity does not finish a fraction of a day early, and rounding
        down would let a forecast claim a day it has not earned."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=100, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 9, 6), actual_qty=90)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 90, "m", date(2026, 9, 7))
        db_session.commit()

        # 10 m left at 9 m/day = 1.11 days -> 2.
        assert forecast(db_session, act.activity_id, AS_OF)["forecast"]["remaining_days"] == 2

    def test_remaining_follows_percent_complete_not_the_readings(
            self, db_session):
        """`PIP-SPL-1027` on the real corpus reports 71% through an asserted
        percentage and carries no measured quantity. Using the readings for
        remaining would forecast it as though nothing had been built, and
        contradict the progress figure on every other screen."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=14, uom="nos",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 20),
                     actual_start=date(2026, 8, 1), actual_qty=None)
        job = _job(db_session)
        db_session.add(LinkedEvent(
            id=str(uuid.uuid4()), job_id=job.id, activity_id=act.activity_id,
            source_file="dpr.txt", source_span="x", raw_text="x",
            percentage=71.0, reported_date=date(2026, 8, 5), confidence=0.9,
        ))
        db_session.commit()

        d = forecast(db_session, act.activity_id, AS_OF)
        assert d["percent_complete"] == pytest.approx(71.0)
        assert d["counted_qty"] == 0
        # 29% of 14, not 14.
        assert d["remaining_qty"] == pytest.approx(4.06)

    def test_remaining_is_exact_when_a_quantity_was_measured(self, db_session):
        """Going back through a percentage rounded to one decimal turns
        1200 - 800 into 399.6, and a claim document does not want an
        arithmetic artefact in it."""
        self._running(db_session)

        assert forecast(db_session, "CIV-SIT-1001", AS_OF)["remaining_qty"] == 400


class TestItDeclinesToForecast:
    def test_a_finished_activity_is_not_forecast(self, db_session):
        _setup(db_session, "CIV-SIT-1001", planned_qty=100, uom="m",
               planned_start=date(2026, 8, 1), planned_finish=date(2026, 8, 10),
               actual_start=date(2026, 8, 1), actual_finish=date(2026, 8, 12),
               actual_qty=100)
        db_session.commit()

        d = forecast(db_session, "CIV-SIT-1001", AS_OF)
        assert d["forecast"] is None
        assert d["reason"] == NO_FORECAST_FINISHED

    def test_an_activity_that_never_started_is_not_forecast(self, db_session):
        """There is no start to forecast from, and inventing one would be
        forecasting the schedule rather than the work."""
        _setup(db_session, "CIV-SIT-1001", planned_qty=100, uom="m",
               planned_start=date(2026, 8, 1), planned_finish=date(2026, 8, 10))
        db_session.commit()

        d = forecast(db_session, "CIV-SIT-1001", AS_OF)
        assert d["forecast"] is None
        assert d["reason"] == NO_FORECAST_NOT_STARTED

    def test_quantity_complete_with_no_finish_date_awaits_a_planner(
            self, db_session):
        """The roll-up withheld the finish date because no source named one
        (D-015). Forecasting this as still running would contradict the review
        queue it was put in."""
        act = _setup(db_session, "CIV-SIT-1001", planned_qty=100, uom="m",
                     planned_start=date(2026, 8, 1),
                     planned_finish=date(2026, 8, 10),
                     actual_start=date(2026, 8, 1), actual_qty=100)
        job = _job(db_session)
        _reading(db_session, job, act.activity_id, 100, "m", date(2026, 8, 9))
        db_session.commit()

        d = forecast(db_session, act.activity_id, AS_OF)
        assert d["forecast"] is None
        assert d["reason"] == NO_FORECAST_AWAITING_FINISH_DATE

    def test_a_refusal_still_carries_its_evidence(self, db_session):
        """"We cannot say" and "we did not look" are different answers."""
        _setup(db_session, "CIV-SIT-1001", planned_qty=100, uom="m",
               planned_start=date(2026, 8, 1), planned_finish=date(2026, 8, 10))
        db_session.commit()

        d = forecast(db_session, "CIV-SIT-1001", AS_OF)
        assert d["rates"]
        assert d["evidence"]["comparable_activities"] >= 0
        assert "never written to the schedule" in d["forecast_note"]

    def test_an_unknown_activity_is_none(self, db_session):
        assert forecast(db_session, "NOT-AN-ACTIVITY", AS_OF) is None


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
        # The forecast rides on the same response.
        assert body["forecast"]["basis"] == BASIS_ELAPSED
        assert body["forecast"]["variance_days"] == 46
        assert len(body["candidates"]) >= 2
        assert body["evidence"]["measured_quantity"] == 800
        assert "never written to the schedule" in body["forecast_note"]

    def test_an_unknown_activity_is_404(self, client, db_session):
        assert client.get("/activity/NOPE/productivity").status_code == 404
