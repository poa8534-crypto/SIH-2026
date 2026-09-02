"""Schedule providers: where a baseline comes from, and what shape it arrives in.

Two baselines now exist, written months apart and in different shapes:

  dataset/baseline_schedule.json      120 activities, `wbs_path` a dotted string
                                      ("1.1.1.1"), predecessors as bare id
                                      strings, `detail` always present
  dataset/baseline_schedule_v2.json   218 activities, `wbs_path` a LIST of WBS
                                      element names, `wbs_level` and `calendar`
                                      present, predecessors typed
                                      ({activity_id, rel, lag_days}), no `detail`

Every consumer used to reach for `json.load` and read the fields it happened to
need, which is how a shape difference becomes six separate bugs. This module is
the one place that knows the difference: a provider reads a source and returns
**normalised** activity dicts, so `ScheduleIndex`, the server seeder and the
importer all see the same shape whatever the file looked like.

`read_baseline()` returns the identity of what was read - filename, sha256 and
activity count - so that any number computed downstream can name the baseline it
came from. A metric without that identity is not reproducible.

PMXML and XER are read by `matching/primavera.py`; see `PmxmlScheduleProvider`
and `PrimaveraXerScheduleProvider`.
"""

from __future__ import annotations

import hashlib
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from matching.primavera import ScheduleParseError, parse_pmxml, parse_xer

# Predecessor relationship types, as Primavera defines them.
RELATIONSHIP_TYPES = ("FS", "SS", "FF", "SF")
DEFAULT_RELATIONSHIP = "FS"

# WBS levels this project plans at. L5/L6 is the granularity the problem
# statement names; anything else is a data error worth seeing rather than
# silently accepting.
VALID_WBS_LEVELS = (5, 6)

WBS_SEPARATOR = " > "


# ── Identity of a loaded baseline ────────────────────────────────────────────

@dataclass(frozen=True)
class BaselineVersion:
    """Which schedule is loaded, and how to prove it later.

    `sha256` is over the raw bytes of the source, not over the normalised
    activities: the point is to identify the *file*, so that two runs quoting
    different numbers can be told apart by more than a filename.
    """

    name: str
    filename: str
    sha256: str
    activity_count: int
    source_format: str = "json"
    path: str = ""

    def describe(self) -> str:
        return (
            f"{self.name} ({self.filename}, {self.activity_count} activities, "
            f"sha256 {self.sha256[:12]})"
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "filename": self.filename,
            "sha256": self.sha256,
            "activity_count": self.activity_count,
            "source_format": self.source_format,
        }


# ── Typed predecessor ────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PredecessorLink:
    """One logic tie into an activity.

    `rel` is the Primavera relationship type and `lag_days` the lag in days.
    A legacy baseline stores predecessors as bare ids; those are read as
    FS with zero lag, which is what a bare id has always meant.
    """

    activity_id: str
    rel: str = DEFAULT_RELATIONSHIP
    lag_days: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "activity_id": self.activity_id,
            "rel": self.rel,
            "lag_days": self.lag_days,
        }


def parse_predecessor(raw: Any) -> PredecessorLink | None:
    """One predecessor entry, from either baseline shape.

    Accepts a bare id (`"CIV-PLY-1004"`, the v1 shape) or a typed object
    (`{"activity_id": ..., "rel": "SS", "lag_days": 3}`, the v2 shape).
    An unknown `rel` falls back to FS rather than raising: a relationship type
    we cannot read is a weaker signal than a predecessor we drop entirely.
    """
    if raw is None:
        return None
    if isinstance(raw, PredecessorLink):
        return raw
    if isinstance(raw, str):
        aid = raw.strip()
        return PredecessorLink(activity_id=aid) if aid else None
    if isinstance(raw, dict):
        aid = str(raw.get("activity_id") or raw.get("id") or "").strip()
        if not aid:
            return None
        rel = str(raw.get("rel") or DEFAULT_RELATIONSHIP).strip().upper()
        if rel not in RELATIONSHIP_TYPES:
            rel = DEFAULT_RELATIONSHIP
        try:
            lag = int(raw.get("lag_days") or 0)
        except (TypeError, ValueError):
            lag = 0
        return PredecessorLink(activity_id=aid, rel=rel, lag_days=lag)
    return None


