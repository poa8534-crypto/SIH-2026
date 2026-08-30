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

---

## pre-2026-08-30 / D-001 — Retrieval and ranking are separate stages

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
slot filling in `_fill_slots_from_message` is regex and keyword matching.

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
