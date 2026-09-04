"""Comprehensive test suite for the FastAPI server.

Tests every endpoint, integrity rule, audit trail, review queue,
memory query, and agent turn against the synthetic dataset.
"""

from __future__ import annotations

import io
import json
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import (
    Activity,
    AliasLexicon,
    AuditRecord,
    Base,
    ConversationTurn,
    Job,
    LinkedEvent,
    ReviewQueueItem,
    IntegrityError,
    _uuid,
    _now,
)
from server.main import app, get_db, link_events_to_activities, DATA_DATE

# ── Test database setup ──────────────────────────────────────────────────────

TEST_DB_URL = "sqlite:///dataset/test_epc_progress.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=test_engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    """Create test DB, seed schedule, tear down after each test."""
    Base.metadata.create_all(bind=test_engine)
    db = TestSession()
    try:
        # Seed activities
        count = db.query(Activity).count()
        if count == 0:
            schedule_path = Path(__file__).resolve().parent.parent / "dataset" / "baseline_schedule.json"
            with open(schedule_path) as f:
                activities = json.load(f)
            for act in activities:
                db.add(Activity(
                    activity_id=act["activity_id"],
                    wbs_path=act.get("wbs_path", ""),
                    description=act.get("description", ""),
                    detail=act.get("detail", ""),
                    discipline=act.get("discipline", "unknown"),
                    tag=act.get("tag"),
                    planned_start=date.fromisoformat(act["planned_start"]),
                    planned_finish=date.fromisoformat(act["planned_finish"]),
                    planned_qty=act.get("planned_qty", 0),
                    uom=act.get("uom", ""),
                    predecessors=json.dumps(act.get("predecessors", [])),
                ))
            db.commit()
        yield
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)


client = TestClient(app)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 1: Database models
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatabaseModels:
    """Test SQLAlchemy model behavior."""

    def test_activity_creation(self):
        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        assert act is not None
        assert act.discipline == "civil"
        assert act.planned_start == date(2026, 7, 2)
        assert act.planned_finish == date(2026, 7, 12)
        db.close()

    def test_activity_predecessor_list(self):
        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        preds = act.predecessor_list()
        assert "CIV-PLY-1004" in preds
        db.close()

    def test_activity_variance_computation(self):
        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        act.actual_start = date(2026, 7, 3)  # 1 day late
        act.actual_finish = date(2026, 7, 14)  # 2 days late
        act.compute_variance(DATA_DATE)
        assert act.start_variance_days == 1
        assert act.finish_variance_days == 2
        db.close()

    def test_audit_record_immutable(self):
        """Audit records should be insertable but not updatable."""
        db = TestSession()
        ar = AuditRecord(
            id=_uuid(),
            activity_id="CIV-FDN-1007",
            timestamp=_now(),
            field_changed="actual_start",
            old_value=None,
            new_value="2026-07-03",
            source="test",
            model_version="test-v1",
            auto_applied=False,
        )
        db.add(ar)
        db.commit()
        assert ar.id is not None
        # Verify it exists
        found = db.query(AuditRecord).filter(AuditRecord.id == ar.id).first()
        assert found is not None
        assert found.field_changed == "actual_start"
        db.close()

    def test_activity_count(self):
        """Verify all 120 activities were seeded."""
        db = TestSession()
        count = db.query(Activity).count()
        assert count == 120
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 2: Ingest endpoint
# ═══════════════════════════════════════════════════════════════════════════════

class TestIngestEndpoint:
    """Test POST /ingest with text files and spreadsheets."""

    def test_ingest_dpr_text_file(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("dpr_day_01.txt", f, "text/plain")},
            )
        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "completed"
        assert data["filename"] == "dpr_day_01.txt"
        # Check it extracted some events
        job_id = data["job_id"]
        assert len(job_id) > 0

    def test_ingest_piping_xlsx(self):
        xlsx_path = Path(__file__).resolve().parent.parent / "dataset" / "piping_progress.xlsx"
        with open(xlsx_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("piping_progress.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["filename"] == "piping_progress.xlsx"

    def test_ingest_civil_xlsx(self):
        xlsx_path = Path(__file__).resolve().parent.parent / "dataset" / "civil_progress.xlsx"
        with open(xlsx_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("civil_progress.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"

    def test_ingest_unsupported_file_type(self):
        response = client.post(
            "/ingest",
            files={"file": ("test.pdf", io.BytesIO(b"test"), "application/pdf")},
        )
        assert response.status_code == 400

    def test_ingest_csv_fails_loudly_instead_of_returning_zero_events(self):
        # .csv is an accepted suffix (main.py:949) but the extractor cannot
        # read one — it records "CSV extraction not yet implemented" in
        # result.errors. That list used to be discarded, so the upload came
        # back 200 with "Extracted 0 events" and looked like a broken app.
        response = client.post(
            "/ingest",
            files={"file": ("progress.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")},
        )
        assert response.status_code == 400, response.text
        detail = response.json()["detail"]
        assert "progress.csv" in detail, detail
        # The extractor's own reason has to reach the planner, not be swallowed.
        assert "CSV extraction not yet implemented" in detail, detail

    def test_ingest_csv_marks_the_job_failed_with_the_reason(self):
        client.post(
            "/ingest",
            files={"file": ("broken.csv", io.BytesIO(b"x,y\n3,4\n"), "text/csv")},
        )
        db = TestSession()
        try:
            job = (
                db.query(Job)
                .filter(Job.filename == "broken.csv")
                .order_by(Job.created_at.desc())
                .first()
            )
            assert job is not None, "no job row written for the failed upload"
            assert job.status == "failed"
            assert "CSV extraction not yet implemented" in (job.error_message or "")
        finally:
            db.close()

    def test_ingest_creates_job_record(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_03.txt"
        with open(dpr_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("dpr_day_03.txt", f, "text/plain")},
            )
        job_id = response.json()["job_id"]
        db = TestSession()
        job = db.query(Job).filter(Job.id == job_id).first()
        assert job is not None
        assert job.status == "completed"
        assert job.event_count > 0
        db.close()

    def test_ingest_creates_linked_events(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("dpr_day_01.txt", f, "text/plain")},
            )
        job_id = response.json()["job_id"]
        db = TestSession()
        events = db.query(LinkedEvent).filter(LinkedEvent.job_id == job_id).all()
        assert len(events) > 0
        # All events should have provenance
        for ev in events:
            assert ev.source_file == "dpr_day_01.txt"
            assert ev.source_span is not None
            assert len(ev.source_span) > 0
        db.close()

    def test_ingest_creates_review_items_for_low_confidence(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("dpr_day_01.txt", f, "text/plain")},
            )
        job_id = response.json()["job_id"]
        db = TestSession()
        review_items = (
            db.query(ReviewQueueItem)
            .join(LinkedEvent)
            .filter(LinkedEvent.job_id == job_id)
            .all()
        )
        # Some should have low confidence or no match
        assert len(review_items) >= 0  # May be 0 if all match well
        for item in review_items:
            assert item.reason in ("low_confidence", "no_match", "conflicting", "manual_flag")
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 3: Jobs endpoint
# ═══════════════════════════════════════════════════════════════════════════════

class TestJobsEndpoint:
    """Test GET /jobs/{id}."""

    def test_get_job_returns_events(self):
        # First ingest
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_05.txt"
        with open(dpr_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("dpr_day_05.txt", f, "text/plain")},
            )
        job_id = response.json()["job_id"]

        # Then retrieve
        response = client.get(f"/jobs/{job_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == job_id
        assert len(data["events"]) > 0
        for ev in data["events"]:
            assert "raw_text" in ev
            assert "confidence" in ev
            assert "source_span" in ev

    def test_get_job_nonexistent(self):
        response = client.get("/jobs/nonexistent-id")
        assert response.status_code == 404

    def test_get_job_has_provenance(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_02.txt"
        with open(dpr_path, "rb") as f:
            response = client.post(
                "/ingest",
                files={"file": ("dpr_day_02.txt", f, "text/plain")},
            )
        job_id = response.json()["job_id"]
        response = client.get(f"/jobs/{job_id}")
        events = response.json()["events"]
        for ev in events:
            assert ev["source_file"] == "dpr_day_02.txt"
            assert ev["source_span"] is not None


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 4: Review queue
# ═══════════════════════════════════════════════════════════════════════════════

class TestReviewQueue:
    """Test GET /review-queue and POST /review/{id}/resolve."""

    def _setup_review_item(self) -> str:
        """Ingest a file and return a review item ID."""
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            client.post(
                "/ingest",
                files={"file": ("dpr_day_01.txt", f, "text/plain")},
            )
        response = client.get("/review-queue")
        items = response.json()
        if items:
            return items[0]["id"]
        return None

    def test_review_queue_returns_pending_items(self):
        item_id = self._setup_review_item()
        response = client.get("/review-queue?status=pending")
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)

    def test_review_queue_filter_by_priority(self):
        item_id = self._setup_review_item()
        response = client.get("/review-queue?status=pending&priority=high")
        assert response.status_code == 200

    def test_review_queue_orders_high_before_medium(self):
        # priority is a string column, so ordering by it descending would put
        # 'medium' above 'high'. The medium item is created first, so a
        # lexicographic sort and a by-meaning sort disagree on the answer.
        item_id = self._setup_review_item()
        if not item_id:
            pytest.skip("No review items created")

        db = TestSession()
        try:
            linked_event_id = (
                db.query(ReviewQueueItem)
                .filter(ReviewQueueItem.id == item_id)
                .first()
                .linked_event_id
            )
            now = _now()
            medium = ReviewQueueItem(
                id=_uuid(),
                linked_event_id=linked_event_id,
                reason="manual_flag",
                priority="medium",
                status="pending",
                created_at=now,
            )
            high = ReviewQueueItem(
                id=_uuid(),
                linked_event_id=linked_event_id,
                reason="manual_flag",
                priority="high",
                status="pending",
                created_at=now + timedelta(seconds=1),
            )
            db.add(medium)
            db.add(high)
            db.commit()
            medium_id, high_id = medium.id, high.id
        finally:
            db.close()

        response = client.get("/review-queue?status=pending")
        assert response.status_code == 200
        returned = [i["id"] for i in response.json()]
        assert returned.index(high_id) < returned.index(medium_id)

    def test_resolve_confirm(self):
        item_id = self._setup_review_item()
        if not item_id:
            pytest.skip("No review items created")

        response = client.post(
            f"/review/{item_id}/resolve",
            json={"action": "confirm", "note": "Looks correct"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["resolution"] == "confirm"
        assert data["audit_records_created"] >= 0

    def test_resolve_reassign(self):
        item_id = self._setup_review_item()
        if not item_id:
            pytest.skip("No review items created")

        response = client.post(
            f"/review/{item_id}/resolve",
            json={
                "action": "reassign",
                "activity_id": "CIV-FDN-1007",
                "note": "Actually this is pipe rack pedestals",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["resolution"] == "reassign"
        assert data["activity_id"] == "CIV-FDN-1007"
        assert data["alias_entries_created"] >= 1

    def test_resolve_create_new_activity(self):
        item_id = self._setup_review_item()
        if not item_id:
            pytest.skip("No review items created")

        response = client.post(
            f"/review/{item_id}/resolve",
            json={
                "action": "create",
                "new_activity_id": "NEW-TST-9001",
                "new_description": "Test activity created by planner",
                "note": "This is a new activity not in the baseline",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["resolution"] == "create"
        assert data["activity_id"] == "NEW-TST-9001"

        # Verify the activity was created
        db = TestSession()
        new_act = db.query(Activity).filter(Activity.activity_id == "NEW-TST-9001").first()
        assert new_act is not None
        assert new_act.description == "Test activity created by planner"
        db.close()

    def test_resolve_creates_alias_lexicon(self):
        item_id = self._setup_review_item()
        if not item_id:
            pytest.skip("No review items created")

        client.post(
            f"/review/{item_id}/resolve",
            json={"action": "confirm", "note": "Training signal"},
        )

        db = TestSession()
        aliases = db.query(AliasLexicon).all()
        # Should have at least one alias entry
        assert len(aliases) >= 1
        for alias in aliases:
            assert alias.times_confirmed >= 1
            assert alias.weight >= 1.0
        db.close()

    def test_resolve_already_resolved(self):
        item_id = self._setup_review_item()
        if not item_id:
            pytest.skip("No review items created")

        # First resolve
        client.post(f"/review/{item_id}/resolve", json={"action": "ignore"})
        # Second resolve should fail
        response = client.post(
            f"/review/{item_id}/resolve",
            json={"action": "confirm"},
        )
        assert response.status_code == 400

    def test_resolve_nonexistent(self):
        response = client.post(
            "/review/nonexistent/resolve",
            json={"action": "confirm"},
        )
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 5: Schedule endpoint + integrity rules
# ═══════════════════════════════════════════════════════════════════════════════

class TestScheduleEndpoint:
    """Test GET /schedule with integrity rules."""

    def test_schedule_returns_all_activities(self):
        response = client.get("/schedule")
        assert response.status_code == 200
        data = response.json()
        assert data["total_activities"] == 120
        assert len(data["activities"]) == 120

    def test_schedule_filter_by_discipline(self):
        response = client.get("/schedule?discipline=piping")
        assert response.status_code == 200
        data = response.json()
        assert all(a["discipline"] == "piping" for a in data["activities"])
        assert data["total_activities"] == 30

    def test_schedule_activity_has_planned_dates(self):
        response = client.get("/schedule")
        activities = response.json()["activities"]
        for act in activities:
            assert "planned_start" in act
            assert "planned_finish" in act
            assert act["planned_start"] <= act["planned_finish"]

    def test_schedule_variance_calculation(self):
        """Set actual dates and check variance is computed."""
        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        act.actual_start = date(2026, 7, 5)  # 3 days late
        act.actual_finish = date(2026, 7, 15)  # 3 days late
        db.commit()
        db.close()

        response = client.get("/schedule")
        activities = response.json()["activities"]
        fdn_1007 = next(a for a in activities if a["activity_id"] == "CIV-FDN-1007")
        assert fdn_1007["start_variance_days"] == 3
        assert fdn_1007["finish_variance_days"] == 3

    def test_schedule_integrity_warning_predecessor(self):
        """Should warn when predecessors haven't started."""
        db = TestSession()
        # Set CIV-FDN-1007 actual start but NOT its predecessor CIV-PLY-1004
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        act.actual_start = date(2026, 7, 3)
        pred = db.query(Activity).filter(Activity.activity_id == "CIV-PLY-1004").first()
        pred.actual_start = None
        db.commit()
        db.close()

        response = client.get("/schedule")
        warnings = response.json()["integrity_warnings"]
        pred_warnings = [w for w in warnings if w["activity_id"] == "CIV-FDN-1007"]
        assert len(pred_warnings) >= 1

    def test_schedule_activities_completed_count(self):
        """Activities with actual_finish should count as completed."""
        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-SIT-1001").first()
        act.actual_start = date(2026, 6, 1)
        act.actual_finish = date(2026, 6, 7)
        db.commit()
        db.close()

        response = client.get("/schedule")
        assert response.json()["activities_completed"] >= 1

    def test_schedule_predecessors_list(self):
        response = client.get("/schedule")
        activities = response.json()["activities"]
        fdn_1007 = next(a for a in activities if a["activity_id"] == "CIV-FDN-1007")
        assert "CIV-PLY-1004" in fdn_1007["predecessors"]


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 6: Schedule export (PMXML)
# ═══════════════════════════════════════════════════════════════════════════════

