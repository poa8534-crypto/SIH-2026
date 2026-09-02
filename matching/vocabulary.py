"""A canonical `activity_type` vocabulary, and a resolver onto it.

ROADMAP §11. Matching today works on descriptions and tags, which are
project-specific: `PIP-ERC-1030` means nothing on the next contract. A lesson
learned has to key on *what kind of work this was* to transfer across projects
whose activity ids share no vocabulary at all. This module is that key.

**IT IS NOT WIRED INTO MATCHING, DELIBERATELY.** Nothing here is imported by
`HybridRetriever`, no weight changes, the alias channel stays off, and
`eval.py` output is byte-identical before and after. See D-052 for why: closing
that loop moves retrieval, and the 100% auto-link precision is not something to
put at risk days before a demo. The vocabulary is built, exposed and tested so
that wiring it in later is a scoring change and not an archaeology project.

THREE LAYERS, EACH CARRYING ITS OWN PROVENANCE
----------------------------------------------
The honest structure, because two of these are real published standards and one
is this project's own:

1. **CFIHOS disciplines** (`source="cfihos"`) — 34 real discipline codes from
   the CFIHOS v2.0 CORE tables. Genuine standard, genuine codes.
2. **Uniclass 2015 activities** (`source="uniclass"`) — the `Ac_10_40`
   Construction group. Genuine standard, genuine codes.
3. **Project activity types** (`source="project"`) — the 56 discipline+type
   codes the demo baseline actually uses, derived from the activity ids rather
   than hand-typed, so they cannot drift from the schedule.

WHY MOST ENTRIES HAVE NO STANDARD CODE, AND WHY THAT IS NOT A FAILURE
---------------------------------------------------------------------
Uniclass 2015 is a **building**-construction taxonomy. Its whole Construction
group is 14 entries — Bricklaying, Carpentry, Carpet laying, Tiling, Plastering,
Plumbing. It has nothing for spool erection, hydrotest, flange bolt-up, loop
checking, tank shell erection or vessel delivery, which is most of what an oil
and gas EPC schedule contains.

So `standard_code` is populated **only where a real correspondence exists** and
is `None` everywhere else. Forcing `PIP-HYT` (Hydrotest) onto `Ac_10_40_67`
(Plumbing) would make the coverage number look better and the vocabulary worse.
The response reports `standard_coverage` so the gap is visible rather than
implied.

The corpus is optional: `datasets/real` is a large download. Without it the
project layer still builds from the baseline, and the two standard layers are
reported as unavailable rather than silently empty.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "dataset" / "baseline_schedule.json"
CFIHOS_DISCIPLINES = (
    ROOT / "datasets" / "real" / "normalized" / "cfihos" / "v2.0"
    / "CFIHOS CORE discipline v2.0.csv"
)
UNICLASS_ACTIVITIES = (
    ROOT / "datasets" / "real" / "normalized" / "uniclass" / "snapshot_2022"
    / "native_csv" / "Uniclass2015_Ac.csv"
)

#: The Uniclass group that is actually construction execution. The other 900-odd
#: rows are design, survey, management and handover activities.
UNICLASS_CONSTRUCTION_PREFIX = "Ac_10_40"

#: Discipline prefix in an activity id -> the project's discipline name. Same
#: six the rest of the system uses; there is no seventh.
DISCIPLINE_BY_PREFIX = {
    "CIV": "civil",
    "PIP": "piping",
    "SEQ": "static_equipment",
    "ELE": "electrical",
    "INS": "instrumentation",
    "HSE": "hse",
}

#: Project discipline -> CFIHOS discipline code. Only where the correspondence
#: is real. CFIHOS has no "static equipment" macro discipline and no HSE
#: discipline, so those are absent rather than approximated.
CFIHOS_BY_DISCIPLINE = {
    "civil": "CX",          # civil engineering
    "electrical": "EA",     # electrical engineering
    "piping": None,         # CFIHOS splits piping across process/mechanical
    "static_equipment": None,
    "instrumentation": None,
    "hse": None,
}

#: Project type code -> Uniclass Ac code, ONLY where a genuine correspondence
#: exists. Everything not listed here resolves to `standard_code = None`, which
#: is the honest answer for work a building taxonomy does not describe.
UNICLASS_BY_TYPE_CODE = {
    "PIP-SPL": "Ac_10_40_63",   # Spool fabrication      -> Pipe fitting
    "PIP-ERC": "Ac_10_40_63",   # Spool erection         -> Pipe fitting
    "PIP-SUP": "Ac_10_40_63",   # Pipe support install   -> Pipe fitting
    "PIP-PAI": "Ac_10_40_60",   # Painting and coating   -> Painting and decorating
    "CIV-PLT": "Ac_10_40_65",   # Plastering and painting-> Plastering and rendering
    "ELE-CBL": "Ac_10_40_27",   # Cable laying           -> Electrical system installing
    "ELE-LIG": "Ac_10_40_27",   # Area lighting          -> Electrical system installing
    "ELE-FLT": "Ac_10_40_27",   # Cable termination      -> Electrical system installing
    "CIV-FDN": "Ac_10_40_30",   # Pedestal concreting    -> Formwork installing
    "CIV-FND": "Ac_10_40_30",   # Foundations            -> Formwork installing
}


@dataclass
class ActivityType:
    """One canonical activity type, with where it came from."""

    code: str                       # e.g. "PIP-HYT"
    label: str                      # e.g. "Hydrotest"
    discipline: str
    source: str                     # project | uniclass | cfihos
    standard_code: Optional[str] = None
    standard_label: Optional[str] = None
    standard_source: Optional[str] = None
    activity_count: int = 0
    examples: list[str] = field(default_factory=list)
    #: Every distinct activity head under this code. 17 of the 56 types cover
    #: more than one — CIV-FDN spans "Pedestal Concreting", "Equipment
    #: Foundation Concreting" and "Slab-on-Grade" — so `label` is one of these,
    #: not a name that describes all of them.
    label_variants: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "label": self.label,
            "discipline": self.discipline,
            "source": self.source,
            "standard_code": self.standard_code,
            "standard_label": self.standard_label,
            "standard_source": self.standard_source,
            "activity_count": self.activity_count,
            "examples": self.examples[:3],
            "label_variants": self.label_variants,
            # False means `label` is one of several headings under this code and
            # does not describe the others. Said rather than left to be noticed.
            "label_is_unambiguous": len(self.label_variants) <= 1,
        }


# ── Standard sources (optional; the corpus is a large download) ─────────────

@lru_cache(maxsize=1)
def uniclass_activities() -> dict[str, str]:
    """`Ac_` code -> title, for the Construction group. Empty if absent."""
    if not UNICLASS_ACTIVITIES.exists():
        return {}
    out: dict[str, str] = {}
    with open(UNICLASS_ACTIVITIES, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            code = (row.get("Code") or "").strip()
            title = (row.get("Title") or "").strip()
            if code.startswith(UNICLASS_CONSTRUCTION_PREFIX) and title:
                out[code] = title
    return out


@lru_cache(maxsize=1)
def cfihos_disciplines() -> dict[str, str]:
    """CFIHOS discipline code -> name. Empty if the corpus is absent."""
    if not CFIHOS_DISCIPLINES.exists():
        return {}
    out: dict[str, str] = {}
    with open(CFIHOS_DISCIPLINES, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            code = (row.get("discipline code") or "").strip()
            name = (row.get("discipline name") or "").strip()
            if code and name:
                out[code] = name
    return out


# ── The project layer, derived from the baseline ────────────────────────────

def _heads(descriptions: list[str]) -> list[str]:
    """The activity headings under a type code, most common first.

    "Spool Erection — 24"-P-1001-A1A" yields "Spool Erection". Ordering is by
    frequency then alphabetically, never by input order, so the result is
    deterministic.
    """
    heads = []
    for d in descriptions:
        head = re.split(r"\s+[—–-]\s+", d, maxsplit=1)[0].strip()
        if head or d.strip():
            heads.append(head or d.strip())
    distinct = sorted(set(heads), key=lambda h: (-heads.count(h), h))
    return distinct


@lru_cache(maxsize=1)
def _baseline_types() -> tuple[ActivityType, ...]:
    """The activity types the demo baseline actually contains.

    Derived from the activity ids rather than hand-listed, so the vocabulary
    cannot drift from the schedule it describes.
    """
    if not BASELINE_PATH.exists():
        return ()
    activities = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))

    grouped: dict[str, list[str]] = {}
    for activity in activities:
        parts = (activity.get("activity_id") or "").split("-")
        if len(parts) < 2:
            continue
        code = f"{parts[0]}-{parts[1]}"
        grouped.setdefault(code, []).append(activity.get("description") or "")

    uniclass = uniclass_activities()
    cfihos = cfihos_disciplines()

    out = []
    for code, descriptions in sorted(grouped.items()):
        heads = _heads(descriptions)
        prefix = code.split("-", 1)[0]
        discipline = DISCIPLINE_BY_PREFIX.get(prefix, "unknown")

        standard_code = UNICLASS_BY_TYPE_CODE.get(code)
        standard_label = uniclass.get(standard_code) if standard_code else None
        standard_source = "uniclass" if standard_code else None

        # Fall back to the discipline's CFIHOS code when no activity-level
        # standard applies — a real code at a coarser level beats none.
        if standard_code is None:
            cfihos_code = CFIHOS_BY_DISCIPLINE.get(discipline)
            if cfihos_code and cfihos_code in cfihos:
                standard_code = cfihos_code
                standard_label = cfihos[cfihos_code]
                standard_source = "cfihos"

        out.append(
            ActivityType(
                code=code,
                label=heads[0] if heads else "",
                discipline=discipline,
                source="project",
                standard_code=standard_code,
                standard_label=standard_label,
                standard_source=standard_source,
                activity_count=len(descriptions),
                examples=[d for d in descriptions if d][:3],
                label_variants=heads,
            )
        )
    return tuple(out)


# ── Resolution ──────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _keyword_index() -> tuple[tuple[str, str], ...]:
    """(keyword, type code) pairs, longest keyword first.

    Built from each type's label, so a description that repeats the label
    resolves without any hand-written synonym list. Deterministic: the ordering
    is by keyword length then code, never by dict iteration order.
    """
    pairs = []
    for activity_type in _baseline_types():
        # EVERY heading under the code, not just the chosen label. Indexing only
        # the label would leave "Pedestal Concreting" unresolvable purely
        # because "Slab-on-Grade" happened to be the more common heading.
        for head in activity_type.label_variants:
            keyword = head.lower().strip()
            if len(keyword) >= 4:
                pairs.append((keyword, activity_type.code))
    # Longest keyword first so a specific phrase wins over a substring of it;
    # ties broken on the code so the order never depends on dict iteration.
    return tuple(sorted(set(pairs), key=lambda p: (-len(p[0]), p[1])))


def resolve(description: str, activity_id: Optional[str] = None) -> Optional[ActivityType]:
    """The canonical activity type for a description, or None.

    Deterministic and total: the same input always gives the same output, and an
    input that matches nothing returns `None` rather than a nearest guess. A
    wrong activity type on a lesson learned is worse than no activity type.

    `activity_id` wins when supplied — the id encodes the type directly, and a
    fact beats an inference from prose.
    """
    by_code = {t.code: t for t in _baseline_types()}

    if activity_id:
        parts = str(activity_id).split("-")
        if len(parts) >= 2:
            found = by_code.get(f"{parts[0]}-{parts[1]}")
            if found:
                return found

    text = (description or "").lower()
    if not text.strip():
        return None
    for keyword, code in _keyword_index():
        if keyword in text:
            return by_code.get(code)
    return None


# ── The whole vocabulary ────────────────────────────────────────────────────

def vocabulary() -> dict:
    """Every activity type, with coverage stated rather than implied."""
    types = _baseline_types()
    uniclass = uniclass_activities()
    cfihos = cfihos_disciplines()

    with_standard = [t for t in types if t.standard_code]
    ambiguous = [t for t in types if len(t.label_variants) > 1]
    return {
        "activity_types": [t.as_dict() for t in types],
        "counts": {
            "activity_types": len(types),
            "with_standard_code": len(with_standard),
            "uniclass_construction_activities": len(uniclass),
            "cfihos_disciplines": len(cfihos),
            "types_with_an_ambiguous_label": len(ambiguous),
        },
        "standard_coverage": (
            round(len(with_standard) / len(types), 4) if types else 0.0
        ),
        "sources": {
            "project": {
                "available": bool(types),
                "detail": (
                    "Derived from dataset/baseline_schedule.json activity ids, "
                    "so it cannot drift from the schedule it describes."
                ),
            },
            "uniclass": {
                "available": bool(uniclass),
                "detail": (
                    "Uniclass 2015 table Ac, Construction group (Ac_10_40). A "
                    "BUILDING-construction taxonomy: it has no entry for spool "
                    "erection, hydrotest, flange bolt-up, loop checking or tank "
                    "erection, which is most of an oil and gas EPC schedule."
                ),
            },
            "cfihos": {
                "available": bool(cfihos),
                "detail": (
                    "CFIHOS v2.0 CORE discipline table. Used at discipline level "
                    "only; CFIHOS has no macro discipline matching HSE or "
                    "static equipment, so those carry no standard code."
                ),
            },
        },
        "wired_into_matching": False,
        "note": (
            "Built and exposed, NOT used by the matcher. Wiring it into "
            "retrieval changes scoring and puts the 100% auto-link precision at "
            "risk; that is a separate, measured change. See D-052."
        ),
    }
