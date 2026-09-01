# Independent audit — SIH 2026 matching system

Snapshot: `1a644eb21e55067ec048c3b6c05a6db80f7e0a58`, Python 3.12.10. The worktree contained concurrent pre-existing documentation/research changes. I changed no application source; this report is the only audit output.

## Executive verdict

The v1 numbers reproduce. The published v2 numbers do not: the current default held-out result is 71.4% Top-1, not 99.2%, and the current pooled result is 82.1%, not 97.0%. The old 700-row corpus was superseded by an 814-row corpus, so its results are historical, not current.

The evaluation does not establish real-world generalisation. The corpus is synthetic and answer-like, 116 near-identical templates cross split, the implemented pooled CV is not genuine out-of-fold evaluation, and the new production configuration was selected by comparing configurations on the test set. Its 74.1% is therefore test-selected, not an untouched held-out estimate.

One meaningful positive result remains: current default v2 auto-link precision was 100% on 81 auto-links, and all 68 near-misses went to REVIEW. This is promising conservative behavior, not proof of accuracy on real projects.

## 1. Published numbers

| Claim | Verdict | Current result | Evidence |
|---|---|---|---|
| v1: 87.2% Top-1, 83.1% precision, 85.5% recall, 50.4% coverage, 100% auto precision, 1/12 rejection; `.775/.5/.03` | **CONFIRMED** | Exact | E1 |
| v2 test n=137, Top-1 99.2% (123/124) | **REFUTED** | n=198; 71.4% (132/185 positives) | E2 |
| v2 precision 94.6% | **REFUTED** | 70.6% (132/187) | E2 |
| v2 coverage 80.3% (110/137) | **REFUTED** | 40.9% (81/198) | E2 |
| v2 auto precision 100% | **CONFIRMED for current default run** | 81/81 | E2 |
| v2 NO_MATCH rejection 7/13 | **REFUTED** | 11/13 | E2 |
| v2 thresholds `.725/.5/.04` | **REFUTED** | `.775/.5/.12` | E2 |
| pooled CV n=700: 97% Top-1, 100% auto precision | **REFUTED** | n=814; 82.1% and 99.8% | E3 |
| 513 backend tests pass | **REFUTED as current count** | 580 pass | E4 |
| frontend passes | **CONFIRMED with observed flakiness** | final 55/55 | E5 |
| 35 near-misses total, five in test | **REFUTED** | 160 total, 68 test | E2/E3 |

### E1 — v1

Command: `$env:PYTHONDONTWRITEBYTECODE='1'; $env:HF_HUB_OFFLINE='1'; python eval.py`

```text
Evaluation mode: thresholds calibrated and evaluated on full dataset
Total mentions: 254 (242 positive, 12 NO_MATCH)
tau_high=0.775 tau_low=0.500 margin_min=0.030
Top-1 87.2% (211/242); suggestion precision 83.1% (207/249)
recall 85.5%; coverage 50.4% (128/254)
auto-link precision 100.0% (128/128); NO_MATCH rejection 8.3% (1/12)
```

Qualification: v1 has no split; it calibrates and evaluates on the same rows. Reproducible does not mean held out.

### E2 — v2 default held-out

Command: `$env:PYTHONDONTWRITEBYTECODE='1'; $env:HF_HUB_OFFLINE='1'; python eval.py --schedule dataset/baseline_schedule_v2.json --ground-truth dataset/v2/ground_truth_v2.csv`

```text
Total labels=814; train=430 dev=186 test=198
Held-out=198 (185 positive, 13 NO_MATCH)
tau_high=.775 tau_low=.500 margin_min=.120
Top-1 71.4% (132/185); suggestion precision 70.6% (132/187)
recall 71.4%; coverage 40.9% (81/198)
auto precision 100% (81/81); rejection 84.6% (11/13)
near-miss 26.5% (18/68); rest 97.4% (114/117)
near-miss outcomes REVIEW=68 AUTO_LINK=0
```

### E3 — v2 `--cv`

Command: `$env:PYTHONDONTWRITEBYTECODE='1'; $env:HF_HUB_OFFLINE='1'; python eval.py --schedule dataset/baseline_schedule_v2.json --ground-truth dataset/v2/ground_truth_v2.csv --cv`

```text
Total=814 positive=744 NO_MATCH=70
Top-1 82.1% (611/744); suggestion precision 80.6%; recall 82.1%
coverage 53.1% (432/814); auto precision 99.8% (431/432)
rejection 80.0% (56/70); near-miss 25.0% (40/160); rest 97.8% (571/584)
```

