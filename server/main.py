"""FastAPI service wrapping the EPC progress extraction pipeline.

Endpoints:
  POST /ingest              upload file → returns job_id
  GET  /jobs/{id}           extraction + linking results with confidence
  GET  /review-queue        items needing planner adjudication
  POST /review/{id}/resolve planner confirms/reassigns/creates activity
  GET  /schedule            planned vs actual, variance in days
  POST /schedule/export     emit PMXML (XER as stretch)
  GET  /memory/query        institutional memory analytics
  POST /agent/turn          slot-filling conversational logging turn

Non-negotiables enforced:
  - Every actual-date write → immutable AuditRecord
  - No Actual Start after data date (hard block)
  - No Actual Finish before Actual Start (hard block)
  - Predecessor-not-started → warn (don't block)
  - Planner corrections → persisted as training signal (alias lexicon)
  - /memory/query → duration distribution, productivity, delay reasons, suggested_duration
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import statistics
import uuid
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extraction.textio import read_text
from server import agent_llm
from server.agent_slots import (
    AgentContext,
    DISCIPLINE_VALUES,
    InvalidDate,
    STATUS_LABELS,
    choices_for,
    discipline_label,
    mentions_countable,
    parse_date,
    parse_discipline,
    parse_quantity,
    parse_status,
    parse_tags,
    question_for,
)
from extraction.extractor import Extractor
from extraction.models import (
    DateBasis,
    Discipline,
    EventStatus,
    ExtractionMethod,
    Provenance,
)
from extraction.models import ExtractedEvent as PydanticEvent
from matching import (
    Decision,
    LinkDecision,
    MatchingEngine,
    RollupAccumulator,
    Thresholds,
)

from .db import (
    Activity,
    AliasLexicon,
    AuditRecord,
    Base,
    ConversationTurn,
    IntegrityError,
    IntegrityWarning,
    Job,
    LinkedEvent,
    MemoryCache,
    ReviewQueueItem,
    engine,
    get_db,
    validate_actual_finish,
    validate_actual_start,
    _uuid,
    _now,
)
from .schemas import (
    AgentTurnRequest,
    AgentTurnResponse,
    DelayReason,
    DurationDistribution,
    AuditFeedItem,
    AuditRecordResponse,
    ClarificationAnswerRequest,
    ClarificationAskRequest,
    ClarificationResponse,
    ConflictSide,
    ExportRequest,
    FieldReportResponse,
    JobSummaryResponse,
    SourceConflict,
    ExportResponse,
    IngestResponse,
    JobResponse,
    LinkedEventResponse,
    MemoryQueryRequest,
    MemoryQueryResponse,
    ProductivityMetric,
    ResolveRequest,
    ResolveResponse,
    ReviewQueueItemResponse,
    ScheduleActivityResponse,
    ScheduleResponse,
    SuggestedDuration,
    SlotState,
)

logger = logging.getLogger(__name__)

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EPC Progress Tracker",
    description="EPC field-report extraction, schedule tracking, and institutional memory",
    version="0.1.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# The React dev server runs on a different origin, so the browser preflights
# every non-GET call. Credentials are off (the API has no cookie or session
# auth), which is what allows a permissive origin policy here.

# Vite's default port, named explicitly.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Everything else we need to reach during a demo, matched in full:
#   * localhost / 127.0.0.1 on ANY port - Vite silently moves to 5174, 5175 ...
#     when 5173 is already taken, and a hardcoded port makes that look like a
#     backend failure.
#   * the three private IPv4 ranges, so a second device on the same network
#     can reach the API. 192.168/16 covers a normal LAN and an Android
#     hotspot; 172.16/12 is included because an iOS personal hotspot hands
#     out 172.20.10.x, and 10/8 covers the rest.
CORS_ALLOWED_ORIGIN_REGEX = (
    r"http://("
    r"localhost|127\.0\.0\.1"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


DATA_DATE = date(2026, 9, 15)  # Latest date in our dataset


@app.on_event("startup")
def startup():
    """Initialize DB and seed baseline schedule."""
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        _seed_schedule_if_empty(db)
    finally:
        db.close()


# ── Seed baseline schedule ───────────────────────────────────────────────────

def _seed_schedule_if_empty(db: Session) -> None:
    """Load baseline_schedule.json into the activities table if empty."""
    count = db.query(Activity).count()
    if count > 0:
        return

    schedule_path = Path(__file__).resolve().parent.parent / "dataset" / "baseline_schedule.json"
    if not schedule_path.exists():
        logger.warning(f"Baseline schedule not found: {schedule_path}")
        return

    # Explicit decode rather than the platform default, so the baseline
    # loads identically on Windows and Linux.
    activities = json.loads(read_text(schedule_path))

    for act in activities:
        db.add(Activity(
            activity_id=act["activity_id"],
            wbs_path=act.get("wbs_path", ""),
            description=act.get("description", ""),
            detail=act.get("detail", ""),
            discipline=act.get("discipline", "unknown"),
            tag=act.get("tag"),
            planned_start=date.fromisoformat(act["planned_start"]),
            planned_finish=date.fromisoformat(act["planned_finish"]),
            planned_qty=act.get("planned_qty", 0),
            uom=act.get("uom", ""),
            predecessors=json.dumps(act.get("predecessors", [])),
        ))

    db.commit()
    logger.info(f"Seeded {len(activities)} activities from baseline schedule")


# ── Linking engine (matching/ MatchingEngine as a service) ──────────────────

# Calibrated for the REAL pipeline (extraction spans → matching) by aligning
# dataset/ground_truth.csv mentions to extracted events and grid-searching:
#   auto-link precision 96.6%, coverage 48%, suggestion recall 86.4%,
#   5/12 NO_MATCH hard negatives rejected, 0 schedule-corrupting FPs at the
#   stricter point (0.65/0.30/0.08 → 97.9% precision, 38.7% coverage).
# Precision-first: ambiguous margin → REVIEW, never a wrong auto-link.
MATCHING_THRESHOLDS = Thresholds(tau_high=0.70, tau_low=0.40, margin_min=0.03)
MATCHING_MODEL_VERSION = "matching-v1"

SCHEDULE_PATH = str(
    Path(__file__).resolve().parent.parent / "dataset" / "baseline_schedule.json"
)

_MATCHING_ENGINE: Optional[MatchingEngine] = None


def get_matching_engine() -> MatchingEngine:
    """Lazily build the schedule-linking engine (loads MiniLM once)."""
    global _MATCHING_ENGINE
    if _MATCHING_ENGINE is None:
        _MATCHING_ENGINE = MatchingEngine(SCHEDULE_PATH, thresholds=MATCHING_THRESHOLDS)
    return _MATCHING_ENGINE


def link_events_to_activities(
    events: list[PydanticEvent], db: Session
) -> list[tuple[PydanticEvent, Optional[str], float, list[str]]]:
    """Match extracted events to schedule activities.

    Kept as a thin adapter over matching.MatchingEngine with the historical
    tuple contract (event, matched_activity_id, confidence, alternatives).
    The matching logic itself lives entirely in matching/ — this only
    translates the decision into the shape older callers expect.

    NOTE: for REVIEW outcomes the returned activity id is the PROPOSAL,
    not a committed link. Ingest persistence treats it accordingly
    (review queue entry, no schedule mutation).
    """
    engine = get_matching_engine()
    decisions = engine.match_events(list(events))
    results = []
    for event, decision in zip(events, decisions):
        top1 = decision.top1
        if decision.outcome is Decision.AUTO_LINK:
            matched_id = decision.chosen_activity_id
        elif decision.outcome is Decision.REVIEW and top1 is not None:
            matched_id = top1.activity_id  # proposal only — see docstring
        else:
            matched_id = None
        results.append((
            event,
            matched_id,
            round(decision.confidence, 2),
            [c.activity_id for c in decision.candidates[:3]],
        ))
    return results

# ── Audit trail helper ───────────────────────────────────────────────────────

def _write_audit(
    db: Session,
    activity_id: str,
    field: str,
    old_value: Optional[str],
    new_value: Optional[str],
    source: str = "extraction",
    linked_event_id: Optional[str] = None,
    source_file: Optional[str] = None,
    source_line: Optional[int] = None,
    source_row: Optional[int] = None,
    source_span: Optional[str] = None,
    confidence: Optional[float] = None,
    auto_applied: bool = False,
    model_version: str = "prepass-v1",
    contributing_sources: Optional[list[str]] = None,
    conflict: bool = False,
) -> AuditRecord:
    """Create an immutable audit record. Called on EVERY actual-date write.

    `contributing_sources` lists every source that asserted a value for this
    field. It is recorded whenever more than one source contributed, so the
    audit trail shows the disagreement and which source the written value
    came from instead of one silently overwriting the other.
    """
    record = AuditRecord(
        id=_uuid(),
        activity_id=activity_id,
        timestamp=_now(),
        field_changed=field,
        old_value=old_value,
        new_value=new_value,
        source=source,
        linked_event_id=linked_event_id,
        source_file=source_file,
        source_line=source_line,
        source_row=source_row,
        source_span=source_span,
        confidence=confidence,
        model_version=model_version,
        auto_applied=auto_applied,
        contributing_sources=(
            json.dumps(contributing_sources) if contributing_sources else None
        ),
        conflict=conflict,
    )
    db.add(record)
    return record


# ── Schedule actuals from matching/ rollup ───────────────────────────────────

# ── Event index ──────────────────────────────────────────────────────────────

# A DateAssertion now carries the file, line and row it came from, so an audit
# write can name its origin exactly rather than by matching text. This index
# closes the last hop: from that position back to the LinkedEvent row, so the
# audit record can hold a real foreign key. The key includes line and row, so
# two identical lines in one file are distinct entries rather than one.
EventIndex = dict[tuple, str]


def _build_event_index(pairs) -> EventIndex:
    """Map (source_file, source_line, source_row, text) -> linked_event id.

    `pairs` is an iterable of (event, linked_event_id). Each event is indexed
    under both its extracted span and its raw text, because an assertion falls
    back to raw text when the span is empty.
    """
    index: EventIndex = {}
    for event, linked_event_id in pairs:
        prov = getattr(event, "provenance", None)
        if prov is None or not linked_event_id:
            continue
        where = (prov.source_file, prov.source_line, prov.source_row)
        for text in (getattr(prov, "source_span", None), getattr(event, "raw_text", None)):
            if text:
                index.setdefault(where + (text,), linked_event_id)
    return index


def _origin(index: Optional[EventIndex], assertion) -> tuple:
    """(linked_event_id, source_file, source_line, source_row) for one assertion.

    Everything but the id comes straight off the assertion — the index is only
    consulted to recover the foreign key.
    """
    if assertion is None:
        return (None, None, None, None)
    key = (
        assertion.source_file,
        assertion.source_line,
        assertion.source_row,
        assertion.source_span,
    )
    return (
        (index or {}).get(key),
        assertion.source_file or None,
        assertion.source_line,
        assertion.source_row,
    )


def _assertion_for(assertions, value):
    """The assertion that produced the value actually written, if any."""
    for a in assertions:
        if a.value == value:
            return a
    return assertions[0] if assertions else None


def _prior_write(db: Session, activity_id: str, field: str):
    """The most recent audit row for one field of one activity, or None.

    Conflict detection needs it because the roll-up only sees the assertions of
    the current ingest call. Two files disagreeing about the same date are
    almost always ingested separately, so the other side of the disagreement
    lives in the audit trail, not in the current RollupResult.
    """
    return (
        db.query(AuditRecord)
        .filter(
            AuditRecord.activity_id == activity_id,
            AuditRecord.field_changed == field,
        )
        .order_by(AuditRecord.timestamp.desc(), AuditRecord.created_at.desc())
        .first()
    )


def _describe_side(value, source_file, source_line, source_row) -> str:
    """One side of a disagreement, shaped like DateAssertion.describe()."""
    where = source_file or "unknown source"
    if source_line is not None:
        where = "%s line %s" % (where, source_line)
    elif source_row is not None:
        where = "%s row %s" % (where, source_row)
    return "%s from %s" % (value, where)


def _basis_value(basis) -> Optional[str]:
    """The stored form of a DateBasis, or None when there is no date."""
    return getattr(basis, "value", None) or (basis if isinstance(basis, str) else None)


def _basis_or_none(value) -> Optional[DateBasis]:
    """A stored basis string back as the enum, tolerating rows written before
    the column existed."""
    try:
        return DateBasis(value) if value else None
    except ValueError:
        return None


DEFAULTED_FINISH_REASON = "defaulted_finish_date"


def _queue_defaulted_finish(db: Session, linked_event_id: str, activity_id: str) -> None:
    """Put a withheld finish date in front of a planner.

    The link itself is not in question - the event auto-linked. What needs a
    human is the date: the node is complete, and the only candidate finish date
    is the report header's, which the source never actually claimed. Resolving
    the item with "confirm" writes that date as a planner decision; "ignore"
    leaves the node complete with no Actual Finish.
    """
    existing = (
        db.query(ReviewQueueItem)
        .filter(
            ReviewQueueItem.linked_event_id == linked_event_id,
            ReviewQueueItem.reason == DEFAULTED_FINISH_REASON,
            ReviewQueueItem.status == "pending",
        )
        .first()
    )
    if existing is not None:
        return
    db.add(ReviewQueueItem(
        id=_uuid(),
        linked_event_id=linked_event_id,
        activity_id=activity_id,
        reason=DEFAULTED_FINISH_REASON,
        priority="medium",
        status="pending",
    ))


def _cross_file_conflict(prior, new_value: str, new_file) -> bool:
    """True when this write contradicts an earlier one from a different file."""
    return bool(
        prior is not None
        and prior.new_value is not None
        and prior.new_value != new_value
        and (prior.source_file or "") != (new_file or "")
    )


def _apply_rollup_to_schedule(db: Session, results,
    prov_index: Optional[EventIndex] = None,
    default_source_file: Optional[str] = None,
) -> int:
    """Write rolled-up actual progress onto the schedule.

    Called with matching.RollupAccumulator results (AUTO_LINK decisions only):

      * actual_start   — earliest reported progress date (integrity-validated)
      * actual_qty     — max(current, rolled-up installed qty); never decreases.
                         Quantity-based percent complete: 40 m of 120 m = 33%.
      * actual_finish  — written ONLY when the node is 100% complete AND a
                         source named the date. A finish that exists only
                         because the report header's date stood in for a line
                         that named none is withheld and queued for the
                         planner instead (reason "defaulted_finish_date").

    Every field change gets an immutable AuditRecord
    (source="matching", auto_applied=True).
    """
    audits = 0
    touched: set[str] = set()
    for r in results:
        act = db.query(Activity).filter(Activity.activity_id == r.activity_id).first()
        if act is None:
            continue
        before = audits
        span = r.event_texts[0] if r.event_texts else None
        start_sources = [a.describe() for a in r.start_assertions]
        finish_sources = [a.describe() for a in r.finish_assertions]

        # Provenance for each date, taken from the assertion that actually won
        # the write, so the audit row cites the exact line of the exact report
        # the value came from rather than an arbitrary contributing one.
        start_a = _assertion_for(r.start_assertions, r.actual_start)
        finish_a = _assertion_for(r.finish_assertions, r.actual_finish)
        start_ev, start_file, start_line, start_row = _origin(prov_index, start_a)
        finish_ev, finish_file, finish_line, finish_row = _origin(prov_index, finish_a)

        # Quantity and conflict notes are aggregates: several events move a
        # rolled-up quantity, and a conflict is by definition more than one
        # source. Attribute those to a single line only when a single event
        # produced them; otherwise name the file and let contributing_sources
        # carry the rest, rather than pointing at one line that is not the
        # whole story.
        all_a = r.start_assertions + r.finish_assertions
        single = all_a[0] if r.n_events == 1 and len(all_a) == 1 else None
        agg_ev, agg_file, agg_line, agg_row = _origin(prov_index, single)
        if agg_file is None:
            # No assertion at all — the value came from the report's own date
            # rather than a specific line. Name the file it was read from; the
            # line stays null because there genuinely is not one.
            agg_file = next(
                (a.source_file for a in all_a if a.source_file), None
            ) or default_source_file
        start_file = start_file or default_source_file
        finish_file = finish_file or default_source_file
        all_sources = [a.describe() for a in all_a] or None

        # Any disagreement between sources is recorded on the write it
        # affects, and surfaced on GET /schedule.
        for note in r.conflicts:
            logger.warning("Source conflict on %s: %s", r.activity_id, note)
            _write_audit(
                db, r.activity_id,
                field="source_conflict",
                old_value=None,
                new_value=note[:500],
                source="matching",
                linked_event_id=agg_ev,
                source_file=agg_file,
                source_line=agg_line,
                source_row=agg_row,
                source_span=span,
                confidence=None,
                auto_applied=False,
                model_version=MATCHING_MODEL_VERSION,
                contributing_sources=start_sources + finish_sources,
                conflict=True,
            )
            audits += 1

        # Actual Start — earliest evidence of work beginning
        if r.actual_start is not None and (
            act.actual_start is None or r.actual_start < act.actual_start
        ):
            try:
                validate_actual_start(act, r.actual_start, DATA_DATE)
            except IntegrityError as e:
                logger.warning("Integrity block on actual_start: %s", e)
            else:
                prior = _prior_write(db, r.activity_id, "actual_start")
                new_iso = r.actual_start.isoformat()
                crossed = _cross_file_conflict(prior, new_iso, start_file)
                sides = list(start_sources or [])
                if crossed:
                    sides = [
                        _describe_side(prior.new_value, prior.source_file,
                                       prior.source_line, prior.source_row),
                        _describe_side(new_iso, start_file, start_line, start_row),
                    ]
                _write_audit(
                    db, r.activity_id,
                    field="actual_start",
                    old_value=act.actual_start.isoformat() if act.actual_start else None,
                    new_value=new_iso,
                    source="matching",
                    linked_event_id=start_ev,
                    source_file=start_file,
                    source_line=start_line,
                    source_row=start_row,
                    source_span=(start_a.source_span if start_a else None) or span,
                    confidence=1.0,
                    auto_applied=True,
                    model_version=MATCHING_MODEL_VERSION,
                    contributing_sources=sides or None,
                    conflict=crossed or len({a.value for a in r.start_assertions}) > 1,
                )
                act.actual_start = r.actual_start
                act.actual_start_basis = _basis_value(r.actual_start_basis)
                audits += 1
        elif r.actual_start is not None and act.actual_start != r.actual_start:
            # The stored start wins on the earliest-evidence rule, so nothing is
            # written. A different file still asserted a different date, so the
            # disagreement is recorded rather than silently discarded.
            prior = _prior_write(db, r.activity_id, "actual_start")
            new_iso = r.actual_start.isoformat()
            if _cross_file_conflict(prior, new_iso, start_file):
                _write_audit(
                    db, r.activity_id,
                    field="source_conflict",
                    old_value=None,
                    new_value=(
                        "actual_start disagreement: kept %s, did not apply %s from %s"
                        % (act.actual_start.isoformat(), new_iso,
                           start_file or "unknown source")
                    )[:500],
                    source="matching",
                    linked_event_id=start_ev,
                    source_file=start_file,
                    source_line=start_line,
                    source_row=start_row,
                    source_span=(start_a.source_span if start_a else None) or span,
                    confidence=None,
                    auto_applied=False,
                    model_version=MATCHING_MODEL_VERSION,
                    contributing_sources=[
                        _describe_side(prior.new_value, prior.source_file,
                                       prior.source_line, prior.source_row),
                        _describe_side(new_iso, start_file, start_line, start_row),
                    ],
                    conflict=True,
                )
                audits += 1

        # Installed quantity (quantity-based percent complete lives in
        # percent_complete = actual_qty / planned_qty, computed on read)
        new_qty = r.installed_qty
        if new_qty <= 0 and r.percent_complete > 0 and act.planned_qty:
            new_qty = round(r.percent_complete / 100.0 * act.planned_qty, 3)
        if new_qty > (act.actual_qty or 0.0):
            _write_audit(
                db, r.activity_id,
                field="actual_qty",
                old_value=str(act.actual_qty) if act.actual_qty is not None else None,
                new_value=str(new_qty),
                source="matching",
                linked_event_id=agg_ev,
                source_file=agg_file,
                source_line=agg_line,
                source_row=agg_row,
                source_span=span,
                confidence=1.0,
                auto_applied=True,
                model_version=MATCHING_MODEL_VERSION,
                contributing_sources=all_sources,
            )
            act.actual_qty = new_qty
            audits += 1

        # A finish the node is entitled to by percent complete, but which no
        # source dated. It is not written: it is recorded, and put in front of
        # a planner. Writing it would stamp every completion in a report with
        # the day the report was typed.
        for reason in r.review_reasons:
            logger.info("Actual Finish withheld on %s: %s", r.activity_id, reason)
            withheld_a = (
                r.withheld_finish_assertions[0]
                if r.withheld_finish_assertions
                else None
            )
            w_ev, w_file, w_line, w_row = _origin(prov_index, withheld_a)
            _write_audit(
                db, r.activity_id,
                field="actual_finish_withheld",
                old_value=None,
                new_value=(
                    r.withheld_finish.isoformat() if r.withheld_finish else None
                ),
                source="matching",
                linked_event_id=w_ev,
                source_file=w_file or default_source_file,
                source_line=w_line,
                source_row=w_row,
                source_span=(withheld_a.source_span if withheld_a else None) or span,
                confidence=None,
                auto_applied=False,
                model_version=MATCHING_MODEL_VERSION,
                contributing_sources=[
                    a.describe() for a in r.withheld_finish_assertions
                ] or None,
            )
            audits += 1
            if w_ev:
                _queue_defaulted_finish(db, w_ev, r.activity_id)

        # Actual Finish — ONLY when the node is actually complete
        if r.is_complete and r.actual_finish is not None:
            try:
                validate_actual_finish(act, r.actual_finish)
            except IntegrityError as e:
                logger.warning("Integrity block on actual_finish: %s", e)
            else:
                if act.actual_finish != r.actual_finish:
                    prior = _prior_write(db, r.activity_id, "actual_finish")
                    new_iso = r.actual_finish.isoformat()
                    crossed = _cross_file_conflict(prior, new_iso, finish_file)
                    sides = list(finish_sources or [])
                    if crossed:
                        sides = [
                            _describe_side(prior.new_value, prior.source_file,
                                           prior.source_line, prior.source_row),
                            _describe_side(new_iso, finish_file,
                                           finish_line, finish_row),
                        ]
                    _write_audit(
                        db, r.activity_id,
                        field="actual_finish",
                        old_value=act.actual_finish.isoformat() if act.actual_finish else None,
                        new_value=new_iso,
                        source="matching",
                        linked_event_id=finish_ev,
                        source_file=finish_file,
                        source_line=finish_line,
                        source_row=finish_row,
                        source_span=(finish_a.source_span if finish_a else None) or span,
                        confidence=1.0,
                        auto_applied=True,
                        model_version=MATCHING_MODEL_VERSION,
                        contributing_sources=sides or None,
                        conflict=crossed or len({a.value for a in r.finish_assertions}) > 1,
                    )
                    act.actual_finish = r.actual_finish
                    act.actual_finish_basis = _basis_value(r.actual_finish_basis)
                    audits += 1

        act.compute_variance(DATA_DATE)
        if audits > before:
            touched.add(r.activity_id)
    return audits, touched


# ── POST /ingest ─────────────────────────────────────────────────────────────

def _event_key(event: PydanticEvent) -> tuple:
    """Identity key for duplicate-event detection across uploads."""
    prov = event.provenance
    return (prov.source_file, prov.source_line, prov.source_row, event.raw_text)


def _existing_event_keys(db: Session) -> set:
    rows = db.query(
        LinkedEvent.source_file,
        LinkedEvent.source_line,
        LinkedEvent.source_row,
        LinkedEvent.raw_text,
    ).all()
    return set(rows)


@app.post("/ingest", response_model=IngestResponse)
async def ingest_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a DPR text file or discipline spreadsheet.

    Pipeline: extraction → matching/ MatchingEngine → persistence.

      AUTO_LINK     — persist the chosen activity link, roll up actual
                      progress (Actual Finish ONLY at 100%), audit record
      REVIEW        — proposed match + confidence + alternatives + rationale
                      queued for the planner; schedule NOT mutated
      NEW_ACTIVITY  — unmatched review item; schedule NOT mutated
      REJECTED      — event + decision preserved in history only

    Duplicate uploads (identical sha256) are ignored entirely, and
    duplicate events (same source position + text) are skipped, so
    progress can never be double-written.
    """
    filename = file.filename or "unknown"
    suffix = Path(filename).suffix.lower()

    if suffix not in (".txt", ".xlsx", ".csv", ".md", ".log"):
        raise HTTPException(400, f"Unsupported file type: {suffix}")

    content = await file.read()
    content_hash = hashlib.sha256(content).hexdigest()

    # Duplicate-upload guard: identical content already ingested successfully
    previous = (
        db.query(Job)
        .filter(Job.content_hash == content_hash, Job.status == "completed")
        .first()
    )
    if previous is not None:
        return IngestResponse(
            job_id=previous.id,
            filename=previous.filename,
            status="completed",
            message=(
                f"Duplicate upload ignored — identical content already ingested "
                f"as job {previous.id}. No progress was written twice."
            ),
        )

    # Create job
    job = Job(
        id=_uuid(),
        filename=filename,
        file_type=suffix.lstrip("."),
        status="processing",
        content_hash=content_hash,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Save uploaded file to dataset directory
    upload_dir = Path(__file__).resolve().parent.parent / "dataset" / "uploads"
    upload_dir.mkdir(exist_ok=True)
    # Sanitize filename to prevent path traversal
    safe_name = Path(filename).name
    if not safe_name or safe_name.startswith("."):
        safe_name = f"upload_{_uuid()}{suffix}"
    upload_path = upload_dir / safe_name
    with open(upload_path, "wb") as f:
        f.write(content)

    # Run extraction → matching pipeline
    try:
        extractor = Extractor(schedule_path=SCHEDULE_PATH)
        result = extractor.extract(str(upload_path))

        decisions = get_matching_engine().match_events(result.events)

        # Skip events already ingested (same source position + text)
        seen = _existing_event_keys(db)
        fresh = []
        for event, decision in zip(result.events, decisions):
            key = _event_key(event)
            if key in seen:
                continue
            seen.add(key)
            fresh.append((event, decision))

        event_count = len(result.events)
        linked_count = 0
        review_count = 0
        auto_pairs = []
        # (event, linked_event.id) for every row written this call, so an
        # audit record can point back at the exact event that produced it.
        event_rows = []

        for event, decision in fresh:
            outcome = decision.outcome
            top1 = decision.top1
            committed_id = (
                decision.chosen_activity_id
                if outcome is Decision.AUTO_LINK
                else None
            )

            le = LinkedEvent(
                id=_uuid(),
                job_id=job.id,
                activity_id=committed_id,
                source_file=event.provenance.source_file,
                source_line=event.provenance.source_line,
                source_row=event.provenance.source_row,
                source_span=event.provenance.source_span,
                raw_text=event.raw_text,
                tags=json.dumps(event.tags),
                reported_date=event.reported_date,
                reported_date_basis=_basis_value(event.reported_date_basis),
                asserted_start=event.asserted_start,
                asserted_start_basis=_basis_value(event.asserted_start_basis),
                asserted_finish=event.asserted_finish,
                asserted_finish_basis=_basis_value(event.asserted_finish_basis),
                quantity=event.quantity,
                uom=event.uom,
                discipline=event.discipline.value,
                status=event.status.value if hasattr(event.status, 'value') else str(event.status),
                percentage=event.percentage,
                confidence=round(decision.confidence, 2),
                match_method=event.provenance.method.value,
                alternatives=json.dumps([c.activity_id for c in decision.candidates[:3]]),
                decision=outcome.value,
                margin=decision.margin,
                rationale=json.dumps(decision.rationale),
            )
            db.add(le)
            event_rows.append((event, le.id))

            if outcome is Decision.AUTO_LINK:
                linked_count += 1
                auto_pairs.append((event, decision))
            elif outcome is Decision.REVIEW:
                review_count += 1
                # Proposal only — the schedule is NOT touched until the
                # planner confirms via POST /review/{id}/resolve.
                db.add(ReviewQueueItem(
                    id=_uuid(),
                    linked_event_id=le.id,
                    activity_id=top1.activity_id if top1 else None,
                    reason="low_confidence",
                    priority=(
                        "high"
                        if decision.margin < MATCHING_THRESHOLDS.margin_min
                        else "medium"
                    ),
                    status="pending",
                ))
            elif outcome is Decision.NEW_ACTIVITY:
                review_count += 1
                db.add(ReviewQueueItem(
                    id=_uuid(),
                    linked_event_id=le.id,
                    activity_id=None,
                    reason="no_match",
                    priority="high",
                    status="pending",
                ))
            else:  # REJECTED — preserve event + decision in history only
                if top1 is not None:
                    _write_audit(
                        db, top1.activity_id,
                        field="event_rejected",
                        old_value=None,
                        new_value=event.raw_text[:200],
                        source="matching",
                        source_file=event.provenance.source_file,
                        source_span=event.provenance.source_span,
                        confidence=decision.confidence,
                        auto_applied=False,
                        model_version=MATCHING_MODEL_VERSION,
                    )

        # Granularity: roll many-to-one mentions into one L5/L6 node and
        # write aggregated actual progress + audit records.
        audits_written = 0
        activities_touched: set[str] = set()
        if auto_pairs:
            accumulator = RollupAccumulator(get_matching_engine())
            for event, decision in auto_pairs:
                accumulator.add(decision, event)
            audits_written, activities_touched = _apply_rollup_to_schedule(
                db,
                accumulator.results(),
                _build_event_index(event_rows),
                default_source_file=file.filename,
            )

        # Update job
        job.status = "completed"
        job.event_count = event_count
        job.linked_count = linked_count
        job.review_count = review_count
        job.activities_updated = len(activities_touched)
        job.audit_records_created = audits_written
        job.completed_at = _now()
        db.commit()

        return IngestResponse(
            job_id=job.id,
            filename=filename,
            status="completed",
            message=f"Extracted {event_count} events, {linked_count} linked, {review_count} need review",
        )

    except HTTPException:
        job.status = "failed"
        db.commit()
        raise
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(500, f"Extraction failed: {e}")


# ── GET /jobs/{id} ───────────────────────────────────────────────────────────

@app.get("/jobs", response_model=list[JobSummaryResponse])
def list_jobs(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Past ingests, newest first, without their events.

    The events array on a single job can run to hundreds of rows, so the
    history list deliberately omits it — callers that need the detail fetch
    GET /jobs/{job_id}.
    """
    jobs = (
        db.query(Job)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_job_summary(job) for job in jobs]


def _job_summary(job: Job) -> JobSummaryResponse:
    return JobSummaryResponse(
        id=job.id,
        filename=job.filename,
        file_type=job.file_type,
        status=job.status,
        event_count=job.event_count or 0,
        linked_count=job.linked_count or 0,
        review_count=job.review_count or 0,
        activities_updated=job.activities_updated or 0,
        audit_records_created=job.audit_records_created or 0,
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


@app.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    """Get extraction results and linking status for a job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    events = (
        db.query(LinkedEvent)
        .filter(LinkedEvent.job_id == job_id)
        .all()
    )

    return JobResponse(
        id=job.id,
        filename=job.filename,
        file_type=job.file_type,
        status=job.status,
        event_count=job.event_count,
        linked_count=job.linked_count,
        review_count=job.review_count,
        activities_updated=job.activities_updated or 0,
        audit_records_created=job.audit_records_created or 0,
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
        events=[
            LinkedEventResponse(
                id=le.id,
                source_file=le.source_file,
                source_line=le.source_line,
                source_row=le.source_row,
                source_span=le.source_span,
                raw_text=le.raw_text,
                tags=le.tag_list(),
                reported_date=le.reported_date,
                asserted_start=le.asserted_start,
                asserted_finish=le.asserted_finish,
                quantity=le.quantity,
                uom=le.uom,
                discipline=le.discipline,
                status=le.status,
                percentage=le.percentage,
                confidence=le.confidence,
                match_method=le.match_method,
                activity_id=le.activity_id,
                alternatives=le.alternative_list(),
                reviewed=le.reviewed,
                reviewer_action=le.reviewer_action,
                decision=le.decision,
                margin=le.margin,
                rationale=json.loads(le.rationale) if le.rationale else [],
            )
            for le in events
        ],
    )


# ── GET /review-queue ────────────────────────────────────────────────────────

@app.get("/review-queue", response_model=list[ReviewQueueItemResponse])
def get_review_queue(
    status: str = Query("pending", description="Filter by status: pending, resolved, ignored"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    db: Session = Depends(get_db),
):
    """Get items needing planner adjudication."""
    query = db.query(ReviewQueueItem).filter(ReviewQueueItem.status == status)
    if priority:
        query = query.filter(ReviewQueueItem.priority == priority)

    items = query.order_by(
        ReviewQueueItem.priority.desc(),
        ReviewQueueItem.created_at,
    ).all()

    results = []
    for item in items:
        le = db.query(LinkedEvent).filter(LinkedEvent.id == item.linked_event_id).first()
        results.append(
            ReviewQueueItemResponse(
                id=item.id,
                linked_event_id=item.linked_event_id,
                activity_id=item.activity_id,
                reason=item.reason,
                priority=item.priority,
                status=item.status,
                source_span=le.source_span if le else "",
                raw_text=le.raw_text if le else "",
                confidence=le.confidence if le else 0.0,
                tags=le.tag_list() if le else [],
                suggested_activity_id=item.activity_id,
                alternatives=le.alternative_list() if le else [],
                created_at=item.created_at,
            )
        )

    return results


# ── POST /review/{id}/resolve ────────────────────────────────────────────────

@app.post("/review/{item_id}/resolve", response_model=ResolveResponse)
def resolve_review_item(
    item_id: str,
    req: ResolveRequest,
    db: Session = Depends(get_db),
):
    """Planner resolves a review item. Actions: confirm, reassign, create, ignore.

    Every resolution persists:
      1. An AuditRecord for the activity
      2. Alias lexicon entries for training signal
    """
    item = db.query(ReviewQueueItem).filter(ReviewQueueItem.id == item_id).first()
    if not item:
        raise HTTPException(404, f"Review item {item_id} not found")

    if item.status != "pending":
        raise HTTPException(400, f"Review item already {item.status}")

    le = db.query(LinkedEvent).filter(LinkedEvent.id == item.linked_event_id).first()
    if not le:
        raise HTTPException(404, f"Linked event {item.linked_event_id} not found")

    audit_count = 0
    alias_count = 0
    target_activity_id = None

    if item.reason == DEFAULTED_FINISH_REASON:
        # A different kind of item: the link is already committed and is not in
        # question. What the planner is adjudicating is a DATE the system
        # refused to infer. Only two answers make sense, so the link-editing
        # actions are not offered here.
        return _resolve_defaulted_finish(db, item, le, req)

    if req.action == "confirm":
        # Planner confirms the current activity_id
        if not item.activity_id:
            raise HTTPException(400, "No activity_id to confirm")
        target_activity_id = item.activity_id
        # REVIEW items carry only a proposal — committing the link happens here
        if le.activity_id != target_activity_id:
            le.activity_id = target_activity_id
        le.reviewed = True
        le.reviewer_action = "confirm"
        le.reviewed_at = _now()
        item.status = "resolved"
        item.resolution = "confirm"
        item.resolved_activity_id = item.activity_id
        item.resolution_note = req.note
        item.resolved_at = _now()

        # Always create audit record for planner confirmation
        _write_audit(
            db, target_activity_id,
            field="linked_event_confirmed",
            old_value=None,
            new_value=le.raw_text[:200],
            source="planner_review",
            linked_event_id=le.id,
            source_file=le.source_file,
            source_line=le.source_line,
            source_row=le.source_row,
            source_span=le.source_span,
            confidence=le.confidence,
        )
        audit_count += 1

        # Commit the progress itself, not just the link.
        audit_count += _apply_confirmed_event_to_schedule(db, le, target_activity_id)

        # Training signal
        alias_count = _upsert_alias(db, le.raw_text, target_activity_id, le.discipline, le.tag_list())

    elif req.action == "reassign":
        if not req.activity_id:
            raise HTTPException(400, "activity_id required for reassign")

        new_activity = db.query(Activity).filter(
            Activity.activity_id == req.activity_id
        ).first()
        if not new_activity:
            raise HTTPException(404, f"Activity {req.activity_id} not found")

        old_activity_id = le.activity_id
        le.activity_id = req.activity_id
        le.reviewed = True
        le.reviewer_action = "reassign"
        le.reviewed_at = _now()
        item.status = "resolved"
        item.resolution = "reassign"
        item.resolved_activity_id = req.activity_id
        item.resolution_note = req.note
        item.resolved_at = _now()
        target_activity_id = req.activity_id

        # Audit the reassignment
        audit = _write_audit(
            db, req.activity_id,
            field="event_reassigned",
            old_value=old_activity_id,
            new_value=req.activity_id,
            source="planner_review",
            linked_event_id=le.id,
            source_file=le.source_file,
            source_line=le.source_line,
            source_row=le.source_row,
            source_span=le.source_span,
            confidence=le.confidence,
        )
        audit_count += 1

        # Commit the progress onto the reassigned activity.
        audit_count += _apply_confirmed_event_to_schedule(db, le, req.activity_id)

        # Training signal — strong signal from planner reassignment
        alias_count = _upsert_alias(db, le.raw_text, req.activity_id, le.discipline, le.tag_list())

    elif req.action == "create":
        if not req.new_activity_id or not req.new_description:
            raise HTTPException(400, "new_activity_id and new_description required for create")

        # Check for duplicate
        existing = db.query(Activity).filter(
            Activity.activity_id == req.new_activity_id
        ).first()
        if existing:
            raise HTTPException(409, f"Activity {req.new_activity_id} already exists")

        # Infer discipline from the event
        disc = le.discipline if le.discipline != "unknown" else "unknown"

        new_act = Activity(
            activity_id=req.new_activity_id,
            wbs_path="1.99.99.1",
            description=req.new_description,
            detail=f"Created by planner from: {le.raw_text[:200]}",
            discipline=disc,
            tag=le.tag_list()[0] if le.tag_list() else None,
            planned_start=le.reported_date or DATA_DATE,
            planned_finish=le.reported_date or DATA_DATE,
            predecessors="[]",
        )
        db.add(new_act)

        le.activity_id = req.new_activity_id
        le.reviewed = True
        le.reviewer_action = "create"
        le.reviewed_at = _now()
        item.status = "resolved"
        item.resolution = "create"
        item.resolved_activity_id = req.new_activity_id
        item.resolution_note = req.note
        item.resolved_at = _now()
        target_activity_id = req.new_activity_id

        audit = _write_audit(
            db, req.new_activity_id,
            field="activity_created",
            old_value=None,
            new_value=req.new_description,
            source="planner_review",
            linked_event_id=le.id,
            source_file=le.source_file,
            source_line=le.source_line,
            source_row=le.source_row,
            source_span=le.source_span,
            confidence=1.0,
        )
        audit_count += 1
        alias_count = _upsert_alias(db, le.raw_text, req.new_activity_id, le.discipline, le.tag_list())

    elif req.action == "ignore":
        le.reviewed = True
        le.reviewer_action = "ignore"
        le.reviewed_at = _now()
        item.status = "ignored"
        item.resolution = "ignore"
        item.resolution_note = req.note
        item.resolved_at = _now()

    else:
        raise HTTPException(400, f"Unknown action: {req.action}")

    db.commit()

    return ResolveResponse(
        review_item_id=item_id,
        resolution=req.action,
        activity_id=target_activity_id,
        alias_entries_created=alias_count,
        audit_records_created=audit_count,
        message=f"Review item resolved: {req.action}",
    )


def _resolve_defaulted_finish(
    db: Session, item: ReviewQueueItem, le: LinkedEvent, req: ResolveRequest
) -> ResolveResponse:
    """Resolve a withheld finish date.

    The roll-up refused to write this date because no source named it - the
    line said the work was done, and the report header's date stood in. Only a
    human can turn that into an actual:

      confirm — write the defaulted date as a planner decision. The audit row
                records source="planner_review", auto_applied=False and the
                basis DEFAULTED_TO_REPORT_DATE, so the trail still says the
                date was inferred rather than asserted.
      ignore  — leave the node complete with no Actual Finish.

    This is the same rule as D-009: a proposal only becomes an actual date
    through a planner's resolve call.
    """
    if req.action not in ("confirm", "ignore"):
        raise HTTPException(
            400,
            f"Review item {item.id} is a withheld finish date; "
            "the only actions are 'confirm' and 'ignore'",
        )

    audit_count = 0
    activity_id = item.activity_id
    proposed = le.asserted_finish or le.reported_date

    if req.action == "ignore":
        item.status = "ignored"
        item.resolution = "ignore"
        item.resolution_note = req.note
        item.resolved_at = _now()
        db.commit()
        return ResolveResponse(
            review_item_id=item.id,
            resolution="ignore",
            activity_id=activity_id,
            alias_entries_created=0,
            audit_records_created=0,
            message="Withheld finish date left unwritten",
        )

    act = db.query(Activity).filter(Activity.activity_id == activity_id).first()
    if act is None:
        raise HTTPException(404, f"Activity {activity_id} not found")
    if proposed is None:
        raise HTTPException(400, "No candidate finish date on the linked event")

    try:
        validate_actual_finish(act, proposed)
    except IntegrityError as e:
        raise HTTPException(400, f"Integrity rule blocks this finish date: {e}")

    if act.actual_finish != proposed:
        _write_audit(
            db, activity_id,
            field="actual_finish",
            old_value=act.actual_finish.isoformat() if act.actual_finish else None,
            new_value=proposed.isoformat(),
            source="planner_review",
            linked_event_id=le.id,
            source_file=le.source_file,
            source_line=le.source_line,
            source_row=le.source_row,
            source_span=le.source_span,
            confidence=le.confidence,
            auto_applied=False,
            model_version=MATCHING_MODEL_VERSION,
            contributing_sources=[
                f"{proposed.isoformat()} defaulted to the report date, "
                f"confirmed by a planner"
            ],
        )
        act.actual_finish = proposed
        # The date is now a planner's decision, but it is still an inferred
        # date and the UI must keep saying so.
        act.actual_finish_basis = DateBasis.DEFAULTED_TO_REPORT_DATE.value
        act.compute_variance(DATA_DATE)
        audit_count += 1

    item.status = "resolved"
    item.resolution = "confirm"
    item.resolved_activity_id = activity_id
    item.resolution_note = req.note
    item.resolved_at = _now()
    db.commit()

    return ResolveResponse(
        review_item_id=item.id,
        resolution="confirm",
        activity_id=activity_id,
        alias_entries_created=0,
        audit_records_created=audit_count,
        message=f"Actual Finish {proposed.isoformat()} written by planner decision",
    )


def _apply_confirmed_event_to_schedule(
    db: Session, le: LinkedEvent, activity_id: str
) -> int:
    """Roll a planner-confirmed event onto the schedule.

    A REVIEW item carries only a proposal, so nothing reaches the schedule
    until the planner adjudicates. Once they do, the confirmed event has to
    travel the same rollup + audit path an AUTO_LINK would have taken —
    otherwise confirming a review item changes a link but never a date.

    The event is replayed through the same RollupAccumulator used at ingest,
    so quantity rollup, the partial-scope guard, earliest-start/latest-finish
    precedence, and conflict capture all behave identically.
    """
    engine = get_matching_engine()
    if activity_id not in engine.index.by_id:
        return 0

    event = PydanticEvent(
        raw_text=le.raw_text,
        tags=le.tag_list(),
        reported_date=le.reported_date,
        reported_date_basis=_basis_or_none(le.reported_date_basis),
        asserted_start=le.asserted_start,
        asserted_start_basis=_basis_or_none(le.asserted_start_basis),
        asserted_finish=le.asserted_finish,
        asserted_finish_basis=_basis_or_none(le.asserted_finish_basis),
        quantity=le.quantity,
        uom=le.uom,
        discipline=Discipline(le.discipline) if le.discipline else Discipline.UNKNOWN,
        status=EventStatus(le.status) if le.status else EventStatus.UNKNOWN,
        percentage=le.percentage,
        provenance=Provenance(
            source_file=le.source_file,
            source_line=le.source_line,
            source_row=le.source_row,
            source_span=le.source_span or le.raw_text,
            method=ExtractionMethod.PREPASS,
        ),
    )
    decision = LinkDecision(
        event_index=0,
        raw_text=le.raw_text,
        source_file=le.source_file,
        outcome=Decision.AUTO_LINK,
        chosen_activity_id=activity_id,
        confidence=le.confidence,
        thresholds=MATCHING_THRESHOLDS,
    )
    accumulator = RollupAccumulator(engine)
    accumulator.add(decision, event)
    audits, _touched = _apply_rollup_to_schedule(
        db,
        accumulator.results(),
        _build_event_index([(event, le.id)]),
        default_source_file=le.source_file,
    )
    return audits


def _upsert_alias(
    db: Session,
    source_text: str,
    activity_id: str,
    discipline: str,
    tags: list[str],
) -> int:
    """Insert or update an alias lexicon entry. Returns 1 if created/updated."""
    normalized = source_text.lower().strip()[:500]
    existing = db.query(AliasLexicon).filter(
        AliasLexicon.source_text == normalized,
        AliasLexicon.mapped_activity_id == activity_id,
    ).first()

    if existing:
        existing.times_confirmed += 1
        existing.weight = min(existing.weight + 0.1, 5.0)
        existing.updated_at = _now()
    else:
        db.add(AliasLexicon(
            id=_uuid(),
            source_text=normalized,
            mapped_activity_id=activity_id,
            discipline=discipline,
            tags_extracted=json.dumps(tags),
            weight=1.0,
            times_confirmed=1,
        ))
    return 1


# ── GET /schedule ────────────────────────────────────────────────────────────

@app.get("/schedule", response_model=ScheduleResponse)
def get_schedule(
    discipline: Optional[str] = Query(None),
    include_warnings: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Get all activities with planned vs actual dates and variance.

    Enforces schedule integrity rules server-side.
    """
    query = db.query(Activity)
    if discipline:
        query = query.filter(Activity.discipline == discipline)

    activities = query.order_by(Activity.activity_id).all()
    response_activities = []
    warnings = []
    total_start_var = []
    total_finish_var = []

    # Confidence of the most recent write that set an actual date, per
    # activity. Read in one pass instead of a query per row.
    actual_date_confidence: dict[str, float] = {}
    for aid, conf in (
        db.query(AuditRecord.activity_id, AuditRecord.confidence)
        .filter(
            AuditRecord.field_changed.in_(("actual_start", "actual_finish")),
            AuditRecord.confidence.isnot(None),
        )
        .order_by(AuditRecord.timestamp.asc())
        .all()
    ):
        actual_date_confidence[aid] = conf

    for act in activities:
        # Recompute variance
        act.compute_variance(DATA_DATE)

        # Compute percent complete from linked events
        events = db.query(LinkedEvent).filter(
            LinkedEvent.activity_id == act.activity_id
        ).all()
        pct = None
        if events:
            pcts = [e.percentage for e in events if e.percentage is not None]
            if pcts:
                pct = max(pcts)

        if act.start_variance_days is not None:
            total_start_var.append(act.start_variance_days)
        if act.finish_variance_days is not None:
            total_finish_var.append(act.finish_variance_days)

        response_activities.append(
            ScheduleActivityResponse(
                activity_id=act.activity_id,
                wbs_path=act.wbs_path,
                description=act.description,
                discipline=act.discipline,
                tag=act.tag,
                planned_start=act.planned_start,
                planned_finish=act.planned_finish,
                planned_qty=act.planned_qty,
                uom=act.uom,
                actual_start=act.actual_start,
                actual_finish=act.actual_finish,
                actual_start_basis=act.actual_start_basis,
                actual_finish_basis=act.actual_finish_basis,
                actual_qty=act.actual_qty,
                start_variance_days=act.start_variance_days,
                finish_variance_days=act.finish_variance_days,
                percent_complete=pct,
                predecessors=act.predecessor_list(),
                link_confidence=(
                    actual_date_confidence.get(act.activity_id)
                    if (act.actual_start or act.actual_finish) else None
                ),
            )
        )

        # Source conflicts recorded at write time — a planner has to see
        # that two sources disagreed about this node's dates.
        if include_warnings:
            for rec in db.query(AuditRecord).filter(
                AuditRecord.activity_id == act.activity_id,
                AuditRecord.conflict.is_(True),
            ).all():
                warnings.append({
                    "activity_id": act.activity_id,
                    "field": rec.field_changed,
                    "message": rec.new_value or "source conflict",
                    "contributing_sources": json.loads(rec.contributing_sources)
                    if rec.contributing_sources else [],
                    "severity": "conflict",
                })

        # Integrity warnings
        if include_warnings and act.actual_start:
            for pred_id in act.predecessor_list():
                pred = db.query(Activity).filter(
                    Activity.activity_id == pred_id
                ).first()
                if pred and not pred.actual_start:
                    warnings.append({
                        "activity_id": act.activity_id,
                        "field": "actual_start",
                        "message": f"Predecessor {pred_id} has not started",
                        "severity": "warning",
                    })

    return ScheduleResponse(
        data_date=DATA_DATE,
        total_activities=len(activities),
        activities_with_actuals=sum(1 for a in activities if a.actual_start),
        activities_completed=sum(1 for a in activities if a.actual_finish),
        average_start_variance=round(statistics.mean(total_start_var), 1) if total_start_var else None,
        average_finish_variance=round(statistics.mean(total_finish_var), 1) if total_finish_var else None,
        integrity_warnings=warnings,
        activities=response_activities,
    )


# ── GET /schedule/{activity_id}/audit ───────────────────────────────────────

@app.get(
    "/schedule/{activity_id}/audit",
    response_model=list[AuditRecordResponse],
)
def get_activity_audit(activity_id: str, db: Session = Depends(get_db)):
    """Every recorded change to one activity, newest first.

    Read-only by construction: audit_records is append-only, so there is no
    write counterpart to this route. Returns [] for an activity that exists
    but has never been touched; 404 only when the activity itself is unknown,
    so the caller can tell "nothing recorded yet" from "no such activity".
    """
    exists = db.query(Activity).filter(
        Activity.activity_id == activity_id
    ).first()
    if exists is None:
        raise HTTPException(404, f"Unknown activity: {activity_id}")

    records = (
        db.query(AuditRecord)
        .filter(AuditRecord.activity_id == activity_id)
        .order_by(AuditRecord.timestamp.desc(), AuditRecord.created_at.desc())
        .all()
    )

    return [
        AuditRecordResponse(
            id=rec.id,
            activity_id=rec.activity_id,
            linked_event_id=rec.linked_event_id,
            timestamp=rec.timestamp,
            field_changed=rec.field_changed,
            old_value=rec.old_value,
            new_value=rec.new_value,
            source=rec.source,
            source_file=rec.source_file,
            source_line=rec.source_line,
            source_row=rec.source_row,
            source_span=rec.source_span,
            confidence=rec.confidence,
            model_version=rec.model_version,
            auto_applied=rec.auto_applied,
            contributing_sources=(
                json.loads(rec.contributing_sources)
                if rec.contributing_sources else []
            ),
            conflict=rec.conflict,
        )
        for rec in records
    ]


# ── GET /schedule/conflicts ─────────────────────────────────────────────────

def _source_kind(source_file: Optional[str]) -> str:
    """Classify a source by TYPE, which is what a planner weighs.

    Never returns anything implying the baseline: Primavera is read-only, so it
    can never be one side of a disagreement.
    """
    name = (source_file or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls") or name.endswith(".csv"):
        return "spreadsheet"
    if name.startswith("agent_session"):
        return "agent"
    if name.endswith(".txt") or name.endswith(".log") or name.endswith(".md"):
        return "daily_report"
    return "other"


@app.get("/schedule/conflicts", response_model=list[SourceConflict])
def list_source_conflicts(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Activities where two field sources disagree about the same field.

    Derived from the audit trail rather than stored: a disagreement is a write
    whose value differs from the previous write to the same field, where the
    two writes came from different files. Both values, both files and both
    line/row numbers are already recorded, so no new state is needed.

    Only field sources appear here. The Primavera baseline is read-only and is
    never written, so it cannot be a side of a conflict.
    """
    records = (
        db.query(AuditRecord)
        .filter(AuditRecord.field_changed.in_(("actual_start", "actual_finish")))
        .order_by(AuditRecord.activity_id, AuditRecord.timestamp.asc())
        .all()
    )

    activities = {a.activity_id: a for a in db.query(Activity).all()}

    # Walk each activity's writes per field, in order, and emit a conflict
    # wherever consecutive writes disagree and come from different files.
    seen: dict[tuple, AuditRecord] = {}
    conflicts: list[SourceConflict] = []
    for rec in records:
        key = (rec.activity_id, rec.field_changed)
        prior = seen.get(key)
        if _cross_file_conflict(prior, rec.new_value, rec.source_file):
            act = activities.get(rec.activity_id)
            conflicts.append(SourceConflict(
                activity_id=rec.activity_id,
                description=act.description if act else "",
                discipline=act.discipline if act else "unknown",
                field=rec.field_changed,
                sides=[
                    ConflictSide(
                        value=prior.new_value,
                        source_file=prior.source_file,
                        source_line=prior.source_line,
                        source_row=prior.source_row,
                        source_kind=_source_kind(prior.source_file),
                    ),
                    ConflictSide(
                        value=rec.new_value,
                        source_file=rec.source_file,
                        source_line=rec.source_line,
                        source_row=rec.source_row,
                        source_kind=_source_kind(rec.source_file),
                    ),
                ],
                stored_value=(
                    (act.actual_start.isoformat() if act and act.actual_start else None)
                    if rec.field_changed == "actual_start"
                    else (act.actual_finish.isoformat() if act and act.actual_finish else None)
                ),
                detected_at=rec.timestamp,
            ))
        seen[key] = rec

    # Newest disagreement first.
    conflicts.sort(key=lambda c: c.detected_at, reverse=True)
    return conflicts[:limit]


# ── GET /audit/recent ───────────────────────────────────────────────────────

@app.get("/audit/recent", response_model=list[AuditFeedItem])
def recent_audit(
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """The newest audit writes across every activity, newest first.

    The per-activity route serves the Schedule drawer; this one exists so a
    dashboard can show recent activity without fetching all 120 activities.
    """
    records = (
        db.query(AuditRecord)
        .order_by(AuditRecord.timestamp.desc(), AuditRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        AuditFeedItem(
            id=rec.id,
            activity_id=rec.activity_id,
            field_changed=rec.field_changed,
            old_value=rec.old_value,
            new_value=rec.new_value,
            source=rec.source,
            source_file=rec.source_file,
            source_line=rec.source_line,
            source_row=rec.source_row,
            confidence=rec.confidence,
            auto_applied=rec.auto_applied,
            conflict=rec.conflict,
            timestamp=rec.timestamp,
        )
        for rec in records
    ]


# ── POST /schedule/export ───────────────────────────────────────────────────

@app.post("/schedule/export", response_model=ExportResponse)
def export_schedule(
    req: ExportRequest,
    db: Session = Depends(get_db),
):
    """Export schedule in PMXML format (XER as stretch goal)."""
    query = db.query(Activity)
    if req.filter_discipline:
        query = query.filter(Activity.discipline == req.filter_discipline)

    activities = query.order_by(Activity.activity_id).all()

    if req.format == "pmxml":
        content = _generate_pmxml(activities, req.include_actuals)
        filename = f"schedule_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xml"
    elif req.format == "xer":
        content = _generate_xer(activities, req.include_actuals)
        filename = f"schedule_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xer"
    else:
        raise HTTPException(400, f"Unknown format: {req.format}")

    # Save to uploads for download
    upload_dir = Path(__file__).resolve().parent.parent / "dataset" / "uploads"
    upload_dir.mkdir(exist_ok=True)
    export_path = upload_dir / filename
    with open(export_path, "w", encoding="utf-8") as f:
        f.write(content)

    return ExportResponse(
        format=req.format,
        filename=filename,
        activity_count=len(activities),
        content_type="application/xml",
        download_url=f"/uploads/{filename}",
    )


def _generate_pmxml(activities: list[Activity], include_actuals: bool) -> str:
    """Generate Primavera PMXML format."""
    import html as html_mod

    # PMXML namespace
    ns = "http://www.oracle.com/projectmanagement/xmlns"
    ET.register_namespace("", ns)

    project = ET.Element("Project")
    project.set("Name", "OIL Well-Site Duliajan")
    project.set("StartDate", "2026-06-01")
    project.set("FinishDate", "2026-09-30")

    # WBS
    wbs_elem = ET.SubElement(project, "WBS")

    # Activities
    acts_elem = ET.SubElement(project, "Activities")

    for act in activities:
        act_elem = ET.SubElement(acts_elem, "Activity")
        act_elem.set("ActivityID", act.activity_id)
        act_elem.set("ActivityName", html_mod.escape(act.description[:100]))

        # Status
        if act.actual_finish:
            act_elem.set("Status", "Completed")
        elif act.actual_start:
            act_elem.set("Status", "InProgress")
        else:
            act_elem.set("Status", "NotStarted")

        # Dates
        ds = ET.SubElement(act_elem, "StartDate")
        ds.text = act.planned_start.isoformat()
        df = ET.SubElement(act_elem, "FinishDate")
        df.text = act.planned_finish.isoformat()

        if include_actuals and act.actual_start:
            ads = ET.SubElement(act_elem, "ActualStartDate")
            ads.text = act.actual_start.isoformat()
        if include_actuals and act.actual_finish:
            adf = ET.SubElement(act_elem, "ActualFinishDate")
            adf.text = act.actual_finish.isoformat()

        # Relationships
        for pred_id in act.predecessor_list():
            rel = ET.SubElement(act_elem, "Predecessor")
            rel.set("ActivityID", pred_id)
            rel.set("Type", "FS")  # Finish-to-Start
            rel.set("Lag", "0d")

        # Resource
        res = ET.SubElement(act_elem, "ResourceID")
        res.text = act.discipline

    # Pretty print
    ET.indent(project, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(project, encoding="unicode")


def _generate_xer(activities: list[Activity], include_actuals: bool) -> str:
    """Generate Oracle XER format (stretch goal — simplified)."""
    lines = [
        "ER!!!\tER 22.12\tXER Export",
        "T\tPROJECT\tPRJ\tPROJID\tprj-001",
        "T\tPROJECT\tPRJ\tproj_short_name\tOIL-DULIAJAN",
        "T\tPROJECT\tPRJ\tproj_name\tOIL Well-Site Duliajan",
        "",
    ]

    for act in activities:
        status = "TK Completed" if act.actual_finish else ("TK In Progress" if act.actual_start else "TK Not Started")
        lines.extend([
            f"T\tACTIVITY\tACT\tact_id\t{act.activity_id}",
            f"T\tACTIVITY\tACT\tactivity_name\t{act.description[:80]}",
            f"T\tACTIVITY\tACT\tstatus\t{status}",
            f"T\tACTIVITY\tACT\ttarget_start_date\t{act.planned_start.strftime('%d-%b-%y').upper()}",
            f"T\tACTIVITY\tACT\ttarget_end_date\t{act.planned_finish.strftime('%d-%b-%y').upper()}",
        ])
        if include_actuals and act.actual_start:
            lines.append(f"T\tACTIVITY\tACT\tact_start_date\t{act.actual_start.strftime('%d-%b-%y').upper()}")
        if include_actuals and act.actual_finish:
            lines.append(f"T\tACTIVITY\tACT\tact_end_date\t{act.actual_finish.strftime('%d-%b-%y').upper()}")
        lines.append("")

        for pred_id in act.predecessor_list():
            lines.extend([
                f"T\tFUNCDD\tREL\tproject_id\tprj-001",
                f"T\tFUNCDD\tREL\tpredecessor_act_id\t{pred_id}",
                f"T\tFUNCDD\tREL\tsuccessor_act_id\t{act.activity_id}",
                f"T\tFUNCDD\tREL\trelationship_type\tSS",
                f"T\tFUNCDD\tREL\tlag\t0d",
            ])
            lines.append("")

    return "\n".join(lines)


# ── POST /admin/reset ───────────────────────────────────────────────────────

@app.post("/admin/reset")
def admin_reset(dpr_only: bool = Query(False)):
    """Reset the demo database to its seeded state.

    Off unless NAVIS_ENABLE_RESET=1 is set, because it destroys every ingest,
    review decision and audit record. It exists so a rehearsal can be restarted
    in one call without stopping the server; it is not something to leave
    reachable by accident.
    """
    if os.environ.get("NAVIS_ENABLE_RESET") != "1":
        raise HTTPException(
            404,
            "Reset is disabled. Start the server with NAVIS_ENABLE_RESET=1 to "
            "enable it, or run: python scripts/reset_demo.py",
        )

    from server.demo import reset_demo

    try:
        summary = reset_demo(dpr_only=dpr_only)
    except Exception as e:                                   # noqa: BLE001
        logger.exception("Demo reset failed")
        raise HTTPException(500, f"Reset failed: {e}") from e

    # The per-file detail is useful in a terminal, not over HTTP.
    summary.pop("files", None)
    return summary


# ── Field supervisor ────────────────────────────────────────────────────────

# Everything submitted through the conversational agent belongs to the field
# supervisor. There is no user table and authentication is out of scope, so
# this is the scope marker: it is stable, it is already stored, and it cannot
# accidentally include a planner's own edits.
FIELD_MATCH_METHOD = "agent_turn"


def _report_reference(event) -> str:
    """A short human reference for one submitted report."""
    stamp = (event.created_at or _now()).strftime("%Y-%m-%d")
    return f"FR-{stamp}-{event.id[:4].upper()}"


def _report_status(review) -> str:
    """The status the supervisor sees, from the planner's own state."""
    if review is None:
        return "Processing"
    if review.status == "resolved":
        return "Rejected" if review.resolution == "ignore" else "Confirmed"
    if review.clarification_question and not review.clarification_response:
        return "Needs Information"
    return "Processing"


def _field_events(db: Session):
    """This supervisor's submissions, newest first, with their review item."""
    events = (
        db.query(LinkedEvent)
        .filter(LinkedEvent.match_method == FIELD_MATCH_METHOD)
        .order_by(LinkedEvent.created_at.desc())
        .all()
    )
    if not events:
        return []
    reviews = {
        r.linked_event_id: r
        for r in db.query(ReviewQueueItem)
        .filter(ReviewQueueItem.linked_event_id.in_([e.id for e in events]))
        .all()
    }
    return [(e, reviews.get(e.id)) for e in events]


@app.get("/field/reports", response_model=list[FieldReportResponse])
def field_reports(db: Session = Depends(get_db)):
    """This supervisor's own submission history, newest first.

    Read-only, and deliberately scoped: it never returns another reporter's
    updates. Ingested DPRs and spreadsheet rows are not "his reports" and do
    not appear here.
    """
    activities = {a.activity_id: a for a in db.query(Activity).all()}
    out = []
    for event, review in _field_events(db):
        matched = activities.get(event.activity_id)
        out.append(FieldReportResponse(
            id=event.id,
            reference=_report_reference(event),
            raw_text=event.raw_text,
            submitted_at=event.created_at or _now(),
            location=None,
            discipline=event.discipline if event.discipline != "unknown" else None,
            discipline_label=(
                discipline_label(event.discipline)
                if event.discipline in DISCIPLINE_VALUES else None
            ),
            status=_report_status(review),
            matched_activity_id=event.activity_id,
            matched_activity_description=matched.description if matched else None,
            confidence=event.confidence or 0.0,
            review_item_id=review.id if review else None,
            clarification_question=review.clarification_question if review else None,
            clarification_response=review.clarification_response if review else None,
        ))
    return out


@app.get("/field/clarifications", response_model=list[ClarificationResponse])
def field_clarifications(
    unanswered_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Questions the Planning Engineer put back to this supervisor."""
    out = []
    for event, review in _field_events(db):
        if review is None or not review.clarification_question:
            continue
        answered = bool(review.clarification_response)
        if unanswered_only and answered:
            continue
        out.append(ClarificationResponse(
            id=review.id,
            review_item_id=review.id,
            reference=_report_reference(event),
            original_text=event.raw_text,
            question=review.clarification_question,
            asked_by=review.clarification_asked_by or "Priya Das",
            asked_at=review.clarification_asked_at or review.created_at or _now(),
            answered=answered,
            response=review.clarification_response,
            answered_at=review.clarification_answered_at,
            matched_activity_id=event.activity_id,
        ))
    return out


@app.post("/field/clarifications/{item_id}/respond",
          response_model=ClarificationResponse)
def answer_clarification(
    item_id: str,
    req: ClarificationAnswerRequest,
    db: Session = Depends(get_db),
):
    """Answer one clarification.

    Idempotent: answering twice keeps the first answer rather than appending a
    second. Writes no schedule data, confirms no match and creates no activity
    — it hands the item back to the Planning Engineer, who still decides.
    """
    review = db.query(ReviewQueueItem).filter(ReviewQueueItem.id == item_id).first()
    if review is None or not review.clarification_question:
        raise HTTPException(404, f"No clarification found for item {item_id}")

    event = db.query(LinkedEvent).filter(
        LinkedEvent.id == review.linked_event_id).first()

    if not review.clarification_response:
        review.clarification_response = req.response.strip()
        review.clarification_answered_at = _now()
        db.commit()
        db.refresh(review)

    return ClarificationResponse(
        id=review.id,
        review_item_id=review.id,
        reference=_report_reference(event) if event else review.id[:8],
        original_text=event.raw_text if event else "",
        question=review.clarification_question,
        asked_by=review.clarification_asked_by or "Priya Das",
        asked_at=review.clarification_asked_at or review.created_at or _now(),
        answered=True,
        response=review.clarification_response,
        answered_at=review.clarification_answered_at,
        matched_activity_id=event.activity_id if event else None,
    )


@app.post("/review/{item_id}/clarify", response_model=ClarificationResponse)
def ask_clarification(
    item_id: str,
    req: ClarificationAskRequest,
    db: Session = Depends(get_db),
):
    """Planner side: ask the supervisor a question about a queued item.

    Exists so the loop can be closed end to end. It does not resolve the item,
    change its activity, or touch the schedule.
    """
    review = db.query(ReviewQueueItem).filter(ReviewQueueItem.id == item_id).first()
    if review is None:
        raise HTTPException(404, f"Review item {item_id} not found")

    review.clarification_question = req.question.strip()
    review.clarification_asked_by = req.asked_by
    review.clarification_asked_at = _now()
    review.clarification_response = None
    review.clarification_answered_at = None
    db.commit()
    db.refresh(review)

    event = db.query(LinkedEvent).filter(
        LinkedEvent.id == review.linked_event_id).first()
    return ClarificationResponse(
        id=review.id,
        review_item_id=review.id,
        reference=_report_reference(event) if event else review.id[:8],
        original_text=event.raw_text if event else "",
        question=review.clarification_question,
        asked_by=review.clarification_asked_by,
        asked_at=review.clarification_asked_at,
        answered=False,
        matched_activity_id=event.activity_id if event else None,
    )


# ── GET /memory/query ────────────────────────────────────────────────────────

@app.get("/memory/query", response_model=MemoryQueryResponse)
def memory_query(
    query_type: str = Query("all", description="duration_distribution / productivity / delay_reasons / suggested_duration / all"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type prefix"),
    discipline: Optional[str] = Query(None, description="Filter by discipline"),
    db: Session = Depends(get_db),
):
    """Institutional memory queries.

    Returns:
    - Actual vs planned duration distribution per activity type
    - Discipline-wise productivity
    - Recurring delay reason frequency
    - Suggested duration for a given activity type
    """
    activities = db.query(Activity).all()

    result = MemoryQueryResponse(
        query_type=query_type,
        computed_at=_now(),
    )

    if query_type in ("duration_distribution", "all"):
        result.duration_distribution = _compute_duration_distribution(activities, activity_type)

    if query_type in ("productivity", "all"):
        result.productivity = _compute_productivity(activities, discipline)

    if query_type in ("delay_reasons", "all"):
        result.delay_reasons = _compute_delay_reasons(activities, db)

    if query_type in ("suggested_duration", "all"):
        result.suggested_duration = _compute_suggested_duration(activities, activity_type)

    return result


def _compute_duration_distribution(
    activities: list[Activity], activity_type_filter: Optional[str] = None
) -> list[DurationDistribution]:
    """Group activities by type prefix, compute planned/actual duration stats."""
    groups: dict[str, list[dict]] = defaultdict(list)

    for act in activities:
        # Extract type prefix: PIP-SPL from PIP-SPL-1025
        parts = act.activity_id.split("-")
        if len(parts) >= 2:
            type_key = f"{parts[0]}-{parts[1]}"
        else:
            type_key = parts[0]

        if activity_type_filter and not type_key.startswith(activity_type_filter):
            continue

        planned_days = (act.planned_finish - act.planned_start).days
        actual_days = None
        if act.actual_start and act.actual_finish:
            actual_days = (act.actual_finish - act.actual_start).days

        groups[type_key].append({
            "planned_days": planned_days,
            "actual_days": actual_days,
        })

    results = []
    for type_key, data in sorted(groups.items()):
        planned_days_list = [d["planned_days"] for d in data]
        actual_days_list = [d["actual_days"] for d in data if d["actual_days"] is not None]

        results.append(DurationDistribution(
            activity_type=type_key,
            count=len(data),
            actuals_count=len(actual_days_list),
            planned_mean_days=round(statistics.mean(planned_days_list), 1),
            actual_mean_days=round(statistics.mean(actual_days_list), 1) if actual_days_list else None,
            planned_min_days=min(planned_days_list),
            planned_max_days=max(planned_days_list),
        ))

    return results


def _compute_productivity(
    activities: list[Activity], discipline_filter: Optional[str] = None
) -> list[ProductivityMetric]:
    """Compute per-discipline productivity metrics."""
    disc_groups: dict[str, list[Activity]] = defaultdict(list)

    for act in activities:
        disc = act.discipline
        if discipline_filter and disc != discipline_filter:
            continue
        disc_groups[disc].append(act)

    results = []
    for disc, acts in sorted(disc_groups.items()):
        completed = [a for a in acts if a.actual_finish]
        planned_days = [(a.planned_finish - a.planned_start).days for a in acts]
        actual_days = [(a.actual_finish - a.actual_start).days for a in completed if a.actual_start]

        # Compute qty/day productivity for activities with quantities
        qty_per_days = []
        for a in completed:
            if a.actual_qty and a.actual_qty > 0 and a.actual_start and a.actual_finish:
                days = (a.actual_finish - a.actual_start).days
                if days > 0:
                    qty_per_days.append(a.actual_qty / days)

        results.append(ProductivityMetric(
            discipline=disc,
            total_activities=len(acts),
            completed=len(completed),
            average_planned_days=round(statistics.mean(planned_days), 1) if planned_days else 0,
            average_actual_days=round(statistics.mean(actual_days), 1) if actual_days else None,
            average_qty_per_day=round(statistics.mean(qty_per_days), 2) if qty_per_days else None,
        ))

    return results


def _compute_delay_reasons(
    activities: list[Activity], db: Session
) -> list[DelayReason]:
    """Extract delay reasons from audit records and review notes."""
    # Look at audit records for activities that were delayed
    reasons: dict[str, list[str]] = defaultdict(list)

    # Check audit records mentioning delays
    audit_records = db.query(AuditRecord).all()
    for ar in audit_records:
        if ar.field_changed in ("actual_start", "actual_finish") and ar.source_span:
            # Extract delay reasons from source spans
            text = ar.source_span.lower()
            for reason_kw in [
                "crane breakdown", "rain delay", "piling rig breakdown",
                "fencing conflict", "holiday delay", "crane issue",
                "material delay", "labour shortage", "design change",
                "weather", "monsoon", "flooding",
            ]:
                if reason_kw in text:
                    reasons[reason_kw].append(ar.activity_id)

    # Also check review resolution notes
    review_items = db.query(ReviewQueueItem).filter(
        ReviewQueueItem.resolution_note.isnot(None)
    ).all()
    for item in review_items:
        if item.resolution_note:
            text = item.resolution_note.lower()
            for reason_kw in reasons.keys():
                if reason_kw in text:
                    reasons[reason_kw].append(item.resolved_activity_id or "")

    # Finish slip per activity, so a cause can report the days behind it.
    slip_by_activity = {
        a.activity_id: a.finish_variance_days
        for a in activities
        if a.finish_variance_days and a.finish_variance_days > 0
    }

    results = []
    for reason, act_ids in sorted(reasons.items(), key=lambda x: -len(x[1])):
        affected = {a for a in act_ids if a}
        results.append(DelayReason(
            reason=reason,
            frequency=len(act_ids),
            affected_activities=sorted(affected)[:10],
            days_lost=sum(slip_by_activity.get(a, 0) for a in affected),
        ))

    # Frequency first, then the days behind it — a cause that recurs often but
    # costs nothing ranks below one that recurs less and costs weeks.
    results.sort(key=lambda r: (-r.frequency, -r.days_lost))
    return results


def _compute_suggested_duration(
    activities: list[Activity], activity_type: Optional[str] = None
) -> Optional[SuggestedDuration]:
    """Suggest duration for a given activity type based on historical actuals."""
    if not activity_type:
        # Default to the most common type
        activity_type = "PIP-SPL"

    # Find all activities matching the pattern
    matching = []
    for act in activities:
        if act.activity_id.startswith(activity_type):
            matching.append(act)

    if not matching:
        return None

    planned_days = [(a.planned_finish - a.planned_start).days for a in matching]
    actual_days = []
    for a in matching:
        if a.actual_start and a.actual_finish:
            actual_days.append((a.actual_finish - a.actual_start).days)

    median_planned = statistics.median(planned_days)
    median_actual = statistics.median(actual_days) if actual_days else None
    p80_actual = None
    if actual_days:
        sorted_actuals = sorted(actual_days)
        p80_idx = int(len(sorted_actuals) * 0.8)
        p80_actual = sorted_actuals[min(p80_idx, len(sorted_actuals) - 1)]

    recommendation = f"For {activity_type} activities, "
    if len(actual_days) < 2:
        # One completed activity is an anecdote, not a pattern, and the
        # dataset contains same-day activities that would otherwise produce a
        # 0-day "recommendation".
        recommendation = (
            f"Not enough completed {activity_type} activities yet — "
            f"{len(actual_days)} of {len(matching)} have actual dates. "
            f"Planned duration is {median_planned}d."
        )
        median_actual = None
        p80_actual = None
    elif median_actual is not None:
        if median_actual > median_planned:
            recommendation += f"actual median ({median_actual}d) exceeds planned ({median_planned}d). "
            recommendation += f"Consider revising planned duration to {median_actual}d or using P80 ({p80_actual}d)."
        else:
            recommendation += f"actual median ({median_actual}d) is within planned ({median_planned}d). Current estimates are adequate."
    else:
        recommendation += f"no actuals available yet. Planned duration is {median_planned}d."

    return SuggestedDuration(
        activity_type_pattern=activity_type,
        sample_size=len(matching),
        actuals_count=len(actual_days),
        median_planned_days=median_planned,
        median_actual_days=median_actual,
        p80_actual_days=p80_actual,
        recommendation=recommendation,
    )


# ── POST /agent/turn ─────────────────────────────────────────────────────────

@app.post("/agent/turn", response_model=AgentTurnResponse)
def agent_turn(
    req: AgentTurnRequest,
    db: Session = Depends(get_db),
):
    """One turn of the conversational logging agent.

    Slot-filling, propose-never-write. Structured context the client already
    knows (project, work front, discipline, data date) arrives on the request
    rather than as a fake supervisor message, so the transcript stays a record
    of what a person actually said.

    Nothing is persisted until `confirm` is true, and even then the schedule is
    untouched: a confirmed turn creates a LinkedEvent and one review item for
    the Planning Engineer, who alone can apply an actual date.
    """
    session_id = req.session_id or str(uuid.uuid4())
    context = _context_from_request(req.context)

    existing_turns = (
        db.query(ConversationTurn)
        .filter(ConversationTurn.session_id == session_id)
        .order_by(ConversationTurn.turn_number.desc())
        .limit(1)
        .all()
    )
    if existing_turns:
        prev_turn = existing_turns[0]
        slots = SlotState(**json.loads(prev_turn.slots_filled))
        turn_number = prev_turn.turn_number + 1
    else:
        slots = SlotState()
        turn_number = 1

    _apply_context(slots, context)

    clarification = None
    if req.message:
        # The first substantive message is the description: it carries the
        # activity, and it is what the matcher is run against later.
        if slots.description is None:
            slots.description = req.message.strip() or None
        clarification = _fill_slots(slots, req.message, context, db)

    awaiting_confirmation = False
    review_item_id = None
    event_created = False
    linked_event_id = None
    confidence = 0.0
    choices = None

    pending_slot = _next_missing(slots)
    pending = [pending_slot] if pending_slot else []

    if clarification:
        # A value was offered but could not be read. Ask about the same slot
        # again rather than moving on with a hole in the record.
        agent_msg = clarification
        slots.ask_count = slots.ask_count + 1 if slots.asked_slot == pending_slot else 1
        slots.asked_slot = pending_slot
        choices = choices_for(pending_slot) if pending_slot else None
    elif pending_slot:
        agent_msg = question_for(pending_slot, countable_noun=_countable_noun(slots))
        slots.ask_count = slots.ask_count + 1 if slots.asked_slot == pending_slot else 1
        slots.asked_slot = pending_slot
        choices = choices_for(pending_slot)
    else:
        slots.asked_slot = None
        slots.ask_count = 0
        # Every required slot is present. The real matcher decides the
        # activity and the confidence; neither is ever hardcoded.
        _match_slots(slots, session_id)

        if not req.confirm:
            confidence = slots.confidence or 0.0
            awaiting_confirmation = True
            agent_msg = "I have enough to prepare the update."
        else:
            existing = _existing_agent_submission(db, session_id)
            if existing is not None:
                # Idempotent: a double tap on CONFIRM & SUBMIT, or a retried
                # request, must not create a second event or a second review
                # item for the planner to work through.
                linked_event_id, review_item_id = existing
                event_created = True
                confidence = slots.confidence or 0.0
                agent_msg = (
                    "Sent for Planning Engineer review. The schedule has not "
                    "been changed yet."
                )
            else:
                event_id, review_id = _create_event_from_slots(slots, session_id, db)
                confidence = slots.confidence or 0.0
                if event_id:
                    event_created = True
                    linked_event_id = event_id
                    review_item_id = review_id
                    agent_msg = (
                        "Sent for Planning Engineer review. The schedule has "
                        "not been changed yet."
                    )
                else:
                    agent_msg = "Could not record the update. Please try again."
                    confidence = 0.0

    turn = ConversationTurn(
        id=_uuid(),
        session_id=session_id,
        turn_number=turn_number,
        slots_filled=slots.model_dump_json(),
        pending_slots=json.dumps(pending),
        user_message=req.message,
        extracted_intent=_extract_intent(req.message),
        agent_response=agent_msg,
        event_created=event_created,
        linked_event_id=linked_event_id,
    )
    db.add(turn)
    db.commit()

    return AgentTurnResponse(
        session_id=session_id,
        turn_number=turn_number,
        agent_message=agent_msg,
        slots=slots,
        pending_slots=pending,
        event_created=event_created,
        linked_event_id=linked_event_id,
        confidence=confidence,
        awaiting_confirmation=awaiting_confirmation,
        activity_description=slots.activity_description,
        match_outcome=slots.match_outcome,
        review_item_id=review_item_id,
        # Labels, never raw enum values: a supervisor must not see
        # "static_equipment" on a phone.
        discipline_label=discipline_label(slots.discipline),
        status_label=STATUS_LABELS.get(slots.status) if slots.status else None,
        choices=choices,
    )


def _existing_agent_submission(db: Session, session_id: str):
    """The (linked_event_id, review_item_id) already submitted for a session.

    Agent events are filed under a per-session job, so one session can only
    ever hold one submission. Returns None when nothing has been submitted.
    """
    job = db.query(Job).filter(Job.filename == f"agent_session_{session_id}").first()
    if job is None:
        return None
    event = (
        db.query(LinkedEvent)
        .filter(LinkedEvent.job_id == job.id)
        .order_by(LinkedEvent.id)
        .first()
    )
    if event is None:
        return None
    review = (
        db.query(ReviewQueueItem)
        .filter(ReviewQueueItem.linked_event_id == event.id)
        .first()
    )
    return event.id, (review.id if review else None)


def _fill_slots(
    slots: SlotState,
    message: str,
    context: AgentContext,
    db: Session,
    *,
    llm_backend=None,
) -> Optional[str]:
    """Read everything possible out of one message.

    Returns a clarification to ask instead of the normal next question, or
    None. The order matters: the message is first read as an answer to the
    question just asked, because a bare "Electrical" or "yesterday" only means
    anything in that light. General extraction runs afterwards, so a message
    that both answers and adds detail contributes everything it can.
    """
    answering = slots.asked_slot
    clarification: Optional[str] = None
    data_date = context.resolved_data_date(DATA_DATE)

    # ── the answer to our own question, first ──
    if answering == "discipline" and slots.discipline is None:
        slots.discipline = parse_discipline(message, as_answer=True)
    elif answering == "status" and slots.status is None:
        slots.status = parse_status(message)
    elif answering in ("date",) and slots.date is None:
        try:
            slots.date = parse_date(message, data_date)
        except InvalidDate as e:
            clarification = f"That date cannot be right ({e}). Which date was it completed?"
    elif answering in ("quantity", "planned_quantity"):
        parsed = parse_quantity(message)
        if parsed is None:
            clarification = (
                "I did not catch the numbers. How many are done, and how many "
                "were planned in total?"
            )
        else:
            _merge_quantity(slots, parsed)
    elif answering == "location" and slots.location is None:
        # Any answer to "where" is a location; the supervisor knows the site
        # better than a pattern does.
        text = message.strip()
        if text:
            slots.location = text[:120]

    # ── optional LLM interpretation, then general extraction ──
    suggestion = agent_llm.interpret(message, backend=llm_backend)
    if suggestion is not None:
        if slots.discipline is None and suggestion.discipline:
            slots.discipline = suggestion.discipline
        if slots.status is None and suggestion.status:
            slots.status = suggestion.status
        if not slots.tags and suggestion.tags:
            slots.tags = suggestion.tags
        if suggestion.activity_description and not slots.activity_description:
            slots.activity_description = suggestion.activity_description

    if slots.discipline is None:
        slots.discipline = parse_discipline(message)
    if slots.status is None:
        slots.status = parse_status(message)
    if not slots.tags:
        found = parse_tags(message)
        if found:
            slots.tags = found
    if slots.date is None:
        try:
            found_date = parse_date(message, data_date)
        except InvalidDate:
            found_date = None
        if found_date is not None:
            slots.date = found_date
    if slots.quantity is None or slots.planned_quantity is None:
        parsed = parse_quantity(message)
        if parsed is not None and answering not in ("quantity", "planned_quantity"):
            _merge_quantity(slots, parsed)

    # An activity code typed by the supervisor is not a picker; it is a hint.
    # The matcher still decides.
    if slots.activity_id is None:
        m = re.search(r"\b([A-Z]{2,3}-[A-Z]{2,4}-\d{3,4})\b", message)
        if m:
            slots.activity_id = m.group(1)

    return clarification


def _merge_quantity(slots: SlotState, parsed) -> None:
    """Fold a parsed quantity into the slots, keeping both numbers."""
    if parsed.completed is not None and slots.quantity is None:
        slots.quantity = parsed.completed
    if parsed.planned is not None and slots.planned_quantity is None:
        slots.planned_quantity = parsed.planned
    if parsed.uom and not slots.uom:
        slots.uom = parsed.uom
    if (
        slots.quantity is not None
        and slots.planned_quantity is not None
        and slots.quantity > slots.planned_quantity
    ):
        # Kept as reported and surfaced, not clamped.
        slots.quantity_over_planned = True


def _context_from_request(req_context) -> AgentContext:
    """Turn the optional request context into the parser's context object."""
    if req_context is None:
        return AgentContext()
    discipline = req_context.discipline
    if discipline is not None and discipline not in DISCIPLINE_VALUES:
        # A context value is machine-supplied, so a bad one is a caller bug.
        raise HTTPException(400, f"Unknown discipline in context: {discipline!r}")
    return AgentContext(
        project_code=req_context.project_code,
        location=req_context.location,
        discipline=discipline,
        data_date=req_context.data_date,
        timezone=req_context.timezone,
    )


def _apply_context(slots: SlotState, context: AgentContext) -> None:
    """Seed slots the client already knows, without inventing a message."""
    if slots.discipline is None and context.discipline:
        slots.discipline = context.discipline
    if slots.location is None and context.location:
        slots.location = context.location


def _quantity_relevant(slots: SlotState) -> bool:
    """Whether a quantity is worth asking for on this update.

    Only when the supervisor named a countable plural. A milestone such as a
    safety induction has no quantity, and asking for one is noise.
    """
    text = " ".join(filter(None, (slots.description, slots.activity_description)))
    return mentions_countable(text)


def _countable_noun(slots: SlotState) -> str:
    text = (slots.description or "").lower()
    for noun in ("spool", "flange", "panel", "joint", "pile", "valve",
                 "instrument", "loop", "light", "support", "pedestal"):
        if re.search(rf"\b{noun}s?\b", text):
            return noun + "s"
    return "units"


def _next_missing(slots: SlotState) -> Optional[str]:
    """The one slot to ask about next, or None when the update is complete.

    Asked in the order a supervisor would volunteer them. A slot the agent has
    already asked about twice without success is skipped: asking a third time
    is a loop, and the planner can fill it in.
    """
    order = ["discipline", "location", "status", "date"]
    for name in order:
        if getattr(slots, name) is None:
            if slots.asked_slot == name and slots.ask_count >= 2:
                continue
            return name
    if _quantity_relevant(slots):
        if slots.quantity is None:
            if not (slots.asked_slot == "quantity" and slots.ask_count >= 2):
                return "quantity"
        elif slots.planned_quantity is None:
            if not (slots.asked_slot == "planned_quantity" and slots.ask_count >= 2):
                return "planned_quantity"
    return None


def _extract_intent(message: str) -> str:
    """Simple intent extraction from user message."""
    msg_lower = message.lower()
    if any(w in msg_lower for w in ["complete", "done", "finished"]):
        return "progress_update_completion"
    elif any(w in msg_lower for w in ["started", "begin"]):
        return "progress_update_start"
    elif any(w in msg_lower for w in ["delay", "behind", "problem"]):
        return "delay_report"
    else:
        return "progress_update"


def _match_slots(slots: SlotState, session_id: str) -> None:
    """Run the real matching engine over the filled slots.

    Sets `activity_id`, `activity_description`, `confidence` and
    `match_outcome` on the slots. This is the only place the agent path decides
    an activity — the supervisor never picks one, which is the whole point of
    the product. A low confidence is reported as-is and routed to review rather
    than smoothed over.
    """
    engine = get_matching_engine()

    event = PydanticEvent(
        raw_text=slots.description or "progress update",
        tags=slots.tags or [],
        reported_date=slots.date,
        quantity=slots.quantity,
        uom=slots.uom,
        discipline=(
            Discipline(slots.discipline) if slots.discipline else Discipline.UNKNOWN
        ),
        status=EventStatus(slots.status) if slots.status else EventStatus.UNKNOWN,
        percentage=None,
        provenance=Provenance(
            source_file=f"agent_session_{session_id}",
            source_span=slots.description or "",
            method=ExtractionMethod.PREPASS,
        ),
    )

    decision = engine.match_event(event)
    top = decision.top1

    slots.match_outcome = decision.outcome.value
    slots.confidence = round(decision.confidence, 3)
    slots.alternatives = [c.activity_id for c in decision.candidates[:3]]
    if top is not None:
        slots.activity_id = top.activity_id
        record = engine.index.by_id.get(top.activity_id)
        slots.activity_description = record.description if record else None
    else:
        slots.activity_id = None
        slots.activity_description = None


def _create_event_from_slots(
    slots: SlotState, session_id: str, db: Session
) -> tuple[Optional[str], Optional[str]]:
    """Persist a confirmed agent update as a proposal for the planner.

    Returns (linked_event_id, review_item_id).

    Deliberately does NOT write actual_start or actual_finish. A voice update
    is evidence, not an approved actual: the planner commits it through
    POST /review/{id}/resolve, which is where the audit record and the
    alias-lexicon training signal belong. Writing the schedule here would put
    an unreviewed date straight into the baseline comparison.
    """
    # Find or create job for agent turns
    agent_job = db.query(Job).filter(Job.filename == f"agent_session_{session_id}").first()
    if not agent_job:
        agent_job = Job(
            id=_uuid(),
            filename=f"agent_session_{session_id}",
            file_type="agent",
            status="completed",
        )
        db.add(agent_job)
        db.flush()

    tags_json = json.dumps(slots.tags)
    raw_text = slots.description or "progress update"

    # Both already decided by _match_slots, which ran the matching engine.
    linked_id = slots.activity_id
    confidence = slots.confidence if slots.confidence is not None else 0.0

    le = LinkedEvent(
        id=_uuid(),
        job_id=agent_job.id,
        activity_id=linked_id,
        source_file=f"agent_session_{session_id}",
        source_line=None,
        source_row=None,
        source_span=raw_text,
        raw_text=raw_text,
        tags=tags_json,
        reported_date=slots.date,
        quantity=slots.quantity,
        uom=slots.uom,
        discipline=slots.discipline or "unknown",
        status=slots.status or "unknown",
        percentage=None,
        confidence=confidence,
        match_method="agent_turn",
        alternatives=json.dumps(slots.alternatives or []),
        reviewed=False,
    )
    db.add(le)
    db.flush()

    # Queue it for the planner. Without this the update reaches nobody: it
    # would sit as a LinkedEvent that no screen reads, and GET /review-queue —
    # which the field supervisor's own "recent updates" list is built from —
    # would never show it.
    reason = {
        "AUTO_LINK": "agent_high_confidence",
        "REVIEW": "low_confidence",
        "NEW_ACTIVITY": "no_match",
        "REJECTED": "no_match",
    }.get(slots.match_outcome or "", "low_confidence")

    review = ReviewQueueItem(
        id=_uuid(),
        linked_event_id=le.id,
        activity_id=linked_id,
        reason=reason,
        priority="high" if linked_id is None else "medium",
        status="pending",
    )
    db.add(review)
    db.flush()

    return le.id, review.id


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
