"""Pydantic contracts for the matching layer.

Mirrors ARCHITECTURE.md §2.4 (LinkCandidate) and §2.5 (LinkDecision).
The `rationale` is a list of deterministic feature names — never LLM prose —
so every link decision is auditable.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Decision(str, Enum):
    AUTO_LINK = "AUTO_LINK"
    REVIEW = "REVIEW"
    NEW_ACTIVITY = "NEW_ACTIVITY"


class Thresholds(BaseModel):
    """Calibrated decision thresholds. Precision-first: a wrong auto-link
    corrupts the schedule; a review-queue item costs a planner ~10 seconds."""

    tau_high: float = Field(0.78, description="score above which AUTO_LINK is allowed")
    tau_low: float = Field(0.42, description="score below which NEW_ACTIVITY")
    margin_min: float = Field(
        0.06, description="min gap between top-1 and top-2 scores for AUTO_LINK"
    )


# ── Feature vector ───────────────────────────────────────────────────────────

class FeatureVector(BaseModel):
    """Per-candidate feature scores. `None` means 'signal absent' — the
    feature is excluded from the weighted blend (weights renormalise)."""

    tag_overlap: Optional[float] = None          # 1.0 = full line+size+spec match
    line_locked: bool = False                    # line number identified (near-decisive)
    discipline_agreement: Optional[float] = None
    date_proximity: Optional[float] = None       # closeness to the planned window
    predecessor_plausibility: Optional[float] = None
    fuzzy_similarity: Optional[float] = None     # rapidfuzz token-set ratio
    embedding_cosine: Optional[float] = None     # MiniLM cosine similarity

    def as_dict(self) -> dict[str, Any]:
        return {
            "tag_overlap": self.tag_overlap,
            "discipline_match": None if self.discipline_agreement is None else self.discipline_agreement >= 0.5,
            "within_planned_window": (self.date_proximity or 0.0) >= 0.85,
            "predecessor_plausible": None if self.predecessor_plausibility is None else self.predecessor_plausibility >= 0.5,
            "fuzzy_ratio": self.fuzzy_similarity,
            "embedding_cosine": self.embedding_cosine,
        }


# ── LinkCandidate (§2.4) ─────────────────────────────────────────────────────

class LinkCandidate(BaseModel):
    activity_id: str
    retrieval_sources: list[str] = Field(default_factory=list)
    rrf_score: float = 0.0
    features: FeatureVector = Field(default_factory=FeatureVector)
    final_score: float = 0.0
    rank: int = 0


# ── LinkDecision (§2.5) ──────────────────────────────────────────────────────

class LinkDecision(BaseModel):
    event_index: int
    raw_text: str
    source_file: str
    outcome: Decision = Decision.NEW_ACTIVITY
    chosen_activity_id: Optional[str] = None
    confidence: float = 0.0
    margin: float = 0.0
    thresholds: Thresholds = Field(default_factory=Thresholds)
    rationale: list[str] = Field(default_factory=list)
    candidates: list[LinkCandidate] = Field(default_factory=list)

    @property
    def top1(self) -> Optional[LinkCandidate]:
        return self.candidates[0] if self.candidates else None


# ── Granularity: rollup result ───────────────────────────────────────────────

class RollupResult(BaseModel):
    """Aggregated progress for one schedule node from many field mentions."""

    activity_id: str
    n_events: int = 0
    planned_qty: float = 0.0
    installed_qty: float = 0.0
    uom: str = ""
    percent_complete: float = 0.0
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None  # set ONLY when percent_complete >= 100
    is_complete: bool = False
    event_texts: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
