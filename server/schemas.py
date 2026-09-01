"""Pydantic schemas for API request/response bodies.

These are the public contract of the API — separate from SQLAlchemy models.
"""

from __future__ import annotations

from datetime import date, datetime
# Alias so a model field named `date` cannot shadow the type in its own
# annotation. With `from __future__ import annotations` the annotation is
# resolved late, against the class namespace first, so `date: Optional[date]`
# resolves to the field and Pydantic types it as NoneType.
from datetime import date as date_t
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


class JobSummaryResponse(BaseModel):
    """One past ingest, without its events. Used by the history list."""

    id: str
    filename: str
    file_type: str
    status: str
    event_count: int = 0
    linked_count: int = 0
    review_count: int = 0
    activities_updated: int = 0
    audit_records_created: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class JobResponse(JobSummaryResponse):
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
    # How each actual date was obtained: EXPLICIT, RELATIVE_RESOLVED or
    # DEFAULTED_TO_REPORT_DATE. A defaulted date is an inference the source
    # never asserted, and the UI marks it differently. None when the
    # corresponding date is None.
    actual_start_basis: Optional[str] = None
    actual_finish_basis: Optional[str] = None
    actual_qty: Optional[float] = None
    start_variance_days: Optional[int] = None
    finish_variance_days: Optional[int] = None
    percent_complete: Optional[float] = None
    predecessors: list[str] = []
    # Confidence of the audit write that last set an actual date on this
    # activity. Derived, not stored: it is read back off the audit trail so a
    # planner can see how well-evidenced a date is without opening the drawer.
    # None whenever the activity has no actual dates.
    link_confidence: Optional[float] = None


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


# ── Audit trail ──────────────────────────────────────────────────────────────

class AuditRecordResponse(BaseModel):
    """One immutable entry in an activity's audit trail.

    Append-only: rows are never updated or deleted, so this schema is
    read-only and there is no corresponding request body.
    """

    id: str
    activity_id: str
    # The single event that produced this write. Null for aggregate writes
    # (a rolled-up quantity, a conflict note) which have no single origin.
    linked_event_id: Optional[str] = None
    timestamp: datetime
    field_changed: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    source: str
    source_file: Optional[str] = None
    source_line: Optional[int] = None
    source_row: Optional[int] = None
    source_span: Optional[str] = None
    confidence: Optional[float] = None
    model_version: str
    auto_applied: bool = False
    contributing_sources: list[str] = []
    conflict: bool = False


# ── Field supervisor ─────────────────────────────────────────────────────────

class FieldReportResponse(BaseModel):
    """One update this supervisor submitted, as their own history."""

    id: str
    reference: str
    raw_text: str
    submitted_at: datetime
    location: Optional[str] = None
    discipline: Optional[str] = None
    discipline_label: Optional[str] = None
    # Processing | Needs Information | Confirmed | Rejected
    status: str
    matched_activity_id: Optional[str] = None
    matched_activity_description: Optional[str] = None
    confidence: float = 0.0
    review_item_id: Optional[str] = None
    clarification_question: Optional[str] = None
    clarification_response: Optional[str] = None


class ClarificationResponse(BaseModel):
    """A Planning Engineer question about one of this supervisor's reports."""

    id: str
    review_item_id: str
    reference: str
    original_text: str
    question: str
    asked_by: str = "Priya Das"
    asked_at: datetime
    answered: bool = False
    response: Optional[str] = None
    answered_at: Optional[datetime] = None
    matched_activity_id: Optional[str] = None


class ClarificationAnswerRequest(BaseModel):
    response: str = Field(..., min_length=1, max_length=2000)


class ClarificationAskRequest(BaseModel):
    """Planner side: put a question back to the supervisor."""

    question: str = Field(..., min_length=1, max_length=2000)
    asked_by: str = "Priya Das"


# ── Source conflicts ─────────────────────────────────────────────────────────

class ConflictSide(BaseModel):
    """One source's claim, with the exact place it came from."""

    value: str
    source_file: Optional[str] = None
    source_line: Optional[int] = None
    source_row: Optional[int] = None
    # spreadsheet | daily_report | agent | other — the TYPE of source, which is
    # what the planner needs to weigh. Never the baseline: Primavera is
    # read-only and cannot be a side of a conflict.
    source_kind: str = "other"


