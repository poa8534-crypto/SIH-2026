"""The delay taxonomy and its liability map (ARCHITECTURE.md §2.7).

These assert a table rather than a behaviour, deliberately. The table IS the
feature: the step from a delay category to a contractual liability is a lookup
in source precisely so that it can be reviewed in a diff and asserted here,
instead of being produced by a model that answers differently on Tuesday.

Two properties matter more than any individual row:

  1. No category is silently missing a liability.
  2. The three genuinely unknowable ones stay CONTESTED, so nothing
     manufactures a claim out of a sentence that does not support one.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from server import delay_taxonomy as dt
from server.delay_taxonomy import DelayCategory, Liability


class TestTheTaxonomyMatchesTheSpecification:
    def test_the_ten_categories_of_architecture_2_7(self):
        assert {c.value for c in DelayCategory} == {
            "MATERIAL", "MANPOWER", "DRAWING_RFI", "PERMIT_HSE", "WEATHER",
            "EQUIPMENT", "CLIENT_HOLD", "REWORK_NCR", "FRONT_NOT_AVAILABLE",
            "OTHER",
        }

    def test_every_category_has_a_liability(self):
        """A category added without a liability entry is the failure mode this
        catches - `liability_for` would fall back to CONTESTED and the gap
        would never surface."""
        for category in DelayCategory:
            assert category in dt.LIABILITY, f"{category.value} has no liability"


class TestLiabilityIsDeterministic:
    @pytest.mark.parametrize("category,expected", [
        (DelayCategory.DRAWING_RFI, Liability.COMPENSABLE),
        (DelayCategory.CLIENT_HOLD, Liability.COMPENSABLE),
        (DelayCategory.FRONT_NOT_AVAILABLE, Liability.COMPENSABLE),
        (DelayCategory.EQUIPMENT, Liability.NON_COMPENSABLE),
        (DelayCategory.MANPOWER, Liability.NON_COMPENSABLE),
        (DelayCategory.REWORK_NCR, Liability.NON_COMPENSABLE),
        (DelayCategory.WEATHER, Liability.EXCUSABLE),
    ])
    def test_the_settled_categories(self, category, expected):
        assert dt.liability_for(category) is expected

    @pytest.mark.parametrize("category", [
        DelayCategory.MATERIAL,
        DelayCategory.PERMIT_HSE,
        DelayCategory.OTHER,
    ])
    def test_the_unknowable_categories_stay_contested(self, category):
        """Material sits with whoever procured it and a permit with whoever was
        obliged to obtain it. A daily progress report does not say which, so
        neither gets a default - a planner rules, and the ruling is audited."""
        assert dt.liability_for(category) is Liability.CONTESTED

    def test_an_unknown_category_fails_safe(self):
        assert dt.liability_for("NOT_A_CATEGORY") is Liability.CONTESTED

    def test_a_category_given_as_a_string_resolves(self):
        assert dt.liability_for("weather") is Liability.EXCUSABLE
        assert dt.liability_for("EQUIPMENT") is Liability.NON_COMPENSABLE


class TestPhraseClassification:
    @pytest.mark.parametrize("phrase,expected", [
        ("piling rig breakdown", DelayCategory.EQUIPMENT),
        ("crane breakdown", DelayCategory.EQUIPMENT),
        ("crane issue", DelayCategory.EQUIPMENT),
        ("rain delay", DelayCategory.WEATHER),
        ("monsoon", DelayCategory.WEATHER),
        ("flooding", DelayCategory.WEATHER),
        ("labour shortage", DelayCategory.MANPOWER),
        ("material delay", DelayCategory.MATERIAL),
        ("design change", DelayCategory.DRAWING_RFI),
    ])
    def test_recognised_phrases(self, phrase, expected):
        assert dt.category_for_phrase(phrase) is expected

    def test_a_fencing_conflict_is_not_read_as_an_owner_withheld_front(self):
        """FRONT_NOT_AVAILABLE is compensable, so mapping this phrase onto it
        would manufacture a claim against the client out of a sentence that
        never named a responsible party. On the demo corpus the blocking work
        (CIV-FNC-1016, Fence & Gate) is itself a scheduled activity, so the
        clash is as likely internal as owner-caused. It goes to a planner."""
        assert dt.category_for_phrase("fencing conflict") is DelayCategory.OTHER
        assert dt.liability_for_phrase("fencing conflict") is Liability.CONTESTED

    def test_a_holiday_delay_is_contested_not_excusable(self):
        """A public holiday is usually already in the contract calendar, in
        which case it is not a delay at all. Excusable would grant an extension
        of time on no evidence."""
        assert dt.liability_for_phrase("holiday delay") is Liability.CONTESTED

    def test_unrecognised_text_is_other(self):
        """The phrase list recognises only what the synthetic corpus says -
        Audit-1.md F-04. Widening recognition is the classifier's job; until
        then the honest answer is OTHER."""
        assert dt.category_for_phrase("hydra not available") is DelayCategory.OTHER

    def test_classification_ignores_case_and_padding(self):
        assert dt.category_for_phrase("  Rain Delay  ") is DelayCategory.WEATHER

    def test_every_keyword_is_classified(self):
        """No phrase may reach the taxonomy only through the OTHER fallback
        without that being a deliberate entry in PHRASE_CATEGORY."""
        for phrase in dt.DELAY_KEYWORDS:
            assert phrase in dt.PHRASE_CATEGORY, f"{phrase!r} is unclassified"


class TestTheRegisterCategoryIsUnchanged:
    """Phase 0 moves the vocabulary and adds a taxonomy beside it. It must not
    move a single RAID register category, which is a governance grouping and
    not a contractual finding."""

    @pytest.mark.parametrize("phrase,expected", [
        ("crane breakdown", "equipment"),
        ("crane issue", "equipment"),
        ("piling rig breakdown", "equipment"),
        ("rain delay", "weather"),
        ("weather", "weather"),
        ("monsoon", "weather"),
        ("flooding", "weather"),
        ("holiday delay", "calendar"),
        ("material delay", "supply"),
        ("labour shortage", "resource"),
        ("design change", "design"),
        ("fencing conflict", "interface"),
    ])
    def test_the_register_categories_are_byte_for_byte(self, phrase, expected):
        assert dt.register_category_for_phrase(phrase) == expected

    def test_the_fallback_is_still_other(self):
        assert dt.register_category_for_phrase("hydra not available") == "other"

    def test_the_register_and_the_taxonomy_are_allowed_to_disagree(self):
        """Not an accident to be tidied away later. A fencing conflict is an
        interface issue for a governance board and an unclassified - therefore
        contested - delay for a claim."""
        assert dt.register_category_for_phrase("fencing conflict") == "interface"
        assert dt.category_for_phrase("fencing conflict") is DelayCategory.OTHER


class TestTheVocabularyStaysShared:
    def test_raid_re_exports_the_same_list(self):
        """D-048 kept one list so the Memory screen and the RAID candidates
        cannot name different things. Moving it must not fork it."""
        from server.raid import DELAY_KEYWORDS as raid_keywords

        assert raid_keywords is dt.DELAY_KEYWORDS

    def test_the_list_is_unchanged_by_the_move(self):
        assert dt.DELAY_KEYWORDS == (
            "crane breakdown", "rain delay", "piling rig breakdown",
            "fencing conflict", "holiday delay", "crane issue",
            "material delay", "labour shortage", "design change",
            "weather", "monsoon", "flooding",
        )
