"""The workforce layer: attendance, capacity and allocation.

The properties that matter more than any individual number:

  1. The muster register is APPEND-ONLY. A correction writes a new row and the
     corrected row is untouched — not even a flag — so "which reading is
     current" is always derivable and can never disagree with itself.
  2. A shortfall computed today stays true tomorrow. Re-sizing a crew must not
     silently rewrite last month's attendance percentage.
  3. Nothing is invented. No productivity norm is guessed, no unmeasured crew
     is treated as perfectly reliable, and no absent figure reads as zero.
  4. A Field Supervisor cannot commit manpower. The creating path has no way to
     express `committed` at all.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import workforce
from server.db import (
    AttendanceRecord,
    Crew,
    Job,
    LinkedEvent,
    ResourceAssignment,
    attendance_conflicts,
    current_attendance,
)

# A real id from the seeded 120-activity baseline.
CIV = "CIV-FDN-1007"


@pytest.fixture(autouse=True)
def _clean(db_session):
    def wipe():
        db_session.query(AttendanceRecord).delete()
        db_session.query(ResourceAssignment).delete()
        db_session.query(Crew).delete()
        db_session.query(LinkedEvent).delete()
        db_session.query(Job).delete()
        db_session.commit()

    wipe()
    yield
    wipe()


def _crew(db, crew_id="CIV-GANG-01", *, discipline="civil", strength=10,
          contractor="ABC Infra Pvt Ltd", trade="mason"):
    crew = Crew(
        crew_id=crew_id,
        name=crew_id,
        discipline=discipline,
        contractor=contractor,
        trade=trade,
        planned_strength=strength,
    )
    db.add(crew)
    db.commit()
    return crew


def _counted_reading(db, activity_id, *, quantity, uom, on=date(2026, 8, 11)):
    """One measured reading the quantity ledger will actually count.

    The uom must match the activity's own or the roll-up refuses it — which is
    the behaviour `test_quantity_ledger` pins, and this helper depends on
    rather than reimplements.
    """
    job = Job(id=str(uuid.uuid4()), filename="civil_progress.xlsx",
              file_type="xlsx", status="completed")
    db.add(job)
    db.flush()
    db.add(LinkedEvent(
        id=str(uuid.uuid4()),
        job_id=job.id,
        activity_id=activity_id,
        source_file=job.filename,
        source_span="x",
        raw_text="x",
        quantity=quantity,
        uom=uom,
        reported_date=on,
        confidence=0.95,
    ))
    db.commit()


def _mark(client, crew_id, on, present, **kw):
    body = {"crew_id": crew_id, "attendance_date": on.isoformat(), "present": present}
    body.update(kw)
    return client.post("/workforce/attendance", json=body)


def _marked(client, *args, **kw):
    """`_mark`, but a refused write fails the test where it happened.

    A rejected muster is indistinguishable downstream from a muster nobody
    took — both leave the register empty — so a test that meant to write one
    must not be allowed to pass its assertions against the absence.
    """
    r = _mark(client, *args, **kw)
    assert r.status_code == 201, r.text
    return r.json()


# ── Append-only muster register ─────────────────────────────────────────────

def test_correction_writes_a_new_row_and_leaves_the_original_untouched(
    client, db_session
):
    """The core append-only guarantee.

    A muster is what a contractor is paid against. Editing yesterday's headcount
    in place would destroy the only record that it ever said something else.
    """
    _crew(db_session)
    on = date(2026, 8, 11)
    first = _mark(client, "CIV-GANG-01", on, 6).json()

    corrected = _mark(
        client, "CIV-GANG-01", on, 9, supersedes_id=first["id"],
        source="planner_correction",
    )
    assert corrected.status_code == 201

    rows = db_session.query(AttendanceRecord).all()
    assert len(rows) == 2, "a correction must ADD a row, never replace one"

    original = next(r for r in rows if r.id == first["id"])
    assert original.present == 6, "the corrected row must not be mutated"
    assert original.supersedes_id is None

    live = current_attendance(rows)
    assert [r.present for r in live] == [9]


def test_current_reading_is_derived_not_stored(client, db_session):
    """A chain of corrections resolves to exactly one live reading."""
    _crew(db_session)
    on = date(2026, 8, 11)
    a = _mark(client, "CIV-GANG-01", on, 4).json()
    b = _mark(client, "CIV-GANG-01", on, 6, supersedes_id=a["id"]).json()
    _mark(client, "CIV-GANG-01", on, 8, supersedes_id=b["id"])

    live = current_attendance(db_session.query(AttendanceRecord).all())
    assert len(live) == 1 and live[0].present == 8


def test_list_hides_superseded_readings_but_the_audit_view_shows_them(client, db_session):
    _crew(db_session)
    on = date(2026, 8, 11)
    first = _mark(client, "CIV-GANG-01", on, 5).json()
    _mark(client, "CIV-GANG-01", on, 7, supersedes_id=first["id"])

    live = client.get("/workforce/attendance").json()
    assert [r["present"] for r in live] == [7]

    full = client.get("/workforce/attendance?include_superseded=true").json()
    assert sorted(r["present"] for r in full) == [5, 7]


def test_a_correction_outside_the_window_still_supersedes_inside_it(client, db_session):
    """Correcting the 3rd on the 10th is normal, and must not resurrect the 3rd.

    This is why the supersede chain is resolved in Python over every row for the
    crew rather than by a SQL WHERE on the date: a window filter applied first
    would hide the correcting row and leave the corrected one looking live.
    """
    _crew(db_session)
    old_day, fix_day = date(2026, 8, 3), date(2026, 8, 10)
    first = _mark(client, "CIV-GANG-01", old_day, 3).json()
    # The correction is filed later but is FOR the original date.
    _mark(client, "CIV-GANG-01", old_day, 8, supersedes_id=first["id"])

    window = workforce.musters(db_session, old_day, old_day)
    assert [r.present for r in window] == [8]
    assert workforce.musters(db_session, fix_day, fix_day) == []


def test_two_independent_musters_that_disagree_are_reported_not_resolved(
    client, db_session
):
    """Two people counted the same gang and got different answers.

    Picking one silently would destroy the only evidence that they disagreed.
    """
    _crew(db_session)
    on = date(2026, 8, 11)
    _mark(client, "CIV-GANG-01", on, 6, source="field_app")
    _mark(client, "CIV-GANG-01", on, 9, source="dpr_extract")

    conflicts = attendance_conflicts(db_session.query(AttendanceRecord).all())
    assert len(conflicts) == 1
    assert sorted(r.present for r in next(iter(conflicts.values()))) == [6, 9]

    summary = client.get(
        "/workforce/attendance/summary?start=2026-08-01&end=2026-08-30"
    ).json()
    assert len(summary["conflicts"]) == 1


def test_agreeing_musters_are_corroboration_not_conflict(client, db_session):
    _crew(db_session)
    on = date(2026, 8, 11)
    _mark(client, "CIV-GANG-01", on, 7, source="field_app")
    _mark(client, "CIV-GANG-01", on, 7, source="dpr_extract")
    assert attendance_conflicts(db_session.query(AttendanceRecord).all()) == {}


# ── The snapshot that keeps history stable ──────────────────────────────────

def test_resizing_a_crew_does_not_rewrite_a_past_shortfall(client, db_session):
    """The whole reason AttendanceRecord carries its own planned_strength."""
    crew = _crew(db_session, strength=10)
    on = date(2026, 8, 11)
    _mark(client, "CIV-GANG-01", on, 8)

    window = "?start=2026-08-01&end=2026-08-30"
    before = client.get(f"/workforce/attendance/summary{window}").json()["totals"]
    assert before["planned_strength"] == 10 and before["attendance_pct"] == 80.0

    crew.planned_strength = 20
    db_session.commit()

    after = client.get(f"/workforce/attendance/summary{window}").json()["totals"]
    assert after["planned_strength"] == 10, "history must be read off the snapshot"
    assert after["attendance_pct"] == 80.0


def test_counts_beyond_contracted_strength_are_refused_with_the_numbers(
    client, db_session
):
    _crew(db_session, strength=10)
    r = _mark(
        client, "CIV-GANG-01", date(2026, 8, 11), 9,
        absence_reasons={"sick": 4},
    )
    assert r.status_code == 422
    assert "10 strong" in r.json()["detail"]


def test_an_unknown_activity_id_is_refused_at_the_muster(client, db_session):
    """Rejected at write time: an unattributable id would surface a week later
    as a missing man-day denominator, far from its cause."""
    _crew(db_session)
    r = _mark(
        client, "CIV-GANG-01", date(2026, 8, 11), 8,
        activity_ids=["NOT-A-REAL-ID"],
    )
    assert r.status_code == 422 and "NOT-A-REAL-ID" in r.json()["detail"]


# ── Not-marked is not zero ──────────────────────────────────────────────────

def test_an_unmarked_crew_reports_none_not_zero(client, db_session):
    """"Nobody has counted" and "nobody turned up" are different facts."""
    _crew(db_session)
    roster = client.get("/workforce/crews").json()
    assert roster[0]["today_present"] is None

    _mark(client, "CIV-GANG-01", date.today(), 0)
    roster = client.get("/workforce/crews").json()
    assert roster[0]["today_present"] == 0


def test_attendance_pct_is_none_against_a_zero_planned_strength(client, db_session):
    """A percentage against a zero denominator is a division, not a fact."""
    _crew(db_session, strength=0)
    _mark(client, "CIV-GANG-01", date(2026, 8, 11), 0)
    totals = client.get(
        "/workforce/attendance/summary?start=2026-08-01&end=2026-08-30"
    ).json()["totals"]
    assert totals["attendance_pct"] is None


def test_days_with_no_muster_are_rows_not_gaps(client, db_session):
    """Dropping the row would let a chart draw a line straight through a day
    nobody reported, as though work continued."""
    _crew(db_session)
    start, end = date(2026, 8, 10), date(2026, 8, 14)
    _mark(client, "CIV-GANG-01", start, 9)
    rows = workforce.daily_rollup(db_session, start, end)
    assert len(rows) == 5
    assert rows[0]["musters"] == 1 and rows[1]["musters"] == 0


# ── Reliability refuses a small sample ──────────────────────────────────────

def test_reliability_is_none_below_the_minimum_sample(client, db_session):
    _crew(db_session)
    for i in range(workforce.MIN_MUSTERS_FOR_RELIABILITY - 1):
        _mark(client, "CIV-GANG-01", date(2026, 8, 10) + timedelta(days=i), 5)
    assert workforce.crew_reliability(db_session, "CIV-GANG-01") is None


def test_reliability_is_measured_once_the_sample_is_enough(client, db_session):
    _crew(db_session, strength=10)
    for i in range(workforce.MIN_MUSTERS_FOR_RELIABILITY):
        _mark(client, "CIV-GANG-01", date(2026, 8, 10) + timedelta(days=i), 8)
    assert workforce.crew_reliability(db_session, "CIV-GANG-01") == 0.8


def test_an_unmeasured_crew_supplies_nominal_capacity_and_says_so(client, db_session):
    """None must never be read as 1.0 — that would inflate every supply figure
    downstream of an unmeasured crew."""
    _crew(db_session, strength=10)
    cap = workforce.crew_capacity(
        db_session, "CIV-GANG-01", date(2026, 8, 10), date(2026, 8, 16)
    )
    assert cap["basis"] == "nominal"
    assert cap["reliability"] is None
    assert cap["supply_man_days"] == 70  # 10 × 7 days, unadjusted


def test_a_measured_crew_supplies_reliability_adjusted_capacity(client, db_session):
    _crew(db_session, strength=10)
    for i in range(workforce.MIN_MUSTERS_FOR_RELIABILITY):
        _mark(client, "CIV-GANG-01", date(2026, 8, 1) + timedelta(days=i), 8)
    cap = workforce.crew_capacity(
        db_session, "CIV-GANG-01", date(2026, 8, 10), date(2026, 8, 16)
    )
    assert cap["basis"] == "reliability_adjusted"
    assert cap["supply_man_days"] == 56.0  # 10 × 7 × 0.8


# ── Man-day productivity ────────────────────────────────────────────────────

def test_man_day_rate_says_why_it_has_no_figure(client, db_session):
    """A stated reason, never a blank or a zero."""
    result = workforce.man_day_rate(db_session, CIV)
    assert result["rate"] is None
    assert result["reason"] == "no_attendance_attributed"
    assert "register" in result["note"]


def test_man_day_rate_is_none_for_an_activity_that_does_not_exist(db_session):
    assert workforce.man_day_rate(db_session, "NOPE-0001") is None
    

def test_man_day_rate_divides_measured_quantity_by_mustered_man_days(
    client, db_session
):
    """The rate productivity.py could not compute, on the denominator it wanted."""
    _crew(db_session, strength=12)
    _counted_reading(db_session, CIV, quantity=24, uom="m3")
    _marked(client, "CIV-GANG-01", date(2026, 8, 11), 12, activity_ids=[CIV])

    result = workforce.man_day_rate(db_session, CIV)
    assert result["man_days"] == 12.0
    assert result["rate"] == 2.0            # 24 m3 over 12 man-days
    assert result["uom"] == "m3"
    assert result["reason"] is None


def test_a_muster_covering_several_activities_is_declared_a_lower_bound(
    client, db_session
):
    """Nothing records how a crew split its day, so a shared muster is charged
    in full to each activity. That overstates the denominator and understates
    the rate — the honest direction to err, and it is said out loud."""
    _crew(db_session)
    _counted_reading(db_session, CIV, quantity=24, uom="m3")
    _mark(
        client, "CIV-GANG-01", date(2026, 8, 11), 10,
        activity_ids=[CIV, "CIV-FDN-1008"],
    )
    result = workforce.man_day_rate(db_session, CIV)
    assert result["shared_musters"] == 1
    assert "lower bound" in result["note"]


def test_a_mustered_activity_with_no_measured_quantity_says_so(client, db_session):
    """Manpower without a measurement is not zero productivity; it is nothing
    to divide."""
    _crew(db_session)
    _mark(client, "CIV-GANG-01", date(2026, 8, 11), 10, activity_ids=[CIV])
    result = workforce.man_day_rate(db_session, CIV)
    assert result["rate"] is None
    assert result["reason"] == "no_measured_quantity"


# ── Delay evidence ──────────────────────────────────────────────────────────

def test_manpower_cause_is_none_when_no_register_was_kept(client, db_session):
    """None is not a weaker True. "The crews were there and it still slipped"
    and "nobody wrote down whether the crews were there" are different findings.
    """
    ev = workforce.shortfall_evidence(db_session, CIV)
    assert ev["supports_manpower_cause"] is None
    assert ev["reason"] == "no_register"


def test_a_fielded_crew_refutes_a_manpower_classification(client, db_session):
    _crew(db_session, strength=10)
    from server.db import Activity

    activity = db_session.query(Activity).filter(Activity.activity_id == CIV).first()
    for i in range(3):
        _mark(
            client, "CIV-GANG-01", activity.planned_start + timedelta(days=i), 10,
            activity_ids=[CIV],
        )
    ev = workforce.shortfall_evidence(db_session, CIV)
    assert ev["supports_manpower_cause"] is False
    assert "does NOT support" in ev["note"]


def test_a_short_crew_supports_a_manpower_classification(client, db_session):
    _crew(db_session, strength=10)
    from server.db import Activity

    activity = db_session.query(Activity).filter(Activity.activity_id == CIV).first()
    for i in range(3):
        _mark(
            client, "CIV-GANG-01", activity.planned_start + timedelta(days=i), 4,
            absence_reasons={"no_show": 6}, activity_ids=[CIV],
        )
    ev = workforce.shortfall_evidence(db_session, CIV)
    assert ev["supports_manpower_cause"] is True
    assert ev["absence_reasons"]["no_show"] == 18
    assert len(ev["short_days"]) == 3


# ── Allocation: proposal vs commitment ──────────────────────────────────────

def _propose(client, crew_id=CIV and "CIV-GANG-01", activity_id=CIV, strength=6):
    return client.post(
        "/workforce/assignments",
        json={
            "crew_id": crew_id,
            "activity_id": activity_id,
            "from_date": "2026-08-10",
            "to_date": "2026-08-16",
            "allocated_strength": strength,
            "requested_by": "field",
        },
    )


def test_the_creating_path_cannot_produce_a_committed_assignment(client, db_session):
    """D-009 applied to manpower. The guarantee is structural: the request model
    has no status field, so a supervisor cannot commit even by trying."""
    _crew(db_session)
    body = _propose(client).json()
    assert body["status"] == "proposed"

    # Even smuggling a status through the body changes nothing.
    r = client.post(
        "/workforce/assignments",
        json={
            "crew_id": "CIV-GANG-01",
            "activity_id": CIV,
            "from_date": "2026-08-10",
            "to_date": "2026-08-16",
            "allocated_strength": 6,
            "status": "committed",
        },
    )
    assert r.json()["status"] == "proposed"


def test_only_the_decide_path_commits_and_it_writes_an_audit_row(client, db_session):
    from server.db import AuditRecord

    _crew(db_session)
    proposal = _propose(client).json()
    before = db_session.query(AuditRecord).count()

    r = client.post(
        f"/workforce/assignments/{proposal['id']}/decide",
        json={"decision": "commit", "decided_by": "planner"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "committed"
    assert r.json()["decided_by"] == "planner"
    assert db_session.query(AuditRecord).count() == before + 1


def test_the_pm_may_commit_a_smaller_number_than_was_asked_for(client, db_session):
    """A supervisor asks for six, the PM can spare four. The audit row keeps
    what was requested."""
    from server.db import AuditRecord

    _crew(db_session)
    proposal = _propose(client, strength=6).json()
    r = client.post(
        f"/workforce/assignments/{proposal['id']}/decide",
        json={"decision": "commit", "allocated_strength": 4},
    )
    assert r.json()["allocated_strength"] == 4

    audit = (
        db_session.query(AuditRecord)
        .filter(AuditRecord.field_changed == "resource_assignment")
        .order_by(AuditRecord.created_at.desc())
        .first()
    )
    assert audit.old_value == "proposed:6"
    assert audit.new_value == "committed:4"


def test_a_withdrawn_proposal_is_kept_and_still_listed(client, db_session):
    """"Manpower was asked for and refused" is exactly the fact a delay claim
    turns on. Deleting it would make the register flattering and useless."""
    _crew(db_session)
    proposal = _propose(client).json()
    client.post(
        f"/workforce/assignments/{proposal['id']}/decide",
        json={"decision": "withdraw", "note": "no crew to spare"},
    )
    rows = client.get("/workforce/assignments").json()
    assert len(rows) == 1 and rows[0]["status"] == "withdrawn"
    assert rows[0]["note"] == "no crew to spare"


def test_committing_twice_is_a_conflict_not_a_silent_no_op(client, db_session):
    _crew(db_session)
    proposal = _propose(client).json()
    client.post(f"/workforce/assignments/{proposal['id']}/decide",
                json={"decision": "commit"})
    again = client.post(f"/workforce/assignments/{proposal['id']}/decide",
                        json={"decision": "commit"})
    assert again.status_code == 409


def test_the_rationale_is_deterministic_tokens_never_prose(client, db_session):
    """D-003's rule. Every token must be recomputable from the database."""
    _crew(db_session, discipline="civil")
    body = _propose(client).json()
    assert "discipline_match" in body["rationale"]
    assert "reliability_unmeasured" in body["rationale"]
    assert all(" " not in token for token in body["rationale"])


