"""Baseline versioning and POST /schedule/import.

Two baselines ship and they share no activity ids, so "38 activities finished"
is not a fact until you can say which schedule it was measured against. These
tests cover the version record, the fields the v2 baseline adds, and the import
endpoint's refusal to replace a baseline without being told to.

The invariant worth stating plainly: importing a schedule never touches an
actual. A baseline says what was planned; what happened is captured evidence,
and a re-import must not erase it.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.conftest import _engine as _test_engine
from server.db import Activity, AuditRecord, Base, BaselineVersion
from server.main import (
    BASELINE_V2_PATH,
    DEFAULT_BASELINE_PATH,
    _seed_schedule_if_empty,
    get_active_baseline,
)

DATASET = Path(__file__).resolve().parent.parent / "dataset"
V1 = DATASET / "baseline_schedule.json"
V2 = DATASET / "baseline_schedule_v2.json"


@pytest.fixture(autouse=True)
def clean_database():
    """Import is a whole-database operation, so each test gets its own."""
    Base.metadata.drop_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture
def seeded(client, db_session):
    """The reference baseline loaded the way the server loads it."""
    _seed_schedule_if_empty(db_session)
    return db_session


def _import(client, path: Path, replace: bool = False, filename: str | None = None):
    with open(path, "rb") as f:
        return client.post(
            "/schedule/import",
            files={"file": (filename or path.name, f.read(), "application/json")},
            data={"replace": str(replace).lower()},
        )


# ══════════════════════════════════════════════════════════════════════════════
# The version record
# ══════════════════════════════════════════════════════════════════════════════

class TestBaselineVersionIsRecorded:
    def test_seeding_registers_the_baseline(self, seeded):
        version = get_active_baseline(seeded)
        assert version is not None, "the schedule was loaded and never recorded"
        assert version.filename == "baseline_schedule.json"
        assert version.activity_count == 120
        assert version.source == "seed"
        assert version.is_active

    def test_the_recorded_hash_is_the_file_hash(self, seeded):
        version = get_active_baseline(seeded)
        assert version.sha256 == hashlib.sha256(V1.read_bytes()).hexdigest()

    def test_a_pre_existing_table_is_registered_retrospectively(self, client, db_session):
        """conftest seeds activities directly, the way a database created
        before baseline tracking existed would look. The server must still be
        able to say which schedule is loaded rather than reporting nothing."""
        assert db_session.query(Activity).count() == 120
        assert get_active_baseline(db_session) is None
        _seed_schedule_if_empty(db_session)
        version = get_active_baseline(db_session)
        assert version is not None
        assert version.filename == "baseline_schedule.json"
        assert "retrospectively" in (version.note or "")

    def test_schedule_response_names_its_baseline(self, client, seeded):
        response = client.get("/schedule")
        assert response.status_code == 200
        baseline = response.json()["baseline"]
        assert baseline is not None, "a metric with no baseline is unattributable"
        assert baseline["filename"] == "baseline_schedule.json"
        assert baseline["activity_count"] == 120
        assert len(baseline["sha256"]) == 64


# ══════════════════════════════════════════════════════════════════════════════
# The fields v2 adds
# ══════════════════════════════════════════════════════════════════════════════

class TestScheduleFieldsAcrossBaselines:
    def test_v1_states_no_level_or_calendar(self, client, seeded):
        rows = client.get("/schedule").json()["activities"]
        assert rows
        assert all(r["wbs_level"] is None for r in rows)
        assert all(r["calendar"] is None for r in rows)

    def test_predecessors_are_available_both_ways(self, client, seeded):
        rows = client.get("/schedule").json()["activities"]
        linked = next(r for r in rows if r["predecessors"])
        assert isinstance(linked["predecessors"][0], str)
        link = linked["predecessor_links"][0]
        assert link["activity_id"] == linked["predecessors"][0]
        # A v1 bare id means FS with zero lag, and always did.
        assert link["rel"] == "FS"
        assert link["lag_days"] == 0

    def test_v2_level_calendar_and_typed_logic_reach_the_api(self, client, seeded):
        assert _import(client, V2, replace=True).status_code == 200
        rows = client.get("/schedule").json()["activities"]
        by_id = {r["activity_id"]: r for r in rows}
        act = by_id["CIV-SRV-1001"]
        assert act["wbs_level"] == 5
        assert act["calendar"] == "6-day"
        assert act["wbs_path"].startswith("Duliajan Well-Site Development")

        lagged = next(
            r for r in rows
            if any(l["lag_days"] != 0 for l in r["predecessor_links"])
        )
        link = next(l for l in lagged["predecessor_links"] if l["lag_days"] != 0)
        assert link["rel"] in ("FS", "SS", "FF", "SF")


# ══════════════════════════════════════════════════════════════════════════════
# POST /schedule/import
# ══════════════════════════════════════════════════════════════════════════════

class TestImportRefusals:
    def test_replacing_an_active_baseline_needs_the_flag(self, client, seeded):
        response = _import(client, V2, replace=False)
        assert response.status_code == 409
        assert "replace=true" in response.json()["detail"]

    def test_the_refusal_changes_nothing(self, client, seeded):
        _import(client, V2, replace=False)
        assert seeded.query(Activity).count() == 120
        assert get_active_baseline(seeded).filename == "baseline_schedule.json"

    def test_a_non_json_baseline_is_refused(self, client, seeded):
        response = client.post(
            "/schedule/import",
            files={"file": ("schedule.xml", b"<Project/>", "application/xml")},
            data={"replace": "true"},
        )
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "PMXML" in detail and "not implemented" in detail

    def test_unreadable_json_is_refused(self, client, seeded):
        response = client.post(
            "/schedule/import",
            files={"file": ("broken.json", b"{not json", "application/json")},
            data={"replace": "true"},
        )
        assert response.status_code == 400
        assert "not readable JSON" in response.json()["detail"]

    def test_an_empty_baseline_is_refused(self, client, seeded):
        response = client.post(
            "/schedule/import",
            files={"file": ("empty.json", b"[]", "application/json")},
            data={"replace": "true"},
        )
        assert response.status_code == 400
        assert "no activities" in response.json()["detail"]

    def test_an_invalid_baseline_is_refused_whole(self, client, seeded, tmp_path):
        """Half-loading a broken baseline is far harder to notice than a
        refusal, so validation happens before anything is written."""
        bad = tmp_path / "bad.json"
        bad.write_text(json.dumps([
            {"activity_id": "DUP-1", "planned_start": "2026-01-01",
             "planned_finish": "2026-01-02", "wbs_level": 5},
            {"activity_id": "DUP-1", "planned_start": "2026-01-01",
             "planned_finish": "2026-01-02", "wbs_level": 5},
        ]), encoding="utf-8")
        response = _import(client, bad, replace=True)
        assert response.status_code == 400
        assert "duplicate" in response.json()["detail"]
        assert seeded.query(Activity).filter(
            Activity.activity_id == "DUP-1").count() == 0

    def test_a_bad_wbs_level_is_refused(self, client, seeded, tmp_path):
        bad = tmp_path / "level.json"
        bad.write_text(json.dumps([
            {"activity_id": "LVL-1", "planned_start": "2026-01-01",
             "planned_finish": "2026-01-02", "wbs_level": 3},
        ]), encoding="utf-8")
        response = _import(client, bad, replace=True)
        assert response.status_code == 400
        assert "wbs_level 3" in response.json()["detail"]

    def test_importing_into_an_empty_database_needs_no_flag(self, client, db_session):
        """Nothing is being replaced, so nothing needs consent."""
        db_session.query(Activity).delete()
        db_session.commit()
        response = _import(client, V2, replace=False)
        assert response.status_code == 200, response.text
        assert response.json()["activities_created"] == 218


class TestImportSucceeds:
    def test_v2_imports_and_becomes_active(self, client, seeded):
        response = _import(client, V2, replace=True)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["activities_created"] == 218
        assert body["activities_updated"] == 0
        assert body["activities_in_file"] == 218
        assert body["replaced"] is True

        active = get_active_baseline(seeded)
        assert active.filename == "baseline_schedule_v2.json"
        assert active.activity_count == 218
        assert active.source == "import"
        assert active.sha256 == hashlib.sha256(V2.read_bytes()).hexdigest()

    def test_the_previous_version_is_retired_not_deleted(self, client, seeded):
        _import(client, V2, replace=True)
        rows = seeded.query(BaselineVersion).all()
        assert len(rows) == 2, "the history of what was loaded must survive"
        assert sum(1 for r in rows if r.is_active) == 1
        retired = next(r for r in rows if not r.is_active)
        assert retired.filename == "baseline_schedule.json"

    def test_the_old_activities_are_not_deleted(self, client, seeded):
        """Deleting them would orphan their LinkedEvent and AuditRecord rows
        and silently destroy the append-only trail (D-004)."""
        _import(client, V2, replace=True)
        assert seeded.query(Activity).count() == 120 + 218
        assert seeded.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").count() == 1

    def test_the_import_is_audited_with_file_and_hash(self, client, seeded):
        _import(client, V2, replace=True)
        records = (
            seeded.query(AuditRecord)
            .filter(AuditRecord.field_changed == "baseline_imported")
            .all()
        )
        assert len(records) == 218
        sha = hashlib.sha256(V2.read_bytes()).hexdigest()
        rec = records[0]
        assert rec.source == "baseline_import"
        assert rec.source_file == "baseline_schedule_v2.json"
        assert sha in rec.new_value
        assert rec.auto_applied is False

    def test_reimporting_the_same_file_updates_nothing(self, client, seeded):
        """The planned fields already match, so a re-import is a no-op beyond
        registering the version."""
        _import(client, V2, replace=True)
        again = _import(client, V2, replace=True)
        assert again.status_code == 200
        assert again.json()["activities_created"] == 0
        assert again.json()["activities_updated"] == 0

    def test_schedule_response_switches_baseline_after_import(self, client, seeded):
        _import(client, V2, replace=True)
        baseline = client.get("/schedule").json()["baseline"]
        assert baseline["filename"] == "baseline_schedule_v2.json"
        assert baseline["activity_count"] == 218


class TestMatcherBaselineDrift:
    """Importing a baseline changes what the SCHEDULE holds without changing
    what INGEST can link to — the matcher stays pinned to the schedule its
    thresholds and ground truth were built against. That divergence is real,
    so it has to be visible rather than discovered through empty results."""

    def test_no_warning_while_they_agree(self, client, seeded):
        client.get("/schedule")            # builds nothing; matcher may be lazy
        warnings = client.get("/schedule").json()["integrity_warnings"]
        assert not [w for w in warnings if w["field"] == "baseline"]

    def test_the_divergence_is_reported(self, client, seeded):
        from server.main import get_matching_engine

        get_matching_engine()              # matcher is pinned to v1
        assert _import(client, V2, replace=True).status_code == 200
        warnings = client.get("/schedule").json()["integrity_warnings"]
        drift = [w for w in warnings if w["field"] == "baseline"]
        assert drift, "a matcher/schedule mismatch was reported to nobody"
        assert "baseline_schedule_v2.json" in drift[0]["message"]
        assert "baseline_schedule.json" in drift[0]["message"]


class TestImportNeverTouchesActuals:
    def test_captured_progress_survives_a_reimport(self, client, seeded):
        act = seeded.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first()
        act.actual_start = date(2026, 6, 3)
        act.actual_finish = date(2026, 6, 6)
        act.actual_qty = 1200
        act.actual_finish_basis = "EXPLICIT"
        seeded.commit()

        assert _import(client, V1, replace=True).status_code == 200

        seeded.expire_all()
        act = seeded.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first()
        assert act.actual_start == date(2026, 6, 3)
        assert act.actual_finish == date(2026, 6, 6)
        assert act.actual_qty == 1200
        assert act.actual_finish_basis == "EXPLICIT"

    def test_planned_fields_are_updated_on_replace(self, client, seeded, tmp_path):
        revised = tmp_path / "revised.json"
        source = json.loads(V1.read_text(encoding="utf-8"))
        for entry in source:
            if entry["activity_id"] == "CIV-SIT-1001":
                entry["planned_finish"] = "2026-06-30"
                entry["wbs_level"] = 5
                entry["calendar"] = "7-day"
        revised.write_text(json.dumps(source), encoding="utf-8")

        response = _import(client, revised, replace=True)
        assert response.status_code == 200, response.text
        assert response.json()["activities_updated"] >= 1

        seeded.expire_all()
        act = seeded.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first()
        assert act.planned_finish == date(2026, 6, 30)
        assert act.wbs_level == 5
        assert act.calendar == "7-day"

    def test_a_reimport_migrates_legacy_predecessor_storage(self, client, seeded):
        """conftest seeds rows the way a pre-typed-predecessor database looks:
        `["CIV-SIT-1001"]` rather than `[{"activity_id": ...}]`. Both read back
        identically through predecessor_links(), so nothing was broken — but a
        re-import is what actually rewrites them into the typed shape, and it
        must count that as an update rather than silently skipping it."""
        act = seeded.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1002").first()
        act.predecessors = json.dumps(["CIV-SIT-1001"])       # legacy shape
        seeded.commit()

        response = _import(client, V1, replace=True)
        assert response.status_code == 200, response.text
        assert response.json()["activities_updated"] >= 1

        seeded.expire_all()
        act = seeded.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1002").first()
        assert json.loads(act.predecessors) == [
            {"activity_id": "CIV-SIT-1001", "rel": "FS", "lag_days": 0}
        ]
        # The compatibility view is unchanged by the migration.
        assert act.predecessor_list() == ["CIV-SIT-1001"]