class SourceConflict(BaseModel):
    """Two field sources disagreeing about the same field of one activity."""

    activity_id: str
    description: str = ""
    discipline: str = "unknown"
    field: str
    sides: list[ConflictSide] = []
    # What the schedule currently holds, and which side supplied it.
    stored_value: Optional[str] = None
    detected_at: datetime


# ── Audit feed ───────────────────────────────────────────────────────────────

class AuditFeedItem(BaseModel):
    """One recent write, across all activities."""

    id: str
    activity_id: str
    field_changed: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    source: str
    source_file: Optional[str] = None
    source_line: Optional[int] = None
    source_row: Optional[int] = None
    confidence: Optional[float] = None
    auto_applied: bool = False
    conflict: bool = False
    timestamp: datetime


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
    # Of `count`, how many have both an actual start and finish — the ones
    # `actual_mean_days` is computed from. Without it a caller cannot tell a
    # mean drawn from one activity from one drawn from five.
    actuals_count: int = 0
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
    # Finish slip summed over the affected activities. Attributed, not
    # measured: an activity's whole overrun is credited to every cause
    # recorded against it, so treat it as an upper bound per cause.
    days_lost: int = 0


class SuggestedDuration(BaseModel):
    activity_type_pattern: str
    # Activities of this type in the baseline.
    sample_size: int = 0
    # Of those, how many have both an actual start and finish — the ones the
    # medians below are actually computed from. `sample_size` alone overstates
    # the evidence: PIP-SPL has 5 activities but only 2 completed.
    actuals_count: int = 0
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

class AgentContextRequest(BaseModel):
    """Structured context the client already knows about this session.

    Optional and additive: existing callers that send only a message keep
    working, and the values here are never injected into the transcript as if
    the supervisor had said them.
    """

    project_code: Optional[str] = None
    location: Optional[str] = None
    discipline: Optional[str] = None
    data_date: Optional[date_t] = None
    timezone: str = "Asia/Kolkata"


class AgentTurnRequest(BaseModel):
    session_id: Optional[str] = None
    context: Optional[AgentContextRequest] = None
    message: str = Field("", description="Free-text site engineer input")
    confirm: bool = Field(
        False,
        description=(
            "Commit the proposed update. Until this is true the agent only "
            "proposes: nothing is persisted and the schedule is untouched."
        ),
    )


class SlotState(BaseModel):
    discipline: Optional[str] = None
    location: Optional[str] = None
    # Completed and planned are kept apart. Collapsing "6 out of 18" into a
    # single number loses the denominator, which is what decides whether the
    # node is finished.
    quantity: Optional[float] = None
    planned_quantity: Optional[float] = None
    # Set when completed exceeds planned. The value is retained, never
    # clamped, and the planner is told.
    quantity_over_planned: bool = False
    uom: Optional[str] = None
    tags: list[str] = []
    status: Optional[str] = None
    activity_id: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date_t] = None
    # Filled once every required slot is present and the matching engine has
    # run. Previously the endpoint read `slots.confidence` behind a hasattr
    # guard against a field that did not exist, so it always fell back to a
    # constant 0.8.
    confidence: Optional[float] = None
    activity_description: Optional[str] = None
    match_outcome: Optional[str] = None
    alternatives: list[str] = []
    # The slot the agent last asked about, and how many times it has asked.
    # Used to read the next message as an answer to that question first, and
    # to stop asking a third time when parsing keeps failing.
    asked_slot: Optional[str] = None
    ask_count: int = 0


class AgentTurnResponse(BaseModel):
    session_id: str
    turn_number: int
    agent_message: str
    slots: SlotState
    pending_slots: list[str]
    event_created: bool = False
    linked_event_id: Optional[str] = None
    confidence: float = 0.0
    # True when every slot is filled and the proposal is on the table but
    # nothing has been written. The client shows the structured card and sends
    # the next turn with confirm=true.
    awaiting_confirmation: bool = False
    activity_description: Optional[str] = None
    match_outcome: Optional[str] = None
    review_item_id: Optional[str] = None
    # Human labels for anything the supervisor will read. The raw enum values
    # stay in `slots`; these are what the UI renders.
    discipline_label: Optional[str] = None
    status_label: Optional[str] = None
    # Closed-set options to show under a question, when it has them.
    choices: Optional[str] = None
