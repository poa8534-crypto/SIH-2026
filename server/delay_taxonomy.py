"""Delay taxonomy: what a delay was, and whose problem it is.

ARCHITECTURE.md §2.7 specified a ten-category delay taxonomy and it was never
built - `Audit-1.md` F-04 verified that a grep for `DRAWING_RFI` returned
nothing. What shipped instead was a twelve-phrase substring list in
`server/raid.py`, feeding a register `category` string and a frequency count.

This module is that contract, built. It holds three separate mappings and
keeps them separate on purpose:

  phrase -> DelayCategory     what kind of delay the field text describes
  DelayCategory -> Liability  which party carries it, by default
  phrase -> register category the pre-existing RAID `category` string

The third exists unchanged so that moving the vocabulary here changes no
behaviour. `propose_candidates()` still puts "equipment" on a crane breakdown,
because that is what the register has always recorded and a RAID category is
not a liability finding.

TWO RULES GOVERN THIS MODULE
----------------------------

**1. Liability is deterministic and never inferred by a model.** `LIABILITY`
below is a table in source. An LLM may be asked to suggest a *category* for
text the phrase list does not recognise - that is classification, which is
what a model is good at - but the step from category to liability is a lookup,
reviewable in a diff, identical on every run. This is D-006's rule applied one
level up: a hallucinated tag corrupts a link, and a hallucinated liability
corrupts a contractual position.

**2. An unknowable liability is `CONTESTED`, not a guess.** Three categories
deliberately have no default. Material sits with whoever procured it and a
permit with whoever was contractually obliged to obtain it; neither fact is
recoverable from the sentence in a daily progress report. `OTHER` is the same
admission for anything the taxonomy does not cover. A planner rules on those,
and the ruling is audited (see the Phase 2 adjudication endpoint). Defaulting
them would produce a number that looks like a finding and is not one.

Nothing here reads or writes the database, and nothing here is called during
matching. Pure data and pure functions, so the mappings can be asserted
directly in tests.
"""

from __future__ import annotations

from enum import Enum


class DelayCategory(str, Enum):
    """The ten categories of ARCHITECTURE.md §2.7, verbatim.

    `str, Enum` so a member serialises as its own name through Pydantic and
    SQLAlchemy without a conversion step, the same choice
    `extraction.models.DateBasis` makes for the same reason.
    """

    MATERIAL = "MATERIAL"
    MANPOWER = "MANPOWER"
    DRAWING_RFI = "DRAWING_RFI"
    PERMIT_HSE = "PERMIT_HSE"
    WEATHER = "WEATHER"
    EQUIPMENT = "EQUIPMENT"
    CLIENT_HOLD = "CLIENT_HOLD"
    REWORK_NCR = "REWORK_NCR"
    FRONT_NOT_AVAILABLE = "FRONT_NOT_AVAILABLE"
    OTHER = "OTHER"


class Liability(str, Enum):
    """Who carries a delay, in the vocabulary a contract uses.

    The three real outcomes plus an explicit refusal to choose:

      COMPENSABLE      the owner's responsibility. The contractor is entitled
                       to time AND cost.
      NON_COMPENSABLE  the contractor's responsibility. Liquidated damages
                       apply; this is the bucket a claim is defended against.
      EXCUSABLE        neither party. Time is granted, cost is not.
      CONTESTED        not determinable from the evidence alone. A planner
                       decides, and the decision is recorded rather than
                       inferred.
    """

    COMPENSABLE = "COMPENSABLE"
    NON_COMPENSABLE = "NON_COMPENSABLE"
    EXCUSABLE = "EXCUSABLE"
    CONTESTED = "CONTESTED"


#: Category -> the party who carries it by default.
#:
#: MATERIAL and PERMIT_HSE are contested BY DESIGN, not by omission. Material
#: is owner-supplied on some packages and contractor-procured on others, and a
#: statutory permit may sit with either party depending on the contract; the
#: sentence "material delay" in a daily report settles neither. OTHER is the
#: same admission for text the taxonomy does not classify.
LIABILITY: dict[DelayCategory, Liability] = {
    DelayCategory.DRAWING_RFI: Liability.COMPENSABLE,
    DelayCategory.CLIENT_HOLD: Liability.COMPENSABLE,
    DelayCategory.FRONT_NOT_AVAILABLE: Liability.COMPENSABLE,
    DelayCategory.EQUIPMENT: Liability.NON_COMPENSABLE,
    DelayCategory.MANPOWER: Liability.NON_COMPENSABLE,
    DelayCategory.REWORK_NCR: Liability.NON_COMPENSABLE,
    DelayCategory.WEATHER: Liability.EXCUSABLE,
    DelayCategory.MATERIAL: Liability.CONTESTED,
    DelayCategory.PERMIT_HSE: Liability.CONTESTED,
    DelayCategory.OTHER: Liability.CONTESTED,
}

