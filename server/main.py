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
import re
import statistics
import uuid
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extraction.extractor import Extractor
from extraction.models import ExtractedEvent as PydanticEvent
from matching import Decision, MatchingEngine, RollupAccumulator, Thresholds

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
    ExportRequest,
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

    with open(schedule_path) as f:
        activities = json.load(f)

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
    source_file: Optional[str] = None,
    source_span: Optional[str] = None,
    confidence: Optional[float] = None,
    auto_applied: bool = False,
    model_version: str = "prepass-v1",
) -> AuditRecord:
    """Create an immutable audit record. Called on EVERY actual-date write."""
    record = AuditRecord(
        id=_uuid(),
        activity_id=activity_id,
        timestamp=_now(),
        field_changed=field,
        old_value=old_value,
        new_value=new_value,
        source=source,
        source_file=source_file,
        source_span=source_span,
        confidence=confidence,
        model_version=model_version,
        auto_applied=auto_applied,
    )
    db.add(record)
    return record


# ── Schedule actuals from matching/ rollup ───────────────────────────────────

def _apply_rollup_to_schedule(db: Session, results) -> int:
    """Write rolled-up actual progress onto the schedule.

    Called with matching.RollupAccumulator results (AUTO_LINK decisions only):

      * actual_start   — earliest reported progress date (integrity-validated)
      * actual_qty     — max(current, rolled-up installed qty); never decreases.
                         Quantity-based percent complete: 40 m of 120 m = 33%.
      * actual_finish  — written ONLY when the node is 100% complete

    Every field change gets an immutable AuditRecord
    (source="matching", auto_applied=True).
    """
    audits = 0
    for r in results:
        act = db.query(Activity).filter(Activity.activity_id == r.activity_id).first()
        if act is None:
            continue
        span = r.event_texts[0] if r.event_texts else None

        # Actual Start — earliest evidence of work beginning
        if r.actual_start is not None and (
            act.actual_start is None or r.actual_start < act.actual_start
        ):
            try:
                validate_actual_start(act, r.actual_start, DATA_DATE)
            except IntegrityError as e:
                logger.warning("Integrity block on actual_start: %s", e)
            else:
                _write_audit(
                    db, r.activity_id,
                    field="actual_start",
                    old_value=act.actual_start.isoformat() if act.actual_start else None,
                    new_value=r.actual_start.isoformat(),
                    source="matching",
                    source_span=span,
                    confidence=1.0,
                    auto_applied=True,
                    model_version=MATCHING_MODEL_VERSION,
                )
                act.actual_start = r.actual_start
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
                source_span=span,
                confidence=1.0,
                auto_applied=True,
                model_version=MATCHING_MODEL_VERSION,
            )
            act.actual_qty = new_qty
            audits += 1

        # Actual Finish — ONLY when the node is actually complete
        if r.is_complete and r.actual_finish is not None:
            try:
                validate_actual_finish(act, r.actual_finish)
            except IntegrityError as e:
                logger.warning("Integrity block on actual_finish: %s", e)
            else:
                if act.actual_finish != r.actual_finish:
                    _write_audit(
                        db, r.activity_id,
                        field="actual_finish",
                        old_value=act.actual_finish.isoformat() if act.actual_finish else None,
                        new_value=r.actual_finish.isoformat(),
                        source="matching",
                        source_span=span,
                        confidence=1.0,
                        auto_applied=True,
                        model_version=MATCHING_MODEL_VERSION,
                    )
                    act.actual_finish = r.actual_finish
                    audits += 1

        act.compute_variance(DATA_DATE)
    return audits


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
        if auto_pairs:
            accumulator = RollupAccumulator(get_matching_engine())
            for event, decision in auto_pairs:
                accumulator.add(decision, event)
            _apply_rollup_to_schedule(db, accumulator.results())

        # Update job
        job.status = "completed"
        job.event_count = event_count
        job.linked_count = linked_count
        job.review_count = review_count
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
            source_file=le.source_file,
            source_span=le.source_span,
            confidence=le.confidence,
        )
        audit_count += 1

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
            source_file=le.source_file,
            source_span=le.source_span,
            confidence=le.confidence,
        )
        audit_count += 1

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
            source_file=le.source_file,
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
                actual_qty=act.actual_qty,
                start_variance_days=act.start_variance_days,
                finish_variance_days=act.finish_variance_days,
                percent_complete=pct,
                predecessors=act.predecessor_list(),
            )
        )

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

    results = []
    for reason, act_ids in sorted(reasons.items(), key=lambda x: -len(x[1])):
        results.append(DelayReason(
            reason=reason,
            frequency=len(act_ids),
            affected_activities=list(set(act_ids))[:10],
        ))

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
    if median_actual is not None:
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
    """Slot-filling conversational logging turn.

    The agent asks for missing fields and fills them incrementally.
    When all required slots are filled, it creates a LinkedEvent.
    """
    session_id = req.session_id or str(uuid.uuid4())

    # Get or create conversation state
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

    # Parse the user message for slot values
    _fill_slots_from_message(slots, req.message, db)

    # Determine which slots are still pending
    required_slots = ["discipline", "location", "status"]
    pending = [s for s in required_slots if getattr(slots, s) is None]

    # Generate agent response
    if pending:
        slot_name = pending[0]
        prompts = {
            "discipline": "Which discipline? (civil, piping, electrical, instrumentation, hse, static_equipment)",
            "location": "Where is this work happening? (zone, area, or specific location)",
            "status": "What's the status? (completed, in_progress, delayed, not_started)",
        }
        agent_msg = prompts.get(slot_name, f"Please provide: {slot_name}")
        event_created = False
        linked_event_id = None
        confidence = 0.0
    else:
        # All slots filled — create the event
        event_id = _create_event_from_slots(slots, session_id, db)
        if event_id:
            event_created = True
            linked_event_id = event_id
            confidence = slots.confidence if hasattr(slots, 'confidence') else 0.8
            agent_msg = f"Progress logged for {slots.activity_id or 'new activity'}: {slots.status}. Thank you!"
        else:
            event_created = False
            agent_msg = "Could not create event. Please check the details and try again."
            confidence = 0.0

    # Save conversation turn
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
    )


