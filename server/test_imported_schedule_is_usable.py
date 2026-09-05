"""An imported schedule must be reportable against, not just viewable.

THE ACCEPTANCE CONDITION.
Import an unfamiliar schedule, report work against an activity that exists
only in it, and retrieve the correct persisted update.

Before D-092 this was impossible. `get_matching_engine()` was pinned to
`SCHEDULE_PATH` — a file on disk — so an imported baseline was visible on
every read endpoint and invisible to the matcher. A report about an activity
unique to the new schedule matched nothing, or matched a plausible-looking
activity from the OLD baseline, and nothing on the screen distinguished those
two outcomes. `_matcher_baseline_drift` reported the divergence honestly,
which made it a known limitation rather than a silent one, but the product
could not be used on a schedule it had not shipped with.

The schedule below is deliberately alien to both shipped baselines: tunnelling
and shaft-sinking work, ids under a `TUN`/`SHF` prefix that no demo activity
uses, and vocabulary that appears nowhere in `dataset/`. If the matcher were
still indexing the demo file, every assertion here would fail rather than
quietly pass on a lucky match.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from server.conftest import _engine as _test_engine
from server.db import Activity, Base, BaselineVersion, LinkedEvent, ReviewQueueItem
from server.main import _seed_schedule_if_empty


ALIEN_SCHEDULE = [
    {
        "activity_id": "TUN-BOR-9001",
        "wbs_path": "2.1.1",
        "description": "Tunnel Boring Machine drive — North Adit Chainage 0+000 to 0+450",
        "detail": "TBM launch and primary drive through weathered gneiss",
        "discipline": "civil",
        "planned_start": "2026-07-01",
        "planned_finish": "2026-08-15",
        "planned_qty": 450,
        "uom": "m",
        "predecessors": [],
    },
    {
        "activity_id": "SHF-SNK-9002",
        "wbs_path": "2.1.2",
        "description": "Shaft sinking — Ventilation Shaft V2 to invert level",
        "detail": "Blind sinking with shotcrete lining",
        "discipline": "civil",
        "planned_start": "2026-07-10",
        "planned_finish": "2026-09-05",
        "planned_qty": 62,
        "uom": "m",
        "predecessors": [
            {"activity_id": "TUN-BOR-9001", "rel": "SS", "lag_days": 9}
        ],
    },
    {
        "activity_id": "TUN-SEG-9003",
        "wbs_path": "2.1.3",
        "description": "Precast segment erection — North Adit rings 1 to 300",
        "detail": "Segmental lining behind the TBM shield",
        "discipline": "civil",
        "planned_start": "2026-07-20",
        "planned_finish": "2026-09-20",
        "planned_qty": 300,
        "uom": "nos",
        "predecessors": [
            {"activity_id": "TUN-BOR-9001", "rel": "FF", "lag_days": 5}
        ],
    },
]


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture(autouse=True)
def isolated_matching_engine():
    """The matcher is a module-level singleton; give it back afterwards.

    Every test here imports a baseline, which rebuilds it. Without this the
    tunnelling schedule would leak into every later test module in the run.
    """
    import server.main as main

    previous = main._MATCHING_ENGINE
    main._MATCHING_ENGINE = None
    try:
        yield
    finally:
        main._MATCHING_ENGINE = previous


@pytest.fixture
def imported(client, db_session, tmp_path: Path):
    """Demo baseline seeded, then an alien schedule imported over it."""
    _seed_schedule_if_empty(db_session)

    path = tmp_path / "tunnelling_baseline.json"
    path.write_text(json.dumps(ALIEN_SCHEDULE), encoding="utf-8")
    with open(path, "rb") as f:
        response = client.post(
            "/schedule/import",
            files={"file": (path.name, f.read(), "application/json")},
            data={"replace": "true"},
        )
    assert response.status_code == 200, response.text
    return db_session


def _turn(client, session_id: str, message: str, confirm: bool = False):
    return client.post(
        "/agent/turn",
        json={"session_id": session_id, "message": message, "confirm": confirm},
    )


#: Answers for whatever the agent still needs. The point of these tests is the
#: MATCH against an imported schedule, not the slot-filling dialogue, which
#: `server/test_agent.py` covers — so the conversation is driven to completion
#: rather than assumed to finish in one turn.
_ANSWERS = {
    "discipline": "Civil",
    "date": "12 September 2026",
    "location": "North Adit",
    "status": "Finished",
    "quantity": "as reported",
    "uom": "m",
}


def _drive_to_proposal(client, session_id: str, opening: str) -> dict:
    """Send the report, answer every follow-up, return the ready turn."""
    body = _turn(client, session_id, opening).json()
    for _ in range(8):
        if body.get("awaiting_confirmation"):
            return body
        pending = body.get("pending_slots") or []
        if not pending:
            break
        answer = _ANSWERS.get(pending[0])
        assert answer, f"no canned answer for slot {pending[0]!r}"
        body = _turn(client, session_id, answer).json()
    assert body.get("awaiting_confirmation"), (
        f"the agent never became ready: {body.get('agent_message')!r}"
    )
    return body


class TestTheMatcherFollowsTheSchedule:
    def test_the_index_holds_the_imported_activities(self, imported):
        from server.main import get_matching_engine

        index = get_matching_engine().index
        assert set(index.by_id) == {"TUN-BOR-9001", "SHF-SNK-9002", "TUN-SEG-9003"}

    def test_no_demo_activity_survives_in_the_index(self, imported):
        from server.main import get_matching_engine

        index = get_matching_engine().index
        assert "CIV-SIT-1001" not in index.by_id
        assert not any(a.startswith("PIP-") for a in index.by_id)

    def test_the_index_names_the_baseline_it_came_from(self, imported):
        from server.main import get_matching_engine

        baseline = get_matching_engine().index.baseline
        assert baseline is not None
        assert baseline.filename == "tunnelling_baseline.json"
        assert baseline.activity_count == 3


class TestReportingAgainstANewActivity:
    """The acceptance condition, end to end."""

    def test_a_report_reaches_an_activity_unique_to_the_new_schedule(
        self, client, imported
    ):
        session = "alien-1"
        body = _drive_to_proposal(
            client, session,
            "Tunnel boring machine drive on the north adit is complete, "
            "450 m bored",
        )

        assert body["slots"]["activity_id"] == "TUN-BOR-9001", (
            "the report matched "
            f"{body['slots']['activity_id']!r}, which is not an activity of "
            "the imported schedule"
        )

        committed = _turn(client, session, "", confirm=True).json()
        assert committed["event_created"] is True
        assert committed["review_item_id"]

    def test_the_persisted_update_is_retrievable_and_correct(self, client, imported):
        session = "alien-2"
        _drive_to_proposal(
            client, session,
            "Shaft sinking on ventilation shaft V2 finished, 62 m sunk",
        )
        committed = _turn(client, session, "", confirm=True).json()
        assert committed["event_created"] is True
        item_id = committed["review_item_id"]

        # Retrieved through the API a planner actually uses.
        queue = client.get("/review-queue").json()
        row = next((r for r in queue if r["id"] == item_id), None)
        assert row is not None, "the submitted update is not in the review queue"
        assert row["activity_id"] == "SHF-SNK-9002"
        assert "ventilation shaft" in row["raw_text"].lower()

    def test_the_update_is_stored_against_the_imported_activity(
        self, client, imported
    ):
        session = "alien-3"
        _drive_to_proposal(
            client, session,
            "Precast segment erection complete on the north adit, 300 rings placed",
        )
        committed = _turn(client, session, "", confirm=True).json()
        assert committed["event_created"] is True

        imported.expire_all()
        event = imported.query(LinkedEvent).filter(
            LinkedEvent.id == committed["linked_event_id"]).first()
        assert event is not None
        assert event.activity_id == "TUN-SEG-9003"

        activity = imported.query(Activity).filter(
            Activity.activity_id == "TUN-SEG-9003").first()
        assert activity is not None
        active = imported.query(BaselineVersion).filter(
            BaselineVersion.is_active.is_(True)).first()
        assert activity.baseline_id == active.id


class TestTheOldProjectIsNotDestroyed:
    def test_the_demo_activities_are_still_in_the_table(self, imported):
        assert imported.query(Activity).filter(
            Activity.activity_id == "CIV-SIT-1001").first() is not None

    def test_but_they_are_not_in_the_open_project(self, client, imported):
        schedule = client.get("/schedule").json()
        assert schedule["total_activities"] == 3
        ids = {a["activity_id"] for a in schedule["activities"]}
        assert ids == {"TUN-BOR-9001", "SHF-SNK-9002", "TUN-SEG-9003"}


class TestTheImportedLogicSurvivesAnExport:
    def test_the_ss_and_ff_ties_come_back_out_of_the_export(self, client, imported):
        from matching.primavera import parse_pmxml
        from server.main import _generate_pmxml, scoped_activities

        xml = _generate_pmxml(
            scoped_activities(imported), include_actuals=False,
            project_name="tunnelling_baseline",
        )
        parsed = {a["activity_id"]: a["predecessors"] for a in parse_pmxml(xml)}

        assert parsed["SHF-SNK-9002"] == [
            {"activity_id": "TUN-BOR-9001", "rel": "SS", "lag_days": 9}
        ]
        assert parsed["TUN-SEG-9003"] == [
            {"activity_id": "TUN-BOR-9001", "rel": "FF", "lag_days": 5}
        ]
