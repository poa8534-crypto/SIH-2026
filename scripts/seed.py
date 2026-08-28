"""Build a working database from scratch.

Loads the 120-activity baseline schedule, then runs the full
extraction -> matching -> persistence pipeline over every source file in
dataset/ and prints a summary.

Runs entirely in-process: it does NOT need the server to be running, and it
uses the same code paths POST /ingest uses, so what you get here is what the
API would have produced.

    python scripts/seed.py              # rebuild from scratch
    python scripts/seed.py --keep       # add to the existing database
    python scripts/seed.py --dpr-only   # skip the spreadsheets
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

DATASET = PROJECT_ROOT / "dataset"


def source_files(dpr_only: bool) -> list[Path]:
    files = sorted(DATASET.glob("dpr_day_*.txt"))
    if not dpr_only:
        files += sorted(DATASET.glob("*_progress.xlsx"))
    return files


def ingest_one(path: Path) -> dict:
    """Push one file through POST /ingest's own handler.

    Calls the endpoint function directly rather than reimplementing the
    pipeline, so seeding cannot drift from what the API does. The server does
    not need to be running: the handler is an ordinary coroutine, and passing
    `file` and `db` explicitly bypasses FastAPI's dependency injection.
    """
    import asyncio

    from fastapi import UploadFile
    from sqlalchemy.orm import Session

    from server.db import engine
    from server.main import ingest_file

    upload = UploadFile(filename=path.name, file=io.BytesIO(path.read_bytes()))
    with Session(engine) as db:
        response = asyncio.run(ingest_file(file=upload, db=db))
        job = _job_counts(db, response.job_id)
    return job


def _job_counts(db, job_id: str) -> dict:
    from server.db import Job
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        return {"events": 0, "linked": 0, "review": 0}
    return {
        "events": job.event_count or 0,
        "linked": job.linked_count or 0,
        "review": job.review_count or 0,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Seed the EPC progress database")
    ap.add_argument("--keep", action="store_true",
                    help="keep existing ingest data instead of starting clean")
    ap.add_argument("--dpr-only", action="store_true",
                    help="ingest only the DPR text files, not the spreadsheets")
    args = ap.parse_args()

    # Imported after sys.path is set so the script runs from any directory.
    from server.db import (
        Activity, AuditRecord, Base, DB_PATH, Job, LinkedEvent,
        ReviewQueueItem, engine, init_db,
    )
    from sqlalchemy.orm import Session

    print(f"database: {DB_PATH}")
    init_db()

    with Session(engine) as db:
        if not args.keep:
            print("clearing previous ingest data ...")
            for model in (ReviewQueueItem, AuditRecord, LinkedEvent, Job):
                db.query(model).delete()
            db.query(Activity).update({
                Activity.actual_start: None, Activity.actual_finish: None,
                Activity.actual_qty: None, Activity.start_variance_days: None,
                Activity.finish_variance_days: None,
            })
            db.commit()

        # Baseline schedule. _seed_schedule_if_empty is a no-op when the
        # activities table is already populated.
        from server.main import _seed_schedule_if_empty
        _seed_schedule_if_empty(db)
        activity_count = db.query(Activity).count()
        print(f"baseline schedule: {activity_count} activities")
        if activity_count == 0:
            print("ERROR: no activities loaded — is dataset/baseline_schedule.json present?")
            return 1

    files = source_files(args.dpr_only)
    if not files:
        print(f"ERROR: no source files found in {DATASET}")
        return 1

    print(f"ingesting {len(files)} files ...")
    totals = {"events": 0, "linked": 0, "review": 0}
    for path in files:
        try:
            counts = ingest_one(path)
        except Exception as e:                        # noqa: BLE001
            print(f"  {path.name:<28} FAILED: {e}")
            continue
        for key in totals:
            totals[key] += counts[key]
        print(f"  {path.name:<28} {counts['events']:>3} events, "
              f"{counts['linked']:>3} linked, {counts['review']:>3} review")

    with Session(engine) as db:
        with_actuals = db.query(Activity).filter(Activity.actual_start.isnot(None)).count()
        completed = db.query(Activity).filter(Activity.actual_finish.isnot(None)).count()
        distinct = db.query(Activity).filter(
            Activity.actual_start.isnot(None),
            Activity.actual_finish.isnot(None),
            Activity.actual_start != Activity.actual_finish,
        ).count()
        audits = db.query(AuditRecord).count()
        conflicts = db.query(AuditRecord).filter(AuditRecord.conflict.is_(True)).count()
        pending = db.query(ReviewQueueItem).filter(
            ReviewQueueItem.status == "pending").count()

    print()
    print("=" * 62)
    print(f"  {'activities':<38}{activity_count:>10}")
    print(f"  {'events extracted':<38}{totals['events']:>10}")
    print(f"  {'auto-linked':<38}{totals['linked']:>10}")
    print(f"  {'review items pending':<38}{pending:>10}")
    print(f"  {'activities with actual dates':<38}{with_actuals:>10}")
    print(f"  {'  ... of which completed':<38}{completed:>10}")
    print(f"  {'  ... with distinct start and finish':<38}{distinct:>10}")
    print(f"  {'audit records':<38}{audits:>10}")
    print(f"  {'source conflicts recorded':<38}{conflicts:>10}")
    print("=" * 62)
    print()
    print("Seeded. Start the server from the project root:")
    print("    python -m uvicorn server.main:app --reload")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
