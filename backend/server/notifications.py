"""Telling the supervisor what their report actually did.

ROADMAP §14 SHOULD #6; §3.4 calls the loop back to the field the part almost
every competing product omits. When a planner approves an update, the person
who reported it is never told — so the one piece of feedback that would make
reporting feel worth doing never arrives.

DERIVED ON READ, NO NEW TABLE
-----------------------------
The audit trail already records exactly what each submission caused: which
activity, which field, the old value and the new one, and the `linked_event_id`
that produced the write. A notification is a projection of that, not new
capture, so there is no `notification` table and nothing to keep in sync.

The cost of that choice is honest and worth stating: **there is no per-user
read/unread state**, because there is no user table to hang it on — this
prototype has no authentication (D-002 territory: login is mock and
frontend-only). Adding a table to store "seen" would mean inventing an identity
to key it by. When real users exist, that table is the right change; until then
"unread" would be a fiction.

WHAT COUNTS AS A NOTIFICATION
-----------------------------
An `AuditRecord` whose `linked_event_id` points at one of this supervisor's own
submissions — the same `match_method == FIELD_MATCH_METHOD` scoping
`/field/reports` uses, so the two screens can never disagree about whose work
it is.

A **rejected** proposal produces none, and that falls out of the design rather
than being special-cased: rejecting a review item writes no actual to the
activity, so no `AuditRecord` links back to that event.

DAY MOVEMENT
------------
For an actual-date write, the movement reported is the gap between the date the
supervisor's report established and the baseline planned date — positive is
late, negative is early, and it is the number a planner would read off the
variance column. It is `None`, and the message omits it, when the activity has
no planned date to compare against. Never 0 as a stand-in.

See D-049.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from server.db import Activity, AuditRecord, LinkedEvent

#: Fields whose write is worth telling a supervisor about. A `source_conflict`
#: row is a note to the planner, not news for the field.
NOTIFIABLE_FIELDS = ("actual_start", "actual_finish", "actual_qty")

#: Human wording per field, used to build the message.
_FIELD_PHRASE = {
    "actual_start": "start date",
    "actual_finish": "finish date",
    "actual_qty": "quantity",
}


def _as_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _day_movement(record: AuditRecord, activity: Optional[Activity]) -> Optional[int]:
    """Days between the date this write established and the planned date.

    Positive is late. `None` when there is nothing to compare against — an
    activity with no planned date, or a write that is not a date.
    """
    if activity is None or record.field_changed not in ("actual_start", "actual_finish"):
        return None
    actual = _as_date(record.new_value)
    planned = (
        activity.planned_start
        if record.field_changed == "actual_start"
        else activity.planned_finish
    )
    if actual is None or planned is None:
        return None
    return (actual - planned).days


def _message(record: AuditRecord, activity: Optional[Activity], movement: Optional[int]) -> str:
    """One sentence, in the supervisor's terms.

    Names the activity and, where it can be computed, the day movement. It does
    not invent a movement it could not compute — the sentence simply stops.
    """
    phrase = _FIELD_PHRASE.get(record.field_changed, record.field_changed)
    description = (activity.description if activity else None) or record.activity_id
    head = f"Your update set the {phrase} on {record.activity_id} ({description})"

    if movement is None:
        return f"{head}."
    if movement == 0:
        return f"{head} — on plan."
    direction = "later than planned" if movement > 0 else "earlier than planned"
    days = abs(movement)
    return f"{head} — {days} day{'' if days == 1 else 's'} {direction}."


def field_notifications(db: Session, field_match_method: str, limit: int = 50) -> list[dict]:
    """What this supervisor's submissions caused, newest first.

    Read-only. Returns plain dicts so the caller owns the response schema.
    """
    own_event_ids = [
        row.id
        for row in db.query(LinkedEvent.id).filter(
            LinkedEvent.match_method == field_match_method
        )
    ]
    if not own_event_ids:
        return []

    records = (
        db.query(AuditRecord)
        .filter(AuditRecord.linked_event_id.in_(own_event_ids))
        .filter(AuditRecord.field_changed.in_(NOTIFIABLE_FIELDS))
        .order_by(AuditRecord.timestamp.desc())
        .limit(limit)
        .all()
    )
    if not records:
        return []

    activities = {
        a.activity_id: a
        for a in db.query(Activity).filter(
            Activity.activity_id.in_({r.activity_id for r in records})
        )
    }

    out: list[dict] = []
    for record in records:
        activity = activities.get(record.activity_id)
        movement = _day_movement(record, activity)
        out.append(
            {
                "audit_record_id": record.id,
                "linked_event_id": record.linked_event_id,
                "activity_id": record.activity_id,
                "activity_description": activity.description if activity else None,
                "field_changed": record.field_changed,
                "old_value": record.old_value,
                "new_value": record.new_value,
                "day_movement": movement,
                "message": _message(record, activity, movement),
                # False for an auto-applied write, true when a planner confirmed
                # it — the distinction the supervisor most wants to see.
                "confirmed_by_planner": not bool(record.auto_applied),
                "at": record.timestamp,
            }
        )
    return out
