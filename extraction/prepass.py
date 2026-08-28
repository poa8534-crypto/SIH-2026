"""Deterministic pre-pass: regex extraction of high-signal structured data.

This module NEVER guesses. It extracts what it can find with regex
and returns structured fragments for the LLM to consume.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

from .models import Discipline

# ── Pipe / equipment tag patterns ────────────────────────────────────────────

# Matches: 24"-P-1001-A1A, 24 inch P-1001, 12"-P-1002-B1A, etc.
PIPE_TAG_RE = re.compile(
    r'(\d{1,2})\s*(?:"|inch|in)?\s*[-–]?\s*(P|p)[\s-]*(\d{3,4})\s*[-–]?\s*([A-Z]\d[A-Z])',
    re.IGNORECASE,
)

# Also match pipe tags without spec: P-1001, P-1002, P-1003
PIPE_BARE_RE = re.compile(
    r'\bP[-\s]?(\d{3,4})\b',
    re.IGNORECASE,
)

# Matches: V-101, V-102, E-101, CS-01, HS-01, TK-1, TR-01
# Allow 1-3 digit suffix (TK-1 has only 1 digit)
EQUIPMENT_TAG_RE = re.compile(
    r'\b([A-Z]{1,3})[-–](\d{1,3}[A-Z]?(?:/[A-Z])?)\b'
)

# Matches: JB-01, JB-02, PSV-01, etc.
INSTRUMENT_TAG_RE = re.compile(
    r'\b(JB|PSV|LT|PT|TT|FT|CV|SDV|ESD)[-\s]?(\d{1,3})\b',
    re.IGNORECASE,
)

# ── Date patterns ────────────────────────────────────────────────────────────

# Explicit dates: 03/08/2026, 2026-08-03, 03/Aug/2026, 3 Aug 2026
DATE_DMY_SLASH_RE = re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b')
DATE_ISO_RE = re.compile(r'\b(\d{4})-(\d{1,2})-(\d{1,2})\b')
DATE_DMY_ALPHA_RE = re.compile(
    r'\b(\d{1,2})\s*/?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*/?\s*(\d{4})\b',
    re.IGNORECASE,
)
MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Relative date words
RELATIVE_DATE_RE = re.compile(
    r'\b(yesterday|today|tomorrow|last week|this week|next week)\b',
    re.IGNORECASE,
)

# ── Quantity + UOM patterns ─────────────────────────────────────────────────

QUANTITY_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*'
    r'(m3|m2|lm|mt|km|nos?|mm|cm|ltr|tonnes?|tons?|spools?|flanges?|panels?|'
    r'meters?|metres?|ends?|cables?|readings?|cycles?|nozzles?|sif|sifs?|'
    r'obs(?:ervations?)?|lites?|lights?|jbs?|circuits?)\b',
    re.IGNORECASE,
)

# Standalone bare meters: "800 m of", "1200 m "
BARE_METER_RE = re.compile(r'(\d+(?:\.\d+)?)\s+m\b')

# Percentage
PERCENT_RE = re.compile(r'(\d+(?:\.\d+)?)\s*%')

# Fraction progress: "6 of 8", "28 of 36"
FRACTION_RE = re.compile(r'(\d+)\s+(?:of|out of|of total)\s+(\d+)')

# ── Discipline keyword patterns ──────────────────────────────────────────────

DISCIPLINE_KEYWORDS: dict[Discipline, list[re.Pattern]] = {
    Discipline.CIVIL: [
        re.compile(r'\b(civil|foundation|concreting|backfill|piling|grading|excavat|slab|grade beam|fence|fencing|drainage|bund|plaster|paint|flooring|tile|cable tray buried)\b', re.IGNORECASE),
    ],
    Discipline.PIPING: [
        re.compile(r'\b(piping|spool|pipe rack|flange|hydrotest|hydro test|insulat|coating|paint.*pipe|pipe support|punch list|erected|erection|fit-?up|bolt-?up|boltup|test section)\b', re.IGNORECASE),
        PIPE_TAG_RE,
    ],
    Discipline.STATIC_EQUIPMENT: [
        re.compile(r'\b(vessel|exchanger|pump|compressor|skid|tank|setting|jacking|alignment|grout|nozzle|anchor bolt|pontoon)\b', re.IGNORECASE),
    ],
    Discipline.ELECTRICAL: [
        re.compile(r'\b(electrical|cable|termination|earthing|grounding|lightning|lighting|transformer|swgr|switchgear|mcc|panel|energis|insulation resistance|megger|motor start)\b', re.IGNORECASE),
    ],
    Discipline.INSTRUMENTATION: [
        re.compile(r'\b(instrument|transmitter|calibrat|loop check|dcs|sis|esd|safety instrumented|junction box|marshalling|control valve|psv|safety valve|as-built|datasheet|rtd|thermowell)\b', re.IGNORECASE),
    ],
    Discipline.HSE: [
        re.compile(r'\b(hse|safety|ncr|near.?miss|lti|bbs|scaffold|permit|jsa|induction|emergency drill|fire extinguish|first.aid)\b', re.IGNORECASE),
    ],
}

# ── Status keywords ──────────────────────────────────────────────────────────

COMPLETED_RE = re.compile(
    r'\b(complet|done|finished|passed|closed|all passed|'
    r'all \d+ .* (?:done|passed|complete|erected)|'
    r'khotom|ho gaya|kaam khatom)\b',
    re.IGNORECASE,
)
IN_PROGRESS_RE = re.compile(
    r'\b(in progress|ongoing|started|working|under way|chalu|shuru|%\s*(?:done|complete))\b',
    re.IGNORECASE,
)
DELAYED_RE = re.compile(
    r'\b(delay|delayed|behind|overdue|held up|pending)\b',
    re.IGNORECASE,
)


# ── Public API ───────────────────────────────────────────────────────────────

def extract_tags(text: str) -> list[str]:
    """Extract all equipment/line tags from free text."""
    tags: list[str] = []

    for m in PIPE_TAG_RE.finditer(text):
        size, letter, num, spec = m.groups()
        tag = f'{size}"-P-{num}-{spec.upper()}'
        if tag not in tags:
            tags.append(tag)

    # Also match bare pipe refs like "P-1001" without size/spec
    for m in PIPE_BARE_RE.finditer(text):
        num = m.group(1)
        tag = f'P-{num}'
        if tag not in tags and not any(num in t for t in tags):
            tags.append(tag)

    for m in EQUIPMENT_TAG_RE.finditer(text):
        prefix, suffix = m.groups()
        tag = f"{prefix}-{suffix}"
        # Filter out false positives (date fragments, section numbers)
        if prefix in ("JB", "PSV", "LT", "PT", "TT", "FT", "CV", "SDV", "ESD"):
            continue
        if tag not in tags:
            tags.append(tag)

    for m in INSTRUMENT_TAG_RE.finditer(text):
        prefix, num = m.groups()
        tag = f"{prefix.upper()}-{num}"
        if tag not in tags:
            tags.append(tag)

    return tags


def extract_dates(text: str, reference_date: Optional[date] = None) -> list[date]:
    """Extract all dates from free text. Returns them in encounter order."""
    dates: list[date] = []
    seen: set[date] = set()

    def _add(d: date) -> None:
        if d not in seen:
            seen.add(d)
            dates.append(d)

    ref = reference_date or date.today()

    for m in DATE_ISO_RE.finditer(text):
        try:
            _add(date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        except ValueError:
            pass

    for m in DATE_DMY_ALPHA_RE.finditer(text):
        day, mon_str, year = m.groups()
        mon = MONTH_MAP.get(mon_str[:3].lower())
        if mon:
            try:
                _add(date(int(year), mon, int(day)))
            except ValueError:
                pass

    for m in DATE_DMY_SLASH_RE.finditer(text):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        # Disambiguate DD/MM/YYYY vs MM/DD/YYYY by range
        if 1 <= d <= 31 and 1 <= mo <= 12 and y > 2000:
            try:
                _add(date(y, mo, d))  # assume MM/DD/YYYY first
            except ValueError:
                try:
                    _add(date(y, d, mo))  # try DD/MM/YYYY
                except ValueError:
                    pass

    for m in RELATIVE_DATE_RE.finditer(text):
        word = m.group(1).lower()
        if word == "yesterday":
            _add(ref - timedelta(days=1))
        elif word == "today":
            _add(ref)
        elif word == "tomorrow":
            _add(ref + timedelta(days=1))
        # "last week", "this week", "next week" are too vague to resolve

    return dates


def extract_quantities(text: str) -> list[tuple[float, str]]:
    """Extract all (quantity, uom) pairs from free text."""
    results: list[tuple[float, str]] = []
    seen_spans: set[int] = set()

    for m in QUANTITY_RE.finditer(text):
        seen_spans.add(m.start())
        qty = float(m.group(1))
        uom = m.group(2).lower()
        uom = _normalize_uom(uom)
        results.append((qty, uom))

    # Also match bare meters: "800 m of"
    for m in BARE_METER_RE.finditer(text):
        if m.start() not in seen_spans:
            results.append((float(m.group(1)), "m"))

    return results


def extract_percentages(text: str) -> list[float]:
    """Extract explicit percentage values."""
    return [float(m.group(1)) for m in PERCENT_RE.finditer(text)]


def extract_fractions(text: str) -> list[tuple[int, int]]:
    """Extract progress fractions like '6 of 8'."""
    return [(int(m.group(1)), int(m.group(2))) for m in FRACTION_RE.finditer(text)]


def infer_discipline(text: str) -> Discipline:
    """Infer the most likely discipline from context keywords."""
    scores: dict[Discipline, int] = {d: 0 for d in Discipline}
    for disc, patterns in DISCIPLINE_KEYWORDS.items():
        for pat in patterns:
            scores[disc] += len(pat.findall(text))

    best = max(scores, key=lambda d: scores[d])
    if scores[best] == 0:
        return Discipline.UNKNOWN
    return best


def infer_status(text: str) -> tuple[str, float]:
    """Infer progress status and a rough confidence."""
    is_completed = bool(COMPLETED_RE.search(text))
    is_in_progress = bool(IN_PROGRESS_RE.search(text))
    is_delayed = bool(DELAYED_RE.search(text))

    if is_delayed:
        return "delayed", 0.8
    if is_completed and not is_in_progress:
        return "completed", 0.85
    if is_in_progress and not is_completed:
        return "in_progress", 0.75
    if is_completed and is_in_progress:
        # Ambiguous — lean toward in_progress
        return "in_progress", 0.5
    return "unknown", 0.3


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalize_uom(uom: str) -> str:
    """Normalize unit-of-measurement strings."""
    mapping = {
        "meter": "m", "meters": "m", "metre": "m", "metres": "m",
        "kilometre": "km", "kilometers": "km", "kilometres": "km",
        "tonne": "MT", "tonnes": "MT", "ton": "MT", "tons": "MT",
        "no": "nos", "nos": "nos",
        "spool": "nos", "flange": "nos", "panel": "nos",
        "end": "nos", "ends": "nos", "cable": "nos", "cables": "nos",
        "reading": "nos", "readings": "nos", "cycle": "nos", "cycles": "nos",
        "nozzle": "nos", "nozzles": "nos",
        "litre": "ltr", "liter": "ltr", "ltr": "ltr",
    }
    return mapping.get(uom, uom)
