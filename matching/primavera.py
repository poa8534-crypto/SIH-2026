"""Reading Primavera P6 exports: PMXML (XML) and XER (tab-delimited).

Closes FINDINGS.md **F3**. The problem statement names Primavera exports as an
*input*; until now this system only ever wrote them
(`POST /schedule/export`), and `PmxmlScheduleProvider` /
`PrimaveraXerScheduleProvider` raised `NotImplementedError`.

Pure standard library — `xml.etree` and string splitting. **No MPXJ and no
`.mpp`**: MPXJ is a Java library needing a JVM on the machine, which would break
the offline guarantee this project rests on. `.mpp` is a compiled binary format
with no pure-Python reader worth trusting. Both were considered and rejected;
this note is here so the next reader does not "fix" the omission.

TWO DIALECTS PER FORMAT, AND WHY
--------------------------------
Each parser accepts the canonical Oracle shape *and* the shape this repository's
own exporter emits, because round-tripping our own export is the first thing
anyone will try.

**PMXML.** Oracle nests scalars as child elements (`<Activity><Id>A1000</Id>`).
`server/main.py::_generate_pmxml` instead writes them as attributes
(`<Activity ActivityID="A1000" ActivityName="...">`) with `<StartDate>` /
`<FinishDate>` children. Both are read.

**XER.** A real XER is a table dump: `%T` names a table, `%F` gives its column
header, `%R` is one row. The baseline lives in `TASK` and the logic in
`TASKPRED`. `server/main.py::_generate_xer` emits something else entirely -
one `T<tab>ACTIVITY<tab>ACT<tab>key<tab>value` line per field - which is **not
valid XER and would not import into P6**. That is a defect in the writer, not
in this reader; the reader accepts it so the round trip works, and the defect is
recorded in D-047.

WHAT IS READ
------------
Activity id, name, planned start, planned finish, WBS path, and predecessor
relationships with type and lag. Calendars, resources, costs and codes are
skipped: none of them reach `normalize_activity`'s output shape, so parsing them
would be work that nothing consumes.

FAILURE IS LOUD
---------------
A malformed file raises `ScheduleParseError` naming the file and the reason. A
file that parses but yields **zero activities** is also an error - returning an
empty baseline with HTTP 200 is exactly the bug shape D-040 fixed for CSV
uploads, and it must not be reintroduced here.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Optional

__all__ = [
    "ScheduleParseError",
    "parse_pmxml",
    "parse_xer",
    "parse_primavera",
]


class ScheduleParseError(ValueError):
    """A Primavera export could not be read. Carries the file and the reason."""

    def __init__(self, filename: str, reason: str):
        self.filename = filename
        self.reason = reason
        super().__init__(f"{filename}: {reason}")


# ── Dates ───────────────────────────────────────────────────────────────────

#: Formats seen across P6 exports. ISO first because it is unambiguous; the
#: `DD-MON-YY` form is what this repo's own XER writer emits.
_DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
    "%d-%b-%y",
    "%d-%b-%Y",
    "%d/%m/%Y",
    "%m/%d/%Y",
)


def _parse_date(value: Optional[str]) -> Optional[date]:
    """A date, or None. Never a guess.

    An unrecognised non-empty string returns None rather than raising: one
    unreadable date on one activity should not refuse a 2000-activity import.
    A *missing planned date* is caught later by `validate_activities`, which is
    where that judgement belongs.
    """
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _iso(value: Optional[date]) -> Optional[str]:
    return value.isoformat() if value else None


# ── Shared helpers ──────────────────────────────────────────────────────────

def _relationship(raw: Optional[str]) -> str:
    """Primavera spells relationships `PR_FS`; the baseline shape wants `FS`."""
    if not raw:
        return "FS"
    text = str(raw).strip().upper()
    if text.startswith("PR_"):
        text = text[3:]
    return text if text in {"FS", "SS", "FF", "SF"} else "FS"


def _lag_days(raw: Optional[str]) -> int:
    """Lag in whole days.

    XER records lag in hours (`lag_hr_cnt`); PMXML and this repo's exporter
    write things like `0d` or `16h`. Hours convert at 8 per working day, which
    is P6's default; anything unparseable is 0 rather than a guess.
    """
    if raw is None:
        return 0
    text = str(raw).strip().lower()
    if not text:
        return 0
    match = re.match(r"^(-?\d+(?:\.\d+)?)\s*([dh]?)$", text)
    if not match:
        return 0
    value = float(match.group(1))
    unit = match.group(2)
    if unit == "h":
        return int(round(value / 8.0))
    if unit == "d":
        return int(round(value))
    # Bare number in an XER lag column means hours.
    return int(round(value / 8.0))


def _discipline_from_id(activity_id: str) -> str:
    """Discipline from the id prefix, e.g. `PIP-ERC-1030` -> `piping`.

    P6 has no discipline field; this project's ids encode it. An id that does
    not match returns `unknown`, which `normalize_activity` accepts and which
    the matcher treats as "no discipline signal" rather than a wrong one.
    """
    prefixes = {
        "CIV": "civil",
        "PIP": "piping",
        "SEQ": "static_equipment",
        "ELE": "electrical",
        "INS": "instrumentation",
        "HSE": "hse",
    }
    head = (activity_id or "").strip().upper().split("-", 1)[0]
    return prefixes.get(head, "unknown")


def _finish(activities: list[dict], filename: str) -> list[dict]:
    """Last gate before returning: an empty parse is an error, not a result."""
    if not activities:
        raise ScheduleParseError(
            filename,
            "parsed successfully but contained no activities - check this is a "
            "P6 schedule export and not an empty or filtered file",
        )
    return activities


# ── PMXML ───────────────────────────────────────────────────────────────────

def _strip_ns(tag: str) -> str:
    """`{namespace}Activity` -> `Activity`. P6 namespaces everything."""
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _child_text(element: ET.Element, *names: str) -> Optional[str]:
    """First matching child's text, ignoring namespace, or None."""
    wanted = {n.lower() for n in names}
    for child in element:
        if _strip_ns(child.tag).lower() in wanted:
            text = (child.text or "").strip()
            if text:
                return text
    return None


