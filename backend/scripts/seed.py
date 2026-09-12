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

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

DATASET = PROJECT_ROOT / "dataset"


def main() -> int:
    ap = argparse.ArgumentParser(description="Seed the EPC progress database")
    ap.add_argument("--keep", action="store_true",
                    help="keep existing ingest data instead of starting clean")
    ap.add_argument("--dpr-only", action="store_true",
                    help="ingest only the DPR text files, not the spreadsheets")
    args = ap.parse_args()

    # Imported after sys.path is set so the script runs from any directory.
    from server.db import DB_PATH
    from server.demo import (
        clear_progress, ingest_one, source_files, summarise,
    )
    from server.db import Activity, AuditRecord, ReviewQueueItem, engine, init_db
    from sqlalchemy.orm import Session

    print(f"database: {DB_PATH}")
    init_db()

    with Session(engine) as db:
        if not args.keep:
            print("clearing previous ingest data ...")
            clear_progress(db)

        # Baseline schedule. _seed_schedule_if_empty is a no-op when the
        # activities table is already populated.
        from server.main import _seed_schedule_if_empty
        _seed_schedule_if_empty(db)
        activity_count = db.query(Activity).count()
        print(f"baseline schedule: {activity_count} activities")
        if activity_count == 0:
            print("ERROR: no activities loaded — is dataset/baseline_schedule.json present?")
            return 1

    # The workforce register. Seeded before ingestion so that the muster days
    # anchored to the DPR corpus (the 15 Aug holiday, the 2 Sep rain, the
    # 14 Sep "Labour kam tha aaj") are already in place when the reports those
    # dates come from are ingested.
    with Session(engine) as db:
        from server.seed_workforce import seed_all
        wf = seed_all(db)
        print(f"workforce: {wf['crews']} crews, {wf['attendance']} musters, "
              f"{wf['assignments']} assignments")

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
    print("    python -m uvicorn server.main:app --app-dir backend --reload")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
