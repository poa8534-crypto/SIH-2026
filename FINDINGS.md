# FINDINGS.md — NAVIS MVP against the SIH 2026 problem statement

> **STATUS: HISTORICAL REVIEW (2026-08-31), with a maintained status table.**
> The body of this document — "Act on this first" and F1–F7 — is preserved as
> written on 31 August 2026 against the **v1 corpus**. Several of its numbers
> have since moved and several of its findings are fixed. **Do not quote a
> figure from the body of this file.** The maintained parts are the *Status as
> of 2026-09-01* table below and `METRICS.md`, which is the authority for every
> current number.

**Repo read:** `poa8534-crypto/SIH-2026`, branch `main`, 31 August 2026.
**Method:** cloned the pushed branch, read `matching/`, `extraction/`, `server/`,
`dataset/`, `frontend/src/` and `research/`, and compared against the PS text in
`SIH-2026-PS.txt`. Every finding below cites a file, a line, or a measured number
from `research/data/eval_output.txt`. Nothing here is inferred from documentation
alone — where docs and code disagree, the code is quoted.

---

## Act on this first

**The one thing to act on before anything else.** The eval output shows eleven
activities with `Actual Finish 2026-09-15`, and two of them with start equal to
finish — zero duration. The cause is `matching/engine.py:330`: when no explicit
finish date is asserted, it falls back to the mention's report date, and
`dpr_day_10.txt` is dated 15/09/2026. So every completion mentioned in the last
DPR gets stamped with the day the report was written.

That is on the Schedule screen right now, and it directly contradicts the
project's best claim — that a wrong date is never written. `ARCHITECTURE.md`
already defines `date_basis` with `DEFAULTED_TO_REPORT_DATE` for exactly this
case, and the write path ignores it. One hour to gate on it.

**The second thing is not a bug.** *(2026-08-31 figures; the funnel below is v1
and still reproducible, but the live demo now writes dates to 67 activities —
see `METRICS.md`.)* "50.4% coverage" counts mentions, and only
eleven of the 120 activities actually received dates. 65 nodes were auto-linked
but had no measurable quantity, so no date was written — which is precisely why
precision is 100%. Present the funnel (254 → 128 → 76 → 11) and explain the
guard, rather than letting a judge find the gap.

**Also missing against the PS:** no Primavera/PMXML *import* — both formats are
exported, but the baseline is a hand-written JSON. And the alias lexicon is
written on every planner correction and never read by the matcher, so the
learning loop does not close. *(Both still true as of 2026-09-01: PMXML and XER
import remain declared-and-unimplemented providers, and although the alias read
path now exists it is not wired to the database — see the status table above.)*

Full detail with line numbers follows.

---

## Status as of 2026-09-01

This review was written on 2026-08-31 against the v1 corpus. Four of its
findings have since been acted on, and two further defects — not in this
document, found while building the v2 corpus — have been fixed alongside them.

