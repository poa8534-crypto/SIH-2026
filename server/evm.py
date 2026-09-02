"""Schedule-side Earned Value Management: PV, EV, SV, SPI.

ROADMAP §5. Deterministic arithmetic over the baseline and the linked events —
no LLM is involved at any point, and nothing here is stored: every figure is
computed on read from data that already exists.

WHAT IS DELIBERATELY ABSENT
---------------------------
There is no AC, CV, CPI, EAC, VAC or TCPI. Those all require actual cost or
man-hours, and **no ingested source in this system carries either**. The schema
has no cost field because no daily progress report supplies one. Emitting a CPI
would mean inventing the denominator, which is the opposite of what this
project claims about itself. The response therefore carries
`cost_metrics_available: false` together with the reason, so a reader is told
the limitation rather than left to notice the absence.

WEIGHTING
---------
Activities are weighted by **planned duration in days**, not by `planned_qty`.
ROADMAP §5 specifies duration because every activity has dates whereas 66 of the
120 baseline activities have no quantity at all; quantity-weighting would
silently drop more than half the schedule and quietly overstate whatever
remained.

    weight = (planned_finish - planned_start).days + 1, minimum 1

PERCENT COMPLETE — precedence, in this exact order
--------------------------------------------------
`Activity` has **no `percent_complete` column**. It is derived, here and in
`get_schedule`, and for most activities it is unknown. The order is:

    1. `actual_finish` is set                     -> 100%
    2. else max(LinkedEvent.percentage) for that
       activity, if any event carries one         -> that value
    3. else                                       -> 0%

Rule 3 is a **floor, not an estimate**. An activity with no evidence contributes
nothing to EV; it is never credited with progress it has not reported. Treating
that 0% as though it were a measurement is exactly how an SPI becomes
misleading, which is why `percent_source_counts` is returned alongside the
figures: it says how many activities were scored by each rule, so the reader can
see how much of EV rests on real evidence and how much on the floor.

SPI, AND WHY IT IS NOT A HEADLINE ON THIS DATASET
--------------------------------------------------
`SPI = EV / PV`, and **`None` when PV is 0**. Never a ZeroDivisionError, and
never `0.0` — a zero would read as "measured and terrible" when the truth is
"nothing was scheduled to have happened yet".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from server.db import Activity, LinkedEvent

#: Stated on every response, so the absence of the cost half is data rather
#: than something the reader has to infer.
COST_UNAVAILABLE_REASON = (
    "No ingested source carries actual cost or man-hours, so AC, CV, CPI, EAC, "
    "VAC and TCPI cannot be computed. Reporting them would require inventing "
    "the denominator."
)

#: The three rules in PERCENT COMPLETE above, in precedence order.
SOURCE_ACTUAL_FINISH = "actual_finish"
SOURCE_LINKED_EVENT = "linked_event_percentage"
SOURCE_NO_EVIDENCE = "no_evidence_floor"

#: Below this share of schedule weight carrying evidence, a whole-project SPI
#: says more about reporting coverage than about schedule performance, and
#: `spi_headline_safe` goes false. 0.60 is a judgement call, stated here rather
#: than buried: at 60% the unreported remainder can still move SPI materially,
#: but the figure is no longer dominated by it.
HEADLINE_COVERAGE_MIN = 0.60


def planned_weight(activity: Activity) -> int:
    """Planned duration in days, inclusive of both endpoints, minimum 1.

    An activity missing either planned date still counts as 1 rather than 0, so
    it cannot vanish from the denominator without being noticed.
    """
    start = activity.planned_start
    finish = activity.planned_finish
    if start is None or finish is None:
        return 1
    return max(1, (finish - start).days + 1)


def planned_fraction(activity: Activity, data_date: date) -> float:
    """Share of the activity's planned duration elapsed by the data date.

    Wholly before the data date -> 1.0; wholly after -> 0.0; straddling it ->
    pro rata on the same inclusive day count `planned_weight` uses, so PV and
    EV are always denominated in the same units.
    """
    start = activity.planned_start
    finish = activity.planned_finish
    if start is None or finish is None:
        return 0.0
    if data_date >= finish:
        return 1.0
    if data_date < start:
        return 0.0
    elapsed = (data_date - start).days + 1
    total = (finish - start).days + 1
    return max(0.0, min(1.0, elapsed / total))


def percent_complete(
    activity: Activity, event_percentages: dict[str, float]
) -> tuple[float, str]:
    """Percent complete and which of the three rules produced it.

    `event_percentages` is a prefetched `activity_id -> max(percentage)` map, so
    this stays one query for the whole schedule rather than one per activity.
    """
    if activity.actual_finish is not None:
        return 100.0, SOURCE_ACTUAL_FINISH
    pct = event_percentages.get(activity.activity_id)
    if pct is not None:
        return float(pct), SOURCE_LINKED_EVENT
    return 0.0, SOURCE_NO_EVIDENCE


@dataclass
class EVMFigures:
    """PV/EV/SV/SPI for one grouping, plus what produced the percentages."""

    planned_value: float = 0.0
    earned_value: float = 0.0
    total_weight: float = 0.0
    activity_count: int = 0
    percent_source_counts: dict[str, int] = field(default_factory=dict)

    @property
    def schedule_variance(self) -> float:
        return self.earned_value - self.planned_value

    @property
    def spi(self) -> Optional[float]:
        """EV / PV, or None when PV is 0. Never 0.0 as a stand-in."""
        if self.planned_value == 0:
            return None
        return self.earned_value / self.planned_value

    def as_dict(self) -> dict:
        return {
            "planned_value": round(self.planned_value, 4),
            "earned_value": round(self.earned_value, 4),
            "schedule_variance": round(self.schedule_variance, 4),
            "spi": None if self.spi is None else round(self.spi, 4),
            "total_weight": round(self.total_weight, 4),
            "activity_count": self.activity_count,
            "percent_source_counts": {
                SOURCE_ACTUAL_FINISH: self.percent_source_counts.get(
                    SOURCE_ACTUAL_FINISH, 0
                ),
                SOURCE_LINKED_EVENT: self.percent_source_counts.get(
                    SOURCE_LINKED_EVENT, 0
                ),
                SOURCE_NO_EVIDENCE: self.percent_source_counts.get(
                    SOURCE_NO_EVIDENCE, 0
                ),
            },
        }


def _event_percentages(db: Session) -> dict[str, float]:
    """`activity_id -> max(LinkedEvent.percentage)`, in one pass.

    Mirrors `get_schedule`'s derivation exactly: the maximum non-null percentage
    across the events linked to that activity.
    """
    out: dict[str, float] = {}
    rows = (
        db.query(LinkedEvent.activity_id, LinkedEvent.percentage)
        .filter(LinkedEvent.activity_id.isnot(None))
        .filter(LinkedEvent.percentage.isnot(None))
        .all()
    )
    for activity_id, pct in rows:
        if pct is None:
            continue
        current = out.get(activity_id)
        if current is None or pct > current:
            out[activity_id] = float(pct)
    return out


def compute_evm(db: Session, data_date: date) -> dict:
    """Project and per-discipline EVM as of `data_date`.

    Read-only: no table is created, nothing is written, and the same call twice
    gives the same answer.
    """
    activities = db.query(Activity).order_by(Activity.activity_id).all()
    percentages = _event_percentages(db)

    project = EVMFigures()
    by_discipline: dict[str, EVMFigures] = {}
    # The same arithmetic restricted to activities that reported something.
    evidenced = EVMFigures()
    evidenced_weight = 0.0

    for act in activities:
        weight = planned_weight(act)
        fraction = planned_fraction(act, data_date)
        pct, source = percent_complete(act, percentages)

        pv = weight * fraction
        ev = weight * (pct / 100.0)

        discipline = act.discipline or "unknown"
        bucket = by_discipline.setdefault(discipline, EVMFigures())

        targets = [project, bucket]
        if source != SOURCE_NO_EVIDENCE:
            targets.append(evidenced)
            evidenced_weight += weight

        for target in targets:
            target.planned_value += pv
            target.earned_value += ev
            target.total_weight += weight
            target.activity_count += 1
            target.percent_source_counts[source] = (
                target.percent_source_counts.get(source, 0) + 1
            )

    total_weight = project.total_weight
    coverage = (evidenced_weight / total_weight) if total_weight else 0.0
    headline_safe = coverage >= HEADLINE_COVERAGE_MIN

    return {
        "data_date": data_date.isoformat(),
        "weighting": "planned_duration_days",
        "project": project.as_dict(),
        "by_discipline": {
            name: figures.as_dict() for name, figures in sorted(by_discipline.items())
        },
        # How much of the schedule's weight has any evidence behind it. This is
        # what decides whether a whole-project SPI means anything.
        "evidence_coverage": {
            "weight_with_evidence": round(evidenced_weight, 4),
            "weight_total": round(total_weight, 4),
            "fraction": round(coverage, 4),
            "activities_with_evidence": evidenced.activity_count,
            "activities_total": project.activity_count,
        },
        # False means: do NOT print project.spi as a KPI. The number is
        # arithmetically correct and still misleading, because the unreported
        # activities are charged full PV and can earn no EV.
        "spi_headline_safe": headline_safe,
        "spi_headline_reason": (
            None
            if headline_safe
            else (
                f"Only {coverage:.0%} of schedule weight has any reported "
                f"evidence ({evidenced.activity_count} of "
                f"{project.activity_count} activities). Unreported activities "
                f"are charged full planned value and can earn none, so the "
                f"project SPI measures reporting coverage more than schedule "
                f"performance. Use evidenced_subset.spi, and show coverage "
                f"beside it."
            )
        ),
        # The defensible figure: of the work we can actually see, how is it
        # tracking. Same arithmetic, stated subset, nothing estimated.
        "evidenced_subset": evidenced.as_dict(),
        "cost_metrics_available": False,
        "cost_metrics_reason": COST_UNAVAILABLE_REASON,
        "percent_complete_precedence": [
            "actual_finish set -> 100%",
            "else max(LinkedEvent.percentage) if any",
            "else 0% (floor, not an estimate)",
        ],
    }
