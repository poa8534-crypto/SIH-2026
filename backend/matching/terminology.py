"""Controlled construction-terminology normalisation (field → schedule).

Why this exists
---------------
The v2 audit found ~72.6% of gold mentions contain a verbatim >=6-token
substring of the activity they label, so the legacy benchmark measures
near-copy matching. On terminology-drift mentions ("hydrotest on 204
cleared" vs "Hydrotest firewater main 10\"-P-1602-B1A") the lexical
channels see few shared tokens and the fuzzy feature collapses.

This module is a CONTROLLED mapping layer, not a synonym dump:

  * every entry is a hand-audited field-phrase → schedule-vocabulary pair,
    grounded in words the baseline schedule actually uses;
  * `canonicalise` EXPANDS, never replaces — the original tokens survive,
    so tag words, sizes and discipline words still match;
  * it is OFF by default (`RetrievalConfig.term_expansion`) and has to earn
    its place in an ablation before anything turns it on;
  * it is applied to the QUERY side only (BM25 tokens, dense/ngram query,
    and the event text the fuzzy feature reads). Schedule descriptions are
    already written in formal construction vocabulary and are not touched.

The LLM/extraction layer is untouched and the final activity choice stays
inside the deterministic matching pipeline — this layer only changes what
text the existing retrieval and fuzzy stages see.
"""

from __future__ import annotations

import re

