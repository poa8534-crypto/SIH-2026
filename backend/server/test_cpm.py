"""The critical-path pass (D-082).

The riskiest code in the delay layer: every float figure, every "beyond float"
day and every criticality claim rests on it. These use hand-built networks
rather than the seeded baseline, so each relationship type, lag, cycle and
dangling tie can be asserted on its own and a failure names the rule it broke.

Dates are inclusive throughout - a one-day activity starts and finishes on the
same day - and durations are calendar days, because nothing in this system
populates a working calendar.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.cpm import compute_schedule, split_slip


class FakeActivity:
    """The four attributes `compute_schedule` reads, and nothing else.

    Deliberately not a `server.db.Activity`: the pass should be testable
    without a database, and stating its interface here documents how small
    that interface is.
    """

    def __init__(self, activity_id, start, finish, predecessors=()):
        self.activity_id = activity_id
        self.planned_start = start
        self.planned_finish = finish
        self._predecessors = list(predecessors)

    def predecessor_links(self):
        return [
            {"activity_id": p, "rel": "FS", "lag_days": 0} if isinstance(p, str)
            else p
            for p in self._predecessors
        ]


D = date


class TestDurationsAndDates:
    def test_a_one_day_activity_is_one_day(self):
        net = compute_schedule([FakeActivity("A", D(2026, 6, 1), D(2026, 6, 1))])
        entry = net.activities["A"]
        assert entry.duration_days == 1
        assert entry.early_start == entry.early_finish == D(2026, 6, 1)

    def test_an_open_start_is_anchored_at_its_planned_start(self):
        """The baseline is an authored schedule and its stated start dates are
        part of what was agreed. A pure logic pass would move them and report
        float nobody planned for."""
        net = compute_schedule([FakeActivity("A", D(2026, 7, 1), D(2026, 7, 5))])
        assert net.activities["A"].early_start == D(2026, 7, 1)


class TestRelationships:
    def test_finish_to_start_puts_the_successor_the_next_day(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5)),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 3), ["A"]),
        ])
        assert net.activities["B"].early_start == D(2026, 6, 6)

    def test_finish_to_start_with_lag(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5)),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 3),
                         [{"activity_id": "A", "rel": "FS", "lag_days": 3}]),
        ])
        assert net.activities["B"].early_start == D(2026, 6, 9)

    def test_start_to_start_with_lag(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 10)),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 4),
                         [{"activity_id": "A", "rel": "SS", "lag_days": 2}]),
        ])
        assert net.activities["B"].early_start == D(2026, 6, 3)

    def test_finish_to_finish_with_lag(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 10)),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 4),
                         [{"activity_id": "A", "rel": "FF", "lag_days": 2}]),
        ])
        # B is 4 days long and cannot finish before 12 June.
        assert net.activities["B"].early_finish == D(2026, 6, 12)
        assert net.activities["B"].early_start == D(2026, 6, 9)

    def test_start_to_finish_with_lag(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 10), D(2026, 6, 20)),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 3),
                         [{"activity_id": "A", "rel": "SF", "lag_days": 1}]),
        ])
        assert net.activities["B"].early_finish == D(2026, 6, 11)

    def test_an_unreadable_relationship_falls_back_to_fs(self):
        """A relationship type we cannot read is a weaker signal than a
        predecessor dropped entirely - the same rule the parser applies."""
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5)),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 3),
                         [{"activity_id": "A", "rel": "XX", "lag_days": 0}]),
        ])
        assert net.activities["B"].early_start == D(2026, 6, 6)


class TestFloatAndCriticality:
    def test_a_chain_with_no_slack_is_all_critical(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5)),
            FakeActivity("B", D(2026, 6, 6), D(2026, 6, 10), ["A"]),
        ])
        assert net.activities["A"].total_float == 0
        assert net.activities["B"].total_float == 0
        assert net.activities["A"].critical
        assert net.project_finish == D(2026, 6, 10)

    def test_a_parallel_branch_carries_the_difference_as_float(self):
        """A and C both feed D. The shorter branch has slack equal to the
        difference, and it is not on the critical path."""
        net = compute_schedule([
            FakeActivity("LONG", D(2026, 6, 1), D(2026, 6, 20)),
            FakeActivity("SHORT", D(2026, 6, 1), D(2026, 6, 10)),
            FakeActivity("END", D(2026, 6, 21), D(2026, 6, 25),
                         ["LONG", "SHORT"]),
        ])
        assert net.activities["LONG"].total_float == 0
        assert net.activities["SHORT"].total_float == 10
        assert not net.activities["SHORT"].critical
        assert net.project_finish == D(2026, 6, 25)


class TestWhatCannotBeComputed:
    def test_a_cycle_is_reported_not_broken(self):
        """Silently publishing a float figure computed from a half-traversed
        graph is worse than saying these could not be scheduled."""
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5), ["B"]),
            FakeActivity("B", D(2026, 6, 1), D(2026, 6, 5), ["A"]),
            FakeActivity("C", D(2026, 6, 1), D(2026, 6, 5)),
        ])
        assert net.unresolved == ("A", "B")
        assert set(net.activities) == {"C"}

    def test_a_dangling_predecessor_is_named(self):
        """A tie to an activity that is not in the schedule means the float
        below it came from an incomplete network."""
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5), ["GHOST"]),
        ])
        assert net.dangling == ("GHOST",)
        assert "A" in net.activities

    def test_an_activity_without_planned_dates_is_skipped(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5)),
            FakeActivity("B", None, None),
        ])
        assert set(net.activities) == {"A"}

    def test_an_empty_schedule_is_not_an_error(self):
        net = compute_schedule([])
        assert net.activities == {}
        assert net.project_finish is None

    def test_float_for_an_unscheduled_activity_is_none(self):
        net = compute_schedule([FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5))])
        assert net.float_for("NOT-THERE") is None
        assert net.float_for(None) is None
        assert net.is_critical("NOT-THERE") is False


class TestAuthoredDatesVersusStatedLogic:
    """A schedule dated by hand and tied up afterwards can state ties its own
    dates break. Both halves are reported and neither is quietly preferred."""

    def test_dates_that_satisfy_the_logic_report_no_conflict(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 5)),
            FakeActivity("B", D(2026, 6, 6), D(2026, 6, 10), ["A"]),
        ])
        assert net.logic_conflicts == ()
        assert net.logic_matches_dates
        assert net.project_finish == net.authored_finish

    def test_a_successor_starting_too_early_is_a_conflict(self):
        net = compute_schedule([
            FakeActivity("A", D(2026, 6, 1), D(2026, 6, 10)),
            FakeActivity("B", D(2026, 6, 3), D(2026, 6, 8), ["A"]),
        ])
        assert net.logic_conflicts == (("B", "A", "FS"),)
        assert not net.logic_matches_dates
        # The logic pushes the finish out past the authored one, which is
        # exactly the discrepancy a reader has to be shown.
        assert net.authored_finish == D(2026, 6, 10)
        assert net.project_finish > net.authored_finish


class TestSplitSlip:
    def test_a_slip_inside_the_float_is_absorbed(self):
        assert split_slip(3, 10) == (3, 0)

    def test_a_slip_past_the_float_is_split(self):
        assert split_slip(6, 4) == (4, 2)

    def test_no_float_means_the_whole_slip_is_beyond_it(self):
        assert split_slip(6, 0) == (0, 6)

    def test_negative_float_credits_no_slack(self):
        assert split_slip(5, -3) == (0, 5)

    def test_unknown_float_credits_no_slack(self):
        """The conservative reading. Crediting slack that was never
        established would understate a real claim."""
        assert split_slip(5, None) == (0, 5)

    def test_no_slip_is_no_delay(self):
        assert split_slip(0, 10) == (0, 0)
        assert split_slip(None, 10) == (0, 0)
        # An activity that finished early is not negative delay.
        assert split_slip(-4, 10) == (0, 0)
