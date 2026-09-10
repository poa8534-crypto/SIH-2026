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

---

## 2026-09-01 / D-038 — The resolver rejected the Reconcile screen's own verb

### Status
Implemented. Two demo-path defects in `server/main.py`; no architectural change.

### Context
Both were found by reading the live demo path rather than by a failing test.

**Fix A.** `Reconcile.tsx` sends `{action:'reject'}` for "not this", but
`_resolve_defaulted_finish` accepted only `confirm` and `ignore` and raised a 400
on everything else. This was found by tracing the Reconcile screen's `reject`
verb against the resolver's accepted actions. `ResolveRequest.action` is a plain
`str`, so nothing upstream caught the mismatch — the 400 came from the resolver
itself and painted an error banner on the screen. The 17 `defaulted_finish_date`
items that hit this path exist because of D-015: the roll-up withholds an Actual
Finish when no source named the date, and routes it to a planner instead.
FINDINGS.md F6 has the presenter deliberately reject a wrong suggestion, so the
defect sat directly on the rehearsed demo.

**Fix B.** `ReviewQueueItem.priority` is a string column, so
`.priority.desc()` sorted `'medium'` above `'high'` and `GET /review-queue`
returned high-priority items last. The Reconcile screen masked this by
re-sorting client-side with its own weight map, so it was an API correctness
bug rather than a visible one.

### Decision
On a withheld finish date, normalise `reject` to `ignore` before the guard: both
mean "leave the node complete with no Actual Finish", so they are the same
answer under two names. The guard still refuses the link-editing actions —
`new_activity` and `reassign` remain 400, only the message now names `reject`.
Order the review queue by a `case()` expression mapping high/medium/low to 3/2/1
rather than by the string itself.

### Reason
The alternative to Fix A — changing the frontend's verb — is a `frontend/` edit
under feature freeze, and it would leave the API still rejecting a verb it
documents nowhere. Normalising at the resolver keeps the fix on one side of the
boundary. `reject` is deliberately *not* widened into the link-editing actions:
D-009's rule that only a planner's resolve call writes an actual date is
unchanged, and confirm remains the only path that writes one.

### Verification
- `python -m pytest -q` — 583 passed (was 580; three tests added). Both new
  behavioural tests were confirmed to fail against the unfixed `main.py`.
- `python eval.py` — 87.2 / 50.4 / 100.0 / 8.3, unchanged. Auto-link precision
  still 100.0%.
- `scripts/demo_reset.ps1` — `activities=120  with actuals=67  review queue=135`.
- `GET /review-queue?status=pending` — first item is `high`; all 89 high items
  precede all 46 medium. Live `reject` on a `defaulted_finish_date` item returns
  200 with `resolution: "ignore"` and writes no `actual_finish`; `new_activity`
  on the same item still returns 400.
- `case()` with a dict and `value=` was checked against the pinned
  SQLAlchemy 2.0.52 before use.

### Affected Areas
`server/main.py` (`_resolve_defaulted_finish`, `get_review_queue`, one import),
`server/test_date_basis.py`, `server/test_server.py`, `DEMO.md`, `DECISIONS.md`.
No change to `matching/`, `extraction/` or `frontend/`.

---

## 2026-09-01 / D-039 - Tier 1 screens restructured around one question each; the matcher's reasoning is still invisible on Reconcile, and that is a backend gap

### Status
Implemented, with one part BLOCKED and not worked around. Read the blocker
first — it is the most important thing in this entry.

### BLOCKED: GET /review-queue does not return the matcher's reasoning

The product's stated differentiator is that a link is explainable: `rationale`
holds deterministic feature names, never LLM prose (D-003). The data exists and
is persisted:

| field | column | on the response? |
|---|---|---|
| `rationale` | `db.py:270` `LinkedEvent.rationale` | `LinkedEventResponse` yes (`schemas.py:54`, populated `main.py:1237`) |
| `margin` | `db.py:269` | `LinkedEventResponse` yes (`schemas.py:53`, `main.py:1236`) |
| `match_method` | `db.py:266` | `LinkedEventResponse` yes (`schemas.py:47`, `main.py:1230`) |

`LinkedEventResponse` is what **GET /jobs/{job_id}** returns, so the **Ingest**
screen can and now does render all three.

**`ReviewQueueItemResponse` (`schemas.py:80-93`) carries none of them**, so
**Reconcile cannot.** `main.py:1264` already loads the very same `LinkedEvent`
as `le` and projects six other fields off it (`source_span`, `raw_text`,
`confidence`, `tags`, `alternatives`, ...). The change is:

- `server/schemas.py:80` — three fields on `ReviewQueueItemResponse`:
  `match_method: str = "prepass"`, `margin: float = 0.0`,
  `rationale: list[str] = []`
- `server/main.py:1266` — three lines in the `ReviewQueueItemResponse(...)`
  call, mirroring 1230/1236/1237 exactly:
  `match_method=le.match_method if le else "prepass"`,
  `margin=le.margin if le else 0.0`,
  `rationale=json.loads(le.rationale) if le and le.rationale else []`

That is an endpoint-shape change and this pass was explicitly not permitted to
make one, so it was **not made**. Nothing was fabricated and nothing was
computed client-side.

There is also **no per-candidate score anywhere in any response.**
`/review-queue` returns one `confidence` for the item plus `alternatives` as a
bare `list[str]`. So "why did candidate 1 beat candidate 2" is not answerable
from the API even with the three fields above — ranks 2+ have no score to show.
Closing that needs `alternatives` to become objects carrying a score, which is
a larger contract change and a separate decision.

**What was built instead:** `components/MatchReasoning.tsx` renders score,
margin, method and the signal chips, and is already wired into Reconcile's
detail pane and each candidate card. The fields are declared optional on
`ReviewItem` (`types.ts`) with the full backend reference. When the endpoint
sends them the UI lights up with no frontend work. Until then the panel states
plainly which endpoint does not supply them and points at Ingest's Why column,
where the same data is real. Candidate ranks 2+ say "no score sent" rather than
reusing the top candidate's number.

### Decisions

**1. One question, one action, written down.** Every Tier 1 file opens with the
question it answers and the action it offers, and the layout is ordered to
serve them. Where a screen was answering two questions, one was moved out.

**2. Home stops being three products.** Rows 1-2 are a work queue, row 4 is an
integrity console, and row 3 — per-discipline mean finish variance — was the
same computation as `Memory.SlipByDiscipline` answering a different question
(how is the project trending, not what needs me). `ScheduleHealth` is deleted;
Memory keeps it. The footer line restating the panel's own badge count is gone.
Attention rows and activity rows are links now — they had hover styling and no
`onClick`. `raw_text` shows two lines instead of one truncated line plus a
`title`, because a projector has no hover. "Resolve" is **"View"**: it opens the
Schedule audit drawer, which is deliberately read-only per D-004, and no
endpoint resolves a source conflict — the label was the thing that was wrong.

**3. Reconcile is evidence beside reasoning, above the fold.** The "Extracted
Metadata" grid is deleted: a truncated UUID that identifies nothing to a
planner, a third rendering of the same confidence figure, and a timestamp
already in the queue row. Its space is now a two-column band — what the
supervisor said, and why the matcher chose what it chose — neither of which
requires scrolling or a click.

**4. Reconcile's destructive keys need intent.** `r` rejected irreversibly on
one unguarded press and was not in the legend; `Enter` confirmed instantly.
Reject now arms on the first press and commits on the second, relabelling in
between; `Enter` focuses the confirm button rather than firing it. The focus
guard checked `INPUT`/`TEXTAREA` only, so a focused button — which is what you
have immediately after clicking any action — let every shortcut through; it now
also covers `SELECT`, `BUTTON`, `A`, anything `contenteditable`, and any
modifier chord. Every bound key is in the legend.

*Deviation, noted:* the legend's reject entry reads `R ×2` rather than
`R Reject ×2`. `reconcile.test.tsx:150` asserts that "Reject" resolves to
exactly one element, and the Reject button sits directly below the legend and
names the action. The key and its double-press are both disclosed.

**5. Reconcile's queue stops moving under the cursor.** The list re-sorted on
every 3-second refetch, so an ingest mid-review reordered rows while the
planner was reading one. Order is frozen for the duration of a selection, with
new arrivals appended rather than inserted; the true sort resumes when nothing
is selected.

**6. Queue Clear reads as success and leads somewhere.** It was a `Check` icon
in `text-hair` — the lowest-contrast token in the palette — over mono uppercase
`tracking-widest`, which read as a crash. It is the accent treatment now, keeps
the panel chrome, and offers the schedule row the last confirm actually wrote.
That link is also in the action bar after every resolve: the write used to be
two navigations and a search away from the click that caused it.

**7. Ingest's dead ends are links.** `AUTO_LINK` rows deep-linked to Schedule
while "Sent to review" rows — the ones that need a human — returned a plain
span. They link to `/reconcile?event=<linked_event_id>`, which Reconcile
resolves against the queue. `TRACE_BEAT` drops 550 -> 130ms: the stagger put
1.65s of manufactured delay on the one moment the screen exists for, and by its
own comment the data was already complete before the first line rendered. The
review count is now a figure with a Reconcile button rather than prose inside
the MATCHED line.

**8. Schedule tells the truth about export.** It writes server-side and
triggers no browser download; the button said "Wrote <name>" in success green
and never cleared. `ExportResponse.download_url` is `/uploads/{filename}`
(`main.py:2229`) but **nothing serves that path** — no static mount, no
download route — so there is no URL to send the browser to. Relabelled "Saved
on server: <name>", with the full explanation on hover, and it clears after 6s.
A real download needs that route; that is a second backend gap.

**9. Schedule's table stops jumping, and planned rows become readable.**
`scrollIntoView` depended on `[selectedId, data]` and `data` refetches every
three seconds, so any change anywhere in the payload re-centred the table under
the open drawer; it depends on `selectedId` alone now. Planned-only rows were
`text-muted opacity-55`, compositing to about 2.9:1 on white — under the 4.5:1
the palette claims. `text-muted` at full opacity is 9.4:1 and still reads as
secondary. `model_version` is off the audit entries: no planner decision turns
on it. Each entry now names the event that caused the write, from
`AuditRecordResponse.linked_event_id`.

**10. The field surface is a phone, and is drawn as one.** `MobileShell` had no
max-width, so the Planner|Field toggle stretched a 96px microphone and 16px
body copy across 1920px on a projector. Capped at 520px and centred with the
page ground behind it. `NeedsYourResponse` reserves its height so the lower
half of the screen no longer jumps as its query settles.

**11. Field.tsx is one route, seven stage components.** It was 1000 lines with
all seven stages inline. The route component keeps **all** state and every
handler and passes them down; the stages are presentational. Behaviour is
unchanged and the 41 field/speech/state tests pass untouched. Now 391 lines
plus `pages/field/{shared,StructuredCard,FallbackStates,ContextBlock,TextInput,IdleStage,ListeningStage,TranscriptStage,ConversationStage,SubmittedStage}.tsx`.
The dead `myUpdates` and `clarificationCount` derivations went with it — they
were computed and never rendered. The `['reviewQueue']` query itself is kept so
the split changes no network behaviour.

**12. One speech language, one list.** `lang` lived in per-instance `useState`,
so Profile's picker changed nothing about /field's microphone and every
Clarifications card ran its own recogniser defaulting back to `en-IN`. It is a
module-level value with subscribers — one preference, browser-session scoped,
never sent to the server. `SPEECH_LANGUAGES` (EN/हि/অস) and `LANGUAGES`
(English/Hindi/Assamese) were two lists for three languages; there is now one,
`config.LANGUAGES`, and the compact header chips use its `short` form while
Profile uses `label`.

**13. Shell: no title flash, no double scrollbars.** `usePageHeader` cleared on
unmount, and React runs the outgoing cleanup before the incoming effect, so
every navigation had a frame with no header that fell back to the nav label —
visible on Home as "Home" -> "Project Control". The header now carries the path
it belongs to, publishes in `useLayoutEffect` (before paint), and does not
clear; the shell ignores a header whose path is not the current route, which
keeps the protection against a route inheriting the previous title. Home,
Ingest and Memory each wrapped themselves in `h-full overflow-y-auto` inside an
already-scrolling `<main>`; the inner container is gone from all three.

**14. Home's proof-of-write panels poll.** `['conflicts']` and `['auditRecent']`
were absent from the refetch list, so after an ingest the tiles ticked over
while Recent Activity and Source Conflicts — the two panels that prove a write
happened — stayed frozen until the route remounted. Both are in the list now.

### Visual language

No one-off styles were reintroduced: the type scale is still six steps, radii
three, padding and gap the six-step scale plus the two documented functional
offsets (`pb-24`, `pr-12`), and every new control is the `Button` primitive.
Verified by grep after the change.

Deviations from the Stitch language, each a named failure in the brief:
Home loses its variance chart; Reconcile loses the metadata grid and gains a
two-column reasoning band; Queue Clear changes from mono-uppercase-on-hairline
to the accent success treatment; Schedule's planned rows lose `opacity-55`; the
field surface is centred at 520px instead of full-bleed; Reconcile's "Suggested"
badge is `text-accent` rather than `text-warn`, because `warn` means "medium
confidence" on the `ConfidenceBadge` inches away and the top match is not a
warning (this closes the status-colour inconsistency reported in D-030).

### Verification

`tsc --noEmit` clean, including under `--noUnusedLocals --noUnusedParameters`.
`vite build` succeeds. Frontend tests **52 passed / 3 failed — the pre-existing
baseline**, unchanged: the three are `field.test.tsx > profile` failing on
`localStorage` being undefined in `useDevice.ts:20` under jsdom. No test was
modified.

### Affected Areas
`frontend/src/App.tsx` · `hooks/usePageHeader.ts` · `hooks/useSpeech.ts` ·
`main.tsx` · `types.ts` · `components/MatchReasoning.tsx` (new) ·
`components/FieldContextBlocks.tsx` ·
`pages/{Home,Ingest,Reconcile,Schedule,Memory,Field,FieldReports,FieldClarifications}.tsx` ·
`pages/field/*` (new, 10 files)

### Backend work this pass identified and did NOT do
1. `GET /review-queue` must project `rationale`, `margin`, `match_method` —
   three lines in `main.py:1266` plus three fields in `schemas.py:80`.
2. `alternatives` must carry a per-candidate score for "why 1 beat 2" to be
   answerable at all.
3. `/uploads/{filename}` needs a route or static mount, or
   `ExportResponse.download_url` should be dropped as unusable.

---

## 2026-09-01 / D-040 — Recall is reported at the depth the planner is shown, and a CSV upload now fails loudly

### Status
Implemented. Part 1 is pure measurement and changes no matching behaviour.
Part 2 closes one of the four defects recorded as open in D-037.

### Context
**Part 1.** `METRICS.md` published Recall@20 = 100.0% (185/185) on the v2
held-out split. That is a true retrieval number and a misleading product number,
because no planner ever sees twenty candidates. Review-item alternatives are
stored as `decision.candidates[:3]` at three call sites — `server/main.py:443`,
`:1052` and `:3188` — and the Reconcile screen builds its list as the
de-duplicated `[suggested_activity_id, ...alternatives]`
(the `candidates` useMemo in `frontend/src/pages/Reconcile.tsx`; cited by
symbol because that file is being restructured under a parallel task). Since `Decision.top1` *is*
`candidates[0]` (`matching/models.py:96`), the suggested id collapses into the
first alternative: **the planner is shown exactly three distinct activities.**
The retrieval ceiling of 20 is `top_k` (`matching/config.py:34`), consumed at
`matching/retrieval.py:401`.

This matters because of D-024. Near-miss top-1 is 26.5% and all 68 near-miss
mentions route to REVIEW. The project's position is that this is correct
behaviour on text whose discriminator was deleted, not a defect — but that
position only holds if the gold activity is inside the list the planner is
actually offered. Recall@20 cannot establish that. Recall@3 can.

**Part 2.** `extraction/extractor.py:588` records "CSV extraction not yet
implemented" in `result.errors`, and `server/main.py` never read that list, so a
`.csv` upload — an accepted suffix at `main.py:949` — returned HTTP 200 with
"Extracted 0 events". On stage that looks like a broken app.

### Decision
Report recall@k for k = 1, 3, 5, 10, 20, split Overall / Near-miss only / All
the rest, in its own table beside the near-miss output, on both the held-out and
the pooled `--cv` path. A candidate list shorter than k counts as a miss, not a
skip. Publish Recall@3 as the planner-facing figure and demote Recall@20 to a
labelled retrieval ceiling.

On ingest, an extraction that produced **no events and reported an error** is a
failure: HTTP 400 naming the file and the extractor's own reason, with the job
row marked `failed` and `error_message` set. Errors alongside a *non-empty*
extraction are appended to the success message instead, so a partial read keeps
its good events without discarding the reader's complaint.

### Reason
Recall@3 is materially below Recall@20 and the gap is entirely near-misses:

| split | n | R@1 | R@3 | R@5 | R@10 | R@20 |
|---|---:|---:|---:|---:|---:|---:|
| v2 held-out, overall | 185 | 71.4% | **88.1%** | 95.1% | 99.5% | 100.0% |
| v2 held-out, near-miss | 68 | 26.5% | **67.6%** | 86.8% | 98.5% | 100.0% |
| v2 held-out, the rest | 117 | 97.4% | 100.0% | 100.0% | 100.0% | 100.0% |
| v2 pooled out-of-fold | 744 | 82.1% | **91.9%** | 96.0% | 99.7% | 100.0% |
| v1 production/demo | 242 | 87.2% | **96.7%** | 98.3% | 100.0% | 100.0% |

So D-024's defence of the 26.5% survives only in weakened form. On non-near-miss
text the planner's three-item list contains the gold activity **100%** of the
time. On near-misses it contains it **67.6%** of the time — meaning on roughly a
third of exactly the cases the system routes to a human, the human is not shown
the right answer and must fall back to search/reassign. That is a real limit and
is now written down as one rather than being hidden behind Recall@20.

Recall@k is a property of the ranked list, not of the thresholds, so it is
unaffected by the median-threshold problem corrected in D-037, and R@1
reproduces the published top-1 exactly in all three configurations (87.2 / 71.4
/ 82.1) — the cross-check that the implementation is right.

The zero-event-with-no-error case was deliberately **left alone**: the Ingest
screen already names that outcome explicitly (the zero-event panel in `Ingest.tsx`, "The file
parsed without error, but nothing in it matched a reportable progress
statement"). Turning it into an HTTP error would delete a working, deliberate
affordance and would require a frontend change, which is out of scope while
Codex holds `frontend/`.

### Verification
- `python eval.py` — 87.2 / 50.4 / 100.0 / 8.3, unchanged. Auto-link precision
  still 100.0%.
- `python eval.py --cv` — clean, reports the new table (pooled out-of-fold).
- v2 held-out and v2 `--cv` runs produce the table above.
- `python -m pytest -q` — 585 passed (583 + 2 new ingest tests).
- Nothing under `frontend/` modified.

### Affected Areas
`eval.py` (`recall_at_k`, `print_recall_at_k`, `RECALL_KS`, `PLANNER_K`, wired
into `main()`), `server/main.py` (ingest surfaces `result.errors`),
`server/test_server.py`, `METRICS.md` (§1 definitions, §3.2, §3.3, §8),
`DECISIONS.md`. No change to `matching/`, `extraction/` or `frontend/`.

---

## 2026-09-01 / D-041 — Projector legibility: conflicts above the fold, and a banner that reads as detection

### Status
Implemented. Presentation-only. No data path, query, computation, or token was
touched; every figure on screen is byte-identical to before.

> D-040 is the recall@k work landed immediately before this entry on branch
> `feat/recall-at-k`, so this entry takes D-041 to avoid a
> collision when both land.

### Context
Three changes made for the 4 Sep demo, which runs on a 1280×800 projector.

Source conflicts is the project's differentiator and rendered last on Home, so
it sat below the fold. The Schedule integrity banner read "91 integrity
warnings", which a judge parses as "91 things are broken" when the number is in
fact the system *detecting* problems other tools miss. And the sidebar `<h1>`
carried `truncate` at `text-h3` in a 240px column, clipping the real project
name to "OIL Well-Site Duliaj…".

### Decision
- Home: the `Source conflicts` panel moves from last to directly beneath the
  KPI tiles; the ROW comments renumber to match. Pure block move — no JSX,
  `className`, `span`, or hook order changed.
- Schedule: the banner reads `{warnings.length} items flagged for review`, and
  `AlertTriangle` is replaced by `ListFilter` at the same `size={12}` with the
  same `onlyFlagged ? 'text-danger' : 'text-warn'` expression. `AlertTriangle`
  had no other use in the file and was dropped from the import. The breakdown
  text, `onClick`, filter styling, and "Click to filter" label are unchanged.
- App: the sidebar `<h1>` swaps `truncate`/`leading-7` for
  `line-clamp-2`/`leading-tight`, so the name wraps to at most two lines. The
  `PLANNER_ROLE` `<p>` beneath it keeps `truncate`, and the mobile/field header
  is untouched.

### Reason
"Integrity warnings" names the finding as a defect in NAVIS; "items flagged for
review" names it as a detection, which is what it is and what the demo argues.
The colour logic is deliberately left alone — the danger/warn distinction still
carries the severity, only the noun changed.

### Verification
- `npm run lint` (`tsc --noEmit`) — clean.
- `npm test` — 55/55, five consecutive runs. No test was modified: nothing
  asserted on the old banner string or panel order. One flake was observed in
  `src/test/reconcile.test.tsx:103` (a `findByPlaceholderText` race in a file
  this change does not touch); it does not reproduce on this branch or on a
  clean `origin/main`.
- `npm run build` — succeeds; 464.53 kB JS / 24.74 kB CSS.
- Browser at 1280×800, both themes, Home and Schedule: tiles read
  120 / 67 / 135 / 38 and the conflicts badge reads 18, unchanged. Tiles and the
  Source Conflicts table are both visible without scrolling. The banner reads
  "91 items flagged for review — 68 source conflicts, 23 date warnings" and
  clicking it still filters to 53 of 120. `line-clamp-2` measured at 25px for
  one line and 50px for two, with the sidebar holding 240px and no horizontal
  overflow.

### Affected Areas
`frontend/src/pages/Home.tsx`, `frontend/src/pages/Schedule.tsx`,
`frontend/src/App.tsx`, `DECISIONS.md`. No change to `server/`, `matching/`,
`extraction/`, `eval.py`, or `index.css`. No dependency added.

### Not done
The requested "collapse the four empty Schedule Health rows" change has no
target on `origin/main`: commit `e7a849c` removed the `ScheduleHealth` component
and its panel from `Home.tsx` entirely. See the task report for detail.

---

## 2026-09-01 / D-042 - The review queue projects the matcher's reasoning, and every candidate carries its own score

### Status
Implemented. Both parts. Nothing blocked.

### Part 1 - the three missing fields

`match_method`, `margin` and `rationale` are persisted on `LinkedEvent`
(`db.py` 266/269/270) and were already projected onto `LinkedEventResponse`
for `GET /jobs/{id}`. `ReviewQueueItemResponse` did not carry them, so the
Reconcile screen — the one place a planner adjudicates a match — had no
reasoning to show. Added to the schema and populated in `get_review_queue`
from the same `le` object the endpoint already loads.

Projection only. No value is computed, rounded differently, or altered.

### Part 2 - per-candidate scores: they exist, and they were being discarded

**Investigated before changing anything. The finding is that the matcher
already computes a full score for every candidate it ranks.**

`matching/engine.py:177-190` builds a `LinkCandidate` for **every** retrieved
id, then sorts and ranks them:

```
scored = [LinkCandidate(activity_id=..., retrieval_sources=...,
                        rrf_score=..., features=fvs[r], final_score=final[r])
          for r, i in enumerate(cand_ids)]
scored.sort(key=lambda c: (-c.final_score, c.activity_id))
for rank, c in enumerate(scored, 1):
    c.rank = rank
```

So `final_score`, `features`, `rrf_score`, `retrieval_sources` and `rank` are
populated per candidate, not for the winner only. `LinkCandidate`
(`matching/models.py:72-78`) is the carrier.

**They were discarded at `server/main.py:1052`:**

```
alternatives=json.dumps([c.activity_id for c in decision.candidates[:3]]),
```

Everything except the id was thrown away at serialisation. That single
comprehension is why ranks 2+ had no score.

**What changed.** The same three candidates are serialised with the score the
engine already gave them, their rank, and their own rationale. The column now
holds objects instead of bare ids; `LinkedEvent.alternative_candidates()` reads
both shapes so rows written before this change still work, and
`alternative_list()` is kept as the id-only view its existing callers
(`LinkedEventResponse`, the agent slot state) expect. No migration: the column
was already free-form JSON.

**Per-candidate rationale.** `matching/engine.py:_rationale(c)` is a pure
function of one candidate's own `features` and `retrieval_sources`. The engine
already calls it on the top candidate (`engine.py:337`); it is now called on
each of the three. That is the same code path on the same object, not a
reimplementation that could drift, and it changes no decision, threshold, score
or ranking. `matching/` was not modified — the function is imported.

Note the two rationales are different things and are kept separate:
`LinkedEvent.rationale` is **decision-level** and can carry decision reasons
(`below_tau_low`, `margin_too_small`); each candidate's rationale is the
evidence for that candidate alone. Both are exposed; the UI labels them
distinctly.

**Description** is resolved at read time from the `Activity` table in one
batched query, not stored, so a baseline re-import cannot leave a stale
description on a queued item.

### Verified end to end

Ingesting a two-line report through `POST /ingest` and reading
`GET /review-queue`:

```
match_method: 'hybrid'   margin: 0.009237
decision rationale: ['discipline_match','within_planned_window','margin_too_small']
alternatives:
  rank 1  PIP-INS-1045  0.681346  ['discipline_match','within_planned_window']
  rank 2  PIP-ERC-1030  0.672109  ['discipline_match','high_embedding_similarity']
  rank 3  PIP-ERC-1034  0.666958  ['discipline_match','high_embedding_similarity']
```

0.681346 - 0.672109 = 0.009237, which is the reported margin. "Why did 1 beat
2" is answerable from the response: both matched the discipline, but rank 1 sat
inside the planned window where rank 2 rested on embedding similarity.

### Part 3 - frontend

`MatchReasoning` renders real values; the "this endpoint does not supply
rationale" fallback is deleted. Candidate cards show each candidate's own
score and its own signals — never the top candidate's number. A candidate with
no score of its own (a row ingested before this change) still says "no score
sent" rather than borrowing one.

`ReviewItem.alternatives` is typed `Array<ReviewCandidate | string>` and
normalised through `toCandidates()`. Every read goes through that normaliser:
the auto-select effect briefly indexed `alternatives` directly, which put a
`ReviewCandidate` object into a `string | null` state and would have posted
`[object Object]` as the `activity_id` on confirm for any item the matcher
proposed no activity for. `tsconfig.json` does not set `strict`, so the
compiler did not reject it; it is fixed and there is no raw indexing of
`alternatives` left in `src/`. The union mirrors the server's own
tolerance for legacy rows; it is also what keeps `reconcile.test.tsx`'s fixture
compiling, and no test was modified. `rationale`/`margin`/`match_method` are
optional on the client — the endpoint always sends them, but an older server
would not, and the screen degrades instead of rendering `undefined`.

No new one-off styles: existing primitives and the six-step scales only.

### Verification

- Backend, server suite: **181 passed, 1 failed.** The failure is
  `test_server.py::TestCrossDPRStatistics::test_ground_truth_coverage`, a
  `UnicodeDecodeError` reading `dataset/ground_truth.csv`. Confirmed
  pre-existing by stashing this change and re-running: it fails identically.
- Backend, whole tree: 461 passed, 5 failed. The other four are the same
  ground-truth decode issue in `extraction/test_extractor.py` and three in
  `extraction/test_prepass_defects.py`, a test file that does not belong to
  this change and was added to the working tree by another person's
  in-progress work during this session.
- Collected count is 466, not the 547 quoted in the task. The tree collects
  466 with the other person's new file present, 455 without it. `CLAUDE.md`
  still says 264. The 547 figure does not correspond to this tree.
- Frontend: `tsc --noEmit` clean; **52 passed / 3 failed**, the pre-existing
  `useDevice` localStorage baseline, unchanged. No test modified.

### Affected Areas
`server/schemas.py` (`ReviewCandidate` new, three fields on
`ReviewQueueItemResponse`) · `server/db.py` (`alternative_candidates()` new,
`alternative_list()` now shape-tolerant) · `server/main.py` (candidate
serialisation at ingest, review-queue projection, `_rationale` import) ·
`frontend/src/types.ts` · `frontend/src/components/MatchReasoning.tsx` ·
`frontend/src/pages/Reconcile.tsx`

Supersedes the blocker recorded in D-039, which is now closed.

---


---

## 2026-09-01 / D-043 — The product fonts ship with the frontend

> Recovered. This work was originally written as D-039 on a branch that was
> never merged; `origin/main` independently reused D-039 for the Tier 1
> restructure, and D-042 was then taken on main by the review-queue reasoning
> entry, so this is renumbered D-043 and re-applied here.

### Status
Implemented. Presentation-layer only; no component structure, state, props, or
behaviour changed.

### Context
D-030 correctly prohibited a runtime font fetch because the demo must work on
a venue projector without internet. It concluded that the sans stack should
name only system fonts after noting that the declared Inter face had never
actually been loaded. That conclusion made the interface dependable but left
it rendering in Helvetica or Arial, while the existing `font-mono` utilities
also had no bundled face behind them.

The six-step type scale from D-030 is already adopted in the current JSX. A
fresh scan found no live bracketed pixel-size utility in a `className`; the
only `text-[15px]` match is the explanatory example in `index.css`. The scale's
11px dense-chrome values are therefore already folded into `text-label` at
12px. No element needed an 11px exemption in this pass.

### Decision
Supersede D-030's system-font conclusion while preserving its offline
constraint. Bundle the variable Inter and JetBrains Mono packages through
`@fontsource`, import their package CSS before application imports, and bind
the verified family names `Inter Variable` and `JetBrains Mono Variable` to
the existing Tailwind `--font-sans` and `--font-mono` tokens. The installed
5.3.0 packages expose no latin-only stylesheet, so the package-root stylesheet
is the supported fallback; its unicode ranges ensure the browser loads the
latin face for the demo content.

Use the existing `tabular-nums` utility on Home metrics, Schedule date and
numeric cells, Memory tables, and confidence badges. Keep the full system-font
fallback chains for both families.

### Reason
The font files now travel inside `dist/` with the application. The browser
does not fetch Google Fonts or any other CDN, so the presentation is stable
without an internet connection while matching the type choices already named
throughout the UI. Tabular figures keep changing values aligned in dense rows.

### Alternatives Considered
- Keep the system-only stack from D-030. Rejected because it preserves offline
  operation but never renders the intended faces.
- Add Google Fonts links or a CSS URL import. Rejected because either creates
  the exact runtime network dependency D-030 prohibited.
- Hand-write latin-only `@font-face` rules against package internals. Rejected
  because neither package exposes a supported latin-only stylesheet and the
  package-root import keeps ownership with `@fontsource`.
- Introduce a seventh 11px size for dense chrome. Rejected because the existing
  six-step scale deliberately maps 11px to the 12px `text-label` token, and no
  current element requires an exemption.

### Verification
- `npm run lint` — clean (`tsc --noEmit`).
- `npm test` — 4 files and all 55 tests passed.
- `npm run build` — succeeded; `dist/` grew from 483,551 bytes (3 files) to
  793,494 bytes (15 files), a 309,943-byte increase for the bundled fonts and
  generated CSS.
- `dist/assets/` contains 12 `.woff2` files. A built-output scan for
  `fonts.googleapis`, `fonts.gstatic`, and `@import url` returned no matches.
- The production preview loaded Inter and JetBrains Mono from local
  `127.0.0.1` assets; computed styles reported the intended variable family
  names and no browser warnings or errors.
- Home, Reconcile, Schedule, Memory, and the Field view were checked in light
  and dark themes. Reconcile's queue, Schedule's single-line headers, both
  Memory tables, and the Field chrome at 390x844 showed no new wrapping,
  clipping, or document scrollbar. Schedule retains its intentional table
  scroller and existing description truncation.

### Affected Areas
`frontend/package.json`, `frontend/package-lock.json`, `frontend/src/main.tsx`,
`frontend/src/index.css`, the requested numeric displays in `frontend/src`, and
`DECISIONS.md`. No server, matcher, extraction, or dataset code changed.

---

## 2026-09-02 / D-044 - Exports are downloadable; the advertised URL is no longer dead

### Status
Implemented. Closes the third and last gap listed in D-039.

### Context
`ExportResponse.download_url` has returned `/uploads/{filename}` since exports
were built (`server/main.py`, `export_schedule`). Exports are written to
`dataset/uploads/`. **No route ever served that directory** - there is no static
mount and no handler - so every Export in the UI produced a link that 404s. The
frontend had already been reworded to "Saved on server" (D-039) precisely
because the download did not exist.

### Decision
Add `GET /uploads/{filename}`, returning the file as an attachment. The
alternative the pipeline allowed - dropping `download_url` - was rejected
because a working download is what a judge expects when a button says Export,
and the endpoint is a dozen lines.

### Reason - the filename is hostile input
It arrives from the URL, so it is validated rather than trusted:

- rejected outright if it contains `/`, `\` or `..`, or is `.`/`..`, or is not
  equal to its own `Path(...).name`, or is absolute. A name is a name, never a
  path.
- the candidate is `resolve()`d and must still be inside the resolved uploads
  directory. Doing the containment check *after* resolution is what catches a
  symlink pointing outside it; checking before would not.
- only known export extensions are served (`.xml`, `.xer`). A file that reaches
  that directory by some other route cannot be pulled out through this one.
- a missing file is a 404, never a 500 and never a stack trace.

### Verification
`server/test_server.py::TestExportDownload`, 10 tests: a written PMXML export
round-trips through its own `download_url` with `Content-Disposition:
attachment`; an XER export likewise; a missing file 404s; five traversal forms
(`../../server/main.py`, percent-encoded, doubled `....//`, a subdirectory, a
bare `..`) are refused and never return source; an absolute `/etc/passwd`
attempt is refused; a planted `.txt` in the uploads directory is refused and its
contents do not appear in the response.

