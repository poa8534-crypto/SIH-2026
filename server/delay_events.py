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
from datetime import date, timedelta
from enum import Enum
from typing import Optional

from sqlalchemy.orm import Session

from server import raid
from server.db import Activity, AuditRecord, DelayEvent, LinkedEvent
from server.delay_taxonomy import (
    DelayCategory,
    Liability,
    category_for_phrase,
    liability_for,
)


#: The contractual window for giving notice of a delay event, in days.
#:
#: 28 days is FIDIC 1999 Sub-Clause 20.1, which requires notice "not later than
#: 28 days after the Contractor became aware, or should have become aware, of
#: the event". It is a DEFAULT and not a fact about any particular contract:
#: Indian PSU general conditions commonly shorten it, and a real deployment
#: must set this from the contract it is administering. It is a module constant
#: rather than an inference for exactly that reason - the number has to be
#: something a person chose and can point at.
NOTICE_WINDOW_DAYS = 28


class NoticeBasis(str, Enum):
    """How `DelayEvent.evidenced_on` was arrived at.

    The same distinction `extraction.models.DateBasis` draws for actual dates,
    for the same reason: a notice clock started from the wrong date is worse
    than no clock, so the report has to be able to say which kind of date it
    started from.

      REPORTED       the date the field report itself carried. The day the
                     project was actually told. This is the only one that is
                     an assertion by a source.
      ACTUAL_FINISH  the day the delayed work concluded. An inference: the
                     project cannot have learned of the delay later than this,
                     but it may well have learned earlier.
      RECORDED       the day NAVIS wrote the audit row. The weakest basis -
                     it measures ingestion, not the project - and is used only
                     when nothing better exists.
    """

    REPORTED = "REPORTED"
    ACTUAL_FINISH = "ACTUAL_FINISH"
    RECORDED = "RECORDED"


class NoticeStatus(str, Enum):
    """Where one delay stands against its notice window.

      SERVED   a notice has been recorded against this delay.
      OPEN     the window has not closed yet as at the data date.
      LAPSED   the window closed and no notice is recorded.
      UNKNOWN  no evidenced date could be established, so no window exists.
               Reported as unknown rather than defaulted, because a lapsed
               claim asserted on a guessed date is a false accusation.
    """

    SERVED = "SERVED"
    OPEN = "OPEN"
    LAPSED = "LAPSED"
    UNKNOWN = "UNKNOWN"


def _evidenced_on(
    db: Session,
    record: Optional[AuditRecord],
    activity: Optional[Activity],
) -> tuple[Optional[date], Optional[str]]:
    """The date the project was told about a delay, and how that was decided.

    Best source first. `LinkedEvent.reported_date` is the date the field report
    carried and is the only candidate that a source actually asserted; the
    audit row's own timestamp records when NAVIS ingested the file, which on a
    corpus loaded in one batch is the same day for every delay in the project
    and would make every clock start together.
    """
    if record is not None and record.linked_event_id:
        event = (
            db.query(LinkedEvent)
            .filter(LinkedEvent.id == record.linked_event_id)
            .first()
        )
        if event is not None and event.reported_date:
            return event.reported_date, NoticeBasis.REPORTED.value

    if activity is not None and activity.actual_finish:
        return activity.actual_finish, NoticeBasis.ACTUAL_FINISH.value

    if record is not None and record.timestamp:
        return record.timestamp.date(), NoticeBasis.RECORDED.value

    return None, None


def notice_status(row: DelayEvent, as_of: Optional[date]) -> str:
    """Where this delay stands against its notice window, as at `as_of`."""
    if row.notice_served_on is not None:
        return NoticeStatus.SERVED.value
    if row.notice_due_on is None or as_of is None:
        return NoticeStatus.UNKNOWN.value
    return (
        NoticeStatus.LAPSED.value
        if as_of > row.notice_due_on
        else NoticeStatus.OPEN.value
    )


def days_to_notice(row: DelayEvent, as_of: Optional[date]) -> Optional[int]:
    """Days remaining in the window; negative once it has closed."""
    if row.notice_due_on is None or as_of is None:
        return None
    return (row.notice_due_on - as_of).days


