"""Spreadsheet parser for discipline progress registers.

Handles:
  - Merged header rows and group headers
  - Column-name normalisation via alias map
  - Summary-row rejection (last row with "TOTAL" or "SUBTOTAL")
  - Multi-format date coercion (ISO, DD/MM/YYYY, DD/Mon/YYYY)
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Optional

from openpyxl import Workbook, load_workbook
from openpyxl.cell.cell import MergedCell

from .models import Discipline, ExtractedEvent, ExtractionMethod, Provenance


# ── Column alias map ─────────────────────────────────────────────────────────
# Maps various column header names to canonical field names.
# Keys are lowercase, stripped.

COLUMN_ALIASES: dict[str, str] = {
    # Activity ID
    "task id": "activity_id",
    "line no.": "activity_id",
    "line no": "activity_id",
    "activity id": "activity_id",
    "activity_id": "activity_id",

    # Description
    "work item": "description",
    "activity name": "description",
    "description": "description",

    # Discipline
    "discipline code": "discipline",
    "discipline": "discipline",

    # Location
    "zone / location": "location",
    "zone/location": "location",
    "location": "location",

    # Start date
    "commenced": "start_date",
    "start date": "start_date",
    "planned start": "start_date",

    # End date
    "target completion": "end_date",
    "end date": "end_date",
    "actual / est. completion": "end_date",
    "planned finish": "end_date",
    "actual completion": "end_date",

    # Quantity
    "planned qty": "planned_qty",
    "achieved qty": "achieved_qty",

    # UoM
    "uom": "uom",
    "uom": "uom",

    # Status
    "status": "status",
    "remarks": "remarks",
    "remarks / jmr ref": "remarks",

    # Progress
    "% done": "percent_done",
    "%": "percent_done",
    "% complete": "percent_done",

    # Tags
    "tag/spool": "tag",
    "tag": "tag",
    "test section": "test_section",
}

# Summary row indicators (case-insensitive substring match)
SUMMARY_KEYWORDS = ["total", "subtotal", "grand total", "summary", "discipline total"]

# Header detection: rows with these patterns are likely headers, not data
HEADER_KEYWORDS = ["identification", "work description", "schedule", "progress", "discipline code"]


# ── Date coercion ────────────────────────────────────────────────────────────

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def coerce_date(value) -> Optional[date]:
    """Coerce various date representations to a date object.

    Handles:
      - datetime.date objects (pass through)
      - ISO strings: 2026-08-03
      - DD/MM/YYYY: 03/08/2026
      - DD/Mon/YYYY: 03/Aug/2026
      - DD Mon YYYY: 03 Aug 2026
      - numeric (Excel serial date)
    """
    if value is None:
        return None

    # Already a date
    if isinstance(value, date):
        return value

    # datetime
    from datetime import datetime
    if isinstance(value, datetime):
        return value.date()

    # Numeric (Excel serial date)
    if isinstance(value, (int, float)):
        if 30000 < value < 50000:  # reasonable range for 2020-2030
            from datetime import timedelta, datetime as dt
            base = dt(1899, 12, 30)  # Excel epoch
            return (base + timedelta(days=int(value))).date()
        return None

    s = str(value).strip()
    if not s:
        return None

    # ISO: 2026-08-03
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None

    # DD/Mon/YYYY: 03/Aug/2026
    m = re.match(r'^(\d{1,2})/([A-Za-z]{3,})/(\d{4})$', s)
    if m:
        mon = MONTH_MAP.get(m.group(2)[:3].lower())
        if mon:
            try:
                return date(int(m.group(3)), mon, int(m.group(1)))
            except ValueError:
                return None

    # DD/MM/YYYY or DD.MM.YYYY
    m = re.match(r'^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$', s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        # Try DD/MM/YYYY first (more common in Indian EPC)
        try:
            return date(y, mo, d)
        except ValueError:
            try:
                return date(y, d, mo)
            except ValueError:
                return None

    # DD Mon YYYY
    m = re.match(r'^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$', s)
    if m:
        mon = MONTH_MAP.get(m.group(2)[:3].lower())
        if mon:
            try:
                return date(int(m.group(3)), mon, int(m.group(1)))
            except ValueError:
                return None

    return None


# ── Spreadsheet parser ───────────────────────────────────────────────────────

class SpreadsheetParser:
    """Parse an EPC discipline progress spreadsheet into ExtractedEvents."""

    def __init__(self, discipline_override: Optional[Discipline] = None):
        self.discipline_override = discipline_override

    def parse(self, filepath: str) -> list[ExtractedEvent]:
        """Parse an xlsx file and return ExtractedEvents."""
        wb = load_workbook(filepath, data_only=True)
        ws = wb.active
        filename = Path(filepath).name

        # Step 1: Find the header row
        header_row, col_map = self._detect_headers(ws)

        if header_row is None:
            return []

        # Step 2: Parse data rows
        events: list[ExtractedEvent] = []
        max_row = ws.max_row

        for row_num in range(header_row + 1, max_row + 1):
            row_data = self._read_row(ws, row_num, col_map)

            # Step 3: Reject summary rows
            if self._is_summary_row(row_data):
                continue

            # Skip empty rows
            if not any(v for v in row_data.values() if v is not None and str(v).strip()):
                continue

            event = self._row_to_event(row_data, row_num, filename)
            if event:
                events.append(event)

        wb.close()
        return events

    def _detect_headers(
        self, ws
    ) -> tuple[Optional[int], dict[str, int]]:
        """Find the actual data header row (skip merged group headers, titles).

        Returns (header_row_number, {canonical_name: column_index}).
        """
        for row_num in range(1, min(ws.max_row + 1, 10)):
            cells = []
            for col in range(1, ws.max_column + 1):
                cell = ws.cell(row=row_num, column=col)
                if isinstance(cell, MergedCell):
                    continue
                val = cell.value
                if val and isinstance(val, str):
                    cells.append((col, val.strip()))

            if len(cells) < 3:
                continue

            # Check if this looks like a data header row
            col_map = {}
            for col_idx, header_text in cells:
                canonical = COLUMN_ALIASES.get(header_text.lower().strip())
                if canonical:
                    col_map[canonical] = col_idx

            # Must have at least activity_id and description
            if "activity_id" in col_map and "description" in col_map:
                return row_num, col_map

        return None, {}

    def _read_row(self, ws, row_num: int, col_map: dict[str, int]) -> dict[str, any]:
        """Read a row using the column map."""
        data = {}
        for canonical, col_idx in col_map.items():
            cell = ws.cell(row=row_num, column=col_idx)
            if isinstance(cell, MergedCell):
                # For merged cells, read from the parent
                data[canonical] = None
            else:
                data[canonical] = cell.value
        return data

    def _is_summary_row(self, row_data: dict) -> bool:
        """Check if this row is a summary/total row."""
        # Check all string values for summary keywords
        for val in row_data.values():
            if val and isinstance(val, str):
                lower = val.lower().strip()
                for kw in SUMMARY_KEYWORDS:
                    if kw in lower:
                        return True
        return False

    def _row_to_event(
        self, row_data: dict, row_num: int, filename: str
    ) -> Optional[ExtractedEvent]:
        """Convert a parsed row into an ExtractedEvent."""
        activity_id = row_data.get("activity_id")
        if not activity_id:
            return None
        activity_id = str(activity_id).strip()

        description = str(row_data.get("description", "") or "").strip()
        if not description:
            return None

        # Build raw text from available fields
        raw_parts = [description]
        if row_data.get("remarks"):
            raw_parts.append(str(row_data["remarks"]))
        if row_data.get("location"):
            raw_parts.append(f"Location: {row_data['location']}")
        raw_text = " — ".join(raw_parts)

        # Extract discipline
        disc_str = str(row_data.get("discipline", "") or "").strip().lower()
        discipline = Discipline.UNKNOWN
        if disc_str:
            # Map spreadsheet codes to our enum
            disc_map = {
                "pip": Discipline.PIPING,
                "civ": Discipline.CIVIL,
                "ele": Discipline.ELECTRICAL,
                "ins": Discipline.INSTRUMENTATION,
                "seq": Discipline.STATIC_EQUIPMENT,
                "hse": Discipline.HSE,
            }
            discipline = disc_map.get(disc_str, Discipline.UNKNOWN)
        if discipline == Discipline.UNKNOWN and self.discipline_override:
            discipline = self.discipline_override

        # Extract percentage
        pct = row_data.get("percent_done")
        if pct is not None:
            try:
                pct = float(pct)
            except (ValueError, TypeError):
                pct = None

        # Extract quantities
        planned_qty = row_data.get("planned_qty")
        achieved_qty = row_data.get("achieved_qty")
        try:
            planned_qty = float(planned_qty) if planned_qty is not None else None
            achieved_qty = float(achieved_qty) if achieved_qty is not None else None
        except (ValueError, TypeError):
            planned_qty = None
            achieved_qty = None

        # Determine status from status column or achieved vs planned
        status_str = str(row_data.get("status", "") or "").strip().lower()
        status_map = {
            "complete": "completed",
            "completed": "completed",
            "done": "completed",
            "in progress": "in_progress",
            "not started": "not_started",
            "delayed": "delayed",
        }
        status = status_map.get(status_str, "unknown")
        if status == "unknown" and pct is not None:
            if pct >= 100:
                status = "completed"
            elif pct > 0:
                status = "in_progress"

        # Date fields
        start_date = coerce_date(row_data.get("start_date"))
        end_date = coerce_date(row_data.get("end_date"))

        # Tags from tag column
        tags = []
        tag_val = row_data.get("tag")
        if tag_val and str(tag_val).strip() not in ("—", "-", "", "None"):
            tags.append(str(tag_val).strip())

        return ExtractedEvent(
            raw_text=raw_text,
            tags=tags,
            quantity=achieved_qty or planned_qty,
            uom=str(row_data.get("uom", "") or "").strip() or None,
            discipline=discipline,
            status=status,
            percentage=pct,
            provenance=Provenance(
                source_file=filename,
                source_row=row_num,
                source_span=raw_text,
                method=ExtractionMethod.SPREADSHEET,
            ),
        )
