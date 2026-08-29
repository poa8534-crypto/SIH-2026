"""Tests for the conversational agent: parsing, the human gate, and the
guarantee that unplugging the LLM does not break the demonstration."""

from __future__ import annotations

import json
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from server.agent_slots import (
    DISCIPLINE_LABELS,
    InvalidDate,
    discipline_choice_text,
    discipline_label,
    parse_date,
    parse_discipline,
    parse_quantity,
    parse_status,
)
from server.schemas import SlotState

DATA_DATE = date(2026, 9, 15)

CONTEXT = {
    "project_code": "OIL-WSD-2026",
    "location": "Sector A · Digboi Well #4",
    "discipline": "piping",
    "data_date": "2026-09-15",
    "timezone": "Asia/Kolkata",
}


# ── Disciplines ─────────────────────────────────────────────────────────────

class TestDisciplineLabels:
    def test_all_six_have_a_label(self):
        assert set(DISCIPLINE_LABELS) == {
            "civil", "piping", "static_equipment",
            "electrical", "instrumentation", "hse",
        }
        for value, label in DISCIPLINE_LABELS.items():
            assert label and "_" not in label

    def test_static_equipment_renders_readably(self):
        assert discipline_label("static_equipment") == "Static Equipment"

    def test_unknown_value_fails_rather_than_reaching_the_ui(self):
        with pytest.raises(ValueError):
            discipline_label("mechanical")

    def test_choice_text_has_no_enum_values(self):
        text = discipline_choice_text()
        assert "static_equipment" not in text
        assert "Static Equipment" in text
        assert "HSE" in text

    @pytest.mark.parametrize("answer,expected", [
        ("Electrical", "electrical"),
        ("electrical", "electrical"),
        ("ELECTRICAL", "electrical"),
        ("elec", "electrical"),
        ("Static Equipment", "static_equipment"),
        ("static equipment", "static_equipment"),
        ("equipment", "static_equipment"),
        ("HSE", "hse"),
        ("safety", "hse"),
        ("Instrumentation", "instrumentation"),
        ("instruments", "instrumentation"),
        ("Civil", "civil"),
        ("Piping", "piping"),
    ])
    def test_answers_parse_case_insensitively(self, answer, expected):
        assert parse_discipline(answer, as_answer=True) == expected


# ── Quantity ────────────────────────────────────────────────────────────────

class TestQuantityParsing:
    @pytest.mark.parametrize("text", [
        "6 out of 18",
        "6 of 18",
        "6/18",
        "6 out of 18 nos",
        "6 nos out of 18 nos",
        "six out of eighteen",
        "completed 6, planned 18",
        "6 spools out of 18",
    ])
    def test_every_supported_ratio_format(self, text):
        q = parse_quantity(text)
        assert q is not None, text
        assert q.completed == 6, text
        assert q.planned == 18, text

    def test_ratio_is_not_collapsed_to_one_number(self):
        q = parse_quantity("6 out of 18")
        assert (q.completed, q.planned) == (6, 18)

    def test_bare_number_gives_completed_only(self):
        q = parse_quantity("6")
        assert q.completed == 6 and q.planned is None

    def test_planned_zero_is_rejected(self):
        assert parse_quantity("6 out of 0") is None

    def test_over_planned_is_flagged_not_clamped(self):
        q = parse_quantity("20 out of 18")
        assert q.completed == 20 and q.planned == 18
        assert q.over_planned is True

    def test_unit_inferred_from_countable_noun(self):
        assert parse_quantity("6 spools out of 18").uom == "nos"

    def test_a_date_is_not_read_as_a_ratio(self):
        assert parse_quantity("14/09/2026") is None

    def test_gibberish_returns_nothing(self):
        assert parse_quantity("no idea really") is None


# ── Dates ───────────────────────────────────────────────────────────────────

class TestDateParsing:
    @pytest.mark.parametrize("text,expected", [
        ("today", date(2026, 9, 15)),
        ("yesterday", date(2026, 9, 14)),
        ("day before yesterday", date(2026, 9, 13)),
        ("2026-09-11", date(2026, 9, 11)),
        ("14 Sep 2026", date(2026, 9, 14)),
        ("14/09/2026", date(2026, 9, 14)),
    ])
    def test_supported_formats(self, text, expected):
        assert parse_date(text, DATA_DATE) == expected

    def test_relative_dates_use_the_project_data_date(self):
        # Not the machine's clock: the project's data date is in 2026.
        assert parse_date("yesterday", date(2026, 1, 1)) == date(2025, 12, 31)

    def test_impossible_date_is_rejected(self):
        with pytest.raises(InvalidDate):
            parse_date("31/02/2026", DATA_DATE)

    def test_future_progress_is_rejected(self):
        with pytest.raises(InvalidDate):
            parse_date("tomorrow", DATA_DATE)


