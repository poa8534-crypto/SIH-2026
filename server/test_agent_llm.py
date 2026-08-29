"""The LLM must be optional, bounded, and silent when it fails.

Every test here injects a fake backend or leaves the flag off. None of them
requires a running Ollama — that is the point: the demonstration has to survive
an unplugged model, and a test suite that needs the model cannot prove it.
"""

from __future__ import annotations

import time
import uuid

import pytest

from server import agent_llm
from server.agent_llm import LLMSuggestion, interpret, llm_enabled, llm_timeout_seconds

CONTEXT = {
    "project_code": "OIL-WSD-2026",
    "location": "Sector A · Digboi Well #4",
    "discipline": "piping",
    "data_date": "2026-09-15",
    "timezone": "Asia/Kolkata",
}


class _Output:
    """Stands in for LLMEventOutput."""

    def __init__(self, **kw):
        self.raw_text = kw.get("raw_text", "")
        self.activity_description = kw.get("activity_description", "")
        self.tags = kw.get("tags", [])
        self.discipline = kw.get("discipline", "unknown")
        self.status = kw.get("status", "unknown")


class RecordingBackend:
    def __init__(self, outputs=None, raises=None, delay=0.0):
        self.outputs = outputs
        self.raises = raises
        self.delay = delay
        self.calls = 0

    def extract_events(self, text_spans, schedule_context, prepass_hints):
        self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        if self.raises:
            raise self.raises
        return self.outputs


# ── The flag ────────────────────────────────────────────────────────────────

class TestFlag:
    def test_rules_only_is_the_default(self, monkeypatch):
        monkeypatch.delenv("EXTRACTION_PROVIDER", raising=False)
        assert llm_enabled() is False

    @pytest.mark.parametrize("value", ["rules", "none", "null", "prepass", ""])
    def test_rules_values_keep_it_off(self, monkeypatch, value):
        monkeypatch.setenv("EXTRACTION_PROVIDER", value)
        assert llm_enabled() is False

    def test_opting_in_turns_it_on(self, monkeypatch):
        monkeypatch.setenv("EXTRACTION_PROVIDER", "ollama")
        assert llm_enabled() is True

    def test_no_client_is_built_when_disabled(self, monkeypatch):
        """Disabled must mean no import, no client, no socket, no wait."""
        monkeypatch.delenv("EXTRACTION_PROVIDER", raising=False)

        def explode():
            raise AssertionError("backend was constructed while disabled")

        monkeypatch.setattr(
            "extraction.llm_backend.make_backend_from_env", explode, raising=False
        )
        assert interpret("spool erection is done") is None

    def test_timeout_default_is_short(self, monkeypatch):
        monkeypatch.delenv("NAVIS_LLM_TIMEOUT_SECONDS", raising=False)
        assert llm_timeout_seconds() == 5.0

    def test_timeout_is_configurable(self, monkeypatch):
        monkeypatch.setenv("NAVIS_LLM_TIMEOUT_SECONDS", "1.5")
        assert llm_timeout_seconds() == 1.5


# ── Failure modes, all silent ───────────────────────────────────────────────

class TestSilentFallback:
    def test_connection_refused(self):
        backend = RecordingBackend(raises=ConnectionRefusedError("refused"))
        assert interpret("spool erection is done", backend=backend) is None
        assert backend.calls == 1  # attempted once, not retried

    def test_timeout_is_bounded(self):
        backend = RecordingBackend(outputs=[], delay=2.0)
        started = time.monotonic()
        assert interpret("spool erection", backend=backend, timeout=0.2) is None
        assert time.monotonic() - started < 1.5

    def test_invalid_json_shape(self):
        backend = RecordingBackend(outputs="not a list at all")
        assert interpret("spool erection", backend=backend) is None

    def test_empty_response(self):
        assert interpret("spool erection", backend=RecordingBackend(outputs=[])) is None

    def test_unexpected_exception(self):
        backend = RecordingBackend(raises=RuntimeError("model not pulled"))
        assert interpret("spool erection", backend=backend) is None

    def test_never_retried_inside_one_turn(self):
        backend = RecordingBackend(raises=TimeoutError())
        interpret("spool erection", backend=backend)
        assert backend.calls == 1


# ── Validation of what it does return ───────────────────────────────────────

