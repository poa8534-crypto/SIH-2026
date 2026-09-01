"""A defaulted finish date must not reach the schedule.

`dataset/dpr_day_10.txt` is dated 15/09/2026 and closes out a run of piping
work without dating any of it. Before this guard existed, eleven activities
came out of the pipeline carrying `Actual Finish 2026-09-15` and two of them
with `actual_start == actual_finish` — a zero-duration activity manufactured
out of the day the report was typed.

These tests drive the real ingest endpoint, so they cover the whole path:
extraction basis → roll-up gate → schedule write → review queue → the planner
resolution that is the only way such a date ever becomes an actual.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extraction.models import DateBasis
from server.conftest import _engine as _test_engine
from server.db import Activity, Base, LinkedEvent, ReviewQueueItem
from server.main import DEFAULTED_FINISH_REASON

DATASET = Path(__file__).resolve().parent.parent / "dataset"
DEFAULTED = DateBasis.DEFAULTED_TO_REPORT_DATE.value


@pytest.fixture(autouse=True)
def clean_database():
    """Each test ingests the same report, so each needs its own database:
    a second upload of the same file is deduplicated by sha256 by design."""
    Base.metadata.drop_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


def _ingest(client, name: str):
    path = DATASET / name
    with open(path, "rb") as f:
        response = client.post(
            "/ingest", files={"file": (name, f.read(), "text/plain")}
        )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def ingested(client, db_session):
    """The report that produced the defect, ingested."""
    _ingest(client, "dpr_day_10.txt")
    return db_session


class TestDefaultedFinishIsNotWritten:
    def test_no_activity_is_finished_on_a_defaulted_date(self, ingested):
        finished = (
            ingested.query(Activity)
            .filter(Activity.actual_finish.isnot(None))
            .all()
        )
        for act in finished:
            assert act.actual_finish_basis != DEFAULTED, (
                f"{act.activity_id} was finished on a date no source named "
                f"({act.actual_finish})"
            )

    def test_no_zero_duration_activity_from_defaulted_dates(self, ingested):
        for act in ingested.query(Activity).all():
            if act.actual_start and act.actual_start == act.actual_finish:
                assert not (
                    act.actual_start_basis == DEFAULTED
                    and act.actual_finish_basis == DEFAULTED
                ), f"{act.activity_id} has zero duration from two inferred dates"

    def test_the_event_itself_recorded_the_defaulting(self, ingested):
        defaulted = (
            ingested.query(LinkedEvent)
            .filter(LinkedEvent.asserted_finish_basis == DEFAULTED)
            .all()
        )
        assert defaulted, "dpr_day_10 should carry undated completion claims"

    def test_a_withheld_finish_reaches_the_planner(self, ingested):
        items = (
            ingested.query(ReviewQueueItem)
            .filter(ReviewQueueItem.reason == DEFAULTED_FINISH_REASON)
            .all()
        )
        assert items, "a withheld finish date left no review item behind"
        for item in items:
            assert item.activity_id, "the review item must name the activity"
            assert item.status == "pending"

    def test_the_reason_names_the_defaulting(self, client, ingested):
        response = client.get("/review-queue")
        assert response.status_code == 200
        reasons = {row["reason"] for row in response.json()}
        assert DEFAULTED_FINISH_REASON in reasons


class TestPlannerResolvesAWithheldFinish:
    def _one_item(self, db):
        item = (
            db.query(ReviewQueueItem)
            .filter(
                ReviewQueueItem.reason == DEFAULTED_FINISH_REASON,
                ReviewQueueItem.status == "pending",
            )
            .first()
        )
        assert item is not None
        return item

    def test_confirm_writes_the_date_and_keeps_it_marked_inferred(
        self, client, ingested
    ):
        item = self._one_item(ingested)
        activity_id = item.activity_id
        response = client.post(f"/review/{item.id}/resolve", json={"action": "confirm"})
        assert response.status_code == 200, response.text

        ingested.expire_all()
        act = (
            ingested.query(Activity)
            .filter(Activity.activity_id == activity_id)
            .first()
        )
        assert act.actual_finish is not None, "planner confirmation wrote nothing"
        # The planner owns the date now, but it is still an inferred one and
        # the trail has to keep saying so.
        assert act.actual_finish_basis == DEFAULTED

    def test_ignore_leaves_the_finish_unwritten(self, client, ingested):
        item = self._one_item(ingested)
        activity_id = item.activity_id
        before = (
            ingested.query(Activity)
            .filter(Activity.activity_id == activity_id)
            .first()
            .actual_finish
        )
        response = client.post(f"/review/{item.id}/resolve", json={"action": "ignore"})
        assert response.status_code == 200, response.text

        ingested.expire_all()
        act = (
            ingested.query(Activity)
            .filter(Activity.activity_id == activity_id)
            .first()
        )
        assert act.actual_finish == before

    def test_a_link_action_is_refused_on_a_date_item(self, client, ingested):
        item = self._one_item(ingested)
        response = client.post(
            f"/review/{item.id}/resolve",
            json={"action": "reassign", "activity_id": "CIV-SIT-1001"},
        )
        assert response.status_code == 400


class TestScheduleSurfacesTheBasis:
    def test_schedule_response_carries_the_basis(self, client, ingested):
        response = client.get("/schedule")
        assert response.status_code == 200
        rows = response.json()["activities"]
        assert rows, "no activities returned"
        assert all(
            "actual_start_basis" in row and "actual_finish_basis" in row
            for row in rows
        )
        for row in rows:
            if row["actual_finish"] is None:
                assert row["actual_finish_basis"] is None
