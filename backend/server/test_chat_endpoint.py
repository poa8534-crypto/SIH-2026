import json
from datetime import date
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.db import Activity, Base
from server.main import app, get_db

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
    Base.metadata.create_all(bind=test_engine)
    db = TestSession()
    try:
        count = db.query(Activity).count()
        if count == 0:
            schedule_path = Path(__file__).resolve().parent.parent.parent / "dataset" / "baseline_schedule.json"
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


def test_chat_field_reporting_guide():
    resp = client.post("/chat", json={"question": "How do I report spool erection?", "role": "field"})
    assert resp.status_code == 200
    data = resp.json()
    assert "piping" in data["answer"].lower() or "spool" in data["answer"].lower()
    assert data["grounded"] is True
    assert len(data["suggested_actions"]) > 0
    assert data["suggested_actions"][0]["type"] == "insert_draft"
    assert "spool" in data["suggested_actions"][0]["text"].lower()


def test_chat_field_clarifications():
    resp = client.post("/chat", json={"question": "Do I have any clarifications from the planner?", "role": "field"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["grounded"] is True
    assert "clarification" in data["answer"].lower() or "planning" in data["answer"].lower()


def test_chat_planner_match_justification():
    resp = client.post("/chat", json={"question": "Why did NAVIS link the report to this activity?", "role": "planner"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["grounded"] is True
    assert any(a["url"] == "/reconcile" for a in data["suggested_actions"])


def test_chat_executive_forecast():
    resp = client.post("/chat", json={"question": "What is our projected completion date?", "role": "executive"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["grounded"] is True
    assert "Project Completion Outlook" in data["answer"]
    assert any(a["url"] == "/executive" for a in data["suggested_actions"])


def test_chat_executive_exposure():
    resp = client.post("/chat", json={"question": "Where is our biggest exposure right now?", "role": "executive"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["grounded"] is True
    assert any(a["url"] == "/executive/exposure" for a in data["suggested_actions"])


def test_chat_general_delay_qa():
    resp = client.post("/qa/ask", json={"question": "why is the project delayed?", "role": "planner"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["grounded"] is True
    assert "Sources:" in data["answer"] or len(data["citations"]) > 0