def record_notice(
    row: DelayEvent,
    served_on: date,
    *,
    reference: Optional[str] = None,
) -> Optional[date]:
    """Record that contractual notice was given. Returns the previous date.

    Sets only the two planner-supplied columns. The audit record is written by
    the caller, for the same reason `adjudicate` leaves it to the caller:
    `_write_audit` lives with the rest of the audit trail and there is one of
    it. Re-recording is allowed and appends, because a corrected notice date is
    exactly the kind of late correction a register has to survive.
    """
    previous = row.notice_served_on
    row.notice_served_on = served_on
    row.notice_reference = reference
    return previous


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

        # Notice clock. Derived, like category and impact - and like them,
        # `notice_served_on` and `notice_reference` are NOT touched here: a
        # notice a planner recorded must survive the next file upload.
        evidenced, basis = _evidenced_on(db, record, activity)
        row.evidenced_on = evidenced
        row.evidenced_basis = basis
        row.notice_due_on = (
            evidenced + timedelta(days=NOTICE_WINDOW_DAYS) if evidenced else None
        )
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


def adjudicate(
    row: DelayEvent,
    liability: Liability,
    *,
    note: Optional[str] = None,
    by: Optional[str] = None,
    at=None,
) -> Optional[str]:
    """Record a planner's ruling on one delay. Returns the previous ruling.

    Sets only the adjudication columns. The audit record that makes the ruling
    permanent is written by the caller, because `_write_audit` lives with the
    rest of the audit trail in `server/main.py` and there is exactly one of it.

    The previous value is returned rather than discarded so the caller can put
    it in the audit row's `old_value`: a planner overturning an earlier ruling
    is the single most contestable thing that happens in this feature, and the
    trail has to show both sides of it.

    Re-adjudication is allowed. Evidence arrives late, and a register that
    refused a second ruling would push the correction into a spreadsheet
    nobody can audit. Each one appends its own record; nothing is overwritten.
    """
    previous = row.liability_final
    row.liability_final = liability.value
    row.adjudication_note = note
    row.adjudicated_by = by
    row.adjudicated_at = at
    return previous


def attribution(
    db: Session,
    discipline: Optional[str] = None,
    as_of: Optional[date] = None,
) -> dict:
    """The delay attribution matrix.

    Returns the classified rows plus two sets of totals: `adjudicated_days`,
    which counts only rows a planner has ruled on, and `proposed_days`, which
    counts every row at its current effective liability. Both are reported,
    because reporting only the second would present proposals as findings and
    reporting only the first would hide work waiting for a planner.

    `as_of` is the date the notice windows are judged against - the project's
    data date. Without it every notice status is UNKNOWN, which is the honest
    answer rather than silently using today.
    """
    query = db.query(DelayEvent)
    if discipline:
        query = query.filter(DelayEvent.discipline == discipline)
    rows = query.all()

    adjudicated_days: dict[str, int] = defaultdict(int)
    proposed_days: dict[str, int] = defaultdict(int)
    by_month: dict[str, int] = defaultdict(int)
    notice_counts: dict[str, int] = {status.value: 0 for status in NoticeStatus}
    lapsed_days = 0

    for row in rows:
        liability = effective_liability(row)
        proposed_days[liability] += row.impact_days or 0
        if is_adjudicated(row):
            adjudicated_days[liability] += row.impact_days or 0
        if row.month:
            by_month[row.month] += row.impact_days or 0
        status = notice_status(row, as_of)
        notice_counts[status] += 1
        if status == NoticeStatus.LAPSED.value:
            lapsed_days += row.impact_days or 0

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
        "notice_window_days": NOTICE_WINDOW_DAYS,
        "notice_counts": notice_counts,
        "notice_lapsed_days": lapsed_days,
        "notice_as_of": as_of,
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
        "notice_note": (
            f"Notice windows are {NOTICE_WINDOW_DAYS} days from the date the "
            "delay was evidenced, a default taken from FIDIC 1999 Sub-Clause "
            "20.1. The governing contract may say otherwise, and LAPSED means "
            "only that no notice has been recorded here."
        ),
    }


__all__ = [
    "sync_delay_events",
    "adjudicate",
    "record_notice",
    "notice_status",
    "days_to_notice",
    "attribution",
    "effective_liability",
    "is_adjudicated",
    "DelayCategory",
    "Liability",
    "NoticeBasis",
    "NoticeStatus",
    "NOTICE_WINDOW_DAYS",
]
