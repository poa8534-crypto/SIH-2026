"""Delay attribution: materialise classified delays, and total them by party.

Phase 1 of the Contractor Dispute Shield. `server/delay_taxonomy.py` says what
a delay category is and who carries it; this module turns the delay text
already sitting in the audit trail into rows that can be cited, adjudicated and
exported.

WHY PERSIST AT ALL, WHEN THE MEMORY SCREEN COMPUTES ITS COUNTS AT READ TIME
---------------------------------------------------------------------------
Because a planner has to be able to overrule the proposed liability, and an
overruled row needs an identity to attach the ruling to. A read-time count has
no identity: recompute it and the planner's decision has nowhere to live. The
Memory screen keeps computing, because a frequency needs no identity.

The two never disagree, because both come from `raid.delay_observations` - one
scan of the audit trail, shared. Nothing here re-implements the matching of
delay text, which is the mistake D-048 was written about.

SYNC IS IDEMPOTENT AND SAFE TO RE-RUN
-------------------------------------
`sync_delay_events` is keyed on the observation identity (phrase, activity,
source file, span). Re-running it updates the derived fields of existing rows -
`impact_days` and `month` move when an activity's variance moves - and never
duplicates. A planner's adjudication is preserved across every sync, because
the sync writes only the derived columns and never `liability_final`.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from server import raid
from server.db import Activity, DelayEvent
from server.delay_taxonomy import (
    DelayCategory,
    Liability,
    category_for_phrase,
    liability_for,
)


def _month_of(activity: Optional[Activity]) -> Optional[str]:
    """The calendar month a delayed activity concluded, as "YYYY-MM".

    Actual finish when the schedule has one, planned finish otherwise. An
    activity still in progress has no concluding month yet and returns None -
    an honest gap rather than the current month, which would attribute a delay
    to whenever the report happened to be read.
    """
    if activity is None:
        return None
    when: Optional[date] = activity.actual_finish or activity.planned_finish
    return f"{when.year:04d}-{when.month:02d}" if when else None


def _citing_record(records: list) -> Optional[object]:
    """The audit row a delay event cites.

    The earliest by timestamp: the first time the project recorded the claim,
    not whichever of the two or three writes from one spreadsheet row happened
    to land last.
    """
    if not records:
        return None
    return min(records, key=lambda r: (r.timestamp is None, r.timestamp))


def sync_delay_events(db: Session) -> int:
    """Materialise a DelayEvent row per delay observation. Returns rows touched.

    Called after any operation that can add audit rows or move a variance -
    ingest roll-up and planner resolution both qualify. Commits nothing; the
    caller's transaction owns it.
    """
    observations = raid.delay_observations(db)
    slip = raid.finish_slip_by_activity(db)

    activities = {
        a.activity_id: a
        for a in db.query(Activity).filter(
            Activity.activity_id.in_({k[1] for k in observations if k[1]})
        )
    } if observations else {}

    existing = {
        (row.phrase, row.activity_id, row.source_file, row.source_span): row
        for row in db.query(DelayEvent)
    }

    touched = 0
    for key, records in observations.items():
        phrase, activity_id, source_file, source_span = key
        record = _citing_record(records)
        activity = activities.get(activity_id) if activity_id else None
        category = category_for_phrase(phrase)

        row = existing.get(key)
        if row is None:
            row = DelayEvent(
                phrase=phrase,
                activity_id=activity_id,
                source_file=source_file,
                source_span=source_span,
            )
            db.add(row)

        # Derived on every sync. `liability_final` and the adjudication columns
        # are deliberately absent from this list: a planner's ruling survives a
        # re-sync, and a re-classification that changed it silently would be
        # the audit-trail failure this whole feature exists to prevent.
        row.audit_record_id = record.id if record is not None else None
        row.category = category.value
        row.liability_proposed = liability_for(category).value
        row.inferred_by = "rules"
        row.confidence = record.confidence if record is not None else None
        row.discipline = activity.discipline if activity is not None else None
        row.month = _month_of(activity)
        row.impact_days = slip.get(activity_id, 0) if activity_id else 0
        row.raw_text = source_span
        row.source_line = record.source_line if record is not None else None
        row.source_row = record.source_row if record is not None else None
        touched += 1

    return touched


def effective_liability(row: DelayEvent) -> str:
    """What the row currently says, ruling first, proposal second."""
    return row.liability_final or row.liability_proposed


def is_adjudicated(row: DelayEvent) -> bool:
    """Whether a planner has ruled on this row.

    A report counts an unadjudicated row as a proposal and keeps it out of the
    party totals. A total that silently mixes machine proposals with planner
    findings is the single thing that would discredit the document.
    """
    return row.liability_final is not None


def attribution(db: Session, discipline: Optional[str] = None) -> dict:
    """The delay attribution matrix.

    Returns the classified rows plus two sets of totals: `adjudicated_days`,
    which counts only rows a planner has ruled on, and `proposed_days`, which
    counts every row at its current effective liability. Both are reported,
    because reporting only the second would present proposals as findings and
    reporting only the first would hide work waiting for a planner.
    """
    query = db.query(DelayEvent)
    if discipline:
        query = query.filter(DelayEvent.discipline == discipline)
    rows = query.all()

    adjudicated_days: dict[str, int] = defaultdict(int)
    proposed_days: dict[str, int] = defaultdict(int)
    by_month: dict[str, int] = defaultdict(int)

    for row in rows:
        liability = effective_liability(row)
        proposed_days[liability] += row.impact_days or 0
        if is_adjudicated(row):
            adjudicated_days[liability] += row.impact_days or 0
        if row.month:
            by_month[row.month] += row.impact_days or 0

    # Worst first, then by how recently the project heard about it.
    rows.sort(key=lambda r: (-(r.impact_days or 0), r.phrase))

    return {
        "events": rows,
        "total_events": len(rows),
        "adjudicated_events": sum(1 for r in rows if is_adjudicated(r)),
        "adjudicated_days": {liability.value: adjudicated_days.get(liability.value, 0)
                             for liability in Liability},
        "proposed_days": {liability.value: proposed_days.get(liability.value, 0)
                          for liability in Liability},
        "days_by_month": dict(sorted(by_month.items())),
        "categories_present": sorted({r.category for r in rows}),
        # Said in the payload, not only in the docs, so a client cannot present
        # an upper bound as a measured figure.
        "impact_days_basis": (
            "Each activity's whole finish slip is credited to every cause "
            "recorded against it, so these are upper bounds per cause and do "
            "not sum to a project total."
        ),
        "unadjudicated_note": (
            "Rows without a planner ruling are proposals. They are excluded "
            "from adjudicated_days."
        ),
    }


__all__ = [
    "sync_delay_events",
    "attribution",
    "effective_liability",
    "is_adjudicated",
    "DelayCategory",
    "Liability",
]
