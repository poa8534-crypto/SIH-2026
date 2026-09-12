"""Workforce: the manpower layer NAVIS was missing.

WHY THIS MODULE EXISTS
----------------------
Two places in this codebase already admitted the hole.

`productivity.py` computes three rates and divides every one of them by
CALENDAR days, with the docstring conceding that the result "is a statement
about how often somebody wrote a report, not about the crew". The honest
denominator for how fast work went is man-days, and until now the database held
no man-days to divide by.

`delay_taxonomy.py` carries a MANPOWER delay category mapped to
NON_COMPENSABLE liability. A planner could classify a slip as a labour
shortage, but nothing in NAVIS could corroborate that a shortage happened, so
the most contractually consequential classification in the taxonomy was the
least evidenced one.

The sample corpus was carrying the evidence all along and NAVIS threw it away:
`dataset/dpr_day_11_messy.txt` says "Labour kam tha aaj so went slow" and
"Crane w/o came late from the depot, that cost us half a day".

THE THREE QUESTIONS, AND WHY THEY ARE ONE MODULE
------------------------------------------------
    attendance   who actually turned up          → the denominator
    capacity     how much more a crew could take  → the headroom
    allocation   who is meant to be where         → the intention

They share one subject (the crew) and one arithmetic (strength × days). Split
across three modules they would each re-derive the other two badly.

WHAT THIS MODULE REFUSES TO DO
------------------------------
It does not invent a productivity norm. Demand in man-days is
`quantity / (quantity per man-day)`, and that second term has to come from work
that actually finished. Where no norm exists the activity is returned in
`demand_not_derivable` and contributes ZERO to demand, named rather than
silently absorbed — the same rule `productivity.comparables` already follows
when it refuses to average two samples.

It does not default an absent shift length to 8 hours and then present the
result as measured. `AttendanceRecord.man_days` states that assumption at the
point of use.

It does not write. Every function here reads and computes; the commit paths
live in `server/main.py` so that the proposal/commit rule (D-009: a supervisor
proposes, only the Project Manager commits) is enforced in one place.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from server.db import (
    Activity,
    AttendanceRecord,
    Crew,
    ResourceAssignment,
    current_attendance,
)
from server.productivity import activity_type

# The absence reasons the field app offers. Open set on the data model — the
# column is a JSON map so a new reason is data, not a migration — but these are
# the ones with a button, and the ones the rollups name.
ABSENCE_REASONS: tuple[str, ...] = (
    "leave",
    "sick",
    "no_show",
    "redeployed",
    "weather",
    "other",
)

# Below this many musters a crew's attendance ratio is not called reliability.
# Three days is not a pattern; it is three days. Same refusal as
# productivity.MIN_COMPARABLES, for the same reason.
MIN_MUSTERS_FOR_RELIABILITY = 5

# A crew fielding this fraction of its contracted strength or less is short
# enough that the shortfall is worth putting in front of a planner.
SHORTFALL_ALERT_RATIO = 0.8

# Assignment statuses.
STATUS_PROPOSED = "proposed"
STATUS_COMMITTED = "committed"
STATUS_WITHDRAWN = "withdrawn"


# ── Attendance ──────────────────────────────────────────────────────────────

def musters(
    db: Session,
    start: Optional[date] = None,
    end: Optional[date] = None,
    crew_ids: Optional[Iterable[str]] = None,
) -> list[AttendanceRecord]:
    """Live muster readings in a window, superseded corrections removed.

    The supersede chain is resolved in Python rather than SQL because a
    correction can be written outside the requested window — correcting the 3rd
    on the 10th is normal — and a WHERE clause on `attendance_date` would hide
    the correcting row while leaving the corrected one looking current.
    """
    q = db.query(AttendanceRecord)
    if crew_ids is not None:
        crew_ids = list(crew_ids)
        if not crew_ids:
            return []
        q = q.filter(AttendanceRecord.crew_id.in_(crew_ids))
    # Every row for these crews, so the chain is complete…
    all_rows = q.order_by(AttendanceRecord.attendance_date, AttendanceRecord.created_at).all()
    live = current_attendance(all_rows)
    # …then the window is applied to what survived.
    if start is not None:
        live = [r for r in live if r.attendance_date >= start]
    if end is not None:
        live = [r for r in live if r.attendance_date <= end]
    return live


def _reason_totals(records: Iterable[AttendanceRecord]) -> dict[str, int]:
    """Absence reasons summed across records, largest first."""
    totals: dict[str, int] = defaultdict(int)
    for rec in records:
        for reason, count in rec.reason_map().items():
            try:
                totals[str(reason)] += int(count)
            except (TypeError, ValueError):
                # A malformed count is dropped rather than crashing a rollup.
                continue
    return dict(sorted(totals.items(), key=lambda kv: -kv[1]))


def _attendance_block(records: list[AttendanceRecord]) -> dict:
    """The figures every rollup reports, computed once.

    `planned` is the sum of the per-row SNAPSHOT strength, never a join onto
    the crew's strength today — that is what makes a historical shortfall
    stable when a crew is re-sized.
    """
    planned = sum(r.planned_strength for r in records)
    present = sum(r.present for r in records)
    return {
        "musters": len(records),
        "planned_strength": planned,
        "present": present,
        "absent": sum(r.absent for r in records),
        "shortfall": planned - present,
        # None rather than 0 when nothing was planned: 0% attendance against a
        # planned strength of zero is a division, not a fact.
        "attendance_pct": round(present / planned * 100.0, 1) if planned else None,
        "man_days": round(sum(r.man_days() for r in records), 2),
        "absence_reasons": _reason_totals(records),
    }


def daily_rollup(
    db: Session, start: date, end: date, discipline: Optional[str] = None
) -> list[dict]:
    """One row per calendar date in the window, oldest first.

    Dates with no muster are included with `musters: 0` rather than skipped.
    A gap in a manpower curve is information — it is either a holiday or a day
    nobody reported — and dropping the row makes a chart draw a straight line
    through it as though work continued.
    """
    crews = {c.crew_id: c for c in db.query(Crew).all()}
    records = musters(db, start, end)
    if discipline:
        records = [
            r for r in records
            if (crews.get(r.crew_id).discipline if crews.get(r.crew_id) else None)
            == discipline
        ]

    by_date: dict[date, list[AttendanceRecord]] = defaultdict(list)
    for rec in records:
        by_date[rec.attendance_date].append(rec)

    out: list[dict] = []
    day = start
    while day <= end:
        block = _attendance_block(by_date.get(day, []))
        out.append({"date": day, **block})
        day += timedelta(days=1)
    return out


def discipline_rollup(db: Session, start: date, end: date) -> list[dict]:
    """Attendance grouped by discipline, worst attendance first.

    Sorted by shortfall rather than alphabetically because the question this
    answers is "where is the manpower missing", and the answer should be the
    first row.
    """
    crews = {c.crew_id: c for c in db.query(Crew).all()}
    grouped: dict[str, list[AttendanceRecord]] = defaultdict(list)
    for rec in musters(db, start, end):
        crew = crews.get(rec.crew_id)
        grouped[crew.discipline if crew else "unknown"].append(rec)

    rows = [
        {
            "discipline": disc,
            "crews": len({r.crew_id for r in recs}),
            **_attendance_block(recs),
        }
        for disc, recs in grouped.items()
    ]
    return sorted(rows, key=lambda r: -r["shortfall"])


def contractor_reliability(db: Session, start: date, end: date) -> list[dict]:
    """Per contractor: did they field the strength they contracted to field?

    `reliable` is None — not False — below MIN_MUSTERS_FOR_RELIABILITY. A
    contractor with two musters has not been measured, and ranking them as
    unreliable on two data points would be a claim the data cannot support.
    """
    crews = {c.crew_id: c for c in db.query(Crew).all()}
    grouped: dict[str, list[AttendanceRecord]] = defaultdict(list)
    for rec in musters(db, start, end):
        crew = crews.get(rec.crew_id)
        grouped[(crew.contractor if crew else "") or "unattributed"].append(rec)

    rows = []
    for contractor, recs in grouped.items():
        block = _attendance_block(recs)
        enough = block["musters"] >= MIN_MUSTERS_FOR_RELIABILITY
        rows.append(
            {
                "contractor": contractor,
                "crews": len({r.crew_id for r in recs}),
                **block,
                "sample_sufficient": enough,
                "reliable": (
                    None
                    if not enough or block["attendance_pct"] is None
                    else block["attendance_pct"] >= SHORTFALL_ALERT_RATIO * 100
                ),
            }
        )
    # Unmeasured contractors sort last: an absent figure must not outrank a
    # bad one in a ranking a manager reads top-down.
    return sorted(
        rows,
        key=lambda r: (r["attendance_pct"] is None, r["attendance_pct"] or 0),
    )


def crew_reliability(db: Session, crew_id: str, as_of: Optional[date] = None) -> Optional[float]:
    """The fraction of contracted strength this crew historically fields.

    None when the crew has too few musters to say. Callers must treat None as
    "use nominal strength and say so", never as 1.0 — an unmeasured crew that
    silently becomes a perfectly reliable one inflates every supply figure
    downstream of it.
    """
    recs = musters(db, None, as_of, [crew_id])
    if len(recs) < MIN_MUSTERS_FOR_RELIABILITY:
        return None
    planned = sum(r.planned_strength for r in recs)
    if not planned:
        return None
    return round(sum(r.present for r in recs) / planned, 3)


# ── Man-day productivity: the denominator productivity.py wanted ────────────

def man_day_rate(db: Session, activity_id: str) -> Optional[dict]:
    """Installed quantity per man-day actually mustered against one activity.

    This is the fourth rate `productivity.rates` could not compute. It is
    deliberately NOT added to that function's return: the three rates there are
    available for every activity, and this one is available only where somebody
    kept a muster. Mixing an always-present rate with a sometimes-present one
    in the same dict invites a caller to treat a missing man-day rate as zero
    productivity rather than as an unkept register.

    Returns None when the activity does not exist. Returns a dict with
    `rate: None` and a stated reason when it exists but cannot be rated — so
    the UI can say WHY there is no figure instead of showing a blank.
    """
    activity = db.query(Activity).filter(Activity.activity_id == activity_id).first()
    if activity is None:
        return None

    # Attendance rows naming this activity. A crew splits its day across
    # several activities, and nothing records the split, so a muster that names
    # three activities is attributed to all three in full. That OVERSTATES
    # man-days per activity and the reason code says so: it is the honest
    # direction to err, because understating the denominator would overstate
    # productivity.
    attributed = [r for r in musters(db) if activity_id in r.activity_list()]
    if not attributed:
        return {
            "activity_id": activity_id,
            "rate": None,
            "uom": activity.uom or "",
            "man_days": 0.0,
            "musters": 0,
            "reason": "no_attendance_attributed",
            "note": (
                "No muster names this activity. Man-day productivity needs a "
                "register, not a report."
            ),
        }

    from server.quantity_ledger import ledger

    book = ledger(db, activity_id)
    counted_total = float(book["counted_total"]) if book else 0.0
    man_days = round(sum(r.man_days() for r in attributed), 2)
    multi = [r for r in attributed if len(r.activity_list()) > 1]

    if man_days <= 0:
        return {
            "activity_id": activity_id,
            "rate": None,
            "uom": activity.uom or "",
            "man_days": man_days,
            "musters": len(attributed),
            "reason": "zero_man_days",
            "note": "Musters exist but record nobody present.",
        }
    if counted_total <= 0:
        return {
            "activity_id": activity_id,
            "rate": None,
            "uom": activity.uom or "",
            "man_days": man_days,
            "musters": len(attributed),
            "reason": "no_measured_quantity",
            "note": (
                "Manpower was mustered against this activity but no measured "
                "quantity is attributed to it, so there is nothing to divide."
            ),
        }

    return {
        "activity_id": activity_id,
        "rate": round(counted_total / man_days, 3),
        "uom": activity.uom or "",
        "quantity": counted_total,
        "man_days": man_days,
        "musters": len(attributed),
        "crews": sorted({r.crew_id for r in attributed}),
        "reason": None,
        "shared_musters": len(multi),
        "note": (
            f"{counted_total:g} {activity.uom or 'unit'} over {man_days:g} "
            f"man-days from {len(attributed)} musters."
            + (
                f" {len(multi)} of those musters covered more than one activity "
                "and are attributed in full to each, so this rate is a lower "
                "bound."
                if multi else ""
            )
        ),
    }


def productivity_norms(db: Session) -> dict[str, dict]:
    """Quantity per man-day by activity-type prefix, from completed work.

    Keyed the way `productivity.activity_type` keys comparables — `CIV-FDN`
    from `CIV-FDN-1007` — so a norm and a duration comparable describe the same
    family of work. This is the denominator `weekly_demand` divides by, and it
    is the reason demand can be refused rather than guessed.
    """
    grouped: dict[str, list[dict]] = defaultdict(list)
    for activity in db.query(Activity).filter(Activity.actual_finish.isnot(None)).all():
        rate = man_day_rate(db, activity.activity_id)
        if rate and rate.get("rate"):
            grouped[activity_type(activity.activity_id)].append(rate)

    norms: dict[str, dict] = {}
    for prefix, rows in grouped.items():
        rates_only = [r["rate"] for r in rows]
        norms[prefix] = {
            "qty_per_man_day": round(sum(rates_only) / len(rates_only), 3),
            "sample": len(rates_only),
            "uom": rows[0]["uom"],
        }
    return norms


# ── Capacity: the crew-bandwidth reading ────────────────────────────────────

def _working_days(start: date, end: date) -> int:
    """Calendar days inclusive.

    Calendar, not working, days — the same convention and the same admission
    the critical-path pass makes (D-082). `Activity.calendar` exists on the
    model and nothing populates it; a five-day week would give different
    numbers and this module would rather be consistent with CPM than
    independently wrong.
    """
    return max(0, (end - start).days + 1)


def _overlap_days(a_from: date, a_to: date, b_from: date, b_to: date) -> int:
    """Days two spans share."""
    lo, hi = max(a_from, b_from), min(a_to, b_to)
    return _working_days(lo, hi) if lo <= hi else 0


def crew_capacity(db: Session, crew_id: str, start: date, end: date) -> Optional[dict]:
    """One crew's bandwidth over a span: what it can field, what it owes.

    `supply_man_days` is strength × days, scaled by measured reliability where
    there is any. `basis` names which it was, because a nominal supply figure
    and a reliability-adjusted one differ by exactly the amount a planner needs
    to know about.
    """
    crew = db.query(Crew).filter(Crew.crew_id == crew_id).first()
    if crew is None:
        return None

    days = _working_days(start, end)
    reliability = crew_reliability(db, crew_id, end)
    nominal = crew.planned_strength * days
    supply = nominal * reliability if reliability is not None else nominal

    assignments = (
        db.query(ResourceAssignment)
        .filter(
            ResourceAssignment.crew_id == crew_id,
            ResourceAssignment.status == STATUS_COMMITTED,
        )
        .all()
    )
    committed = sum(
        a.allocated_strength * _overlap_days(a.from_date, a.to_date, start, end)
        for a in assignments
    )

    return {
        "crew_id": crew_id,
        "name": crew.name,
        "discipline": crew.discipline,
        "contractor": crew.contractor,
        "planned_strength": crew.planned_strength,
        "days": days,
        "reliability": reliability,
        "basis": "reliability_adjusted" if reliability is not None else "nominal",
        "nominal_man_days": nominal,
        "supply_man_days": round(supply, 2),
        "committed_man_days": committed,
        "headroom_man_days": round(supply - committed, 2),
        "utilisation_pct": round(committed / supply * 100.0, 1) if supply else None,
        "overcommitted": committed > supply,
    }


def double_bookings(db: Session) -> list[dict]:
    """Crews committed to two activities over overlapping spans.

    Committed rows only. Two competing PROPOSALS are not a fault — that is what
    a proposal is for — and flagging them would train a planner to ignore the
    warning that matters.
    """
    rows = (
        db.query(ResourceAssignment)
        .filter(ResourceAssignment.status == STATUS_COMMITTED)
        .order_by(ResourceAssignment.crew_id, ResourceAssignment.from_date)
        .all()
    )
    by_crew: dict[str, list[ResourceAssignment]] = defaultdict(list)
    for row in rows:
        by_crew[row.crew_id].append(row)

    clashes: list[dict] = []
    for crew_id, items in by_crew.items():
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                if not a.overlaps(b.from_date, b.to_date):
                    continue
                clashes.append(
                    {
                        "crew_id": crew_id,
                        "assignment_ids": [a.id, b.id],
                        "activity_ids": [a.activity_id, b.activity_id],
                        "overlap_from": max(a.from_date, b.from_date),
                        "overlap_to": min(a.to_date, b.to_date),
                        "overlap_days": _overlap_days(
                            a.from_date, a.to_date, b.from_date, b.to_date
                        ),
                        "strength": [a.allocated_strength, b.allocated_strength],
                    }
                )
    return clashes


# ── Allocation: demand against supply, week by week ─────────────────────────

def weekly_demand(
    db: Session, week_start: date, week_end: date, norms: dict[str, dict]
) -> tuple[dict[str, float], list[dict]]:
    """Man-days the SCHEDULE asks for in one week, by discipline.

    Derivation, stated plainly because every term is a choice:

        the activity's planned quantity is prorated across its planned span
        by calendar days, the part landing inside the week is divided by the
        quantity-per-man-day norm for its activity type, and the result is
        charged to its discipline.

    An activity whose type has no norm contributes NOTHING and is returned in
    the second element. It is not estimated from a neighbouring discipline and
    not assumed to be zero work — it is named, so the board can show "demand
    excludes 14 activities with no norm" instead of quietly under-reporting.
    """
    demand: dict[str, float] = defaultdict(float)
    not_derivable: list[dict] = []

    activities = (
        db.query(Activity)
        .filter(
            Activity.planned_start <= week_end,
            Activity.planned_finish >= week_start,
        )
        .all()
    )
    for act in activities:
        span = _working_days(act.planned_start, act.planned_finish)
        inside = _overlap_days(
            act.planned_start, act.planned_finish, week_start, week_end
        )
        if not span or not inside:
            continue
        qty_in_week = float(act.planned_qty or 0) * (inside / span)
        norm = norms.get(activity_type(act.activity_id))
        if not norm or not norm["qty_per_man_day"]:
            not_derivable.append(
                {
                    "activity_id": act.activity_id,
                    "discipline": act.discipline,
                    "description": act.description,
                    "planned_qty_in_week": round(qty_in_week, 2),
                    "uom": act.uom or "",
                    "reason": "no_productivity_norm",
                }
            )
            continue
        demand[act.discipline] += qty_in_week / norm["qty_per_man_day"]

    return {k: round(v, 2) for k, v in demand.items()}, not_derivable


def allocation_board(db: Session, week_start: date, weeks: int = 4) -> dict:
    """The Project Manager's allocation view: demand, supply, committed, gap.

    One row per discipline per week. `gap` is what the schedule needs and
    nobody has been committed to; `headroom` is crew bandwidth that exists and
    is not being used. A week can carry both at once — that is a deployment
    problem rather than a manpower problem, and it is the single most useful
    thing this board can tell anybody.
    """
    norms = productivity_norms(db)
    crews = db.query(Crew).filter(Crew.active.is_(True)).all()
    by_discipline: dict[str, list[Crew]] = defaultdict(list)
    for crew in crews:
        by_discipline[crew.discipline].append(crew)

    out_weeks: list[dict] = []
    excluded: list[dict] = []
    for w in range(weeks):
        w_start = week_start + timedelta(days=7 * w)
        w_end = w_start + timedelta(days=6)
        demand, not_derivable = weekly_demand(db, w_start, w_end, norms)
        excluded.extend(not_derivable)

        disciplines = sorted(set(demand) | set(by_discipline))
        rows = []
        for disc in disciplines:
            caps = [
                crew_capacity(db, c.crew_id, w_start, w_end)
                for c in by_discipline.get(disc, [])
            ]
            caps = [c for c in caps if c]
            supply = round(sum(c["supply_man_days"] for c in caps), 2)
            committed = round(sum(c["committed_man_days"] for c in caps), 2)
            need = demand.get(disc, 0.0)
            rows.append(
                {
                    "discipline": disc,
                    "crews": len(caps),
                    "demand_man_days": round(need, 2),
                    "supply_man_days": supply,
                    "committed_man_days": committed,
                    "headroom_man_days": round(supply - committed, 2),
                    "gap_man_days": round(max(0.0, need - committed), 2),
                    "utilisation_pct": (
                        round(committed / supply * 100.0, 1) if supply else None
                    ),
                    # Nominal where any crew in the discipline is unmeasured:
                    # one unmeasured crew makes the whole discipline's supply
                    # figure part-assumption, and the weaker claim must win.
                    "supply_basis": (
                        "nominal"
                        if any(c["basis"] == "nominal" for c in caps)
                        else "reliability_adjusted"
                    ),
                }
            )

        out_weeks.append(
            {
                "week_start": w_start,
                "week_end": w_end,
                "rows": sorted(rows, key=lambda r: -r["gap_man_days"]),
                "total_demand": round(sum(r["demand_man_days"] for r in rows), 2),
                "total_supply": round(sum(r["supply_man_days"] for r in rows), 2),
                "total_committed": round(sum(r["committed_man_days"] for r in rows), 2),
            }
        )

    # De-duplicated: an activity spanning four weeks would otherwise be listed
    # four times in one exclusion notice.
    seen: set[str] = set()
    unique_excluded = []
    for row in excluded:
        if row["activity_id"] in seen:
            continue
        seen.add(row["activity_id"])
        unique_excluded.append(row)

    return {
        "week_start": week_start,
        "weeks": weeks,
        "norms": norms,
        "weeks_detail": out_weeks,
        "demand_not_derivable": unique_excluded,
        "double_bookings": double_bookings(db),
    }


# ── Attendance as delay evidence ────────────────────────────────────────────

def shortfall_evidence(
    db: Session, activity_id: str, window_days: int = 14
) -> Optional[dict]:
    """Whether the musters support calling this activity's slip a MANPOWER one.

    This is the function `delay_taxonomy.MANPOWER` never had. It returns
    `supports_manpower_cause` as a THREE-state answer — True, False, or None
    for "no register was kept" — because the difference between "the crews were
    there and it still slipped" and "nobody wrote down whether the crews were
    there" is the difference between a defensible classification and a guess.
    """
    activity = db.query(Activity).filter(Activity.activity_id == activity_id).first()
    if activity is None:
        return None

    anchor = activity.actual_start or activity.planned_start
    if anchor is None:
        return None
    start = anchor
    end = (activity.actual_finish or anchor + timedelta(days=window_days))

    attributed = [
        r for r in musters(db, start, end) if activity_id in r.activity_list()
    ]
    if not attributed:
        return {
            "activity_id": activity_id,
            "window": {"from": start, "to": end},
            "musters": 0,
            "supports_manpower_cause": None,
            "reason": "no_register",
            "note": (
                "No muster covers this activity in the window. A MANPOWER "
                "classification here is an assertion, not a finding."
            ),
        }

    block = _attendance_block(attributed)
    short_days = sorted(
        {
            r.attendance_date
            for r in attributed
            if r.planned_strength and r.present < r.planned_strength * SHORTFALL_ALERT_RATIO
        }
    )
    pct = block["attendance_pct"]
    supports = pct is not None and pct < SHORTFALL_ALERT_RATIO * 100

    return {
        "activity_id": activity_id,
        "window": {"from": start, "to": end},
        **block,
        "short_days": short_days,
        "supports_manpower_cause": supports,
        "reason": "shortfall_observed" if supports else "strength_fielded",
        "note": (
            f"Crews fielded {pct}% of contracted strength across "
            f"{block['musters']} musters"
            + (
                f", short on {len(short_days)} day(s). The register supports a "
                "MANPOWER cause."
                if supports else
                ". The register does NOT support a MANPOWER cause — the "
                "manpower was there."
            )
        ),
    }
