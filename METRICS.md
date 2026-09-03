# METRICS.md — the only place a number is defined

**Every metric quoted anywhere in this repository must match this file.** If
another document disagrees with this one, this one is right and the other is
stale. If this file disagrees with the code, the code is right and this file is
the bug.

Last reconciled: **2026-09-01**, against commit `1a644eb`.
§3.1 and §3.2 re-run and confirmed unchanged on **2026-09-03**; §4.1 (the
optional LLM path) and the §6 test counts were added that day.
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
| **Recall@k** | How often is the correct activity anywhere inside the top *k* ranked candidates. **k=3 is the one that describes the product**: review items store `decision.candidates[:3]` (`server/main.py:443`) and the Reconcile screen de-duplicates the suggested id against the first alternative (the `candidates` useMemo in `frontend/src/pages/Reconcile.tsx`), so a planner is shown exactly **three** activities. k=20 is the retrieval ceiling (`top_k`, `matching/config.py:34`) and nobody ever sees it. |
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
| Recall@1, overall | **71.4%** | 132 / 185 — identical to top-1, by definition |
| **Recall@3, overall** | **88.1%** | **163 / 185 — the depth a planner is shown** |
| Recall@3, near-miss only | **67.6%** | 46 / 68 |
| Recall@3, all the rest | **100.0%** | 117 / 117 |
| Recall@5, overall | **95.1%** | 176 / 185 |
| Recall@10, overall | **99.5%** | 184 / 185 |
| Recall@20 | **100.0%** | 185 / 185 — retrieval ceiling, not a planner-visible number |
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
| Auto-link precision | **99.5%** | 437 / 439 — **two** wrong auto-links. See the correction below |
| Coverage | **53.9%** | |
| NO_MATCH rejection | **80.0%** | 56 / 70 — the denominator to quote |
| **Recall@3, overall** | **91.9%** | **684 / 744 — the depth a planner is shown** |
| Recall@3, near-miss only | **62.5%** | 100 / 160 |
| Recall@3, all the rest | **100.0%** | 584 / 584 |
| Recall@20 | **100.0%** | 744 / 744 — retrieval ceiling |

Recall@k is a property of the ranked candidate list, so it is unaffected by the
median-threshold issue corrected below. The pooled figures agree with the
held-out ones in §3.2: retrieval reaches everything by k=20, and the gap between
that and k=3 is entirely near-misses.

> **Correction, 2026-09-01.** `eval.py --cv` prints **99.8%** auto-link
> precision and 53.1% coverage. That figure is slightly optimistic and should
> not be quoted. `run_cv` computes a threshold per fold, then takes the
> **median** of the five and re-evaluates *every* pooled row with it — so each
> row is decided by a threshold that four of the five folds (including its own)
> helped choose. Recomputed as genuine out-of-fold, where each fold's threshold
> decides only its own held-out rows, the numbers above are what comes out:
> **99.5% auto-link precision (437/439, two wrong), 53.9% coverage, 80.0%
> rejection**. Independently reproduced twice — see `AUDIT_CODEX.md` §2.2. The
> 99% floor still holds, but quote 99.5%, not 99.8%.

**Do not collapse 100.0% and 99.5% into one claim.** They are different
evaluation settings. 100.0% is held-out test and v1; 99.5% is out-of-fold CV
over all 814 mentions, and it is the more demanding of the two.

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

### 3.4a WHAT THE EVALUATION DOES **NOT** ESTABLISH

Independently audited 2026-09-01 (`AUDIT_CODEX.md`) and re-verified here. These
are limits of the *benchmark*, not defects in the matcher, and they cap what
any number in §3.2–§3.4 can be claimed to mean.

**1 · The experimental 74.1% is test-selected, not a clean held-out estimate.**
`research/bench/ablation.py` compares ten configurations on the **test** split
and picks the winner by test top-1. Fitting used only train and dev, but
*selection* touched test, so 74.1% is optimistically biased by an unknown
amount. A clean estimate needs a fourth untouched split or nested selection.
**This is the single most important caveat on §3.4 and it is our own finding
against our own method.**

**2 · The splits isolate exact text, not templates or activities.** Verified:
**0** mentions share normalised text across splits — but **156 of 185** test
positives (84%) reference an activity that also appears in train, and ~48 test
or dev mentions have a train mention above 0.9 similarity (the audit counts 116
such *pairs*). Reusing schedule IDs across splits is legitimate product
behaviour — it is a closed set — but it means these numbers describe
**seen-activity, in-distribution** performance. They do **not** establish
performance on an unseen project or an unseen activity.

**3 · The corpus is synthetic and often near-copies the answer.** For 507 of
744 positives the normalised gold activity description appears as a substring of
the mention. Mean token Jaccard against the gold description is 0.50 overall —
but 0.58 on `exact` rows against **0.21** on `near_miss` rows. So the easy 78%
of the corpus is close to a copy of the label, and the near-miss subset is the
only part that tests terminology drift. **This is why the near-miss number, not
the overall number, is the one worth arguing about.**

**4 · Small denominators.** NO_MATCH on the test split is 13 items: 84.6% has a
Wilson 95% interval of [0.578, 0.957]. Even the experimental 13/13 is
[0.772, 1.0]. Use the pooled n=70 figure (§3.3), and say n.

