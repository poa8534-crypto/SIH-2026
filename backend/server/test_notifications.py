"""Field feedback notifications — ROADMAP §14 SHOULD #6, D-049.

The two properties the pipeline names are asserted directly: an approved update
produces a notification naming the right activity and day delta, and a rejected
proposal produces none.
"""

from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, AuditRecord, Base, LinkedEvent, ReviewQueueItem
from server.main import FIELD_MATCH_METHOD, app, get_db

TEST_DB = "sqlite:///dataset/test_notifications.db"
_engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
_Session = sessionmaker(bind=_engine)


def _override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def db():
    Base.metadata.create_all(bind=_engine)
    # server/conftest.py installs its own get_db override at import time. Popping
    # ours would delete THAT one too and leave every later test pointed at the
    # real database, so the previous value is saved and put back.
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = _override_get_db
    session = _Session()
    try:
        yield session
    finally:
        session.close()
        if previous is not None:
            app.dependency_overrides[get_db] = previous
        else:
            app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def client(db):
    return TestClient(app)


def _activity(db, activity_id="PIP-ERC-1030", planned_finish=date(2026, 9, 1)):
    act = Activity(
        activity_id=activity_id, wbs_path="1.1",
        description="Spool Erection 24 inch header", discipline="piping",
        planned_start=date(2026, 8, 20), planned_finish=planned_finish,
        planned_qty=10, uom="nos", predecessors="[]",
    )
    db.add(act)
    return act


def _field_event(db, activity_id="PIP-ERC-1030"):
    """A submission from the supervisor — the same scoping /field/reports uses."""
    event = LinkedEvent(
        job_id="j1", activity_id=activity_id, source_file="agent",
        raw_text="spool erection finished", match_method=FIELD_MATCH_METHOD,
    )
    db.add(event)
    db.flush()
    return event


def _audit(db, event, activity_id="PIP-ERC-1030", field="actual_finish",
           new_value="2026-09-03", auto=False):
    record = AuditRecord(
        activity_id=activity_id, linked_event_id=event.id if event else None,
        field_changed=field, old_value=None, new_value=new_value,
        source="planner_review", model_version="v1", auto_applied=auto,
        timestamp=datetime(2026, 9, 3, 10, 0),
    )
    db.add(record)
    return record


class TestApprovedUpdateProducesANotification:
    def test_it_names_the_activity_and_the_day_delta(self, client, db):
        """planned finish 1 Sep, reported 3 Sep -> +2 days."""
        _activity(db, planned_finish=date(2026, 9, 1))
        event = _field_event(db)
        _audit(db, event, new_value="2026-09-03")
        db.commit()

        got = client.get("/field/notifications").json()
        assert len(got) == 1
        n = got[0]
        assert n["activity_id"] == "PIP-ERC-1030"
        assert n["day_movement"] == 2
        assert "PIP-ERC-1030" in n["message"]
        assert "2 days later than planned" in n["message"]
        assert n["confirmed_by_planner"] is True

    def test_early_finish_reports_a_negative_movement(self, client, db):
        _activity(db, planned_finish=date(2026, 9, 10))
        event = _field_event(db)
        _audit(db, event, new_value="2026-09-07")
        db.commit()

        n = client.get("/field/notifications").json()[0]
        assert n["day_movement"] == -3
        assert "3 days earlier than planned" in n["message"]

    def test_on_plan_says_on_plan_not_zero_days_late(self, client, db):
        _activity(db, planned_finish=date(2026, 9, 1))
        event = _field_event(db)
        _audit(db, event, new_value="2026-09-01")
        db.commit()

        n = client.get("/field/notifications").json()[0]
        assert n["day_movement"] == 0
        assert "on plan" in n["message"]

    def test_it_links_back_to_the_audit_row(self, client, db):
        _activity(db)
        event = _field_event(db)
        record = _audit(db, event)
        db.commit()
        db.refresh(record)

        n = client.get("/field/notifications").json()[0]
        assert n["audit_record_id"] == record.id
        assert n["linked_event_id"] == event.id

    def test_an_auto_applied_write_is_marked_as_not_planner_confirmed(self, client, db):
        _activity(db)
        event = _field_event(db)
        _audit(db, event, auto=True)
        db.commit()
        assert client.get("/field/notifications").json()[0]["confirmed_by_planner"] is False


