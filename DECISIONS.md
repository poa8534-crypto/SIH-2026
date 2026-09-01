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
| D-015 | `date_basis` is carried end to end, and a defaulted finish date is never written | Active (supersedes H-016) |
| D-016 | A missing planned quantity is not a milestone | Active (qualifies D-008) |
| D-017 | A second baseline is adopted as a version, not as a replacement | Active |
| D-018 | Baselines are read through a provider, never by `json.load` at the call site | Active |
| D-019 | Refuse to evaluate a baseline the ground truth does not describe | Active |
| D-020 | The v2 evaluation corpus is generated as one family, from one seed | Active |
| D-021 | Thresholds are tuned on dev and reported on test | Active (qualifies D-002) |
| D-022 | A tag's digit count is a numbering convention, not part of what a tag is | Active |
| D-023 | A unit suffix is not a numerator | Active |
| D-024 | A near-miss is a mention with its discriminator removed | Active (qualifies D-020) |

**Historical entries H-001 … H-027 are indexed separately at the top of Part 0,
immediately below.** Four of them qualify a D-entry directly and should be read with
it:

| Read this D-entry | …with this H-entry |
|---|---|
| D-001 (retrieval/ranking separated) | **H-003** — the single-LLM-call design it replaced, and the V1 residue still in the code |
| D-002 (precision-first thresholds) | **H-014** — *the server does not run the operating point the headline metric comes from* |
| D-005 (LLM optional, off by default) | **H-018** — the three specific model errors the guards were written against |
| D-012 (SQLite, synchronous ingest) | **H-007** — why "near real time" was refused, and why the `Job` table still exists |
| D-008 (`actual_finish` only at 100%) | **D-015** — and only when a source named the date; **D-016** — and only when 100% means something |

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
| H-016 | 2026-08-28 `2da3c92` | `date_basis` provenance was specified and deliberately deferred | **Superseded by D-015** |
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
**Superseded by D-015 (2026-09-01).** `date_basis` is now carried end to end, and the
cost this entry predicted was measured before it was fixed: eleven activities sharing
one Actual Finish, two of them with zero duration.

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

---

## 2026-09-01 / D-015 — `date_basis` is carried end to end, and a defaulted finish date is never written

### Context
`FINDINGS.md` F1 measured the cost of the gap H-016 left open. Eleven activities came
out of the pipeline carrying `Actual Finish 2026-09-15`, and PIP-FLG-1036 and
PIP-FLG-1038 carried `actual_start == actual_finish` — zero-duration activities.

The mechanism was two paths that both substituted the report's own date for a date no
source had given:

1. `Extractor._bind_assertion_dates` — a line that claims completion but names no date
   ("Flange management for 24 nos completed") was handed the DPR header's date to
   carry the claim. `dataset/dpr_day_10.txt` is dated 15/09/2026.
2. `RollupAccumulator.results` — with no finish assertion at all, `actual_finish` fell
   back to `max(acc["dates"])`, and `acc["dates"]` held each mention's *report* date.

Neither path was distinguishable downstream from a date a supervisor actually wrote
down, because the field that would have distinguished them —
`ARCHITECTURE.md` §2.3's `date_basis` — was specified and then deferred (H-016).

This attacked the project's strongest claim directly: that a wrong date is never
written. A column of identical finish dates on the Schedule screen reads as a system
that fabricates dates, whatever the matcher underneath is doing.

### Decision
Reinstate `date_basis` with the three values the specification named, and gate the
write on it.

1. **`extraction/models.py`** — `DateBasis` enum (`EXPLICIT`, `RELATIVE_RESOLVED`,
   `DEFAULTED_TO_REPORT_DATE`), plus `reported_date_basis`, `asserted_start_basis` and
   `asserted_finish_basis` on `ExtractedEvent`.
2. **`extraction/prepass.py`** — `extract_dates_with_basis` returns each date with how
   it was found: a date in the span is `EXPLICIT`, `"yesterday"`/`"today"` resolved
   against the report date is `RELATIVE_RESOLVED`. The prepass never emits
   `DEFAULTED_TO_REPORT_DATE`; only the caller that substitutes the report date can
   assign it. `extract_dates_with_flags` and `extract_dates` remain as basis-free views.
3. **`Extractor._bind_assertion_dates`** returns `(start, start_basis, finish,
   finish_basis)`. A claim carried by the report's own date comes back
   `DEFAULTED_TO_REPORT_DATE`.
4. **`matching/models.py`** — `DateAssertion.basis` and `.is_defaulted`;
   `RollupResult.actual_start_basis` / `.actual_finish_basis`, plus `withheld_finish`,
   `withheld_finish_assertions` and `review_reasons`. `DateAssertion.describe()` now
   says "(no date in the line - defaulted to the report date)" in the audit trail.
5. **`RollupAccumulator`** — `acc["dates"]` holds `DateAssertion`s rather than bare
   dates, so the report-date fallback knows its own provenance. `results()` writes
   `actual_finish` only from assertions whose basis is not `DEFAULTED_TO_REPORT_DATE`.
   When the only candidate is a defaulted date, the finish is withheld, carried on
   `withheld_finish` with its evidence, and a reason naming the defaulting is recorded.
6. **`server/`** — `Activity.actual_start_basis` / `.actual_finish_basis` and the three
   `LinkedEvent` basis columns (with an additive `_add_missing_columns` migration, since
   SQLite cannot add them through `create_all`). A withheld finish writes an
   `actual_finish_withheld` audit row (`auto_applied=False`) and queues a
   `ReviewQueueItem` with reason `defaulted_finish_date`.
   `POST /review/{id}/resolve` routes that reason to `_resolve_defaulted_finish`, which
   accepts only `confirm` (write the date as a planner decision, still marked
   `DEFAULTED_TO_REPORT_DATE`) or `ignore`.
7. **API + UI** — `GET /schedule` returns both bases; `DateCell` in
   `frontend/src/pages/Schedule.tsx` renders an inferred date dotted-underlined with a
   `~` marker and the reason on hover.

**An explicitly asserted finish date keeps its previous behaviour exactly.**

### Reason
A date the source named and a date the system supplied are different facts, and the
schedule is the wrong place to lose that difference. The system is allowed to be
unable to date a completion; it is not allowed to invent the date and present it like
an assertion. Routing to the planner is the same rule as D-009: an inference becomes an
actual only through a human resolution.

The start date is treated differently on purpose. It is still written from the earliest
report date when no start was asserted, but it is now *marked* — the earliest day work
was reported is a reasonable floor for a start, whereas the day a report was typed says
nothing about when work finished. Marking it lets the UI show the difference without
throwing the signal away.

### Alternatives Considered
- **Write the defaulted date and mark it in the UI only.** Rejected: the schedule is
  exported to Primavera/PMXML, and a marker in the React table does not travel with the
  export. Variance against baseline would still be computed against a fabricated date.
- **Widen the guard to refuse defaulted start dates too.** Rejected for this change:
  the earliest report date is genuine evidence that work was underway by that day, and
  refusing it would drop `actual_start` on 26 activities to buy nothing. It is marked
  instead.
- **Keep `max(acc["dates"])` but exclude the last report only.** Rejected: a hack
  fitted to one dataset. The defect is not "15/09" — it is that basis was not tracked.

### Verification
`python -m pytest -q` → **435 passed** (was 411 before the new tests).
New tests: `matching/test_matching.py::TestDefaultedFinishDates` (6),
`extraction/test_extractor.py::TestDateBasis` (5),
`server/test_date_basis.py` (9, driving the real `/ingest` and `/review/{id}/resolve`).
`python eval.py` → headline metrics unchanged (auto-link precision 100.0%, coverage
50.4%); the roll-up table's eleven identical finish dates became ten withheld finishes
and one node dropped by D-016. Ingesting the whole dataset through `/ingest`: 38
activities finish, **all** with basis `EXPLICIT`; **0 zero-duration activities**;
17 withheld-finish items across 13 activities reach the planner.

### Affected Areas
`extraction/models.py`, `extraction/prepass.py`, `extraction/extractor.py`,
`extraction/spreadsheet.py`, `matching/models.py`, `matching/engine.py`,
`server/db.py`, `server/main.py`, `server/schemas.py`, `frontend/src/types.ts`,
`frontend/src/pages/Schedule.tsx`, `eval.py`, and four test modules.

### Trade-offs / Consequences
Easier: a planner can see which dates the field actually asserted; the export carries
only dates a source named; the zero-duration rows are gone.
Harder: fewer activities carry an Actual Finish automatically, and a review queue that
was purely about *links* now also carries *dates*. Coverage of the schedule falls, and
that is the correct direction — the alternative was coverage bought with invented data.

`eval.py` builds its events from `dataset/ground_truth.csv`, whose `source_date` column
is the report's date by construction, so **every** date in the eval harness is
`DEFAULTED_TO_REPORT_DATE` and every finish in its roll-up table is withheld. That is
an artefact of the harness, not of the pipeline: the real extractor reads dates out of
the DPR line itself, which is why the `/ingest` path still writes 38 finish dates. The
eval table now says `withheld` explicitly rather than printing a date, so the two
cannot be confused.

### Future Notes
- `_basis_of` in `matching/engine.py` defaults a missing basis to `EXPLICIT`. That is
  the permissive direction, and it is safe only because every defaulting path in
  `extraction/` sets the basis explicitly. If a new source of events is added, it must
  set its bases.
- The zero-duration invariant in `RollupAccumulator.results()` is defensive: the finish
  gate above it already makes the condition unreachable. Keep it. It is the line that
  states the rule.

---

## 2026-09-01 / D-016 — A missing planned quantity is not a milestone

### Context
`FINDINGS.md` F7: PIP-PCD-1053 ("P&ID Punch List Close-out") reported `0/0 nos,
100.0%` in the roll-up table, beside F1's identical finish dates.

`RollupAccumulator.add` treated `planned_qty <= 0` as "unquantified node — a milestone,
where a completion claim is all the evidence there will ever be", and pushed 100% into
`pct_events`. PIP-PCD-1053 is not a milestone: it is measured in `nos` and its planned
quantity is simply missing from the baseline. Four punch-list mentions produced a node
reported complete on no measurable evidence at all.

### Decision
Split the branch three ways on what the node actually is:

| `planned_qty` | `uom` | Behaviour |
|---|---|---|
| `> 0` | any | Unchanged — partial-scope protection (D-008 / H-017) |
| `<= 0` | set | **New** — planned quantity is *missing*; progress is recorded, no percentage is derived |
| `<= 0` | empty | Unchanged — a genuine milestone; a completion claim means 100% |

A quantity reported against a node with no planned quantity is likewise recorded as a
note rather than silently dropped, since `installed / 0` cannot produce a percentage.
A percentage the *source stated* ("punch list 100% closed") still counts: only a
percentage **derived** from a missing planned quantity is refused.

### Reason
`percent_complete` is the gate on `actual_finish` (D-008). A node that reaches 100% on
no measurable evidence writes a finish date on no measurable evidence. Reading
`planned_qty == 0` as "this node has no measurable scope" is only true when the node
also declares no unit; when it declares `nos`, the zero is a data gap in the baseline,
and a data gap must not resolve to "complete".

### Alternatives Considered
- **Treat any `planned_qty == 0` node as never completable.** Rejected: it would break
  genuine milestones, which have no quantity by nature. The unit of measure is the
  signal that separates the two.
