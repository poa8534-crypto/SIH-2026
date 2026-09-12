"""Unit tests for the extraction layer against the synthetic dataset.

Run with: python -m pytest extraction/test_extractor.py -v
Or:        python extraction/test_extractor.py
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date
from pathlib import Path
from typing import Optional

# Ensure project root is on path
BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

import pytest

from extraction.models import (
    DateBasis,
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    Provenance,
)
from extraction.prepass import (
    extract_dates,
    extract_dates_with_basis,
    extract_fractions,
    extract_percentages,
    extract_quantities,
    extract_tags,
    infer_discipline,
    infer_status,
)
from extraction.extractor import Extractor
from extraction.spreadsheet import SpreadsheetParser


DATASET = PROJECT_ROOT / "dataset"


# ══════════════════════════════════════════════════════════════════════════════
# Tests: prepass regex extraction
# ══════════════════════════════════════════════════════════════════════════════

class TestTagExtraction:
    """Tests for equipment/line tag regex patterns."""

    def test_pipe_tag_standard(self):
        tags = extract_tags('24 inch main header P-1001 spool erection')
        assert len(tags) >= 1
        assert any("P-1001" in t for t in tags), f"Expected P-1001 in {tags}"

    def test_pipe_tag_with_size(self):
        tags = extract_tags('8 inch flare header P-1003 spool fabrication')
        assert any("P-1003" in t for t in tags), f"Expected P-1003 in {tags}"

    def test_equipment_tag_vessel(self):
        tags = extract_tags("Vessel V-101 separator arrived from Kolkata")
        assert "V-101" in tags

    def test_equipment_tag_exchanger(self):
        tags = extract_tags("Exchanger E-101 setting on foundation")
        assert "E-101" in tags

    def test_equipment_tag_tank(self):
        tags = extract_tags("Tank TK-1 shell erection")
        assert "TK-1" in tags

    def test_equipment_tag_skid(self):
        tags = extract_tags("Compressor skid CS-01 delivery")
        assert "CS-01" in tags

    def test_instrument_tag_jb(self):
        tags = extract_tags("Junction boxes JB-01, JB-02, JB-03 installed")
        assert "JB-01" in tags
        assert "JB-02" in tags

    def test_instrument_tag_psv(self):
        tags = extract_tags("Safety valve PSV-01, PSV-02 installed")
        assert "PSV-01" in tags

    def test_multiple_tags(self):
        tags = extract_tags("P-101A/B pump delivered, TK-1 hydrotest complete")
        assert len(tags) >= 2

    def test_no_tags_in_plain_english(self):
        tags = extract_tags("Foundation concreting completed yesterday")
        assert tags == []


class TestDateExtraction:
    """Tests for date regex patterns."""

    def test_iso_date(self):
        dates = extract_dates("pour completed on 2026-07-30", date(2026, 8, 15))
        assert len(dates) >= 1
        assert dates[0] == date(2026, 7, 30)

    def test_dmy_slash(self):
        dates = extract_dates("completed on 31/07/2026", date(2026, 8, 15))
        assert len(dates) >= 1

    def test_dmy_alpha(self):
        dates = extract_dates("started 03/Aug/2026", date(2026, 8, 15))
        assert len(dates) >= 1
        assert dates[0] == date(2026, 8, 3)

    def test_relative_yesterday(self):
        dates = extract_dates("completed yesterday", date(2026, 8, 3))
        assert len(dates) >= 1
        assert dates[0] == date(2026, 8, 2)

    def test_relative_today(self):
        dates = extract_dates("started today", date(2026, 8, 15))
        assert len(dates) >= 1
        assert dates[0] == date(2026, 8, 15)

    def test_no_dates(self):
        dates = extract_dates("Foundation work ongoing")
        assert dates == []


class TestTagDigitWidth:
    """A tag number's digit count is a numbering convention, not part of what a
    tag IS. The extractor bounded it at three digits, which fitted every v1 tag
    and made 18 of v2's 40 tags invisible — including every four-digit vessel,
    instrument and package tag. `tag_overlap` is the near-decisive ranking
    feature, so those mentions were being matched on description text alone.
    """

    @pytest.mark.parametrize("tag", [
        "V-101", "TK-1", "CS-01", "E-101", "HS-01", "JB-02",     # v1, 1-3 digits
    ])
    def test_short_tags_still_extract(self, tag):
        assert extract_tags(tag) == [tag]

    @pytest.mark.parametrize("tag", [
        "V-1101", "PT-1101", "TK-2101", "PK-2401", "FST-1301",   # v2, 4 digits
        "LT-1201", "TE-1301", "FE-1401", "OWS-2201", "CS-2501",
    ])
    def test_four_digit_equipment_tags_extract(self, tag):
        assert extract_tags(tag) == [tag], f"{tag} is invisible to the extractor"

    def test_five_digit_equipment_tag_extracts(self):
        """The bound is generous on purpose — the next baseline should not need
        another regex change to be readable."""
        assert extract_tags("V-12345") == ["V-12345"]

    def test_four_letter_prefix_extracts(self):
        """WHCP-2101 is a real v2 tag; a three-letter prefix bound dropped it."""
        assert extract_tags("WHCP-2101") == ["WHCP-2101"]

    def test_four_digit_tag_found_inside_prose(self):
        tags = extract_tags("Rig and set vertical separator V-1101 on foundation")
        assert "V-1101" in tags

    def test_line_tags_are_unaffected(self):
        tags = extract_tags('24"-P-1001-A1A spool erection')
        assert '24"-P-1001-A1A' in tags

    def test_line_number_is_not_re_added_without_its_size(self):
        """Longest match wins.

        Widening the equipment suffix to five digits also made this pattern
        match the line portion of a full pipe tag. Adding "P-1015" alongside
        '6"-P-1015-A1A' gives the record a second, SIZE-LESS key for the same
        line, and a size-less key matches 12" field text against a 6" line —
        silently defeating the size-mismatch guard that protects precision.
        """
        assert extract_tags('Hydrotest 6"-P-1015-A1A drain header') == [
            '6"-P-1015-A1A'
        ]

    def test_a_bare_line_number_alone_still_extracts(self):
        assert extract_tags("insulation on 12 inch P-1015") == ["P-1015"]

    def test_lowercase_prose_is_not_mistaken_for_a_tag(self):
        """The prefix stays uppercase-only. Widening it to four letters would
        otherwise start matching ordinary hyphenated prose."""
        assert extract_tags("the unit-1 pad and zone-2 fence") == []


class TestFractionUnitSuffix:
    """A unit suffix is not a numerator.

    `FRACTION_RE` had no boundary before the numerator, so it read the digit
    inside the unit: "40 m3 of 120 m3" parsed as 3/120 = 2.5%. `percentage`
    gates `actual_finish` (D-008/D-015), so a naturally written DPR silently
    under-reported completion on every m2/m3 quantity — most of the civil scope.
    """

    def test_cubic_metres(self):
        assert extract_fractions("40 m3 of 120 m3 poured") == [(40, 120)]

    def test_square_metres(self):
        assert extract_fractions("320 m2 of 480 m2") == [(320, 480)]

    def test_unit_free_phrasing_the_v2_corpus_uses(self):
        """dataset/v2 currently writes "40 of 120 m3" to route around this bug.
        That phrasing must keep working after the fix."""
        assert extract_fractions("40 of 120 m3") == [(40, 120)]

    def test_equal_quantities_are_one_hundred_percent(self):
        """The v2 generator produced "1 m3 of 1 m3", which parsed as 3/1 = 300%
        and was rejected outright by ExtractedEvent's 0-100 bound."""
        assert extract_fractions("1 m3 of 1 m3 complete") == [(1, 1)]

    @pytest.mark.parametrize("text,expected", [
        ("8 out of 12 spools", (8, 12)),
        ("16 of 28 done", (16, 28)),
        ("6 nos out of 13", (6, 13)),
        ("98 out of 145 supports", (98, 145)),
        ("2400 m2 of total 4800", (2400, 4800)),
    ])
    def test_existing_phrasings_are_unchanged(self, text, expected):
        assert extract_fractions(text) == [expected]

    def test_no_fraction_where_there_is_none(self):
        assert extract_fractions("Foundation work ongoing") == []

    def test_percentage_derived_from_a_unit_fraction_is_sane(self):
        """The whole point: the derived percentage has to be usable, because it
        is what decides whether a node reaches 100% and gets an Actual Finish."""
        num, den = extract_fractions("40 m3 of 120 m3 poured")[0]
        assert 33.0 <= round(num / den * 100, 1) <= 33.4