Full suite unchanged otherwise; `eval.py` output byte-identical to baseline.

### Affected Areas
`server/main.py` (`download_export`, `_DOWNLOADABLE`, `FileResponse` import),
`server/test_server.py`. No frontend change was made. **Frontend note:** the
Schedule export control can now link to `download_url` directly instead of
saying "Saved on server"; that edit is the frontend agent's.
## 2026-09-02 / D-045 - The committed corpus is UTF-8, and the generator can no longer write anything else

### Status
Implemented. Takes the suite from 436 passed / 2 failed to **438 passed / 0
failed** - the first fully green run in the project's history.

### Context
Two tests had been failing for an unknown length of time:

```
extraction/test_extractor.py::TestGroundTruthAlignment::test_ground_truth_loadable
server/test_server.py::TestCrossDPRStatistics::test_ground_truth_coverage
UnicodeDecodeError: 'utf-8' codec can't decode byte 0x97 in position 15056
```

`0x97` is the cp1252 em-dash. It is not valid UTF-8 at any position.

Scanning every tracked text file found **12** affected, not one:
`dataset/ground_truth.csv`, all ten `dataset/dpr_day_01..10.txt`, and
`research/bench/ABLATION_RESULTS.txt`. 87 occurrences in the ground truth alone.
**The ten DPR files are the demo's own input documents.**

Root cause is three writes in `generate_all.py` with no `encoding=` argument
(lines 161, 770, 916). Python then uses the platform default, which on the
machine that generated the corpus was cp1252.

The repository had already met this bug and fixed it in two places without
fixing the cause:

- `extraction/textio.py` exists solely to decode source documents through an
  explicit cascade, and its docstring describes this exact byte (D-010).
- `eval.py::_open_ground_truth` carries its own cascade and a comment saying
  "the v1 key is cp1252, the v2 key is UTF-8".

Meanwhile `matching/test_providers.py` hardcoded `encoding="cp1252"` to work
around it, and the two failing tests used a bare `open()`. So the same file was
being read as cp1252 in one place, UTF-8 in another, and through a cascade in a
third. That is not a test problem; it is a corpus problem.

### Decision
1. Re-encode the eleven `dataset/` files from cp1252 to UTF-8.
2. Name `encoding="utf-8"` on all three writes in `generate_all.py`, with the
   reason stated once in the module docstring.
3. Replace the `cp1252` workaround in `matching/test_providers.py` with an
   explicit `utf-8`.

`research/bench/ABLATION_RESULTS.txt` is **left alone**: `research/` is outside
this agent's lane and another agent has uncommitted work there. It is a results
artifact no code reads. Flagged, not touched.

### Reason - why re-encode rather than teach every reader a cascade
`textio.py`'s cascade is right for *ingested* documents, which arrive from the
outside in whatever encoding a site produced. It is the wrong answer for files
this repository generates and commits: those have one correct encoding and the
generator should emit it. Adding a fourth cascade would have made the
inconsistency permanent.

### Verification - nothing was regenerated
The conversion decodes cp1252 and re-encodes UTF-8. No generator was run, so no
label, mention or activity id could move. Proven mechanically: for all eleven
files, `git show HEAD:<path>.decode("cp1252")` equals the new file decoded as
UTF-8, character for character.

- `python eval.py` **byte-identical** to the pre-change capture. All four
  headline figures unchanged: Top-1 87.2%, Coverage 50.4%, Auto-link precision
  100.0%, NO_MATCH rejection 8.3%.
- `pytest -q`: **438 passed, 0 failed** (was 436 passed, 2 failed).
- **Neither failing test was modified.** They pass because the data they read is
  now valid. That is the distinction between fixing a defect and silencing one.

### Affected Areas
`dataset/ground_truth.csv`, `dataset/dpr_day_01..10.txt` (re-encoded, content
identical), `generate_all.py` (three writes + docstring),
`matching/test_providers.py` (workaround removed). No frontend change.
## 2026-09-02 / D-046 - Schedule-side EVM, and why its headline SPI is flagged unsafe on this dataset

### Status
Implemented, with the whole-project SPI **deliberately marked not safe to
display as a KPI**. Read the diagnosis below before using the number.

### Context
ROADMAP §5 / §14 MUST #4. `GET /evm` returns PV, EV, SV and SPI for the project
and per discipline, computed on read. No new table, no migration, no dependency,
no LLM anywhere in the path.

### Decisions
**Duration weighting.** `weight = (planned_finish - planned_start).days + 1`,
minimum 1. Not `planned_qty`: 66 of the 120 baseline activities have no
quantity, and quantity-weighting would silently drop more than half the schedule.

**Percent complete has three rules, in order:** `actual_finish` set -> 100%;
else `max(LinkedEvent.percentage)`; else 0%. `Activity` has no
`percent_complete` column - it is derived here exactly as `get_schedule` derives
it. Rule 3 is a floor, never an estimate.

**SPI is `None` when PV is 0**, never `0.0` and never a ZeroDivisionError.

**No cost half.** No AC, CV, CPI, EAC, VAC or TCPI. No ingested source carries
cost or man-hours. `cost_metrics_available: false` ships with a reason string so
the limitation is data, not an absence the reader has to notice.

### The diagnosis the pipeline asked for
The pipeline's sanity check was: *"for 120 activities with 38 complete, if SPI is
above 1.5 or below 0.2, do not ship it - diagnose and say so."*

**Measured whole-project SPI: 0.1783. That is below 0.2, so it is not shipped as
a headline.** The premise was also wrong: **1 activity is complete, not 38.**
D-008 withholds `actual_finish` unless a source names the date at 100% scope, and
`eval.py` reports ten complete nodes with their finish withheld for exactly that
reason.

Measured on the demo corpus (120 activities, all ten DPRs ingested):

| | PV | EV | SV | SPI |
|---|---:|---:|---:|---:|
| whole project | 1285.0 | 229.1 | -1055.9 | **0.1783** |
| evidenced subset | 300.0 | 229.1 | -70.9 | **0.7638** |

`percent_source_counts`: `actual_finish` 1, `linked_event_percentage` 29,
`no_evidence_floor` **90**.

The arithmetic is correct and the whole-project figure is still misleading. PV is
charged across every activity the baseline says should be underway; EV can only
be earned by an activity that reported something. Ten daily reports mention 30 of
120 activities, so 90 activities carry full PV and can earn no EV. **0.1783
measures reporting coverage, not schedule performance.**

### What was built instead of suppressing it
Three additional fields, so the number cannot be misread:

- `evidence_coverage` - weight and activity counts with evidence vs total
  (**24.1% of schedule weight, 30 of 120 activities**).
- `spi_headline_safe: false` plus `spi_headline_reason` - an explicit
  instruction not to print `project.spi` as a KPI, with the arithmetic reason.
  Threshold `HEADLINE_COVERAGE_MIN = 0.60`, named and justified in the module.
- `evidenced_subset` - the same arithmetic over activities that reported
  something. **SPI 0.7638**, which sits inside the sanity band and is the
  defensible figure: of the work we can see, it is running at 76% of plan.

Nothing is estimated. It is one arithmetic over a stated subset, plus a flag
saying which figure is safe.

### Verification
`server/test_evm.py`, 19 tests. PV/EV/SV/SPI asserted to the decimal against a
hand-computed four-activity fixture with the arithmetic written out in the
docstring; pro-rata PV for an activity straddling the data date; PV=0 -> SPI is
`None`; `actual_finish` beating a lower event percentage; highest event
percentage winning; no events -> 0 and counted as a floor; per-discipline totals
reconciling to the project; the response asserted to contain **no** cost key
against an explicit forbidden set; and three tests on the coverage guard.

`eval.py` byte-identical to baseline. `pytest -q`: 455 passed, 2 failed - the two
failures are the `dataset/ground_truth.csv` encoding defect fixed on
`fix/dataset-encoding`, which is not in this branch's ancestry.

### Affected Areas
`server/evm.py` (new), `server/main.py` (`GET /evm`, one import),
`server/test_evm.py` (new). No frontend change.

**Frontend note:** do not bind an SPI gauge to `project.spi` while
`spi_headline_safe` is false. Bind to `evidenced_subset.spi` and render
`evidence_coverage` beside it, or the dashboard will state that the project is
82% behind when the truth is that three quarters of it has not reported.
## 2026-09-02 / D-047 - Primavera PMXML and XER are read, not just written; FINDINGS F3 closed

### Status
Implemented. Closes **FINDINGS.md F3**, the only "MISSING" row in
`research/PS_ANALYSIS.md` that is both in the backend's lane and not explicitly
excluded by the user.

### Context
The problem statement names Primavera exports as an **input**. This system only
ever wrote them: `POST /schedule/export` produces PMXML and XER, while
`PmxmlScheduleProvider` and `PrimaveraXerScheduleProvider` raised
`NotImplementedError`, and `POST /schedule/import` accepted `.json` only - its
own error message said so.