def test_a_cross_discipline_proposal_is_allowed_but_labelled(client, db_session):
    """Refusing it would be wrong — a civil gang doing piping backfill is real
    — but it must not pass unremarked."""
    _crew(db_session, crew_id="ELE-GANG-01", discipline="electrical")
    body = _propose(client, crew_id="ELE-GANG-01").json()
    assert "discipline_mismatch" in body["rationale"]


def test_a_backwards_span_is_refused(client, db_session):
    _crew(db_session)
    r = client.post(
        "/workforce/assignments",
        json={
            "crew_id": "CIV-GANG-01", "activity_id": CIV,
            "from_date": "2026-08-16", "to_date": "2026-08-10",
            "allocated_strength": 4,
        },
    )
    assert r.status_code == 422


# ── Double booking ──────────────────────────────────────────────────────────

def test_committed_overlaps_are_flagged_and_proposals_are_not(client, db_session):
    """Two competing proposals are what proposals are FOR. Flagging them would
    train a planner to ignore the warning that matters."""
    _crew(db_session)
    a = _propose(client, activity_id=CIV).json()
    b = _propose(client, activity_id="CIV-FDN-1008").json()

    assert workforce.double_bookings(db_session) == []

    for row in (a, b):
        client.post(f"/workforce/assignments/{row['id']}/decide",
                    json={"decision": "commit"})

    clashes = workforce.double_bookings(db_session)
    assert len(clashes) == 1
    assert clashes[0]["overlap_days"] == 7