class TestDateBasis:
    """Every date has to know how it was obtained. A date the span carried is
    an assertion; the report header's date standing in for one is an
    inference, and the two must never be written to the schedule alike."""

    def test_explicit_date_is_explicit(self):
        dated, _w = extract_dates_with_basis(
            "pour completed on 2026-07-30", date(2026, 8, 15))
        assert dated[0] == (date(2026, 7, 30), DateBasis.EXPLICIT)

    def test_relative_date_is_resolved_not_explicit(self):
        dated, _w = extract_dates_with_basis("completed yesterday", date(2026, 8, 3))
        assert dated[0] == (date(2026, 8, 2), DateBasis.RELATIVE_RESOLVED)

    def test_completion_without_a_date_defaults_to_the_report_date(self):
        """The F1 case: "Flange management completed" in a report dated
        15/09. The claim is real; the date is not."""
        start, start_basis, finish, finish_basis = Extractor._bind_assertion_dates(
            "Flange management for 24 nos completed",
            "completed",
            {"dates": [], "date_bases": []},
            date(2026, 9, 15),
        )
        assert finish == date(2026, 9, 15)
        assert finish_basis is DateBasis.DEFAULTED_TO_REPORT_DATE
        assert start is None and start_basis is None

    def test_completion_with_a_date_is_explicit(self):
        _s, _sb, finish, finish_basis = Extractor._bind_assertion_dates(
            "Flange management completed on 2026-09-11",
            "completed",
            {"dates": ["2026-09-11"], "date_bases": [DateBasis.EXPLICIT.value]},
            date(2026, 9, 15),
        )
        assert finish == date(2026, 9, 11)
        assert finish_basis is DateBasis.EXPLICIT

    def test_pipeline_marks_a_defaulted_finish(self):
        """End to end through the real extractor: dpr_day_10.txt is dated
        15/09/2026, and every completion in it that names no date of its own
        must come out marked as defaulted."""
        ext = Extractor(schedule_path=str(DATASET / "baseline_schedule.json"))
        result = ext.extract(str(DATASET / "dpr_day_10.txt"))
        defaulted = [
            e for e in result.events
            if e.asserted_finish_basis is DateBasis.DEFAULTED_TO_REPORT_DATE
        ]
        assert defaulted, "dpr_day_10 should contain undated completion claims"
        for e in defaulted:
            assert e.asserted_finish == date(2026, 9, 15)
        # and a line that carries its own date is not marked defaulted
        for e in result.events:
            if e.asserted_finish_basis is DateBasis.EXPLICIT:
                assert e.asserted_finish is not None