Three separate research documents converge on this as the top gap:
`research/NAVIS_TECHNICAL_AUDIT.md` ("Input: Primavera PMXML / XER import -
NOT FOUND"), `research/PS_ANALYSIS.md` ("MISSING - baseline is hand-written
JSON; PMXML/XER exist as export only"), and FINDINGS F3.

### Decision
New module `matching/primavera.py` with `parse_pmxml` and `parse_xer`; the two
stub providers now delegate to it; `POST /schedule/import` accepts `.xml` and
`.xer` alongside `.json`.

**Pure standard library.** `xml.etree` and string splitting, nothing else.

**MPXJ and `.mpp` were considered and rejected.** MPXJ is a Java library
requiring a JVM on the machine, which breaks the offline guarantee this project
rests on; `.mpp` is a compiled binary with no pure-Python reader worth trusting.
The refusal message names MPXJ and the JVM explicitly, and a test asserts it
does, so the next reader does not "fix" the omission.

### Two dialects per format, because our own exporter is not canonical
Each parser reads the canonical Oracle shape **and** the shape this repository
emits, since round-tripping our own export is the first thing anyone will try.

- **PMXML.** Oracle nests scalars as child elements (`<Activity><Id>A1000</Id>`);
  `_generate_pmxml` writes them as attributes with `<StartDate>` children.
- **XER.** A real XER is a table dump - `%T` table, `%F` header, `%R` rows, with
  the baseline in `TASK` and the logic in `TASKPRED`, and `task_code` (not the
  internal `task_id`) as the human activity id. `_generate_xer` writes something
  else entirely: one `T<tab>ACTIVITY<tab>ACT<tab>key<tab>value` line per field.

### Defect found and fixed: our XER export contradicted our PMXML export
`_generate_xer` hardcoded `relationship_type SS` for **every** predecessor while
`_generate_pmxml` wrote `FS` for the same rows. One schedule therefore exported
two different logic networks depending on the format chosen, and the XER one was
simply wrong - a bare predecessor id in the baseline has always meant FS with
zero lag. Changed to `FS`, with a regression test that parses both exports and
asserts the relationships match.

**Still open, reported not fixed:** `_generate_xer` does not emit valid XER and
would not import into P6. Fixing the writer is a larger change than this one and
is not required by the PS, which asks for import. Recorded here so it is not
mistaken for working.

### Safety - the demo baseline cannot be disturbed
`dry_run=true` parses, validates, reports counts, and **writes nothing**: no
activity, no audit row, no baseline version, and the stored copy is removed so
it leaves no trace on disk either. That is what an upload screen should call
first. The existing guards are unchanged: a commit over an active baseline, or
over colliding ids, is refused with 409 unless `replace=true`.

A malformed file raises `ScheduleParseError` naming the file and the reason. A
file that parses to **zero activities is an error**, never a 200 with an empty
baseline - that is the bug shape D-040 fixed for CSV uploads and it must not
come back through a new door.

### Verification
- `matching/test_primavera.py`, **23 tests**. Two fixtures under
  `dataset/fixtures/` written in the **canonical Oracle shapes**, so the parsers
  are proven against something resembling a real P6 export rather than only
  against their own round trip. Both describe the same three activities, which
  lets one test assert the two formats agree on ids, dates, logic and lag.
  Covers: namespaced elements, `task_code` vs `task_id`, `PR_FS`/`PR_SS` prefix
  stripping, `lag_hr_cnt` 16h -> 2 days at P6's 8h day, WBS resolution from
  `PROJWBS`, and six malformed-input cases.
- `server/test_server.py::TestPrimaveraImport`, **9 tests** - dry run reports
  counts and writes nothing, the 120-activity demo baseline is byte-for-byte
  unchanged after both dry runs, a real commit creates 3 and updates 0, import
  never writes actuals, and MPP/PDF are refused by name.
- `server/test_server.py::TestExportRelationshipConsistency` - the two exporters
  now agree, and 120 activities round-trip through both readers with all 146
  relationships preserved.
- `python eval.py` **byte-identical** to baseline after the change.

### Two existing tests were rewritten, and why that is not silencing them
Both asserted that this feature does **not** exist:

- `matching/test_providers.py::TestUnimplementedProviders::test_stubs_refuse_loudly`
  asserted `NotImplementedError`. Replaced by `TestPrimaveraProviders`, which
  asserts the providers satisfy the contract - and keeps a case proving that a
  file which is not a schedule still refuses loudly.
- `server/test_baseline.py::test_a_non_json_baseline_is_refused` asserted the
  error message contained "PMXML" and "not implemented". Replaced by a test that
  a well-formed XML file with no activities is still refused with a reason that
  names the file, plus a new test that an unsupported extension is still refused
  - so implementing two formats did not open the door to everything.

A third failure was my own doing and was fixed in the code, not the test: I had
generalised "Baseline is not readable JSON" to "not readable", breaking
`test_unreadable_json_is_refused`. The message now carries the format name, so
JSON files still say JSON.

### Affected Areas
`matching/primavera.py` (new), `matching/providers.py` (two stubs implemented via
a shared `_PrimaveraProvider`), `matching/test_primavera.py` (new),
`matching/test_providers.py`, `server/main.py` (import endpoint accepts the two
formats, `dry_run`, XER relationship fix), `server/test_server.py`,
`server/test_baseline.py`, `dataset/fixtures/sample_p6.{xml,xer}` (new).
No frontend change.

**Frontend note - the intake upload UI:** `POST /schedule/import`, multipart,
field `file`, extensions `.json` `.xml` `.xer`. Send `dry_run=true` first and
show `activities_in_file`, `baseline.source_format` and `message`; commit with
`replace=true` only on explicit confirmation. Errors are 400 with a `detail`
naming the file and the reason, or 409 when a baseline is already active.
## 2026-09-02 / D-048 - RAID register: one table, arithmetic exposure, and no candidate commits itself

### Status
Implemented. ROADMAP §14 MUST #2.

### Decision - one typed table, not four
`raid_item` with `kind` in `{risk, issue, action, decision}`. The four kinds
share every structural field - title, owner, status, dates, linked activities,
provenance - and differ only in which optional fields carry a value. Four tables
would have meant four sets of endpoints, four filters and four migrations to
keep in step, for nothing. The risk-only fields (`probability`, `impact_days`,
`exposure`) are null on the other three, and nothing infers them.

`rejected` is a status distinct from `closed`. A risk that was considered and
dismissed is not the same record as one that was mitigated, and a register that
conflates the two cannot be audited.

### Exposure is arithmetic, and is not accepted from the caller
`exposure = probability x impact_days`, computed in `server/raid.py` on every
create and every update. **No LLM is involved at any point** - the same rule
that keeps `rationale` free of model prose (D-003). `POST /raid` and
`PATCH /raid/{id}` do not accept an `exposure` field: sending one is ignored,
so the register cannot carry a figure that does not follow from its own inputs.
Re-scoring a risk recomputes it, so it can never go stale.

**Unscored is `None`, never `0.0`.** A risk with no schedule impact genuinely
scores zero; a risk nobody has assessed has not scored anything. Collapsing the
two would let an unassessed risk sort as though it had been examined and found
harmless. `GET /raid` orders scored items first, then unscored by recency -
it does not sort an unscored item as exposure zero.

### The rule that must hold: a candidate is never auto-committed
`GET /raid/candidates` reads the delay phrases already in
`AuditRecord.source_span` - the same evidence the Memory screen's delay
analysis uses - and returns proposals. **It writes nothing.** An item reaches
the register only through `POST /raid`, mirroring D-009 for dates and ROADMAP §6
for governance artefacts. There is deliberately no confidence above which a
candidate commits itself, because no such threshold would be safe.

Every candidate carries `committed: false` in its own payload, and the envelope
repeats it, so a client cannot mistake a proposal for a stored row.

**Candidates are `issue`, never a scored `risk`.** The delay has already
happened and is recorded, so it is a thing that IS wrong, not a thing that MIGHT
go wrong. Proposals therefore carry no probability and no exposure - inventing a
probability for an event that already occurred is exactly the fabrication this
module exists to avoid. A planner who wants a forward-looking risk raises and
scores one themselves.

### Provenance
`source_kind` / `source_id` name the LinkedEvent, AuditRecord or delay analysis
that raised the item, and `GET /raid/{id}` resolves them at read time into an
`evidence` block. Null for a planner-authored item, and null when the source row
no longer exists - both stated rather than faked.

### Verification
`server/test_raid.py`, **30 tests**. The two governing rules first: proposing
twice leaves the register empty; a candidate reaches it only through POST; a
committed cause is not proposed again; every candidate declares itself
uncommitted; candidates are issues with no probability. Then exposure - the
product, a real zero, `None` for unscored, the API ignoring a supplied value,
and re-scoring recomputing. Then validation (closed sets for kind and status,
probability bounded, and **scoring a non-risk refused rather than silently
dropped** - discarding the number quietly would leave the caller believing it
was stored), filters by kind/status/activity, ordering, provenance round trip,
and lifecycle.

`eval.py` byte-identical to baseline.

### Affected Areas
`server/db.py` (`RaidItem` - a new table, so `create_all` handles it and no
migration is needed), `server/raid.py` (new), `server/schemas.py`,
`server/main.py` (four routes), `server/test_raid.py` (new). No frontend change.

---

## 2026-09-02 / D-049 - Field notifications derived from the audit trail, with no read state and no new table

### Status
Implemented. ROADMAP §14 SHOULD #6; §3.4 calls the loop back to the field the
part almost every competing product omits.

### Context
When a planner approves an update, the supervisor who reported it is never told.
The one piece of feedback that would make reporting feel worth doing never
arrives.

### Decision - derive on read
The audit trail already records what each submission caused: the activity, the
field, the old and new values, and the `linked_event_id` that produced the
write. `GET /field/notifications` is a projection of that. **No notification
table**, nothing new captured, nothing to keep in sync.

Scoping is `LinkedEvent.match_method == FIELD_MATCH_METHOD` - the same predicate
`/field/reports` uses - so the two screens can never disagree about whose work
it is. An ingested DPR is not "your update" and does not appear.

### What is deliberately missing, and why
**There is no per-user read/unread state.** This prototype has no user table to
key it by; login is mock and frontend-only. Storing "seen" would mean inventing
an identity to hang it on, and an unread count nobody can own is a fiction. When
real users exist, that table is the right change. The pipeline invited a
`notification` table "only if genuine per-user read/unread state is needed" -
it is not, yet.

### Day movement is never invented
For an actual-date write the message reports the gap between the date the
supervisor's report established and the baseline planned date; positive is late.
It is **`None`, and the sentence simply stops**, when there is nothing to
compare against - never 0 as a stand-in, because a 0 reads as "measured, and on
plan". `Activity.planned_finish` is NOT NULL, so the reachable case is an audit
row for an activity the current baseline no longer contains; the trail is
append-only (D-004), so a row can outlive the baseline it referenced.

A **rejected** proposal produces no notification, and that falls out of the
design rather than being special-cased: rejecting writes no actual, so no audit
row links back to that event.

### Verification
`server/test_notifications.py`, **13 tests**: +2 days named correctly, a
negative movement for an early finish, "on plan" rather than "0 days late", the
link back to the audit row, auto-applied vs planner-confirmed, a rejected
proposal producing nothing, an empty database returning `[]` rather than an
error, an ingested DPR excluded, a `source_conflict` row excluded, newest first,
and three cases where the movement is null rather than invented.

### Affected Areas
`server/notifications.py` (new), `server/schemas.py` (`FieldNotification`),
`server/main.py` (`GET /field/notifications`), `server/test_notifications.py`
(new). No frontend change.
## 2026-09-02 / D-050 - The Evidence API reports the corpus from its own manifests, caveats included

### Status
Implemented.

### Context
`datasets/real` is 630 MB across 864 tracked files - 124 verified raw artifacts
including 63 PDFs, 18,601 PAIMANA project-month rows, 43,753 CFIHOS records,
3,520 ConstructCIE causal spans, and more. The user's standing position is that
this data should be **surfaced, not swapped**: it is evidence for an Evidence
page, never a replacement for the synthetic 120-activity demo baseline.

### Decision - read the manifests, never the corpus
`GET /evidence/corpus` is built entirely from two files the corpus build already
produced: `manifests/dataset_summary.json` and `reports/validation.json`. **No
raw artifact is opened.** Loading 630 MB per request is not a design, and
re-deriving the counts here would produce a second set of numbers free to
disagree with the first. Read once and cached for the process; the corpus is
static.

Absence is a **404, not a 500**, naming the missing file. The corpus is a large
optional download and its absence is a fact about a checkout, not a server
fault.

### The honesty fields are structured data, not prose
The corpus is genuinely useful and genuinely partial. The partial half has to
travel with it or the Evidence page becomes a marketing slide. Four claims are
easy to overstate, so each ships as its own object with a status, a value, a
detail sentence, and a named boolean refusing the specific overclaim:

| caveat | what it refuses |
|---|---|
| `distinct_schedule_activities` | **27**, not 200-300. `padded_with_synthetic_or_taxonomy: false` - the 1,661 CPWD reference work items are reference rows and are NOT relabelled as schedule activities to make the number look better. |
| `wsdot_ocr_and_hard_negatives_unverified` | `manually_verified: false` - rule-based cross-contract candidates, not gold. |
| `constructcie_labels_are_source_published` | `authored_by_this_project: false` - those 3,520 spans are ConstructCIE's annotations, not ours. |
| `real_and_synthetic_are_separate` | `mixed: false` - real under `datasets/real`, synthetic under `dataset`, and the demo baseline stays synthetic. |

Every value is lifted from the manifest's own `benchmark_target_audit` block, so
this endpoint and the corpus build cannot drift apart. **This project reports
these numbers; it did not author them.**

### Verification
`server/test_evidence.py`, **16 tests**. Counts are asserted *against the
manifest files themselves* rather than against hardcoded figures, so a corpus
rebuild that changes a number fails the test instead of silently disagreeing
with the API. The four caveats are asserted present with their booleans; one
test specifically checks that 1,661 reference rows coexist with 27 activities
without either being confused for the other.

Two tests cover the cost claim: `builtins.open` is monkeypatched for the
duration of a request and **no path under `datasets/real/raw` or `_staging` may
be opened**, and the manifest read is asserted to happen once and be cached.
A final test asserts a missing manifest is a 404 naming the file.

Measured on this checkout: 124 artifacts / 263.6 MB, 1,462 validation checks,
0 errors, 0 warnings, 73 OCR pages marked unverified.

### Affected Areas
`server/evidence.py` (new), `server/schemas.py` (five models),
`server/main.py` (`GET /evidence/corpus`), `server/test_evidence.py` (new).
No frontend change.
## 2026-09-02 / D-051 - eval.py reports calibration, confidence intervals and macro-F1, and the calibration result is mixed

### Status
Implemented, additive. **Every number `eval.py` printed before this change still
prints, unchanged** - verified by asserting all 120 baseline output lines still
appear, in order, in the 166-line output.

### Context
ROADMAP §12. This system's claim is "we know when we don't know": it auto-links
above `tau_high`, asks a planner in the middle, refuses below `tau_low`. That is
only meaningful if the confidence score carries the meaning the thresholds
assume. `eval.py` calibrated *thresholds* but never measured whether the *score*
was calibrated.

### What was added
`evalstats.py` (new, pure functions, no engine dependency) and one
`print_calibration` section in `eval.py`'s existing `title()` / `table()` style:

- **Brier score and Expected Calibration Error**, with a reliability table -
  bin, n, mean confidence, observed accuracy, and the signed gap.
- **Percentile bootstrap 95% CIs** on Top-1, coverage and auto-link precision.
  2000 resamples at a fixed seed, so a quoted interval is reproducible.
- **Macro-F1 alongside micro**, per discipline.

### The measured result, reported as it came out

```
Brier score      : 0.1203
Expected Cal Err : 0.0821

  bin        n   mean conf  observed  gap
  0.5-0.6   16     0.552     0.500   -0.052
  0.6-0.7   24     0.650     0.500   -0.150
  0.7-0.8   76     0.757     0.776   +0.019
  0.8-0.9  115     0.843     0.957   +0.114
  0.9-1.0   18     0.917     1.000   +0.083
```

**This is mixed, and saying so is the point.** Above 0.7 the system is
*under*-confident: it claims 0.843 in the 0.8-0.9 band and is right 95.7% of the
time. That is the safe direction and it is why auto-link precision holds at
100%. Below 0.7 it is *over*-confident - the 0.6-0.7 band claims 0.650 and
delivers 0.500, a 15-point gap on 24 mentions. An ECE of 0.082 is not a good
calibration score in absolute terms.

The practical reading: the score is trustworthy exactly where the design relies
on it (the auto-link band) and unreliable in the middle, which is the band that
already goes to a planner. The design survives the measurement; the score does
not deserve to be described as "calibrated" without that qualification.

**Confidence intervals**

| metric | n | point | 95% CI |
|---|---:|---:|---|
| Top-1 accuracy | 242 | 87.2% | **83.1% - 91.3%** |
| Coverage | 254 | 50.4% | 44.1% - 56.3% |
| Auto-link precision | 254 | 100.0% | 100.0% - 100.0% |

The auto-link interval is degenerate because there is not one wrong AUTO_LINK in
the data to resample. That is a real property of this corpus at this n, not
evidence that the figure cannot move on other data - and the section says the
interval covers sampling variation only.

**Per-discipline F1**: macro **0.855**, micro **0.843**. HSE is the weakest at
0.769 against civil at 0.909, on 20 mentions. Close macro and micro means no
discipline is being carried by another - which is the thing the macro average
exists to detect.

### One defect found and fixed while building it
The first version read `row["discipline"]` and produced a single `unknown`
bucket of 254, because the v1 ground-truth CSV has no discipline column - a
per-discipline table with one row is worse than none. Discipline is now derived
from the **gold activity id prefix**, which encodes it as a fact rather than an
inference, and a NO_MATCH mention is bucketed as `no_match` rather than assigned
a discipline it does not have.

### What is null rather than zero
`brier_score`, `expected_calibration_error` and `bootstrap_ci` return `None` on
empty input; a discipline with no suggestions has an undefined F1 and is
**excluded from the macro rather than scored as 0**. Empty reliability bins are
omitted: the score distribution is bimodal by construction, and printing zero
rows would misrepresent an absence as a measurement.

### Affected Areas
`evalstats.py` (new), `eval.py` (`print_calibration`,
`_calibration_observations`, `_gold_discipline`, one import, one call site).
No threshold, weight, model or existing metric changed. `matching/` untouched.

---

## 2026-09-02 / D-052 - An activity-type vocabulary from CFIHOS and Uniclass, built and deliberately not wired in

### Status
Implemented. ROADMAP §11. **Not connected to matching**, by instruction and by
test.

### Context
Matching keys on descriptions and tags, both project-specific: `PIP-ERC-1030`
means nothing on the next contract. For a lesson learned to transfer, it has to
key on *what kind of work this was*. That key did not exist.

### Decision - three layers, each carrying its provenance
1. **project** - the 56 discipline+type codes the demo baseline actually uses,
   derived from the activity ids in `dataset/baseline_schedule.json` rather than
   hand-typed, so the vocabulary cannot drift from the schedule it describes.
2. **uniclass** - Uniclass 2015 table Ac, Construction group (`Ac_10_40`).
3. **cfihos** - CFIHOS v2.0 CORE discipline table, 34 real discipline codes.

`GET /vocabulary/activity-types` returns the vocabulary;
`GET /vocabulary/resolve` maps free text onto a type.

### The honest finding: Uniclass does not cover this work
Uniclass 2015 is a **building**-construction taxonomy. Its entire Construction
group is 14 entries - Bricklaying, Carpentry, Carpet laying, Tiling, Plastering,
Plumbing. It has **no entry for spool erection, hydrotest, flange bolt-up, loop
checking, tank shell erection or vessel delivery**, which is most of an oil and
gas EPC schedule.

So `standard_code` is populated only where a real correspondence exists, and is
`None` everywhere else: **26 of 56 types, 46% coverage**, reported on the
response as `standard_coverage` rather than implied. Mapping `PIP-HYT`
(Hydrotest) onto `Ac_10_40_67` (Plumbing) would have raised the number and
lowered the truth; a test asserts specifically that it is not done. CFIHOS has
no macro discipline matching HSE or static equipment, so those carry no code
either.

The pipeline suggested "a curated subset covering the six disciplines rather
than all 15,375 rows". That is what this is - but the reason is not size. It is
that the standards genuinely do not describe this work at this granularity, and
the vocabulary says so.

### Ambiguous labels are declared, not hidden
17 of the 56 codes cover more than one activity heading: `CIV-FDN` spans
"Pedestal Concreting", "Equipment Foundation Concreting", "Slab-on-Grade" and
"Tank Foundation Ringwall". Picking one silently would mislabel the other three,
so every type carries `label_variants` and `label_is_unambiguous`.

The resolver indexes **every** variant, not just the chosen label - indexing
only `label` would have left "Pedestal Concreting" unresolvable purely because
"Slab-on-Grade" happened to be the more frequent heading.

### The resolver
Deterministic and total. An `activity_id` wins over prose, because the id
encodes the type as a fact and prose is an inference. Longer keywords are tried
first, so a specific phrase beats a substring of it. **Text that matches nothing
returns `None`, never a nearest guess** - a wrong activity type on a lesson
learned is worse than no activity type.

### Not wired into matching, and tested as such
`eval.py` output is **byte-identical** before and after. Four tests enforce it:
the response declares `wired_into_matching: false`; `engine.py`,
`retrieval.py`, `features.py`, `config.py`, `schedule_index.py` and
`learned.py` are grepped and none may reference the vocabulary; the alias
channel is asserted still off (`RetrievalConfig().w_alias == 0.0`); and the
module's own imports are asserted to pull in no matcher machinery.

**Known limitation, stated rather than hidden:** `import matching.vocabulary`
does load the matcher, because `matching/__init__.py` eagerly imports the engine
and the schedule index. That is a property of the package, not of this module,
and fixing it means restructuring `__init__` - out of scope for a step told to
change nothing about matching. The test asserts what is true (the module adds no
weight of its own) rather than what would be convenient.

### Verification
`matching/test_vocabulary.py`, **23 tests**. `eval.py` byte-identical.

### Affected Areas
`matching/vocabulary.py` (new), `matching/test_vocabulary.py` (new),
`server/main.py` (two routes, one import). No frontend change. No change to any
matcher module.

---

## 2026-09-02 / D-053 - The frontend had no React type checking at all, and now does

`frontend/package.json` listed `typescript`, `@types/node` and a `tsc --noEmit`
step that CLAUDE.md names as the frontend type check. It did **not** list
`@types/react` or `@types/react-dom`, and nothing pulled them in transitively.

TypeScript resolves an unresolvable module to `any` rather than failing, so the
check ran, exited 0, and verified almost nothing about the React half of the
codebase. Proof, run against the tree as it stood:

```ts
import { useState } from 'react';
const x: number = useState<string>('a')[0];   // no error
```

Assigning a `string` to a `number` passed. Every prop, hook, event handler and
component signature in the application was untyped. This is why a class
component could not see its own `props` or `setState` — `Component` was `any`,
so extending it produced a class with no known members — and it is the real
reason an earlier defect put a `ReviewCandidate` object into a `string | null`
state and would have posted `[object Object]` as an activity id.

**Decision: add `@types/react` and `@types/react-dom` as devDependencies, and
turn `strict` on.**

The second half is not the bolder change it looks like. The whole codebase was
measured under `--strict` before the flag was committed: **zero errors**, with
the flag proven live against a deliberate `noImplicitAny` and `strictNullChecks`
violation, so the zero is a real result and not a silently skipped check. The
code was written well enough to be strict-clean; it had simply never been asked.
Taking the free half now is worth more than taking it after the demo, because
from here the check actually fails when something is wrong.

Cost: two devDependencies and 85 added lines in `package-lock.json`, zero
removed. `npm ci` would have failed on a package.json/lockfile mismatch, so the
lockfile was regenerated with `--package-lock-only` rather than left behind.

Superseded nothing. It makes `cd frontend && npx tsc --noEmit`, already listed in
CLAUDE.md as a verification command, mean what it has always claimed to mean.

## 2026-09-02 / D-054 - An error boundary, because a render throw was a white screen

React unmounts the entire tree when a render throws and nothing catches it.
There was no boundary anywhere in the application, so any such throw produced a
blank page: no message, no reload affordance, nothing naming what failed.

That was not hypothetical. `useDevice` read `localStorage` unguarded inside an
effect that runs on every mount of the shell (see D-055), and in Safari private
browsing or with site data blocked it threw — taking the whole application down
rather than one preference.

`ErrorBoundary` wraps `QueryClientProvider` in `main.tsx`. Three properties are
deliberate:

- **Dependency-free.** It uses no shared primitive, no API client, no router and
  no hook. A boundary that can itself throw is not a boundary. Only CSS custom
  properties are referenced, each with a literal fallback, because those resolve
  even if every module above it failed to load.
- **It shows the error.** `error.name` and `error.message`, not "Something went
  wrong". The person reading this screen is a developer or a presenter mid-demo,
  and a friendly nothing costs them the one useful fact.
- **It offers dismissal as well as reload.** A transient failure in one panel
  should not cost the whole session.

Tested in `src/test/errorBoundary.test.tsx`. Note what that file had to work
around: a component that throws once and then succeeds never reaches the
boundary at all, because React retries a failed render and the retry passes. The
fault has to persist across retries and then be cleared from outside the render,
or the dismissal path is not actually being exercised.

## 2026-09-02 / D-055 - localStorage access goes through one total helper

Three unguarded `window.localStorage` accesses in `useDevice`, inside an effect
that runs on every mount of the shell. `localStorage` throws — not returns null —
when a browser blocks site data, in Safari private browsing, and where the global
exists but is `undefined`. `useTheme` already carried its own try/catch for
exactly this, which is the tell: the hazard was known and handled in one place
out of two.

`src/lib/storage.ts` provides `readStored` / `writeStored` / `removeStored`.
Every one is total: a read returns `null` when storage cannot be read, a write
returns whether it persisted. There is now no raw `localStorage` access anywhere
in `src/` outside that module.

The part worth recording is what `useDevice` does with a failed write. It holds
the view override in a module-level variable first and only then tries to
persist it. The Planner/Field toggle therefore still works for the whole session
when nothing can be saved — the preference is lost for next time, which is the
correct and much smaller failure. Writing this the other way round, persist-then-
read-back, would have made an unwritable storage look like a broken toggle.

## 2026-09-02 / D-056 - Enter and the Send button agree about when a turn may start

`TextInput`'s Send button carried `disabled={!typed.trim() || thinking}`. Its
Enter handler carried no guard, and `send()` refuses only an empty message, not
one sent while a turn is in flight.

So Enter bypassed the `thinking` half: a second press during a slow turn started
a second `POST /agent/turn` on the same `session_id`. That is the normal
behaviour of a field supervisor on a slow connection who sees nothing happen and
presses Enter again.

Fixed in the presentational component, where the mismatch actually lived, rather
than by adding a second guard inside `send()`. `src/test/textInput.test.tsx`
covers it, and the test was confirmed to fail with the guard removed — two cases
red — so it tests the behaviour rather than restating the implementation.

Worth recording because the first read of this was wrong: pressing Enter in a
browser appeared to do nothing, which looked like "Enter never submits". It does
submit. `POST /agent/turn` fires and the stage advances; the turn simply takes
longer than the few seconds the observation allowed. The defect is the narrow
one described above, not the broad one it first resembled.

## 2026-09-02 / D-057 - An unreachable API must never render as good news

With the backend stopped, Home rendered:

- "Queue clear — every extracted event has been matched or resolved" — 134 items
  were pending;
- "No two field sources have contradicted each other" — there were 18 conflicts;
- "Nothing recorded yet" — there were 275 audit records.

Sampled 14 times over 7 seconds in a real browser, this was **stable**, not a
flicker. Only a small truncated header banner said anything was wrong.

For a progress-tracking system this is the worst failure mode available. It does
not look broken, it looks like the project is in perfect shape — and the whole
product argument rests on the numbers being trustworthy.

**Cause.** Two TanStack Query behaviours combining:

- `isLoading` is `isPending && isFetching`, not `isPending`. Between the
  attempts driven by our 3s `refetchInterval` (D-031), a failing query is
  pending but not fetching, so `isLoading` is false.
- `error` is populated only once the query reaches `status === 'error'`. While
  it is pending-and-retrying, `error` is null.

Home's panels were written `error ? <ErrorState/> : isLoading ? <Skeleton/> :
<List items={data ?? []} />`. With `error` null, `isLoading` false and `data`
undefined, every panel fell through to the last branch, and `?? []` turned
"never loaded" into "loaded, and there is nothing to report".

**Decision: classify on `status`, never on `isLoading`.** `src/lib/queryState.ts`
exposes `queryView()`, returning `error` | `pending` | `ready`. `status` is
exhaustive, so the gap cannot exist. It also reports `failureReason` — the last
failed attempt while retries continue — so an unreachable API says so
immediately instead of showing a skeleton until retries exhaust.

It is a shared helper rather than seven inline fixes because the rule is general
and the failure is silent: nothing about the wrong version looks wrong in review,
which is exactly why it survived this long.

The distinction the fix must preserve, and is tested for: a genuinely empty
successful result is still `ready`. "There are honestly zero conflicts" must
keep rendering as an empty state, not as an error.

Verified in the browser under both conditions — API down, every panel names the
failure and every tile reads "—"; API up, 120/67/135/38 and 18 conflicts render
unchanged.

---

## 2026-09-02 / D-060 — Three roles behind a role picker, and an executive view that never shows a queue

### Status
Implemented. Frontend only; no endpoint, schema or matcher touched.

### Context
The product had two shells — planner and field — reachable only by a device
override, and no way to demonstrate the third role the problem statement
describes. ROADMAP §3 defines all three and is explicit about what separates
them: the Project Manager sees the full evidence chain and is the only role
that commits a change; Senior Management gets aggregates, exceptions and trend,
**never a review queue**, because an executive who can approve an update
bypasses the single accountable owner of the plan.

### Decision
`lib/role.ts` holds the role, persisted in `localStorage` behind a total
accessor. `Login.tsx` is a role picker. `DesktopShell` now takes its nav and
role label as props, so one shell serves both desktop roles rather than a
second copy drifting from the first.

Senior Management gets three pages: **Overview** (SPI, earned/planned,
activities evidenced, source conflicts, per-discipline SPI worst-first, biggest
finish slips), **Exposure** (RAID register plus unresolved source conflicts),
and **Data provenance** (the real corpus, from `GET /evidence/corpus`).

Two things are deliberate. The login screen states in its own copy that there
is no authentication and that no endpoint is restricted — a login box that
accepts anything teaches a reviewer the wrong thing, and ROADMAP §14 rules out
auth complexity for a three-role prototype. And the Overview leads with the
server's own caveat: SPI reads 0.43 only because 64 of 120 activities have no
evidence at all, so the figure is shown **with** that sentence rather than as a
performance claim.

### Reason
The provenance page renders its caveats from the API's `caveats` array rather
than from strings in the component. A limitation written into the frontend can
be deleted by a frontend change; one that arrives with the data cannot. The
same reasoning puts `percent_source_counts` on screen — it is what makes SPI
auditable rather than merely displayed.

Nothing on these pages is computed in the browser except sorting.

### Verification
- `npx tsc --noEmit` clean; `npm test` 76/76; production build succeeds.
- All three executive pages checked live at 1440x900 against the running API:
  SPI 0.43 with the unevidenced-activity banner, 554/1285 earned/planned, 56 of
  120 evidenced, 18 source conflicts, per-discipline SPI SEQ 0.02 → CIV 0.96,
  and the corpus page showing 124 artifacts / 0.26 GB / 1,462 checks / 0 errors
  with all four caveats rendered.
- The RAID register is empty and says why: candidates stay proposals until a
  planner adjudicates them (D-048).

### Affected Areas
`frontend/src/lib/role.ts` (new), `pages/Login.tsx` (new),
`pages/executive/{Overview,Exposure,Provenance}.tsx` (new), `App.tsx`,
`lib/api.ts`, `types.ts`, `DECISIONS.md`. No backend change.

## 2026-09-02 / D-058 - Classification and regression metrics, and what each is allowed to measure

`evalstats.py` gains `precision`, `recall`, `accuracy`, `f1`,
`confusion_counts` (classification) and `rmse`, `mae`, `r2` (regression). Pure
Python, no numpy, appended to the existing module rather than added as a
parallel one, so there is a single definition of what a hit and a miss are.

Three rules are encoded in the code rather than left to the caller:

- **Undefined returns `None`, never `0.0`.** No suggestions means precision is
  undefined, not zero — `0.0` would read as "every suggestion was wrong" when
  none were made. Same for recall with no gold positives, and F1 when either
  input is undefined or both are exactly zero.
- **`r2` returns `None` on a zero-variance target.** SS_tot is 0 there and R2
  is 0/0. Returning 1.0 would claim a perfect fit and 0.0 would claim no
  explanatory power; neither is a measurement. A single pair always has zero
  variance and so also yields `None`.
- **`accuracy` is computed but is documented as unquotable.** This matcher is
  heavily class-imbalanced: a system that suggests nothing scores high accuracy
  while delivering nothing. It is a diagnostic to read beside
  `confusion_counts`, never a headline.

`confusion_counts` charges a wrong suggestion on a gold-positive item as both a
false positive and a false negative, so the four counts can exceed the number
of observations. That is deliberate — the wrong link has to cost precision (a
wrong fact was offered) and the missed link has to cost recall (the right fact
was not found).

RMSE and R2 do **not** apply to matching, which is classification and ranking
with no continuous target. Their only legitimate use here is D-059.

## 2026-09-02 / D-059 - The baseline plan is a worse duration predictor than the mean, and now we can say so

`_compute_suggested_duration` (`server/main.py:3230`) suggests how long an
activity type really takes. It had never been evaluated. `evalduration.py`
scores a predictor against observed `actual_mean_days` per activity type, with
the baseline plan as the default predictor so there is always a reference point.

Measured on the live corpus (56 activity types, 37 excluded for having no
completed instances, 19 scored):

```
rmse   12.8021   95% CI [ 7.1638, 17.0614]   n=19
mae     7.2053   95% CI [ 2.6316, 12.2263]   n=19
r2     -0.6596   95% CI [-1.6558, -0.0087]   n=19
```

**R2 is negative and its whole interval sits below zero.** The baseline plan
predicts actual durations *worse than guessing the mean actual duration would*.
That is the quantified case for learning durations from captured actuals rather
than trusting the plan, and it is the first time that claim has had a number.

**The caveat, which must travel with the figure.** The result is driven by six
civil types that ran 15-29 days over plan — CIV-PLT +29, CIV-GBM +26, CIV-APN
+23, CIV-DWG +21, CIV-FLR +20, CIV-FNC +15 — and **every one of those has
n=1**. Twelve of the nineteen scored types came in at delta 0.0. So the honest
statement is "the plan misses badly on a minority of civil scope, measured on
single instances", not "the plan is universally wrong".

Two guards keep the module from overstating:

- `MIN_N_FOR_R2 = 8`. Below it R2 is withheld rather than computed, because at
  n of 1-3 it swings on the movement of a single point and the bootstrap mostly
  resamples duplicates.
- Nothing is dropped silently. Every excluded row is counted under a reason
  (`no_actuals`, `no_prediction`, `malformed`) and printed, and `n` appears on
  every metric line so a figure cannot be read apart from its sample size.

## 2026-09-02 / D-063 - A read-only Q&A agent that cannot state a number the data does not contain

`server/qa_agent.py` answers questions over project data — "why is the project
delayed", "what should I do next" — on the local Qwen 3 8B. It is deliberately
NOT the existing `POST /agent/turn`, which is slot-filling data *entry* with
the LLM as a dissector into JSON. This one only reads.

Four properties are structural, not prompt-level, because prompt-level versions
of them fail:

1. **Read-only by construction.** `__slots__ = ("_generate",)`. The class holds
   one callable and cannot have a database handle attached — `agent.db = ...`
   raises. Its entire public surface is `answer()`. A Q&A agent with write
   access is one prompt injection away from mutating the schedule, and the
   product's whole claim is that it never writes an unverified date (D-009).
2. **Facts are computed in Python; the model only phrases them.** Every figure
   is derived from the supplied data before the model is called, and the reply
   is *rejected* if it contains any number not present in those facts. A model
   that answers "the project is 87% complete" is discarded and the deterministic
   phrasing is returned. The model is never asked to do arithmetic.
3. **The SPI guard.** When `spi_headline_safe` is false the figure is withheld
   and the coverage is given instead. Verified against live data: the server
   reports SPI 0.4311 at 45.1% coverage and the agent states neither the figure
   nor a judgement, in grounded mode *and* when a model tries to smuggle it back
   into the prose. "How is the project doing?" is the most likely question a
   judge asks, and an unsafe SPI is the most damaging thing available to answer
   it with.
4. **It degrades, never fails.** `generate=None` and a `generate` that raises
   both return the grounded figures with `model_available=False`, and produce
   byte-identical answers. An Ollama outage must never be a NAVIS outage (D-005).

Dependency injection at the boundary — the agent takes a
`Callable[[str], str]` rather than building an HTTP client — is what makes all
of the above testable with no network and no database.

**One defect found only by running it against the live server.** `GET /evm`
returns `evidence_coverage` as an object (`{fraction, weight_with_evidence,
weight_total, ...}`), not a float. Read as a float, the agent said "evidence
coverage is unknown" while the server was reporting 45.13%. The SPI guard held
regardless, since it keys on `spi_headline_safe` — but an explanation that is
wrong about its own evidence is worth very little. `_coverage_fraction` now
accepts both shapes, with a regression test for each.

## 2026-09-02 / D-061 - The alias learning loop cannot help, and the reason is architectural

FINDINGS.md F4 has stood open since 2026-08-31: planner corrections are written
to `alias_lexicon` and never read. The remaining work was described as wiring
the read path and turning `w_alias` up. It was measured first. **It does not
work, and building it would have produced exactly +0.00.**

Three measurements, each sufficient on its own:

**1. The key never matches.** The lexicon is keyed on `alias_key()` — the
normalised mention text, matching what `server/main.py:1783` writes. On the
814-mention v2 corpus:

```
train gold mentions : 387   (384 distinct alias keys)
test  gold mentions : 185
test keys ALSO seen in train:  0   (0.0%)
whole corpus: 793 distinct keys; only 16 repeat, covering 37 of 814 mentions
```

Free-text DPR lines do not recur verbatim. An exact-string lexicon can fire on
about 4.5% of mentions in the best case and on 0% across a realistic
train/test boundary.

**2. The ablation already said so.** `research/bench/ABLATION_RESULTS.txt`:
ALIAS recall@20 on the test split is **0.0%**, and row 1, "+ alias lexicon
channel", is +0.00 on top-1, near-miss, coverage and precision alike.

**3. It could not help even with a perfect key.** This is the part that
settles it. The alias channel is a RETRIEVAL channel, and fusion recall@20 is
already **100%** (D-027): the gold activity is always inside the top-20 pool.
A retrieval channel can only change *what is retrieved*. There is nothing left
to retrieve. Every remaining error is a ranking error.

**Decision: `w_alias` stays 0.0 and the read path is not wired.** F4 moves from
OPEN to CLOSED-AS-MEASURED rather than being implemented.

**The diagnosis worth carrying forward: the loop is wired to the wrong stage.**
Corrections are the strongest evidence the system will ever get, and D-001
keeps retrieval and ranking as separate stages. The signal was plumbed into the
saturated one. `matching/features.py` has no correction-derived feature at all.
If the learning loop is ever closed, it belongs in ranking, and it must
generalise across mentions — a prior over *activities*, not a lookup on exact
text.

`server/db.py` claimed in a docstring that "the matcher uses these to improve
fuzzy matching during the demo". That was never true. It now says what is
actually the case and points here. The rows are still written: they are the
audit record of planner decisions and the training data any ranking-stage
version would be fitted on.

Pinned by `matching/test_config_floor.py::TestAliasChannelStaysOff`.

## 2026-09-02 / D-062 - `extra_features=True` does not transfer from v2 to v1, and breaches the floor

The search for auto-link recall headroom (52.9%) closed off in three
directions, and the third produced a defect worth recording.

**Thresholds are already at the frontier.** The precision-at-coverage sweep in
`eval.py` shows tau_high = 0.775 is the exact knee:

```
  0.750   coverage 57.1%   auto-precision  97.9%
  0.775   coverage 50.4%   auto-precision 100.0%   <-- operating point
  0.800   coverage 44.9%   auto-precision 100.0%
```

The shipped operating point is the lowest threshold that still holds 100%. No
coverage is available from threshold tuning; the setting is principled, not
arbitrary.

**Retrieval is saturated.** recall@20 = 100% (D-027). Nothing to add.

**Ranking is the only lever — and the obvious hand-weighted one is a trap.**
Row 8a of the v2 ablation reports the hand-weighted extra features at 100.0%
auto-link precision for +0.5 coverage, which reads as free. Measured on the v1
baseline the server actually runs, at the shipped thresholds:

```
                     baseline    extra=True     delta
  coverage             50.39%       53.54%     +3.15
  auto precision      100.00%       94.85%     -5.15
  wrong auto-links          0            7        +7
  top-1 accuracy       87.19%       84.71%     -2.48
  NO_MATCH rejection    8.33%        0.00%     -8.33
```

Seven false actual dates written onto the schedule to buy three points of
coverage, and top-1 got *worse*. Disqualified.

The finding is not "the extra features are bad" — under `production()`, where
they travel with a ranker fitted on the same baseline, they are the selected
configuration (+7.6 coverage at an unchanged 100% floor on v2). The finding is
that **the flag does not transfer across baselines on its own.** Hand-set
weights are tuned to one schedule's feature distribution: v2 has 218 activities
and four-digit tags, v1 has 120 and three-digit ones.

`production()` already guards the *fitted* artefacts with a baseline sha256
check and refuses a mismatch. That guard does not cover the bare
`extra_features` flag, and row 8a makes it look safe to set. Anyone reading the
ablation and enabling it for the v1 demo would ship seven wrong dates.

**Decision: `extra_features` stays False in `DEFAULT`.** Legitimate only inside
`production()`, paired with a matched fitted ranker. Pinned by
`matching/test_config_floor.py::TestExtraFeaturesStayOffWithoutAFittedRanker`.

**Recall headroom therefore remains real but unreachable on v1 without
fitting**, and fitting on v1 would contaminate the 254-mention corpus that
`METRICS.md` publishes the headline from. That is a methodology problem, not a
tuning one, and it is left open rather than papered over.

## 2026-09-03 / D-064 — DEMO.md realigned to the three-role application

### Status
Implemented. Documentation only; no application code, schema or matcher
touched. `scripts/demo_reset.ps1` was inspected and left unchanged.

### Context
`DEMO.md` was last accurate on 2026-09-01. Since then the product gained
bundled fonts, a reordered Home, a role picker with a login screen, and an
entire Senior Management lane (D-060). The rehearsal script therefore described
a different application: it opened on a dashboard that no longer appears first,
routed the presenter to the field role with `?view=field` — which no longer
sets a role at all — claimed a Home tile showing auto-link precision that has
since been deliberately removed, and had no coverage whatsoever of the third
persona. A demo script that is one whole role behind the product is worse than
no script, for the same reason stale documentation is worse than none: it is
trusted on stage.

### Decision
Rewrite the runbook around the three roles, in presentation order — planner,
Senior Management, field — with every figure re-derived from a live run rather
than carried forward. Every number in the file was reproduced on 2026-09-03
against commit `18d7075`: the known-good state from `scripts\demo_reset.ps1`
plus direct table counts, the matcher figures from `python eval.py` on both the
v1 and v2 corpora, and every screen loaded at 1280×800 in all three roles.

The known-good state table survived verification unchanged (120 / 13 / 266 /
148 / 135 / 67 / 38 / 275 / 68 / 18-across-17), so `demo_reset.ps1`'s
`$Expected` assertion is still correct and was not edited.

Three figures did not survive and were replaced with what the application now
produces: Home's fourth tile is **Completed (38)**, not auto-link precision;
Memory's Suggested Duration opens on **PIP-HYT**, not PIP-SPL; and the audit
drawer worked example moved from `PIP-SPL-1028`, which has zero audit records
on a clean reset, to **`CIV-FNC-1016`**, which has eight and demonstrates
source conflict, withheld finish and three kinds of provenance in one drawer.

Recall@3 is now quoted as the headline retrieval figure (88.1% overall, 67.6%
on near-misses) and Recall@20 = 100% is listed among the sentences that must
not be said, matching `METRICS.md` §8.

### The gotcha this file now leads with
**`demo_reset.ps1` resets server state; the role is browser state.** A reset
does not return the browser to the role picker, and a presenter who reloads
stays in whichever role they last chose. This is the thing most likely to break
a rehearsal — it looks like a broken reset and is not one — so the routing
section states it explicitly, gives both recovery paths (Switch Role in the
sidebar, or clearing `navis.role` in the console), and the on-stage
troubleshooting list repeats it as its first entry.

### Consequences
`DEMO.md` now also carries a "do not do this on stage" section covering the
four traps found while walking the demo: XER export is offered in the dropdown
and does not emit valid XER; the field agent stalls if the opening sentence
carries a quantity, because the planned total is then never satisfiable and a
CONFIRM & SUBMIT pressed in that state is silently discarded; **Force Mobile
View** drops any role — including Senior Management — into the Field Supervisor
surface while `navis.role` is unchanged; and the audit drawer labels every
non-auto-applied record "Confirmed by planner", including system-generated
conflict and withheld-finish rows nobody touched. None of these were fixed
here — this task was documentation-only — and the first is already tracked
against `_generate_xer`.

## 2026-09-03 / D-065 — An LLM-suggested description must be the supervisor's own words

### Status
Implemented. Server-side only; no frontend file touched, no matcher change,
no threshold or feature weight altered. `python eval.py` is bit-identical
before and after (87.2% top-1, 100.0% auto-link precision, 50.4% coverage).

### Context
`server/agent_llm._validate()` re-checks every field a model returns, except
one. `discipline` is membership-tested against a closed vocabulary. `status` is
re-parsed by our own parser rather than trusted. `tags` are re-derived from the
regex pre-pass and never taken from the model at all (D-006).
`activity_description` got `.strip()[:500]` and nothing else.

That was the only LLM-supplied value reaching `SlotState` without deterministic
re-validation, and it is not inert. It is returned to the client on every turn
that still has a slot pending, it is persisted in `ConversationTurn.slots_filled`,
and it feeds `_quantity_relevant()` — so an invented word like "spools" changes
which questions the supervisor is asked. An unfaithful model could put words in
a supervisor's mouth and have them recorded as their report.

Two things narrow the blast radius, and both were verified rather than assumed:

* By the time the **confirmation card** is rendered, `_match_slots()` has
  already overwritten `activity_description` with the matched activity's own
  text off the baseline. So the card shows the schedule's wording, not the
  model's. The exposure is the pending-slot turns, the conversation record and
  the question flow — real, but narrower than "the supervisor confirms the
  model's sentence".
* On the **ingest** path the same field is set on the in-memory
  `ExtractedEvent` and read by nothing: it is not a `LinkedEvent` column,
  `matching/` never references it, and it is never persisted. The hole was
  agent-path-only. `extraction/test_llm_guards.py` now pins that boundary so a
  future change that persists it fails a test.

### Decision
`_validate_description(candidate, source_message)` gates the field. Five rules,
each rejecting to `None`, logging which one fired, and letting the
deterministic path continue:

1. **Grounding.** Containment, not similarity: at least **75%** of the
   description's content tokens must appear in the supervisor's own message.
2. **No activity id.** Rejected on sight — naming an activity is choosing one,
   which is what D-006 forbids.
3. **No structure.** Whitespace is collapsed (folding away layout tabs and
   newlines); surviving control or format characters, markdown, table pipes,
   JSON punctuation and anything reading as an instruction are rejected.
4. **Length 160, not 500**, truncated on a word boundary.
5. **Multi-output is refused, not truncated.**

### The grounding threshold: 0.75, and why
Measured, not guessed. `matching.textutils.tokenize` is reused rather than
reimplemented, so the check sees the same normalisation the matcher does —
stopwords dropped, field abbreviations expanded (`erected` → `erection`, so a
tense change stays faithful), tag-like tokens (`24-inch`, `p-1001`) kept whole.

On a hand-built set of 21 pairs — 12 faithful restatements of real DPR lines,
9 that add a location, quantity, scope or judgement the message never carried —
the classes separate cleanly:

```
lowest faithful    0.833
highest unfaithful 0.556
separating band    (0.556, 0.833]
```

Any cut in [0.60, 0.80] gives zero errors on that set. **0.75** is taken
because it sits inside the band with margin on both sides and states a rule
that can be defended out loud: three in four of the description's content words
must be the supervisor's own.

The bias toward rejecting is deliberate and asymmetric on purpose. A false
reject costs nothing — the deterministic path then supplies the supervisor's
own sentence, which is what should have been shown anyway. A false accept is
words put in their mouth. **The calibration set is small (n=21) and
hand-built: it bounds the rule's behaviour on realistic input, it does not
establish an error rate, and it must not be quoted as one.**

### Multi-output: refused rather than truncated
`interpret()` sends one message as one span, so the contract is one event back.
`_validate` previously read `outputs[0]` and dropped the rest silently. Picking
one arbitrarily is silent truncation of model output — the bug class this
repository has been closing everywhere else — and merging would fuse two
different readings of one sentence into a record the supervisor never gave. The
whole payload is refused and the rules path continues, which is the same
posture as every other LLM failure here.

### Provenance (the second half of this change)
The project already carries `date_basis` end to end so a planner can tell an
asserted date from an inferred one. Slot values now carry the same distinction.

`LLMSuggestion.suggested_fields` → `SlotState.llm_suggested_fields` →
`AgentTurnResponse.llm_suggested_fields` (available to the UI; **no frontend
file was changed and nothing renders it yet**) → `LinkedEvent.llm_assisted_fields`
→ `AuditRecord.llm_assisted_fields` when a planner commits the event. NULL
rather than `[]` on rules-only work, so the column means "a model touched this"
instead of "we checked".

One correction fell out of building it. `_match_slots()` replaces
`activity_description` with the baseline activity's own text, so continuing to
list that field as model-supplied would attribute the *schedule's* wording to
the model — and that attribution travels to the audit record. The claim is now
dropped at the moment it stops being true.

### Connectability
`GET /agent/llm-status` reports whether the path is on, which provider is
configured, whether the backend answered a bounded probe, and the timeout in
force. It never returns an API key or a base URL — a base URL can carry
credentials in its userinfo — and a dead endpoint is reported as
`reachable: false` with a reason rather than a 500. `reachable` is three-valued:
`null` when the path is off and nothing was attempted, so "we did not look"
cannot be misread as "it works". An opted-in provider that fell back to
`NullBackend` is reported as unreachable, not healthy.

### Verified, not asserted
With a live `qwen3:8b`, the same three-turn field report was run with
`EXTRACTION_PROVIDER=rules` and with `=ollama`. Both matched **`PIP-INS-1045`
at confidence 0.692**, and the model demonstrably participated in the second
run (`llm_suggested_fields: ["status", "activity_description"]`, probe
`reachable: true`). Identical linking with the model in the loop is the
demonstration that it is an interpreter and not a decision-maker.

### Alternatives Considered
- **Embedding similarity instead of token containment.** Rejected: it would
  need the encoder on the interactive path, it scores paraphrase rather than
  faithfulness, and a fluent invention scores well against its own subject.
- **Sanitising rather than rejecting** (strip the ungrounded clause). Rejected:
  editing a sentence and then showing it to the person who supposedly said it
  is worse than not showing it.
- **Dropping `activity_description` from the LLM contract entirely.** Tempting,
  and it would close the hole absolutely. Rejected because the field is the
  one thing the model is actually good at — reading intent out of informal
  prose — and it is already displaced by `_match_slots` before anything is
  committed. Grounding keeps the benefit and removes the risk.
- **A tighter threshold (0.90).** Rejected: it rejects ordinary rephrasings for
  no gain, since the measured unfaithful ceiling is 0.556.

### Affected Areas
`server/agent_llm.py` (validation, provenance, `probe`), `server/agent_slots.py`
(`ACTIVITY_ID_RE`, extracted so the two callers cannot disagree),
`server/main.py` (merge point, `_match_slots`, `_create_event_from_slots`,
`_apply_rollup_to_schedule`, `_write_audit`, the new route),
`server/schemas.py`, `server/db.py` (two additive nullable columns),
`server/conftest.py`, `.env.example`, `SETUP.md`.

### Trade-offs / Consequences
Easier: trusting what a supervisor is shown, and auditing which fields a model
read. Harder: a legitimate but heavily reworded description is now dropped —
accepted, because the fallback is the supervisor's own sentence.

`server/db.add_missing_columns` is now parameterised by engine and the test
fixture calls it. `create_all` cannot add a column to an existing table, and
the test database is a real file that outlives a run, so every additive column
used to break the suite on a stale local file. That is fixed once, here.

One test premise changed, and it was the premise that was wrong, not the
product: `test_valid_output_is_accepted` asserted a description naming "the 24
inch header" against a message that only said "spool erection is done". The
ungrounded variant is now asserted as a rejection.

### Future Notes
If the ingest path ever persists or displays `activity_description`, it must be
grounded the same way; `extraction/test_llm_guards.py` fails if it starts
reaching a persisted field. If the frontend renders `llm_suggested_fields`, it
should read as attribution ("read by the assistant"), never as a warning — the
value was still re-validated deterministically.

---

## 2026-09-03 / D-066 — A give-up must be remembered, and a confirm must never vanish

### Status
Implemented. Server-side only. 12 new tests in `server/test_agent.py`.

### Context
Walking the demo for D-064 found the field lane wedged. `DEMO.md`'s own opening
sentence — *"spool erection on the 24 inch header is done, 6 nos"* — produced a
session that could never be submitted, and **CONFIRM & SUBMIT** appeared to do
nothing at all.

Three defects, stacked:

**1. The give-up lasted one turn.** `_next_missing` skips a slot it has already
asked about twice — that is the anti-loop rule. It read the give-up from
`slots.asked_slot` and `slots.ask_count`, and the branch in `agent_turn` that
finds nothing left to ask clears **both**. So the very next turn forgot, asked
again, and the cycle repeated for ever.

**2. A confirm arriving with a pending slot was consumed by the question.**
`req.confirm` was only ever read inside the `else` branch — the one reached when
nothing is pending. With a slot pending the turn fell into `elif pending_slot`
and asked, discarding the confirm without a word. Combined with (1), the
supervisor pressed submit and watched the same question reappear.

**3. The question could not be answered.** "How many were planned in total?"
routes the reply through `parse_quantity`, which reports a lone number as the
*completed* amount — reasonable in isolation. `_merge_quantity` then drops it,
because `quantity` was already set. So `18`, `18 nos` and `8 nos planned in
total` all landed nowhere. Only an explicit `6 out of 18` worked, and the
question does not ask for one.

### Decision
- `SlotState.abandoned_slots` records a give-up where nothing resets it.
  `_abandon_exhausted(slots)` writes it *before* `_next_missing` runs, and
  `_exhausted()` reads both the live counters and that memory.
- A confirm with a genuinely open slot is **still refused** — filing a record
  the supervisor never completed would be worse — but it is refused out loud:
  *"I need one more thing before I can send this. <question>"*.
- Answering the planned-total question with a bare figure fills
  `planned_quantity`. Over-planned is flagged, never clamped, as elsewhere.

### Reason
Each half is small; the combination made the only voice-to-planner path in the
product unusable, and the rehearsal script demonstrated it. A silent no-op on a
submit button is the worst available failure: it reads as a broken product and
leaves nothing to diagnose.

### Alternatives Considered
- **Honour the confirm anyway and file the incomplete record.** Rejected: the
  agent asks only for what it genuinely lacks, so "incomplete" means a real
  hole.
- **Never clear `asked_slot`.** Rejected: `_fill_slots` reads it to interpret
  the next message as an answer to that question, so a stale value misroutes
  free text.
- **Teach `parse_quantity` that a lone number is a planned total.** Rejected:
  it is shared with the ingest path, where a lone number is a completed amount.
  The question being answered is context the parser does not have, so the
  branch belongs at the call site that knows it.

### Affected Areas
`server/main.py` (`agent_turn`, `_fill_slots`, `_next_missing`, `_exhausted`,
`_abandon_exhausted`), `server/schemas.py`, `server/test_agent.py`.

### Trade-offs / Consequences
`SlotState` grows a field that is serialised into `ConversationTurn.slots_filled`
— additive, defaulted, and readable on old rows as empty.

---

## 2026-09-03 / D-067 — The role decides the application; a viewport never does

### Status
Implemented. Frontend only. Supersedes the device-override half of D-060.

### Context
`App.tsx` routed on `role === 'field' || device === 'mobile'`. The second half
predates roles entirely, and after D-060 it meant a **viewport width could
change which person's application you were looking at**: a Project Manager or a
Senior Management user below 768px — or pressing **Force Mobile View**, which
sat in every desktop sidebar — got the Field Supervisor's routes, nav and
header label while `navis.role` was unchanged. Verified live: an executive
clicking that button landed on `/field` titled "Field Supervisor".

Two more affordances did the same thing: the `PLANNER | FIELD` pill in the
desktop header (which rendered for Senior Management, who are neither), and a
button on the field Profile screen labelled **"Return to role selection"** that
called `setOverride('desktop')` — it never cleared the role, and for the field
role the router ignored it, so it did nothing whatsoever.

### Decision
The shell follows the role and only the role. `device` is out of the routing
decision, and all three override affordances are gone. "Return to role
selection" now signs out, through a new `SessionContext` — `App` owns the role
in state, and the field lane's routes sit inside `<Routes>` where a prop cannot
reach them.

### Reason
Roles are what the product is *for*: one accountable owner of the plan, a field
supervisor who cannot approve, an executive with no queue. A layout heuristic
that swaps between them is not a responsive design, it is a permissions bug
wearing one. There is no auth here and route guards are not a security boundary
(`lib/role.ts`), which makes the coherence of these screens the only thing
keeping the three roles distinct.

### Alternatives Considered
- **Keep the override but scope it to the field role.** Rejected: the field
  role already gets the mobile shell, so it would be a no-op control.
- **Build mobile layouts for planner and executive.** Out of scope, and not
  needed for a demo presented on a projector. A planner on a narrow window now
  gets a cramped desktop layout, which is legible and correct.
- **Delete `useDevice`.** Rejected: it carries tested `localStorage`-safety
  behaviour (D-055) and a stale `view_override` key must stay harmless.

### Affected Areas
`frontend/src/App.tsx`, `frontend/src/pages/FieldProfile.tsx`,
`frontend/src/hooks/useSession.ts` (new), `frontend/src/test/roleRouting.test.tsx`
(new), `frontend/src/test/field.test.tsx`.

### Trade-offs / Consequences
A genuine phone user in the planner role gets a cramped desktop layout instead
of a working-but-wrong field UI. That is the correct trade.

---

## 2026-09-03 / D-068 — `auto_applied` is not a claim about who decided

### Status
Implemented. Frontend only; no API or schema change — `source` was already
projected onto both audit response shapes.

### Context
The audit drawer rendered `auto_applied ? 'Auto' : 'Confirmed by planner'`, and
Home's Recent Activity rendered `auto_applied ? 'auto' : 'planner'`. False does
not mean a planner confirmed it. It means *not written automatically*, and the
system emits plenty of rows like that on its own: `source_conflict`, and
`actual_finish_withheld` where D-015 declined to write a date no source named.

Measured on a clean `scripts\demo_reset.ps1` state, before any planner has
touched anything: **275 audit rows, every one `source = "matching"`, and 67 of
them — 50 source conflicts and 17 withheld finishes — displayed as "Confirmed
by planner".** `CIV-FNC-1016`, the worked example in `DEMO.md`, showed three.

### Decision
`lib/audit.ts` derives the actor from `source`, which is the field that answers
the question: `planner_review` → **Confirmed by planner**; otherwise
`auto_applied` → **Auto**; otherwise **Recorded, not applied**.

### Reason
The audit trail is the product's evidence for who decided what — the thing D-004
makes append-only and D-003 keeps free of model prose. A label that attributes a
system decision to a human is the single worst defect it can carry, and a judge
asking "who confirmed that?" would have been told something untrue.

The third state is not a euphemism: a source-conflict row records a
disagreement the system deliberately did not resolve, and a withheld-finish row
records a date it deliberately did not write. "Recorded, not applied" is what
happened.

### Alternatives Considered
- **Show "System" for everything not planner-confirmed.** Rejected: it loses the
  distinction between a value that was written and one that was refused, which
  is the whole of D-015.
- **Add a server-side `actor` field.** Rejected: `source` already carries it,
  and a second field could disagree with the first.

### Affected Areas
`frontend/src/lib/audit.ts` (new), `frontend/src/pages/Schedule.tsx`,
`frontend/src/pages/Home.tsx`, `frontend/src/test/auditActor.test.ts` (new).

---

## 2026-09-03 / D-069 — The register gets the writer it was missing

### Status
Implemented. Frontend plus one line of `server/demo.py`. No RAID API change.

### Context
D-048 built the register on the rule that no candidate commits itself: the
detector proposes, a Project Manager adjudicates. Only the second half was
never built. `GET /raid/candidates` proposed four entries from the audit trail,
each `committed: false`; Senior Management's Exposure screen read `GET /raid`
and showed an empty register explaining that candidates *"stay proposals until
a Project Manager adjudicates them"* — and no screen let the planner be that
person. `lib/role.ts` had listed `/raid` among the planner's routes since
D-060; the nav entry and the page were simply absent.

So the honest design rule read, in the product, as an empty panel with an
excuse.

### Decision
A planner **Exposure** screen at `/raid`: detected candidates with the API's own
PROPOSAL note, an **Accept into register** action (`POST /raid`), the register
itself, and closing an entry (`PATCH /raid/{id}`).

Two things the screen deliberately does not do:

- **It never computes exposure.** `probability × impact` is the server's
  arithmetic and is displayed as returned.
- **It never invents a probability.** The detector counts what already
  happened; it does not forecast, and a made-up probability makes a made-up
  exposure. Every candidate is an `issue`, and `server/raid.py` *refuses*
  probability and impact on a non-risk rather than dropping them — found the
  hard way, by a live 400 on the first accept.

### `clear_progress` now clears the register
`scripts\demo_reset.ps1` left `raid_item` untouched, which did not matter while
nothing could write to it. It matters now: register rows are adjudications of
candidates derived from the audit trail, so once that trail is cleared a
surviving entry cites evidence the database no longer holds. A reset that
leaves it behind is not the known clean state the demo script promises. The
candidates recompute from the audit records on every read, so they return by
themselves.

### Alternatives Considered
- **Let the executive accept candidates.** Rejected outright: D-060 keeps that
  role read-only, and an executive who can commit bypasses the single
  accountable owner of the plan.
- **Auto-accept high-confidence candidates.** Rejected: it is D-009 again. The
  system proposing and the system deciding are different products.

### Affected Areas
`frontend/src/pages/Raid.tsx` (new), `frontend/src/App.tsx`,
`frontend/src/lib/api.ts`, `frontend/src/types.ts`, `server/demo.py`,
`frontend/src/test/raid.test.tsx` (new).

### Trade-offs / Consequences
A rehearsal that accepts a candidate no longer leaves a stray row behind.
Verified: reset → `raid_item` 0, and the documented state (120 / 135 / 275 /
266 / 67 / 38) is unchanged.

---

## 2026-09-03 / D-070 — The server migrates its own database, or the migration does not exist

### Status
Implemented. Found by merging D-065 into D-064..D-069 and starting the API
against a demo database that had not been re-seeded.

### Context
`server/db.py` has carried an additive migration since the `*_basis` columns:
`_ADDED_COLUMNS` plus `add_missing_columns()`, called from `init_db()`. SQLite
cannot add a column to a table that already exists, so `create_all` alone
leaves an older file one column short and every query naming that column fails
at read time — which is exactly what that helper is for.

The API's startup hook called `Base.metadata.create_all(bind=engine)`
**directly**. It never called `init_db()`. So the migration only ran when
somebody happened to execute `scripts/seed.py` or `scripts/reset_demo.py`,
which do call it. For four columns that was invisible: anyone adding one also
reset their demo data, and the reset applied it on the way past.

D-065 added `llm_assisted_fields` to `linked_events` and `audit_records`. Its
own tests passed — `server/conftest.py` calls `add_missing_columns` on the test
engine — and `GET /agent/llm-status` does not touch those tables, so the branch
looked healthy. Starting the merged server against the real
`dataset/epc_progress.db` gave `GET /raid/candidates` a 500:
`no such column: audit_records.llm_assisted_fields`.

### Decision
Startup calls `init_db()`. One line, and the migration now runs in the process
that actually serves requests.

### Reason
A migration that only executes on a code path a developer might not take is not
a migration, it is a convention. The three places that create a database —
the server, the seed script, the test fixtures — must all reach it, and the
server is the one that matters at a demo, where nobody is going to re-seed
first.

The near miss is the part worth keeping: a green suite and a working health
endpoint said nothing about this, because the fixtures migrated and the health
endpoint reads no table. Only starting the real server against a real database
showed it.

### Affected Areas
`server/main.py` (`startup`), `server/test_startup_migration.py` (new, 14
tests). The regression test was confirmed to fail against the old one-line
version before being kept.

### Trade-offs / Consequences
Startup does slightly more work: one `inspect()` per table in `_ADDED_COLUMNS`,
and an `ALTER TABLE` only where a column is genuinely absent. Idempotent, and
pinned by a test.

`_ADDED_COLUMNS` entries are now also checked against the models, so an entry
naming a column no model declares — which a fresh database would never get —
fails a test rather than waiting to be discovered on somebody's older file.

---

## 2026-09-03 / D-071 — A delay cause is counted once per report, not once per audit row

### Status
Implemented. `server/raid.py` gains the shared counter; `server/main.py` and
`propose_candidates` both call it. 8 new tests.

### Context
Walking the demo for the D-064 re-verification found the Memory screen and the
planner's Exposure screen reporting different numbers for the same four delay
causes — same phrases, same activities, same days lost, different counts:

```
                        /memory/query    /raid/candidates
fencing conflict              2                 2
holiday delay                 2                 3
piling rig breakdown          2                 3
rain delay                    2                 3
```

D-048 had kept `DELAY_KEYWORDS` as one shared list precisely so the two screens
"can never name different things". They named the same things and counted them
differently, because only the *vocabulary* was shared: `_compute_delay_reasons`
filtered audit rows to `actual_start`/`actual_finish`, and `propose_candidates`
applied no field filter at all.

**Both were wrong, and the disagreement was the smaller problem.** Each of the
four causes is named in exactly ONE row of `civil_progress.xlsx`, against one
activity:

```
CIV-PLY-1004  actual_start   "Bored Piling — Pipe Rack P1-P12 — 1 day over, piling rig breakdown"
CIV-PLY-1004  actual_finish  (same row, same sentence)
CIV-PLY-1004  actual_qty     (same row, same sentence)
```

One observation. Three audit records, because the roll-up wrote three fields
from it. So the number both screens displayed was a fact about storage — it
moved with how many columns the roll-up happened to touch — presented under a
heading that read "Recurring delay causes". Nothing recurred. A single field
report was being shown to a judge as two or three occurrences of a recurring
problem.

### Decision
`server.raid.delay_evidence(db)` is the one counter. **One occurrence is one
piece of evidence about one activity**, keyed on
`(activity_id, source_file, source_span)`. Both callers use it, and it returns
occurrences, activity ids, the underlying records and days lost together, so
the two screens cannot disagree about any of them.

The wording followed the number: the RAID title is "Delay cause: X" rather than
"Recurring delay cause: X", the description says "appears in N field reports"
rather than "N audit records", and the Memory panel is headed "Delay causes"
with the column labelled **Reports**.

### Why the key excludes line and row
The first attempt keyed on
`(activity, file, line, row, span)` and still returned 2 for three of the four
causes. The reason is worth recording: **the roll-up records `source_row` on
the two date writes and leaves it `None` on the quantity write**, from the same
spreadsheet row. Keying on the locator therefore split one observation back
into two and re-introduced exactly the storage artefact the function exists to
remove. The span is the evidence; line and row are provenance for display and
are not populated consistently enough to identify anything.

That inconsistency is a separate defect in the audit trail — a write that could
cite its spreadsheet row and does not — and is left open rather than fixed
here, because changing what provenance an audit row carries is a change to the
append-only record (D-004) and deserves its own pass.

### Reason
Two screens disagreeing is a credibility problem; both being wrong in the same
direction is a correctness one. This system's entire argument is that its
numbers are traceable to evidence, so a count that is really a count of
database writes is the worst kind of number to put on a governance screen.

### Alternatives Considered
- **Adopt the Memory definition (filter to date fields).** Rejected: it still
  reports 2 for one report that wrote both a start and a finish.
- **Adopt the RAID definition (all audit rows).** Rejected for the same reason,
  more so.
- **Count distinct affected activities.** Rejected: that is a different and
  already-reported figure (`affected_activities`), and it would report 1 for a
  cause that hit the same activity in five separate reports.
- **Leave both and document the discrepancy.** That is what `DEMO.md` said
  before this entry. It is not a fix, and the honest reading of the evidence is
  available for the cost of one shared function.

### Affected Areas
`server/raid.py` (`delay_evidence`, `propose_candidates`), `server/main.py`
(`_compute_delay_reasons`), `frontend/src/pages/Memory.tsx` (panel title and
column header), `server/test_delay_evidence.py` (new), `DEMO.md` steps 4a and 5.

### Trade-offs / Consequences
Every delay figure on the demo drops to **1 report** per cause. That is a
smaller-sounding number and a truthful one, and it removes a question a judge
would have been right to ask. Genuine recurrence still counts: two different
report lines naming the same cause are two occurrences, and the same cause on
two activities is two — both pinned by tests.

The new tests clear `AuditRecord` and `RaidItem` around each case. Without
that they passed alone and failed in sequence, counting rows an earlier test
had left behind — the same mistake as counting audit rows, made in the test
suite.

---

## 2026-09-03 / D-072 — The design brief enters the repository, dated to a commit

### Context
Three design documents had been sitting untracked in the working tree: a
backend-to-interface audit, a superseded Stitch prompt pack, and the rewritten
`prompts.md` that replaces it. They were written against `34e4a1c` while four
remote commits were unmerged, so by the time anyone read them they described a
tree that no longer existed: a repository "4 commits behind", 29 HTTP
operations, 302 backend tests, 76 frontend tests, and a `QAAgent` that lived
only on the remote.

### Decision
Refresh all three against `ca63ba0` and commit them. Two rules apply to this
class of document from now on:

1. **A design brief states the commit it was measured against.** Every source
   permalink in the audit points at that commit, so a reader can see exactly
   the code the finding was written from. A brief with no basis commit is a
   brief that cannot be checked.
2. **A re-checked finding says what the re-check found.** Section 4 now carries
   a Status column with four values — open, partly closed, closed, and the
   commit that closed it. Deleting a fixed finding would have hidden the fact
   that it was ever true; leaving it unmarked would have kept a design team
   working around a control that no longer exists.

### What the refresh actually changed
- Git state: 0/0 against origin, not 4 behind.
- Counts: 30 HTTP operations (`GET /agent/llm-status` is new), 394 backend
  tests, 101 frontend tests, `tsc --noEmit` clean, build clean, 334 indexed
  files.
- Two P1 findings closed by `d0bcede`: the Force Mobile View control is gone,
  and Field "Return to role selection" now clears `navis.role` instead of
  swapping the shell.
- One P1 partly closed: the executive Overview gained a banner naming the
  unevidenced-activity count, but it keys on `no_evidence_floor > 0` rather
  than the server's `spi_headline_safe`, and `frontend/src/types.ts` still
  declares `headline_safe` / `headline_warning` for wire fields actually named
  `spi_headline_safe` / `spi_headline_reason`, with `evidence_coverage` and
  `evidenced_subset` absent entirely.
- The three P0 resolve-action mismatches are **still open**, re-verified line
  by line: `Reconcile.tsx` sends `confirm` with an `activity_id` the server's
  confirm branch never reads, `new_activity` where the server accepts `create`
  and demands `new_activity_id` too, and `reject` where the server accepts
  `ignore` and 400s on anything else.
- `server/qa_agent.py` is merged locally, and merging it connected nothing:
  neither `server/main.py` nor `frontend/src/lib/api.ts` mentions it.
- D-071's wording reached the prompts: the Memory panel table is "Delay
  causes" with a **Reports** column, and the prompt now says to draw small
  numbers rather than inflated occurrence counts.

### Reason
The three P0s pass the entire 394-test suite, because no test asserts the
frontend's request body against the set of actions the backend accepts. That is
the strongest argument for keeping this brief in the repository rather than
beside it: it records a defect class the test suite structurally cannot see, and
an untracked file records nothing.

### Alternatives Considered
- **Commit them unchanged.** Rejected: a document that says "4 commits behind"
  and "29 operations" reads as authoritative and is wrong, which is the failure
  mode `CLAUDE.md` opens by naming.
- **Delete the superseded prompt pack.** Rejected for the same reason
  `DECISIONS.md` never deletes an entry. It is marked superseded at the top,
  points at `prompts.md`, and keeps the deeper per-endpoint state notes the
  rewrite deliberately dropped.
- **Fix the three P0s in this pass.** Out of scope and a different kind of
  change: it touches the resolve contract and needs its own tests. The brief
  now says precisely what to send, which is what makes that a bounded task.

### Affected Areas
`Design/NAVIS_BACKEND_UI_AUDIT.md`, `Design/NAVIS_STITCH_PROMPTS.md`,
`prompts.md`. No application code was changed by this entry.

### Trade-offs / Consequences
The audit is now dated to a commit, which means it goes stale on the next merge
that touches a cited line. That is the intended cost: a document with a basis
commit can be re-checked mechanically, and one without cannot be checked at all.


---

## 2026-09-04 / D-073 — The Reconcile screen speaks the server's resolve vocabulary

### Context
`POST /review/{item_id}/resolve` is the only route in NAVIS that commits an
actual date onto the schedule (D-009). `ResolveRequest` accepts exactly four
actions — `confirm`, `reassign`, `create`, `ignore` — and the Reconcile screen
sent three bodies, none of which the server could act on as the planner
intended:

1. `handleConfirm` sent `{action: 'confirm', activity_id: <chosen candidate>}`.
   The server's confirm branch commits `item.activity_id` and never reads
   `req.activity_id`, so a planner who rejected the matcher's proposal, picked
   candidate 2 and pressed Confirm linked the event to candidate 1 — with a
   success toast, an audit row and an alias-lexicon entry all recording the
   activity the planner had just passed over. This is the serious one: it is a
   silent wrong write into an append-only trail, not a visible failure.
2. `handleNew` sent `{action: 'new_activity', new_description}`. There is no
   such action, and `create` additionally requires `new_activity_id`. Every
   press returned 400; the button had never worked.
3. `handleReject` sent `{action: 'reject'}`, which only
   `_resolve_defaulted_finish` accepts (it normalises it to `ignore`). On every
   other queue item it fell through to `Unknown action: reject`.

The whole 912-test suite passed throughout, because no test asserted a frontend
request body against the set of actions the backend accepts. `FLOW.md` §13.1
had carried this as a LIVE BUG and `Design/NAVIS_BACKEND_UI_AUDIT.md` as three
open P0s (D-072).

### Decision
Correct the client to the server's vocabulary rather than widen the server's.
The server's four actions are each audited differently — a reassignment writes
an `event_reassigned` row carrying the activity it moved away from, a creation
writes `activity_created` — so collapsing them client-side would have cost the
audit trail the distinction that makes it readable.

1. **Confirm versus reassign is decided by the chosen candidate.**
   `suggested_activity_id` is projected straight from `item.activity_id`
   (`get_review_queue`), so a selected candidate that differs from
   `item.activity_id` is exactly the case the server calls `reassign`.
   `confirm` is now sent with no `activity_id` at all, which is honest about
   the fact that the field is not read.
2. **A withheld finish date always confirms.** For
   `reason == 'defaulted_finish_date'` the link is already committed and
   `_resolve_defaulted_finish` 400s on anything but confirm/ignore, so the
   candidate list must not be allowed to turn Confirm into a reassign. The
   frontend now mirrors that reason as a named constant.
3. **The new-activity id is derived from the review item, not the clock.** The
   id is `NEW-<first three letters of discipline>-<first six of item.id>`. A
   timestamp suffix — the obvious alternative — collides between two planners
   acting in the same second, and a retry after a failed POST would mint a
   second activity for one event. Deriving it from `item.id` makes the same
   item always name the same activity, so a duplicate surfaces as the server's
   own 409 rather than as a silent second row in the schedule.
4. **`discipline` is projected onto `ReviewQueueItemResponse`.** It is already
   on the `LinkedEvent` the endpoint reads; without it the generated id could
   not name the trade it belongs to.
5. **The composer is cleared in `onSuccess`, never eagerly.** Clearing
   `newMode`/`newDesc` at mutate time closed the form and discarded the typed
   description whenever the POST failed, leaving the planner nothing to retry
   with.

### Alternatives Considered
- **Teach the server to accept `new_activity` and `reject`.** Rejected. The
  vocabulary is the audited one and is already exercised by `test_server.py`;
  adding aliases would double the surface every future reader has to check, to
  spare one screen a one-word change.
- **Have `confirm` honour `req.activity_id`.** Rejected: it would erase the
  distinction between `linked_event_confirmed` and `event_reassigned` in the
  audit trail, which is precisely the evidence a planner needs to see later.
- **Collect `new_activity_id` from the planner in a second input.** Deferred,
  not rejected. It is the better long-run answer, but it is a UI change to a
  screen whose mockups are the spec; a derived id makes the action work now
  without inventing a control the design does not have.

### Verification
- `frontend/src/test/reconcile.test.tsx` gained five tests that assert the
  request body itself: confirm without an `activity_id`, reassign after picking
  candidate 2, create with both fields and the derived id, reject as `ignore`
  and only on the second press, and a `defaulted_finish_date` item confirming
  rather than reassigning. These are the tests whose absence let the defect
  live through 912 passing ones.
- `npx vitest run` — 106 passed. `npx tsc --noEmit` — clean.
- `python -m pytest -q` — 912 passed. `matching/` and `extraction/` are
  untouched, so `eval.py` is not implicated.

### Affected Areas
`frontend/src/pages/Reconcile.tsx`, `frontend/src/lib/api.ts`,
`frontend/src/types.ts`, `frontend/src/test/reconcile.test.tsx`,
`server/schemas.py`, `server/main.py` (`get_review_queue` projection only).

### Trade-offs / Consequences
The generated activity id is not a planner's own naming. It is unique, stable
and legible about its origin (`NEW-PIP-…`), but it will not match a WBS code
anyone outside NAVIS would recognise; the created activity also carries the
placeholder `wbs_path` `1.99.99.1` the server has always assigned. That is the
cost of making the action work without adding a control the design spec does
not contain, and it is the thing to revisit when the screen next gains a field.

---

## 2026-09-04 / D-074 — The health check's endpoint count is pinned to the real surface

### Context
`scripts/healthcheck.py` asserted `n_endpoints == 8` against `/openapi.json`.
The API has 30 operations (D-072 counted them independently), so the check had
been reporting `[FAIL] GET /openapi.json (/docs)` on every run against a
perfectly healthy server, for as long as the surface has been larger than 8.

### Decision
Pin the expected count to 30 and say so in the output
(`30 endpoints exposed, expected 30`). Deliberately a pinned equality, not a
`>=` floor: the value of the check is that an operation appearing or
disappearing unnoticed trips it. A floor would have silently tolerated exactly
the drift the check exists to catch, and would also have hidden the removal of
an endpoint.

The cost is that adding an endpoint now requires updating one number. That is
the intended friction — it is the moment to ask whether the new operation
belongs in `FLOW.md` too.

### Alternatives Considered
- **Drop the assertion and only check status 200.** Rejected: that reduces the
  check to "the server answers", which the other 29 checks already establish.
- **Change it to `>= 8`.** Rejected for the reason above.

### Verification
`python scripts/healthcheck.py` against a locally running
`uvicorn server.main:app` — 31 passed, 0 failed. It had been 30 passed,
1 failed before the change.

### Affected Areas
`scripts/healthcheck.py`.

---

## 2026-09-04 / D-075 — D-061 is re-affirmed, and now pinned on the served engine

### Context
A change to `server/main.py :: get_matching_engine()` was proposed: take a
`Session`, read every `AliasLexicon` row into a `{alias_key: [activity_id]}`
dict, and pass it to `production()` with `w_alias=1.0`. This is the alias
learning loop D-061 measured and closed as CLOSED-AS-MEASURED. It has now been
proposed twice.

The proposal also could not have run. Recorded here because the next reader
deserves the specifics rather than a verdict:

- `AliasLexicon` has no `raw_text` or `target_activity_id`; the columns are
  `source_text` and `mapped_activity_id`.
- `production()` takes one argument, `baseline_sha256`. It has no
  `alias_lexicon` or `w_alias` parameter.
- `w_alias` is not on `EngineConfig` at all — it is on
  `EngineConfig.retrieval` (`RetrievalConfig`).
- The lexicon value shape is `[(activity_id, weight), ...]`;
  `HybridRetriever.alias_channel` unpacks each hit as a pair. A list of bare
  id strings raises at retrieval time, not at construction.
- `MatchingEngine(config=...)` omits the required positional `schedule_path`,
  and drops both `thresholds=MATCHING_THRESHOLDS` and the prebuilt `index`.
- It declared `global _matching_engine` — the singleton is `_MATCHING_ENGINE` —
  and never assigned it, so every one of the six call sites would rebuild
  `ScheduleIndex.from_json` per call.
- `DEFAULT_BASELINE_SHA256` does not exist. The current code takes the sha off
  the loaded index precisely because the active baseline is swappable at
  runtime (`server/test_baseline.py`); a module constant would go stale.

### Decision
No change to `get_matching_engine()`. D-061 stands: `w_alias` remains 0.0, the
read path stays unwired, and `alias_lexicon` rows remain what that entry says
they are — the audit record of planner decisions and the training data any
ranking-stage version would be fitted on.

What is new is enforcement. `matching/test_config_floor.py` pins the library
DEFAULTS, and it cannot see `server/main.py`. Every version of this proposal
would have left those assertions green while switching the channel on inside
the server. `server/test_server.py::TestServedEngineKeepsTheAliasChannelOff`
now asserts against the engine `get_matching_engine()` actually returns:
`config.alias_lexicon is None`, `retriever.alias_lexicon == {}`,
`retrieval.w_alias == 0.0`, and — because every version of the proposal has
also dropped it — that the engine is the same object across two calls.

### Alternatives Considered
- **Fix the six defects and wire it anyway, to show the +0.00 in-repo.**
  Rejected. D-061 measured it three independent ways, including one that is
  architectural rather than empirical: the alias channel is a RETRIEVAL
  channel and fusion recall@20 is already 100% (D-027), so the gold activity
  is always in the pool and no retrieval channel has anything left to add.
  Re-deriving that costs a slower startup and a `w_alias` that would then be
  live in a config a later reader might trust.
- **Close the loop in ranking now.** Deferred, not rejected — it remains the
  right shape, per D-061's own diagnosis: a correction-derived feature in
  `matching/features.py` expressing a prior over *activities*, generalising
  across mentions rather than keying on exact text. It needs `eval.py` and the
  100% auto-link precision floor has to hold, so it is its own task.

### Verification
`python -m pytest server/test_server.py -k "AliasChannelOff or LinkingEngine"`
— 6 passed. No production code changed, so `eval.py` is not implicated.

### Affected Areas
`server/test_server.py` (new test class only). No application code changed.

---

## 2026-09-04 / D-076 — The delay taxonomy is built, and liability is a lookup a human can audit

### Context
`ARCHITECTURE.md §2.7` specified a ten-category delay taxonomy — `MATERIAL`,
`MANPOWER`, `DRAWING_RFI`, `PERMIT_HSE`, `WEATHER`, `EQUIPMENT`, `CLIENT_HOLD`,
`REWORK_NCR`, `FRONT_NOT_AVAILABLE`, `OTHER` — and it was never built.
`Audit-1.md` F-04 verified that a grep for `DRAWING_RFI` returned nothing.
What shipped instead was a twelve-phrase substring list in `server/raid.py`
feeding a register `category` string and a frequency count.

This is Phase 0 of the delay-attribution layer ("Contractor Dispute Shield"):
the taxonomy and the liability map, with no behaviour change. The layer exists
because a PSU project's real pain is not the schedule slipping, it is the
multi-crore Liquidated Damages argument afterwards, and NAVIS already holds the
one thing that argument needs — an append-only audit trail where every write
cites the file, row and sentence behind it.

### Decision
A new `server/delay_taxonomy.py` holding three mappings, kept separate:

1. **`PHRASE_CATEGORY`** — delay phrase to `DelayCategory`.
2. **`LIABILITY`** — `DelayCategory` to `Liability`
   (`COMPENSABLE` / `NON_COMPENSABLE` / `EXCUSABLE` / `CONTESTED`).
3. **`REGISTER_CATEGORY`** — the pre-existing RAID `category` string, moved
   byte-for-byte.

The third exists so the move changes nothing: `propose_candidates()` still puts
"equipment" on a crane breakdown. A register category groups an issue for a
governance board; a `DelayCategory` is a contractual classification. They
disagree on purpose and are asserted to disagree.

**Liability is a table in source, never a model output.** This is D-006's rule
one level up. An LLM may later be asked to suggest a *category* for text the
phrase list does not recognise — classification is what a model is good at —
but category to liability is a lookup, reviewable in a diff and identical on
every run. A hallucinated tag corrupts a link; a hallucinated liability
corrupts a contractual position.

**Three categories have no default, by design.** `MATERIAL` is owner-supplied
on some packages and contractor-procured on others; `PERMIT_HSE` may sit with
either party depending on the contract; `OTHER` is the admission that the
taxonomy did not classify the text. All three resolve to `CONTESTED`, which a
planner adjudicates in Phase 2. Defaulting them would produce a number that
looks like a finding and is not one.

### Two classification calls worth defending
- **`"fencing conflict"` maps to `OTHER`, not `FRONT_NOT_AVAILABLE`.** This is
  the interesting one, because `FRONT_NOT_AVAILABLE` is compensable and the
  demo corpus's largest single slip is `CIV-DWG-1015`, 21 days, evidenced only
  as "Delayed by fencing conflict". Reading that as an owner-withheld work
  front would manufacture a 21-day claim against the client out of a sentence
  that never named a responsible party — and on this very corpus the blocking
  work, `CIV-FNC-1016` Fence & Gate, is itself a scheduled activity, so the
  clash is as likely internal as owner-caused. It routes to a planner.
- **`"holiday delay"` is `CONTESTED`, not `EXCUSABLE`.** A public holiday is
  usually already in the contract calendar, in which case it is not a delay at
  all. `EXCUSABLE` would grant an extension of time on no evidence.

### Consequence for the demo, stated rather than discovered
With these two calls the compensable bucket is **empty on the current corpus**.
That is the correct output for this evidence: no field report in
`dataset/` describes an owner-caused delay. The fix belongs in the corpus, not
in the mapping — one DPR line describing a genuine drawing hold (`ARCHITECTURE`
uses "hold due to rfi pending on isometric rev 2" as its own example) would
populate the bucket honestly. Weakening the mapping to fill it would be exactly
the overclaim this project's rules exist to prevent.

### Alternatives Considered
- **Merge the register category and the taxonomy into one map.** Rejected: it
  would silently change every RAID candidate's `category`, and the two answer
  different questions.
- **Let the LLM assign liability directly.** Rejected under D-006's reasoning.
  The classifier's place is widening RECOGNITION of unrecognised phrases,
  guarded by `EXTRACTION_PROVIDER` as extraction already is (D-005).
- **Map `"fencing conflict"` to `FRONT_NOT_AVAILABLE` for a better demo.**
  Rejected. It is the single most attackable claim the feature could make, and
  an Oil India scheduler is exactly the reader who would ask who owned the
  fence.

### Verification
`python -m pytest -q` — 959 passed, up from 915. The 44 new tests are
`server/test_delay_taxonomy.py`, which asserts the table itself: every category
has a liability, the three unknowable ones stay `CONTESTED`, unknown input
fails safe to `CONTESTED`, every keyword is classified, and all twelve register
categories are unchanged by the move. `matching/` and `extraction/` are
untouched, so `eval.py` is not implicated.

### Affected Areas
`server/delay_taxonomy.py` (new), `server/test_delay_taxonomy.py` (new),
`server/raid.py` (vocabulary moved and re-exported; `_CATEGORY` lookup replaced
by `register_category_for_phrase`), `eval_real.py` (a stale pointer to
`_compute_delay_reasons` corrected, and its deliberate copy explained).

### Trade-offs / Consequences
`server.raid.DELAY_KEYWORDS` is now a re-export rather than the definition. It
is kept because several modules and tests import it from there, and the test
suite asserts the two are the same object so the list cannot fork.

---

## 2026-09-04 / D-077 — A delay becomes a row, so a planner has something to overrule

### Context
Phase 1 of the delay-attribution layer. D-076 built the taxonomy; the delay
text itself was still only ever counted at read time, by
`server.raid.delay_evidence`, for the Memory screen and the RAID candidates.

A count cannot carry a decision. The whole point of the Contractor Dispute
Shield is that a planner can overrule the proposed liability on a specific
delay, and an overruled delay needs an identity for the ruling to attach to.
Recompute a count and the decision has nowhere to live.

### Decision
A `DelayEvent` table, materialised from the audit trail by
`server/delay_events.py :: sync_delay_events`, plus a read-only
`GET /delay/attribution`.

**One scan, not two.** `raid.delay_evidence` used to scan `AuditRecord` text
itself. It was split into `delay_observations()` — the scan, returning one
entry per (phrase, activity, source file, span) with the audit rows behind it —
and `delay_evidence()`, which aggregates that per phrase and keeps its previous
return shape exactly. The attribution layer materialises the same
observations. Nothing re-implements the match, which is the mistake D-048 was
written about, and the two can no longer disagree.

**The Memory screen keeps computing at read time.** It gained `category` and
`liability` from the pure taxonomy lookups, not from `DelayEvent` rows. A
frequency needs no identity, and a read-time count must not silently depend on
whether a sync has run.

**The sync is idempotent and never touches a ruling.** It is keyed on the
observation identity and re-runs on every ingest and every resolution, updating
the derived columns — `category`, `impact_days`, `month`, the citation — in
place. `liability_final` and the adjudication columns are deliberately absent
from what it writes: a re-classification that silently reset a planner's
decision on the next file upload would be exactly the audit failure this
feature exists to prevent. Asserted by
`test_a_ruling_survives_a_re_sync`.

**`GET /delay/attribution` writes nothing.** Materialising on read would hide
when the work happened and make two identical requests do different amounts of
writing. The write points are the two places that can create a delay or move a
variance: the ingest roll-up, and `POST /review/{id}/resolve` including the
withheld-finish path. A database that has not ingested since this landed
returns an empty matrix, which `scripts/reset_demo.py` fixes by re-ingesting —
the project's standing preference for a reset over a migration.

**Two totals, always both.** `proposed_days` counts every row at its effective
liability; `adjudicated_days` counts only rows a planner has ruled on. Sending
only the first would dress machine proposals up as findings; only the second
would hide the queue. The upper-bound caveat on `impact_days` and the meaning
of an unadjudicated row travel in the response body, not only in these docs, so
a client cannot render either without them.

### On `month`
`ARCHITECTURE.md §2.7` said `month` "enables seasonality / historical-delay
queries" and it was never built — `Audit-1.md` F-04 named its absence as the
reason the system could not answer what monsoon costs on civil work. It is the
month the affected activity concluded: actual finish when there is one,
planned finish otherwise, and NULL for work still in progress rather than the
month the report happened to be read. A multi-month activity is credited to the
month it ended, a simplification the report states rather than hides.

### Measured on the demo corpus
After `scripts/reset_demo.py`, four delay events across 275 audit records:

```
CIV-DWG-1015  fencing conflict      OTHER      CONTESTED        21d  2026-09
CIV-FLR-1020  holiday delay         OTHER      CONTESTED        20d  2026-08
CIV-PLY-1004  piling rig breakdown  EQUIPMENT  NON_COMPENSABLE   1d  2026-07
CIV-PLY-1006  rain delay            WEATHER    EXCUSABLE         1d  2026-07

proposed_days   COMPENSABLE 0 · NON_COMPENSABLE 1 · EXCUSABLE 1 · CONTESTED 41
days_by_month   2026-07: 2 · 2026-08: 20 · 2026-09: 21
```

41 of 43 days are contested, which is the honest reading of this evidence and
follows directly from D-076's refusal to read "fencing conflict" as an
owner-withheld work front. The compensable bucket stays empty until the corpus
carries a genuine owner-side delay.

### Alternatives Considered
- **Compute the matrix at read time like the RAID candidates.** Rejected: a
  planner's ruling would have nowhere to live, which is the entire feature.
- **Sync inside the GET.** Rejected as above; it also makes the endpoint's cost
  depend on how stale the caller is.
- **Have the Memory screen read `DelayEvent` rows too.** Rejected: it would
  make a working screen depend on a sync having run, for a number that does not
  need identity.
- **Key rows on the audit record id.** Rejected. One spreadsheet row writes
  actual_start, actual_finish and actual_qty, so that keying reports one delay
  three times — the exact bug D-071 fixed in the counter.

### Verification
`python -m pytest -q` — 974 passed, up from 959. The 15 new tests are
`server/test_delay_attribution.py`: idempotent sync, one observation to one
row, two causes on one activity as two rows, earliest-record citation,
`impact_days` tracking a variance change, `month` derivation, rulings excluded
from and included in the right totals, a ruling surviving a re-sync, the
endpoint's caveats present in its payload, discipline filtering, and that the
GET writes nothing.

`scripts/reset_demo.py` then `scripts/healthcheck.py` against a running server
— 31 passed, 0 failed. `matching/` and `extraction/` untouched, so `eval.py` is
not implicated.

### Affected Areas
`server/db.py` (`DelayEvent`), `server/delay_events.py` (new),
`server/test_delay_attribution.py` (new), `server/raid.py`
(`delay_observations` / `finish_slip_by_activity` split out),
`server/main.py` (endpoint, two sync call sites, `_compute_delay_reasons`),
`server/schemas.py`, `server/demo.py` (`clear_progress`),
`scripts/healthcheck.py` (endpoint count 30 → 31, per D-074's pinning rule).

### Trade-offs / Consequences
`impact_days` remains an upper bound: an activity's whole finish slip is
credited to every cause recorded against it, so the figures do not sum to a
project total. Making it exact needs float consumption, which nothing here
computes yet. The response says so in its own body rather than leaving a reader
to assume otherwise.

---

## 2026-09-04 / D-078 — A liability becomes a finding only when a planner rules, and the ruling is audited

### Context
Phase 2 of the delay-attribution layer. D-076 built the taxonomy and D-077 made
each delay a row carrying a proposed liability. Nothing so far turns a proposal
into a finding, and a report that totalled the proposals would be presenting
machine output as a contractual position.

### Decision
`POST /delay/{delay_event_id}/classify`. A planner names the liability; NAVIS
records it and appends an `AuditRecord`.

**The ruling is audited, not merely stored.** Every call writes a record with
`field_changed="delay_liability"`, `source="planner_review"` and
`auto_applied=False`, carrying the previous answer in `old_value`, the new one
in `new_value`, and the delay's own citation - source file, line, row and span.
Setting the column alone would leave the register saying WHAT was decided and
never who decided it, when, or against what. `contributing_sources` carries the
category, the phrase it was classified from, the proposal being ruled on, and
the planner's note, so the reasoning is legible without a join.

**There is no "accept the proposal" shortcut.** A planner who agrees with the
machine sends the same value it proposed, and the response says
`overrides_proposal: false`. The alternative - a one-click accept that writes
nothing - would leave the trail unable to distinguish a decision a human made
from a default nobody ever read. That distinction is the entire evidential
value of the feature.

**Re-ruling is allowed and appends.** Evidence arrives late on a real project.
A second call writes a second record whose `old_value` is the first ruling, so
an overturned decision reads as an overturned decision rather than as a value
that quietly changed (D-004). Refusing a second ruling would push the
correction into a spreadsheet nobody can audit, which is worse.

**An unrecognised liability is a 400, not a coercion.** `parse_liability`
accepts the four enum values case-insensitively and nothing else. This is the
one value in the system a human types directly, and silently turning an
unknown string into `CONTESTED` would record a decision nobody made - the same
reasoning that keeps `MATERIAL` and `PERMIT_HSE` undefaulted in D-076.

### Demonstrated end to end
Against the demo corpus, on the row D-076 deliberately refused to claim:

```
BEFORE  adjudicated 0/4   adjudicated_days  all zero
POST /delay/{id}/classify  COMPENSABLE
  note "Fence handover was an owner obligation on this package; front withheld."
  -> "Delay on CIV-DWG-1015 ruled COMPENSABLE, overriding the proposed CONTESTED"
AFTER   adjudicated 1/4   adjudicated_days  COMPENSABLE 21
        proposed_days     COMPENSABLE 21 · NON_COMPENSABLE 1 · EXCUSABLE 1 · CONTESTED 20

audit  delay_liability: CONTESTED -> COMPENSABLE
       source=planner_review  auto_applied=False
       cites civil_progress.xlsx row 18, "Delayed by fencing conflict"
```

This is the whole argument in one exchange. The machine declined to claim 21
days against the client because the sentence named no responsible party; a
planner supplied the contractual fact the sentence could not, and the trail now
records the claim, the reason, the person and the source line.

### Alternatives Considered
- **A boolean `accept` flag alongside an `override` action.** Rejected: two
  code paths for one decision, and the accept path would have been the one
  nobody audited.
- **Store the ruling on `DelayEvent` alone.** Rejected. The column says what is
  true now; the audit row says how it got that way, which is what a claim is
  argued from.
- **Refuse a second ruling once adjudicated.** Rejected as above.
- **Let the sync clear a ruling when a re-classification changes the category.**
  Rejected outright - already asserted against in D-077. A planner's decision
  must not evaporate because someone uploaded a file.

### Verification
`python -m pytest -q` — 981 passed, up from 974. The 7 new tests cover: the
ruling recorded and audited, the audit row naming what it replaced and carrying
the citation, confirming-is-still-a-ruling, a second ruling appending with the
first as its `old_value`, the totals moving, an unknown liability refused with
no audit row written, and an unknown delay event returning 404.

`scripts/healthcheck.py` against a running server — 31 checks passed, 0 failed,
with the pinned endpoint count moved 31 → 32 per D-074.

`matching/` and `extraction/` untouched, so `eval.py` is not implicated.

### Affected Areas
`server/main.py` (endpoint), `server/delay_events.py` (`adjudicate`),
`server/delay_taxonomy.py` (`parse_liability`), `server/schemas.py`
(`DelayClassifyRequest` / `DelayClassifyResponse`),
`server/test_delay_attribution.py`, `scripts/healthcheck.py`.

### Trade-offs / Consequences
`adjudicated_by` is optional and unauthenticated, because this application has
no authentication - the same honest gap as `asked_by` on the clarification
endpoint. The audit row records whatever name the client supplies and nothing
verifies it. On a system that carried real contractual weight this field would
have to come from an identity provider, and that is worth saying out loud
rather than implying the name is proof of anything.

---

## 2026-09-04 / D-079 — The report states its own provenance and its own limits

### Context
Phase 3, and the last of the core layer. D-077 made each delay a row, D-078 let
a planner rule on it. Everything so far lives inside the application; a
Liquidated Damages argument is had over a document.

### Decision
`GET /delay/report`, rendering one computation two ways from
`server/delay_report.py`: a printable HTML document and a CSV of the same rows.
Read-only, like `GET /delay/attribution` — it renders what the ingest and
resolution paths already wrote.

Three properties make it a document rather than a dump, and each is a decision:

**1. It names the schedule it was computed against.** Data date, baseline name,
filename and full sha256, plus the sample size — "67 of 120 activities carry
actual dates". Two baselines ship and they share no activity ids, so "21 days
on CIV-DWG-1015" is unattributable without them. `Audit-1.md` recommended
stating sample size before a judge asks; this does it in the header.

**2. Every figure carries its citation.** Source file, row or line, and the
verbatim sentence, beside the activity and the category. A delay attributed
without the document behind it is an assertion; with it, it is evidence.

**3. It states its limits on its face.** Four caveats print on every rendering:
days are attributed and not measured, an unruled row is a proposal, detection
recognises a fixed phrase list, and rulings are not authenticated. They live in
one `CAVEATS` constant rather than in a template, so the two formats cannot
drift into saying different things about the same numbers.

### On the shapes
**The CSV repeats the provenance stamp on every row.** RFC 4180 has no comment
syntax, so a preamble would break parsers; repetition means a single row pasted
into an email still names the schedule version and data date it was true for.
It also carries `liability_proposed` and `liability_ruled` as separate columns,
so an override is readable as an override in the export and not only in the
document.

**The HTML is self-contained.** No external stylesheet, no script, no font
host, `@page` sized to A4. A document attached to a contractual letter has to
survive being saved, emailed and printed by someone with no network. It is
served inline rather than as an attachment, because the browser's own print
dialog is the route to a PDF and adding a PDF engine to this project would buy
nothing the print dialog does not already do.

**An empty bucket prints "No delays attributed here on this evidence."** A
missing section reads as an oversight; an explicit statement reads as a
finding, which is what it is. On the demo corpus this matters: the compensable
bucket was empty until a planner ruled on `CIV-DWG-1015`, and that emptiness
was the honest output of D-076's refusal to guess.

### What it produces today
Against the demo corpus, with the one ruling made in D-078:

```
Data date 2026-09-15 · baseline_schedule.json · sha256 1bfde358dc0e1a12...
67 of 120 activities carry actual dates · 4 delays, 1 carries a ruling

                                              ruled   incl. proposals  count
Compensable — owner responsibility               21                21      1
Non-compensable — contractor responsibility       0                 1      1
Excusable — neither party                         0                 1      1
Contested — awaiting a planner's ruling           0                20      1
Total                                            21                43      4

Days by month  2026-07: 2 · 2026-08: 20 · 2026-09: 21
```

The compensable row prints the ruling underneath the evidence: *"Ruled by Priya
Das, overriding the proposed CONTESTED"*, then the planner's own words, then
`civil_progress.xlsx, row 18`.

### Alternatives Considered
- **Generate a PDF server-side.** Rejected: a print stylesheet and the
  browser's dialog produce the same artefact, and a PDF library is a
  dependency, a font-embedding problem and a rendering surface to maintain.
- **Write the CSV provenance as a comment preamble.** Rejected — see above.
- **Reuse the `POST /schedule/export` + `/uploads/{filename}` download flow.**
  Rejected: that exists because a Primavera export is a generated artefact
  worth keeping on disk. This report is a view of live rows and should never be
  stale; streaming it means the document can never disagree with the database.
- **Omit empty liability sections.** Rejected — see above.

### Verification
`python -m pytest -q` — 993 passed, up from 981. The 12 new tests assert the
provenance stamp in both formats, the "not recorded" fallback when no baseline
row exists, the citation reaching the page, the caveats printing, an unruled
row marked as a proposal, a ruling printed with its reason and author, the
empty-bucket statement, the CSV stamp repetition, proposal and ruling as
separate CSV columns, discipline filtering, an unsupported format refused, and
that the two formats agree on the totals.

`scripts/healthcheck.py` against a running server — 33 endpoints exposed,
expected 33, per D-074's pinning rule. The rendered document was reviewed in a
browser. `matching/` and `extraction/` untouched, so `eval.py` is not
implicated.

### Affected Areas
`server/delay_report.py` (new), `server/main.py` (endpoint, `Response` import),
`server/test_delay_attribution.py`, `scripts/healthcheck.py` (32 → 33).

### Trade-offs / Consequences
The report has no page numbers, no signature block and no letterhead, because
NAVIS does not know the project's contract references or the parties' legal
names. Adding placeholders for them would make the document look more official
than its contents justify, which is the opposite of what every other decision
here is for. It is an evidence appendix, and it should read as one.

---

## 2026-09-04 / D-080 — The notice clock starts from a date a source asserted, and says which

### Context
Phase 4. A delay only entitles anyone to anything if notice was given inside
the contractual window; a claim served late is commonly barred outright,
whatever the merits. NAVIS knows when each delay was evidenced, so it can say
which windows have already closed - and that is the cheapest high-value thing
left in the plan.

The whole feature turns on one question: **which date does the clock start
from?** Get it wrong and the report accuses a contractor of missing a deadline
that never ran.

### Decision
Four columns on `DelayEvent` - `evidenced_on`, `evidenced_basis`,
`notice_due_on`, plus the planner-supplied `notice_served_on` /
`notice_reference` - a `NOTICE_WINDOW_DAYS` constant, a `notice_status`
function, and `POST /delay/{id}/notice`.

**The clock starts from the date the field report carried.**
`LinkedEvent.reported_date` is the only candidate a source actually asserted.
The obvious alternative, `AuditRecord.timestamp`, records when NAVIS ingested
the file: on the demo corpus every delay was ingested on 2026-09-04, so every
clock would have started on the same day and the whole feature would have been
an artefact of when someone ran the loader.

**`evidenced_basis` says which kind of date it was.** `REPORTED` is an
assertion by a source. `ACTUAL_FINISH` is an inference - the project cannot
have learned of the delay later than the day the work ended, but it may well
have learned earlier. `RECORDED` is the ingestion date and the weakest of the
three. This is `DateBasis` (D-010, ARCHITECTURE §2.3) applied to a different
kind of date, for the same reason: a reader has to be able to see how firm the
ground under a number is.

**No `as_of` date means `UNKNOWN`, never today.** `attribution()` takes the
date the windows are judged against and the endpoint passes `DATA_DATE`
explicitly. Reaching for `date.today()` would make a lapsed claim an artefact
of when the report was opened.

**28 days, from FIDIC 1999 Sub-Clause 20.1, as a stated default.** The clause
requires notice "not later than 28 days after the Contractor became aware, or
should have become aware, of the event". Indian PSU general conditions commonly
shorten it. It is a module constant so that the number is something a person
chose and can point at, and both the API payload and the printed report name
the source and say the governing contract may differ.

**`POST /delay/{id}/notice` exists so the clock can stop.** Without it every
delay would read as un-noticed forever and the feature could only accuse. A
notice dated after the window closed is accepted and flagged `served_late`
rather than refused - a late notice is a fact about the project, and refusing
to record it would push the correction somewhere nobody can audit. Audited like
every other planner decision: `field_changed="delay_notice"`,
`source="planner_review"`, `auto_applied=False`, re-recording appends with the
previous date in `old_value`.

**`notice_served_on` and `notice_reference` survive a re-sync**, alongside
`liability_final`. Same rule, same reason.

### Measured on the demo corpus
```
window 28 days · judged as at 2026-09-15 · basis REPORTED on all four

CIV-DWG-1015  fencing conflict      evidenced 2026-09-02  due 2026-09-30  OPEN    +15d
CIV-FLR-1020  holiday delay         evidenced 2026-08-23  due 2026-09-20  OPEN     +5d
CIV-PLY-1004  piling rig breakdown  evidenced 2026-07-02  due 2026-07-30  LAPSED  -47d
CIV-PLY-1006  rain delay            evidenced 2026-07-13  due 2026-08-10  LAPSED  -36d
```
Two windows are already closed and one of the open two has five days left. None
of that was visible anywhere in the system before this phase.

### Alternatives Considered
- **Start the clock from `AuditRecord.timestamp`.** Rejected — see above. It is
  the easiest date to reach and the only one that measures the loader rather
  than the project.
- **Start it from the activity's planned finish.** Rejected: that is the date
  the delay began to accrue, not the date anyone knew about it, and notice runs
  from awareness.
- **Default `evidenced_on` to the data date when nothing better exists.**
  Rejected outright. Every row would then have a window, and some of those
  windows would be fiction. `UNKNOWN` is the honest output.
- **Refuse a notice dated after the deadline.** Rejected — see above.
- **Ship the clock without a way to record a notice.** Rejected: a clock that
  cannot be stopped is an accusation generator, not a report.

### Verification
`python -m pytest -q` — 1010 passed, up from 993. The 12 new tests cover the
REPORTED basis winning, the ACTUAL_FINISH fallback being labelled, lapsed and
open windows, `UNKNOWN` with no `as_of`, a notice recorded and audited, a late
notice accepted and flagged, re-recording appending with the previous date, a
notice surviving a re-sync, the matrix totalling lapsed days, and both
renderings of the report carrying the clock.

`scripts/reset_demo.py` then `scripts/healthcheck.py` against a running server
— 34 endpoints exposed, expected 34; 31 checks passed, 0 failed. The rendered
report was reviewed in a browser. `matching/` and `extraction/` untouched, so
`eval.py` is not implicated.

### Affected Areas
`server/db.py` (five columns plus their `_ADDED_COLUMNS` entries, so an
existing database migrates itself per D-070), `server/delay_events.py`,
`server/delay_report.py`, `server/main.py`, `server/schemas.py`,
`server/test_delay_attribution.py`, `scripts/healthcheck.py` (33 → 34).

### Trade-offs / Consequences
NAVIS holds no notice register of its own, so `LAPSED` means precisely "no
notice has been recorded here" and not "no notice was given". The report says
that in its caveats and the alarm line repeats it. On a project where notices
live in a correspondence system, this column is a prompt to go and check, never
a finding on its own.

---

## 2026-09-04 / D-081 — Concurrent delay is named, cited, and never apportioned

### Context
Phase 5. Concurrent delay is the crux of most Liquidated Damages arbitrations:
when an owner-side cause and a contractor-side cause are open over the same
period, neither party's letter settles it, and a planner who rules on the two
separately without noticing the overlap has produced two findings that
contradict each other.

### Decision
`delay_events.concurrency(db, rows)`, folded into the `GET /delay/attribution`
response and printed as its own section of the report. No new endpoint: this is
part of the matrix, not a separate question.

**It refuses to allocate.** NAVIS names the overlap, cites both sides, states
what the overlap means for liability, and stops. Splitting concurrent delay
between parties is a matter for the contract and the parties. A system that
confidently apportioned it would be a system no scheduler would believe, and
the refusal is the part worth demonstrating.

**Two kinds, and only one of them is decisive.** `SAME_ACTIVITY` is
definitional: two causes recorded against one slipped activity share its
overrun by construction and nothing in the evidence divides it. That IS the
dispute. `OVERLAPPING_WINDOW` is temporal only - two delays on different
activities ran at the same time, but whether BOTH moved the completion date
needs the critical-path pass Phase 6 would add. The kind is carried on every
pair and printed on every row, so a reader never has to guess which kind of
claim is being made. Presenting a temporal overlap as a finding about the
completion date would be exactly the overclaim this project's rules exist to
prevent.

**Three statuses, including one that is not a problem.** `CONFLICT` is two
attributed sides with different outcomes. `UNRESOLVED` is at least one side
still `CONTESTED` - surfaced BEFORE the ruling, because that is when it is
useful. `ALIGNED` is the same attribution on both sides, reported anyway,
because "we looked and it is fine" is a different statement from silence.

**A delay's period is its activity's overrun.** Planned finish to actual
finish. This is the only window the data supports: a daily report states a
cause, never a duration. An activity that finished on or before plan has no
window at all, so finishing early cannot manufacture an overlap.

**Days are not summed across a pair.** Each side already carries its
activity's whole slip as an upper bound (D-077); adding them would compound one
overstatement with another. Overlap days are counted inclusively - a delay open
on both the 12th and the 13th was concurrent for two days.

**The list is capped, the count is not.** Pairing is O(n²) in the number of
delays. `total_pairs` is always exact and `pairs` carries the fifty longest. A
report that silently truncated its own total would be worse than one that
printed a thousand rows.

### Demonstrated end to end
On the demo corpus there is exactly one overlap, and it changes meaning as the
planner works:

```
before any ruling
  OVERLAPPING_WINDOW  UNRESOLVED  2026-08-12 .. 2026-08-23  (12 days)
    CIV-DWG-1015  fencing conflict  [CONTESTED]
    CIV-FLR-1020  holiday delay     [CONTESTED]

after CIV-DWG-1015 ruled COMPENSABLE
  UNRESOLVED still - the other side is unruled

after CIV-FLR-1020 ruled NON_COMPENSABLE
  CONFLICT  CIV-DWG-1015 [COMPENSABLE] vs CIV-FLR-1020 [NON_COMPENSABLE]
            12 days in which the owner is liable on one activity and the
            contractor on another, simultaneously
```

Two rulings that each look sound in isolation produce a twelve-day period
neither party can claim cleanly. Nothing before this phase would have shown
that.

### Alternatives Considered
- **Apportion concurrent delay, even crudely.** Rejected. There is no
  defensible split rule that does not depend on the contract, and offering one
  would discredit every other number in the report.
- **Only detect same-activity concurrency.** Rejected as too narrow: it would
  have found nothing on this corpus and, more importantly, a scheduler looks at
  the calendar first. The temporal kind is included and labelled as the weaker
  claim it is.
- **Treat any overlap as a conflict.** Rejected: two delays both attributed to
  weather are not a dispute, and crying conflict over them would train a reader
  to ignore the section.
- **A separate `GET /delay/concurrency`.** Rejected: it is one more endpoint
  answering a question the matrix should already answer, and a client that
  fetched one without the other could render a matrix that hid its own
  contradictions.

### Verification
`python -m pytest -q` — 1020 passed, up from 1010. The 10 new tests cover the
same-activity kind and its inclusive day count, the overlapping-window kind and
its labelling, non-meeting windows, an early finish producing no window,
conflict and aligned classification, the UNRESOLVED-to-CONFLICT transition
across two rulings, the empty case still being present in the payload, and both
the report's overlap section and its no-overlap statement.

`scripts/healthcheck.py` against a running server — 34 endpoints exposed,
expected 34 (no new endpoint), 31 checks passed. The rendered report was
reviewed in a browser. `matching/` and `extraction/` untouched, so `eval.py` is
not implicated.

### Affected Areas
`server/delay_events.py` (`concurrency`, `ConcurrencyKind`,
`ConcurrencyStatus`, `_overrun_window`), `server/schemas.py`
(`ConcurrentDelayPair`, `DelayConcurrency`), `server/main.py` (projection),
`server/delay_report.py` (section and a sixth caveat),
`server/test_delay_attribution.py`.

### Trade-offs / Consequences
Using the activity's overrun as the delay's period is a simplification, and a
real one: two causes recorded against the same activity are treated as running
for its whole slip even if one was resolved on day two. The data does not
support anything finer - a daily report names a cause, not a window - and the
report says the overlap is a period of exposure rather than a measurement.
Making it finer needs per-cause start and end dates that no source in this
system currently produces.

---

## 2026-09-04 / D-082 — Lateness is not delay: the slip is split against baseline float

### Context
Phase 6, the last of the plan. Since D-077 `impact_days` has carried an
"upper bound" caveat, because an activity's whole finish variance was credited
to every cause recorded against it. Liquidated damages do not attach to
lateness; they attach to lateness that moved the completion date. Six days late
with four days of float is two days of project delay, and only those two are
claimable.

### Decision
`server/cpm.py`: a forward and backward pass over the baseline - planned
durations and the logic ties already on `Activity.predecessors` - producing
early and late dates, total float and criticality. `split_slip` divides each
finish variance into `float_consumed_days` and `beyond_float_days`, both stored
on `DelayEvent` and derived on every sync.

**`beyond_float_days` is reported beside `impact_days`, never instead of it.**
A reader has to be able to see how much of the headline figure the schedule
absorbed. Replacing the number would hide the arithmetic that makes the smaller
one credible.

**Float that could not be established credits no slack.** `split_slip(slip,
None)` returns `(0, slip)`, and a negative float is treated as zero available
slack. This is the one place where the conservative direction matters: crediting
slack that was never proved would understate a real claim, which is a worse
error than overstating one that the caveats already qualify.

**It is baseline float, and every consumer says so.** Float remaining at the
moment a delay struck needs a time-impact analysis - a series of updated
schedules, each re-run at the date of the event. NAVIS holds one baseline and
one set of actuals. What it can say honestly is how much slack the PLAN gave an
activity, which is the figure a claim is checked against first. The API carries
`float_basis`, the report prints it as a caveat.

**Calendar days, stated rather than assumed.** `Activity.calendar` exists and
nothing populates it. A five-day working week would produce different float, so
`calendar_basis` says which convention was used.

**Cycles and dangling ties are reported, not papered over.** Activities in a
logic loop are excluded and named; predecessors that name an activity outside
the schedule are listed. A float figure from a half-traversed graph would be
worse than an admission.

### The finding this surfaced about the baseline itself
The pass revealed that `dataset/baseline_schedule.json` **breaks 27 of the 146
logic ties it states** - successors that begin before their FS predecessor
finishes - so the logic network finishes on 2026-10-12 against an authored
latest finish of 2026-09-28. This is what a schedule dated by hand and tied up
afterwards looks like.

Both numbers are reported and neither is quietly preferred:
`network.project_finish`, `network.authored_finish`, `network.logic_conflicts`.
The report raises it on its face and says float is advisory until the two are
reconciled. Silently choosing one half of the baseline to believe would have
been the easy path and the wrong one, on a document whose whole purpose is to
be checkable.

### What it does to the demo corpus
```
proposed days   COMPENSABLE 0 · NON_COMPENSABLE 1 · EXCUSABLE 1 · CONTESTED 41
beyond float    COMPENSABLE 0 · NON_COMPENSABLE 1 · EXCUSABLE 0 · CONTESTED  0

CIV-DWG-1015  fencing conflict      21d slip · 100d float · 0d beyond
CIV-FLR-1020  holiday delay         20d slip ·  57d float · 0d beyond
CIV-PLY-1004  piling rig breakdown   1d slip ·   0d float · 1d beyond · CRITICAL
CIV-PLY-1006  rain delay             1d slip ·  27d float · 0d beyond
```
**Of 43 recorded days, one could have moved the completion date** - and it is
the one-day rig breakdown, not either of the three-week slips. That inversion
is the whole argument for the phase: the two delays that look serious cost the
project nothing, and the trivial-looking one is the only claimable day.

### Concurrency is upgraded, carefully
A `ConcurrentDelayPair` now carries `both_beyond_float`. Until this phase an
`OVERLAPPING_WINDOW` pair was temporal only, because criticality could not be
established (D-081). It still is temporal on its own - but where BOTH sides
outran their own float, each could have moved the finish, and that is a claim
about the completion date rather than about the calendar. It is a separate flag
rather than folded into the kind because it is false far more often than the
overlap itself.

### Alternatives Considered
- **Take the authored planned dates as early dates and derive float from the
  backward pass alone.** Rejected: on this baseline 27 ties are already broken,
  so it would produce widespread negative float and make "critical" meaningless.
- **Silently relax the violated ties.** Rejected outright. That is choosing
  which half of the baseline to believe, without saying so.
- **Replace `impact_days` with `beyond_float_days`.** Rejected: the smaller
  number is credible precisely because the larger one is shown beside it.
- **Assume full float when it cannot be computed.** Rejected — see above.
- **Implement a proper time-impact analysis.** Not possible with one baseline
  and one set of actuals, and pretending otherwise would be the overclaim every
  other decision here exists to prevent.

### Verification
`python -m pytest -q` — 1056 passed, up from 1020. `server/test_cpm.py` is new
and carries 23 of them against hand-built networks, so a failure names the rule
it broke: each of FS/SS/FF/SF with and without lag, the FS fallback for an
unreadable type, a parallel branch carrying the difference as float, a cycle
reported rather than broken, a dangling tie named, an empty schedule, and every
branch of `split_slip`. A further 13 in
`server/test_delay_attribution.py` cover the wiring, the totals, the network
summary, both report formats and the concurrency flag.

`scripts/reset_demo.py` then `scripts/healthcheck.py` against a running server —
34 endpoints exposed, expected 34 (no new endpoint), 31 checks passed. The
rendered report was reviewed in a browser. `matching/` and `extraction/`
untouched, so `eval.py` is not implicated.

### Affected Areas
`server/cpm.py` (new), `server/test_cpm.py` (new), `server/db.py` (four columns
plus their `_ADDED_COLUMNS` entries), `server/delay_events.py`
(`network_summary`, float in the sync and the totals, `both_beyond_float`),
`server/delay_report.py` (Beyond float column, Baseline network block, per-row
float line, two caveats), `server/main.py`, `server/schemas.py`,
`server/test_delay_attribution.py`.

### Trade-offs / Consequences
Float is recomputed over the whole network on every sync rather than cached.
At 120 activities that is milliseconds; at ten thousand it would want a cache
keyed on the baseline sha256. Left simple deliberately - a cached float figure
that outlived a baseline re-import would be a wrong number in a claim, and that
is a worse failure than a slow one.

---

## 2026-09-04 / D-083 — The planner screen, and the design rule it could not follow

### Context
Phase 7, and the last of the plan. D-076 to D-082 built a chain that proposes:
a delay category, a liability, a notice window, a concurrency reading and a
float split. Every one of them is a proposal until a human rules, and until
this phase there was nowhere for a human to rule. That is the same gap `/raid`
had before D-048 gave it a screen — a detector proposing to nobody.

### Decision
`frontend/src/pages/Delay.tsx`, at `/delay`, in the planner lane. A queue of
classified delays on the left, the selected one on the right with its evidence,
its float split, its notice standing, the four ruling buttons and a notice
form. Concurrency and the baseline-network warning sit above both.

**The design rule this could not follow, stated rather than quietly broken.**
Every other planner screen reproduces a mockup in `Design/`; there is no mockup
for this one, and the existing ones are tool-generated Material 3 exports that
would be odd to imitate by hand. The layout is therefore assembled entirely
from the vocabulary the shipped screens already use — Reconcile's queue and
detail pane, Raid's panels, the same tokens and the same `ui` primitives.
Nothing new was invented, and the file says so at the top so the next reader
knows it is a house-style assembly and not a spec. If a mockup arrives, this
reproduces it instead.

**A proposal never renders as a finding.** Every unruled row carries the word
"proposal"; the detail pane shows `Proposed` and `Ruled` side by side so an
override reads as an override; the header separates days recorded from days
beyond float. The caveat text comes from the API's own `impact_days_basis`
rather than being restated in the frontend, so the screen cannot drift from
what the report says.

**The whole slip is shown beside the part that outran float.** "21d slip ·
absorbed by 100d float" and "1d slip · 1d beyond float · critical path". The
smaller number is credible precisely because the larger one is next to it —
the same reason D-082 kept both in the API.

**The baseline conflict is stated before the numbers that rest on it**, not
after. 27 broken ties, both finish dates, and the word "advisory".

**Two things are anchors, not `Button`s.** The report lives on the API origin
and `Button to=` renders a react-router `Link`, which would route internally.
They wear the secondary button's classes so the toolbar still reads as one row.

### Two defects found while building it
- **A flaky test of my own from earlier in this session.**
  `reconcile.test.tsx`'s resolve tests clicked Confirm as soon as
  "Ask Supervisor" appeared, but that renders when an ITEM is selected while
  Confirm stays disabled until the effect that picks a CANDIDATE has run.
  Alone the render settled first; in a parallel run the click hit a disabled
  button. `ready()` now waits for the state the tests actually depend on. This
  was passing by luck since the resolve fix, and would have failed on any
  loaded CI machine.
- **The composers cleared on the way in, not just on a move.** `Delay.tsx`
  cleared the note and notice fields whenever `selectedId` changed, including
  the initial auto-selection a render after the pane was already on screen —
  so anything typed in that window was wiped. It now clears only when the
  selection moves from one delay to another, which is the behaviour the
  comment always claimed.

### Alternatives Considered
- **Author a mockup in `Design/` first and build from it.** Rejected: the
  existing mockups are generated by a design tool the team runs, so a
  hand-written imitation would be a spec nobody agreed to, wearing the
  authority of the folder it sat in.
- **Block on a mockup.** Rejected: the backend proposals would keep having
  nowhere to go, and every part of this screen except its visual arrangement —
  the data wiring, the request bodies, the tests — survives a restyle.
- **An accept button that skips the ruling.** Rejected, per D-078. Confirming
  the proposal sends the same value and writes the same audit record.

### Verification
`npx vitest run` — 120 passed, up from 106. `delay.test.tsx` carries 14 of
them: proposals marked as proposals, the proposal shown beside a ruling, the
float split rendered both ways, the baseline conflict stated, a closed notice
window worded as "none recorded", the citation, both request bodies, an empty
note omitted rather than sent blank, a notice refused without a date, and the
composers clearing on a move.

`npx tsc --noEmit` clean, `npx vite build` clean, `python -m pytest -q` — 1056
passed. The screen was then driven live against the running API: it rendered
the four real delays with their float and notice lines, and a ruling made
through the UI moved the header from "0 carry a ruling" to "1 carries a
ruling", with `Proposed` and `Ruled` both on screen afterwards.

### Affected Areas
`frontend/src/pages/Delay.tsx` (new), `frontend/src/test/delay.test.tsx`
(new), `frontend/src/types.ts`, `frontend/src/lib/api.ts`,
`frontend/src/lib/role.ts`, `frontend/src/App.tsx` (route and nav entry),
`frontend/src/test/reconcile.test.tsx` (the flake), `.claude/launch.json`
(new — so the two servers can be started for a live check).

### Trade-offs / Consequences
The screen polls `GET /delay/attribution` every three seconds, matching the
other planner screens. That endpoint recomputes the critical path on each call
(D-082), so at 120 activities it is milliseconds and at ten thousand it would
need the cache D-082 already names as the next step. Worth knowing before this
is pointed at a real schedule.

---

## 2026-09-05 / D-084 — Earned value reads the quantity the roll-up already measured

### Context
Phase 0 of the Granularity Resolution Engine, and a defect rather than a
feature. `RollupAccumulator` has always measured installed against planned
quantity — that is how "40 m of 120 m planned" becomes 33% — and writes the
result to `Activity.actual_qty`. `percent_complete` in `server/evm.py` never
read it. Its precedence was `actual_finish` → `max(LinkedEvent.percentage)` →
0% floor.

So an activity whose only evidence was a measured quantity fell to the floor.
On the seeded corpus that is **eleven in-progress activities, five of them
complete by quantity**, scored 0% and counted as unevidenced:

```
ELE-CBL-1076   quantity  66.7%   evm 0.0%   (no_evidence_floor)
PIP-INS-1045   quantity 100.0%   evm 0.0%
ELE-SWG-1082   quantity 100.0%   evm 0.0%
INS-TRN-1097   quantity  22.2%   evm 0.0%
…7 more
```

Earned value was understated, SPI with it, and the executive Overview's
unevidenced-activity banner was counting activities that had evidence.

### Decision
A quantity rule, inserted above the asserted percentage and below
`actual_finish`:

```
1. actual_finish set                       -> 100%
2. installed / planned quantity, capped    -> that ratio      NEW
3. max(LinkedEvent.percentage)             -> that value
4. otherwise                               -> 0% floor
```

**Quantity outranks an asserted percentage, mirroring the roll-up.**
`RollupAccumulator` already prefers a measured quantity over a stated one, for
the reason that decides it here too: a quantity is a measurement against a
planned scope, a percentage is somebody's estimate of one. On this corpus the
two mostly agree — 71.0/71.0, 66.7/66.7, 87.5/87.5 — because the roll-up
derived the percentage from the quantity in the first place. Where they differ
the quantity is the later, cumulative reading: `ELE-CBL-1078` is 3400 of 3400 m
installed against an asserted 88.2%.

**The ratio is capped at 100 and the overrun reported, never printed.** An
activity installing more than its planned quantity is almost always a LINKING
fault — a quantity from different work matched onto the node. `CIV-FDN-1008`
reads 180 of 120 m³ because a *backfilling* quantity landed on a *concreting*
node. Capping keeps EV honest; `quantity_overruns` keeps the fault visible
instead of silently absorbed, and each entry carries `scored_by` so a reader
can tell an overrun capped out of EV from one on a node that had already
finished. The check runs regardless of which rule scored the node — precisely
because `CIV-FDN-1008` finishes at rule 1 and never reaches rule 2.

**`get_schedule` now calls `percent_complete` instead of deriving its own.**
It had a third derivation inline: `max(LinkedEvent.percentage)`, with no
`actual_finish` rule and no quantity rule, so the Schedule screen and the EVM
figures could disagree about the same activity and did. One derivation in one
place — the same rule that made the delay vocabulary a single list (D-048).
An activity nobody has reported still renders as null on that screen rather
than 0%: the floor is an earned-value convention, and a table cell is not the
place for it.

**A fourth defect, found while adding the third source.**
`EVMFigures.as_dict` built `percent_source_counts` by naming its three keys by
hand, so the new source was silently dropped from every response — the counts
came back all-zero while EV moved. It now builds from a `PERCENT_SOURCES`
tuple. A report that omits a category reads as "none of these" rather than
"not counted", which is the more dangerous of the two failures.

### Measured movement
Against the seeded corpus at data date 2026-09-15, with the rule switched off
and on:

```
                     BEFORE     AFTER
earned value          554.0     640.4     (+86.4)
project SPI          0.4311    0.4984
evidenced SPI        0.9503    0.9033
evidence coverage       45%       55%     (56 -> 67 of 120 activities)

percent_source_counts
  actual_finish            38 ->  38
  installed_quantity        0 ->  28      NEW
  linked_event_percentage  18 ->   1
  no_evidence_floor        64 ->  53      (-11, the understated activities)

quantity_overruns   CIV-FDN-1008  150.0%  scored_by actual_finish
```

The evidenced-subset SPI moves **down**, 0.9503 to 0.9033, and that is the
honest direction: the eleven activities that were being excluded are the ones
running behind. A fix that only ever improved a headline would be a fix worth
distrusting.

### Alternatives Considered
- **Put quantity below the asserted percentage.** Rejected: it would contradict
  the roll-up's own precedence, and on the three activities where the two
  disagree the asserted figure is the stale one.
- **Let the ratio exceed 100%.** Rejected. It would credit earned value for
  work outside the node's planned scope, on the strength of what is almost
  certainly a mis-link.
- **Silently drop the overruns once capped.** Rejected: the cap fixes the
  arithmetic and hides the cause. Reporting them is how the mis-link gets
  found.
- **Leave `get_schedule` with its own derivation.** Rejected — it was already
  producing different answers from the EVM stack for the same activity.

### Verification
`python -m pytest -q` — 1066 passed, up from 1056. The 10 new tests in
`server/test_evm.py` assert the rule and its edges: quantity scoring an
activity with no asserted percentage, quantity beating an asserted one,
`actual_finish` still winning, a zero planned quantity falling through, a
missing actual quantity staying at the floor, the earned value it produces
worked out by hand, the cap, the overrun reported, the overrun reported even
on a finished node, and an empty overrun list rather than an absent field.

`scripts/healthcheck.py` against a running server — 31 checks passed, 34
endpoints. `GET /schedule` was then compared row by row against
`evm.percent_complete`: **0 mismatches across 120 activities**, which is the
unification working. `matching/` and `extraction/` untouched, so `eval.py` is
not implicated.

### Affected Areas
`server/evm.py` (`SOURCE_QUANTITY`, `PERCENT_SOURCES`, `quantity_ratio`,
`percent_complete`, `compute_evm`, and the module docstring that specifies the
precedence), `server/main.py` (`get_schedule` calls the shared derivation),
`server/test_evm.py`.

### Trade-offs / Consequences
Project SPI moves from 0.4311 to 0.4984 and is still not a safe headline —
coverage is 55%, below the 60% `HEADLINE_COVERAGE_MIN` threshold, so
`spi_headline_safe` stays false and the executive screen keeps its banner. The
fix raises coverage by ten points; it does not make the whole-project figure
trustworthy, and nothing here pretends otherwise.

---

## 2026-09-05 / D-085 — The quantity ledger, and two things it found on its first run

### Context
Phase 1 of the Granularity Resolution Engine. `RollupAccumulator` has always
answered "what portion of the planned activity does this field event
represent", but nothing ever showed the arithmetic: which report contributed
how much, from which line of which file, and — the part that matters more —
**which readings it refused to count, and why**.

Those refusals were computed on every ingest and dropped on the floor.
`RollupResult.notes` carries them; `grep "\.notes" server/main.py` returned
nothing.

### Decision
`GET /activity/{activity_id}/quantity`, served by
`server/quantity_ledger.py`. Derived on every request from the linked events
and the activity — nothing stored, so it cannot go stale against a baseline
re-import, exactly as the RAID candidates and the Memory screen are derived.

**One rule, not two.** The four refusals — tag digits, unit mismatch, unitless,
no planned quantity — were inlined in `RollupAccumulator.add`. They are now
`matching.engine.classify_quantity`, a pure function the accumulator calls when
it accumulates and the ledger calls when it explains. An explanation derived by
a second copy of the rules would drift from the answer it claims to explain,
which is the mistake D-048 was written about. The extraction changed no
behaviour: 194 matching tests and the full 1066 passed before the ledger was
added.

**A refusal is reported as a decision, not an absence.** An event that never
carried a quantity is counted separately (`events_without_quantity`) from one
the roll-up actively declined (`refused_events`), because presenting a silent
event as a rejection would be as misleading as hiding a rejection.

### What it found on the demo corpus, immediately

**1. A refused reading that changes the answer.** `ELE-CBL-1076` reads 800 of
1200 m — 66.7%. The ledger shows why it is not more: a second reading of
**1.2 km** from `dpr_day_05.txt` was refused for a unit mismatch against a node
planned in metres. 1.2 km is 1200 m, which would have completed the activity.
The refusal is correct — the UOM map has no km→m conversion — but it was
invisible to everyone, and it is exactly the kind of thing a ledger exists to
surface.

**2. `actual_qty` is not always a measurement.** `_apply_rollup_to_schedule`
writes `new_qty = installed_qty`, and then:

```python
if new_qty <= 0 and r.percent_complete > 0 and act.planned_qty:
    new_qty = round(r.percent_complete / 100.0 * act.planned_qty, 3)
```

So when no quantity was counted but a source asserted a PERCENTAGE, the
schedule stores a quantity **back-derived from that percentage**.
`PIP-SPL-1025` holds 18 of 18 nos with no quantity on any linked event at all,
because one line said 100%. Across the corpus:

```
stored_total_basis        counted_readings         91
                          derived_from_percentage  28
                          unattributed              1
```

The ledger names which kind of number the schedule is holding rather than
reporting a disagreement it does not have. The single `unattributed` row,
`PIP-SPL-1026`, is both mechanisms at once: 8 nos counted in one ingest, 12
stored from a percentage-derived write in another.

**This qualifies D-084, shipped an hour earlier.** `percent_complete` labels
its answer `installed_quantity` whenever `actual_qty / planned_qty` produces
it — and for those 28 rows that label describes the arithmetic rather than the
evidence, because the quantity was itself computed from an asserted percentage.
The arithmetic is unchanged and correct; the provenance label is imprecise.
Recorded here rather than quietly re-engineered, because changing what
`actual_qty` means is a decision about the write path and deserves its own
entry.

### A correction made mid-phase
The first version of this module summed every accepted reading and compared
that against `actual_qty`. That is wrong: the schedule writes
`actual_qty = max(current, rolled-up installed)` — monotonic, so a partial
re-ingest can never wipe recorded progress — and across two ingests it
therefore holds the LARGER accumulation, not their sum. The ledger now groups
by job, sums within each, and compares the largest. `naive_sum_all_jobs` is
reported beside it because the difference is meaningful: it is the quantity
reported more than once, and on `CIV-FDN-1008` it is why that node reads 150%
(120 m³ in one ingest, 180 m³ in another, `max` keeping 180 against a planned
120).

### Alternatives Considered
- **Persist the roll-up's notes at ingest.** Rejected: they are fully
  derivable from the linked events and the activity, and a stored explanation
  would go stale the moment a baseline re-import changed a node's unit or
  planned quantity.
- **Re-implement the refusals in the ledger.** Rejected — see the shared-rule
  argument above.
- **Report only the counted readings.** Rejected. The refusals are the reason
  the endpoint is worth having.
- **Fix the percentage back-derivation now.** Deferred to its own decision. It
  changes what `actual_qty` means across the EVM stack, the Schedule screen and
  the roll-up, and folding it into a read-only reporting phase would have been
  a schema-semantics change smuggled in under a ledger.

### Verification
`python -m pytest -q` — 1083 passed, up from 1066. The 17 new tests in
`server/test_quantity_ledger.py` cover each of the five classifier outcomes
plus the not-a-refusal case, the ledger explaining a counted total, every
contribution carrying its citation, a refused reading shown with its reason and
excluded from the total, the max-across-ingests rule with its naive sum beside
it, an uncapped over-report, a percentage-derived total named as one, an
unattributed total, and both endpoint paths.

`scripts/reset_demo.py` then `scripts/healthcheck.py` against a running server
— 35 endpoints exposed, expected 35; 31 checks passed. `matching/` behaviour is
unchanged by the extraction and no threshold moved, so `eval.py` is not
implicated.

### Affected Areas
`matching/engine.py` (`classify_quantity` and its reason codes, extracted from
`RollupAccumulator.add`), `server/quantity_ledger.py` (new),
`server/test_quantity_ledger.py` (new), `server/main.py` (endpoint),
`server/schemas.py`, `scripts/healthcheck.py` (34 → 35).

### Trade-offs / Consequences
The ledger is O(events for one activity) per request and derived every time,
which is right at this scale and would want caching on a project with thousands
of readings against one node. More importantly, it can only explain what the
`LinkedEvent` rows carry: where the roll-up counted a quantity the persisted
event no longer holds, the ledger reports `derived_from_percentage` or
`unattributed` rather than inventing an attribution. That is the honest answer,
and the 28 rows it applies to are a prompt to fix the write path, not the
reader.

---

## 2026-09-05 / D-086 — `actual_qty` holds a measurement, or nothing

### Context
D-085's ledger found that `_apply_rollup_to_schedule` writes:

```python
new_qty = r.installed_qty
if new_qty <= 0 and r.percent_complete > 0 and act.planned_qty:
    new_qty = round(r.percent_complete / 100.0 * act.planned_qty, 3)
```

When no quantity was counted but a source asserted a PERCENTAGE, the schedule
stored a quantity **back-derived from that percentage**. On the seeded corpus
that was 29 of 120 activities: `PIP-SPL-1025` held 18 of 18 nos with no
quantity on any linked event at all, because one line said 100%.

Two things followed. The quantity ledger could not attribute those totals to
any reading — it reported `derived_from_percentage` for 28 and `unattributed`
for one. And D-084's `percent_complete` labelled their source
`installed_quantity` when the evidence was an asserted percentage: the
arithmetic was right and the provenance was not.

It also matters ahead of the productivity phase, where installed quantity gets
divided by elapsed time. Dividing a percentage-derived number by days and
calling the result a production rate would be an invented figure wearing a
measured one's units.

### Decision
The write no longer synthesises. `actual_qty` is what sources measured, or
nothing.

**Nothing is lost, and this was verified before the change rather than
asserted after it.** Every one of the 29 activities carries a persisted
`LinkedEvent.percentage`, so each still scores through `percent_complete` rule
3 — from the event the percentage was actually asserted on, and now labelled as
such. The round trip was lossless in the first place: `PIP-SPL-1027` stored
9.94 of 14 nos, which is 71.0%, against an asserted 71.0%. The synthesis added
nothing but ambiguity about what the column meant.

### Measured, by re-ingesting the whole corpus
```
                            BEFORE      AFTER
earned value                 640.4    640.407
project SPI                 0.4984     0.4984
evidenced SPI               0.9033     0.9033
evidence coverage              55%      54.5%
activities with evidence        67         67
quantity overruns                1          1

percent_source_counts
  actual_finish                 38         38
  installed_quantity            28         14
  linked_event_percentage        1         15
  no_evidence_floor             53         53

stored_total_basis      counted_readings 91 -> 120   (all of them)
                        derived_from_percentage 28 -> 0
                        unattributed 1 -> 0
```

**Every figure that measures the project is unchanged, and fourteen labels are
now accurate.** The fourteen are the unfinished derived activities; the other
fifteen were already scored 100% by `actual_finish`, so their label never
depended on this. Every stored quantity in the schedule is now attributable to
readings a source actually made.

### Alternatives Considered
- **Keep the synthesis and add a basis column.** Rejected: a column named
  `actual_qty` holding two kinds of number, plus a second column to say which,
  is worse than a column that holds one kind and is null when it has none.
- **Keep it and only fix the label.** Rejected for the same reason, and it
  would leave the productivity phase dividing a synthetic quantity by time.
- **Migrate the existing rows.** Not needed: `actual_qty` is derived data,
  `scripts/reset_demo.py` re-ingests, and the project's standing preference is
  a reset over a migration for regenerable data.

### Verification
`python -m pytest -q` — 1085 passed, up from 1083. The two new tests in
`server/test_evm.py` pin the read end: a percentage-only activity scores
through rule 3 with the `linked_event_percentage` label, and earns exactly the
weight it earned before, so the fix cannot silently become a progress
regression.

`scripts/reset_demo.py` then the EVM comparison above; `scripts/healthcheck.py`
against a running server — 35 endpoints, 31 checks passed. `matching/` and
`extraction/` untouched, so `eval.py` is not implicated.

### Affected Areas
`server/main.py` (`_apply_rollup_to_schedule`), `server/test_evm.py`.

### Trade-offs / Consequences
An activity reported only as a percentage now has `actual_qty` NULL where it
previously held a number. Anything reading that column for a quantity gets
nothing instead of a plausible-looking fiction, which is the intended
direction — `server/main.py :: _compute_productivity` already guards on
`a.actual_qty and a.actual_qty > 0` and so simply stops counting those rows,
which is correct: they never had a measured quantity to build a rate from.

---

## 2026-09-05 / D-087 — Three productivity rates, and none of them is the productivity

### Context
Phase 2 of the Granularity Resolution Engine. D-085's ledger says how much of
an activity is built and which readings built it; D-086 made sure those
readings are measurements. What was still missing is how FAST — the figure a
forecast divides by, and one nothing in NAVIS could answer for a single
activity.

### Decision
`server/productivity.py`, exposed as `GET /activity/{id}/productivity`.

**There is no single honest number, so three are returned and none is named
the productivity.** Divide measured quantity by elapsed calendar days since
Actual Start and a sparsely reported activity looks catastrophic:
`PIP-RCK-1024` comes out at 0.12 MT/day, which is a statement about how often
somebody wrote a report, not about the crew. Divide instead by the days a
reading was actually recorded and the bias inverts — the idle fortnight
vanishes and the rate flatters.

```
planned            planned_qty / planned duration      what the schedule assumed
observed_elapsed   counted qty / days since Actual Start
                   includes days nobody reported. The pessimistic reading,
                   and the one a contract argues from.
observed_reported  counted qty / distinct dates carrying a reading
                   excludes idle days. The optimistic reading, and the one a
                   foreman recognises.
```

On `CIV-FDN-1008` those are 8.00, 12.00 and 90.00 m³/day. The spread is not a
defect in the arithmetic; it is the honest width of what the evidence supports,
and hiding it behind one number is what would be dishonest.

**One reported day is not a rate.** It is the whole reading divided by one —
on `ELE-CBL-1076`, 800 m/day. `MIN_REPORTED_DAYS = 2` refuses it and says why.
`observed_elapsed` is deliberately exempt, because Actual Start is itself a
second point in time, so one reading against it still yields a defensible
figure.

**Distinct dates, not distinct readings.** Two lines written on the same day
are one day of work; counting them twice would halve the rate.

**A finished activity measures to its Actual Finish, not the data date.**
Otherwise every completed activity would appear to slow down the longer the
project ran after it.

**Fewer than three comparables is not an average.** A mean of two is an
anecdote with a decimal point, so `comparables` reports the count and declines
to average below `MIN_COMPARABLES`.

**Every rate carries its sample.** A rate over two readings and a rate over
twenty are different kinds of claim, and only one of them is a trend.

### What the corpus actually supports, stated rather than discovered later
D-086 left 38 of 120 activities with a MEASURED quantity, 24 of them complete.
So:

```
observed_elapsed available on   38 activities
observed_reported available on  11   (the rest have one reported day or none)
comparable prefixes with 3+     2    CIV-FDN (4), CIV-PLY (3)
```

That is thin, and the module says so per activity rather than averaging its way
past it. It is a fact about the corpus, not a fault in the rules: a wider
dataset populates it, and inventing a mean from one comparable would not. The
same figure appeared in `productivity.py`'s own docstring as "five prefixes"
while it was being written — measured before D-086 — and was corrected in the
same pass, because a stale number in a docstring is the exact fault this
project keeps finding in its own files.

### Alternatives Considered
- **Pick one rate and call it productivity.** Rejected: whichever is chosen is
  wrong for half the corpus, and the choice would be invisible to the reader.
- **Average the two observed rates.** Rejected. The mean of a pessimistic and
  an optimistic reading is not a better estimate, it is a number with no
  defensible derivation at all.
- **Let `observed_reported` stand on one day.** Rejected — see above. It is the
  figure most likely to be quoted and least likely to be true.
- **Re-derive which readings count.** Rejected: the per-reading detail comes
  from `quantity_ledger.ledger`, itself derived from the roll-up's own
  classifier, so this module adds no fourth opinion (D-048, D-085).

### Verification
`python -m pytest -q` — 1098 passed, up from 1085. The 13 new tests in
`server/test_productivity.py` assert the planned rate, the two observed rates
disagreeing in the expected direction, two readings on one day counting once,
one reported day refused with the elapsed rate surviving, an activity that
never started having no window, a finished activity measuring to its finish,
the type prefix, comparables refusing to average below three, an incomplete
sibling excluded, an activity not being its own comparable, and both endpoint
paths.

`scripts/healthcheck.py` against a running server — 36 endpoints exposed,
expected 36; 31 checks passed. `matching/` and `extraction/` untouched, so
`eval.py` is not implicated.

### Affected Areas
`server/productivity.py` (new), `server/test_productivity.py` (new),
`server/main.py` (endpoint), `server/schemas.py`, `scripts/healthcheck.py`
(35 → 36).

### Trade-offs / Consequences
`_compute_productivity` on `GET /memory/query` still computes its own
per-discipline figure from completed activities only, and is untouched here.
Two productivity derivations now exist for different questions — one per
discipline for the Memory screen, one per activity for a forecast — and that
is a duplication worth closing when the Memory screen next needs work. It was
left alone deliberately: folding them together would change a shipped screen's
numbers in a phase whose subject is a new endpoint.

---

## 2026-09-05 / D-088 — A forecast names the rate it used, and every rate that disagreed

### Context
Phase 3, and the last of the Granularity Resolution Engine that produces a
number. D-087 gave every activity three productivity rates; this divides the
remaining quantity by one of them and says when the work finishes.

The division is trivial. Everything that matters is which rate goes in the
denominator, what the answer is allowed to claim, and when to refuse.

### Decision
`server/productivity.py :: forecast`, carried on the existing
`GET /activity/{id}/productivity` response rather than a new endpoint — "how
fast" and "therefore when" are one question.

**Every rate that can produce a forecast produces one, and one is nominated.**
Reporting a single figure would hide that the same evidence supports a range.
On `ELE-CBL-1076` the elapsed reading finishes 2026-10-04 (+47 days) and the
planned rate finishes 2026-09-20 (+33); on `PIP-RCK-1024` the two are 2027-04-07
and 2026-09-26. A reader who cannot see that spread cannot judge the headline.

**The nomination rule, in order, stated on the response itself:**

```
observed_elapsed    when available. The reading a contract argues from, it is
                    available on far more activities than the reported rate,
                    and it errs late.
comparable median   no observed rate, but three or more completed activities
                    of the same type.
planned             last, and labelled as the schedule's own assumption rather
                    than an observation of anything.
```

The chosen candidate carries a `why` in prose, so the choice is legible without
knowing the rule.

**Remaining quantity comes from `percent_complete`, not from the readings.**
This is the correction the phase turned on. The rate's numerator must be a
measured quantity — a rate needs a measurement. But "how much is left" is a
question about completeness, and `PIP-SPL-1027` reports 71% through an asserted
percentage while carrying no measured quantity at all. Deriving remaining from
`planned - counted` made it forecast as though nothing had been built: 14 of 14
remaining, against every other screen in the product saying 71% done. It now
uses `server/evm.py :: percent_complete` — the shared four-rule derivation the
Schedule screen and EVM already use — so a forecast cannot contradict the
progress figure printed beside it.

Where a quantity WAS measured the subtraction is done directly rather than
through the percentage: going back through a figure rounded to one decimal
turns `1200 - 800` into 399.6, and a claim document does not want an arithmetic
artefact in it.

**Remaining days round up.** An activity does not finish a fraction of a day
early, and rounding down would let a forecast claim a day it has not earned.

**Nothing is written.** A forecast is a projection, exactly as a proposed
liability (D-078) or a proposed actual date (D-009) is. `forecast_note` says so
in the payload.

**Five refusals, each with a reason rather than an empty object**, because "we
cannot say" and "we did not look" are different answers:

```
already_finished                        38 activities
not_started                             53   no start to forecast from
quantity_complete_awaiting_finish_date   9   the roll-up withheld the finish
                                             date because no source named one
                                             (D-015); forecasting it as still
                                             running would contradict the
                                             review queue it was put in
node_has_no_planned_quantity             1
(forecast produced)                     19
```

### What it produces on the corpus
```
ELE-CBL-1076   66.7% · 400 m remaining
  FORECAST 2026-10-04  vs baseline 2026-08-18  = +47d
    from observed_elapsed at 22.22 m/day
    alt  planned at 85.71 m/day -> 2026-09-20 (+33d)
  EVIDENCE 1 reading over 1 reported day, 800 m confirmed, 0 comparables
```

The evidence line is the point of the design: one reading is a thin basis for a
47-day claim, and the response says so rather than leaving a reader to assume
otherwise.

### Alternatives Considered
- **Return one forecast.** Rejected — see the spread above.
- **Average the candidates.** Rejected. The mean of a pessimistic and an
  optimistic projection has no defensible derivation.
- **Emit a numeric confidence score.** Rejected: there is no calibration behind
  such a number, and a percentage would imply one. The sample counts and the
  spread say the same thing without inventing precision.
- **Nominate the reported rate when it exists.** Rejected: it excludes every
  day nobody reported, which flatters exactly the activities whose forecasts
  matter most.
- **Forecast an activity that has not started.** Rejected. There is no start to
  forecast from, and assuming one would be forecasting the schedule rather than
  the work.

### Verification
`python -m pytest -q` — 1108 passed, up from 1098. The 10 new tests in
`server/test_productivity.py` assert the nominated rate and its stated reason,
every usable rate producing a candidate with the optimistic one finishing
sooner, days rounding up, remaining following percent complete rather than the
readings, remaining exact when a quantity was measured, and each of the four
reachable refusals still carrying its evidence.

`scripts/healthcheck.py` against a running server — 36 endpoints exposed,
expected 36 (no new endpoint); 31 checks passed. `matching/` and `extraction/`
untouched, so `eval.py` is not implicated.

### Affected Areas
`server/productivity.py` (`forecast`, `_forecast_from`, the refusal reasons,
and remaining-quantity now derived from `percent_complete`),
`server/schemas.py` (`ForecastCandidate`, `ForecastEvidence`, and the fields on
`ProductivityResponse`), `server/main.py`, `server/test_productivity.py`.

### Trade-offs / Consequences
A forecast is a straight-line extrapolation from a single rate. It models no
learning curve, no resource change and no logic: an activity whose successor
cannot start until a permit arrives forecasts as though it can. The critical
path exists (D-082) and is not consulted here, so these are ACTIVITY forecasts
and never a project completion date. Saying which of those two a number is
matters more than the number.

---

## 2026-09-05 / D-089 — The engine surfaces in the drawer that already answers "why"

### Context
Phase 4, and the last of the Granularity Resolution Engine. D-085 to D-088
built the ledger, the rates and the forecast; all of it was reachable only
through the API.

### Decision
Two sections added to the Schedule screen's existing `AuditDrawer` —
**Quantity Ledger** and **Productivity & Forecast** — rather than a new screen.
The drawer is already the answer to "why does this activity say what it says",
and a forecast belongs beside the audit trail that explains the progress it was
computed from.

Each section fetches its own endpoint on its own query key, so opening the
drawer costs two requests and the table behind it costs none.

**Same design gate as D-083, same answer.** There is no mockup in `Design/`
for these sections, so they are assembled from the vocabulary the drawer
already uses — its `Field`, its `SectionTitle`, its tokens, its skeleton and
error states. Nothing new was invented, and both components say so at the top.

**What the screen must not drop.** The numbers are the backend's and are
tested there; what the frontend can quietly lose is everything that keeps them
honest, so the tests assert exactly that:

- a REFUSED reading appears with its reason and its citation, because the
  refusals are the reason the ledger exists
- every rate is listed including the ones the forecast did not use, and an
  unavailable rate prints why rather than a zero
- the forecast names the rate it used and carries its evidence line
- a refusal to forecast is stated rather than leaving a blank panel
- the caveat text comes from the API's own `refusal_note` and `forecast_note`
  rather than being restated in the frontend, so the screen cannot drift from
  what the endpoint says

### What it shows on the live corpus
Opening `ELE-CBL-1076` in the drawer, against the running API:

```
QUANTITY LEDGER
  800 / 1200 m = 66.7%
  COUNTED  800 m   2026-08-11   +800 m
                   dpr_day_03.txt, line 25
  REFUSED  1.2 km  2026-08-19   uom mismatch ignored: event 1.2 km vs planned m
                   dpr_day_05.txt, line 26

PRODUCTIVITY & FORECAST
  2026-10-04   vs baseline 2026-08-18   +47d
  from observed_elapsed at 22.222 m/day · 400 m remaining
  PLANNED           85.714 m/d over 14d
  OBSERVED ELAPSED  22.222 m/d over 36d
  OBSERVED REPORTED —  needs readings on at least 2 distinct days; this has 1
  1 reading over 1 reported day · 800 m confirmed · 0 comparables

AUDIT TRAIL
  SOURCE CONFLICT — finish asserted, but the evidence accounts for only 0.0%
  of the node's planned quantity (1200 m) — Actual Finish withheld, scope is
  partial: 2026-08-19 from dpr_day_05.txt line 26 "HT cable laying complete —
  full 1.2 km from substation to MCC trench"
```

The three sections turn out to tell one story, which is the argument for
putting them in this drawer rather than on a screen of their own. The DPR said
the cable run was complete. The roll-up refused the finish date because the
evidence accounted for 0% of the planned quantity. The ledger now says why:
the reading was 1.2 km against a node planned in metres, and the UOM map has
no km→m conversion. A planner reading top to bottom can see the refusal, the
consequence, and the fix.

### Alternatives Considered
- **A screen of its own.** Rejected: it would separate the forecast from the
  audit trail that explains the progress behind it, and the drawer already
  answers this exact question for dates.
- **One combined request.** Rejected: two endpoints answer two questions, and
  a client that wanted only the ledger would pay for the critical-path pass
  behind the forecast.
- **Restate the caveats in the frontend.** Rejected — it is how a screen drifts
  from its API. The notes are rendered from the payload.

### Verification
`npx vitest run` — 129 passed, up from 120. The 9 new tests in
`frontend/src/test/schedule-granularity.test.tsx` cover the refused reading and
its reason, the citation, the refusal note coming from the API, the forecast
with its baseline and variance, the rate it used and why, every rate listed
including the uncomputable one with its reason, the evidence line, the
never-written statement, and a refusal to forecast being stated.

`npx tsc --noEmit` clean, `npx vite build` clean, `python -m pytest -q` — 1108
passed. The drawer was then opened against the running API and returned the
output above.

One test defect was found and fixed while writing them: `openDrawer` waited for
the section heading, which renders immediately while both queries are still
showing skeletons, so every assertion raced the fetch. It now waits for content
from each section — the same class of flake as the one D-083 fixed in
`reconcile.test.tsx`.

### Affected Areas
`frontend/src/pages/Schedule.tsx` (`QuantityLedgerSection`,
`ForecastSection`, two sections in `AuditDrawer`), `frontend/src/types.ts`,
`frontend/src/lib/api.ts`, `frontend/src/test/schedule-granularity.test.tsx`
(new).

### Trade-offs / Consequences
The drawer now makes three requests when it opens — audit, ledger, productivity
— and the productivity one runs the critical-path pass behind
`percent_complete`. At 120 activities that is imperceptible; on a large
schedule it is the cache D-082 already names as the next step, and the drawer
is where it would first be felt.

---

## 2026-09-05 / D-090 — The executive layer stops inventing figures

### Context
An audit of the executive oversight work found that `server/executive_metrics.py`
and `frontend/src/pages/executive/Overview.tsx` — the first screen a Senior
Management judge opens — carried eight fabricated figures, sitting directly on
top of layers that had been built with the opposite discipline. The core of
this project refuses to write an Actual Finish it cannot evidence (D-008),
refuses to let an LLM assign liability (D-006, D-077), refuses to emit a cost
metric whose denominator it would have to invent (`server/evm.py ::
COST_UNAVAILABLE_REASON`) — and then a screen above all of that printed
₹14.20 Crores of employer claim from nowhere.

The eight:

1. `proposed_days` read with the key names `"EMPLOYER"`, `"CONTRACTOR"`,
   `"CONCURRENT"`, `"NEUTRAL"`. The delay layer keys that dict by its own
   `Liability` enum — `COMPENSABLE`, `NON_COMPENSABLE`, `EXCUSABLE`,
   `CONTESTED` — so every `.get()` fell to its default and every downstream
   financial figure was **₹0.00**, on every run, with 43 delay-days sitting
   in the evidence underneath. `beyond_float` was read for a key the layer
   spells `beyond_float_days`, so it was dead too.
2. `ESTIMATED_CONTRACT_VALUE_CR = 180.0`, commented as an "Indian
   Infrastructure / PSU EPC" baseline. No contract in this system says so.
3. `DAILY_PROLONGATION_COST_LAKHS = 12.5`, likewise, and duplicated as a
   literal `12.5` inside the frontend's scenario simulator.
4. P10 / P50 / P90 computed as `drift − 3`, `drift`, `drift + 14`.
5. `"monte_carlo_runs": 1000` beside them, and
   `FORECAST ALGORITHM: MONTE CARLO (1,000 RUNS)` printed under the chart.
   No simulation exists anywhere in this repository.
6. Historical earned value back-cast as `today_ev × (elapsed_fraction) ** 1.15`
   — an exponent with no derivation, drawing a plausible progress history for
   a corpus in which nothing had completed.
7. Five hardcoded milestones with invented names, invented baseline and
   forecast dates, and confidence figures of 94.2% / 78.5% / 65.0% / 71.2%.
   Four of the five would have rendered unchanged against an empty database.
8. `driving_delay` selected by substring: `"CIV" in activity_id` produced
   "Foundation curing & monsoon hold", whether or not any report had mentioned
   curing or rain — while `delay_events` held the real cause, its category,
   its proposed liability and the document line it was read from.

The frontend then supplied hardcoded fallbacks for exactly the figures the
broken endpoint was returning as null or zero — `?? '14.20'`, `?? '3.80'`,
`?? '180.00'`, `?? '2026-11-12'`, `?? '84.2'`, `?? 24`, `?? 8` — so the screen
looked most confident precisely when it knew least.

### Decision

**Money is opt-in, and is the operator's assumption.** The two constants are
deleted. `compute_executive_metrics` takes `contract_value_cr` and
`prolongation_lakhs_per_day` as optional keyword arguments, exposed as
optional query parameters on `GET /executive/metrics`. Neither is defaulted.
Without them the payload reports delay exposure in **days**, and
`financial.available` is false with `FINANCIAL_UNAVAILABLE_REASON` — modelled
directly on `evm.py`'s refusal to emit a cost metric. With them, every figure
is labelled `operator_supplied`. `LD_PCT_PER_WEEK` and
`MAX_LIQUIDATED_DAMAGES_PCT` remain constants because they are FIDIC 8.7
clause parameters, not facts about one contract.

**Liability is read through the enum.** `Liability` is imported and used for
every lookup, so the two vocabularies cannot drift apart again. Concurrency
now comes from `delay_data["concurrency"]` (D-081), because overlapping delay
windows are a different question from who carries the delay — there is no
CONCURRENT liability and the payload no longer implies one. `beyond_float_days`
is reported alongside the headline days, since only those can have moved
completion.

**Three computed dates replace three percentiles.** `baseline_finish` (the
baseline as authored), `logic_finish` (the CPM forward pass over evidenced
actuals, D-082), and `exposed_finish` (logic plus recorded delay that has
already outrun its float on critical activities *still open* — exposure the
network has not absorbed). `is_probabilistic: false` is in the payload, and
`basis` says why: this system holds one baseline, not a duration distribution,
so a percentile would be a label on arithmetic. `exposed_finish` is declared an
upper bound for the reason `attribution` already gives about `impact_days`.

**The range discloses that the baseline disagrees with itself.**
`variance_days` is logic finish minus authored finish and reads +14d, while the
worst recorded slip on the whole project is 1 day. The difference is the 27
broken logic ties `compute_schedule` reports. `logic_conflicts` and
`logic_conflicts_note` are now in the payload and on the screen, because
without them the honest number looks like a bug.

**Earned value is measured, on a stated rule.** The S-curve's history is
computed from actual finish dates under an explicit 0/100 rule: an activity
earns its planned-duration weight on the day it actually finished, and work in
progress earns nothing. `ev_basis` states the rule and states that this is not
the same quantity as `kpis.ev_total`, which is the EVM stack's own earned value
in its own units and credits partial percent complete. The 0.85 fallback SPI
is gone: when SPI cannot be computed, `ev_projected` is null.

**Causes and milestones come from the data or are absent.** `driving_delay` is
the worst delay recorded against the activity, carrying its category, its
liability, whether a planner has adjudicated it, and its source file and line.
Null means no cause is recorded — a real and reportable state. Milestones are
derived from the schedule (the last-finishing activity of each discipline, plus
the project finish), each row declaring `derived`, `derivation` and `basis`
(`actual_finish` / `cpm_early_finish` / `cpm_project_finish`). There is no
confidence column, because nothing in this system calibrates one.

**The frontend renders absence as absence.** Every hardcoded fallback is gone,
replaced by a `dash()` helper. The scenario simulator moves the computed finish
date instead of multiplying slider-days by a rate written into the component,
and prices it only when the operator supplied a rate. The two static captions
under the chart — the Monte Carlo claim and the rollup description — now state
what the curve actually is.

### Alternatives Considered
- **Alias the old key names so the numbers appear.** Rejected: it preserves
  the vocabulary that caused the mismatch, and the mismatch is the bug.
- **Default the contract value to ₹180 Cr and label it "illustrative".**
  Rejected. A label under a large rupee figure is not read; the figure is. The
  same argument was settled for cost metrics in `evm.py` and settling it
  differently here would make the project's own standard situational.
- **Implement a real Monte Carlo so P10/P50/P90 become true.** Rejected for
  now: a simulation needs per-activity duration distributions, and this system
  holds one baseline. Inventing the distributions to compute the percentiles
  would move the fabrication one layer down, not remove it.
- **Keep the five named milestones as demo dressing.** Rejected: they are the
  rows a client would photograph.

### What it shows on the live corpus
`GET /executive/metrics` against the running server, no parameters:

```
dispute_shield   employer 0d · contractor 1d · neutral 1d · contested 41d
                 beyond float: employer 0d · contractor 1d
                 4 delay events, 0 adjudicated · notice 50.0% within window
financial        available: false — "No contract value was supplied..."
completion       baseline 2026-09-28 · logic 2026-10-12 · exposed 2026-10-12
                 is_probabilistic: false · logic_conflicts: 27
critical_drivers CIV-PLY-1004  +1d  "piling rig breakdown" (EQUIPMENT)
                 proposed, not adjudicated · civil_progress.xlsx
milestones       7 derived — 1 COMPLETE, 1 ON_TRACK, 4 AT_RISK, 1 CRITICAL
```

With `?contract_value_cr=180&prolongation_lakhs_per_day=12.5`, the same days
price to ₹0.00 Cr of employer claim and ₹0.13 Cr of LD risk, labelled
`operator_supplied`. The honest figures are far smaller than the invented ones,
which is the point: ₹14.20 Crores was never anything but a number someone typed.

### Verification
`python -m pytest -q` — 1163 passed, up from 1147. `server/test_executive_metrics.py`
was rewritten from 2 tests to 18. The old ones asserted only that keys were
*present* (`assert "contractor_ld_risk_cr" in dispute`), which is why a value
that had been ₹0.00 since the day it was written never failed a build. The new
ones pin values and behaviour, including a monkeypatched delay payload keyed by
the real `Liability` enum that fails if a hand-written key name returns.

`cd frontend && npx vitest run` — 156 passed, up from 147.
`frontend/src/test/executiveOverview.test.tsx` was rewritten from 3 tests to 12;
the old ones asserted the invented numbers (`/14.20/`, `₹1.25 Crores`) and so
passed throughout. The new ones assert that those exact literals are **absent**.
`npx tsc --noEmit` clean.

`python eval.py` — auto-link precision 100.0%, top-1 87.2%, coverage 50.4%:
unchanged, as expected, since nothing in `matching/` or `extraction/` was
touched.

`python scripts/healthcheck.py` — **31 passed, 0 failed**. It had been failing
on every run: the endpoint count was pinned at 36 against a surface of 44. It
is re-pinned at 44, with a note that the pin belongs in the same commit as any
change to the endpoint surface.

The screen was then loaded in a browser against the running API and read end to
end, which is how two static captions were caught that a grep of the payload
would not have found: `FORECAST ALGORITHM: MONTE CARLO (1,000 RUNS)` and
`Projected EV (P50)` were hardcoded JSX, not payload fields.

### Affected Areas
`server/executive_metrics.py` (rewritten computation, unchanged aggregation
shape), `server/main.py :: get_executive_metrics` (two optional query
parameters), `server/test_executive_metrics.py` (rewritten),
`frontend/src/pages/executive/Overview.tsx`, `frontend/src/types.ts`,
`frontend/src/test/executiveOverview.test.tsx` (rewritten),
`frontend/src/test/roleRouting.test.tsx` (mock updated to the real shape),
`scripts/healthcheck.py`, `.claude/launch.json` (frontend preview port moved
off 5173, which is in a Windows excluded port range on this machine).

### Trade-offs / Consequences
The executive screen now shows smaller, sparser numbers: 0 employer delay-days
instead of ₹14.20 Cr, one critical driver instead of six, no rupee figure at
all unless the operator supplies a contract. That is a real presentational
cost and it was accepted deliberately. A judge who asks "where does ₹14.20
Crores come from?" gets an answer that ends the demo; a judge who asks where
0 days comes from gets a document, a line number and a delay register.

The screen is also now the strongest available demonstration of the property
this project is actually arguing for, because it is the one place where the
system had to be made to admit it did not know something.

**Not fixed here, and stated rather than hidden:** the landing page
(`frontend/src/pages/Home.tsx` and the workspace selector) still carries
decorative telemetry — `LATENCY: 18MS`, `98.4% NOMINAL ALIGNMENT`,
`VOL: +3.2%`, `EARNED VALUE: 100%` on a named activity. It is marketing chrome
rather than a reported metric, but it is the same class of thing on the first
screen anyone sees, and it should be reviewed before the demo.

---

## 2026-09-05 / D-091 — A success message is a claim about the database

### Context
`frontend/src/pages/field/ReportStudio.tsx` ended its submit handler like this:

```tsx
} catch {
  // In case of offline/network, show success locally
  setSubmitted(true);
}
```

Any failure — a refused connection, a 500, a dropped cable — produced
**"Dispatched to Project Controls"**, complete with an invented reference
number. This is the most serious defect this repository has contained. A
supervisor who is told their update was filed stops thinking about it; the
record they believe exists is precisely the one nobody goes looking for, and
the work silently leaves the project's account of itself. Every other refusal
in this codebase — an Actual Finish withheld because the evidence covers only
part of the scope (D-008), a liability left unadjudicated (D-077), a cost
metric not emitted because its denominator would have to be invented — exists
to prevent a smaller version of exactly this.

The rest of the screen was static in the same way. It submitted a fixed
sentence about `ACT-PIP-201-04`, an activity id that appears in no baseline
this project ships, and ignored the one field a supervisor could edit. It
asserted a **98.4% confidence** match, a **GPS VERIFIED** geo-stamped
photograph at 27.3592° N 95.3197° E, torque logs "attached automatically",
and linkage into "Primavera P6 Rev-08 baseline staging". There is no EXIF
reader, no photo store and no P6 write path anywhere in this repository; a
`grep -i exif server/ extraction/ matching/` returns nothing. The chat panel
answered itself on a `setTimeout`.

`POST /agent/turn` — the endpoint the screen was nominally calling — already
did all of this correctly. It fills slots, runs the real matcher, refuses a
`confirm` while a slot is still open, is idempotent across a retried
submission, and returns `event_created` only after committing a `LinkedEvent`
and a review item. `frontend/src/pages/Field.tsx` has consumed it honestly
since it was built. The studio was a parallel mock-up that bypassed both.

### Decision

**Success is gated on the server's own statement of persistence.**
`persistedReference()` returns a reference only when `event_created` is true
*and* the response carries a `review_item_id` or `linked_event_id`. Either
half alone is not persistence: a flag with no row is not something a planner
can open. The success screen is reachable from nowhere else.

**A failure keeps the draft and says what happened.** Both failure modes are
distinguished and both are stated:

- the request threw — `errorDetail()` names the server and the reason, and the
  supervisor's message is pulled back out of the transcript so it is not left
  looking like it was received;
- the request succeeded and the server declined to write — the agent's own
  `agent_message` explains what is still missing.

In both cases the textarea, the date, the discipline and the work front are
untouched. The banner says "Nothing was sent and nothing was stored anywhere",
because there is no offline queue in this system and implying one would be the
same lie in a quieter voice.

**Submission is disabled until the server says the report is complete.** The
button is live only on `awaiting_confirmation`. This is not defensive UI: the
server refuses such a confirm anyway (`"I need one more thing before I can
send this"`), and a button that looks armed and then refuses reads as broken.

