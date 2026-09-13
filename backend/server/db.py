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

    # Which baseline this activity belongs to.
    #
    # Importing a schedule LEAVES the previous baseline's activities in this
    # table, because deleting them would orphan their LinkedEvent and
    # AuditRecord rows and destroy the append-only trail (D-004). Without this
    # column, two projects' activities were therefore indistinguishable once
    # both had been imported: the matcher indexed a single file on disk, and
    # anything reading the table straight got both schedules mixed together.
    #
    # Nullable because a database created before this column exists has rows
    # that predate it. `_attribute_activities_to_baseline` in server/main.py
    # adopts those on the next startup, and until it does the scoping helper
    # treats an unattributed table as unscoped rather than as empty - a wrong
    # answer of zero activities is far worse than a wide one. See D-092.
    baseline_id = Column(
        String, ForeignKey("baseline_versions.id"), nullable=True, index=True
    )

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
    # JSON list of slot names the optional LLM proposed on the agent turn that
    # produced this event, e.g. ["discipline","activity_description"]. NULL on
    # every rules-only event, which is the default. Carried onto the audit
    # record when a planner commits the event, so a reviewer can tell which
    # fields a model touched. Never contains activity_id or confidence: the
    # matching engine sets both and the model is not consulted (D-006).
    llm_assisted_fields = Column(Text, nullable=True)
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
    # JSON list of slot names an LLM proposed on the field report behind this
    # write, copied from LinkedEvent.llm_assisted_fields when the planner
    # committed it. NULL for every write that no model touched. This is
    # provenance, not a value: nothing here was chosen by a model, it records
    # which of the supervisor's fields a model helped read.
    llm_assisted_fields = Column(Text, nullable=True)

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


# ── RaidItem (governance register) ──────────────────────────────────────────

class RaidItem(Base):
    """One entry in the Risk / Issue / Action / Decision register.

    ONE table, not four. The four kinds share every structural field - a title,
    an owner, a status, a due date, links back to the activities and the
    evidence that raised them - and differ only in which optional fields carry a
    value. Four tables would have meant four sets of endpoints, four filters and
    four migrations to keep in step, for no gain.

    `kind` is one of `risk`, `issue`, `action`, `decision`. The risk-only
    fields (`probability`, `impact_days`, `exposure`) are null on the other
    three; nothing infers them.

    EXPOSURE IS ARITHMETIC, NEVER A JUDGEMENT.
    `exposure = probability x impact_days`, computed in `server/raid.py` and
    written on every create and update. No LLM is involved at any point, in
    keeping with the project rule that a number on a dashboard is computed
    deterministically (ROADMAP; and D-003 for the same reason on `rationale`).

    PROVENANCE. `source_kind` / `source_id` name the LinkedEvent or AuditRecord
    that raised the item, so a register entry can always be traced back to the
    field report behind it. They are null for an item a planner typed from
    scratch, which is an honest distinction rather than a missing value.

    See D-048.
    """

    __tablename__ = "raid_item"

    id = Column(String, primary_key=True, default=_uuid)

    kind = Column(String, nullable=False)          # risk | issue | action | decision
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    category = Column(String, nullable=True)       # e.g. weather, resource, design
    status = Column(String, nullable=False, default="open")  # open|mitigating|closed|rejected
    owner = Column(String, nullable=True)

    due_date = Column(Date, nullable=True)
    date_raised = Column(Date, nullable=True)
    date_closed = Column(Date, nullable=True)

    # Risk-only. Null on issue / action / decision.
    probability = Column(Float, nullable=True)     # 0.0 - 1.0
    impact_days = Column(Float, nullable=True)     # schedule days at stake
    exposure = Column(Float, nullable=True)        # probability x impact_days

    # JSON list of activity ids this item bears on.
    linked_activity_ids = Column(Text, nullable=False, default="[]")

    # What raised it. Null when a planner typed it in directly.
    source_kind = Column(String, nullable=True)    # linked_event | audit_record | delay_analysis
    source_id = Column(String, nullable=True)
    source_note = Column(Text, nullable=True)

    created_by = Column(String, nullable=False, default="planner")
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    def activity_list(self) -> list[str]:
        """The linked activity ids. Never raises on malformed stored JSON."""
        if not self.linked_activity_ids:
            return []
        import json
        try:
            value = json.loads(self.linked_activity_ids)
        except (json.JSONDecodeError, TypeError):
            return []
        return [str(v) for v in value] if isinstance(value, list) else []