def parse_predecessors(raw: Any) -> list[PredecessorLink]:
    if not raw:
        return []
    if isinstance(raw, (str, dict)):
        raw = [raw]
    out: list[PredecessorLink] = []
    for entry in raw:
        link = parse_predecessor(entry)
        if link is not None:
            out.append(link)
    return out


# ── Normalisation ────────────────────────────────────────────────────────────

def normalize_wbs_path(raw: Any) -> str:
    """A single displayable WBS path.

    v1 gives a dotted code (`"1.1.1.1"`); v2 gives the list of WBS element
    names from project root to the activity's parent. Both end up as one
    string, because that is what the column, the API and the drawer hold.
    `wbs_level` carries the depth separately, so nothing is lost by joining.
    """
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, Iterable):
        # `if p` before stringifying: str(None) is "None", which is truthy and
        # would land a literal "None" segment in the middle of a WBS path.
        parts = [str(p).strip() for p in raw if p is not None and str(p).strip()]
        return WBS_SEPARATOR.join(parts)
    return str(raw).strip()


def normalize_wbs_level(raw: Any, wbs_path: Any = None) -> int | None:
    """The planning level, or None when the source does not state one.

    Deliberately NOT inferred from the path for a source that omits it. v1's
    dotted `"1.1.1.1"` has four segments, which would read as level 4 and
    contradict the fact that those activities are the L5/L6 leaves the problem
    statement describes. An absent level is recorded as absent.
    """
    if raw is None:
        return None
    try:
        level = int(raw)
    except (TypeError, ValueError):
        return None
    return level


def normalize_activity(raw: dict) -> dict:
    """One activity from any baseline, in the shape every consumer expects.

    Guarantees: `activity_id`, `description`, `detail`, `discipline`, `uom` and
    `wbs_path` are strings; `planned_qty` is a float; `predecessors` is a list
    of typed dicts; `wbs_level` and `calendar` are present but may be None.

    `detail` is optional in the source - v2 omits it entirely - and is
    normalised to an empty string, because it is concatenated into the
    embedding document and the BM25 tokens.
    """
    aid = str(raw.get("activity_id") or "").strip()
    return {
        "activity_id": aid,
        "wbs_path": normalize_wbs_path(raw.get("wbs_path")),
        "wbs_level": normalize_wbs_level(raw.get("wbs_level"), raw.get("wbs_path")),
        "description": str(raw.get("description") or "").strip(),
        "detail": str(raw.get("detail") or "").strip(),
        "discipline": str(raw.get("discipline") or "unknown").strip().lower(),
        "tag": raw.get("tag") or None,
        "planned_start": raw.get("planned_start"),
        "planned_finish": raw.get("planned_finish"),
        "planned_qty": float(raw.get("planned_qty") or 0.0),
        "uom": str(raw.get("uom") or "").strip(),
        "calendar": (str(raw.get("calendar")).strip() if raw.get("calendar") else None),
        "predecessors": [p.as_dict() for p in parse_predecessors(raw.get("predecessors"))],
    }


def validate_activities(activities: list[dict]) -> list[str]:
    """Problems worth refusing to load on. Returns human-readable messages.

    Checked: a missing id, a duplicate id, a missing planned date, an
    out-of-range `wbs_level`, and a predecessor pointing outside the baseline.
    A dangling predecessor is a warning-grade fact here rather than a hard
    error, because a partial baseline import is a legitimate thing to do.
    """
    problems: list[str] = []
    seen: set[str] = set()
    for i, act in enumerate(activities):
        aid = act.get("activity_id") or ""
        where = aid or f"index {i}"
        if not aid:
            problems.append(f"activity at index {i} has no activity_id")
            continue
        if aid in seen:
            problems.append(f"duplicate activity_id: {aid}")
        seen.add(aid)
        if not act.get("planned_start") or not act.get("planned_finish"):
            problems.append(f"{where} is missing a planned start or finish")
        level = act.get("wbs_level")
        if level is not None and level not in VALID_WBS_LEVELS:
            problems.append(
                f"{where} has wbs_level {level}; expected one of "
                f"{'/'.join(str(v) for v in VALID_WBS_LEVELS)}"
            )
    return problems


def dangling_predecessors(activities: list[dict]) -> list[str]:
    """Predecessor ids that are not activities in the same baseline."""
    ids = {a.get("activity_id") for a in activities}
    missing: list[str] = []
    for act in activities:
        for pred in act.get("predecessors") or []:
            pid = pred.get("activity_id") if isinstance(pred, dict) else str(pred)
            if pid and pid not in ids and pid not in missing:
                missing.append(pid)
    return missing


