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

# Digit bounds mirror extraction.prepass.LINE_NUM (3-5). They were 3-4 here
# while the prepass reads 3-5, so a five-digit line number would be extracted
# by one module and dropped by the other — the normaliser is the second half
# of the same convention and has to carry the same bound.
_PIP_FULL_RE = re.compile(
    r"^(\d{1,2})\s*[\"”]?\s*[-–]?\s*p[\s-]*(\d{3,5})\s*[-–]?\s*([a-z]\d[a-z])?$",
    re.IGNORECASE,
)
_PIP_BARE_RE = re.compile(r"^p[\s-]*(\d{3,5})$", re.IGNORECASE)


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


# Prefix 1-4 letters and 1-5 digits, matching extraction.prepass.EQUIPMENT_TAG_RE.
# At 1-3 digits this never fired on v2's four-digit numbering: 'P-1401A/B' was
# normalised whole to the key 'p-1401ab', which matches no schedule line, so
# the 6 activities and 7 mentions carrying it lost their tag evidence outright.
_SLASH_VARIANT_RE = re.compile(r"^([A-Za-z]{1,4}[-\s]?\d{1,5})([A-Za-z])?/([A-Za-z])$")


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


# ── Alias lexicon key ────────────────────────────────────────────────────────

_ALIAS_WS_RE = re.compile(r"\s+")


def alias_key(text: str) -> str:
    """Normalise a raw field mention to the key the alias lexicon is stored
    under.

    `server.main._upsert_alias` writes `source_text.lower().strip()[:500]`, so
    that is the shape a lookup has to reproduce, plus whitespace collapsing:
    the same DPR line re-typed with a double space is the same correction, and
    a lexicon that misses it teaches the planner that corrections do not
    stick. Anything more aggressive (dropping punctuation, stemming) would
    change what the server writes, and the two halves of the key must be
    defined together or not at all.
    """
    return _ALIAS_WS_RE.sub(" ", (text or "").lower().strip())[:500]


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