- **Backfill a planned quantity for PIP-PCD-1053.** Rejected: it fixes one row of one
  fixture and leaves the arithmetic wrong for the next baseline.

### Verification
`matching/test_matching.py::TestZeroPlannedQuantity` (3 tests) and
`::TestMilestoneNode` (1, on a synthetic one-node schedule, since the 120-activity
baseline contains no genuine milestone). `python eval.py`: PIP-PCD-1053 no longer
appears in the roll-up table — it now correctly reports 0%, and the count of nodes with
no measurable quantity moved 65 → 66.

### Affected Areas
`matching/engine.py` (`RollupAccumulator.add`), `matching/test_matching.py`.

### Trade-offs / Consequences
Easier: the roll-up table no longer shows `0/0 nos, 100.0%`; a missing planned quantity
surfaces as a note instead of as false completion.
Harder: PIP-PCD-1053 now reports 0% and receives no dates, which is one fewer node on
the Schedule screen. That is the honest reading of the evidence available for it.

### Future Notes
The real remedy is upstream: a baseline whose punch-list node carries a planned count.
Until `dataset/baseline_schedule.json` is replaced by a parsed Primavera export
(`FINDINGS.md` F3), the guard is what stands between a missing number and a fabricated
percentage.

---

## 2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement

### Context
A 218-activity Duliajan P6 schedule arrived at the repository root. It is a
better artefact than `dataset/baseline_schedule.json` in every structural
respect - real WBS element names, `wbs_level`, calendars, typed logic ties with
lags - and it is **not interchangeable with it**:

| | `baseline_schedule.json` | `baseline_schedule_v2.json` |
|---|---|---|
| activities | 120 | 218 |
| shared activity ids | — | **0** |
| `wbs_path` | dotted string `"1.1.1.1"` | **list** of WBS element names |
| `wbs_level` | absent | 5 (202) / 6 (16) |
| `calendar` | absent | "6-day" (176) / "7-day" (42) |
| `detail` | present | **absent** |
| predecessors | bare id strings | `{activity_id, rel, lag_days}`, 263 ties |

`dataset/ground_truth.csv` references 141 distinct activity ids (plus
`NO_MATCH`). All 141 resolve against v1. Against v2, 63 resolve - and every one
of those 63 is a numeric-suffix coincidence between two unrelated id sets, not
agreement.

So the new schedule cannot become "the" baseline by being copied over the old
one. Every calibrated threshold, the entire labelled dataset, and every metric
in `research/` are attached to the 120-activity schedule.

### Decision
Adopt it as a **second, versioned baseline**, and make "which baseline?" a
first-class question the system answers rather than an assumption.

1. `dataset/baseline_schedule_v2.json` sits beside `baseline_schedule.json`.
   **The v1 file is untouched and remains the default** everywhere: the seeder,
   `SCHEDULE_PATH`, `eval.py` and every test.
2. A `baseline_versions` table records name, filename, **sha256 of the source
   bytes**, activity count, format, and which row is active. Seeding registers
   a row; so does an import. Previous rows are retired (`is_active = False`),
   never deleted.
3. `GET /schedule` returns that block, so no figure the API serves is
   unattributable. The Schedule footer prints `baseline <name> @<sha7>`, and
   `eval.py` prints the full identity above the headline table.
4. `POST /schedule/import` loads a further baseline and **refuses by default**
   when one is already active; `replace=true` is the explicit consent.

### Reason
The failure this prevents is not a crash. It is a plausible-looking report.
Swapping the file in place would have produced an eval run that loaded 218
activities, silently dropped 78 of 141 labelled ids, kept the 63 that collide
by suffix, and printed a confident precision figure describing nothing. Numbers
that look right and mean nothing are the expensive kind.

### Alternatives Considered
- **Replace `baseline_schedule.json` outright.** Rejected: it invalidates the
  ground truth, the calibration and every published metric at once, with no
  way to tell old numbers from new ones after the fact.
- **Keep the file at the repo root and load it ad hoc.** Rejected: a baseline
  that is not in `dataset/` is not in the demo reset, the healthcheck, or the
  seeder's field of view.
- **Migrate the ground truth to v2 as part of this change.** Rejected as out of
  scope and not mechanically possible - the id sets are disjoint, so the 254
  labelled mentions would have to be re-labelled by hand against the new WBS.
  That is the real work that makes v2 the reference baseline, and D-019's guard
  is what stops anyone skipping it by accident.

### What replace does and does not do
- Activities absent from the DB are **created**.
- Activities already present have their **planned** fields updated.
- **Actual dates, actual quantities and the audit trail are never touched.** A
  baseline says what was planned; what happened is captured evidence.
- Activities absent from the new file are **left in place, not deleted**.
  Deleting them would orphan their `LinkedEvent` and `AuditRecord` rows and
  destroy the append-only trail (D-004). Both baselines' activities coexist in
  the table; `baseline_versions` says which is authoritative.
- Every created or updated activity gets an `AuditRecord`
  (`field="baseline_imported"`, `source="baseline_import"`) naming the file and
  its sha256. Rows are per-activity because `AuditRecord.activity_id` is a
  non-null FK by design (D-004); the project-level summary is the
  `baseline_versions` row.

### Known limitation, reported rather than hidden
`get_matching_engine()` stays pinned to `SCHEDULE_PATH` (v1), because the
retrieval index, the thresholds and the ground truth were all built against it.
Importing v2 therefore changes what the **schedule** holds without changing what
**ingest** can link to. Rather than leave that to be discovered through empty
match results, `_matcher_baseline_drift()` emits an integrity warning on
`GET /schedule` naming both baselines whenever their hashes differ.

### Verification
`python -m pytest -q` → 513 passed (was 435). `server/test_baseline.py` (26) and
`matching/test_providers.py` (52) are new. `python eval.py` is unchanged in
every metric.

### Affected Areas
`dataset/baseline_schedule_v2.json` (moved from the repo root), `server/db.py`,
`server/main.py`, `server/schemas.py`, `matching/providers.py`,
`matching/schedule_index.py`, `frontend/src/types.ts`,
`frontend/src/pages/Schedule.tsx`, `eval.py`.

---

## 2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site

### Context
Adopting a second baseline exposed how many places knew the shape of the first
one. `ScheduleIndex.from_json`, `_seed_schedule_if_empty`, `server/conftest.py`
and `server/test_server.py` each opened the file and read the fields they
happened to need. A `wbs_path` that is a list instead of a string, or a
predecessor that is an object instead of a string, is not one bug in that
arrangement - it is one bug per call site, each failing differently.

### Decision
`matching/providers.py` owns baseline reading.

- `ScheduleProvider` (ABC) with exactly two methods: `read_activities()` for the
  data and `read_baseline()` for its identity. They are separate so a caller
  that only needs to know *which* baseline is configured does not parse 218
  activities to find out.
