"""Productivity: how fast the work actually went, said three ways.

Phase 2 of the Granularity Resolution Engine. D-085's ledger says how much of
an activity is built and which readings built it. This says how fast, which is
what a forecast needs and what nothing in NAVIS could previously answer for a
single activity.

THERE IS NO SINGLE HONEST NUMBER FOR PRODUCTIVITY
-------------------------------------------------
Divide installed quantity by elapsed calendar days since Actual Start and a
sparsely reported activity looks catastrophic: on the seeded corpus
`PIP-RCK-1024` comes out at 0.12 MT/day, which forecasts nearly a year of
remaining work. That figure is a statement about how often somebody wrote a
report, not about the crew.

Divide instead by the days on which work was actually reported and the bias
inverts: the idle fortnight vanishes and the rate flatters.

So three rates are returned and none is called *the* productivity:

    planned            planned_qty / planned duration
                       what the schedule assumed. Always available.
    observed_elapsed   counted qty / days since Actual Start
                       includes every day nobody reported. The pessimistic
                       reading, and the one a contract argues from.
    observed_reported  counted qty / distinct dates carrying a counted
                       reading. Excludes idle days. The optimistic reading,
                       and the one a foreman recognises.

Every rate carries the sample it was computed from, because a rate over two
readings and a rate over twenty are different kinds of claim and only one of
them is a trend.

CALENDAR DAYS, STATED RATHER THAN ASSUMED
-----------------------------------------
`Activity.calendar` exists on the model and nothing populates it, so every
denominator here is calendar days - the same convention and the same admission
the critical-path pass makes (D-082). A five-day working week would produce
different figures.

COMPARABLES
-----------
Completed, quantified activities sharing an activity-type prefix - the
grouping `_compute_duration_distribution` already uses, `PIP-SPL` from
`PIP-SPL-1025`. Fewer than `MIN_COMPARABLES` of them is reported as "not
enough comparable work" rather than averaged: a mean of two is an anecdote
with a decimal point.

On the seeded corpus this is thin, and honestly so. D-086 stopped the roll-up
synthesising a quantity from an asserted percentage, which left 38 of 120
activities with a MEASURED quantity and 24 of those complete. Only two type
prefixes clear the bar - `CIV-FDN` with four and `CIV-PLY` with three. That is
a fact about the corpus, not a fault in the rule: a wider one would populate
it, and inventing an average from one comparable would not.

WHAT FEEDS THIS
---------------
Only measured quantities. D-086 stopped the roll-up back-deriving a quantity
from an asserted percentage, so `Activity.actual_qty` is now a measurement or
NULL, and dividing it by time yields a rate rather than a fiction wearing
measured units. The per-reading detail comes from `quantity_ledger.ledger`,
which is itself derived from the roll-up's own classifier - so this module
adds no fourth opinion about which readings count.
"""

from __future__ import annotations

import statistics
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from server.db import Activity
from server.quantity_ledger import ledger

#: A rate needs at least two points in time. One reported day yields the whole
#: reading divided by one - on `ELE-CBL-1076` that is 800 m/day, which is not a
#: production rate but a single reading wearing one's units. `observed_elapsed`
#: is exempt because Actual Start is itself a second point in time.
MIN_REPORTED_DAYS = 2

#: Below this many completed comparable activities, no average is offered.
#: Three is not a statistical threshold - it is the point below which a mean
#: is obviously an anecdote, and saying so is more useful than a number.
MIN_COMPARABLES = 3

#: How the denominator was chosen, carried on every rate so a reader never has
#: to infer which of the three they are looking at.
BASIS_PLANNED = "planned"
BASIS_ELAPSED = "observed_elapsed"
BASIS_REPORTED = "observed_reported"
BASIS_COMPARABLE = "comparable_activities"


def activity_type(activity_id: str) -> str:
    """`PIP-SPL` from `PIP-SPL-1025`. The grouping the schedule already uses."""
    parts = (activity_id or "").split("-")
    return "-".join(parts[:2]) if len(parts) >= 2 else (parts[0] if parts else "")


def _rate(
    quantity: Optional[float],
    days: Optional[int],
    basis: str,
    *,
    sample: int,
    note: str,
) -> dict:
    """One rate, or an honest absence of one.

    `value` is None whenever the inputs cannot produce a rate, and `note` says
    why. A zero would read as "measured, and nothing happened", which is a
    different claim from "not enough to measure".
    """
    value = None
    if quantity is not None and days is not None and days > 0 and quantity > 0:
        value = round(quantity / days, 3)
    return {
        "basis": basis,
        "value": value,
        "days": days,
        "quantity": quantity,
        "sample_size": sample,
        "note": note,
    }


def _window(activity: Activity, as_of: date) -> Optional[int]:
    """Calendar days the activity has been open, inclusive of both ends.

    Runs to Actual Finish when it has one and to the data date otherwise. None
    when the activity never started, because there is no window to divide by.
    """
    if not activity.actual_start:
        return None
    end = activity.actual_finish or as_of
    if end < activity.actual_start:
        return None
    return (end - activity.actual_start).days + 1


