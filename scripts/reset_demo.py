"""Reset the demo database to a known seeded state.

Safe to run while the server is up: it clears rows rather than deleting the
database file, so there is no restart and no held-file-handle fight on Windows.

    python scripts/reset_demo.py            # full reset
    python scripts/reset_demo.py --dpr-only # skip the spreadsheets
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main() -> int:
    ap = argparse.ArgumentParser(description="Reset the demo database")
    ap.add_argument("--dpr-only", action="store_true",
                    help="ingest only the DPR text files, not the spreadsheets")
    args = ap.parse_args()

    from server.db import DB_PATH
    from server.demo import reset_demo

    print(f"database: {DB_PATH}")
    print("clearing ingest data and re-ingesting ...")

    def show(counts: dict) -> None:
        print(f"  {counts['file']:<28} {counts['events']:>3} events, "
              f"{counts['linked']:>3} linked, {counts['review']:>3} review")

    try:
        summary = reset_demo(dpr_only=args.dpr_only, on_file=show)
    except Exception as e:                                   # noqa: BLE001
        print(f"ERROR: {e}")
        return 1

    print()
    print("=" * 62)
    for label, key in (
        ("activities", "activities"),
        ("events extracted", "events_extracted"),
        ("auto-linked", "auto_linked"),
        ("review items pending", "review_pending"),
        ("activities with actual dates", "activities_with_actuals"),
        ("  ... of which completed", "activities_completed"),
        ("audit records", "audit_records"),
        ("source conflicts recorded", "source_conflicts"),
    ):
        print(f"  {label:<38} {summary[key]:>8}")
    print("=" * 62)
    print()
    print("Reset complete. The running server picks this up immediately;")
    print("reload the browser, no restart needed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