class TestQuantityExtraction:
    """Tests for quantity + UOM patterns."""

    def test_cubic_meters(self):
        quants = extract_quantities("Total 24 m3 poured")
        assert len(quants) >= 1
        assert quants[0] == (24.0, "m3")

    def test_linear_meters(self):
        quants = extract_quantities("800 m of 33kV cable laid")
        assert len(quants) >= 1
        assert quants[0][0] == 800.0

    def test_count_nos(self):
        quants = extract_quantities("6 nos spools erected")
        assert len(quants) >= 1

    def test_metric_tons(self):
        quants = extract_quantities("12 MT done out of 28 MT planned")
        assert len(quants) >= 1

    def test_fraction_progress(self):
        fractions = extract_fractions("6 of 8 spools done")
        assert len(fractions) >= 1
        assert fractions[0] == (6, 8)

    def test_percentage(self):
        pcts = extract_percentages("about 40% done")
        assert len(pcts) >= 1
        assert pcts[0] == 40.0


class TestDisciplineInference:
    """Tests for discipline keyword classification."""

    def test_civil(self):
        assert infer_discipline("Foundation concreting for pipe rack pedestals") == Discipline.CIVIL

    def test_piping(self):
        assert infer_discipline("24 inch P-1001 spool erection on rack") == Discipline.PIPING

    def test_equipment(self):
        assert infer_discipline("Vessel V-101 separator setting on foundation") == Discipline.STATIC_EQUIPMENT

    def test_electrical(self):
        assert infer_discipline("HT cable laying from substation to MCC") == Discipline.ELECTRICAL

    def test_instrumentation(self):
        assert infer_discipline("Level transmitter calibration workshop") == Discipline.INSTRUMENTATION

    def test_hse(self):
        assert infer_discipline("BBS observations this week, 18 recorded") == Discipline.HSE

    def test_unknown(self):
        assert infer_discipline("Work progressing well") == Discipline.UNKNOWN