**What survives all four.** Two results are not weakened by any of the above,
because they are properties of the decision policy rather than of ranking
difficulty:

- **Auto-link precision held at 100% on the v2 held-out test (81/81) and 99.5%
  out-of-fold across all 814.** The system does not write wrong dates.
- **All 68 near-miss mentions were routed to REVIEW; none were auto-linked.**
  On genuinely ambiguous text the system declines rather than guessing.

Those are the defensible claims. "NAVIS is X% accurate on real projects" is
not, and this corpus cannot support it.

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

### 4.1 The optional LLM path — what it may and may not supply

Off by default (`EXTRACTION_PROVIDER=rules`, D-005). Every number in §3 comes
from the deterministic path with the LLM off, and turning it on does not change
any of them — it is not in the ranking loop at all.

| Field | Where it comes from when the LLM is ON | Guard |
|---|---|---|
| `activity_id` | **MatchingEngine only.** Never the model. | D-006; regression-tested in `server/test_agent_llm.py::TestD006EndToEnd` |
| `confidence` | **MatchingEngine only.** | same |
| `tags` | Regex pre-pass only | D-006 |
| dates | Deterministic date parser only | D-015 |
| schedule writes | Planner confirmation only | D-009 |
| `discipline` | Model may propose; membership-tested against a closed vocabulary | D-065 |
| `status` | Model may propose; re-parsed by our own parser | D-065 |
| `activity_description` | Model may propose; must be ≥75% grounded in the supervisor's own words, carry no activity id, no markup, ≤160 chars | **D-065** |

**Measured equality, 2026-09-03, live `qwen3:8b`.** The same three-turn field
report run with `EXTRACTION_PROVIDER=rules` and with `=ollama` produced the
**same activity id (`PIP-INS-1045`) at the same confidence (0.692)**, with the
model demonstrably participating in the second run. This is a single scripted
conversation, not a benchmark: it demonstrates that the model is an interpreter
rather than a decision-maker; it does not measure how often the two paths agree.

**Safe sentence:** *"The LLM is optional, off by default, and advisory only —
it can help read a report, it cannot choose what the report links to. We
checked: same input, model on and off, same activity."*

**Unsafe sentences:**
- ❌ "Our LLM matches activities." It does not; the matcher does.
- ❌ "The LLM improves accuracy." Unmeasured, and §3 is computed with it off.
- ❌ Quoting the rules-vs-ollama equality as an agreement *rate* — it is n=1.

`GET /agent/llm-status` reports which of the above is live at any moment, with
no key and no base URL in the response.

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
python -m pytest -q                         # 868 passed
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

Test counts as of this reconciliation: **868 pytest + 55 vitest = 923**
(2026-09-03, commit on `fix/llm-grounding-and-status`). The 580 figure was
correct on 2026-09-01 and the suite has grown since; see §7.
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
| 435 / 400 / 319 / 264 / 580 tests | `README.md`, `Basics.md`, `Audit-1.md`, `SETUP.md`, this file | **868 pytest, 55 vitest** | Suite grew; 580 was accurate on 2026-09-01 |
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
- ❌ Quoting 100.0% auto-link precision and 99.5% as if one supersedes the
  other — they are different evaluation settings (§3.2 vs §3.3). And do not
  quote **99.8%** at all; it is the optimistic median-threshold figure that
  `eval.py --cv` prints (§3.3 correction).
- ❌ "74.1% is our held-out result." — the configuration that produces it was
  **selected on the test split** (§3.4a). Say "test-selected" or do not use it.
- ❌ Any claim about performance on a **new project** or an **unseen
  activity** — 84% of test positives reuse a training activity (§3.4a).
- ❌ "Planned dates are read-only." — the *precise* claim is that no automated
  ingest path modifies the planned dates of an existing baseline activity.
  Baseline import sets them, and a planner creating a new activity for
  unplanned scope sets them on that new row.
- ❌ Quoting **Recall@20 = 100%** to mean "the planner can always fix it from
  the queue". The queue shows **three** candidates, not twenty
  (`server/main.py:443`; the `candidates` useMemo in `Reconcile.tsx`). The honest figure is
  **Recall@3 = 88.1%** overall and **67.6% on near-misses** (§3.2): on roughly
  a third of near-miss items the correct activity is **not in front of the
  planner at all**, and resolving it needs the search/reassign path rather
  than the offered list. Quote Recall@3, or say "in the top 20 retrieved
  internally" and expect the follow-up question.
- ❌ "Nothing is ever silently dropped." — XLSX header detection only scans
  rows 1–9 and reads only the active sheet. *(The CSV half of this claim was
  fixed on 2026-09-01, D-040: a `.csv` upload now returns HTTP 400 naming the
  file and the extractor's reason instead of a 200 with 0 events.)*
- ❌ "The cross-encoder didn't help." — its accuracy was never measured. Say
  it costs ~45 ms/event, roughly 20× the whole pipeline, and was not evaluated.
- ❌ Presenting 26.5% near-miss top-1 as an error rate without saying that
  **100% of those cases go to REVIEW and none are auto-linked**.
