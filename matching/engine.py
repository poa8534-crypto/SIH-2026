"""The matching engine: retrieval → feature scoring → calibrated decision.

Decision rule (precision-first — a wrong auto-link corrupts the schedule,
a review-queue item only costs a planner ~10 seconds):

  NEW_ACTIVITY   top-1 score < tau_low
  AUTO_LINK      top-1 >= tau_high AND margin(top1, top2) >= margin_min
                 AND no discipline conflict on the winner
  REVIEW         everything in between, incl. high score but ambiguous margin

The `matching` entry point consumes extraction.models.ExtractedEvent objects
and uses the schedule loaded from dataset/baseline_schedule.json.
"""

from __future__ import annotations

from pathlib import Path

from .features import (
    blend_with_line_lock,
    compute_features,
    final_score,
)
from .models import Decision, LinkCandidate, LinkDecision, Thresholds
from .retrieval import HybridRetriever
from .schedule_index import ScheduleIndex


class MatchingEngine:
    def __init__(
        self,
        schedule_path: str | Path,
        thresholds: Thresholds | None = None,
        embedder=None,
    ):
        self.index = ScheduleIndex.from_json(schedule_path)
        self.retriever = HybridRetriever(self.index, embedder=embedder)
        self.thresholds = thresholds or Thresholds()

    # ── Public API ───────────────────────────────────────────────────────────

    def match_event(self, event, event_index: int = 0) -> LinkDecision:
        """Resolve one ExtractedEvent against the schedule."""
        cand_ids, info = self.retriever.retrieve(event.raw_text, event.tags)
        reported = event.reported_date

        scored: list[LinkCandidate] = []
        for idx in cand_ids:
            rec = self.index.records[idx]
            fv = compute_features(
                self.index, event, rec, reported,
                embedding_cosine=self._dense_cos(idx, info),
            )
            score = final_score(fv)
            score = blend_with_line_lock(score, fv, unique_line=self._unique_line(idx))
            scored.append(LinkCandidate(
                activity_id=rec.activity_id,
                retrieval_sources=info[idx]["sources"],
                rrf_score=round(info[idx]["rrf"], 6),
                features=fv,
                final_score=score,
            ))

        scored.sort(key=lambda c: (-c.final_score, c.activity_id))
        for rank, c in enumerate(scored, 1):
            c.rank = rank

        outcome, chosen, margin, rationale = decide_outcome(scored, self.thresholds)
        d = LinkDecision(
            event_index=event_index,
            raw_text=event.raw_text,
            source_file=event.provenance.source_file if event.provenance else "",
            thresholds=self.thresholds,
            outcome=outcome,
            chosen_activity_id=chosen,
            confidence=scored[0].final_score if scored else 0.0,
            margin=margin,
            rationale=rationale,
            candidates=scored,
        )
        return d

    def match_events(self, events) -> list[LinkDecision]:
        return [self.match_event(e, i) for i, e in enumerate(events)]

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _dense_cos(self, idx: int, info: dict[int, dict]) -> float | None:
        """Cosine similarity of the dense channel for this candidate (None if
        the candidate did not surface in the dense channel)."""
        if "DENSE" not in info[idx]["sources"]:
            return None
        return info[idx].get("dense_cos")

    def _unique_line(self, idx: int) -> bool:
        rec = self.index.records[idx]
        return any(
            len(self.index.line_index.get(line, [])) == 1
            for line in rec.line_keys
        )


def decide_outcome(scored: list[LinkCandidate], t: Thresholds):
    """Core decision rule over scored candidates.

    Returns (outcome, chosen_activity_id, margin, rationale).
    Kept separate from the engine so eval.py can re-decide under different
    calibrated thresholds without re-running retrieval + scoring.
    """
    if not scored:
        return Decision.NEW_ACTIVITY, None, 0.0, ["no_candidates"]

    top1 = scored[0]
    top2 = scored[1] if len(scored) > 1 else None
    s1, s2 = top1.final_score, (top2.final_score if top2 else 0.0)
    margin = round(s1 - s2, 6)
    rationale = _rationale(top1)

    # Discipline-conflict guard: inferred discipline contradicts the winner
    # → never auto-link (precision-first).
    disc_conflict = (
        top1.features.discipline_agreement is not None
        and top1.features.discipline_agreement == 0.0
    )

    if s1 < t.tau_low:
        return Decision.NEW_ACTIVITY, None, margin, ["below_tau_low"] + rationale[:2]
    if s1 >= t.tau_high and margin >= t.margin_min and not disc_conflict:
        return Decision.AUTO_LINK, top1.activity_id, margin, rationale
    review_why = rationale + (
        ["margin_too_small"] if margin < t.margin_min else []
    ) + (["discipline_conflict"] if disc_conflict else [])
    return Decision.REVIEW, top1.activity_id, margin, review_why