| Finding | Status |
|---|---|
| **F1** — eleven activities share one finish date | **FIXED** — D-015. `date_basis` carried end to end; a finish date defaulted to the report date is withheld and routed to the planner. 0 zero-duration activities. |
| **F7** — zero planned quantity reports 100% | **FIXED** — D-016. A missing planned quantity is separated from a genuine milestone by the unit of measure. |
| **F2** — coverage counts mentions, not schedule rows | **ADDRESSED** — the v2 harness reports the funnel and names its baseline (D-017, D-020). |
| **F3** — no Primavera import | **PARTIAL** — `POST /schedule/import` and a `ScheduleProvider` interface exist (D-017/D-018); PMXML and XER providers are declared and deliberately unimplemented. |
| **F4** — the learning loop is write-only | **CLOSED AS MEASURED (2026-09-02, D-061).** Not implemented — measured, and it cannot help. ALIAS recall@20 on the test split is 0.0%; 0 of 185 test mentions share an alias key with train; only 16 of 793 distinct keys repeat at all. And fusion recall@20 is already 100%, so no RETRIEVAL channel can contribute anything. The signal is wired to the wrong stage: corrections belong in ranking, and must generalise across mentions rather than look up exact text. `w_alias` stays 0.0. |
| **F5** — new scope indistinguishable from an uncertain match | **IMPROVED, not closed.** Superseded numbers: the 70.6% (48/68) below was measured on the 700-mention v2 corpus, which no longer exists. **Current: 80.0% (56/70) pooled 5-fold CV** on the 814-mention corpus, against 8.3% (1/12) on v1 — and the v1 figure rests on 12 negatives, too few to have meant anything. An experimental learned ranker reaches 100% (70/70) pooled but is not deployed (`METRICS.md` §3.4). |
| **F6** — 31 review rows carry a wrong top suggestion | **OPEN** (rehearsal item, no code). The v1 count of 31 still holds; the live demo queue is now **135** items for an unrelated reason — D-015 routes undated finishes to the planner. |
| *(not in this review)* **EQUIPMENT_TAG_RE digit bound** | **FIXED** — D-022. |
| *(not in this review)* **FRACTION_RE unit suffix** | **FIXED** — D-023. |
| *(not in this review)* **`EQUIPMENT_TAG_RE` ate the next tag** — `V-1101/V-1201` produced the junk tag `V-1101/V` | **FIXED** — D-025. |
| *(not in this review)* **`_SLASH_VARIANT_RE` digit bound** — `P-1401A/B` never expanded | **FIXED** — D-025. |
| *(new, 2026-09-01)* **recall@20 is 100%** — all remaining error is ranking, not retrieval | **MEASURED** — D-027. Four planned retrieval improvements each measured +0.00 and ship off. |
| *(new, 2026-09-01)* **discipline gating hurts** — −4.32 top-1, CI [−7.0, −1.6] | **REJECTED and reverted** — D-027. |
| *(new, 2026-09-01)* **gradient-boosted ranker breaches the precision floor** — 97.4% auto-link precision | **REJECTED**, not shipped — D-028. |
| *(new, 2026-09-01)* **cross-encoder accuracy** | **UNMEASURED** — model not cached, no network. Cost measured at ~45 ms/event. Do not claim it was rejected on accuracy. |

### The two defects this review did not find

Both were invisible on v1 and only appeared once a second baseline existed.
They are recorded here because they are the same *class* of problem this review
is about — an assumption that held for one dataset and silently failed on the
next.

**`extract_tags` could not see four-digit equipment tags.** The suffix bound was
three digits, which fits every v1 tag and none of v2's four-digit vessel,
instrument and package tags — 18 of its 40 distinct tags were invisible.
`tag_overlap` is the near-decisive ranking feature, so half the tag channel was
dark. Fixed in D-022: readable tags on v2 went from 22/40 to 40/40 distinct
strings, and from 96 to 205 of 700 mentions.

**`FRACTION_RE` read the digit inside a unit suffix.** `40 m3 of 120 m3` parsed
as 3/120 = 2.5% instead of 33%. It hit every unit ending in a digit — most of
the civil scope — and `percentage` gates `actual_finish`, so a naturally written
DPR silently under-reported completion. Fixed in D-023: fractions extracted on
v2 went from 42 to 104 of 700 mentions.

**What they were worth end to end, pooled 5-fold CV over all 700 v2 mentions:**
coverage 54.1% → 56.6%, auto-link recall 60.0% → 62.7%, Top-1 96.8% → 97.0%,
auto-link precision unchanged at 100.0%.

> ⚠️ **SUPERSEDED — do not quote the 97.0%.** That corpus of 700 mentions no
> longer exists: D-024 regenerated it as 814 mentions with 160 genuine
> near-misses, and pooled Top-1 on the current corpus is **82.1%**. The 97.0%
> measured a corpus that contained almost no ambiguous text. The *deltas* above
> remain the honest record of what the two extractor fixes were worth at the
> time. `METRICS.md` §3.3. **v1's numbers did not move at all** —
verified mechanically, not assumed: neither defect ever fired on the v1 corpus.

