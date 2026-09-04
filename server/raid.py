"""RAID register: risks, issues, actions and decisions.

ROADMAP §14 MUST #2. The register is the artefact an industry judge recognises
on sight, and it is the one place this system records *governance* rather than
*progress*.

TWO RULES GOVERN THIS MODULE
----------------------------

**1. Exposure is arithmetic.** `exposure = probability x impact_days`, computed
here and nowhere else, on every create and every update. No LLM is involved at
any point. A number that reaches a dashboard is computed deterministically -
the same rule that keeps `rationale` free of model prose (D-003).

**2. A candidate is never auto-committed.** `propose_candidates()` reads the
delay evidence already in the database and returns *proposals*. It writes
nothing. An item reaches the register only when a human posts it, exactly as a
proposed actual date reaches the schedule only through
`POST /review/{id}/resolve` (D-009), and as ROADMAP §6 requires of governance
artefacts. There is deliberately no confidence threshold above which a
candidate commits itself, because there is no such threshold that would be
safe.

See D-048.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from server import delay_taxonomy
from server.db import Activity, AuditRecord, LinkedEvent, RaidItem

#: The four kinds one register holds.
KINDS = ("risk", "issue", "action", "decision")

#: Lifecycle. `rejected` is kept distinct from `closed`: a risk that was
#: considered and dismissed is not the same record as one that was mitigated,
#: and a register that conflates them cannot be audited.
STATUSES = ("open", "mitigating", "closed", "rejected")

#: Only a risk carries these. Present-but-null on the other three kinds.
RISK_ONLY_FIELDS = ("probability", "impact_days", "exposure")


class RaidValidationError(ValueError):
    """A RAID item that cannot be stored as described. Carries the reason."""


def compute_exposure(
    probability: Optional[float], impact_days: Optional[float]
) -> Optional[float]:
    """`probability x impact_days`, or None when either side is unknown.

    None means "not calculable", never 0.0. A zero exposure is a real,
    meaningful value - a risk with no schedule impact - and must not be
    confused with a risk nobody has scored yet.
    """
    if probability is None or impact_days is None:
        return None
    return round(float(probability) * float(impact_days), 4)


def validate(kind: str, status: str, probability, impact_days) -> None:
    """Refuse what cannot be stored honestly. Raises `RaidValidationError`."""
    if kind not in KINDS:
        raise RaidValidationError(
            f"kind must be one of {', '.join(KINDS)}, got '{kind}'"
        )
    if status not in STATUSES:
        raise RaidValidationError(
            f"status must be one of {', '.join(STATUSES)}, got '{status}'"
        )
    if probability is not None and not 0.0 <= float(probability) <= 1.0:
        raise RaidValidationError(
            f"probability must be between 0 and 1, got {probability}"
        )
    if impact_days is not None and float(impact_days) < 0:
        raise RaidValidationError(
            f"impact_days cannot be negative, got {impact_days}"
        )
    # Scoring a non-risk is refused rather than silently dropped: an issue with
    # a probability is a category error, and quietly discarding the number
    # would leave the caller believing it was stored.
    if kind != "risk" and (probability is not None or impact_days is not None):
        raise RaidValidationError(
            f"probability and impact_days apply to a risk, not to a {kind}. "
            "Record the consequence in description instead."
        )


# ── Candidate generation ────────────────────────────────────────────────────

#: Delay vocabulary, shared with `_compute_delay_reasons` in server/main.py.
#: Kept as one list so the Memory screen's causes and the RAID candidates can
#: never name different things.
#:
#: It now lives in `server/delay_taxonomy.py` alongside the §2.7 category and
#: liability mappings built on top of it, and is re-exported here so the many
#: existing importers of `server.raid.DELAY_KEYWORDS` keep working. The list
#: itself is unchanged.
DELAY_KEYWORDS = delay_taxonomy.DELAY_KEYWORDS


#: One delay observation: a phrase, the activity it was said about, and the
#: exact place it was said. This tuple IS the identity of a delay event - the
#: attribution layer keys its persisted rows on it (D-077), and
#: `delay_evidence` counts distinct values of it.
ObservationKey = tuple


def delay_observations(db: Session) -> dict[ObservationKey, list[AuditRecord]]:
    """Every distinct delay observation in the audit trail, with its evidence.

    **One observation is one piece of evidence about one activity**, keyed on
    (phrase, activity, source file, span) - not one audit row. That distinction
    is the whole point of this function and of everything built on it.

    A single spreadsheet row that reads "Bored Piling - 1 day over, piling rig
    breakdown" writes three audit records: actual_start, actual_finish and
    actual_qty. Counting audit rows therefore reports one observation as three,
    and the number moves when the roll-up happens to touch a different set of
    fields - which is a fact about storage, not about the project.

    The key deliberately excludes the line and row numbers: the roll-up records
    those inconsistently - on this corpus the actual_qty write carries
    source_row=None while the two date writes from the same spreadsheet row
    carry row=23 - so keying on them splits one observation back into two and
    re-introduces the storage artefact this function exists to remove. The span
    is the evidence; the locators are provenance for display.

    This is the single scan of the audit trail for delay text. `delay_evidence`
    aggregates it for the Memory screen and the RAID candidates, and
    `server/delay_events.py` materialises it into attributable rows. None of
    them re-scan, so none of them can disagree - the reason the vocabulary was
    made a single list in the first place (D-048).
    """
    found: dict[ObservationKey, list[AuditRecord]] = defaultdict(list)

    for record in db.query(AuditRecord).filter(AuditRecord.source_span.isnot(None)):
        text = (record.source_span or "").lower()
        for phrase in DELAY_KEYWORDS:
            if phrase not in text:
                continue
            key = (phrase, record.activity_id, record.source_file, record.source_span)
            found[key].append(record)

    return dict(found)


def finish_slip_by_activity(db: Session) -> dict:
    """Positive finish variance per activity, in days. Shared, not re-derived."""
    return {
        a.activity_id: a.finish_variance_days
        for a in db.query(Activity)
        if a.finish_variance_days and a.finish_variance_days > 0
    }


def delay_evidence(db: Session) -> dict[str, dict]:
    """How often each delay phrase actually appears in the field evidence.

    Aggregates `delay_observations` per phrase. Both callers used to count for
    themselves and disagreed: the Memory screen filtered audit rows to
    actual_start/actual_finish and reported 2, while the RAID candidate
    detector applied no field filter and reported 3, for the same one
    spreadsheet row. Neither was measuring recurrence. On the demo corpus every
    one of the four phrases occurs exactly ONCE, in one row of
    civil_progress.xlsx, against one activity.

    Returns, per phrase: `occurrences`, the `activity_ids` touched, the
    `records` behind it, and `days_lost` - finish slip summed over the distinct
    affected activities. `days_lost` is attributed, not measured: an activity's
    whole overrun is credited to every cause recorded against it, so it is an
    upper bound per cause.
    """
    occurrences: dict[str, int] = defaultdict(int)
    records: dict[str, list[AuditRecord]] = defaultdict(list)
    activities: dict[str, set] = defaultdict(set)

    for (phrase, activity_id, _file, _span), rows in delay_observations(db).items():
        occurrences[phrase] += 1
        records[phrase].extend(rows)
        if activity_id:
            activities[phrase].add(activity_id)

    slip = finish_slip_by_activity(db)

    return {
        phrase: {
            "occurrences": count,
            "activity_ids": sorted(activities[phrase]),
            "records": records[phrase],
            "days_lost": sum(slip.get(a, 0) for a in activities[phrase]),
        }
        for phrase, count in occurrences.items()
    }


def propose_candidates(db: Session, limit: int = 20) -> list[dict]:
    """RAID items the evidence suggests. **Writes nothing.**

    Reads the delay phrases already recorded in `AuditRecord.source_span` -
    the same evidence the Memory screen's delay analysis uses - and returns one
    proposal per recurring cause, carrying the activities it touched, the
    schedule days behind it, and the audit rows it came from.

    Every proposal is an `issue`, not a `risk`: the delay has already happened
    and is recorded, so it is a thing that IS wrong, not a thing that MIGHT go
    wrong. Proposals therefore carry no probability, no impact_days and no
    exposure - inventing a probability for an event that already occurred would
    be exactly the fabrication this module exists to avoid. A planner who wants
    a forward-looking risk raises one and scores it themselves.
    """
    # One shared counter, so this and the Memory screen cannot disagree about
    # the same evidence again. See delay_evidence().
    evidence = delay_evidence(db)
    if not evidence:
        return []

    # Ids already on the register, so the same cause is not proposed twice.
    existing_sources = {
        item.source_id
        for item in db.query(RaidItem).filter(RaidItem.source_kind == "delay_analysis")
        if item.source_id
    }

    proposals: list[dict] = []
    for phrase, found in evidence.items():
        if phrase in existing_sources:
            continue
        activity_ids = found["activity_ids"]
        days_lost = found["days_lost"]
        occurrences = found["occurrences"]
        proposals.append(
            {
                "kind": "issue",
                # Not "Recurring": on this corpus every phrase occurs exactly
                # once, and calling a single observation a recurrence is the
                # overclaim the count itself used to make.
                "title": f"Delay cause: {phrase}",
                "description": (
                    f"'{phrase}' appears in {occurrences} field report"
                    f"{'' if occurrences == 1 else 's'} across "
                    f"{len(activity_ids)} activit"
                    f"{'y' if len(activity_ids) == 1 else 'ies'}, accounting for "
                    f"{days_lost} day{'' if days_lost == 1 else 's'} of finish slip."
                ),
                # The REGISTER category ("equipment", "supply"), which is a
                # governance grouping and deliberately not the contractual
                # DelayCategory the attribution layer assigns to the same
                # phrase. See server/delay_taxonomy.py.
                "category": delay_taxonomy.register_category_for_phrase(phrase),
                "linked_activity_ids": activity_ids,
                "occurrences": occurrences,
                "days_lost": days_lost,
                "source_kind": "delay_analysis",
                "source_id": phrase,
                "source_note": (
                    "Derived from AuditRecord.source_span. This is a PROPOSAL: "
                    "nothing has been written to the register."
                ),
                # Said in the payload, not only in the docs, so a client cannot
                # mistake a proposal for a stored row.
                "committed": False,
            }
        )

    # Most schedule damage first; ties broken by how often the cause recurs.
    proposals.sort(key=lambda p: (-p["days_lost"], -p["occurrences"]))
    return proposals[:limit]


def evidence_for(db: Session, item: RaidItem) -> Optional[dict]:
    """The row that raised this item, if it can still be resolved.

    Returns None for a planner-authored item, and None for a source row that no
    longer exists - both are stated rather than faked.
    """
    if not item.source_kind or not item.source_id:
        return None
    if item.source_kind == "delay_analysis":
        return {"kind": "delay_analysis", "id": item.source_id, "detail": item.source_note}
    if item.source_kind == "audit_record":
        record = db.query(AuditRecord).filter(AuditRecord.id == item.source_id).first()
        if not record:
            return None
        return {
            "kind": "audit_record",
            "id": record.id,
            "detail": record.source_span,
            "activity_id": record.activity_id,
            "source_file": record.source_file,
        }
    if item.source_kind == "linked_event":
        event = db.query(LinkedEvent).filter(LinkedEvent.id == item.source_id).first()
        if not event:
            return None
        return {
            "kind": "linked_event",
            "id": event.id,
            "detail": event.raw_text,
            "activity_id": event.activity_id,
            "source_file": event.source_file,
        }
    return None