**Every figure comes from the response.** The confidence is
`turn.confidence` with `match_outcome` beside it, or the words "no confidence
reported". The activity is the one the matcher chose, or "No activity
matched". An unfilled slot renders an em dash, because the agent not having
read a value and the value being blank are different facts.

**The unsupported claims are deleted, not softened.** The photo card, the GPS
coordinates, the Exif line, the P6 baseline-staging sentence, the "Schedule
Delta: 0 Days Variance" badge, the "100% FINAL" chip, "V4.2 CONNECTED" and the
scripted assistant replies are gone. What replaced them is a form: a textarea
for what happened, and selects for work front, discipline and work date, all
of which are sent.

### Alternatives Considered
- **Queue failed submissions in `localStorage` and sync later.** Rejected. It
  is a real feature and a defensible one, but it is not what the code did, and
  building it here would mean the success message stays true only if a sync
  path that does not exist yet is later written correctly. Until there is one,
  the honest answer to a failed submission is that it failed.
- **Keep the demo content and only fix the `catch`.** Rejected: the screen
  would still submit a hardcoded sentence about an activity the baseline does
  not contain, so the "success" would be true about a record nobody wanted.
- **Redirect the studio to `Field.tsx` and delete it.** Tempting, and it is
  the smaller diff. Rejected because the two are genuinely different surfaces —
  a phone flow and a wide-screen review flow — and the wide layout is the one a
  planner-facing demo uses.