def comparables(db: Session, activity: Activity) -> dict:
    """Completed, quantified activities of the same type, and their rate.

    A comparable must have finished, have both actual dates and a measured
    quantity - otherwise it has no rate to contribute. Below `MIN_COMPARABLES`
    the answer is that there is not enough comparable work, not a mean.
    """
    prefix = activity_type(activity.activity_id)
    rates: list[float] = []
    members: list[str] = []

    for other in db.query(Activity).filter(Activity.activity_id != activity.activity_id):
        if activity_type(other.activity_id) != prefix:
            continue
        if not (other.actual_start and other.actual_finish and other.actual_qty):
            continue
        days = (other.actual_finish - other.actual_start).days + 1
        if days <= 0 or other.actual_qty <= 0:
            continue
        rates.append(other.actual_qty / days)
        members.append(other.activity_id)

    enough = len(rates) >= MIN_COMPARABLES
    return {
        "activity_type": prefix,
        "count": len(rates),
        "members": sorted(members),
        "median_qty_per_day": round(statistics.median(rates), 3) if enough else None,
        "mean_qty_per_day": round(statistics.mean(rates), 3) if enough else None,
        "enough": enough,
        "note": (
            f"{len(rates)} completed {prefix} activities carry both actual "
            f"dates and a measured quantity."
            if enough else
            f"Only {len(rates)} completed {prefix} activities carry both "
            f"actual dates and a measured quantity; {MIN_COMPARABLES} are "
            f"needed before an average means anything."
        ),
    }


def rates(db: Session, activity_id: str, as_of: date) -> Optional[dict]:
    """The three rates for one activity, plus its comparables.

    Returns None when the activity does not exist, so a caller can 404 rather
    than present rates for a node that was never in the schedule.
    """
    activity = (
        db.query(Activity).filter(Activity.activity_id == activity_id).first()
    )
    if activity is None:
        return None

    book = ledger(db, activity_id)
    counted = [c for c in book["contributions"] if c["counted"]]
    counted_total = book["counted_total"]
    # Distinct DATES, not distinct readings: two lines written on the same day
    # are one day of work, and counting them twice would halve the rate.
    reported_days = len({c["reported_date"] for c in counted if c["reported_date"]})

    planned_days = None
    if activity.planned_start and activity.planned_finish:
        planned_days = max(1, (activity.planned_finish - activity.planned_start).days + 1)
    elapsed_days = _window(activity, as_of)

    planned = _rate(
        float(activity.planned_qty or 0) or None,
        planned_days,
        BASIS_PLANNED,
        sample=1 if planned_days else 0,
        note="planned quantity over the planned duration, in calendar days",
    )
    observed_elapsed = _rate(
        counted_total or None,
        elapsed_days,
        BASIS_ELAPSED,
        sample=len(counted),
        note=(
            "measured quantity over every calendar day since Actual Start, "
            "including days nobody reported. The pessimistic reading: a "
            "sparsely reported activity looks slow here because of the "
            "reporting, not the crew."
        ),
    )
    enough_days = reported_days >= MIN_REPORTED_DAYS
    observed_reported = _rate(
        counted_total or None if enough_days else None,
        reported_days if enough_days else None,
        BASIS_REPORTED,
        sample=len(counted),
        note=(
            "measured quantity over the distinct days a reading was recorded, "
            "excluding idle days. The optimistic reading: it says how fast "
            "work went while it was going, not how fast the activity is "
            "progressing."
            if enough_days else
            f"needs readings on at least {MIN_REPORTED_DAYS} distinct days; "
            f"this activity has {reported_days}. One reported day would divide "
            f"the whole reading by one and call the result a rate."
        ),
    )

    return {
        "activity_id": activity.activity_id,
        "description": activity.description,
        "discipline": activity.discipline,
        "uom": activity.uom,
        "planned_qty": float(activity.planned_qty or 0),
        "counted_qty": counted_total,
        "remaining_qty": round(max(0.0, float(activity.planned_qty or 0) - counted_total), 4),
        "actual_start": activity.actual_start,
        "actual_finish": activity.actual_finish,
        "as_of": as_of,
        "reported_days": reported_days,
        "rates": [planned, observed_elapsed, observed_reported],
        "comparables": comparables(db, activity),
        "calendar_basis": "calendar days; no working calendar is applied",
        "basis_note": (
            "Three rates, and none of them is the productivity. The elapsed "
            "reading is punished by reporting gaps and the reported reading "
            "ignores them; the planned rate is what the schedule assumed. A "
            "forecast has to name which one it used."
        ),
    }


__all__ = [
    "rates",
    "comparables",
    "activity_type",
    "MIN_COMPARABLES",
    "BASIS_PLANNED",
    "BASIS_ELAPSED",
    "BASIS_REPORTED",
    "BASIS_COMPARABLE",
]