### E4 — backend tests

Command: `python -m pytest -q -p no:cacheprovider`

```text
580 passed, 36046 warnings in 36.45s
```

### E5 — frontend tests

Commands: `npm test`; then `1..20 | ForEach-Object { npm test -- --run *> $null; "$_`:$LASTEXITCODE" }` in `frontend/`.

```text
Test Files 4 passed (4); Tests 55 passed (55)
FRONTEND_20_RUN_EXIT_CODES=1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0,11:0,12:0,13:0,14:0,15:0,16:0,17:0,18:0,19:0,20:0
```

Earlier, one full run and run 10 of an earlier loop failed `src/test/reconcile.test.tsx:103`, unable to find placeholder `/ask the supervisor/i` (54 passed, one failed). Final state passes; stability is not established by one green run.

## 2. Evaluation methodology

### 2.1 Split leakage/generalisation — **REFUTED as a strong generalisation test**

Command: Python normalisation of all 814 `raw_mention` values; exact cross-split comparison; `difflib.SequenceMatcher` across split boundaries at ratio >.9; activity-ID counts by split.

```text
rows=814 splits=Counter({'train':430,'test':198,'dev':186})
cross_split_exact_texts=0
cross_split_near_pairs_gt_0.9=116
0.9885 INS-FIT-1391 ... 4 nos ... | INS-FIT-1391 ... 8 nos ...
0.9853 CIV-FDN-1167 ... [date-only change]
0.9818 CIV-EXC ... well pad unit 2 ... | ... well pad unit 1 ...
distinct_positive_ids train=191 test=127 dev=126
train_test_id_overlap=107
test_positive_rows_with_id_seen_in_train=156/185
```

Exact-text isolation is **CONFIRMED**. Strong generalisation is **REFUTED**: most test positives reuse a train activity and templates cross split. Closed-set ID reuse is legitimate product behavior, but this split does not establish unseen-project or unseen-activity performance.

### 2.2 Threshold tuning and CV

Command: `rg -n "def run_cv|pooled\.extend|median|calibrate\(dev|evaluate\(test" eval.py`

```text
709:def run_cv(rows: list[dict], folds: int = 5) -> Thresholds:
725:        pooled.extend(test)
726:    # median-fold thresholds → evaluate on pooled held-out rows
806:        t = calibrate(dev, coverage_floor=args.coverage_floor)
807:        m = evaluate(test, t)
```

Default split tuning is **CONFIRMED**: dev fixes thresholds, then test is evaluated.

Pooled CV is **REFUTED as genuine OOF**. It discards fold-specific thresholds, takes their median, then reevaluates every pooled row. Each row helped determine four of the five thresholds contributing to that median.

Executed comparison:

```text
fold0 (.5,.775,.12) autoP=1 coverage=.503067
fold1 (.5,.775,.12) autoP=1 coverage=.515337
fold2 (.5,.775,.10) autoP=.989474 coverage=.582822
fold3 (.5,.775,.12) autoP=1 coverage=.552147
fold4 (.5,.775,.12) autoP=.988636 coverage=.543210
TRUE_OOF autoP=.995444 coverage=.539312 suggestionP=.806069 negrej=.8
IMPLEMENTED_MEDIAN autoP=.997685 coverage=.530713 suggestionP=.806069 negrej=.8
```

### 2.3 Production model selected on test — **REFUTED as held-out evidence**

Command: `Select-String -Path research/bench/ABLATION_RESULTS.txt -Pattern 'HELD-OUT TEST','SELECTED' -Context 0,2`

```text
research\bench\ABLATION_RESULTS.txt:23: 2. ABLATION (each change alone, vs baseline; HELD-OUT TEST split)
research\bench\ABLATION_RESULTS.txt:70: 8b. + extra features (learned) 74.1% 47.0% 100.0% SELECTED
```

`research/bench/fit_production.py:45` fits the ranker on train and `:52` fits calibration on dev. But the ablation compares configurations on test and selects 8b using test results. A new final holdout or nested selection is required.

Executed `--production` output:

```text
Top-1 74.1% (137/185); precision 74.5% (137/184)
coverage 47.0% (93/198); auto precision 100% (93/93)
rejection 100% (13/13); near 29.4% (20/68); rest 100% (117/117)
```

### 2.4 Circularity — **CONFIRMED**

