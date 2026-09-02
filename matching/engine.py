"""The matching engine core: retrieval → feature scoring → calibrated decision.

Decision rule (precision-first — a wrong auto-link corrupts the schedule,
a review-queue item only costs a planner ~10 seconds):

  NEW_ACTIVITY   top-1 score < tau_low, or the abstention model says no
                 correct activity exists
  AUTO_LINK      top-1 >= tau_high AND margin(top1, top2) >= margin_min
                 AND no discipline conflict on the winner
  REVIEW         everything in between, incl. high score but ambiguous margin

Two execution paths, one set of numbers:

  `match_event`   one event; used by the interactive server path
  `match_events`  a whole file; encodes every mention in ONE forward pass

They must agree exactly, so `match_event` IS `match_events` with a batch of
one rather than a second implementation of it. `matching/test_equivalence.py`
asserts that, because a batch path that quietly disagrees with the interactive
path would make every measured number describe something the demo does not do.

The `matching` entry point consumes extraction.models.ExtractedEvent objects
and uses the schedule loaded from dataset/baseline_schedule.json.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from .config import DEFAULT, EngineConfig
from .features import (
    blend_matrix,
    blend_with_line_lock,
    matrix_to_vectors,
    score_pool,
)
from .models import Decision, LinkCandidate, LinkDecision, Thresholds
from .retrieval import HybridRetriever
from .schedule_index import ScheduleIndex

logger = logging.getLogger(__name__)


class MatchingEngine:
    def __init__(
        self,
        schedule_path: str | Path,
        thresholds: Thresholds | None = None,
        embedder=None,
        config: EngineConfig | None = None,
        index: ScheduleIndex | None = None,
    ):
        self.config = config or DEFAULT
        self.index = index if index is not None else ScheduleIndex.from_json(schedule_path)
        self.retriever = HybridRetriever(
            self.index,
            embedder=embedder,
            config=self.config.retrieval,
            alias_lexicon=self.config.alias_lexicon,
        )
        self.thresholds = thresholds or Thresholds()
        self._cross_encoder = None
        self._cross_encoder_failed = False
        # In-memory objects win over paths: an experiment passes the model it
        # just fitted, production passes a path to the one it shipped.
        self._ranker = self.config.ranker or _load_pickle(
            self.config.ranker_path, "ranker")
        self._abstainer = self.config.abstainer or _load_pickle(
            self.config.abstention_path, "abstention model")
        self._calibrator = self.config.calibrator or _load_pickle(
            self.config.calibrator_path, "calibrator")
        # Which activities own a line number no other activity shares. Read by
        # the near-decisive tag rule; computed once, not per candidate.
        self._unique_line_flags = [
            any(len(self.index.line_index.get(line, ())) == 1 for line in rec.line_keys)
            for rec in self.index.records
        ]

    # ── Public API ───────────────────────────────────────────────────────────

    def match_event(self, event, event_index: int = 0) -> LinkDecision:
        """Resolve one ExtractedEvent against the schedule.

        Routed through the batch path with a batch of one, rather than kept as
        a parallel implementation. A matrix-vector product and a matrix-matrix
        product accumulate in different orders, so two separate code paths
        drifted apart in the sixth decimal of the cosine — never enough to
        change a decision, and exactly the kind of difference that makes an
        eval number describe something other than what the server runs. One
        path cannot drift from itself.
        """
        cand_ids, info = self.retriever.retrieve_many(
            [event.raw_text], [event.tags], [_discipline_of(event)]
        )[0]
        return self._decide(event, event_index, cand_ids, info)

    def match_events(self, events) -> list[LinkDecision]:
        """Resolve a whole file's mentions, encoding them in one forward pass."""
        events = list(events)
        if not events:
            return []
        retrieved = self.retriever.retrieve_many(
            [e.raw_text for e in events],
            [e.tags for e in events],
            [_discipline_of(e) for e in events],
        )
        return [
            self._decide(e, i, cand_ids, info)
            for i, (e, (cand_ids, info)) in enumerate(zip(events, retrieved))
        ]

    # ── Scoring + decision ───────────────────────────────────────────────────

    def _decide(self, event, event_index, cand_ids, info) -> LinkDecision:
        scored = self._score(event, cand_ids, info)
        outcome, chosen, margin, rationale = decide_outcome(
            scored, self.thresholds, abstainer=self._abstainer
        )
        confidence = scored[0].final_score if scored else 0.0
        if self._calibrator is not None and scored:
            confidence = self._calibrated(scored)
        return LinkDecision(
            event_index=event_index,
            raw_text=event.raw_text,
            source_file=event.provenance.source_file if event.provenance else "",
            thresholds=self.thresholds,
            outcome=outcome,
            chosen_activity_id=chosen,
            confidence=confidence,
            margin=margin,
            rationale=rationale,
            candidates=scored,
        )

    def _score(self, event, cand_ids, info) -> list[LinkCandidate]:
        """Score the whole candidate pool as a matrix, then wrap the result in
        the per-candidate audit contract."""
        if not cand_ids:
            return []
        extra = self.config.extra_features
        dense_cos = [
            info[i].get("dense_cos") if "DENSE" in info[i]["sources"] else None
            for i in cand_ids
        ]
        # Controlled terminology expansion (off by default): the fuzzy feature
        # reads event.raw_text, so when expansion is on it must read the same
        # canonicalised query the retrieval channels saw. A copy is scored —
        # the decision record keeps the ORIGINAL raw_text untouched.
        score_event = event
        if self.config.retrieval.term_expansion and event.raw_text:
            from . import terminology
            score_event = event.model_copy(
                update={"raw_text": terminology.canonicalise(event.raw_text)}
            )
        M, _present, locked = score_pool(
            self.index, score_event, cand_ids, event.reported_date, dense_cos, extra=extra
        )
        if self._ranker is not None:
            scores = self._ranker.score(M)
        else:
            scores = blend_matrix(M, extra=extra)

        # Near-decisive tag rule, applied per candidate exactly as before.
        unique = np.array([self._unique_line_flags[i] for i in cand_ids])
        fvs = matrix_to_vectors(M, locked, extra=extra)
        final = [
            blend_with_line_lock(float(scores[r]), fvs[r], bool(unique[r]))
            for r in range(len(cand_ids))
        ]

        if self.config.cross_encoder:
            final = self._cross_encode(event.raw_text, cand_ids, final)

        scored = [
            LinkCandidate(
                activity_id=self.index.records[i].activity_id,
                retrieval_sources=info[i]["sources"],
                rrf_score=round(info[i]["rrf"], 6),
                features=fvs[r],
                final_score=final[r],
            )
            for r, i in enumerate(cand_ids)
        ]
        scored.sort(key=lambda c: (-c.final_score, c.activity_id))
        for rank, c in enumerate(scored, 1):
            c.rank = rank
        return scored

    # ── Cross-encoder rerank (optional, degrading) ───────────────────────────

    def _load_cross_encoder(self):
        if self._cross_encoder is not None or self._cross_encoder_failed:
            return self._cross_encoder
        try:
            from sentence_transformers import CrossEncoder
            self._cross_encoder = CrossEncoder(
                self.config.cross_encoder_model, local_files_only=True
            )
        except Exception as e:
            # Same contract as the dense retriever: an uncached model is a
            # missing OPTION, never an outage. The hand-scored order stands.
            logger.warning(
                "cross-encoder %s unavailable (%s) — keeping the feature-scored "
                "order", self.config.cross_encoder_model, e,
            )
            self._cross_encoder_failed = True
        return self._cross_encoder

    def _cross_encode(self, text: str, cand_ids: list[int], final: list[float]) -> list[float]:
        model = self._load_cross_encoder()
        if model is None:
            return final
        n = min(self.config.cross_encoder_top_n, len(cand_ids))
        order = sorted(range(len(cand_ids)), key=lambda r: -final[r])[:n]
        pairs = [
            [text, f"{self.index.records[cand_ids[r]].description} "
                   f"{self.index.records[cand_ids[r]].detail}".strip()]
            for r in order
        ]
        raw = model.predict(pairs, show_progress_bar=False)
        # ms-marco cross-encoders emit an unbounded logit; a sigmoid puts it
        # on the same [0, 1] scale as every feature score, so the blend below
        # is a blend and not an argmax by magnitude.
        ce = 1.0 / (1.0 + np.exp(-np.asarray(raw, dtype=np.float64)))
        w = self.config.cross_encoder_weight
        out = list(final)
        for slot, r in enumerate(order):
            out[r] = round((1.0 - w) * final[r] + w * float(ce[slot]), 6)
        return out

    # ── Calibration ──────────────────────────────────────────────────────────

    def _calibrated(self, scored: list[LinkCandidate]) -> float:
        feats = _abstention_features(scored)
        try:
            return float(self._calibrator.predict_proba(feats))
        except Exception:
            return scored[0].final_score

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _dense_cos(self, idx: int, info: dict[int, dict]) -> float | None:
        """Cosine similarity of the dense channel for this candidate (None if
        the candidate did not surface in the dense channel)."""
        if "DENSE" not in info[idx]["sources"]:
            return None
        return info[idx].get("dense_cos")

    def _unique_line(self, idx: int) -> bool:
        return self._unique_line_flags[idx]


