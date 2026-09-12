"""Connectivity: whether "near real-time" was true today.

WHY THIS MODULE EXISTS
----------------------
NAVIS's central claim is that actual progress reaches the schedule in near real
time. At a well-site in Duliajan that claim is only ever as good as the link,
and nothing in this codebase recorded whether the link was there.

The consequence was a silent ambiguity with opposite remedies. A discipline that
has not reported for three days is either:

    no work happened            → a schedule problem, chase the contractor
    no signal reached us        → a capture problem, chase the connectivity

A planner looking at NAVIS could not tell those apart, and would act on the
first reading because it is the only one the UI offered.

WHAT "BANDWIDTH" MEANS HERE
---------------------------
Two things, deliberately kept separate rather than merged into one score:

    LINK bandwidth      kbps and round-trip time between a device and this
                        server. Measured by the client against /health,
                        reported here. This module.

    CREW bandwidth      how much more work a gang could absorb.
                        `workforce.crew_capacity`. Not this module.

They are both real and they are not the same quantity. A dashboard that
averaged them would be meaningless.

THE DEGRADATION LADDER IS DECLARED, NOT INFERRED
------------------------------------------------
    rich     voice capture and the optional model are both in play
    lean     text only; no audio upload, no model round-trip
    offline  nothing leaves the device; submissions queue locally

The CLIENT declares which rung it is on, because the client is the only party
that knows what it actually did with the link. The server records the claim and
timestamps it. Inferring the mode from measured kbps server-side would be
guessing about a decision that was already made on the device.

Crucially, the ladder is about CAPTURE, never about CORRECTNESS. A lean-mode
report is a complete report: D-005 already makes the LLM optional and off by
default, so dropping to lean removes an assist, not a guarantee. Nothing in
this module lowers a confidence score because the link was bad.

NOT AN AUDIT TABLE
------------------
`device_sessions` is latest-write-wins liveness. A permanent row per ping would
be noise, and `samples` keeps a short capped window so a trend survives without
the table growing without bound.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from server.db import Activity, AttendanceRecord, Crew, DeviceSession, LinkedEvent

# The three rungs. Declared by the client; validated here so an unknown string
# cannot enter the database and break every consumer that switches on it.
MODE_RICH = "rich"
MODE_LEAN = "lean"
MODE_OFFLINE = "offline"
MODES: tuple[str, ...] = (MODE_RICH, MODE_LEAN, MODE_OFFLINE)

# Kept per device. Twenty samples at the client's own cadence is enough to draw
# a sparkline and little enough that the row stays small.
MAX_SAMPLES = 20

# A device unheard-of for this long is not "online" regardless of what its last
# ping claimed. Three minutes rather than one: a supervisor walking between work
# fronts loses signal routinely, and flapping a status every 60 seconds would
# make the planner's board unreadable.
STALE_AFTER = timedelta(minutes=3)

# Bands for the link itself. Named bands rather than a raw number on the UI,
# because 180 kbps means nothing to a planner and "enough for text, not audio"
# means everything. Boundaries are about what NAVIS actually sends: a voice
# upload is tens of KB, a structured report is under 2 KB.
BAND_GOOD_KBPS = 256.0
BAND_WEAK_KBPS = 64.0


def classify_link(kbps: Optional[float], rtt_ms: Optional[float]) -> str:
    """A band for one link sample: good / weak / poor / unknown.

    `unknown` when nothing was measured, never "poor". An unmeasured link and a
    bad link are different facts, and defaulting the first to the second would
    show a planner a site-wide outage every time a client failed to time a
    request.
    """
    if kbps is None and rtt_ms is None:
        return "unknown"
    if kbps is not None:
        if kbps >= BAND_GOOD_KBPS:
            return "good"
        if kbps >= BAND_WEAK_KBPS:
            return "weak"
        return "poor"
    # RTT only. Thresholds chosen to agree with the kbps bands on the link
    # types this actually runs over — 4G, then 2G/EDGE, then a dying cell.
    if rtt_ms is None:
        return "unknown"
    if rtt_ms <= 300:
        return "good"
    if rtt_ms <= 1200:
        return "weak"
    return "poor"


def record_heartbeat(
    db: Session,
    device_id: str,
    role: str,
    mode: str,
    kbps: Optional[float] = None,
    rtt_ms: Optional[float] = None,
    queue_depth: int = 0,
    queue_bytes: int = 0,
    label: Optional[str] = None,
) -> DeviceSession:
    """Upsert one device's liveness, appending a capped sample.

    Unknown modes are coerced to `lean` rather than rejected with a 422. A
    heartbeat is telemetry from a client that may be a version behind; failing
    it would lose the liveness signal entirely to protect a field whose only
    consumer is a label. The coercion is to the MIDDLE rung deliberately —
    claiming `rich` for an unparseable client would overstate what it can do.
    """
    if mode not in MODES:
        mode = MODE_LEAN

    now = datetime.utcnow()
    session = (
        db.query(DeviceSession).filter(DeviceSession.device_id == device_id).first()
    )
    if session is None:
        session = DeviceSession(
            device_id=device_id,
            role=role,
            label=label,
            first_seen=now,
        )
        db.add(session)

    session.role = role or session.role
    if label:
        session.label = label
    session.last_seen = now
    session.mode = mode
    session.measured_kbps = kbps
    session.rtt_ms = rtt_ms
    session.queue_depth = max(0, int(queue_depth or 0))
    session.queue_bytes = max(0, int(queue_bytes or 0))

    samples = session.sample_list()
    samples.append(
        {
            "at": now.isoformat(),
            "kbps": kbps,
            "rtt_ms": rtt_ms,
            "mode": mode,
            "band": classify_link(kbps, rtt_ms),
            "queue_depth": session.queue_depth,
        }
    )
    session.samples = json.dumps(samples[-MAX_SAMPLES:])

    db.commit()
    db.refresh(session)
    return session


def _session_view(session: DeviceSession, now: datetime) -> dict:
    """One device as the planner's board shows it."""
    age = now - (session.last_seen or now)
    online = age <= STALE_AFTER
    return {
        "device_id": session.device_id,
        "role": session.role,
        "label": session.label,
        "first_seen": session.first_seen,
        "last_seen": session.last_seen,
        "seconds_since_seen": int(age.total_seconds()),
        "online": online,
        # A device that has gone quiet is reported as `offline` whatever its
        # last ping claimed. The stored mode is what it SAID; this is what is
        # true now, and the board needs the second one.
        "mode": session.mode if online else MODE_OFFLINE,
        "declared_mode": session.mode,
        "measured_kbps": session.measured_kbps,
        "rtt_ms": session.rtt_ms,
        "band": classify_link(session.measured_kbps, session.rtt_ms) if online else "unknown",
        "queue_depth": session.queue_depth,
        "queue_bytes": session.queue_bytes,
        "samples": session.sample_list(),
    }