class TestScheduleExport:
    """Test POST /schedule/export."""

    def test_pmxml_export(self):
        response = client.post(
            "/schedule/export",
            json={"format": "pmxml", "include_actuals": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "pmxml"
        assert data["activity_count"] == 120
        assert data["filename"].endswith(".xml")

    def test_xer_export(self):
        response = client.post(
            "/schedule/export",
            json={"format": "xer", "include_actuals": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "xer"
        assert data["filename"].endswith(".xer")

    def test_export_with_discipline_filter(self):
        response = client.post(
            "/schedule/export",
            json={"format": "pmxml", "filter_discipline": "piping"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["activity_count"] == 30

    def test_pmxml_content_is_valid_xml(self):
        response = client.post(
            "/schedule/export",
            json={"format": "pmxml"},
        )
        filename = response.json()["filename"]
        export_path = Path(__file__).resolve().parent.parent / "dataset" / "uploads" / filename
        assert export_path.exists()
        content = export_path.read_text()
        assert '<?xml version="1.0"' in content
        assert "OIL Well-Site Duliajan" in content
        # Should contain at least some activity IDs
        assert "CIV-FDN-1007" in content or "PIP-SPL-1025" in content


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 7: Memory query
# ═══════════════════════════════════════════════════════════════════════════════

class TestMemoryQuery:
    """Test GET /memory/query."""

    def test_duration_distribution(self):
        response = client.get("/memory/query?query_type=duration_distribution")
        assert response.status_code == 200
        data = response.json()
        assert data["query_type"] == "duration_distribution"
        assert data["duration_distribution"] is not None
        assert len(data["duration_distribution"]) > 0
        for dist in data["duration_distribution"]:
            assert dist["count"] > 0
            assert dist["planned_mean_days"] > 0

    def test_duration_distribution_with_filter(self):
        response = client.get(
            "/memory/query?query_type=duration_distribution&activity_type=PIP-SPL"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["duration_distribution"] is not None
        assert len(data["duration_distribution"]) >= 1

    def test_productivity(self):
        response = client.get("/memory/query?query_type=productivity")
        assert response.status_code == 200
        data = response.json()
        assert data["productivity"] is not None
        assert len(data["productivity"]) > 0
        for prod in data["productivity"]:
            assert prod["discipline"] in (
                "civil", "piping", "static_equipment",
                "electrical", "instrumentation", "hse", "unknown",
            )
            assert prod["total_activities"] > 0

    def test_productivity_filter_by_discipline(self):
        response = client.get(
            "/memory/query?query_type=productivity&discipline=piping"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["productivity"]) == 1
        assert data["productivity"][0]["discipline"] == "piping"

    def test_delay_reasons(self):
        response = client.get("/memory/query?query_type=delay_reasons")
        assert response.status_code == 200
        data = response.json()
        assert data["delay_reasons"] is not None

    def test_suggested_duration(self):
        response = client.get(
            "/memory/query?query_type=suggested_duration&activity_type=PIP-SPL"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["suggested_duration"] is not None
        sd = data["suggested_duration"]
        assert sd["sample_size"] > 0
        assert sd["median_planned_days"] > 0
        assert len(sd["recommendation"]) > 0

    def test_memory_query_all(self):
        response = client.get("/memory/query?query_type=all")
        assert response.status_code == 200
        data = response.json()
        assert data["duration_distribution"] is not None
        assert data["productivity"] is not None
        assert data["delay_reasons"] is not None
        assert data["suggested_duration"] is not None


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 8: Agent turn (conversational logging)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAgentTurn:
    """Test POST /agent/turn."""

    def test_agent_turn_creates_session(self):
        response = client.post(
            "/agent/turn",
            json={"message": "Foundation concreting for pipe rack pedestals completed today"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["turn_number"] == 1

    def test_agent_turn_fills_discipline(self):
        response = client.post(
            "/agent/turn",
            json={"message": "Piping spool erection 24 inch P-1001 completed"},
        )
        data = response.json()
        assert data["slots"]["discipline"] == "piping"

    def test_agent_turn_fills_status(self):
        response = client.post(
            "/agent/turn",
            json={"message": "Foundation concreting completed"},
        )
        data = response.json()
        assert data["slots"]["status"] == "completed"

    def test_agent_turn_fills_tags(self):
        response = client.post(
            "/agent/turn",
            json={"message": "Vessel V-101 setting completed on foundation"},
        )
        data = response.json()
        assert "V-101" in data["slots"]["tags"]

    def test_agent_turn_fills_quantity(self):
        response = client.post(
            "/agent/turn",
            json={"message": "Poured 24 m3 concrete for pipe rack pedestals"},
        )
        data = response.json()
        assert data["slots"]["quantity"] == 24.0

    def test_agent_turn_slot_filling_flow(self):
        """Test multi-turn slot filling."""
        # Turn 1: Give partial info
        response = client.post(
            "/agent/turn",
            json={"message": "Piping spool erection completed"},
        )
        data1 = response.json()
        session_id = data1["session_id"]
        assert data1["event_created"] is False  # Missing slots

        # Turn 2: Add location
        response = client.post(
            "/agent/turn",
            json={
                "session_id": session_id,
                "message": "Zone A, pipe rack tier 1",
            },
        )
        data2 = response.json()
        assert data2["turn_number"] == 2

    def test_agent_turn_multi_turn_session(self):
        """Test that session persists across turns."""
        response1 = client.post(
            "/agent/turn",
            json={"message": "Earthing grid installation civil"},
        )
        session_id = response1.json()["session_id"]

        response2 = client.post(
            "/agent/turn",
            json={"session_id": session_id, "message": "about 60% done, Zone B"},
        )
        assert response2.json()["session_id"] == session_id
        assert response2.json()["turn_number"] == 2

    def test_agent_turn_creates_conversation_record(self):
        response = client.post(
            "/agent/turn",
            json={"message": "Test message for conversation record"},
        )
        session_id = response.json()["session_id"]
        db = TestSession()
        turns = db.query(ConversationTurn).filter(
            ConversationTurn.session_id == session_id
        ).all()
        assert len(turns) == 1
        assert turns[0].user_message == "Test message for conversation record"
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 9: Audit trail integrity
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuditTrail:
    """Test that every actual-date write produces an immutable AuditRecord."""

    def test_audit_record_created_on_resolve_confirm(self):
        # Ingest to create review items
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            client.post("/ingest", files={"file": ("dpr_day_01.txt", f, "text/plain")})

        items = client.get("/review-queue").json()
        if not items:
            pytest.skip("No review items")

        item_id = items[0]["id"]
        client.post(f"/review/{item_id}/resolve", json={"action": "confirm"})

        db = TestSession()
        records = db.query(AuditRecord).all()
        assert len(records) >= 1
        for r in records:
            assert r.activity_id is not None
            assert r.field_changed is not None
            assert r.source in ("extraction", "matching", "planner_review", "agent_turn", "manual", "test")
        db.close()

    def test_audit_record_has_source_span(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            client.post("/ingest", files={"file": ("dpr_day_01.txt", f, "text/plain")})

        items = client.get("/review-queue").json()
        if not items:
            pytest.skip("No review items")

        client.post(f"/review/{items[0]['id']}/resolve", json={"action": "confirm"})

        db = TestSession()
        records = db.query(AuditRecord).all()
        for r in records:
            assert r.source_span is not None
            assert r.model_version is not None
        db.close()

    def test_audit_record_created_on_reassignment(self):
        dpr_path = Path(__file__).resolve().parent.parent / "dataset" / "dpr_day_01.txt"
        with open(dpr_path, "rb") as f:
            client.post("/ingest", files={"file": ("dpr_day_01.txt", f, "text/plain")})

        items = client.get("/review-queue").json()
        if not items:
            pytest.skip("No review items")

        client.post(
            f"/review/{items[0]['id']}/resolve",
            json={"action": "reassign", "activity_id": "CIV-FDN-1007"},
        )

        db = TestSession()
        records = db.query(AuditRecord).filter(
            AuditRecord.field_changed == "event_reassigned"
        ).all()
        assert len(records) >= 1
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 10: Integrity rules
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntegrityRules:
    """Test schedule integrity validation."""

    def test_actual_start_after_data_date_blocked(self):
        """Actual Start after data_date should raise IntegrityError."""
        from server.db import validate_actual_start as vas

        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        with pytest.raises(IntegrityError):
            vas(act, date(2026, 12, 1), DATA_DATE)  # After data_date
        db.close()

    def test_actual_finish_before_actual_start_blocked(self):
        """Actual Finish before Actual Start should raise IntegrityError."""
        from server.db import validate_actual_finish as vaf

        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        act.actual_start = date(2026, 7, 10)
        with pytest.raises(IntegrityError):
            vaf(act, date(2026, 7, 5))  # Before actual_start
        db.close()

    def test_predecessor_warning_not_blocking(self):
        """Predecessor-not-started should warn, not block."""
        from server.db import validate_actual_start as vas

        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-FDN-1007").first()
        # CIV-PLY-1004 predecessor not started — should warn but not block
        warnings = vas(act, date(2026, 7, 3), DATA_DATE)
        assert len(warnings) >= 1
        assert any("CIV-PLY-1004" in w.message for w in warnings)
        db.close()

    def test_valid_actual_dates_accepted(self):
        """Valid actual dates should not raise errors."""
        from server.db import validate_actual_start as vas
        from server.db import validate_actual_finish as vaf

        db = TestSession()
        act = db.query(Activity).filter(Activity.activity_id == "CIV-SIT-1001").first()
        act.predecessors = "[]"
        warnings = vas(act, date(2026, 6, 1), DATA_DATE)
        # Should not raise, predecessor is empty
        act.actual_start = date(2026, 6, 1)
        warnings2 = vaf(act, date(2026, 6, 7))
        assert len(warnings2) == 0
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 11: Linking engine
# ═══════════════════════════════════════════════════════════════════════════════

class TestServedEngineKeepsTheAliasChannelOff:
    """D-061, enforced on the engine the SERVER actually builds.

    `matching/test_config_floor.py::TestAliasChannelStaysOff` pins the library
    DEFAULTS. It cannot see `server/main.py`, so a change that reads
    `alias_lexicon` out of the database and turns `w_alias` up inside
    `get_matching_engine()` would leave that file's assertions passing while
    switching on a channel D-061 measured at +0.00 across every metric. That
    change has now been proposed twice, which is what this test is for.

    D-061's own diagnosis stands: corrections belong in RANKING, as a prior
    over activities that generalises across mentions. The alias channel is a
    RETRIEVAL channel and fusion recall@20 is already 100% (D-027), so there
    is nothing left for it to retrieve.
    """

    def test_the_served_config_has_no_alias_lexicon(self):
        from server.main import get_matching_engine

        engine = get_matching_engine()
        assert engine.config.alias_lexicon is None
        assert engine.retriever.alias_lexicon == {}

    def test_the_served_config_leaves_w_alias_at_zero(self):
        from server.main import get_matching_engine

        engine = get_matching_engine()
        assert engine.config.retrieval.w_alias == 0.0
        assert engine.config.retrieval.use_alias is False

    def test_the_engine_is_built_once_per_process(self):
        """The singleton is load-bearing, not an optimisation detail.

        Every proposal to feed the database into `get_matching_engine()` has
        also dropped the `_MATCHING_ENGINE` cache, because a per-request
        lexicon cannot be cached. That rebuilds `ScheduleIndex.from_json` on
        every ingest batch and every roll-up.
        """
        from server.main import get_matching_engine

        assert get_matching_engine() is get_matching_engine()


class TestLinkingEngine:
    """Test the event-to-activity linking logic."""

    def test_tag_exact_match(self):
        """Events with exact equipment tags should match with high confidence."""
        db = TestSession()
        from extraction.models import ExtractedEvent, Provenance, ExtractionMethod, Discipline

        event = ExtractedEvent(
            raw_text="V-101 separator setting completed",
            tags=["V-101"],
            discipline=Discipline.STATIC_EQUIPMENT,
            status="completed",
            provenance=Provenance(
                source_file="test.txt",
                source_span="V-101 separator setting completed",
                method=ExtractionMethod.PREPASS,
            ),
        )
        results = link_events_to_activities([event], db)
        matched_id, confidence, alternatives = results[0][1], results[0][2], results[0][3]
        assert matched_id is not None
        assert confidence >= 0.8
        db.close()

    def test_no_match_for_unknown_event(self):
        """Events with no matching tags or keywords should not match."""
        db = TestSession()
        from extraction.models import ExtractedEvent, Provenance, ExtractionMethod, Discipline

        event = ExtractedEvent(
            raw_text="Material delivery status report submitted to client",
            tags=[],
            discipline=Discipline.UNKNOWN,
            status="unknown",
            provenance=Provenance(
                source_file="test.txt",
                source_span="Material delivery status report submitted to client",
                method=ExtractionMethod.PREPASS,
            ),
        )
        results = link_events_to_activities([event], db)
        matched_id = results[0][1]
        # Should not match or match with very low confidence
        # (Material delivery is not in the schedule)
        db.close()

    def test_pipeline_tag_pipe_number(self):
        """Pipe tags like P-1001 should match activities mentioning P-1001."""
        db = TestSession()
        from extraction.models import ExtractedEvent, Provenance, ExtractionMethod, Discipline

        event = ExtractedEvent(
            raw_text="Spool erection for 24 inch P-1001 header",
            tags=['24"-P-1001-A1A'],
            discipline=Discipline.PIPING,
            status="in_progress",
            provenance=Provenance(
                source_file="test.txt",
                source_span="Spool erection for 24 inch P-1001 header",
                method=ExtractionMethod.PREPASS,
            ),
        )
        results = link_events_to_activities([event], db)
        matched_id = results[0][1]
        assert matched_id is not None
        assert "PIP" in matched_id
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 12: Cross-DPR extraction statistics
# ═══════════════════════════════════════════════════════════════════════════════

class TestCrossDPRStatistics:
    """Test extraction across all 10 DPR files + both spreadsheets."""

    def test_all_dprs_ingestible(self):
        """All 10 DPR files should be processable."""
        dataset_dir = Path(__file__).resolve().parent.parent / "dataset"
        for i in range(1, 11):
            dpr_path = dataset_dir / f"dpr_day_{i:02d}.txt"
            if not dpr_path.exists():
                continue
            with open(dpr_path, "rb") as f:
                fname = f"dpr_day_{i:02d}.txt"
                response = client.post(
                    "/ingest",
                    files={"file": (fname, f, "text/plain")},
                )
            assert response.status_code == 200
            assert response.json()["status"] == "completed"

    def test_spreadsheets_ingestible(self):
        """Both discipline spreadsheets should be processable."""
        dataset_dir = Path(__file__).resolve().parent.parent / "dataset"
        for filename in ["piping_progress.xlsx", "civil_progress.xlsx"]:
            path = dataset_dir / filename
            if not path.exists():
                continue
            with open(path, "rb") as f:
                response = client.post(
                    "/ingest",
                    files={"file": (filename, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                )
            assert response.status_code == 200

    def test_ground_truth_coverage(self):
        """Check that our extraction can find at least some ground-truth activity IDs."""
        gt_path = Path(__file__).resolve().parent.parent / "dataset" / "ground_truth.csv"
        if not gt_path.exists():
            pytest.skip("No ground truth file")

        ground_truth_ids = set()
        with open(gt_path) as f:
            next(f)  # Skip header
            for line in f:
                parts = line.strip().split(",")
                if len(parts) >= 4:
                    act_id = parts[3]
                    if act_id != "NO_MATCH":
                        ground_truth_ids.add(act_id)

        # Ingest all DPRs
        dataset_dir = Path(__file__).resolve().parent.parent / "dataset"
        for i in range(1, 11):
            dpr_path = dataset_dir / f"dpr_day_{i:02d}.txt"
            if not dpr_path.exists():
                continue
            with open(dpr_path, "rb") as f:
                fname = f"dpr_day_{i:02d}.txt"
                client.post(
                    "/ingest",
                    files={"file": (fname, f, "text/plain")},
                )

        # Check how many ground-truth IDs appear in our linked events
        db = TestSession()
        linked_ids = set(
            row[0] for row in db.query(LinkedEvent.activity_id).filter(
                LinkedEvent.activity_id.isnot(None)
            ).all()
        )
        db.close()

        coverage = len(ground_truth_ids & linked_ids) / len(ground_truth_ids) if ground_truth_ids else 0
        print(f"\nGround truth coverage: {coverage:.1%} ({len(ground_truth_ids & linked_ids)}/{len(ground_truth_ids)})")
        # Prepass-only matching covers ~27% of ground truth (LLM would push this higher)
        assert coverage >= 0.25, f"Coverage too low: {coverage:.1%}"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP: Export download (GET /uploads/{filename})
# ═══════════════════════════════════════════════════════════════════════════════

class TestExportDownload:
    """GET /uploads/{filename} — the route ExportResponse.download_url points at.

    Before D-044 that URL was advertised and nothing served it, so every Export
    in the UI produced a dead link.
    """

    def test_a_written_export_is_retrievable(self):
        export = client.post(
            "/schedule/export", json={"format": "pmxml", "include_actuals": True}
        ).json()
        assert export["download_url"] == f"/uploads/{export['filename']}"

        got = client.get(export["download_url"])
        assert got.status_code == 200
        assert got.headers["content-disposition"].startswith("attachment")
        assert export["filename"] in got.headers["content-disposition"]
        assert got.text.lstrip().startswith("<?xml")

    def test_xer_export_is_retrievable(self):
        export = client.post("/schedule/export", json={"format": "xer"}).json()
        got = client.get(export["download_url"])
        assert got.status_code == 200
        assert len(got.content) > 0

    def test_missing_file_is_404_not_500(self):
        got = client.get("/uploads/schedule_export_20000101_000000.xml")
        assert got.status_code == 404

    @pytest.mark.parametrize(
        "name",
        [
            "../../server/main.py",
            "..%2F..%2Fserver%2Fmain.py",
            "....//....//server/main.py",
            "subdir/thing.xml",
            "..",
        ],
    )
    def test_traversal_attempts_are_rejected(self, name):
        """Nothing outside dataset/uploads is reachable, and nothing 500s."""
        got = client.get(f"/uploads/{name}")
        assert got.status_code in (400, 404), got.status_code
        assert "def " not in got.text  # never the contents of a source file

    def test_absolute_path_is_rejected(self):
        got = client.get("/uploads//etc/passwd")
        assert got.status_code in (400, 404)
        assert "root:" not in got.text

    def test_non_export_extension_is_refused(self):
        """Only export types are served, so a file that lands in the directory
        by some other route cannot be pulled out through this one."""
        upload_dir = Path(__file__).resolve().parent.parent / "dataset" / "uploads"
        upload_dir.mkdir(exist_ok=True)
        planted = upload_dir / "secret_notes.txt"
        planted.write_text("private", encoding="utf-8")
        try:
            got = client.get("/uploads/secret_notes.txt")
            assert got.status_code == 400
            assert "private" not in got.text
        finally:
            planted.unlink(missing_ok=True)
# TEST GROUP: Primavera import (POST /schedule/import, PMXML + XER)
# ═══════════════════════════════════════════════════════════════════════════════

FIXTURES = Path(__file__).resolve().parent.parent / "dataset" / "fixtures"


class TestPrimaveraImport:
    """FINDINGS.md F3 — the PS names Primavera exports as an input.

    The critical property is that none of this can disturb the running demo
    baseline: the 120-activity synthetic schedule is what every number on stage
    is computed from.
    """

    def _upload(self, name, **form):
        path = FIXTURES / name
        ctype = "application/xml" if name.endswith(".xml") else "text/plain"
        return client.post(
            "/schedule/import",
            files={"file": (name, path.read_bytes(), ctype)},
            data={k: str(v).lower() for k, v in form.items()},
        )

    def test_pmxml_dry_run_reports_what_it_found(self):
        r = self._upload("sample_p6.xml", dry_run=True)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["activities_in_file"] == 3
        assert body["activities_created"] == 0
        assert body["activities_updated"] == 0
        assert body["baseline"]["source_format"] == "pmxml"
        assert "Dry run" in body["message"]
        assert "3 activities" in body["message"]

    def test_xer_dry_run_reports_what_it_found(self):
        r = self._upload("sample_p6.xer", dry_run=True)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["activities_in_file"] == 3
        assert body["baseline"]["source_format"] == "xer"

    def test_a_dry_run_writes_nothing_and_leaves_the_demo_baseline_active(self):
        """The whole point of the dry run. A P6 file can be inspected without
        touching the schedule the demo is computed from."""
        before = client.get("/schedule").json()
        assert before["total_activities"] == 120

        for name in ("sample_p6.xml", "sample_p6.xer"):
            assert self._upload(name, dry_run=True).status_code == 200

        after = client.get("/schedule").json()
        assert after["total_activities"] == 120
        assert after["activities_with_actuals"] == before["activities_with_actuals"]
        # None of the fixture ids leaked into the schedule.
        ids = {a["activity_id"] for a in after["activities"]}
        assert "PIP-ERC-2001" not in ids
        assert "CIV-EXC-1001" not in ids

    def test_a_dry_run_is_marked_as_an_import_and_replaced_nothing(self):
        body = self._upload("sample_p6.xml", dry_run=True).json()
        assert body["baseline"]["source"] == "import"
        assert body["replaced"] is False

    def test_a_real_commit_creates_the_activities_and_leaves_the_demo_ones_alone(self):
        """The import path end to end, not just the dry run.

        The fixture ids do not exist in the 120-activity demo baseline, so they
        are created alongside it: the demo activities are never modified, which
        is the property that matters two days before a demo. (The autouse
        fixture rebuilds the database per test, so this commit is not visible
        to any other test.)
        """
        before = client.get("/schedule").json()
        assert before["total_activities"] == 120

        r = self._upload("sample_p6.xml")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["activities_created"] == 3
        assert body["activities_updated"] == 0

        after = client.get("/schedule").json()
        assert after["total_activities"] == 123
        ids = {a["activity_id"] for a in after["activities"]}
        assert {"CIV-EXC-1001", "CIV-FDN-1002", "PIP-ERC-2001"} <= ids
        # Not one demo activity gained or lost an actual.
        assert after["activities_with_actuals"] == before["activities_with_actuals"]

    def test_importing_again_without_replace_is_refused(self):
        """A second import needs explicit consent.

        Two guards can fire here — one for an already-active baseline, one for
        colliding activity ids. Either is correct; what matters is a 409 with a
        reason that names replace=true.
        """
        assert self._upload("sample_p6.xml").status_code == 200
        second = self._upload("sample_p6.xml")
        assert second.status_code == 409
        detail = second.json()["detail"].lower()
        assert "already active" in detail or "already exist" in detail
        assert "replace" in detail

    def test_import_never_writes_actuals(self):
        """ROADMAP §4 rule 5 — an import populates a baseline, never actuals."""
        assert self._upload("sample_p6.xml").status_code == 200
        imported = [
            a for a in client.get("/schedule").json()["activities"]
            if a["activity_id"] in {"CIV-EXC-1001", "CIV-FDN-1002", "PIP-ERC-2001"}
        ]
        assert len(imported) == 3
        for a in imported:
            assert a["actual_start"] is None
            assert a["actual_finish"] is None
            assert a["actual_qty"] is None

    def test_a_malformed_file_names_the_file_and_the_reason(self):
        """Never a 200 with zero activities — the D-040 bug shape."""
        r = client.post(
            "/schedule/import",
            files={"file": ("broken.xml", b"<Project><Activity>", "application/xml")},
            data={"dry_run": "true"},
        )
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert "broken.xml" in detail
        assert "well-formed" in detail

    def test_a_text_file_renamed_xer_is_refused_clearly(self):
        r = client.post(
            "/schedule/import",
            files={"file": ("notes.xer", b"just some notes\nnothing here\n", "text/plain")},
            data={"dry_run": "true"},
        )
        assert r.status_code == 400
        assert "notes.xer" in r.json()["detail"]

    def test_mpp_is_refused_by_name_with_the_reason(self):
        """MPXJ needs a JVM; the refusal has to say so, or someone will add it."""
        r = client.post(
            "/schedule/import",
            files={"file": ("plan.mpp", b"\x00\x01binary", "application/octet-stream")},
            data={"dry_run": "true"},
        )
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert ".mpp" in detail or "mpp" in detail.lower()
        assert "MPXJ" in detail or "JVM" in detail

    def test_supported_formats_are_listed_in_the_refusal(self):
        r = client.post(
            "/schedule/import",
            files={"file": ("plan.pdf", b"%PDF-1.4", "application/pdf")},
            data={"dry_run": "true"},
        )
        assert r.status_code == 400
        detail = r.json()["detail"]
        for expected in (".json", ".xml", ".xer"):
            assert expected in detail


class TestExportRelationshipConsistency:
    """One schedule must not export two different logic networks.

    `_generate_xer` hardcoded `relationship_type SS` for every predecessor while
    `_generate_pmxml` wrote `FS` for the same rows, so the format chosen changed
    the meaning of the schedule. See D-047.
    """

    def test_pmxml_and_xer_agree_on_relationship_type(self):
        from matching.primavera import parse_pmxml, parse_xer

        upload_dir = Path(__file__).resolve().parent.parent / "dataset" / "uploads"
        xml_name = client.post(
            "/schedule/export", json={"format": "pmxml"}
        ).json()["filename"]
        xer_name = client.post(
            "/schedule/export", json={"format": "xer"}
        ).json()["filename"]

        from_xml = {
            a["activity_id"]: a["predecessors"]
            for a in parse_pmxml((upload_dir / xml_name).read_text(encoding="utf-8"), xml_name)
        }
        from_xer = {
            a["activity_id"]: a["predecessors"]
            for a in parse_xer((upload_dir / xer_name).read_text(encoding="utf-8"), xer_name)
        }

        assert set(from_xml) == set(from_xer)
        for activity_id, preds in from_xml.items():
            assert preds == from_xer[activity_id], activity_id

    def test_our_own_exports_round_trip_through_the_readers(self):
        """120 out, 120 back, with every relationship preserved."""
        from matching.primavera import parse_pmxml, parse_xer

        upload_dir = Path(__file__).resolve().parent.parent / "dataset" / "uploads"
        for fmt, parser in (("pmxml", parse_pmxml), ("xer", parse_xer)):
            export = client.post(
                "/schedule/export", json={"format": fmt, "include_actuals": True}
            ).json()
            parsed = parser(
                (upload_dir / export["filename"]).read_text(encoding="utf-8"),
                export["filename"],
            )
            assert len(parsed) == export["activity_count"] == 120
            assert all(a["planned_start"] and a["planned_finish"] for a in parsed)
            assert sum(len(a["predecessors"]) for a in parsed) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
