"""Activity-type vocabulary — ROADMAP §11, D-052.

The hardest assertion in this file is the last class: **the vocabulary must not
have changed matching**. If `eval.py`'s headline moves, it has been wired in
somewhere it should not have been.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from matching import vocabulary as vocab
from matching.vocabulary import (
    DISCIPLINE_BY_PREFIX,
    UNICLASS_BY_TYPE_CODE,
    resolve,
    vocabulary,
)


@pytest.fixture(scope="module")
def voc():
    return vocabulary()


# ── It is built from real data ──────────────────────────────────────────────

class TestBuiltFromTheBaseline:
    def test_every_type_traces_to_a_real_activity(self, voc):
        """Derived from activity ids, not hand-typed, so it cannot drift."""
        assert voc["counts"]["activity_types"] == 56
        for t in voc["activity_types"]:
            assert t["activity_count"] >= 1
            assert t["examples"]

    def test_only_the_six_disciplines_appear(self, voc):
        seen = {t["discipline"] for t in voc["activity_types"]}
        assert seen <= set(DISCIPLINE_BY_PREFIX.values())
        assert "unknown" not in seen

    def test_codes_are_discipline_prefixed_and_unique(self, voc):
        codes = [t["code"] for t in voc["activity_types"]]
        assert len(codes) == len(set(codes))
        for code in codes:
            assert code.split("-", 1)[0] in DISCIPLINE_BY_PREFIX

    def test_the_known_epc_types_are_present(self, voc):
        codes = {t["code"] for t in voc["activity_types"]}
        for expected in ("PIP-HYT", "PIP-ERC", "PIP-SPL", "SEQ-TKN", "INS-LOOP"):
            assert expected in codes


# ── Standard coverage is reported, not inflated ─────────────────────────────

class TestStandardCoverageIsHonest:
    def test_coverage_is_partial_and_stated(self, voc):
        """Uniclass is a BUILDING taxonomy. Most EPC work has no entry, and the
        response says so rather than implying full coverage."""
        assert 0.0 < voc["standard_coverage"] < 1.0
        assert voc["counts"]["with_standard_code"] < voc["counts"]["activity_types"]

    def test_hydrotest_has_no_standard_code(self, voc):
        """The specific overclaim this design refuses: mapping PIP-HYT onto
        Ac_10_40_67 'Plumbing' would raise coverage and lower truth."""
        hyt = next(t for t in voc["activity_types"] if t["code"] == "PIP-HYT")
        assert hyt["standard_code"] is None
        assert hyt["standard_source"] is None

    def test_a_mapped_type_carries_the_real_standard_label(self, voc):
        """Where a mapping exists it resolves to the actual published title."""
        erc = next(t for t in voc["activity_types"] if t["code"] == "PIP-ERC")
        if erc["standard_code"]:                       # corpus present
            assert erc["standard_code"] == UNICLASS_BY_TYPE_CODE["PIP-ERC"]
            assert erc["standard_label"] == "Pipe fitting"
            assert erc["standard_source"] == "uniclass"

    def test_hse_and_static_equipment_carry_no_cfihos_code(self, voc):
        """CFIHOS has no macro discipline for either. Absent, not approximated."""
        for t in voc["activity_types"]:
            if t["discipline"] in ("hse", "static_equipment"):
                assert t["standard_source"] != "cfihos"

    def test_each_source_declares_availability_and_a_reason(self, voc):
        for name in ("project", "uniclass", "cfihos"):
            src = voc["sources"][name]
            assert isinstance(src["available"], bool)
            assert len(src["detail"]) > 40


# ── Ambiguous labels are declared ───────────────────────────────────────────

class TestAmbiguousLabels:
    def test_multi_heading_types_are_flagged(self, voc):
        """17 of 56 codes cover more than one heading. Picking one silently
        would mislabel the rest."""
        assert voc["counts"]["types_with_an_ambiguous_label"] == 17

    def test_civ_fdn_declares_all_three_headings(self, voc):
        fdn = next(t for t in voc["activity_types"] if t["code"] == "CIV-FDN")
        assert fdn["label_is_unambiguous"] is False
        assert len(fdn["label_variants"]) == 4
        for heading in ("Pedestal Concreting", "Slab-on-Grade",
                        "Equipment Foundation Concreting", "Tank Foundation Ringwall"):
            assert heading in fdn["label_variants"], heading

    def test_a_single_heading_type_is_marked_unambiguous(self, voc):
        single = [t for t in voc["activity_types"] if len(t["label_variants"]) == 1]
        assert single
        assert all(t["label_is_unambiguous"] for t in single)


# ── The resolver ────────────────────────────────────────────────────────────

class TestResolver:
    def test_known_descriptions_resolve_to_expected_types(self):
        cases = [
            ("Hydrotest — 24\"-P-1001-A1A", "PIP-HYT"),
            ("Spool Erection on the 24 inch header", "PIP-ERC"),
            ("Loop Check — All Instruments", "INS-LOOP"),
            ("Tank TK-1 Shell Erection", "SEQ-TKN"),
        ]
        for description, expected in cases:
            found = resolve(description)
            assert found is not None, description
            assert found.code == expected, description

    def test_every_label_variant_resolves_not_just_the_chosen_label(self):
        """Indexing only `label` would leave "Pedestal Concreting"
        unresolvable purely because "Slab-on-Grade" was the more common head."""
        for text in ("Pedestal Concreting", "Slab-on-Grade", "Equipment Foundation Concreting"):
            found = resolve(f"{text} completed today")
            assert found is not None, text
            assert found.code == "CIV-FDN", text

    def test_an_activity_id_beats_the_prose(self):
        """The id encodes the type as a fact; prose is an inference."""
        found = resolve("something entirely unrelated", activity_id="PIP-HYT-1041")
        assert found is not None and found.code == "PIP-HYT"

    def test_no_match_returns_none_never_a_nearest_guess(self):
        """A wrong activity type on a lesson learned is worse than none."""
        for text in ("the weather was bad today", "", "   ", "zzzz"):
            assert resolve(text) is None

    def test_an_unknown_activity_id_falls_back_to_the_text(self):
        found = resolve("Hydrotest complete", activity_id="XXX-YYY-9999")
        assert found is not None and found.code == "PIP-HYT"

    def test_the_resolver_is_deterministic(self):
        text = "Cable Termination — HT and some more words"
        first = resolve(text)
        assert all(resolve(text).code == first.code for _ in range(20))

    def test_a_longer_phrase_wins_over_a_substring_of_it(self):
        """Ordering is by keyword length, so the specific beats the general."""
        found = resolve("Spool Fabrication for the 24 inch header")
        assert found is not None and found.code == "PIP-SPL"


# ── The constraint that matters most ────────────────────────────────────────

class TestNotWiredIntoMatching:
    """If any of these fail, the vocabulary has leaked into scoring."""

    def test_the_response_declares_it_is_not_wired_in(self, voc):
        assert voc["wired_into_matching"] is False
        assert "NOT used by the matcher" in voc["note"]

    def test_no_matching_module_imports_the_vocabulary(self):
        """The real guard. Parse the engine, retriever, features and config —
        an import here is the change this step was told not to make.

        This reads the AST rather than grepping for the substring. The first
        version searched the raw source, which meant a comment using
        "vocabulary" as an ordinary English word — `retrieval.py` has "schedule
        vocabulary is APPENDED to the query side only" — failed the test while
        the constraint it guards was perfectly intact. A guard that fires on
        prose is one people learn to switch off, which would have cost the
        real protection.
        """
        import ast

        base = Path(__file__).resolve().parent
        for name in ("engine.py", "retrieval.py", "features.py", "config.py",
                     "schedule_index.py", "learned.py"):
            path = base / name
            if not path.exists():
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=name)

            for node in ast.walk(tree):
                # `import matching.vocabulary` / `import vocabulary`
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        assert "vocabulary" not in alias.name.split("."), (
                            f"{name} imports the vocabulary"
                        )
                # `from matching.vocabulary import ...` / `from .vocabulary import ...`
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    assert "vocabulary" not in module.split("."), (
                        f"{name} imports from the vocabulary"
                    )
                    # Checked for EVERY from-import, not only `from matching`:
                    # a bare relative `from . import vocabulary` has
                    # node.module None, and gating on the module name let it
                    # through.
                    for alias in node.names:
                        assert alias.name != "vocabulary", (
                            f"{name} imports the vocabulary module"
                        )
                # Any `vocabulary.something` attribute access in real code.
                elif isinstance(node, ast.Attribute):
                    value = node.value
                    if isinstance(value, ast.Name) and value.id == "vocabulary":
                        raise AssertionError(f"{name} calls into the vocabulary")

    def test_the_alias_channel_is_still_off(self):
        """The vocabulary must not have been used as a way to switch it on."""
        from matching.config import RetrievalConfig

        assert RetrievalConfig().w_alias == 0.0
        assert RetrievalConfig().use_alias is False

    def test_the_vocabulary_itself_pulls_in_no_matcher_machinery(self):
        """The module's own imports are csv, json, re, dataclasses, pathlib.

        Note the honest limit: `import matching.vocabulary` DOES load the
        matcher, because `matching/__init__.py` eagerly imports the engine and
        the schedule index. That is a property of the package, not of this
        module, and fixing it means restructuring `__init__` — out of scope for
        a step told to change nothing about matching. What is asserted here is
        that the vocabulary contributes none of that weight itself.
        """
        source = (Path(__file__).resolve().parent / "vocabulary.py").read_text(
            encoding="utf-8"
        )
        import re as _re

        imported = set(_re.findall(r"^(?:from|import)\s+([\w.]+)", source, _re.M))
        heavy = {m for m in imported
                 if m.split(".")[0] in {"numpy", "sentence_transformers", "torch",
                                        "rank_bm25", "rapidfuzz", "sklearn"}}
        assert not heavy, heavy
        for module in ("matching.engine", "matching.retrieval", "matching.features"):
            assert module not in imported


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
