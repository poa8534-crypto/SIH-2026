"""Hybrid candidate retrieval: exact tag + BM25 + dense + char n-gram + alias
lexicon, fused with reciprocal rank fusion. Recall-oriented: cast wide,
top-k = 20.

Dense retrieval uses a local sentence-transformers model from the all-MiniLM
class. The model is loaded with local_files_only=True first so the pipeline
runs offline once the model is cached; a deterministic hashed-ngram fallback
keeps the module runnable even without the model on disk.

Three properties this module is responsible for holding:

  * ONE model per process. `shared_embedder()` returns a module-level
    singleton, so ten engines (or ten requests) share one set of weights
    rather than paying a load and ~90 MB each.
  * ONE forward pass per FILE, not per event. `retrieve_many` encodes every
    query in a batch; encoding one 12-word string at a time was 86% of warm
    per-event latency, and almost all of that was per-call overhead.
  * NO per-query index construction. BM25, the tag map and the n-gram matrix
    are built once by ScheduleIndex and only read here.
"""

from __future__ import annotations

import hashlib
import logging
import re
import threading

import numpy as np

from . import embedcache
from .config import DEFAULT, RetrievalConfig
from .schedule_index import ScheduleIndex
from .textutils import (
    alias_key,
    extract_size_mentions,
    parse_tag,
    tag_variants,
    tokenize,
)

logger = logging.getLogger(__name__)

RRF_K = 60          # standard RRF constant (default; see RetrievalConfig.rrf_k)
TOP_K = 20          # candidate pool size fed to feature scoring

# Channel weights in the RRF fusion. The tag channel dominates: a matching
# line number is near-decisive evidence and must anchor the candidate set.
# Kept as a module constant for callers that read it; the live values come
# from RetrievalConfig.
CHANNEL_WEIGHTS = {
    "TAG": 1.0,
    "BM25": 0.7,
    "DENSE": 0.7,
}


# ── Dense embedder ───────────────────────────────────────────────────────────

class MiniLMEmbedder:
    """sentence-transformers all-MiniLM-L6-v2, offline-first.

    Loading is lazy: constructing the embedder imports nothing and touches no
    disk. The first `encode` pays the load; every later call, and every other
    holder of this instance, is free.
    """

    MODEL_NAME = "all-MiniLM-L6-v2"

    def __init__(self):
        self._model = None
        self._failed = False
        self._lock = threading.Lock()

    def _load(self):
        if self._model is not None or self._failed:
            return
        with self._lock:
            if self._model is not None or self._failed:
                return          # another thread won the race
            try:
                from sentence_transformers import SentenceTransformer
            except Exception as e:
                # Not just "package missing": a torch/numpy ABI mismatch raises
                # from inside transformers at import time. This import used to
                # sit outside the try, so any such failure escaped _load(),
                # propagated out of HybridRetriever.__init__, and turned
                # POST /ingest into a 500 — the exact outcome the hashing
                # fallback below exists to prevent. See D-103.
                logger.error(
                    "sentence-transformers unimportable (%s) — falling back to hashing embedder",
                    e,
                )
                self._failed = True
                return
            try:
                # Offline first — model must already be in the local HF cache.
                self._model = SentenceTransformer(self.MODEL_NAME, local_files_only=True)
            except Exception:
                logger.warning(
                    "MiniLM not cached locally; downloading once so future runs are offline"
                )
                try:
                    self._model = SentenceTransformer(self.MODEL_NAME)
                except Exception as e:  # fully offline machine without cached model
                    logger.error(
                        "Could not load %s: %s — falling back to hashing embedder",
                        self.MODEL_NAME, e,
                    )
                    self._failed = True

    @property
    def is_neural(self) -> bool:
        self._load()
        return self._model is not None

    @property
    def cache_name(self) -> str:
        """Identity of what this embedder produces, for the on-disk cache.

        The hashed fallback and the real model must never share a cache key —
        they produce different vectors from the same text.
        """
        self._load()
        return self.MODEL_NAME if self._model is not None else "hashed-ngram-384"

    def encode(self, texts: list[str]) -> np.ndarray:
        self._load()
        if not texts:
            return np.zeros((0, 384), dtype=np.float32)
        if self._model is None:
            return _hashed_embeddings(texts, dim=384)
        vecs = self._model.encode(
            texts, batch_size=64, show_progress_bar=False,
            normalize_embeddings=True, convert_to_numpy=True,
        )
        return np.asarray(vecs, dtype=np.float32)

    def encode_normalized(self, texts: list[str]) -> np.ndarray:
        """Encode and L2-normalise, so a dot product IS the cosine."""
        v = self.encode(texts)
        if v.shape[0] == 0:
            return v
        n = np.linalg.norm(v, axis=1, keepdims=True)
        n[n == 0] = 1.0
        return v / n

    def cosine_top(self, query: str, doc_matrix: np.ndarray, top_k: int) -> list[tuple[int, float]]:
        q = self.encode_normalized([query])[0]
        sims = doc_matrix @ q
        order = np.argsort(-sims)[:top_k]
        return [(int(i), float(sims[i])) for i in order]


