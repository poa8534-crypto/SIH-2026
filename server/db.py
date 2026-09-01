"""SQLAlchemy models for the EPC progress tracking service.

SQLite backend with full audit trail, review queue, and alias lexicon
for continuous matcher improvement.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship


# ── Helpers ──────────────────────────────────────────────────────────────────

def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


# ── Base ─────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Activity (baseline schedule) ─────────────────────────────────────────────

class Activity(Base):
    """A single schedule activity from the baseline plan (L5/L6)."""

    __tablename__ = "activities"

    activity_id = Column(String, primary_key=True)  # e.g. CIV-FDN-1007
    # One displayable path. v1 stores a dotted code ("1.1.1.1"), v2 the WBS
    # element names joined by " > " (matching/providers.py normalize_wbs_path).
    wbs_path = Column(String, nullable=False, default="")
    # Planning level, 5 or 6. NULL for the v1 baseline, which does not state
    # one — see normalize_wbs_level for why it is not inferred from the path.
    wbs_level = Column(Integer, nullable=True)
    description = Column(Text, nullable=False, default="")
    # Optional: the v2 baseline omits `detail` entirely. Nullable so a new
    # database does not require it; still written as "" rather than NULL, so
    # databases created before this column relaxed keep working unchanged.
    detail = Column(Text, nullable=True, default="")
    discipline = Column(String, nullable=False, default="unknown")
    tag = Column(String, nullable=True)  # e.g. 24"-P-1001-A1A
    # Work calendar the activity is scheduled on ("6-day", "7-day"). NULL for
    # the v1 baseline. Not yet used in date arithmetic — recorded, not acted on.
    calendar = Column(String, nullable=True)

    planned_start = Column(Date, nullable=False)
    planned_finish = Column(Date, nullable=False)
    planned_qty = Column(Float, nullable=False, default=0)
    uom = Column(String, nullable=False, default="")
    # JSON list. Two shapes are readable and both are in the wild:
    #   ["CIV-PLY-1004"]                                   v1, bare ids
    #   [{"activity_id": ..., "rel": "SS", "lag_days": 3}] v2, typed links
    # Written in the typed shape from now on; a bare id reads back as FS with
    # zero lag, which is what a bare id has always meant. See
    # predecessor_list() for ids and predecessor_links() for the full ties.
    predecessors = Column(Text, nullable=False, default="")

    # Actuals (written by the system or planner, immutable without audit)
    actual_start = Column(Date, nullable=True)
    actual_finish = Column(Date, nullable=True)
    actual_qty = Column(Float, nullable=True)

    # How each actual date above was obtained: EXPLICIT (a date in the source),
    # RELATIVE_RESOLVED ("yesterday", resolved against the report date) or
    # DEFAULTED_TO_REPORT_DATE (the source named no date at all). Stored beside
    # the date rather than derived from the audit trail, because the UI has to
    # be able to mark an inferred date differently from an asserted one on
    # every read. A defaulted finish date is never written automatically - see
    # matching/engine.py RollupAccumulator.results.
    actual_start_basis = Column(String, nullable=True)
    actual_finish_basis = Column(String, nullable=True)

    # Variance cache (recomputed on query)
    start_variance_days = Column(Integer, nullable=True)
    finish_variance_days = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    # Relationships
    linked_events = relationship("LinkedEvent", back_populates="activity")
    audit_records = relationship("AuditRecord", back_populates="activity")
    review_items = relationship("ReviewQueueItem", back_populates="activity")

    def predecessor_list(self) -> list[str]:
        """Predecessor activity ids only.

        The compatibility surface: every existing consumer (integrity warnings,
        GET /schedule, the memory queries) asks only *which* activities come
        first. Typed links would break all of them, so the relationship type
        and lag are available separately through predecessor_links().
        """
        return [link["activity_id"] for link in self.predecessor_links()]

    def predecessor_links(self) -> list[dict]:
        """Predecessor ties as {activity_id, rel, lag_days}.

        Reads either stored shape. A bare id (the v1 baseline, and any row
        seeded before typed links existed) reads back as FS with zero lag.
        """
        if not self.predecessors:
            return []
        s = self.predecessors.strip()
        raw = None
        if s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    raw = parsed
            except (json.JSONDecodeError, TypeError):
                raw = None
        if raw is None:
            # Legacy comma-separated form, still accepted on read.
            raw = [p.strip() for p in s.split(",") if p.strip()]
        from matching.providers import parse_predecessors

        return [link.as_dict() for link in parse_predecessors(raw)]

    def compute_variance(self, data_date: date) -> None:
        """Recompute variance days (positive = late)."""
        if self.actual_start and self.planned_start:
            self.start_variance_days = (self.actual_start - self.planned_start).days
        if self.actual_finish and self.planned_finish:
            self.finish_variance_days = (self.actual_finish - self.planned_finish).days


# ── Job (ingestion tracking) ────────────────────────────────────────────────

class BaselineVersion(Base):
    """Which baseline schedule the activities table was built from.

    A metric is only reproducible if you can say which schedule produced it.
    Two baselines now ship — a 120-activity one and a 218-activity one that
    shares no activity ids with it — so "38 activities finished" means nothing
    without this row.

    Rows are append-only in practice: importing a new baseline clears the
    `is_active` flag on the previous one rather than deleting it, so the
    history of what was loaded stays readable.
    """

    __tablename__ = "baseline_versions"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    # sha256 of the raw source bytes, not of the parsed activities: the point
    # is to identify the FILE, so two runs quoting different numbers can be
    # told apart by more than a filename.
    sha256 = Column(String, nullable=False, index=True)
    activity_count = Column(Integer, nullable=False, default=0)
    source_format = Column(String, nullable=False, default="json")
    # Exactly one row should carry is_active=True. Enforced by
    # _activate_baseline() in server/main.py rather than by a constraint,
    # because SQLite cannot express a partial unique index portably here.
    is_active = Column(Boolean, nullable=False, default=False)
    activities_created = Column(Integer, nullable=False, default=0)
    activities_updated = Column(Integer, nullable=False, default=0)
    source = Column(String, nullable=False, default="seed")  # seed | import
    note = Column(Text, nullable=True)
    imported_at = Column(DateTime, default=_now)

    def describe(self) -> str:
        return (
            f"{self.name} ({self.filename}, {self.activity_count} activities, "
            f"sha256 {(self.sha256 or '')[:12]})"
        )


class Job(Base):
    """Tracks a file ingestion and extraction pipeline run."""

    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=_uuid)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # txt, xlsx, csv
    status = Column(String, nullable=False, default="pending")  # pending/processing/completed/failed
    content_hash = Column(String, nullable=True, index=True)  # sha256 — duplicate-upload guard
    event_count = Column(Integer, default=0)
    linked_count = Column(Integer, default=0)
    review_count = Column(Integer, default=0)
    # What this ingest actually changed, as opposed to what it extracted.
    # Recorded at write time because the roll-up is the only place that knows:
    # an auto-linked event whose value was older, or blocked by an integrity
    # rule, is linked but writes nothing.
    activities_updated = Column(Integer, default=0)
    audit_records_created = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    linked_events = relationship("LinkedEvent", back_populates="job")


# ── LinkedEvent (extraction output tied to activities) ───────────────────────

class LinkedEvent(Base):
    """An extracted progress event linked to a schedule activity.

    Created by the extraction pipeline, reviewed by the planner.
    """

    __tablename__ = "linked_events"

    id = Column(String, primary_key=True, default=_uuid)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=True)  # null until linked

    # Provenance
    source_file = Column(String, nullable=False)
    source_line = Column(Integer, nullable=True)
    source_row = Column(Integer, nullable=True)
    source_span = Column(Text, nullable=False, default="")

    # Extracted data
    raw_text = Column(Text, nullable=False)
    tags = Column(Text, nullable=False, default="")  # JSON list
    reported_date = Column(Date, nullable=True)
    # What this event actually claims about the activity's timeline. Either
    # may be null: most lines assert only one of the two.
    asserted_start = Column(Date, nullable=True)
    asserted_finish = Column(Date, nullable=True)
    # How each of the three dates above was obtained. Persisted so a replay
    # through the roll-up (a planner confirming a review item) reaches the same
    # decision the ingest path did, instead of silently treating a defaulted
    # date as an asserted one.
    reported_date_basis = Column(String, nullable=True)
    asserted_start_basis = Column(String, nullable=True)
    asserted_finish_basis = Column(String, nullable=True)
    quantity = Column(Float, nullable=True)
    uom = Column(String, nullable=True)
    discipline = Column(String, nullable=False, default="unknown")
    status = Column(String, nullable=False, default="unknown")
    percentage = Column(Float, nullable=True)

    # Matching (matching/ MatchingEngine decision)
    confidence = Column(Float, nullable=False, default=0.0)
    match_method = Column(String, nullable=False, default="prepass")  # prepass/llm/manual
    alternatives = Column(Text, nullable=False, default="")  # JSON list
    decision = Column(String, nullable=False, default="NEW_ACTIVITY")  # AUTO_LINK/REVIEW/NEW_ACTIVITY/REJECTED
    margin = Column(Float, nullable=False, default=0.0)  # top-1 minus top-2 score
    rationale = Column(Text, nullable=False, default="")  # JSON list of feature names

    # Review
    reviewed = Column(Boolean, default=False)
    reviewer_action = Column(String, nullable=True)  # confirm/reassign/create/ignore
    reviewer_activity_id = Column(String, nullable=True)  # reassignment target
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=_now)

    # Relationships
    job = relationship("Job", back_populates="linked_events")
    activity = relationship("Activity", back_populates="linked_events")

    def tag_list(self) -> list[str]:
        if not self.tags:
            return []
        import json
        try:
            return json.loads(self.tags)
        except (json.JSONDecodeError, TypeError):
            return []

    def alternative_list(self) -> list[str]:
        """The candidate activity ids, oldest callers' shape.

        The column stored a bare list of ids until per-candidate scores were
        serialised into it; it now stores a list of objects. Rows written
        before that change are still bare id strings, so both shapes are read
        here and both yield a list of ids. Callers that only want ids —
        LinkedEventResponse for GET /jobs/{id}, and the agent slot state — are
        unaffected by the change.
        """
        return [c["activity_id"] for c in self.alternative_candidates()]

    def alternative_candidates(self) -> list[dict]:
        """Every ranked candidate with its own score and rationale.

        Empty `rationale` and a 0.0 `score` on a row written before candidate
        scores were serialised: the ids are all that row ever stored, and a
        missing score is reported as missing rather than back-filled with the
        top candidate's number.
        """
        if not self.alternatives:
            return []
        import json
        try:
            raw = json.loads(self.alternatives)
        except (json.JSONDecodeError, TypeError):
            return []
        if not isinstance(raw, list):
            return []

        out: list[dict] = []
        for i, entry in enumerate(raw, start=1):
            if isinstance(entry, str):
                # Pre-change row: an id and nothing else.
                out.append(
                    {"activity_id": entry, "rank": i, "score": 0.0, "rationale": []}
                )
            elif isinstance(entry, dict) and entry.get("activity_id"):
                out.append(
                    {
                        "activity_id": entry["activity_id"],
                        "rank": int(entry.get("rank", i)),
                        "score": float(entry.get("score", 0.0)),
                        "rationale": list(entry.get("rationale", [])),
                    }
                )
        return out


# ── AuditRecord (immutable) ─────────────────────────────────────────────────

class AuditRecord(Base):
    """Immutable audit log for every actual-date write.

    Once created, NEVER updated or deleted. This is the spine of the
    audit trail — every planner correction, every automatic update,
    every data import traces back here.
    """

    __tablename__ = "audit_records"

    id = Column(String, primary_key=True, default=_uuid)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=False)
    # The single extracted event responsible for this write, when there is
    # one. Null for genuinely aggregate writes — a rolled-up quantity or a
    # conflict note is produced by several events at once, and pointing at any
    # one of them would misattribute it. `contributing_sources` carries the
    # full picture in that case.
    linked_event_id = Column(
        String, ForeignKey("linked_events.id"), nullable=True, index=True
    )
    timestamp = Column(DateTime, nullable=False, default=_now)

    # What changed
    field_changed = Column(String, nullable=False)  # actual_start, actual_finish, actual_qty
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)

    # Why it changed
    source = Column(String, nullable=False)  # extraction, matching, planner_review, agent_turn, manual
    source_file = Column(String, nullable=True)
    # Where in that file the claim came from. Carried onto the audit row rather
    # than left on LinkedEvent alone, so the trail can name the exact line of
    # the exact report without a join that has no foreign key to travel along.
    source_line = Column(Integer, nullable=True)
    source_row = Column(Integer, nullable=True)
    source_span = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)

    # Provenance
    model_version = Column(String, nullable=False, default="prepass-v1")
    auto_applied = Column(Boolean, nullable=False, default=False)

    # Every source that contributed a value for this field, as JSON. Populated
    # when more than one source asserted the field so that a planner can see
    # the disagreement and which source the written value came from, rather
    # than one silently overwriting the other.
    contributing_sources = Column(Text, nullable=True)
    conflict = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=_now)

    # Relationships
    activity = relationship("Activity", back_populates="audit_records")
    linked_event = relationship("LinkedEvent")


# ── ReviewQueueItem ─────────────────────────────────────────────────────────

class ReviewQueueItem(Base):
    """An item in the planner review queue awaiting adjudication.

    Planners resolve these, and the resolution feeds the alias lexicon
    so the matcher improves during the demo.
    """

    __tablename__ = "review_queue"

    id = Column(String, primary_key=True, default=_uuid)
    linked_event_id = Column(String, ForeignKey("linked_events.id"), nullable=False)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=True)

    reason = Column(String, nullable=False)  # low_confidence, no_match, conflicting, manual_flag
    priority = Column(String, nullable=False, default="medium")  # low/medium/high
    status = Column(String, nullable=False, default="pending")  # pending/resolved/ignored

    # Planner resolution
    resolution = Column(String, nullable=True)  # confirm/reassign/create/ignore
    resolved_activity_id = Column(String, nullable=True)  # the activity_id the planner chose
    resolution_note = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    # A question the Planning Engineer put back to the supervisor, and the
    # answer. Kept on the review item rather than in a separate thread: a
    # clarification is always about one queued item, and the planner needs the
    # answer beside the item they are adjudicating.
    clarification_question = Column(Text, nullable=True)
    clarification_asked_by = Column(String, nullable=True)
    clarification_asked_at = Column(DateTime, nullable=True)
    clarification_response = Column(Text, nullable=True)
    clarification_answered_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=_now)

    # Relationships
    activity = relationship("Activity", back_populates="review_items")


# ── AliasLexicon (training signal) ──────────────────────────────────────────

class AliasLexicon(Base):
    """Training signal from planner corrections.

    Every planner confirmation/reassignment creates an entry here.
    The matcher uses these to improve fuzzy matching during the demo.
    """

    __tablename__ = "alias_lexicon"

    id = Column(String, primary_key=True, default=_uuid)
    source_text = Column(Text, nullable=False)  # the raw field text
    mapped_activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=False)
    discipline = Column(String, nullable=False, default="unknown")
    tags_extracted = Column(Text, nullable=False, default="")  # JSON list

    # Learning signal
    weight = Column(Float, nullable=False, default=1.0)  # increased by repeat confirmations
    times_confirmed = Column(Integer, nullable=False, default=1)
    times_rejected = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


# ── ConversationTurn (agent/turn) ───────────────────────────────────────────

class ConversationTurn(Base):
    """A single turn in the conversational logging session.

    Supports slot-filling: the agent asks for discipline, location,
    quantity, tags, status, and the site engineer fills them in.
    """

    __tablename__ = "conversation_turns"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, nullable=False, index=True)
    turn_number = Column(Integer, nullable=False)

    # Agent slot-filling state
    slots_filled = Column(Text, nullable=False, default="{}")  # JSON: {discipline, location, quantity, uom, tags, status}
    pending_slots = Column(Text, nullable=False, default="[]")  # JSON: list of slot names still needed

    # Input
    user_message = Column(Text, nullable=False)
    extracted_intent = Column(Text, nullable=True)  # what the agent understood

    # Output
    agent_response = Column(Text, nullable=False)
    event_created = Column(Boolean, default=False)
    linked_event_id = Column(String, ForeignKey("linked_events.id"), nullable=True)

    created_at = Column(DateTime, default=_now)


# ── MemoryCache ─────────────────────────────────────────────────────────────

class MemoryCache(Base):
    """Cached institutional memory query results.

    Invalidated when new actuals are written.
    """

    __tablename__ = "memory_cache"

    id = Column(String, primary_key=True, default=_uuid)
    query_key = Column(String, nullable=False, unique=True)  # e.g. "duration_by_type"
    query_params = Column(Text, nullable=False, default="{}")  # JSON
    result = Column(Text, nullable=False)  # JSON
    computed_at = Column(DateTime, nullable=False, default=_now)
    valid_until = Column(DateTime, nullable=True)


# ── Engine setup ─────────────────────────────────────────────────────────────

# Anchored to the repo root, not the working directory: the server is
# launched from the project root but scripts and tests may run from anywhere,
# and a CWD-relative URL silently creates a second, empty database.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("EPC_DB_PATH") or PROJECT_ROOT / "dataset" / "epc_progress.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite needs this for multi-threaded
    echo=False,
)


# Columns added after the first databases were created. SQLite cannot add them
# through create_all, and the demo database is not disposable during a run, so
# they are added in place. Additive only: no column is ever dropped or retyped
# here, and every one of them is nullable.
_ADDED_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("activities", "actual_start_basis", "VARCHAR"),
    ("activities", "actual_finish_basis", "VARCHAR"),
    ("activities", "wbs_level", "INTEGER"),
    ("activities", "calendar", "VARCHAR"),
    ("linked_events", "reported_date_basis", "VARCHAR"),
    ("linked_events", "asserted_start_basis", "VARCHAR"),
    ("linked_events", "asserted_finish_basis", "VARCHAR"),
)


def _add_missing_columns() -> None:
    """Bring an existing SQLite file up to the current schema."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, sqltype in _ADDED_COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sqltype}"))


