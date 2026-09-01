# METRICS.md — the only place a number is defined

**Every metric quoted anywhere in this repository must match this file.** If
another document disagrees with this one, this one is right and the other is
stale. If this file disagrees with the code, the code is right and this file is
the bug.

Last reconciled: **2026-09-01**, against commit `1a644eb`.
Reproduce everything here with the commands in §6.

---

## 1. Four different things, four different numbers

The single largest source of confusion in this repository has been four
unrelated counts that all look like "the size of our data". They are not the
same dataset and must never be added, averaged or compared.

| | What it is | Size | Where |
|---|---|---|---|
| **A · Research corpus** | Real, public-source material we did not author. Used for taxonomy, extraction robustness and hard negatives. **Never used to compute a matcher accuracy figure.** | 124 raw artefacts, 251.37 MiB | `datasets/real/` |
| **B · Matcher evaluation corpora** | Labelled *mentions* used to measure retrieval and ranking. Synthetic, generated alongside their baseline. | v1: 254 mentions · v2: 814 mentions | `dataset/ground_truth.csv`, `dataset/v2/ground_truth_v2.csv` |
| **C · Demo project schedule** | The baseline the running application loads. Hand-written JSON. | **120 activities** | `dataset/baseline_schedule.json` |
| **D · Live review queue** | Rows the current demo database actually holds after a reset. | **135 pending** | `dataset/epc_progress.db` (regenerated) |

The number **120** is C, the demo schedule. It is *not* the research corpus
size and *not* the evaluation corpus size. The number **218** is a *different*
baseline (`baseline_schedule_v2.json`) used only for research; the running
server does not load it.

---

## 2. What each metric means

Say these definitions out loud before quoting the number. Several of them are
easy to overstate by accident.

| Metric | Plain-English definition |
|---|---|
| **Top-1** | When forced to rank one candidate first, how often is the correct activity ranked #1? |
| **Recall@20** | How often is the correct activity anywhere inside the top 20 retrieved candidates? |
| **Auto-link precision** | When NAVIS is confident enough to auto-link without human review, how often is that auto-link correct? |
| **Coverage** | What percentage of cases NAVIS handles automatically at the selected precision requirement. |
| **Near-miss** | Deliberately ambiguous mentions where several sibling activities are plausible because the discriminating token was **removed**. |
| **REVIEW** | The system deliberately refuses to auto-link because the evidence is insufficient. Routed to a human. |
| **NO_MATCH** | The system decides the update should not be linked to any available schedule activity. |
| **In-family top-1** | On near-misses, did the ranker land on the gold activity *or* one of the siblings it is genuinely confusable with? |

**Read near-miss top-1 correctly.** A low strict top-1 on near-misses is *not*
unsafe automatic behaviour. On the v2 held-out test split **100% of near-miss
mentions are routed to REVIEW and 0 are auto-linked**. The system does not
confidently link text whose discriminator is missing; it declines and asks.

---

## 3. Headline numbers, by configuration

Never quote a number without its configuration. These are four different
settings and their numbers are not interchangeable.

### 3.1 CURRENT PRODUCTION / DEMO — what the running server actually does

Baseline **v1** (`baseline_schedule.json`, 120 activities, sha256 `1bfde358dc0e`).
Hand-set feature blend. No learned ranker, no calibrator. Corpus B/v1, 254
mentions, **no train/dev/test split** — this figure is calibrated and reported
on the same data, and must be labelled as such.

| Metric | Value | Detail |
|---|---|---|
| Top-1 | **87.2%** | 211 / 242 gold positives |
| Auto-link precision | **100.0%** | 128 / 128 — zero wrong auto-links |
| Coverage | **50.4%** | 128 of 254 mentions |
| Suggestion precision / recall | 83.1% / 85.5% | |
| NO_MATCH rejection | **8.3%** | 1 / 12 — weak, and the denominator is only 12 |
| Latency | **2.09 ms/event** batched | 478 events/s |

`python eval.py --cv` returns the identical figures — with no split column in
the v1 key, cross-validation selects the same thresholds.

### 3.2 HELD-OUT EVALUATION — the honest research number

