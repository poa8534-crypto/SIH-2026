"""Schedule index: loads the baseline schedule and precomputes every
lookup structure the retrieval + feature stages need.

Reuses `extraction.prepass.extract_tags` so tag extraction logic is defined
exactly once in the codebase.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from rank_bm25 import BM25Okapi

from extraction.prepass import extract_tags as prepass_extract_tags

from .providers import (
    BaselineVersion,
    JsonScheduleProvider,
    ScheduleProvider,
    normalize_activity,
    normalize_wbs_path,
    parse_predecessors,
)
from .textutils import parse_tag, tag_variants, tokenize


@dataclass
class ActivityRecord:
    activity_id: str
    description: str
    detail: str
    discipline: str
    tags: list[str] = field(default_factory=list)      # raw tag strings
    tag_keys: list[dict] = field(default_factory=list)  # parsed (size, line, spec)
    planned_start: date | None = None
    planned_finish: date | None = None
    planned_qty: float = 0.0
    uom: str = ""
    # Predecessor ACTIVITY IDS. Kept as bare ids because every ranking
    # consumer (features._predecessor_plausibility) asks only "did this
    # finish?"; the relationship type and lag live in `predecessor_links`
    # alongside, so neither consumer has to know about the other's shape.
    predecessors: list[str] = field(default_factory=list)
    predecessor_links: list[dict] = field(default_factory=list)
    # Present in the v2 baseline, absent in v1. None means "the source did not
    # say", never a guess.
    wbs_path: str = ""
    wbs_level: int | None = None
    calendar: str | None = None
    tokens: list[str] = field(default_factory=list)
    doc: str = ""                                       # description + detail (+ tag) for embeddings

    @property
    def line_keys(self) -> set[str]:
        return {t["line"] for t in self.tag_keys if t["line"]}


class ScheduleIndex:
    """In-memory index over the L5/L6 activities of one baseline.

    `baseline` names which schedule these records came from, so any metric
    computed downstream can state it. It is None only when the index was built
    from a list of dicts with no source behind it (tests, synthetic schedules).
    """

    def __init__(
        self,
        activities: list[dict],
        baseline: BaselineVersion | None = None,
    ):
        self.records: list[ActivityRecord] = []
        self.baseline = baseline
        self._build(activities)

        # ── Tag indexes ──
        # line key ("p-1001", "tk-1") → record indices
        self.line_index: dict[str, list[int]] = {}
        # full key (line, size, spec) → record indices (near-decisive match)
        self.full_key_index: dict[tuple, list[int]] = {}

        for i, rec in enumerate(self.records):
            for key in rec.tag_keys:
                if key["line"]:
                    self.line_index.setdefault(key["line"], []).append(i)
                if key["line"] and key["size"] is not None:
                    self.full_key_index.setdefault(
                        (key["line"], key["size"]), []
                    ).append(i)

        # ── BM25 over tokenised descriptions ──
        # Built ONCE here, at index construction, never per query. `ensure_bm25`
        # rebuilds it only when a retriever asks for different (k1, b).
        self._bm25_params: tuple[float, float] | None = None
        self.bm25 = None
        self._bm25_matrix = None
        self._bm25_vocab: dict[str, int] = {}
        self.ensure_bm25()

        # ── Predecessor graph ──
        self.by_id: dict[str, ActivityRecord] = {
            rec.activity_id: rec for rec in self.records
        }
        # Position of each activity in `records`, so a retrieval channel that
        # knows an activity_id (the alias lexicon) can reach its row without
        # scanning. O(1), like every other lookup on this class.
        self._pos_by_id: dict[str, int] = {
            rec.activity_id: i for i, rec in enumerate(self.records)
        }

        # ── Character n-gram matrix (built on demand: only the n-gram
        # retrieval channel needs it, and it is not on by default) ──
        self._ngram_vectorizer = None
        self._ngram_matrix = None
        self._ngram_params: tuple[int, int] | None = None

        # ── Column arrays for vectorised feature scoring ──
        self._build_feature_columns()

    # ── Construction ─────────────────────────────────────────────────────────

    @classmethod
    def from_json(cls, path: str | Path) -> "ScheduleIndex":
        """Load a JSON baseline. Both shipped baselines load through the same
        provider, so a v1 dotted `wbs_path` and a v2 list of WBS names arrive
        here identically normalised."""
        return cls.from_provider(JsonScheduleProvider(path))

    @classmethod
    def from_provider(cls, provider: ScheduleProvider) -> "ScheduleIndex":
        return cls(provider.read_activities(), baseline=provider.read_baseline())

    def _build(self, activities: list[dict]) -> None:
        for act in activities:
            # Tolerate a raw dict from a caller that bypassed the provider
            # (tests, and any consumer holding a hand-built schedule).
            if "predecessors" in act and not isinstance(
                act.get("predecessors") or [], list
            ):
                act = normalize_activity(act)
            elif act.get("wbs_path") is not None and not isinstance(
                act.get("wbs_path"), str
            ):
                act = normalize_activity(act)
            desc = act.get("description", "") or ""
            detail = act.get("detail", "") or ""
            raw_tags: list[str] = []
            if act.get("tag"):
                raw_tags.append(act["tag"])
            # Reuse the extractor's tag regex on description + detail —
            # schedule descriptions carry line numbers like 24"-P-1001-A1A.
            for t in prepass_extract_tags(f"{desc} {detail}"):
                if t not in raw_tags:
                    raw_tags.append(t)

            # Tag parsing (with slash-variant expansion, e.g. P-101A/B)
            tag_keys: list[dict] = []
            for t in raw_tags:
                for v in tag_variants(t):
                    k = parse_tag(v)
                    if k not in tag_keys:
                        tag_keys.append(k)

            ps = _safe_date(act.get("planned_start"))
            pf = _safe_date(act.get("planned_finish"))
            rec = ActivityRecord(
                activity_id=act["activity_id"],
                description=desc,
                detail=detail,
                discipline=(act.get("discipline") or "unknown").lower(),
                tags=raw_tags,
                tag_keys=tag_keys,
                planned_start=ps,
                planned_finish=pf,
                planned_qty=float(act.get("planned_qty") or 0.0),
                uom=(act.get("uom") or "").lower(),
                predecessors=[
                    p.activity_id for p in parse_predecessors(act.get("predecessors"))
                ],
                predecessor_links=[
                    p.as_dict() for p in parse_predecessors(act.get("predecessors"))
                ],
                wbs_path=normalize_wbs_path(act.get("wbs_path")),
                wbs_level=act.get("wbs_level"),
                calendar=act.get("calendar"),
                doc=f"{desc}. {detail}",
            )
            rec.tokens = tokenize(f"{desc} {detail} {' '.join(raw_tags)}")
            self.records.append(rec)

    # ── Startup-built structures ─────────────────────────────────────────────

    def ensure_bm25(self, k1: float = 1.5, b: float = 0.75) -> None:
        """Build the BM25 index for these (k1, b), reusing it if unchanged.

        rank_bm25 bakes k1 and b into the fitted object, so tuning them means
        refitting. That refit belongs at startup — this is the only place it
        happens, and a retriever asking for parameters already in force is a
        no-op rather than a rebuild.
        """
        if self._bm25_params == (k1, b) and self.bm25 is not None:
            return
        corpus = [rec.tokens for rec in self.records]
        self.bm25 = BM25Okapi(corpus, k1=k1, b=b) if corpus and any(corpus) else None
        self._bm25_params = (k1, b)
        self._build_bm25_matrix(k1, b)

    def _build_bm25_matrix(self, k1: float, b: float) -> None:
        """Precompute the term x document BM25 score matrix.

        Every factor in the Okapi score

            idf(t) * tf(t,d) * (k1+1) / (tf(t,d) + k1 * (1 - b + b*|d|/avgdl))

        depends only on (term, document) — never on the query. rank_bm25
        recomputes it inside `get_scores` on every call, which made BM25 11%
        of batched per-event latency for a quantity that had not changed since
        startup. Precomputed here, a query score is a row gather and a sum.

        The IDF is rank_bm25's own (BM25Okapi's floor-corrected variant), read
        off the fitted object rather than reimplemented, so this matrix and
        `self.bm25.get_scores` cannot disagree about what BM25 means.
        """
        import numpy as np

        self._bm25_matrix = None
        self._bm25_vocab: dict[str, int] = {}
        if self.bm25 is None or not self.records:
            return

        n_docs = len(self.records)
        vocab = sorted({t for rec in self.records for t in rec.tokens})
        if not vocab:
            return
        pos = {t: i for i, t in enumerate(vocab)}
        avgdl = self.bm25.avgdl or 1.0
        doc_len = np.asarray(self.bm25.doc_len, dtype=np.float64)
        denom_len = k1 * (1.0 - b + b * doc_len / avgdl)      # (n_docs,)

        M = np.zeros((len(vocab), n_docs), dtype=np.float64)
        for d, freqs in enumerate(self.bm25.doc_freqs):
            for term, tf in freqs.items():
                j = pos.get(term)
                if j is None:
                    continue
                M[j, d] = tf * (k1 + 1.0) / (tf + denom_len[d])
        idf = np.array([self.bm25.idf.get(t, 0.0) for t in vocab], dtype=np.float64)
        self._bm25_matrix = M * idf[:, None]
        self._bm25_vocab = pos

    def bm25_scores(self, query_tokens: list[str]):
        """BM25 scores for one query against every activity.

        Numerically identical to `self.bm25.get_scores(query_tokens)`; see
        matching/test_equivalence.py, which asserts that over the corpus.
        """
        import numpy as np

        if self._bm25_matrix is None:
            return None
        rows = [self._bm25_vocab[t] for t in query_tokens if t in self._bm25_vocab]
        if not rows:
            return np.zeros(len(self.records))
        return self._bm25_matrix[rows].sum(axis=0)

    def ensure_ngram(self, ngram_min: int = 3, ngram_max: int = 5) -> None:
        """Fit the character n-gram TF-IDF matrix over the activity docs.

        `char_wb` keeps n-grams inside word boundaries, which is what makes
        this a spelling-error channel rather than a bag of cross-word noise.
        The matrix is L2-normalised by TfidfVectorizer, so a sparse dot
        product against a normalised query IS the cosine.
        """
        if self._ngram_params == (ngram_min, ngram_max) and self._ngram_matrix is not None:
            return
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
        except ImportError:      # scikit-learn absent → channel simply off
            self._ngram_vectorizer = None
            self._ngram_matrix = None
            self._ngram_params = (ngram_min, ngram_max)
            return
        docs = [f"{r.doc} {' '.join(r.tags)}" for r in self.records]
        vec = TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(ngram_min, ngram_max),
            lowercase=True,
            min_df=1,
            sublinear_tf=True,
        )
        self._ngram_matrix = vec.fit_transform(docs)
        self._ngram_vectorizer = vec
        self._ngram_params = (ngram_min, ngram_max)

    def ngram_similarities(self, text: str):
        """Cosine of `text` against every activity, or None when the channel
        was never built (scikit-learn missing, or ensure_ngram not called)."""
        if self._ngram_vectorizer is None or self._ngram_matrix is None:
            return None
        q = self._ngram_vectorizer.transform([text])
        if q.nnz == 0:
            return None
        return (self._ngram_matrix @ q.T).toarray().ravel()

    def _build_feature_columns(self) -> None:
        """Per-activity column arrays, so feature scoring is a matrix op.

        Everything here is a property of the SCHEDULE alone — it does not
        depend on the event — so it is computed once at startup instead of
        once per (event, candidate) pair inside a Python loop.
        """
        import numpy as np

        n = len(self.records)
        self.col_planned_lo = np.full(n, np.nan)   # planned_start ordinal
        self.col_planned_hi = np.full(n, np.nan)   # planned_finish ordinal
        self.col_planned_qty = np.zeros(n)
        self.disciplines = [r.discipline for r in self.records]
        self.uoms = [r.uom for r in self.records]

        for i, r in enumerate(self.records):
            if r.planned_start is not None:
                self.col_planned_lo[i] = r.planned_start.toordinal()
            if r.planned_finish is not None:
                self.col_planned_hi[i] = r.planned_finish.toordinal()
            self.col_planned_qty[i] = r.planned_qty

        # Predecessor windows as a padded (n_activities x max_preds) matrix.
        # Ragged predecessor lists are why this stage was a nested Python
        # loop; padding with NaN makes the whole thing one masked reduction.
        widths = [len(r.predecessors) for r in self.records] or [0]
        w = max(max(widths), 1)
        self.col_pred_start = np.full((n, w), np.nan)
        self.col_pred_finish = np.full((n, w), np.nan)
        self.col_has_pred = np.zeros(n, dtype=bool)
        for i, r in enumerate(self.records):
            slot = 0
            for pid in r.predecessors:
                pred = self.by_id.get(str(pid).strip())
                if pred is None or pred.planned_finish is None:
                    continue
                pf = pred.planned_finish.toordinal()
                ps = pred.planned_start.toordinal() if pred.planned_start else pf
                self.col_pred_finish[i, slot] = pf
                self.col_pred_start[i, slot] = ps
                slot += 1
            self.col_has_pred[i] = slot > 0

    # ── Lookup helpers ───────────────────────────────────────────────────────

    def index_of(self, activity_id: str) -> int | None:
        """Row position of an activity id, or None. O(1)."""
        return self._pos_by_id.get(activity_id)

    def resolve_id(self, activity_id: str) -> str | None:
        """Resolve a (possibly shortened) activity id to a schedule id.

        Handles ground-truth ids like 'PIP-1024' → 'PIP-RCK-1024' by unique
        numeric-suffix match.
        """
        aid = (activity_id or "").strip()
        if not aid or aid == "NO_MATCH":
            return None
        if aid in self.by_id:
            return aid
        suffix = aid.split("-")[-1]
        if not suffix.isdigit():
            return None
        matches = [r.activity_id for r in self.records if r.activity_id.endswith(f"-{suffix}")]
        return matches[0] if len(matches) == 1 else None

    def precomputed_texts(self) -> list[str]:
        return [rec.doc for rec in self.records]


def _safe_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None
