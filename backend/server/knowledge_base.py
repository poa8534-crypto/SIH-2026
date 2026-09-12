"""Institutional Knowledge Base & Engineering Rules Repository.

Stores domain constraints, environmental weather rules (Upper Assam / OIL context),
engineering specifications (IS 456 / API 650), logistics lead times, and DCMA-14
industry schedule quality standards.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class KnowledgeRuleDef:
    id: str
    category: str  # environmental | engineering | logistics | dcma_quality | contractor
    title: str
    description: str
    condition_trigger: str
    impact_recommendation: str
    severity: str  # critical | high | medium | low
    active: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
            "title": self.title,
            "description": self.description,
            "condition_trigger": self.condition_trigger,
            "impact_recommendation": self.impact_recommendation,
            "severity": self.severity,
            "active": self.active,
        }


# ── Built-in Knowledge Base Rules ────────────────────────────────────────────

BUILTIN_RULES: list[KnowledgeRuleDef] = [
    KnowledgeRuleDef(
        id="ENV-MONSOON-01",
        category="environmental",
        title="Upper Assam Monsoon Earthwork & Trenching Constraint",
        description=(
            "Active monsoon rainfall in Dibrugarh/Tinsukia/Duliajan between June 15 and "
            "September 15 causes severe ground waterlogging. Soil bearing capacity drops and "
            "civil excavation, earthwork, and pipeline trenching productivity drops by 35-45%."
        ),
        condition_trigger="Civil excavation, earthwork, or pipeline laying scheduled between June 15 and September 15 without weather contingency buffer.",
        impact_recommendation="Insert 14–21 calendar days of monsoon weather contingency buffer or advance earthwork prior to June 15.",
        severity="critical",
        active=True,
    ),
    KnowledgeRuleDef(
        id="ENG-CIV-CURING-01",
        category="engineering",
        title="14-Day Minimum Wet Curing for Equipment Foundations (IS 456)",
        description=(
            "Heavy compressor pedestals and pump foundations require a minimum of 14 calendar "
            "days wet curing to reach 85% design compressive strength before structural steel "
            "erection or equipment placement."
        ),
        condition_trigger="Successor structural erection or equipment placement linked to foundation pour with lag < 14 calendar days.",
        impact_recommendation="Enforce minimum FS + 14d lag between concrete pour finish and structural steel erection start.",
        severity="critical",
        active=True,
    ),
    KnowledgeRuleDef(
        id="ENG-PIP-HYDRO-01",
        category="engineering",
        title="100% NDT Radiography Clearance Prior to Pipeline Hydrotesting",
        description=(
            "Welded line pipe joints must receive 100% radiographic or ultrasonic examination "
            "and quality sign-off before pressurization and hydrotesting."
        ),
        condition_trigger="Hydrotesting activity scheduled concurrently or with 0 lag following pipe welding without NDT inspection stage.",
        impact_recommendation="Insert dedicated NDT inspection activity with 3–5 days turnaround prior to hydrotest pressurization.",
        severity="high",
        active=True,
    ),
    KnowledgeRuleDef(
        id="LOG-CRANE-01",
        category="logistics",
        title="Burhi Dihing Bridge Heavy Axle PWD Transit Permit",
        description=(
            "Cranes exceeding 150-ton capacity crossing the Burhi Dihing river corridor to "
            "reach Duliajan well-sites require Assam PWD axle-load permits with 14-day lead time."
        ),
        condition_trigger="Heavy lift erection scheduled without 14-day mobilization and bridge clearance window.",
        impact_recommendation="Allocate 14-day mobilization and route clearance buffer for heavy mobile cranes (>150T).",
        severity="medium",
        active=True,
    ),
    KnowledgeRuleDef(
        id="DCMA-OPEN-ENDS-01",
        category="dcma_quality",
        title="DCMA 14-Point: Open-Ended Activities (Missing Successors)",
        description=(
            "Every non-milestone activity must have at least one successor. Open-ended activities "
            "create false total float and prevent delay propagation across the critical path."
        ),
        condition_trigger="Activity has 0 successors in the network and is not a project completion milestone.",
        impact_recommendation="Tie open activity to downstream tie-in, commissioning, or handover milestone.",
        severity="critical",
        active=True,
    ),
    KnowledgeRuleDef(
        id="DCMA-LEADS-01",
        category="dcma_quality",
        title="DCMA 14-Point: Negative Lag (Lead Time) Prohibition",
        description=(
            "Negative lags pull successor activities into the past and distort forward pass CPM "
            "calculations. Standard EPC contracts strictly prohibit negative lags."
        ),
        condition_trigger="Relationship link contains negative lag_days (< 0).",
        impact_recommendation="Replace negative lag with a Start-to-Start (SS) relationship with positive lag or decompose the predecessor.",
        severity="high",
        active=True,
    ),
    KnowledgeRuleDef(
        id="CONTR-PROD-01",
        category="contractor",
        title="Unrealistic Contractor Spool Erection Daily Rate",
        description=(
            "Historical Oil India well-site pipeline records demonstrate peak contractor "
            "erection rate does not exceed 2.4 spools/day under field conditions."
        ),
        condition_trigger="Planned productivity rate exceeds 3.0 spools/day (over 125% of peak historical capability).",
        impact_recommendation="Calibrate planned productivity to empirical benchmark of 1.2–1.8 spools/day.",
        severity="high",
        active=True,
    ),
]


class KnowledgeBaseRepository:
    """In-memory and extensible knowledge base repository."""

    def __init__(self):
        self._rules: dict[str, KnowledgeRuleDef] = {r.id: r for r in BUILTIN_RULES}

    def get_all(self) -> list[KnowledgeRuleDef]:
        return list(self._rules.values())

    def get(self, rule_id: str) -> Optional[KnowledgeRuleDef]:
        return self._rules.get(rule_id)

    def add(self, rule: KnowledgeRuleDef) -> None:
        self._rules[rule.id] = rule

    def toggle(self, rule_id: str, active: bool) -> bool:
        if rule_id in self._rules:
            self._rules[rule_id].active = active
            return True
        return False


# Global singleton instance
knowledge_base = KnowledgeBaseRepository()