def device_board(db: Session) -> dict:
    """Every known device, offline first.

    Offline first because this board exists to answer "who is not reaching us",
    and the answer should not be below the fold.
    """
    now = datetime.utcnow()
    views = [_session_view(s, now) for s in db.query(DeviceSession).all()]
    views.sort(key=lambda v: (v["online"], -v["seconds_since_seen"]))

    online = [v for v in views if v["online"]]
    return {
        "devices": views,
        "total": len(views),
        "online": len(online),
        "offline": len(views) - len(online),
        "queued_submissions": sum(v["queue_depth"] for v in views),
        "queued_bytes": sum(v["queue_bytes"] for v in views),
        # None, not "unknown", when nothing is online: a worst band computed
        # over an empty set would read as a site-wide outage or as perfect
        # health depending on which default was picked, and both are wrong.
        "worst_band": (
            min(
                (v["band"] for v in online if v["band"] != "unknown"),
                key=lambda b: ("poor", "weak", "good").index(b),
                default=None,
            )
            if online else None
        ),
    }


def reporting_lag(db: Session, days: int = 14) -> dict:
    """How long capture-to-server actually took, per discipline.

    `LinkedEvent.reported_date` is the day the work is claimed for;
    `created_at` is when it reached this server. The difference is the lag the
    near-real-time claim lives or dies on, and it is measurable from data that
    was already being stored — no new instrumentation, and it works
    retroactively over the existing corpus.

    Reported per discipline because that is the unit that goes quiet: one
    supervisor losing signal silences one discipline, and a project-wide median
    would hide it completely.
    """
    cutoff = date.today() - timedelta(days=days)
    events = (
        db.query(LinkedEvent)
        .filter(LinkedEvent.reported_date.isnot(None))
        .filter(LinkedEvent.reported_date >= cutoff)
        .all()
    )
    activities = {
        a.activity_id: a.discipline
        for a in db.query(Activity.activity_id, Activity.discipline).all()
    }

    per_discipline: dict[str, list[float]] = {}
    latest: dict[str, date] = {}
    for event in events:
        disc = activities.get(event.activity_id) or "unmatched"
        if event.created_at is None:
            continue
        lag_hours = (
            event.created_at - datetime.combine(event.reported_date, datetime.min.time())
        ).total_seconds() / 3600.0
        # A negative lag means a report was filed for a future date. Real, and
        # not a connectivity fact, so it is excluded from the lag figure rather
        # than dragging a median below zero.
        if lag_hours < 0:
            continue
        per_discipline.setdefault(disc, []).append(lag_hours)
        if disc not in latest or event.reported_date > latest[disc]:
            latest[disc] = event.reported_date

    def _median(xs: list[float]) -> Optional[float]:
        if not xs:
            return None
        ordered = sorted(xs)
        mid = len(ordered) // 2
        if len(ordered) % 2:
            return round(ordered[mid], 1)
        return round((ordered[mid - 1] + ordered[mid]) / 2, 1)

    today = date.today()
    rows = [
        {
            "discipline": disc,
            "events": len(lags),
            "median_lag_hours": _median(lags),
            "max_lag_hours": round(max(lags), 1),
            "last_reported_on": latest.get(disc),
            "days_since_last_report": (
                (today - latest[disc]).days if disc in latest else None
            ),
        }
        for disc, lags in per_discipline.items()
    ]
    # Silent disciplines are the point of this endpoint, so they sort first.
    rows.sort(key=lambda r: -(r["days_since_last_report"] or 0))

    all_lags = [lag for lags in per_discipline.values() for lag in lags]
    return {
        "window_days": days,
        "rows": rows,
        "events": len(all_lags),
        "median_lag_hours": _median(all_lags),
        "silent_disciplines": [
            r["discipline"] for r in rows if (r["days_since_last_report"] or 0) >= 3
        ],
    }