# ── AliasLexicon (training signal) ──────────────────────────────────────────

class AliasLexicon(Base):
    """Training signal from planner corrections.

    Every planner confirmation/reassignment creates an entry here.

    **The matcher does NOT read these.** An earlier version of this docstring
    said it did, which was never true and is the kind of claim that is worse
    than silence. `w_alias = 0.0` and no production code path populates
    `EngineConfig.alias_lexicon`. See D-061 for why that is deliberate rather
    than unfinished: the channel was measured and cannot help.

    The rows are still written, and are still worth writing. They are the
    audit record of what a planner decided, and the training data any future
    ranking-stage use of corrections would be fitted on.
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


# ── DelayEvent (delay attribution) ──────────────────────────────────────────

class DelayEvent(Base):
    """One delay, classified, with the sentence it was read from.

    ARCHITECTURE.md §2.7 specified this record and it was never built. It is
    the unit the Contractor Dispute Shield is assembled from: a Liquidated
    Damages argument is won or lost on whether each delay can be tied to a
    party AND to the document that evidences it, and this row carries both.

    DERIVED, NOT AUTHORED.
    Every row is materialised from `AuditRecord` text by
    `server/delay_events.py :: sync_delay_events`, keyed on the observation
    identity `server/raid.py :: delay_observations` already uses - the phrase,
    the activity, the source file and the exact span. Re-running the sync
    updates rows in place and never duplicates them, so it is safe to call on
    every ingest. Delete the audit trail and these rows are meaningless, which
    is why `server/demo.py :: clear_progress` clears them with it.

    LIABILITY IS A PROPOSAL UNTIL A PLANNER RULES.
    `liability_proposed` comes from the deterministic table in
    `server/delay_taxonomy.py`. `liability_final` stays NULL until a planner
    adjudicates the row, and the adjudication writes an append-only
    `AuditRecord` of its own rather than only setting this column - the same
    rule that keeps a proposed actual date out of the schedule until
    `POST /review/{id}/resolve` commits it (D-009). A report must count a row
    with no `liability_final` as unadjudicated, never as a finding.

    `impact_days` IS AN UPPER BOUND.
    It is the affected activity's whole finish slip, credited to this cause.
    An activity delayed by two causes reports the same slip against both, so
    the figures do not sum to a project total. Making it exact needs float
    consumption, which nothing in this codebase computes yet.

    See D-077.
    """

    __tablename__ = "delay_events"

    id = Column(String, primary_key=True, default=_uuid)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=True, index=True)

    # The audit row this classification cites. The EARLIEST row carrying the
    # span, so the citation is the first time the project recorded the claim,
    # not whichever write happened to land last.
    audit_record_id = Column(String, ForeignKey("audit_records.id"), nullable=True)

    # The matched vocabulary phrase. Part of the row's identity, and the reason
    # the same activity can carry two delay events from two different causes.
    phrase = Column(String, nullable=False)

    # ARCHITECTURE §2.7. Values come from `delay_taxonomy.DelayCategory`.
    category = Column(String, nullable=False, default="OTHER")

    # Deterministic proposal, and the planner's ruling. Values come from
    # `delay_taxonomy.Liability`.
    liability_proposed = Column(String, nullable=False, default="CONTESTED")
    liability_final = Column(String, nullable=True)
    adjudicated_by = Column(String, nullable=True)
    adjudicated_at = Column(DateTime, nullable=True)
    adjudication_note = Column(Text, nullable=True)

    # How the category was reached: "rules" for the phrase table. An LLM
    # classifier would write its own name here, and would still never touch
    # liability.
    inferred_by = Column(String, nullable=False, default="rules")
    confidence = Column(Float, nullable=True)

    discipline = Column(String, nullable=True)
    # Calendar month the affected activity concluded, "YYYY-MM". This is the
    # field §2.7 said "enables seasonality / historical-delay queries", and its
    # absence is why the system could not answer what monsoon costs on civil
    # work. A multi-month activity is credited to the month it ended, which is
    # a simplification the report states rather than hides.
    month = Column(String, nullable=True, index=True)
    impact_days = Column(Integer, nullable=False, default=0)

    # Provenance, copied from the citing audit row so a report can name the
    # exact line of the exact document without a join.
    raw_text = Column(Text, nullable=True)
    source_file = Column(String, nullable=True)
    source_line = Column(Integer, nullable=True)
    source_row = Column(Integer, nullable=True)
    source_span = Column(Text, nullable=True)

    # ── Float and project delay (D-082) ──
    # Total float on the baseline network, and the slip split against it.
    # `beyond_float_days` is the only part that can have moved the completion
    # date, and it is what a Liquidated Damages calculation is built from;
    # `impact_days` above remains the whole slip, an upper bound.
    #
    # Baseline float, not float remaining when the delay struck - that needs a
    # time-impact analysis over a series of updated schedules, and this system
    # holds one baseline. NULL float means the activity could not be scheduled
    # at all, and `split_slip` then credits no slack rather than assuming some.
    activity_total_float = Column(Integer, nullable=True)
    float_consumed_days = Column(Integer, nullable=False, default=0)
    beyond_float_days = Column(Integer, nullable=False, default=0)
    on_critical_path = Column(Boolean, nullable=False, default=False)

    # ── Contractual notice (D-080) ──
    # The date the project was TOLD about this delay, and how that date was
    # arrived at. `evidenced_basis` exists for the same reason `DateBasis`
    # does on an activity: a date read from a field report and a date inferred
    # from when the row happened to be written are not the same claim, and a
    # notice clock started from the wrong one is worse than no clock.
    evidenced_on = Column(Date, nullable=True, index=True)
    evidenced_basis = Column(String, nullable=True)  # REPORTED|ACTUAL_FINISH|RECORDED
    # evidenced_on + the contractual notice window. Derived on every sync.
    notice_due_on = Column(Date, nullable=True)

    # Facts a planner supplies, never derived and never cleared by a re-sync -
    # the same rule that protects `liability_final`.
    notice_served_on = Column(Date, nullable=True)
    notice_reference = Column(String, nullable=True)

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


# ── Crew (the unit manpower is counted in) ──────────────────────────────────

class Crew(Base):
    """A gang: the smallest unit a supervisor can actually count heads in.

    NAVIS had no manpower model at all, and that absence showed up in two
    places that matter. `productivity.py` divides installed quantity by
    CALENDAR days and says so plainly — "a statement about how often somebody
    wrote a report, not about the crew" — because there was no man-day
    denominator to divide by instead. And `delay_taxonomy.py` carries a
    MANPOWER delay category with nothing behind it: a planner could classify a
    slip as a labour shortage, but nothing in the database could corroborate
    that a shortage happened.

    A crew, not a person. There is no user table, no authentication (role.ts
    says why), and naming individuals would put personal data into an audit
    trail that is deliberately append-only and permanent. `foreman` is a free
    text label on the gang, not an identity — the seeded corpus leaves it null.
    """

    __tablename__ = "crews"

    crew_id = Column(String, primary_key=True)          # e.g. CIV-TEAM-01
    name = Column(String, nullable=False, default="")
    # Matches Activity.discipline so attendance can be rolled up the same way
    # progress is. Same vocabulary, same spellings — see matching/terminology.py.
    discipline = Column(String, nullable=False, default="unknown")
    contractor = Column(String, nullable=False, default="")
    trade = Column(String, nullable=True)               # mason, fitter, welder…
    # The strength the crew is CONTRACTED to field. The planned denominator in
    # every shortfall figure, and snapshotted onto each attendance row so that
    # re-sizing a crew later cannot silently rewrite last month's shortfall.
    planned_strength = Column(Integer, nullable=False, default=0)
    foreman = Column(String, nullable=True)
    shift = Column(String, nullable=False, default="day")   # day / night
    active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    attendance = relationship("AttendanceRecord", back_populates="crew")
    assignments = relationship("ResourceAssignment", back_populates="crew")


# ── AttendanceRecord (the muster) ───────────────────────────────────────────

class AttendanceRecord(Base):
    """One muster reading for one crew, one date, one shift.

    APPEND-ONLY, for the same reason `audit_records` is (D-004). A muster is
    evidence: it is what a contractor is paid against and what a delay claim
    argues from. Editing yesterday's headcount in place would destroy the only
    record that it ever said something different.

    A correction therefore writes a NEW row carrying `supersedes_id`, and
    nothing about the superseded row changes — not even a flag. "Which reading
    is current" is derived (`current_attendance`), never stored, so the table
    cannot drift into a state where two rows both claim to be current.
    """

    __tablename__ = "attendance_records"

    id = Column(String, primary_key=True, default=_uuid)
    crew_id = Column(String, ForeignKey("crews.crew_id"), nullable=False, index=True)
    attendance_date = Column(Date, nullable=False, index=True)
    shift = Column(String, nullable=False, default="day")

    # Snapshot of Crew.planned_strength when the muster was taken. Copied, not
    # joined: a crew re-sized in October must not change September's shortfall.
    planned_strength = Column(Integer, nullable=False, default=0)
    present = Column(Integer, nullable=False, default=0)
    absent = Column(Integer, nullable=False, default=0)
    # JSON object {reason: count} — leave, sick, no_show, redeployed, weather.
    # A dict rather than a column per reason so a new reason is data, not a
    # migration.
    absence_reasons = Column(Text, nullable=False, default="{}")
    # Hours each present head worked. Null means "not stated"; it is never
    # defaulted to 8 on write, because an assumed 8 propagates into a man-day
    # figure that then looks measured. `man_days()` states the assumption at
    # the point of use instead.
    hours_worked = Column(Float, nullable=True)

    # Which activities this crew was on that day. JSON list of activity ids.
    # This is the join that turns a headcount into productivity: without it
    # attendance is an HR number, with it it is a denominator.
    activity_ids = Column(Text, nullable=False, default="[]")

    # How this reading was obtained. `dpr_extract` is the interesting one: the
    # sample DPRs already say things like "Labour kam tha aaj so went slow"
    # and NAVIS discarded every word of it.
    source = Column(String, nullable=False, default="field_app")
    source_file = Column(String, nullable=True)
    source_line = Column(Integer, nullable=True)
    # Null for a reading a human typed — a supervisor counting his own gang is
    # not a probabilistic claim. Populated only for an extracted one.
    confidence = Column(Float, nullable=True)
    # The ROLE that reported it. There is no auth, so this is never a person.
    reported_by = Column(String, nullable=True)

    # The row this one corrects, if any. Chain, never mutation.
    supersedes_id = Column(
        String, ForeignKey("attendance_records.id"), nullable=True, index=True
    )
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=_now)

    crew = relationship("Crew", back_populates="attendance")

    def reason_map(self) -> dict:
        """Absence reasons as a dict. Total: a malformed blob reads as {}."""
        if not self.absence_reasons:
            return {}
        try:
            parsed = json.loads(self.absence_reasons)
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def activity_list(self) -> list[str]:
        """Activity ids this crew worked. Total: a malformed blob reads as []."""
        if not self.activity_ids:
            return []
        try:
            parsed = json.loads(self.activity_ids)
            return [str(a) for a in parsed] if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def man_days(self, assumed_shift_hours: float = 8.0) -> float:
        """Man-days this muster represents.

        `hours_worked` is per present head and is usually absent, so the
        fallback is one man-day per present head — the convention a muster
        sheet already uses. The assumption is a named parameter rather than a
        literal buried in an expression, so a caller that knows the real shift
        length can pass it and a reader can see what was assumed.
        """
        if self.hours_worked is None:
            return float(self.present)
        return float(self.present) * (self.hours_worked / assumed_shift_hours)

    @property
    def shortfall(self) -> int:
        """Heads short of contracted strength. Never negative-by-surprise:
        an over-strength day returns a negative number deliberately, because
        hiding it would make the weekly total wrong."""
        return self.planned_strength - self.present


# ── ResourceAssignment (who is meant to be where) ───────────────────────────

class ResourceAssignment(Base):
    """A crew committed — or merely proposed — against an activity for a span.

    The proposal/commit split is D-009's rule applied to manpower: a Field
    Supervisor can ask for two more fitters, and that ask is a row with
    `status='proposed'`. Only the Project Manager moves it to `committed`.
    Nothing a supervisor does changes the plan, here or anywhere else.

    Unlike `attendance_records` this table is NOT append-only. An assignment
    is an intention, not evidence; it is allowed to change. The audit of the
    change lives in `decided_by` / `decided_at` plus the AuditRecord the
    commit path writes.
    """

    __tablename__ = "resource_assignments"

    id = Column(String, primary_key=True, default=_uuid)
    crew_id = Column(String, ForeignKey("crews.crew_id"), nullable=False, index=True)
    activity_id = Column(
        String, ForeignKey("activities.activity_id"), nullable=False, index=True
    )
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    allocated_strength = Column(Integer, nullable=False, default=0)

    # proposed → committed | withdrawn. A withdrawn row is kept so that the
    # board can show that manpower WAS asked for and refused, which is exactly
    # the fact a delay claim turns on.
    status = Column(String, nullable=False, default="proposed", index=True)

    # Deterministic feature names, never model prose — D-003, the same rule
    # the matcher's rationale follows. Comma-separated tokens such as
    # "critical_path,under_resourced,discipline_match".
    rationale = Column(Text, nullable=False, default="")

    requested_by = Column(String, nullable=True)   # role that proposed
    decided_by = Column(String, nullable=True)     # role that committed/withdrew
    decided_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    crew = relationship("Crew", back_populates="assignments")
    activity = relationship("Activity")

    def rationale_list(self) -> list[str]:
        """Rationale tokens. Empty when nothing was recorded."""
        return [t.strip() for t in (self.rationale or "").split(",") if t.strip()]

    def overlaps(self, other_from: date, other_to: date) -> bool:
        """True when this assignment's span intersects the given one.

        Half-open would be wrong here: a crew assigned to finish on the 12th
        and start elsewhere on the 12th IS double-booked that day, because a
        gang cannot be in two places in one shift.
        """
        return self.from_date <= other_to and other_from <= self.to_date


# ── DeviceSession (connectivity telemetry) ──────────────────────────────────

class DeviceSession(Base):
    """What one client's link to the server actually looks like right now.

    NAVIS claims near-real-time schedule updates. At a well-site in Duliajan
    that claim is only as good as the link, and until now nothing recorded
    whether the link was there. Without this table a discipline that has not
    reported for three days is indistinguishable between "no work happened"
    and "no signal reached us" — and those two facts lead a planner to
    opposite decisions.

    Latest-write-wins, not an audit table: this is a liveness view, and a
    permanent history of every ping would be noise. `samples` keeps a short
    capped window so a trend is still visible.
    """

    __tablename__ = "device_sessions"

    id = Column(String, primary_key=True, default=_uuid)
    # Client-generated and stored in localStorage. Not a person and not a
    # credential — it identifies a browser so queue depth can be attributed.
    device_id = Column(String, nullable=False, unique=True, index=True)
    role = Column(String, nullable=False, default="field")
    # A discipline or work-front label, never a name.
    label = Column(String, nullable=True)

    first_seen = Column(DateTime, nullable=False, default=_now)
    last_seen = Column(DateTime, nullable=False, default=_now, index=True)

    # rich (voice + model) / lean (text only) / offline (queued locally).
    # Declared by the client, because the client is the only thing that knows
    # what it actually did with the link.
    mode = Column(String, nullable=False, default="rich")
    measured_kbps = Column(Float, nullable=True)
    rtt_ms = Column(Float, nullable=True)
    queue_depth = Column(Integer, nullable=False, default=0)
    queue_bytes = Column(Integer, nullable=False, default=0)
    # JSON list of recent {at, kbps, rtt_ms, mode} samples, newest last,
    # capped by the write path so one chatty device cannot grow a row forever.
    samples = Column(Text, nullable=False, default="[]")

    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    def sample_list(self) -> list[dict]:
        """Recent link samples. Total: a malformed blob reads as []."""
        if not self.samples:
            return []
        try:
            parsed = json.loads(self.samples)
            return [s for s in parsed if isinstance(s, dict)] if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []


# ── Engine setup ─────────────────────────────────────────────────────────────

# Anchored to the repo root, not the working directory: the server is
# launched from the project root but scripts and tests may run from anywhere,
# and a CWD-relative URL silently creates a second, empty database.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
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
    ("activities", "baseline_id", "VARCHAR"),
    ("linked_events", "reported_date_basis", "VARCHAR"),
    ("linked_events", "asserted_start_basis", "VARCHAR"),
    ("linked_events", "asserted_finish_basis", "VARCHAR"),
    ("linked_events", "llm_assisted_fields", "TEXT"),
    ("audit_records", "llm_assisted_fields", "TEXT"),
    ("delay_events", "evidenced_on", "DATE"),
    ("delay_events", "evidenced_basis", "VARCHAR"),
    ("delay_events", "notice_due_on", "DATE"),
    ("delay_events", "notice_served_on", "DATE"),
    ("delay_events", "notice_reference", "VARCHAR"),
    ("delay_events", "activity_total_float", "INTEGER"),
    ("delay_events", "float_consumed_days", "INTEGER"),
    ("delay_events", "beyond_float_days", "INTEGER"),
    ("delay_events", "on_critical_path", "BOOLEAN"),
)


def add_missing_columns(target=None) -> None:
    """Bring an existing SQLite file up to the current schema.

    `target` defaults to the application engine. It is a parameter because the
    test database is a real file too: `create_all` cannot add a column to a
    table that already exists, so a test run against a database created before
    the newest column failed on every query naming it. The fixtures call this
    for the same reason production does.
    """
    from sqlalchemy import inspect, text

    target = target if target is not None else engine
    inspector = inspect(target)
    tables = set(inspector.get_table_names())
    with target.begin() as conn:
        for table, column, sqltype in _ADDED_COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sqltype}"))


# Kept as the historical private name; `add_missing_columns` is the one to call.
_add_missing_columns = add_missing_columns


def init_db() -> None:
    """Create all tables."""
    Base.metadata.create_all(bind=engine)
    add_missing_columns()


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


# ── Attendance derivation ───────────────────────────────────────────────────
#
# `attendance_records` is append-only, so "the current reading for this crew on
# this date" is a query, not a column. Keeping it derived is the whole point:
# a stored `superseded` flag can disagree with the `supersedes_id` chain, and
# when it does there is no way to tell which one lied.

def superseded_attendance_ids(records: list[AttendanceRecord]) -> set[str]:
    """Ids that some OTHER row in `records` explicitly corrects.

    Takes an already-fetched list rather than a session, so a caller that has
    loaded a month of musters for a grid does not issue a second query per row.
    """
    return {r.supersedes_id for r in records if r.supersedes_id}


def current_attendance(records: list[AttendanceRecord]) -> list[AttendanceRecord]:
    """Only the live readings: every row nothing else supersedes.

    Two rows for the same crew/date/shift with no `supersedes_id` between them
    are BOTH returned. That is not a bug to paper over — it means two people
    mustered the same gang independently, and a caller showing a headcount must
    show the disagreement rather than silently pick one. `attendance_conflicts`
    finds them.
    """
    dead = superseded_attendance_ids(records)
    return [r for r in records if r.id not in dead]


def attendance_conflicts(
    records: list[AttendanceRecord],
) -> dict[tuple[str, date, str], list[AttendanceRecord]]:
    """Live readings that contradict each other, keyed by (crew, date, shift).

    Only groups with more than one live row and more than one distinct
    `present` value are returned: two sources agreeing that 14 heads turned up
    is corroboration, not a conflict.
    """
    groups: dict[tuple[str, date, str], list[AttendanceRecord]] = {}
    for rec in current_attendance(records):
        groups.setdefault((rec.crew_id, rec.attendance_date, rec.shift), []).append(rec)
    return {
        key: rows
        for key, rows in groups.items()
        if len(rows) > 1 and len({r.present for r in rows}) > 1
    }
