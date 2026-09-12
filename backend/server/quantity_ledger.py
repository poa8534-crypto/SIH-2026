"""The quantity ledger: which readings built this activity, and which did not.

Phase 1 of the Granularity Resolution Engine. `RollupAccumulator` already
answers "what portion of the planned activity does this field event represent"
- it accumulates installed quantity across many mentions and writes the total
to `Activity.actual_qty`. What it never showed anyone is the arithmetic:
which report contributed how much, from which line of which file, and - the
part that matters more - **which readings it refused to count, and why**.

WHY THE REFUSALS ARE THE POINT
------------------------------
A ledger that shows 800 of 1200 m without saying that a fourth reading was
thrown away for a unit mismatch is a ledger that hides its own judgement. The
roll-up rejects a quantity when the digits belong to a tag, when the unit does
not match the node's, when there is no unit at all, or when the node has no
planned quantity to measure against. Every one of those is a decision a planner
may disagree with, and none of them was visible anywhere in the product.

DERIVED AT READ TIME, FROM ONE SHARED RULE
------------------------------------------
Nothing here is stored. The ledger is rebuilt from the `LinkedEvent` rows and
the activity on every request, exactly as the RAID candidates and the Memory
screen are, so it can never go stale against a baseline re-import.

The classification is not re-implemented: `matching.engine.classify_quantity`
is the same function `RollupAccumulator.add` calls. An explanation derived by a
second copy of the rules would drift from the answer it claims to explain,
which is the mistake D-048 was written about.

THE TOTAL IS A MAXIMUM ACROSS INGESTS, NOT A SUM
------------------------------------------------
This is the part that is easy to get wrong, and the first version of this
module did. `RollupAccumulator` sums readings **within one ingest**, but the
schedule write is `actual_qty = max(current, rolled-up installed)` - monotonic,
so a partial re-ingest can never wipe recorded progress. Across two ingests the
schedule therefore holds the LARGER accumulation, not their sum.

So the ledger groups its accepted readings by the job that produced them, sums
within each job, and compares the largest of those against
`Activity.actual_qty`. `naive_sum_all_jobs` is reported beside it because the
difference between the two is meaningful: it is the quantity that was reported
more than once, and on `CIV-FDN-1008` it is exactly why that node reads 150%.

NOT EVERY STORED QUANTITY IS A MEASUREMENT
------------------------------------------
The other thing this ledger found on its first run. `_apply_rollup_to_schedule`
writes:

    new_qty = installed_qty
    if new_qty <= 0 and percent_complete > 0 and planned_qty:
        new_qty = percent_complete / 100 * planned_qty

So when no quantity was counted but a source asserted a PERCENTAGE, the
schedule stores a quantity **back-derived from that percentage**. On the seeded
corpus 29 of 120 activities are in that state: `PIP-SPL-1025` holds 18 of 18
nos with no quantity on any linked event at all, because one line said 100%.

The ledger cannot attribute such a total to readings, and says so rather than
reporting a disagreement it does not have. `stored_total_basis` names which
kind of number the schedule is holding:

    counted_readings        the accepted readings account for it
    derived_from_percentage no reading was counted, but a percentage was
                            asserted and the quantity was computed from it
    unattributed            neither - something wrote it from elsewhere

This matters beyond the ledger: D-084 labels percent complete
`installed_quantity` whenever `actual_qty / planned_qty` produces it, and for
the derived rows that label describes the arithmetic rather than the evidence.
Recorded in D-085 rather than quietly re-engineered here, because changing what
`actual_qty` means is a decision about the write path, not about this reader.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from matching.engine import (
    QTY_COUNTED,
    QTY_NO_QUANTITY,
    classify_quantity,
)
from server.db import Activity, LinkedEvent

#: A hair of tolerance when comparing the ledger's sum against the stored
#: total. Both are floats accumulated in the same order, so they agree exactly
#: in practice; the epsilon exists so a representation artefact is never
#: reported to a planner as a data fault.
TOTAL_EPSILON = 1e-6

#: How the schedule's stored quantity came to be what it is.
BASIS_COUNTED = "counted_readings"
BASIS_DERIVED_FROM_PERCENTAGE = "derived_from_percentage"
BASIS_UNATTRIBUTED = "unattributed"


def _contribution(activity: Activity, event: LinkedEvent) -> dict:
    """One reading, and what the roll-up did with it."""
    counted, reason_code, reason = classify_quantity(
        event.quantity,
        event.uom,
        event.tag_list(),
        activity.planned_qty,
        activity.uom,
    )
    return {
        "linked_event_id": event.id,
        # Carried because a percentage is how a stored quantity gets
        # back-derived when no reading was counted.
        "percentage": event.percentage,
        # Which ingest produced this reading. The schedule keeps the largest
        # per-job accumulation, so the grouping is not cosmetic.
        "job_id": event.job_id,
        "reported_date": event.reported_date,
        "quantity": event.quantity,
        "uom": event.uom,
        "counted_quantity": counted,
        "counted": counted is not None,
        "reason_code": reason_code,
        "reason": reason,
        # The citation. A contribution without one is an assertion.
        "source_file": event.source_file,
        "source_line": event.source_line,
        "source_row": event.source_row,
        "source_span": event.source_span,
        "raw_text": event.raw_text,
        "confidence": event.confidence,
        # Whether this event's link was ever put in front of a planner. A
        # reading that built the total on an auto-linked event carries a
        # different weight from one a human confirmed.
        "reviewed": bool(event.reviewed),
    }


def ledger(db: Session, activity_id: str) -> Optional[dict]:
    """Every reading linked to one activity, counted or refused.

    Returns None when the activity does not exist, so the caller can 404
    rather than present an empty ledger for a node that was never in the
    schedule.
    """
    activity = (
        db.query(Activity).filter(Activity.activity_id == activity_id).first()
    )
    if activity is None:
        return None

    events = (
        db.query(LinkedEvent)
        .filter(LinkedEvent.activity_id == activity_id)
        .order_by(LinkedEvent.reported_date, LinkedEvent.id)
        .all()
    )

    contributions = [_contribution(activity, e) for e in events]

    # Events that never carried a quantity are not refusals - there was
    # nothing to refuse - so they are counted separately from the readings the
    # roll-up actively declined.
    counted = [c for c in contributions if c["counted"]]
    refused = [
        c for c in contributions
        if not c["counted"] and c["reason_code"] != QTY_NO_QUANTITY
    ]
    silent = [c for c in contributions if c["reason_code"] == QTY_NO_QUANTITY]

    # Grouped by ingest, because that is how the schedule writes it.
    per_job: dict[str, float] = {}
    for c in counted:
        key = c["job_id"] or ""
        per_job[key] = per_job.get(key, 0.0) + c["counted_quantity"]

    naive_sum = sum(c["counted_quantity"] for c in counted)
    counted_total = max(per_job.values()) if per_job else 0.0

    stored = float(activity.actual_qty) if activity.actual_qty is not None else None
    agrees = (
        stored is not None and abs(stored - counted_total) <= TOTAL_EPSILON
    ) or (stored is None and counted_total == 0)

    # What kind of number the schedule is holding. See the module docstring:
    # a stored quantity is not always a measurement.
    asserted = [c for c in contributions if c["percentage"] is not None]
    if agrees:
        basis = BASIS_COUNTED
    elif not counted and asserted and stored:
        basis = BASIS_DERIVED_FROM_PERCENTAGE
    else:
        basis = BASIS_UNATTRIBUTED

    planned = float(activity.planned_qty or 0)
    percent = (
        min(100.0, round(counted_total / planned * 100.0, 1))
        if planned > 0 else None
    )
    # Raw, uncapped, so an over-report is visible as one. D-084 caps the same
    # ratio for earned value and lists the node in `quantity_overruns`.
    raw_percent = (
        round(counted_total / planned * 100.0, 1) if planned > 0 else None
    )

    return {
        "activity_id": activity.activity_id,
        "description": activity.description,
        "discipline": activity.discipline,
        "uom": activity.uom,
        "planned_qty": planned,
        # The largest single-ingest accumulation - what the schedule holds.
        "counted_total": round(counted_total, 4),
        # Every accepted reading added together, ignoring which ingest it came
        # from. Larger than `counted_total` exactly when the same work was
        # reported by more than one ingest.
        "naive_sum_all_jobs": round(naive_sum, 4),
        "reported_by_jobs": len(per_job),
        # What the schedule currently holds. Reported beside the sum rather
        # than instead of it.
        "stored_actual_qty": stored,
        "totals_agree": agrees,
        "stored_total_basis": basis,
        "percent_complete_from_quantity": percent,
        # Above 100 means more was reported than the node was planned to hold,
        # which is usually a quantity from different work matched onto it.
        "raw_percent_from_quantity": raw_percent,
        "contributions": contributions,
        "counted_events": len(counted),
        "refused_events": len(refused),
        "events_without_quantity": len(silent),
        "total_note": (
            "counted_total is the largest accumulation from any single "
            "ingest, because the schedule writes actual_qty as "
            "max(current, rolled-up installed) and never lets it decrease. "
            "naive_sum_all_jobs adds every accepted reading regardless of "
            "ingest; where the two differ, the same work was reported twice."
        ),
        "refusal_note": (
            "A refused reading is a decision, not a gap: the roll-up declined "
            "to count it because the digits belonged to a tag, the unit did "
            "not match the node's, no unit was given, or the node has no "
            "planned quantity to measure against. Each one is shown with its "
            "reason so a planner can disagree with it."
        ),
    }


__all__ = [
    "ledger",
    "TOTAL_EPSILON",
    "BASIS_COUNTED",
    "BASIS_DERIVED_FROM_PERCENTAGE",
    "BASIS_UNATTRIBUTED",
]