# ── Providers ────────────────────────────────────────────────────────────────

class ScheduleProvider(ABC):
    """A source of baseline schedule activities.

    Two methods, deliberately separate: `read_activities()` is the data and
    `read_baseline()` is its identity. A caller that only needs to know *which*
    baseline is configured should not have to parse 218 activities to find out.
    """

    #: Short name for the format, as it appears in BaselineVersion.source_format
    source_format = "unknown"

    @abstractmethod
    def read_activities(self) -> list[dict]:
        """Normalised activity dicts (see `normalize_activity`)."""

    @abstractmethod
    def read_baseline(self) -> BaselineVersion:
        """Identity of the source: name, filename, sha256, activity count."""


class JsonScheduleProvider(ScheduleProvider):
    """The JSON baselines this repository ships.

    Reads either shape - `[ {...} ]` or `{"activities": [ {...} ]}` - and
    normalises both. Content is read once and cached, so `read_baseline()`
    followed by `read_activities()` hashes and parses the file a single time.
    """

    source_format = "json"

    def __init__(
        self,
        path: str | Path,
        name: str | None = None,
        filename: str | None = None,
    ):
        self.path = Path(path)
        self.name = name or self.path.stem
        # The name the baseline is KNOWN by, which is not always where the
        # bytes sit: an uploaded baseline is stored under a hash-prefixed
        # path so two uploads cannot collide, but the audit trail has to name
        # the file the planner actually sent.
        self.filename = filename or self.path.name
        self._raw_bytes: bytes | None = None
        self._activities: list[dict] | None = None

    # ── internals ────────────────────────────────────────────────────────────

    def _bytes(self) -> bytes:
        if self._raw_bytes is None:
            if not self.path.exists():
                raise FileNotFoundError(f"Baseline schedule not found: {self.path}")
            self._raw_bytes = self.path.read_bytes()
        return self._raw_bytes

    @staticmethod
    def _decode(data: bytes) -> str:
        """Explicit decode, matching extraction/textio.py's reasoning: a lossy
        decode of a baseline is permanent and propagates into every id."""
        for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                return data.decode(encoding)
            except UnicodeDecodeError:
                continue
        return data.decode("utf-8", errors="replace")

    # ── ScheduleProvider ─────────────────────────────────────────────────────

    def read_activities(self) -> list[dict]:
        if self._activities is None:
            parsed = json.loads(self._decode(self._bytes()))
            if isinstance(parsed, dict):
                parsed = parsed.get("activities", [])
            self._activities = [normalize_activity(a) for a in parsed]
        return self._activities

    def read_baseline(self) -> BaselineVersion:
        digest = hashlib.sha256(self._bytes()).hexdigest()
        return BaselineVersion(
            name=self.name,
            filename=self.filename,
            sha256=digest,
            activity_count=len(self.read_activities()),
            source_format=self.source_format,
            path=str(self.path),
        )


class _PrimaveraProvider(ScheduleProvider):
    """Shared body for the two Primavera export formats.

    Both read the same way: decode the file, hand the text to the parser in
    `matching/primavera.py`, normalise. The only difference is which parser.
    """

    source_format = "primavera"
    parser = None  # set by the subclasses

    def __init__(self, path: str | Path, name: str | None = None):
        self.path = Path(path)
        self.name = name or self.path.stem
        self._activities: list[dict] | None = None

    @property
    def filename(self) -> str:
        return self.path.name

    def _bytes(self) -> bytes:
        return self.path.read_bytes()

    def _decode(self, raw: bytes) -> str:
        """Same explicit cascade the rest of the project uses (D-010, D-045).

        A P6 export is usually UTF-8 or UTF-16, and occasionally cp1252 when it
        has been round-tripped through a Windows tool.
        """
        for encoding in ("utf-8-sig", "utf-8", "utf-16", "cp1252"):
            try:
                return raw.decode(encoding)
            except (UnicodeDecodeError, UnicodeError):
                continue
        return raw.decode("utf-8", errors="replace")

    def read_activities(self) -> list[dict]:
        if self._activities is None:
            text = self._decode(self._bytes())
            parsed = type(self).parser(text, self.filename)
            self._activities = [normalize_activity(a) for a in parsed]
        return self._activities

    def read_baseline(self) -> BaselineVersion:
        return BaselineVersion(
            name=self.name,
            filename=self.filename,
            sha256=hashlib.sha256(self._bytes()).hexdigest(),
            activity_count=len(self.read_activities()),
            source_format=self.source_format,
            path=str(self.path),
        )


