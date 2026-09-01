# Experiment log — every number traces to a harness in research/data/

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


Reproduce any figure with the harness named next to it. All harnesses are
read-only against the real engine and the real dataset (dataset/ground_truth.csv).

| # | Question | Harness | Answer (MEASURED) |
|---|---|---|---|
| 1 | How good is each retrieval arm alone vs the hybrid? | `python research/data/ablation.py` → ablation.json | EXACT-tag-only Top-1 4.9%; BM25-only 93.8%; DENSE-only 88.8%; HYBRID+scoring (shipped) 87.2% Top-1, R@20 100%. BM25 ranks best, but see #2. |
| 2 | Why keep the hybrid if BM25 alone ranks better? | `python research/data/bm25gate.py` → bm25gate.json | BM25-only ranks better but GATES worse: at every auto-precision level the hybrid covers more. At 100% precision the hybrid covers 50.4%; matching BM25-only precision costs coverage. Hybrid gate is the point. |
| 3 | How much does the dense-feature defect cost? | `python research/data/densefix.py` → densefix.json | Filling embedding_cosine for all candidates: Top-1 87.2% → 89.7% (+2.5 pts), coverage 50.4% → 52.0%, auto-precision unchanged at 100%. Fix identified, not yet shipped (DEFECT in the audit). |
| 4 | Do the BM25 and full-pipeline channels disagree? | `python research/data/disagree.py` → disagree.json | 207/242 agree; BM25-only 20; full-only 4; neither 11. The channels are complements, not duplicates. |
| 5 | What do the tag weights actually control? | `python research/data/weights.py` → weights.json | Top-1 is flat (87.2%) across tag weights 0.32→0.08; coverage moves only ~1.7 pts. The line-lock rule, not the weight, carries the tag evidence. |
| 6 | Is a simpler hybrid weighting better? | `python research/data/hypothesis.py` → hypothesis.json | No. Same Top-1; 20 losses traced, 12 on lines shared between variants. |
| 7 | Latency end-to-end? | `python research/data/latency.py` → latency.json | 266 events, 1.86 s total (~7 ms/event); cold start 4.4 s (index + embed 120 activities), once per process. |
| 8 | Headline metrics + confusion table + tau sweep? | `python eval.py` → eval_output.txt | Top-1 87.2%, coverage 50.4% @ 100% auto-precision at tau_high=0.775; zero wrong AUTO_LINKs; NO_MATCH rejection 8.3% (1/12). |

## Circular-evaluation caveat (stated, not hidden)

The ground truth (254 mentions) and the DPR corpus were built together, so the
evaluation measures agreement with the generator's intent as well as matching
quality. Mitigations: 87 tag-stripped mentions force matching without the
decisive tag signal (Top-1 drops to 70.1% — reported); the dpr_day_11_messy.txt
file exercises noisy prose; the audit labels this R4 and recommends independent
human relabelling before any external claim.