def test_a_shared_boundary_day_is_a_double_booking(client, db_session):
    """A gang cannot be in two places in one shift, so touching spans clash."""
    _crew(db_session)
    for activity_id, span in ((CIV, ("2026-08-10", "2026-08-12")),
                              ("CIV-FDN-1008", ("2026-08-12", "2026-08-14"))):
        row = client.post(
            "/workforce/assignments",
            json={
                "crew_id": "CIV-GANG-01", "activity_id": activity_id,
                "from_date": span[0], "to_date": span[1],
                "allocated_strength": 5,
            },
        ).json()
        client.post(f"/workforce/assignments/{row['id']}/decide",
                    json={"decision": "commit"})
    clashes = workforce.double_bookings(db_session)
    assert len(clashes) == 1 and clashes[0]["overlap_days"] == 1


# ── Allocation board ────────────────────────────────────────────────────────

def test_demand_without_a_norm_is_named_never_absorbed_into_zero(client, db_session):
    """The board must be able to say "demand excludes 14 activities with no
    norm" rather than quietly under-reporting."""
    _crew(db_session)
    board = client.get("/workforce/allocation-board?week_start=2026-08-10&weeks=1").json()
    assert board["norms"] == {}, "no completed man-day work yet, so no norms"
    assert board["demand_not_derivable"], "excluded activities must be listed"
    assert all(
        row["reason"] == "no_productivity_norm" for row in board["demand_not_derivable"]
    )
    week = board["weeks_detail"][0]
    assert week["total_demand"] == 0.0


