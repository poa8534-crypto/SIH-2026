# Judge questions — anticipated hard questions and evidence-backed answers

> **SCOPE: v1 CORPUS, 2026-08-30.** Every figure in this document was measured
> against the **v1** evaluation corpus — `dataset/ground_truth.csv`, 254
> labelled mentions, against the 120-activity demo baseline
> `dataset/baseline_schedule.json` — with **no train/dev/test split**. Those
> numbers still reproduce exactly (`python eval.py`) and are the numbers the
> **running application** produces, so nothing here is retracted.
>
> What they are **not** is the held-out result. A harder v2 research corpus
> (814 mentions, 218 activities, proper splits) exists and reports 71.4%
> held-out top-1. Neither number supersedes the other; they measure different
> things. **`METRICS.md` is the authority** — read §1 and §3 before quoting
> anything from this file.


Each answer cites repository evidence. Risks R1–R12 referenced here are plotted
in `research/graphs/risk_matrix.png`.

**Q1. "Why not just BM25 — or just hand everything to an LLM?" (R1)**
A: We measured it. BM25 alone ranks best on Top-1 (93.8% vs 87.2%) but gates
worse: at 100% auto-link precision BM25-only covers ~35% of mentions while the
hybrid covers 50.4% with zero wrong auto-links (research/data/bm25gate.json,
ablation.json). And the LLM never decides anything: it may only classify intent;
dates and tags come from deterministic regex, and its output is re-validated
before use (extraction/llm_backend.py, test_llm_guards.py).

**Q2. "Your schedule is a JSON file, not a real Primavera export." (R2)**
A: Correct, and we say so. The baseline is a hand-written 120-activity JSON;
PMXML/XER exist as **export** only. Parsing P6 was cut by the 36-hour plan
(ARCHITECTURE.md §6) to protect the linking engine — the part the PS actually
scores. Import is our first post-hackathon item.

**Q3. "There's a defect in your ranking?" (R3)**
A: Yes — the dense feature is None for candidates that didn't surface in the
dense channel, so weights renormalise. We measured the fix: +2.5 pts Top-1,
+1.6 pts coverage, precision unchanged (densefix.json). It's documented,
benchmarked, and deliberately not rushed into the shipped path before the demo.

**Q4. "Your evaluation is circular — the ground truth was generated with the data." (R4)**
A: True, and the report states it. Mitigations: 87 tag-stripped mentions force
matching without the decisive tag (Top-1 drops 87.2%→70.1% — reported, not
hidden); a deliberately messy DPR is in the set. Before any external claim we
would relabel with independent annotators (ARCHITECTURE.md §5-B).

**Q5. "The PS says LLM-based agent. Yours is regex?" (R5)**
A: The agent's slot-filling is deterministic on purpose — it can't fail on
stage, and every value is re-validated. The LLM path exists behind one env flag
with a 5-second timeout, one attempt, silent fallback (server/agent_llm.py). We
justify LLM use where it pays: reading intent out of informal prose.

**Q6. "What if the demo laptop dies offline?" (R6)**
A: Defaults are offline-first: rules provider, local MiniLM
(local_files_only=True), no network needed after model cache. DEMO.md §"if
something goes wrong" covers mic failure (typed fallback verified end-to-end)
and stale ports. A typed-only session was tested to full completion.

**Q7. "You claim a learning loop — show it." (R7)**
A: Planner corrections write alias_lexicon rows today; the matcher does **not**
read them back yet. That's why the innovation profile scores the loop 2/10.
It's a gap we name rather than paper over.

**Q8. "Institutional memory from 47 activities?" (R8)**
A: Small sample and we show it — every memory panel prints its own n (47/120
with both actual dates; suggested duration requires ≥2 completions). The
architecture is the contribution; the sample grows with every real ingest.

**Q9. "Who can write to the schedule? Where's auth?" (R9)**
A: Anyone — there is no authentication in the MVP. Single-tenant SQLite, one
project. Named limitation, first production item, and exactly why the audit
trail is append-only.

**Q10. "What happens to work that's not in the plan?" (R10)**
A: NEW_ACTIVITY surfaces it for the planner instead of dropping it. Honest
weakness: NO_MATCH rejection is 8.3% (1/12) — most garbage lands in REVIEW
rather than being refused, which is the safe failure direction.

**Q11. "Doesn't MiniLM need internet on a cold machine?" (R11)**
A: Once. local_files_only first; a hashed-ngram fallback keeps the pipeline
runnable even with no model on disk, at reduced quality (declared in
matching/retrieval.py).

**Q12. "Buildots/Doxel already do AI progress tracking." (R12)**
A: They're camera-based complements, not rivals — they capture what can be
seen; NAVIS links what supervisors say and write, with audit. Positioning is
the linking layer, including as a consumer of vision-capture output.
