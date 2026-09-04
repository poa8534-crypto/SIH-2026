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

class ReviewCandidate(BaseModel):
    """One activity the matcher ranked for this event, with its own score.

    `alternatives` used to be a bare `list[str]`, which made "why did candidate
    1 beat candidate 2" unanswerable: ranks 2+ had an id and nothing else. The
    engine scores every candidate it retrieves (`matching/engine.py:177-190`
    builds a `LinkCandidate` per id with `final_score`, `features`, `rrf_score`
    and `rank`); only the ids survived serialisation.

    `score` is the candidate's own `final_score` — never the top candidate's.
    `rationale` is `matching/engine.py:_rationale` applied to that candidate's
    own feature vector, which is the same function the decision already uses;
    nothing is recomputed by a different route and nothing is invented.
    """

    activity_id: str
    rank: int
    score: float
    rationale: list[str] = []
    # Resolved from the Activity table at read time rather than stored, so a
    # baseline re-import cannot leave a stale description behind.
    description: Optional[str] = None


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
    # The linked event's discipline. Projected so the Reconcile screen can name
    # it in an activity id when a planner creates a new activity from an item.
    discipline: Optional[str] = None
    suggested_activity_id: Optional[str] = None
    alternatives: list[ReviewCandidate] = []
    created_at: datetime

    # The matcher's own record of how it reached this proposal. All three are
    # persisted on the LinkedEvent row (`db.py` 266/269/270) and were already
    # projected onto LinkedEventResponse for GET /jobs/{id}; they were simply
    # never projected here, so the Reconcile screen had no reasoning to show.
    # Projection only — the values are not computed or altered.
    match_method: str = "prepass"
    margin: float = 0.0
    rationale: list[str] = []


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

class PredecessorLinkResponse(BaseModel):
    """One logic tie, typed. `rel` is FS/SS/FF/SF and `lag_days` the lag.

    The v1 baseline stores bare predecessor ids; those read back as FS with
    zero lag, which is what a bare id has always meant.
    """

    activity_id: str
    rel: str = "FS"
    lag_days: int = 0


class BaselineVersionResponse(BaseModel):
    """Which baseline schedule produced the numbers in this response.

    Two baselines ship and they share no activity ids, so any figure quoted
    without this block is unattributable. `sha256` is over the source file's
    raw bytes.
    """

    name: str
    filename: str
    sha256: str
    activity_count: int
    source_format: str = "json"
    source: str = "seed"          # seed | import
    imported_at: Optional[datetime] = None


class BaselineImportResponse(BaseModel):
    baseline: Optional[BaselineVersionResponse] = None
    activities_created: int = 0
    activities_updated: int = 0
    activities_in_file: int = 0
    replaced: bool = False
    message: str = ""


class ScheduleActivityResponse(BaseModel):
    activity_id: str
    wbs_path: str
    # Planning level (5 or 6). None for the v1 baseline, which does not state
    # one — it is recorded as absent rather than inferred from the path.
    wbs_level: Optional[int] = None
    description: str
    discipline: str
    tag: Optional[str] = None
    # Work calendar ("6-day", "7-day"). None for the v1 baseline.
    calendar: Optional[str] = None
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
    # Predecessor ids only — the long-standing shape, unchanged so existing
    # consumers keep working. `predecessor_links` carries the same ties with
    # their relationship type and lag.
    predecessors: list[str] = []
    predecessor_links: list[PredecessorLinkResponse] = []
    # Confidence of the audit write that last set an actual date on this
    # activity. Derived, not stored: it is read back off the audit trail so a
    # planner can see how well-evidenced a date is without opening the drawer.
    # None whenever the activity has no actual dates.
    link_confidence: Optional[float] = None


class ScheduleResponse(BaseModel):
    project: str = "OIL Well-Site Duliajan"
    data_date: date
    # The baseline these activities came from. None only when the activities
    # table predates baseline tracking and the file could not be identified.
    baseline: Optional[BaselineVersionResponse] = None
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


# ── Field notifications ──────────────────────────────────────────────────────

class FieldNotification(BaseModel):
    """One thing this supervisor's report caused, derived from the audit trail.

    There is no `read` flag: this prototype has no user table to key per-person
    state by, and an "unread" that nobody can own would be a fiction. See D-049.
    """

    audit_record_id: str
    linked_event_id: Optional[str] = None
    activity_id: str
    activity_description: Optional[str] = None
    field_changed: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    #: Days against the baseline. Positive is late. **Null when the activity has
    #: no planned date to compare against** — never 0 as a stand-in.
    day_movement: Optional[int] = None
    message: str
    confirmed_by_planner: bool = False
    at: datetime