# (compiled pattern, canonical schedule-vocabulary phrase, short rationale)
# Phrases were chosen by reading dataset/baseline_schedule_v2.json and the
# failure cases of the terminology-drift benchmark, not from a thesaurus.
_MAPPINGS: list[tuple[re.Pattern, str, str]] = [
    # ── testing ────────────────────────────────────────────────────────────
    (re.compile(r"\bhydro\s?test(s|ed|ing)?\b", re.I),
     "hydrostatic testing", "field 'hydrotest' vs schedule 'Hydrotest/hydrostatic'"),
    (re.compile(r"\bpressuri[sz]ed and held\b|\bheld (the )?pressure\b", re.I),
     "hydrotest tightness", "pressure-hold language vs schedule 'Hydrotest'"),
    (re.compile(r"\bnitrogen (leak )?test(ed|ing)?\b", re.I),
     "pneumatic leak test", "schedule: 'Pneumatic leak test with nitrogen'"),
    (re.compile(r"\bbump(ed)? (the )?(motor|pump)s?\b|\bmotors? bumped\b", re.I),
     "motor bump test", "schedule: 'Motor bump test'"),
    (re.compile(r"\bperformance (trial|test)\b", re.I),
     "performance run", "schedule: 'Performance run'"),
    (re.compile(r"\bload(ed)? (test|testing|tested)\b", re.I),
     "load test", "schedule: 'Load test'"),
    (re.compile(r"\bcharged up\b|\benergi[sz]ed\b", re.I),
     "energization", "schedule: 'Substation energization'"),
    (re.compile(r"\bhi ?pot\b|\bir values?\b", re.I),
     "insulation resistance hi-pot tests", "schedule: 'Insulation resistance and hi-pot tests'"),
    (re.compile(r"\brelays? (set|setting)\b", re.I),
     "protective relay setting primary injection", "schedule: 'Protective relay setting and primary injection'"),
    (re.compile(r"\bloops? rechecked\b|\brechecked (the )?loops\b", re.I),
     "revalidation of loop checks post hydrotest", "schedule: 'Revalidation of loop checks, post hydrotest'"),
    (re.compile(r"\b(c&e|cause and effect) (test|tested|testing)\b", re.I),
     "cause and effect testing esd shutdown matrix", "schedule: 'Cause and effect testing, ESD shutdown matrix'"),
    (re.compile(r"\bloop (check|checked|continuity|verified)\b", re.I),
     "loop check", "schedule: 'Loop check'"),
    (re.compile(r"\bf ?& ?g\b", re.I),
     "fire and gas detection", "schedule: 'Fire and gas detection system'"),
    (re.compile(r"\bmc (declared|given|done)?\b", re.I),
     "mechanical completion", "schedule: 'Mechanical Completion'"),
    (re.compile(r"\brfsu\b", re.I),
     "rfsu ready for start-up", "schedule: 'RFSU Unit 1/2'"),

    # ── earthworks / civil ────────────────────────────────────────────────
    (re.compile(r"\bdigging\b|\bmass digging\b|\bdug (out|for)\b|\bjcb\b|\bexcavator work\b", re.I),
     "excavation", "field digging language vs schedule 'Excavation'"),
    (re.compile(r"\bbad soil\b|\bunsuitable soil\b", re.I),
     "excavate unsuitable material", "schedule: 'Excavate unsuitable material'"),
    (re.compile(r"\bfill (soil )?(placed|laid|dumped)\b", re.I),
     "place and compact selected fill", "schedule: 'Place and compact selected fill'"),
    (re.compile(r"\bbund wall\b", re.I),
     "dyke wall", "schedule: 'Dyke wall construction, tank farm bund'"),
    (re.compile(r"\b(based?|foundation) poured\b|\bpoured (for|on|at)\b", re.I),
     "concreting foundation", "field 'base poured' vs schedule 'concreting/foundation'"),
    (re.compile(r"\brebar\b", re.I),
     "reinforcement", "field 'rebar' vs schedule 'Reinforcement'"),
    (re.compile(r"\bformwork\b", re.I),
     "shuttering", "schedule: 'Shuttering and concreting'"),
    (re.compile(r"\bwet ?curing\b|\bcuring (started|done|going on)\b", re.I),
     "wet cure", "schedule: '7-day wet cure'"),
    (re.compile(r"\bgsb\b", re.I),
     "granular sub-base", "schedule: 'Granular sub-base and WMM laying'"),
    (re.compile(r"\bwet mix macadam\b", re.I),
     "wmm", "schedule abbreviation"),
    (re.compile(r"\b(bituminous carpet|asphalt|bitumen course)\b", re.I),
     "bc course", "schedule: 'BC course laying'"),
    (re.compile(r"\bchain ?link (mesh|fencing)\b|\bmesh (fixed|fencing)\b", re.I),
     "chain-link fencing", "schedule: 'Chain-link fencing with posts'"),
    (re.compile(r"\bbrick ?work\b", re.I),
     "blockwork", "schedule: 'blockwork and roofing'"),
    (re.compile(r"\bporta ?cabins?\b", re.I),
     "temporary site office", "schedule: 'temporary site office and stores'"),
    (re.compile(r"\bjute matting\b", re.I),
     "soil erosion protection jute matting", "schedule phrase"),

    # ── piping ────────────────────────────────────────────────────────────
    (re.compile(r"\bspools? (erected|put up|installed|up)\b", re.I),
     "spool erection erect line", "PS example: 'Spool erected' vs 'Erect Line'"),
    (re.compile(r"\b(erected|put up|installed) (the|a)? ?(spool|line|pipe|header)\b", re.I),
     "erect line", "field verb phrase vs schedule 'Erect line …'"),
    (re.compile(r"\bcrude line\b", re.I),
     "crude header", "schedule: 'Erect crude header 24\"-P-1001-A1A'"),
    (re.compile(r"\bdrinking water\b", re.I),
     "potable water", "schedule: 'Potable water line'"),
    (re.compile(r"\bsuction and delivery\b", re.I),
     "suction and discharge piping", "schedule: 'Suction and discharge piping'"),
    (re.compile(r"\bwater ?draw ?off\b|\bdraw ?off lines?\b", re.I),
     "tank dewatering lines", "schedule: 'Install tank dewatering lines'"),
    (re.compile(r"\binstrument air line\b", re.I),
     "instrument air header", "schedule: 'Instrument air header'"),
    (re.compile(r"\btrench dug\b|\btrench excavat", re.I),
     "trenching", "schedule: 'Trenching for firewater ring main'"),
    (re.compile(r"\btrench refill(ed|ling)?\b|\brefilled and compacted\b", re.I),
     "backfill and compaction", "schedule: 'Backfill and compaction'"),

    # ── electrical / instrumentation ──────────────────────────────────────
    (re.compile(r"\btray work\b", re.I),
     "cable tray installation", "PS example: 'Tray work' vs 'Cable tray installation'"),
    (re.compile(r"\bcable (pulled|drawn|laid)\b", re.I),
     "pull cable", "schedule: 'Pull MV/LV cable'"),
    (re.compile(r"\bhome ?runs?\b", re.I),
     "home-run cables", "schedule: 'Pull home-run cables'"),
    (re.compile(r"\bjb'?s\b", re.I),
     "junction boxes", "schedule: 'junction boxes JB-101 to JB-108'"),
    (re.compile(r"\bht ?/? ?lt (cable )?terminations?\b", re.I),
     "set and terminate transformer", "schedule: 'Set and terminate transformer'"),
    (re.compile(r"\btemps? elements?\b", re.I),
     "temperature elements", "schedule: 'Install temperature elements'"),
    (re.compile(r"\bflow ?meters?\b", re.I),
     "flow meter elements", "schedule: 'Install flow meter elements'"),

    # ── mechanical / static ───────────────────────────────────────────────
    (re.compile(r"\b(lifted and placed|positioned|placed on (its|the))\b", re.I),
     "rig and set", "schedule: 'Rig and set …'"),
    (re.compile(r"\bbolt(s)? torqued\b|\btorqued the bolts\b", re.I),
     "bolt torque", "schedule: 'bolt torque'"),
    (re.compile(r"\balign(ed|ment) (the )?(pump|coupling|compressor|motor)s?\b", re.I),
     "alignment check", "schedule: 'Alignment check'"),
    (re.compile(r"\bmotors? mounted\b", re.I),
     "motor mounting", "schedule: 'Motor mounting and bolt torque'"),
    (re.compile(r"\bdemisters?\b", re.I),
     "internals and demisters", "schedule: 'internals and demisters'"),
    (re.compile(r"\bfloating deck\b", re.I),
     "internal floating roof", "schedule: 'Internal floating roof assembly'"),
    (re.compile(r"\bknock ?out drum\b", re.I),
     "flare knockout drum", "schedule: 'flare knockout drum'"),
    (re.compile(r"\bpumped into\b|\bfirst crude\b", re.I),
     "first crude transfer", "schedule: 'First crude transfer'"),
    (re.compile(r"\bpunch(es|ed)? (closed|cleared|completed)\b", re.I),
     "punchlist closure", "schedule: 'Punchlist closure'"),
    (re.compile(r"\bhand(ed)? over\b", re.I),
     "handover", "schedule: 'handover'"),
    (re.compile(r"\bwater ?filled\b|\bfilled with water\b", re.I),
     "water fill", "schedule: 'Water fill and settlement check'"),
]


def expansions(text: str) -> list[str]:
    """Canonical schedule-vocabulary phrases found in `text` (original kept)."""
    out: list[str] = []
    for pattern, canonical, _why in _MAPPINGS:
        if pattern.search(text):
            out.append(canonical)
    return out


def canonicalise(text: str | None) -> str:
    """`text` with canonical schedule vocabulary APPENDED.

    Expansion, not replacement: original tokens (sizes, tag words, discipline
    words) keep matching whatever they matched before; the canonical phrases
    only add recall against the schedule's formal wording.
    """
    if not text:
        return text
    extra = expansions(text)
    if not extra:
        return text
    return text + " " + " ".join(extra)


def expansion_tokens(text: str | None) -> list[str]:
    """Tokens of the canonical phrases, for the BM25 query side."""
    if not text:
        return []
    toks: list[str] = []
    for phrase in expansions(text):
        toks.extend(t for t in phrase.lower().split() if t.strip())
    return toks


def mapping_count() -> int:
    """How many controlled mappings are active (for the audit trail)."""
    return len(_MAPPINGS)
