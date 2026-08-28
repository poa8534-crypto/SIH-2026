"""Pydantic schemas for API request/response bodies.

These are the public contract of the API — separate from SQLAlchemy models.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Ingest ───────────────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    job_id: str
    filename: str
    status: str = "processing"
    message: str = "File uploaded. Extraction in progress."


# ── Jobs ─────────────────────────────────────────────────────────────────────

class LinkedEventResponse(BaseModel):
    id: str
    source_file: str
    source_line: Optional[int] = None
    source_row: Optional[int] = None
    source_span: str
    raw_text: str
    tags: list[str] = []
    reported_date: Optional[date] = None
    asserted_start: Optional[date] = None
    asserted_finish: Optional[date] = None
    quantity: Optional[float] = None
    uom: Optional[str] = None
    discipline: str = "unknown"
    status: str = "unknown"
    percentage: Optional[float] = None
    confidence: float = 0.0
    match_method: str = "prepass"
    activity_id: Optional[str] = None
    alternatives: list[str] = []
    reviewed: bool = False
    reviewer_action: Optional[str] = None
    decision: str = "NEW_ACTIVITY"
    margin: float = 0.0
    rationale: list[str] = []


class JobResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    status: str
    event_count: int = 0
    linked_count: int = 0
    review_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    events: list[LinkedEventResponse] = []


# ── Review Queue ─────────────────────────────────────────────────────────────

class ReviewQueueItemResponse(BaseModel):
    id: str
    linked_event_id: str
    activity_id: Optional[str] = None
    reason: str
    priority: str
    status: str
    source_span: str
    raw_text: str
    confidence: float
    tags: list[str] = []
    suggested_activity_id: Optional[str] = None
    alternatives: list[str] = []
    created_at: datetime


class ResolveRequest(BaseModel):
    """Planner resolution of a review queue item."""
    action: str = Field(..., description="confirm / reassign / create / ignore")
    activity_id: Optional[str] = Field(
        None,
        description="Target activity_id (required for 'reassign')",
    )
    new_activity_id: Optional[str] = Field(
        None,
        description="New activity_id to create (required for 'create')",
    )
    new_description: Optional[str] = Field(
        None,
        description="Description for new activity (required for 'create')",
    )
    note: Optional[str] = None


class ResolveResponse(BaseModel):
    review_item_id: str
    resolution: str
    activity_id: Optional[str] = None
    alias_entries_created: int = 0
    audit_records_created: int = 0
    message: str


# ── Schedule ─────────────────────────────────────────────────────────────────

class ScheduleActivityResponse(BaseModel):
    activity_id: str
    wbs_path: str
    description: str
    discipline: str
    tag: Optional[str] = None
    planned_start: date
    planned_finish: date
    planned_qty: float = 0
    uom: str = ""
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None
    actual_qty: Optional[float] = None
    start_variance_days: Optional[int] = None
    finish_variance_days: Optional[int] = None
    percent_complete: Optional[float] = None
    predecessors: list[str] = []


class ScheduleResponse(BaseModel):
    project: str = "OIL Well-Site Duliajan"
    data_date: date
    total_activities: int = 0
    activities_with_actuals: int = 0
    activities_completed: int = 0
    average_start_variance: Optional[float] = None
    average_finish_variance: Optional[float] = None
    integrity_warnings: list[dict] = []
    activities: list[ScheduleActivityResponse] = []


# ── Export ───────────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    format: str = Field("pmxml", description="pmxml or xer")
    include_actuals: bool = True
    filter_discipline: Optional[str] = None


class ExportResponse(BaseModel):
    format: str
    filename: str
    activity_count: int
    content_type: str = "application/xml"
    download_url: str


# ── Memory Query ─────────────────────────────────────────────────────────────

class MemoryQueryRequest(BaseModel):
    query_type: str = Field(
        ...,
        description="duration_distribution / productivity / delay_reasons / suggested_duration / all",
    )
    activity_type: Optional[str] = Field(
        None,
        description="Filter by activity type prefix (e.g. 'PIP-SPL', 'CIV-FDN')",
    )
    discipline: Optional[str] = Field(
        None,
        description="Filter by discipline (civil, piping, etc.)",
    )


class DurationDistribution(BaseModel):
    activity_type: str
    count: int = 0
    planned_mean_days: float = 0
    actual_mean_days: Optional[float] = None
    planned_min_days: int = 0
    planned_max_days: int = 0


class ProductivityMetric(BaseModel):
    discipline: str
    total_activities: int = 0
    completed: int = 0
    average_planned_days: float = 0
    average_actual_days: Optional[float] = None
    average_qty_per_day: Optional[float] = None


class DelayReason(BaseModel):
    reason: str
    frequency: int = 0
    affected_activities: list[str] = []


class SuggestedDuration(BaseModel):
    activity_type_pattern: str
    sample_size: int = 0
    median_planned_days: float = 0
    median_actual_days: Optional[float] = None
    p80_actual_days: Optional[float] = None
    recommendation: str = ""


class MemoryQueryResponse(BaseModel):
    query_type: str
    duration_distribution: Optional[list[DurationDistribution]] = None
    productivity: Optional[list[ProductivityMetric]] = None
    delay_reasons: Optional[list[DelayReason]] = None
    suggested_duration: Optional[SuggestedDuration] = None
    computed_at: datetime


# ── Agent Turn ───────────────────────────────────────────────────────────────

class AgentTurnRequest(BaseModel):
    session_id: Optional[str] = None
    message: str = Field(..., description="Free-text site engineer input")


class SlotState(BaseModel):
    discipline: Optional[str] = None
    location: Optional[str] = None
    quantity: Optional[float] = None
    uom: Optional[str] = None
    tags: list[str] = []
    status: Optional[str] = None
    activity_id: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date] = None


class AgentTurnResponse(BaseModel):
    session_id: str
    turn_number: int
    agent_message: str
    slots: SlotState
    pending_slots: list[str]
    event_created: bool = False
    linked_event_id: Optional[str] = None
    confidence: float = 0.0