def _discipline_of(event) -> str | None:
    d = getattr(event, "discipline", None)
    return getattr(d, "value", None)


def _load_pickle(path, what: str):
    if path is None:
        return None
    try:
        import joblib
        return joblib.load(path)
    except Exception as e:
        logger.warning("could not load %s from %s (%s) — falling back to the "
                       "hand-set behaviour", what, path, e)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Decision
# ══════════════════════════════════════════════════════════════════════════════

def abstention_features(scored: list[LinkCandidate]) -> np.ndarray:
    """The evidence an abstention model reads: is there ANY correct activity?

    Deliberately NOT the top-1 score alone. A score is a statement about one
    candidate; whether the right answer is in the pool at all is a statement
    about the SHAPE of the pool — how far ahead the leader is, how flat the
    tail is, whether a tag resolved. Those are different questions, and
    inferring the second from a threshold on the first is why NO_MATCH
    rejection is the weakest metric the engine has.
    """
    return _abstention_features(scored)


def _abstention_features(scored: list[LinkCandidate]) -> np.ndarray:
    if not scored:
        return np.zeros((1, 9))
    s = np.array([c.final_score for c in scored], dtype=np.float64)
    top1 = float(s[0])
    top2 = float(s[1]) if len(s) > 1 else 0.0
    top5 = s[:5]
    # Entropy of the top-5 scores read as a distribution: a flat top-5 means
    # the pool has no opinion, which is exactly the NO_MATCH signature.
    p = top5 / top5.sum() if top5.sum() > 0 else np.full(len(top5), 1.0 / len(top5))
    entropy = float(-(p * np.log(p + 1e-12)).sum())
    f = scored[0].features
    has_tag = 1.0 if f.tag_overlap is not None else 0.0
    tag_resolved = 1.0 if (f.tag_overlap or 0.0) >= 0.85 else 0.0
    disc = f.discipline_agreement
    disc_agree = 0.5 if disc is None else float(disc)
    return np.array([[
        top1,
        top1 - top2,
        entropy,
        has_tag,
        tag_resolved,
        disc_agree,
        float(s.mean()),
        float(s.std()),
        float(len(s)),
    ]])