_SHARED_EMBEDDER: MiniLMEmbedder | None = None
_SHARED_LOCK = threading.Lock()


def shared_embedder() -> MiniLMEmbedder:
    """The one embedder for this process.

    Every construction path that does not pass an explicit embedder routes
    here, so no code path can reload the model. `is_neural` and `encode` stay
    lazy, so importing this module remains free.
    """
    global _SHARED_EMBEDDER
    if _SHARED_EMBEDDER is None:
        with _SHARED_LOCK:
            if _SHARED_EMBEDDER is None:
                _SHARED_EMBEDDER = MiniLMEmbedder()
    return _SHARED_EMBEDDER


def _hashed_embeddings(texts: list[str], dim: int = 384) -> np.ndarray:
    """Deterministic hashed character-ngram embeddings (offline fallback)."""
    out = np.zeros((len(texts), dim), dtype=np.float32)
    for r, text in enumerate(texts):
        t = re.sub(r"\s+", " ", text.lower())
        for i in range(len(t) - 2):
            h = int(hashlib.md5(t[i:i + 3].encode()).hexdigest(), 16)
            out[r, h % dim] += 1.0
        n = np.linalg.norm(out[r])
        if n > 0:
            out[r] /= n
    return out


# ── Hybrid retriever + RRF ───────────────────────────────────────────────────