- `JsonScheduleProvider` implements both, accepts either top-level shape
  (`[...]` or `{"activities": [...]}`), decodes explicitly (D-010's reasoning),
  and caches the bytes so identity and data cost one read.
- `PmxmlScheduleProvider` and `PrimaveraXerScheduleProvider` are **declared and
  deliberately unimplemented**. They raise `NotImplementedError` naming
  themselves and pointing at `FINDINGS.md` F3. A stub that refuses loudly is
  the honest placeholder; a stub returning `[]` would look like an empty
  schedule.
- `normalize_activity()` is the single normalisation: `wbs_path` list → one
  joined string, `detail` optional → `""`, discipline lower-cased, predecessors
  → typed dicts.
- `validate_activities()` refuses a baseline with a missing or duplicate id, a
  missing planned date, or a `wbs_level` outside 5/6 — **before** anything is
  written, because a half-loaded activities table is much harder to notice than
  a refusal.

**`wbs_level` is deliberately not inferred** for a source that omits it. v1's
`"1.1.1.1"` has four segments, which would read as level 4 and contradict the
fact that those rows are the L5/L6 leaves the problem statement describes. An
absent level is recorded as absent.

### Predecessor storage — the migration
The `activities.predecessors` column keeps holding JSON, and now holds
`[{"activity_id", "rel", "lag_days"}]`. Both shapes are readable:

- `predecessor_list()` → ids only. **Unchanged signature**, because every
  existing consumer (integrity warnings, `GET /schedule`, the memory queries,
  `features._predecessor_plausibility`) asks only which activities come first.
- `predecessor_links()` → the full ties.
- A bare id, from v1 or from any row seeded before this change, reads back as
  **FS with zero lag**, which is what a bare id has always meant. Re-importing a
  baseline rewrites legacy rows into the typed shape and counts them as updates.

This is a format-level migration inside an existing column rather than a new
column, so there is no window in which two representations can disagree.

### Alternatives Considered
- **A separate `predecessor_links` column.** Rejected: two columns holding the
  same relation invite drift, and every writer would have to remember both.
- **Change `predecessor_list()` to return typed links.** Rejected: it would
  break five call sites to give four of them data they do not use.

### Affected Areas
`matching/providers.py` (new), `matching/schedule_index.py`, `server/db.py`,
`server/main.py`, `server/schemas.py`, `frontend/src/types.ts`.

---

## 2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe

### Context
`load_ground_truth()` skips any labelled mention whose activity id is not in the
loaded schedule and prints one quiet `NOTE: N rows skipped` line. Pointed at
`baseline_schedule_v2.json`, that behaviour drops 78 of 141 ids, keeps the 63
that collide by numeric suffix, and reports a full set of confident metrics
computed from coincidences. Nothing crashes. Nothing is obviously wrong on the
screen. This is the exact failure mode that would have silently zeroed the
project's numbers.

### Decision
`check_ground_truth_agreement()` in `matching/providers.py` measures what
fraction of distinct ground-truth activity ids resolve against the active
baseline. `eval.py` calls it **before scoring anything** and, below
`MIN_GROUND_TRUTH_COVERAGE = 0.80`, prints the baseline, the counts, up to eight
missing ids and an explanation, then exits **2**.

### Reason — why resolvable coverage, not exact matching
Exact id matching against the *working* baseline is **111/141 = 78.7%**, which is
below 80%: a guard built on exact matching would refuse the one baseline that is
known to be correct. `eval.py` resolves ids through
`ScheduleIndex.resolve_id()`, which maps a shortened label like `PIP-1024` onto
`PIP-RCK-1024` by unique numeric suffix, and that resolution is precisely what
decides whether a labelled row is evaluable. Measuring it gives:

| baseline | resolvable | verdict |
|---|---|---|
| `baseline_schedule.json` | 141/141 = **100%** | runs |
| `baseline_schedule_v2.json` | 63/141 = **44.7%** | **refused, exit 2** |

An empty ground truth fails the check rather than reading as 100%: a ground
truth with nothing in it cannot vouch for a baseline.

### Alternatives Considered
- **Warn and continue.** Rejected: the current behaviour already warns, in one
  line, and that line is what would have been missed. A metric nobody should
  trust must not be printed at all.
- **Fail on the first unresolvable id.** Rejected: a handful of stale labels is
  a normal state for a live dataset. 80% distinguishes drift from a different
  project.

### Affected Areas
`matching/providers.py` (`check_ground_truth_agreement`, `BaselineAgreement`),
`eval.py` (`assert_baseline_matches_ground_truth`, `--schedule`).

### Future Notes
The guard is the thing that makes re-labelling `ground_truth.csv` against v2 a
deliberate project rather than an accident. When that work happens, this check
is what proves it finished.

---

## 2026-09-01 / D-020 — The v2 evaluation corpus is generated as one family, from one seed

### Context
`baseline_schedule_v2.json` was adopted as a second baseline (D-017), but
nothing could be measured against it: `dataset/ground_truth.csv` references 141
activity ids, none of which exist in v2, and D-019's guard correctly refuses to
evaluate that combination.

The schedule, the daily reports, the spreadsheets and the ground truth are one
artifact family. Regenerating any one of them alone produces a corpus that still
loads, still runs, and reports numbers that describe nothing.

### Decision
`generate_v2_dataset.py` writes the whole family into `dataset/v2/` from a
single seed (20260901), and validates it before the run is allowed to count:

| artefact | count |
|---|---|
| daily progress reports | 29 (`dpr_day_01..29.txt`), 4 deliberately messy |
| discipline registers | 5 `.xlsx`, merged headers, mixed date formats, blank cells |
| labelled mentions | 700 — 632 gold positives, 68 hard negatives |
| activity coverage | 218 of 218 activities mentioned at least once |
| near-miss mentions | 35 |

`dataset/` and every v1 file is untouched; v1's metrics are byte-for-byte
unchanged (Top-1 87.2%, auto-link precision 100.0%, coverage 50.4%).

**Two columns the v1 key does not have:**

- **`mention_date`** — the date stated *inside* the mention text, separate from
  the report date. This is the fix for the harness artefact found in D-015: the
  v1 harness gave every event only the report date, so every finish resolved as
  `DEFAULTED_TO_REPORT_DATE` and the roll-up withheld all of them. On v2, 41.6%
  of test mentions now resolve `EXPLICIT` and real finish dates are written.
- **`split`** — see D-021.

**Hard negatives are plausible construction text, never gibberish**: unplanned
scope and variation orders, site logistics, safety observations, weather, and
quality/documentation narrative. 68 of them, and **0 auto-link** at default
thresholds.

### Reason
A generator rather than hand-authoring, because 700 mentions across 218
activities cannot be hand-written consistently, and because the family has to be
reproducible: a corpus nobody can regenerate is a corpus nobody can correct.

### Two extractor defects this corpus exposed
Both were found while generating, both are **reported and deliberately not
fixed** — they live in `extraction/prepass.py`, feed `tag_overlap` and
`percentage`, and changing either would move v1's published numbers.

1. **`extract_tags` cannot see v2's equipment tags.** `EQUIPMENT_TAG_RE` allows
   a 1-3 digit suffix. Every v1 tag fits (`V-101`, `TK-1`, `CS-01`) and all 12
   are recognised; v2 numbers equipment with four digits, so **18 of its 40
   distinct tags** (`V-1101`, `PT-1101`, `TK-2101`, `PK-2401`, `FST-1301` …)
   sit in the text unread. `tag_overlap` is the near-decisive ranker feature, so
   on v2 the tag channel is roughly half blind.
2. **`FRACTION_RE` reads the digit inside a unit suffix.** It is
   `(\d+)\s+(?:of|out of|of total)\s+(\d+)`, so `40 m3 of 120 m3` parses as
   **3/120 = 2.5%** instead of 33%, and `320 m2 of 480 m2` as **0.4%**. It hits
   every unit ending in a digit — m2 and m3, 42 of v2's 218 activities and most
   of the civil scope. `percentage` gates `actual_finish` (D-008/D-015), so a
   real DPR written the natural way silently under-reports completion. The
   corpus phrases quantities as `40 of 120 m3` to avoid the collision.

### Known limitation — the corpus does not yet stress the ranker
Held-out Top-1 is **99.2%** (123/124) with **one** wrong suggestion. That is not
a result to celebrate; it says the corpus is easier than v1, whose Top-1 is
87.2%. Measured lexical overlap between a mention and its gold activity is
*lower* on v2 (mean 0.644 vs 0.757; 1.1% verbatim vs v1's 38.0%), so the cause
is not copying — it is that v2's descriptions are longer and far more
distinctive, and that only 35 of 700 mentions are near-misses, 5 of which land
in test. Pooled 5-fold CV over all 700 gives a more stable Top-1 of **97.0%**.

Raising the difficulty is the next dataset task: many more near-miss pairs, and
sibling activities whose discriminator the mention genuinely omits.

### Affected Areas
New: `generate_v2_dataset.py`, `dataset/v2/` (29 DPRs, 5 xlsx,
`ground_truth_v2.csv`, `splits.json`, `VALIDATION.md`). Modified: `eval.py`.
**Nothing in `dataset/` and nothing in `matching/` changed.**

---

## 2026-09-01 / D-021 — Thresholds are tuned on dev and reported on test

### Context
`eval.py` calibrated thresholds on the full labelled set and then reported
metrics on that same set (D-002's grid search). With 254 hand-written mentions
that was a known and stated simplification. With 700 generated mentions it stops
being defensible: a threshold chosen on the rows it is then scored against is
not a measurement of the system, it is a memory of those rows.

### Decision
`ground_truth_v2.csv` carries a `split` column — **train 423 / dev 140 /
test 137** — stratified by discipline *and* by match/no-match, seed 20260901,
written to `dataset/v2/splits.json`.

When the key carries splits, `eval.py` calibrates on **dev only** and reports
the headline on **held-out test only**. When it does not — the v1 key — the old
whole-set behaviour is unchanged, so v1's published numbers still reproduce.

**Identical mention text is kept in a single split.** Stratifying rows alone
would let the same sentence appear in both dev and test, which is the leak that
makes a held-out number meaningless.

### Reason
The project's central claim is 100% auto-link precision. That claim is only
worth anything if the operating point was chosen without seeing the rows it is
quoted on.

### Trade-offs
The headline now rests on 137 mentions, so it moves by ~0.7 points per row.
Pooled 5-fold CV over all 700 is the more stable estimate and is one flag away
(`--cv`); the split figure is the honest headline, the CV figure is the tighter
one, and both are reported rather than whichever looks better.

### Affected Areas
`eval.py` (`--ground-truth`, split-aware calibration, `print_date_basis`),
`dataset/v2/ground_truth_v2.csv`, `dataset/v2/splits.json`.

---

## 2026-09-01 / D-022 — A tag's digit count is a numbering convention, not part of what a tag is

### Status
Implemented. Closes the first of the two defects recorded in D-020.

### Context
`EQUIPMENT_TAG_RE` bounded a tag's numeric suffix at three digits and its
prefix at three letters. Every tag in `dataset/baseline_schedule.json` fits
that — `V-101`, `TK-1`, `CS-01` — so the bound was invisible for as long as v1
was the only baseline. `baseline_schedule_v2.json` numbers equipment with four
digits and uses one four-letter prefix, so **18 of its 40 distinct tags**
(`V-1101`, `PT-1101`, `TK-2101`, `PK-2401`, `FST-1301`, `WHCP-2101` …) were
invisible to the extractor. `INSTRUMENT_TAG_RE` carried the same three-digit
bound and missed `PT-1101`, `LT-1201`, `TE-1301`, `FE-1401`.

`tag_overlap` is the near-decisive ranking feature, so on v2 roughly half the
tag retrieval channel was dark and those mentions were being matched on
description similarity alone.

### Decision
Two named bounds, deliberately generous, replace the inline literals:

```python
TAG_NUM  = r'\d{1,5}'    # equipment / instrument suffix
LINE_NUM = r'\d{3,5}'    # pipe line number
```

`EQUIPMENT_TAG_RE`'s prefix widens to `[A-Z]{1,4}` for `WHCP-2101`, and stays
**uppercase-only** — lower-casing it would start matching ordinary hyphenated
prose ("unit-1", "zone-2"). `PIPE_TAG_RE` and `PIPE_BARE_RE` move to
`LINE_NUM` for the same reason, though no shipped baseline needs it yet.

A digit count describes one project's numbering convention. It is not part of
what a tag *is*, and hard-coding it means the next baseline needs a regex change
to be readable at all.

### The regression this exposed, and the guard that fixes it
Widening the suffix made `EQUIPMENT_TAG_RE` also match the **line portion of a
full pipe tag**: `P-1015` inside `6"-P-1015-A1A`. `extract_tags` then returned
both, giving the schedule record a second, **size-less** key for the same line —
and a size-less key matches 12" field text against a 6" line, silently defeating
the size-mismatch guard that protects auto-link precision.

`matching/test_matching.py::TestFeatures::test_size_mismatch_penalised` caught
it: the score moved 0.35 → 0.85 against a threshold of 0.5.

The bare-pipe branch of `extract_tags` had always carried a containment check;
the equipment and instrument branches needed the same one once they could reach
four digits. Longest match now wins:

```python
if any(tag in t for t in tags):
    continue
```

### Measured impact
Tag readability, before → after:

| | v1 | v2 |
|---|---|---|
| distinct schedule tag strings readable | 44/44 (unchanged) | **41 → 101** activities; **22/40 → 40/40** distinct strings |
| mentions with a readable tag | 90/254 (unchanged) | **96 → 205** of 700 |
| schedule descriptions with a readable tag | 59/120 (unchanged) | **46 → 118** of 218 |

End-to-end, pooled 5-fold CV over all 700 v2 mentions: coverage **54.1% →
56.6%**, auto-link recall **60.0% → 62.7%**, Top-1 **96.8% → 97.0%**, auto-link
precision unchanged at **100.0%**.

**v1 is byte-for-byte unchanged, and that is the correct outcome, not an
oversight.** Every v1 tag is three digits or fewer, so the bound never fired on
it. This was verified mechanically rather than assumed: extracting tags and
fractions across the whole v1 corpus under both the old and new patterns gives
identical counts (90 mentions with tags, 4 with fractions, 59 descriptions,
44 tag strings).

### Honest reading of the gain
The tag channel went from roughly 40% to 100% coverage on v2 and bought **+2.5
percentage points of coverage**. That is a real gain at unchanged precision, but
it is much smaller than the visibility numbers suggest, and the reason is worth
stating: the ranker was already getting most of these right from description
similarity, so restoring the tag channel largely added *redundant* evidence
rather than new correct answers. The defect was real; its cost was lower than
the headline "half the tags are invisible" implied.

### Digit-count assumptions elsewhere — reported, not changed
`matching/` was out of scope for this task, and two assumptions live there:

| Location | Pattern | Status |
|---|---|---|
| `matching/textutils.py` `_PIP_FULL_RE`, `_PIP_BARE_RE` | `\d{3,4}` | Fits both baselines. A five-digit line number would not parse. |
| `matching/textutils.py` `_SLASH_VARIANT_RE` | `[A-Za-z]{1,3}[-\s]?\d{1,3}` | **Live gap.** `P-1401A/B` is a real v2 tag and does **not** expand into `P-1401A` / `P-1401B`, so a field report naming one pump loses the shared tag evidence. |

`parse_tag`'s generic fallback normalises any equipment tag regardless of digit
count, so newly-readable tags flow through it correctly.

### Affected Areas
`extraction/prepass.py`, `extraction/test_extractor.py` (new
`TestTagDigitWidth`, 20 cases).

---

## 2026-09-01 / D-023 — A unit suffix is not a numerator

### Status
Implemented. Closes the second defect recorded in D-020.

### Context
`FRACTION_RE` was `(\d+)\s+(?:of|out of|of total)\s+(\d+)`, with no boundary
before the numerator, so it read the digit **inside a unit suffix**:

| text | parsed as | should be |
|---|---|---|
| `40 m3 of 120 m3 poured` | 3/120 = **2.5%** | 33.3% |
| `320 m2 of 480 m2` | 2/480 = **0.4%** | 66.7% |
| `1 m3 of 1 m3 complete` | 3/1 = **300%** | 100% |

Every unit ending in a digit was affected — m2 and m3, which is 42 of v2's 218
activities and most of the civil scope. `percentage` gates `actual_finish`
(D-008, D-015), so a DPR written the natural way silently under-reported
completion, and the 300% case was rejected outright by `ExtractedEvent`'s 0-100
bound — a hard crash during dataset generation, which is how it was found.

### Decision
```python
FRACTION_RE = re.compile(
    r'(?<![\d.])\b(\d+)'            # numerator: not mid-token, not a decimal tail
    r'(?:\s*[A-Za-z]{1,4}\d?)?'      # optional unit: m3, m2, lm, nos, MT
    r'\s+(?:of|out of|of total)\s+'
    r'(\d+)\b',
    re.IGNORECASE,
)
```

Two changes, and the second matters as much as the first. A boundary alone would
have made `40 m3 of 120 m3` match **nothing**, which is safer than 2.5% but
still loses a real quantity signal. Allowing an optional unit token between the
numerator and "of" captures the quantity as written.

### Measured impact
Mentions from which a fraction is extracted: v2 **42 → 104** of 700 (v1
unchanged at 4 — its corpus never puts a unit before "of"). The end-to-end
metric movement in D-022 is the combined effect of both fixes; they were
measured together because they ship together.

### Consequence for the v2 corpus — a task, not a change
`generate_v2_dataset.py` currently phrases quantities as `40 of 120 m3`
specifically to route around this bug, and says so in a comment. That workaround
is now unnecessary: `40 m3 of 120 m3` parses correctly. **The corpus was
deliberately NOT regenerated as part of this change** — regenerating it would
have moved the dataset and the extractor in the same commit, and the
before/after numbers above would then measure nothing in particular. Switching
the generator to the natural phrasing is a follow-up, and it should be measured
on its own.

### Affected Areas
`extraction/prepass.py`, `extraction/test_extractor.py` (new
`TestFractionUnitSuffix`, 13 cases).

---

## 2026-09-01 / D-024 - A near-miss is a mention with its discriminator removed

### Status
Implemented. Supersedes the near-miss construction described in D-020.

### Context
D-020 recorded that the v2 corpus did not stress the ranker: held-out Top-1 was
99.2%, only 35 of 700 mentions were near-misses, and 5 of those landed in the
test split. A metric computed off five hard cases is a property of the corpus.

The deeper problem was the *definition*. D-020's near-misses deliberately KEPT
the discriminating token, so the label stayed unambiguous and the mention was
merely superficially similar to a sibling. That is not a hard case; it is a
normal case with distracting context.

### Decision
A near-miss is a mention from which the one token that decides the answer has
been **removed**. Three kinds, built from the v2 schedule's own structure:

| kind | construction | count |
|---|---|---|
| `discriminator_omitted` | two siblings differ by one token - Unit 1/Unit 2, Module 1/2/3, Ch 0-160/Ch 160-320 - and that token is deleted | 27 |
| `adjacent_sequence` | same discipline, same id family, consecutive numbers; the mention keeps only the words the two steps share | 16 |
| `shared_tag` | one tag carried by several activities (V-1101 appears on 9); the mention names the tag and gives only generic progress | 117 |

**160 of 814 mentions (19.7%)**, against a floor of 150, placed **train 37 /
dev 55 / test 68** - 74% in the splits where they are measured, by adding
near-miss as a third stratification axis.

Every near-miss row carries `near_miss_kind`, `missing_discriminator`, and
`confusable_with` - the rest of the ambiguity set.

### Why three metrics rather than one
Strict top-1 on this subset is partly a measure of luck. When "Sleeper and
column footings, pipe rack" is compatible with Module 1, 2 and 3, choosing the
gold one is a coin toss the system cannot reason its way out of. So the
evaluation reports:

- **strict top-1** - the number asked for, honest and low;
- **in-family top-1** - did the ranker land inside the ambiguity set, which is
  the question the text can actually answer;
- **the REVIEW rate** - because on text whose discriminator is missing, REVIEW
  is the *correct* behaviour and a confident auto-link is wrong even when it
  happens to hit the gold id.

Sibling pairs are merged transitively into complete families. Emitting Module
1/2/3 as three pairs left every `confusable_with` list one member short, which
made in-family under-report a ranker that had not actually left the family.

### Measured - held-out test (198 mentions, 185 positives)

| Subset | n | Top-1 |
|---|---:|---:|
| Overall | 185 | **71.4%** |
| Near-miss only | 68 | **26.5%** |
| All the rest | 117 | **97.4%** |

In-family top-1 on near-misses **75.0%** (51/68). Outcome on near-misses:
**100% REVIEW**, 0 auto-links - the system does not confidently link text it
cannot resolve. Auto-link precision **100.0%**, NO_MATCH rejection **84.6%**.

Pooled 5-fold CV over all 814: overall **82.1%**, near-miss **25.0%** (160),
rest **97.8%** (584), in-family **78.8%**, auto-link precision **99.8%**.

### Reading it honestly
**Top-1 fell from 99.2% to 71.4% and nothing about the matcher changed.** The
earlier number measured a corpus that never asked a hard question. 97.4% on
ordinary mentions is the same engine as before; 26.5% on near-misses is what it
was always worth on ambiguous text, now visible.

The 75% in-family figure is the useful one for engineering: retrieval finds the
right neighbourhood three times in four and the *ranker* cannot separate
siblings - which points at the discriminator features, not at recall.

`shared_tag` is the hardest kind at 20.4%, and it is also the most realistic:
one tag legitimately spans fabrication, erection, testing and commissioning of
the same item, and field prose routinely names the tag and nothing else.

### One thing this exposed before the family merge
An intermediate run scored auto-link precision **98.0%** - below the 99% floor -
on two wrong auto-links, one of them a Module 1/2/3 near-miss linked at margin
0.031. After merging families the operating point moved to `margin_min=0.12` and
precision returned to 100%, but the lesson stands: **the margin rule is what
protects precision on ambiguous text, and it was previously being calibrated
against a corpus with almost no ambiguous text in it.**

### Affected Areas
`generate_v2_dataset.py` (`build_near_miss_families`, `build_near_miss_queue`,
`build_near_miss`, `_strip_tokens`, three-axis stratification),
`dataset/v2/*` (regenerated), `eval.py` (`print_near_miss`).
No threshold was lowered and no near-miss was removed to raise a score.
`matching/` untouched.

---

## 2026-09-01 / D-025 - Two more tag-normalisation defects, found by auditing for the assumption rather than the symptom

### Status
Implemented. Completes the work D-023 began.

### Context
D-023 widened `TAG_NUM` to 1-5 digits and `LINE_NUM` to 3-5 so v2's four-digit
equipment tags would be read. That fixed the *symptom* it was looking at. An
audit for the same *assumption* elsewhere - "a tag number has at most three
digits" - found it still living in two more places, both silently discarding
tag evidence on the strongest ranking feature the engine has.

### The two defects

**A. `EQUIPMENT_TAG_RE` swallowed the head of the next tag.** The optional
`(?:/[A-Z])?` exists to capture a variant suffix: `P-101A/B` means P-101A and
P-101B. On `V-1101/V-1201` it matched the leading `V` of the *second* tag,
producing the junk tag `V-1101/V` - which resolves to no schedule line at all -
and losing `V-1201` entirely. 6 v2 activities and 3 labelled mentions.

Fixed by requiring that a variant letter is not followed by a tag number.

**B. `matching/textutils._SLASH_VARIANT_RE` capped digits at 1-3.** So
`P-1401A/B` never expanded to its two variants; it was normalised whole to the
key `p-1401ab`, matching nothing. 6 activities and 7 mentions.

Fixed to 1-4 letters and 1-5 digits, matching `EQUIPMENT_TAG_RE`.

**C.** `_PIP_FULL_RE` / `_PIP_BARE_RE` still read 3-4 digits where the prepass
reads 3-5. Latent - v2 uses four - but the normaliser is the second half of the
same convention and must carry the same bound. Aligned.

### Measured
Held-out test top-1 and near-miss top-1 **did not move**; coverage moved
41.4% to 40.9%. The affected tags are ~10 mentions in 814, mostly in train.

This is reported as it came out. The defects were real and the fix is correct -
`V-1101/V-1201` now yields both tags, `P-1401A/B` both variants - but on this
corpus the correction is worth approximately nothing, and saying otherwise
would be inventing a result. The value is that the strongest feature is no
longer silently wrong on a tag convention the v2 baseline actually uses.

### Why the bound is generous rather than exact
A digit count is a property of one project's numbering convention, not of what
a tag IS. Both fixes chose the loosest bound that cannot match ordinary prose.

### Affected Areas
`extraction/prepass.py` (`EQUIPMENT_TAG_RE`), `matching/textutils.py`
(`_SLASH_VARIANT_RE`, `_PIP_FULL_RE`, `_PIP_BARE_RE`).

---

## 2026-09-01 / D-026 - The dense channel was 86% of latency because it encoded one mention at a time

### Status
Implemented.

### Context
Profiling before changing anything (`research/bench/profile_latency.py`)
attributed **86% of warm per-event latency to the dense channel** - and almost
all of that to per-CALL overhead, not per-token work. Encoding one 12-word
mention costs nearly what encoding sixty costs.

### Decisions

**1. One forward pass per FILE, not per event.** `HybridRetriever.retrieve_many`
encodes every mention of a document together. `match_event` is now
`match_events` with a batch of one rather than a second implementation - two
separate paths had drifted apart in the sixth decimal of the cosine, because
BLAS accumulates a matrix-vector product differently from a matrix-matrix one.
Never enough to change a decision; exactly enough to make an eval number
describe something other than what the server runs. One path cannot drift from
itself. `matching/test_equivalence.py` asserts the remaining equality.

**2. The activity embedding matrix is cached on disk**, keyed by a sha256 over
the model name and the exact document strings - not by file path or mtime, so
invalidation is automatic and total. Read back with `mmap_mode="r"`.

**3. One model per process.** `retrieval.shared_embedder()` is a module-level
singleton and loading is lazy, so constructing an engine imports nothing.

**4. BM25 is precomputed as a term x document score matrix at startup.** Every
factor in the Okapi score depends only on (term, document); rank_bm25 recomputed
it on every call. Bit-exact against `BM25Okapi.get_scores` (max abs difference
0.000e+00 over 814 queries) and **47x faster**.

**5. Feature scoring is a matrix operation.** One `rapidfuzz.process.cdist`
call replaces 2 x pool-size Python-level calls; date, predecessor and
discipline features became masked numpy reductions over column arrays built at
index construction. `FeatureVector.model_construct` skips pydantic validation on
values this module produced itself.

**6. Short circuit on an unambiguous tag** - implemented, and **it barely
fires**: 4.7% of v2 mentions, 0.4% of v1. A line number in this domain names an
*equipment item*, not a task; V-1101 is referenced by its excavation,
foundation, erection, piping, cabling and testing. 343 of 814 mentions carry a
line the schedule knows and only 38 name a line belonging to one activity. It is
kept as a correctness-preserving fast path (38/38 correct) but it is **not** a
speed lever, and the latency table shows batch encoding is what pays.

### Measured

| | v1 before | v1 after | v2 before | v2 after |
|---|---:|---:|---:|---:|
| per-event, batched | 5.85 ms | **2.09 ms** | 7.14 ms | **2.84 ms** |
| per DPR file | 123.9 ms | **44.3 ms** | 169.9 ms | **68.0 ms** |
| throughput | 170.8 ev/s | **477.9 ev/s** | 140.9 ev/s | **352.0 ev/s** |

Cold start, fresh process (v2): 8557 ms to 7966 ms. The embedding cache removes
372 ms of it. **The remaining 7.5 s is the `import torch` that
sentence-transformers pulls in, and no cache can remove it** while a dense
channel exists - a process that must encode an unseen query has to have the
runtime loaded. Reported rather than hidden: the honest cold-start win is small
and the warm win is 2.5-2.9x.

### What this is NOT
No FAISS, no Chroma, no vector database. At 218 x 384 the similarity is a numpy
dot product that costs microseconds; a vector store would add a dependency, a
process and an index-consistency problem to accelerate something that is not the
bottleneck. The bottleneck was per-call encoder overhead, and batching fixed it.

### Affected Areas
`matching/retrieval.py` (rewritten), `matching/embedcache.py` (new),
`matching/config.py` (new), `matching/features.py` (`score_pool`,
`blend_matrix`, `matrix_to_vectors`), `matching/schedule_index.py`
(`ensure_bm25`, `_build_bm25_matrix`, `bm25_scores`, `ensure_ngram`,
`_build_feature_columns`, `index_of`), `matching/engine.py`,
`matching/test_equivalence.py` (new, 13 tests), `.gitignore` (`.cache/`),
`research/bench/profile_latency.py`, `research/bench/cold_start.py` (new).

---

## 2026-09-01 / D-027 - Recall@20 is 100%, so retrieval tuning cannot help and discipline gating actively hurts

### Status
Implemented. Constrains D-001 (retrieval and ranking as separate stages) with a
measurement about where the error actually lives.

### The measurement that reframed the work

| split | recall@1 | @3 | @5 | @10 | @20 |
|---|---:|---:|---:|---:|---:|
| train (387) | 0.907 | 0.969 | 0.982 | 0.997 | **1.000** |
| dev (172) | 0.744 | 0.849 | 0.919 | 1.000 | **1.000** |
| test (185) | 0.714 | 0.881 | 0.951 | 0.995 | **1.000** |

Per channel on test: BM25 100%, char n-gram 100%, DENSE 93.5%, TAG 54.1%,
fusion **100%**.

**The gold activity is always already in the pool.** Every remaining error is a
ranking error. Retrieval can only affect top-1 by changing which 20 candidates
are present - it cannot add a gold that is already there.

### Consequences, each measured on held-out test

| change | delta top-1 | verdict |
|---|---:|---|
| tuned BM25 (k1, b), grid-searched on train | **+0.00** | no headroom - revert |
| tuned RRF (k, channel weights), fitted on train | **+0.00** | no headroom - revert |
| char 3-5 gram channel | **+0.00**, +0.50 ms/event | costs latency for nothing - revert |
| discipline soft gate | **-4.32** [-7.0, -1.6] | **actively harmful - reverted** |

The tuner does move what it is asked to move: fusion MRR@20 on train goes
0.9339 to 0.9466. It does not move top-1, because MRR over the retrieved pool is
not an input to the final score - the feature stage rescores the pool from
scratch. Tuning a quantity that nothing downstream reads is the definition of a
number that is not a result.

### Why discipline gating hurts
Discipline is *inferred from field text* and the inference is noisy - "pipe
rack" reads as piping inside a civil sentence. Gating the pool on a noisy label
removes the gold candidate more often than it removes a distractor. The soft
escape (fall back when fewer than 6 candidates survive) limits the damage but
does not reverse it: the interval [-7.0, -1.6] excludes zero, so this is a real
regression, not noise.

Discipline remains a low-weight *feature* and a *conflict guard on auto-link*,
which is where a noisy signal belongs: it can veto, it cannot select.

### Decision
Every knob above stays in `RetrievalConfig` with its default at the pre-existing
value, so the negative results stay reproducible rather than being deleted along
with the code that produced them. `discipline_gate` defaults to `False` and the
docstring says why.

### Affected Areas
`matching/config.py`, `matching/retrieval.py` (`ngram_channel`, discipline
gate), `matching/schedule_index.py` (`ensure_ngram`),
`research/bench/tune_retrieval.py` (new), `research/bench/ablation.py` (new).

---

## 2026-09-01 / D-028 - The learned ranker is selected under the precision floor, not on top-1

### Status
Implemented. Refines D-002 (the hand-set weighted blend).

### Decision
Replace the hand-set `FEATURE_WEIGHTS` blend with a pointwise logistic
regression fitted on the train split, together with the five extra features,
and **select it under the >= 99% auto-link precision constraint rather than on
top-1**.

### Measured - held-out test (198 mentions, 185 positives, 68 near-miss)

| configuration | top-1 | delta [95% CI] | near-miss | coverage | auto-P | ms/ev |
|---|---:|---|---:|---:|---:|---:|
| baseline (hand-tuned) | 71.4 | - | 26.5 | 39.4 | 100.0 | 2.07 |
| learned, logistic | 72.4 | +1.08 [-3.2, +5.4] | 26.5 | 47.5 | 98.9 | 2.26 |
| learned, gradient-boosted | 74.1 | +2.70 [-2.2, +7.6] | 29.4 | **58.6** | **97.4** | 4.23 |
| extra features, hand-weighted | 71.4 | +0.00 [-2.7, +2.7] | 26.5 | 39.9 | 100.0 | 2.14 |
| **extra features, learned (selected)** | **74.1** | +2.70 [-1.6, +7.6] | **29.4** | **47.0** | **100.0** | **2.50** |

### What the constraint rejected
The gradient-boosted ranker reaches the same 74.1% top-1 with **58.6%**
coverage - the highest in the table - at **97.4%** auto-link precision. On 198
test mentions that is 3 wrong auto-links where the floor permits at most 1. It
is the most attractive row and it is not shippable: a wrong auto-link writes a
false actual date onto the schedule, and no amount of top-1 buys that back.

### Honest reading of the selected row
The top-1 interval **[-1.6, +7.6] spans zero**, as does the near-miss interval
[-8.8, +14.7]. At n=185 and n=68 a 2.7-point move is directional, not
established. What IS established, with non-overlapping intervals, is
**coverage +7.6 points at an unchanged 100% precision** and the NO_MATCH result
in D-029. "All the rest" (non-near-miss) reaches 100.0% (117/117) from 97.4%.

### Which features turned out to be worthless
Learned coefficients (standardised inputs, so comparable to each other):

| feature | hand | learned |
|---|---:|---:|
| tag_overlap | 0.320 | **+2.41** |
| fuzzy_similarity | 0.200 | **+2.10** |
| quantity_proximity | 0.050 (new) | +1.16 |
| predecessor_progress | 0.030 (new) | +0.53 |
| embedding_cosine | 0.220 | **+0.18** |
| date_proximity | 0.100 | +0.10 |
| discipline_agreement | 0.060 | +0.10 |
| uom_compatibility | 0.050 (new) | +0.09 |
| report_position | 0.030 (new) | **-0.04** |
| area_match | 0.040 (new) | **+0.01** |

- **`embedding_cosine` is badly overweighted by hand** (0.22, third largest) and
  the model gives it a twelfth of tag_overlap's weight. Dense similarity is a
  *retrieval* signal here, not a discriminating one - every candidate in the pool
  is already semantically close, which is how it got there.
- **`report_position` and `area_match` earn nothing** and are the two extras to
  drop if the feature set is ever trimmed.
- **`quantity_proximity` is the one genuinely new signal that pays**: a mention
  reporting 120 m against a 40 m node is evidence against that node, and nothing
  else in the feature set expressed it.

### `rationale` is unchanged
It remains a list of deterministic feature names. A fitted model changes how
features are *weighed*; it never becomes the explanation. See D-003.

### Guards
`config.production(baseline_sha256)` refuses to apply the artefacts to any
baseline other than the one they were fitted against - v2 has 218 activities and
four-digit tags, v1 has 120 and three-digit ones, and the server still defaults
to v1. A silent cross-baseline transfer is the exact failure this exercise
exists to measure away. Missing artefacts fall back to the hand-set blend.

### The alias lexicon: implemented, contribution 0.000, and the reason matters
Planner corrections are now READ back as a fourth retrieval channel, closing the
loop that `server/main.py:_upsert_alias` had been writing into since D-004. Its
measured contribution on this corpus is **exactly 0.000**, because the v2
generator gave every mention unique text: **0 of 198 test mentions share their
normalised text with any train mention**, and 0 share even a full token-set
signature. No held-out mention *can* match a train-split alias.

That is a property of the corpus, not of the channel, and the two are only
distinguishable with direct evidence - so `matching/test_learned.py` exercises
the channel with a lexicon that does contain the mention and asserts that it
fires, that it is recorded as an `ALIAS` retrieval source, and that it does
**not** bypass feature scoring. Keep it: it costs +0.04 ms with an empty
lexicon, it is the only path by which a planner correction re-enters the system,
and this corpus cannot evidence it either way.

The read key and the write key are now one function, `textutils.alias_key`. They
were two expressions that happened to agree; if they had drifted, corrections
would have stopped being findable and nothing would have failed.

### Cross-encoder: cost measured, gain not
`cross-encoder/ms-marco-MiniLM-L-6-v2` is not cached on this machine and there
is no route to huggingface.co, so **the accuracy gain is unmeasured and no
number is reported for it**. What is measured: a forward pass over the same 20
pairs per event, using the architecturally identical `all-MiniLM-L6-v2` encoder,
costs **45 ms/event** - a lower bound, and **20x the entire current pipeline**.
The degradation contract is tested: an uncached model logs once, latches, and
leaves the feature-scored order untouched.

Recommendation: do not enable by default. It would rerank a pool whose gold
activity is already present 100% of the time, against a learned ranker that
reaches the same top-1 for +0.22 ms.

### Affected Areas
`matching/learned.py` (new), `matching/config.py` (`production`),
`matching/features.py` (five extra features), `matching/models.py`
(FeatureVector fields), `matching/engine.py` (ranker, cross-encoder,
abstention), `matching/artifacts/` (new), `matching/test_learned.py` (new, 20
tests), `server/main.py` (`_upsert_alias` key, `get_matching_engine`),
`eval.py` (`--production`), `research/bench/fit_production.py` (new).

---

## 2026-09-01 / D-029 - Confidence becomes a probability; the abstention model earns nothing on top of it

### Status
Implemented.

### Calibration
Isotonic regression fitted on **dev**, reported on **test**:

| mapping | ECE | Brier |
|---|---:|---:|
| raw score | 0.1286 | 0.1220 |
| Platt | 0.1786 | 0.1125 |
| **isotonic** | **0.0420** | **0.0842** |

**ECE improves 3.1x and Brier 31%.** Platt makes ECE *worse*: a single sigmoid
cannot fit a score distribution that is bimodal by construction - the engine
either identifies a line number or it does not, and there is almost nothing in
between. Isotonic is monotone-but-free-form and fits it.

Reliability on test, the claim against the delivery:

| band | n | claimed | actual |
|---|---:|---:|---:|
| 0.0-0.1 | 14 | 0.006 | 0.000 |
| 0.1-0.2 | 3 | 0.149 | 0.667 |
| 0.2-0.3 | 46 | 0.216 | 0.283 |
| 0.3-0.4 | 22 | 0.332 | 0.409 |
| 0.9-1.0 | 113 | 0.983 | **1.000** |

The band the design rests on is the last one: on 113 mentions the system claims
98.3% and delivers 100%. The 0.1-0.2 row is 3 mentions and should not be read.
The empty 0.4-0.9 region is the bimodality, not missing data.

Labels count NO_MATCH mentions as 0, so a confident answer on a mention with no
correct activity is penalised - which is the case the whole design rests on.

### NO_MATCH rejection, pooled over 5-fold CV (all 70 negatives)

| rule | rejection [95% CI] | positives wrongly refused |
|---|---|---|
| threshold rule, hand-tuned baseline | 80.0% [70.0, 88.6] | 0/185 |
| threshold rule, learned ranker | **100.0% [100.0, 100.0]** | 1/185 |
| + explicit abstention model | 100.0% [100.0, 100.0] | 1/185 |

Pooled, not reported on the 13 negatives in the test split: a rate on 13 items
has an interval roughly +/-25 points and would be reporting the split rather
than the system.

### The abstention model earns nothing, and that is the finding
An explicit reject-option classifier was built exactly as specified - top-1
score, top1-minus-top2 margin, top-5 entropy, tag presence, whether the tag
resolved, discipline agreement, pool mean and standard deviation. **It adds
nothing**, because the ranker already separates the classes completely:
negatives score in [0.309, 0.751] and positives in [0.518, 0.993] under the
hand-set blend, and the learned ranker's probability scale separates them
entirely. There is no headroom for a second model to recover.

It is kept in the codebase, defaulted off, because the separation is a property
of *this* corpus's negatives and a harder negative set would reopen the gap. The
decision rule is written so that an abstainer **can only ever refuse** - it never
promotes anything to AUTO_LINK - so a miscalibrated one costs coverage and can
never cost auto-link precision.

### Affected Areas
`matching/learned.py` (`fit_calibrator`, `fit_abstention`, `Calibrator`,
`AbstentionModel`), `matching/engine.py` (`abstention_features`,
`decide_outcome` abstainer branch, `_calibrated`), `research/bench/harness.py`
(`ece`, `brier`, `reliability_table`, `pooled_no_match`).

---

## 2026-09-01 / D-030 - One design system: six type steps, six spacing steps, three radii, and five button jobs

### Status
Implemented. Visual tokens and shared primitives only - no layout, IA, copy,
routing, data-flow or component-boundary changes in this pass.

### Context
A read-only audit of the frontend measured the drift rather than describing it.
The palette was already clean - 27 semantic colour utilities, zero hex literals
in `src/**.tsx` - but everything above the palette had accumulated one value per
call site:

| category | before | after |
|---|---:|---:|
| font sizes | 13 | **6** |
| padding/gap steps | 26 padding + 10 gap | **6** |
| border radii | 5 | **3** |
| button treatments | 13 | **5 variants, 1 primitive** |
| empty states | 16 | **1** |
| loading states | 7 | **1** |
| error states | 8 | **1 primitive, 3 modes** |
| card-header paddings | 6 | **1** |
| section-title systems | 2 | **1** |

The mixing was the real problem, not the count: bracket sizes (`text-[15px]`)
sat next to Tailwind-scale sizes (`text-xs`) with no rule for choosing, so the
next screen could not be written correctly even by someone trying.

### Decisions

**1. The type scale is enforced by the compiler, not by review.**
`@theme { --text-*: initial; }` clears Tailwind's built-in font sizes, then six
are defined: `--text-label` 12, `--text-body` 14, `--text-lead` 16, `--text-h3`
20, `--text-h2` 24, `--text-h1` 32. `text-xs`, `text-sm` and `text-lg` no longer
compile, so a straggler fails visibly instead of quietly becoming a seventh
size. Verified against the built stylesheet: exactly six `font-size` utilities
are emitted and none of the Tailwind-scale names survive.

Values are the ones already most common in the codebase. The one-offs folded
into their nearest neighbour: 10px and 11px into `label`, 15px into `lead`, 28px
into `h2`, 36px into `h1`.

**2. The spacing scale is NOT compiler-enforced, deliberately.**
The scale is 1, 2, 3, 4, 5, 8 (4/8/12/16/20/32px) and every padding and gap in
`src` now uses only those. It is *not* locked with `--spacing-*: initial`,
because in Tailwind v4 the same namespace drives `w-`, `h-`, `inset-`,
`translate-` and `m-`; clearing it would break `w-24`, `h-16`, `-left-4` and
about forty other sizing utilities that this pass does not touch. Sizing is not
the spacing scale and collapsing it was not the task. Enforced by the primitives
and by review instead, and said so in `index.css` rather than left implied.

Two padding values survive off-scale and are not drift: `pb-24` on Reconcile's
candidate list and `pr-12` on the Field text input. Both clear an
absolutely-positioned child; changing either moves content under a control.

**3. Radii are three, by role.** `rounded-sm` (8px) is anything a cursor or
finger acts on; `rounded-lg` (10px) is anything that contains; `rounded-full`
is pills and dots. 4px existed only on skeletons and is gone. Three radii were
removed outright rather than remapped, because in each case the radius was doing
nothing or actively wrong: the sole `rounded-sm` on an inline text highlight,
`rounded-[8px]` on two sidebar buttons that have no background and no padding
(so the corners could never render), and rounded corners on the Schedule
integrity banner, which is full-bleed and also draws `border-b`.

**4. One `Button`, five variants, shape and size as props.**
`primary | secondary | danger | ghost | icon`, with `size` (`md` = the 16px
mobile control, `sm` = the planner's dense mono control) and `shape`
(`rect | pill`). A third size, `xs`, exists only for controls inside a
fixed-height toolbar row - `sm` is 42px tall and would have changed the Schedule
filter bar's `h-11` layout, which this pass is not allowed to do.

The four pill toggles collapse to `shape="pill"` plus an `active` prop, which is
`boolean | undefined`: undefined means "not a toggle" and keeps the plain
variant, which is what separates the agent's suggestion chips from the filter
chips above them. `FieldProfile`'s language buttons were square where the other
three renderings of the same control were pills; they are pills now.

`Button` renders a `Link` when given `to`, which is how the sole 11px
link-as-button on Home and the "Answer Question" link in the field context
blocks stopped being bespoke.

**5. Empty states pick the sentence-case voice.** The 16 variants split into two
voices - sentence-case prose, and UPPERCASE MONO with `tracking-widest`. Mono
uppercase is this app's voice for machine data; an empty queue is not machine
data and is not a fault, and rendering it like one is why "QUEUE CLEAR" read as
a crash. Sentence case wins. Three strings changed case only, no wording:
`NO CANDIDATES IDENTIFIED`, `Queue Clear` and `Select an item from the queue`.

`NeedsYourResponse` used to `return null` when nothing was outstanding, so it
had no empty state at all and the card appeared or vanished under the microphone
as the query resolved, shifting the page. It renders the shared empty state and
holds its place now.

**6. Skeletons stop stacking opacity.** Every skeleton group wrapped its bars in
`opacity-50` *and* animated them with `animate-pulse`, which itself cycles
opacity 1 -> 0.5. The two multiplied and floored the bars near 0.25 - close to
invisible on a projector. The wrapper is gone; the pulse alone carries it. The
`opacity-50` on the field context blocks' `dimmed` state is a different thing
and is unchanged.

**7. The font declaration now names what ships.** `index.css` declared Inter and
nothing ever loaded it - no `<link>`, no `@font-face`, no `@import`, no package -
so every screen has in fact been rendering in Helvetica since the stylesheet was
written. Two options: self-host Inter, or tell the truth. **Chose to tell the
truth** and declare the system-UI stack. Adding a Google Fonts link would put a
network fetch on first paint that fails silently at a venue with no internet and
degrades to exactly the Helvetica the app already shows; self-hosting means
committing binary font files for a cosmetic change during a freeze. The
declaration is now honest and the rendering is unchanged.

**8. The toast animation is real now.** Reconcile's toast carried
`animate-in fade-in slide-in-from-top-2`, which are `tailwindcss-animate`
classes. That package is not a dependency and is not installed, so all three
compiled to nothing. Replaced with one `@keyframes navis-toast-in` in
`index.css` - same intent, no dependency to install, nothing to fetch offline.

### Status colour: one inconsistency fixed, one reported and left

`text-ok` = a good outcome that completed; `text-warn` = needs a human;
`text-danger` = late or failed; `text-accent` = ahead of plan, and interactive.

**Fixed:** `Memory.tsx` rendered an early finish as `text-ok` while the three
other variance renderers (`Schedule.tsx` `VarianceCell`, `Home.tsx`
`ScheduleHealth`, `Memory.tsx` `SlipByDiscipline`) rendered the same fact as
`text-accent`. In the dark theme those are visibly different colours - teal
against blue - for one fact. Now `text-accent` everywhere.

**Reported, not changed:** `Reconcile.tsx` renders the "Suggested" badge in
`text-warn`. Suggested is the matcher's top-ranked candidate, not something
needing attention, and it sits inches from `ConfidenceBadge` where `text-warn`
means specifically "medium confidence, 0.5-0.775" - so amber on that row reads
as a confidence band it is not. It is left as-is because the obvious
alternative, `text-accent`, is already what marks the *selected* candidate in
that same list, so recolouring it needs a design decision about what the badge
means. That is a meaning change, not a token change, and out of scope here.

### Follow-up within the same pass

Three call sites were caught fighting the primitives rather than using them,
and were corrected rather than left as exceptions:

- `SkeletonRows` hardcoded `p-4`, so two callers passed `className="p-0"` to
  undo it. It takes a `padded` flag now and no caller overrides padding.
- The Clarifications card header was routed through `PanelHeader`, which forced
  its reference string back to `normal-case tracking-normal font-normal` and
  introduced a fourth font weight. Neither side of that row is a section title,
  so it is a plain row using the same `px-4 py-3` the header primitive uses.
  Weights are back to three.
- Converting Field's `StructuredCard` header to `PanelHeader` (`px-4`) left its
  rows and footer at `px-5`, so the header sat 4px inside its own card. The
  rows and footer are `px-4` now and the card aligns.

### Not unified, and why

- **The Planner|Field segmented control** (`App.tsx`). Two halves sharing one
  border and one overflow clip. Expressing that needs a segmented-control
  primitive, not a sixth button variant.
- **The two sidebar utility buttons** (`App.tsx`, Force Mobile View / theme).
  They are muted text rows with no padding and no background. `ghost` would make
  them accent-coloured boxes and put two accent controls in the sidebar footer -
  a visible chrome change, not a token collapse.
- **The Schedule integrity banner.** A full-width clickable banner that is also
  a filter toggle. Not a button shape.
- **Field's `serverErrorBox`.** It is a content panel, not a generic error: it
  carries "This update was not saved." Routing it through `ErrorState` would
  delete that line, which is a copy change. Its Retry is the `Button` primitive
  and its box uses the shared radius and danger tokens.
- **The mic tap-card and the context disclosure header** (`Field.tsx`). Cards
  that happen to be tap targets, not buttons.

### Verification

`node_modules/typescript/bin/tsc --noEmit` clean. `vite build` succeeds; the
emitted stylesheet was inspected directly and carries exactly six font-size
utilities, exactly three radius utilities, and the toast keyframe.

Frontend tests: **52 passed, 3 failed - identical to the untouched baseline**,
confirmed by stashing the whole change and re-running. The three failures are
`field.test.tsx > profile`, failing on `localStorage` being undefined inside
`useDevice.ts:20` under jsdom. Pre-existing, unrelated to visual tokens, and not
worked around - no test was modified.

Note for anyone running the suite on macOS: `node_modules/@rollup` in this tree
contained only `win32` binaries, so vitest and vite could not start at all until
`@rollup/rollup-darwin-x64` was installed with `--no-save`. That is npm's
optional-dependency bug, not a project change; `package.json` and
`package-lock.json` are untouched.

### Affected Areas
`frontend/src/index.css` (type scale, radii, spacing note, font stack, toast
keyframe) - `frontend/src/components/ui/Button.tsx` (new) -
`frontend/src/components/ui/primitives.tsx` (new: `SectionTitle`, `Panel`,
`PanelHeader`, `Skeleton`, `SkeletonRows`, `EmptyState`, `ErrorState`) -
`frontend/src/components/ui/index.ts` (new) - `App.tsx` -
`pages/{Home,Reconcile,Schedule,Ingest,Memory,Field,FieldReports,FieldClarifications,FieldProfile}.tsx`
- `components/{FieldContextBlocks,FieldNav,ConfidenceBadge,DisciplineTag}.tsx`
## 2026-09-01 / D-031 - One file defines every number, and it is not any of the ones that had them

### Status
Implemented.

### Context
Fifteen documents carried metrics. None of them said which corpus a number came
from, and four different counts had drifted into looking interchangeable:

- **120** — the demo project schedule
- **218** — a second, research-only baseline the server never loads
- **254 / 814** — two different evaluation corpora
- **124 artefacts / 43,753 rows / 18,601 rows** — the real research corpus

A reader could take "120 activities" from `README.md`, "87.2% top-1" from
`Audit-1.md`, "recall@20 100%" from the ablation and "218 possible tasks" from
`README.md` §2 and assemble a sentence in which every clause is individually
sourced and the whole is false.

The pass also found nine numbers that were simply stale, and one claim that was
the opposite of what the code does.

### Decision
`METRICS.md` is created as the **single definition site for every number**.
Every other document either cites it or is explicitly scoped and banded as
historical. The rule is written into the file itself: *if another document
disagrees with this one, this one is right; if this one disagrees with the code,
the code is right and this file is the bug.*

Four categories are separated by name, and the file forbids arithmetic across
them:

| | | |
|---|---|---|
| A | Research corpus | `datasets/real/` — 124 artefacts, never used for an accuracy figure |
| B | Matcher evaluation corpora | v1 254 mentions, v2 814 mentions |
| C | Demo project schedule | 120 activities — what the server loads |
| D | Live review queue | 135 pending — what a reset produces |

### Why this rather than fixing the numbers in place
Fixing them in place is what produced the problem. Fifteen files each holding a
copy of a metric is fifteen chances to miss one on the next change, and the
2026-09-01 state proves it: `DEMO.md` said 274 audit records, `SETUP.md` said
259, `ARCHITECTURE.md` said 259, and the database held 275. One definition site
makes the next drift a single edit rather than a search.

### Evidence
Everything in `METRICS.md` was re-measured for this pass, not copied forward:
`python -m pytest -q` (580), `npx vitest run` (55), `python eval.py` and its
`--cv`, `--production` and v2 variants, `python scripts/reset_demo.py`, and
direct queries against `dataset/epc_progress.db` and
`datasets/real/manifests/dataset_summary.json`.

### Consequence
Any future change that moves a metric must update `METRICS.md`, and the
verification block in §6 is the list of commands that regenerate every figure
in it.

### Affected Areas
`METRICS.md` (new), `README.md`, `DEMO.md`, `SETUP.md`, `ARCHITECTURE.md`,
`FINDINGS.md`, `ROADMAP.md`, `Basics.md`, `Audit-1.md`, `research/EVIDENCE.md`,
`research/EXPERIMENTS.md`, `research/JUDGE_QUESTIONS.md`,
`research/NAVIS_TECHNICAL_AUDIT.md`, `scripts/demo_reset.ps1`.

---

## 2026-09-01 / D-032 - The alias loop is NOT closed, and the documentation said three different things

### Status
Implemented (documentation); the gap itself remains **OPEN** as F4.

### Context
Three documents made three incompatible claims about the same feature:

- `ROADMAP.md`: "written but never read"
- `FINDINGS.md` F4: "OPEN - still the largest gap in the data flow"
- the D-028 summary: "keep it: it is the only route by which a planner
  correction re-enters"

The last of those described a **code capability** in language that reads as a
**live behaviour**, which is the more dangerous of the two errors because it
supports a claim to judges that the system learns.

### Evidence, from the code
- **Write:** `server/main.py:_upsert_alias`, three call sites (confirm,
  reassign, new-activity resolve). Real, exercised by tests.
- **Read capability:** `HybridRetriever.alias_channel()` exists, injects the
  mapped activity into the candidate pool with a prior, and is proven by four
  tests in `matching/test_learned.py` — including one asserting it does **not**
  bypass feature scoring.
- **Wiring:** none. `w_alias = 0.0` in the shipped `RetrievalConfig`, and the
  only `db.query(AliasLexicon)` outside tests is the write-side deduplication
  lookup *inside `_upsert_alias` itself*. No production path populates
  `EngineConfig.alias_lexicon`.

### Decision
One status, stated identically everywhere: **STORED SIGNAL ONLY - the loop is
not closed.** A planner correction cannot influence a later re-ingest today.

The separate fact that the *generic alias retrieval ablation* measured +0.000 is
recorded alongside it with its cause, because the two are constantly conflated:
the v2 generator gave every mention unique text, so **0 of 198 test mentions
share their normalised text with any train mention**. The ablation could not
have detected a gain if one existed. That is a statement about the corpus, not
about the channel.

### Why it matters
"The system learns from planner corrections" is a claim a judge will test by
asking what happens on the next upload. The answer today is *nothing*, and being
caught claiming otherwise costs more than the feature is worth.

### Consequence
`METRICS.md` §5 carries the safe sentence. `README.md`, `ARCHITECTURE.md` §7,
`FINDINGS.md` F4 and `ROADMAP.md` now agree. Closing the loop is scoped at
roughly 20 minutes: load the rows in `get_matching_engine()` and set
`w_alias > 0`.

### Affected Areas
Documentation only. No code changed - deliberately, per the reconciliation
brief: documentation is corrected to match code, not the reverse.

---

## 2026-09-01 / D-033 - The live server runs the v1 hand-set blend, and no document said so

### Status
Implemented (documentation).

### Context
D-026/D-028 measured a fitted logistic ranker, five extra features and isotonic
calibration against the **v2** baseline, and wrote `production()` to load them.
`config.production(baseline_sha256)` also carries a guard refusing artefacts
fitted against a different baseline.

Nothing recorded what that guard actually resolves to in the running server.

### Evidence
Imported and evaluated directly:

```
SCHEDULE_PATH   dataset/baseline_schedule.json      (120 activities)
baseline sha    1bfde358dc0e
production(sha) -> DEFAULT          (guard refused the v2 artefacts)
extra_features  False
ranker_path     None
calibrator_path None
channel weights TAG 1.0 · BM25 0.7 · DENSE 0.7 · NGRAM 0.0 · ALIAS 0.0
```

The artefacts in `matching/artifacts/` are fitted against sha `831f0fac2fae`
(v2, 218 activities). The guard logs and falls back. **This is the guard working
as designed, not a defect** - a ranker fitted on a 218-activity feature
distribution has no business scoring a 120-activity schedule.

### Decision
Document the distinction everywhere as **"we measured this" vs "the live demo
runs this"**:

- **Live:** v1 baseline, hand-set feature blend, three retrieval channels, 87.2%
  top-1 / 50.4% coverage / 100% auto-link precision on the v1 corpus.
- **Measured, not deployed:** v2 baseline, learned ranker + isotonic
  calibration, 74.1% held-out top-1 with a CI spanning zero.

Switching the demo to v2 is **not** a config flip: it needs the server pointed at
`baseline_schedule_v2.json` *and* the demo corpus re-labelled against it. Neither
was done, and neither should be done during a reconciliation pass.

### Why it matters
"NAVIS is 74.1% accurate" is false twice over: it is not deployed, and its
improvement is not statistically conclusive. `METRICS.md` §8 lists it as an
unsafe claim.

### Consequence
`METRICS.md` §4 is the status table. `ARCHITECTURE.md` §7 gained an
active-vs-disabled table. `README.md` §5 says the artefacts exist and are not
loaded.

### Affected Areas
Documentation only.

---

## 2026-09-01 / D-034 - Demo counts re-measured; the review queue grew because the system got more careful

### Status
Implemented. One config constant corrected.

### Context
`DEMO.md`, `SETUP.md` and `scripts/demo_reset.ps1` all hard-coded a known-good
state of `activities=120 with actuals=67 review queue=118`, and
`PLAN_SEP_01_04.md` had already flagged that the queue was probably ~135. The
script's own self-check was therefore printing a WARNING on a correct run.

### Evidence
`python scripts/reset_demo.py`, then confirmed over HTTP with
`scripts/demo_reset.ps1`, then read back from the database and the API:

| | documented | actual |
|---|---:|---:|
| activities | 120 | 120 |
| events extracted | 266 | 266 |
| auto-linked | 148 | 148 |
| review items pending | 118 | **135** |
| with actual dates | 67 | 67 |
| … of which completed | 47 | **38** |
| audit records | 274 / 259 | **275** |
| conflict-flagged audit rows | 75 | **68** |
| conflicts on Home (`/schedule/conflicts`) | "25 cases, 21 spreadsheet-vs-DPR" | **18 rows / 17 activities, all 18 spreadsheet-vs-DPR** |

### Why the queue grew and completions fell
Both are **D-015 working**. An Actual Finish is no longer written when no source
named the date; the node is routed to the planner instead of being stamped with
the day the report was typed. So completions fell 47 → 38 and the queue grew
118 → 135. The correct reading is *the system became more careful*, and the demo
script should say that rather than warn about it.

### The one code change
`scripts/demo_reset.ps1`'s `$Expected.ReviewQueue` moved 118 → 135, with a
comment recording why. This is a stale assertion constant, not matcher logic -
it was making a correct run report itself as suspect.

### Also found
A stale local `dataset/epc_progress.db` (gitignored, untracked, regenerable)
predated the `wbs_level` column and crashed server startup with
`no such column: activities.wbs_level`. `reset_demo()` already handles the
schema mismatch; the *startup* path does not. Documented as a recovery step in
`DEMO.md` and `SETUP.md` rather than worked around in code.

### Consequence
Every number spoken during the demo is now reproducible from a single
`python scripts/reset_demo.py`. The Ingest trace (2,151 bytes, 18 events, 12
auto-linked, 6 review, 8 activities updated, 15 audit records) was re-verified
end to end by holding `dpr_day_03.txt` out and re-ingesting it, and needed no
change.

### Affected Areas
`DEMO.md`, `SETUP.md`, `ARCHITECTURE.md` §7, `scripts/demo_reset.ps1`.

---

## 2026-09-01 / D-035 - Real-corpus counts verified from manifests; the WSDOT schedule has 27 activities

### Status
Implemented.

### Context
The real corpus is the strongest honesty asset in the repository and the easiest
thing to accidentally inflate. Every count was re-read from
`datasets/real/manifests/dataset_summary.json` and
`datasets/real/reports/validation.md` rather than from prose.

### Evidence
Validation **PASS**, 1,462 checks, 0 errors, 0 warnings. 124 raw artefacts,
251.37 MiB, and **124 provenance sidecars - a 1:1 match**, each carrying
`data_origin: real` and `is_real: true`. The `data_origin=real` claim is
therefore verified at artefact level, not asserted.

Verified counts: PAIMANA 18,601 project-month rows / 2,243 projects; CFIHOS v2
21 tables / 43,753 rows; Uniclass 2022 15,375 combined rows (identity copies
only, CC BY-ND); ConstructCIE 530 narratives / 3,520 causal spans / 1,580
classifications; Safety Risk Library 466 rows; CPWD DSR E&M 1,661 item rows over
441 pages; cross-source hard negatives 100 rows.

**WSDOT C8078: 21 IDR PDFs, 73 OCR pages, 4,315 OCR lines, 13 work-activity
mentions, 2 schedule snapshots, 54 snapshot rows, and 27 distinct activity
IDs.**

### Decision
Say twenty-seven. The authentic WSDOT schedule has **27 activities** and must
never be described as hundreds. `METRICS.md` §8 lists inflating it as an unsafe
claim.

Label quality is carried with every figure, because these are not equal:

- **manually reviewed** - the WSDOT schedule transcription
- **machine-extracted, UNVERIFIED** - the OCR lines, the work-activity
  candidates, and the CPWD item rates
- **source-published, not re-adjudicated** - CFIHOS, ConstructCIE, Uniclass
- **assistant-reviewed, pending owner confirmation** - the 13-row link review in
  `research/wsdot_c8078_verification_review.md`. Its 53.8% set accuracy and
  96.3% link precision are **proposed** labels. They are not a verified result
  and must not be quoted as one.

### Why it matters
`datasets/real/README.md` already stated all of this correctly. The risk was
never that file - it was that a summary elsewhere would round "27 authentic
activities plus 43,753 CFIHOS reference rows" into "a large real dataset". The
extraction rates in `research/real_corpus_benchmark.txt` are computed over OCR
lines with machine-derived labels and are explicitly **not** a matcher accuracy
claim.

### Consequence
`METRICS.md` §3.5 carries the verified table with label quality per row.
`datasets/real/README.md` was checked and needed no correction.

### Affected Areas
`METRICS.md`. `datasets/real/README.md` verified, unchanged.

---

## 2026-09-01 / D-036 - Negative results are kept, labelled, and not quietly dropped

### Status
Implemented.

### Context
The 2026-09-01 optimisation pass produced more negative results than positive
ones. There is a standing temptation to let those fall out of the documentation
once the shipped configuration is decided, leaving a record that looks like a
series of successes.

### Decision
Every rejected experiment stays documented with its measurement, and every
disabled component stays in the code behind a config default rather than being
deleted - so the negative result remains reproducible.

| Experiment | Result | Status |
|---|---|---|
| Tuned BM25 (k1, b), train-fitted | +0.00 top-1 | **REJECTED** - no headroom; recall@20 already 100% |
| Tuned RRF (k, channel weights) | +0.00 top-1 | **REJECTED** - same cause |
| Char 3-5 gram retrieval channel | +0.00 top-1, +0.50 ms/event | **REJECTED** - cost without benefit |
| Alias retrieval channel | +0.000 | **UNMEASURABLE on this corpus** - zero lexical overlap between splits |
| Discipline soft gate | **-4.32** top-1, CI [-7.0, -1.6] | **REJECTED** - actively harmful, interval excludes zero |
| Gradient-boosted ranker | 74.1% top-1, 58.6% coverage, **97.4%** auto-link precision | **REJECTED** - breaches the 99% precision floor |
| Explicit abstention model | no gain over the threshold rule | **NOT DEPLOYED** - the ranker already separates the classes |
| Cross-encoder rerank | **accuracy UNMEASURED**; ~45 ms/event | **NOT DEPLOYED** - do not claim it failed on accuracy |
| Extra features, hand-weighted | +0.00 top-1 | superseded by the learned weighting |

Two of these are worth stating positively, because they are findings rather than
failures. **recall@20 = 100%** is why four retrieval experiments were flat: the
gold activity is always in the pool, so retrieval cannot be the lever.
**Discipline gating hurting** is a real result about noisy inferred labels - a
signal good enough to veto is not automatically good enough to select on.

### The distinction that must survive
"Measured and rejected" and "never measured" are different claims. The
cross-encoder is the only item in the table whose accuracy was **never
measured** - the model is not cached and the machine has no route to
huggingface.co. Its cost is known (~45 ms/event, roughly 20x the whole
pipeline) and that is the honest basis for leaving it off.

### Consequence
`METRICS.md` §4 lists every disabled component with its reason.
`research/bench/ABLATION_RESULTS.txt` holds the full table with confidence
intervals. `FINDINGS.md`'s status table gained rows for the new rejections.

### Affected Areas
`METRICS.md`, `FINDINGS.md`, `ARCHITECTURE.md` §7. No code changed.

---

## 2026-09-01 / D-037 - An independent audit refuted four of our claims, and it was right about three and a half

### Status
Implemented. Supersedes the pooled-CV figure in D-029 and adds a limits section
to `METRICS.md` §3.4a.

### Context
`AUDIT_CODEX.md` (commit `b47ca48`) is an independent audit taken at snapshot
`1a644eb`. It reproduced every headline number exactly - v1 87.2%, v2 held-out
71.4%, pooled 82.1%, 580 tests, near-miss 26.5%, 100% REVIEW on near-misses - so
the *measurements* are corroborated by a second party.

It then made five criticisms. They were checked against the code rather than
accepted, because an agent report is not evidence either.

### What the audit got right, and what changed as a result

**1 · The pooled CV is not genuine out-of-fold. CONFIRMED - a published number
was wrong.** `eval.py:run_cv` computes a threshold per fold, takes the *median*
of the five, then re-evaluates every pooled row with it. Each row is therefore
decided partly by a threshold its own fold helped choose.

Recomputed properly, with each fold's threshold deciding only its own held-out
rows:

| | printed by `--cv` | true out-of-fold |
|---|---:|---:|
| auto-link precision | 99.8% | **99.5%** (437/439, two wrong) |
| coverage | 53.1% | **53.9%** |
| NO_MATCH rejection | 80.0% | 80.0% (56/70) |

Independently reproduced. **Quote 99.5%, not 99.8%.** The 99% floor still
holds. `eval.py` was deliberately NOT changed - this pass corrects documentation
against code, and rewriting the CV estimator is a behaviour change that deserves
its own task and its own before/after.

**2 · The selected experimental configuration was chosen on the test split.
CONFIRMED - and this is our own methodological error.** `research/bench/
ablation.py` fits on train and dev but *selects* the winner by comparing ten
configurations' **test** top-1. So the 74.1% in D-028 is test-selected and
optimistically biased by an unknown amount. It is not a clean held-out estimate
and must never be described as one. A fourth untouched split, or nested
selection, is required to make that claim.

This does not change the deployment decision - the configuration is not
deployed - but it changes what the number means.

**3 · The splits isolate exact text, not templates or activities. CONFIRMED.**
Verified independently: **0** mentions share normalised text across splits, but
**156 of 185** test positives (84%) reference an activity that also appears in
train. Closed-set ID reuse is legitimate product behaviour; the consequence is
that the numbers describe seen-activity, in-distribution performance and say
nothing about an unseen project.

**4 · The corpus frequently near-copies the answer. CONFIRMED.** For 507 of 744
positives the gold description appears as a normalised substring of the mention.
Token Jaccard against the gold description is 0.58 on `exact` rows and **0.21**
on `near_miss` rows. The easy majority of the corpus is close to a copy of its
label. This is the strongest argument for reporting the near-miss subset
separately, which D-024 already established.

**5 · "An LLM never chooses an activity". PARTIALLY REFUTED - the audit
overstated this one.** It cites `agent_llm.py:161 suggestion.tags = found` as
LLM-supplied tags reaching the matcher. Reading the surrounding code, `found =
parse_tags(joined)` re-derives tags with the deterministic regex pre-pass over
the model's own text, so a hallucinated tag that is not a valid tag is dropped -
D-006 holds as intended. What *is* true, and is now documented, is that an
LLM-inferred **discipline** reaches the ranker as one low-weight feature on the
voice/agent path.

### Two further refutations, verified and accepted

- **"Planned dates are read-only" is false as an absolute.** `server/main.py`
  writes them at `:242-243` (baseline import) and `:1426-1427` (planner creating
  a new activity for unplanned scope). Neither is an ingest path mutating an
  existing baseline row, which is what the claim was reaching for - so the claim
  is now stated precisely instead of absolutely.
- **"Nothing is ever silently thrown away" is false at the boundary.**
  `result.errors` is never read in `server/main.py`: a `.csv` upload is accepted,
  extracts zero events, reports its error nowhere, and is marked completed.
  XLSX reads only `wb.active` and scans only rows 1-9 for a header.

### Decision
Document all of it. `METRICS.md` gains **§3.4a - what the evaluation does not
establish**, which caps every number in §3.2-§3.4, and §8 gains four new unsafe
claims. `README.md`'s two absolute claims are restated precisely.

Nothing in `matching/` was changed. The brief for this pass was explicit that
documentation is corrected to match code, not the reverse, and that experiments
are never altered to make documentation prettier. The CV estimator and the
ablation's selection protocol are both real defects and both are now recorded as
open work rather than quietly patched at the end of a documentation task.

### What survives every criticism
Two results are properties of the decision policy rather than of ranking
difficulty, and no amount of corpus criticism weakens them:

- **Auto-link precision 100% on v2 held-out (81/81) and 99.5% out-of-fold over
  all 814.** The system does not write wrong dates.
- **All 68 near-miss mentions routed to REVIEW, none auto-linked.** On
  genuinely ambiguous text it declines rather than guessing.

Those are the defensible claims. "NAVIS is X% accurate on real projects" is not
one, and this corpus cannot support it.

### Consequence / open work
1. Replace `run_cv`'s median-threshold estimator with true out-of-fold pooling.
2. Add a fourth held-out split, or nested selection, before any configuration
   selected on test is quoted as held-out.
3. Surface `result.errors` from ingest; reject `.csv` explicitly.
4. Widen the XLSX header scan and handle multi-sheet workbooks.

### Affected Areas
`METRICS.md` (§3.3 correction, §3.4a new, §8), `README.md`, `DECISIONS.md`.
`AUDIT_CODEX.md` retained as received. No application code changed.
