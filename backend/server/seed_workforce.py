"""Seed the muster register, the crew roster and the allocation board.

WHY THIS IS SYNTHETIC, AND WHY IT IS NOT ARBITRARY
--------------------------------------------------
The problem statement is explicit that live project data will not be shared and
that teams should work with synthetic data of similar structure. So this
generates a register — but it generates one that AGREES with the corpus that is
already in `dataset/`, rather than one that merely looks plausible.

Every shortfall below is anchored to something a source document actually says:

    2026-08-15  a national holiday, named in the header of dpr_day_10
    2026-09-02  "Rain since morning, intermittent" — dpr_day_02's own header
    2026-09-14  "Labour kam tha aaj so went slow" and "Backfill at the rack
                trenches - kaam chalu hai... Labour kam tha aaj" — dpr_day_11

That matters for a reason beyond tidiness. `workforce.shortfall_evidence`
decides whether the register supports a MANPOWER delay classification. If the
register were random, that function would confirm or refute delay causes at
random too, and the whole evidence chain would be theatre. Anchoring the
shortfalls to the DPR text means the attendance data and the progress data tell
the same story, which is exactly the property a reviewer should check.

DETERMINISTIC
-------------
Seeded from a fixed constant, so two runs produce the same register and a
screenshot taken today still matches the database tomorrow.

NO PEOPLE
---------
Crews, never names. There is no user table, no authentication, and an
append-only register is the last place personal data should be written
permanently.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta

from sqlalchemy.orm import Session

from server.db import Activity, AttendanceRecord, Crew, ResourceAssignment

SEED = 26122  # the problem statement number, so the constant is traceable

# The register runs over the window the DPR corpus covers, not the whole
# baseline: musters for months nobody filed a report about would be fabrication
# with no counterpart in the evidence.
WINDOW_START = date(2026, 8, 1)
CORPUS_WINDOW_END = date(2026, 9, 15)


def window_end(on: date | None = None) -> date:
    """Last day the register covers.

    The corpus window ends 2026-09-15. Stopping there means that on any day
    after it the field app's muster reads "0 of 12 crews marked" for a reason
    that has nothing to do with the field: the register simply ran out. The
    days past the corpus carry the ordinary per-crew band only — no anchored
    reason, because no source document speaks for them — so they demonstrate
    the screen without claiming evidence they do not have.
    """
    today = on or date.today()
    return max(CORPUS_WINDOW_END, today)


WINDOW_END = window_end()

# One or two gangs per discipline, sized against the discipline's share of the
# 120-activity baseline. Contractors are the two named in the DPR headers plus
# one subcontractor, so the contractor-reliability ranking has something real
# to rank.
CREWS: tuple[dict, ...] = (
    dict(crew_id="CIV-TEAM-01", name="Civil Team 1", discipline="civil",
         contractor="ABC Infra Pvt Ltd", trade="mason", planned_strength=18),
    dict(crew_id="CIV-TEAM-02", name="Civil Team 2", discipline="civil",
         contractor="ABC Infra Pvt Ltd", trade="steel_fixer", planned_strength=12),
    dict(crew_id="PIP-TEAM-01", name="Piping Team 1", discipline="piping",
         contractor="ABC Infra Pvt Ltd", trade="fitter", planned_strength=22),
    dict(crew_id="PIP-TEAM-02", name="Piping Team 2", discipline="piping",
         contractor="Northeast Mechanical Works", trade="welder", planned_strength=14),
    dict(crew_id="EQP-TEAM-01", name="Equipment Team", discipline="static_equipment",
         contractor="Northeast Mechanical Works", trade="rigger", planned_strength=16),
    dict(crew_id="ELE-TEAM-01", name="Electrical Team", discipline="electrical",
         contractor="Brahmaputra Electricals", trade="electrician", planned_strength=14),
    dict(crew_id="INS-TEAM-01", name="Instrumentation Team", discipline="instrumentation",
         contractor="Brahmaputra Electricals", trade="instrument_tech", planned_strength=9),
    dict(crew_id="HSE-TEAM-01", name="HSE Team", discipline="hse",
         contractor="ABC Infra Pvt Ltd", trade="safety_steward", planned_strength=6),
    # Second-wave teams. Same three contractors, distinct trades, so the roster
    # covers every discipline the 120-activity baseline actually schedules and
    # the allocation board has spare capacity to move around rather than a
    # single team per discipline that can only ever be committed once.
    dict(crew_id="CIV-TEAM-03", name="Civil Team 3", discipline="civil",
         contractor="Northeast Mechanical Works", trade="shuttering_carpenter",
         planned_strength=15),
    dict(crew_id="PIP-TEAM-03", name="Piping Team 3", discipline="piping",
         contractor="Northeast Mechanical Works", trade="pipe_fabricator",
         planned_strength=11),
    dict(crew_id="EQP-TEAM-02", name="Equipment Team 2", discipline="static_equipment",
         contractor="Brahmaputra Electricals", trade="millwright",
         planned_strength=10),
    dict(crew_id="INS-TEAM-02", name="Instrumentation Team 2",
         discipline="instrumentation", contractor="Brahmaputra Electricals",
         trade="loop_tester", planned_strength=7),
)

# Days the corpus itself explains, and the reason each one carries.
#
#   ratio  the fraction of contracted strength that turned up
#   reason the absence bucket the missing heads go into
HOLIDAY = date(2026, 8, 15)          # dpr_day_10 header: "Holiday: Independence Day"
RAIN_DAY = date(2026, 9, 2)          # dpr_day_02 header: "Rain since morning"
SHORT_LABOUR_DAY = date(2026, 9, 14)  # dpr_day_11: "Labour kam tha aaj so went slow"

CORPUS_ANCHORED_DAYS: dict[date, dict] = {
    HOLIDAY: {"ratio": 0.15, "reason": "leave",
              "note": "Independence Day — named in the DPR header for this date"},
    RAIN_DAY: {"ratio": 0.55, "reason": "weather",
               "note": "Rain since morning, intermittent — DPR header for this date"},
    SHORT_LABOUR_DAY: {"ratio": 0.45, "reason": "no_show",
                       "note": "\"Labour kam tha aaj so went slow\" — DPR remark"},
}

# Sundays are a rest day on the 6-day site calendar.
#
# The row is written, but with a CONTRACTED STRENGTH OF ZERO rather than with
# the crew's strength and nobody present. That distinction is the whole design:
#
#   planned 18, present 0   →  the gang was due and did not come. A shortfall.
#   planned 0,  present 0   →  nothing was due. Not a shortfall.
#   no row at all           →  nobody counted. Neither of the above.
#
# Writing rest days as the first shape is what made every contractor score
# ~71% and read as unreliable — an artefact of the calendar, not a fact about
# the contractor. With a zero denominator the day drops out of every
# percentage and every reliability figure on its own, because
# `_attendance_block` already returns None for `attendance_pct` when nothing
# was planned. No special case is needed anywhere downstream.


def _activities_by_discipline(db: Session) -> dict[str, list[str]]:
    """Activity ids per discipline, in schedule order.

    Musters name the activities a crew worked, and those ids have to be real:
    `POST /workforce/attendance` refuses an unknown one, and an unattributable
    id would make the man-day denominator silently wrong later.
    """
    out: dict[str, list[str]] = {}
    for act in db.query(Activity).order_by(Activity.planned_start).all():
        out.setdefault(act.discipline, []).append(act.activity_id)
    return out


def _open_on(db: Session, discipline: str, on: date) -> list[str]:
    """Activities of one discipline whose planned span covers `on`."""
    return [
        a.activity_id
        for a in db.query(Activity)
        .filter(
            Activity.discipline == discipline,
            Activity.planned_start <= on,
            Activity.planned_finish >= on,
        )
        .order_by(Activity.planned_start)
        .limit(3)
        .all()
    ]


def seed_crews(db: Session) -> int:
    """Create the roster. Idempotent — an existing crew is left alone."""
    created = 0
    for spec in CREWS:
        if db.query(Crew).filter(Crew.crew_id == spec["crew_id"]).first():
            continue
        db.add(Crew(**spec, shift="day", active=True))
        created += 1
    db.commit()
    return created


def seed_attendance(db: Session) -> int:
    """Write the muster register over the corpus window.

    Ordinary days vary within a narrow band around each crew's own baseline
    reliability, so `crew_reliability` has a real distribution to measure
    rather than a constant. The three corpus-anchored days override that band,
    because those are the days the source documents explain.
    """
    rng = random.Random(SEED)
    crews = db.query(Crew).all()
    if not crews:
        return 0

    # Per-crew baseline attendance. Spread deliberately: a register where every
    # contractor performs identically cannot rank contractors, and ranking them
    # is one of the three things the executive lane asks of this data.
    baselines = {
        "CIV-TEAM-01": 0.94, "CIV-TEAM-02": 0.90,
        "PIP-TEAM-01": 0.88, "PIP-TEAM-02": 0.79,
        "EQP-TEAM-01": 0.92, "ELE-TEAM-01": 0.85,
        "INS-TEAM-01": 0.91, "HSE-TEAM-01": 0.97,
        "CIV-TEAM-03": 0.87, "PIP-TEAM-03": 0.93,
        "EQP-TEAM-02": 0.83, "INS-TEAM-02": 0.95,
    }

    written = 0
    # Recomputed here rather than read off the module constant so a re-seed on
    # a later day extends the register to that day instead of to import time.
    end = window_end()
    day = WINDOW_START
    while day <= end:
        anchored = CORPUS_ANCHORED_DAYS.get(day)
        rest_day = day.weekday() == 6  # Sunday

        for crew in crews:
            if anchored:
                ratio, reason = anchored["ratio"], anchored["reason"]
                note = anchored["note"]
            elif rest_day:
                ratio, reason = None, None
                note = "Rest day — 6-day site calendar; no strength contracted"
            else:
                base = baselines.get(crew.crew_id, 0.9)
                ratio = min(1.0, max(0.55, rng.gauss(base, 0.06)))
                reason, note = rng.choice(("sick", "leave", "no_show")), None

            if ratio is None:
                # Rest day: nothing contracted, so nothing missing.
                contracted, present, absent, reasons = 0, 0, 0, {}
            else:
                contracted = crew.planned_strength
                present = int(round(contracted * ratio))
                absent = contracted - present
                reasons = {reason: absent} if absent > 0 else {}

            db.add(
                AttendanceRecord(
                    crew_id=crew.crew_id,
                    attendance_date=day,
                    shift="day",
                    planned_strength=contracted,
                    present=present,
                    absent=absent,
                    absence_reasons=json.dumps(reasons),
                    activity_ids=json.dumps(_open_on(db, crew.discipline, day)),
                    source="field_app",
                    reported_by="field",
                    note=note,
                )
            )
            written += 1
        day += timedelta(days=1)

    db.commit()
    return written


def seed_assignments(db: Session) -> int:
    """A small allocation board: some committed, one proposal, one refusal.

    All three states exist on purpose. A board showing only commitments cannot
    demonstrate the rule that matters — that a supervisor proposes and only the
    Project Manager commits — and the withdrawn row is the one a delay claim
    would later point at.
    """
    crews = {c.crew_id: c for c in db.query(Crew).all()}
    if not crews:
        return 0

    by_discipline = _activities_by_discipline(db)
    plan = [
        ("CIV-TEAM-01", "civil", 0, "committed", 14, "planner"),
        ("PIP-TEAM-01", "piping", 0, "committed", 18, "planner"),
        ("PIP-TEAM-02", "piping", 1, "committed", 10, "planner"),
        ("ELE-TEAM-01", "electrical", 0, "committed", 11, "planner"),
        # Asked for by the field, still waiting on the PM.
        ("CIV-TEAM-02", "civil", 1, "proposed", 8, None),
        # Asked for and refused. Kept, because "manpower was requested and
        # declined" is exactly the fact a delay claim turns on.
        ("EQP-TEAM-01", "static_equipment", 1, "withdrawn", 12, "planner"),
        # The rest of the board. Every crew appears at most once, so none of
        # these create the overlapping spans `double_bookings` is meant to
        # catch — the clash panel stays a real signal rather than seed noise.
        ("CIV-TEAM-03", "civil", 2, "committed", 12, "planner"),
        ("EQP-TEAM-02", "static_equipment", 0, "committed", 9, "planner"),
        ("INS-TEAM-01", "instrumentation", 0, "committed", 7, "planner"),
        ("HSE-TEAM-01", "hse", 0, "committed", 5, "planner"),
        ("PIP-TEAM-03", "piping", 2, "proposed", 9, None),
        ("INS-TEAM-02", "instrumentation", 1, "proposed", 6, None),
    ]

    from server.db import _now

    written = 0
    for crew_id, discipline, offset, status, strength, decider in plan:
        ids = by_discipline.get(discipline, [])
        if crew_id not in crews or len(ids) <= offset:
            continue
        activity_id = ids[offset]
        activity = (
            db.query(Activity).filter(Activity.activity_id == activity_id).first()
        )
        crew = crews[crew_id]
        rationale = ["discipline_match" if crew.discipline == discipline
                     else "discipline_mismatch"]
        if crew.trade:
            rationale.append(f"trade:{crew.trade}")
        rationale.append("reliability_measured")

        db.add(
            ResourceAssignment(
                crew_id=crew_id,
                activity_id=activity_id,
                from_date=max(activity.planned_start, WINDOW_START),
                to_date=min(activity.planned_finish, window_end()),
                allocated_strength=strength,
                status=status,
                rationale=",".join(rationale),
                requested_by="field" if status != "committed" else "planner",
                decided_by=decider,
                decided_at=_now() if decider else None,
                note=(
                    "No crew to spare this cycle"
                    if status == "withdrawn" else None
                ),
            )
        )
        written += 1
    db.commit()
    return written


def seed_all(db: Session) -> dict:
    """Everything, in dependency order. Safe to run twice."""
    crews = seed_crews(db)
    attendance = 0
    assignments = 0
    if db.query(AttendanceRecord).count() == 0:
        attendance = seed_attendance(db)
    if db.query(ResourceAssignment).count() == 0:
        assignments = seed_assignments(db)
    return {"crews": crews, "attendance": attendance, "assignments": assignments}
