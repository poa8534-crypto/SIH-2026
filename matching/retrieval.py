"""Hybrid candidate retrieval: exact tag + BM25 + dense embeddings, fused
with reciprocal rank fusion. Recall-oriented: cast wide, top-k = 20.

Dense retrieval uses a local sentence-transformers model from the all-MiniLM
class. The model is loaded with local_files_only=True first so the pipeline
runs offline once the model is cached; a deterministic hashed-ngram fallback
keeps the module runnable even without the model on disk.
"""

from __future__ import annotations

import hashlib
import logging
import re

import numpy as np

from .schedule_index import ScheduleIndex
from .textutils import extract_size_mentions, parse_tag, tag_variants, tokenize

logger = logging.getLogger(__name__)

RRF_K = 60          # standard RRF constant
TOP_K = 20          # candidate pool size fed to feature scoring

# Channel weights in the RRF fusion. The tag channel dominates: a matching
# line number is near-decisive evidence and must anchor the candidate set.
CHANNEL_WEIGHTS = {
    "TAG": 1.0,
    "BM25": 0.7,
    "DENSE": 0.7,
}


# ── Dense embedder ───────────────────────────────────────────────────────────

class MiniLMEmbedder:
    """sentence-transformers all-MiniLM-L6-v2, offline-first."""

    MODEL_NAME = "all-MiniLM-L6-v2"

    def __init__(self):
        self._model = None
        self._failed = False

    def _load(self):
        if self._model is not None or self._failed:
            return
        from sentence_transformers import SentenceTransformer
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

    def encode(self, texts: list[str]) -> np.ndarray:
        self._load()
        if self._model is None:
            return _hashed_embeddings(texts, dim=384)
        vecs = self._model.encode(
            texts, batch_size=64, show_progress_bar=False,
            normalize_embeddings=True, convert_to_numpy=True,
        )
        return np.asarray(vecs, dtype=np.float32)

    def cosine_top(self, query: str, doc_matrix: np.ndarray, top_k: int) -> list[tuple[int, float]]:
        q = self.encode([query])[0]
        norm = np.linalg.norm(q)
        if norm > 0:
            q = q / norm
        sims = doc_matrix @ q
        order = np.argsort(-sims)[:top_k]
        return [(int(i), float(sims[i])) for i in order]


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
    def __init__(self, index: ScheduleIndex, embedder=None):
        self.index = index
        self.embedder = embedder or MiniLMEmbedder()
        # Pre-embed all schedule docs (L2-normalised) — brute-force cosine
        # over 120 × 384 is trivially fast, no vector DB needed.
        self.doc_matrix = self._embed_docs()

    def _embed_docs(self) -> np.ndarray:
        vecs = self.embedder.encode(self.index.precomputed_texts())
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vecs / norms

    # ── Channels ─────────────────────────────────────────────────────────────

    def tag_channel(
        self, event_tags: list[dict], text_sizes: set[int]
    ) -> list[tuple[int, float]]:
        """Exact/near-exact tag match, ranked by match quality:
        full (line+size+spec) > line+size > line only. Highest-weight channel."""
        scores: dict[int, float] = {}
        for etag in event_tags:
            line = etag.get("line")
            if not line:
                continue
            for idx in self.index.line_index.get(line, []):
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

    def bm25_channel(self, query_tokens: list[str], top_k: int = TOP_K) -> list[tuple[int, float]]:
        if not self.index.bm25 or not query_tokens:
            return []
        scores = self.index.bm25.get_scores(query_tokens)
        order = np.argsort(-scores)[:top_k]
        return [(int(i), float(scores[i])) for i in order if scores[i] > 0]

    def dense_channel(self, query: str, top_k: int = TOP_K) -> list[tuple[int, float]]:
        return self.embedder.cosine_top(query, self.doc_matrix, top_k)

    # ── Fusion ───────────────────────────────────────────────────────────────

    def retrieve(self, raw_text: str, event_tags_raw: list[str]) -> tuple[list[int], dict[int, dict]]:
        """Returns (ordered candidate indices, per-candidate retrieval info)."""
        event_tags = [
            parse_tag(v) for t in event_tags_raw for v in tag_variants(t)
        ]
        text_sizes = extract_size_mentions(raw_text)

        channels: dict[str, list[tuple[int, float]]] = {
            "TAG": self.tag_channel(event_tags, text_sizes),
            "BM25": self.bm25_channel(tokenize(raw_text)),
            "DENSE": self.dense_channel(raw_text),
        }

        fused: dict[int, float] = {}
        sources: dict[int, set[str]] = {}
        for name, hits in channels.items():
            w = CHANNEL_WEIGHTS.get(name, 0.5)
            for rank, (idx, _score) in enumerate(hits):
                fused[idx] = fused.get(idx, 0.0) + w / (RRF_K + rank + 1)
                sources.setdefault(idx, set()).add(name)

        ordered = sorted(fused.items(), key=lambda kv: -kv[1])[:TOP_K]
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