class HybridRetriever:
    def __init__(
        self,
        index: ScheduleIndex,
        embedder=None,
        config: RetrievalConfig | None = None,
        alias_lexicon: dict | None = None,
    ):
        self.index = index
        self.config = config or DEFAULT.retrieval
        self.embedder = embedder or shared_embedder()
        self.alias_lexicon = alias_lexicon or {}
        self.short_circuits = 0
        self.full_retrievals = 0
        self.gates_applied = 0
        self.gates_escaped = 0
        self.doc_matrix_cached = False
        self.index.ensure_bm25(self.config.bm25_k1, self.config.bm25_b)
        if self.config.use_ngram:
            self.index.ensure_ngram(self.config.ngram_min, self.config.ngram_max)
        self.doc_matrix = self._embed_docs()

    # ── Document matrix, cached on disk ──────────────────────────────────────

    def _embed_docs(self) -> np.ndarray:
        """L2-normalised activity embeddings, read from disk when this exact
        (model, documents) pair has been encoded before."""
        docs = self.index.precomputed_texts()
        key = embedcache.content_key(self.embedder.cache_name, docs)
        cached = embedcache.load(key)
        if cached is not None and cached.shape[0] == len(docs):
            self.doc_matrix_cached = True
            # np.load(mmap_mode="r") returns a read-only memmap; the dot
            # product reads it in place, so nothing is copied here.
            return cached
        self.doc_matrix_cached = False
        m = self.embedder.encode_normalized(docs)
        embedcache.store(key, m)
        return m

    # ── Channels ─────────────────────────────────────────────────────────────

    def tag_channel(
        self, event_tags: list[dict], text_sizes: set[int]
    ) -> list[tuple[int, float]]:
        """Exact/near-exact tag match, ranked by match quality:
        full (line+size+spec) > line+size > line only. Highest-weight channel.

        `index.line_index` is a dict, so this is O(tags) lookups, never a scan
        over the schedule.
        """
        scores: dict[int, float] = {}
        for etag in event_tags:
            line = etag.get("line")
            if not line:
                continue
            for idx in self.index.line_index.get(line, ()):
                rank_score = 0.0
                for ckey in self.index.records[idx].tag_keys:
                    if ckey["line"] != line:
                        continue
                    s = 0.6  # bare line match
                    if etag.get("spec") and ckey.get("spec"):
                        s = 0.9 if etag["spec"] == ckey["spec"] else 0.45
                    if etag.get("size") is not None and ckey.get("size") is not None:
                        s += 0.1 if etag["size"] == ckey["size"] else -0.35
                    elif ckey.get("size") is not None and text_sizes:
                        # Event text mentions a nominal size; a mismatch with
                        # the schedule line (12" text vs 6" line) is a real
                        # contradiction, not a fuzzy miss.
                        s += 0.1 if ckey["size"] in text_sizes else -0.35
                    rank_score = max(rank_score, s)
                scores[idx] = max(scores.get(idx, 0.0), rank_score)
        return sorted(scores.items(), key=lambda kv: -kv[1])

    def bm25_channel(
        self, query_tokens: list[str], top_k: int | None = None
    ) -> list[tuple[int, float]]:
        top_k = top_k or self.config.top_k
        if not self.index.bm25 or not query_tokens:
            return []
        # Precomputed term x doc matrix; falls back to rank_bm25 itself if the
        # matrix could not be built. The two agree exactly — asserted in
        # matching/test_equivalence.py.
        scores = self.index.bm25_scores(query_tokens)
        if scores is None:
            scores = self.index.bm25.get_scores(query_tokens)
        order = np.argsort(-scores)[:top_k]
        return [(int(i), float(scores[i])) for i in order if scores[i] > 0]

    def dense_channel(self, query: str, top_k: int | None = None) -> list[tuple[int, float]]:
        top_k = top_k or self.config.top_k
        return self.embedder.cosine_top(query, self.doc_matrix, top_k)

    def ngram_channel(self, text: str, top_k: int | None = None) -> list[tuple[int, float]]:
        """Character 3-5 gram cosine. Robust to the spelling errors and
        abbreviations the token-level channels miss and that the fuzzy stage
        only sees after retrieval has already dropped the right activity."""
        top_k = top_k or self.config.top_k
        sims = self.index.ngram_similarities(text)
        if sims is None:
            return []
        order = np.argsort(-sims)[:top_k]
        return [(int(i), float(sims[i])) for i in order if sims[i] > 0]

    def alias_channel(self, text: str) -> list[tuple[int, float]]:
        """Planner corrections, read back.

        A confirmed correction is the strongest evidence the system will ever
        get about one phrasing, because a human looked at it. It is a
        retrieval channel and not a decision: an alias injects its activity
        into the pool with a strong prior, and the feature stage still has to
        agree before anything is auto-linked.
        """
        if not self.alias_lexicon:
            return []
        hits = self.alias_lexicon.get(alias_key(text))
        if not hits:
            return []
        out: list[tuple[int, float]] = []
        for activity_id, weight in hits:
            rec_idx = self.index.index_of(activity_id)
            if rec_idx is not None:
                out.append((rec_idx, float(weight)))
        return sorted(out, key=lambda kv: -kv[1])

    # ── Fusion ───────────────────────────────────────────────────────────────

    def parse_event_tags(self, event_tags_raw: list[str]) -> list[dict]:
        return [parse_tag(v) for t in event_tags_raw for v in tag_variants(t)]

    def unambiguous_tag_hit(self, event_tags: list[dict]) -> int | None:
        """The single activity an unambiguous tag resolves to, else None.

        'Unambiguous' means: the mention's tags collectively name at least one
        known schedule line, and every line they name belongs to the same one
        activity. Under that condition the dense and fuzzy stages cannot change
        the winner, only the cost of reaching it.
        """
        seen: set[int] = set()
        lines = 0
        for etag in event_tags:
            line = etag.get("line")
            if not line:
                continue
            hits = self.index.line_index.get(line)
            if not hits:
                continue
            lines += 1
            seen.update(hits)
            if len(seen) > 1:
                return None
        if lines >= 1 and len(seen) == 1:
            return next(iter(seen))
        return None

    def _short_circuit_result(self, only: int) -> tuple[list[int], dict[int, dict]]:
        cfg = self.config
        return [only], {only: {
            "rrf": cfg.w_tag / (cfg.rrf_k + 1),
            "sources": ["TAG"],
            "dense_cos": None,
            "short_circuit": True,
        }}

    def retrieve(
        self,
        raw_text: str,
        event_tags_raw: list[str],
        dense_hits: list[tuple[int, float]] | None = None,
        discipline: str | None = None,
    ) -> tuple[list[int], dict[int, dict]]:
        """Returns (ordered candidate indices, per-candidate retrieval info).

        `dense_hits` lets a batch caller supply the dense channel it already
        computed in one forward pass. When it is None the channel runs here,
        which is the single-event path.
        """
        cfg = self.config
        event_tags = self.parse_event_tags(event_tags_raw)
        text_sizes = extract_size_mentions(raw_text)

        if cfg.short_circuit_tags and dense_hits is None:
            only = self.unambiguous_tag_hit(event_tags)
            if only is not None:
                self.short_circuits += 1
                return self._short_circuit_result(only)

        self.full_retrievals += 1
        # Controlled terminology expansion (off by default): canonical
        # schedule vocabulary is APPENDED to the query side only.
        q_tokens = tokenize(raw_text)
        q_text = raw_text
        if cfg.term_expansion:
            from . import terminology
            q_tokens = q_tokens + terminology.expansion_tokens(raw_text)
            q_text = terminology.canonicalise(raw_text)
        channels: dict[str, list[tuple[int, float]]] = {
            "TAG": self.tag_channel(event_tags, text_sizes),
            "BM25": self.bm25_channel(q_tokens),
            "DENSE": dense_hits if dense_hits is not None else self.dense_channel(q_text),
        }
        if cfg.use_ngram:
            channels["NGRAM"] = self.ngram_channel(q_text)
        if cfg.use_alias:
            channels["ALIAS"] = self.alias_channel(raw_text)

        weights = cfg.channel_weights
        fused: dict[int, float] = {}
        sources: dict[int, set[str]] = {}
        for name, hits in channels.items():
            w = weights.get(name, 0.5)
            if w <= 0.0:
                continue
            for rank, (idx, _score) in enumerate(hits):
                fused[idx] = fused.get(idx, 0.0) + w / (cfg.rrf_k + rank + 1)
                sources.setdefault(idx, set()).add(name)

        # ── Discipline soft gate ──
        if cfg.discipline_gate and discipline and discipline != "unknown":
            kept = {
                i: s for i, s in fused.items()
                if self.index.records[i].discipline == discipline
            }
            # The escape hatch: discipline inference from field text is noisy,
            # so a gate that can empty (or nearly empty) the pool has to fall
            # back rather than hand the ranker nothing to rank.
            if len(kept) >= cfg.discipline_gate_min_pool:
                fused = kept
                self.gates_applied += 1
            else:
                self.gates_escaped += 1

        ordered = sorted(fused.items(), key=lambda kv: -kv[1])[:cfg.top_k]
        cand_ids = [idx for idx, _ in ordered]
        dense_scores = dict(channels["DENSE"])
        info = {
            idx: {
                "rrf": score,
                "sources": sorted(sources.get(idx, [])),
                "dense_cos": dense_scores.get(idx),
            }
            for idx, score in ordered
        }
        return cand_ids, info

    # ── Batch path ───────────────────────────────────────────────────────────

    def dense_channel_many(
        self, texts: list[str], top_k: int | None = None
    ) -> list[list[tuple[int, float]]]:
        """Dense retrieval for many queries in ONE forward pass.

        This is the whole reason the batch path exists: encoding a single
        12-word mention costs nearly what encoding sixty of them costs,
        because the cost is per-call rather than per-token.
        """
        top_k = top_k or self.config.top_k
        if not texts:
            return []
        q = self.embedder.encode_normalized(texts)
        sims = q @ np.asarray(self.doc_matrix).T     # (n_queries, n_activities)
        k = min(top_k, sims.shape[1])
        # argpartition is O(n) per row where argsort is O(n log n); only the k
        # selected entries are then sorted.
        part = np.argpartition(-sims, k - 1, axis=1)[:, :k]
        out = []
        for r in range(sims.shape[0]):
            idxs = part[r]
            idxs = idxs[np.argsort(-sims[r, idxs])]
            out.append([(int(i), float(sims[r, i])) for i in idxs])
        return out

    def retrieve_many(
        self,
        texts: list[str],
        tags: list[list[str]],
        disciplines: list[str | None] | None = None,
    ) -> list[tuple[list[int], dict[int, dict]]]:
        """Retrieve for a whole file's worth of mentions.

        Events whose tag resolves unambiguously are answered without ever
        reaching the encoder, so the batch shrinks to the events that need it.
        """
        cfg = self.config
        disciplines = disciplines or [None] * len(texts)
        # Terminology expansion (off by default): only the DENSE batch pass
        # canonicalises here. retrieve() canonicalises the query side itself,
        # so the per-mention calls below must still receive the raw text —
        # canonicalising twice would append the phrases twice.
        dense_texts = texts
        if cfg.term_expansion:
            from . import terminology
            dense_texts = [terminology.canonicalise(t) for t in texts]
        results: list[tuple[list[int], dict[int, dict]] | None] = [None] * len(texts)

        needs_dense: list[int] = []
        for i, tg in enumerate(tags):
            if cfg.short_circuit_tags:
                only = self.unambiguous_tag_hit(self.parse_event_tags(tg))
                if only is not None:
                    self.short_circuits += 1
                    results[i] = self._short_circuit_result(only)
                    continue
            needs_dense.append(i)

        dense = self.dense_channel_many([dense_texts[i] for i in needs_dense])
        for slot, i in enumerate(needs_dense):
            results[i] = self.retrieve(
                texts[i], tags[i], dense_hits=dense[slot],
                discipline=disciplines[i],
            )
        return results  # type: ignore[return-value]

    # ── Instrumentation ──────────────────────────────────────────────────────

    def stats(self) -> dict:
        total = self.short_circuits + self.full_retrievals
        return {
            "short_circuits": self.short_circuits,
            "full_retrievals": self.full_retrievals,
            "short_circuit_rate": self.short_circuits / total if total else 0.0,
            "gates_applied": self.gates_applied,
            "gates_escaped": self.gates_escaped,
            "doc_matrix_from_cache": self.doc_matrix_cached,
        }

    def reset_stats(self) -> None:
        self.short_circuits = 0
        self.full_retrievals = 0
        self.gates_applied = 0
        self.gates_escaped = 0