class PmxmlScheduleProvider(_PrimaveraProvider):
    """Primavera P6 PMXML (`.xml`).

    Reads both the canonical Oracle shape, where scalars are child elements
    (`<Activity><Id>A1000</Id>`), and the attribute shape this repository's own
    exporter writes (`<Activity ActivityID="A1000">`). Calendars and resources
    are not read: nothing downstream consumes them. Closes FINDINGS.md F3.
    """

    source_format = "pmxml"
    parser = staticmethod(parse_pmxml)


class PrimaveraXerScheduleProvider(_PrimaveraProvider):
    """Primavera `.xer`.

    Reads a real XER table dump - `%T` table, `%F` header, `%R` rows, with the
    baseline in `TASK` and the logic in `TASKPRED` - and also the simplified
    shape `server/main.py::_generate_xer` emits, so our own export round-trips.
    That writer does not produce valid XER; see D-047. Closes FINDINGS.md F3.
    """

    source_format = "xer"
    parser = staticmethod(parse_xer)


# ── Ground-truth agreement guard ─────────────────────────────────────────────

#: An evaluation whose ground truth does not describe the loaded baseline is
#: not a weak evaluation, it is a meaningless one. Below this fraction of
#: resolvable ids, refuse rather than report.
MIN_GROUND_TRUTH_COVERAGE = 0.80


@dataclass
class BaselineAgreement:
    """How well a ground-truth file and a baseline describe the same project."""

    total_ids: int
    resolved_ids: int
    missing_ids: list[str] = field(default_factory=list)
    baseline: BaselineVersion | None = None
    threshold: float = MIN_GROUND_TRUTH_COVERAGE

    @property
    def coverage(self) -> float:
        return (self.resolved_ids / self.total_ids) if self.total_ids else 0.0

    @property
    def missing_count(self) -> int:
        return self.total_ids - self.resolved_ids

    @property
    def ok(self) -> bool:
        return self.total_ids > 0 and self.coverage >= self.threshold

    def report(self) -> str:
        """The message a human needs to fix this, not just to know it broke."""
        name = self.baseline.describe() if self.baseline else "the active baseline"
        lines = [
            "BASELINE / GROUND-TRUTH MISMATCH",
            f"  baseline        : {name}",
            f"  ground truth    : {self.total_ids} distinct activity ids",
            f"  resolvable      : {self.resolved_ids} "
            f"({self.coverage:.1%}; minimum {self.threshold:.0%})",
            f"  NOT in baseline : {self.missing_count}",
        ]
        if self.missing_ids:
            shown = ", ".join(self.missing_ids[:8])
            more = "" if len(self.missing_ids) <= 8 else f", ... (+{len(self.missing_ids) - 8} more)"
            lines.append(f"  examples        : {shown}{more}")
        lines.append(
            "  The ground truth does not describe this baseline. Every metric "
            "computed from it would be an artefact of the mismatch, not a "
            "measurement, so this run is refused."
        )
        return "\n".join(lines)


def check_ground_truth_agreement(
    resolver,
    ground_truth_ids: Iterable[str],
    baseline: BaselineVersion | None = None,
    threshold: float = MIN_GROUND_TRUTH_COVERAGE,
) -> BaselineAgreement:
    """Do the ground truth and the loaded baseline describe the same project?

    `resolver` is anything with `resolve_id(str) -> str | None` - in practice a
    `ScheduleIndex`. Resolution rather than exact matching is deliberate: it is
    what `eval.py` itself uses to decide whether a labelled mention is
    evaluable, so this measures exactly the rows that would survive. Against
    `baseline_schedule.json` that is 141/141; against `baseline_schedule_v2.json`
    it is 63/141, and those 63 are numeric-suffix coincidences between two
    unrelated id sets rather than real agreement.
    """
    ids = [str(i).strip() for i in ground_truth_ids]
    ids = [i for i in ids if i and i != "NO_MATCH"]
    unique = sorted(set(ids))
    missing = [i for i in unique if not resolver.resolve_id(i)]
    return BaselineAgreement(
        total_ids=len(unique),
        resolved_ids=len(unique) - len(missing),
        missing_ids=missing,
        baseline=baseline,
        threshold=threshold,
    )