class TestStatusInference:
    """Tests for status keyword classification."""

    def test_completed(self):
        status, conf = infer_status("ALL 18 spools erected on rack")
        assert status == "completed"

    def test_in_progress(self):
        status, conf = infer_status("about 40% done, ongoing work")
        assert status == "in_progress"

    def test_delayed(self):
        status, conf = infer_status("delayed by 2 days due to crane breakdown")
        assert status == "delayed"

    def test_hindi_completed(self):
        status, conf = infer_status("tiles ka kaam khatom ho gaya")
        assert status == "completed"

    def test_hindi_in_progress(self):
        status, conf = infer_status("tiles ka kaam chalu hai")
        assert status == "in_progress"


# ══════════════════════════════════════════════════════════════════════════════
# Tests: Spreadsheet parser
# ══════════════════════════════════════════════════════════════════════════════

class TestSpreadsheetParser:
    """Tests against the synthetic xlsx files."""

    def test_piping_spreadsheet_parse(self):
        parser = SpreadsheetParser()
        events = parser.parse(str(DATASET / "piping_progress.xlsx"))
        assert len(events) > 0, "Should extract events from piping spreadsheet"

        # Check that activity IDs are present
        ids = [e.provenance.source_row for e in events]
        assert all(r is not None for r in ids), "All events should have row numbers"

        # Check summary row was rejected (should not have "TOTAL" in any event)
        for ev in events:
            assert "TOTAL" not in ev.raw_text.upper(), f"Summary row leaked: {ev.raw_text}"

    def test_civil_spreadsheet_parse(self):
        parser = SpreadsheetParser(discipline_override=Discipline.CIVIL)
        events = parser.parse(str(DATASET / "civil_progress.xlsx"))
        assert len(events) > 0, "Should extract events from civil spreadsheet"

        # All should be civil discipline
        for ev in events:
            assert ev.discipline in (Discipline.CIVIL, Discipline.UNKNOWN), \
                f"Expected civil, got {ev.discipline} for {ev.raw_text}"

    def test_spreadsheet_provenance(self):
        parser = SpreadsheetParser()
        events = parser.parse(str(DATASET / "piping_progress.xlsx"))
        for ev in events:
            assert ev.provenance.source_file == "piping_progress.xlsx"
            assert ev.provenance.source_row is not None
            assert ev.provenance.method == ExtractionMethod.SPREADSHEET

    def test_spreadsheet_date_coercion(self):
        """Verify various date formats are handled."""
        parser = SpreadsheetParser()
        events = parser.parse(str(DATASET / "civil_progress.xlsx"))
        # Civil spreadsheet has dates in ISO, DD/MM/YYYY, and DD/Mon/YYYY
        # All events should have valid start_date extracted (even if not stored in event)
        assert len(events) > 0


