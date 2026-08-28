"""Guards protecting the pipeline from LLM extraction errors.

These cover three failure modes observed when driving qwen3:8b directly.
Each guard lives in code rather than in the prompt, so it holds for every
provider and cannot be argued out of by a model.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extraction.extractor import Extractor
from extraction.llm_backend import (
    LLMBackend,
    LLMEventOutput,
    NullBackend,
    OllamaBackend,
    make_backend_from_env,
)
from extraction.models import Discipline, EventStatus
from extraction.prepass import is_forecast_language

SCHEDULE = str(Path(__file__).resolve().parent.parent / "dataset" / "baseline_schedule.json")
REPORT_DATE = date(2026, 8, 3)


class StubBackend(LLMBackend):
    """Replays a fixed LLM output, standing in for a misbehaving model."""

    def __init__(self, **overrides):
        self.overrides = overrides

    def is_available(self) -> bool:
        return True

    def extract_events(self, text_spans, schedule_context, prepass_hints):
        base = dict(
            activity_description="",
            tags=[],
            discipline="unknown",
            status="unknown",
            reasoning="stub",
        )
        base.update(self.overrides)
        return [LLMEventOutput(raw_text=span, **base) for span in text_spans]


def _extract_one(text: str, backend: LLMBackend | None = None):
    """Run one free-text span through the real merge path."""
    ex = Extractor(schedule_path=SCHEDULE, llm_backend=backend or NullBackend())
    hints = ex._prepass_span(text, 1, REPORT_DATE)
    llm_out = backend.extract_events([text], "", [hints])[0] if backend else None
    return ex._merge_event(text, 1, "test.txt", hints, llm_out, REPORT_DATE)


# ── (a) Date hallucination on forecast language ──────────────────────────────

FORECAST_SPANS = [
    "TK-1 hydrotest now scheduled 25 Aug instead of 23 Aug due to shell erection delay",
    "Pipe rack Tier 2 erection rescheduled to 12 Aug",
    "Equipment foundation pour planned for 30 Jul",
    "Crane expected back by 5 Aug",
    "Spool fabrication postponed to 18 Aug",
    "Cable laying will start 20 Aug",
]


@pytest.mark.parametrize("span", FORECAST_SPANS)
def test_forecast_language_is_detected(span):
    assert is_forecast_language(span)


@pytest.mark.parametrize("span", FORECAST_SPANS)
def test_forecast_span_asserts_no_actual_dates(span):
    """A plan or a reschedule must never produce an actual date, however
    confidently the model reports one."""
    event = _extract_one(span)
    assert event.asserted_start is None, f"start leaked from forecast: {span}"
    assert event.asserted_finish is None, f"finish leaked from forecast: {span}"


def test_forecast_guard_holds_when_llm_claims_completion():
    """The exact observed failure: the model returns the rescheduled date as
    both an actual start and an actual finish."""
    span = FORECAST_SPANS[0]
    backend = StubBackend(status="completed", discipline="piping")
    event = _extract_one(span, backend)
    assert event.asserted_start is None
    assert event.asserted_finish is None
    # The model must not talk a forecast line into a completion either: a
    # 'completed' status would finish an unquantified node in the rollup.
    assert event.status is not EventStatus.COMPLETED


def test_real_completion_still_asserts_a_finish():
    """The guard must not suppress genuine actuals."""
    event = _extract_one(
        "Foundation concreting for pedestals P7 to P12 completed yesterday (2 Aug)."
    )
    assert event.asserted_finish == date(2026, 8, 2)


def test_real_start_still_asserts_a_start():
    event = _extract_one("Backfilling around equipment foundation EF-2 started today.")
    assert event.asserted_start == date(2026, 8, 3)


# ── (b) Out-of-enum discipline and status ────────────────────────────────────

def test_schema_constrains_discipline_and_status_enums():
    """Ollama decodes against this schema, so 'Structural' and 'HT' are not
    generatable in the first place."""
    schema = LLMEventOutput.model_json_schema()
    assert schema["properties"]["discipline"]["enum"] == [d.value for d in Discipline]
    assert schema["properties"]["status"]["enum"] == [s.value for s in EventStatus]


# A discipline-neutral span, so the prepass leaves discipline UNKNOWN and the
# LLM override path is actually exercised.
NEUTRAL_SPAN = "General progress at site, work item at location B"


@pytest.mark.parametrize("bad", ["Structural", "HT", "STRUCTURAL", "", "civil engineering"])
def test_out_of_enum_discipline_falls_back_to_unknown(bad):
    """Belt and braces for providers with no grammar constraint."""
    event = _extract_one(NEUTRAL_SPAN, StubBackend(discipline=bad))
    assert event.discipline in set(Discipline)
    assert event.discipline is Discipline.UNKNOWN


@pytest.mark.parametrize("bad", ["Finished!", "IN-PROGRESS", "partially done", ""])
def test_out_of_enum_status_falls_back_to_unknown(bad):
    event = _extract_one(NEUTRAL_SPAN, StubBackend(status=bad))
    assert event.status in set(EventStatus)


def test_valid_enum_values_are_still_honoured():
    event = _extract_one(NEUTRAL_SPAN, StubBackend(discipline="piping"))
    assert event.discipline is Discipline.PIPING


# ── (c) Tag ownership ────────────────────────────────────────────────────────

def test_llm_cannot_inject_tags():
    """Tags feed the matcher's near-decisive tag_overlap feature. Description
    words like 'steel erection' must never reach it."""
    junk = ["steel erection", "pipe rack", "hydrotest"]
    event = _extract_one("Steel erection ongoing at tier 1", StubBackend(tags=junk))
    assert event.tags == [], f"LLM tags leaked into the event: {event.tags}"


def test_llm_cannot_overwrite_prepass_tags():
    span = "TK-1 hydrotest preparation ongoing"
    baseline = _extract_one(span)
    with_llm = _extract_one(span, StubBackend(tags=["hydrotest", "tank"]))
    assert "TK-1" in baseline.tags
    assert with_llm.tags == baseline.tags


def test_prepass_finds_the_tag_the_model_missed():
    """The model returned ['steel erection', 'pipe rack'] and missed TK-1."""
    event = _extract_one(
        "TK-1 hydrotest now scheduled 25 Aug instead of 23 Aug due to shell erection delay",
        StubBackend(tags=["steel erection", "pipe rack"]),
    )
    assert "TK-1" in event.tags


# ── Provider configuration ───────────────────────────────────────────────────

def test_default_provider_is_rules_only(monkeypatch):
    monkeypatch.delenv("EXTRACTION_PROVIDER", raising=False)
    monkeypatch.setattr("extraction.llm_backend.ENV_PATH", Path("/nonexistent/.env"))
    assert isinstance(make_backend_from_env(), NullBackend)


def test_unknown_provider_falls_back_to_rules(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "hal9000")
    assert isinstance(make_backend_from_env(), NullBackend)


def test_ollama_provider_falls_back_when_unreachable(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:9")
    assert isinstance(make_backend_from_env(), NullBackend)


def test_ollama_backend_defaults():
    backend = OllamaBackend()
    assert backend.model == "qwen3:8b"
    assert backend.temperature == 0.0
    assert backend.think is False
