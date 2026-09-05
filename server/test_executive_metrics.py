"""Tests for executive intelligence metrics endpoint and calculation."""

import json
from datetime import date
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.db import Activity, Base
from server.executive_metrics import compute_executive_metrics
from server.main import app, get_db, DATA_DATE

TEST_DB_PATH = Path("dataset/test_executive_metrics.db")
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
    test_engine.dispose()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink(missing_ok=True)
        except OSError:
            pass


def test_compute_executive_metrics_returns_valid_structure():
    db = TestSession()
    try:
        metrics = compute_executive_metrics(db, as_of=DATA_DATE)

        assert "kpis" in metrics
        assert "dispute_shield" in metrics
        assert "completion_forecast" in metrics
        assert "s_curve" in metrics
        assert "critical_drivers" in metrics
        assert "milestones" in metrics

        # KPIs check
        kpis = metrics["kpis"]
        assert kpis["total_activities"] > 0
        assert kpis["evidence_coverage_pct"] >= 0.0
        assert "spi" in kpis
        assert "float_drift_days" in kpis

        # S-curve check
        s_curve = metrics["s_curve"]
        assert len(s_curve) > 0
        first_pt = s_curve[0]
        assert "date" in first_pt
        assert "pv_cumulative" in first_pt
        assert "ev_cumulative" in first_pt
        assert "ev_projected" in first_pt

        # Dispute shield check
        dispute = metrics["dispute_shield"]
        assert "employer_delay_days" in dispute
        assert "contractor_ld_risk_cr" in dispute
        assert "contract_value_cr" in dispute
    finally:
        db.close()


def test_api_get_executive_metrics():
    client = TestClient(app)
    response = client.get("/executive/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "kpis" in data
    assert "s_curve" in data
    assert "dispute_shield" in data
    assert len(data["s_curve"]) > 0
    assert len(data["milestones"]) > 0
