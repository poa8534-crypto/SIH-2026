"""Shared fixtures.

`server/test_server.py` builds its own database with an autouse fixture and a
module-level client; this file provides the same thing as named fixtures so
newer test modules do not have to repeat it. Both point at the same test engine
and the same dependency override, so they cannot disagree about what "the
database" means.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, Base, add_missing_columns
from server.main import app, get_db

TEST_DB_URL = "sqlite:///dataset/test_epc_progress.db"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
_Session = sessionmaker(bind=_engine)


def _override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


def _seed_activities(db) -> None:
    """Load the real 120-activity baseline.

    The matcher fixture has to be the real schedule: a test that asserts an
    activity id is validated against the schedule is worthless against a
    handful of invented rows.
    """
    if db.query(Activity).count():
        return
    path = Path(__file__).resolve().parent.parent.parent / "dataset" / "baseline_schedule.json"
    from extraction.textio import read_text

    for act in json.loads(read_text(path)):
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


@pytest.fixture
def db_session():
    """A session on the test database, with the baseline loaded."""
    Base.metadata.create_all(bind=_engine)
    # create_all cannot alter a table that already exists, and the test
    # database is a real file that outlives a run. Without this, a column
    # added since the file was created makes every query naming it fail.
    add_missing_columns(_engine)
    db = _Session()
    try:
        _seed_activities(db)
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    """An API client sharing the seeded test database."""
    return TestClient(app)