# ══════════════════════════════════════════════════════════════════════════════
# Tests: Full extractor pipeline (text)
# ══════════════════════════════════════════════════════════════════════════════

class TestExtractorPipeline:
    """Integration tests for the full extraction pipeline."""

    def _make_extractor(self) -> Extractor:
        return Extractor(schedule_path=str(DATASET / "baseline_schedule.json"))

    def test_extract_dpr_01(self):
        ext = self._make_extractor()
        result = ext.extract(str(DATASET / "dpr_day_01.txt"))
        assert result.event_count > 0, "DPR 01 should produce events"
        assert result.errors == [], f"Unexpected errors: {result.errors}"

        # Check that key events from ground truth are found
        all_raw = " ".join(e.raw_text.lower() for e in result.events)
        assert "foundation" in all_raw or "concret" in all_raw, \
            "Should find foundation/concreting events in DPR 01"

    def test_extract_dpr_03_has_hindi(self):
        ext = self._make_extractor()
        result = ext.extract(str(DATASET / "dpr_day_03.txt"))
        assert result.event_count > 0
        # DPR 03 has Hindi code-mixing ("tiles ka kaam chalu hai")
        all_raw = " ".join(e.raw_text for e in result.events)
        # Should still extract events even with Hindi
        assert len(result.events) >= 5, \
            f"Expected at least 5 events from DPR 03, got {result.event_count}"

    def test_all_dprs_produce_events(self):
        ext = self._make_extractor()
        for day in range(1, 11):
            path = DATASET / f"dpr_day_{day:02d}.txt"
            result = ext.extract(str(path))
            assert result.event_count > 0, \
                f"DPR day {day} produced 0 events"
            assert result.errors == [], \
                f"DPR day {day} errors: {result.errors}"

    def test_provenance_on_all_events(self):
        ext = self._make_extractor()
        for day in range(1, 11):
            path = DATASET / f"dpr_day_{day:02d}.txt"
            result = ext.extract(str(path))
            for ev in result.events:
                assert ev.provenance.source_file == f"dpr_day_{day:02d}.txt"
                assert ev.provenance.source_line is not None
                assert ev.provenance.source_span
                assert ev.provenance.method in (
                    ExtractionMethod.PREPASS,
                    ExtractionMethod.HYBRID,
                )

    def test_tags_extracted_from_dpr(self):
        ext = self._make_extractor()
        result = ext.extract(str(DATASET / "dpr_day_01.txt"))
        all_tags = []
        for ev in result.events:
            all_tags.extend(ev.tags)
        # DPR 01 mentions V-101, E-101, CS-01
        assert any("V-101" in t for t in all_tags), \
            f"Expected V-101 tag, got tags: {all_tags}"
        assert any("E-101" in t for t in all_tags), \
            f"Expected E-101 tag, got tags: {all_tags}"


# ══════════════════════════════════════════════════════════════════════════════
# Tests: Ground truth alignment
# ══════════════════════════════════════════════════════════════════════════════

class TestGroundTruthAlignment:
    """Verify extraction output can be scored against ground_truth.csv."""

    def test_ground_truth_loadable(self):
        gt_path = DATASET / "ground_truth.csv"
        assert gt_path.exists(), "ground_truth.csv must exist"

        with open(gt_path) as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        assert len(rows) > 200, f"Expected 200+ ground truth rows, got {len(rows)}"

        # Check structure
        for row in rows[:5]:
            assert "source" in row
            assert "activity_id" in row
            assert "raw_mention" in row
            assert "match_type" in row

    def test_baseline_schedule_loadable(self):
        sched_path = DATASET / "baseline_schedule.json"
        assert sched_path.exists()

        with open(sched_path) as f:
            schedule = json.load(f)

        assert len(schedule) == 120, f"Expected 120 activities, got {len(schedule)}"

        # Check all have required fields
        for act in schedule:
            assert "activity_id" in act
            assert "description" in act
            assert "discipline" in act
            assert "predecessors" in act

    def test_dpr_files_exist(self):
        for day in range(1, 11):
            path = DATASET / f"dpr_day_{day:02d}.txt"
            assert path.exists(), f"dpr_day_{day:02d}.txt missing"

    def test_xlsx_files_exist(self):
        assert (DATASET / "piping_progress.xlsx").exists()
        assert (DATASET / "civil_progress.xlsx").exists()