#: Delay vocabulary, moved here from `server/raid.py` unchanged.
#:
#: One list, so the Memory screen's causes, the RAID candidates and the
#: attribution report can never name different things - the reason it was a
#: single list in the first place (D-048).
#:
#: It is a substring list and not a taxonomy: `Audit-1.md` F-04 measured it
#: against real causal text and found it recognises only what the synthetic
#: corpus already says. "Hydra not available" matches nothing here. The
#: mapping below is what gives those phrases a taxonomy; widening the
#: RECOGNITION is the LLM classifier's job, guarded by EXTRACTION_PROVIDER
#: exactly as extraction already is (D-005).
DELAY_KEYWORDS = (
    "crane breakdown", "rain delay", "piling rig breakdown",
    "fencing conflict", "holiday delay", "crane issue",
    "material delay", "labour shortage", "design change",
    "weather", "monsoon", "flooding",
)

#: Phrase -> §2.7 category.
#:
#: Two of these are judgement calls worth stating rather than burying:
#:
#: "design change" -> DRAWING_RFI. A design change reaching site as a delay is
#: an engineering-side instruction, which is what DRAWING_RFI covers. It is
#: not REWORK_NCR: rework follows a non-conformance the contractor caused.
#:
#: "fencing conflict" -> OTHER, deliberately NOT FRONT_NOT_AVAILABLE. A blocked
#: work front is compensable only when the OWNER withheld it, and the phrase
#: does not say who owned the fence. On the demo corpus the blocking work
#: (CIV-FNC-1016, Fence & Gate) is itself a scheduled activity, so reading this
#: as an owner-withheld front would manufacture a compensable claim out of an
#: internal interface clash. It routes to a planner instead.
PHRASE_CATEGORY: dict[str, DelayCategory] = {
    "crane breakdown": DelayCategory.EQUIPMENT,
    "crane issue": DelayCategory.EQUIPMENT,
    "piling rig breakdown": DelayCategory.EQUIPMENT,
    "rain delay": DelayCategory.WEATHER,
    "weather": DelayCategory.WEATHER,
    "monsoon": DelayCategory.WEATHER,
    "flooding": DelayCategory.WEATHER,
    "material delay": DelayCategory.MATERIAL,
    "labour shortage": DelayCategory.MANPOWER,
    "design change": DelayCategory.DRAWING_RFI,
    "fencing conflict": DelayCategory.OTHER,
    "holiday delay": DelayCategory.OTHER,
}

#: Phrase -> the RAID register's `category` string, moved from `server/raid.py`
#: byte-for-byte.
#:
#: This is NOT the taxonomy above and must not be merged into it. A register
#: category groups an issue for a governance board ("equipment", "supply");
#: a DelayCategory is a contractual classification. They disagree on purpose:
#: "fencing conflict" is an "interface" issue on the register and an OTHER -
#: therefore CONTESTED - delay in the taxonomy. Anything unlisted is "other",
#: an honest bucket rather than a guessed one.
REGISTER_CATEGORY: dict[str, str] = {
    "crane breakdown": "equipment", "crane issue": "equipment",
    "piling rig breakdown": "equipment",
    "rain delay": "weather", "weather": "weather",
    "monsoon": "weather", "flooding": "weather", "holiday delay": "calendar",
    "material delay": "supply", "labour shortage": "resource",
    "design change": "design", "fencing conflict": "interface",
}


def category_for_phrase(phrase: str) -> DelayCategory:
    """The §2.7 category a recognised delay phrase belongs to.

    Falls back to `OTHER` - and therefore to `CONTESTED` - for anything the
    phrase list does not carry, which is the honest answer for text nobody has
    classified yet.
    """
    return PHRASE_CATEGORY.get(phrase.strip().lower(), DelayCategory.OTHER)


def liability_for(category: DelayCategory | str) -> Liability:
    """Which party carries a category, by default.

    "By default" is load-bearing: this is the proposal a planner adjudicates,
    never the finding itself. An unrecognised category is `CONTESTED` rather
    than an error, so a category added to the taxonomy without a liability
    entry fails safe.
    """
    if not isinstance(category, DelayCategory):
        try:
            category = DelayCategory(str(category).strip().upper())
        except ValueError:
            return Liability.CONTESTED
    return LIABILITY.get(category, Liability.CONTESTED)


def parse_liability(value: str) -> Liability:
    """A liability named by a client, or `ValueError`.

    Accepts the enum's own values case-insensitively and nothing else. A
    planner's ruling is the one value in this system that a human types
    directly, so it is validated rather than coerced: silently turning an
    unrecognised string into CONTESTED would record a decision nobody made.
    """
    try:
        return Liability(str(value).strip().upper())
    except ValueError:
        raise ValueError(
            f"'{value}' is not a liability. "
            f"Expected one of: {', '.join(l.value for l in Liability)}"
        ) from None


def register_category_for_phrase(phrase: str) -> str:
    """The RAID register `category` string for a delay phrase.

    Preserves the pre-existing `_CATEGORY.get(phrase, "other")` behaviour
    exactly, including the "other" fallback.
    """
    return REGISTER_CATEGORY.get(phrase, "other")


def liability_for_phrase(phrase: str) -> Liability:
    """Convenience for the common path: field phrase straight to a proposal."""
    return liability_for(category_for_phrase(phrase))
