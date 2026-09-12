"""CSV parser for discipline progress registers and site logs.

Handles:
  - Automatic delimiter detection (comma, semicolon, tab, pipe)
  - Character encoding preservation via textio
  - Column header normalisation via COLUMN_ALIASES
  - Summary row rejection ("TOTAL", "SUBTOTAL")
  - Multi-format date coercion (ISO, DD/MM/YYYY, etc.)
  - Progress and quantity calculations
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from pathlib import Path
from typing import Optional

from .models import (
    DateBasis,
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    Provenance,
)
from .spreadsheet import (
    COLUMN_ALIASES,
    HEADER_KEYWORDS,
    SUMMARY_KEYWORDS,
    coerce_date,
)
from .textio import read_text


class CSVParser:
    """Extract progress events from CSV field registers."""

    def __init__(self, discipline_override: Optional[Discipline] = None):
        self.discipline_override = discipline_override

    def parse(self, filepath: str) -> list[ExtractedEvent]:
        """Parse a CSV file into ExtractedEvents."""
        path = Path(filepath)
        content = read_text(filepath)
        if not content.strip():
            return []

        # Detect delimiter
        first_line = content.splitlines()[0] if content.splitlines() else ""
        delimiter = ","
        for cand in [",", "\t", ";", "|"]:
            if first_line.count(cand) > first_line.count(delimiter):
                delimiter = cand

        reader = csv.reader(io.StringIO(content), delimiter=delimiter)
        raw_rows = [row for row in reader if any(cell.strip() for cell in row)]

        if not raw_rows:
            return []

        # Find header row
        header_idx, col_map = self._find_header(raw_rows)
        if header_idx is None:
            # Fall back to treating first non-empty row as header
            header_idx = 0
            col_map = self._map_columns(raw_rows[0])

        events: list[ExtractedEvent] = []
        for row_idx, row in enumerate(raw_rows[header_idx + 1 :], start=header_idx + 2):
            # Check summary row
            line_str = " ".join(str(c) for c in row).lower()
            if any(kw in line_str for kw in SUMMARY_KEYWORDS):
                continue

            event = self._parse_row(row, col_map, path.name, row_idx)
            if event is not None:
                events.append(event)

        return events

    def _find_header(self, rows: list[list[str]]) -> tuple[Optional[int], dict[int, str]]:
        """Search top rows for a header matching known aliases."""
        for idx, row in enumerate(rows[:10]):
            col_map = self._map_columns(row)
            # Must match at least an activity id or description, plus one other field
            canonical = set(col_map.values())
            if ("activity_id" in canonical or "description" in canonical) and len(canonical) >= 2:
                return idx, col_map
        return None, {}

    def _map_columns(self, header_row: list[str]) -> dict[int, str]:
        """Map column indices to canonical field names."""
        col_map: dict[int, str] = {}
        for col_idx, cell in enumerate(header_row):
            raw = str(cell).strip().lower()
            norm = re.sub(r"[\s_]+", " ", raw)
            if raw in COLUMN_ALIASES:
                col_map[col_idx] = COLUMN_ALIASES[raw]
            elif norm in COLUMN_ALIASES:
                col_map[col_idx] = COLUMN_ALIASES[norm]
            else:
                # Partial matching
                for alias, field in COLUMN_ALIASES.items():
                    if alias in norm and len(alias) >= 4:
                        col_map[col_idx] = field
                        break
        return col_map

    def _parse_row(
        self,
        row: list[str],
        col_map: dict[int, str],
        filename: str,
        row_idx: int,
    ) -> Optional[ExtractedEvent]:
        """Parse one data row into an ExtractedEvent."""
        fields: dict[str, str] = {}
        for col_idx, val in enumerate(row):
            field_name = col_map.get(col_idx)
            if field_name and val.strip():
                fields[field_name] = val.strip()

        if not fields:
            return None

        act_id = fields.get("activity_id", "")
        desc = fields.get("description", "")
        if not act_id and not desc:
            return None

        # Dates
        start_date = coerce_date(fields.get("start_date"))
        end_date = coerce_date(fields.get("end_date"))

        # Quantity
        achieved_qty = self._parse_number(fields.get("achieved_qty"))
        planned_qty = self._parse_number(fields.get("planned_qty"))
        uom = fields.get("uom") or ""

        # Percent
        pct = self._parse_number(fields.get("percent_done"))
        if pct is None and planned_qty and achieved_qty is not None and planned_qty > 0:
            pct = min(100.0, round((achieved_qty / planned_qty) * 100, 1))

        # Discipline
        discipline = self.discipline_override or self._infer_discipline(
            fields.get("discipline", ""), act_id, desc
        )

        # Status
        status_str = fields.get("status", "").lower()
        if "complete" in status_str or "done" in status_str or (pct is not None and pct >= 100):
            status = EventStatus.COMPLETED
        elif "progress" in status_str or "ongoing" in status_str or (pct is not None and pct > 0):
            status = EventStatus.IN_PROGRESS
        elif "delay" in status_str or "hold" in status_str:
            status = EventStatus.DELAYED
        elif start_date and not end_date:
            status = EventStatus.IN_PROGRESS
        elif end_date:
            status = EventStatus.COMPLETED
        else:
            status = EventStatus.UNKNOWN

        # Tags
        tag_val = fields.get("tag", "")
        tags = [t.strip() for t in re.split(r"[,;/]", tag_val) if t.strip()]

        raw_parts = [f"{k}: {v}" for k, v in fields.items()]
        raw_text = " | ".join(raw_parts)

        return ExtractedEvent(
            activity_id=act_id or None,
            activity_description=desc or act_id,
            discipline=discipline,
            status=status,
            tags=tags,
            reported_date=end_date or start_date,
            reported_date_basis=DateBasis.EXPLICIT if (end_date or start_date) else None,
            asserted_start=start_date,
            asserted_start_basis=DateBasis.EXPLICIT if start_date else None,
            asserted_finish=end_date,
            asserted_finish_basis=DateBasis.EXPLICIT if end_date else None,
            quantity=achieved_qty,
            uom=uom,
            percentage=pct,
            raw_text=raw_text,
            provenance=Provenance(
                source_file=filename,
                source_line=row_idx,
                source_row=row_idx,
                source_span=raw_text,
                method=ExtractionMethod.SPREADSHEET,
            ),
        )

    def _parse_number(self, val: Optional[str]) -> Optional[float]:
        if not val:
            return None
        cleaned = re.sub(r"[^\d.]", "", val)
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    def _infer_discipline(self, disc_str: str, act_id: str, desc: str) -> Discipline:
        combined = f"{disc_str} {act_id} {desc}".lower()
        if any(w in combined for w in ["civil", "excav", "conc", "ftg", "found", "civ"]):
            return Discipline.CIVIL
        if any(w in combined for w in ["pip", "spool", "weld", "hydro", "flange", "valve"]):
            return Discipline.PIPING
        if any(w in combined for w in ["elec", "cbl", "cable", "tray", "trans", "swg", "ele"]):
            return Discipline.ELECTRICAL
        if any(w in combined for w in ["inst", "loop", "dcs", "plc", "sensor", "calib"]):
            return Discipline.INSTRUMENTATION
        if any(w in combined for w in ["tank", "vessel", "pump", "comp", "skid", "seq"]):
            return Discipline.STATIC_EQUIPMENT
        if any(w in combined for w in ["hse", "safety", "permit", "fire"]):
            return Discipline.HSE
        return Discipline.UNKNOWN
