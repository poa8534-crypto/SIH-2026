"""Critical path: how much slack every activity had before it slipped.

Phase 6 of the Contractor Dispute Shield. Everything before this treats an
activity's whole finish variance as its delay, which is why `impact_days` has
carried an "upper bound" caveat since D-077. Liquidated damages do not attach
to lateness; they attach to lateness that moved the completion date. An
activity six days late with four days of float caused two days of project
delay, and only those two are claimable.

WHAT THIS COMPUTES, AND WHAT IT DOES NOT
----------------------------------------
A forward and backward pass over the BASELINE schedule: planned durations and
the logic ties already stored on `Activity.predecessors`. It yields early and
late dates, total float, and which activities are critical.

It is **baseline float**, not float remaining at the moment a delay struck.
Answering that properly is a time-impact analysis: a series of updated
schedules, each re-run at the date of the event. NAVIS holds one baseline and
one set of actuals, so what it can say honestly is how much slack the PLAN gave
an activity - which is exactly the figure a claim is checked against first, and
a great deal better than treating every day of lateness as project delay. Every
consumer of these numbers says which kind of float it is.

CALENDAR DAYS, NOT WORKING DAYS
-------------------------------
`Activity.calendar` exists on the model and nothing populates it. Durations and
lags here are calendar days throughout. A schedule with a five-day working week
would show different float, so the report says which convention was used rather
than letting a reader assume.

CYCLES ARE REPORTED, NOT BROKEN
-------------------------------
Logic loops happen in real exports. Activities inside one are excluded from the
result and named in `unresolved`, so a caller can say "these could not be
scheduled" instead of silently publishing a float figure computed from a
half-traversed graph.

WHEN THE BASELINE'S DATES CONTRADICT ITS OWN LOGIC
--------------------------------------------------
A schedule authored by typing dates and then attaching predecessors can state
ties its own dates break - a successor starting before its FS predecessor
finishes. On `dataset/baseline_schedule.json` that is 27 of 146 ties, and the
logic network consequently finishes on 2026-10-12 against an authored latest
finish of 2026-09-28.

Both numbers are reported (`logic_conflicts`, `authored_finish`,
`project_finish`) and neither is quietly preferred. Float here is computed from
the LOGIC, so where the two disagree the float figure is advisory and every
consumer says so. Silently reconciling them would mean choosing which half of
the baseline to believe, on a document whose whole purpose is to be checkable.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Optional

#: Relationship types, as `Activity.predecessor_links()` normalises them.
#: A bare predecessor id reads back as FS with zero lag, which is what a bare
#: id has always meant.
FS, SS, FF, SF = "FS", "SS", "FF", "SF"


@dataclass(frozen=True)
class ActivitySchedule:
    """One activity's computed position in the network.

    Dates are inclusive: a one-day activity has `early_start == early_finish`.
    `total_float` is `late_finish - early_finish` in days; zero or less means
    the activity is on the critical path and any slip moves the project.
    """

    activity_id: str
    duration_days: int
    early_start: date
    early_finish: date
    late_start: date
    late_finish: date
    total_float: int

    @property
    def critical(self) -> bool:
        return self.total_float <= 0


@dataclass(frozen=True)
class NetworkSchedule:
    """The whole computed network, plus what could not be computed."""

    activities: dict[str, ActivitySchedule]
    project_finish: Optional[date]
    #: Activities excluded because they sit in a logic cycle.
    unresolved: tuple[str, ...]
    #: Predecessor ids named by an activity but absent from the schedule.
    #: Reported rather than ignored: a dangling tie means the float below it is
    #: computed from an incomplete network.
    dangling: tuple[str, ...]
    #: Ties the AUTHORED planned dates break, as (successor, predecessor, rel).
    #: Not an error - a great many real baselines are dated by hand and tied up
    #: afterwards - but every float figure below is computed from the logic, so
    #: where these exist the two halves of the baseline disagree and the reader
    #: has to be told which one the number came from.
    logic_conflicts: tuple[tuple[str, str, str], ...] = ()
    #: The latest planned finish in the baseline as authored, for comparison
    #: with `project_finish`, which the logic produces.
    authored_finish: Optional[date] = None

    @property
    def logic_matches_dates(self) -> bool:
        """True when the authored dates satisfy every tie they state."""
        return not self.logic_conflicts

    def float_for(self, activity_id: Optional[str]) -> Optional[int]:
        """Total float in days, or None when this activity was not scheduled."""
        if not activity_id:
            return None
        entry = self.activities.get(activity_id)
        return entry.total_float if entry is not None else None

    def is_critical(self, activity_id: Optional[str]) -> bool:
        entry = self.activities.get(activity_id) if activity_id else None
        return bool(entry and entry.critical)


def _duration_days(planned_start: date, planned_finish: date) -> int:
    """Inclusive duration. A one-day activity is one day, not zero."""
    return max(1, (planned_finish - planned_start).days + 1)


def _topological_order(
    ids: list[str], predecessors: dict[str, list[tuple[str, str, int]]]
) -> tuple[list[str], list[str]]:
    """Kahn's algorithm. Returns (ordered, unresolved-because-cyclic)."""
    indegree = {aid: 0 for aid in ids}
    successors: dict[str, list[str]] = defaultdict(list)
    for aid in ids:
        for pred_id, _rel, _lag in predecessors.get(aid, ()):
            if pred_id in indegree:
                indegree[aid] += 1
                successors[pred_id].append(aid)

    queue = deque(sorted(aid for aid in ids if indegree[aid] == 0))
    ordered: list[str] = []
    while queue:
        aid = queue.popleft()
        ordered.append(aid)
        for succ in successors[aid]:
            indegree[succ] -= 1
            if indegree[succ] == 0:
                queue.append(succ)

    unresolved = [aid for aid in ids if aid not in set(ordered)]
    return ordered, unresolved