def decide_outcome(
    scored: list[LinkCandidate],
    t: Thresholds,
    abstainer=None,
):
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

    # An explicit abstention model, when one is fitted, replaces the "low
    # score means no match" inference. It can only ever REFUSE — it never
    # promotes anything to AUTO_LINK — so a miscalibrated abstainer costs
    # coverage and can never cost auto-link precision.
    if abstainer is not None:
        try:
            if abstainer.should_abstain(_abstention_features(scored)):
                return (Decision.NEW_ACTIVITY, None, margin,
                        ["abstention_model_no_match"] + rationale[:2])
        except Exception:
            pass

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
    if f.uom_compatibility == 1.0:
        r.append("uom_compatible")
    if f.uom_compatibility == 0.0:
        r.append("uom_conflict")
    if f.quantity_proximity is not None and f.quantity_proximity >= 0.9:
        r.append("quantity_within_planned")
    if f.area_match == 1.0:
        r.append("area_match")
    if "ALIAS" in c.retrieval_sources:
        r.append("planner_confirmed_alias")
    return r or ["weak_evidence"]


# ══════════════════════════════════════════════════════════════════════════════
# Granularity handling: many-to-one rollup
# ══════════════════════════════════════════════════════════════════════════════

from extraction.models import DateBasis  # noqa: E402
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

        # A quantity with no unit cannot be measured against a planned
        # quantity. The regex pre-pass always captures a unit alongside the
        # number, so this filters LLM-supplied quantities: a model reading
        # "All 12 pockets grouted" returns 12 with no uom, and against a
        # 48 m3 node that would silently register 25% complete. The value
        # stays on the event for display; it just cannot drive progress.
        if qty is not None and not uom_ev:
            acc["notes"].append(
                f"unitless qty {qty:g} excluded from percent-complete "
                f"(planned in {rec.uom or 'unknown units'})"
            )
            qty = None

        if qty is not None and rec.planned_qty > 0:
            acc["installed"] += qty
            acc["has_progress"] = True
            acc["notes"].append(f"+{qty:g} {uom_act or uom_ev or '?'}")
        elif qty is not None and rec.planned_qty <= 0:
            # A quantity with nothing to measure it against. installed/planned
            # would be qty/0, so no percentage can be derived from it; the
            # quantity is recorded as progress and the node stays short of
            # complete until a source says otherwise.
            acc["has_progress"] = True
            acc["notes"].append(
                f"{qty:g} {uom_ev or uom_act or '?'} reported against a node "
                f"with no planned quantity - percent complete not derived"
            )
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
            elif rec.uom:
                # A node measured in a unit but carrying planned_qty 0 has a
                # MISSING planned quantity, not a zero one. Treating it as a
                # milestone is how PIP-PCD-1053 reported "0/0 nos, 100.0%":
                # a completion claim on a node whose scope nobody quantified.
                # Record the claim, derive no percentage from it.
                acc["has_progress"] = True
                acc["notes"].append(
                    f"completion asserted, but the node has no planned "
                    f"quantity (0 {rec.uom}) - percent complete not derived"
                )
            else:
                # Genuinely unquantified node (a milestone: no planned
                # quantity AND no unit of measure). A completion claim is all
                # the evidence there is or ever will be.
                acc["pct_events"].append(100.0)
                acc["has_progress"] = True
                acc["notes"].append("completed (unquantified node)")
        else:
            acc["notes"].append("no measurable progress signal")

        prov = getattr(event, "provenance", None)
        src_file = getattr(prov, "source_file", "") or decision.source_file or ""
        src_span = getattr(prov, "source_span", "") or decision.raw_text or ""
        src_line = getattr(prov, "source_line", None)
        src_row = getattr(prov, "source_row", None)

        if getattr(event, "asserted_start", None):
            acc["starts"].append(DateAssertion(
                field="actual_start", value=event.asserted_start,
                basis=_basis_of(event, "asserted_start_basis"),
                source_file=src_file, source_span=src_span,
                source_line=src_line, source_row=src_row,
            ))
        if getattr(event, "asserted_finish", None):
            acc["finishes"].append(DateAssertion(
                field="actual_finish", value=event.asserted_finish,
                basis=_basis_of(event, "asserted_finish_basis"),
                source_file=src_file, source_span=src_span,
                source_line=src_line, source_row=src_row,
            ))

        if event.reported_date:
            # The bare report date is the weakest date evidence there is: it
            # says when the line was written, not when work started or
            # finished. It is kept with its basis so the fallback below can
            # tell a date the line actually carried from the report header's
            # own date.
            acc["dates"].append(DateAssertion(
                field="reported_date", value=event.reported_date,
                basis=_basis_of(event, "reported_date_basis"),
                source_file=src_file, source_span=src_span,
                source_line=src_line, source_row=src_row,
            ))
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
            review_reasons: list[str] = []

            # Earliest start wins, latest finish wins. An explicit assertion
            # always beats the bare reported date, which stays a fallback for
            # events that made no start/finish claim of their own.
            if starts:
                actual_start = min(a.value for a in starts)
                actual_start_basis = _basis_for(starts, actual_start)
            elif acc["dates"] and pct > 0:
                earliest = min(a.value for a in acc["dates"])
                actual_start = earliest
                actual_start_basis = _basis_for(acc["dates"], earliest)
            else:
                actual_start = None
                actual_start_basis = None

            # Actual Finish only when the node is actually complete. A
            # withheld finish assertion is reported, not applied.
            withheld_finish = None
            withheld_evidence: list[DateAssertion] = []
            if is_complete:
                # A finish date is written only when a source said WHEN the
                # work finished. A line that claimed completion but named no
                # date was handed the report header's own date to carry the
                # claim; writing that would stamp every completion in a report
                # with the day the report was typed, which is how eleven
                # activities came to share one Actual Finish. Those go to the
                # planner instead of onto the schedule.
                dated_finishes = [a for a in finishes if not a.is_defaulted]
                dated_reports = [a for a in acc["dates"] if not a.is_defaulted]
                if dated_finishes:
                    actual_finish = max(a.value for a in dated_finishes)
                    actual_finish_basis = _basis_for(dated_finishes, actual_finish)
                elif dated_reports:
                    # No finish claim of its own, but the contributing lines
                    # carried real dates of their own. The latest of them is
                    # the last day work was reported against the node.
                    actual_finish = max(a.value for a in dated_reports)
                    actual_finish_basis = _basis_for(dated_reports, actual_finish)
                else:
                    actual_finish = None
                    actual_finish_basis = None
                    withheld_evidence = [
                        a for a in finishes + acc["dates"] if a.is_defaulted
                    ]
                    if withheld_evidence:
                        withheld_finish = max(a.value for a in withheld_evidence)
                        review_reasons.append(
                            "node is 100% complete but no source named a "
                            "finish date; the only candidate "
                            f"({withheld_finish.isoformat()}) was defaulted to "
                            "the report date - Actual Finish withheld, planner "
                            "confirmation required: "
                            + "; ".join(a.describe() for a in withheld_evidence)
                        )
            else:
                actual_finish = None
                actual_finish_basis = None
                if finishes:
                    conflicts.append(
                        "finish asserted, but the evidence accounts for only "
                        f"{pct:.1f}% of the node's planned quantity "
                        f"({rec.planned_qty:g} {rec.uom}) - Actual Finish "
                        "withheld, scope is partial: "
                        + "; ".join(a.describe() for a in finishes)
                    )

            # Invariant: a zero-duration activity must never be manufactured
            # out of two dates that were both defaulted to the same report
            # date. The finish gate above already prevents it; this states the
            # rule at the point of the write rather than leaving it implicit
            # in the branch structure above.
            if (
                actual_finish is not None
                and actual_start == actual_finish
                and actual_start_basis is DateBasis.DEFAULTED_TO_REPORT_DATE
                and actual_finish_basis is DateBasis.DEFAULTED_TO_REPORT_DATE
            ):
                withheld_finish = actual_finish
                actual_finish = None
                actual_finish_basis = None
                review_reasons.append(
                    "actual_start and actual_finish were both defaulted to "
                    f"{withheld_finish.isoformat()} - Actual Finish withheld "
                    "rather than recording a zero-duration activity"
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
                actual_start_basis=actual_start_basis,
                actual_finish_basis=actual_finish_basis,
                is_complete=is_complete,
                withheld_finish=withheld_finish,
                withheld_finish_assertions=withheld_evidence,
                review_reasons=review_reasons,
                event_texts=list(acc["texts"]),
                notes=acc["notes"],
                start_assertions=starts,
                finish_assertions=finishes,
                conflicts=conflicts,
            ))
        out.sort(key=lambda r: (-r.n_events, r.activity_id))
        return out


def _basis_of(event, attr: str) -> DateBasis:
    """The basis an event recorded for one of its dates.

    Defaults to EXPLICIT for events built without bases - hand-constructed
    events in tests, and any caller predating the field. Every path in
    extraction that substitutes a report date sets the basis explicitly, so
    the permissive default is only ever reached for a date that came from a
    source of its own.
    """
    value = getattr(event, attr, None)
    return value if isinstance(value, DateBasis) else DateBasis.EXPLICIT


def _basis_for(assertions: list[DateAssertion], value) -> DateBasis | None:
    """The basis of the assertion that produced the value actually written."""
    for a in assertions:
        if a.value == value:
            return a.basis
    return None


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