### What it does on the live corpus
Typed into the studio against the running API:

```
"Bored piling for pipe rack P1 to P12 finished, 12 of 12 piles complete"
  -> NAVIS: "Which date was it completed?"     submit stays disabled
"14 September 2026"
  -> 62.3% match confidence · REVIEW
     CIV-PLY-1004  Bored Piling — Pipe Rack P1–P12
     quantity 12 nos · reported date 2026-09-14
  -> Sent for planner review
     Recorded as c41ec518-ae1d-48a9-b003-8174f9d723e6
```

`GET /review-queue` then contains that id, against `CIV-PLY-1004`, carrying
the supervisor's sentence verbatim.

The failure path was then exercised in the same browser by replacing
`window.fetch` with a rejecting stub and pressing submit:

```
Not submitted
Could not reach the API at http://localhost:8000 — Failed to fetch
Your report is still on this screen. Nothing was sent and nothing was
stored anywhere.
```

No success screen, and the parsed report — `ELE-FLT-1085`, 800 m, 58.3% —
still on the page.

### Verification
`cd frontend && npx vitest run` — 162 passed, up from 156.
`frontend/src/test/fieldStudio.test.tsx` was rewritten from 5 tests to 11. The
old ones asserted the fabricated content (`IMG_8821_joint.jpg`, `GPS
VERIFIED`, `ACT-PIP-201-04`, the scripted reply) and one of them asserted that
a mocked-successful submit reached "Dispatched to Project Controls" — none of
them could have caught the `catch`. The new ones pin the acceptance condition
directly: a rejected `agentTurn` must not produce a success screen, must keep
the textarea's value, and must render the failure. Separate tests cover a
200-that-did-not-persist, the disabled-until-ready button, that the message
sent is the text actually typed with the chosen date and discipline, that only
the second turn carries `confirm: true`, and that the removed claims are
absent from the DOM.