def test_an_activity_spanning_several_weeks_is_excluded_only_once(client, db_session):
    _crew(db_session)
    board = client.get("/workforce/allocation-board?week_start=2026-08-10&weeks=4").json()
    ids = [row["activity_id"] for row in board["demand_not_derivable"]]
    assert len(ids) == len(set(ids))


def test_one_unmeasured_crew_makes_the_whole_discipline_supply_nominal(
    client, db_session
):
    """The weaker claim must win: a discipline whose supply is part-assumption
    must not be presented as measured."""
    _crew(db_session, crew_id="CIV-GANG-01", strength=10)
    _crew(db_session, crew_id="CIV-GANG-02", strength=10)
    for i in range(workforce.MIN_MUSTERS_FOR_RELIABILITY):
        _mark(client, "CIV-GANG-01", date(2026, 8, 1) + timedelta(days=i), 8)

    board = client.get("/workforce/allocation-board?week_start=2026-08-10&weeks=1").json()
    civil = next(r for r in board["weeks_detail"][0]["rows"] if r["discipline"] == "civil")
    assert civil["supply_basis"] == "nominal"


def test_headroom_and_gap_can_both_be_non_zero(client, db_session):
    """Not a contradiction — it is the board's most useful statement: the
    manpower exists and is pointed at the wrong discipline."""
    _crew(db_session, crew_id="CIV-GANG-01", discipline="civil", strength=10)
    board = client.get("/workforce/allocation-board?week_start=2026-08-10&weeks=1").json()
    civil = next(r for r in board["weeks_detail"][0]["rows"] if r["discipline"] == "civil")
    assert civil["headroom_man_days"] == 70.0
    assert civil["committed_man_days"] == 0.0


