# DECISIONS.md — Why NAVIS is built this way

The source code tells you **what** changed. This file tells you **why**.

A developer opening this file six months from now, with no access to the
conversations that produced the system, should be able to understand why it was
designed this way — and what will break if they reverse a decision.

**Maintenance rule:** see `CLAUDE.md`. Never delete a superseded decision; mark it
superseded, link its replacement, and explain why it changed.

---

## Provenance of the initial entries

Entries **D-001 through D-012** were reconstructed on 2026-08-30 from the existing
codebase, `ARCHITECTURE.md` (including its Known Limitations section), inline code
comments, and the reproducible experiments in `research/`. They document decisions
that were genuinely made and are embodied in the code, but they were written down
retroactively rather than at the moment of the decision. Dates are given as
"pre-2026-08-30" where the exact date is not recoverable from the record.

**D-013 onward are written at the time the decision is made**, as the rule requires.

### The 2026-08-31 historical pass (H-001 … H-027)

A second reconstruction pass on **2026-08-31** backfilled the period the D-series does
not cover: the planning era (2026-08-22), the pre-Git build week, and the individual
commits of 2026-08-28 → 08-30. Those entries live in **Part 0** below and use an
`H-` prefix so that reconstructed history is never mistaken for a decision recorded at
the time. See **D-014** for why they were kept as a separate series.

**Sources used, and their reliability:**

| Source | What it establishes | Reliability |
|---|---|---|
| Git history + diffs (`git log -S`, `git show`) | when a symbol, file, threshold or dependency appeared or changed | fact |
| Current source | what the system does now | fact |
| `ARCHITECTURE.md` §0–§6 | the original specification, including rejected options | fact, but **dated** — see `FLOW.md` §12 |
| `SIH context.txt`, `SIH26122_7Day_Build_Plan{,_v2}.md` | the pre-code product concept and stack, since abandoned | fact about the plan; **not** a description of this system |
| `research/data/*.json`, `eval_output.txt` | measured behaviour | fact, reproducible by harness |
| Reasoning inferred from the above | *why* a change was made where no record states it | marked `INFERRED` in the entry |

**What this pass is not:** it is reconstruction from artefacts, not a recovered
transcript of earlier design conversations. Nothing here is presented as recollection.

---

## Decision index

| ID | Title | Status |
|---|---|---|
| D-001 | Retrieval and ranking are separate stages | Active |
| D-002 | Precision-first decision rule with a margin guard | Active |
| D-003 | `rationale` is deterministic feature names, never LLM prose | Active |
| D-004 | The audit trail is append-only | Active |
| D-005 | The LLM is optional and off by default | Active |
| D-006 | Tags are never taken from the LLM | Active |
| D-007 | Unitless quantities cannot drive percent-complete | Active |
| D-008 | `actual_finish` is written only at 100% complete | Active |
| D-009 | Agent/voice updates are proposals, never direct writes | Active (supersedes D-009a) |
| D-010 | Source files are decoded explicitly, never lossily | Active |
| D-011 | Source conflicts are detected across uploads, via the audit trail | Active (supersedes D-011a) |
| D-012 | SQLite, synchronous ingest, and "on submission" rather than "near real time" | Active |
| D-013 | Adopt a persistent repository memory protocol | Active |
| D-014 | Backfill history as a parallel H-series; document defects rather than fix them | Active |

**Historical entries H-001 … H-027 are indexed separately at the top of Part 0,
immediately below.** Four of them qualify a D-entry directly and should be read with
it:

| Read this D-entry | …with this H-entry |
|---|---|
| D-001 (retrieval/ranking separated) | **H-003** — the single-LLM-call design it replaced, and the V1 residue still in the code |
| D-002 (precision-first thresholds) | **H-014** — *the server does not run the operating point the headline metric comes from* |
| D-005 (LLM optional, off by default) | **H-018** — the three specific model errors the guards were written against |
| D-012 (SQLite, synchronous ingest) | **H-007** — why "near real time" was refused, and why the `Job` table still exists |

---

---

# PART 0 — HISTORICAL RECONSTRUCTION (H-001 … H-027)

Entries in this part were reconstructed on **2026-08-31** and describe decisions
made **before** the D-series was written down. They are placed first because they
are chronologically first: H-001 through H-014 mostly predate the initial Git
commit, and H-015 onward map onto specific commits.

Read them as *why the repository looks the way it does*. Several of them explain
files, fields, dependencies and tests that make no sense from the current code
alone — because they are the residue of a design that was replaced.

**Every H entry names its evidence.** Where a claim is inference rather than
record, it is marked `INFERRED`.

## Historical index

| ID | Era | Title | Status |
|---|---|---|---|
| H-001 | 2026-08-22 | The problem was re-scoped from "WhatsApp photo → Gantt" to PS 26122 | Superseded framing |
| H-002 | 2026-08-22 → ~08-27 | The no-code stack (Lovable + Supabase) was abandoned for Python | Superseded |
| H-003 | 2026-08-22 → ~08-27 | V1 matching (one LLM call picks the task) was abandoned before it shipped | Abandoned |
| H-004 | planned 2026-08-22 | The CPM / dependency-recalculation engine was never built | Abandoned |
| H-005 | planned 2026-08-22 | Photo evidence and the vision path were never built | Abandoned |
| H-006 | pre-2026-08-28 | Institutional memory promoted from secondary to primary | Implemented |
| H-007 | pre-2026-08-28 | "Near real time" deliberately downgraded to "on submission" | Implemented |
| H-008 | pre-2026-08-28 | Export was built and import was not — the reverse of the plan | Implemented (inverted) |
| H-009 | pre-2026-08-28 | Contract-first Pydantic models, and how the contracts drifted from the spec | Partially implemented |
| H-010 | pre-2026-08-28 | Embeddings: `bge-small-en-v1.5` (spec) → `all-MiniLM-L6-v2` + hashed fallback | Superseded |
| H-011 | pre-2026-08-28 | LLM: `qwen2.5:7b-instruct` (spec) → `qwen3:8b` with schema-constrained decoding | Superseded |
| H-012 | pre-2026-08-28 | pandas and lxml were designed in and never used | Abandoned |
| H-013 | pre-2026-08-28 | One seeded generator builds the whole corpus, and the circularity is admitted | Implemented |
| H-014 | pre-2026-08-28 | **Four different threshold sets exist; the demo does not run the headline one** | Implemented (undocumented until now) |
| H-015 | 2026-08-28 `2da3c92` | The first real bug: dates were extracted and then dropped | Fixed |
| H-016 | 2026-08-28 `2da3c92` | `date_basis` provenance was specified and deliberately deferred | Deferred |
| H-017 | 2026-08-28 `e664dd8` | Start and finish became distinct assertions; the forecast guard was added | Implemented |
| H-018 | 2026-08-28 `3c6e59a` | The Ollama path was added opt-in, with guards against three named model errors | Implemented |
| H-019 | 2026-08-28 `ab137ee` | Schedule context was removed from the LLM prompt; a messy DPR was added | Implemented |
| H-020 | 2026-08-28 `21efdb9` | Reproducibility pass, and 12k lines of export artifacts left Git | Implemented |
| H-021 | 2026-08-28 `4b8ea18` | CORS: the frontend became a second process, not a served bundle | Implemented |
| H-022 | 2026-08-29 `8928df7` | Design-first UI: 22 mockups were produced before the screens | Implemented |
| H-023 | 2026-08-29 `8928df7` | Two roles, and a clarification loop back to the supervisor | Implemented |
| H-024 | 2026-08-29 `8928df7` | The field app has no offline capture, and is built never to claim one | Implemented (deliberate) |
| H-025 | 2026-08-29/30 | Three commits named "Update SIH project" — what is actually in them | Historical note |
| H-026 | 2026-08-30 | The `cline checkpoint` commits are tooling residue, not project history | Historical note |
| H-027 | 2026-08-30 `1de9b4d` | Publishing the number that undercuts the architecture | Implemented |

---

## 2026-08-22 / H-001 — The problem was re-scoped from "WhatsApp photo → Gantt" to PS 26122

### Status
Superseded framing. The early framing survives only in `SIH context.txt` and the
two build-plan documents; the shipped system answers the later one.

### Context
The project began against a **paraphrase** of the problem statement, not its text.
`SIH context.txt` (2026-08-22) describes SIH26122 as:

> "A tool that captures site photos or WhatsApp text updates and automatically links
> them to the live project schedule, updating the Gantt chart accordingly."

The actual problem statement — committed much later, on 2026-08-29, as
`SIH-2026-PS.txt` — is titled *"Intelligent Data Capture & Schedule-Linking Layer
for Infrastructure Project Management"* and asks for something materially different:
heterogeneous discipline-wise ingestion (free-text DPRs, spreadsheets, scanned
diaries, Primavera exports), L5/L6 activity-level actual start/end extraction, an
LLM conversational or voice "time agent", fuzzy matching with planner review,
confidence scores and audit trails, and **institutional memory** as a co-equal
outcome.

### Previous State
Everything in the 7-day build plans is written against the paraphrase: a 40-task
schedule, a chat box, photos, and a Gantt chart that redraws.

### Decision
Rebuild against the PS text. The words "WhatsApp", "photo" and "Gantt" do not appear
anywhere in the shipped system. What replaced them:

| Early framing | What shipped | Why |
|---|---|---|
| WhatsApp chat box | `POST /agent/turn` slot-filling agent + `POST /ingest` documents | The PS names DPRs, spreadsheets and verbal supervisor updates, not a messaging transport |
| Photo evidence | nothing | See H-005 |
| Gantt chart redraw | a planned-vs-actual **table** with variance days (`frontend/src/pages/Schedule.tsx`) | See H-004 |
| 40 tasks | 120 L5/L6 activities across 6 disciplines | The PS is explicit about L5/L6 and multi-discipline parallelism |
| "which task is this about" | AUTO_LINK / REVIEW / NEW_ACTIVITY with confidence and audit trail | The PS asks for confidence + audit + "flag unmatched rather than silently dropping" |

### Reason
The PS's actual differentiator is *reconciliation quality under heterogeneous,
badly-structured input*, plus the institutional-memory outcome. A Gantt redraw is a
visual, not an answer to the stated problem.

### Consequences
Anyone reading `SIH context.txt`, `SIH26122_7Day_Build_Plan.md` or
`SIH26122_7Day_Build_Plan_v2.md` is reading a **superseded specification**. They are
kept because they contain the competitive analysis, the risk list and the honesty
policy that are still in force — not because they describe this system.

### Historical Notes
Two things from the early framing did survive intact and are still worth protecting:

- **the mandatory human gate** — "no status change without confirmation" became
  D-009 and `POST /review/{id}/resolve`;
- **the honesty policy** — "if a judge finds a string in your product claiming
  autonomous verification, the honesty of the whole pitch is in question". That is
  visible today in `frontend/src/pages/Field.tsx:358`, in the sample-size labels on
  the Memory screen, and in the tone of `ARCHITECTURE.md` §7.

---

## 2026-08-22 → ~2026-08-27 / H-002 — The no-code stack was abandoned for Python

### Status
Superseded. No trace of the original stack exists in the repository.

### Previous State
`SIH26122_7Day_Build_Plan_v2.md` fixes a stack "up front — do not re-litigate
mid-week", under a hard rule: **"every line of code is AI-generated. Humans read,
test, and direct."** The team constraint in `SIH context.txt` is stronger still:
*"Zero manual coding on our side."*

| Layer | Planned | Shipped |
|---|---|---|
| App generation | Lovable.dev (fallback Bolt.new) | hand-structured React 19 + Vite (`frontend/`) |
| Database + auth + storage | Supabase | SQLite + SQLAlchemy, single file, **no auth** (`server/db.py`) |
| LLM calls | Claude API via a Supabase Edge Function | local Ollama, optional, off by default (`extraction/llm_backend.py`) |
| Gantt | frappe-gantt | none (H-004) |
| Schedule authoring | Google Sheets → CSV → Supabase | `generate_all.py` → `dataset/baseline_schedule.json` |
| Backend | none (Edge Functions only) | FastAPI, 17 routes, 2,690 lines (`server/main.py`) |