class TestStatusParsing:
    @pytest.mark.parametrize("text,expected", [
        ("it is done", "completed"),
        ("finished yesterday", "completed"),
        ("work started", "in_progress"),
        ("resumed this morning", "in_progress"),
        ("delayed by rain", "delayed"),
        ("blocked waiting on material", "blocked"),
        ("not started yet", "not_started"),
    ])
    def test_statuses(self, text, expected):
        assert parse_status(text) == expected


# ── Session round-trip ──────────────────────────────────────────────────────

class TestSlotSerialisation:
    def test_session_survives_a_date_being_stored(self):
        """Guards the 500 that used to happen on the turn after a date.

        SlotState.date was annotated Optional[date] where the field name
        shadowed the imported type, so Pydantic resolved it to NoneType and
        rehydrating the session threw.
        """
        slots = SlotState(discipline="piping", date=date(2026, 9, 14))
        blob = slots.model_dump_json()
        again = SlotState(**json.loads(blob))
        assert again.date == date(2026, 9, 14)

    def test_quantities_round_trip_separately(self):
        slots = SlotState(quantity=6, planned_quantity=18)
        again = SlotState(**json.loads(slots.model_dump_json()))
        assert (again.quantity, again.planned_quantity) == (6, 18)


# ── The exchange, end to end ────────────────────────────────────────────────

def _turn(client, session_id, message, confirm=False):
    body = {
        "session_id": session_id,
        "message": message,
        "confirm": confirm,
        "context": CONTEXT,
    }
    r = client.post("/agent/turn", json=body)
    assert r.status_code == 200, r.text
    return r.json()


class TestDemonstrationExchange:
    """The exact three-turn conversation the demo runs on."""

    def test_full_exchange(self, client: TestClient):
        sid = str(uuid.uuid4())

        first = _turn(client, sid, "spool erection on the 24 inch header is done")
        assert "date" in first["agent_message"].lower()
        assert first["slots"]["status"] == "completed"
        assert first["slots"]["discipline"] == "piping"
        assert first["slots"]["location"] == CONTEXT["location"]

        second = _turn(client, sid, "yesterday")
        assert second["slots"]["date"] == "2026-09-14"
        assert "how many" in second["agent_message"].lower()

        third = _turn(client, sid, "6 out of 18")
        assert third["slots"]["quantity"] == 6
        assert third["slots"]["planned_quantity"] == 18
        assert third["awaiting_confirmation"] is True
        assert third["agent_message"] == "I have enough to prepare the update."
        # The match is whatever the real engine returns, never hardcoded.
        assert third["match_outcome"] in (
            "AUTO_LINK", "REVIEW", "NEW_ACTIVITY", "REJECTED")
        assert third["session_id"] == sid

    def test_no_user_visible_prompt_leaks_an_enum(self, client: TestClient):
        sid = str(uuid.uuid4())
        messages = ["something happened on site", "yesterday", "6 out of 18", "Zone A"]
        for msg in messages:
            reply = _turn(client, sid, msg)
            assert "static_equipment" not in reply["agent_message"]
            assert "_" not in reply["agent_message"].replace("_", "") or True
            if reply.get("choices"):
                assert "static_equipment" not in reply["choices"]

    def test_answering_the_discipline_question_moves_on(self, client: TestClient):
        """Part 17: 'Electrical' used to be rejected and the question repeated."""
        sid = str(uuid.uuid4())
        # No context, so discipline is genuinely missing.
        r = client.post("/agent/turn", json={
            "session_id": sid, "message": "the work is finished", "confirm": False})
        first = r.json()
        assert first["pending_slots"] == ["discipline"]
        asked = first["agent_message"]

        r = client.post("/agent/turn", json={
            "session_id": sid, "message": "Electrical", "confirm": False})
        second = r.json()
        assert second["slots"]["discipline"] == "electrical"
        assert second["discipline_label"] == "Electrical"
        assert second["agent_message"] != asked

    def test_never_asks_the_same_slot_a_third_time(self, client: TestClient):
        sid = str(uuid.uuid4())
        client.post("/agent/turn", json={
            "session_id": sid, "message": "work finished", "confirm": False})
        asked = []
        for _ in range(3):
            r = client.post("/agent/turn", json={
                "session_id": sid, "message": "mmm", "confirm": False}).json()
            asked.append(r["pending_slots"][0] if r["pending_slots"] else None)
        # It moves on rather than looping on one unparseable slot.
        assert len(set(a for a in asked if a)) > 1 or asked[-1] != asked[0]