Command: Python join of every positive label to its gold schedule description; matcher-normalised token Jaccard, gold-description coverage, full-string containment, and contiguous 4/6-token overlap.

```text
positives=744
all_jaccard_mean=.5034
deciles=[0,.1538,.2941,.4167,.5,.5385,.6,.6364,.6667,.7333,1]
description_coverage_mean=.8295
normalised_full_description_substring=507/744
contiguous_4gram=605/744 contiguous_6gram=496/744
exact_rows=584 jaccard=.5832 desc_coverage=.9581 full_substring=506 4gram=557 6gram=489
near_rows=160 jaccard=.2121 desc_coverage=.3602 full_substring=1 4gram=48 6gram=7
```

The generated “exact” rows are frequently near copies of the answer. The benchmark primarily demonstrates synthetic near-copy retrieval, not real terminology drift.

### 2.5 Confidence intervals — **CONFIRMED narrow evidence**

Command: deterministic 10,000-resample percentile bootstrap, seed 20260901; Wilson intervals for binomial proportions because an all-success bootstrap is degenerate.

| Metric | n | Estimate | Bootstrap 95% | Wilson 95% |
|---|---:|---:|---:|---:|
| v1 Top-1 | 242 | .872 | [.8264,.9132] | [.8239,.9083] |
| v1 precision | 249 | .831 | [.7831,.8755] | [.7799,.8727] |
| v1 coverage | 254 | .504 | [.4409,.5669] | — |
| v1 auto precision | 128 | 1 | [1,1] | [.9709,1] |
| v1 rejection | **12** | .083 | [0,.25] | [.0149,.3539] |
| v2 Top-1 | 185 | .714 | [.6486,.7784] | [.6445,.7738] |
| v2 precision | 187 | .706 | [.6364,.7701] | — |
| v2 coverage | 198 | .409 | [.3434,.4747] | — |
| v2 auto precision | 81 | 1 | [1,1] | [.9547,1] |
| v2 rejection | **13** | .846 | [.6154,1] | [.5777,.9567] |
| v2 near Top-1 | 68 | .265 | [.1618,.3676] | — |
| v2 rest Top-1 | 117 | .974 | [.9402,1] | — |

n<30 is flagged. Thirteen negatives cannot support a strong rejection claim. Even production 13/13 has Wilson interval [.7719,1].

## 3. Architectural claims

### 3.1 “An LLM never chooses an activity” — **REFUTED as normally understood**

Command: `rg -n "def _validate|parse_tags|suggestion\.tags|def _match_slots|tags=slots" server/agent_llm.py server/main.py`

```text
server/agent_llm.py:125:def _validate(outputs) -> Optional[LLMSuggestion]:
server/agent_llm.py:159: found = parse_tags(joined)
server/agent_llm.py:161: suggestion.tags = found
server/main.py:3012: if not slots.tags and suggestion.tags:
server/main.py:3013: slots.tags = suggestion.tags
server/main.py:3144:def _match_slots(...)
server/main.py:3157: tags=slots.tags or [],
```

Probe:

```text
LLM_VALIDATE tags=['V-1101'] discipline=civil
no-tag/unknown -> CIV-FDN-1160 score=.518365 REVIEW
V-1101/unknown -> CIV-FDN-1101 score=.659396 REVIEW
no-tag/civil -> CIV-FDN-1160 score=.578569 REVIEW
```

The LLM does not directly emit the final ID, but accepted model tags/discipline alter deterministic ranking. Correct claim: deterministic matching chooses using fields that may come from the LLM.

Test to add: mock identical prose with alternate hallucinated tags/disciplines; assert winner invariance if non-influence is required.

### 3.2 “Planned dates are read-only” — **REFUTED**

Command: `rg -n "planned_start\s*=|planned_finish\s*=" server`

```text
server/main.py:242: planned_start=date.fromisoformat(...)
server/main.py:243: planned_finish=date.fromisoformat(...)
server/main.py:1426: planned_start=le.reported_date or DATA_DATE
server/main.py:1427: planned_finish=le.reported_date or DATA_DATE
```

The first pair is baseline import; the second creates a planner-reviewed activity. Automated DPR rollup does not write them, but the absolute claim is false.

Test: baseline replace plus review-create; assert only authorised paths change planned fields and both are audited.

### 3.3 “Every schedule mutation produces an append-only AuditRecord” — **REFUTED in append-only half**

Source command: `rg -n "actual_start\s*=|actual_finish\s*=|actual_qty\s*=|percent_complete\s*=" server/main.py`