class TestRejectedProposalProducesNothing:
    def test_a_submission_with_no_audit_row_yields_no_notification(self, client, db):
        """Rejecting writes no actual, so nothing points back at the event.

        This is the pipeline's stated requirement, and it holds by design rather
        than by a special case.
        """
        _activity(db)
        _field_event(db)          # submitted...
        db.commit()               # ...and never approved
        assert client.get("/field/notifications").json() == []

    def test_an_empty_database_is_an_empty_list_not_an_error(self, client):
        r = client.get("/field/notifications")
        assert r.status_code == 200
        assert r.json() == []


class TestScoping:
    def test_an_ingested_dpr_write_is_not_the_supervisors_notification(self, client, db):
        """Only this supervisor's own submissions count — the same scoping
        /field/reports uses. A DPR someone uploaded is not 'your update'."""
        _activity(db)
        ingested = LinkedEvent(
            job_id="j1", activity_id="PIP-ERC-1030", source_file="dpr_day_06.txt",
            raw_text="spool erection done", match_method="hybrid",
        )
        db.add(ingested)
        db.flush()
        _audit(db, ingested)
        db.commit()

        assert client.get("/field/notifications").json() == []

    def test_a_source_conflict_row_is_not_news_for_the_field(self, client, db):
        _activity(db)
        event = _field_event(db)
        _audit(db, event, field="source_conflict", new_value="two sources disagree")
        db.commit()
        assert client.get("/field/notifications").json() == []

    def test_newest_first(self, client, db):
        _activity(db)
        event = _field_event(db)
        old = _audit(db, event, field="actual_start", new_value="2026-08-22")
        old.timestamp = datetime(2026, 9, 1, 9, 0)
        new = _audit(db, event, field="actual_finish", new_value="2026-09-03")
        new.timestamp = datetime(2026, 9, 3, 9, 0)
        db.commit()

        got = client.get("/field/notifications").json()
        assert [n["field_changed"] for n in got] == ["actual_finish", "actual_start"]


class TestMovementIsNeverInvented:
    def test_an_unknown_activity_means_null_movement_not_zero(self, client, db):
        """Null, not 0 — a 0 would read as "measured, and on plan".

        `Activity.planned_finish` is NOT NULL, so an activity that exists always
        has something to compare against. The reachable case is an audit row for
        an activity the current baseline does not contain: the trail is
        append-only (D-004), so a row can outlive the baseline it referenced.
        """
        event = _field_event(db, activity_id="GONE-0001")
        _audit(db, event, activity_id="GONE-0001", new_value="2026-09-03")
        db.commit()

        n = client.get("/field/notifications").json()[0]
        assert n["day_movement"] is None
        assert n["activity_description"] is None
        assert "later than planned" not in n["message"]
        assert "on plan" not in n["message"]
        assert "GONE-0001" in n["message"]

    def test_a_quantity_write_has_no_day_movement(self, client, db):
        _activity(db)
        event = _field_event(db)
        _audit(db, event, field="actual_qty", new_value="10")
        db.commit()

        n = client.get("/field/notifications").json()[0]
        assert n["day_movement"] is None
        assert "quantity" in n["message"]

    def test_an_unparseable_date_does_not_raise(self, client, db):
        _activity(db)
        event = _field_event(db)
        _audit(db, event, new_value="not a date")
        db.commit()

        r = client.get("/field/notifications")
        assert r.status_code == 200
        assert r.json()[0]["day_movement"] is None


class TestFieldReportsRejection:
    def test_rejected_update_has_rejected_status_and_resolution_note(self, client, db):
        event = _field_event(db)
        review = ReviewQueueItem(
            linked_event_id=event.id,
            reason="low_confidence",
            status="ignored",
            resolution="ignore",
            resolution_note="Out of scope for current reporting period",
            resolved_at=datetime(2026, 9, 3, 11, 0),
        )
        db.add(review)
        event.reviewed = True
        event.reviewer_action = "ignore"
        event.reviewed_at = datetime(2026, 9, 3, 11, 0)
        db.commit()

        res = client.get("/field/reports")
        assert res.status_code == 200
        reports = res.json()
        assert len(reports) == 1
        rep = reports[0]
        assert rep["status"] == "Rejected"
        assert rep["resolution_note"] == "Out of scope for current reporting period"
        assert rep["resolved_at"] is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
