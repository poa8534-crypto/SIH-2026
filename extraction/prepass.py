"""Deterministic pre-pass: regex extraction of high-signal structured data.

This module NEVER guesses. It extracts what it can find with regex
and returns structured fragments for the LLM to consume.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

from .models import DateBasis, Discipline

# ── Pipe / equipment tag patterns ────────────────────────────────────────────

# How many digits a tag number may carry.
#
# This was 1-3 for equipment and 3-4 for lines, which fitted every tag in
# `dataset/baseline_schedule.json` — V-101, TK-1, CS-01 — and silently failed
# on `baseline_schedule_v2.json`, which numbers equipment with four digits.
# 18 of v2's 40 distinct tags (V-1101, PT-1101, TK-2101, PK-2401, FST-1301 ...)
# were invisible to the extractor, so `tag_overlap` — the near-decisive ranking
# feature — never fired on them. A digit count is a property of one project's
# numbering convention, not of what a tag IS, so the bound is now generous:
# five digits covers every convention either baseline uses and leaves room.
TAG_NUM = r'\d{1,5}'
LINE_NUM = r'\d{3,5}'

# Matches: 24"-P-1001-A1A, 24 inch P-1001, 12"-P-1002-B1A, etc.
PIPE_TAG_RE = re.compile(
    r'(\d{1,2})\s*(?:"|inch|in)?\s*[-–]?\s*(P|p)[\s-]*(' + LINE_NUM + r')'
    r'\s*[-–]?\s*([A-Z]\d[A-Z])',
    re.IGNORECASE,
)

# Also match pipe tags without spec: P-1001, P-1002, P-1003
PIPE_BARE_RE = re.compile(
    r'\bP[-\s]?(' + LINE_NUM + r')\b',
    re.IGNORECASE,
)

# Matches: V-101, TK-1, CS-01 (v1) and V-1101, TK-2101, PK-2401, WHCP-2101 (v2).
# The PREFIX is 1-4 letters, not 1-3: WHCP-2101 is a real v2 tag and a
# three-letter bound dropped it. Uppercase only, deliberately — lower-casing
# the prefix would start matching ordinary hyphenated prose ("unit-1").
EQUIPMENT_TAG_RE = re.compile(
    r'\b([A-Z]{1,4})[-–](' + TAG_NUM + r'[A-Z]?(?:/[A-Z])?)\b'
)

# Matches: JB-01, PSV-01 (v1) and PT-1101, LT-1201, TE-1301, FE-1401 (v2).
INSTRUMENT_TAG_RE = re.compile(
    r'\b(JB|PSV|LT|PT|TT|FT|CV|SDV|ESD)[-\s]?(' + TAG_NUM + r')\b',
    re.IGNORECASE,
)

# ── Date patterns ────────────────────────────────────────────────────────────

# Explicit dates: 03/08/2026, 2026-08-03, 03/Aug/2026, 3 Aug 2026
DATE_DMY_SLASH_RE = re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b')
DATE_ISO_RE = re.compile(r'\b(\d{4})-(\d{1,2})-(\d{1,2})\b')
# The year is OPTIONAL: DPR prose routinely writes "completed 30 Jul" with
# no year. A year-less date is resolved against the report's own header
# date -- see resolve_yearless_date().
DATE_DMY_ALPHA_RE = re.compile(
    r'\b(\d{1,2})\s*/?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*'
    r'(?:\s*/?\s*(\d{4})\b)?',
    re.IGNORECASE,
)

# A year-less date further from its report date than this sits near the
# midpoint between two candidate years, so it is flagged as ambiguous
# rather than guessed.
YEARLESS_AMBIGUITY_DAYS = 183
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

# Fraction progress: "6 of 8", "28 of 36", "40 m3 of 120 m3".
#
# The previous pattern was `(\d+)\s+(?:of|out of|of total)\s+(\d+)`, with no
# boundary before the numerator, so it read the digit INSIDE a unit suffix:
# "40 m3 of 120 m3" parsed as 3/120 = 2.5% instead of 33%, and
# "320 m2 of 480 m2" as 0.4%. Every unit ending in a digit was affected — m2
# and m3, which is most of the civil scope — and `percentage` gates
# `actual_finish`, so a naturally written DPR silently under-reported
# completion.
#
# Two changes: the numerator must START at a word boundary and not follow a
# digit or decimal point, and an optional unit token is allowed to sit between
# the numerator and "of" so the real quantity is still captured rather than
# merely refused.
FRACTION_RE = re.compile(
    r'(?<![\d.])\b(\d+)'            # numerator, not mid-token, not a decimal tail
    r'(?:\s*[A-Za-z]{1,4}\d?)?'      # optional unit: m3, m2, lm, nos, MT
    r'\s+(?:of|out of|of total)\s+'
    r'(\d+)\b',                      # denominator
    re.IGNORECASE,
)

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
    r'\b(complet\w*|done|finished|passed|closed|all passed|'
    r'all \d+ .* (?:done|passed|complete|erected)|'
    r'khotom|ho gaya|kaam khatom)\b',
    re.IGNORECASE,
)

# A completion verb with a date bound directly to it ("pour completed on
# 30 Jul") is a local finish assertion, and stays one even when a later
# clause in the same line is still open ("curing ongoing", "alignment
# check pending"). Without this, a line's overall status would suppress a
# completion the source states explicitly.
_DATE_TOKEN = (
    r'(?:yesterday|today'
    r'|\d{4}-\d{1,2}-\d{1,2}'
    r'|\d{1,2}/\d{1,2}/\d{4}'
    r'|\d{1,2}\s*/?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*'
    r'(?:\s*/?\s*\d{4})?)'
)
COMPLETION_WITH_DATE_RE = re.compile(
    r'\b(?:complet\w*|done|finished|erected|poured|passed|closed)\b'
    r'[\s,]*(?:on|by|upto|up to)?[\s,]*\(?\s*' + _DATE_TOKEN,
    re.IGNORECASE,
)

# Language marking a FUTURE PLAN or a rescheduling rather than work done.
# A line like "TK-1 hydrotest now scheduled 25 Aug instead of 23 Aug" carries
# real dates, but they are forecast dates: writing either onto the schedule
# as an actual would record a completed hydrotest for work that has not
# happened. Any span matching this must not assert a start or a finish, no
# matter what an LLM claims about it.
FORECAST_RE = re.compile(
    r'\b(now scheduled|rescheduled|re-scheduled|reschedul\w*|planned for|'
    r'scheduled for|scheduled on|expected|expecting|instead of|postponed|'
    r'pushed to|moved to|deferred|will (?:start|begin|commence|complete|finish)|'
    r'to be (?:started|completed|done)|forecast\w*|anticipated|'
    r'target(?:ed)? (?:date|completion)|upcoming|tomorrow|next week)\b',
    re.IGNORECASE,
)


def is_forecast_language(text: str) -> bool:
    """True when the span describes a plan or a schedule change rather than
    work performed. Callers must refuse to assert actual dates from it."""
    return bool(FORECAST_RE.search(text))


# Verbs asserting that work BEGAN, as opposed to merely being under way.
# Used to bind an extracted date to a start rather than a finish.
STARTED_RE = re.compile(
    r'\b(started|commenced|began|begun|mobilis\w*|mobiliz\w*|kicked off|'
    r'shuru|chalu)\b',
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
        # Longest match wins. Now that the suffix bound reaches five digits,
        # this pattern also matches the LINE portion of a full pipe tag
        # ("P-1015" inside '6"-P-1015-A1A'), and adding it separately would
        # give the record a second, SIZE-LESS key for the same line. That
        # silently defeats the size-mismatch guard: 12" field text against a
        # 6" line would match the size-less key and score as agreement. The
        # bare-pipe branch above has always had this containment check; the
        # equipment branch needed it once it could reach four digits.
        if any(tag in t for t in tags):
            continue
        if tag not in tags:
            tags.append(tag)

    for m in INSTRUMENT_TAG_RE.finditer(text):
        prefix, num = m.groups()
        tag = f"{prefix.upper()}-{num}"
        if any(tag in t for t in tags):
            continue
        if tag not in tags:
            tags.append(tag)

    return tags


def resolve_yearless_date(
    day: int, month: int, reference_date: date
) -> tuple[Optional[date], Optional[str]]:
    """Resolve a year-less date ("30 Jul") against the report's header date.

    DPR prose omits the year constantly. The correct year is almost always
    the one that puts the date nearest the report date, so the candidate
    years either side are tried and the nearest is taken. Field reports
    describe work already done, so a past reading wins a near-tie.

    Returns (resolved_date, warning). A date further than
    YEARLESS_AMBIGUITY_DAYS from the report date sits near the midpoint
    between two candidate years and cannot be resolved safely, so it is
    returned as (None, warning) to be flagged rather than guessed.
    """
    candidates: list[date] = []
    for year in (reference_date.year - 1, reference_date.year, reference_date.year + 1):
        try:
            candidates.append(date(year, month, day))
        except ValueError:
            continue  # e.g. 29 Feb in a non-leap year
    if not candidates:
        return None, f"unparseable date: day {day} of month {month}"

    def distance(d: date) -> int:
        return abs((d - reference_date).days)

    nearest = min(candidates, key=distance)
    # Prefer a past reading when a future one is not clearly nearer:
    # a DPR reporting completion refers to work already done.
    past = [c for c in candidates if c <= reference_date]
    if past:
        nearest_past = max(past)
        if distance(nearest_past) <= distance(nearest) + 31:
            nearest = nearest_past

    if distance(nearest) > YEARLESS_AMBIGUITY_DAYS:
        return None, (
            f"ambiguous year-less date {day:02d}/{month:02d} in a report dated "
            f"{reference_date.isoformat()} - nearest reading {nearest.isoformat()} "
            f"is {distance(nearest)} days away; not resolved"
        )
    return nearest, None


def extract_dates_with_basis(
    text: str, reference_date: Optional[date] = None
) -> tuple[list[tuple[date, DateBasis]], list[str]]:
    """Extract dates in encounter order with the basis of each, plus warnings
    for anything that could not be resolved safely.

    A date written in the span is EXPLICIT; "yesterday"/"today"/"tomorrow"
    resolved against the report date is RELATIVE_RESOLVED. Neither is
    DEFAULTED_TO_REPORT_DATE - that basis belongs to a date the span never
    carried, and only the caller that substitutes the report date can assign
    it.
    """
    dates: list[tuple[date, DateBasis]] = []
    seen: set[date] = set()
    warnings: list[str] = []

    def _add(d: date, basis: DateBasis = DateBasis.EXPLICIT) -> None:
        if d not in seen:
            seen.add(d)
            dates.append((d, basis))

    ref = reference_date or date.today()

    for m in DATE_ISO_RE.finditer(text):
        try:
            _add(date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        except ValueError:
            pass

    for m in DATE_DMY_ALPHA_RE.finditer(text):
        day, mon_str, year = m.groups()
        mon = MONTH_MAP.get(mon_str[:3].lower())
        if not mon:
            continue
        if year:
            try:
                _add(date(int(year), mon, int(day)))
            except ValueError:
                pass
        else:
            resolved, warning = resolve_yearless_date(int(day), mon, ref)
            if resolved is not None:
                _add(resolved)
            elif warning:
                warnings.append(warning)

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
            _add(ref - timedelta(days=1), DateBasis.RELATIVE_RESOLVED)
        elif word == "today":
            _add(ref, DateBasis.RELATIVE_RESOLVED)
        elif word == "tomorrow":
            _add(ref + timedelta(days=1), DateBasis.RELATIVE_RESOLVED)
        # "last week", "this week", "next week" are too vague to resolve

    return dates, warnings


def extract_dates_with_flags(
    text: str, reference_date: Optional[date] = None
) -> tuple[list[date], list[str]]:
    """Extract dates in encounter order, plus warnings for anything that
    could not be resolved safely. Basis-free view of
    extract_dates_with_basis for callers that only need the values."""
    dated, warnings = extract_dates_with_basis(text, reference_date)
    return [d for d, _basis in dated], warnings


def extract_dates(text: str, reference_date: Optional[date] = None) -> list[date]:
    """Extract all dates from free text. Returns them in encounter order."""
    return extract_dates_with_flags(text, reference_date)[0]


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