```text
764: act.actual_start = r.actual_start
823: act.actual_qty = new_qty
898: act.actual_finish = r.actual_finish
1558: act.actual_finish = proposed
```

Inspection of each surrounding block found `_write_audit` at `:747,807,881,1539`; mutation coverage is **CONFIRMED**.

In-memory SQLAlchemy probe:

```text
UPDATE_ALLOWED new_value=999
DELETE_ALLOWED remaining=0
```

No normal route was found, but storage does not enforce immutability. Test: require ORM update/delete to fail via storage constraint/permission.

### 3.4 “Forecast language never produces an asserted date” — **REFUTED**

Guard: `extraction/prepass.py:187-200`, binding near `extraction/extractor.py:437`.

```text
will complete                   forecast=True  finish=None
will be completed               forecast=False finish=2026-08-25
shall be completed              forecast=False finish=2026-08-25
planned for completion          forecast=True  finish=None
likely completed                forecast=False finish=2026-08-25
completion due                  forecast=False finish=2026-08-25
complete karenge                forecast=False finish=2026-08-25
completion by EOD               forecast=False finish=2026-08-25
sch. complete                   forecast=False finish=2026-08-25
expected to finish              forecast=True  finish=None
to be completed                 forecast=True  finish=None
next wk completion              forecast=False finish=2026-08-25
```

Five plausible future-tail patterns in v2 also asserted finishes, including “baaki kal karenge.” Test: parameterise passive voice, shall/likely/due, EOD, `sch.`, `wk`, and Indian English/Hinglish.

### 3.5 “Nothing is silently dropped” — **REFUTED**

Rollup probe:

```text
MISSING_ACTIVITY_RETURN (0,set()) audit=0 review=0
INTEGRITY_BLOCK_RETURN (0,set()) actual_start=None audit=0 review=0
```

`server/main.py:670` continues on missing activity; `:734` and `:866` log integrity failures without review.

CSV is accepted at `server/main.py:949`, but `extraction/extractor.py:588` returns no events plus an error. The server never reads `result.errors` and marks completed at `server/main.py:1120`.

```text
CSV_RESULT events=0 errors=['CSV extraction not yet implemented']
XLSX_ERROR_RESULT events=0 errors=['Spreadsheet parse error: percentage 150 exceeds 100']
```

XLSX uses only `wb.active` (`spreadsheet.py:196`) and searches headers only rows 1–9 (`:234`); a valid row-10 header returned `(None,{})` with no error.

Test: API cases for CSV, row-10 header, second-sheet-only data, missing activity, integrity block, and one invalid XLSX row must become visible failure/review states.

### 3.6 “Defaulted report date is never written as asserted finish” — **CONFIRMED automatically**

Command: `python -m pytest -q -p no:cacheprovider -k defaulted`

```text
11 passed, 37 deselected
AGENT_DEFAULTED reported_date=set asserted_finish=None basis=None schedule_finish=None queue_count=1
SPREADSHEET_EXPLICIT asserted_finish=<date> basis=EXPLICIT
```

DPR, agent, and spreadsheet automatic gates hold. A planner may explicitly confirm the withheld default, after which `server/main.py:1558` writes it while preserving the basis. Correct wording: “never automatically written.”

## 4. Other high-risk defects

### 4.1 Live server/evaluated system mismatch — **HIGH**

`server/main.py:384-408` pins matching to v1 `baseline_schedule.json`; baseline imports change DB rows, not the cached index. `_matcher_baseline_drift` at `:1992` only reports drift.

```text
SCHEDULE_PATH=dataset/baseline_schedule.json schedule_sha256=1bf...
thresholds=.700/.400/.030
production_ranker=False production_calibrator=False
artifact_schedule_sha256=831...
```

Neither v2 command describes the default live server.

### 4.2 Corrections are written but not read — **HIGH**

`server/main.py:1642` upserts aliases; `matching/config.py:32` has `w_alias=0`; the live engine does not load database aliases.

```text
UPSERT_RETURN=1 database_alias_rows=1
matcher_w_alias=0 matcher_alias_entries=0 alias_channel=[]
```

The default learning loop is not closed.

### 4.3 Hard-coded data date drops valid v2 actuals — **HIGH**

`server/main.py:191` fixes `DATA_DATE=2026-09-15`; validation at `:733-734` logs/drops later starts without review. V2 has 417/744 positives after the cutoff. Among 93 production held-out auto events covering 76 activities, 11 activities had extracted starts after the cutoff.