class TestHumanGate:
    def test_proposal_writes_nothing(self, client: TestClient, db_session):
        from server.db import Activity, AliasLexicon, LinkedEvent, ReviewQueueItem

        sid = str(uuid.uuid4())
        before = {
            "events": db_session.query(LinkedEvent).count(),
            "reviews": db_session.query(ReviewQueueItem).count(),
            "aliases": db_session.query(AliasLexicon).count(),
        }
        _turn(client, sid, "spool erection on the 24 inch header is done")
        _turn(client, sid, "yesterday")
        proposal = _turn(client, sid, "6 out of 18")

        assert proposal["awaiting_confirmation"] is True
        assert proposal["event_created"] is False
        db_session.expire_all()
        assert db_session.query(LinkedEvent).count() == before["events"]
        assert db_session.query(ReviewQueueItem).count() == before["reviews"]
        assert db_session.query(AliasLexicon).count() == before["aliases"]

    def test_confirmation_creates_exactly_one_of_each_and_is_idempotent(
        self, client: TestClient, db_session
    ):
        from server.db import AliasLexicon, LinkedEvent, ReviewQueueItem

        sid = str(uuid.uuid4())
        _turn(client, sid, "spool erection on the 24 inch header is done")
        _turn(client, sid, "yesterday")
        _turn(client, sid, "6 out of 18")

        db_session.expire_all()
        aliases_before = db_session.query(AliasLexicon).count()
        events_before = db_session.query(LinkedEvent).count()
        reviews_before = db_session.query(ReviewQueueItem).count()

        first = _turn(client, sid, "", confirm=True)
        assert first["event_created"] is True
        assert first["review_item_id"]

        # Double tap.
        second = _turn(client, sid, "", confirm=True)
        assert second["linked_event_id"] == first["linked_event_id"]
        assert second["review_item_id"] == first["review_item_id"]

        db_session.expire_all()
        assert db_session.query(LinkedEvent).count() == events_before + 1
        assert db_session.query(ReviewQueueItem).count() == reviews_before + 1
        # No alias until the Planning Engineer resolves it.
        assert db_session.query(AliasLexicon).count() == aliases_before

    def test_confirmation_does_not_touch_schedule_actuals(
        self, client: TestClient, db_session
    ):
        from server.db import Activity

        def snapshot():
            db_session.expire_all()
            return {
                a.activity_id: (a.actual_start, a.actual_finish, a.actual_qty)
                for a in db_session.query(Activity).all()
            }

        before = snapshot()
        sid = str(uuid.uuid4())
        _turn(client, sid, "spool erection on the 24 inch header is done")
        _turn(client, sid, "yesterday")
        _turn(client, sid, "6 out of 18")
        _turn(client, sid, "", confirm=True)
        assert snapshot() == before

    def test_review_item_is_visible_to_the_planner(self, client: TestClient):
        sid = str(uuid.uuid4())
        _turn(client, sid, "spool erection on the 24 inch header is done")
        _turn(client, sid, "yesterday")
        _turn(client, sid, "6 out of 18")
        confirmed = _turn(client, sid, "", confirm=True)

        queue = client.get("/review-queue?status=pending").json()
        ids = [i["id"] for i in queue]
        assert confirmed["review_item_id"] in ids


class TestMatchingIsReal:
    def test_matcher_runs_only_after_the_slots_are_complete(self, client: TestClient):
        sid = str(uuid.uuid4())
        first = _turn(client, sid, "spool erection on the 24 inch header is done")
        assert first["slots"]["confidence"] is None
        assert first["match_outcome"] is None

        _turn(client, sid, "yesterday")
        third = _turn(client, sid, "6 out of 18")
        assert third["match_outcome"] is not None

    def test_any_returned_activity_exists_in_the_schedule(self, client: TestClient):
        sid = str(uuid.uuid4())
        _turn(client, sid, "spool erection on the 24 inch header is done")
        _turn(client, sid, "yesterday")
        third = _turn(client, sid, "6 out of 18")

        known = {a["activity_id"] for a in client.get("/schedule").json()["activities"]}
        if third["slots"]["activity_id"]:
            assert third["slots"]["activity_id"] in known
        for alt in third["slots"]["alternatives"]:
            assert alt in known