### Decision
A local Python monolith: FastAPI + SQLAlchemy + SQLite, with retrieval, ranking and
extraction as importable packages (`extraction/`, `matching/`), and React as a
separate dev-server process.

### Reason (partly INFERRED)
Three constraints in the record point the same way, and the code is consistent with
all three:

1. **Offline operation.** `ARCHITECTURE.md` §3 "Offline Preparation" and §5.C assume
   airplane mode at the venue. A Supabase-hosted app cannot run offline; a Claude API
   Edge Function cannot run at all without network.
2. **Auditability.** D-001 through D-004 require a deterministic, inspectable
   pipeline. A generated app whose matching lives inside one prompt cannot produce
   `FeatureVector`, `rationale` or an append-only audit trail.
3. **Measurement.** `eval.py` needs to re-decide 254 mentions under a grid of
   thresholds without re-running retrieval. That requires the decision rule to be a
   pure function (`decide_outcome`) — which it is, and the docstring says exactly
   why.

### Alternatives Considered (per the plan, then rejected)
- **Lovable + Supabase.** Rejected: no offline path, no way to hold the
  precision-first gate, and no place to put a 264-test suite.
- **Postgres.** Rejected in D-012 for the same reason at a smaller scale.

### Consequences
The "zero manual coding" constraint is **no longer true of this repository** and
should not be claimed. What can be claimed is that the system is AI-assisted and
fully test-covered.

### Risks / Limitations
The two build-plan PDFs and the Team Build Guide PDFs in the repository root still
describe the no-code stack and the team's role assignments. They are stale as
engineering documents.

---

## 2026-08-22 → ~2026-08-27 / H-003 — V1 matching (one LLM call picks the task) was abandoned before it shipped

### Status
Abandoned. This is the single most important piece of history in the project,
because the current architecture is a direct reaction to it.

**Superseded by D-001, D-002 and D-003.**

### Previous State — the V1 design, in full
`SIH26122_7Day_Build_Plan_v2.md` Day 2 specifies a Supabase Edge Function
`parse-update` that takes the message text, **injects a compact rendering of the
whole schedule into the prompt**, and asks the model to return:

```json
{
  "matched_task_id": "C-14",
  "match_confidence": 0.91,
  "alternatives": ["C-15", "C-18"],
  "proposed_status": "complete",
  "proposed_percent": 100,
  "reported_date": "2026-08-22",
  "reasoning": "Message names Zone 3 foundation; C-14 is the only foundation task in Zone 3 and is currently in progress",
  "needs_clarification": false
}
```

with three stated design decisions: filter candidates to not-started/in-progress
tasks; require `alternatives` so the review UI can offer one-click corrections;
and treat low confidence as a valid answer. The day's acceptance bar was **≥ 80%
top-1 on a 60–80 message test set**.

### Why it was abandoned
`ARCHITECTURE.md` §1 opens by reversing it, in the imperative:

> The structural point worth preserving is that **retrieval and ranking are separate
> stages on purpose**. … **Do not merge both into one opaque LLM call.** Keeping them
> separate makes the match explainable and preserves the audit trail.

Three concrete failures of V1 that the current code is shaped around:

1. **The confidence is not calibrated.** A model-emitted `match_confidence` cannot be
   swept. `eval.py`'s precision-at-coverage curve — the project's strongest artefact —
   is only possible because the score is a deterministic function of features.
2. **There is no margin.** V1 has no notion of top-1 versus top-2 separation, so it
   cannot detect *confident but ambiguous*, which is exactly the case D-002's
   `margin_min` guard exists to catch and which produced the zero-corruption result.
3. **The explanation is prose.** `reasoning` is fluent text. D-003 replaced it with a
   closed vocabulary of feature names for precisely this reason.

### Decision — V2, the shipped architecture
```
retrieve (recall-oriented, 3 channels, RRF, top-20)
    → score (6 named features, weighted, renormalised)
        → decide (tau_low / tau_high / margin / discipline veto)
```

See D-001, D-002, D-003. The LLM was demoted from *decider* to *optional enricher of
one text span* (D-005), and forbidden from supplying tags (D-006) or dates
(`_bind_assertion_dates` and the forecast guard, H-017).

### Residue of V1 still visible in the code
These are not dead code by accident — they are what is left of V1, and knowing that
explains them:

- `ExtractedEvent.activity_id`, `.confidence`, `.alternatives`, `.reasoning`,
  `.activity_description` (`extraction/models.py`) — V1's output fields. The matcher
  fills `activity_id` and `confidence` later; `alternatives` from the LLM is
  **overwritten** by the matcher's own candidates in `server/main.py`, and
  `reasoning` is never read by anything downstream.
- `Extractor.schedule_context` and `LLMBackend.extract_events(…, schedule_context, …)`
  — the whole-schedule prompt injection from V1. It is still passed and is
  **deliberately not sent** by `OllamaBackend._generate`; see H-019 for the
  measurement that killed it.
- `SYSTEM_PROMPT` rule 3, "Use the schedule context to infer discipline and status"
  (`extraction/llm_backend.py`) — a **stale instruction**. No schedule context is
  sent any more. Harmless, but it is a V1 fossil.
- `LinkedEvent.match_method` values `prepass/llm/manual` — V1 expected the LLM to be
  a matching method.

### Future Notes
Before anyone proposes "just let the model pick the activity", they must reproduce
`eval.py`'s precision-at-coverage curve with their proposal. That is the bar V1
could not meet, and it is why the pipeline has more stages than it looks like it
needs.

---

## planned 2026-08-22 / H-004 — The CPM / dependency-recalculation engine was never built

### Status
Abandoned. **Verified absent**: no topological sort, no forward pass, no
`projected_start` / `projected_finish`, no cascade, no critical path anywhere in the
repository.

### Context
In the original plan this was *the product*. Day 3's entire goal was:

> Changing one task's actual finish date correctly pushes every downstream dependent
> task and redraws the Gantt. Deterministic, explainable, no AI involved.

with an explicit algorithm (topological sort, cycle detection,
`earliest_start = max(predecessor finishes) + lag`, `projected_finish = earliest_start
+ remaining_duration`, store projected separately from planned so baseline-vs-current
is visible, flag delayed tasks, compute the knock-on to the project end date), an
independent hand-verification role, and a risk-register entry naming it "highest
single-point-of-failure". The plan's own summary reads: *"Protect first, if you fall
behind: Day 2's matcher and Day 3's recalculation, in that order… Those two are the
product."*

### Decision
Build the matcher; do not build the scheduling engine.

### Reason (INFERRED, but well supported)
`ARCHITECTURE.md` never mentions CPM, cascade or projected dates anywhere in its
component diagram, its seven data contracts, its build order or its cut list. The
concept was dropped at the architecture stage, not lost at implementation time. The
supporting argument is in `SIH context.txt` and is sound:

> "Dependency recalculation isn't something to build from scratch. Standard
> project-management logic/libraries already handle 'if task X slips, push dependent
> tasks' — the value-add here is the *automated ingestion* of informal updates into
> that existing kind of engine, not reinventing scheduling logic."

The PS agrees: it asks to "auto-update actual start/end dates in the schedule/PMIS",
not to reimplement the PMIS.

### What exists instead
- `Activity.compute_variance(data_date)` (`server/db.py`) — planned-vs-actual delta in
  days, per activity, no propagation.
- `Activity.predecessors` is used in exactly one place: as a **matching feature**,
  `_predecessor_plausibility` in `matching/features.py`, which asks "is this activity
  even startable on the reported date?" to suppress implausible candidates.
- `frontend/src/pages/Schedule.tsx` renders a TanStack **table** with planned, actual
  and variance columns. There is no bar chart and no dependency arrow.

### Consequences
- The clause *"…and recalculates dependent downstream tasks"* — which is in the early
  paraphrase, not in the PS text — is **not** satisfied and must not be claimed.
- `recharts` is declared in `frontend/package.json` and **imported by nothing**. It
  was the planned charting library. Dead dependency; safe to remove.
- `@tanstack/react-table` *is* used, by `Schedule.tsx` only.

### Future Notes
If this is ever revived, the right shape is an *export* to a real scheduling tool
(H-008), not a reimplementation. The system's job ends at writing defensible actuals.

---

## planned 2026-08-22 / H-005 — Photo evidence and the vision path were never built

### Status
Abandoned. **Verified absent**: no image handling, no vision call, no storage, no
OCR. `POST /ingest` accepts only `.txt .xlsx .csv .md .log`.

