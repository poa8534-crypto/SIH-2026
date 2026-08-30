# Innovation analysis — what is genuinely novel vs table stakes

Axes (0–10, reasoned judgement — RUBRIC, not measurement): industry_novelty,
technical_difficulty, sih_demo_value, defensibility. Machine-readable:
`research/innovation_scores.csv`. Chart: `research/graphs/navis_innovation_scores.png`,
sorted by defensibility — the bottom of the chart is what NOT to claim.

## Reading the profile

**Top of the chart (defensible, demo-relevant):**
- *Calibrated two-threshold + margin policy* — the only linking claim in the
  room with a measured precision/coverage curve behind it (100% auto-link
  precision at 50.4% coverage, zero wrong auto-links). Judged answers, not vibes.
- *Line-lock tag rule* — a domain insight (a full line+size match is
  near-decisive) encoded as a decision-time floor, measured in ablation.
- *Deterministic date/tag extraction with the LLM confined to intent* — an
  architecture answer to "why not just LLM everything?", with guards under test.

**Middle (solid engineering, less novel):**
- Hybrid retrieval + RRF, provenance spans, audit trail, roll-up guards,
  conflict detection, memory queries, voice agent with typed fallback.

**Bottom of the chart — do NOT lead with these:**
- *Alias lexicon learning loop* — scores 2/10 defensibility because it is
  **write-only today**: planner corrections are stored but the matcher never
  reads them back. Say "designed and half-wired", never "self-learning".
- RAG-style hybrid retrieval *by itself* — table stakes in 2026; it only
  becomes defensible through the measured gate behaviour around it.

## Cross-checks

- Every feature row maps to a file/symbol in NAVIS_TECHNICAL_AUDIT.md.
- The two known DEFECT/NOT-FOUND rows (dense-feature renormalisation, lexicon
  read path) deliberately anchor the bottom of the profile: self-assessed
  novelty is discounted where the code does not yet close the loop.
