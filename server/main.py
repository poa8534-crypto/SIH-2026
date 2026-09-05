"""FastAPI service wrapping the EPC progress extraction pipeline.

Endpoints:
  POST /ingest              upload file → returns job_id
  GET  /jobs/{id}           extraction + linking results with confidence
  GET  /review-queue        items needing planner adjudication
  POST /review/{id}/resolve planner confirms/reassigns/creates activity
  GET  /schedule            planned vs actual, variance in days
  POST /schedule/export     emit PMXML (XER as stretch)
  GET  /delay/attribution   delay attribution matrix (category, liability, citation)
  POST /delay/{id}/classify planner rules on who carries one delay
  POST /delay/{id}/notice   planner records contractual notice for one delay
  GET  /delay/report        delay attribution report (printable html / csv)
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

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extraction.textio import read_text
from server import agent_llm
from server import delay_report
from server.delay_events import (
    adjudicate as adjudicate_delay,
    attribution as delay_attribution,
    days_to_notice,
    effective_liability,
    is_adjudicated,
    notice_status,
    record_notice as record_delay_notice_fields,
    sync_delay_events,
)
from server.delay_taxonomy import (
    category_for_phrase,
    liability_for_phrase,
    parse_liability,
)
from server.agent_slots import (
    ACTIVITY_ID_RE,
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
from matching.providers import (
    JsonScheduleProvider,
    PmxmlScheduleProvider,
    PrimaveraXerScheduleProvider,
    ScheduleProvider,
    validate_activities,
)
from matching.config import production
from matching.primavera import ScheduleParseError
from matching.schedule_index import ScheduleIndex
from matching.textutils import alias_key
from matching.vocabulary import resolve as resolve_vocabulary, vocabulary
from server.evm import (
    SOURCE_NO_EVIDENCE as EVM_NO_EVIDENCE,
    compute_evm,
    percent_complete as evm_percent_complete,
)
from server.evm import _event_percentages as evm_event_percentages
from server.notifications import field_notifications
from server.raid import (
    KINDS as RAID_KINDS,
    STATUSES as RAID_STATUSES,
    RaidValidationError,
    compute_exposure as compute_raid_exposure,
    evidence_for as raid_evidence_for,
    propose_candidates as propose_raid_candidates,
    validate as raid_validate,
)
from server.evidence import CorpusUnavailable, corpus_summary
# The matcher's own per-candidate rationale. `LinkDecision.rationale` is the
# decision-level list (it can carry decision reasons such as "below_tau_low"),
# while this derives the evidence for ONE candidate from that candidate's own
# feature vector. The engine already calls it on the top candidate
# (`matching/engine.py:337`); calling it on the others changes no decision,
# threshold, score or ranking, and is the same code path rather than a
# reimplementation that could drift.
from matching.engine import _rationale as _candidate_rationale

from .db import (
    Activity,
    AliasLexicon,
    AuditRecord,
    Base,
    init_db,
    BaselineVersion,
    ConversationTurn,
    DelayEvent,
    IntegrityError,
    IntegrityWarning,
    Job,
    LinkedEvent,
    RaidItem,
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
    BaselineImportResponse,
    BaselineVersionResponse,
    DelayAttributionResponse,
    ConcurrentDelayPair,
    DelayClassifyRequest,
    DelayClassifyResponse,
    DelayConcurrency,
    DelayNetworkSummary,
    DelayEventOut,
    DelayNoticeRequest,
    DelayNoticeResponse,
    DelayReason,
    DurationDistribution,
    AuditFeedItem,
    AuditRecordResponse,
    ClarificationAnswerRequest,
    ClarificationAskRequest,
    ClarificationResponse,
    ConflictSide,
    ExportRequest,
    EvidenceCorpusResponse,
    FieldReportResponse,
    JobSummaryResponse,
    SourceConflict,
    ExportResponse,
    IngestResponse,
    JobResponse,
    LLMStatusResponse,
    LinkedEventResponse,
    MemoryQueryRequest,
    MemoryQueryResponse,
    ProductivityMetric,
    ResolveRequest,
    ResolveResponse,
    RaidCandidate,
    RaidCandidatesResponse,
    RaidCreateRequest,
    RaidEvidence,
    FieldNotification,
    RaidItemResponse,
    RaidPatchRequest,
    ReviewCandidate,
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
    """Initialize DB and seed baseline schedule.

    `init_db()` rather than a bare `create_all`: SQLite cannot add a column to
    a table that already exists, so `create_all` alone silently leaves an
    older database one column short and every query naming that column fails
    at read time. This ran `create_all` directly, which meant the additive
    migration in `db._ADDED_COLUMNS` only ever executed when someone happened
    to run the seed or reset scripts — the server itself never applied it.
    The `llm_assisted_fields` columns (D-065) made that visible: a demo
    database that had not been re-seeded answered GET /raid/candidates with a
    500.
    """
    init_db()
    db = next(get_db())
    try:
        _seed_schedule_if_empty(db)
    finally:
        db.close()


# ── Seed baseline schedule ───────────────────────────────────────────────────

DATASET_DIR = Path(__file__).resolve().parent.parent / "dataset"

#: The reference baseline. 120 activities, and the one `dataset/ground_truth.csv`
#: was labelled against. `baseline_schedule_v2.json` (218 activities, no shared
#: activity ids) ships alongside it and is imported explicitly, never by default
#: — see D-017.
DEFAULT_BASELINE_PATH = DATASET_DIR / "baseline_schedule.json"
BASELINE_V2_PATH = DATASET_DIR / "baseline_schedule_v2.json"


def get_schedule_provider(path: Optional[Path] = None) -> ScheduleProvider:
    """The provider for a baseline file.

    Every read of a baseline goes through a provider, so the shape differences
    between the two shipped files (list vs dotted `wbs_path`, typed vs bare
    predecessors, `detail` present or absent) are resolved in exactly one place.
    """
    return JsonScheduleProvider(path or DEFAULT_BASELINE_PATH)


def _activity_from_dict(act: dict) -> Activity:
    """A normalised activity dict → an Activity row.

    The dict is already normalised by the provider, so no `.get` defaulting or
    shape-guessing happens here.
    """
    return Activity(
        activity_id=act["activity_id"],
        wbs_path=act["wbs_path"],
        wbs_level=act.get("wbs_level"),
        description=act["description"],
        detail=act.get("detail") or "",
        discipline=act["discipline"],
        tag=act.get("tag"),
        calendar=act.get("calendar"),
        planned_start=date.fromisoformat(str(act["planned_start"])[:10]),
        planned_finish=date.fromisoformat(str(act["planned_finish"])[:10]),
        planned_qty=act.get("planned_qty", 0),
        uom=act.get("uom", ""),
        predecessors=json.dumps(act.get("predecessors", [])),
    )


def _apply_planned_fields(row: Activity, act: dict) -> bool:
    """Overwrite an existing activity's PLANNED fields from a baseline.

    Actuals are never touched. A baseline says what was planned; what happened
    is captured evidence, and re-importing a schedule must not erase it.
    Returns True when anything actually changed.
    """
    new_values = {
        "wbs_path": act["wbs_path"],
        "wbs_level": act.get("wbs_level"),
        "description": act["description"],
        "detail": act.get("detail") or "",
        "discipline": act["discipline"],
        "tag": act.get("tag"),
        "calendar": act.get("calendar"),
        "planned_start": date.fromisoformat(str(act["planned_start"])[:10]),
        "planned_finish": date.fromisoformat(str(act["planned_finish"])[:10]),
        "planned_qty": act.get("planned_qty", 0),
        "uom": act.get("uom", ""),
        "predecessors": json.dumps(act.get("predecessors", [])),
    }
    changed = False
    for field_name, value in new_values.items():
        if getattr(row, field_name) != value:
            setattr(row, field_name, value)
            changed = True
    return changed


def get_active_baseline(db: Session) -> Optional[BaselineVersion]:
    """The baseline the activities table was last built from, or None."""
    return (
        db.query(BaselineVersion)
        .filter(BaselineVersion.is_active.is_(True))
        .order_by(BaselineVersion.imported_at.desc())
        .first()
    )


def _activate_baseline(
    db: Session,
    version,
    source: str,
    created: int,
    updated: int,
    note: Optional[str] = None,
) -> BaselineVersion:
    """Record a baseline as the active one, retiring the previous row.

    Previous rows are retired, never deleted: which schedule was loaded when is
    part of the project's history, and a number quoted last week has to remain
    attributable to the baseline that produced it.
    """
    for row in db.query(BaselineVersion).filter(BaselineVersion.is_active.is_(True)):
        row.is_active = False
    record = BaselineVersion(
        id=_uuid(),
        name=version.name,
        filename=version.filename,
        sha256=version.sha256,
        activity_count=version.activity_count,
        source_format=version.source_format,
        is_active=True,
        activities_created=created,
        activities_updated=updated,
        source=source,
        note=note,
        imported_at=_now(),
    )
    db.add(record)
    return record


def _seed_schedule_if_empty(db: Session) -> None:
    """Load the default baseline into the activities table if it is empty.

    Registers the BaselineVersion row either way an import would, so that
    GET /schedule can always name the schedule its numbers came from.
    """
    if db.query(Activity).count() > 0:
        # Activities exist but predate the baseline_versions table — record
        # what is on disk so the API is not silent about which schedule is
        # loaded. Nothing is re-seeded.
        if get_active_baseline(db) is None and DEFAULT_BASELINE_PATH.exists():
            try:
                version = get_schedule_provider().read_baseline()
            except (OSError, ValueError) as e:
                logger.warning("Could not identify the loaded baseline: %s", e)
                return
            _activate_baseline(
                db, version, source="seed", created=0, updated=0,
                note="registered retrospectively for a pre-existing activities table",
            )
            db.commit()
        return

    if not DEFAULT_BASELINE_PATH.exists():
        logger.warning(f"Baseline schedule not found: {DEFAULT_BASELINE_PATH}")
        return

    provider = get_schedule_provider()
    activities = provider.read_activities()
    problems = validate_activities(activities)
    if problems:
        # Refuse to seed a broken baseline rather than half-load it: an
        # activities table missing rows is far harder to notice than a
        # server that will not start.
        raise RuntimeError(
            f"Baseline {DEFAULT_BASELINE_PATH.name} is not loadable: "
            + "; ".join(problems[:5])
        )

    for act in activities:
        db.add(_activity_from_dict(act))

    version = provider.read_baseline()
    _activate_baseline(
        db, version, source="seed", created=len(activities), updated=0,
    )
    db.commit()
    logger.info("Seeded %d activities from %s", len(activities), version.describe())


# ── Linking engine (matching/ MatchingEngine as a service) ──────────────────

# Calibrated for the REAL pipeline (extraction spans → matching) by aligning
# dataset/ground_truth.csv mentions to extracted events and grid-searching:
#   auto-link precision 96.6%, coverage 48%, suggestion recall 86.4%,
#   5/12 NO_MATCH hard negatives rejected, 0 schedule-corrupting FPs at the
#   stricter point (0.65/0.30/0.08 → 97.9% precision, 38.7% coverage).
# Precision-first: ambiguous margin → REVIEW, never a wrong auto-link.
MATCHING_THRESHOLDS = Thresholds(tau_high=0.70, tau_low=0.40, margin_min=0.03)
MATCHING_MODEL_VERSION = "matching-v1"

SCHEDULE_PATH = str(DEFAULT_BASELINE_PATH)

_MATCHING_ENGINE: Optional[MatchingEngine] = None


def get_matching_engine() -> MatchingEngine:
    """Lazily build the schedule-linking engine.

    Built once per process. The MiniLM weights are held by a module-level
    singleton in matching.retrieval, so even a rebuild here does not reload
    them.

    `production()` supplies the fitted ranker and calibrator ONLY when the
    active baseline is the one they were fitted against; against any other
    schedule it returns the hand-set blend. The server still defaults to the
    v1 baseline while the artefacts are fitted on v2, so today this
    deliberately resolves to the hand-set behaviour — the guard is what makes
    that a decision rather than an accident.
    """
    global _MATCHING_ENGINE
    if _MATCHING_ENGINE is None:
        index = ScheduleIndex.from_json(SCHEDULE_PATH)
        sha = index.baseline.sha256 if index.baseline else None
        _MATCHING_ENGINE = MatchingEngine(
            SCHEDULE_PATH, thresholds=MATCHING_THRESHOLDS,
            config=production(sha), index=index,
        )
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
    llm_assisted_fields: Optional[str] = None,
) -> AuditRecord:
    """Create an immutable audit record. Called on EVERY actual-date write.

    `contributing_sources` lists every source that asserted a value for this
    field. It is recorded whenever more than one source contributed, so the
    audit trail shows the disagreement and which source the written value
    came from instead of one silently overwriting the other.

    `llm_assisted_fields` is a JSON list, copied verbatim from the LinkedEvent,
    naming the slots an optional LLM proposed on the field report behind this
    write. NULL for everything the model never touched, which is every write
    on a default install. It records how a value was *read*, never who chose
    it: no model picks an activity or a date (D-006).
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
        llm_assisted_fields=llm_assisted_fields,
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
    llm_assisted_fields: Optional[str] = None,
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

    `llm_assisted_fields` is provenance carried from the LinkedEvent, naming
    the slots an optional LLM helped read on the field report behind this
    write. None on the ingest path, which has no LLM slot-filling at all.
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
                llm_assisted_fields=llm_assisted_fields,
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
                    llm_assisted_fields=llm_assisted_fields,
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
                    llm_assisted_fields=llm_assisted_fields,
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
                llm_assisted_fields=llm_assisted_fields,
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
                llm_assisted_fields=llm_assisted_fields,
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
                        llm_assisted_fields=llm_assisted_fields,
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

        # `result.errors` was being dropped on the floor, so a file the
        # extractor could not read at all (a .csv reaches
        # extraction/extractor.py:588 and records "CSV extraction not yet
        # implemented") came back as a 200 with "Extracted 0 events" and
        # looked on stage like the app was broken. An extraction that
        # produced no events AND reported an error is a failure, and says so.
        if result.errors and not result.events:
            reason = "; ".join(result.errors)
            job.error_message = reason
            raise HTTPException(
                400,
                f"Could not read {filename}: {reason}. Nothing was written to "
                f"the schedule.",
            )

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
                # Every ranked candidate, with the score the engine already
                # gave it and the signals that fired for IT — not for the
                # winner. `_rationale` is the matcher's own function, applied
                # to the candidate object the engine already built and scored;
                # nothing is recomputed and no decision is affected. Without
                # this only the ids survived, and "why did 1 beat 2" was
                # unanswerable downstream. See D-042.
                alternatives=json.dumps(
                    [
                        {
                            "activity_id": c.activity_id,
                            "rank": c.rank,
                            "score": round(c.final_score, 6),
                            "rationale": _candidate_rationale(c),
                        }
                        for c in decision.candidates[:3]
                    ]
                ),
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

        # Classify the delay text this ingest just wrote into the audit trail.
        # Idempotent and keyed on the observation identity, so re-ingesting the
        # same file updates rows rather than duplicating them (D-077).
        sync_delay_events(db)

        # Update job
        job.status = "completed"
        job.event_count = event_count
        job.linked_count = linked_count
        job.review_count = review_count
        job.activities_updated = len(activities_touched)
        job.audit_records_created = audits_written
        job.completed_at = _now()
        db.commit()

        message = (
            f"Extracted {event_count} events, {linked_count} linked, "
            f"{review_count} need review"
        )
        # Errors alongside a non-empty extraction are partial failures: the
        # good events are kept, but the reader's complaint still has to reach
        # the planner rather than being discarded.
        if result.errors:
            message += f" ({'; '.join(result.errors)})"

        return IngestResponse(
            job_id=job.id,
            filename=filename,
            status="completed",
            message=message,
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

    # priority is a string column: .desc() would sort 'medium' above 'high'.
    # Rank by meaning instead.
    priority_rank = case(
        {"high": 3, "medium": 2, "low": 1},
        value=ReviewQueueItem.priority,
        else_=0,
    )
    items = query.order_by(priority_rank.desc(), ReviewQueueItem.created_at).all()

    events = {
        le.id: le
        for le in db.query(LinkedEvent)
        .filter(LinkedEvent.id.in_([i.linked_event_id for i in items]))
        .all()
    } if items else {}

    # Descriptions for every candidate across every item, in one query rather
    # than one per candidate. Resolved at read time so a baseline re-import
    # cannot leave a stale description on a queued item.
    candidate_ids = {
        c["activity_id"]
        for item in items
        for c in (events.get(item.linked_event_id).alternative_candidates()
                  if events.get(item.linked_event_id) else [])
    }
    descriptions = {
        a.activity_id: a.description
        for a in db.query(Activity).filter(Activity.activity_id.in_(candidate_ids)).all()
    } if candidate_ids else {}

    results = []
    for item in items:
        le = events.get(item.linked_event_id)
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
                discipline=le.discipline if le else None,
                suggested_activity_id=item.activity_id,
                # Each candidate carries its OWN score and rationale. A row
                # written before candidate scores were serialised yields
                # score 0.0 and an empty rationale — reported as absent rather
                # than back-filled with the top candidate's number.
                alternatives=[
                    ReviewCandidate(
                        activity_id=c["activity_id"],
                        rank=c["rank"],
                        score=c["score"],
                        rationale=c["rationale"],
                        description=descriptions.get(c["activity_id"]),
                    )
                    for c in (le.alternative_candidates() if le else [])
                ],
                # Projection only — persisted on the LinkedEvent row and
                # already returned by GET /jobs/{id}; never computed here.
                match_method=le.match_method if le else "prepass",
                margin=le.margin if le else 0.0,
                rationale=json.loads(le.rationale) if le and le.rationale else [],
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
            llm_assisted_fields=le.llm_assisted_fields,
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

    # A resolution can move an activity's finish variance, which is what
    # DelayEvent.impact_days is derived from.
    sync_delay_events(db)

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
      ignore  — leave the node complete with no Actual Finish. The Reconcile
                screen's 'reject' is the same answer and is treated as 'ignore'.

    This is the same rule as D-009: a proposal only becomes an actual date
    through a planner's resolve call.
    """
    # The Reconcile screen sends 'reject' for "not this". On a withheld finish
    # date that means exactly what 'ignore' means — leave the node complete with
    # no Actual Finish — so normalise before the guard rather than 400 on the
    # UI's own verb.
    action = "ignore" if req.action == "reject" else req.action
    if action not in ("confirm", "ignore"):
        raise HTTPException(
            400,
            f"Review item {item.id} is a withheld finish date; "
            "the only actions are 'confirm', 'reject' and 'ignore'",
        )

    audit_count = 0
    activity_id = item.activity_id
    proposed = le.asserted_finish or le.reported_date

    if action == "ignore":
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
    sync_delay_events(db)
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
        # Carry which slots a model helped read onto every audit row this
        # write produces, so the trail says so without a join.
        llm_assisted_fields=le.llm_assisted_fields,
    )
    return audits


def _upsert_alias(
    db: Session,
    source_text: str,
    activity_id: str,
    discipline: str,
    tags: list[str],
) -> int:
    """Insert or update an alias lexicon entry. Returns 1 if created/updated.

    The key comes from `matching.textutils.alias_key`, not from a local
    expression, because the matcher now READS this table as a retrieval
    channel. A write-side normalisation and a read-side normalisation that
    drift apart would silently stop planner corrections from ever being
    found again, and nothing would fail loudly to say so.
    """
    normalized = alias_key(source_text)
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

    # Percent complete is derived by server/evm.py, not here. This screen used
    # to run its own version - max(LinkedEvent.percentage), with no
    # actual_finish rule and no quantity rule - so the Schedule screen and the
    # EVM figures could disagree about the same activity, and did. One
    # derivation, one place, the same reason the delay vocabulary is one list
    # (D-048, D-084).
    schedule_percentages = evm_event_percentages(db)

    for act in activities:
        # Recompute variance
        act.compute_variance(DATA_DATE)

        pct, pct_source = evm_percent_complete(act, schedule_percentages)
        # An activity nobody has reported stays null on this screen rather than
        # rendering a 0% that reads like a measurement. The floor is an EV
        # convention; a table cell is not the place for it.
        if pct_source == EVM_NO_EVIDENCE:
            pct = None

        if act.start_variance_days is not None:
            total_start_var.append(act.start_variance_days)
        if act.finish_variance_days is not None:
            total_finish_var.append(act.finish_variance_days)

        response_activities.append(
            ScheduleActivityResponse(
                activity_id=act.activity_id,
                wbs_path=act.wbs_path,
                wbs_level=act.wbs_level,
                description=act.description,
                discipline=act.discipline,
                tag=act.tag,
                calendar=act.calendar,
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
                predecessor_links=act.predecessor_links(),
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

    active = get_active_baseline(db)
    if include_warnings:
        drift = _matcher_baseline_drift(active)
        if drift:
            warnings.insert(0, drift)

    return ScheduleResponse(
        data_date=DATA_DATE,
        baseline=_baseline_response(active),
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


def _matcher_baseline_drift(active: Optional[BaselineVersion]) -> Optional[dict]:
    """Warn when the active baseline is not the one the matcher links against.

    `get_matching_engine()` is pinned to SCHEDULE_PATH, because the retrieval
    index, the calibrated thresholds and `dataset/ground_truth.csv` were all
    built against that schedule. Importing a different baseline therefore
    changes what the SCHEDULE holds without changing what INGEST can link to —
    a real and confusing divergence, so it is reported rather than left for
    someone to discover through empty match results.

    Returns None when they agree, or when the matcher has not been built yet:
    constructing it here to answer a read would load MiniLM on the first
    /schedule call, which is not this endpoint's job.
    """
    if active is None or _MATCHING_ENGINE is None:
        return None
    matcher_baseline = _MATCHING_ENGINE.index.baseline
    if matcher_baseline is None or matcher_baseline.sha256 == active.sha256:
        return None
    return {
        "activity_id": "",
        "field": "baseline",
        "message": (
            f"The active baseline is {active.filename} "
            f"({active.activity_count} activities), but linking still runs "
            f"against {matcher_baseline.filename} "
            f"({matcher_baseline.activity_count} activities). Ingested events "
            f"can only link to the latter."
        ),
        "severity": "warning",
    }


def _baseline_response(row: Optional[BaselineVersion]) -> Optional[BaselineVersionResponse]:
    """The active baseline as the API states it, or None if none is recorded."""
    if row is None:
        return None
    return BaselineVersionResponse(
        name=row.name,
        filename=row.filename,
        sha256=row.sha256,
        activity_count=row.activity_count,
        source_format=row.source_format,
        source=row.source,
        imported_at=row.imported_at,
    )


# ── POST /schedule/import ───────────────────────────────────────────────────

#: Baseline formats the importer reads. PMXML and XER are Primavera exports
#: (D-047); MPP is deliberately absent - it needs MPXJ and a JVM, which would
#: break the offline guarantee.
BASELINE_IMPORT_SUFFIXES = (".json", ".xml", ".xer")

#: suffix -> provider. One place, so the endpoint has no format branching.
_BASELINE_PROVIDERS = {
    ".json": JsonScheduleProvider,
    ".xml": PmxmlScheduleProvider,
    ".xer": PrimaveraXerScheduleProvider,
}


@app.post("/schedule/import", response_model=BaselineImportResponse)
async def import_schedule(
    file: UploadFile = File(...),
    replace: bool = Form(False),
    dry_run: bool = Form(False),
    note: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Import a baseline schedule: JSON, Primavera PMXML, or Primavera XER.

    Refuses by default when a baseline is already active: replacing the
    schedule that every captured actual is attached to is not something to do
    by accident. `replace=true` is the explicit consent.

    What replace does and does not do:

      * activities that do not exist are CREATED
      * activities that already exist have their PLANNED fields updated;
        actual dates, actual quantities and the audit trail are never touched
      * activities absent from the new file are LEFT IN PLACE, not deleted.
        Deleting them would orphan their LinkedEvent and AuditRecord rows and
        silently destroy the append-only trail (D-004). Two baselines coexist
        in the table; `baseline_versions` records which one is authoritative.

    Every created or updated activity gets an audit row naming the file and its
    sha256, and the import is summarised as a `baseline_versions` row.

    `dry_run=true` parses and validates, reports what it found, and **writes
    nothing** - no activity, no audit row, no baseline version, and the active
    baseline is untouched. That is what an upload screen should call first, so a
    planner sees the activity count and any validation problem before deciding
    to commit. It is also the safe way to inspect a P6 export without disturbing
    the running demo baseline.
    """
    filename = file.filename or "unknown.json"
    suffix = Path(filename).suffix.lower()
    if suffix not in BASELINE_IMPORT_SUFFIXES:
        raise HTTPException(
            400,
            f"Unsupported baseline format '{suffix or filename}'. "
            f"Supported: {', '.join(BASELINE_IMPORT_SUFFIXES)} "
            "(JSON baseline, Primavera PMXML, Primavera XER). "
            "MPP is not supported: it requires MPXJ and a JVM.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(400, "Uploaded baseline is empty")
    sha256 = hashlib.sha256(content).hexdigest()

    active = get_active_baseline(db)
    if active is not None and not replace:
        raise HTTPException(
            409,
            f"A baseline is already active: {active.describe()}. "
            "Pass replace=true to import over it.",
        )
    if active is not None and active.sha256 == sha256 and not replace:
        raise HTTPException(409, "That baseline is already the active one")

    # Keep the file: an audit row naming a sha256 is only checkable if the
    # bytes it names are still on disk.
    upload_dir = DATASET_DIR / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / f"baseline_{sha256[:12]}_{Path(filename).name}"
    stored_path.write_bytes(content)

    provider_cls = _BASELINE_PROVIDERS[suffix]
    if provider_cls is JsonScheduleProvider:
        provider = provider_cls(
            stored_path, name=Path(filename).stem, filename=Path(filename).name,
        )
    else:
        provider = provider_cls(stored_path, name=Path(filename).stem)

    try:
        activities = provider.read_activities()
    except ScheduleParseError as e:
        # Names the file and the reason. Never a 200 with zero activities -
        # that is the bug shape D-040 fixed for CSV uploads.
        stored_path.unlink(missing_ok=True)
        raise HTTPException(400, f"Could not read {filename}: {e.reason}")
    except (json.JSONDecodeError, ValueError) as e:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            400, f"Baseline is not readable {provider.source_format.upper()}: {e}"
        )

    if not activities:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(400, "Baseline contains no activities")

    problems = validate_activities(activities)
    if problems:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            400,
            "Baseline failed validation: " + "; ".join(problems[:10]),
        )

    if dry_run:
        # Report and stop. Nothing was written; the stored copy is removed so a
        # dry run leaves no trace on disk either.
        stored_path.unlink(missing_ok=True)
        already = db.query(Activity).filter(
            Activity.activity_id.in_([a["activity_id"] for a in activities])
        ).count()
        dated = sum(
            1 for a in activities if a.get("planned_start") and a.get("planned_finish")
        )
        return BaselineImportResponse(
            baseline=BaselineVersionResponse(
                name=Path(filename).stem,
                filename=Path(filename).name,
                sha256=sha256,
                activity_count=len(activities),
                source_format=provider.source_format,
                source="import",
                imported_at=datetime.now(),
            ),
            activities_created=0,
            activities_updated=0,
            activities_in_file=len(activities),
            replaced=False,
            message=(
                f"Dry run: {filename} parsed as {provider.source_format} - "
                f"{len(activities)} activities, {dated} with both planned dates, "
                f"{already} ids already in the schedule. Nothing was written."
            ),
        )

    existing = {
        row.activity_id: row
        for row in db.query(Activity).filter(
            Activity.activity_id.in_([a["activity_id"] for a in activities])
        )
    }
    if existing and not replace:
        raise HTTPException(
            409,
            f"{len(existing)} activity ids already exist "
            f"(e.g. {', '.join(sorted(existing)[:5])}). "
            "Pass replace=true to update their planned fields.",
        )

    created = 0
    updated = 0
    version = provider.read_baseline()
    provenance = f"{version.filename}@sha256:{version.sha256}"

    for act in activities:
        row = existing.get(act["activity_id"])
        if row is None:
            db.add(_activity_from_dict(act))
            created += 1
            change = "created"
        else:
            if not _apply_planned_fields(row, act):
                continue
            updated += 1
            change = "planned fields updated"
        # One audit row per activity that actually changed. AuditRecord is
        # keyed to an activity by design (D-004), so a project-level event is
        # recorded against each activity it touched rather than against a
        # sentinel id that does not exist. The baseline_versions row carries
        # the one-line summary.
        _write_audit(
            db, act["activity_id"],
            field="baseline_imported",
            old_value=None,
            new_value=f"{change} from {provenance}",
            source="baseline_import",
            source_file=version.filename,
            confidence=None,
            auto_applied=False,
            model_version=MATCHING_MODEL_VERSION,
        )

    record = _activate_baseline(
        db, version, source="import", created=created, updated=updated, note=note,
    )
    db.commit()
    logger.info(
        "Imported baseline %s: %d created, %d updated",
        version.describe(), created, updated,
    )

    return BaselineImportResponse(
        baseline=_baseline_response(record),
        activities_created=created,
        activities_updated=updated,
        activities_in_file=len(activities),
        replaced=bool(active is not None),
        message=(
            f"Imported {version.filename}: {created} activities created, "
            f"{updated} updated"
        ),
    )


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


