"""Primavera PMXML and XER reading — FINDINGS.md F3, D-047.

Two fixtures under `dataset/fixtures/` are written in the **canonical Oracle
shapes**, not in the shapes this repository's own exporter emits, so the parsers
are proven against something resembling a real P6 export rather than only
against their own round trip. Both fixtures describe the same three activities
and the same two relationships, which is what lets the equivalence test below
assert that the two formats agree.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from matching.primavera import (
    ScheduleParseError,
    parse_pmxml,
    parse_primavera,
    parse_xer,
)
from matching.providers import (
    PmxmlScheduleProvider,
    PrimaveraXerScheduleProvider,
)

FIXTURES = Path(__file__).resolve().parent.parent.parent / "dataset" / "fixtures"
PMXML = FIXTURES / "sample_p6.xml"
XER = FIXTURES / "sample_p6.xer"


# ── PMXML ───────────────────────────────────────────────────────────────────

class TestPmxml:
    def test_parses_the_known_activity_count(self):
        assert len(parse_pmxml(PMXML.read_text(), "sample_p6.xml")) == 3

    def test_ids_names_and_dates(self):
        acts = {a["activity_id"]: a for a in parse_pmxml(PMXML.read_text(), "x.xml")}
        assert set(acts) == {"CIV-EXC-1001", "CIV-FDN-1002", "PIP-ERC-2001"}

        first = acts["CIV-EXC-1001"]
        assert first["description"] == "Excavation for Foundation F-1"
        # Datetime is truncated to a date; the time of day is not schedule data.
        assert first["planned_start"] == "2026-06-01"
        assert first["planned_finish"] == "2026-06-10"

    def test_namespaced_elements_are_read(self):
        """The fixture declares the P6 namespace; a reader that matched on the
        raw tag would find zero activities."""
        assert parse_pmxml(PMXML.read_text(), "x.xml")

    def test_relationship_type_and_lag(self):
        acts = {a["activity_id"]: a for a in parse_pmxml(PMXML.read_text(), "x.xml")}
        assert acts["CIV-EXC-1001"]["predecessors"] == []

        fs = acts["CIV-FDN-1002"]["predecessors"]
        assert fs == [{"activity_id": "CIV-EXC-1001", "rel": "FS", "lag_days": 0}]

        # 16h at P6's default 8h day = 2 days, not 16.
        ss = acts["PIP-ERC-2001"]["predecessors"]
        assert ss == [{"activity_id": "CIV-FDN-1002", "rel": "SS", "lag_days": 2}]

    def test_discipline_comes_from_the_id_prefix(self):
        acts = {a["activity_id"]: a for a in parse_pmxml(PMXML.read_text(), "x.xml")}
        assert acts["CIV-EXC-1001"]["discipline"] == "civil"
        assert acts["PIP-ERC-2001"]["discipline"] == "piping"

    def test_attribute_dialect_is_also_read(self):
        """The shape `server/main.py::_generate_pmxml` writes: id and name as
        attributes, dates as children."""
        text = """<?xml version="1.0"?>
        <Project Name="P">
          <Activities>
            <Activity ActivityID="CIV-EXC-1001" ActivityName="Excavation">
              <StartDate>2026-06-01</StartDate>
              <FinishDate>2026-06-10</FinishDate>
              <Predecessor ActivityID="CIV-PLY-1000" Type="FS" Lag="0d"/>
            </Activity>
          </Activities>
        </Project>"""
        acts = parse_pmxml(text, "ours.xml")
        assert len(acts) == 1
        assert acts[0]["activity_id"] == "CIV-EXC-1001"
        assert acts[0]["planned_start"] == "2026-06-01"
        assert acts[0]["predecessors"][0]["activity_id"] == "CIV-PLY-1000"


# ── XER ─────────────────────────────────────────────────────────────────────

class TestXer:
    def test_parses_the_known_activity_count(self):
        assert len(parse_xer(XER.read_text(), "sample_p6.xer")) == 3

    def test_task_code_becomes_the_activity_id(self):
        """XER keys rows by an internal `task_id`; the human id is `task_code`.
        Reading the wrong one yields activity ids like "9001"."""
        ids = {a["activity_id"] for a in parse_xer(XER.read_text(), "x.xer")}
        assert ids == {"CIV-EXC-1001", "CIV-FDN-1002", "PIP-ERC-2001"}

    def test_taskpred_internal_ids_resolve_to_activity_ids(self):
        acts = {a["activity_id"]: a for a in parse_xer(XER.read_text(), "x.xer")}
        assert acts["CIV-FDN-1002"]["predecessors"] == [
            {"activity_id": "CIV-EXC-1001", "rel": "FS", "lag_days": 0}
        ]

    def test_pr_prefix_is_stripped_and_hours_become_days(self):
        acts = {a["activity_id"]: a for a in parse_xer(XER.read_text(), "x.xer")}
        pred = acts["PIP-ERC-2001"]["predecessors"][0]
        assert pred["rel"] == "SS"        # from PR_SS
        assert pred["lag_days"] == 2      # from lag_hr_cnt 16

    def test_wbs_name_is_resolved_from_projwbs(self):
        acts = {a["activity_id"]: a for a in parse_xer(XER.read_text(), "x.xer")}
        assert acts["CIV-EXC-1001"]["wbs_path"] == "Civil Works"
        assert acts["PIP-ERC-2001"]["wbs_path"] == "Piping"


class TestBothFormatsAgree:
    """The two fixtures describe the same schedule, so the readers must too."""

    def test_same_activities_dates_and_logic(self):
        from_xml = sorted(parse_pmxml(PMXML.read_text(), "a.xml"),
                          key=lambda a: a["activity_id"])
        from_xer = sorted(parse_xer(XER.read_text(), "a.xer"),
                          key=lambda a: a["activity_id"])
        assert [a["activity_id"] for a in from_xml] == [a["activity_id"] for a in from_xer]
        for x, e in zip(from_xml, from_xer):
            assert x["planned_start"] == e["planned_start"]
            assert x["planned_finish"] == e["planned_finish"]
            assert x["predecessors"] == e["predecessors"]
            assert x["discipline"] == e["discipline"]


# ── Malformed input is loud ─────────────────────────────────────────────────

class TestMalformedInputErrorsClearly:
    """Never a silent empty result. That is the bug shape D-040 fixed for CSV."""

    def test_broken_xml_names_the_file_and_the_reason(self):
        with pytest.raises(ScheduleParseError) as exc:
            parse_pmxml("<Project><Activity>", "broken.xml")
        assert exc.value.filename == "broken.xml"
        assert "well-formed" in exc.value.reason
        assert "broken.xml" in str(exc.value)

    def test_valid_xml_with_no_activities_is_an_error_not_an_empty_list(self):
        with pytest.raises(ScheduleParseError) as exc:
            parse_pmxml("<Project><WBS/></Project>", "empty.xml")
        assert "no <Activity>" in exc.value.reason

    def test_xer_without_table_markers_is_rejected(self):
        with pytest.raises(ScheduleParseError) as exc:
            parse_xer("just some text\nnot an export\n", "notes.xer")
        assert "XER" in exc.value.reason

    def test_xer_without_a_task_table_is_rejected(self):
        text = "%T\tPROJWBS\n%F\twbs_id\twbs_name\n%R\t1\tCivil\n"
        with pytest.raises(ScheduleParseError) as exc:
            parse_xer(text, "nowork.xer")
        assert "TASK" in exc.value.reason

    def test_xer_task_table_with_no_usable_rows_is_rejected(self):
        text = "%T\tTASK\n%F\ttask_id\ttask_code\n%R\t9001\t\n"
        with pytest.raises(ScheduleParseError) as exc:
            parse_xer(text, "blankcodes.xer")
        assert "no activities" in exc.value.reason

    def test_unknown_extension_is_rejected_by_name(self):
        with pytest.raises(ScheduleParseError) as exc:
            parse_primavera("anything", "schedule.mpp")
        assert ".mpp" in str(exc.value) or "mpp" in exc.value.reason


# ── The providers ───────────────────────────────────────────────────────────

class TestProviders:
    """They used to raise NotImplementedError; F3 is closed."""

    def test_pmxml_provider_reads_and_normalises(self):
        provider = PmxmlScheduleProvider(PMXML)
        acts = provider.read_activities()
        assert len(acts) == 3
        # normalize_activity's guarantees.
        for a in acts:
            assert isinstance(a["planned_qty"], float)
            assert isinstance(a["predecessors"], list)
            assert isinstance(a["description"], str)
            assert "wbs_level" in a

    def test_xer_provider_reads_and_normalises(self):
        acts = PrimaveraXerScheduleProvider(XER).read_activities()
        assert len(acts) == 3

    def test_baseline_identity_is_reported(self):
        baseline = PmxmlScheduleProvider(PMXML).read_baseline()
        assert baseline.source_format == "pmxml"
        assert baseline.activity_count == 3
        assert baseline.filename == "sample_p6.xml"
        assert len(baseline.sha256) == 64

    def test_the_two_providers_report_different_formats(self):
        assert PmxmlScheduleProvider(PMXML).read_baseline().source_format == "pmxml"
        assert PrimaveraXerScheduleProvider(XER).read_baseline().source_format == "xer"

    def test_neither_provider_raises_not_implemented(self):
        for provider in (PmxmlScheduleProvider(PMXML), PrimaveraXerScheduleProvider(XER)):
            provider.read_activities()
            provider.read_baseline()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