def test_capacity_reports_overcommitment(client, db_session):
    _crew(db_session, strength=10)
    row = client.post(
        "/workforce/assignments",
        json={
            "crew_id": "CIV-GANG-01", "activity_id": CIV,
            "from_date": "2026-08-10", "to_date": "2026-08-16",
            "allocated_strength": 20,
        },
    ).json()
    client.post(f"/workforce/assignments/{row['id']}/decide", json={"decision": "commit"})

    caps = client.get("/workforce/capacity?start=2026-08-10&end=2026-08-16").json()
    assert caps[0]["overcommitted"] is True
    assert caps[0]["utilisation_pct"] == 200.0


# ── Contractor reliability ──────────────────────────────────────────────────

def test_a_contractor_with_too_few_musters_is_unmeasured_not_unreliable(
    client, db_session
):
    _crew(db_session, contractor="Thin Data Ltd", strength=10)
    _mark(client, "CIV-GANG-01", date(2026, 8, 11), 2)
    rows = workforce.contractor_reliability(db_session, date(2026, 8, 1), date(2026, 8, 30))
    row = next(r for r in rows if r["contractor"] == "Thin Data Ltd")
    assert row["sample_sufficient"] is False
    assert row["reliable"] is None, "two data points cannot convict a contractor"


# ── Rest days: nothing due is not the same as nobody came ──────────────────