### Context
Day 4 of the plan was a photo-evidence path: upload to storage, a vision call
constrained to *describe, not conclude* ("describe what is visible; do not state
whether work is complete"), and the caption shown beside the photo in the review
queue as human-reviewable evidence.

### Decision
Drop it entirely.

### Reason
`SIH context.txt` had already flagged it as the weakest claim in the concept —
"verifying that a photo *actually shows* a completed task is a hard vision problem".
The PS itself closes the door explicitly: *"full production-grade OCR/ASR is not
required."* Spending the budget on vision would have bought a capability the PS does
not ask for, at the cost of the ingestion quality it does.

### Consequences
- `research/NAVIS_TECHNICAL_AUDIT.md` lists "Input: scanned document / OCR" as
  **NOT FOUND**, which is accurate and deliberately stated.
- The word "photo" survives only inside generated DPR prose in `generate_all.py`
  (e.g. "weekly progress photo compilation", which is a `NO_MATCH` negative) — it is
  test data, not a feature.

---

## pre-2026-08-28 / H-006 — Institutional memory was promoted from secondary to primary

### Status
Implemented (`GET /memory/query`), and deliberately thin.

### Context
`ARCHITECTURE.md` §0 makes this a headline correction to the plan:

> Institutional memory should not be secondary. It's your only defensible
> differentiator. Every team that picks this PS will build `ingest → extract → link`.
> That's the obvious 80%. The PS explicitly names institutional memory as a co-equal
> outcome, and almost nobody will ship it. Promote it to primary. It's also cheap —
> it's SQL over data you already have.

### Decision
Ship four memory queries computed from captured execution data, and put the sample
size next to every figure: `_compute_duration_distribution`, `_compute_productivity`,
`_compute_delay_reasons`, `_compute_suggested_duration` (`server/main.py`).

### Consequences and honest limits (all measured, from `ARCHITECTURE.md` §7)
- 47 of 120 activities have both an actual start and finish; only those yield a
  duration. 32 of those 47 show identical planned and actual dates.
- 26 of 56 activity types have any actual duration; only 11 have two or more, which
  is why `_compute_suggested_duration` **suppresses a suggestion below two
  completions**.
- `DelayReason.days_lost` is **attributed, not measured** — it sums the finish slip
  of affected activities, and an activity with two causes is counted against both.
- `DurationDistribution.actuals_count` / `SuggestedDuration.actuals_count` exist
  purely so the UI stops overstating: `sample_size` alone counted every activity of
  the type, claiming five samples behind a median computed from two.

### Risks / Limitations
`_compute_delay_reasons` matches **12 hard-coded keywords** against audit
`source_span` text. It is keyword recall over DPR prose, not a cause taxonomy — and
see `Audit-1.md` F-05: its second loop iterates `reasons.keys()`, so a planner's
resolution note can only reinforce a cause the audit pass already found and can never
introduce a new one.

---

## pre-2026-08-28 / H-007 — "Near real time" was deliberately downgraded to "on submission"

### Status
Implemented. This is the reasoning **behind** D-012, recorded because D-012 states
the conclusion without the argument.

### Context
The PS asks to "auto-update actual start/end dates in the schedule/PMIS **in near
real time**". `ARCHITECTURE.md` §0 refuses the phrase:

> It implies streaming, WebSockets, and background workers. Nothing here needs it.
> Ingest should be a synchronous POST that returns in under 3 seconds on 120
> activities. Use the phrase **"on submission"** instead.

### Decision
`POST /ingest` is synchronous end to end: extract → match → roll up → persist →
return. There is no queue, no worker, no polling loop and no socket.

### Reason
Measured (`research/data/latency.json`): 266 events in 1.86 s, ~7 ms/event, plus a
4.4 s one-time cold start to build the index and embed 120 activities. The budget was
never the problem, so the machinery would have bought failure modes and a
progress-polling UI for nothing.

### Historical Notes
The `Job` table is the vestige of the asynchronous design that was considered and
dropped. It still exists and is still written (`status` moves
`processing → completed | failed`), but it is written and read **within the same
request**. It survives because it is genuinely useful as an ingestion *record* — the
Ingest screen's pipeline trace reads it back — not because anything is async.

---

## pre-2026-08-28 / H-008 — Export was built and import was not, which is the reverse of the plan

### Status
Implemented, inverted. Live gap; see `Audit-1.md` F-10.

### Previous State
`ARCHITECTURE.md` §0 is explicit about the priority:

> **Drop schedule export write-back.** PMXML **input** is worth the effort. PMXML
> **output** is 2–3 hours of namespace fiddling for a demo moment that is literally
> "here is a file." Replace it with a CSV export plus one slide showing the P6
> integration path. **XER goes on the stretch list.**

The Cut List ranks them #1 (XER parsing) and #2 (PMXML export write-back) — the first
two things to remove. Build order step C was "PMXML → `ScheduleActivity`", with the
demo moment *"This is a real Primavera export"*, and `lxml` was in the stack table
for it.

### What actually happened
The exact opposite:

- **PMXML export** — built. `_generate_pmxml` (`server/main.py`).
- **XER export** — built. `_generate_xer` (`server/main.py`).
- **PMXML import** — never built. `lxml` is not in `requirements.txt`; the export uses
  `xml.etree.ElementTree` from the standard library.
- The baseline schedule is a hand-generated JSON file
  (`dataset/baseline_schedule.json`, produced by `generate_all.py`), not a parsed
  Primavera export.
- `POST /ingest` **rejects** `.xml` and `.xer`.

### Reason (INFERRED)
No record explains the reversal. The most likely reading is that export is
self-contained and demonstrable in one click, while import required a real PMXML
sample the team did not have — the PS says plainly that live project data will not
be shared.

### Consequences
The PS names "Primavera/MS Project exports" as one of the input formats to ingest.
The system emits both formats and reads neither. `research/make_report.py` concedes
this in the judge Q&A: *"Correct and conceded. PMXML/XER exist as export only; import
is the first post-hackathon item (risk R2)."*

### Future Notes
Closing this loop is cheap relative to its rhetorical value: a PMXML reader that
produces `ActivityRecord` would let `POST /ingest` accept the same file
`POST /schedule/export` emits, which makes the round trip demonstrable.

---

## pre-2026-08-28 / H-009 — Contract-first Pydantic models, and how the contracts drifted

### Status
Partially implemented. The method held; several specified fields never shipped.

### Context
`ARCHITECTURE.md` §2: *"Turn each of these into a Pydantic v2 model **before writing
other code**. These are the interfaces the team can code against in parallel."* Build
order step A is "Repo, `AGENTS.md`, Pydantic contracts — all 7 models importable and
JSON round-trip", budgeted at 0–1.5 hours, blocking everything else.

### Decision
Seven contracts, defined once, crossing every module boundary. This is why
`extraction/` knows nothing about `matching/`, `matching/` reads **nothing** from the
database, and `eval.py` can drive the engine without the server.

### What shipped, and what did not

| Spec (`ARCHITECTURE.md` §2) | Shipped | Note |
|---|---|---|
| `ScheduleActivity` | `matching/schedule_index.py :: ActivityRecord` + `server/db.py :: Activity` | Split into an in-memory record and an ORM row |
| `RawInput` | **not implemented** | Its role is served by the `Job` row plus the uploaded file |
| `ExtractedEvent` | `extraction/models.py :: ExtractedEvent` | see field drift below |
| `LinkCandidate` | `matching/models.py :: LinkCandidate` | shipped |
| `LinkDecision` | `matching/models.py :: LinkDecision` | shipped |
| `AuditRecord` | `server/db.py :: AuditRecord` | shipped, append-only (D-004) |
| `DelayReason` | `server/schemas.py :: DelayReason` | shipped, but computed by keyword (H-006) |

`ExtractedEvent` field drift — every one of these is a spec field that never existed
in code:

| Spec field | Reality |
|---|---|
| `event_id`, `input_id` | never added; identity is positional + provenance |
| `event_type` (`START`/`FINISH`/`PROGRESS`/`BLOCKED`) | replaced by `EventStatus` (`completed`/`in_progress`/`not_started`/`delayed`/`unknown`) |
| `asserted_date` + `date_basis` | replaced by `reported_date` (H-015) and later split into `asserted_start` / `asserted_finish` (H-017). `date_basis` deferred (H-016) |
| `description_text` | became `activity_description`, LLM-only, read by nothing |
| `tags_found` | became `tags` |
| `delay_signal` | never implemented |
| `extractor: {method, model, version}` | flattened to `Provenance.method` only; the model name and version are not recorded per event |
| `extraction_confidence` | became `confidence` (`_compute_confidence`) |
| `LinkCandidate.features.uom_compatible` | never implemented as a feature; UOM compatibility is enforced later, in `RollupAccumulator.add` (D-007) |
| `LinkCandidate.features.date_delta_days` | replaced by the continuous `date_proximity` |

`AGENTS.md`, named in build order step A, was **never created**. `CLAUDE.md` (D-013)
is its eventual replacement, written eight days later.

### Consequences
The contract-first method paid off — the module boundaries in `FLOW.md` §6 are real
and the seams are clean. But `ARCHITECTURE.md` §2 is now a **historical**
specification: reading it as a description of the current models will mislead.

---

## pre-2026-08-28 / H-010 — Embeddings: `bge-small-en-v1.5` (spec) → `all-MiniLM-L6-v2` (shipped)

### Status
Superseded.

### Previous State
`ARCHITECTURE.md` §3 specifies *"sentence-transformers + `bge-small-en-v1.5` — ~130 MB,
CPU-capable, offline, suited to short technical text."*

### Decision
`matching/retrieval.py :: MiniLMEmbedder.MODEL_NAME = "all-MiniLM-L6-v2"`, loaded
with `local_files_only=True` first so a cached model never touches the network,
falling back to a one-time download, and then to a **deterministic hashed
character-trigram embedder** (`_hashed_embeddings`, 384 dims) if the model cannot be
loaded at all.

### Reason (INFERRED for the model swap; recorded for the fallback)
Both models are 384-dimensional, so the change is drop-in. MiniLM-L6 is smaller
(~90 MB), faster on CPU, and by far the most commonly cached sentence-transformer —
which matters on a demo laptop that may already have it. No record states the reason;
the swap is visible only by comparing the spec to the code.

The **fallback** is recorded and is the more important half: it means
`import matching` never fails and every test runs on a machine with no model and no
network. `requirements.txt` says so explicitly — *"matching/retrieval.py degrades to
a hashed-ngram embedder if it is missing or the model is not cached, so the system
still runs without it — with weaker dense recall."*

### Risks / Limitations
The fallback is **silent**. A machine without the model produces materially worse
dense recall and nothing in the API says so; only a `logger.error` records it.
`eval.py` prints which embedder is active
(`dense: sentence-transformers all-MiniLM-L6-v2 (local, offline)`) — that line is the
only routine check that the real model is loaded. **Check it before trusting any
metric.**

`sentence-transformers` pulls torch (~2–3 GB) and is the single heaviest dependency
in the project.

---

## pre-2026-08-28 / H-011 — LLM: `qwen2.5:7b-instruct` (spec) → `qwen3:8b` with grammar-constrained decoding

### Status
Superseded. Both are historical in effect, since the LLM is off by default (D-005).

### Previous State
`ARCHITECTURE.md` §3: *"Ollama `qwen2.5:7b-instruct` primary; API accelerator"* and
*"Structured output: Ollama JSON schema mode — constrained structured decoding
instead of best-effort JSON prompting."*

### Decision
`OLLAMA_MODEL=qwen3:8b` (`.env.example`, `extraction/llm_backend.py`), with two
non-obvious settings that are load-bearing:

- **`format` is given the full JSON Schema of `LLMEventOutput`**, not the string
  `"json"`. Ollama compiles the schema to a grammar and constrains sampling to it, so
  the response is structurally valid *and enum fields cannot go out of vocabulary*.
  Asking for JSON in a prompt only makes it likely.
- **`think: false`, sent explicitly.** qwen3 is a hybrid reasoning model; its think
  block is emitted before the JSON, which breaks structured output and costs latency
  for a task that needs extraction, not deliberation. The code additionally logs a
  warning if a think block arrives anyway.

### Reason
The second half of the spec — constrained decoding — survived and is the part that
matters. The model version moved forward because qwen3 was the current release.

### Consequences
A detail learned the hard way and worth not rediscovering: `is_available()` checks
not just that Ollama answers, but that the **configured model is actually pulled**
(via `/api/tags`), because "Ollama is up" and "the model exists" are different
failures with the same symptom.

---

## pre-2026-08-28 / H-012 — pandas and lxml were designed in and never used

### Status
Abandoned.

### Context
`ARCHITECTURE.md` §3 lists *"Spreadsheet: pandas + openpyxl — handles merged headers
and mixed date types"* and *"Schedule import: lxml for PMXML"*.

### Decision
Neither is a dependency. `requirements.txt` contains `openpyxl==3.1.5` only, and
`extraction/spreadsheet.py` drives openpyxl directly — `_detect_headers`, `_read_row`,
`_is_summary_row`, `_row_to_event`, plus a hand-written `coerce_date`.

### Reason
The two things pandas was wanted for — merged headers and mixed date types — are
exactly what the hand-written parser does, and doing it by hand keeps the row number
(`source_row`) attached to every event. A DataFrame loses the sheet position, and the
audit trail (D-004) needs it. `lxml` went with H-008: there is no import path to
parse.

### Consequences
One fewer large dependency, and provenance survives the spreadsheet path intact.

---

## pre-2026-08-28 / H-013 — One seeded generator builds the whole corpus, and the circularity is admitted

### Status
Implemented.

### Decision
`generate_all.py` (947 lines, `random.seed(20260822)`) emits the entire dataset in one
run: `dataset/baseline_schedule.json` (120 activities, asserted at generation time),
10 DPRs, `piping_progress.xlsx`, `civil_progress.xlsx`, and `ground_truth.csv`
(254 labelled mentions). Every artefact cross-references the others.

### Design choices inside it, and why
- **120 L5/L6 activities across six disciplines** — civil 22, piping 30, static
  equipment 22, electrical 20, instrumentation 16, HSE 10 — because the PS names
  exactly those disciplines "each executing and reporting in parallel".
- **Real EPC line tags** (`24"-P-1001-A1A`, `12"-P-1002-B1A`) on piping activities,
  because tag matching is the discriminating signal the PS describes
  (*"'spool erected' vs the plan's 'Erect Line 24"-XX'"*).
- **Quantities and UOM on every activity** (`48 m3`, `16 nos`, `480 lm`) so that
  percent-complete can be derived from measurement rather than asserted, which is
  what makes D-007 and D-008 possible at all.
- **`NO_MATCH` mentions are hand-placed**, one or two per DPR — "material delivery
  status report", "JMR for August progress billing", "weekly progress photo
  compilation". They are the only hard negatives, and there are only 12.
- **The mention list is written next to the DPR prose it appears in**, so the label
  and the text cannot drift apart.

### Ground-truth shape
`dataset/ground_truth.csv` — 254 rows, columns
`source, source_date, raw_mention, activity_id, match_type`. Distribution by source:
`dpr_day_08` 30, `piping_progress.xlsx` 30, `dpr_day_06` 27, `dpr_day_07` 24,
`dpr_day_05` 22, `dpr_day_09` 22, `civil_progress.xlsx` 22, `dpr_day_10` 21,
`dpr_day_03` 19, `dpr_day_01` 14, `dpr_day_02` 14, `dpr_day_04` 9.
The file is **cp1252-encoded** — `eval.py` opens it with `encoding="cp1252"`
explicitly, which is the same lesson as D-010 applied to the ground truth.

### Risks / Limitations — stated, not hidden
- **The evaluation is partly circular.** One generator wrote both the DPR text and its
  label, so `eval.py` measures agreement with the generator's intent as well as
  matching quality. `ARCHITECTURE.md` §5.B proposed the cheapest test — two people
  independently relabel 40 sampled mentions, report inter-annotator agreement — and
  **that test was never run**. `research/EXPERIMENTS.md` labels this R4.
- **NO_MATCH rejection is 8.3% (1 of 12)** and cannot improve much on 12 examples.
  This is the weakest measured number in the project.
- **`dataset/dpr_day_11_messy.txt` is deliberately outside the ground truth.** It was
  hand-written later (H-019) with code-mixed Hindi/English, tag-free references
  ("the 24 inch line near rack 3"), and no clean structure. It exists to be *read*,
  not scored — there is no label file for it.
- **Regenerating is destructive.** Running `generate_all.py` rewrites
  `baseline_schedule.json` and `ground_truth.csv`. Since the seed is fixed the output
  is stable, but any hand-edit to those files would be lost.

---

## pre-2026-08-28 / H-014 — Four different threshold sets exist, and the demo does not run the headline one

### Status
Implemented, and **undocumented anywhere in the repository until this entry**. This
is the most important correction in Part 0.

**Refines D-002**, which states the decision rule correctly but gives only one of the
operating points.

### Context
D-002 records the decision rule and gives an operating point of `tau_high = 0.775`.
`research/NAVIS_TECHNICAL_AUDIT.md` states *"tau_high=0.775, tau_low=0.5,
margin_min=0.03 (matching/models.py Thresholds; calibrated via eval.py)"*. Both are
describing the **evaluation harness**, not the running server, and neither says so.

### The actual state of the code

| Where | Values | Who uses it |
|---|---|---|
| `matching/models.py :: Thresholds` defaults | `tau_high=0.78, tau_low=0.42, margin_min=0.06` | any `MatchingEngine(...)` built without explicit thresholds — including `research/data/ablation.py`, `bm25gate.py`, `disagree.py`, `hypothesis.py` |
| `server/main.py :: MATCHING_THRESHOLDS` | **`tau_high=0.70, tau_low=0.40, margin_min=0.03`** | **the live server — every `POST /ingest`, every `POST /agent/turn`, the demo, the seeded database** |
| `eval.py :: calibrate()` grid search | `tau_high=0.775, tau_low=0.5, margin_min=0.03` (result, recomputed each run) | `python eval.py` — the source of the headline metrics |
| `research/data/densefix.py`, `weights.py` | `tau_high=0.775, tau_low=0.5, margin_min=0.03` (hard-coded) | those two experiments, to match `eval.py`'s operating point |
| `matching/test_matching.py` | `tau_high=0.8, tau_low=0.45, margin_min=0.06` | one unit test of `decide_outcome` |

All of these have been present and unchanged since the initial commit `c16d5f4`
(verified with `git log -S`).

### Why they differ — this is the substantive point
They are calibrated **on different input distributions**, and the code says so:

- `eval.py` scores the engine on **ground-truth mentions**: clean, pre-segmented text
  spans lifted from `ground_truth.csv`. Its own docstring is explicit —
  *"extraction alignment noise is deliberately excluded"*. On that distribution the
  grid search finds 0.775 and reports **100% auto-link precision at 50.4% coverage**.
- `server/main.py` runs on **whatever the extractor produced**: spans cut out of a
  DPR by `_parse_text_spans`, with their own segmentation errors. The comment above
  `MATCHING_THRESHOLDS` records that separate calibration:

  > Calibrated for the REAL pipeline (extraction spans → matching) by aligning
  > `dataset/ground_truth.csv` mentions to extracted events and grid-searching:
  > **auto-link precision 96.6%, coverage 48%**, suggestion recall 86.4%, 5/12
  > `NO_MATCH` hard negatives rejected, 0 schedule-corrupting FPs at the stricter
  > point (0.65/0.30/0.08 → 97.9% precision, 38.7% coverage).

### Consequences — read this before quoting a number
- **"Zero wrong auto-links in 254 mentions" is an `eval.py` property.** It is true, it
  is reproducible, and it is measured on gold mentions at `tau_high=0.775`.
- **The running system is a different operating point.** At 0.70 the same code base
  measured **96.6%** auto-link precision on real extraction spans. That is still very
  good and it is still precision-first, but it is **not** zero-corruption.
- Anyone comparing `eval.py`'s output to the seeded database will find they do not
  correspond, and the reason is this, not a bug.
- The `Thresholds` model defaults (0.78/0.42/0.06) are used by **four of the eight
  research harnesses** and match neither of the other two sets. Their absolute
  coverage figures are therefore not comparable to `eval_output.txt`; their *relative*
  arm-vs-arm comparisons are, which is all those experiments claim.

### Future Notes
The honest fix is one of two things, and it should be a conscious choice:

1. make `server/main.py` import the calibrated operating point rather than hard-code
   a second one, and re-measure; or
2. keep two operating points deliberately and **say so** in `DECISIONS.md`, in
   `research/EVIDENCE.md` and on any slide that quotes 100%.

Either way, no claim of "100% auto-link precision" should be made about the *running
demo* without stating which threshold set produced it.

---

## 2026-08-28 `2da3c92` / H-015 — The first real bug: dates were extracted and then dropped

### Status
Fixed.

### Context
At the first commit (`c16d5f4`), the extractor ran `extract_dates_with_flags` on every
span, resolved relative dates, stored them in `hints["dates"]` — and then never put
them on the event. `ExtractedEvent.reported_date` was constructed as `None` every
time.

### Consequences at the time
Everything downstream that depends on a date silently produced nothing:

- `_date_proximity` returned `None`, so the date feature was excluded from every
  score and the weights renormalised without it;
- `_predecessor_plausibility` returned `None` for the same reason;
- `RollupAccumulator` had no `reported_date` fallback, so **no activity received an
  `actual_start` or `actual_finish`**, and therefore no audit record was written for
  a date;
- the Schedule screen showed a baseline with no actuals at all.

### Decision
Bind the date on the event: first date resolved from the span itself, else the DPR
header's report date (`extraction/extractor.py :: _merge_event`). For spreadsheets,
the completion column first and the commencement column as fallback —
*"these registers report finished work"* (`extraction/spreadsheet.py :: _row_to_event`).

### Result, from the commit message
> `fixes 1,2: actuals persist, 21 activities, 63 audit records, eval 100% auto-link
> precision at 50.4% coverage`

### Historical Notes
This is the origin of the headline metric. The 100%/50.4% pair first appears here, in
the commit that made dates work at all — which is worth knowing, because it means the
operating point was chosen against a pipeline that had only just started producing
dates.

**Lesson worth keeping:** a field that is computed, logged in hints, and never bound
to the output model fails completely silently, because every consumer treats `None`
as "signal absent" by design (D-001's renormalising blend). The same failure mode is
still available today — `FeatureVector` fields are all `Optional`, and `Audit-1.md`
F-01 is a live instance of it (`_dense_cos` returning `None`).

---

## 2026-08-28 `2da3c92` / H-016 — `date_basis` provenance was specified and deliberately deferred

### Status
Deferred. Still absent.

### Context
`ARCHITECTURE.md` §2.3 specified a `date_basis` enum on every event:
`EXPLICIT` / `RELATIVE_RESOLVED` / `DEFAULTED_TO_REPORT_DATE`.

### Decision
Drop it, and record the drop in the spec rather than leave the enum standing. The
same commit rewrote §2.3 to read:

> The date is resolved from the span itself where the text carries one, and otherwise
> defaults to the source's report date (the DPR header date, or the completion column
> for a spreadsheet register). Recording *which* of those two produced the date — the
> `date_basis` provenance field — was deferred.

### Consequences
A planner reading the audit trail cannot currently distinguish *"the line said
2 Aug"* from *"the line said nothing, so we used the report header's date"*. Both
appear identically as a value with a `source_file` and, sometimes, a `source_line`.

This is the same information gap that `ARCHITECTURE.md` §7 later describes from the
other end — **165 of 259 audit rows have an exact position, and the rest do not** —
and it is the same gap that `Audit-1.md` F-06 measures the cost of: five zero-day
durations out of 47 completed activities, produced by the `max(reported_date)`
fallback in `RollupAccumulator.results()`.

### Future Notes
Reinstating `date_basis` is small (one enum, one field on `Provenance` or
`DateAssertion`, one column on `AuditRecord`) and would let the UI say "inferred from
report date" instead of showing a date with no line number. It is the cheapest single
improvement to audit legibility available.

---

## 2026-08-28 `e664dd8` / H-017 — Start and finish became distinct assertions, and forecasts stopped becoming actuals

### Status
Implemented. This is the origin of D-008 and half of D-007.

### Previous State
One date per event. A node's `actual_start` and `actual_finish` were both derived
from the same `reported_date` pool, so a completed activity's start and finish were
frequently the same day, and a DPR line covering *part* of a node's scope
("pedestals P7–P12 completed", against a P1–P12 node) finished the whole node.

### Decision — four changes in one commit
1. **`ExtractedEvent.asserted_start` and `.asserted_finish`** (`extraction/models.py`)
   — a claim about when work *began* or *completed*, distinct from `reported_date`
   which is merely when the line was written.
2. **`_bind_assertion_dates`** (`extraction/extractor.py`) — decides whether a line
   asserts a start, a finish, both, or neither, and binds the extracted dates to those
   claims **positionally** when a line makes both claims and carries two dates.
3. **The forecast guard.** `is_forecast_language()` (`extraction/prepass.py`).
   The trigger case is real and is in the seeded corpus: `dpr_day_01.txt` ends with
   *"TK-1 hydrotest now scheduled 25 Aug instead of 23 Aug due to shell erection
   delay."* That line carries two valid dates and both are **planned**. Writing either
   would record a completed hydrotest for work that has not happened. The guard
   returns `(None, None)` for the whole line. The comment in the code states why it
   lives there and not in the prompt:

   > This lives in code rather than the prompt so it holds for every provider and
   > cannot be talked out of by a model.

4. **`DateAssertion`** (`matching/models.py`) — each claim kept individually, with its
   file, line and row, *"rather than collapsed into a min/max so that a disagreement
   between two sources stays visible in the audit trail"*.

### Reason
Partial-scope protection (now D-008) and provenance (now D-004) both require knowing
*which source claimed what*, not just the surviving value.

### Consequences
`actual_start` = earliest assertion (else `min(reported_date)`); `actual_finish` =
latest assertion, **and only at 100% complete**. A finish asserted below 100% is
recorded as a conflict and not applied.

### Historical Notes
The claim-detection logic was later loosened once, and the reason is in the code:
`claims_finish` originally required a `COMPLETED_RE` match. That

> "silently discarded every completion only an LLM could see. 'Both pumps set and
> aligned. Alignment JMR signed 12 Sep' carries no completion keyword at all, and was
> losing its finish date."

so it now trusts the **inferred status** (`status == "completed"`) or a completion
verb with a date bound directly to it (`COMPLETION_WITH_DATE_RE`). That change is what
commit `72df1cc` means by *"let LLM-supplied status assert a finish"* — and it is only
safe because the forecast guard runs first and because D-008 still refuses to write a
finish below 100%.

---

## 2026-08-28 `3c6e59a` / H-018 — The Ollama path was added opt-in, with guards against three named model errors

### Status
Implemented. The reasoning behind D-005, D-006 and D-007, recorded as a sequence.

### Context
The PS asks for an "LLM-based conversational or voice interface", and up to this
point there was no working LLM path at all — `NullBackend` was the only backend that
ran. The question was how to add one without letting it become a liability.

### Decision
Add it **behind a flag that defaults to off**, and write a guard test for each way a
model was observed to be wrong. `extraction/test_llm_guards.py` (added in this commit,
extended in `72df1cc`) is organised around exactly those three failures:

1. **The model invents tags.** A model returning description words — "steel erection",
   "pipe rack", "hydrotest", "tank" — as equipment tags would feed `tag_overlap`, the
   highest-weighted feature (0.32), and `line_locked`, which is a *floor* rather than
   a weight. Guard: tags come only from the regex pre-pass, even when the pre-pass
   found none. → **D-006**.
2. **The model asserts completion on a forecast line.** Guard: `is_forecast_language`
   is checked before the LLM's status may override an unknown status, so
   *"now scheduled 25 Aug"* can never complete a node. → H-017.
3. **The model returns a quantity with no unit.** *"All 12 pockets grouted"* → quantity
   12, no UOM. Against a node planned as 48 m³ that silently registers 25% complete.
   Guard: added in `72df1cc` — a unitless quantity is excluded from percent-complete
   and a note is recorded. → **D-007**.

Plus two enum guards: `_validated_discipline` and `_validated_status` coerce anything
out of vocabulary to `unknown` rather than raising or passing it through — belt and
braces behind the grammar-constrained decoding (H-011), for providers that do not
support it.

### Reason
The blast radius of each error is asymmetric. A missed tag costs recall on one event;
a hallucinated tag corrupts a link with near-decisive force. Every guard is written on
the side of the smaller blast radius.

### Historical Notes
The commit message names the shape of the work exactly: *"Add opt-in Ollama extraction
path with guards against three model errors."* The guards were written **with** the
feature, not after an incident — which is why the LLM has never been able to damage
the pipeline.

---

## 2026-08-28 `ab137ee` / H-019 — Schedule context was removed from the LLM prompt; a messy DPR was added

### Status
Implemented.

### Previous State
Every LLM call carried the ~3,000-token rendering of the whole baseline schedule,
inherited directly from the V1 design (H-003), where the model needed it to choose an
activity.

### Decision
Stop sending it. `OllamaBackend._generate` keeps the parameter for interface
compatibility and documents why it is ignored:

> It existed only so the model could populate `alternatives` with plausible
> activity_ids, and nothing downstream reads that field: `matching/` never references
> it, and `server.main` overwrites `LinkedEvent.alternatives` with the matcher's own
> candidates. Re-sending it per span cost more than the inference itself — **the first
> call of every run stalled past its timeout on prefill** — to produce information no
> consumer uses. Linking is the matcher's job, not the model's.

### Reason
A measured cost (prefill dominating every call, timing out the first one) paid for an
output with no consumer. It is also the last place the V1 architecture was still
influencing runtime behaviour.

### The second half of the commit
`dataset/dpr_day_11_messy.txt` was hand-written and added in the same commit, for
"honest LLM benchmarking". It is the only report in the corpus that is genuinely hard:
code-mixed Hindi/English (*"Baaki kal karenge, material ka issue tha subah"*,
*"kaam chalu hai"*), tag-free references (*"the 24 inch line near rack 3"*,
*"the big tank"*), informal quantities (*"30 of 36 bolted up"*, *"roughly 30 cum"*),
and unstructured prose. It is deliberately **not** in `ground_truth.csv` — it exists
to show what the rules-only path cannot do and what an LLM might.

### Consequences
This is the file to ingest when demonstrating the *limits* of the deterministic path,
and the file to use when evaluating whether the LLM path earns its keep.

---

## 2026-08-28 `21efdb9` / H-020 — Reproducibility pass, and 12k lines of export artifacts left Git

### Status
Implemented.

### Context
The first commit had accidentally tracked `dataset/uploads/` — the directory
`POST /ingest` writes uploads into and `POST /schedule/export` writes exports into.
That included five generated PMXML+XER pairs, about 11,700 lines of machine-generated
XML, plus duplicate copies of every DPR and spreadsheet.

### Decision — four things at once
1. `.gitignore` gains `dataset/uploads/` (`9e0aa29`), and the tracked copies are
   removed (`21efdb9`, −12,115 lines).
2. `requirements.txt` — pinned, and annotated with *why each package is there*,
   including the one that cannot be found by grepping imports:
   *"`python-multipart` … Required by FastAPI to parse multipart uploads on
   POST /ingest. Imported by FastAPI at request time, not by our code, so it will not
   show up in a grep for imports — omitting it makes /ingest fail at runtime only."*
3. `SETUP.md` — environment setup.
4. `scripts/seed.py` and `scripts/healthcheck.py` — a scripted path from empty
   checkout to a populated database and a verified end-to-end run.

### Reason
`ARCHITECTURE.md` §5.C names the risk directly: *"enable airplane mode, fresh boot the
actual demo laptop, run the full ingest-to-memory flow, and time it."* None of that is
possible without pinned dependencies and a one-command seed.

### Consequences
`dataset/uploads/` is generated and must stay untracked. `CLAUDE.md` restates this as
a standing rule, alongside `*.db` and `*.7z`.

---

## 2026-08-28 `4b8ea18` / H-021 — CORS: the frontend became a second process

### Status
Implemented.

### Decision
Add `CORSMiddleware` with an explicit origin list plus a regex (`server/main.py`),
rather than serving the built frontend from FastAPI as static files.

### Reason
Vite's dev server and its hot reload are worth far more during a build than a single
deployable artefact, and `ARCHITECTURE.md` §3 had already chosen `venv` + `npm run dev`
over Docker to avoid a container dependency at the venue.

### Consequences
- **Two processes must be running** for anything to work. This is the most common
  "nothing loads" cause; `DEMO.md` and `scripts/demo_reset.ps1` exist partly because
  of it.
- The allowed-origin list is broad *by design* — it has to match whatever host and
  port a demo laptop, a phone on the same LAN, or a tunnelled URL ends up using. The
  comment above it reads *"Everything else we need to reach during a demo, matched in
  full"*. That is a **demo posture, not a security posture**; see D-012 and
  `Audit-1.md` F-11 (no authentication at all).

---

## 2026-08-29 `8928df7` / H-022 — Design-first UI: 22 mockups were produced before the screens

### Status
Implemented.

### Decision
Before writing the field and planner screens, produce a full set of static HTML+PNG
mockups covering every state, and keep them in the repository under `Design/`.

The set (22 directories, each with `code.html` and `screen.png`) covers role
selection (desktop + mobile); the field supervisor's home, listening, transcript
review, structured update, submitted, pending-sync, clarifications, reports and
profile; **and the failure states explicitly** —
`field_supervisor_microphone_unavailable`, `field_supervisor_speech_not_understood`,
`field_supervisor_assistant_unavailable`; plus the planner's home, ingest,
ingest-states, reconcile, reconcile-failed, reconcile-no-candidates,
reconcile-queue-clear, schedule and memory. `Design/technical_precision/DESIGN.md`
holds the design language.

### Reason
The empty, error and degraded states are the ones that appear on stage and the ones
that are never designed. Designing them first is why
`frontend/src/test/states.test.tsx` exists and why the field screens have coherent
behaviour when speech recognition is unavailable.

### Historical Notes — where the mockups and the code disagree
The mockups are a **specification that the code partly refused**.
`ARCHITECTURE.md` §7 records the disagreements rather than quietly closing them:

> The Stitch mockups show the agent asking "Which date was it completed?" and "How
> many spools out of the planned quantity?" — those questions do not exist.

They exist **now** — `_next_missing` asks for discipline, location, status, date and,
when relevant, completed and planned quantity — but that paragraph of §7 was written
before that work and was never updated. **When a mockup and the code disagree, the
code is authoritative, and `ARCHITECTURE.md` §7 may be describing either.**

One mockup describes a state that deliberately does not exist:
`field_supervisor_update_pending_sync`. See H-024.

---

## 2026-08-29 `8928df7` / H-023 — Two roles, and a clarification loop back to the supervisor

### Status
Implemented.

### Context
The PS names two distinct actors with incompatible needs: *site supervisors across
disciplines* who must log with "minimal friction", and *planners* who reconcile.

### Decision
Split the frontend into two role surfaces off one API:

| Role | Routes | Screens |
|---|---|---|
| Planning engineer | `/home /reconcile /schedule /ingest /memory` | `Home.tsx`, `Reconcile.tsx`, `Schedule.tsx`, `Ingest.tsx`, `Memory.tsx` |
| Field supervisor | `/field /field/reports /field/clarifications /field/profile` | `Field.tsx`, `FieldReports.tsx`, `FieldClarifications.tsx`, `FieldProfile.tsx` |

and add a **bidirectional clarification loop**, which is the part not implied by the
PS and is arguably the product's best original idea:

```
planner sees a queued item they cannot resolve
    → POST /review/{id}/clarify              ask_clarification()
        → ReviewQueueItem.clarification_question / _asked_by / _asked_at
supervisor sees it on /field/clarifications
    → GET  /field/clarifications             field_clarifications()
    → POST /field/clarifications/{id}/respond  answer_clarification()
        → ReviewQueueItem.clarification_response / _answered_at
planner resolves with the answer in hand
    → POST /review/{id}/resolve
```

Crucially, `/clarify` **does not resolve the item**. It sets the question, clears any
previous answer, and leaves the queue entry pending — so an unanswered question can
never look like a decision.

### Consequences
`ReviewQueueItem` gained five columns for this. That schema change is what broke
`reset_demo` and produced the schema-drift rebuild described in D-012's Future Notes:
SQLAlchemy's `create_all` adds missing *tables* but never missing *columns*, so a
database created before those columns existed kept working right up until the first
insert.

---

## 2026-08-29 `8928df7` / H-024 — The field app has no offline capture, and is built never to claim one

### Status
Implemented deliberately. Live gap; `Audit-1.md` F-08.

### Context
The PS's premise is a supervisor on a site. Sites lose connectivity. The mockups
include a `field_supervisor_update_pending_sync` state.

### Decision
**Do not** implement offline capture — no service worker, no IndexedDB, no draft
queue — and make the absence honest rather than invisible.
`frontend/src/pages/Field.tsx:358` carries the rule as a comment:

> `// No offline storage: never claim it was saved, and keep his text.`

On a failed submit the supervisor's typed text is preserved in the box and nothing
tells them it was stored.

`frontend/src/test/field.test.tsx` enforces it as a test: the words `Offline`,
`offline`, `sync`, `Draft`, `draft` and `Notification` must **not** appear on the
field screens. `FieldProfile.tsx` records the same rule for the profile screen.

The only browser storage anywhere in the frontend is two UI preferences —
`view_override` in `useDevice.ts` and the theme in `useTheme.ts`. No project data is
ever persisted client-side.

### Reason
A false "saved" indicator on a construction site loses a day of progress data and
destroys trust in the tool permanently. An honest failure costs one retry. This is
the same honesty policy as H-001 and H-005, applied to a state rather than a feature.

### Risks / Limitations
This is a genuine PS gap, not a hidden one: low-friction capture is the PS's stated
requirement and connectivity is the obvious obstacle. Implementing it properly means
an outbox with idempotent replay keyed on a client-generated id — the server's
sha256 dedup on `/ingest` and `_existing_agent_submission` on `/agent/turn` are the
right foundations, but nothing on the client uses them yet.

---

## 2026-08-29 / 2026-08-30 / H-025 — Three commits named "Update SIH project"

### Status
Historical note. Recorded because the commit messages carry no information and the
diffs are large.

`CLAUDE.md`'s Git rules — *"Never `update`, `changes`, `fix stuff`, `final`,
`working`, `commit`"* — were written on 2026-08-30 in direct response to these.

| Commit | Date | ~Size | What is actually in it |
|---|---|---|---|
| `8928df7` | 08-29 21:47 | +19,761 / −454 | **The largest commit in the project.** The entire field-supervisor surface (`Field.tsx`, `FieldReports.tsx`, `FieldClarifications.tsx`, `FieldProfile.tsx`, `useSpeech.ts`), the planner surface (`Home.tsx`, `Ingest.tsx`, `Memory.tsx`, `Schedule.tsx`), the agent backend (`agent_slots.py`, `agent_llm.py`, `demo.py`, `conftest.py`, `test_agent.py`, `test_agent_llm.py`), `+1,296` lines of `server/main.py` (clarifications, conflicts, `/audit/recent`, memory queries, agent turn), `extraction/textio.py` (D-010), `scripts/reset_demo.py`, `DEMO.md`, `SIH-2026-PS.txt`, and all 22 `Design/` mockups |
| `db16992` | 08-30 01:05 | +1,161 / −467 | Frontend refinement pass: `FieldContextBlocks.tsx` added, `index.css` reworked, `Field.tsx` restructured, `states.test.tsx` added (242 lines of empty/error/degraded-state tests) |
| `9e7775d` | 08-30 13:48 | +1,262 / −681 | Second frontend pass: `usePageHeader.ts`, `config.ts` expansion, `App.tsx` navigation rework, `Reconcile.tsx` rework, `reconcile.test.tsx` added |

**Nothing outside `frontend/src` changed in the last two.** If you are bisecting a
backend behaviour, `8928df7` is the boundary.

---

## 2026-08-30 / H-026 — The `cline checkpoint` commits are tooling residue

### Status
Historical note.

`git log --all` shows a small dangling branch off `9e7775d`:

```
* 111b9f2  cline checkpoint session=1788090555292_n3ojn run=1
|\
| * 1ae82c2  untracked files on cline checkpoint
* 7be95c2  index on main: 9e7775d Update SIH project
```

These are **stash-shaped snapshots written by an editor agent**, not deliberate
project history. They are unreachable from `main`, they are not on `origin`, and
nothing in the project depends on them. Ignore them when reading history; do not
merge them.

---

## 2026-08-30 `1de9b4d` / H-027 — Publishing the number that undercuts the architecture

### Status
Implemented. The most unusual decision in the project.

### Context
`research/data/ablation.py` measures each retrieval arm alone against the shipped
pipeline. The result is uncomfortable:

| Arm | Top-1 | Recall@20 | ms/mention |
|---|---|---|---|
| EXACT (tag only) | 4.9% | 32.2% | 0.005 |
| **BM25 (lexical only)** | **93.8%** | 99.2% | 0.15 |
| DENSE (MiniLM only) | 88.8% | 100% | 4.8 |
| HYBRID RRF (no scoring) | 92.1% | 100% | 4.9 |
| **HYBRID + feature scoring (shipped)** | **87.2%** | 100% | 5.6 |

**The shipped pipeline ranks 6.6 points worse than plain BM25, and is 37× slower.**

### Decision
Publish it, in `research/EXPERIMENTS.md` and `research/EVIDENCE.md`, with the
counter-experiment beside it rather than instead of it.

### The defence, which is also measured
`research/data/bm25gate.py` sweeps a BM25 score gate and compares at equal
auto-precision. **BM25 ranks better but gates worse**: to reach 100% auto-link
precision, BM25-only must be gated so hard that coverage falls to **35.0%**, where the
hybrid holds **50.4%**. And `disagree.py` shows the arms are complements, not
duplicates: of 242 gold positives, 207 both get right, 20 only BM25 gets, 4 only the
full pipeline gets, 11 neither gets.

So the hybrid's justification is **gating, not ranking** — the ability to decide *when
not to decide*. That is the property D-002 exists to protect, and it is what makes the
review queue small enough to be usable.

Two further experiments in the same folder qualify what the tag machinery is actually
worth: `weights.py` shows Top-1 is **flat at 87.2%** as `tag_overlap`'s weight moves
from 0.32 down to 0.08 (coverage moves ~1.7 points), so **the line-lock floor in
`blend_with_line_lock`, not the weight, is what carries tag evidence**; and
`hypothesis.py` shows a simpler hybrid weighting produces exactly the same Top-1.

### Reason
A judge or auditor who runs `ablation.py` finds this number in about a minute. Finding
it in the team's own documentation, with the answer next to it, is a completely
different conversation from finding it unmentioned.

### Consequences
This produced the evidence-labelling scheme in `research/EVIDENCE.md` —
**MEASURED / AUDITED / RUBRIC / NOT CLAIMED** — under which every quantitative claim
in the report states what kind of claim it is. The `NOT CLAIMED` list is explicit:
no results on real project data, no OCR, no schedule import, no authentication, no
closed learning loop, no vendor-audited competitor capabilities, no field study.

### Future Notes
`Audit-1.md` F-01 names the untested configuration that might resolve the tension
honestly: **BM25 retrieval + feature scoring with the dense channel off.** That arm
has never been run. It would cost one small harness and could remove the project's
most awkward number by showing the dense channel is carrying gate quality rather than
rank quality — or confirm that it is not.

---

# END OF PART 0 — the D-series resumes below

---

## pre-2026-08-30 / D-001 — Retrieval and ranking are separate stages

> **Historical context: see H-003.** This decision is a direct reversal of a design
> that was specified in detail and abandoned before it shipped — a single Edge
> Function call with the whole schedule injected into the prompt, returning
> `matched_task_id` and a model-emitted `match_confidence`. H-003 records that design
> in full, the three reasons it failed, and the fields still sitting in
> `extraction/models.py` that are its residue.

### Context
An event's free-text description ("spool erected for 24-P-1001") must be resolved to
one L5/L6 schedule node out of ~120. The obvious shortcut is to hand the text and
the schedule to an LLM and let it pick. That produces an answer with no inspectable
basis, which is fatal for a system whose output mutates a project schedule.

### Decision
Split matching into two stages with different objectives:
- **Retrieval** (`matching/retrieval.py`, `HybridRetriever`) — recall-oriented. Three
  channels (exact tag, BM25, dense embeddings) fused with reciprocal rank fusion,
  casting wide to `TOP_K = 20`.
- **Ranking** (`matching/features.py`, `compute_features` → `final_score`) —
  precision-oriented. Six named features scored per (event, candidate) pair.

### Reason
Every match becomes explainable as a set of named features with values, which is
what makes the audit trail meaningful and the review queue usable. It also lets the
two stages be tuned independently — recall failures and precision failures have
different fixes.

### Alternatives Considered
- **Single LLM call over the whole schedule.** Rejected: unauditable, non-deterministic,
  and unable to produce a calibrated confidence.
- **Pure embedding nearest-neighbour.** Rejected: loses exact tag evidence, which is
  near-decisive when a line number is present.
- **Merging retrieval and ranking into one scoring pass.** Rejected: destroys the
  recall/precision separation and the ability to report which channel surfaced a
  candidate (`LinkCandidate.retrieval_sources`).

### Affected Areas
`matching/retrieval.py`, `matching/features.py`, `matching/engine.py`,
`matching/schedule_index.py`, `matching/models.py` (`LinkCandidate`, `FeatureVector`).

### Trade-offs / Consequences
Easier: explaining any single match; debugging; independent tuning.
Harder: the pipeline has more moving parts than a single call.
**Measured cost:** `research/data/ablation.json` shows the full pipeline reaches
87.2% Top-1 where BM25 alone reaches 93.8%. The hybrid is *worse at ranking*. Its
justification is gating, not ranking — see D-002.

### Future Notes
Anyone tempted to replace this with one LLM call must first replicate the
precision-at-coverage curve in `eval.py`. Also read `Audit-1.md` F-01: the untested
configuration is BM25 retrieval + feature scoring with the dense channel off.

---

## pre-2026-08-30 / D-002 — Precision-first decision rule with a margin guard

### Context
A wrong AUTO_LINK silently corrupts a project schedule and is then trusted
downstream by analytics and forecasting. A REVIEW item costs a planner about ten
seconds. The costs are wildly asymmetric.

### Decision
`decide_outcome()` in `matching/engine.py`:
- `top1 < tau_low` → `NEW_ACTIVITY`
- `top1 >= tau_high` **AND** `margin(top1, top2) >= margin_min` **AND** no discipline
  conflict → `AUTO_LINK`
- everything else → `REVIEW`

A high top-1 score with a small margin is forced to REVIEW even though it clears
`tau_high`. Operating point: `tau_high = 0.775`.

> ⚠ **Read H-014 before quoting any number from this entry.** `tau_high = 0.775` is
> the operating point `eval.py` calibrates on *ground-truth mentions*. The running
> server hard-codes a **different** one — `server/main.py :: MATCHING_THRESHOLDS =
> Thresholds(tau_high=0.70, tau_low=0.40, margin_min=0.03)` — calibrated on real
> extraction spans, where it measured **96.6%** auto-link precision at 48% coverage.
> The "zero wrong auto-links" property below belongs to the eval harness, not to the
> demo database.

### Reason
The margin guard catches the dangerous case the score alone misses: two nearly
identical candidates where the model is confident but the evidence does not
discriminate. Measured result: **zero wrong AUTO_LINKs in 254 mentions.**

### Alternatives Considered
- **Score threshold alone.** Rejected: admits confident-but-ambiguous matches.
- **A lower `tau_high` for more coverage.** Rejected at build time; the sweep in
  `eval.py` shows 0.70 gives 64.6% coverage at 96.3% precision — more coverage, but
  it gives up the zero-corruption property.

### Affected Areas
`matching/engine.py` (`decide_outcome`), `matching/models.py` (`Thresholds`,
`Decision`), `eval.py` (threshold sweep), `server/main.py` (`/ingest` branching).

### Trade-offs / Consequences
Easier: trusting anything the system auto-wrote.
Harder: coverage is 50.4%, so 121 of 254 mentions still need a planner — this is
`Audit-1.md` F-02 and the most common criticism of the system.
Performance: none. Accuracy: 100% auto-link precision, 52.9% auto-link recall.

### Future Notes
Do not raise coverage by lowering `tau_high` without re-running `eval.py` and
consciously accepting the loss of the zero-corruption property. It is the strongest
claim the project has.

---

## pre-2026-08-30 / D-003 — `rationale` is deterministic feature names, never LLM prose

### Context
Every decision has to be explainable to a planner and defensible in an audit.

### Decision
`_rationale()` in `matching/engine.py` returns a list of fixed strings drawn from a
closed vocabulary — `tag_line_match`, `discipline_match`, `within_planned_window`,
`high_fuzzy_similarity`, `high_embedding_similarity`, `predecessor_not_startable`,
`margin_too_small`, `discipline_conflict`, `weak_evidence`. No generated text.

### Reason
Deterministic, greppable, testable, and stable across runs. A generated explanation
can be fluent and wrong, which is worse than terse and correct.

### Alternatives Considered
- **LLM-authored explanation per match.** Rejected: unauditable, non-reproducible,
  and it would make the audit trail depend on model availability.

### Affected Areas
`matching/engine.py` (`_rationale`, `decide_outcome`), `matching/models.py`
(`LinkDecision.rationale`), the reconciliation UI (`frontend/src/pages/Reconcile.tsx`).

### Trade-offs / Consequences
Easier: testing; auditing; UI rendering as chips.
Harder: explanations are terse and need a legend for a non-technical reader.

### Future Notes
If richer explanation is ever wanted, add a *separate* display field. Do not make
`rationale` free text — the audit trail depends on it being a closed vocabulary.

---

## pre-2026-08-30 / D-004 — The audit trail is append-only

### Context
The system mutates schedule fields (`actual_start`, `actual_finish`, `installed_qty`,
`percent_complete`) automatically. Without an immutable record of who wrote what,
from which source line, at what confidence, the writes are not defensible.

### Decision
`AuditRecord` (`server/db.py:210`) is append-only. There is no update path.
Corrections write a **new** record. Each row carries a real foreign key to the
`LinkedEvent` that produced the write, plus a denormalised snapshot of
`source_file`, `source_line` and `source_row`.

### Reason
The snapshot sits beside the key deliberately: the table must stay readable as a
historical record even if the event row is later reinterpreted.

### Alternatives Considered
- **Mutable audit rows.** Rejected: destroys the record it exists to keep.
- **Foreign key only, no snapshot.** Rejected: a later reinterpretation of the event
  would silently rewrite history.

### Affected Areas
`server/db.py` (`AuditRecord`), `server/main.py` (`_write_audit`,
`GET /activity/{id}/audit`, `GET /audit/recent`, `GET /schedule/conflicts`),
`scripts/reset_demo.py`.

### Trade-offs / Consequences
Easier: conflict detection (D-011) and per-row provenance, both derived from this
table rather than stored separately.
Harder: the table grows monotonically; a correction is two rows, not one edit.
**Known limitation:** 165 of 259 rows have an exact position. The rest are writes
with no single originating line (a date taken from the report's own date, or an
aggregate write). Those carry `linked_event_id = NULL` and list every contributor in
`contributing_sources`. The rule the UI relies on: *a position shown is exact; no
position shown means there is no single line to show.*

### Future Notes
`ScheduleActivityResponse.link_confidence` is **not stored** — it is projected off
this table on every `GET /schedule`. That is only safe because the table is
append-only. If that ever changes, the projection becomes unstable.

---

## pre-2026-08-30 / D-005 — The LLM is optional and off by default

### Context
The PS asks for an "LLM-based conversational or voice interface." A hackathon demo
depends on a laptop at a venue with unreliable power, network and thermal headroom.
A model that is slow or unreachable must not be able to break the product.

### Decision
`EXTRACTION_PROVIDER` (`.env`, read by `extraction/llm_backend.py`
`make_backend_from_env`) defaults to `rules` — deterministic regex pre-pass, no LLM,
no network. Options are `rules`, `ollama`, `openai`.

When off, `server/agent_llm.py` builds no client, opens no socket, and waits for
nothing. When on, extraction is bounded by `NAVIS_LLM_TIMEOUT_SECONDS` (default 5),
tried once with no retry, and every returned value is re-validated by the same
deterministic parsers before it may touch `SlotState`. A refused connection,
timeout, malformed JSON or schema violation all fall back silently.

### Reason
The offline path is the *tested default*, not an untested fallback. An Ollama
problem is not a NAVIS outage and is never presented to the user as one.

### Alternatives Considered
- **LLM-required.** Rejected: a single point of failure at the moment of judging.
- **LLM primary with a fallback.** Rejected as a lie about what is tested — whichever
  path is default is the path that gets exercised.

### Affected Areas
`.env` / `.env.example`, `extraction/llm_backend.py`, `extraction/extractor.py`,
`server/agent_llm.py`, `server/agent_slots.py`, `extraction/test_llm_guards.py`.

### Trade-offs / Consequences
Easier: reliability; offline demo; deterministic tests.
Harder: the PS phrase "LLM-based" is only conditionally satisfied. **State this
plainly rather than implying a model is in the loop when it is not** — the agent's
slot filling in `server/main.py :: _fill_slots` (delegating to the pure parsers in
`server/agent_slots.py`) is regex and keyword matching.
*(Corrected 2026-08-31: this entry and `ARCHITECTURE.md` §7 both named
`_fill_slots_from_message`, a symbol that no longer exists in the codebase.)*

### Future Notes
A bug found while testing the timeout bound is worth remembering:
`ThreadPoolExecutor` used as a context manager joins its workers on exit, so a
stalled model still held the request for its full timeout after we had given up
waiting. It now shuts down without waiting. Do not reintroduce the `with` form.

---

## pre-2026-08-30 / D-006 — Tags are never taken from the LLM

### Context
`tag_overlap` is the highest-weighted feature (0.32) and `blend_with_line_lock`
floors a unique full-line match at 0.93 — effectively decisive. Tag extraction
therefore determines linking outcomes more than any other signal.

### Decision
In `Extractor._merge_event` (`extraction/extractor.py`), tags come **only** from the
deterministic regex pre-pass (`extraction/prepass.py` `extract_tags`), even when the
pre-pass found none and the LLM offers some.

### Reason
A model returning description words like "steel erection" as a tag would corrupt
linking with near-decisive force. The blast radius of a hallucinated tag is much
larger than the benefit of catching a missed one.

### Alternatives Considered
- **Accept LLM tags when the pre-pass finds none.** Rejected: that is exactly the
  low-confidence case where a model is most likely to invent one.
- **Accept LLM tags with a lower feature weight.** Rejected: `line_locked` is a
  boolean floor, not a weight, so a bad tag still dominates.

### Affected Areas
`extraction/extractor.py` (`_merge_event`), `extraction/prepass.py`,
`matching/features.py` (`_tag_overlap`, `blend_with_line_lock`).

### Trade-offs / Consequences
Easier: trusting `tag_overlap`.
Harder: tag recall is bounded by the regex. Measured: with tags stripped, Top-1 falls
from 87.2% to 70.1% (n=87), so the system does degrade gracefully without them.

### Future Notes
If LLM tags are ever admitted, they must enter as a *separate, lower-weighted*
feature that cannot set `line_locked`.

---

## pre-2026-08-30 / D-007 — Unitless quantities cannot drive percent-complete

### Context
A model reading "All 12 pockets grouted" returns quantity 12 with no unit. Against a
node planned as 48 m³, that would silently register 25% complete.

### Decision
In `RollupAccumulator.add` (`matching/engine.py`), a quantity with no UOM is excluded
from percent-complete and a note is recorded. The value stays on the event for
display; it just cannot drive progress. The same guard drops quantities whose digits
belong to a tag (`_qty_swallowed_by_tag`) and quantities whose UOM contradicts the
node's planned UOM.

### Reason
The regex pre-pass always captures a unit alongside a number, so this filter
specifically catches LLM-supplied quantities — the least trustworthy source feeding
the most consequential field.

### Alternatives Considered
- **Assume the node's UOM.** Rejected: converts a parsing gap into a silent, wrong
  progress write.
- **Reject the event entirely.** Rejected: the mention is still evidence of activity;
  only the *measurement* is untrustworthy.

### Affected Areas
`matching/engine.py` (`RollupAccumulator.add`, `_qty_swallowed_by_tag`),
`matching/textutils.py` (`normalize_uom`).

### Trade-offs / Consequences
Easier: trusting `percent_complete`.
Harder: the QUANTITY row on the agent's structured card often reads "Not stated".
Accuracy: prevents a whole class of silent over-reporting.

---

## pre-2026-08-30 / D-008 — `actual_finish` is written only at 100% complete

### Context
A DPR line reading "pedestals P7–P12 completed" covers part of a node whose scope is
P1–P12. Treating that as a completion finishes the whole node.

### Decision
In `RollupAccumulator.results()` (`matching/engine.py`), `actual_finish` is written
only when the roll-up reaches 100%. A finish assertion arriving below 100% is
**reported as a conflict, not applied**. On an unquantified node (a milestone), a
completion claim is accepted, because it is all the evidence there will ever be.

### Reason
Partial-scope protection. A prematurely finished node propagates into every
downstream duration statistic and forecast.

### Alternatives Considered
- **Trust any explicit completion claim.** Rejected: the P7–P12 case is common in
  real DPRs.
- **Silently ignore the assertion.** Rejected: the planner must see that a source
  claimed completion and was overruled.

### Affected Areas
`matching/engine.py` (`RollupAccumulator.results`, `_describe_conflicts`),
`server/main.py` (`_apply_rollup_to_schedule`), `matching/models.py` (`RollupResult`).

### Trade-offs / Consequences
Easier: trusting a finish date.
Harder: fewer completed activities, so the institutional-memory sample is smaller.
**Known interaction:** when a node *does* reach 100% but no event asserted a finish,
the date falls back to `max(reported_date)` — see `Audit-1.md` F-06, which shows this
produces 5 zero-day durations out of 47 completed activities. That fallback is a
known weakness of this decision, not a separate bug.

---

## pre-2026-08-30 / D-009 — Agent/voice updates are proposals, never direct writes

**Supersedes D-009a (below).**

### Context
The original implementation created the event on the turn that filled the last slot,
*before the supervisor saw anything*, wrote actual dates directly with
`auto_applied=True`, and created no review item. A voice update therefore bypassed
the planner entirely and never appeared in any queue.

### Decision
`POST /agent/turn` (`server/main.py:2212`) runs the real matching engine when the last
slot fills (`_match_slots`) and returns the proposal — activity, confidence, outcome —
**without writing anything**. A second call with `confirm: true` persists a
`LinkedEvent` and a `ReviewQueueItem` (`_create_event_from_slots`) and still does not
touch `actual_start` or `actual_finish`.

`POST /review/{item_id}/resolve` remains the **only** place an actual date is
committed.

The alias-lexicon write was removed from the agent path too: learning from an
unconfirmed update would feed the matcher its own unreviewed guesses.

### Reason
A field update is evidence, not authority. The planner is the commit point.

### Alternatives Considered
- **Auto-apply high-confidence voice updates.** Rejected: no supervisor confirmation
  step, and the confidence is computed from a slot-filled sentence rather than
  observed text.

### Affected Areas
`server/main.py` (`agent_turn`, `_match_slots`, `_create_event_from_slots`,
`resolve_review_item`, `_apply_confirmed_event_to_schedule`, `_upsert_alias`),
`server/agent_slots.py`, `frontend/src/pages/Field.tsx`, `server/test_agent.py`.

### Trade-offs / Consequences
Easier: every schedule write has a human in front of it.
Harder: two round trips per voice update.
Security/integrity: closes a path that mutated the schedule with no review record.

### Future Notes
Two fatal bugs fixed in this path are worth not reintroducing: `SlotState.date` was
annotated `Optional[date]` where the field name shadowed the imported type under
`from __future__ import annotations`, so Pydantic resolved it to `NoneType` and the
endpoint returned 500; and the location regex matched an uppercase character class
against a lowercased string, so no answer containing "Zone A" could ever satisfy the
agent and it re-asked forever.

---

### D-009a — *(superseded by D-009)* Agent updates written directly to the schedule

The agent originally wrote `actual_start`/`actual_finish` directly with
`auto_applied=True` at the moment the final slot was filled, created no review item,
and wrote an alias-lexicon entry from the unconfirmed update. Replaced because it
bypassed the planner, produced no review record, and taught the matcher from its own
unreviewed guesses. Retained here so the reasoning is not rediscovered the hard way.

---

## pre-2026-08-30 / D-010 — Source files are decoded explicitly, never lossily

### Context
Every supplied DPR is cp1252, not UTF-8: an em-dash is the single byte `0x97`, which
is not valid UTF-8 at all. `extraction/extractor.py` read them with
`errors="replace"`, so each became U+FFFD **at ingest** — and because the replacement
happened on the way in, it was written to `LinkedEvent.raw_text`, to `source_span`,
into the audit trail, and onto the screen. 51 of 266 linked events and 48 of 274
audit rows carried it. Re-ingesting could not fix it; the original byte was gone.

### Decision
`extraction/textio.py` `read_text()` tries `utf-8-sig`, then `cp1252`, then
`latin-1`, and only falls back to lossy decoding if all three fail. Two bare `open()`
calls reading the baseline JSON with the platform default were made explicit.

### Reason
cp1252 comes **before** latin-1 deliberately: it maps `0x80`–`0x9f` to real
punctuation where latin-1 maps them to control characters, and latin-1 accepts any
byte, so placing it earlier would mask the others.

### Alternatives Considered
- **`errors="replace"` with a cleanup pass later.** Rejected: the information is
  destroyed at read time; there is nothing left to clean.
- **Assume UTF-8 and fail loudly.** Rejected: real site data is heterogeneous by
  definition; failing on it defeats the purpose of the ingestion layer.

### Affected Areas
`extraction/textio.py` (new module), `extraction/extractor.py`,
`matching/schedule_index.py`.

### Trade-offs / Consequences
After the fix: zero U+FFFD anywhere in the database, and 101 em-dashes survive intact
through `GET /schedule`.

### Future Notes
**Never use `errors="replace"` on an ingestion path in this repository.** Corruption
introduced at read time is permanent and propagates into an append-only audit trail
that by design cannot be rewritten.

---

## pre-2026-08-30 / D-011 — Source conflicts are detected across uploads, via the audit trail

**Supersedes D-011a (below).**

### Context
`RollupAccumulator` computed conflicts from the assertions in a **single**
`POST /ingest` call. Real disagreements are almost always across uploads — a
discipline spreadsheet ingested on Tuesday contradicting a DPR ingested on Monday —
so the accumulator saw one assertion each time and found nothing. 24 genuine
disagreements existed in the data while `integrity_warnings` reported zero.

### Decision
Two changes, both in `server/main.py` rather than in `matching/`:
- Before writing `actual_start`/`actual_finish`, the roll-up reads the most recent
  audit row for that field (`_prior_write`). If the incoming value differs and came
  from a different file, the write is flagged `conflict=True` and both sides are
  recorded in `contributing_sources`.
- When the stored value wins on the earliest-evidence rule and the incoming
  assertion is discarded, a `source_conflict` audit row is written **anyway**.

`GET /schedule/conflicts` derives the list by walking each activity's writes per
field. Nothing new is stored — the values, files and line/row numbers were already in
the audit trail (D-004).

### Reason
The silent-discard case was the more dangerous of the two: nothing recorded that a
source had been overruled.

### Affected Areas
`server/main.py` (`_prior_write`, `_cross_file_conflict`, `_describe_side`,
`_apply_rollup_to_schedule`, `list_source_conflicts`, `recent_audit`, `_source_kind`).

### Trade-offs / Consequences
Surfaces **25 conflicts, 21 of them spreadsheet against daily report.** Two
properties a planner must understand, both stated in the UI:
- **The stored value is whichever source was ingested last, not whichever is right.**
  `PIP-SKN-1051` holds an `actual_finish` of 2026-08-20 from `piping_progress.xlsx`
  row 33, overruling 2026-09-02 from `dpr_day_08.txt` line 19 — moving the finish
  *earlier* purely because the spreadsheet arrived second.
- **The Primavera baseline is never a side.** It is read-only and never written, so it
  cannot disagree with anything. `_source_kind` classifies sources as `spreadsheet`,
  `daily_report`, `agent` or `other` — never as the baseline.

### Future Notes
Resolving conflicts by recency is a placeholder, not a policy. A real system needs
source precedence rules (surveyed quantity beats a supervisor's note, and so on).

---

### D-011a — *(superseded by D-011)* Conflict detection scoped to one upload

Conflicts were computed only among the assertions seen within a single `/ingest`
call. Replaced because real disagreements are cross-upload; the single-call scope
reported zero of 24 genuine conflicts, and the 35 entries it did flag were
partial-scope notes with one contributing source, not two-sided conflicts.

---

## pre-2026-08-30 / D-012 — SQLite, synchronous ingest, and "on submission"

### Context
The PS asks for "near real time" schedule updates. That phrase implies streaming,
WebSockets and background workers. At ~120 activities and ~250 events, none of that
is warranted.

### Decision
SQLite + SQLAlchemy, single file. `POST /ingest` is a **synchronous** request that
runs extraction → matching → roll-up → persistence and returns. Vector search is a
NumPy dot product over a 120 × 384 matrix — no FAISS, no Chroma, no vector database.
The capability is described as **"on submission"**, not "near real time".

### Reason
Zero setup, single file, seedable, resettable — and honest about what it does.
Measured: ~7 ms/event, 266 events in 1.86 s, 4.4 s cold start (index + embed),
once per process.

### Alternatives Considered
- **Postgres.** Rejected: adds operational surface with no benefit at this scale.
- **Background job queue.** Rejected: nothing here needs it; it adds failure modes and
  a progress-polling UI for no user-visible gain.
- **A vector database.** Rejected: brute-force cosine over 120 rows is trivially fast.

### Affected Areas
`server/db.py`, `server/main.py` (`ingest_file`), `matching/retrieval.py`
(`HybridRetriever.doc_matrix`), `scripts/reset_demo.py`.

### Trade-offs / Consequences
Easier: setup, reset, offline operation, reasoning about consistency.
Harder: no concurrent multi-user writes; no multi-project isolation (`Audit-1.md`
F-11); a very large schedule would need rework.

### Future Notes
`scripts/reset_demo.py` clears **rows** rather than dropping the database, which is
what lets it run while the server is up. It also compares every model column against
the live database and rebuilds the schema when they differ, because SQLAlchemy's
`create_all` adds missing tables but never missing columns — a database built before a
model gained a field kept working right up until the first insert. That is exactly
what happened when `ReviewQueueItem` gained its clarification columns.

---

## 2026-08-30 / D-013 — Adopt a persistent repository memory protocol

### Context
All architectural knowledge lived in conversations, in `ARCHITECTURE.md` (a
point-in-time specification), and in the heads of the people who wrote the code. New
AI sessions, context resets, and new developers each started without it — and an AI
agent with no memory of D-001 through D-012 could plausibly "simplify" the matcher
into a single LLM call, make the audit trail mutable, or reintroduce
`errors="replace"`, each of which would undo a deliberate and hard-won decision.

The immediate trigger: an independent audit (`Audit-1.md`, 2026-08-30) found that
several decisions embodied in the code existed nowhere in written form, and that two
defects (`Audit-1.md` F-05, F-09) had survived precisely because the reasoning behind
the surrounding code was undocumented.

### Decision
Establish three permanent repository-root files and a mandatory workflow:
- **`CLAUDE.md`** — the operating rules any AI agent must follow, including the
  read-before / update-after / commit-and-push cycle.
- **`DECISIONS.md`** (this file) — architectural history; why the system is the way
  it is; superseded decisions preserved and linked.
- **`FLOW.md`** — real execution paths through real files, functions and classes,
  plus a `## Current Modification Area` section maintained per task.

Documentation updates ship in the **same commit** as the implementation they
describe, so Git history holds WHAT, HOW, WHY and the governing rules at one point in
time.

### Reason
The repository itself must carry the memory. Conversational memory does not survive
a context reset, a new machine, a new developer, or a different agent — and this
project's most important properties (append-only audit, precision-first gating,
LLM-optional extraction) are all things that look like removable complexity to
someone who does not know why they exist.

### Alternatives Considered
- **Rely on `ARCHITECTURE.md` alone.** Rejected: it is an excellent point-in-time
  specification with a candid limitations section, but it is not a decision log — it
  records the design, not the reasoning behind changes, and it has no mechanism for
  superseded decisions.
- **Conversational memory / agent-side memory only.** Rejected: does not survive
  context resets, other machines, other developers, or other agents. The rule that
  triggered this decision says so explicitly.
- **A `docs/` subdirectory.** Rejected: root-level files are what AI agents and new
  developers actually read first; burying them reduces the chance the protocol is
  followed.

### Affected Areas
New files: `CLAUDE.md`, `DECISIONS.md`, `FLOW.md`.
No source code, schema, API or dependency was modified by this decision.
Related existing documentation, unchanged and now cross-referenced: `ARCHITECTURE.md`,
`Audit-1.md`, `research/`, `SETUP.md`, `DEMO.md`.

### Trade-offs / Consequences
Easier: onboarding; resuming after a context reset; avoiding the accidental reversal
of a deliberate decision; understanding *why* before changing *what*.
Harder: every repository-changing task now carries a documentation and Git obligation,
which is real overhead on small changes.
Maintainability: positive, provided the discipline holds. **Stale documentation is
worse than none, because it is trusted** — verifying documented symbols against the
code is a required step, not an optional one.

### Future Notes
- D-001 through D-012 were reconstructed retroactively; treat their *reasoning* as
  reliable (it is traceable to code and `ARCHITECTURE.md`) but their *dates* as
  approximate.
- When a decision here is reversed, do not delete it. Mark it superseded, link the
  replacement, and explain the change — D-009/D-009a and D-011/D-011a are the worked
  examples of the intended format.
- `Audit-1.md` lists eleven open findings with proposed remedies. Each remedy that
  gets implemented should produce a new decision entry here.

---

## 2026-08-31 / D-014 — Backfill history as a parallel H-series, and document defects rather than fix them

### Context
D-013 established the memory protocol but the repository still had a hole in front of
it: everything that happened **before** 2026-08-30 existed only as commit diffs, as
superseded planning documents (`SIH context.txt`, the two 7-day build plans), and as
`ARCHITECTURE.md`'s point-in-time specification. D-001 through D-012 capture the
decisions embodied in the *current* code, but not the decisions that produced files,
fields, dependencies and tests which now look inexplicable — a `schedule_context`
that is built and never sent, an `alternatives` field nothing reads, a `recharts`
dependency nothing imports, a `Job` table for a synchronous request.

A reconstruction pass on 2026-08-31 also surfaced facts that contradict, or
materially qualify, what the repository currently claims about itself — most
importantly that the running server and the headline metric use **different decision
thresholds** (H-014).

### Decision
Three parts.

1. **Backfill as a separate `H-` series, placed first, not by renumbering `D-`.**
   H-001 … H-027 in Part 0 of this file. Every entry names its evidence, and
   inference is marked `INFERRED` rather than presented as record.
2. **Do not fix what the pass found.** The defects discovered — the
   `/review/{id}/resolve` action-name mismatch, the unreachable `_dense_cos`
   duplicate, the `_extract_csv` stub behind an accepted file type, the unconditional
   predecessor warning, `MemoryCache` and `full_key_index` being dead — are recorded
   in `FLOW.md`'s handoff section with reproduction detail, and **left in place**.
3. **State plainly where documentation and code disagree**, rather than silently
   correcting either. `FLOW.md` now carries a "documentation that is now historical"
   list naming `ARCHITECTURE.md` §2 and parts of §7, the two build plans, and the
   stale symbol `_fill_slots_from_message`.

### Reason
- **Renumbering would break every cross-reference** in `FLOW.md`, `Audit-1.md`,
  `CLAUDE.md` and `research/`, and would falsely imply the historical entries were
  written when the decisions were made. The `H-` prefix keeps the provenance visible
  in the identifier itself.
- **Fixing and documenting in the same pass would make both untrustworthy.** A
  handoff whose diff also changes behaviour cannot be reviewed as a handoff, and a
  defect that is fixed in the same commit that first describes it leaves no record
  that it was ever live. The next agent inherits a list it can act on deliberately.
- **A documented contradiction is safer than a silently corrected one.** Someone will
  read `ARCHITECTURE.md` §2 and code against it. Saying "this section is historical"
  costs one line and prevents that.

### Alternatives Considered
- **Rewrite `ARCHITECTURE.md` to match the code.** Rejected: it is the only surviving
  record of the *original specification*, including the parts that were rejected. Its
  §0 and §5 are still the sharpest reasoning in the repository. Overwriting it would
  destroy exactly the history this task exists to preserve. It should be read as a
  dated document, and `FLOW.md` now says so.
- **Fold the H-series into D-001…D-012 as extra sections.** Rejected: it would blur
  what was decided at the time against what was reconstructed afterwards, which is
  the distinction D-013's provenance note exists to protect.
- **Fix the defects found, then document.** Rejected per the reasoning above; the
  fixes are listed as ordered next steps in `FLOW.md` instead.

### Affected Areas
`DECISIONS.md` (Part 0, H-001 … H-027; this entry), `FLOW.md` (execution-flow
evolution, module contracts, data lifecycle, historical handoff state). **No source
code, schema, API, dependency or configuration was modified.**

### Trade-offs / Consequences
Easier: understanding why the code has the shape it has; knowing which documents are
current and which are dated; inheriting a ranked, reproducible defect list.
Harder: `DECISIONS.md` is now long. The index tables at the top are the entry point,
and Part 0 can be skipped entirely by anyone who only needs current-state reasoning.

### Risks / Limitations
- **This reconstruction is evidence-based, not recollected.** It was assembled from
  Git history and diffs, the current source, the repository's own planning and
  research documents, and test output. It is not a transcript of the reasoning that
  happened in earlier sessions, and no attempt was made to present it as one. Where a
  motive is inferred from the artefacts rather than recorded in them, the entry says
  `INFERRED`.
- The pre-Git era (2026-08-22 → 2026-08-28, when `c16d5f4` landed with ~21,900 lines
  already written) is the least recoverable. H-002 through H-014 reconstruct it by
  comparing the planning documents and `ARCHITECTURE.md` against the code that
  appeared. **Their conclusions are solid; their sequencing within that week is not.**

### Historical Notes
Verification performed for this entry: `python -m pytest -q` → **264 passed**; every
file, function, class, constant, route and line number named in Part 0 and in the new
`FLOW.md` sections was confirmed present by reading the source or by `grep`.