def _rationale(c: LinkCandidate) -> list[str]:
    r = []
    f = c.features
    if f.line_locked:
        r.append("tag_line_match")
        if f.tag_overlap == 1.0:
            r.append("tag_full_match")
    if f.discipline_agreement == 1.0:
        r.append("discipline_match")
    if f.date_proximity is not None and f.date_proximity >= 0.85:
        r.append("within_planned_window")
    if f.predecessor_plausibility is not None and f.predecessor_plausibility < 0.5:
        r.append("predecessor_not_startable")
    if f.fuzzy_similarity is not None and f.fuzzy_similarity >= 0.7:
        r.append("high_fuzzy_similarity")
    if f.embedding_cosine is not None and f.embedding_cosine >= 0.6:
        r.append("high_embedding_similarity")
    return r or ["weak_evidence"]

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _dense_cos(self, idx: int, info: dict[int, dict]) -> float | None:
        """Cosine similarity of the dense channel for this candidate (None if
        the candidate did not surface in the dense channel)."""
        if "DENSE" not in info[idx]["sources"]:
            return None
        return info[idx].get("dense_cos")

    def _unique_line(self, idx: int) -> bool:
        rec = self.index.records[idx]
        return any(
            len(self.index.line_index.get(line, [])) == 1
            for line in rec.line_keys
        )


# ══════════════════════════════════════════════════════════════════════════════
# Granularity handling: many-to-one rollup
# ══════════════════════════════════════════════════════════════════════════════

from .models import DateAssertion, RollupResult  # noqa: E402
from .textutils import normalize_uom  # noqa: E402