Baseline **v2** (`baseline_schedule_v2.json`, 218 activities). Corpus B/v2.
Thresholds calibrated on **dev** (186), reported on **held-out test** (198
mentions: 185 positive, 13 NO_MATCH). Same hand-set blend the server runs.

| Metric | Value | Detail |
|---|---|---|
| Top-1, overall | **71.4%** | 132 / 185 |
| Top-1, near-miss only | **26.5%** | 18 / 68 |
| Top-1, all the rest | **97.4%** | 114 / 117 |
| Recall@20 | **100.0%** | 185 / 185 |
| Auto-link precision | **100.0%** | zero wrong auto-links |
| Coverage | **40.9%** | 81 of 198 mentions |
| NO_MATCH rejection | **84.6%** | 11 / 13 — *small denominator, prefer §3.3* |
| Near-miss outcomes | **100% REVIEW** | 0 auto-linked |
| Latency | **2.84 ms/event** batched | 352 events/s |

### 3.3 POOLED / 5-FOLD CV — the number with a usable denominator

Baseline v2, all **814** mentions, thresholds cross-validated, decisions
out-of-sample.

| Metric | Value | Detail |
|---|---|---|
| Top-1 | **82.1%** | 611 / 744 |
| Auto-link precision | **99.8%** | *not* 100% — one wrong auto-link exists in the pooled run |
| Coverage | **53.1%** | 431 of 814 |
| NO_MATCH rejection | **80.0%** | 56 / 70 — the denominator to quote |

**Do not collapse 100.0% and 99.8% into one claim.** They are different
evaluation settings. 100.0% is held-out test and v1; 99.8% is pooled CV.

### 3.4 EXPERIMENTAL — measured, selected, and NOT deployed

Baseline v2. Extra features + a pointwise logistic ranker fitted on **train** +
isotonic calibration fitted on **dev**. Artefacts exist in
`matching/artifacts/`. **The server does not load these** (see §4).

| Metric | Baseline (§3.2) | Experimental | Note |
|---|---|---|---|
| Top-1 | 71.4% | **74.1%** | +2.70, 95% CI **[−1.6, +7.6]** — spans zero, **not statistically conclusive** at n=185 |
| Top-1, near-miss | 26.5% | **29.4%** | +2.94, 95% CI **[−8.8, +14.7]** — spans zero |
| Top-1, all the rest | 97.4% | **100.0%** | 117 / 117 |
| In-family top-1 (near-miss) | 75.0% | **83.8%** | 57 / 68 |
| Coverage | 40.9% | **47.0%** | established |
| Auto-link precision | 100.0% | **100.0%** | floor holds |
| NO_MATCH (pooled, n=70) | 80.0% | **100.0%** | intervals do not overlap — established |
| ECE / Brier | 0.129 / 0.122 | **0.042 / 0.084** | isotonic; Platt makes ECE *worse* (0.179) |
| Latency | 2.07 ms/ev | 2.50 ms/ev | +0.42 |

Reproduce: `python eval.py --production --schedule dataset/baseline_schedule_v2.json --ground-truth dataset/v2/ground_truth_v2.csv`

### 3.5 RESEARCH CORPUS — real, public-source, no matcher accuracy claimed

Validation: **PASS**, 1,462 checks, 0 errors, 0 warnings
(`datasets/real/reports/validation.md`). `data_origin: real`, `is_real: true`
in `datasets/real/manifests/dataset_summary.json`.

| Dataset | Verified counts | Label quality |
|---|---|---|
| MoSPI PAIMANA | 18,601 project-month rows · 2,243 unique projects · 13 monthly snapshots | real, official |
| CFIHOS v2 | 21 tables · 43,753 rows | real, official |
| Uniclass 2022 | 14 tables · 15,375 combined rows | identity copies only (CC BY-ND) |
| ConstructCIE | 530 narratives · 3,520 causal spans · 1,580 classification labels | real, published research corpus |
| Safety Risk Library | 466 risk-treatment rows | real |
| CPWD DSR (E&M) 2025 | 1,661 item-rate rows · 441 PDF pages | **machine-extracted, UNVERIFIED** |
| WSDOT C8078 schedules | 2 snapshots · 54 rows · **27 distinct activity IDs** | manually reviewed against rendered source |
| WSDOT C8078 IDR OCR | **21 source PDFs** · 73 pages · 4,315 OCR lines · 13 work-activity mentions | **machine-extracted, UNVERIFIED** |
| Cross-source hard negatives | 100 rows | derived |

