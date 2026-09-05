"""PDF parser for digital daily progress reports and scanned site diaries.

Uses:
  - PyMuPDF (pymupdf) for fast native vector text, block, and table extraction
  - extraction.ocr for scanned photocopy / photographic page transcription
  - Column alignment and table parsing matching EPC report layouts
"""

from __future__ import annotations

import logging
import re
from datetime import date
from pathlib import Path
from typing import Optional

import pymupdf

from .models import (
    DateBasis,
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    ExtractionResult,
    Provenance,
)
from .ocr import OCRUnavailableError, is_ocr_available, ocr_image_bytes
from .spreadsheet import (
    COLUMN_ALIASES,
    HEADER_KEYWORDS,
    SUMMARY_KEYWORDS,
    coerce_date,
)

logger = logging.getLogger(__name__)


class PDFParser:
    """Extract progress events and text spans from PDF documents."""

    def __init__(self, reference_date: Optional[date] = None):
        self.reference_date = reference_date or date(2026, 8, 15)

    def parse(self, filepath: str) -> tuple[list[tuple[str, int, int]], list[ExtractedEvent], list[str]]:
        """Parse a PDF file into text spans and structured table events.

        Returns:
            (text_spans, table_events, warnings)
            where text_spans is a list of (line_text, page_num, line_num).
        """
        path = Path(filepath)
        text_spans: list[tuple[str, int, int]] = []
        table_events: list[ExtractedEvent] = []
        warnings: list[str] = []

        try:
            doc = pymupdf.open(filepath)
        except Exception as e:
            warnings.append(f"Failed to open PDF {path.name}: {e}")
            return [], [], warnings

        for page_idx, page in enumerate(doc):
            page_num = page_idx + 1

            # 1. Check for vector / digital tables
            page_tables_found = False
            try:
                tabs = page.find_tables()
                if tabs.tables:
                    for tab in tabs.tables:
                        extracted = self._parse_pdf_table(tab.extract(), path.name, page_num)
                        if extracted:
                            table_events.extend(extracted)
                            page_tables_found = True
            except Exception as e:
                logger.debug("Table search failed on page %d: %s", page_num, e)

            # 2. Extract text blocks
            blocks = page.get_text("blocks")
            page_text = ""
            for b_idx, block in enumerate(blocks):
                # block: (x0, y0, x1, y1, text, block_no, block_type)
                b_text = block[4]
                page_text += b_text + "\n"
                for line_idx, line in enumerate(b_text.splitlines(), start=1):
                    stripped = line.strip()
                    if stripped and len(stripped) >= 3:
                        text_spans.append((stripped, page_num, line_idx))

            # 3. Check if page is a scanned image without embedded text
            if len(page_text.strip()) < 30:
                images = page.get_images()
                if images or len(blocks) == 0:
                    # Page is scanned
                    logger.info("Page %d of %s appears to be scanned", page_num, path.name)
                    if is_ocr_available():
                        try:
                            # Render page to high-res image
                            pix = page.get_pixmap(dpi=150)
                            img_bytes = pix.tobytes("png")
                            ocr_text = ocr_image_bytes(img_bytes, mime_type="image/png")
                            for line_idx, line in enumerate(ocr_text.splitlines(), start=1):
                                stripped = line.strip()
                                if stripped:
                                    text_spans.append((stripped, page_num, line_idx))
                        except OCRUnavailableError as ue:
                            warnings.append(f"Page {page_num}: {ue}")
                        except Exception as oe:
                            warnings.append(f"Page {page_num} OCR failed: {oe}")
                    else:
                        warnings.append(
                            f"Page {page_num} is a scanned document with no digital text layer. "
                            "Set GEMINI_API_KEY or install pytesseract to enable AI OCR."
                        )

        doc.close()
        return text_spans, table_events, warnings

    def _parse_pdf_table(
        self,
        raw_rows: list[list[Optional[str]]],
        filename: str,
        page_num: int,
    ) -> list[ExtractedEvent]:
        """Convert a 2D table extracted from PDF into ExtractedEvents."""
        if not raw_rows or len(raw_rows) < 2:
            return []

        # Clean string cells
        cleaned_rows = [
            [str(c or "").strip() for c in row]
            for row in raw_rows
            if any(str(c or "").strip() for c in row)
        ]
        if not cleaned_rows:
            return []

        # Find header row
        header_row = cleaned_rows[0]
        col_map: dict[int, str] = {}
        for col_idx, cell in enumerate(header_row):
            raw = str(cell).strip().lower()
            norm = re.sub(r"[\s_]+", " ", raw)
            if raw in COLUMN_ALIASES:
                col_map[col_idx] = COLUMN_ALIASES[raw]
            elif norm in COLUMN_ALIASES:
                col_map[col_idx] = COLUMN_ALIASES[norm]
            else:
                for alias, field in COLUMN_ALIASES.items():
                    if alias in norm and len(alias) >= 4:
                        col_map[col_idx] = field
                        break

        if not col_map or ("activity_id" not in col_map.values() and "description" not in col_map.values()):
            return []

        events: list[ExtractedEvent] = []
        for r_idx, row in enumerate(cleaned_rows[1:], start=2):
            line_str = " ".join(row).lower()
            if any(kw in line_str for kw in SUMMARY_KEYWORDS):
                continue

            fields: dict[str, str] = {}
            for col_idx, val in enumerate(row):
                fname = col_map.get(col_idx)
                if fname and val:
                    fields[fname] = val

            act_id = fields.get("activity_id", "")
            desc = fields.get("description", "")
            if not act_id and not desc:
                continue

            start_date = coerce_date(fields.get("start_date"))
            end_date = coerce_date(fields.get("end_date"))

            achieved_qty = self._parse_number(fields.get("achieved_qty"))
            planned_qty = self._parse_number(fields.get("planned_qty"))
            uom = fields.get("uom", "")

            pct = self._parse_number(fields.get("percent_done"))
            if pct is None and planned_qty and achieved_qty is not None and planned_qty > 0:
                pct = min(100.0, round((achieved_qty / planned_qty) * 100, 1))

            status_str = fields.get("status", "").lower()
            if "complete" in status_str or "done" in status_str or (pct is not None and pct >= 100):
                status = EventStatus.COMPLETED
            elif "progress" in status_str or "ongoing" in status_str or (pct is not None and pct > 0):
                status = EventStatus.IN_PROGRESS
            elif end_date:
                status = EventStatus.COMPLETED
            elif start_date:
                status = EventStatus.IN_PROGRESS
            else:
                status = EventStatus.UNKNOWN

            tag_val = fields.get("tag", "")
            tags = [t.strip() for t in re.split(r"[,;/]", tag_val) if t.strip()]

            raw_text = " | ".join(f"{k}: {v}" for k, v in fields.items())

            events.append(
                ExtractedEvent(
                    activity_id=act_id or None,
                    activity_description=desc or act_id,
                    discipline=Discipline.UNKNOWN,
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
                        source_line=r_idx,
                        source_row=page_num,
                        source_span=raw_text,
                        method=ExtractionMethod.SPREADSHEET,
                    ),
                )
            )

        return events

    def _parse_number(self, val: Optional[str]) -> Optional[float]:
        if not val:
            return None
        cleaned = re.sub(r"[^\d.]", "", val)
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return None