### 4.4 Spreadsheet zero fallback — **MEDIUM**

`spreadsheet.py:408` uses `quantity=achieved_qty or planned_qty`: planned 100, achieved 0 emits quantity 100 and percentage 0. Current XLSX corpus affected: 0 rows.

### 4.5 Mixed date formats reorder assertions — **MEDIUM**

`extract_dates` scans format families rather than text position (`prepass.py:337-372`).

```text
Started 3 Aug 2026 and completed 2026-08-05
dates=[2026-08-05,2026-08-03]
asserted_start=2026-08-05 asserted_finish=2026-08-03
```

Current corpus occurrences of this absolute mixed-format defect: 0.

## 5. Extraction regex/date/unit audit

Enumeration command:

`rg -n "PIPE_TAG_RE|PIPE_BARE_RE|EQUIPMENT_TAG_RE|INSTRUMENT_TAG_RE|DATE_.*RE|RELATIVE_DATE_RE|QUANTITY_RE|BARE_METER_RE|PERCENT_RE|FRACTION_RE|COMPLETED_RE|COMPLETION_WITH_DATE_RE|FORECAST_RE|STARTED_RE|IN_PROGRESS_RE|DELAYED_RE" extraction/prepass.py`

| Regex/line | Violating input | Observed; correct | Corpus impact |
|---|---|---|---:|
| pipe `:31` assumes 1–2 digit size/no left boundary | `100\"-P-1001-A1A` | `00\"-P-1001-A1A`; full tag | 0 |
| pipe `:31` assumes `[A-Z]\d[A-Z]` spec | `24\"-P-1001-A1` | only `P-1001`; full tag | 0 |
| bare pipe `:38` requires hyphen | `P 1001` | none; `P-1001` | 0 |
| equipment `:53` uppercase/hyphen | `v-1101`, `V 1101` | none; `V-1101` | 3 lowercase v2 mentions |
| equipment `:53` treats any 1–4 letters as equipment | `SS-304`, `M-20`, `ISO-9001`, `API-5L` | false tags; none | 0 generated |
| slash suffix supports two alternates | `P-1401A/B/C` | `P-1401A/B`; all three | 0 |
| instrument `:58` requires hyphen | `TI 1101` | none; `TI-1101` | 0 |
| slash date `:66` requires slash/four-digit year | `03.08.2026`, `03-08-2026`, `2/9/26` | none; date | 0 |
| alpha date `:71` day-first | `Aug 3, 2026` | none; 2026-08-03 | 0 |
| relative `:87` recognises week words but handler ignores them | `last week completed` | no date/warning | no labelled wrong-date case |
| quantity `:94` no comma/sign | `1,200 m3`, `-5 m3` | 200, +5; 1200, reject/negative | 0 |
| bare meter `:103` needs whitespace | `40m` | none; 40 m | 0 |
| percent `:106` no comma/sign/word | `1,000%`, `-10%`, `40 percent` | 0, +10, none; validate/parse | 0 |
| fraction `:122` needs spaced ASCII unit | `40m3 of 120m3`, `40 m³ of 120 m³` | none; (40,120) | 0 |
| fraction/quantity ambiguity | `2/10 spools` | quantity 10; fraction (2,10) | 0 |
| status `:156-214` lexical future guard | passive/shall/likely/Hinglish above | asserted future finish; none | 5 plausible v2 tails |
| discipline keyword regexes `:134-150` assume English keywords and first matching discipline | `RCC pour ongoing`; `structural steel erection ongoing`; `instrument cable pulling` | unknown; piping; electrical — correct civil; structural/civil; instrumentation | aggregate comparison below |
| text section header `extractor.py:243` requires digits, dot, whitespace, uppercase | `1. Work Completed` | treated as an event line; should be a header | 0 generated headers |
| spreadsheet ISO `spreadsheet.py:142` requires four-digit year | `2026-8-3` is accepted; `26-08-03` is not | none for two-digit year; date or explicit rejection | 0 |
| spreadsheet D/Mon/Y `:150` requires slashes | `03-Aug-2026` | none; 2026-08-03 | 0 |
| spreadsheet numeric date `:160` assumes day-first/full year | `08/03/26`; US `08/03/2026` | none; ambiguous US value treated as 8 March | 0 generated |
| spreadsheet alpha `:173` assumes day-first | `Aug 3 2026` | none; 2026-08-03 | 0 |