class TestValidation:
    def test_valid_output_is_accepted(self):
        backend = RecordingBackend(outputs=[_Output(
            discipline="piping", status="completed",
            activity_description="Spool erection on the 24 inch header",
            tags=[])])
        out = interpret("spool erection is done", backend=backend)
        assert out.discipline == "piping"
        assert out.status == "completed"
        assert out.activity_description.startswith("Spool erection")

    def test_schema_invalid_discipline_is_dropped(self):
        backend = RecordingBackend(outputs=[_Output(
            discipline="mechanical", status="completed")])
        out = interpret("x", backend=backend)
        # The bad value never becomes a discipline.
        assert out is None or out.discipline is None

    def test_status_is_reparsed_not_trusted(self):
        """The model's status is run through our parser, not taken as given."""
        recognised = RecordingBackend(outputs=[_Output(
            discipline="piping", status="the work is finished")])
        assert interpret("x", backend=recognised).status == "completed"

        # Vocabulary we do not recognise yields nothing rather than being
        # written through verbatim.
        unknown = RecordingBackend(outputs=[_Output(
            discipline="piping", status="all wrapped up")])
        assert interpret("x", backend=unknown).status is None

    def test_model_cannot_invent_an_activity_id(self):
        backend = RecordingBackend(outputs=[_Output(
            discipline="piping", status="completed",
            activity_description="PIP-ERC-9999 whatever")])
        out = interpret("x", backend=backend)
        assert not hasattr(out, "activity_id")


# ── The full exchange with the model forced unavailable ─────────────────────

def _turn(client, sid, message, confirm=False):
    r = client.post("/agent/turn", json={
        "session_id": sid, "message": message,
        "confirm": confirm, "context": CONTEXT})
    assert r.status_code == 200, r.text
    return r.json()


class TestExchangeSurvivesAnUnpluggedModel:
    def test_three_turns_complete_with_the_llm_dead(
        self, client, db_session, monkeypatch
    ):
        """Unplugging Ollama must not break the demonstration."""
        from server.db import AliasLexicon, LinkedEvent, ReviewQueueItem

        attempts = {"n": 0}

        def refuse(*a, **kw):
            attempts["n"] += 1
            raise ConnectionRefusedError("ollama is not running")

        # Flag on, backend dead: the path is attempted and must fall back.
        monkeypatch.setenv("EXTRACTION_PROVIDER", "ollama")
        monkeypatch.setattr(
            "extraction.llm_backend.make_backend_from_env", refuse, raising=False
        )

        sid = str(uuid.uuid4())
        events_before = db_session.query(LinkedEvent).count()
        reviews_before = db_session.query(ReviewQueueItem).count()
        aliases_before = db_session.query(AliasLexicon).count()

        first = _turn(client, sid, "spool erection on the 24 inch header is done")
        assert first["agent_message"] == "Which date was it completed?"

        second = _turn(client, sid, "yesterday")
        assert second["slots"]["date"] == "2026-09-14"
        assert second["agent_message"] == "How many spools out of the planned quantity?"

        third = _turn(client, sid, "6 out of 18")
        assert third["agent_message"] == "I have enough to prepare the update."

        # The model was reached for, and every turn still completed.
        assert attempts["n"] > 0

        assert third["session_id"] == sid
        assert third["slots"]["quantity"] == 6
        assert third["slots"]["planned_quantity"] == 18
        assert third["slots"]["status"] == "completed"
        assert third["slots"]["discipline"] == "piping"
        assert third["discipline_label"] == "Piping"
        assert third["match_outcome"] is not None

        # Nothing written before confirmation.
        db_session.expire_all()
        assert db_session.query(LinkedEvent).count() == events_before
        assert db_session.query(ReviewQueueItem).count() == reviews_before

        confirmed = _turn(client, sid, "", confirm=True)
        db_session.expire_all()
        assert db_session.query(LinkedEvent).count() == events_before + 1
        assert db_session.query(ReviewQueueItem).count() == reviews_before + 1
        assert db_session.query(AliasLexicon).count() == aliases_before
        assert confirmed["review_item_id"]

    def test_no_llm_error_reaches_the_supervisor(self, client, monkeypatch):
        monkeypatch.setenv("EXTRACTION_PROVIDER", "ollama")
        monkeypatch.setattr(
            "extraction.llm_backend.make_backend_from_env",
            lambda: (_ for _ in ()).throw(ConnectionRefusedError()),
            raising=False,
        )
        sid = str(uuid.uuid4())
        reply = _turn(client, sid, "spool erection on the 24 inch header is done")
        lowered = reply["agent_message"].lower()
        for leak in ("ollama", "llm", "connection", "refused", "traceback", "error"):
            assert leak not in lowered