# ── GET /uploads/{filename} ─────────────────────────────────────────────────

#: Extensions this route will serve. Exports are the only thing that legitimately
#: lands in dataset/uploads for download; refusing everything else means a file
#: that arrives there by another path cannot be exfiltrated through this route.
_DOWNLOADABLE = {
    ".xml": "application/xml",
    ".xer": "text/plain; charset=utf-8",
}


@app.get("/uploads/{filename}")
def download_export(filename: str):
    """Serve a generated export file.

    `ExportResponse.download_url` has always advertised `/uploads/{filename}`
    while nothing served that path, so every Export in the UI produced a dead
    link (D-039 gap 3, D-044).

    The filename arrives from the URL, so it is treated as hostile:

      * any separator or parent reference is rejected outright — a name is a
        name, never a path;
      * the resolved path must still be inside the uploads directory after
        `resolve()`, which is what catches a symlink pointing outside it;
      * only known export extensions are served;
      * a missing file is a 404, never a 500 and never a stack trace.
    """
    if not filename or filename in {".", ".."}:
        raise HTTPException(400, "Invalid filename")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    # A bare name only. This also rejects "C:..." style absolute forms, whose
    # separators are already caught above.
    if Path(filename).name != filename or Path(filename).is_absolute():
        raise HTTPException(400, "Invalid filename")

    suffix = Path(filename).suffix.lower()
    if suffix not in _DOWNLOADABLE:
        raise HTTPException(400, f"Unsupported file type: {suffix or '(none)'}")

    upload_dir = (DATASET_DIR / "uploads").resolve()
    candidate = (upload_dir / filename).resolve()

    # Containment check AFTER resolve, so a symlink out of the directory fails.
    if candidate != upload_dir and upload_dir not in candidate.parents:
        raise HTTPException(400, "Invalid filename")
    if not candidate.is_file():
        raise HTTPException(404, f"Export {filename} not found")

    return FileResponse(
        candidate,
        media_type=_DOWNLOADABLE[suffix],
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
# ── GET /evm ────────────────────────────────────────────────────────────────

@app.get("/evm")
def get_evm(db: Session = Depends(get_db)):
    """Schedule-side earned value as of DATA_DATE.

    Deterministic arithmetic over the baseline and the linked events; see
    `server/evm.py` for the weighting choice, the three-rule percent-complete
    precedence, and why the cost half is deliberately absent. Computed on read —
    no table, no migration, nothing stored.
    """
    return compute_evm(db, DATA_DATE)
# ── GET /field/notifications ────────────────────────────────────────────────

@app.get("/field/notifications", response_model=list[FieldNotification])
def get_field_notifications(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """What this supervisor's own updates actually changed, newest first.

    Closes the loop back to the field (ROADMAP §3.4): a supervisor who reports
    progress is otherwise never told what it did. Derived on read from the
    append-only audit trail — no notification table, and nothing new is
    captured. A rejected proposal produces nothing, because rejecting writes no
    actual and so leaves no audit row pointing at that event.
    """
    return [
        FieldNotification(**n)
        for n in field_notifications(db, FIELD_MATCH_METHOD, limit=limit)
    ]


# ── RAID register ───────────────────────────────────────────────────────────

def _raid_response(db: Session, item: RaidItem) -> RaidItemResponse:
    """One register row, with its source evidence resolved at read time."""
    evidence = raid_evidence_for(db, item)
    return RaidItemResponse(
        id=item.id,
        kind=item.kind,
        title=item.title,
        description=item.description or "",
        category=item.category,
        status=item.status,
        owner=item.owner,
        due_date=item.due_date,
        date_raised=item.date_raised,
        date_closed=item.date_closed,
        probability=item.probability,
        impact_days=item.impact_days,
        exposure=item.exposure,
        linked_activity_ids=item.activity_list(),
        source_kind=item.source_kind,
        source_id=item.source_id,
        source_note=item.source_note,
        evidence=RaidEvidence(**evidence) if evidence else None,
        created_by=item.created_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@app.get("/raid", response_model=list[RaidItemResponse])
def list_raid(
    kind: Optional[str] = Query(None, description="risk | issue | action | decision"),
    status: Optional[str] = Query(None, description="open | mitigating | closed | rejected"),
    activity_id: Optional[str] = Query(None, description="items touching this activity"),
    db: Session = Depends(get_db),
):
    """The register, highest exposure first.

    A scored risk outranks an unscored item, and within the unscored the newest
    comes first. An item with no exposure is not sorted as though it scored
    zero - it has not been scored at all.
    """
    query = db.query(RaidItem)
    if kind:
        if kind not in RAID_KINDS:
            raise HTTPException(400, f"Unknown kind '{kind}'. Expected one of {', '.join(RAID_KINDS)}.")
        query = query.filter(RaidItem.kind == kind)
    if status:
        if status not in RAID_STATUSES:
            raise HTTPException(400, f"Unknown status '{status}'. Expected one of {', '.join(RAID_STATUSES)}.")
        query = query.filter(RaidItem.status == status)

    items = query.all()
    if activity_id:
        items = [i for i in items if activity_id in i.activity_list()]

    items.sort(
        key=lambda i: (
            0 if i.exposure is not None else 1,
            -(i.exposure or 0.0),
            -(i.created_at.timestamp() if i.created_at else 0),
        )
    )
    return [_raid_response(db, i) for i in items]


@app.get("/raid/candidates", response_model=RaidCandidatesResponse)
def raid_candidates(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """RAID items the existing evidence suggests. **Writes nothing.**

    Mirrors D-009 for dates: the system proposes, a human commits. There is no
    confidence above which a candidate commits itself, because no such
    threshold would be safe for a governance artefact (ROADMAP §6).
    """
    return RaidCandidatesResponse(
        candidates=[RaidCandidate(**c) for c in propose_raid_candidates(db, limit=limit)]
    )


@app.get("/raid/{item_id}", response_model=RaidItemResponse)
def get_raid_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(RaidItem).filter(RaidItem.id == item_id).first()
    if not item:
        raise HTTPException(404, f"RAID item {item_id} not found")
    return _raid_response(db, item)


@app.post("/raid", response_model=RaidItemResponse, status_code=201)
def create_raid_item(req: RaidCreateRequest, db: Session = Depends(get_db)):
    """Add an item to the register. The only way anything gets in.

    `exposure` is not accepted from the caller - it is computed from
    probability and impact so the register cannot carry a figure that does not
    follow from its own inputs.
    """
    try:
        raid_validate(req.kind, req.status, req.probability, req.impact_days)
    except RaidValidationError as e:
        raise HTTPException(400, str(e))

    item = RaidItem(
        kind=req.kind,
        title=req.title,
        description=req.description or "",
        category=req.category,
        status=req.status,
        owner=req.owner,
        due_date=req.due_date,
        date_raised=req.date_raised or date.today(),
        probability=req.probability,
        impact_days=req.impact_days,
        exposure=compute_raid_exposure(req.probability, req.impact_days),
        linked_activity_ids=json.dumps(list(req.linked_activity_ids)),
        source_kind=req.source_kind,
        source_id=req.source_id,
        source_note=req.source_note,
        created_by=req.created_by,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _raid_response(db, item)


@app.patch("/raid/{item_id}", response_model=RaidItemResponse)
def patch_raid_item(item_id: str, req: RaidPatchRequest, db: Session = Depends(get_db)):
    """Update an item. Absent fields are left alone.

    Exposure is recomputed whenever either factor moves, so it can never drift
    out of step with the numbers it is derived from.
    """
    item = db.query(RaidItem).filter(RaidItem.id == item_id).first()
    if not item:
        raise HTTPException(404, f"RAID item {item_id} not found")

    kind = req.kind if req.kind is not None else item.kind
    status = req.status if req.status is not None else item.status
    probability = req.probability if req.probability is not None else item.probability
    impact_days = req.impact_days if req.impact_days is not None else item.impact_days
    try:
        raid_validate(kind, status, probability, impact_days)
    except RaidValidationError as e:
        raise HTTPException(400, str(e))

    for field in ("kind", "title", "description", "category", "status", "owner",
                  "due_date", "date_closed", "probability", "impact_days"):
        value = getattr(req, field)
        if value is not None:
            setattr(item, field, value)
    if req.linked_activity_ids is not None:
        item.linked_activity_ids = json.dumps(list(req.linked_activity_ids))

    item.exposure = compute_raid_exposure(item.probability, item.impact_days)
    # Closing an item dates it, so a closed register row always says when.
    if item.status in ("closed", "rejected") and item.date_closed is None:
        item.date_closed = date.today()
    db.commit()
    db.refresh(item)
    return _raid_response(db, item)


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
                # A bare predecessor id has always meant FS with zero lag, and
                # _generate_pmxml writes FS for the same rows. This said SS,
                # so one schedule exported two different logic networks
                # depending on the format chosen. See D-047.
                f"T\tFUNCDD\tREL\trelationship_type\tFS",
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


# ── GET /vocabulary/activity-types ──────────────────────────────────────────

@app.get("/vocabulary/activity-types")
def get_activity_type_vocabulary():
    """The canonical activity-type vocabulary (ROADMAP §11).

    **Not used by the matcher.** `wired_into_matching: false` ships in the
    response. Matching keys on descriptions and tags, which are project-specific;
    this vocabulary is the key a lesson learned would need to transfer to a
    contract with different activity ids. Wiring it into retrieval changes
    scoring, so it is a separate and measured change. See D-052.
    """
    return vocabulary()


@app.get("/vocabulary/resolve")
def resolve_activity_type(
    description: str = Query(..., min_length=1, description="free text to classify"),
    activity_id: Optional[str] = Query(None, description="wins when supplied"),
):
    """Resolve free text onto a canonical activity type, or nothing.

    Deterministic. An input that matches nothing returns `matched: false` rather
    than a nearest guess — a wrong activity type on a lesson learned is worse
    than no activity type.
    """
    found = resolve_vocabulary(description, activity_id)
    return {
        "query": description,
        "activity_id": activity_id,
        "matched": found is not None,
        "activity_type": found.as_dict() if found else None,
    }


# ── GET /evidence/corpus ────────────────────────────────────────────────────

@app.get("/evidence/corpus", response_model=EvidenceCorpusResponse)
def get_evidence_corpus():
    """What the real corpus contains, read from its own manifests.

    Read-only and cheap: no raw artifact is opened and nothing is re-derived,
    so the numbers here cannot disagree with the build that produced them.

    The `caveats` block is the point. The corpus is genuinely useful and
    genuinely partial - 27 distinct schedule activities rather than 200-300,
    unverified OCR matches, source-published ConstructCIE labels - and those
    facts ship as structured fields so the Evidence page states them rather
    than leaving a reader to assume otherwise. See D-050.
    """
    try:
        return EvidenceCorpusResponse(**corpus_summary())
    except CorpusUnavailable as e:
        # 404, not 500: the corpus is a large optional download, and its absence
        # is a fact about this checkout rather than a fault in the server.
        raise HTTPException(404, str(e))


# ── GET /delay/attribution ───────────────────────────────────────────────────

@app.get("/delay/attribution", response_model=DelayAttributionResponse)
def get_delay_attribution(
    discipline: Optional[str] = Query(None, description="Filter by discipline"),
    db: Session = Depends(get_db),
):
    """Delay attribution: what delayed the work, and whose problem it is.

    The read side of the Contractor Dispute Shield. Every row carries its
    ARCHITECTURE 2.7 category, the party the deterministic table in
    `server/delay_taxonomy.py` proposes, whatever a planner has since ruled,
    and the file, row and sentence the classification was read from.

    DELIBERATELY READ-ONLY. The rows are written by `sync_delay_events` at the
    points that can create them - ingest roll-up and planner resolution - not
    here. A GET that materialises its own answer hides when the work happened
    and makes two identical requests do different amounts of writing.
    A database that has never ingested since this feature landed returns an
    empty matrix, which `scripts/reset_demo.py` fixes by re-ingesting.

    Two totals are returned. `adjudicated_days` counts only what a planner has
    ruled on; `proposed_days` counts every row at its effective liability.
    Presenting the second alone would dress machine proposals up as findings.
    """
    # DATA_DATE is what the notice windows are judged against. Passing it
    # explicitly rather than letting the helper reach for today keeps the
    # answer a fact about the project rather than about when it was asked.
    data = delay_attribution(db, discipline=discipline, as_of=DATA_DATE)

    events = [
        DelayEventOut(
            id=row.id,
            activity_id=row.activity_id,
            phrase=row.phrase,
            category=row.category,
            liability_proposed=row.liability_proposed,
            liability_final=row.liability_final,
            liability_effective=effective_liability(row),
            adjudicated=is_adjudicated(row),
            adjudication_note=row.adjudication_note,
            inferred_by=row.inferred_by,
            confidence=row.confidence,
            discipline=row.discipline,
            month=row.month,
            impact_days=row.impact_days or 0,
            activity_total_float=row.activity_total_float,
            float_consumed_days=row.float_consumed_days or 0,
            beyond_float_days=row.beyond_float_days or 0,
            on_critical_path=bool(row.on_critical_path),
            evidenced_on=row.evidenced_on,
            evidenced_basis=row.evidenced_basis,
            notice_due_on=row.notice_due_on,
            notice_status=notice_status(row, DATA_DATE),
            notice_days_remaining=days_to_notice(row, DATA_DATE),
            notice_served_on=row.notice_served_on,
            notice_reference=row.notice_reference,
            audit_record_id=row.audit_record_id,
            source_file=row.source_file,
            source_line=row.source_line,
            source_row=row.source_row,
            source_span=row.source_span,
        )
        for row in data["events"]
    ]

    return DelayAttributionResponse(
        events=events,
        total_events=data["total_events"],
        adjudicated_events=data["adjudicated_events"],
        adjudicated_days=data["adjudicated_days"],
        proposed_days=data["proposed_days"],
        days_by_month=data["days_by_month"],
        categories_present=data["categories_present"],
        notice_window_days=data["notice_window_days"],
        notice_counts=data["notice_counts"],
        notice_lapsed_days=data["notice_lapsed_days"],
        notice_as_of=data["notice_as_of"],
        beyond_float_days=data["beyond_float_days"],
        adjudicated_beyond_float_days=data["adjudicated_beyond_float_days"],
        float_basis=data["float_basis"],
        network=DelayNetworkSummary(**data["network"]),
        concurrency=DelayConcurrency(
            pairs=[ConcurrentDelayPair(**pair)
                   for pair in data["concurrency"]["pairs"]],
            total_pairs=data["concurrency"]["total_pairs"],
            pairs_listed=data["concurrency"]["pairs_listed"],
            counts=data["concurrency"]["counts"],
            beyond_float_pairs=data["concurrency"]["beyond_float_pairs"],
            note=data["concurrency"]["note"],
        ),
        impact_days_basis=data["impact_days_basis"],
        unadjudicated_note=data["unadjudicated_note"],
        notice_note=data["notice_note"],
        computed_at=_now(),
    )


# ── POST /delay/{delay_event_id}/classify ────────────────────────────────────

@app.post("/delay/{delay_event_id}/classify", response_model=DelayClassifyResponse)
def classify_delay_event(
    delay_event_id: str,
    req: DelayClassifyRequest,
    db: Session = Depends(get_db),
):
    """A planner rules on who carries one delay.

    This is the step that turns a proposal into a finding. NAVIS classifies the
    delay from the evidence and proposes a liability from the deterministic
    table in `server/delay_taxonomy.py`; nothing it proposes counts until a
    human rules here. It is D-009 applied to liability instead of dates: a
    proposal reaches the record only through an explicit act by a planner.

    THE RULING IS AUDITED, NOT JUST STORED.
    Every call appends an `AuditRecord` with `field_changed="delay_liability"`
    and `source="planner_review"`, carrying the previous answer in `old_value`
    and the citation the delay was read from. Setting the column alone would
    leave the register saying WHAT was decided and never who decided it, when,
    or against what. `auto_applied=False`, because a person did this.

    RE-RULING IS ALLOWED AND APPENDS.
    Evidence arrives late. A second ruling writes a second record whose
    `old_value` is the first ruling, so an overturned decision is visible as an
    overturned decision rather than as a value that quietly changed (D-004).
    """
    row = db.query(DelayEvent).filter(DelayEvent.id == delay_event_id).first()
    if not row:
        raise HTTPException(404, f"Delay event {delay_event_id} not found")

    try:
        liability = parse_liability(req.liability)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if not row.activity_id:
        # Every delay event derives from an audit row, which always names an
        # activity, so this is unreachable on real data. It is a 400 rather
        # than a crash because an unattributable delay cannot be audited, and
        # writing the ruling without a trail is the one thing not on offer.
        raise HTTPException(
            400,
            f"Delay event {delay_event_id} names no activity, so a ruling on "
            "it cannot be written to the audit trail",
        )

    previous = adjudicate_delay(
        row,
        liability,
        note=req.note,
        by=req.adjudicated_by,
        at=_now(),
    )

    _write_audit(
        db, row.activity_id,
        field="delay_liability",
        # The answer this ruling replaces: an earlier ruling if there was one,
        # otherwise the machine proposal it was allowed to stand on until now.
        old_value=previous or row.liability_proposed,
        new_value=liability.value,
        source="planner_review",
        source_file=row.source_file,
        source_line=row.source_line,
        source_row=row.source_row,
        source_span=row.source_span,
        confidence=row.confidence,
        auto_applied=False,
        contributing_sources=[
            f"{row.category} classified from '{row.phrase}'; "
            f"proposed {row.liability_proposed}"
        ] + ([f"note: {req.note}"] if req.note else []),
    )

    db.commit()

    overrides = liability.value != row.liability_proposed
    return DelayClassifyResponse(
        delay_event_id=row.id,
        activity_id=row.activity_id,
        liability_proposed=row.liability_proposed,
        liability_previous=previous,
        liability_final=liability.value,
        overrides_proposal=overrides,
        audit_records_created=1,
        message=(
            f"Delay on {row.activity_id} ruled {liability.value}, "
            + (f"overriding the proposed {row.liability_proposed}"
               if overrides else "confirming the proposal")
        ),
    )


# ── POST /delay/{delay_event_id}/notice ──────────────────────────────────────

@app.post("/delay/{delay_event_id}/notice", response_model=DelayNoticeResponse)
def record_delay_notice(
    delay_event_id: str,
    req: DelayNoticeRequest,
    db: Session = Depends(get_db),
):
    """Record that contractual notice was given for one delay.

    Without this the notice clock could only ever accuse: NAVIS has no notice
    register, so every delay would read as un-noticed forever. `served_on` is
    the date notice was GIVEN, not the date somebody typed it here, and it is
    accepted even when it falls after the window closed - a late notice is a
    fact about the project and hiding it would be the opposite of the point.
    `served_late` says so in the response.

    Audited like every other planner decision: an `AuditRecord` with
    `field_changed="delay_notice"`, `source="planner_review"` and
    `auto_applied=False`. Re-recording appends, carrying the previous date in
    `old_value`, because a corrected notice date is exactly the late
    correction a register has to survive.
    """
    row = db.query(DelayEvent).filter(DelayEvent.id == delay_event_id).first()
    if not row:
        raise HTTPException(404, f"Delay event {delay_event_id} not found")
    if not row.activity_id:
        raise HTTPException(
            400,
            f"Delay event {delay_event_id} names no activity, so a notice on "
            "it cannot be written to the audit trail",
        )

    previous = record_delay_notice_fields(row, req.served_on,
                                          reference=req.reference)

    _write_audit(
        db, row.activity_id,
        field="delay_notice",
        old_value=previous.isoformat() if previous else None,
        new_value=req.served_on.isoformat(),
        source="planner_review",
        source_file=row.source_file,
        source_line=row.source_line,
        source_row=row.source_row,
        source_span=row.source_span,
        auto_applied=False,
        contributing_sources=[
            f"delay evidenced {row.evidenced_on.isoformat()} "
            f"({row.evidenced_basis}); notice due "
            f"{row.notice_due_on.isoformat()}"
        ] if row.evidenced_on and row.notice_due_on else None,
    )

    db.commit()

    late = bool(row.notice_due_on and req.served_on > row.notice_due_on)
    return DelayNoticeResponse(
        delay_event_id=row.id,
        activity_id=row.activity_id,
        evidenced_on=row.evidenced_on,
        notice_due_on=row.notice_due_on,
        notice_served_on=row.notice_served_on,
        notice_reference=row.notice_reference,
        previous_served_on=previous,
        served_late=late,
        audit_records_created=1,
        message=(
            f"Notice for {row.activity_id} recorded as given "
            f"{req.served_on.isoformat()}"
            + (f", after the {row.notice_due_on.isoformat()} deadline"
               if late else "")
        ),
    )


# ── GET /delay/report ────────────────────────────────────────────────────────

@app.get("/delay/report")
def get_delay_report(
    format: str = Query("html", description="html or csv"),
    discipline: Optional[str] = Query(None, description="Filter by discipline"),
    db: Session = Depends(get_db),
):
    """The Delay Attribution Report: the document a claim is argued from.

    Two renderings of one computation. `html` is a printable, self-contained
    document - no external stylesheet, no script, no font host - because a
    document attached to a contractual letter has to survive being saved,
    emailed and printed by someone with no network. `csv` is the same rows for
    analysis.

    Both are stamped with the data date and the active baseline's sha256. Two
    baselines ship and they share no activity ids, so a figure quoted without
    that stamp is unattributable. On the CSV the stamp is repeated as columns
    on every row rather than written as a preamble, because RFC 4180 has no
    comment syntax and a row pasted into an email should still name the
    schedule it was true for.

    Read-only, like `GET /delay/attribution`: it renders the rows the ingest
    and resolution paths already wrote.
    """
    fmt = (format or "html").strip().lower()
    if fmt not in ("html", "csv"):
        raise HTTPException(400, f"Unsupported format '{format}'. Use html or csv.")

    context = delay_report.report_context(db, discipline=discipline,
                                          data_date=DATA_DATE)

    if fmt == "csv":
        body = delay_report.to_csv(context)
        filename = delay_report.filename_for(context, "csv")
        return StreamingResponse(
            io.StringIO(body),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Inline rather than an attachment: the planner is meant to read it, and
    # the browser's own print dialog is the route to a PDF.
    return Response(
        content=delay_report.to_html(context),
        media_type="text/html; charset=utf-8",
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
    """Delay causes recorded in the field evidence, worst first.

    Counting is delegated to `server.raid.delay_evidence`, which both this
    screen and the RAID candidates now share. They used to count for
    themselves and disagreed: this filtered audit rows to
    actual_start/actual_finish and reported 2, while the candidate detector
    applied no field filter and reported 3 — for the same single spreadsheet
    row. One observation was being reported as two or three because the
    roll-up wrote two or three columns from it.

    `activities` is accepted for the existing call signature; the slip figures
    come from the same query the shared counter runs, so the two can never
    disagree about days lost either.
    """
    from server.raid import delay_evidence

    results = [
        DelayReason(
            reason=phrase,
            # The ARCHITECTURE 2.7 classification of the same phrase. Pure
            # lookups over server/delay_taxonomy.py - this screen reads no
            # DelayEvent rows, because a frequency needs no identity and a
            # read-time count must not depend on a sync having run.
            category=category_for_phrase(phrase).value,
            liability=liability_for_phrase(phrase).value,
            frequency=found["occurrences"],
            affected_activities=found["activity_ids"][:10],
            days_lost=found["days_lost"],
        )
        for phrase, found in delay_evidence(db).items()
    ]

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


# ── GET /agent/llm-status ────────────────────────────────────────────────────

@app.get("/agent/llm-status", response_model=LLMStatusResponse)
def agent_llm_status() -> LLMStatusResponse:
    """Is the optional LLM path on, and does the backend actually answer?

    Read-only and safe to call from anywhere: it writes nothing, and it never
    returns an API key, a base URL (which can carry credentials in its
    userinfo) or a model secret — only the provider name, a reachability
    verdict and the timeout in force.

    A dead endpoint is reported as `reachable: false` with a reason, never as
    a 500: an Ollama that is not running is a configuration fact about the
    venue, not a NAVIS fault, and the deterministic path is unaffected either
    way. `reachable` is null when the path is off, so "we did not look" cannot
    be misread as "it works".

    The probe is bounded by the same mechanism `agent_llm.interpret` uses, so
    a hung model costs one timeout rather than the request.
    """
    return LLMStatusResponse(**agent_llm.probe())


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
        # activity, and it is what the matcher is run against later. Refuse it
        # here if it is not a report about work at all — the matcher ranks, it
        # does not judge, so without this gate any string comes back with a
        # plausible-looking confidence and costs a planner a queue row.
        if slots.description is None:
            refusal = _unreportable_reason(req.message)
            if refusal is not None:
                agent_msg = (
                    f"I can't log that — {refusal}. Tell me what work was done, "
                    "for example \"poured 40 m3 of the raft\" or "
                    "\"24\"-P-1001-A1A hydrotest complete\"."
                )
                turn = ConversationTurn(
                    id=_uuid(),
                    session_id=session_id,
                    turn_number=turn_number,
                    slots_filled=slots.model_dump_json(),
                    pending_slots=json.dumps([]),
                    user_message=req.message,
                    extracted_intent="not_a_progress_report",
                    agent_response=agent_msg,
                    event_created=False,
                    linked_event_id=None,
                )
                db.add(turn)
                db.commit()
                # Nothing matched, nothing linked, nothing queued.
                return AgentTurnResponse(
                    session_id=session_id,
                    turn_number=turn_number,
                    agent_message=agent_msg,
                    slots=slots,
                    pending_slots=[],
                    event_created=False,
                    confidence=0.0,
                    awaiting_confirmation=False,
                    match_outcome="not_a_progress_report",
                    discipline_label=discipline_label(slots.discipline),
                    status_label=(
                        STATUS_LABELS.get(slots.status) if slots.status else None
                    ),
                )
            slots.description = req.message.strip() or None
        clarification = _fill_slots(slots, req.message, context, db)

    awaiting_confirmation = False
    review_item_id = None
    event_created = False
    linked_event_id = None
    confidence = 0.0
    choices = None

    # Record a give-up before asking what is still missing. `_next_missing`
    # skips a slot it has already asked about twice, but it reads that from
    # `asked_slot`/`ask_count`, and the branch below clears both the moment a
    # turn finds nothing left to ask. The skip therefore lasted exactly one
    # turn: the slot came back on the next one, the session re-asked forever,
    # and a `confirm` arriving in that state was consumed by the re-ask.
    # Writing it to `abandoned_slots` first makes the decision durable.
    _abandon_exhausted(slots)

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
        if req.confirm:
            # A confirm cannot be honoured while a slot is genuinely open —
            # submitting would file a record the supervisor never completed.
            # But it must not vanish either: silently answering a confirm with
            # a question makes the button look broken. Say why.
            agent_msg = (
                "I need one more thing before I can send this. " + agent_msg
            )
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
        # Which slots came from the model rather than the supervisor's words.
        # Empty on every rules-only turn. Offered so a client can mark them;
        # no frontend reads it yet.
        llm_suggested_fields=list(slots.llm_suggested_fields),
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
        elif (
            answering == "planned_quantity"
            and slots.planned_quantity is None
            and parsed.planned is None
            and parsed.completed is not None
        ):
            # "How many were planned in total?" answered with a bare figure.
            # `parse_quantity` reports a lone number as the *completed* amount,
            # because in isolation that is what one usually is — but against
            # this question it is the planned total. Without this branch the
            # answer landed nowhere: `_merge_quantity` drops a completed
            # figure when `quantity` is already set, `planned_quantity` stayed
            # None, and the agent asked the same question again. Any reply
            # short of an explicit "6 out of 18" was unanswerable.
            slots.planned_quantity = parsed.completed
            if parsed.uom and not slots.uom:
                slots.uom = parsed.uom
            if (
                slots.quantity is not None
                and slots.quantity > slots.planned_quantity
            ):
                # Kept as reported and surfaced, never clamped — same rule as
                # _merge_quantity.
                slots.quantity_over_planned = True
        else:
            _merge_quantity(slots, parsed)
    elif answering == "location" and slots.location is None:
        # Any answer to "where" is a location; the supervisor knows the site
        # better than a pattern does.
        text = message.strip()
        if text:
            slots.location = text[:120]

    # ── optional LLM interpretation, then general extraction ──
    # Advisory only. A suggestion fills a slot the deterministic parsers left
    # empty and never overwrites one they filled, so the supervisor's own words
    # always win. Whatever it does fill is recorded in `llm_suggested_fields`
    # so the value can be attributed later, the same way a date carries its
    # basis. `activity_id` and `confidence` are absent by construction — the
    # matching engine sets both, after this function has returned (D-006).
    suggestion = agent_llm.interpret(message, backend=llm_backend)
    if suggestion is not None:
        from_model: list[str] = []
        if slots.discipline is None and suggestion.discipline:
            slots.discipline = suggestion.discipline
            from_model.append("discipline")
        if slots.status is None and suggestion.status:
            slots.status = suggestion.status
            from_model.append("status")
        if not slots.tags and suggestion.tags:
            slots.tags = suggestion.tags
            from_model.append("tags")
        if suggestion.activity_description and not slots.activity_description:
            slots.activity_description = suggestion.activity_description
            from_model.append("activity_description")
        # Accumulated across the session: a slot filled by the model on turn
        # one is still model-supplied on turn three.
        for name in from_model:
            if name not in slots.llm_suggested_fields:
                slots.llm_suggested_fields = slots.llm_suggested_fields + [name]

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
        m = ACTIVITY_ID_RE.search(message)
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


# ── Is this text even a progress report? ─────────────────────────────────────

#: Words that make a sentence a report about construction work rather than
#: chatter. Deliberately broad — a supervisor types in a hurry, in gloves, and
#: the cost of refusing a real update is far higher than the cost of letting a
#: marginal one through to a human. Nothing here is discipline-specific enough
#: to bias the matcher; this list only decides *whether to run it at all*.
REPORTABLE_TERMS = frozenset("""
pour poured pouring concrete rcc pcc screed grout grouted grouting
excavate excavated excavation backfill backfilled trench trenching
pile piling foundation footing pedestal plinth slab shuttering formwork
reinforcement rebar blockwork masonry brickwork plaster plastering
spool spools erect erected erection weld welded welding joint joints
flange flanges bolt bolted gasket pipe piping line header
hydrotest hydrotested pressure test tested testing flush flushing
valve valves support supports hanger skid
cable cables cabling gland glanded terminate terminated termination
tray conduit panel panels switchgear transformer breaker earthing
instrument instruments loop loops calibrate calibrated calibration
transmitter gauge light lighting fixture
paint painted painting coating insulation cladding scaffolding
install installed installing fit fitted fix fixed lay laid erect
align aligned commission commissioned handover punch snag
complete completed done finished start started begin begun
progress ongoing resumed
delay delayed hold held blocked stopped shutdown breakdown
inspection inspected approved rejected ncr rfi
""".split())

#: A bare number with a unit is itself evidence of a measurement.
_QUANTITY_SIGNAL_RE = re.compile(
    r"\d+\s*(?:%|m2|m3|sqm|cum|rmt|mtr|mts?|metres?|meters?|nos?|"
    r"kg|te|ton|tonnes?|inch|\"|joints?|lengths?)",
    re.IGNORECASE,
)


def _unreportable_reason(text: str, tags=None, quantity=None) -> Optional[str]:
    """Why this text cannot be a progress report, or None if it might be.

    The matching engine will return *some* candidate for *any* string — it
    ranks, it does not judge — so "I love kenny boy" came back at 40% and
    became a review item a planner had to read and dismiss. Ranking is not
    filtering, and the queue is the planner's time.

    This gate runs BEFORE the matcher and decides only whether the text is a
    report about work at all. It is deliberately generous: any tag, any
    measured quantity, or any single construction term is enough to pass. It
    is applied ONLY on the conversational agent path, never to file ingest, so
    it cannot affect extraction or the evaluation corpus.

    Returns a short human-readable reason on refusal, None to proceed.
    """
    raw = (text or "").strip()
    if not raw:
        return "the message was empty"

    # A tag or a measured quantity is self-evidently a report.
    if tags:
        return None
    if quantity is not None:
        return None

    words = re.findall(r"[a-zA-Z]+", raw.lower())
    if not words:
        return "the message contains no words, only symbols or digits"

    # "hello hello hello hello" — repetition is not information.
    if len(words) >= 3 and len(set(words)) <= 2:
        return "the message is one word repeated"

    if any(w in REPORTABLE_TERMS for w in words):
        return None
    if _QUANTITY_SIGNAL_RE.search(raw):
        return None

    return (
        "it does not mention any construction activity, quantity or tag"
    )


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


def _exhausted(slots: SlotState, name: str) -> bool:
    """True when the agent has stopped asking about `name`.

    Either it asked twice on this slot without getting a value, or a previous
    turn already recorded the give-up. Both halves are needed: `ask_count` is
    the live signal, `abandoned_slots` is the memory of it, because the turn
    that finds nothing left to ask clears `asked_slot` and `ask_count` before
    the next turn runs.
    """
    return name in slots.abandoned_slots or (
        slots.asked_slot == name and slots.ask_count >= 2
    )


def _abandon_exhausted(slots: SlotState) -> None:
    """Record a give-up permanently, before the counters that imply it are cleared."""
    name = slots.asked_slot
    if (
        name
        and slots.ask_count >= 2
        and name not in slots.abandoned_slots
        and getattr(slots, name, None) is None
    ):
        slots.abandoned_slots = slots.abandoned_slots + [name]


def _next_missing(slots: SlotState) -> Optional[str]:
    """The one slot to ask about next, or None when the update is complete.

    Asked in the order a supervisor would volunteer them. A slot the agent has
    already asked about twice without success is skipped: asking a third time
    is a loop, and the planner can fill it in.
    """
    order = ["discipline", "location", "status", "date"]
    for name in order:
        if getattr(slots, name) is None:
            if _exhausted(slots, name):
                continue
            return name
    if _quantity_relevant(slots):
        if slots.quantity is None:
            if not _exhausted(slots, "quantity"):
                return "quantity"
        elif slots.planned_quantity is None:
            if not _exhausted(slots, "planned_quantity"):
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

    # Whatever the model may have proposed as a description, the value now held
    # is the matched activity's own text off the baseline. Leaving
    # "activity_description" in the provenance list would attribute the
    # schedule's wording to the model, and that attribution travels to the
    # audit record — so it is dropped at the moment it stops being true.
    if "activity_description" in slots.llm_suggested_fields:
        slots.llm_suggested_fields = [
            f for f in slots.llm_suggested_fields if f != "activity_description"
        ]


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
        # Provenance, not content: which of the supervisor's fields the
        # optional LLM helped read. NULL on a rules-only turn so the column
        # means "a model touched this" rather than "[]".
        llm_assisted_fields=(
            json.dumps(slots.llm_suggested_fields)
            if slots.llm_suggested_fields
            else None
        ),
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