Additional probe: `P-1001 flange installed -> quantity=1001 nos`. Sixteen v1 mentions have a first quantity swallowed from a tag. Evaluation/rollup guards prevent schedule corruption, but the extracted event is wrong.

Plural UOMs (`spools`, `flanges`, `panels`) normalise downstream to `nos`; no end-to-end collision was reproduced. No unit-ending-digit collision remained after the existing `m3` fraction fix.

Corpus date scan:

```text
ISO=122 DMY_SLASH=159 DOT=0 DASH=0 D_MON_YEAR=72 D_MON=362 D/MON/YEAR=118 MONTH_FIRST=0 RELATIVE=182
labelled_stated_dates=381 parsed_to_expected=381
XLSX_date_like_cells=474 native_date_cells=0
```

All generated labelled date formats parse; realistic ungenerated variants remain uncovered.

Discipline-regex corpus probe command:

`python -c "import csv,collections; from extraction.prepass import infer_discipline; rows=list(csv.DictReader(open('dataset/v2/ground_truth_v2.csv',encoding='utf-8-sig'))); pairs=collections.Counter((r.get('discipline',''),infer_discipline(r['raw_mention']).value) for r in rows); print('rows',len(rows)); print('mismatches',sum(n for (a,b),n in pairs.items() if a and a!=b)); print(pairs.most_common())"`

Output began `rows 814`, `mismatches 457`; the largest pairs were `(piping,piping)=112`, `(static_equipment,unknown)=104`, `(civil,unknown)=97`, `(hse,unknown)=60`, `(electrical,electrical)=59`, `(piping,unknown)=55`, `(instrumentation,unknown)=54`. This is a coverage measurement, not 457 proven defects: many sentences simply omit a discipline cue and the system is designed to return `unknown`. It does prove that the regex layer alone does not recover the provided discipline on most rows.

Division audit found guards for every numeric division: fraction denominator `>0`, nonempty confidence lists, `planned_qty>0`, positive date spans, BM25 fallback, and productivity days `>0`. No reachable zero-division was reproduced. Percentages are constrained 0–100, but an XLSX 150 raises a whole-file error that the server silently completes with zero events (3.5).

## 6. Severity ranking

1. **Critical:** v2 judge-facing numbers are historical and do not reproduce.
2. **Critical:** synthetic circularity/template overlap does not establish real-world generalisation.
3. **Critical:** production configuration was selected on the test set.
4. **High:** pooled CV is not genuine OOF evaluation.
5. **High:** live server and evaluated v2 production system are different systems.
6. **High:** accepted CSV/XLSX failures can complete with zero events.
7. **High:** forecast intent can become an asserted actual finish.
8. **High:** corrections do not feed retrieval; the learning loop is open.
9. **High:** hard-coded data date logs/drops actuals without planner review.
10. **Medium:** LLM output can influence the selected activity.
11. **Medium:** audit rows are not storage-enforced append-only.
12. **Medium:** mixed dates, zero-quantity fallback, and tag/number regexes silently misparse realistic inputs.

## 7. What I would ask if I were judging this

1. Which commit, corpus hash, schedule hash, command, and live configuration produced each presentation number?
2. Why present 99.2%/97.0% when the shipped corpus produces 71.4%/82.1%?
3. Where is the untouched final test set after selecting configuration 8b on this test set?
4. Can you show true fold-specific OOF predictions rather than pooled median-threshold reevaluation?
5. What happens on independently sourced, manually labelled real project reports with no generated answer templates?
6. What is performance on unseen projects/activities, given 156/185 test positives reuse a train activity ID?
7. Why does live default to v1 hand settings while the report discusses fitted v2 production?
8. Why may an LLM-generated tag alter the winner under the claim that an LLM never chooses?
9. How does a planner see a CSV/XLSX/integrity failure when the job says completed?
10. Where is append-only audit enforcement at the storage layer?
11. How will forecast intent be handled beyond a keyword blocklist that misses site language?
12. With only 13 test negatives, what supports deployment-level rejection claims?

## Final conclusion

The conservative review policy is defensible on this synthetic benchmark. The current evaluation is not defensible as proof of real-world schedule-linking accuracy. Until stale numbers are removed, CV is corrected, model selection is separated from final testing, live and evaluated configurations are aligned, and a real independently labelled corpus is tested, the strongest honest claim is: **the prototype is conservative on this synthetic benchmark, not validated for real-project generalisation.**
