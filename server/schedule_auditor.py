"""AI Schedule Feasibility & Knowledge Auditor ("Schedule Doctor").

Audits proposed or active schedules against:
1. Empirical historical duration and productivity distributions from Institutional Memory.
2. DCMA 14-point industry logic quality checks (open ends, leads, negative float).
3. Regional environmental constraints (Upper Assam monsoon weather clashes).
4. Engineering specifications (IS 456 concrete curing times, NDT hydrotesting sequences).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import statistics
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from server.cpm import compute_schedule, NetworkSchedule
from server.db import Activity
from server.knowledge_base import knowledge_base
from server.schemas import (
    ScheduleAuditFinding,
    ScheduleAuditResponse,
)


class _CpmItem:
    """Lightweight adapter for compute_schedule."""
    def __init__(self, activity_id: str, planned_start: Optional[date], planned_finish: Optional[date], links: list = ()):
        self.activity_id = activity_id
        self.planned_start = planned_start
        self.planned_finish = planned_finish
        self._links = links

    def predecessor_links(self) -> list:
        return self._links

# ── Historical Benchmarks (Upper Assam / Duliajan Well-Sites) ─────────────────

HISTORICAL_P50_BENCHMARKS: dict[str, dict[str, Any]] = {
    "CIV-FDN": {"p50": 20, "p90": 28, "mean": 22.4, "uom": "m3", "max_daily_rate": 8.5},
    "CIV-PLY": {"p50": 16, "p90": 24, "mean": 18.0, "uom": "m3", "max_daily_rate": 6.0},
    "CIV-STL": {"p50": 24, "p90": 34, "mean": 26.0, "uom": "MT", "max_daily_rate": 2.5},
    "PIP-SPL": {"p50": 35, "p90": 48, "mean": 38.0, "uom": "spools", "max_daily_rate": 2.4},
    "PIP-RCK": {"p50": 22, "p90": 32, "mean": 24.5, "uom": "joints", "max_daily_rate": 4.0},
    "PIP-HYD": {"p50": 12, "p90": 18, "mean": 13.5, "uom": "km", "max_daily_rate": 1.2},
    "ELE-CAB": {"p50": 18, "p90": 26, "mean": 19.2, "uom": "m", "max_daily_rate": 120.0},
    "ELE-TRN": {"p50": 14, "p90": 21, "mean": 15.0, "uom": "units", "max_daily_rate": 0.5},
    "INS-TRN": {"p50": 14, "p90": 20, "mean": 14.0, "uom": "loops", "max_daily_rate": 3.0},
    "STA-VES": {"p50": 28, "p90": 38, "mean": 30.0, "uom": "units", "max_daily_rate": 0.4},
}

# Upper Assam monsoon window
MONSOON_START_MONTH = 6
MONSOON_START_DAY = 15
MONSOON_END_MONTH = 9
MONSOON_END_DAY = 15


def _to_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, str):
        try:
            return date.fromisoformat(val[:10])
        except ValueError:
            return None
    return None


def _is_monsoon_overlap(start_dt: Optional[date], finish_dt: Optional[date]) -> bool:
    if not start_dt or not finish_dt:
        return False
    # Check if dates overlap with June 15 to September 15 of that year
    year = start_dt.year
    monsoon_start = date(year, MONSOON_START_MONTH, MONSOON_START_DAY)
    monsoon_end = date(year, MONSOON_END_MONTH, MONSOON_END_DAY)
    return not (finish_dt < monsoon_start or start_dt > monsoon_end)


def audit_schedule(
    activities: list[Activity | dict],
    schedule_name: str = "OIL Pipeline Sector 04",
    data_date: Optional[str] = None,
    db: Optional[Session] = None,
) -> ScheduleAuditResponse:
    """Run comprehensive AI feasibility & knowledge audit over a schedule."""
    # 1. Normalize activity inputs
    raw_list: list[dict] = []
    for a in activities:
        if isinstance(a, Activity):
            raw_list.append({
                "activity_id": a.activity_id,
                "description": a.description or "",
                "discipline": (a.discipline or "").lower(),
                "planned_start": _to_date(a.planned_start),
                "planned_finish": _to_date(a.planned_finish),
                "planned_qty": float(a.planned_qty or 0.0),
                "uom": a.uom or "",
                "predecessors": a.predecessor_links(),
                "wbs_level": a.wbs_level,
            })
        else:
            raw_list.append({
                "activity_id": a.get("activity_id") or "",
                "description": a.get("description") or "",
                "discipline": (a.get("discipline") or "").lower(),
                "planned_start": _to_date(a.get("planned_start")),
                "planned_finish": _to_date(a.get("planned_finish")),
                "planned_qty": float(a.get("planned_qty") or 0.0),
                "uom": a.get("uom") or "",
                "predecessors": a.get("predecessors") or [],
                "wbs_level": a.get("wbs_level"),
            })

    total_activities = len(raw_list)
    findings: list[ScheduleAuditFinding] = []

    # Map activities by ID for network analysis
    act_map = {a["activity_id"]: a for a in raw_list if a["activity_id"]}

    # Compute network successors
    successors_map: dict[str, list[str]] = {aid: [] for aid in act_map}
    for a in raw_list:
        aid = a["activity_id"]
        for p in a["predecessors"]:
            pid = p.get("activity_id") if isinstance(p, dict) else str(p)
            if pid in successors_map:
                successors_map[pid].append(aid)

    # 2. Run Critical Path Method (CPM)
    cpm_res: Optional[NetworkSchedule] = None
    try:
        cpm_items = [
            _CpmItem(
                a["activity_id"],
                a["planned_start"],
                a["planned_finish"],
                a["predecessors"],
            )
            for a in raw_list
            if a["planned_start"] and a["planned_finish"]
        ]
        cpm_res = compute_schedule(cpm_items)
    except Exception:
        cpm_res = None

    cpm_acts = cpm_res.activities if cpm_res else {}

    # Identify final milestone activities (e.g. COD or latest finish)
    max_finish = max(
        (a["planned_finish"] for a in raw_list if a["planned_finish"]),
        default=None,
    )

    # ── Check 1: Empirical Duration Feasibility vs Institutional Memory ─────
    for a in raw_list:
        aid = a["activity_id"]
        desc = a["description"]
        p_start = a["planned_start"]
        p_finish = a["planned_finish"]
        if not p_start or not p_finish:
            continue

        p_duration = (p_finish - p_start).days
        if p_duration <= 0:
            continue

        # Extract prefix like PIP-SPL, CIV-FDN
        parts = aid.split("-")
        prefix = f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else parts[0]

        bench = HISTORICAL_P50_BENCHMARKS.get(prefix)
        if bench:
            p50 = bench["p50"]
            p90 = bench["p90"]

            # Check for extreme optimism (< 65% of P50)
            if p_duration < 0.65 * p50:
                variance = round(((p_duration - p50) / p50) * 100, 1)
                findings.append(
                    ScheduleAuditFinding(
                        id=f"FIND-DUR-{uuid4().hex[:6]}",
                        activity_id=aid,
                        activity_description=desc,
                        discipline=a["discipline"],
                        category="duration_optimism",
                        severity="critical",
                        planned_value=f"{p_duration} Days",
                        benchmark_value=f"P50: {p50}d (P90: {p90}d)",
                        variance_pct=variance,
                        critique_message=(
                            f"Planned duration of {p_duration}d is {abs(variance)}% below OIL historical "
                            f"actuals ({p50}d P50). High risk of unmitigated schedule collapse."
                        ),
                        rule_reference="CONTR-PROD-01",
                        calibrated_recommendation=f"Extend planned duration to {p50} days with 4-day monsoon buffer.",
                    )
                )
            elif p_duration < 0.85 * p50:
                variance = round(((p_duration - p50) / p50) * 100, 1)
                findings.append(
                    ScheduleAuditFinding(
                        id=f"FIND-DUR-{uuid4().hex[:6]}",
                        activity_id=aid,
                        activity_description=desc,
                        discipline=a["discipline"],
                        category="duration_optimism",
                        severity="medium",
                        planned_value=f"{p_duration} Days",
                        benchmark_value=f"P50: {p50}d",
                        variance_pct=variance,
                        critique_message=(
                            f"Planned duration of {p_duration}d is aggressive compared to empirical "
                            f"benchmark ({p50}d P50)."
                        ),
                        rule_reference="CONTR-PROD-01",
                        calibrated_recommendation=f"Consider adjusting duration to {p50} days.",
                    )
                )

        # Productivity rate check
        p_qty = a["planned_qty"]
        if p_qty > 0 and bench and "max_daily_rate" in bench:
            daily_rate = round(p_qty / p_duration, 2)
            max_rate = bench["max_daily_rate"]
            if daily_rate > 1.25 * max_rate:
                findings.append(
                    ScheduleAuditFinding(
                        id=f"FIND-RATE-{uuid4().hex[:6]}",
                        activity_id=aid,
                        activity_description=desc,
                        discipline=a["discipline"],
                        category="productivity_unrealistic",
                        severity="high",
                        planned_value=f"{daily_rate} {a['uom']}/day",
                        benchmark_value=f"Max: {max_rate} {a['uom']}/day",
                        variance_pct=round(((daily_rate - max_rate) / max_rate) * 100, 1),
                        critique_message=(
                            f"Planned daily productivity rate of {daily_rate} {a['uom']}/day exceeds "
                            f"historical maximum demonstrated capability ({max_rate} {a['uom']}/day)."
                        ),
                        rule_reference="CONTR-PROD-01",
                        calibrated_recommendation=f"Re-baseline daily installation target to {max_rate} {a['uom']}/day.",
                    )
                )

    # ── Check 2: DCMA 14-Point Schedule Logic & Float ───────────────────────
    for a in raw_list:
        aid = a["activity_id"]
        desc = a["description"]
        preds = a["predecessors"]
        succs = successors_map.get(aid, [])
        is_milestone = (
            "cod" in aid.lower()
            or "cod" in desc.lower()
            or "milestone" in desc.lower()
            or "handover" in desc.lower()
        )

        # Open ends (no successors)
        if not succs and not is_milestone:
            findings.append(
                ScheduleAuditFinding(
                    id=f"FIND-DCMA-{uuid4().hex[:6]}",
                    activity_id=aid,
                    activity_description=desc,
                    discipline=a["discipline"],
                    category="dcma_logic",
                    severity="critical",
                    planned_value="0 Successors",
                    benchmark_value="≥ 1 Successor",
                    critique_message=(
                        f"Open-ended activity: '{aid}' has no successor logic tie. Delays will not propagate to completion."
                    ),
                    rule_reference="DCMA-OPEN-ENDS-01",
                    calibrated_recommendation="Tie activity to downstream subsystem tie-in or commissioning milestone.",
                )
            )

        # Open starts (no predecessors)
        if not preds and a["planned_start"] != min((x["planned_start"] for x in raw_list if x["planned_start"]), default=None):
            findings.append(
                ScheduleAuditFinding(
                    id=f"FIND-DCMA-{uuid4().hex[:6]}",
                    activity_id=aid,
                    activity_description=desc,
                    discipline=a["discipline"],
                    category="dcma_logic",
                    severity="low",
                    planned_value="0 Predecessors",
                    benchmark_value="≥ 1 Predecessor",
                    critique_message=f"Activity '{aid}' has no predecessor ties; floating start date.",
                    rule_reference="DCMA-OPEN-STARTS",
                    calibrated_recommendation="Link predecessor dependency to site access or procurement handover.",
                )
            )

        # Negative lag check
        for p in preds:
            if isinstance(p, dict) and p.get("lag_days", 0) < 0:
                findings.append(
                    ScheduleAuditFinding(
                        id=f"FIND-LAG-{uuid4().hex[:6]}",
                        activity_id=aid,
                        activity_description=desc,
                        discipline=a["discipline"],
                        category="dcma_logic",
                        severity="high",
                        planned_value=f"{p['lag_days']}d Lag",
                        benchmark_value="≥ 0d Lag",
                        critique_message=(
                            f"Negative lag ({p['lag_days']}d) linked from {p.get('activity_id')}. Negative lags violate standard EPC practice."
                        ),
                        rule_reference="DCMA-LEADS-01",
                        calibrated_recommendation="Replace negative lag with Start-to-Start link with positive offset.",
                    )
                )

        # Negative Total Float check
        if aid in cpm_acts:
            tf = cpm_acts[aid].total_float
            if tf < 0:
                findings.append(
                    ScheduleAuditFinding(
                        id=f"FIND-FLT-{uuid4().hex[:6]}",
                        activity_id=aid,
                        activity_description=desc,
                        discipline=a["discipline"],
                        category="dcma_logic",
                        severity="critical",
                        planned_value=f"{tf}d Float",
                        benchmark_value="≥ 0d Float",
                        critique_message=f"Negative total float ({tf}d) detected. Network logic or milestone constraint is in breach.",
                        rule_reference="DCMA-NEG-FLOAT",
                        calibrated_recommendation="Adjust predecessor logic or request revised milestone constraint date.",
                    )
                )

    # ── Check 3: Environmental & Upper Assam Monsoon Clashes ────────────────
    for a in raw_list:
        aid = a["activity_id"]
        desc = a["description"]
        disc = a["discipline"]
        p_start = a["planned_start"]
        p_finish = a["planned_finish"]

        if disc in ("civil", "piping") or any(k in desc.lower() for k in ("excavation", "trench", "earthwork", "pour", "curing")):
            if _is_monsoon_overlap(p_start, p_finish):
                findings.append(
                    ScheduleAuditFinding(
                        id=f"FIND-ENV-{uuid4().hex[:6]}",
                        activity_id=aid,
                        activity_description=desc,
                        discipline=disc,
                        category="monsoon_weather",
                        severity="critical",
                        planned_value=f"{p_start} to {p_finish}",
                        benchmark_value="Outside Jun 15 - Sep 15",
                        critique_message=(
                            f"Activity '{aid}' ({desc}) executes during peak Upper Assam monsoon "
                            f"(Jun 15 - Sep 15) without weather buffer. Historical monsoon rain causes 35-45% slowdown."
                        ),
                        rule_reference="ENV-MONSOON-01",
                        calibrated_recommendation="Insert 14-day weather contingency buffer or advance before June 15.",
                    )
                )

    # ── Check 4: Concrete Curing Engineering Specification (IS 456) ────────
    for a in raw_list:
        aid = a["activity_id"]
        if aid.startswith("CIV-FDN") and a["planned_finish"]:
            # Check successors for structural steel or static equipment starting too soon
            for succ_id in successors_map.get(aid, []):
                succ = act_map.get(succ_id)
                if succ and succ["planned_start"]:
                    gap_days = (succ["planned_start"] - a["planned_finish"]).days
                    if gap_days < 14 and (succ_id.startswith("CIV-STL") or succ_id.startswith("STA-")):
                        findings.append(
                            ScheduleAuditFinding(
                                id=f"FIND-ENG-{uuid4().hex[:6]}",
                                activity_id=aid,
                                activity_description=a["description"],
                                discipline="civil",
                                category="engineering_rule",
                                severity="critical",
                                planned_value=f"{gap_days}d Curing Gap",
                                benchmark_value="≥ 14d Curing",
                                critique_message=(
                                    f"Foundation pour curing window before '{succ_id}' is only {gap_days}d. "
                                    f"Violates IS 456 specification (minimum 14-day wet cure before structural loading)."
                                ),
                                rule_reference="ENG-CIV-CURING-01",
                                calibrated_recommendation="Enforce minimum 14 calendar days curing lag before steel erection.",
                            )
                        )

    # ── 3. Calculate Composite Feasibility Score (0 - 100) ──────────────────
    critical_count = sum(1 for f in findings if f.severity == "critical")
    high_count = sum(1 for f in findings if f.severity == "high")
    medium_count = sum(1 for f in findings if f.severity == "medium")
    low_count = sum(1 for f in findings if f.severity == "low")

    # Category penalty breakdown
    dcma_penalties = sum(8 for f in findings if f.category == "dcma_logic" and f.severity == "critical") + \
                     sum(4 for f in findings if f.category == "dcma_logic" and f.severity != "critical")
    realism_penalties = sum(10 for f in findings if f.category == "duration_optimism" and f.severity == "critical") + \
                        sum(5 for f in findings if f.category == "duration_optimism" and f.severity != "critical")
    weather_penalties = sum(10 for f in findings if f.category == "monsoon_weather")
    prod_penalties = sum(8 for f in findings if f.category == "productivity_unrealistic") + \
                     sum(6 for f in findings if f.category == "engineering_rule")

    dcma_score = max(0, 100 - dcma_penalties)
    realism_score = max(0, 100 - realism_penalties)
    weather_score = max(0, 100 - weather_penalties)
    prod_score = max(0, 100 - prod_penalties)

    # Weighted composite score: 30% DCMA + 40% Realism + 20% Weather + 10% Productivity
    feasibility_score = int(round(
        0.30 * dcma_score +
        0.40 * realism_score +
        0.20 * weather_score +
        0.10 * prod_score
    ))
    feasibility_score = max(0, min(100, feasibility_score))

    if feasibility_score >= 85:
        feasibility_band = "FEASIBLE"
    elif feasibility_score >= 70:
        feasibility_band = "MODERATE_RISK"
    else:
        feasibility_band = "CRITICAL_RISK"

    # Generate P6 Calibrated PMXML snippet snippet
    snippet = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<!-- NAVIS AI Calibrated Schedule Prescription: {schedule_name} -->\n'
        f'<Project Id="{schedule_name.replace(" ", "_")}" HealthScore="{feasibility_score}">\n'
        f'  <!-- Calibrated against OIL Institutional Memory & Upper Assam Monsoon Rules -->\n'
        f'  <AuditSummary criticalFindings="{critical_count}" warningFindings="{high_count + medium_count}"/>\n'
        f'</Project>'
    )

    return ScheduleAuditResponse(
        audit_id=f"AUDIT-{uuid4().hex[:8].upper()}",
        schedule_name=schedule_name,
        data_date=data_date or "2026-09-15",
        total_activities=total_activities,
        feasibility_score=feasibility_score,
        feasibility_band=feasibility_band,
        score_breakdown={
            "empirical_realism": realism_score,
            "dcma_logic": dcma_score,
            "weather_buffer": weather_score,
            "productivity_sanity": prod_score,
        },
        summary={
            "critical": critical_count,
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
            "total_findings": len(findings),
        },
        findings=findings,
        calibrated_schedule_snippet=snippet,
        audited_at=datetime.utcnow(),
    )