def capture_coverage(db: Session, on: Optional[date] = None) -> dict:
    """Which disciplines produced anything at all on one day, and by what means.

    The honest denominator for "is the site reporting": disciplines that have a
    crew on the books, not disciplines that happened to send something. A
    discipline with crews and no submission is the row that matters, and it can
    only exist if crews define the denominator.
    """
    on = on or date.today()
    expected = {
        c.discipline for c in db.query(Crew).filter(Crew.active.is_(True)).all()
    }
    activities = {
        a.activity_id: a.discipline
        for a in db.query(Activity.activity_id, Activity.discipline).all()
    }

    reported: dict[str, int] = {}
    for event in (
        db.query(LinkedEvent).filter(LinkedEvent.reported_date == on).all()
    ):
        disc = activities.get(event.activity_id) or "unmatched"
        reported[disc] = reported.get(disc, 0) + 1

    mustered = {
        crew_disc
        for crew_disc in (
            db.query(Crew.discipline)
            .join(AttendanceRecord, AttendanceRecord.crew_id == Crew.crew_id)
            .filter(AttendanceRecord.attendance_date == on)
            .distinct()
            .all()
        )
        for crew_disc in crew_disc
    }

    rows = [
        {
            "discipline": disc,
            "progress_events": reported.get(disc, 0),
            "attendance_marked": disc in mustered,
            # "silent" is the flag a planner acts on: no progress AND no muster
            # from a discipline that has crews on site.
            "silent": reported.get(disc, 0) == 0 and disc not in mustered,
        }
        for disc in sorted(expected | set(reported))
    ]
    return {
        "date": on,
        "rows": rows,
        "expected_disciplines": len(expected),
        "reporting": len([r for r in rows if not r["silent"]]),
        "silent": [r["discipline"] for r in rows if r["silent"]],
    }
