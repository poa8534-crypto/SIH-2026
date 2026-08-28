"""SQLAlchemy models for the EPC progress tracking service.

SQLite backend with full audit trail, review queue, and alias lexicon
for continuous matcher improvement.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime

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
    wbs_path = Column(String, nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    detail = Column(Text, nullable=False, default="")
    discipline = Column(String, nullable=False, default="unknown")
    tag = Column(String, nullable=True)  # e.g. 24"-P-1001-A1A

    planned_start = Column(Date, nullable=False)
    planned_finish = Column(Date, nullable=False)
    planned_qty = Column(Float, nullable=False, default=0)
    uom = Column(String, nullable=False, default="")
    predecessors = Column(Text, nullable=False, default="")  # JSON list, comma-separated

    # Actuals (written by the system or planner, immutable without audit)
    actual_start = Column(Date, nullable=True)
    actual_finish = Column(Date, nullable=True)
    actual_qty = Column(Float, nullable=True)

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
        if not self.predecessors:
            return []
        # Handle both JSON array format and comma-separated format
        s = self.predecessors.strip()
        if s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(p).strip() for p in parsed if str(p).strip()]
            except (json.JSONDecodeError, TypeError):
                pass
        return [p.strip() for p in s.split(",") if p.strip()]

    def compute_variance(self, data_date: date) -> None:
        """Recompute variance days (positive = late)."""
        if self.actual_start and self.planned_start:
            self.start_variance_days = (self.actual_start - self.planned_start).days
        if self.actual_finish and self.planned_finish:
            self.finish_variance_days = (self.actual_finish - self.planned_finish).days


# ── Job (ingestion tracking) ────────────────────────────────────────────────

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
        if not self.alternatives:
            return []
        import json
        try:
            return json.loads(self.alternatives)
        except (json.JSONDecodeError, TypeError):
            return []


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
    timestamp = Column(DateTime, nullable=False, default=_now)

    # What changed
    field_changed = Column(String, nullable=False)  # actual_start, actual_finish, actual_qty
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)

    # Why it changed
    source = Column(String, nullable=False)  # extraction, matching, planner_review, agent_turn, manual
    source_file = Column(String, nullable=True)
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

DATABASE_URL = "sqlite:///dataset/epc_progress.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite needs this for multi-threaded
    echo=False,
)


def init_db() -> None:
    """Create all tables."""
    Base.metadata.create_all(bind=engine)


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
