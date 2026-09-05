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

FORECASTING FROM THEM
---------------------
Phase 3. `remaining / rate -> days -> forecast finish -> variance against the
baseline`. The division is trivial; everything that matters is which rate goes
in the denominator and what the answer is allowed to claim.

A forecast is produced from EVERY rate that can produce one, and one of them is
nominated. Reporting a single figure would hide the fact that the same evidence
supports a range - on a sparsely reported activity the pessimistic and
optimistic readings can be months apart, and a reader who cannot see that
cannot judge the number.

The nomination rule, in order:

    observed_elapsed      when available. It is the reading a contract argues
                          from, it is available on far more activities than
                          the reported rate, and it errs late.
    comparable median     when no observed rate exists but three or more
                          completed activities of the same type do.
    planned               last, and labelled as the schedule's own assumption
                          rather than an observation of anything.

**A forecast is never written to the schedule.** It is a projection, exactly as
a proposed liability or a proposed actual date is (D-009, D-078). Nothing here
writes.

**Quantity complete with no Actual Finish is not a forecast.** The roll-up
withholds a finish date when no source named one (D-015) and queues it for a
planner. Forecasting such an activity as "still running" would contradict the
review queue; it is reported as awaiting confirmation instead.

REMAINING QUANTITY COMES FROM PERCENT COMPLETE, NOT FROM THE READINGS
---------------------------------------------------------------------
The rate's numerator is measured quantity, but the remaining quantity is
`planned x (1 - percent_complete/100)`, using `server/evm.py`'s four-rule
derivation - the same one the Schedule screen and the EVM figures use.

They are not the same thing, and the first version of this module used the
readings for both. That made `PIP-SPL-1027` forecast as though nothing had been
built: it reports 71% through an asserted percentage and carries no measured
quantity at all, so `planned - counted` said 14 of 14 remaining while every
other screen in the product said 71% done. A forecast that contradicts the
progress figure beside it is worse than no forecast.

So the two questions are asked of the right evidence. How fast: only measured
quantities, because a rate needs a measurement. How much is left: whatever the
best evidence of completeness says, measured or asserted, and the response
carries `percent_complete` and its source so a reader can see which.

