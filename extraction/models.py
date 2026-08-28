"""Pydantic schema for extracted progress events.

Every field that touches the ground truth pipeline lives here.
Provenance is mandatory — no event leaves the extractor without a paper trail.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class Discipline(str, Enum):
    CIVIL = "civil"
    PIPING = "piping"
    STATIC_EQUIPMENT = "static_equipment"
    ELECTRICAL = "electrical"
    INSTRUMENTATION = "instrumentation"
    HSE = "hse"
    UNKNOWN = "unknown"


class EventStatus(str, Enum):
    COMPLETED = "completed"
    IN_PROGRESS = "in_progress"
    NOT_STARTED = "not_started"
    DELAYED = "delayed"
    UNKNOWN = "unknown"


class ExtractionMethod(str, Enum):
    PREPASS = "prepass"          # deterministic regex
    LLM = "llm"                 # LLM structured output
    SPREADSHEET = "spreadsheet" # parsed from xlsx row
    HYBRID = "hybrid"           # prepass + LLM enriched


# ── Provenance ───────────────────────────────────────────────────────────────

class Provenance(BaseModel):
    """Where this event came from. Immutable once created."""

    source_file: str = Field(..., description="Filename or path of the source document")
    source_line: Optional[int] = Field(None, description="1-indexed line number in the source text")
    source_row: Optional[int] = Field(None, description="1-indexed row number in a spreadsheet")
    source_span: str = Field(
        ...,
        description="Exact character span from the source that produced this event",
    )
    method: ExtractionMethod = Field(
        ...,
        description="How this event was extracted: prepass, llm, spreadsheet, or hybrid",
    )


# ── Extracted Event ──────────────────────────────────────────────────────────

class ExtractedEvent(BaseModel):
    """A single progress event extracted from a field report or spreadsheet.

    This is the unit of work that flows into the matcher.
    Every field is Optional except provenance and raw_text — the rest
    are best-effort extractions that may be enriched by the LLM pass.
    """

    # ── Identity ──
    raw_text: str = Field(..., description="The exact text span that describes the progress")
    activity_id: Optional[str] = Field(
        None,
        description="Matched schedule activity_id (e.g. CIV-FDN-1007). None until matching stage.",
    )
    confidence: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Matcher confidence score (0-1)",
    )

    # ── Extracted fields (prepass + LLM) ──
    tags: list[str] = Field(
        default_factory=list,
        description="Equipment/line tags found, e.g. ['24\"-P-1001-A1A', 'TK-1']",
    )
    reported_date: Optional[date] = Field(
        None,
        description="Date mentioned in the text (yesterday, today, explicit)",
    )
    asserted_start: Optional[date] = Field(
        None,
        description=(
            "Date this event asserts work BEGAN on, when the source says so "
            "(a start verb in free text, or a 'Commenced' column). None when "
            "the event makes no start claim."
        ),
    )
    asserted_finish: Optional[date] = Field(
        None,
        description=(
            "Date this event asserts work COMPLETED on, when the source says "
            "so. None when the event makes no completion claim - including a "
            "forecast completion date for work still in progress."
        ),
    )
    quantity: Optional[float] = Field(None, description="Numeric quantity mentioned")
    uom: Optional[str] = Field(None, description="Unit of measurement")
    discipline: Discipline = Field(Discipline.UNKNOWN, description="Inferred discipline")
    status: EventStatus = Field(EventStatus.UNKNOWN, description="Inferred progress status")
    percentage: Optional[float] = Field(
        None,
        ge=0.0,
        le=100.0,
        description="Explicit or inferred percentage complete",
    )

    # ── LLM enrichment ──
    activity_description: Optional[str] = Field(
        None,
        description="LLM-generated description of what the text says is happening",
    )
    reasoning: Optional[str] = Field(
        None,
        description="LLM's reasoning for its classification (chain of thought)",
    )
    alternatives: list[str] = Field(
        default_factory=list,
        description="Alternative activity_ids the LLM considered",
    )

    # ── Provenance (mandatory) ──
    provenance: Provenance

    model_config = {"extra": "forbid"}


# ── Batch result ─────────────────────────────────────────────────────────────

class ExtractionResult(BaseModel):
    """Complete output of the extraction pipeline for one source file."""

    source_file: str
    events: list[ExtractedEvent] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @property
    def event_count(self) -> int:
        return len(self.events)

    @property
    def matched_count(self) -> int:
        return sum(1 for e in self.events if e.activity_id is not None)

    @property
    def avg_confidence(self) -> float:
        if not self.events:
            return 0.0
        return sum(e.confidence for e in self.events) / len(self.events)
