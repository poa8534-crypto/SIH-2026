"""Deterministic slot filling for the conversational logging agent.

Everything here is pure: it takes text plus the session's structured context
and returns values. No database, no network, no clock — the project's data date
is supplied by the caller, so "yesterday" means yesterday relative to the
project, not to whatever machine happens to be running the server.

This is the fallback path, and it is the default path. The LLM in
`extraction/` is an optional interpreter layered on top (see
`server/agent_llm.py`); it can never reach the schedule, choose an activity or
learn an alias. If it is off, unreachable, slow or wrong, everything below
still completes a conversation on its own.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

# ── Disciplines ─────────────────────────────────────────────────────────────

# The six the schedule uses. Stored as the enum value, shown as the label —
# a supervisor will never type "static_equipment", and must never see it.
DISCIPLINE_LABELS: dict[str, str] = {
    "civil": "Civil",
    "piping": "Piping",
    "static_equipment": "Static Equipment",
    "electrical": "Electrical",
    "instrumentation": "Instrumentation",
    "hse": "HSE",
}

DISCIPLINE_VALUES = tuple(DISCIPLINE_LABELS)


def discipline_label(value: Optional[str]) -> Optional[str]:
    """Human label for a stored discipline value.

    Raises on an unknown value rather than letting a raw enum or a typo reach
    the UI — a wrong label is a bug we want to see in tests, not on a phone.
    """
    if value is None:
        return None
    try:
        return DISCIPLINE_LABELS[value]
    except KeyError:
        raise ValueError(f"Unknown discipline: {value!r}") from None


def discipline_choice_text() -> str:
    """The choices, in the order the schedule lists them."""
    labels = list(DISCIPLINE_LABELS.values())
    return ", ".join(labels[:-1]) + ", or " + labels[-1]


# Answers a supervisor actually types, beyond the labels themselves.
_DISCIPLINE_SYNONYMS: dict[str, str] = {
    "elec": "electrical", "electric": "electrical", "electricals": "electrical",
    "static equipment": "static_equipment", "staticequipment": "static_equipment",
    "static": "static_equipment", "equipment": "static_equipment",
    "mechanical": "static_equipment", "mech": "static_equipment",
    "instruments": "instrumentation", "instrument": "instrumentation",
    "instr": "instrumentation", "inst": "instrumentation",
    "safety": "hse", "ehs": "hse", "h&s": "hse",
    "pipe": "piping", "pipes": "piping",
}

# Words that merely describe work of a discipline, used only when the message
# is prose rather than a direct answer.
_DISCIPLINE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "civil": ("civil", "foundation", "concrete", "backfill", "grading", "slab",
              "flooring", "tile", "plaster", "drainage", "fencing", "pedestal",
              "excavat", "rebar", "formwork"),
    "piping": ("pipe", "spool", "flange", "hydrotest", "erection", "erect",
               "insulation", "coating", "paint", "header", "boltup", "bolt-up"),
    "static_equipment": ("vessel", "exchanger", "pump", "compressor", "skid",
                         "tank", "jacking", "grout", "nozzle"),
    "electrical": ("cable", "termination", "earthing", "grounding",
                   "transformer", "swgr", "switchgear", "panel", "energis",
                   "megger", "motor", "conduit", "glanding"),
    "instrumentation": ("instrument", "transmitter", "calibrat", "loop check",
                        "loop checking", "dcs", "sis", "esd", "junction box",
                        "control valve"),
    "hse": ("safety", "ncr", "near-miss", "near miss", "lti", "bbs",
            "scaffold", "permit", "jsa", "induction", "drill", "toolbox"),
}


def parse_discipline(text: str, *, as_answer: bool = False) -> Optional[str]:
    """Read a discipline from free text.

    `as_answer` means the message is a direct reply to "which discipline?", so
    a bare word like "Electrical" counts. Matching is case-insensitive: the
    parser previously compared against lowercase enum values only, so a
    supervisor answering "Electrical" was ignored and the agent asked the same
    question forever.
    """
    if not text:
        return None
    cleaned = text.strip().lower()
    cleaned = re.sub(r"[^a-z&\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Exact label or enum value.
    for value, label in DISCIPLINE_LABELS.items():
        if cleaned == label.lower() or cleaned == value or cleaned == value.replace("_", " "):
            return value
    # Known synonym, whole-string first then as a word.
    if cleaned in _DISCIPLINE_SYNONYMS:
        return _DISCIPLINE_SYNONYMS[cleaned]
    if as_answer:
        for phrase, value in _DISCIPLINE_SYNONYMS.items():
            if re.search(rf"\b{re.escape(phrase)}\b", cleaned):
                return value
        for value, label in DISCIPLINE_LABELS.items():
            if re.search(rf"\b{re.escape(label.lower())}\b", cleaned):
                return value

    # Prose: infer from the work described.
    for value, words in _DISCIPLINE_KEYWORDS.items():
        if any(w in cleaned for w in words):
            return value
    return None


# ── Status ──────────────────────────────────────────────────────────────────

STATUS_LABELS: dict[str, str] = {
    "completed": "Finished",
    "in_progress": "In progress",
    "delayed": "Delayed",
    "blocked": "Blocked",
    "not_started": "Not started",
}

_STATUS_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # Order matters: "not started" must beat "started".
    ("not_started", ("not started", "not yet started", "no progress", "yet to start")),
    ("blocked", ("blocked", "on hold", "stopped", "halted", "waiting on", "held up")),
    ("delayed", ("delay", "delayed", "behind schedule", "behind", "slipped")),
    ("completed", ("completed", "complete", "done", "finished", "finish",
                   "closed", "passed", "khotom", "over")),
    ("in_progress", ("started", "resumed", "ongoing", "in progress", "underway",
                     "continuing", "progressing", "chalu", "shuru")),
)


def parse_status(text: str) -> Optional[str]:
    """Read a status from free text."""
    if not text:
        return None
    low = text.lower()
    for value, words in _STATUS_PATTERNS:
        if any(w in low for w in words):
            return value
    return None


# ── Quantity ────────────────────────────────────────────────────────────────

_WORD_NUMBERS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
}

# Units the schedule actually measures in, plus the plural nouns a supervisor
# says instead ("spools", "flanges") which imply a countable unit.
_UNITS = ("m3", "m2", "sqm", "cum", "lm", "mt", "km", "mm", "nos", "no",
          "tonnes", "tonne", "ton", "tons", "m")
_COUNTABLE_NOUNS = ("spool", "spools", "flange", "flanges", "panel", "panels",
                    "joint", "joints", "pile", "piles", "valve", "valves",
                    "instrument", "instruments", "loop", "loops", "light",
                    "lights", "support", "supports", "pedestal", "pedestals")


@dataclass
class Quantity:
    """A completed amount, optionally out of a planned total."""

    completed: Optional[float] = None
    planned: Optional[float] = None
    uom: Optional[str] = None
    # Set when completed exceeds planned. Retained, never clamped: the number
    # the supervisor said is evidence, and quietly shrinking it would hide a
    # real disagreement from the planner.
    over_planned: bool = False


def _num(token: str) -> Optional[float]:
    token = token.strip().lower()
    if token in _WORD_NUMBERS:
        return float(_WORD_NUMBERS[token])
    try:
        return float(token)
    except ValueError:
        return None


_NUM = r"(\d+(?:\.\d+)?|[a-z]+)"
_UNIT_OPT = r"(?:\s*(?:{units}|{nouns}))?".format(
    units="|".join(_UNITS), nouns="|".join(_COUNTABLE_NOUNS)
)

# Ratio forms, most explicit first.
_RATIO_PATTERNS = (
    rf"completed\s+{_NUM}\s*,?\s*planned\s+{_NUM}",
    rf"{_NUM}{_UNIT_OPT}\s+out\s+of\s+{_NUM}{_UNIT_OPT}",
    rf"{_NUM}{_UNIT_OPT}\s+of\s+{_NUM}{_UNIT_OPT}",
    # Bare "6/18" only. The lookarounds keep a date like 14/09/2026 out:
    # a ratio has nothing numeric on either side of the pair.
    rf"(?<![\d/]){_NUM}\s*/\s*{_NUM}(?![\d\s]*[/-]\s*\d)",
)


def _find_unit(text: str) -> Optional[str]:
    low = text.lower()
    for noun in _COUNTABLE_NOUNS:
        if re.search(rf"\b{noun}\b", low):
            return "nos"
    for unit in _UNITS:
        if re.search(rf"\b{re.escape(unit)}\b", low):
            return "nos" if unit in ("no", "nos") else unit
    return None


def parse_quantity(text: str) -> Optional[Quantity]:
    """Read a completed / planned quantity from free text.

    Ratios are kept as two numbers. Collapsing "6 out of 18" into a single 6
    loses the denominator, and the denominator is what tells the roll-up
    whether the node is finished.
    """
    if not text:
        return None
    low = text.lower().replace("–", "-").replace("—", "-")

    for pattern in _RATIO_PATTERNS:
        m = re.search(pattern, low)
        if not m:
            continue
        a, b = _num(m.group(1)), _num(m.group(2))
        if a is None or b is None:
            continue
        # A date like 14/09 must not read as a ratio.
        if "/" in m.group(0) and (b > 31 or a > 31 or b == 0):
            continue
        if a < 0 or b < 0:
            return None
        if b == 0:
            # "6 out of 0" is not a total; treat as unparseable so the agent
            # asks again rather than storing a division-by-zero waiting to
            # happen.
            return None
        return Quantity(completed=a, planned=b, uom=_find_unit(text),
                        over_planned=a > b)

    # A single amount, with or without a unit.
    m = re.search(rf"\b{_NUM}\s*({'|'.join(_UNITS)}|{'|'.join(_COUNTABLE_NOUNS)})\b", low)
    if m:
        value = _num(m.group(1))
        if value is not None and value >= 0:
            return Quantity(completed=value, uom=_find_unit(m.group(0)))

    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*", low)
    if m:
        value = float(m.group(1))
        return Quantity(completed=value)
    return None


# Things this project counts. Singular or plural: "spool erection" is as
# countable as "6 spools", and the supervisor expects to be asked how many.
_COUNTABLE_STEMS = ("spool", "flange", "panel", "joint", "pile", "valve",
                    "instrument", "loop", "light", "support", "pedestal",
                    "vessel", "pump", "skid", "transmitter")


def mentions_countable(text: str) -> bool:
    """True when the update is about something the project counts.

    Decides whether a quantity is worth asking for at all: a milestone such as
    "safety induction conducted" has no quantity, and asking for one is noise.
    """
    if not text:
        return False
    low = text.lower()
    if any(re.search(rf"\b{stem}s?\b", low) for stem in _COUNTABLE_STEMS):
        return True
    return bool(re.search(r"\b\d+\s*(nos|no\.)\b", low))


# ── Dates ───────────────────────────────────────────────────────────────────

def _india_tz():
    """Asia/Kolkata, without requiring the tzdata package.

    zoneinfo has no bundled database on Windows, and this must not be the
    reason a demo machine fails to start. India observes no daylight saving,
    so a fixed +05:30 is exactly right whenever the IANA zone is unavailable.
    """
    try:
        return ZoneInfo("Asia/Kolkata")
    except Exception:  # noqa: BLE001 - ZoneInfoNotFoundError and friends
        return timezone(timedelta(hours=5, minutes=30), "IST")


IST = _india_tz()

_MONTHS = {m.lower(): i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}


class InvalidDate(Exception):
    """The text looked like a date but cannot be one."""


def parse_date(text: str, data_date: date) -> Optional[date]:
    """Resolve a date from free text, relative to the project's data date.

    Relative words are resolved against `data_date`, never against the
    machine's clock: the demo runs on a 2026 project on a machine whose today
    is something else entirely.
    """
    if not text:
        return None
    low = text.strip().lower()

    if "day before yesterday" in low:
        return data_date - timedelta(days=2)
    if "yesterday" in low:
        return data_date - timedelta(days=1)
    if "today" in low or "aaj" in low:
        return data_date
    if "tomorrow" in low:
        raise InvalidDate("a future date cannot be reported as progress")

    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", low)
    if m:
        return _build(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", low)
    if m:
        return _build(int(m.group(3)), int(m.group(2)), int(m.group(1)))

    m = re.search(r"\b(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})\b", low)
    if m and m.group(2)[:3] in _MONTHS:
        return _build(int(m.group(3)), _MONTHS[m.group(2)[:3]], int(m.group(1)))

    m = re.search(r"\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b", low)
    if m and m.group(1)[:3] in _MONTHS:
        return _build(int(m.group(3)), _MONTHS[m.group(1)[:3]], int(m.group(2)))
    return None


def _build(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError as e:
        raise InvalidDate(str(e)) from None


def now_ist() -> datetime:
    """Current time in the project's timezone."""
    return datetime.now(IST)