That gain is smaller than "half the tags were invisible" suggests, and the
reason is worth carrying forward: the ranker was already getting most of those
mentions right from description similarity alone, so restoring the tag channel
mostly added redundant evidence. **The defect was real; its cost was lower than
its description.**

---

## 0. Verdict

You have built the hard part. Hybrid retrieval with retrieval and ranking kept as
separate stages, a real confidence policy with a margin rule, append-only audit,
many-to-one granularity roll-up, and a working institutional-memory query layer.
Most teams on this PS will ship none of that. The evidence base in `research/` —
the precision-at-coverage sweep, the ablation, the latency measurements — is
stronger than the code in a lot of finalist projects.

The exposure is not the matcher. It is two things:

1. **Eleven activities all carry the same actual finish date, two of them with
   zero duration.** Visible on the Schedule screen, and it undercuts the exact
   claim the project rests on — that a wrong date is never written.
2. **The headline "50.4% coverage" counts mentions, not schedule rows.** A judge
   who asks how many of the 120 activities actually received dates gets the
   answer **eleven**.

Both are answerable. Neither is answerable if you meet them for the first time
in the room.

---

## 1. PS requirement coverage

| PS expected outcome | Status | Evidence |
|---|---|---|
| Ingest free-text daily reports | **Built** | 11 DPRs including one deliberately messy; regex pre-pass owns tags and dates |
| Ingest discipline spreadsheets | **Built** | Two `.xlsx` with merged headers and three date formats within a single sheet |
| Ingest Primavera / MS Project exports | **Missing** | No PMXML or XER reader. Baseline is a hand-written `dataset/baseline_schedule.json` |
| Ingest scanned diaries | **Correctly cut** | PS states production OCR is not required |
| Conversational / voice "time agent" | **Built** | Slot-filling over `POST /agent/turn`, browser speech, four distinct failure states |
| Fuzzy-match to L5/L6, terminology drift | **Built** | Tag exact + BM25 + MiniLM dense, RRF fusion, feature ranking |
| Handle granularity mismatch | **Built** | `RollupAccumulator` — many mentions to one node, quantity-based percent complete |
| Flag unmatched rather than dropping | **Partial** | Nothing is dropped, but only 1 of 12 hard negatives is confidently refused |
| Auto-update actuals, confidence + audit | **Partial** | Audit is solid; the dates written are not trustworthy yet — see F1 |
| Discipline-tagged dataset for analytics | **Built** | Six disciplines, type-enforced through one `DISCIPLINE_META` source in `config.ts` |
| Institutional memory, queryable | **Built** | Four query types, computed live, sample size shown |
| Forecasting / delay-risk discovery | **Scoped out** | The input dataset is produced; no forecasting ships. Defensible — name it as roadmap |

---

## 2. Findings

### F1 — CRITICAL — Eleven activities share one finish date; two have zero duration

> **FIXED 2026-09-01 (D-015).** `date_basis` is carried from extraction through
> the roll-up. A finish date that exists only because the report header's date
> stood in is withheld and routed to the planner with reason
> `defaulted_finish_date`. Ingesting the whole v1 dataset now finishes 38
> activities, **all** with basis `EXPLICIT`, and **0 zero-duration activities**
> (was 2). The analysis below is preserved as the record of the defect.

**Evidence.** `research/data/eval_output.txt`, the granularity roll-up table.
PIP-ERC-1034, PIP-ERC-1032, PIP-FLG-1035, PIP-FLG-1037, PIP-FLG-1039,
PIP-PCD-1053, PIP-SKN-1051, PIP-ERC-1031, PIP-ERC-1033, PIP-FLG-1036 and
PIP-FLG-1038 all show `Actual Finish 2026-09-15`. PIP-FLG-1036 and PIP-FLG-1038
additionally show `Actual Start 2026-09-15` — start equals finish, zero duration.

**Mechanism.** `matching/engine.py:330` falls back to
`actual_finish = max(acc["dates"])` when no explicit finish date was asserted,
and `acc["dates"]` (populated at `engine.py:296`) holds each mention's *report*
date, not an asserted completion date. `dataset/dpr_day_10.txt` is dated
15/09/2026. So every completion mentioned in the final DPR without its own date
is stamped with the day the report was written. The two zero-duration rows are
activities whose only mention appeared in that file.

