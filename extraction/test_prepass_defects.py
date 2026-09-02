"""Regression tests for the extraction defects the 2026-09 audit confirmed.

Each test pins one defect that silently corrupted truth in captured events:

  * comma-thousands quantities  ("1,200 nos" -> 200.0)
  * dd-Mon-yyyy dates           ("03-Aug-2026" -> not parsed at all)
  * forecast wording            ("will be completed by 15/09/2026" -> EXPLICIT
                                 Actual Finish)
  * material grades as tags     ("SS-304", "M-20" extracted as equipment)
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extraction.prepass import (
    extract_dates_with_basis,
    extract_quantities,
    extract_tags,
    is_forecast_language,
)


class TestCommaThousands:
    def test_1200_nos_is_1200(self):
        assert extract_quantities("we did 1,200 nos today") == [(1200.0, "nos")]

    def test_bare_meters(self):
        assert extract_quantities("1,200 m of cable pulled") == [(1200.0, "m")]

    def test_plain_numbers_unchanged(self):
        assert extract_quantities("200 nos done") == [(200.0, "nos")]
        assert extract_quantities("1.5 m3 placed") == [(1.5, "m3")]


class TestDdMonYyyyDates:
    def test_hyphenated_month_name(self):
        got = extract_dates_with_basis("completed 03-Aug-2026", None)
        assert [(d.isoformat(), b.value) for d, b in got] == [
            ("2026-08-03", "EXPLICIT")
        ]

    def test_slash_form_still_works(self):
        got = extract_dates_with_basis("completed 03/Aug/2026", None)
        assert [d.isoformat() for d, _b in got] == ["2026-08-03"]

    def test_iso_and_numeric_untouched(self):
        assert [d.isoformat() for d, _b in
                extract_dates_with_basis("done 2026-08-03", None)] == ["2026-08-03"]
        assert [d.isoformat() for d, _b in
                extract_dates_with_basis("done 03/08/2026", None)] == ["2026-08-03"]


class TestForecastWording:
    def test_will_be_completed_is_forecast(self):
        assert is_forecast_language("will be completed by 15/09/2026")

    def test_will_be_installed_is_forecast(self):
        assert is_forecast_language("transformer will be installed on 12 Oct")

    def test_actual_completion_still_passes(self):
        assert not is_forecast_language("completed on 15/09/2026")
        assert not is_forecast_language("spool erection done, 6 nos")

    def test_no_actual_finish_asserted_from_forecast(self):
        """The full binding path must refuse to assert a finish."""
        from extraction.extractor import Extractor
        start, _sb, finish, fb = Extractor._bind_assertion_dates(
            "will be completed by 15/09/2026", "completed",
            {"dates": ["2026-09-15"], "date_bases": ["EXPLICIT"]},
            date(2026, 9, 1),
        )
        assert start is None and finish is None and fb is None


class TestMaterialGrades:
    def test_ss304_not_a_tag(self):
        assert extract_tags("SS-304 pipe installed") == []

    def test_concrete_grade_not_a_tag(self):
        assert extract_tags("M-20 concrete poured in footing") == []

    def test_real_tags_unaffected(self):
        assert extract_tags("P-1001 spool erected") == ["P-1001"]
        assert extract_tags("V-1101 and MCC-1 checked") == ["V-1101", "MCC-1"]
