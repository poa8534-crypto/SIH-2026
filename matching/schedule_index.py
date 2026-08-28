"""Schedule index: loads the baseline schedule and precomputes every
lookup structure the retrieval + feature stages need.

Reuses `extraction.prepass.extract_tags` so tag extraction logic is defined
exactly once in the codebase.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from rank_bm25 import BM25Okapi

from extraction.prepass import extract_tags as prepass_extract_tags

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
    predecessors: list[str] = field(default_factory=list)
    tokens: list[str] = field(default_factory=list)
    doc: str = ""                                       # description + detail (+ tag) for embeddings

    @property
    def line_keys(self) -> set[str]:
        return {t["line"] for t in self.tag_keys if t["line"]}


class ScheduleIndex:
    """In-memory index over ~120 L5/L6 activities."""

    def __init__(self, activities: list[dict]):
        self.records: list[ActivityRecord] = []
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
        corpus = [rec.tokens for rec in self.records]
        self.bm25 = BM25Okapi(corpus) if corpus and any(corpus) else None

        # ── Predecessor graph ──
        self.by_id: dict[str, ActivityRecord] = {
            rec.activity_id: rec for rec in self.records
        }

    # ── Construction ─────────────────────────────────────────────────────────

    @classmethod
    def from_json(cls, path: str | Path) -> "ScheduleIndex":
        with open(path, encoding="utf-8") as f:
            activities = json.load(f)
        return cls(activities)

    def _build(self, activities: list[dict]) -> None:
        for act in activities:
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
                predecessors=list(act.get("predecessors") or []),
                doc=f"{desc}. {detail}",
            )
            rec.tokens = tokenize(f"{desc} {detail} {' '.join(raw_tags)}")
            self.records.append(rec)

    # ── Lookup helpers ───────────────────────────────────────────────────────

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