`npx tsc --noEmit` clean. The backend was not touched, so `pytest` and
`eval.py` were not re-run for this change.

### Affected Areas
`frontend/src/pages/field/ReportStudio.tsx` (rewritten),
`frontend/src/test/fieldStudio.test.tsx` (rewritten).

### Trade-offs / Consequences
The studio now requires a running API to do anything at all, and shows less
than it used to: no photograph, no coordinates, no torque logs, and a
confidence in the 50–70% band rather than 98.4%. That band is the real one for
a free-text sentence matched against 120 activities, and a REVIEW outcome
routing to a planner is the product working, not failing.

**Not fixed here, and flagged rather than hidden:** `View in My Updates` leads
to `frontend/src/pages/field/UpdatesLedger.tsx`, which is still a static
mock-up of the same kind — a hardcoded P-201 update with an Exif photo panel
and a fabricated review outcome. The route a supervisor takes immediately
after a real submission therefore still shows invented content. It is the next
thing to fix on this surface.

---

## 2026-09-05 / D-092 — An imported schedule becomes the project

### Context
NAVIS could import a Primavera baseline and could not then be used on it.

`get_matching_engine()` built its index from `SCHEDULE_PATH`, a file on disk,
and cached it in a module-level singleton for the life of the process.
Importing a schedule wrote activities into the database and never touched that
index. The result was a product that displayed the new schedule on every read
endpoint and could not link a single field report to it:

* an activity unique to the imported file matched **nothing**;
* worse, a report about it could match a superficially similar activity from
  the OLD baseline, and the response carried a confidence and an activity id
  that looked exactly like a correct answer.

`_matcher_baseline_drift` surfaced the divergence as an integrity warning, so
it was a known limitation rather than a silent one, and
`server/test_baseline.py` had two tests asserting that the warning appeared —
a limitation pinned rather than fixed.

Two further defects sat behind it.

**The table held two projects.** An import deliberately leaves the previous
baseline's activities in place, because deleting them would orphan their
`LinkedEvent` and `AuditRecord` rows and destroy the append-only trail
(D-004). But nothing recorded which activity belonged to which baseline, so
every unscoped consumer saw both schedules at once. `GET /schedule` returned
120 + 218 activities as one project, with one variance total, one SPI and one
critical path computed across two unrelated networks.

**Export flattened the logic.** Both `_generate_pmxml` and `_generate_xer`
iterated `predecessor_list()` — activity ids only — and wrote `Type="FS"`,
`Lag="0d"` against every tie. A schedule imported with SS and FF links and
multi-day lags came back out as a pure finish-to-start network with no lag
anywhere. That is not cosmetic: `server/cpm.py` computes total float, the
critical path and every beyond-float delay day from exactly those ties, and
`server/delay_events.py` builds a liquidated-damages argument on top. A lossy
export changes who owes whom time. The exporter also announced every file as
"OIL Well-Site Duliajan" over a fixed 2026-06-01/2026-09-30 window, whatever
schedule it actually contained.

### Decision

**The matcher is rebuilt from the active baseline on every import.**
`rebuild_matching_engine(db)` builds a `ScheduleIndex` from the database rows
of the active baseline and installs a new `MatchingEngine`. It returns None
and leaves the previous engine in place when there is nothing indexable: a
matcher still linking against yesterday's schedule is recoverable, and one
replaced by an empty index is not — an index over zero activities matches
nothing, and "nothing matched" is indistinguishable from "the matcher is fine,
your report is unusual".

**The singleton checks itself.** `get_matching_engine(db)` compares the
index's baseline sha256 against the active baseline's and rebuilds on a
mismatch. The engine is process-global while the baseline lives in the
database, so under more than one worker the two genuinely can diverge: one
process imports, another keeps indexing the old project. Every call site that
holds a session now passes it — ingest, the review-resolve replay, and the
agent's `_match_slots`. The cost is one indexed row per call.

**`Activity.baseline_id` says which project an activity belongs to.**
Attribution happens at seed time, at import time for every activity the file
names, and once retrospectively for rows that predate the column.
`scoped_activities(db)` returns the active baseline's rows and is used by
`GET /schedule`, by the CPM pass behind it, and by the index build.

The unattributed case is deliberately wide rather than narrow: if the active
baseline owns no rows yet, every activity is returned. Answering "0
activities" for a table that plainly contains a schedule would be a far more
confusing failure than answering with all of it, and the startup backfill
closes the gap on the next boot.

**Export carries the logic and names the project.** Both exporters iterate
`predecessor_links()` and write the stored `rel` and `lag_days`. The lag
string is `{n}d`, which `matching/primavera.py :: _lag_days` reads back as
exactly n days — a bare number in an XER lag column would be read as HOURS and
a 3-day lag would come back as 0. The project name is the active baseline's,
and the date window is the range of the activities being exported.

A row stored in the older shape — a JSON list of bare ids — still exports as
FS with zero lag, because that is what a bare id has always meant. Pinned by a
test, so this change cannot silently rewrite the meaning of every activity
seeded before typed links existed.

### Alternatives Considered
- **Delete the previous baseline's activities on import.** Rejected: it
  orphans the audit trail, which D-004 exists to protect. Scoping gives the
  same clean project view and keeps the history.
- **Rebuild the index on every request.** Rejected: it re-embeds every
  activity description. The sha comparison gets the same correctness for one
  indexed row.
- **Add a `project_id` and support many concurrent projects.** Rejected as
  out of scope. One active baseline at a time is what the product claims, and
  `baseline_id` is what makes that claim true rather than a description of an
  unenforced convention.
- **Keep the drift warning as the answer.** Rejected. Reporting a limitation
  honestly is better than hiding it and worse than removing it, and this one
  stood between the product and any schedule it had not shipped with.

### What it does now
`server/test_imported_schedule_is_usable.py` imports a schedule deliberately
alien to both shipped baselines — TBM drives, shaft sinking, `TUN`/`SHF` ids,
vocabulary that appears nowhere in `dataset/` — over the seeded demo project,
then reports work against it through `POST /agent/turn`:

```
import tunnelling_baseline.json (3 activities, replace=true)
  index      {TUN-BOR-9001, SHF-SNK-9002, TUN-SEG-9003}
             no CIV-SIT-1001, no PIP-* survivors
  /schedule  3 activities - the 120 demo rows are still in the table,
             attributed to the previous baseline, and out of the project

"Tunnel boring machine drive on the north adit is complete, 450 m bored"
  -> matched TUN-BOR-9001, committed, review_item_id returned
"Shaft sinking on ventilation shaft V2 finished, 62 m sunk"
  -> GET /review-queue carries the row against SHF-SNK-9002

export of that project, re-parsed:
  SHF-SNK-9002  <- TUN-BOR-9001  SS  +9d
  TUN-SEG-9003  <- TUN-BOR-9001  FF  +5d
```

The last block is the round trip that used to come back as two FS ties with
no lag.

### Verification
`python -m pytest -q` — 1186 passed, up from 1163. Two new files:
`server/test_imported_schedule_is_usable.py` (9 tests, the acceptance
condition) and `server/test_export_roundtrip.py` (8 tests, which round-trip
through the real importer rather than asserting on substrings, and include a
negative control confirming a flattened export would fail them).

Four existing tests changed, all of them pinning behaviour this decision
deliberately reverses:

* `TestMatcherBaselineDrift` asserted that importing produced a drift warning.
  Replaced by `TestMatcherFollowsTheImport`, which asserts the index actually
  changes and that no warning is produced.
* `test_a_real_commit_creates_the_activities_and_leaves_the_demo_ones_alone`
  expected `/schedule` to report 123 activities after importing 3 over 120.
  It now expects 3, and separately asserts that all 123 rows are still in the
  table — which is the property its name was always about.
* `test_pmxml_content_is_valid_xml` asserted the hardcoded project name. It
  now asserts the name matches the active baseline, or the neutral fallback
  when no baseline is recorded.

A test-isolation fixture was added to both baseline-importing test modules.
`_MATCHING_ENGINE` is a module-level singleton that these tests now mutate, so
without it one test's imported schedule became the next test's starting state
and the pollution escaped into every later module in the run.

`python eval.py` — auto-link precision 100.0%, top-1 87.2%, coverage 50.4%:
unchanged. `python scripts/healthcheck.py` — 31 passed, 0 failed, with
`GET /schedule` still reporting 120 activities on the seeded demo database.
`cd frontend && npx vitest run` — 162 passed, `npx tsc --noEmit` clean.

### Affected Areas
`server/db.py` (`Activity.baseline_id`, and the column added to
`_ADDED_COLUMNS` so existing SQLite files migrate), `server/main.py`
(`get_matching_engine`, `_index_is_stale`, `_build_engine_from_db_or_disk`,
`build_index_from_active_baseline`, `rebuild_matching_engine`,
`_activity_to_dict`, `scoped_activities`, `_attribute_activities_to_baseline`,
the import and seed paths, `GET /schedule`, `_generate_pmxml`,
`_generate_xer`, `POST /schedule/export`), `server/test_baseline.py`,
`server/test_server.py`, and the two new test files.

### Trade-offs / Consequences
Importing a baseline now changes what `GET /schedule` returns far more sharply
than before: the previous project disappears from the view in one step. That
is the correct behaviour and it is also a bigger action than the old import
was, so the endpoint's `replace=true` consent now carries more weight than
when it only meant "update planned fields".

`_matcher_baseline_drift` is kept even though it should no longer fire. It is
the check that would catch a rebuild that failed, and a warning that never
appears costs nothing.

**Still open, and stated rather than hidden:** every other consumer of the
activities table — `server/evm.py`, `server/cpm.py` called from
`executive_metrics`, the quantity ledger, the delay layer — still queries
`db.query(Activity).all()` unscoped. On a database where two baselines
coexist, those figures span both projects. `GET /schedule` and the matcher
were fixed here because they are what the acceptance condition runs through;
scoping the rest is a mechanical follow-up and should happen before this is
demonstrated on an imported schedule.

---

## 2026-09-05 / D-093 — The metrics describe the build that ships

### Context
Three separate things made every accuracy figure in this repository
unquotable.

**The evaluator tuned on the rows it then scored.** `dataset/ground_truth.csv`
had no `split` column, so `eval.py` fell into its "calibrated + evaluated on
the full dataset" branch: a grid search picked the thresholds that maximised
auto-link precision over 254 mentions, and then reported the precision those
thresholds achieved over the same 254 mentions. The headline **100% auto-link
precision** was therefore a property of numbers fitted to the evaluation set.
`METRICS.md` §3.1 said so in a sentence — "calibrated and reported on the same
data, and must be labelled as such" — which is honest labelling of a figure
that should not have been the headline at all.

**The evaluator and the server were different builds.** `eval.py` constructed
its engine with `config=None` (`DEFAULT`) unless `--production` was passed,
while the server called `production(sha)`. And the thresholds `eval.py`
reported at were the ones it had just grid-searched, while the server ran a
literal `Thresholds(tau_high=0.70, tau_low=0.40, margin_min=0.03)` written into
`server/main.py` under a comment quoting a third set of figures — 96.6%
precision, 48% coverage — that no command in the repository reproduced.

**The shipped thresholds had never been measured on held-out data.** They had
not been, because there was no held-out data.

### Decision

**A split, assigned by source file.** `dataset/ground_truth.csv` gains a
`split` column: dev 100 mentions from six sources, test 154 from the other six,
with hard negatives on both sides (3 / 9). Splitting by SOURCE rather than by
row is the whole point — mentions from one daily report describe one day's work
in one writer's phrasing, so a row-wise split would put near-duplicates on both
sides and the held-out score would be measuring memorisation.

**One configuration.** `matching/config.py :: SHIPPED_THRESHOLDS` is the single
definition. `server/main.py` imports it as `MATCHING_THRESHOLDS`; `eval.py`
evaluates at it and builds its engine through the same `production(sha)` call
the server uses. An evaluation of a different engine than the one that ships is
not an evaluation of anything anyone can run.

**Thresholds chosen on dev, by a stated rule.** Among threshold sets holding
100% auto-link precision on dev with at least 45% dev coverage, take the
highest `tau_high`, then the largest margin — the most CONSERVATIVE point
rather than the highest-coverage one. That yields **0.80 / 0.40 / 0.03**.

The conservatism is doing real work. Measured on the held-out test split:

| thresholds | chosen by | auto-link precision | wrong auto-links | coverage |
|---|---|---|---|---|
| 0.75 / 0.30 / 0.02 | dev-optimal (max coverage) | 93.2% | 7 | 66.9% |
| 0.70 / 0.40 / 0.03 | what the server shipped | 95.2% | 5 | 68.2% |
| **0.80 / 0.40 / 0.03** | **dev-conservative** | **100.0%** | **0** | **43.5%** |

Both of the first two reach 100% on dev. Only the third survives contact with
data it was not chosen against.

**Errors are printed as counts.** `print_errors` reports wrong auto-links,
wrong review rows, mentions with no candidate, and NO_MATCH outcomes as
integers next to the percentages. "95.2% auto-link precision" and "five
auto-links onto the wrong activity" are the same fact, and only the second says
what it costs a planner.

**Calibration became an explicit mode.** `python eval.py` measures the shipped
build. `python eval.py --calibrate` runs the grid search on dev, prints its
proposal, and states in its own mode line that it is NOT the shipped build —
plus a NOTE naming the difference when the proposal and `SHIPPED_THRESHOLDS`
disagree. The old `--production` flag is gone because production is now the
default and the only default.

### The shipped figures
```
python eval.py

  SHIPPED configuration, measured on HELD-OUT test (154 mentions)
  thresholds tau_high=0.8 tau_low=0.4 margin_min=0.03

  Top-1 accuracy            86.9%   126/145 gold positives
  Precision (suggestions)   81.8%   126 correct suggestions
  Coverage (% auto-linked)  43.5%   67 of 154 mentions
  Auto-link precision      100.0%   67/67
  NO_MATCH rejection         0.0%   0/9

  Wrong auto-links (written, no planner)      0  of 67
  Wrong review rows (queued, not written)    28
  Gold mentions with no candidate             0  of 145
  NO_MATCH mentions correctly refused         0  of 9
```

The NO_MATCH row is the weakest number here and is reported rather than
buried: none of the nine hard negatives is refused outright. All nine go to
REVIEW, so none is auto-linked and none corrupts the schedule — the failure is
that a planner sees nine rows they should not have to look at, not that a wrong
date is written.

### Alternatives Considered
- **Keep the 100%/50.4% figures and footnote the leakage.** Rejected. A
  footnote does not travel with a number into a slide, and this is the number
  the whole product is argued from.
- **Ship the dev-optimal thresholds and report 93.2%.** Rejected: the project's
  stated constraint is that a wrong auto-link writes a wrong date onto a
  schedule with no planner in the loop. Seven of those is not an operating
  point this product can defend.
- **Split by row instead of by source.** Rejected — it leaks. Two mentions of
  the same pour from the same DPR would sit on opposite sides.
- **Re-fit the ranker on the new split.** Out of scope here and would confound
  the change. The artefacts remain fitted against v2 and `production()`
  continues to refuse them for v1, which is why this measures the hand-set
  blend.

### Verification
`python -m pytest -q` — 1186 passed. Two suites changed because the operating
point moved, and both were made to say what they actually test:

* `server/test_date_basis.py` drives the real ingest endpoint and needs a
  mention to AUTO_LINK before the roll-up gate it is testing (D-008) is
  reached. At tau_high=0.80 the undated claims in `dpr_day_10` route to REVIEW
  on confidence instead, so the gate went uncovered and six tests failed. They
  now pin `Thresholds(0.70, 0.40, 0.03)` in a fixture, with a comment saying
  that this is deliberately not the shipped point and that the gate, not the
  operating point, is what they cover.
* `test_ground_truth_coverage` asserted `coverage >= 0.25` on a per-ACTIVITY
  count that is not any metric in `eval.py`. It reads 21.3% at the stricter
  threshold. The floor is re-set to 0.18 and relabelled a regression floor, with
  a note not to quote it.

`python eval.py` and `python eval.py --calibrate` both run clean.
`python scripts/healthcheck.py` — 31 passed. `npx vitest run` — 162 passed,
`npx tsc --noEmit` clean.

### Affected Areas
`dataset/ground_truth.csv` (new `split` column), `matching/config.py`
(`SHIPPED_THRESHOLDS`), `server/main.py` (`MATCHING_THRESHOLDS` now imported),
`eval.py` (default mode, `--calibrate`, `print_errors`, error counts in
`evaluate`, the reproduction command in the footer),
`server/test_date_basis.py`, `server/test_server.py`, `METRICS.md` §3.1,
`README.md`.

### Trade-offs / Consequences
Coverage falls from a claimed 50.4% to a measured 43.5%, and about a quarter
more mentions now reach the review queue. That is the cost of the precision
constraint, and it is the right trade for this product: a REVIEW row costs a
planner ten seconds, and a wrong auto-link costs them a wrong date on a
schedule they then plan against.

**Still open, and stated rather than hidden:**

- `research/` and the dated audit documents (`Audit-1.md`, `FINDINGS.md`,
  `AUDIT_CODEX.md`, `Latest Update 1-09-26.md`) still quote the withdrawn
  figures. They are dated records of past runs and were left as written rather
  than retro-edited; `METRICS.md` remains the file that governs, and it now
  says §3.1's earlier numbers were withdrawn.
- `METRICS.md` §3.2 and §3.3 are v2-corpus research figures produced by the
  same evaluator. Their splits are genuine, but they have not been re-run
  against `SHIPPED_THRESHOLDS` and should not be quoted as production numbers.
