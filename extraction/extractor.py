"""Main extraction orchestrator.

Ties together:
  1. Deterministic pre-pass (regex)
  2. LLM structured extraction (optional, behind interface)
  3. Spreadsheet parsing (for xlsx inputs)
  4. Schedule context for enrichment

Usage:
    extractor = Extractor(schedule_path="dataset/baseline_schedule.json")
    result = extractor.extract("dataset/dpr_day_01.txt")
    for event in result.events:
        print(f"{event.activity_id} | {event.raw_text}")
"""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Optional

from .llm_backend import LLMBackend, NullBackend
from .models import (
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    ExtractionResult,
    Provenance,
)
from .prepass import (
    COMPLETED_RE,
    COMPLETION_WITH_DATE_RE,
    STARTED_RE,
    extract_dates,
    extract_dates_with_flags,
    extract_fractions,
    extract_percentages,
    extract_quantities,
    extract_tags,
    infer_discipline,
    infer_status,
)
from .spreadsheet import SpreadsheetParser

logger = logging.getLogger(__name__)


class Extractor:
    """Unified extraction pipeline for EPC field reports.

    Accepts:
      - .txt files  → DPR text parsing with prepass + LLM
      - .xlsx files → Spreadsheet parsing
      - .csv files  → (future: structured CSV parsing)
    """

    def __init__(
        self,
        schedule_path: Optional[str] = None,
        llm_backend: Optional[LLMBackend] = None,
        reference_date: Optional[date] = None,
    ):
        self.reference_date = reference_date or date(2026, 8, 15)  # midpoint of our DPR range
        self.llm = llm_backend or NullBackend()

        # Load schedule for context
        self.schedule: list[dict] = []
        self.schedule_context: str = ""
        if schedule_path:
            self._load_schedule(schedule_path)

    def _load_schedule(self, path: str) -> None:
        """Load baseline schedule and build compact context string."""
        with open(path) as f:
            self.schedule = json.load(f)

        lines = []
        for act in self.schedule:
            line = (
                f"{act['activity_id']} | {act['description']} | "
                f"discipline={act['discipline']} | "
                f"tags={act.get('tag') or 'none'} | "
                f"status=current"
            )
            lines.append(line)
        self.schedule_context = "\n".join(lines)

    # ── Public API ───────────────────────────────────────────────────────────

    def extract(self, filepath: str) -> ExtractionResult:
        """Extract progress events from a source file.

        Dispatches to the appropriate parser based on file extension.
        """
        path = Path(filepath)
        suffix = path.suffix.lower()

        if suffix == ".xlsx":
            return self._extract_spreadsheet(str(path))
        elif suffix in (".txt", ".md", ".log"):
            return self._extract_text(str(path))
        elif suffix == ".csv":
            return self._extract_csv(str(path))
        else:
            result = ExtractionResult(source_file=path.name)
            result.errors.append(f"Unsupported file type: {suffix}")
            return result

    # ── Text extraction (DPR) ────────────────────────────────────────────────

    def _extract_text(self, filepath: str) -> ExtractionResult:
        """Extract from a text-based daily progress report."""
        path = Path(filepath)
        result = ExtractionResult(source_file=path.name)

        with open(filepath, encoding="utf-8", errors="replace") as f:
            content = f.read()

        lines = content.split("\n")

        # Step 1: Extract the report date from the header
        report_date = self._extract_report_date(lines)

        # Step 2: Parse into logical text spans (bullet points, paragraphs)
        spans = self._parse_text_spans(lines)

        if not spans:
            result.warnings.append("No progress spans found in text")
            return result

        # Step 3: Deterministic pre-pass on each span
        prepass_results = []
        for span_text, line_num in spans:
            hints = self._prepass_span(span_text, line_num, report_date)
            prepass_results.append(hints)

        # Step 4: LLM pass (if available) for residual text
        llm_outputs = []
        if self.llm.is_available():
            text_bodies = [s[0] for s in spans]
            llm_outputs = self.llm.extract_events(
                text_bodies, self.schedule_context, prepass_results
            )

        # Step 5: Merge prepass + LLM into final ExtractedEvents
        for i, (span_text, line_num) in enumerate(spans):
            hints = prepass_results[i]
            llm_out = llm_outputs[i] if i < len(llm_outputs) else None

            for warning in hints.get("date_warnings", []):
                result.warnings.append(f"line:{line_num} {warning}")

            event = self._merge_event(
                span_text, line_num, path.name, hints, llm_out, report_date
            )
            if event:
                result.events.append(event)

        return result

    def _extract_report_date(self, lines: list[str]) -> Optional[date]:
        """Extract the report date from DPR header lines."""
        for line in lines[:10]:  # Only check first 10 lines
            dates = extract_dates(line, self.reference_date)
            if dates:
                return dates[0]
        return self.reference_date

    def _parse_text_spans(
        self, lines: list[str]
    ) -> list[tuple[str, int]]:
        """Parse DPR text into logical progress spans.

        Returns list of (text, line_number) for actionable progress items.
        Skips headers, blank lines, section titles, and REMARKS sections.
        """
        spans: list[tuple[str, int]] = []

        in_header = True
        in_remarks = False

        for i, line in enumerate(lines, 1):
            stripped = line.strip()

            # Skip empty lines
            if not stripped:
                continue

            # Skip header metadata
            if in_header:
                if stripped.upper().startswith("DAILY PROGRESS REPORT"):
                    continue
                if stripped.upper().startswith("DATE:"):
                    continue
                if stripped.upper().startswith("CONTRACTOR:"):
                    continue
                if stripped.upper().startswith("PREPARED BY:"):
                    continue
                if stripped.upper().startswith("WEATHER:"):
                    continue
                if stripped.upper().startswith("PROJECT:"):
                    continue
                if stripped.startswith("NOTE:"):
                    continue
                # First real content line ends header
                if any(stripped.startswith(f"{n}.") for n in range(1, 10)):
                    in_header = False
                elif stripped and not stripped.startswith(("|", "-")):
                    in_header = False

            # Track REMARKS section
            if stripped.upper().startswith("REMARKS"):
                in_remarks = True
                continue
            if in_remarks:
                if stripped.startswith("-") or stripped.startswith("*"):
                    # Remarks items — sometimes useful context
                    continue
                if any(stripped.startswith(f"{n}.") for n in range(1, 10)):
                    in_remarks = False
                else:
                    continue

            # Skip section headers (e.g., "1. CIVIL", "2. PIPING")
            if re.match(r'^\d+\.\s+[A-Z\s]+$', stripped):
                continue

            # Extract progress items: lines starting with a), b), c), -, *, or plain text
            item_match = __import__("re").match(
                r'^[a-z]\)\s+(.+)', stripped
            )
            if item_match:
                spans.append((item_match.group(1).strip(), i))
                continue

            if stripped.startswith("- ") or stripped.startswith("* "):
                spans.append((stripped[2:].strip(), i))
                continue

            # Plain text line that contains progress-like content
            if len(stripped) > 15 and not stripped.startswith(("|", "===")):
                spans.append((stripped, i))

        return spans

    def _prepass_span(
        self, text: str, line_num: int, report_date: Optional[date]
    ) -> dict:
        """Run deterministic pre-pass on a single text span."""
        ref = report_date or self.reference_date

        tags = extract_tags(text)
        dates, date_warnings = extract_dates_with_flags(text, ref)
        quantities = extract_quantities(text)
        percentages = extract_percentages(text)
        fractions = extract_fractions(text)
        discipline = infer_discipline(text)
        status, status_conf = infer_status(text)

        # Calculate percentage from fractions if no explicit percentage
        pct = percentages[0] if percentages else None
        if pct is None and fractions:
            num, den = fractions[0]
            if den > 0:
                pct = round((num / den) * 100, 1)

        return {
            "tags": tags,
            "dates": [d.isoformat() for d in dates],
            "date_warnings": date_warnings,
            "quantities": quantities,
            "percentages": percentages,
            "fractions": fractions,
            "discipline": discipline.value,
            "status": status,
            "status_confidence": status_conf,
            "percentage": pct,
        }

    def _merge_event(
        self,
        span_text: str,
        line_num: int,
        filename: str,
        hints: dict,
        llm_output,
        report_date: Optional[date] = None,
    ) -> Optional[ExtractedEvent]:
        """Merge prepass hints and LLM output into a final ExtractedEvent."""
        # Start with prepass data
        discipline = Discipline(hints.get("discipline", "unknown"))
        status = hints.get("status", "unknown")
        tags = hints.get("tags", [])
        pct = hints.get("percentage")
        quantity = None
        uom = None
        if hints.get("quantities"):
            quantity, uom = hints["quantities"][0]

        # Enrich from LLM if available
        method = ExtractionMethod.PREPASS
        activity_desc = None
        reasoning = None
        alternatives = []

        if llm_output:
            method = ExtractionMethod.HYBRID

            # LLM can override discipline if prepass was unknown
            if discipline == Discipline.UNKNOWN:
                try:
                    discipline = Discipline(llm_output.discipline)
                except ValueError:
                    pass

            # LLM can override status
            if status == "unknown":
                status = llm_output.status

            # LLM enrichment
            activity_desc = llm_output.activity_description or None
            reasoning = llm_output.reasoning or None
            alternatives = llm_output.alternatives or []
            tags = tags or llm_output.tags
            if llm_output.quantity is not None and quantity is None:
                quantity = llm_output.quantity
            if llm_output.uom and not uom:
                uom = llm_output.uom
            if llm_output.percentage is not None and pct is None:
                pct = llm_output.percentage

        # Date this event asserts progress for: the first date resolved from
        # the span itself, else the DPR header's report date.
        reported_date = None
        if hints.get("dates"):
            reported_date = date.fromisoformat(hints["dates"][0])
        if reported_date is None:
            reported_date = report_date

        asserted_start, asserted_finish = self._bind_assertion_dates(
            span_text, status, hints, reported_date
        )

        # Compute confidence based on signal strength
        confidence = self._compute_confidence(hints, llm_output)

        return ExtractedEvent(
            raw_text=span_text,
            tags=tags,
            reported_date=reported_date,
            asserted_start=asserted_start,
            asserted_finish=asserted_finish,
            discipline=discipline,
            status=status,
            percentage=pct,
            quantity=quantity,
            uom=uom,
            activity_description=activity_desc,
            reasoning=reasoning,
            alternatives=alternatives,
            confidence=confidence,
            provenance=Provenance(
                source_file=filename,
                source_line=line_num,
                source_span=span_text,
                method=method,
            ),
        )

    def _bind_assertion_dates(
        self, text: str, status: str, hints: dict, reported_date: Optional[date]
    ) -> tuple[Optional[date], Optional[date]]:
        """Decide whether this line asserts a start date, a finish date, both,
        or neither, and bind the extracted dates to those claims.

        A start claim comes from an explicit start verb ("started today").
        A finish claim comes from the inferred status rather than the raw
        completion verb, because infer_status already resolves the common
        ambiguity where a progress line reads "about 40% done" -- that leans
        in_progress and must not be read as a completion.

        When the line makes both claims and carries two dates, they bind
        positionally in the order the verbs appear. When a claim is made with
        no in-span date, the report's own date carries it.
        """
        dates = [date.fromisoformat(d) for d in hints.get("dates", [])]

        claims_start = bool(STARTED_RE.search(text))
        claims_finish = (
            (status == "completed" and bool(COMPLETED_RE.search(text)))
            # ... or a completion verb with a date bound directly to it, which
            # survives an unrelated open clause later in the same line.
            or bool(COMPLETION_WITH_DATE_RE.search(text))
        )

        if not claims_start and not claims_finish:
            return None, None

        if claims_start and claims_finish:
            if len(dates) >= 2:
                start_at = STARTED_RE.search(text)
                finish_at = (
                    COMPLETION_WITH_DATE_RE.search(text)
                    or COMPLETED_RE.search(text)
                )
                if start_at and finish_at and start_at.start() > finish_at.start():
                    return dates[1], dates[0]
                return dates[0], dates[1]
            # "started and completed on X" -- one date carries both claims
            single = dates[0] if dates else reported_date
            return single, single

        if claims_finish:
            return None, (dates[0] if dates else reported_date)
        return (dates[0] if dates else reported_date), None

    def _compute_confidence(self, hints: dict, llm_output) -> float:
        """Estimate extraction confidence based on available signals."""
        score = 0.0

        # Tags are high-signal
        if hints.get("tags"):
            score += 0.3

        # Discipline identified
        if hints.get("discipline") != "unknown":
            score += 0.15

        # Status identified with confidence
        if hints.get("status") != "unknown":
            score += 0.15 * hints.get("status_confidence", 0.5)

        # Dates found
        if hints.get("dates"):
            score += 0.1

        # Quantities found
        if hints.get("quantities"):
            score += 0.1

        # LLM agreement boosts confidence
        if llm_output and llm_output.reasoning:
            score += 0.2

        return min(round(score, 2), 1.0)

    # ── Spreadsheet extraction ───────────────────────────────────────────────

    def _extract_spreadsheet(self, filepath: str) -> ExtractionResult:
        """Extract from an xlsx discipline spreadsheet."""
        path = Path(filepath)
        result = ExtractionResult(source_file=path.name)

        # Infer discipline from filename
        disc_map = {
            "piping": Discipline.PIPING,
            "civil": Discipline.CIVIL,
            "electrical": Discipline.ELECTRICAL,
            "instrument": Discipline.INSTRUMENTATION,
            "hse": Discipline.HSE,
        }
        disc_override = None
        for key, disc in disc_map.items():
            if key in path.stem.lower():
                disc_override = disc
                break

        parser = SpreadsheetParser(discipline_override=disc_override)
        try:
            result.events = parser.parse(filepath)
        except Exception as e:
            result.errors.append(f"Spreadsheet parse error: {e}")

        return result

    # ── CSV extraction (stub) ────────────────────────────────────────────────

    def _extract_csv(self, filepath: str) -> ExtractionResult:
        """Placeholder for future CSV parsing."""
        result = ExtractionResult(source_file=Path(filepath).name)
        result.errors.append("CSV extraction not yet implemented")
        return result


# Needed for re import in _parse_text_spans
import re