def _fill_slots_from_message(slots: SlotState, message: str, db: Session) -> None:
    """Extract slot values from a free-text message using regex + keyword matching."""
    msg_lower = message.lower()

    # Discipline
    if slots.discipline is None:
        disc_keywords = {
            "civil": ["civil", "foundation", "concrete", "backfill", "grading", "slab", "flooring", "tile", "plaster", "drainage", "fencing"],
            "piping": ["pipe", "spool", "flange", "hydrotest", "erect", "insulation", "coating", "paint"],
            "static_equipment": ["vessel", "exchanger", "pump", "compressor", "skid", "tank", "setting", "jacking", "grout"],
            "electrical": ["cable", "termination", "earthing", "grounding", "transformer", "swgr", "panel", "energis", "megger", "motor"],
            "instrumentation": ["instrument", "transmitter", "calibrat", "loop check", "dcs", "sis", "esd", "junction box", "control valve"],
            "hse": ["safety", "ncr", "near-miss", "lti", "bbs", "scaffold", "permit", "jsa", "induction", "drill"],
        }
        for disc, keywords in disc_keywords.items():
            if any(kw in msg_lower for kw in keywords):
                slots.discipline = disc
                break

    # Tags (equipment/line tags)
    if not slots.tags:
        from extraction.prepass import PIPE_TAG_RE, EQUIPMENT_TAG_RE
        tags = []
        for m in PIPE_TAG_RE.finditer(message):
            size, _, num, spec = m.groups()
            tags.append(f'{size}"-P-{num}-{spec.upper()}')
        for m in EQUIPMENT_TAG_RE.finditer(message):
            prefix, suffix = m.groups()
            tags.append(f"{prefix}-{suffix}")
        # Also match common patterns
        tk_match = re.search(r'TK-(\d+)', message, re.IGNORECASE)
        if tk_match:
            tags.append(f"TK-{tk_match.group(1)}")
        slots.tags = tags

    # Quantity + UOM
    if slots.quantity is None:
        qty_match = re.search(r'(\d+(?:\.\d+)?)\s*(m3|m2|lm|mt|m|nos?|mm|km|panels?|spools?|flanges?|tonnes?)\b', msg_lower)
        if qty_match:
            slots.quantity = float(qty_match.group(1))
            slots.uom = qty_match.group(2)

    # Status
    if slots.status is None:
        if any(w in msg_lower for w in ["complete", "done", "finished", "passed", "closed", "khotom"]):
            slots.status = "completed"
        elif any(w in msg_lower for w in ["delay", "delayed", "behind", "held up"]):
            slots.status = "delayed"
        elif any(w in msg_lower for w in ["started", "ongoing", "in progress", "chalu", "shuru"]):
            slots.status = "in_progress"

    # Activity ID (if mentioned)
    if slots.activity_id is None:
        act_match = re.search(r'\b([A-Z]{2,3}-[A-Z]{2,4}-\d{4})\b', message)
        if act_match:
            slots.activity_id = act_match.group(1)

    # Location
    if slots.location is None:
        loc_match = re.search(r'\b(zone\s+[A-Z]|area\s+\w+|tier\s+\d+|workshop|field|pump\s+house|pipe\s+rack)\b', msg_lower)
        if loc_match:
            slots.location = loc_match.group(0).title()

    # Date
    if slots.date is None:
        if "yesterday" in msg_lower:
            slots.date = DATA_DATE - timedelta(days=1)
        elif "today" in msg_lower:
            slots.date = DATA_DATE

    # Try to match activity if not found
    if slots.activity_id is None and slots.tags:
        # Simple tag → activity lookup (no full linking engine needed)
        activities = db.query(Activity).all()
        tag_to_act = {}
        for act in activities:
            if act.tag:
                tag_to_act[act.tag.lower()] = act.activity_id

        for tag in slots.tags:
            if tag.lower() in tag_to_act:
                slots.activity_id = tag_to_act[tag.lower()]
                break


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