**The authentic WSDOT schedule has 27 activities. It is not 200, not 300.**
Say twenty-seven. The extraction-rate figures in
`research/real_corpus_benchmark.txt` are computed over OCR lines with
machine-derived labels and are explicitly not a matcher accuracy claim.

The 13-row WSDOT link review in `research/wsdot_c8078_verification_review.md`
is **assistant-reviewed and pending dataset-owner confirmation** — its 53.8%
set-accuracy / 96.3% link-precision figures are *proposed*, not verified
labels, and must be described that way.

---

## 4. Production status — what is live and what is not

Verified by importing `matching.config.production()` against the server's own
baseline hash.

| Component | Status in the running server | Evidence |
|---|---|---|
| Baseline loaded | **v1**, 120 activities, sha `1bfde358dc0e` | `server/main.py:DEFAULT_BASELINE_PATH` |
| Feature blend | **hand-set weights** (`FEATURE_WEIGHTS`) | `production(sha)` returns `DEFAULT` |
| Learned logistic ranker | **NOT live** | artefacts are v2-only; hash guard refuses them |
| Isotonic calibration | **NOT live** | same guard |
| Extra features | **NOT live** (`extra_features=False`) | `matching/config.py` |
| Retrieval channels active | **TAG, BM25, DENSE** | `channel_weights` = 1.0 / 0.7 / 0.7 |
| Char n-gram channel | present, **off** (`w_ngram=0.0`) | measured +0.00 top-1 |
| Alias channel | present, **off** (`w_alias=0.0`) | and no caller supplies a lexicon — see §5 |
| Discipline soft gate | present, **off** | measured **−4.32** top-1 |
| Gradient-boosted ranker | **rejected**, not shipped | 97.4% auto-link precision, below the 99% floor |
| Cross-encoder rerank | present, **off**, **accuracy UNMEASURED** | model not cached, no network |
| Exact-tag short circuit | present, **off** | fires on only 4.7% of v2 mentions |

**The fitted artefacts are fitted against v2 and refused against v1 by a
sha256 guard.** To make §3.4 live, the server must be pointed at
`baseline_schedule_v2.json` *and* the v2 evaluation corpus re-labelled for the
demo — neither has been done. Until then, the live demo is §3.1.

---

## 5. The alias lexicon — STORED SIGNAL ONLY, loop NOT closed

This has been documented inconsistently. The code says, unambiguously:

- **Written:** yes. `server/main.py:_upsert_alias` inserts an `AliasLexicon`
  row on every planner confirm / reassign / new-activity resolve. Three call
  sites.
- **Read at match time:** **no.** `HybridRetriever.alias_channel()` exists and
  is unit-tested, but `w_alias = 0.0` in the shipped configuration, and **no
  production code path ever populates `EngineConfig.alias_lexicon`** — the only
  `db.query(AliasLexicon)` outside tests is the write-side deduplication lookup
  inside `_upsert_alias` itself.
- **Can a planner correction influence a later re-ingest?** **No, not today.**

So the honest status is **B · STORED SIGNAL ONLY**. The read path is built and
proven by test; the wiring from the database into the engine is not there.

Separately, and not to be confused with the above: the *generic alias retrieval
ablation* measured **+0.000** on held-out test. That result is a property of
the corpus, not of the channel — the v2 generator gave every mention unique
text, so **0 of 198 test mentions share their normalised text with any train
mention**. No held-out mention *can* match a train-split alias. The ablation
could not have measured a gain even if one existed.

**Safe sentence:** *"Planner corrections are persisted as a training signal
today; reading them back at match time is built and tested but not yet wired
into the running server."*

**Unsafe sentence:** *"The system learns from planner corrections."* It does
not, yet.

---

## 6. How to reproduce every number above

