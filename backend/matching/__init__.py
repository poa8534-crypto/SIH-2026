"""matching — schedule-linking engine (entity resolution, not an LLM call).

Pipeline (see ARCHITECTURE.md §1):
  1. Candidate retrieval  — hybrid: exact tag + BM25 + dense (MiniLM), RRF fusion, top-k=20
  2. Feature scoring      — tag overlap, discipline, date proximity, predecessor
                            plausibility, rapidfuzz similarity, embedding cosine
  3. Decision             — AUTO_LINK / REVIEW / NEW_ACTIVITY with calibrated
                            thresholds (precision-first)
  4. Granularity          — many-to-one rollup, quantity-based percent complete,
                            Actual Finish only when the node is complete
"""

from .models import (
    Decision,
    LinkCandidate,
    LinkDecision,
    RollupResult,
    Thresholds,
)
from .schedule_index import ActivityRecord, ScheduleIndex
from .retrieval import HybridRetriever, MiniLMEmbedder
from .engine import MatchingEngine, RollupAccumulator, decide_outcome

__all__ = [
    "Decision",
    "LinkCandidate",
    "LinkDecision",
    "RollupResult",
    "Thresholds",
    "ActivityRecord",
    "ScheduleIndex",
    "HybridRetriever",
    "MiniLMEmbedder",
    "MatchingEngine",
    "RollupAccumulator",
    "decide_outcome",
]