def compute_schedule(activities: Iterable) -> NetworkSchedule:
    """Forward and backward pass over the baseline.

    Accepts anything with `activity_id`, `planned_start`, `planned_finish` and
    `predecessor_links()` - which is `server.db.Activity`, and is also easy to
    fake in a test without a database.

    Activities with no predecessors are anchored at their planned start rather
    than pulled to a common project origin. The baseline is an authored
    schedule and its stated start dates are part of what was agreed; a pure
    logic-only pass would move them and report float nobody planned for.
    """
    records = {}
    predecessors: dict[str, list[tuple[str, str, int]]] = {}
    named: set[str] = set()

    for activity in activities:
        if not activity.planned_start or not activity.planned_finish:
            continue
        aid = activity.activity_id
        records[aid] = activity
        links = []
        for link in activity.predecessor_links():
            pred_id = link.get("activity_id")
            if not pred_id:
                continue
            named.add(pred_id)
            links.append((pred_id, link.get("rel") or FS,
                          int(link.get("lag_days") or 0)))
        predecessors[aid] = links

    if not records:
        return NetworkSchedule({}, None, (), ())

    # ── Do the authored dates satisfy the ties the baseline states? ──
    conflicts: list[tuple[str, str, str]] = []
    for aid, links in predecessors.items():
        successor = records[aid]
        for pred_id, rel, lag in links:
            predecessor = records.get(pred_id)
            if predecessor is None:
                continue
            if rel == SS:
                ok = successor.planned_start >= predecessor.planned_start + timedelta(days=lag)
            elif rel == FF:
                ok = successor.planned_finish >= predecessor.planned_finish + timedelta(days=lag)
            elif rel == SF:
                ok = successor.planned_finish >= predecessor.planned_start + timedelta(days=lag)
            else:  # FS
                ok = successor.planned_start >= predecessor.planned_finish + timedelta(days=1 + lag)
            if not ok:
                conflicts.append((aid, pred_id, rel))

    ids = sorted(records)
    ordered, cyclic = _topological_order(ids, predecessors)
    scheduled = set(ordered)

    origin = min(records[aid].planned_start for aid in ids)
    duration = {
        aid: _duration_days(records[aid].planned_start, records[aid].planned_finish)
        for aid in ids
    }

    def offset(when: date) -> int:
        return (when - origin).days

    # ── Forward pass ──
    early_start: dict[str, int] = {}
    early_finish: dict[str, int] = {}
    for aid in ordered:
        dur = duration[aid]
        floor = offset(records[aid].planned_start)
        candidates = [floor] if not predecessors[aid] else []
        for pred_id, rel, lag in predecessors[aid]:
            if pred_id not in early_finish:
                continue  # dangling or cyclic; reported separately
            pes, pef = early_start[pred_id], early_finish[pred_id]
            if rel == SS:
                candidates.append(pes + lag)
            elif rel == FF:
                candidates.append(pef + lag - dur + 1)
            elif rel == SF:
                candidates.append(pes + lag - dur + 1)
            else:  # FS, and anything unreadable, which parses to FS
                candidates.append(pef + 1 + lag)
        if not candidates:
            candidates = [floor]
        early_start[aid] = max(candidates)
        early_finish[aid] = early_start[aid] + dur - 1

    project_finish_offset = max(early_finish.values()) if early_finish else None

    # ── Backward pass ──
    late_finish: dict[str, int] = {aid: project_finish_offset for aid in ordered}
    successors: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for aid in ordered:
        for pred_id, rel, lag in predecessors[aid]:
            if pred_id in scheduled:
                successors[pred_id].append((aid, rel, lag))

    for aid in reversed(ordered):
        dur = duration[aid]
        limits = []
        for succ_id, rel, lag in successors[aid]:
            slf = late_finish[succ_id]
            sls = slf - duration[succ_id] + 1
            if rel == SS:
                limits.append(sls - lag + dur - 1)
            elif rel == FF:
                limits.append(slf - lag)
            elif rel == SF:
                limits.append(slf - lag + dur - 1)
            else:  # FS
                limits.append(sls - 1 - lag)
        if limits:
            late_finish[aid] = min(min(limits), late_finish[aid])

    computed = {}
    for aid in ordered:
        dur = duration[aid]
        lf = late_finish[aid]
        computed[aid] = ActivitySchedule(
            activity_id=aid,
            duration_days=dur,
            early_start=origin + timedelta(days=early_start[aid]),
            early_finish=origin + timedelta(days=early_finish[aid]),
            late_start=origin + timedelta(days=lf - dur + 1),
            late_finish=origin + timedelta(days=lf),
            total_float=lf - early_finish[aid],
        )

    return NetworkSchedule(
        activities=computed,
        project_finish=(origin + timedelta(days=project_finish_offset)
                        if project_finish_offset is not None else None),
        unresolved=tuple(sorted(cyclic)),
        dangling=tuple(sorted(named - set(ids))),
        logic_conflicts=tuple(sorted(conflicts)),
        authored_finish=max(records[aid].planned_finish for aid in ids),
    )


def split_slip(slip_days: Optional[int], total_float: Optional[int]) -> tuple[int, int]:
    """Divide a finish slip into float consumed and delay beyond float.

    Returns `(float_consumed, beyond_float)`. Only the second can have moved
    the completion date, and it is the figure a Liquidated Damages calculation
    is built from.

    A negative float - an activity already behind the network before it slipped
    - is treated as zero available slack, so the whole slip counts as beyond
    float. Unknown float returns `(0, slip)`: the conservative reading is that
    none was available, and a caller that cannot establish float should say so
    rather than credit slack it never proved.
    """
    slip = max(0, slip_days or 0)
    if total_float is None:
        return 0, slip
    available = max(0, total_float)
    consumed = min(slip, available)
    return consumed, slip - consumed
