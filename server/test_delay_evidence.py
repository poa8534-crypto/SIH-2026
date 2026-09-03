"""One delay cause, counted once, by both screens.

`GET /memory/query` and `GET /raid/candidates` present the same four delay
causes from the same evidence. They used to count it separately and disagree:
Memory filtered audit rows to actual_start/actual_finish and reported 2, the
RAID detector applied no field filter and reported 3 — for one spreadsheet row.

Neither was measuring recurrence. A single row reading "Bored Piling — 1 day
over, piling rig breakdown" writes actual_start, actual_finish and actual_qty,
so counting audit rows reports one observation as three, and the number moves
whenever the roll-up happens to touch a different set of fields. On the demo
corpus every one of the four causes occurs exactly ONCE, in one row of
civil_progress.xlsx, against one activity.

`server.raid.delay_evidence` is now the single counter and both callers use it.
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, AuditRecord, RaidItem
from server.raid import DELAY_KEYWORDS, delay_evidence


@pytest.fixture(autouse=True)
def _clean_evidence(db_session):
    """Each test owns the delay evidence it writes.

    The test database is a real file shared across the module, and these tests
    assert exact counts. Without this they pass alone and fail in sequence,
    because rows from an earlier test are still there to be counted — which is
    the same class of mistake as counting audit rows in the first place.
    """
    db_session.query(AuditRecord).delete()
    db_session.query(RaidItem).delete()
    db_session.commit()
    yield
    db_session.query(AuditRecord).delete()
    db_session.query(RaidItem).delete()
    db_session.commit()


def _audit(db, *, activity_id, field, span, file="civil_progress.xlsx",
           line=None, row=None):
    rec = AuditRecord(
        id=str(uuid.uuid4()),
        activity_id=activity_id,
        timestamp=datetime.utcnow(),
        field_changed=field,
        old_value=None,
        new_value="2026-08-01",
        source="matching",
        source_file=file,
        source_line=line,
        source_row=row,
        source_span=span,
        confidence=1.0,
        model_version="test",
        auto_applied=True,
    )
    db.add(rec)
    return rec


SPAN = "Bored Piling — Pipe Rack — 1 day over, piling rig breakdown"


class TestOneObservationCountsOnce:
    def test_three_audit_rows_from_one_report_are_one_occurrence(self, db_session):
        act = db_session.query(Activity).first().activity_id
        for field in ("actual_start", "actual_finish", "actual_qty"):
            _audit(db_session, activity_id=act, field=field, span=SPAN)
        db_session.commit()

        found = delay_evidence(db_session)["piling rig breakdown"]
        assert found["occurrences"] == 1
        # All three rows are still carried as the evidence behind it.
        assert len(found["records"]) == 3
        assert found["activity_ids"] == [act]

    def test_a_missing_source_row_does_not_split_the_observation(self, db_session):
        """The real shape of the bug's second half.

        The roll-up records source_row on the date writes and leaves it None on
        the quantity write. Keying on the locator therefore split one row into
        two. The key is (activity, file, span) for exactly this reason.
        """
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_start", span=SPAN, row=7)
        _audit(db_session, activity_id=act, field="actual_finish", span=SPAN, row=7)
        _audit(db_session, activity_id=act, field="actual_qty", span=SPAN, row=None)
        db_session.commit()

        assert delay_evidence(db_session)["piling rig breakdown"]["occurrences"] == 1

    def test_two_different_reports_are_two_occurrences(self, db_session):
        """Genuine recurrence still counts. This is what the number is for."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_start",
               span="Day 1 — rain delay stopped the pour")
        _audit(db_session, activity_id=act, field="actual_start",
               span="Day 6 — rain delay again, no work")
        db_session.commit()

        assert delay_evidence(db_session)["rain delay"]["occurrences"] == 2

    def test_the_same_cause_on_two_activities_counts_twice(self, db_session):
        acts = [a.activity_id for a in db_session.query(Activity).limit(2)]
        for act in acts:
            _audit(db_session, activity_id=act, field="actual_start",
                   span="Held up by material delay")
        db_session.commit()

        found = delay_evidence(db_session)["material delay"]
        assert found["occurrences"] == 2
        assert sorted(found["activity_ids"]) == sorted(acts)

    def test_a_cause_nobody_reported_is_absent(self, db_session):
        assert "monsoon" not in delay_evidence(db_session)


class TestBothScreensAgree:
    """The regression itself: two endpoints, one set of numbers."""

    def test_memory_and_raid_report_identical_counts(self, client, db_session):
        act = db_session.query(Activity).first().activity_id
        for field in ("actual_start", "actual_finish", "actual_qty"):
            _audit(db_session, activity_id=act, field=field, span=SPAN)
        db_session.commit()

        memory = client.get("/memory/query").json()["delay_reasons"]
        candidates = client.get("/raid/candidates").json()["candidates"]

        mem = {d["reason"]: d for d in memory}
        raid = {c["source_id"]: c for c in candidates}
        assert mem, "memory reported no delay causes"
        assert set(mem) == set(raid), "the two screens name different causes"

        for cause, m in mem.items():
            r = raid[cause]
            assert m["frequency"] == r["occurrences"], (
                f"{cause}: memory says {m['frequency']}, "
                f"raid says {r['occurrences']}"
            )
            assert m["days_lost"] == r["days_lost"]
            assert m["affected_activities"] == r["linked_activity_ids"]

    def test_neither_screen_calls_a_single_report_a_recurrence(
        self, client, db_session
    ):
        """The wording followed the number. One report is not a recurrence."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_start", span=SPAN)
        db_session.commit()

        candidates = client.get("/raid/candidates").json()["candidates"]
        one = next(c for c in candidates if c["source_id"] == "piling rig breakdown")
        assert one["occurrences"] == 1
        assert "recurring" not in one["title"].lower()
        assert "1 field report" in one["description"]


class TestKeywordListStaysShared:
    def test_memory_uses_the_raid_keyword_list(self):
        """D-048 kept one list so the two screens cannot name different
        things. They now share the counting as well as the vocabulary."""
        import server.main as main_module
        import inspect

        src = inspect.getsource(main_module._compute_delay_reasons)
        assert "delay_evidence" in src, (
            "_compute_delay_reasons has stopped using the shared counter"
        )
        # And the shared list is still the only vocabulary.
        assert "rain delay" in DELAY_KEYWORDS
        assert "piling rig breakdown" in DELAY_KEYWORDS
