"""Tests for schedule providers, baseline identity, and the agreement guard.

Two baselines ship and they disagree about almost everything except the fields
the matcher reads: `baseline_schedule.json` has a dotted `wbs_path` string, bare
predecessor ids and a `detail` field; `baseline_schedule_v2.json` has a LIST of
WBS names, typed predecessors, `wbs_level`, `calendar` and no `detail` at all.
The provider is the one place that difference is resolved, so it is the one
place worth testing it.

Run with: python -m pytest matching/test_providers.py -v
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pytest

from matching.primavera import ScheduleParseError

from matching.providers import (
    DEFAULT_RELATIONSHIP,
    BaselineVersion,
    JsonScheduleProvider,
    PmxmlScheduleProvider,
    PredecessorLink,
    PrimaveraXerScheduleProvider,
    ScheduleProvider,
    check_ground_truth_agreement,
    dangling_predecessors,
    normalize_activity,
    normalize_wbs_level,
    normalize_wbs_path,
    parse_predecessors,
    validate_activities,
)
from matching.schedule_index import ScheduleIndex

DATASET = PROJECT_ROOT / "dataset"
V1 = DATASET / "baseline_schedule.json"
V2 = DATASET / "baseline_schedule_v2.json"


# ══════════════════════════════════════════════════════════════════════════════
# Normalisation
# ══════════════════════════════════════════════════════════════════════════════

class TestWbsPath:
    def test_v1_dotted_string_is_left_alone(self):
        assert normalize_wbs_path("1.1.1.1") == "1.1.1.1"

    def test_v2_list_becomes_one_path(self):
        path = normalize_wbs_path(["Project", "Civil Works", "Survey"])
        assert path == "Project > Civil Works > Survey"

    def test_empty_segments_are_dropped(self):
        assert normalize_wbs_path(["A", "", None, "B"]) == "A > B"

    def test_none_is_empty(self):
        assert normalize_wbs_path(None) == ""


class TestWbsLevel:
    def test_v2_level_is_read(self):
        assert normalize_wbs_level(5) == 5
        assert normalize_wbs_level(6) == 6

    def test_absent_level_is_none_not_guessed(self):
        """v1's "1.1.1.1" has four segments. Inferring level 4 from it would
        contradict the fact that those rows are the L5/L6 leaves the problem
        statement describes, so absence is recorded as absence."""
        assert normalize_wbs_level(None, "1.1.1.1") is None

    def test_unparseable_level_is_none(self):
        assert normalize_wbs_level("deep") is None


class TestPredecessors:
    def test_bare_id_reads_as_fs_zero_lag(self):
        links = parse_predecessors(["CIV-PLY-1004"])
        assert links == [PredecessorLink("CIV-PLY-1004", DEFAULT_RELATIONSHIP, 0)]

    def test_typed_link_is_preserved(self):
        links = parse_predecessors(
            [{"activity_id": "CIV-SRV-1002", "rel": "SS", "lag_days": 3}]
        )
        assert links == [PredecessorLink("CIV-SRV-1002", "SS", 3)]

    @pytest.mark.parametrize("rel", ["FS", "SS", "FF", "SF"])
    def test_every_relationship_type_survives(self, rel):
        links = parse_predecessors([{"activity_id": "A-1", "rel": rel}])
        assert links[0].rel == rel

    def test_unknown_relationship_falls_back_to_fs(self):
        """A relationship type we cannot read is a weaker signal than a
        predecessor dropped entirely."""
        links = parse_predecessors([{"activity_id": "A-1", "rel": "ZZ"}])
        assert links[0].rel == "FS"

    def test_lowercase_relationship_is_accepted(self):
        assert parse_predecessors([{"activity_id": "A-1", "rel": "ss"}])[0].rel == "SS"

    def test_unparseable_lag_is_zero(self):
        assert parse_predecessors([{"activity_id": "A-1", "lag_days": "soon"}])[0].lag_days == 0

    def test_entry_without_an_id_is_dropped(self):
        assert parse_predecessors([{"rel": "FS", "lag_days": 2}, ""]) == []

    def test_empty_is_empty(self):
        assert parse_predecessors(None) == []
        assert parse_predecessors([]) == []


class TestNormalizeActivity:
    def test_v2_shape_normalises(self):
        act = normalize_activity({
            "activity_id": "CIV-SRV-1002",
            "wbs_path": ["Project", "Civil", "Survey"],
            "wbs_level": 5,
            "description": "Grid establishment",
            "discipline": "CIVIL",
            "tag": None,
            "planned_start": "2026-03-02",
            "planned_finish": "2026-03-07",
            "planned_qty": 4800,
            "uom": "m2",
            "calendar": "6-day",
            "predecessors": [{"activity_id": "CIV-SRV-1001", "rel": "FS", "lag_days": 1}],
        })
        assert act["wbs_path"] == "Project > Civil > Survey"
        assert act["wbs_level"] == 5
        assert act["calendar"] == "6-day"
        assert act["discipline"] == "civil"
        assert act["detail"] == "", "a missing detail must normalise, not raise"
        assert act["predecessors"] == [
            {"activity_id": "CIV-SRV-1001", "rel": "FS", "lag_days": 1}
        ]

    def test_detail_is_optional(self):
        """v2 omits `detail` entirely; it is concatenated into the embedding
        document and the BM25 tokens, so it has to exist as a string."""
        act = normalize_activity({"activity_id": "A-1"})
        assert act["detail"] == ""

    def test_v1_shape_still_normalises(self):
        act = normalize_activity({
            "activity_id": "CIV-SIT-1002",
            "wbs_path": "1.1.1.2",
            "description": "Site clearing",
            "detail": "Zone B",
            "discipline": "civil",
            "planned_qty": 1200,
            "uom": "m2",
            "predecessors": ["CIV-SIT-1001"],
        })
        assert act["wbs_path"] == "1.1.1.2"
        assert act["wbs_level"] is None
        assert act["calendar"] is None
        assert act["detail"] == "Zone B"
        assert act["predecessors"] == [
            {"activity_id": "CIV-SIT-1001", "rel": "FS", "lag_days": 0}
        ]


# ══════════════════════════════════════════════════════════════════════════════
# Validation
# ══════════════════════════════════════════════════════════════════════════════

class TestValidation:
    def _act(self, **over):
        base = {
            "activity_id": "A-1",
            "planned_start": "2026-03-02",
            "planned_finish": "2026-03-07",
            "wbs_level": 5,
        }
        base.update(over)
        return base

    def test_clean_baseline_has_no_problems(self):
        assert validate_activities([self._act()]) == []

    def test_missing_id_is_a_problem(self):
        problems = validate_activities([self._act(activity_id="")])
        assert any("no activity_id" in p for p in problems)

    def test_duplicate_id_is_a_problem(self):
        problems = validate_activities([self._act(), self._act()])
        assert any("duplicate" in p for p in problems)

    def test_missing_planned_date_is_a_problem(self):
        problems = validate_activities([self._act(planned_finish=None)])
        assert any("planned start or finish" in p for p in problems)

    def test_out_of_range_wbs_level_is_a_problem(self):
        problems = validate_activities([self._act(wbs_level=3)])
        assert any("wbs_level 3" in p for p in problems)

    def test_absent_wbs_level_is_not_a_problem(self):
        """The v1 baseline states no level at all; that is not an error."""
        assert validate_activities([self._act(wbs_level=None)]) == []

    def test_dangling_predecessor_is_reported(self):
        acts = [normalize_activity(self._act(predecessors=["NOT-A-REAL-ID"]))]
        assert dangling_predecessors(acts) == ["NOT-A-REAL-ID"]


# ══════════════════════════════════════════════════════════════════════════════
# The providers
# ══════════════════════════════════════════════════════════════════════════════

class TestJsonScheduleProvider:
    def test_v1_loads(self):
        provider = JsonScheduleProvider(V1)
        assert len(provider.read_activities()) == 120

    def test_v2_loads(self):
        provider = JsonScheduleProvider(V2)
        assert len(provider.read_activities()) == 218

    def test_both_baselines_validate(self):
        for path in (V1, V2):
            acts = JsonScheduleProvider(path).read_activities()
            assert validate_activities(acts) == [], f"{path.name} failed validation"

    def test_neither_baseline_has_dangling_logic(self):
        for path in (V1, V2):
            acts = JsonScheduleProvider(path).read_activities()
            assert dangling_predecessors(acts) == [], f"{path.name} has dangling logic"

    def test_baseline_identity_is_the_file_hash(self):
        provider = JsonScheduleProvider(V2)
        version = provider.read_baseline()
        assert version.filename == "baseline_schedule_v2.json"
        assert version.activity_count == 218
        assert version.sha256 == hashlib.sha256(V2.read_bytes()).hexdigest()
        assert version.source_format == "json"

    def test_the_two_baselines_are_distinguishable(self):
        """The whole point of recording a version: two runs quoting different
        numbers must be tellable apart by more than an activity count."""
        assert (
            JsonScheduleProvider(V1).read_baseline().sha256
            != JsonScheduleProvider(V2).read_baseline().sha256
        )

    def test_wrapped_object_shape_is_accepted(self, tmp_path):
        path = tmp_path / "wrapped.json"
        path.write_text(json.dumps({"activities": [
            {"activity_id": "A-1", "planned_start": "2026-01-01",
             "planned_finish": "2026-01-02"}
        ]}), encoding="utf-8")
        assert len(JsonScheduleProvider(path).read_activities()) == 1

    def test_missing_file_is_reported_clearly(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            JsonScheduleProvider(tmp_path / "nope.json").read_activities()

    def test_reads_the_file_once(self, tmp_path):
        path = tmp_path / "sched.json"
        path.write_text(json.dumps([
            {"activity_id": "A-1", "planned_start": "2026-01-01",
             "planned_finish": "2026-01-02"}
        ]), encoding="utf-8")
        provider = JsonScheduleProvider(path)
        provider.read_baseline()
        path.unlink()                      # gone from disk
        assert len(provider.read_activities()) == 1, "content was not cached"


class TestPrimaveraProviders:
    """These were stubs that raised NotImplementedError until D-047.

    This class used to assert that they refused. It now asserts they work,
    because FINDINGS.md F3 is closed. Parsing detail lives in
    `matching/test_primavera.py`; what is checked here is that they satisfy the
    provider contract like every other provider.
    """

    FIXTURES = Path(__file__).resolve().parent.parent / "dataset" / "fixtures"

    @pytest.mark.parametrize(
        "cls,fixture,fmt",
        [
            (PmxmlScheduleProvider, "sample_p6.xml", "pmxml"),
            (PrimaveraXerScheduleProvider, "sample_p6.xer", "xer"),
        ],
    )
    def test_they_read_a_real_export(self, cls, fixture, fmt):
        provider = cls(self.FIXTURES / fixture)
        assert isinstance(provider, ScheduleProvider)

        activities = provider.read_activities()
        assert len(activities) == 3

        baseline = provider.read_baseline()
        assert baseline.source_format == fmt
        assert baseline.activity_count == 3
        assert len(baseline.sha256) == 64

    @pytest.mark.parametrize(
        "cls", [PmxmlScheduleProvider, PrimaveraXerScheduleProvider]
    )
    def test_a_file_that_is_not_a_schedule_still_refuses_loudly(self, cls, tmp_path):
        """Implemented does not mean permissive: garbage in is still an error
        naming the file, never an empty baseline."""
        bad = tmp_path / "notes.xer" if cls is PrimaveraXerScheduleProvider else tmp_path / "notes.xml"
        bad.write_text("this is not a schedule", encoding="utf-8")
        with pytest.raises(ScheduleParseError) as e:
            cls(bad).read_activities()
        assert bad.name in str(e.value)


# ══════════════════════════════════════════════════════════════════════════════
# ScheduleIndex over both baselines
# ══════════════════════════════════════════════════════════════════════════════

class TestScheduleIndexAcrossBaselines:
    def test_v1_index_carries_its_baseline(self):
        index = ScheduleIndex.from_json(V1)
        assert len(index.records) == 120
        assert index.baseline.filename == "baseline_schedule.json"

    def test_v2_index_loads_and_carries_the_new_fields(self):
        index = ScheduleIndex.from_json(V2)
        assert len(index.records) == 218
        rec = index.by_id["CIV-SRV-1001"]
        assert rec.wbs_level == 5
        assert rec.calendar == "6-day"
        assert rec.wbs_path.startswith("Duliajan Well-Site Development")

    def test_v2_typed_logic_survives_into_the_index(self):
        index = ScheduleIndex.from_json(V2)
        linked = next(r for r in index.records if r.predecessor_links)
        link = linked.predecessor_links[0]
        assert set(link) == {"activity_id", "rel", "lag_days"}
        # The ranking stage reads bare ids; both views must agree.
        assert linked.predecessors == [l["activity_id"] for l in linked.predecessor_links]

    def test_v1_predecessors_are_still_bare_ids_for_the_ranker(self):
        index = ScheduleIndex.from_json(V1)
        rec = index.by_id["CIV-SIT-1002"]
        assert rec.predecessors == ["CIV-SIT-1001"]
        assert rec.predecessor_links[0]["rel"] == "FS"

    def test_the_two_baselines_share_no_activity_ids(self):
        """The fact that makes the agreement guard necessary."""
        v1 = set(ScheduleIndex.from_json(V1).by_id)
        v2 = set(ScheduleIndex.from_json(V2).by_id)
        assert v1 & v2 == set()

    def test_a_hand_built_schedule_still_works(self):
        """Tests and synthetic schedules pass raw dicts, not provider output."""
        index = ScheduleIndex([{
            "activity_id": "MIL-1", "description": "Milestone",
            "planned_start": "2026-01-01", "planned_finish": "2026-01-01",
            "predecessors": [], "uom": "", "planned_qty": 0,
        }])
        assert index.by_id["MIL-1"].wbs_level is None
        assert index.baseline is None


# ══════════════════════════════════════════════════════════════════════════════
# The guard: does the ground truth describe this baseline?
# ══════════════════════════════════════════════════════════════════════════════

def _ground_truth_ids() -> list[str]:
    import csv

    ids = []
    # utf-8 explicitly, never the platform default: the corpus is UTF-8 as of
    # D-045, and a bare open() would read it as cp1252 on Windows.
    with open(DATASET / "ground_truth.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            aid = (row.get("activity_id") or "").strip()
            if aid:
                ids.append(aid)
    return ids


class TestGroundTruthAgreement:
    def test_the_reference_baseline_agrees(self):
        index = ScheduleIndex.from_json(V1)
        result = check_ground_truth_agreement(
            index, _ground_truth_ids(), baseline=index.baseline
        )
        assert result.total_ids == 141
        assert result.ok, result.report()
        assert result.coverage == 1.0

    def test_the_new_baseline_does_not_agree(self):
        """The exact failure this guard exists for: 218 activity ids that do
        not intersect the 120 the labels were written against. The 63 that
        'resolve' do so by numeric-suffix coincidence."""
        index = ScheduleIndex.from_json(V2)
        result = check_ground_truth_agreement(
            index, _ground_truth_ids(), baseline=index.baseline
        )
        assert not result.ok
        assert result.resolved_ids == 63
        assert result.missing_count == 78
        assert result.coverage < 0.80

    def test_no_match_rows_are_not_counted_as_activities(self):
        index = ScheduleIndex.from_json(V1)
        result = check_ground_truth_agreement(
            index, ["CIV-SIT-1001", "NO_MATCH", "NO_MATCH"]
        )
        assert result.total_ids == 1

    def test_ids_are_deduplicated(self):
        index = ScheduleIndex.from_json(V1)
        result = check_ground_truth_agreement(
            index, ["CIV-SIT-1001", "CIV-SIT-1001"]
        )
        assert result.total_ids == 1

    def test_an_empty_ground_truth_is_not_agreement(self):
        """0/0 must not read as 100%: a ground truth with nothing in it cannot
        vouch for a baseline."""
        index = ScheduleIndex.from_json(V1)
        result = check_ground_truth_agreement(index, [])
        assert not result.ok

    def test_the_report_names_the_baseline_and_the_gap(self):
        index = ScheduleIndex.from_json(V2)
        result = check_ground_truth_agreement(
            index, _ground_truth_ids(), baseline=index.baseline
        )
        report = result.report()
        assert "baseline_schedule_v2.json" in report
        assert "78" in report
        assert "44.7%" in report

    def test_threshold_is_configurable(self):
        index = ScheduleIndex.from_json(V2)
        loose = check_ground_truth_agreement(
            index, _ground_truth_ids(), threshold=0.40
        )
        assert loose.ok, "a caller that lowers the bar should be obeyed"