def _create_event_from_slots(slots: SlotState, session_id: str, db: Session) -> Optional[str]:
    """Create a LinkedEvent from filled slots."""
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
    raw_text = f"Agent-logged: {slots.description or 'progress update'}"

    # Try to link
    linked_id = slots.activity_id
    confidence = 0.7  # Default for agent-logged events

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
        alternatives="[]",
        reviewed=False,
    )
    db.add(le)
    db.flush()

    # Write audit record if actual dates are being set
    if linked_id and slots.date and slots.status:
        activity = db.query(Activity).filter(Activity.activity_id == linked_id).first()
        if activity:
            if slots.status == "completed" and not activity.actual_finish:
                # Integrity check: finish must be >= start
                if activity.actual_start and slots.date < activity.actual_start:
                    pass  # Don't write invalid date
                else:
                    old_finish = activity.actual_finish.isoformat() if activity.actual_finish else None
                    activity.actual_finish = slots.date
                    _write_audit(
                        db, linked_id, "actual_finish",
                        old_finish, slots.date.isoformat(),
                        source="agent_turn",
                        source_file=f"agent_session_{session_id}",
                        source_span=raw_text,
                        confidence=confidence,
                        auto_applied=True,
                    )

            if slots.status in ("in_progress", "completed") and not activity.actual_start:
                # Integrity check: start must be <= data_date
                if slots.date > DATA_DATE:
                    pass  # Don't write date after data_date
                else:
                    old_start = activity.actual_start.isoformat() if activity.actual_start else None
                    activity.actual_start = slots.date
                    _write_audit(
                        db, linked_id, "actual_start",
                        old_start, slots.date.isoformat(),
                        source="agent_turn",
                        source_file=f"agent_session_{session_id}",
                        source_span=raw_text,
                        confidence=confidence,
                        auto_applied=True,
                    )

            # Also create alias for future matching
            if slots.tags:
                _upsert_alias(db, raw_text, linked_id, slots.discipline or "unknown", slots.tags)

    return le.id


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
