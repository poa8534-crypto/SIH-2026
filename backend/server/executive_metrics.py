"""Executive Intelligence & Portfolio Oversight Engine.

Senior-management oversight, assembled from layers that already compute their
own numbers - the CPM pass (D-082), the EVM stack (D-084), the delay
attribution layer (D-076..D-081) and the quantity ledger (D-085). This module
aggregates; it does not derive anything of its own.

WHAT THIS MODULE MAY NOT DO
---------------------------
It may not invent a number. That rule is not decoration here: this file
previously carried eight invented figures, and every one of them sat on the
screen a Senior Management judge looks at first (D-090). They were:

  1. delay days read with key names the delay layer never emits, so every
     financial figure silently resolved to zero
  2. a hardcoded ₹180 Cr contract value
  3. a hardcoded ₹12.5 lakh/day prolongation rate
  4. P10 / P50 / P90 dates computed as drift-3 / drift / drift+14
  5. `monte_carlo_runs: 1000` for a simulation that never ran
  6. historical EV back-cast by multiplying today's EV by (elapsed ratio)^1.15
  7. five hardcoded milestones with invented dates and confidence percentages
  8. a "driving delay" cause chosen by matching "CIV"/"PIP"/"ELE" in the id

Money now appears ONLY when an operator supplies the contract parameters, and
is labelled as their assumption. Everything else is computed or absent, and an
absence says why - the same contract `server/evm.py` states for cost metrics:
emitting a figure whose denominator was invented is the opposite of what this
project claims about itself.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from server.cpm import compute_schedule
from server.db import Activity, LinkedEvent
from server.delay_events import attribution as delay_attribution
from server.delay_taxonomy import Liability
from server.evm import compute_evm

#: Liquidated damages are capped at 10% of contract value under FIDIC 8.7, and
#: accrue at 0.5% per week. These are clause parameters, not project data, so
#: they are constants - unlike the contract value itself, which is a fact about
#: one contract and must be supplied.
LD_PCT_PER_WEEK = 0.5
MAX_LIQUIDATED_DAMAGES_PCT = 10.0

#: Said in the payload whenever no contract parameters were supplied, so the
#: absence of a rupee figure is data rather than something a reader infers.
FINANCIAL_UNAVAILABLE_REASON = (
    "No contract value was supplied, so no financial exposure is computed. "
    "Nothing ingested by this system carries a contract sum, a rate or an "
    "actual cost; a figure in Crores would rest on a denominator the software "
    "invented. Supply contract_value_cr (and optionally "
    "prolongation_lakhs_per_day) to have the delay days below priced against "
    "your own assumptions."
)


def compute_executive_metrics(
    db: Session,
    as_of: Optional[date] = None,
    *,
    contract_value_cr: Optional[float] = None,
    prolongation_lakhs_per_day: Optional[float] = None,
) -> Dict[str, Any]:
    """Executive oversight, aggregated from the layers that own each number.

    `contract_value_cr` and `prolongation_lakhs_per_day` are the operator's
    contract assumptions. Both are optional and neither is defaulted: without
    them the delay exposure is reported in DAYS, which is what the evidence
    actually supports, and `financial.available` is false with the reason.
    """
    if as_of is None:
        as_of = date(2026, 9, 15)

    # 1. Schedule & CPM Network
    activities: List[Activity] = db.query(Activity).all()
    network = compute_schedule(activities)

    # 2. EVM Figures
    evm_data = compute_evm(db, as_of)
    project_evm = evm_data.get("project", {})
    spi = project_evm.get("spi")
    pv_total = project_evm.get("planned_value", 0.0)
    ev_total = project_evm.get("earned_value", 0.0)
    source_counts = project_evm.get("percent_source_counts", {})
    no_evidence_floor = source_counts.get("no_evidence_floor", 0)

    total_activities_count = len(activities)
    evidenced_count = max(0, total_activities_count - no_evidence_floor)
    evidence_coverage_pct = (
        round((evidenced_count / total_activities_count) * 100.0, 1)
        if total_activities_count > 0
        else 0.0
    )

    # 3. Delay & Dispute Attribution
    delay_data = delay_attribution(db, as_of=as_of)
    proposed_days = delay_data.get("proposed_days", {})
    adjudicated_days = delay_data.get("adjudicated_days", {})
    notice_counts = delay_data.get("notice_counts", {})
    delay_rows = delay_data.get("events", [])

    # The delay layer keys these by its own Liability enum. Reading them with
    # invented strings - "EMPLOYER", "CONTRACTOR" - meant every .get() fell to
    # its default and the whole financial panel resolved to zero while the
    # evidence underneath held 43 delay-days. The enum is imported so the two
    # cannot drift apart again.
    employer_delay_days = proposed_days.get(Liability.COMPENSABLE.value, 0)
    contractor_delay_days = proposed_days.get(Liability.NON_COMPENSABLE.value, 0)
    neutral_delay_days = proposed_days.get(Liability.EXCUSABLE.value, 0)
    contested_delay_days = proposed_days.get(Liability.CONTESTED.value, 0)

    # Genuine concurrency comes from the concurrency analysis (D-081), not from
    # a liability bucket - two delays are concurrent when their windows
    # overlap, which is a different question from who carries them.
    concurrency = delay_data.get("concurrency", {})
    concurrent_pairs = concurrency.get("total_pairs", 0)
    concurrent_conflicts = concurrency.get("counts", {}).get("CONFLICT", 0)

    # Days that outran the float the baseline gave them - the only ones that
    # can have moved the completion date (D-082).
    beyond_float_days = delay_data.get("beyond_float_days", {})
    employer_beyond_float = beyond_float_days.get(Liability.COMPENSABLE.value, 0)
    contractor_beyond_float = beyond_float_days.get(Liability.NON_COMPENSABLE.value, 0)

    # ── Financial exposure: only against parameters an operator supplied ──
    financial_available = contract_value_cr is not None and contract_value_cr > 0
    employer_claim_cr: Optional[float] = None
    contractor_ld_risk_cr: Optional[float] = None
    if financial_available:
        if prolongation_lakhs_per_day is not None and prolongation_lakhs_per_day > 0:
            # Employer delay -> extension of time plus prolongation cost.
            employer_claim_cr = round(
                (employer_delay_days * prolongation_lakhs_per_day) / 100.0, 2
            )
        # Contractor delay -> liquidated damages, capped under FIDIC 8.7.
        ld_raw_cr = (contractor_delay_days / 7.0) * (
            (LD_PCT_PER_WEEK / 100.0) * contract_value_cr
        )
        contractor_ld_risk_cr = round(
            min(ld_raw_cr, (MAX_LIQUIDATED_DAMAGES_PCT / 100.0) * contract_value_cr), 2
        )

    # Notice compliance. UNKNOWN windows are excluded from the denominator:
    # a delay whose evidenced date could not be established has no window to
    # comply with, and counting it as a failure would be an accusation.
    notice_served = notice_counts.get("SERVED", 0)
    notice_open = notice_counts.get("OPEN", 0)
    notice_lapsed = notice_counts.get("LAPSED", 0)
    notice_unknown = notice_counts.get("UNKNOWN", 0)
    windows_with_a_deadline = notice_served + notice_open + notice_lapsed
    notice_compliance_pct = (
        round(((notice_served + notice_open) / windows_with_a_deadline) * 100.0, 1)
        if windows_with_a_deadline else None
    )

    # 4. Critical Path & Float Drift
    critical_activities = [
        act for act in activities
        if network.activities.get(act.activity_id) and network.activities[act.activity_id].critical
    ]
    critical_slips = [
        (act.finish_variance_days or 0) for act in critical_activities if (act.finish_variance_days or 0) > 0
    ]
    max_critical_slip = max(critical_slips) if critical_slips else 0
    authored_finish = network.authored_finish
    project_finish = network.project_finish

    float_drift_days = (
        (project_finish - authored_finish).days
        if project_finish and authored_finish
        else max_critical_slip
    )

    # 5. Completion range.
    #
    # NOT a probability distribution. This previously emitted P10 / P50 / P90
    # as base + (drift - 3) / drift / (drift + 14) and declared
    # `monte_carlo_runs: 1000` beside them, which named a simulation that did
    # not exist and put a confidence label on arithmetic. Nothing in this
    # system holds a duration-uncertainty distribution for these activities -
    # there is one baseline, not a series of updated schedules - so no
    # percentile can be computed, and inventing three is worse than offering
    # two honest bounds.
    #
    # What CAN be computed are three dated positions, each with a stated
    # derivation:
    #
    #   baseline  the latest planned finish, as the baseline was authored
    #   logic     the CPM forward pass over evidenced actual dates (D-082)
    #   exposed   logic, plus recorded delay that has outrun its float on
    #             critical activities which have NOT yet finished - exposure
    #             the network has not absorbed because the work is still open
    #
    # `exposed` is an upper bound, for the reason `attribution` already states
    # about `impact_days`: an activity delayed by two causes reports its whole
    # slip against both, so summing over causes over-counts.
    finished_ids = {a.activity_id for a in activities if a.actual_finish is not None}
    open_critical_exposure = sum(
        (row.beyond_float_days or 0)
        for row in delay_rows
        if row.activity_id
        and row.activity_id not in finished_ids
        and row.on_critical_path
    )
    logic_finish = project_finish
    exposed_finish = (
        logic_finish + timedelta(days=open_critical_exposure)
        if logic_finish else None
    )

    # 6. Generate Cumulative Weekly S-Curve Data
    starts = [a.planned_start for a in activities if a.planned_start]
    finishes = [a.planned_finish for a in activities if a.planned_finish]
    min_date = min(starts) if starts else as_of - timedelta(days=60)
    max_date = max(finishes) if finishes else as_of + timedelta(days=90)
    if project_finish and project_finish > max_date:
        max_date = project_finish

    s_curve_points = []
    curr = min_date
    week_idx = 1

    act_meta = []
    for a in activities:
        w = max(1, ((a.planned_finish - a.planned_start).days + 1)) if a.planned_start and a.planned_finish else 1
        act_meta.append({
            "id": a.activity_id,
            "weight": w,
            "planned_start": a.planned_start,
            "planned_finish": a.planned_finish,
            "actual_start": a.actual_start,
            "actual_finish": a.actual_finish,
            "actual_qty": a.actual_qty,
            "planned_qty": a.planned_qty,
        })

    total_weight = sum(m["weight"] for m in act_meta) or 1.0

    while curr <= max_date + timedelta(days=7):
        pv_cum = 0.0
        for m in act_meta:
            if not m["planned_start"] or not m["planned_finish"]:
                continue
            if curr >= m["planned_finish"]:
                pv_cum += m["weight"]
            elif curr > m["planned_start"]:
                span = (m["planned_finish"] - m["planned_start"]).days or 1
                elapsed = (curr - m["planned_start"]).days
                pv_cum += m["weight"] * min(1.0, max(0.0, elapsed / span))

        pv_pct = round((pv_cum / total_weight) * 100.0, 1)

        ev_pct: Optional[float] = None
        ev_proj_pct: Optional[float] = None

        if curr <= as_of:
            # Measured from the actual finish dates in the schedule, under a
            # stated 0/100 rule: an activity earns its weight on the day it
            # actually finished, and work in progress earns nothing until it
            # does.
            #
            # This replaces a back-cast that multiplied TODAY's earned value by
            # (elapsed fraction) ** 1.15 - an exponent with no derivation, which
            # drew a plausible history the project never had. Every point below
            # is now a count of work that demonstrably completed by that date.
            #
            # The 0/100 rule is conservative and is the reason this curve ends
            # BELOW `kpis.ev_total`, which credits partial percent complete.
            # Both are real; they answer different questions, and `ev_basis`
            # in the payload says which is which.
            ev_cum = sum(
                m["weight"] for m in act_meta
                if m["actual_finish"] and curr >= m["actual_finish"]
            )
            ev_pct = round((ev_cum / total_weight) * 100.0, 1)
            ev_proj_pct = ev_pct
        else:
            # Beyond the data date this is a projection and is labelled one:
            # remaining planned value earned at the performance measured so
            # far. `spi` is the EVM stack's own figure; the 0.85 fallback is
            # gone, because a fallback SPI is an invented performance.
            delta_pv = pv_pct - (s_curve_points[-1]["pv_cumulative"] if s_curve_points else pv_pct)
            last_proj = s_curve_points[-1]["ev_projected"] if s_curve_points else 0.0
            if spi is not None and spi > 0:
                ev_proj_pct = round(min(100.0, (last_proj or 0.0) + delta_pv * spi), 1)
            else:
                ev_proj_pct = None

        s_curve_points.append({
            "date": curr.isoformat(),
            "week_label": f"W{week_idx:02d}",
            "pv_cumulative": pv_pct,
            "ev_cumulative": ev_pct,
            "ev_projected": ev_proj_pct,
            "is_future": curr > as_of,
        })

        curr += timedelta(days=7)
        week_idx += 1

    # 7. Top critical path drivers, and what actually drove them.
    #
    # `driving_delay` was previously a string chosen by looking for "CIV",
    # "PIP" or "ELE" in the activity id - "Foundation curing & monsoon hold"
    # for anything civil, whether or not a single report had mentioned curing
    # or rain. It presented an invented cause on the screen a client reads
    # first, while the delay layer beneath it held the real cause, its
    # category, and the line of the document it was read from.
    #
    # It now comes from that layer, or it is absent. The worst recorded delay
    # on the activity wins, matching how `attribution` sorts.
    worst_delay_by_activity: Dict[str, Any] = {}
    for row in delay_rows:
        if not row.activity_id:
            continue
        held = worst_delay_by_activity.get(row.activity_id)
        if held is None or (row.impact_days or 0) > (held.impact_days or 0):
            worst_delay_by_activity[row.activity_id] = row

    # A critical activity that has not slipped and carries no recorded delay
    # is not driving anything, and listing six of them padded the panel with
    # rows whose only content was a zero. The list is now as long as the
    # evidence makes it, which on a healthy project is empty.
    driving = [
        act for act in critical_activities
        if (act.finish_variance_days or 0) > 0
        or act.activity_id in worst_delay_by_activity
    ]
    critical_drivers = []
    for act in sorted(
        driving,
        key=lambda a: (a.finish_variance_days or 0),
        reverse=True
    )[:6]:
        var_days = act.finish_variance_days or 0
        cause = worst_delay_by_activity.get(act.activity_id)
        critical_drivers.append({
            "activity_id": act.activity_id,
            "description": act.description,
            "discipline": act.discipline,
            "planned_finish": act.planned_finish.isoformat() if act.planned_finish else None,
            "actual_finish": act.actual_finish.isoformat() if act.actual_finish else None,
            "finish_variance_days": var_days,
            # None means no delay cause was recorded against this activity.
            # A slip with no stated cause is a real and reportable state, and
            # naming one would be the defect this replaced.
            "driving_delay": cause.phrase if cause else None,
            "driving_delay_category": cause.category if cause else None,
            "driving_delay_liability": (
                (cause.liability_final or cause.liability_proposed) if cause else None
            ),
            "driving_delay_adjudicated": (
                cause.liability_final is not None if cause else False
            ),
            "driving_delay_source": (
                f"{cause.source_file}"
                + (f", line {cause.source_line}" if cause.source_line is not None else "")
                if cause and cause.source_file else None
            ),
            "critical": True,
        })

    # 8. Milestone tracking.
    #
    # This was five hardcoded rows - invented names, invented baseline and
    # forecast dates, and a "confidence" of 94.2% / 78.5% / 65.0% / 71.2% for
    # which no calibration exists anywhere in this system. Four of the five
    # would have kept showing August and October dates against any corpus at
    # all, including an empty one.
    #
    # The baseline carries no milestone flag, so a milestone here is DERIVED
    # and says so: the last-finishing activity of each discipline, which is
    # the point that discipline's scope completes, plus the project finish.
    # Every date below is either an actual date or the CPM early finish, and
    # `basis` names which. There is no confidence column, because there is
    # nothing to compute one from.
    milestones = []
    last_by_discipline: Dict[str, Activity] = {}
    for act in activities:
        if not act.discipline or not act.planned_finish:
            continue
        held = last_by_discipline.get(act.discipline)
        if held is None or act.planned_finish > held.planned_finish:
            last_by_discipline[act.discipline] = act

    for discipline, act in sorted(last_by_discipline.items()):
        scheduled = network.activities.get(act.activity_id)
        forecast_date = act.actual_finish or (scheduled.early_finish if scheduled else None)
        variance = (
            (forecast_date - act.planned_finish).days
            if forecast_date and act.planned_finish else None
        )
        if act.actual_finish:
            status = "COMPLETE"
        elif variance is None:
            status = "UNSCHEDULED"
        elif variance <= 0:
            status = "ON_TRACK"
        elif scheduled and scheduled.critical:
            status = "CRITICAL"
        else:
            status = "AT_RISK"
        # "hse" -> "HSE", "static_equipment" -> "Static Equipment".
        label = " ".join(
            word.upper() if len(word) <= 3 else word.capitalize()
            for word in discipline.split("_")
        )
        milestones.append({
            "name": f"{label} scope complete",
            "activity_id": act.activity_id,
            "activity_description": act.description,
            "derived": True,
            "derivation": "last planned finish in this discipline",
            "baseline_date": act.planned_finish.isoformat() if act.planned_finish else None,
            "forecast_date": forecast_date.isoformat() if forecast_date else None,
            "basis": (
                "actual_finish" if act.actual_finish
                else ("cpm_early_finish" if scheduled else "not_scheduled")
            ),
            "variance_days": variance,
            "status": status,
        })

    milestones.append({
        "name": "Project finish",
        "activity_id": None,
        "derived": True,
        "derivation": "latest finish across the network",
        "activity_description": None,
        "baseline_date": authored_finish.isoformat() if authored_finish else None,
        "forecast_date": project_finish.isoformat() if project_finish else None,
        "basis": "cpm_project_finish",
        "variance_days": float_drift_days,
        "status": "CRITICAL" if float_drift_days > 7 else "ON_TRACK",
    })


    return {
        "as_of": as_of.isoformat(),
        "kpis": {
            "spi": spi,
            "spi_band": "On plan" if (spi and spi >= 0.95) else ("Slipping" if (spi and spi >= 0.85) else "Behind"),
            "pv_total": pv_total,
            "ev_total": ev_total,
            "float_drift_days": float_drift_days,
            "critical_activities_count": len(critical_activities),
            "evidence_coverage_pct": evidence_coverage_pct,
            "total_activities": total_activities_count,
            "evidenced_activities": evidenced_count,
            "unevidenced_activities": no_evidence_floor,
        },
        "dispute_shield": {
            # Days, keyed by the liability the delay layer actually proposes.
            # The old EMPLOYER / CONTRACTOR / CONCURRENT / NEUTRAL names are
            # gone rather than aliased: an alias would have preserved the
            # vocabulary that caused the mismatch.
            "employer_delay_days": employer_delay_days,
            "contractor_delay_days": contractor_delay_days,
            "neutral_delay_days": neutral_delay_days,
            "contested_delay_days": contested_delay_days,
            # Only these can have moved the completion date.
            "employer_beyond_float_days": employer_beyond_float,
            "contractor_beyond_float_days": contractor_beyond_float,
            # Overlapping delay windows (D-081), which is a different question
            # from who carries the delay - there is no CONCURRENT liability.
            "concurrent_pairs": concurrent_pairs,
            "concurrent_conflicts": concurrent_conflicts,
            # Days a planner has actually ruled on, beside the proposals
            # above. A report that cannot tell the two apart is not a report.
            "adjudicated_days": adjudicated_days,
            "adjudicated_beyond_float_days": delay_data.get(
                "adjudicated_beyond_float_days", {}),
            "adjudicated_events": delay_data.get("adjudicated_events", 0),
            "total_events": delay_data.get("total_events", 0),
            "notice_compliance_pct": notice_compliance_pct,
            "notice_served_count": notice_served,
            "notice_open_count": notice_open,
            "notice_lapsed_count": notice_lapsed,
            "notice_unknown_count": notice_unknown,
            "notice_note": delay_data.get("notice_note"),
            "impact_days_basis": delay_data.get("impact_days_basis"),
            "unadjudicated_note": delay_data.get("unadjudicated_note"),
        },
        # Money lives in its own block so a client cannot read a rupee figure
        # without also reading whether one was available and on whose numbers.
        "financial": {
            "available": financial_available,
            "reason": None if financial_available else FINANCIAL_UNAVAILABLE_REASON,
            "basis": "operator_supplied" if financial_available else None,
            "contract_value_cr": contract_value_cr,
            "prolongation_lakhs_per_day": prolongation_lakhs_per_day,
            "employer_claim_cr": employer_claim_cr,
            "contractor_ld_risk_cr": contractor_ld_risk_cr,
            "ld_pct_per_week": LD_PCT_PER_WEEK,
            "ld_cap_pct": MAX_LIQUIDATED_DAMAGES_PCT,
            "note": (
                "Exposure is delay days priced against contract parameters the "
                "operator supplied. Nothing ingested by this system carries a "
                "contract sum, a rate or an actual cost, so these figures are "
                "the operator's assumptions applied to the project's evidence, "
                "not a valuation this software performed."
            ) if financial_available else None,
        },
        "completion_forecast": {
            "baseline_finish": authored_finish.isoformat() if authored_finish else None,
            "logic_finish": logic_finish.isoformat() if logic_finish else None,
            "exposed_finish": exposed_finish.isoformat() if exposed_finish else None,
            "current_forecast_finish": project_finish.isoformat() if project_finish else None,
            "variance_days": float_drift_days,
            "open_critical_exposure_days": open_critical_exposure,
            "is_probabilistic": False,
            # `variance_days` is logic finish minus authored finish, and on a
            # baseline whose stated dates do not satisfy its own logic ties,
            # part of that gap is the baseline disagreeing with itself rather
            # than work running late. A reader comparing it against the slips
            # in `critical_drivers` has to be told, or the two will not
            # reconcile and the honest number will look like an error.
            "logic_conflicts": len(network.logic_conflicts),
            "logic_conflicts_note": (
                f"{len(network.logic_conflicts)} of the baseline's logic ties "
                "are broken by its own authored dates, so `variance_days` "
                "measures the gap between the two halves of the baseline as "
                "well as any progress slip."
            ) if network.logic_conflicts else None,
            "basis": (
                "Three computed dates, not percentiles. `baseline_finish` is "
                "the baseline as authored; `logic_finish` is the CPM forward "
                "pass over evidenced actual dates; `exposed_finish` adds "
                "recorded delay that has already outrun its float on critical "
                "activities still open. No probability is attached to any of "
                "them: this system holds one baseline, not a duration "
                "distribution, so a P10 or P90 would be a label on arithmetic. "
                "`exposed_finish` is an upper bound - an activity delayed by "
                "two causes reports its whole slip against both."
            ),
        },
        "s_curve": s_curve_points,
        "ev_basis": (
            "A percentage of planned duration, weighted by each activity's "
            "planned days, on a 0/100 rule: an activity earns its weight on "
            "its actual finish date and work in progress earns nothing until "
            "it finishes. It is therefore conservative, and it is NOT the "
            "same quantity as `kpis.ev_total`, which is the EVM stack's own "
            "earned value in its own units and credits partial percent "
            "complete (D-084). Points after the data date carry "
            "`ev_cumulative: null` and only `ev_projected`, which extends "
            "planned value at the measured SPI and is null when SPI could "
            "not be computed."
        ),
        "critical_drivers": critical_drivers,
        "critical_drivers_note": (
            "`driving_delay` is the worst delay recorded against the activity "
            "by the delay layer, with the document line it was read from. "
            "Null means no cause is recorded - a slip with no stated cause, "
            "not an unknown one to be guessed at."
        ),
        "milestones": milestones,
        "milestones_note": (
            "The baseline carries no milestone flag, so these are derived: "
            "the last-finishing activity of each discipline, plus the project "
            "finish. Each row states its derivation and whether its forecast "
            "date is an actual date or the CPM early finish. No confidence "
            "figure is offered because nothing here calibrates one."
        ),
    }