- NO_MATCH rejection is 0/9. Nothing is corrupted by it, but the hard-negative
  path is the weakest part of the matcher and the denominator is too small to
  tune against.

---

## 2026-09-05 / D-094 — Insufficient evidence is an answer

### Context
The "institutional memory" surface produced a number whatever the evidence,
and the thinner the evidence the more confident the number looked.

**`POST /memory/estimate` invented tender durations.** A tender duration is a
figure a contractor prices work against. This endpoint produced one in every
case:

* with ONE completed activity it produced a distribution — `p10 = actual x
  0.8`, `p90 = actual x 1.3` — a spread invented from a single observation;
* with NO completed activities it produced `planned x 0.85 / 1.15 / 1.45`,
  three multipliers with no derivation, labelled P10 / P50 / P90;
* with no planned durations either, it fell back to a literal `10.0` days.

**Its risk matrix manufactured probabilities.** `probability_pct = min(85,
max(20, frequency * 15))` — a percentage produced by multiplying a count by
fifteen. On this corpus every recorded cause has a frequency of 1, so the
screen showed "20% probability" against causes observed exactly once. Under
those, the frontend printed "Observed N times on past OIL projects": this
system has never seen another project.

**And when nothing was recorded, it made something up.** The empty case
returned a hardcoded `TenderRiskFactor` — "Upper Assam Monsoon Delays, 65%
probability, historical_frequency 3" — a risk, a probability and a history,
none of which existed.

**The Historical Benchmarks table led with anecdotes.** It sorted by delta
and put `CIV-PLT +29.0d · +483%` at the top of the screen, computed from ONE
completed activity. The largest number on the page was the least supported one.

### Decision

**`MIN_ACTUALS_FOR_ESTIMATE = 3`, and below it nothing is estimated.** Three
matches `server/productivity.py :: MIN_COMPARABLES` — the same question was
answered there for the granularity engine (D-087) and answering it differently
here would leave one system with two opinions about what counts as evidence.

When the bar is not met, `evidence_sufficient` is false, every duration field
is null — and they are null together, so no caller can pick one out — and
`evidence_note` states how many records were found and how many are needed.
The median PLANNED duration is still reported, because it is a fact about the
baseline, and it is never scaled into a substitute for the percentiles. That
scaling was the defect.

The same bar now gates the productivity rate, `suggested_duration`, and the
planned-vs-actual delta on the Memory screen, where a row below it keeps its
counts and says "insufficient evidence" where the delta was.

**Monsoon multipliers stay, labelled at every point they appear.** They are
kept because a tender estimate that ignores the Upper Assam monsoon is wrong in
a more expensive direction. They are labelled because nothing in this system
has measured what the monsoon costs: `delay_events` records rain delays but the
corpus holds too few to fit a factor against, and no weather series is ingested
at all. `_SITE_CONDITIONS` carries the multiplier, the contingency fraction and
the sentence that names both as assumptions; the response returns
`weather_basis` and `contingency_basis`; and the operating-condition selector
says so before the estimate is even requested. The unadjusted figure is
recoverable by dividing by the factor the response states.

**A risk factor reports a count, not a rate.** `probability_pct` is now
optional and is always null: it stays in the schema so a version fitted against
real history can populate it, and `basis` says which of the two a reader is
looking at ("observed 1 time in this project's delay register, costing 21 days
at most"). The fabricated fallback is deleted; when nothing is recorded the
list is empty and `risk_factors_note` explains what the numbers are.

### Alternatives Considered
- **Defer the whole feature.** Explicitly on the table, and rejected: the
  underlying delay register and duration ledger are real and are the strongest
  part of this surface. What had to go was the invention layered on top, not
  the layer beneath it.
- **Show the invented numbers greyed out or marked "indicative".** Rejected.
  A qualifier does not survive a screenshot, and P10/P50/P90 in a tender panel
  reads as a measurement however it is styled.
- **Drop the monsoon multipliers entirely.** Rejected — the user asked for them
  kept as labelled assumptions, and they are genuinely useful. What was wrong
  was presenting them as calibration.
- **Set the bar at 2.** Rejected: two points define a range with no interior.
  Three is the least that can show a shape, and it is still small enough that
  the response says so in `evidence_note`.

### What it does now
```
piping / monsoon_upper_assam        17 actuals
  sufficient  p10/p50/p90 = 6.8 / 14.9 / 23.0 d   recommended 17d
  "Percentiles over 17 completed piping activities. 17 is a small sample:
   p10 and p90 are the extremes of what this project has actually done,
   not a fitted distribution."
  weather x1.35 — "an ASSUMPTION: ... Not fitted to this project's records"

PIP-SPL / monsoon_upper_assam        2 actuals
  INSUFFICIENT — every duration field null, pmxml_snippet null
  "Insufficient evidence: 2 completed PIP-SPL activities carry both actual
   dates, and at least 3 are needed before a duration percentile means
   anything. 5 activities are in scope; the rest have not finished. No
   tender duration is offered."

hse / standard                       0 actuals
  INSUFFICIENT

risk factors    prob=None  freq=1
  "observed 1 time in this project's delay register, costing 21 days at most"
```

On the Memory screen the planned-vs-actual table now leads with `PIP-HYT 3/5`
and `CIV-PLY 3/3` rather than a single-activity `+483%`, and the fourteen
types below the bar read "insufficient evidence" beside their real counts.

### Verification
`python -m pytest -q` — 1190 passed, up from 1186.
`cd frontend && npx vitest run` — 166 passed, up from 162. `npx tsc --noEmit`
clean. `python scripts/healthcheck.py` — 31 passed.

Two backend tests were rewritten because they pinned the invention:
`test_tender_estimate_post` and `test_tender_estimate_get` asserted
`recommended_tender_duration > 0` unconditionally, which could never fail while
the endpoint manufactured a number in every branch. They now supply the
completed work the estimate requires, and four new tests cover the refusal: a
thin scope, a discipline with no completed work, the count-not-probability
contract, and that no risk factor is invented when none is recorded.

`tenderEstimator.test.tsx` grew from 2 tests to 6, including one asserting the
insufficient panel renders and no percentile card does.

### Affected Areas
`server/main.py` (`MIN_ACTUALS_FOR_ESTIMATE`, `_SITE_CONDITIONS`,
`_site_condition`, `_compute_tender_estimate`, `_tender_risk_factors`,
`_RISK_FACTORS_NOTE`, `_compute_suggested_duration`), `server/schemas.py`
(`TenderRiskFactor`, `TenderEstimateResponse`),
`frontend/src/components/TenderEstimator.tsx`, `frontend/src/pages/Memory.tsx`,
`frontend/src/types.ts`, `server/test_server.py`,
`frontend/src/test/tenderEstimator.test.tsx`.

`_compute_tender_estimate` also now reads `scoped_activities(db)` rather than
every activity in the table, so it estimates from one project rather than two
(D-092).

### Trade-offs / Consequences
The demo shows fewer numbers. On the seeded corpus only five activity types
clear the bar for a planned-vs-actual delta, and a tender query against a
specific type will usually refuse. That is what this corpus supports, and the
refusal is a more defensible thing to put in front of a client than a
percentile computed from one activity.

**Still open, and stated rather than hidden:** `_compute_productivity` and
`_compute_delay_reasons` behind `GET /memory/query` still report means and
frequencies with no minimum sample. The Memory screen labels their denominators
(`"no completed activities yet"`, `"21/22"`, the reports column), so nothing
there is unlabelled — but the bar applied above has not been applied to them,
and it should be.

---

## 2026-09-06 / D-095 — The reporting flow has states, and a refusal is one of them

### Context
The Report Studio had two states: "no response yet" and "a response arrived".
Every 200 opened the interpretation panel, so a response the server had sent
in order to REFUSE the input rendered as a result. Typing "I love pizza"
produced:

* the heading "NAVIS understood" over a panel of extracted values;
* a discipline chip reading **Civil** — because the discipline select
  defaulted to the first entry in an alphabetical list and sent it as request
  context, which `_apply_context` then wrote into the slot;
* a match confidence, from a matcher that had never been run on it.

The server behaved correctly throughout: `_unreportable_reason` gates the
agent path before the matcher and returned `match_outcome:
"not_a_progress_report"` with a readable sentence. The screen had nowhere to
put that answer, so it put it where every other answer went.

Three further problems sat behind it.

**The relevance gate refused blockers.** `REPORTABLE_TERMS` covered work done
but not work prevented, so "waiting for permit" came back as *"it does not
mention any construction activity, quantity or tag"* — wrong, and unhelpful,
because the refusal then told the supervisor to describe work done, which is
exactly what they could not do. A report that nothing happened, and why, is
what a delay claim is later built from (D-077).

**The clarification questions arrived in a chat panel.** A permanently
embedded "Field Update Assistant" occupied a third of the screen, answered
itself on a `setTimeout`, and was where the questions a report could not be
submitted without appeared — mixed in with general chit-chat.

**Ask NAVIS crashed on close.** `useLocation` and a `useMemo` sat below
`if (!isOpen) return null`, so the component ran a different number of hooks
open than closed. React tolerates that until the panel actually toggles, and
then throws *"Rendered more hooks than during the previous render"* and tears
down the tree — taking an in-progress report draft with it. The existing tests
render the panel either open or closed and never both, so nothing caught it.

### Decision

**Eight named states, and a failure that is not one of them.**

```
draft -> checking -> invalid | needs_clarification | unmatched | ready
                  -> submitting -> submitted
```

`phaseFor(turn)` maps a response to exactly one: `not_a_progress_report` to
`invalid`, an open slot to `needs_clarification`, a completed report with no
`activity_id` to `unmatched`, otherwise `ready`. A request FAILURE is tracked
separately, so a dropped connection returns the draft to the state it was
already in rather than destroying the interpretation.

**A refusal renders as a refusal.** "This does not look like a site report",
the server's own sentence, and an explicit statement that nothing was stored
and nothing inferred. The interpretation panel does not open. The outcome code
`not_a_progress_report` is never shown: it is an internal value, and a
supervisor who reads it learns nothing.

**"Select discipline" replaces the arbitrary default.** The only legitimate
default is a remembered one, so `savedDiscipline()` reads the discipline this
supervisor last submitted under and `rememberDiscipline()` writes it on a
successful submission. `agentContext()` OMITS the field when nothing is
chosen, so the server infers what it can and asks when it cannot.

**Selected and extracted values are labelled differently.** Every chip in the
review panel says "you selected" or "read from your report". Only the second
kind can be wrong in a way the supervisor would want to correct.

**Report validity is separate from discipline classification.** The gate
gained a blocker vocabulary — permits, clearances, access, weather, materials,
drawings, plant, manpower, mobilisation, handover — and its refusal sentence
now names both halves: *"it does not describe site work, a quantity, an
equipment tag, or something that stopped work"*. Quantity was already
conditional on a countable plural (`_quantity_relevant`), so a blocker was
never asked for one.

**"NAVIS understood" became "Review your report"**, and "A few details
needed" while a slot is open. The first claimed comprehension; these describe
a proposal a person is being asked to check.

**Editing invalidates the interpretation and mints a new session.** The new
session id is the important half: slots accumulate server-side and are never
overwritten once set, so re-checking an edited report on the same session
would answer about the old one. Any change to the report text, date,
discipline or work front clears the interpretation and disables submission
until the draft is checked again.

**A stale response cannot overwrite a newer draft.** Every request takes a
number from a monotonic counter and captures the draft key it was sent for. A
reply whose number is not the latest, or whose key no longer matches, is
discarded silently.

**Clarification moved into the reporting flow.** The embedded assistant is
gone. The agent's question, its closed-set answers as chips, and a free-text
answer box now sit inside the review panel. General assistance stays behind
the Ask NAVIS button, which opens nothing on its own.

**A lost response is not reported as a refusal.** An `ApiError` means the
server answered, so "nothing was stored" is a fact. Anything else means the
request never got a reply, and on a confirm that is genuinely ambiguous — the
write may have committed before the connection dropped. That case says "Could
not confirm", states that the update may or may not have been recorded, and
offers Retry. Retry is safe because `_existing_agent_submission` files one
submission per session and hands back the existing row on a repeat, so it
cannot create a second record.

### Verification
`python -m pytest -q` — 1196 passed. `cd frontend && npx vitest run` — 195
passed, up from 166. `npx tsc --noEmit` clean.

`frontend/src/test/fieldStudio.test.tsx` was rewritten from 11 tests to 25,
walking each journey: an untouched form that makes no request, irrelevant
input that infers no discipline and shows no outcome code, an incomplete
report through clarification to review, an unmatched report that still has a
route to the planner, edit-invalidates-recheck-submit, both failure kinds, and
a late response that must not overwrite a newer draft.

`frontend/src/test/chatSeparation.test.tsx` is new (10 tests): the panel never
opens itself and closes on Escape and on its button in all three roles, focus
returns to the trigger, the draft and the interpretation survive an open and
close, and a chat message reaches `/chat` and never `/agent/turn`.

Checked in a browser against the running API:

```
"I love pizza"            -> refused; no discipline, no activity, no panel
"Pump installation finished" -> "Where is this work happening?"
"Work stopped because access was blocked" -> accepted, asks the discipline
piling report              -> Review your report, 69.9%, sources labelled
edit the text              -> panel gone, submit disabled, "check it again"
Ask NAVIS open then close  -> draft preserved, focus back on the trigger
375x812                    -> both primary actions in view, no h-scroll
```

### Affected Areas
`frontend/src/pages/field/ReportStudio.tsx` (rewritten),
`frontend/src/config.ts` (`agentContext` discipline optional,
`savedDiscipline`, `rememberDiscipline`),
`frontend/src/components/AskNavisChat.tsx` (focus restoration; hooks moved
above the early return), `server/main.py` (`REPORTABLE_TERMS` blocker
vocabulary, refusal sentence), `frontend/src/test/fieldStudio.test.tsx`,
`frontend/src/test/chatSeparation.test.tsx` (new).

### Trade-offs / Consequences
Submitting now takes two deliberate actions — Check, then Send — where it
previously took one. That is the cost of never showing a supervisor a
confirmation built on an interpretation that no longer matches what they
typed.

**Not done here, and stated rather than hidden:** the mobile layout was
verified at 375x812 with the on-screen keyboard absent. A real device with the
keyboard raised shortens the viewport further, and the fixed action bar sits
above the bottom nav rather than above the keyboard; that needs a device test
before the demo.

---

## 2026-09-06 / D-096 — Clarifications is an actionable work queue, not a KPI dashboard

### Status
Active.

### Context
The original Field Supervisor `/field/clarifications` screen featured three giant
metric cards (`0 NEEDS RESPONSE`, `0 ANSWERED`, `0 TOTAL`), three pill filters,
and an enormous 100%-width bordered empty-state card. When zero clarifications
existed, almost the entire screen was wasted just rendering "0", mimicking a
dashboard rather than functioning as an operational inbox.

Furthermore, the sidebar item for Clarifications in `FieldWorkspaceShell.tsx` had
fallback logic defaulting to `2` when the query resolved or was empty, giving
a false impression of urgent pending actions, and the respond flow on individual
cards embedded textareas directly inside every card without focused interaction.

### Decision
1. **Eliminate Dashboard KPI Tiles**: The 3 oversized stat cards were deleted.
   Quantitative status is compactly integrated near the page title (`2 require
   your response · 7 answered`) and inside segmented filter chips (`[ All (9) ]
   [ Needs response (2) ] [ Answered (7) ]`).
2. **Compact Centered Empty State**: Removed the full-width boxed container.
   Zero clarifications displays a clean, centered, natural-whitespace message:
   `✓ No clarifications needed · Planning hasn't requested any additional information`.
3. **Sidebar Badge Dynamic Guard**: In `FieldWorkspaceShell.tsx`, `unanswered`
   count is derived strictly from real query data and defaults to `0`. If `0`,
   no badge is rendered. When `> 0`, it displays an amber warning badge.
4. **Question-First Information Hierarchy**: The question asked by Planning is
   the most prominent element (`text-lg font-semibold text-heading`). The original
   field report snippet and linked activity are presented in a dedicated context
   callout beneath it, followed by Planning Engineer attribution and a direct
   `[ Respond ]` action button.
5. **Slideout Respond Drawer**: Clicking `[ Respond ]` or navigating with
   `?item=<id>` opens a dedicated slideout drawer presenting Planning's question,
   verbatim original update context, response textarea, voice transcription
   controls (`useSpeech`), and action buttons (`Cancel` / `Send Response`).
   Submitting sends `POST /field/clarifications/{id}/respond`, triggers query
   invalidation, displays a success toast (`Response sent to Planning Engineer`),
   and preserves the answered item under `Answered` for traceability.
6. **Cross-Page Deep Linking**: `My Updates` items needing clarification route
   directly to `/field/clarifications?item=<id>`, automatically opening the drawer.

### Verification
`python -m pytest -q` — 1196 passed. `npm test -- --run` — 223 passed (23 files).
`npx tsc --noEmit` — 0 errors. Vite production build — clean in 2.51s.

### Affected Areas
- `frontend/src/pages/FieldClarifications.tsx` (redesigned)
- `frontend/src/pages/field/FieldWorkspaceShell.tsx` (badge logic)
- `frontend/src/pages/FieldReports.tsx` (deep links)
- `frontend/src/test/field.test.tsx` (test update)

---

## 2026-09-06 / D-097 — Field Supervisor Preferences: personal application settings first, assignment metadata secondary

### Status
Active.

### Context
The Field Supervisor Preferences screen (`/field/profile` / `FieldProfile.tsx`) was vertically stretched and visually dominated by read-only project metadata rather than personal application preferences. It presented an oversized ~400px profile card followed by five full-width rows for project assignment parameters (`PROJECT`, `PROJECT CODE`, `WORK FRONT`, `DATA DATE`, `DETAILS`). The actual configurable application settings (Theme and Language) were relegated to full-width stacked buttons at the bottom.

Furthermore, speech language selection was held in component-level state across the navigation header in `FieldWorkspaceShell.tsx` and the Preferences screen, without persistent `localStorage` storage or shared bi-directional synchronization.

### Decision
1. **Preferences Information Architecture**: Inverted the visual hierarchy to prioritize user-configurable settings:
   - Header: Standardized title to `Preferences` and subtitle to `Personalize how NAVIS works for you.`
   - Compact User & Assignment Summary Card (~100px): Replaced the 400px profile container with a streamlined horizontal banner displaying role badge (`FS`), supervisor role (`Field Supervisor`), server project name (`OIL-WSD-2026`), work front chip (`Well Pad 04 · Sector A`), discipline (`Piping`), and shift (`Shift: Day`).
2. **Section 1: Appearance & Theme**:
   - Replaced full-width buttons with a compact horizontal segmented control (~280px wide: `[ ☀ Light ] [ ☾ Dark ]`).
   - Deeply integrated with `useTheme`, synchronized with `localStorage['theme_override']`, login screen, and the shell toggle.
3. **Section 2: Language & Voice Input**:
   - Compact segmented control for voice recognition: `[ English ] [ Hindi ] [ Assamese ]`.
   - Wired `useSpeech.ts` with local storage persistence (`localStorage['navis.speech_lang']`), ensuring language preferences survive page reloads and stay synchronized across `FieldWorkspaceShell.tsx` header chips and `FieldProfile.tsx`.
   - Added transparent browser-native speech privacy notice: *"Speech recognition runs in the browser. Nothing is recorded or sent to a speech service."*
4. **Section 3: Current Assignment (Compact Metadata Grid)**:
   - Replaced stacked full-width rows with a compact 3-column metadata card marked with a subtle `READ-ONLY` badge: Project (`OIL-WSD-2026`), Project Code (`OIL-WSD-2026`), Work Front (`Well Pad 04 · Sector A`), Discipline (`Piping`), Shift (`Shift: Day`), and Data Date (`15-Sep-2026`).
5. **Session Actions**:
   - Provided clean navigation actions: `[ Back to home ]` (secondary) and `[ Return to role selection ]` (accent CTA, clearing session role via `useSession.signOut()`).
6. **Strict Quality & Test Compliance**:
   - Adhered strictly to `frontend/src/test/field.test.tsx` constraints: zero banned terms (`Crew`, `Workers`, `Offline`, `Last sync`, `Pending`, `Draft`, `Notification`, `Rajesh Kumar`, `OIL-FS-014`). No fabricated notification switches or ungrounded toggles.

### Verification
- `npx tsc --noEmit` — 0 errors.
- `npm test -- --run` — 223 tests passing across 23 test suites.
- `npm run build` — Clean production bundle in 2.63s.
- `python -m pytest -q` — 1196 backend tests passing.

### Affected Areas
- `frontend/src/pages/FieldProfile.tsx` (redesigned)
- `frontend/src/hooks/useSpeech.ts` (localStorage persistence)
- `frontend/src/pages/field/FieldWorkspaceShell.tsx` (bidirectional sync with useSpeech)

---

## 2026-09-10 / D-098 — Browser-compatible UUID generator with non-secure LAN HTTP fallback

### Status
Active.

### Context
When accessing the frontend over a local LAN IP (e.g. `http://192.168.1.7:5173`) from mobile devices (iOS Safari / Chromium), the frontend crashed immediately on mount with:
`TypeError: crypto.randomUUID is not a function. (In 'crypto.randomUUID()', 'crypto.randomUUID' is undefined)`.

Per W3C Web Cryptography API specifications, `crypto.randomUUID()` is strictly gated to Secure Contexts (`window.isSecureContext === true`). While `http://localhost` is granted a secure-context exception by browsers, plain HTTP over private LAN IP addresses (`http://192.168.x.x`) is considered non-secure. On non-secure contexts, Safari/WebKit and Chromium omit `crypto.randomUUID` from `window.crypto`.

### Decision
1. **Centralized UUID Utility (`frontend/src/lib/uuid.ts`)**:
   - Created a single shared helper `generateUUID()` (re-exported as `randomUUID`) with multi-tier fallback:
     1. Native `crypto.randomUUID()` when available in secure contexts (HTTPS / localhost).
     2. `crypto.getRandomValues()` RFC 4122 v4 calculation when in non-secure HTTP contexts (which remains available on HTTP in modern browsers).
     3. High-resolution timestamp + `Math.random()` pseudo-random generator as an ultimate fallback if crypto is completely unavailable.
2. **Replaced All Direct Call Sites**:
   - `frontend/src/pages/Field.tsx`: replaced `crypto.randomUUID()` in initial `sessionId` and `resetSession()`.
   - `frontend/src/pages/field/ReportStudio.tsx`: replaced `crypto.randomUUID()` in initial `sessionId`, edit-invalidation effect, and `startOver()`.
   - `frontend/src/components/AskNavisChat.tsx`: replaced `crypto.randomUUID()` in user and assistant message IDs.
3. **No UI or Functional Drift**:
   - Zero changes to UI layout, styling, or application behavior.
   - All generated IDs conform strictly to RFC 4122 v4 UUID format.

### Verification
- `frontend/src/test/uuid.test.ts`: 5 new tests verifying native, non-secure `getRandomValues`, fallback, and uniqueness paths.
- `npx tsc --noEmit`: 0 errors.
- `npm test -- --run`: All 24 test files and 229 tests passed cleanly.
- `npm run build`: Production bundle built cleanly in 6.09s.

### Affected Areas
- `frontend/src/lib/uuid.ts` (new)
- `frontend/src/test/uuid.test.ts` (new)
- `frontend/src/pages/Field.tsx`
- `frontend/src/pages/field/ReportStudio.tsx`
- `frontend/src/components/AskNavisChat.tsx`

---

## 2026-09-10 / D-099 — Mobile viewport adaptation, zero horizontal blowout, and responsive multi-workspace navigation shells

### Status
Active.

### Context
When testing the application on mobile devices (e.g. iPhone / Android handsets over LAN `http://192.168.1.7:5173`), screens were "glitching all over the place and not working at all".
Investigation identified several severe root causes:
1. **Desktop Shell layout collision on mobile viewports (< md / < 768px)**:
   - `DesktopShell` (used for Planning Engineer and Senior Management / Executive workspaces) rigidly rendered a fixed 240px wide sidebar `<aside>` alongside the main content on all viewports.
   - On a 360px–390px mobile handset screen, the 240px sidebar left only 120px–150px for the entire application, crushing tables, cards, and forms.
2. **Field Workspace Shell top navigation bar overflow**:
   - `FieldWorkspaceShell.tsx` placed the workfront location pill, 3 separate language toggle chips (`English`, `Hindi`, `Assamese`), the offline indicator button, `Ask NAVIS` button, and `Switch role` button in a single non-wrapping flex row. On screens narrower than 480px, this row exceeded 550px, blowing out the horizontal viewport and triggering lateral finger scrolling and layout stutter.
3. **Absence of strict horizontal viewport containment**:
   - Lack of `viewport-fit=cover` in `frontend/index.html` and absence of `overflow-x: hidden; max-width: 100vw;` on `html, body` allowed offscreen content to cause horizontal scrolling jitter and diagonal touch gestures.
4. **Master-Detail screen congestion**:
   - Workspaces like `Reconcile.tsx` and `Delay.tsx` rendered side-by-side two-column grids on wide desktop, but on mobile screens they vertically stacked without navigation aids, forcing supervisors and planners to scroll endlessly past tall queues to access review and adjudication actions.
5. **Modal & Drawer viewports**:
   - Full-width modal overlays and slide-out detail drawers (`Milestones.tsx`, `Raid.tsx`, `FieldReports.tsx`, `ReportStudio.tsx`) lacked backdrop touch dismissal or exceeded viewport height boundaries on mobile browsers with bottom navigation bars.

### Decision
1. **Global Viewport & Overflow Containment**:
   - Updated `frontend/index.html` `<meta name="viewport">` with `viewport-fit=cover` to support modern mobile bezel safe areas.
   - Enforced `overflow-x: hidden; max-width: 100vw; width: 100%;` in `frontend/src/index.css` on `html, body, #root`.
2. **Responsive Desktop Navigation Shell with Slide-Out Mobile Drawer**:
   - Updated `DesktopShell` in `frontend/src/App.tsx`:
     - Hid the fixed 240px `<aside>` on mobile (`hidden md:flex md:w-60`).
     - Added a clean mobile header bar on `< md` with a hamburger menu button (`Menu` icon), branding, and active workspace title.
     - Implemented an animated mobile slide-out drawer (`isMobileNavOpen` state) with backdrop touch-dismissal, project metadata, responsive navigation links, theme toggle, and switch-role action.
     - Responsive content container padding: `p-3 sm:p-4 md:p-6 w-full max-w-full min-w-0`.
3. **Field Supervisor Responsive Header (`FieldWorkspaceShell.tsx`)**:
   - Compressed location chip on mobile with truncation (`max-w-[110px] xs:max-w-[150px] sm:max-w-none`).
   - Hid secondary subtitle (`Piping · Field Supervisor`) on `< sm`.
   - Compressed offline indicator to a compact dot with icon on `< sm`.
   - Compact multilingual selector: toggles between a single compact `{lang.toUpperCase()}` pill on `< sm` and the full 3-chip control on `sm+`.
   - Icon-only compact mode for `Ask NAVIS` and `Switch role` buttons on `< sm`.
4. **Mobile Master-Detail Segmented Controls**:
   - `Reconcile.tsx`: Added segmented `Queue` vs `Detail` tab switcher on `< lg`. Auto-switches to detail view upon selecting a queue item. Added `← Back to Review Queue` button and responsive action button wrap.
   - `Delay.tsx`: Added segmented `Delay Queue` vs `Adjudication` tab switcher on `< lg`. Auto-switches to adjudication upon selecting an event, with mobile `← Back to Delay Queue` button and stacked notice inputs.
5. **Executive & Operational Page Responsive Polish**:
   - `Schedule.tsx` & `ExecutionInsights.tsx`: Made search inputs fluid and responsive (`w-full xs:w-auto`).
   - `ActivityInspectionPanel.tsx` & `RisksDelays.tsx`: Ensured horizontal tab bars have `overflow-x-auto whitespace-nowrap` for mobile swiping.
   - `Milestones.tsx`, `Raid.tsx`, `FieldReports.tsx`: Added backdrop click-dismissal and responsive padding (`p-4 sm:p-6`) to all inspection drawers and evidence modals.
   - `Forecasts.tsx` & `DataConfidence.tsx`: Replaced rigid column definitions with responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` grids.
   - `ReportStudio.tsx`: Adjusted modal overlay wrapper padding to `p-2 sm:p-6` with `max-h-[96vh]` for mobile screen clearance.
6. **Zero Feature or Test Regression**:
   - Preserved all button labels, test IDs, and existing test invariants across all 24 test suites.

### Verification
- `npx tsc --noEmit`: 0 errors.
- `npm run build`: Production bundle built cleanly in 2.69s.
- `npm test -- --run`: All 24 test files and 229 tests passed cleanly.
- Visual inspection: Verified zero horizontal viewport blowout across 360px–430px mobile device viewports.

### Affected Areas
- `frontend/index.html`
- `frontend/src/index.css`
- `frontend/src/App.tsx`
- `frontend/src/pages/field/FieldWorkspaceShell.tsx`
- `frontend/src/pages/field/IdleStage.tsx`
- `frontend/src/pages/field/ReportStudio.tsx`
- `frontend/src/pages/FieldReports.tsx`
- `frontend/src/pages/Reconcile.tsx`
- `frontend/src/pages/Delay.tsx`
- `frontend/src/pages/Raid.tsx`
- `frontend/src/pages/Schedule.tsx`
- `frontend/src/pages/Ingest.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/components/ActivityInspectionPanel.tsx`
- `frontend/src/pages/executive/Milestones.tsx`
- `frontend/src/pages/executive/RisksDelays.tsx`
- `frontend/src/pages/executive/Forecasts.tsx`
- `frontend/src/pages/executive/ExecutionInsights.tsx`
- `frontend/src/pages/executive/DataConfidence.tsx`
- `frontend/src/pages/executive/ManagementReports.tsx`




---

### D-100 — The SIH idea deck is rebuilt on the official template, with three Eraser flow charts carrying the argument

**Date:** 2026-09-10 · **Status:** current · **Area:** `ppt_build/`, `deliverables/`

**Context.** The previous build of `deliverables/NAVIS_SIH2026_NamasteByte_FINAL.pptx`
put a different visual pattern on every slide — numbered node rows, three-column
cards, metric tiles, a screenshot — with no shared layout language. The content was
accurate but the reader had to relearn the slide on every page. Eight diagrams had
been produced in Eraser (`DECK_DIAGRAMS.md`) and none of them were in the deck.

**Decision.**

1. **The official template is loaded and never restructured.** `build_navis_sih_deck.mjs`
   imports `SIH2026-IDEA-Presentation-Format.pptx` and adds content into the free canvas
   only — `x 36→1244`, `y 125→658` in the tool's 1280 × 720 coordinate space. Every fixed
   element the template ships (slide titles, team-name oval, SIH logo, blue footer bar,
   slide numbers) is left in place and unedited. Only two template shapes are touched:
   the pointer text box on each content slide (`TextBox 8`, the instruction text the
   template exists to have replaced) is deleted, and the instruction page (slide 7) is
   removed because it is not part of a submission.

2. **The template's own fill-in fields are filled run by run, not rebuilt.**
   `fill_template_fields.py` (python-pptx) writes into the existing runs of the cover's
   six-line text box and of each team-name oval, so the template's fonts, bullets and
   geometry survive. Two font sizes are overridden because the shipped ones cannot
   physically hold the required content: the problem-statement title (24 pt runs off the
   bottom of the cover; set to 13 pt) and the team name (breaks "NamasteByte" mid-word in
   the oval; set to 10 pt). Nothing else about the template is changed.

3. **Three of the eight Eraser diagrams are used, not all eight.** Slide 2 takes the
   "two worlds, one bridge" band, slide 3 the master flow chart, slide 4 the on-premise
   stack. The other five were dropped: the 3-way decision mini is already inside the
   master flow chart; the risk/mitigation, who-benefits and evidence-funnel diagrams are
   list-shaped, and reading them as an image costs resolution for no gain, so their
   content is set as native text and native shapes instead. Diagram PNGs live in
   `ppt_build/assets/` and are whitespace-trimmed before placement.

4. **One layout language, taken from the reference deck.** A text column beside a
   dominant flow chart with a thin vertical divider; small underlined blue section
   headings inside the canvas; the numbers as a chip row under a dashed divider; the
   evidence box (repo link, `python eval.py`, "1,426 automated tests passing" in red) in
   the bottom-right corner of slide 3.

**Consequence.** The deck is six slides, all figures on the `NUMBERS_SHEET.md` allow
list, and the honesty lines are on the slides rather than only in the speaker notes:
"no field pilot, so no ROI is claimed" on slide 5, the known-gaps line on slide 4, and
the evidence-boundary strip on slide 6.

**Verification.** `python scripts/office/validate.py deliverables/…FINAL.pptx --original
<template>` reports `All validations PASSED!`; all six slides were rendered to PNG and
inspected; no content crosses the template's fixed title or footer zones.

**Rejected alternative.** Rebuilding the flow charts as native PowerPoint shapes. The
master flow chart has roughly forty boxes and thirty labelled edges; hand-placing that
buys sharper text at the cost of hours and a layout that cannot be re-exported when the
diagram changes. Eraser stays the source of truth for the three complex charts.

**Related:** `DECK_DIAGRAMS.md` (diagram IDs and edit links), `NUMBERS_SHEET.md` (the
allow list every figure on the deck comes from), `DECK_IMAGE_PROMPTS.md` (prompts for
the optional generated art), D-015 (withheld finish dates, the slide-6 funnel).
