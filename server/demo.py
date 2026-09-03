"""Resetting the demo database to a known seeded state.

One implementation, two front doors: `scripts/seed.py` for the terminal and
`POST /admin/reset` for the browser. Keeping the logic here means the two can
never drift into resetting different things.

The reset clears rows rather than deleting the database file, so it works while
the server is running — no restart, and no fighting Windows over a held file
handle.
"""

from __future__ import annotations

import asyncio
import io
from pathlib import Path
from typing import Callable, Optional

from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET = PROJECT_ROOT / "dataset"


def source_files(dpr_only: bool = False) -> list[Path]:
    """The files a clean demo is built from, in ingest order."""
    files = sorted(DATASET.glob("dpr_day_*.txt"))
    if not dpr_only:
        files += sorted(DATASET.glob("*_progress.xlsx"))
    return files


def _schema_matches(engine) -> bool:
    """True when every model column exists in the database.

    SQLAlchemy's create_all adds missing tables but never missing columns, so a
    database created before a model gained a field keeps working right up until
    the first insert, which then fails at the worst possible moment. Checking up
    front turns that into a rebuild.
    """
    from sqlalchemy import inspect

    from server.db import Base

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing:
            return False
        have = {c["name"] for c in inspector.get_columns(table.name)}
        if not {c.name for c in table.columns} <= have:
            return False
    return True


def clear_progress(db: Session) -> None:
    """Remove every trace of ingestion, leaving the baseline schedule intact.

    Activities are reset rather than deleted: the baseline is read-only
    reference data, so re-loading it every time would be wasted work and would
    churn rows a planner may be looking at.
    """
    from server.db import (
        Activity,
        AuditRecord,
        Job,
        LinkedEvent,
        RaidItem,
        ReviewQueueItem,
    )

    # Children before parents: audit records and review items both reference
    # linked events, which reference jobs.
    #
    # RaidItem is here because a planner can now write to it. Its rows are
    # adjudications of candidates derived from the audit trail, so once that
    # trail is cleared a surviving register entry cites evidence the database
    # no longer holds — and a reset that leaves it behind is not the "known
    # clean state" the demo script promises. The candidates themselves are
    # recomputed from the audit records on every read, so they come back on
    # their own.
    for model in (ReviewQueueItem, AuditRecord, LinkedEvent, Job, RaidItem):
        db.query(model).delete()
    db.query(Activity).update({
        Activity.actual_start: None,
        Activity.actual_finish: None,
        Activity.actual_qty: None,
        Activity.start_variance_days: None,
        Activity.finish_variance_days: None,
    })
    db.commit()


def ingest_one(path: Path) -> dict:
    """Push one file through POST /ingest's own handler.

    Calls the endpoint function directly rather than reimplementing the
    pipeline, so a reset cannot drift from what the API does. Passing `file`
    and `db` explicitly bypasses FastAPI's dependency injection.
    """
    from fastapi import UploadFile

    from server.db import Job, engine
    from server.main import ingest_file

    upload = UploadFile(filename=path.name, file=io.BytesIO(path.read_bytes()))
    with Session(engine) as db:
        response = asyncio.run(ingest_file(file=upload, db=db))
        job = db.query(Job).filter(Job.id == response.job_id).first()
        return {
            "file": path.name,
            "events": (job.event_count or 0) if job else 0,
            "linked": (job.linked_count or 0) if job else 0,
            "review": (job.review_count or 0) if job else 0,
        }


def summarise(db: Session) -> dict:
    """The counts worth checking before a rehearsal run."""
    from server.db import Activity, AuditRecord, ReviewQueueItem

    return {
        "activities": db.query(Activity).count(),
        "activities_with_actuals": db.query(Activity).filter(
            Activity.actual_start.isnot(None)).count(),
        "activities_completed": db.query(Activity).filter(
            Activity.actual_finish.isnot(None)).count(),
        "audit_records": db.query(AuditRecord).count(),
        "source_conflicts": db.query(AuditRecord).filter(
            AuditRecord.conflict.is_(True)).count(),
        "review_pending": db.query(ReviewQueueItem).filter(
            ReviewQueueItem.status == "pending").count(),
    }


def reset_demo(
    dpr_only: bool = False,
    on_file: Optional[Callable[[dict], None]] = None,
) -> dict:
    """Clear everything and re-ingest the dataset. Returns summary counts.

    `on_file` is called after each file so a CLI can print progress; the HTTP
    route ignores it.
    """
    from server.db import Base, engine, init_db
    from server.main import _seed_schedule_if_empty

    init_db()

    # A model that gained a column since this database was built would fail on
    # the first insert. Rebuilding is safe: everything here is regenerated from
    # dataset/, so there is nothing to preserve.
    if not _schema_matches(engine):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        clear_progress(db)
        _seed_schedule_if_empty(db)
        if db.query(_activity_model()).count() == 0:
            raise RuntimeError(
                "No activities loaded — is dataset/baseline_schedule.json present?"
            )

    files = source_files(dpr_only)
    if not files:
        raise RuntimeError(f"No source files found in {DATASET}")

    per_file = []
    for path in files:
        counts = ingest_one(path)
        per_file.append(counts)
        if on_file:
            on_file(counts)

    with Session(engine) as db:
        summary = summarise(db)

    summary["files_ingested"] = len(per_file)
    summary["events_extracted"] = sum(f["events"] for f in per_file)
    summary["auto_linked"] = sum(f["linked"] for f in per_file)
    summary["files"] = per_file
    return summary


def _activity_model():
    from server.db import Activity

    return Activity
