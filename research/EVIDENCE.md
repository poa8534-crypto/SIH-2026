# Evidence index — what kind of claim each number in the report is

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


Every quantitative claim in the NAVIS report carries one of these labels.

## Where the v2 / held-out evidence lives

This file indexes the **v1** evidence. The v2 held-out and pooled results, the
ablation, the latency profile and the calibration study live in:

| Evidence | File |
|---|---|
| Full ablation, risk-coverage, reliability diagram | `research/bench/ABLATION_RESULTS.txt` |
| Ablation harness (re-runnable) | `research/bench/ablation.py` |
| Latency profile, before/after | `research/bench/profile_latency.py` |
| Cold start, fresh process | `research/bench/cold_start.py` |
| BM25 / RRF grid search (train split only) | `research/bench/tune_retrieval.py` |
| Real-corpus extraction benchmark | `research/real_corpus_benchmark.txt` |
| Every headline number, by configuration | `METRICS.md` |

## MEASURED — from runnable harnesses against the real engine + dataset
| Claim | Value | Source |
|---|---|---|
| Top-1 accuracy | 87.2% (211/242) | eval.py → research/data/eval_output.txt |
| Auto-link precision at shipped threshold | 100.0% (128/128) | eval_output.txt |
| AUTO_LINK coverage | 50.4% | eval_output.txt |
| Suggestion precision / recall | 83.1% / 85.5% | eval_output.txt |
| NO_MATCH rejection | 8.3% (1/12) | eval_output.txt |
| Wrong AUTO_LINKs | 0 | eval_output.txt confusion table |
| BM25-only vs hybrid gate | 35.0% vs 50.4% coverage @ 100% precision | research/data/bm25gate.json |
| Arms Top-1 | EXACT 4.9%, BM25 93.8%, DENSE 88.8%, HYBRID 92.1%, HYBRID+scoring 87.2% | research/data/ablation.json |
| Tag-stripped Top-1 | 70.1% (n=87) | research/data/ablation.json |
| Dense-feature fix | +2.5 pts Top-1, +1.6 pts coverage | research/data/densefix.json |
| Channel disagreement | 207 both / 20 BM25-only / 4 full-only / 11 neither | research/data/disagree.json |
| Latency | 266 events / 1.86 s (~7 ms/event); cold start 4.4 s | research/data/latency.json |
| Review-queue load | 121 items (~10 s each) | eval_output.txt |
| Conflict detection | 25 conflicts, 21 spreadsheet-vs-DPR | ARCHITECTURE.md §conflicts |

## AUDITED — read from code, not from documentation
Component statuses, PS coverage, audit-trail behaviour, decision policy,
threshold values, feature weights. Source: NAVIS_TECHNICAL_AUDIT.md and the
matrix CSVs; every row names a file/symbol.

## RUBRIC — reasoned judgement, labelled as such on the figure itself
SIH scorecard (15 dimensions), risk matrix (R1–R12), innovation profile,
competitor matrix (LOW evidence confidence, UNKNOWN scores 0, lower-bound bars).
Sources: SIH_JUDGE_ANALYSIS.md (this repo's scorecard), JUDGE_QUESTIONS.md,
INNOVATION_ANALYSIS.md, COMPETITIVE_LANDSCAPE.md.

## NOT CLAIMED
Benchmark results on real project data · OCR · schedule import ·
authentication · a closed learning loop · vendor-audited competitor
capabilities · any field study with real supervisors.
