# Competitive landscape — method and honesty statement

## What this analysis is

A **rubric scoring** of 21 NAVIS-relevant capabilities across 8 systems, from
published vendor documentation and general product knowledge as of writing.
Machine-readable cells: `research/competitor_matrix.csv`. Chart:
`research/graphs/competitor_feature_coverage.png`.

## What this analysis is NOT

- **No vendor code was audited.** Unlike every MEASURED figure in this repo,
  competitor cells could not be verified against source. `evidence_confidence`
  is LOW for every non-NAVIS row.
- **UNKNOWN scores 0, so every non-NAVIS bar is a LOWER BOUND.** Absence of
  published evidence is not evidence of absence. Enterprise vendors may well
  implement capabilities quietly.
- The purpose is *positioning*, not benchmarking: it shows where NAVIS sits and
  which claims are safe to make.

## Positioning

| Category | Systems | Relationship to NAVIS |
|---|---|---|
| A. Direct | (none with published evidence of prose→schedule auto-linking with audit) | — |
| B. Partial | Procore, InEight | field/daily-report capture tools; progress stays form-based, no measured auto-linking evidence |
| C. Adjacent | Primavera P6 EPPM, MS Project | the plan side; NAVIS feeds them rather than replacing them (P6/MSP export exists) |
| D. Complementary | Buildots, Doxel | vision-based progress capture; orthogonal modality, could feed NAVIS's linking layer |
| E. Research/OSS | LLM+RAG scripts | a weekend pipeline can ingest and extract, but has no calibrated decision policy, audit trail, or review loop |

## The honest competitive story for judges

1. The plan side (P6/MSP) and the capture side (Procore/InEight) leave the
   **linking layer** — prose/voice to L5/L6 with provenance, confidence, audit —
   structurally unaddressed in published material.
2. Vision competitors (Buildots/Doxel) are **complements, not rivals** (risk
   R12): they capture what a camera sees; NAVIS links what a supervisor says
   and writes. Claiming them as rivals loses the niche.
3. The defensible moat is not any single feature (an LLM script can match
   text) — it is the **measured decision policy** (100% auto-link precision at
   the shipped threshold, zero wrong auto-links) plus the append-only audit
   trail and the review loop that closes the trust chain.