# ── RAID register ────────────────────────────────────────────────────────────

class RaidEvidence(BaseModel):
    """The row that raised a register item, resolved at read time.

    Null on an item a planner typed in, and null when the source row no longer
    exists - both are stated rather than papered over.
    """

    kind: str
    id: str
    detail: Optional[str] = None
    activity_id: Optional[str] = None
    source_file: Optional[str] = None


class RaidItemResponse(BaseModel):
    id: str
    kind: str                       # risk | issue | action | decision
    title: str
    description: str = ""
    category: Optional[str] = None
    status: str = "open"            # open | mitigating | closed | rejected
    owner: Optional[str] = None

    due_date: Optional[date] = None
    date_raised: Optional[date] = None
    date_closed: Optional[date] = None

    # Risk-only. Null on the other three kinds, and `exposure` is null - never
    # 0.0 - when either factor is unscored, so "not calculable" cannot be
    # confused with "calculated as zero".
    probability: Optional[float] = None
    impact_days: Optional[float] = None
    exposure: Optional[float] = None

    linked_activity_ids: list[str] = []
    source_kind: Optional[str] = None
    source_id: Optional[str] = None
    source_note: Optional[str] = None
    evidence: Optional[RaidEvidence] = None

    created_by: str = "planner"
    created_at: datetime
    updated_at: Optional[datetime] = None


class RaidCreateRequest(BaseModel):
    """A register entry. `exposure` is deliberately absent: it is computed."""

    kind: str = Field(..., description="risk | issue | action | decision")
    title: str = Field(..., min_length=1)
    description: str = ""
    category: Optional[str] = None
    status: str = "open"
    owner: Optional[str] = None
    due_date: Optional[date] = None
    date_raised: Optional[date] = None
    probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    impact_days: Optional[float] = Field(None, ge=0.0)
    linked_activity_ids: list[str] = []
    source_kind: Optional[str] = None
    source_id: Optional[str] = None
    source_note: Optional[str] = None
    created_by: str = "planner"


class RaidPatchRequest(BaseModel):
    """A partial update. Every field optional; absent means unchanged.

    `exposure` is not accepted here either - re-scoring a risk means sending a
    new probability or impact, and the arithmetic follows.
    """

    kind: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[date] = None
    date_closed: Optional[date] = None
    probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    impact_days: Optional[float] = Field(None, ge=0.0)
    linked_activity_ids: Optional[list[str]] = None


class RaidCandidate(BaseModel):
    """A PROPOSED register item. Nothing about it has been stored.

    `committed` is always false. It is in the payload rather than only in the
    documentation so a client cannot mistake a proposal for a row.
    """

    kind: str
    title: str
    description: str
    category: str
    linked_activity_ids: list[str] = []
    occurrences: int = 0
    days_lost: float = 0
    source_kind: str
    source_id: str
    source_note: str
    committed: bool = False


class RaidCandidatesResponse(BaseModel):
    candidates: list[RaidCandidate] = []
    #: Restated on the envelope: POST /raid is the only way in.
    note: str = (
        "Candidates are proposals derived from existing audit evidence. None "
        "has been written to the register; POST /raid to commit one."
    )
# ── Evidence corpus ──────────────────────────────────────────────────────────

class EvidenceCaveat(BaseModel):
    """One thing about the corpus that must not be overclaimed.

    Structured rather than prose so the Evidence page renders it instead of
    composing (or omitting) it. Every value is taken from the corpus build's own
    `benchmark_target_audit`; this project reports them, it does not author them.
    """

    id: str
    headline: str
    status: str = ""
    value: Optional[int] = None
    detail: str = ""
    #: Only one of these is set per caveat, naming the specific claim refused.
    padded_with_synthetic_or_taxonomy: Optional[bool] = None
    manually_verified: Optional[bool] = None
    authored_by_this_project: Optional[bool] = None
    mixed: Optional[bool] = None


class EvidenceArtifacts(BaseModel):
    count: int = 0
    bytes: int = 0
    by_extension: dict[str, int] = {}
    by_source: dict[str, int] = {}


class EvidenceOcr(BaseModel):
    pages: int = 0
    lines: int = 0
    activity_mentions: int = 0
    #: Always false. These are rule-based candidates, not manual gold.
    verified: bool = False