```bash
python -m pytest -q                         # 580 passed
cd frontend && npx vitest run                # 55 passed  (635 total)
python eval.py                               # §3.1
python eval.py --cv                          # §3.1 (identical)
python eval.py --schedule dataset/baseline_schedule_v2.json \
               --ground-truth dataset/v2/ground_truth_v2.csv          # §3.2
python eval.py --cv --schedule dataset/baseline_schedule_v2.json \
               --ground-truth dataset/v2/ground_truth_v2.csv          # §3.3
python eval.py --production --schedule dataset/baseline_schedule_v2.json \
               --ground-truth dataset/v2/ground_truth_v2.csv          # §3.4
python scripts/reset_demo.py                 # §1 row D, and DEMO.md's table
python research/bench/ablation.py --quick    # the full ablation
python research/bench/profile_latency.py     # latency
```

Test counts as of this reconciliation: **580 pytest + 55 vitest = 635**.
Earlier documents claiming 264, 319, 400 or 435 are historical.

---

## 7. Numbers that were wrong in earlier documentation

Corrected in this pass. Listed so a reader who saw the old figure knows it
moved and why.

| Stale claim | Where it appeared | Correct value | Why it was wrong |
|---|---|---|---|
| review queue = 118 | `DEMO.md`, `SETUP.md`, `demo_reset.ps1` | **135** | Predates D-015; withheld-finish items now route to the planner |
| completed = 47 | `DEMO.md` | **38** | Same cause — finishes no longer written without a dated source |
| audit records 274 / 259 | `DEMO.md` / `SETUP.md`, `ARCHITECTURE.md` | **275** | Two documents captured different runs |
| source conflicts 75 | `DEMO.md` | **68** conflict-flagged audit rows | Row counter, and it moved |
| "25 conflict cases, 21 spreadsheet-vs-DPR" | `DEMO.md` | **18 rows across 17 activities, all 18 spreadsheet-vs-DPR** | `/schedule/conflicts` deduplicates |
| 435 / 400 / 319 / 264 tests | `README.md`, `Basics.md`, `Audit-1.md`, `SETUP.md` | **580 pytest, 55 vitest** | Suite grew |
| 700 v2 mentions | `FINDINGS.md` | **814** | Corpus regenerated with near-misses (D-024) |
| Top-1 99.2% on v2 | superseded by D-024 | **71.4%** held-out | The old corpus contained almost no ambiguous text |
| "alias lexicon written but never read" | `ROADMAP.md`, `FINDINGS.md` F4 | read path **exists**, still **not wired** | Partly fixed; see §5 |
| "no importing from Primavera or MS Project" | `README.md` | JSON baseline import **works**; PMXML/XER import **declared, not implemented**; PMXML **and** XER **export** implemented | Import/export were conflated |
| embeddings = `bge-small-en-v1.5` | `ARCHITECTURE.md` §5 | **`all-MiniLM-L6-v2`** | Design spec, never updated to match the code |
| 17 API endpoints | `README.md` | **18 paths** | One added since |

---

## 8. Things NOT to say to judges

- ❌ "NAVIS is 87% accurate" — without saying *which corpus, which baseline,
  and that it is not held-out*. Use §3.1 with its caveat, or §3.2.
- ❌ "NAVIS is 74.1% accurate" — that is §3.4, it is **not deployed**, and its
  confidence interval spans zero.
- ❌ "The system learns from planner corrections." — see §5.
- ❌ "We have 200+ real schedule activities." — the authentic WSDOT schedule
  has **27**.
- ❌ "We import Primavera files." — PMXML/XER **import** is declared and not
  implemented. Export is implemented.
- ❌ Quoting 100.0% auto-link precision and 99.8% as if one supersedes the
  other — they are different evaluation settings (§3.2 vs §3.3).
- ❌ "The cross-encoder didn't help." — its accuracy was never measured. Say
  it costs ~45 ms/event, roughly 20× the whole pipeline, and was not evaluated.
- ❌ Presenting 26.5% near-miss top-1 as an error rate without saying that
  **100% of those cases go to REVIEW and none are auto-linked**.