def init_db() -> None:
    """Create all tables."""
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def get_db():
    """FastAPI dependency for DB sessions."""
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()


# ── Integrity validation helpers ────────────────────────────────────────────

class IntegrityError(Exception):
    """Raised when a schedule integrity rule is violated."""
    pass


class IntegrityWarning:
    """Non-blocking warning for schedule integrity issues."""
    def __init__(self, message: str, activity_id: str, field: str):
        self.message = message
        self.activity_id = activity_id
        self.field = field

    def to_dict(self) -> dict:
        return {
            "type": "integrity_warning",
            "message": self.message,
            "activity_id": self.activity_id,
            "field": self.field,
        }


def validate_actual_start(
    activity: Activity, new_start: date, data_date: date
) -> list[IntegrityWarning]:
    """Validate an actual_start assignment.

    Rules:
    - Actual Start must not be after data_date (hard block)
    - Warn if predecessors haven't started (soft warning)
    """
    warnings = []

    if new_start > data_date:
        raise IntegrityError(
            f"Actual Start {new_start} for {activity.activity_id} "
            f"is after data date {data_date}"
        )

    # Check predecessors
    for pred_id in activity.predecessor_list():
        pred = None
        # We need a session to query — caller handles this
        # Just return the warning with the predecessor ID
        warnings.append(
            IntegrityWarning(
                f"Predecessor {pred_id} has not started yet",
                activity.activity_id,
                "actual_start",
            )
        )

    return warnings


def validate_actual_finish(
    activity: Activity, new_finish: date
) -> list[IntegrityWarning]:
    """Validate an actual_finish assignment.

    Rules:
    - Actual Finish must not be before Actual Start (hard block)
    """
    if activity.actual_start and new_finish < activity.actual_start:
        raise IntegrityError(
            f"Actual Finish {new_finish} for {activity.activity_id} "
            f"is before Actual Start {activity.actual_start}"
        )

    return []