WHAT FEEDS THIS
---------------
Rates are built only from measured quantities. D-086 stopped the roll-up back-deriving a quantity
from an asserted percentage, so `Activity.actual_qty` is now a measurement or
NULL, and dividing it by time yields a rate rather than a fiction wearing
measured units. The per-reading detail comes from `quantity_ledger.ledger`,
which is itself derived from the roll-up's own classifier - so this module
adds no fourth opinion about which readings count.
"""

from __future__ import annotations

import math
import statistics
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from server.db import Activity
from server.evm import SOURCE_QUANTITY, percent_complete
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

#: Why no forecast could be produced. Stated rather than returning an empty
#: object, because "we cannot say" and "we did not look" are different answers.
NO_FORECAST_FINISHED = "already_finished"
NO_FORECAST_NOT_STARTED = "not_started"
NO_FORECAST_AWAITING_FINISH_DATE = "quantity_complete_awaiting_finish_date"
NO_FORECAST_NO_RATE = "no_usable_rate"
NO_FORECAST_NO_QUANTITY = "node_has_no_planned_quantity"

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

    # How much is LEFT is a question about completeness, not about readings:
    # an activity reporting 71% through an asserted percentage has 29% left
    # even though no quantity was ever measured against it. `percent_complete`
    # is the shared four-rule derivation the Schedule screen and EVM both use,
    # so the forecast cannot contradict the progress figure beside it.
    planned_qty = float(activity.planned_qty or 0)
    pct, pct_source = percent_complete(activity, {
        activity.activity_id: max(
            (c["percentage"] for c in book["contributions"]
             if c["percentage"] is not None), default=None
        )
    } if any(c["percentage"] is not None for c in book["contributions"]) else {})
    if pct_source == SOURCE_QUANTITY and counted_total:
        # Exact when a quantity was measured: going back through a percentage
        # rounded to one decimal turns 1200 - 800 into 399.6, and a claim
        # document does not want an arithmetic artefact in it.
        remaining = round(max(0.0, planned_qty - counted_total), 4)
    else:
        remaining = round(max(0.0, planned_qty * (1.0 - pct / 100.0)), 4)

    return {
        "activity_id": activity.activity_id,
        "description": activity.description,
        "discipline": activity.discipline,
        "uom": activity.uom,
        "planned_qty": planned_qty,
        "counted_qty": counted_total,
        "percent_complete": pct,
        "percent_complete_source": pct_source,
        "remaining_qty": remaining,
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


def _forecast_from(
    basis: str,
    rate: Optional[float],
    remaining: float,
    as_of: date,
    baseline_finish: Optional[date],
    *,
    sample: int,
) -> Optional[dict]:
    """One forecast, from one rate. None when that rate cannot produce one."""
    if not rate or rate <= 0:
        return None
    # Ceiling: an activity does not finish a fraction of a day early, and
    # rounding down would let a forecast claim a day it has not earned.
    days = math.ceil(remaining / rate)
    finish = as_of + timedelta(days=days)
    return {
        "basis": basis,
        "rate": rate,
        "remaining_days": days,
        "forecast_finish": finish,
        "baseline_finish": baseline_finish,
        "variance_days": (finish - baseline_finish).days if baseline_finish else None,
        "sample_size": sample,
    }


def forecast(db: Session, activity_id: str, as_of: date) -> Optional[dict]:
    """When this activity finishes, from every rate that can say - and which
    one the headline used.

    Returns None only when the activity does not exist. Every other refusal
    comes back as a populated answer with `forecast` null and a `reason`,
    because "we cannot say" and "we did not look" are different answers.
    """
    measured = rates(db, activity_id, as_of)
    if measured is None:
        return None

    activity = (
        db.query(Activity).filter(Activity.activity_id == activity_id).first()
    )
    baseline_finish = activity.planned_finish
    remaining = measured["remaining_qty"]
    by_basis = {r["basis"]: r for r in measured["rates"]}
    comparable = measured["comparables"]

    def answer(reason: Optional[str], candidates=None, chosen=None) -> dict:
        return {
            **measured,
            "baseline_finish": baseline_finish,
            "forecast": chosen,
            "candidates": candidates or [],
            "reason": reason,
            "evidence": {
                "readings_counted": sum(
                    r["sample_size"] for r in measured["rates"]
                    if r["basis"] == BASIS_ELAPSED
                ),
                "reported_days": measured["reported_days"],
                "measured_quantity": measured["counted_qty"],
                "uom": measured["uom"],
                "comparable_activities": comparable["count"],
            },
            "forecast_note": (
                "A forecast is a projection and is never written to the "
                "schedule. Every rate that could produce one is listed; the "
                "headline names the rate it used, and the spread between "
                "candidates is the honest width of the evidence."
            ),
        }

    if activity.actual_finish is not None:
        return answer(NO_FORECAST_FINISHED)
    if not activity.planned_qty or activity.planned_qty <= 0:
        return answer(NO_FORECAST_NO_QUANTITY)
    if remaining <= 0:
        # The roll-up withheld the finish date because no source named one
        # (D-015). Forecasting this as "still running" would contradict the
        # review queue it was put in.
        return answer(NO_FORECAST_AWAITING_FINISH_DATE)
    if activity.actual_start is None:
        return answer(NO_FORECAST_NOT_STARTED)

    candidates = []
    for basis in (BASIS_ELAPSED, BASIS_REPORTED, BASIS_PLANNED):
        entry = by_basis[basis]
        made = _forecast_from(basis, entry["value"], remaining, as_of,
                              baseline_finish, sample=entry["sample_size"])
        if made:
            candidates.append(made)
    if comparable["enough"]:
        made = _forecast_from(BASIS_COMPARABLE, comparable["median_qty_per_day"],
                              remaining, as_of, baseline_finish,
                              sample=comparable["count"])
        if made:
            candidates.append(made)

    if not candidates:
        return answer(NO_FORECAST_NO_RATE, candidates)

    order = {c["basis"]: c for c in candidates}
    chosen = (
        order.get(BASIS_ELAPSED)
        or order.get(BASIS_COMPARABLE)
        or order.get(BASIS_PLANNED)
        or candidates[0]
    )
    chosen = {**chosen, "why": {
        BASIS_ELAPSED: (
            "observed over every calendar day since Actual Start - the "
            "reading a contract argues from, and the one that errs late"
        ),
        BASIS_COMPARABLE: (
            "no observed rate for this activity, so the median of completed "
            "activities of the same type was used"
        ),
        BASIS_PLANNED: (
            "no observation and no comparable work; this is the schedule's own "
            "assumption, not a measurement of anything"
        ),
        BASIS_REPORTED: (
            "the only rate available was measured over reported days alone, so "
            "it excludes every day nobody reported"
        ),
    }[chosen["basis"]]}

    return answer(None, candidates, chosen)


__all__ = [
    "rates",
    "forecast",
    "comparables",
    "activity_type",
    "MIN_COMPARABLES",
    "BASIS_PLANNED",
    "BASIS_ELAPSED",
    "BASIS_REPORTED",
    "BASIS_COMPARABLE",
    "NO_FORECAST_FINISHED",
    "NO_FORECAST_NOT_STARTED",
    "NO_FORECAST_AWAITING_FINISH_DATE",
    "NO_FORECAST_NO_RATE",
    "NO_FORECAST_NO_QUANTITY",
]