def _attr(element: ET.Element, *names: str) -> Optional[str]:
    lowered = {k.lower(): v for k, v in element.attrib.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value and value.strip():
            return value.strip()
    return None


def _field(element: ET.Element, *names: str) -> Optional[str]:
    """A value that may be an attribute or a child element. Attribute wins."""
    return _attr(element, *names) or _child_text(element, *names)


def parse_pmxml(text: str, filename: str = "schedule.xml") -> list[dict]:
    """Activities from a Primavera PMXML document, in baseline shape."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise ScheduleParseError(filename, f"not well-formed XML - {exc}") from exc

    elements = [e for e in root.iter() if _strip_ns(e.tag) == "Activity"]
    if not elements:
        raise ScheduleParseError(
            filename,
            "no <Activity> elements found - this does not look like a PMXML "
            "schedule export",
        )

    activities: list[dict] = []
    for element in elements:
        activity_id = _field(element, "Id", "ActivityID", "ActivityId", "TaskCode")
        if not activity_id:
            # An activity with no id cannot be linked to anything. Skipping it
            # is right; silently skipping every one is not, which is what the
            # empty-result check below catches.
            continue

        name = _field(element, "Name", "ActivityName", "TaskName") or ""
        wbs = _field(element, "WBSPath", "WBSName", "WBSCode") or ""

        predecessors = []
        for rel in element.iter():
            if _strip_ns(rel.tag) not in {"Predecessor", "Relationship"}:
                continue
            pred_id = _field(rel, "PredecessorActivityId", "ActivityID", "Id")
            if not pred_id:
                continue
            predecessors.append(
                {
                    "activity_id": pred_id,
                    "rel": _relationship(_field(rel, "Type", "RelationshipType")),
                    "lag_days": _lag_days(_field(rel, "Lag", "LagDuration")),
                }
            )

        activities.append(
            {
                "activity_id": activity_id,
                "description": name,
                "wbs_path": wbs,
                "discipline": _discipline_from_id(activity_id),
                "planned_start": _iso(
                    _parse_date(
                        _field(element, "PlannedStartDate", "StartDate", "TargetStartDate")
                    )
                ),
                "planned_finish": _iso(
                    _parse_date(
                        _field(element, "PlannedFinishDate", "FinishDate", "TargetFinishDate")
                    )
                ),
                "predecessors": predecessors,
            }
        )

    return _finish(activities, filename)


# ── XER ─────────────────────────────────────────────────────────────────────

def _parse_xer_tables(text: str) -> dict[str, list[dict]]:
    """A real XER: `%T` table, `%F` header, `%R` rows -> {table: [row dicts]}."""
    tables: dict[str, list[dict]] = {}
    current: Optional[str] = None
    fields: list[str] = []

    for line in text.splitlines():
        if not line or not line.startswith("%"):
            continue
        parts = line.split("\t")
        marker = parts[0].strip()
        if marker == "%T":
            current = parts[1].strip().upper() if len(parts) > 1 else None
            fields = []
            if current:
                tables.setdefault(current, [])
        elif marker == "%F":
            fields = [p.strip() for p in parts[1:]]
        elif marker == "%R" and current and fields:
            values = parts[1:]
            # Short rows are padded rather than dropped: a trailing empty column
            # is common in exports and is not a reason to lose the row.
            values += [""] * (len(fields) - len(values))
            tables[current].append(dict(zip(fields, values)))
    return tables


def _parse_xer_simplified(text: str) -> list[dict]:
    """This repository's own non-standard XER shape.

    `server/main.py::_generate_xer` writes one `T<tab>ACTIVITY<tab>ACT<tab>
    key<tab>value` line per field, with a blank line between activities. That is
    not valid XER (see the module docstring), but our own export must round-trip.
    """
    activities: list[dict] = []
    current: dict[str, str] = {}
    relationships: list[dict[str, str]] = []
    pending_rel: dict[str, str] = {}

    def flush_activity():
        if current.get("act_id"):
            activities.append(dict(current))
        current.clear()

    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 5 or parts[0] != "T":
            if not line.strip():
                flush_activity()
                if pending_rel.get("predecessor_act_id"):
                    relationships.append(dict(pending_rel))
                pending_rel.clear()
            continue
        entity, key, value = parts[1], parts[3], parts[4]
        if entity == "ACTIVITY":
            if key == "act_id" and current.get("act_id"):
                flush_activity()
            current[key] = value
        elif entity == "FUNCDD":
            pending_rel[key] = value
    flush_activity()
    if pending_rel.get("predecessor_act_id"):
        relationships.append(dict(pending_rel))

    by_successor: dict[str, list[dict]] = {}
    for rel in relationships:
        successor = rel.get("successor_act_id")
        if not successor:
            continue
        by_successor.setdefault(successor, []).append(
            {
                "activity_id": rel.get("predecessor_act_id", ""),
                "rel": _relationship(rel.get("relationship_type")),
                "lag_days": _lag_days(rel.get("lag")),
            }
        )

    out = []
    for row in activities:
        activity_id = row.get("act_id", "").strip()
        if not activity_id:
            continue
        out.append(
            {
                "activity_id": activity_id,
                "description": row.get("activity_name", ""),
                "wbs_path": row.get("wbs_path", ""),
                "discipline": _discipline_from_id(activity_id),
                "planned_start": _iso(_parse_date(row.get("target_start_date"))),
                "planned_finish": _iso(_parse_date(row.get("target_end_date"))),
                "predecessors": by_successor.get(activity_id, []),
            }
        )
    return out


def parse_xer(text: str, filename: str = "schedule.xer") -> list[dict]:
    """Activities from a Primavera XER export, in baseline shape."""
    if "%T" in text:
        tables = _parse_xer_tables(text)
        tasks = tables.get("TASK", [])
        if not tasks:
            raise ScheduleParseError(
                filename,
                "no TASK table found - an XER schedule export must contain one",
            )

        # task_id -> task_code, so TASKPRED's internal ids become activity ids.
        code_by_id = {
            row.get("task_id", ""): (row.get("task_code") or "").strip()
            for row in tasks
        }

        by_successor: dict[str, list[dict]] = {}
        for row in tables.get("TASKPRED", []):
            successor = code_by_id.get(row.get("task_id", ""))
            predecessor = code_by_id.get(row.get("pred_task_id", ""))
            if not successor or not predecessor:
                continue
            by_successor.setdefault(successor, []).append(
                {
                    "activity_id": predecessor,
                    "rel": _relationship(row.get("pred_type")),
                    "lag_days": _lag_days(row.get("lag_hr_cnt")),
                }
            )

        # WBS names, so an imported activity keeps a readable path.
        wbs_name_by_id = {
            row.get("wbs_id", ""): (row.get("wbs_name") or "").strip()
            for row in tables.get("PROJWBS", [])
        }

        activities = []
        for row in tasks:
            activity_id = (row.get("task_code") or "").strip()
            if not activity_id:
                continue
            activities.append(
                {
                    "activity_id": activity_id,
                    "description": (row.get("task_name") or "").strip(),
                    "wbs_path": wbs_name_by_id.get(row.get("wbs_id", ""), ""),
                    "discipline": _discipline_from_id(activity_id),
                    "planned_start": _iso(
                        _parse_date(
                            row.get("target_start_date") or row.get("early_start_date")
                        )
                    ),
                    "planned_finish": _iso(
                        _parse_date(
                            row.get("target_end_date") or row.get("early_end_date")
                        )
                    ),
                    "predecessors": by_successor.get(activity_id, []),
                }
            )
        return _finish(activities, filename)

    if "\tACTIVITY\t" in text:
        return _finish(_parse_xer_simplified(text), filename)

    raise ScheduleParseError(
        filename,
        "no XER table markers (%T/%F/%R) and no recognisable activity rows - "
        "check this is a Primavera XER export",
    )


# ── Entry point ─────────────────────────────────────────────────────────────

def parse_primavera(text: str, filename: str) -> list[dict]:
    """Dispatch on extension. Raises `ScheduleParseError` on anything else."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".xml":
        return parse_pmxml(text, filename)
    if suffix == ".xer":
        return parse_xer(text, filename)
    raise ScheduleParseError(
        filename, f"unsupported extension '{suffix or '(none)'}' - expected .xml or .xer"
    )