class EvidenceValidation(BaseModel):
    passed: bool = False
    checks_run: int = 0
    errors: int = 0
    warnings: int = 0


class EvidenceCorpusResponse(BaseModel):
    data_origin: str = "real"
    built_at_utc: Optional[str] = None
    validated_at_utc: Optional[str] = None
    artifacts: EvidenceArtifacts
    records: dict[str, int] = {}
    ocr: EvidenceOcr
    validation: EvidenceValidation
    caveats: list[EvidenceCaveat] = []
    source: str = ""


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
    # ARCHITECTURE.md 2.7 category and the party who carries it by default,
    # both from the deterministic table in server/delay_taxonomy.py. Optional
    # only so a client written against the older shape keeps parsing; the
    # endpoint always sends them.
    category: Optional[str] = None
    liability: Optional[str] = None
    frequency: int = 0
    affected_activities: list[str] = []
    # Finish slip summed over the affected activities. Attributed, not
    # measured: an activity's whole overrun is credited to every cause
    # recorded against it, so treat it as an upper bound per cause.
    days_lost: int = 0


class DelayEventOut(BaseModel):
    """One classified delay, with the sentence it was read from.

    `liability_effective` is the ruling if a planner has made one and the
    proposal otherwise, and `adjudicated` says which of the two it is. Both are
    sent because a client that showed only the effective value would present a
    machine proposal as a finding.
    """

    id: str
    activity_id: Optional[str] = None
    phrase: str
    category: str
    liability_proposed: str
    liability_final: Optional[str] = None
    liability_effective: str
    adjudicated: bool = False
    adjudication_note: Optional[str] = None
    inferred_by: str = "rules"
    confidence: Optional[float] = None
    discipline: Optional[str] = None
    month: Optional[str] = None
    impact_days: int = 0
    # Provenance. The citation a claim is argued from.
    audit_record_id: Optional[str] = None
    source_file: Optional[str] = None
    source_line: Optional[int] = None
    source_row: Optional[int] = None
    source_span: Optional[str] = None


class DelayAttributionResponse(BaseModel):
    """The delay attribution matrix.

    Two sets of totals, on purpose. `adjudicated_days` counts only rows a
    planner has ruled on; `proposed_days` counts every row at its current
    effective liability. Reporting only the second would present proposals as
    findings; reporting only the first would hide work waiting for a planner.
    """

    events: list[DelayEventOut] = []
    total_events: int = 0
    adjudicated_events: int = 0
    adjudicated_days: dict[str, int] = {}
    proposed_days: dict[str, int] = {}
    days_by_month: dict[str, int] = {}
    categories_present: list[str] = []
    # Carried in the payload so a client cannot render an upper bound as a
    # measured figure.
    impact_days_basis: str
    unadjudicated_note: str
    computed_at: datetime


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
    # Slots the agent has given up on. `asked_slot` and `ask_count` are both
    # cleared the moment a turn finds nothing left to ask, so on their own they
    # cannot remember a decision to stop asking: the slot came back one turn
    # later and the session looped forever. Abandonment is recorded here
    # instead, where nothing resets it.
    abandoned_slots: list[str] = []
    # Which of the slots above were proposed by the optional LLM rather than
    # parsed from the supervisor's own words. Same purpose as `actual_*_basis`
    # on an activity: the value is usable, and the reader is told where it came
    # from instead of having to assume. Empty on every rules-only turn, which
    # is the default. `activity_id` and `confidence` can never appear here —
    # the matching engine sets both and the model is not consulted (D-006).
    llm_suggested_fields: list[str] = []


class LLMStatusResponse(BaseModel):
    """Read-only health of the optional LLM path.

    Deliberately carries no API key, no base URL and no model credentials: a
    base URL can hold userinfo, and this route is reachable by anyone who can
    reach the API.
    """

    enabled: bool
    provider: str
    # None when the path is off and nothing was attempted — "we did not look"
    # must never read as "it works".
    reachable: Optional[bool] = None
    detail: str = ""
    timeout_seconds: float = 0.0
    # What the LLM is permitted to influence even when it is on, stated in the
    # response so the guarantee is checkable from outside the process.
    advisory_only: bool = True
    never_supplied_by_llm: list[str] = [
        "activity_id", "confidence", "tags", "dates", "schedule writes",
    ]


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
    # Slots on this turn that came from the model rather than from the
    # supervisor's words. Surfaced so a client *can* mark them; no frontend
    # reads it yet. Always empty when the LLM is off, which is the default.
    llm_suggested_fields: list[str] = []
