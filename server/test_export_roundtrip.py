"""Relationship type and lag must survive an export.

Both exporters used to iterate `predecessor_list()` — activity ids only — and
write `Type="FS" Lag="0d"` against every tie. A baseline imported with SS and
FF links and multi-day lags therefore came back out as a flat finish-to-start
network with no lag anywhere, and re-importing the export produced a different
schedule from the one that went in.

That is not a formatting detail. `server/cpm.py` computes total float, the
critical path, and every beyond-float delay day from exactly these ties, and
`server/delay_events.py` builds a liquidated-damages argument on top of that.
An export that flattens the logic changes who owes whom time.

These tests round-trip through the real importer in `matching/primavera.py`
rather than asserting on strings, because the property that matters is that
the file reads back as the same network — not that it contains a particular
substring. See D-092.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from server.db import Activity
from server.main import _generate_pmxml, _generate_xer
from matching.primavera import parse_pmxml, parse_xer


def _activity(activity_id: str, predecessors: list[dict] | None = None) -> Activity:
    return Activity(
        activity_id=activity_id,
        wbs_path="1.1",
        description=f"Work package {activity_id}",
        detail="",
        discipline="piping",
        planned_start=date(2026, 6, 1),
        planned_finish=date(2026, 6, 10),
        planned_qty=10,
        uom="nos",
        predecessors=json.dumps(predecessors or []),
    )


#: One activity per relationship type, plus lags that are positive, zero and
#: negative. A negative lag (a lead) is the case a naive exporter is most
#: likely to drop or mangle, and P6 schedules are full of them.
NETWORK = [
    _activity("PIP-AAA-1001"),
    _activity("PIP-BBB-1002", [{"activity_id": "PIP-AAA-1001", "rel": "SS", "lag_days": 3}]),
    _activity("PIP-CCC-1003", [{"activity_id": "PIP-BBB-1002", "rel": "FF", "lag_days": 0}]),
    _activity("PIP-DDD-1004", [{"activity_id": "PIP-CCC-1003", "rel": "SF", "lag_days": -2}]),
    _activity(
        "PIP-EEE-1005",
        [
            {"activity_id": "PIP-AAA-1001", "rel": "FS", "lag_days": 7},
            {"activity_id": "PIP-DDD-1004", "rel": "SS", "lag_days": 1},
        ],
    ),
]


def _links_by_activity(activities: list[dict]) -> dict[str, list[tuple[str, str, int]]]:
    """{activity_id: sorted [(predecessor, rel, lag_days)]} from parsed output."""
    out: dict[str, list[tuple[str, str, int]]] = {}
    for act in activities:
        links = []
        for link in act.get("predecessors") or []:
            if isinstance(link, dict):
                links.append((link["activity_id"], link.get("rel", "FS"),
                              int(link.get("lag_days") or 0)))
            else:
                links.append((str(link), "FS", 0))
        out[act["activity_id"]] = sorted(links)
    return out


EXPECTED = {
    "PIP-AAA-1001": [],
    "PIP-BBB-1002": [("PIP-AAA-1001", "SS", 3)],
    "PIP-CCC-1003": [("PIP-BBB-1002", "FF", 0)],
    "PIP-DDD-1004": [("PIP-CCC-1003", "SF", -2)],
    "PIP-EEE-1005": sorted(
        [("PIP-AAA-1001", "FS", 7), ("PIP-DDD-1004", "SS", 1)]
    ),
}


class TestPmxmlRoundTrip:
    def test_relationship_types_and_lags_survive(self):
        xml = _generate_pmxml(NETWORK, include_actuals=False, project_name="Round trip")
        assert _links_by_activity(parse_pmxml(xml)) == EXPECTED

    def test_a_flattened_export_would_fail_this(self):
        """The assertion above is only meaningful if FS/0d would break it."""
        assert EXPECTED["PIP-BBB-1002"] != [("PIP-AAA-1001", "FS", 0)]


class TestXerRoundTrip:
    def test_relationship_types_and_lags_survive(self):
        xer = _generate_xer(NETWORK, include_actuals=False, project_name="Round trip")
        assert _links_by_activity(parse_xer(xer)) == EXPECTED

    def test_lag_is_written_in_days_not_bare_hours(self):
        """A bare number in an XER lag column is read back as HOURS.

        `_lag_days` converts at 8 hours per working day, so writing `3` where
        3 days was meant reads back as 0 days. The exporter writes `3d`.
        """
        xer = _generate_xer(NETWORK, include_actuals=False, project_name="Round trip")
        assert "\tlag\t3d" in xer
        assert "\tlag\t-2d" in xer


class TestTheTwoFormatsAgree:
    """One schedule must not export two different logic networks depending on
    the format chosen. That defect shipped once already — XER wrote SS while
    PMXML wrote FS for the same rows — and D-047 fixed it by making both write
    the constant FS. This checks the stronger property."""

    def test_pmxml_and_xer_describe_the_same_network(self):
        xml = _generate_pmxml(NETWORK, include_actuals=False, project_name="P")
        xer = _generate_xer(NETWORK, include_actuals=False, project_name="P")

        assert _links_by_activity(parse_pmxml(xml)) == _links_by_activity(parse_xer(xer))


class TestBareIdsStillMeanFinishToStart:
    """Rows stored in the older shape — a JSON list of bare ids — must export
    exactly as they did before, or this change would rewrite the meaning of
    every activity seeded before typed links existed."""

    def test_a_bare_predecessor_exports_as_fs_with_no_lag(self):
        legacy = [
            _activity("CIV-AAA-1001"),
            _activity("CIV-BBB-1002", None),
        ]
        legacy[1].predecessors = json.dumps(["CIV-AAA-1001"])

        xml = _generate_pmxml(legacy, include_actuals=False, project_name="Legacy")
        links = _links_by_activity(parse_pmxml(xml))
        assert links["CIV-BBB-1002"] == [("CIV-AAA-1001", "FS", 0)]


class TestTheProjectIsNamedHonestly:
    def test_the_export_carries_the_name_it_was_given(self):
        import xml.etree.ElementTree as ET

        xml = _generate_pmxml(NETWORK, include_actuals=False, project_name="Sector 9 Tie-in")
        root = ET.fromstring(xml)
        assert root.get("Name") == "Sector 9 Tie-in"

    def test_the_window_comes_from_the_activities(self):
        import xml.etree.ElementTree as ET

        wide = list(NETWORK)
        wide.append(_activity("PIP-ZZZ-1099"))
        wide[-1].planned_start = date(2026, 1, 5)
        wide[-1].planned_finish = date(2027, 3, 20)

        root = ET.fromstring(
            _generate_pmxml(wide, include_actuals=False, project_name="Window")
        )
        assert root.get("StartDate") == "2026-01-05"
        assert root.get("FinishDate") == "2027-03-20"