class TestARestDayIsNotAShortfall:
    """Three states the register must keep apart.

    Writing a rest day as "18 contracted, 0 present" made every contractor in
    the seeded corpus score ~71% and read as unreliable — an artefact of the
    site calendar, not a fact about the contractor. A rest day carries a
    contracted strength of ZERO, which drops it out of every percentage on its
    own because `attendance_pct` is already None against a zero denominator.
    """

    def test_a_gang_that_was_due_and_did_not_come_is_a_shortfall(
        self, client, db_session
    ):
        _crew(db_session, strength=18)
        _marked(client, "CIV-GANG-01", date(2026, 8, 11), 0,
                absence_reasons={"no_show": 18})
        row = workforce.daily_rollup(
            db_session, date(2026, 8, 11), date(2026, 8, 11)
        )[0]
        assert row["planned_strength"] == 18
        assert row["shortfall"] == 18
        assert row["attendance_pct"] == 0.0

    def test_a_day_with_nothing_contracted_is_not_a_shortfall(
        self, client, db_session
    ):
        _crew(db_session, strength=0)
        _marked(client, "CIV-GANG-01", date(2026, 8, 11), 0)
        row = workforce.daily_rollup(
            db_session, date(2026, 8, 11), date(2026, 8, 11)
        )[0]
        assert row["shortfall"] == 0
        assert row["attendance_pct"] is None

    def test_no_row_at_all_is_neither(self, client, db_session):
        _crew(db_session, strength=18)
        row = workforce.daily_rollup(
            db_session, date(2026, 8, 11), date(2026, 8, 11)
        )[0]
        assert row["musters"] == 0
        assert row["planned_strength"] == 0
        assert row["attendance_pct"] is None

    def test_rest_days_do_not_drag_down_measured_reliability(
        self, client, db_session
    ):
        """The regression this class exists for."""
        _crew(db_session, strength=10)
        # Five working days at full strength…
        for i in range(workforce.MIN_MUSTERS_FOR_RELIABILITY):
            _marked(client, "CIV-GANG-01", date(2026, 8, 3) + timedelta(days=i), 10)
        # …and two rest days, contracted at zero.
        for rest in (date(2026, 8, 2), date(2026, 8, 9)):
            _marked(client, "CIV-GANG-01", rest, 0, rest_day=True)

        assert workforce.crew_reliability(db_session, "CIV-GANG-01") == 1.0

    def test_a_rest_day_cannot_carry_a_headcount(self, client, db_session):
        """Marking people present on a day nobody was contracted is a
        contradiction, and silently keeping one of the two numbers would make
        the register lie in a way nothing downstream could detect."""
        _crew(db_session, strength=10)
        r = _mark(client, "CIV-GANG-01", date(2026, 8, 2), 6, rest_day=True)
        assert r.status_code == 422
        assert "rest day" in r.json()["detail"].lower()
