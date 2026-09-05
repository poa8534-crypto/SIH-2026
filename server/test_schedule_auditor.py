"""Tests for AI Schedule Feasibility & Knowledge Auditor ("Schedule Doctor")."""

import json
from datetime import date
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.db import Activity, Base
from server.main import app, get_db
from server.schedule_auditor import audit_schedule
from server.knowledge_base import knowledge_base

TEST_DB_PATH = Path("dataset/test_schedule_auditor.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"
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
    Base.metadata.create_all(bind=test_engine)
    db = TestSession()
    try:
        schedule_path = Path(__file__).resolve().parent.parent / "dataset" / "baseline_schedule.json"
        with open(schedule_path, encoding="utf-8") as f:
            activities = json.load(f)
        for act in activities:
            db.add(
                Activity(
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
                )
            )
        db.commit()
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except OSError:
            pass


client = TestClient(app)


def test_audit_schedule_detects_duration_optimism_and_open_ends():
    sample_activities = [
        {
            "activity_id": "CIV-FDN-1002",
            "description": "Pad-04 Equipment Foundation Concrete Pour",
            "discipline": "civil",
            "planned_start": date(2026, 5, 1),
            "planned_finish": date(2026, 5, 7),  # 6 days (P50 is 20 days -> -70% optimism)
            "planned_qty": 50.0,
            "uom": "m3",
            "predecessors": [],
            "wbs_level": 5,
        },
        {
            "activity_id": "PIP-SPL-1025",
            "description": "Erect Line 24-SPL Spools",
            "discipline": "piping",
            "planned_start": date(2026, 5, 8),
            "planned_finish": date(2026, 5, 20),
            "planned_qty": 40.0,
            "uom": "spools",
            "predecessors": [{"activity_id": "CIV-FDN-1002", "rel": "FS", "lag_days": 0}],
            "wbs_level": 5,
        },
        # Open-ended activity with no successors and not COD
        {
            "activity_id": "ELE-CAB-2001",
            "description": "Cable Pulling to Substation",
            "discipline": "electrical",
            "planned_start": date(2026, 5, 21),
            "planned_finish": date(2026, 5, 30),
            "planned_qty": 500.0,
            "uom": "m",
            "predecessors": [{"activity_id": "PIP-SPL-1025", "rel": "FS", "lag_days": 0}],
            "wbs_level": 5,
        },
    ]

    res = audit_schedule(sample_activities, schedule_name="Test Feasibility Plan")

    assert res.total_activities == 3
    assert res.feasibility_score <= 90

    # Find optimism finding
    optimism = next((f for f in res.findings if f.category == "duration_optimism"), None)
    assert optimism is not None
    assert optimism.activity_id == "CIV-FDN-1002"
    assert optimism.severity == "critical"
    assert optimism.variance_pct < -50.0

    # Find DCMA open end finding
    open_end = next((f for f in res.findings if f.category == "dcma_logic" and f.activity_id == "ELE-CAB-2001"), None)
    assert open_end is not None
    assert "no successor" in open_end.critique_message.lower()


def test_audit_schedule_detects_monsoon_weather_clash():
    sample_activities = [
        {
            "activity_id": "CIV-EXC-001",
            "description": "Sector 04 Trench Excavation in River Basin",
            "discipline": "civil",
            "planned_start": date(2026, 7, 10),
            "planned_finish": date(2026, 8, 15),  # Peak Upper Assam Monsoon
            "planned_qty": 200.0,
            "uom": "m3",
            "predecessors": [],
            "wbs_level": 5,
        },
    ]

    res = audit_schedule(sample_activities, schedule_name="Monsoon Trenching")
    monsoon_finding = next((f for f in res.findings if f.category == "monsoon_weather"), None)
    assert monsoon_finding is not None
    assert monsoon_finding.activity_id == "CIV-EXC-001"
    assert "Upper Assam monsoon" in monsoon_finding.critique_message


def test_api_get_schedule_audit():
    response = client.get("/schedule/audit")
    assert response.status_code == 200
    data = response.json()

    assert "feasibility_score" in data
    assert "feasibility_band" in data
    assert "findings" in data
    assert "score_breakdown" in data
    assert len(data["findings"]) > 0


def test_api_knowledge_rules():
    response = client.get("/knowledge/rules")
    assert response.status_code == 200
    data = response.json()

    assert data["total_rules"] >= 7
    assert "environmental" in data["categories"]
    assert "dcma_quality" in data["categories"]

    # Test adding a custom rule
    new_rule = {
        "id": "RULE-TEST-01",
        "category": "logistics",
        "title": "Brahmaputra Barge Transport Permit",
        "description": "Barge transit requires inland waterways clearance.",
        "condition_trigger": "Barge mobilization without permit.",
        "impact_recommendation": "Add 7 days buffer.",
        "severity": "medium",
        "active": True,
    }
    post_res = client.post("/knowledge/rules", json=new_rule)
    assert post_res.status_code == 200
    assert post_res.json()["status"] == "success"
