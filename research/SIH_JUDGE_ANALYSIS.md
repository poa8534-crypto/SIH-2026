# SIH judge analysis — 15-dimension self-scorecard

RUBRIC: the scores and weights below are this analysis's own judgement, defined
for preparation purposes. They are NOT a measurement and NOT the official SIH
rubric. Chart: `research/graphs/sih_scorecard.png` (labelled RUBRIC on the
figure itself).

| Dimension | Score /10 | Weight | One-line justification |
|---|---|---|---|
| Problem understanding | 9.0 | 8 | PS read closely; five-places-wrong critique in ARCHITECTURE.md §0 shows the analysis |
| Relevance to PS | 9.0 | 10 | every Expected-Outcome bullet has a partial-or-better answer (feature_gap_matrix.csv) |
| Innovation | 6.0 | 10 | linking-layer niche is real; individual features are largely known techniques |
| Technical sophistication | 8.0 | 9 | hybrid retrieval + calibrated policy + guards, all measured |
| Practicality | 7.5 | 7 | runs offline on a laptop; sync ingest; reset tooling |
| Scalability | 6.0 | 5 | SQLite + brute-force cosine fine at 120 activities; unproven beyond |
| UX / field usability | 7.0 | 6 | two-role UI, typed fallback, suggestions; untested with real supervisors |
| AI justification | 6.5 | 7 | LLM used narrowly and defended; agent is deterministic by design |
| Architecture | 8.5 | 8 | retrieval/ranking separation, append-only audit, provenance spine |
| Data handling | 8.0 | 6 | encoding fixes, dedup, conflict surfacing, integrity rules |
| Security | 4.5 | 4 | no auth, no TLS story, prompt-injection bounded but present |
| Explainability | 9.5 | 8 | rationale lists, provenance, audit drawer, confidence everywhere |
| Demo strength | 7.5 | 9 | hero flow rehearsed; mic/venue risks mitigated |
| Commercial usefulness | 7.0 | 5 | real pain, but buyer integration (P6 import) missing |
| Deployment feasibility | 7.5 | 4 | venv + npm only; single machine |
| **Weighted overall** | **7.6 /10** | | sum(score×weight)/sum(weights) = 806.5/106 |

## How to use this in the room

Lead with the 9+ dimensions (explainability, architecture, PS relevance); when
judges probe, concede the 4–6 dimensions before they find them (security 4.5,
scalability 6.0, innovation 6.0) — conceding with a measurement (densefix,
NO_MATCH rate) converts a weakness into credibility. The full Q&A drill is in
JUDGE_QUESTIONS.md; risks are plotted in risk_matrix.png.