**Why it costs you.** Variance against baseline is the entire downstream product
— the PS names it twice. A Schedule screen showing a column of identical finish
dates, and activities that started and finished on the same day, reads as a
system that fabricates dates. It attacks your strongest claim directly.

**Fix.** `ARCHITECTURE.md` §2.3 already defines `date_basis` with a
`DEFAULTED_TO_REPORT_DATE` value, and the write path ignores it. Gate on it: a
finish date that was defaulted rather than asserted must not be written silently.
Either route it to the review queue, or write it and mark it in the UI as
inferred rather than asserted. Roughly one hour. It converts your worst-looking
screen into a demonstration of the discipline you claim.

---

### F2 — HIGH — "50.4% coverage" counts mentions; the schedule received eleven rows

**Evidence.** `eval_output.txt`: "76 schedule nodes received auto-linked
mentions; 65 had no measurable quantity/percent -> 0% written, no dates."

**The real funnel.**

```
254  labelled mentions
128  auto-linked                 (50.4% coverage, 100% precision)
 76  schedule nodes touched
 11  nodes that received dates
```

**Why it costs you.** The headline is mention-level; the product is
schedule-level. The two differ by an order of magnitude and the gap is visible to
anyone who opens the Schedule screen and counts. Being asked to reconcile those
numbers live and unprepared is far worse than volunteering them.

**Fix — no code.** Lead with the funnel rather than the point metric, and explain
each narrowing as a guard you chose. The last drop is the quantity guard: a node
with no measurable quantity or percentage gets no date. That rule is *why*
auto-link precision is 100%. It is a feature — but only if you say it before
someone else notices it.

---

### F3 — HIGH — The PS names Primavera exports as an input; you only write them

**Evidence.** `POST /schedule/export` emits PMXML (`server/main.py:1652`) and XER
(`main.py:1713`). No reader exists in either format. The baseline comes from
`dataset/baseline_schedule.json`, authored by hand and loaded by
`_seed_schedule_if_empty()`. Your own `research/graphs/make_graphs.py:253` labels
"Input: Primavera PMXML / XER import" as **NOT FOUND**, and risk R2 at line 321
reads "Baseline is a hand-written JSON, not a parsed Primavera file".

**Why it costs you.** The PS lists Primavera/MS Project exports in the same
sentence as free-text reports and spreadsheets. It is the one input that proves
you can attach to a real PMIS rather than to a fixture you wrote yourself. A
judge from Oil India will ask where the baseline came from.

**Fix.** A minimal PMXML reader that walks `<Activity>` nodes into the shape
`baseline_schedule.json` already has. It does not need calendars, relationships
or resources. It needs to parse one real export and seed the schedule, so the
answer changes from "we wrote it" to "we parsed it, and here is the file". Two to
three hours. Highest-value remaining build once F1 is done.

---

### F4 — HIGH — The learning loop is write-only

**Evidence.** `AliasLexicon` rows are written at `server/main.py:1301` when a
planner resolves a review item. Nothing in `matching/` imports it — the module
has no database dependency at all. Meanwhile `main.py`'s own module docstring
claims "Planner corrections → persisted as training signal (alias lexicon)".
Persisted, yes. Used, no.

**Why it costs you.** "Does it learn from the planner?" is a question this PS
invites. The honest answer today is that corrections are recorded and never
consulted. Claiming otherwise unravels under one follow-up question.

**Fix.** At retrieval time, normalise the event text and look it up in the alias
lexicon; on a hit, inject that activity into the candidate pool with a strong
prior. About an hour. It buys a demo beat nobody else will have: correct one item
on stage, re-ingest the same DPR, watch the previously-uncertain line auto-link.
A closed loop a judge can watch happen.

---

### F5 — MEDIUM — New scope and uncertain matches are indistinguishable

