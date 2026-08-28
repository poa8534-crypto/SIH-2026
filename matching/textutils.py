"""Text utilities: tokenisation, tag parsing/normalisation, synonym expansion.

A piping "line number" (e.g. 24"-P-1001-A1A) is decomposed into
(size, line_no, spec) so that:
  * a full match (line + size + spec) is near-decisive evidence, and
  * a size mismatch (field says 12", schedule says 6") is caught even when
    the bare line number matches.
"""

from __future__ import annotations

import re

# ── Tag parsing ──────────────────────────────────────────────────────────────

_PIP_FULL_RE = re.compile(
    r"^(\d{1,2})\s*[\"”]?\s*[-–]?\s*p[\s-]*(\d{3,4})\s*[-–]?\s*([a-z]\d[a-z])?$",
    re.IGNORECASE,
)
_PIP_BARE_RE = re.compile(r"^p[\s-]*(\d{3,4})$", re.IGNORECASE)


def parse_tag(tag: str) -> dict:
    """Parse a tag string into (size, line, spec).

    Examples:
      '24"-P-1001-A1A' → {'size': 24, 'line': 'p-1001', 'spec': 'a1a'}
      'P-1001'         → {'size': None, 'line': 'p-1001', 'spec': None}
      'TK-1'           → {'size': None, 'line': 'tk-1', 'spec': None}
    """
    t = tag.strip().lower().replace("”", '"').replace(" ", "")
    m = _PIP_FULL_RE.match(t)
    if m:
        size, num, spec = m.groups()
        return {
            "size": int(size) if size else None,
            "line": f"p-{num}",
            "spec": spec.lower() if spec else None,
        }
    m = _PIP_BARE_RE.match(t)
    if m:
        return {"size": None, "line": f"p-{m.group(1)}", "spec": None}
    # Generic equipment tag: normalise to a single key (tk-1, v-101, cs-01, jb-02)
    norm = re.sub(r"[^a-z0-9-]", "", t)
    return {"size": None, "line": norm or None, "spec": None}


def extract_size_mentions(text: str) -> set[int]:
    """Nominal pipe sizes mentioned in text: 24", 12 inch, 8 in, 4"."""
    sizes: set[int] = set()
    for m in re.finditer(r"\b(\d{1,2})\s*(?:\"|”|inch|in\b)", text, re.IGNORECASE):
        try:
            v = int(m.group(1))
            if 1 <= v <= 64:
                sizes.add(v)
        except ValueError:
            pass
    return sizes


_SLASH_VARIANT_RE = re.compile(r"^([A-Za-z]{1,3}[-\s]?\d{1,3})([A-Za-z])?/([A-Za-z])$")


def tag_variants(tag: str) -> list[str]:
    """Expand slash-style equipment tags: 'P-101A/B' → ['P-101A', 'P-101B'].

    Schedule descriptions use 'P-101A/B' while field reports mention one
    side ('Pump alignment P-101A') — without expansion the shared tag
    evidence is lost.
    """
    t = tag.strip().replace(" ", "")
    m = _SLASH_VARIANT_RE.match(t)
    if m:
        base, a, b = m.groups()
        return [f"{base}{a or ''}", f"{base}{b}"]
    return [t]


# ── Tokenisation ─────────────────────────────────────────────────────────────

STOPWORDS = {
    "the", "a", "an", "of", "for", "and", "to", "in", "on", "at", "is",
    "are", "was", "were", "be", "with", "from", "by", "as", "all", "done",
    "completed", "this", "that", "it", "its",
}

# Informal field abbreviations → canonical schedule vocabulary
SYNONYMS = {
    "fab": "fabrication",
    "fabs": "fabrication",
    "fabricate": "fabrication",
    "fabricated": "fabrication",
    "erect": "erection",
    "erected": "erection",
    "install": "installation",
    "installed": "installation",
    "installing": "installation",
    "mgmt": "management",
    "calib": "calibration",
    "calibrated": "calibration",
    "equip": "equipment",
    "hydro": "hydrotest",
    "concreting": "concreting",
    "concrete": "concreting",
    "pedestal": "pedestal",
    "pedestals": "pedestal",
    "spools": "spool",
    "flanges": "flange",
    "foundations": "foundation",
    "backfill": "backfilling",
    "grubbing": "clearing",
    "earthing": "earthing",
    "gradebeam": "grade",
    "tier": "tier",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[-/][a-z0-9]+)*")


def tokenize(text: str) -> list[str]:
    """Lowercase tokeniser that keeps tag-like tokens (p-1001, tk-1) whole,
    expands field abbreviations, drops stopwords."""
    tokens: list[str] = []
    for raw in _TOKEN_RE.findall(text.lower()):
        if raw in STOPWORDS:
            continue
        expanded = SYNONYMS.get(raw, raw)
        tokens.append(expanded)
    return tokens


# ── UOM normalisation (for quantity-based rollup) ────────────────────────────

UOM_MAP = {
    "m": "m", "mtr": "m", "mtrs": "m", "meter": "m", "meters": "m",
    "metre": "m", "metres": "m", "lm": "m",
    "m2": "m2", "sqm": "m2",
    "m3": "m3", "cum": "m3",
    "nos": "nos", "no": "nos", "ea": "nos", "each": "nos",
    # countable bulk items are tracked in nos on the schedule side
    "spool": "nos", "spools": "nos",
    "flange": "nos", "flanges": "nos",
    "panel": "nos", "panels": "nos",
    "end": "nos", "ends": "nos",
    "mt": "mt", "tonnes": "mt", "tons": "mt",
    "joints": "joints", "joint": "joints",
}


def normalize_uom(uom: str | None) -> str:
    if not uom:
        return ""
    return UOM_MAP.get(uom.strip().lower(), uom.strip().lower())