class RollupAccumulator:
    """Aggregates many field mentions (AUTO_LINK decisions) into one L5/L6
    schedule node.

    Supports:
      * many-to-one rollup - several mentions contribute to one node
      * quantity-based percent complete - 40 m of 120 m planned = 33%
      * explicit/fraction percentages when no quantity is given
      * separate start and finish assertions, so a node gets DISTINCT actual
        dates instead of one date standing in for both
      * partial-scope protection - a completion mention covering part of a
        node's scope must not finish the whole node
      * conflict capture - when two sources disagree, both are recorded
    """

    def __init__(self, engine: MatchingEngine):
        self.engine = engine
        self._acc: dict[str, dict] = {}

    def add(self, decision: LinkDecision, event) -> None:
        """Consume one AUTO_LINK decision (others are ignored by design:
        REVIEW/NEW_ACTIVITY never write progress)."""
        if decision.outcome is not Decision.AUTO_LINK or not decision.chosen_activity_id:
            return
        aid = decision.chosen_activity_id
        rec = self.engine.index.by_id[aid]
        acc = self._acc.setdefault(aid, {
            "installed": 0.0,
            "pct_events": [],
            "dates": [],
            "starts": [],
            "finishes": [],
            "texts": [],
            "notes": [],
            "has_progress": False,
        })

        uom_ev = normalize_uom(event.uom)
        uom_act = normalize_uom(rec.uom)
        qty = event.quantity

        if qty is not None and _qty_swallowed_by_tag(qty, event.tags):
            acc["notes"].append(
                f"ignored qty {qty:g} - digits belong to a tag, not a quantity"
            )
            qty = None

        if qty is not None and uom_ev and uom_act and uom_ev != uom_act:
            acc["notes"].append(
                f"uom mismatch ignored: event {qty} {uom_ev} vs planned {rec.uom}"
            )
            qty = None

        if qty is not None and rec.planned_qty > 0:
            acc["installed"] += qty
            acc["has_progress"] = True
            acc["notes"].append(f"+{qty:g} {uom_act or uom_ev or '?'}")
        elif event.percentage is not None:
            acc["pct_events"].append(event.percentage)
            acc["has_progress"] = True
            acc["notes"].append(f"+{event.percentage:g}%")
        elif event.status is not None and event.status.value == "completed":
            # Completion asserted without a quantity. On a node measured by
            # quantity this is NOT evidence that the whole node is done - a
            # DPR line covering pedestals P7-P12 completes only part of a
            # P1-P12 node. Treat it as progress and let the quantity roll-up
            # decide completion.
            if rec.planned_qty > 0:
                acc["has_progress"] = True
                acc["notes"].append(
                    "completion asserted without a quantity - not applied to "
                    f"the node (planned {rec.planned_qty:g} {rec.uom}); scope "
                    "may be partial"
                )
            else:
                # Unquantified node (a milestone): a completion claim is all
                # the evidence there is or ever will be.
                acc["pct_events"].append(100.0)
                acc["has_progress"] = True
                acc["notes"].append("completed (unquantified node)")
        else:
            acc["notes"].append("no measurable progress signal")

        prov = getattr(event, "provenance", None)
        src_file = getattr(prov, "source_file", "") or decision.source_file or ""
        src_span = getattr(prov, "source_span", "") or decision.raw_text or ""

        if getattr(event, "asserted_start", None):
            acc["starts"].append(DateAssertion(
                field="actual_start", value=event.asserted_start,
                source_file=src_file, source_span=src_span,
            ))
        if getattr(event, "asserted_finish", None):
            acc["finishes"].append(DateAssertion(
                field="actual_finish", value=event.asserted_finish,
                source_file=src_file, source_span=src_span,
            ))

        if event.reported_date:
            acc["dates"].append(event.reported_date)
        acc["texts"].append(decision.raw_text)

    def results(self) -> list[RollupResult]:
        out: list[RollupResult] = []
        for aid, acc in self._acc.items():
            rec = self.engine.index.by_id[aid]
            if rec.planned_qty > 0 and acc["installed"] > 0:
                pct = min(100.0, acc["installed"] / rec.planned_qty * 100.0)
            elif acc["pct_events"]:
                pct = min(100.0, sum(acc["pct_events"]))
            else:
                pct = 0.0
            is_complete = pct >= 100.0 - 1e-6

            starts, finishes = acc["starts"], acc["finishes"]
            conflicts = _describe_conflicts(starts, finishes)

            # Earliest start wins, latest finish wins. An explicit assertion
            # always beats the bare reported date, which stays a fallback for
            # events that made no start/finish claim of their own.
            if starts:
                actual_start = min(a.value for a in starts)
            elif acc["dates"] and pct > 0:
                actual_start = min(acc["dates"])
            else:
                actual_start = None

            # Actual Finish only when the node is actually complete. A
            # withheld finish assertion is reported, not applied.
            if is_complete:
                if finishes:
                    actual_finish = max(a.value for a in finishes)
                elif acc["dates"]:
                    actual_finish = max(acc["dates"])
                else:
                    actual_finish = None
            else:
                actual_finish = None
                if finishes:
                    conflicts.append(
                        "finish asserted, but the evidence accounts for only "
                        f"{pct:.1f}% of the node's planned quantity "
                        f"({rec.planned_qty:g} {rec.uom}) - Actual Finish "
                        "withheld, scope is partial: "
                        + "; ".join(a.describe() for a in finishes)
                    )

            out.append(RollupResult(
                activity_id=aid,
                n_events=len(acc["texts"]),
                planned_qty=rec.planned_qty,
                installed_qty=round(acc["installed"], 3),
                uom=rec.uom,
                percent_complete=round(pct, 1),
                actual_start=actual_start,
                actual_finish=actual_finish,
                is_complete=is_complete,
                event_texts=list(acc["texts"]),
                notes=acc["notes"],
                start_assertions=starts,
                finish_assertions=finishes,
                conflicts=conflicts,
            ))
        out.sort(key=lambda r: (-r.n_events, r.activity_id))
        return out


def _describe_conflicts(
    starts: list[DateAssertion], finishes: list[DateAssertion]
) -> list[str]:
    """Record, rather than silently resolve, disagreements between sources.

    Earliest-start-wins and latest-finish-wins still decide what gets
    written, but a planner has to be able to see that two sources disagreed
    and which one the surviving date came from.
    """
    conflicts: list[str] = []
    for label, group in (("actual_start", starts), ("actual_finish", finishes)):
        distinct = {a.value for a in group}
        if len(distinct) <= 1:
            continue
        chosen = min(distinct) if label == "actual_start" else max(distinct)
        conflicts.append(
            f"{label}: {len(distinct)} sources disagree - "
            + "; ".join(a.describe() for a in group)
            + f" - applied {chosen.isoformat()}"
        )
    return conflicts


def _qty_swallowed_by_tag(qty: float, tags: list[str]) -> bool:
    """True when a 'quantity' is really part of a tag (e.g. 'P-1001 flange
    management' → 1001 flange). The quantity regex in the prepass can catch
    tag digits; the matcher must not write them into the schedule."""
    if not tags:
        return False
    digits = str(int(qty)) if float(qty).is_integer() else str(qty)
    return any(digits in t for t in tags)