**Evidence.** NO_MATCH rejection `8.3%` — 1 of 12 hard negatives correctly
refused; the other 11 landed in REVIEW.

The PS asks you to flag unmatched work for planner review rather than dropping
it, and you do — nothing is lost. But genuinely new scope arrives in the queue
looking identical to a match the system merely wasn't sure about, so the planner
cannot triage by kind.

**Fix. Do not retune thresholds before the deadline.** Moving `tau_low` to catch
more negatives risks the 100% auto-link precision that is your best defensible
number. Say it plainly instead: "we never silently drop; distinguishing new scope
from an uncertain match is the next calibration, and here is the curve we would
tune along."

---

### F6 — MEDIUM — Thirty-one review rows carry a wrong top suggestion

**Evidence.** Confusion table in `eval_output.txt` — "Gold activity, WRONG:
31 (misleading)" in the REVIEW column.

Precision-first protects the schedule, not the planner's attention. A planner who
confirms without reading the evidence introduces exactly the errors the
auto-linker refused to make.

**Fix — rehearsal, not code.** The Reconcile screen already shows source span,
confidence and alternatives. Use them: in the demo, deliberately **reject** a
wrong suggestion. It turns an admitted weakness into visible proof that the
human-in-the-loop is real rather than decorative.

---

### F7 — MEDIUM — An activity with zero planned quantity reports 100% complete

> **FIXED 2026-09-01 (D-016).** The unit of measure separates a *missing*
> planned quantity from a genuine milestone: with a uom, progress is recorded
> and no percentage is derived; without one, a completion claim still completes
> the milestone. PIP-PCD-1053 now reports 0%, not 100%. Note that this
> review's proposed fix — gate the quantity path on `planned_qty == 0` — would
> have made every milestone in the schedule permanently un-completable; the
> observation was right and the prescription was not.

**Evidence.** `eval_output.txt` roll-up table — PIP-PCD-1053, `0/0 nos`,
`100.0%`.

Small in isolation, but it sits in the same table a judge reads when checking
roll-up logic, directly beside the F1 dates. Two visible arithmetic oddities in
one table reads as carelessness even when the engine underneath is sound.

**Fix.** Guard the percent-complete path so `planned_qty == 0` cannot produce a
quantity-derived percentage. Fifteen minutes.

---

## 3. What you are underselling

**The precision-at-coverage sweep.** Seventeen rows showing exactly what coverage
costs at every threshold, with the operating point marked. Almost no hackathon
team can show the curve they tuned along. It is better evidence of engineering
judgment than any single metric, and it pre-empts the "only 50%?" question by
making the trade explicit. Put it on a slide.

**Source conflicts.** Detecting that a spreadsheet row and a daily report
disagree about the same field on the same activity, surfacing both with filename
and line number, and letting a planner adjudicate. Genuinely differentiated,
already built, and it answers the PS's "fragmented and inconsistently structured
across disciplines and contractors" more directly than the matcher does.

**Institutional memory.** The PS names it as a co-equal outcome and most teams
will treat it as a footnote. Yours computes live from captured execution data and
shows sample sizes. Give it real demo time rather than a closing mention.

---

## 4. Last day, in order

1. **Fix F1.** Stop writing defaulted report dates as asserted finishes. One
   hour. Removes the single most damaging thing a judge can see.
2. **Fix F7.** Fifteen minutes, same table, same screen.
3. **Rewrite the metric slide around the funnel** (254 → 128 → 76 → 11) and add
   the coverage curve. No code. Highest-value hour of the day.
4. **Wire the alias lexicon into retrieval (F4)** — only if 1–3 are done and
   verified. Buys a closed-loop demo beat.
5. **Minimal PMXML reader (F3)** if time genuinely remains. Do not start after
   mid-afternoon; a half-finished parser is worth less than a rehearsed demo.
6. **Rehearse three times** with `scripts/demo_reset.ps1` between runs, including
   a deliberate rejection of a wrong suggestion.

**Do not, today:** retune the matcher, start forecasting, or add OCR. The first
risks your best number; the other two are explicitly outside what the PS requires
of a prototype.
