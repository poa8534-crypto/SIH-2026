"""Connectivity: the honesty layer under the near-real-time claim.

The properties that matter:

  1. An unmeasured link is `unknown`, never `poor`. Defaulting the first to the
     second would show a site-wide outage every time a client failed to time a
     request.
  2. A device that has gone quiet reads as offline whatever its last ping
     claimed. The board needs what is TRUE now, not what was said.
  3. "No work happened" and "no signal reached us" are separable. That
     separation is the entire reason this module exists.
  4. Degradation is about CAPTURE, never about CORRECTNESS. Nothing here
     lowers a confidence score because the link was bad.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import connectivity
from server.connectivity import (
    MODE_LEAN,
    MODE_OFFLINE,
    MODE_RICH,
    classify_link,
)
from server.db import AttendanceRecord, Crew, DeviceSession, Job, LinkedEvent

CIV = "CIV-FDN-1007"


@pytest.fixture(autouse=True)
def _clean(db_session):
    def wipe():
        db_session.query(DeviceSession).delete()
        db_session.query(AttendanceRecord).delete()
        db_session.query(Crew).delete()
        db_session.query(LinkedEvent).delete()
        db_session.query(Job).delete()
        db_session.commit()

    wipe()
    yield
    wipe()


def _beat(client, device_id="phone-1", **kw):
    body = {"device_id": device_id, "role": "field", "mode": MODE_RICH}
    body.update(kw)
    r = client.post("/connectivity/heartbeat", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ── Link classification ─────────────────────────────────────────────────────

class TestClassifyLink:
    def test_nothing_measured_is_unknown_not_poor(self):
        """The distinction the whole board rests on."""
        assert classify_link(None, None) == "unknown"

    def test_bands_follow_what_navis_actually_sends(self):
        # A voice upload is tens of KB; a structured report is under 2 KB.
        assert classify_link(512, None) == "good"
        assert classify_link(128, None) == "weak"
        assert classify_link(20, None) == "poor"

    def test_rtt_alone_still_classifies(self):
        assert classify_link(None, 120) == "good"
        assert classify_link(None, 800) == "weak"
        assert classify_link(None, 4000) == "poor"

    def test_measured_throughput_wins_over_latency(self):
        """A fast round-trip on a 20 kbps link is still a 20 kbps link."""
        assert classify_link(20, 100) == "poor"


# ── Heartbeats ──────────────────────────────────────────────────────────────

def test_a_heartbeat_upserts_rather_than_accumulating_rows(client, db_session):
    """Liveness, not an audit table: one row per device, forever."""
    for _ in range(5):
        _beat(client, "phone-1", measured_kbps=300)
    assert db_session.query(DeviceSession).count() == 1


def test_samples_are_capped_so_a_chatty_device_cannot_grow_a_row_forever(
    client, db_session
):
    for i in range(connectivity.MAX_SAMPLES + 10):
        _beat(client, "phone-1", measured_kbps=100 + i)
    session = db_session.query(DeviceSession).first()
    assert len(session.sample_list()) == connectivity.MAX_SAMPLES
    # The window kept is the most recent one.
    assert session.sample_list()[-1]["kbps"] == 100 + connectivity.MAX_SAMPLES + 9


def test_an_unknown_mode_is_coerced_to_lean_not_rejected(client, db_session):
    """A heartbeat comes from a client that may be a version behind. Failing it
    would lose the liveness signal to protect a label — and the coercion is to
    the MIDDLE rung, because claiming `rich` would overstate what it can do.
    """
    body = _beat(client, "phone-1", mode="teleportation")
    assert body["declared_mode"] == MODE_LEAN


def test_the_client_declares_its_mode_and_the_server_does_not_second_guess_it(
    client, db_session
):
    """A supervisor who chose lean deliberately on a good link, to save data,
    is the commonest case — inferring the mode from kbps would get it wrong."""
    body = _beat(client, "phone-1", mode=MODE_LEAN, measured_kbps=2000)
    assert body["declared_mode"] == MODE_LEAN
    assert body["band"] == "good", "the LINK is good even though the mode is lean"


# ── Liveness vs what was claimed ────────────────────────────────────────────

def test_a_quiet_device_reads_as_offline_whatever_it_last_claimed(client, db_session):
    _beat(client, "phone-1", mode=MODE_RICH, measured_kbps=900)
    session = db_session.query(DeviceSession).first()
    session.last_seen = datetime.utcnow() - connectivity.STALE_AFTER - timedelta(minutes=1)
    db_session.commit()

    board = client.get("/connectivity/link-health").json()
    device = board["devices"][0]
    assert device["online"] is False
    assert device["mode"] == MODE_OFFLINE, "what is true now"
    assert device["declared_mode"] == MODE_RICH, "what it said"
    assert device["band"] == "unknown", "a stale measurement is not a live one"


def test_offline_devices_sort_first(client, db_session):
    """This board answers "who is not reaching us". That must never be below
    the fold."""
    _beat(client, "online-phone")
    _beat(client, "silent-phone")
    stale = (
        db_session.query(DeviceSession)
        .filter(DeviceSession.device_id == "silent-phone")
        .first()
    )
    stale.last_seen = datetime.utcnow() - timedelta(hours=2)
    db_session.commit()

    board = client.get("/connectivity/link-health").json()
    assert board["devices"][0]["device_id"] == "silent-phone"
    assert board["online"] == 1 and board["offline"] == 1


def test_queued_work_on_unreachable_devices_is_totalled(client, db_session):
    """The number that says how much reality has not arrived yet."""
    _beat(client, "phone-1", queue_depth=3, queue_bytes=4096)
    _beat(client, "phone-2", queue_depth=2, queue_bytes=2048)
    board = client.get("/connectivity/link-health").json()
    assert board["queued_submissions"] == 5
    assert board["queued_bytes"] == 6144


def test_worst_band_is_none_when_nothing_is_online(client, db_session):
    """Over an empty set it would read as either an outage or perfect health,
    depending on which default was picked. Both would be invented."""
    board = client.get("/connectivity/link-health").json()
    assert board["worst_band"] is None
    assert board["total"] == 0


def test_worst_band_reports_the_weakest_live_link(client, db_session):
    _beat(client, "good-phone", measured_kbps=900)
    _beat(client, "bad-phone", measured_kbps=20)
    assert client.get("/connectivity/link-health").json()["worst_band"] == "poor"


# ── Reporting lag ───────────────────────────────────────────────────────────

def _event(db, activity_id, reported_on, created_at):
    job = Job(id=str(uuid.uuid4()), filename="dpr.txt", file_type="txt",
              status="completed")
    db.add(job)
    db.flush()
    db.add(LinkedEvent(
        id=str(uuid.uuid4()),
        job_id=job.id,
        activity_id=activity_id,
        source_file=job.filename,
        source_span="x",
        raw_text="x",
        reported_date=reported_on,
        confidence=0.9,
        created_at=created_at,
    ))
    db.commit()


def test_lag_is_measured_from_data_that_was_already_being_stored(
    client, db_session
):
    """No new instrumentation: `reported_date` against `created_at`, so this
    works retroactively over the whole existing corpus."""
    reported = date.today() - timedelta(days=1)
    _event(
        db_session, CIV, reported,
        datetime.combine(reported, datetime.min.time()) + timedelta(hours=30),
    )
    result = client.get("/connectivity/reporting-lag").json()
    assert result["events"] == 1
    assert result["median_lag_hours"] == 30.0


def test_a_report_filed_for_a_future_date_is_excluded_not_negative(
    client, db_session
):
    """Real, and not a connectivity fact. Letting it through would drag a
    median below zero."""
    future = date.today() + timedelta(days=5)
    _event(db_session, CIV, future, datetime.utcnow())
    result = client.get("/connectivity/reporting-lag").json()
    assert result["events"] == 0
    assert result["median_lag_hours"] is None


def test_a_silent_discipline_is_named(client, db_session):
    """One supervisor losing signal silences one discipline. A project-wide
    median would hide it completely — which is why this is per discipline."""
    old = date.today() - timedelta(days=9)
    _event(db_session, CIV, old,
           datetime.combine(old, datetime.min.time()) + timedelta(hours=2))
    result = client.get("/connectivity/reporting-lag").json()
    assert "civil" in result["silent_disciplines"]
    row = next(r for r in result["rows"] if r["discipline"] == "civil")
    assert row["days_since_last_report"] == 9


def test_a_freshly_reporting_discipline_is_not_silent(client, db_session):
    today = date.today()
    _event(db_session, CIV, today,
           datetime.combine(today, datetime.min.time()) + timedelta(hours=6))
    result = client.get("/connectivity/reporting-lag").json()
    assert result["silent_disciplines"] == []


# ── Capture coverage: the separation this module exists for ────────────────

def test_coverage_counts_disciplines_that_have_crews_not_ones_that_reported(
    client, db_session
):
    """The failure this endpoint exists to catch: with a reported-only
    denominator, a totally silent site scores 100% coverage."""
    db_session.add(Crew(crew_id="PIP-GANG-01", name="pip", discipline="piping",
                        planned_strength=8))
    db_session.add(Crew(crew_id="CIV-GANG-01", name="civ", discipline="civil",
                        planned_strength=10))
    db_session.commit()

    result = client.get("/connectivity/capture-coverage").json()
    assert result["expected_disciplines"] == 2
    assert result["reporting"] == 0
    assert sorted(result["silent"]) == ["civil", "piping"]


def test_no_work_and_no_signal_are_distinguishable(client, db_session):
    """The whole point.

    Civil mustered its crew but filed no progress — the crews were there and
    the link worked, so this is a WORK question. Piping produced nothing at
    all: no muster, no progress. That is a CAPTURE question. Those two rows
    lead a planner to opposite actions and the board must not merge them.
    """
    db_session.add(Crew(crew_id="CIV-GANG-01", name="civ", discipline="civil",
                        planned_strength=10))
    db_session.add(Crew(crew_id="PIP-GANG-01", name="pip", discipline="piping",
                        planned_strength=8))
    db_session.commit()
    client.post("/workforce/attendance",
                json={"crew_id": "CIV-GANG-01", "present": 10})

    result = client.get("/connectivity/capture-coverage").json()
    civil = next(r for r in result["rows"] if r["discipline"] == "civil")
    piping = next(r for r in result["rows"] if r["discipline"] == "piping")

    assert civil["attendance_marked"] is True
    assert civil["progress_events"] == 0
    assert civil["silent"] is False, "the crews were counted; the link worked"

    assert piping["attendance_marked"] is False
    assert piping["silent"] is True, "nothing at all arrived from piping"