# ── Tags ────────────────────────────────────────────────────────────────────

def parse_tags(text: str) -> list[str]:
    """Equipment and line tags, via the same pre-pass the ingest path uses."""
    from extraction.prepass import EQUIPMENT_TAG_RE, PIPE_TAG_RE

    tags: list[str] = []
    for m in PIPE_TAG_RE.finditer(text):
        size, _, num, spec = m.groups()
        tags.append(f'{size}"-P-{num}-{spec.upper()}')
    for m in EQUIPMENT_TAG_RE.finditer(text):
        prefix, suffix = m.groups()
        tags.append(f"{prefix}-{suffix}")
    m = re.search(r"\bTK-(\d+)\b", text, re.IGNORECASE)
    if m:
        tags.append(f"TK-{m.group(1)}")
    # Preserve order, drop duplicates.
    seen: set[str] = set()
    out: list[str] = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


# ── Session context ─────────────────────────────────────────────────────────

@dataclass
class AgentContext:
    """Structured context the client already knows.

    Supplied as request data, never injected into the conversation as a fake
    supervisor message: the transcript has to stay a record of what a person
    actually said.
    """

    project_code: Optional[str] = None
    location: Optional[str] = None
    discipline: Optional[str] = None
    data_date: Optional[date] = None
    timezone: str = "Asia/Kolkata"

    def resolved_data_date(self, fallback: date) -> date:
        return self.data_date or fallback


# ── Questions ───────────────────────────────────────────────────────────────

# Wording is fixed here so a prompt cannot drift between the API and the tests.
QUESTIONS: dict[str, str] = {
    "discipline": "Which discipline does this work belong to?",
    "location": "Where is this work happening?",
    "status": "What is the status of this work?",
    "date": "Which date was it completed?",
    "quantity": "How many spools out of the planned quantity?",
    "planned_quantity": "How many were planned in total?",
}


def question_for(slot: str, *, countable_noun: str = "spools") -> str:
    """The question to ask for one missing slot, in supervisor language."""
    if slot == "quantity":
        return f"How many {countable_noun} out of the planned quantity?"
    return QUESTIONS[slot]


def choices_for(slot: str) -> Optional[str]:
    """The options to show alongside a question, if it has a closed set."""
    if slot == "discipline":
        return discipline_choice_text()
    if slot == "status":
        return "Finished, In progress, Delayed, Blocked, or Not started"
    return None


@dataclass
class SlotOutcome:
    """What one turn of parsing changed."""

    filled: list[str] = field(default_factory=list)
    clarification: Optional[str] = None