# ══════════════════════════════════════════════════════════════════════════════
# Tests: Model validation
# ══════════════════════════════════════════════════════════════════════════════

class TestModels:
    """Tests for Pydantic schema validation."""

    def test_extracted_event_creation(self):
        event = ExtractedEvent(
            raw_text="Foundation concreting completed",
            provenance=Provenance(
                source_file="dpr_day_01.txt",
                source_line=15,
                source_span="Foundation concreting completed",
                method=ExtractionMethod.PREPASS,
            ),
        )
        assert event.raw_text == "Foundation concreting completed"
        assert event.confidence == 0.0
        assert event.discipline == Discipline.UNKNOWN
        assert event.provenance.source_file == "dpr_day_01.txt"

    def test_extracted_event_full(self):
        event = ExtractedEvent(
            raw_text="24 inch P-1001 spool erection — 6 nos done",
            tags=['24"-P-1001-A1A'],
            discipline=Discipline.PIPING,
            status=EventStatus.IN_PROGRESS,
            percentage=33.3,
            quantity=6.0,
            uom="nos",
            confidence=0.85,
            activity_description="Spool erection for 24-inch main header",
            reasoning="Mentions 24 inch P-1001, spool erection, 6 of 18",
            alternatives=["PIP-SPL-1025"],
            provenance=Provenance(
                source_file="dpr_day_03.txt",
                source_line=18,
                source_span="24 inch P-1001 spool erection — 6 nos done",
                method=ExtractionMethod.HYBRID,
            ),
        )
        assert event.confidence == 0.85
        assert event.quantity == 6.0
        assert len(event.alternatives) == 1

    def test_event_forbids_extra_fields(self):
        """Ensure the schema rejects unknown fields (extra='forbid')."""
        from pydantic import ValidationError
        try:
            ExtractedEvent(
                raw_text="test",
                some_random_field="oops",
                provenance=Provenance(
                    source_file="test.txt",
                    source_span="test",
                    method=ExtractionMethod.PREPASS,
                ),
            )
            assert False, "Should have raised ValidationError"
        except ValidationError:
            pass

    def test_extraction_result(self):
        from extraction.models import ExtractionResult
        result = ExtractionResult(source_file="test.txt")
        assert result.event_count == 0
        assert result.matched_count == 0
        assert result.avg_confidence == 0.0


# ══════════════════════════════════════════════════════════════════════════════
# Runner
# ══════════════════════════════════════════════════════════════════════════════

def run_tests():
    """Minimal test runner (no pytest dependency)."""
    import traceback

    test_classes = [
        TestTagExtraction,
        TestDateExtraction,
        TestQuantityExtraction,
        TestDisciplineInference,
        TestStatusInference,
        TestSpreadsheetParser,
        TestExtractorPipeline,
        TestGroundTruthAlignment,
        TestModels,
    ]

    total = 0
    passed = 0
    failed = 0
    errors = []

    for cls in test_classes:
        instance = cls()
        methods = [m for m in dir(instance) if m.startswith("test_")]
        for method_name in sorted(methods):
            total += 1
            test_label = f"{cls.__name__}.{method_name}"
            try:
                getattr(instance, method_name)()
                passed += 1
                print(f"  OK {test_label}")
            except Exception as e:
                failed += 1
                errors.append((test_label, e))
                print(f"  XX {test_label}")
                print(f"    {type(e).__name__}: {e}")

    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} passed, {failed} failed")
    if errors:
        print(f"\nFailed tests:")
        for name, err in errors:
            print(f"  {name}: {err}")
    print(f"{'='*60}")

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
