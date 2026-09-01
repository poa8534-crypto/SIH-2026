# ROADMAP.md — Senior PM review, decoded and architected

**Source:** 2-hour call with a Senior Project Manager, 25+ years, notes taken live.
**Written:** 1 September 2026. **Status:** design document. No code changed.

Two conventions used throughout:

- **[SAID]** — explicitly in your notes from the call.
- **[INFERRED]** — my addition from standard industry practice, clearly separated so
  you never mistake my assumption for his advice.

Where your note is technically imprecise I follow the format you asked for:
*"You were told X. What this most likely means in industry terminology is Y."*

---

## 0. Read this first

### 0.1 Scope reality

What he described is a **construction project-controls platform**. That is a 6–12
month build for a funded team. Your notes contain at least nine subsystems that do
not exist yet: EVM, RAID, a risk engine, pattern analysis, a semantic layer, a third
role, MPP import, Primavera integration, and an extended evaluation module.

Do not attempt this before a hackathon deadline. The triage in §11 says what to
build now, and the honest answer is: four things, none of which take more than a day.

### 0.2 The thing you may not realise

**A large part of what he described, you have already built.** He was not correcting
your architecture — he independently arrived at it and named the parts you were
missing. That is a strong signal and you should say so when you present.

| What he described | What already exists in NAVIS | Gap |
|---|---|---|
| PM sees original input, what AI understood, findings, source, proposed update | Reconcile screen: `source_span`, `raw_text`, `confidence`, `alternatives`, audit drawer | Missing: attachments, RAID detections, explicit approve/reject on a *batch* |
| Knowledge handoff — "drilling took 10 days not 5" | `GET /memory/query` → `suggested_duration` from ≥2 completions, `duration_distribution` | Missing: cross-project scope, conditions/context tagging |
| Database update ≠ project update | Already true architecturally: `LinkedEvent` + `ReviewQueueItem` are separate from `Activity` actuals; only resolve writes | Missing: the *language* to explain it, and a formal Baseline concept |
| Confidence score + audit trail per entry | `AuditRecord`, append-only, one per mutation | Nothing material |
| Scientific evaluation | `eval.py` — precision, recall, top-1 accuracy, coverage, confusion matrix, PR-at-coverage sweep | Missing: RMSE, R², calibration, per-class breakdown |
| Feedback to Field Supervisor | `/field/clarifications`, `/field/reports`, `POST /review/{id}/clarify` | Missing: outcome notifications ("your update moved the schedule") |
| Three roles | Two: Field Supervisor, Planning Engineer | Missing: Senior Management |
| RAID | Delay reasons + review queue + audit exist as raw material | Not assembled |
| EVM | `planned_qty`, `actual_qty`, `percent_complete`, planned vs actual dates | No cost/man-hour data — see §5 |
| Risk / pattern analysis | Nothing | Whole subsystem |
| Semantic layer | `DISCIPLINE_META`, `alias_lexicon`, tag normalisation, WBS paths | Informal, undocumented, partly unused |
| Primavera / MPP import | Export only (PMXML + XER) | Import missing entirely |

---

## 1. Glossary — every term, with construction examples

### 1.1 The three roles

**Field Supervisor** *(also: Site Engineer, Site Supervisor, Foreman)*
The person physically at the work front. Walks the site, sees what crews actually
did today, and reports it. In an EPC job at a well-site they supervise one or two
disciplines in one area — say all piping in Unit 2. They know that spool erection on
the 24" header finished at 3pm; they do not know or care that the plan calls that
activity `PIP-ERC-1030`.

Their defining constraint is **friction**. They are on a site, in the heat, wearing
gloves, with a phone. Anything that takes more than 30 seconds does not get done, and
the data never arrives. This is the entire reason the PS asks for a voice/chat agent
instead of a form.

**Project Manager** *(in your current code: Planning Engineer)*
The person who owns the schedule and is accountable for the project's cost and time.
They reconcile what the field reports against the baseline plan, decide what is real,
update the schedule, chase the causes of slippage, and report upward. They are the
**only** role that should be able to change the official plan.

> **Terminology note.** You were told "Project Manager". In a large EPC organisation
> the roles of *Project Manager* (accountable for the whole project) and *Planning
> Engineer* / *Scheduler* (operates the schedule day to day) are often distinct people.
> For a prototype, collapsing them into one role is correct and normal. Your existing
> "Planning Engineer" label is the more accurate one for what the screen actually does,
> but rename it to Project Manager since that is the vocabulary your reviewer used and
> judges will recognise.

**Senior Management** *(also: Project Director, Portfolio Head, Client PMC)*
Sponsors, directors, the client's representatives. They do not open individual field
reports. They look at a project — or a portfolio of projects — and ask four questions:
Are we on time? Are we on budget? What is going to hurt us? Who is doing something
about it? They need trend, exception and forecast, never transaction detail.

### 1.2 EVM — Earned Value Management

**The simplest possible explanation.**

You are building a boundary wall. 100 metres. Budget ₹10,00,000. Ten weeks.

After five weeks:

- The plan said you would have built 50 m by now. That planned work is worth
  ₹5,00,000. This is **Planned Value (PV)**.
- You have actually built 40 m. That completed work is *worth*, at planned rates,
  ₹4,00,000. This is **Earned Value (EV)**. Note: value earned is measured at the
  *budgeted* rate, not what you spent.
- You have actually spent ₹6,00,000. This is **Actual Cost (AC)**.

From three numbers you get the whole story:

| Metric | Formula | Wall example | Meaning |
|---|---|---|---|
| Schedule Variance | SV = EV − PV | −₹1,00,000 | Behind schedule |
| Cost Variance | CV = EV − AC | −₹2,00,000 | Over budget |
| Schedule Performance Index | SPI = EV / PV | 0.80 | Getting 80% of planned progress |
| Cost Performance Index | CPI = EV / AC | 0.67 | Getting ₹0.67 of value per ₹1 spent |
| Budget at Completion | BAC | ₹10,00,000 | Original budget |
| Estimate at Completion | EAC = BAC / CPI | ₹14,92,537 | Forecast final cost |
| Variance at Completion | VAC = BAC − EAC | −₹4,92,537 | Forecast overrun |

The power of EVM is that it turns "we're a bit behind" into a defensible forecast.
SPI 0.80 five weeks in, held constant, predicts a 12.5-week finish, not ten. That
is why every serious infrastructure client mandates it.

**Older names you will see in Indian and Oracle documentation:** PV = BCWS (Budgeted
Cost of Work Scheduled), EV = BCWP (Budgeted Cost of Work Performed), AC = ACWP
(Actual Cost of Work Performed).

**What EVM needs, and what you have.** This is the important part and §5 covers it
in full: you can compute the **schedule half** (PV, EV, SV, SPI) from data you
already collect. You **cannot** compute the cost half (AC, CV, CPI, EAC) because no
field report contains actual cost, and you have no budget field.

### 1.3 Project data vs knowledge handoff

**Project data** — information that changes *this* project. Progress, dates, status,
risks, issues, actions, decisions. Perishable and specific.

**Knowledge handoff** — information that outlives this project and improves the
*next* one. Your reviewer's example: drilling was planned at 5 days and took 10.

> **Terminology note.** You were told "knowledge handoff". The established industry
> terms for this are **Lessons Learned** (PMBOK), **Project Closeout / Handover
> Knowledge Transfer**, and, when it is a live queryable dataset rather than a
> closeout document, **historical benchmarking** or a **productivity norms database**.
> In Oracle's world this is what a **Reference Class** or a benchmark library does.
> Use "institutional memory" externally — it is what the PS itself says — and
> "lessons learned" when talking to a PM.

**You have already built the core of this.** `GET /memory/query` returns
`suggested_duration` computed from actual completions, with the sample size shown.
That is exactly the drilling example, working today. The gaps are that it is
single-project, and it does not record the *conditions* under which a duration was
observed (monsoon, night shift, which contractor), which is what makes a lesson
transferable rather than an average.

### 1.4 RAID

A **RAID log** is the standard governance register on any managed project. One
table, four record types, reviewed in every weekly project meeting.

**R — Risk. Something that *might* happen in the future.** [SAID: "Risk = Future"]
A risk has not happened yet. It has a probability and an impact, and you manage it
by planning a response *before* it bites.

> Piping example: "Hydrotest pump is single-sourced from one vendor in Guwahati. If
> it fails, hydrotest of the 24" header slips." Probability medium, impact 6 days,
> owner the Piping Lead, response: identify a backup vendor by 15 Sep.

Fields normally recorded: ID, description, category (material / manpower /
drawing-RFI / permit-HSE / weather / equipment / client hold / rework-NCR /
front-not-available / other), probability, impact (days and/or cost), exposure
(probability × impact), owner, response strategy (avoid / mitigate / transfer /
accept), mitigation actions, target date, status, linked activities.

**I — Issue. Something that *is* happening now.** [SAID: "Issue = Present"]
A risk that materialised, or a problem that arrived without warning. It has no
probability — it is 100% real. It has an impact and it needs resolving now.

> "Hydrotest pump failed on 12 Sep. Hydrotest of 24"-P-1001-A1A is stopped." Owner,
> severity, date raised, days impact, resolution, date closed.

The relationship matters and your reviewer stated it cleanly: **a risk that occurs
becomes an issue.** Your system should be able to show that transition.

**A — Action. Something someone must do, by a date.**
The unit of follow-up. Every risk mitigation and every issue resolution generates
actions. Fields: description, owner, due date, status, source (which risk/issue/
meeting/field report raised it), completion evidence.

> "Raise PO for backup hydrotest pump. Owner: Procurement Lead. Due 15 Sep."

**D — Decision. A choice that was made, by whom, when, and why.**
Decisions are recorded because six months later nobody remembers why the pipe rack
sequence changed, and the claim or the audit depends on it.

> "Decided 12 Sep to hydrotest Unit 2 before Unit 1 to protect the mechanical
> completion milestone. Decided by Project Manager. Rationale: Unit 1 spools awaiting
> RFI response. Affects PIP-HYD-1041, PIP-HYD-1042."

Some organisations use **RAID** with D = **Dependencies** instead of Decisions, or
run a five-column **RAIDD**. Your reviewer explicitly said Decisions, so use that.

### 1.5 Risk management and pattern analysis

**Risk management** is the loop your reviewer drew: identify → assess → plan a
response → act → check whether it worked. His formulation was
**Risk → Action → Response → Result**, which is exactly the loop most software
gets wrong by stopping at "identify".

**Pattern analysis** is looking across many events for a signal a single event does
not show. "This contractor has finished eleven activities and nine were late" is a
pattern. "This activity was late" is not.

### 1.6 MPP files

An **MPP** file is Microsoft Project's native saved-project file — a closed,
undocumented binary format. It contains tasks, the WBS, durations, planned and actual
dates, dependencies, constraints, calendars, resources, assignments and baselines.

Yes, it contains schedules. It is the MS Project equivalent of Primavera's XER.

*(Verified capability and licence in §10.)*

### 1.7 Database update vs project update

The distinction your reviewer drew is the single most important architectural idea
in your notes.

**Storing a fact is not the same as changing the plan.**

If a field report says "foundation complete", the *fact that this was reported* goes
into the database immediately and permanently — it is evidence, and it is never
discarded. Whether the **official schedule** records `CIV-FDN-1007` as finished on
that date is a separate, deliberate, authorised act.

Every project-controls system that fails, fails here: it lets raw input mutate the
baseline, the plan stops being trustworthy, and everyone goes back to spreadsheets.

**Your system already gets this right.** `LinkedEvent` and `ReviewQueueItem` are the
evidence layer; `Activity.actual_start` / `actual_finish` are the project layer; only
`POST /review/{id}/resolve` and the auto-link path cross between them, and every
crossing writes an `AuditRecord`. You should name this in the demo — it is a
sophisticated design decision that currently looks like an implementation detail.

### 1.8 The evaluation metrics

Set up the confusion matrix once. Take "did the system correctly detect that a
sentence reports a *delay*?"

- **True Positive (TP)** — it said delay, it was a delay.
- **False Positive (FP)** — it said delay, it wasn't.
- **False Negative (FN)** — it missed a real delay.
- **True Negative (TN)** — correctly said not-a-delay.

**Accuracy = (TP + TN) / everything.** "How often is it right overall?"
*Trap:* if only 5% of sentences are delays, a model that always says "not a delay"
scores 95% accuracy and is useless. Accuracy misleads on imbalanced data, and
construction data is always imbalanced. Report it, never lead with it.

**Precision = TP / (TP + FP).** "When it raises a flag, how often is it right?"
Low precision means the PM stops trusting the system. Your auto-link precision is
100% — that is this metric.

**Recall = TP / (TP + FN).** "Of all the real delays, how many did it catch?"
Low recall means things slip through silently. Your coverage figure is closely
related.

**F1 = 2 × (P × R) / (P + R).** The harmonic mean. One number when you must balance
the two. Harmonic, not arithmetic, so a model that is excellent at one and terrible
at the other scores badly — which is the point.

**RMSE — Root Mean Square Error.** For *numeric* predictions, not yes/no ones.
Predict a duration of 5 days, actual 10 → error 5. Square every error, average,
square-root. Answer is in the same unit as the thing predicted, so "RMSE 3.2 days"
means typical miss is about 3.2 days. Squaring means one 20-day miss hurts far more
than four 5-day misses — appropriate here, because one catastrophic estimate is worse
than several small ones.

**R² — coefficient of determination.** "How much better is my model than just
guessing the average every time?" R² = 1 is perfect. R² = 0 means no better than the
mean. **R² can be negative**, which means worse than guessing the average — a real
and common outcome on small samples, and you should report it honestly if it happens.

> Example: activity durations average 8 days. Always guessing 8 gives R² = 0. A model
> using discipline, quantity and contractor that reaches R² = 0.62 explains 62% of
> the variance in real durations. That is a defensible claim.

### 1.9 Semantic layer

A **semantic layer** is a single agreed model of what things *mean* in your domain,
which every input and every integration maps onto.

Without one: the DPR says "spool erected", the spreadsheet column says "Erection
Complete", Primavera says "Erect Line 24"-P-1001-A1A", the supervisor says
"chadha diya". Four strings, one physical fact. Every module then invents its own
mapping and they drift apart.

With one: all four map to `activity_type = SPOOL_ERECTION`, `discipline = PIPING`,
`tag = 24"-P-1001-A1A`, `status = COMPLETE` — and matching, risk analysis, memory
queries and the Primavera adapter all reason over the same vocabulary.

---

## 2. Reconstruction — what he was actually proposing

Stripped of the fragments, the proposal is coherent and it is this:

> **NAVIS should stop being an extraction-and-linking tool and become a
> project-controls system with a governed write path.**
>
> Field reality enters through the lowest-friction channel available. AI converts it
> to structured facts and, separately, to governance findings — risks, issues,
> actions, decisions. Nothing reaches the official plan without a human who can see
> the original words next to the machine's interpretation. Once approved, the update
> flows three ways: into the plan, upward as management signal, and back down to the
> person who reported it so they know it mattered. In parallel, every completed
> activity deposits a durable lesson that the next project can query. And the whole
> thing is evaluated with published numbers rather than assertion.

Five structural claims underneath that, all **[SAID]**:

1. Three roles, and information flows in a loop, not a line.
2. AI output has two destinations, not one — current project, and future projects.
3. The PM must be able to audit the machine's reasoning against the raw input
   before anything is committed.
4. Governance artefacts (RAID) should be generated from field data, not typed by hand.
5. Claims about AI quality must be numeric and reproducible.

**[INFERRED]** — my additions, not his words: the Baseline-vs-Current schedule
distinction in §6, the change-control concept behind approvals, the calibration
metrics in §9, and the specific module boundaries in §7.

---

## 3. The three roles

### 3.1 Field Supervisor

**Real-world job.** Supervises crews at a work front. Reports what happened.

**Can enter:** progress on activities they own (quantity, percent, start, finish);
blockers and their causes; observations that may indicate risk; responses to PM
clarification requests; attachments (photo, JMR reference, measurement sheet).

**Can see:** their own submissions and what happened to each; what the system
understood from their words; clarification requests directed at them; the outcome
of their updates — which activity moved and by how much; their own work fronts.
**Cannot see:** the full project schedule, EVM, other disciplines' data, the
management view.

**Can do:** submit, clarify, correct their own submission before approval.
**Cannot do:** approve anything, edit the schedule, close risks or issues.

### 3.2 Project Manager

**Real-world job.** Owns the schedule. Decides what is true. Reports upward.

**Can enter:** approve / reject / correct proposed updates; raise and close risks,
issues, actions, decisions manually; assign owners and due dates; request
clarification from a supervisor; record a decision with rationale.

**Can see:** everything in the project — full evidence chain, full schedule, RAID
register, EVM, pattern findings, audit history, the review queue.

**Can do:** the only role that commits changes to the official plan. Every commit
writes an audit record naming them.

### 3.3 Senior Management

**Real-world job.** Governance and intervention. Multiple projects.

**Can enter:** almost nothing. **[INFERRED]** — a directive or a decision at
portfolio level, and acknowledgement of escalations. Keeping this role read-mostly is
deliberate: it preserves a single accountable owner of the plan.

**Can see:** SPI / schedule health trend; top exposures by risk exposure value;
issues breaching severity or age thresholds; overdue actions by owner; decision log;
milestone forecast; contractor and discipline performance patterns; cross-project
comparison **[INFERRED]**. Aggregates and exceptions only — never a review queue.

**Can do:** escalate, comment, acknowledge, export a board pack.

### 3.4 Information flow between them

```
FIELD SUPERVISOR                PROJECT MANAGER              SENIOR MANAGEMENT
      │                                │                             │
      │  submits raw update            │                             │
      ├───────────────────────────────►│                             │
      │                                │ verifies evidence vs        │
      │  clarification request         │ AI interpretation           │
      │◄───────────────────────────────┤                             │
      │  answers                       │                             │
      ├───────────────────────────────►│                             │
      │                                │ approves → plan changes     │
      │                                ├────────────────────────────►│
      │                                │   aggregated: SPI, RAID,    │
      │                                │   exposure, forecast        │
      │  "your update moved            │                             │
      │   PIP-ERC-1030 by +2d;         │◄────────────────────────────┤
      │   action A-114 raised"         │   escalation / directive    │
      │◄───────────────────────────────┤                             │
```

The loop back to the field is **[SAID]** and it is the part almost every competing
product omits. It is also cheap to build, because you already have the audit trail
that says exactly what each submission caused.

---

## 4. The two-destination model

This is the spine. Everything else hangs off it.

```
                      ┌──────────────────────────────┐
   field input ──────►│  EVIDENCE LAYER (immutable)  │
                      │  raw text, file, span, hash  │
                      └───────────────┬──────────────┘
                                      │  AI extraction + findings
                                      ▼
                      ┌──────────────────────────────┐
                      │  PROPOSAL LAYER              │
                      │  structured facts + RAID     │
                      │  candidates + confidence     │
                      └───────┬──────────────┬───────┘
                              │              │
              auto-link if    │              │  everything else
              confident ──────┤              ├──────────────────►  PM REVIEW
                              │              │                     (approve /
                              ▼              ▼                      reject /
              ┌───────────────────────┐  ┌──────────────────┐       correct)
              │  PROJECT LAYER        │  │  KNOWLEDGE LAYER │
              │  official plan        │  │  lessons, norms  │
              │  every write audited  │  │  cross-project   │
              └───────────────────────┘  └──────────────────┘
```

**Rules that must hold:**

1. Evidence is written on arrival, always, unconditionally, and is never edited or
   deleted. It is the audit spine.
2. A proposal is not a fact. It carries confidence and provenance and it can be
   rejected without losing the evidence.
3. The project layer is only ever written by an authorised path — auto-link above
   threshold, or PM approval — and every write emits an `AuditRecord`.
4. The knowledge layer is written **only from approved project data**, never from raw
   proposals. A lesson learned from an unverified claim is worse than no lesson.
5. **Planned/baseline dates are immutable.** Only actuals are ever written. *(You
   already enforce this. Keep it.)*

---

## 5. EVM in NAVIS — what is honestly possible

**[SAID]** he wants EVM. **[INFERRED]** the following limits.

### What you can compute today

Your schedule has `planned_qty`, `actual_qty`, `percent_complete`, `planned_start`,
`planned_finish`. That is enough for **physical-progress EVM**, where "value" is
measured in weighted work units rather than rupees:

- Assign each activity a **weight** — planned quantity normalised within its
  discipline, or planned duration in days. *(Duration-weighting is the safer default
  because every activity has dates; not every one has a quantity.)*
- **PV(t)** = sum of weights of work the baseline says should be complete by date t.
- **EV(t)** = sum of (weight × percent_complete) actually achieved.
- **SV** = EV − PV, **SPI** = EV / PV. Both valid and defensible in work units.

### What you cannot compute, and must not fake

- **AC / ACWP** — actual cost or actual man-hours expended. No field report you
  ingest contains it, and inventing it would be exactly the kind of fabrication your
  precision-first design exists to prevent.
- Therefore **CV, CPI, EAC, VAC, TCPI are all unavailable.**

### The honest position to present

> "We compute the schedule half of EVM — PV, EV, SV and SPI — from physical progress,
> weighted by planned duration. The cost half requires ACWP, which no daily progress
> report contains; it comes from the ERP or timesheet system. Our data model has the
> slot for it and the integration point is defined."

That answer is stronger than a fabricated CPI, and a 25-year PM will respect it far
more than a number he can tell you did not come from anywhere.

### Where it appears, and for whom

| Surface | What shows | Why |
|---|---|---|
| Senior Management | Project SPI, trend over time, forecast finish date, discipline breakdown | This is their primary instrument |
| Project Manager | Same, plus per-WBS and per-activity contribution, and which activities are dragging SPI down | They need the drill-down to act |
| Field Supervisor | Nothing | Not their concern, and it invites gaming |

**Should AI calculate it? No.** [INFERRED, and important] EVM is deterministic
arithmetic over approved data. An LLM must never compute a metric that goes on a
management dashboard. The AI's contribution is upstream — producing the verified
percent-complete that EVM consumes — and optionally downstream, *narrating* the
result in plain language ("SPI has fallen from 0.94 to 0.87 over three weeks, driven
by civil"). Compute deterministically, narrate with the LLM, never the reverse.

---

## 6. Information classification — what goes where

**[SAID]** "What all updates should actually go to the project?" This is the answer.

Every field update is decomposed into typed findings. Each type has a destination, an
authority level, and a confidence policy.

| Extracted finding | Destination | Authority to commit | Notes |
|---|---|---|---|
| Progress quantity / percent | Project — `Activity.actual_qty`, `percent_complete` | Auto if ≥ τ_high and quantity measurable; else PM | Already built |
| Actual start date | Project — `actual_start` | Auto if explicitly asserted; **PM if defaulted from report date** | See FINDINGS.md F1 |
| Actual finish date | Project — `actual_finish` | Auto only at 100% with measured quantity | Already built |
| Status change | Project — `Activity.status` | Auto if unambiguous | |
| Delay + cause | Project + Knowledge + RAID(Issue) | PM approval | Cause classification feeds memory |
| Risk signal ("pump is single-sourced") | RAID — Risk candidate | **Always PM** | Never auto-commit a risk |
| Issue ("pump failed today") | RAID — Issue candidate | **Always PM** | |
| Action ("PO raised for backup") | RAID — Action candidate | **Always PM** | |
| Decision ("decided to reorder hydrotest") | RAID — Decision candidate | **Always PM** | Decisions carry legal weight |
| Resource / manpower change | Evidence + Pattern engine | PM if it changes a plan | Not a schedule field today |
| Equipment deployment | Evidence + Pattern engine | PM | Feeds "did they respond to the risk?" |
| Contractor performance signal | Pattern engine + Knowledge | None — analysis only | Never auto-writes |
| Schedule change request | Project — proposed date change | **Always PM, always explicit** | This is change control |
| Milestone achievement | Project + Senior Management alert | PM | High visibility, verify |
| Forecast language ("will finish Friday") | Evidence only — **never a date** | Blocked in code | You already guard this |
| Weather, general narrative | Evidence + Knowledge context | None | Context for lessons |
| Safety / HSE observation | RAID(Issue) + HSE register | PM | |

**Confidence policy [INFERRED, consistent with your existing thresholds]:**

- **≥ τ_high (0.775) and finding type is auto-eligible** → commit, audit, notify field.
- **τ_low ≤ score < τ_high** → review queue with evidence and alternatives.
- **< τ_low** → flag as new/unmatched, never dropped.
- **Any RAID finding, any schedule change, any defaulted date** → PM regardless of
  confidence. Governance artefacts are never auto-committed.

---

## 7. The verification workflow

**[SAID]** and the most concrete UI request in your notes. It is one screen.

### The evidence panel — twelve elements, in this order

1. **Original source** — filename, line/row, upload time, submitter, sha256.
2. **Raw input verbatim** — the supervisor's actual words, unedited.
3. **Attachments** — photo, JMR, measurement sheet. *(Not built. See §11.)*
4. **What the AI understood** — the highlighted character span inside the raw text.
5. **Structured extraction** — discipline, tag, quantity, uom, dates, status.
6. **AI findings** — risk / issue / action / decision detected, each with its span.
7. **Supporting evidence per finding** — the exact phrase that triggered it.
8. **Proposed project update** — a before/after diff of the affected fields.
9. **RAID detections** — as draft register entries, not prose.
10. **Proposed schedule change** — activity, field, old value, new value, variance days.
11. **Confidence** — per finding, with the reason (tag exact match, discipline match,
    within planned window), never a bare number.
12. **Controls** — Approve · Reject · Correct · Ask supervisor.

**You have elements 1, 2, 4, 5, 8, 11 and part of 12 working today.** The additions
are attachments, findings, per-finding evidence and RAID drafts.

### The rule that makes it trustworthy

> The PM must be able to reach the original words in one click from any number on any
> dashboard.

If SPI is 0.87, the PM should be able to click through to the activities dragging it,
then to the field reports that set those actuals, then to the sentence a supervisor
wrote. That unbroken chain is what turns "AI updated my schedule" from a threat into
a tool. Your `AuditRecord` already stores the link — the UI just needs to expose it.

---

## 8. Risk engine and pattern analysis

**[SAID]** the LLM should do risk management and pattern analysis. **[INFERRED]** the
split below, which is the crucial design decision.

### What must be deterministic — never the LLM

- Counting, averaging, variance, SPI, exposure = probability × impact.
- Threshold breaches: activity late by more than N days; action overdue; issue open
  more than N days; float consumed.
- Dependency logic: predecessor not started while successor reports progress.
- Frequency statistics: this contractor's on-time rate; this activity type's mean
  overrun; recurrence counts.
- **Anything that appears as a number on a dashboard.**

### What the LLM is genuinely good at, and should do

- Reading a sentence and proposing *this may be a risk* with the span that says so.
- Classifying a free-text cause into your delay taxonomy.
- Deciding two differently-worded reports describe the same underlying problem.
- Writing the narrative summary over deterministic numbers.
- Drafting a risk statement, mitigation or decision record for a human to edit.

### What is statistical / historical

- "Activities of type X take on average 1.6× their planned duration here."
- "Contractor B has been late on 9 of 11 activities" — with the sample size shown.
- "Front-not-available has caused 40% of civil delay days this quarter."
- Early warning: an activity whose burn rate implies it cannot finish on plan.

### The Risk → Action → Response → Result loop [SAID]

This is his best idea and nobody else will build it. Model it as a chain:

```
RISK  "Hydrotest pump single-sourced"        raised 02 Sep, exposure 6d
  │
  ├─ ACTION  "Identify backup vendor"        owner Procurement, due 15 Sep
  │     │
  │     └─ RESPONSE  detected from field: "second pump mobilised from Duliajan"
  │                  evidence: dpr_day_12.txt line 8
  │
  └─ RESULT  risk exposure recalculated 6d → 1d, status Mitigated, closed 16 Sep
```

The **Response** node is the clever part: the system watches incoming field reports
for evidence that a mitigation actually happened, instead of relying on someone
ticking a box. Your reviewer's examples — *"has the contractor brought in more
tractors? has additional manpower been deployed? has the project responded to the
identified risk?"* — are all response detection.

**How to build it without letting the LLM touch anything critical:** the LLM only
ever proposes a *link* between an incoming report and an open risk, with the
supporting span. The PM confirms. The exposure recalculation is deterministic. The
LLM never changes a status, a date or a number.

### Who sees what

| | Project Manager | Senior Management |
|---|---|---|
| Individual risk/issue records | Full register, editable | Top exposures only, read-only |
| Pattern findings | All, with drill-down to source | Aggregated, with trend |
| Contractor performance | Per-activity detail | Scorecard |
| Recommendations | Actionable, with Accept/Dismiss | Not shown — avoids bypassing the PM |
| Confidence | Numeric + reason + sample size | Qualitative band + sample size |

**Confidence representation [INFERRED]:** never show a bare percentage on a management
screen. Show a band (High / Medium / Low), the sample size it rests on, and one line
of reason. "Medium — based on 11 comparable activities" is actionable; "0.68" is not.

---

## 9. Knowledge handoff — design

### What to store per lesson

A lesson is only reusable if you store the **conditions**, not just the number.

| Field | Example | Why |
|---|---|---|
| activity_type | `SPOOL_ERECTION_LARGE_BORE` | The semantic key, not the activity ID |
| discipline | piping | |
| planned_duration | 5 days | |
| actual_duration | 10 days | |
| ratio | 2.0 | The transferable quantity |
| quantity + uom | 10 nos | Normalises across scales |
| productivity | 1 no/day | The number a planner actually wants |
| conditions | monsoon, night shift, congested rack | **Makes it transferable** |
| contractor | ABC Infra | Pattern analysis |
| delay_causes | `[FRONT_NOT_AVAILABLE, DRAWING_RFI]` | |
| project_id, source_activity_id | | Provenance |
| sample_confidence | n=1, low | Never present n=1 as a norm |
| verified_by, verified_at | PM, 2026-09-16 | Only approved data becomes a lesson |

### How the AI decides something is a lesson [INFERRED]

Deterministic gate first, LLM second:

1. Activity reached 100% with an approved actual start and finish. *(Gate — no
   lesson from in-progress or unverified work.)*
2. Compute ratio = actual / planned duration.
3. Deviation exceeds a band (say ±20%) **or** the activity is the Nth of its type
   (norms need repetitions).
4. Only then, the LLM summarises the conditions and cause into structured tags from
   a controlled vocabulary — never free prose.
5. Store with sample size. Surface as a *norm* only at n ≥ 3; below that, label it an
   observation.

### How future projects retrieve it

At planning time, keyed on the semantic activity type, not the activity ID:

> "You have planned `SPOOL_ERECTION_LARGE_BORE` at 5 days. Across 7 comparable
> completions the median was 9 days (range 6–14), and the two fastest were both
> non-monsoon. Consider 9 days."

### Separate module? Yes.

**[INFERRED]** A separate table and a separate service, for three reasons: it
outlives any single project; it must be queryable without touching live project
tables; and it should eventually be cross-project, which the current schema cannot
express. It connects to project data through `source_activity_id` and
`source_project_id` only — a one-way reference, so archiving a project never breaks
the knowledge base.

---

## 10. MPP and Primavera — verified

### MPP files

**Verified.** MPP is Microsoft Project's binary format. The mature open-source
library for reading it is **MPXJ**, which reads **all MPP versions from Project 98
onward**, and also reads Primavera **PMXML** and **XER**, P3, Asta Powerproject and
around 30 other formats. It writes MPX, MSPDI, PMXML, XER, Planner and SDEF. It is
**LGPL and free for commercial use**.

**The catch:** MPXJ is a Java library. The Python package wraps it, so **a JVM is
required on any machine that runs it.** That is a real deployment cost and it
partially compromises your "minimal dependencies, fully offline" story — though it
does stay offline.

**The strategic point:** MPXJ solves your missing Primavera *import* (FINDINGS.md F3)
and MPP import **with the same dependency**. If you add one integration library, add
this one.

**MVP verdict:** MPP import is **not** required for the MVP — the PS names
"Primavera/MS Project exports" but a prototype demonstrating 2–3 varied formats
satisfies it. PMXML import is the higher-value half because your baseline is
currently hand-written JSON, which is the weaker claim.

### Primavera APIs — your note needs correcting

> **You were told:** "the Primavera API key/API may be available while the Primavera
> software/product is paid."
>
> **What this most likely means:** he was distinguishing *API access is not a separate
> purchase* from *API access is free*. The first is true; the second is not.

**Verified from Oracle's own documentation:**

There are two distinct products, each with its own REST API:

| | **Primavera P6 EPPM** | **Oracle Primavera Cloud (OPC)** |
|---|---|---|
| Deployment | On-premises or Oracle-hosted | SaaS |
| API | P6 EPPM REST API | OPC REST API |
| Access | Requires a licensed, deployed P6 EPPM instance | Administrator enables API access per tenant |
| Auth | Against your own P6 instance | Admin grants "Allow access" under Privacy & Security, optionally restricted to named users and IP ranges |

For OPC, Oracle's documentation states that an application administrator enables API
access and that **"the actions a user can perform using the API depend on their
security privileges assigned in Primavera Cloud."** So it is a *permission* inside a
licensed tenant, not a licence of its own — and **there is no public or free
developer tier.** You cannot obtain a working Primavera API endpoint without an
organisation that already pays for Primavera.

**Requires verification before you claim anything on stage:** exact licence metrics
and whether integration users are separately counted vary by Oracle contract and by
version. Do not state a licensing position as fact. Say: "API access is a permission
granted inside a licensed deployment; we build the adapter, the customer supplies
the endpoint."

**MVP verdict: build the integration layer, do not connect.** Define a
`ScheduleProvider` interface with `read_activities()`, `read_baseline()` and
`propose_actuals()`. Ship two implementations: the local JSON/PMXML one you have, and
a stub Primavera adapter that documents the endpoints it would call. That is a
five-minute slide and an honest architecture, versus days of work you cannot even
test without a licence.

**What you would read:** WBS, activities, planned dates, durations, relationships,
resource assignments, baselines, calendars.
**What you would write:** actual start, actual finish, percent complete, remaining
duration — **actuals only, never the baseline.**
**Guardrails before any write-back [INFERRED]:** PM approval, a named service account
with least privilege, a dry-run diff shown before commit, an idempotency key per
update, full audit both sides, and a hard block on baseline fields.

---

## 11. The semantic layer

**[SAID]** "semantic layer, for construction". Your interpretation in the notes is
correct.

### What it should be — and should not be

**Should be, for MVP:** a **shared domain model** (typed entities every module
imports) plus a **controlled vocabulary** (fixed enums for discipline, activity type,
status, delay cause, RAID category, uom) plus a **mapping layer** (aliases and
synonyms that resolve raw strings onto canonical concepts).

**Should not be, yet:** a formal OWL ontology or a graph database. Those are the
right answer at portfolio scale across many organisations. At 120 activities they add
months and buy nothing you can demonstrate.

### You have three quarters of it already

- `DISCIPLINE_META` in `config.ts` — a controlled vocabulary, type-enforced.
- `alias_lexicon` — a mapping layer. **Written but never read** (FINDINGS.md F4).
- Tag normalisation in `extraction/prepass.py` — canonical form for line and
  equipment tags.
- `wbs_path` on every activity — the hierarchy, L1 through L6.
- Pydantic contracts — typed entities.

**What is missing:** a canonical **activity type** vocabulary. This is the important
one. Today matching works on descriptions and tags. A lesson learned needs to key on
*what kind of work this was* — `SPOOL_ERECTION_LARGE_BORE` — so it transfers to a
different project with different activity IDs. Without it, knowledge handoff cannot
cross projects, which is the whole point of knowledge handoff.

### Entity model

```
Project ──< WBS (L1…L6) ──< Activity ──< Assignment >── Resource
                                │
                                ├──< ScheduleLink >── ExtractedEvent ──> RawInput
                                ├──< AuditRecord
                                ├──< RaidItem (Risk | Issue | Action | Decision)
                                ├──< EvmSnapshot
                                └──> ActivityType ──< Lesson  (crosses projects)

Contractor ──< Activity          Location ──< Activity          Discipline ──< Activity
```

### What it buys each subsystem

| Subsystem | Benefit |
|---|---|
| Extraction | LLM emits enum values, not prose. Schema-constrained, validatable |
| Schedule linking | Alias lexicon becomes a first-class retrieval channel — closes F4 |
| Risk analysis | "Recurring risk" is computable, because categories are canonical |
| Pattern analysis | Grouping by activity type and contractor becomes meaningful |
| Knowledge handoff | Lessons key on activity type, so they cross projects |
| Integrations | One mapping per external system, not one per module |
| Scale | Adding a discipline or a delay cause is a vocabulary change, not a code change |

---

## 12. Evaluation module

**[SAID]** accuracy, precision, recall, F1, RMSE, R². Below is the scientific mapping
you asked for — including where those six are *insufficient*.

### Metric per task

| Task | Type | Primary metrics | Also report | Not appropriate |
|---|---|---|---|---|
| Information extraction (spans) | Sequence labelling | Precision, Recall, F1 — exact and partial span overlap | Span IoU | R², RMSE |
| Discipline classification | Multi-class | Macro-F1, per-class P/R, confusion matrix | Accuracy | RMSE |
| Status classification | Multi-class | Macro-F1, per-class P/R | Accuracy | RMSE |
| Tag / entity extraction | Extraction | Precision, Recall, F1 (exact string) | Normalisation error rate | R² |
| Schedule matching | Ranking + decision | **Precision@coverage curve**, top-1 accuracy, MRR, recall@20 | Auto-link precision, NO_MATCH rejection | Plain accuracy |
| Risk detection | Binary, imbalanced | Precision, Recall, F1, **PR-AUC** | Per-category breakdown | Accuracy (misleads badly) |
| Issue detection | Binary, imbalanced | Same as risk | | Accuracy |
| Action detection | Binary | Precision, Recall, F1 | | Accuracy |
| Decision detection | Binary, rare | Precision, Recall, F1 | Report n — it will be small | Accuracy |
| Duration prediction | Regression | **RMSE (days), R², MAE** | MAPE, prediction interval coverage | F1 |
| Delay prediction (days) | Regression | RMSE, R², MAE | Bias (mean signed error) | F1 |
| Progress % prediction | Regression, bounded | RMSE, MAE, R² | Error by decile | F1 |
| Pattern detection | Retrieval-like | Precision@k, human-rated relevance | Sample size per claim | RMSE |
| **Confidence scoring** | **Calibration** | **Brier score, ECE, reliability diagram** | Risk–coverage curve | **Accuracy, F1 — a confidence score is a probability, not a class** |

**Three things your reviewer's list does not cover, and you should add:**

- **Calibration.** Your whole design rests on confidence meaning something. If items
  scored 0.8 are correct 80% of the time, the score is calibrated and the threshold is
  principled. Brier score and Expected Calibration Error prove it. This is the single
  most defensible metric for a system whose thesis is "we know when we don't know".
- **Macro vs micro averaging.** With six disciplines of unequal frequency, report
  macro-F1 (every class counts equally) alongside micro. Micro alone hides failure on
  rare disciplines.
- **Confidence intervals.** At n = 254, report bootstrap 95% CIs. "87.2%" invites
  "how sure are you?"; "87.2% (95% CI 82.6–91.1)" answers it.

### Module design

```
eval/
  datasets/          versioned gold sets, hashed, with an inter-annotator sample
  tasks/             one module per task, each declaring its metric set
  metrics/
    classification.py    P, R, F1, macro/micro, confusion, PR-AUC
    regression.py        RMSE, MAE, R², bias, MAPE
    ranking.py           top-k, MRR, precision@coverage
    calibration.py       Brier, ECE, reliability curve
    bootstrap.py         confidence intervals
  runners/           run one task, or the full suite
  report/            markdown + JSON + plots; one row per task
  baselines/         majority class, random, rules-only, LLM-only
```

**Two design rules that make it defensible:**

1. **Every metric ships with a baseline.** "F1 0.84" means nothing. "F1 0.84 versus
   0.31 for the majority-class baseline and 0.72 for rules-only" is a result.
2. **Every run is reproducible** — dataset hash, config, seed, versions, in the
   report header. That is what separates a whitepaper from a demo.

**Guard against the trap in your own notes:** `eval.py` currently reports
"calibrated + evaluated on the full dataset". Calibrating thresholds and reporting
metrics on the same data overstates performance. Split into calibration and held-out
test sets, or use cross-validation, and say which you did. A judge with a research
background will ask.

---

## 13. Layer separation — every recommendation, assigned

| Recommendation | FE | BE | DB | AI | Eval |
|---|---|---|---|---|---|
| Three roles | Route guards, three shells | Role on request, permission checks | `users`, `role` | — | — |
| EVM | Charts, trend, drill-down | Deterministic calculator service | `evm_snapshot` | Narration only | RMSE on forecast |
| RAID register | Register page + export button | CRUD + generator + doc export | 4 tables or 1 typed table | Candidate detection | P/R/F1 per type |
| PM verification screen | Evidence panel, 12 elements | Proposal assembly endpoint | `proposal`, `finding` | Findings + spans | Approval-rate tracking |
| Risk engine | Register, exposure, R→A→R→R chain | Deterministic scoring + threshold rules | `risk`, `action`, `response` | Detection + response linking | P/R on detection |
| Pattern analysis | Findings panel with sample sizes | Statistical service | `pattern_finding` | Interpretation only | Precision@k |
| Knowledge handoff | Query UI at planning time | Lesson extraction + retrieval | `lesson`, `activity_type` | Condition tagging | RMSE on duration |
| Field feedback loop | Notification list | Outcome computation from audit | `notification` | — | — |
| Semantic layer | Enum-driven components | Vocabulary service, alias resolution | `activity_type`, `vocabulary` | Constrained output | Normalisation accuracy |
| MPP / PMXML import | Upload UI | `ScheduleProvider` + MPXJ adapter | `baseline_version` | — | Parse fidelity |
| Primavera | Connection settings | Adapter interface + stub | `integration_config` | — | — |
| Evaluation module | Results page (optional) | Runner | `eval_run` | — | The module itself |

**Discipline to keep:** no AI in the frontend, no rendering decisions in the backend,
no metric computed by an LLM, and nothing writes to the project layer except the
authorised path.

---

## 14. MVP triage

Your deadline governs this. Ranked strictly by value-per-hour for a judged demo.

### MUST — this week

1. **Fix F1 from FINDINGS.md** (defaulted finish dates). One hour. Everything below
   is worthless if the dates are visibly wrong.
2. **RAID register, read-mostly.** Highest value-per-hour of anything in these notes.
   You already store delay causes, review items and audit records — RAID is largely a
   *view* plus a typed table and an export button. One day. It is the single most
   recognisable artefact to an industry judge.
3. **Rename Planning Engineer → Project Manager**, and add a **read-only Senior
   Management dashboard** with SPI, top exposures, overdue actions and milestone
   forecast. Half a day; the data mostly exists.
4. **Schedule-side EVM** — PV, EV, SV, SPI, duration-weighted. Half a day of
   deterministic arithmetic. State the cost-side limitation explicitly.

### SHOULD — if the above are done and verified

5. **Close the alias-lexicon loop** (FINDINGS.md F4). One hour, converts a claim into
   a live demo beat.
6. **Field feedback notifications** — "your update moved PIP-ERC-1030 by +2 days".
   Computable from the audit trail you already have. Half a day, and it is the part
   competitors will not have.
7. **PMXML import via MPXJ.** Replaces hand-written baseline JSON with a parsed
   Primavera file. Closes FINDINGS.md F3.
8. **`ActivityType` vocabulary.** Small, but it unlocks cross-project lessons later.
9. **Extend `eval.py`** with regression metrics and calibration.

### POST-MVP — architect for, do not build

10. Full risk engine with response detection.
11. Pattern analysis service.
12. Cross-project knowledge base.
13. Live Primavera / OPC integration.
14. MPP import.
15. Cost-side EVM (needs ERP integration).
16. Attachments and photo evidence.
17. Formal ontology / knowledge graph.

### Explicit warnings

- **Do not build a risk engine before RAID exists.** RAID is the data model the risk
  engine operates on.
- **Do not attempt live Primavera integration.** You cannot test it without a licence.
- **Do not let an LLM compute a dashboard number.** Ever.
- **Do not add authentication complexity for three roles.** A role selector is
  sufficient for a prototype; say "SSO in production" and move on.

---

## 15. Implementation order

Ordered by dependency, not by appeal.

### Phase 1 — Data model foundation
**Why first:** every later phase writes to these tables. Changing them later means
migrations under time pressure.
**DB:** add `raid_item` (typed: risk / issue / action / decision), `activity_type`,
`lesson`, `evm_snapshot`, `notification`, `user_role`. Extend `Activity` with a
nullable `budget_value` so cost EVM has a home later.
**BE:** Pydantic contracts for each. No endpoints yet.
**FE:** none. **AI:** none.
**Tests:** round-trip every contract; migration runs clean on the existing DB.
**Done when:** models import, tests pass, existing 182 tests still pass.

### Phase 2 — Roles and permissions
**Why now:** every screen below depends on who is looking.
**BE:** role on request, a permission decorator, three role constants.
**FE:** three shells, route guards, role switcher.
**DB:** seeded roles. **AI:** none.
**Tests:** each role can reach exactly its allowed endpoints and no others.
**Done when:** a Field Supervisor cannot reach the schedule endpoint.

### Phase 3 — RAID
**Why here:** it is the highest-value visible feature and the risk engine's substrate.
**BE:** CRUD, generator endpoint, document export.
**AI:** detection of risk / issue / action / decision candidates with spans, feeding
the review queue — never auto-committed.
**FE:** register page with four filters; draft candidates in the PM verification
panel; a Generate RAID Document button.
**Tests:** a candidate never reaches the register without approval; export contains
every approved item.
**Done when:** a DPR mentioning a blocked front produces a draft Issue the PM can
approve into the register, and the export button produces a document.

### Phase 4 — EVM
**Why after RAID:** independent, but RAID buys more demo value per hour.
**BE:** deterministic calculator; snapshot per data date.
**FE:** SPI trend on both PM and Senior Management dashboards, drill-down on PM.
**AI:** optional narration over computed numbers.
**Tests:** hand-computed fixture matches to the decimal; no cost metrics emitted.
**Done when:** SPI is computed, plotted and traceable to contributing activities.

### Phase 5 — Verification screen completion
**BE:** one endpoint assembling all twelve evidence elements for a proposal.
**FE:** the evidence panel; batch approve; correct-and-approve.
**Tests:** every element renders; rejection leaves evidence intact and the plan
unchanged.
**Done when:** a PM can go from a dashboard number to the supervisor's sentence in
one click.

### Phase 6 — Feedback loop
**BE:** compute outcomes from the audit trail; notification service.
**FE:** notification list on the field home screen.
**Done when:** approving an update produces a field-visible message naming the
activity and the day movement.

### Phase 7 — Semantic layer formalisation
**BE:** vocabulary service; alias resolution wired into retrieval (closes F4).
**DB:** `activity_type` populated; aliases indexed.
**AI:** constrained enum output.
**Done when:** correcting a match once causes the same phrasing to auto-link next time.

### Phase 8 — Knowledge handoff v2
**BE:** lesson extraction gated on approved 100% activities; retrieval by activity type.
**DB:** `lesson` populated with conditions and sample size.
**Done when:** the drilling 5-vs-10-days query returns a norm with n and range.

### Phase 9 — Evaluation module
**BE:** the `eval/` structure in §12, with baselines and bootstrap CIs.
**Done when:** one command produces a report with every task, every metric, a
baseline column, and a reproducibility header.

### Phase 10 — Integration layer
**BE:** `ScheduleProvider` interface; MPXJ-backed PMXML reader; Primavera stub.
**Done when:** the baseline loads from a parsed PMXML file instead of hand-written
JSON, and the Primavera adapter is documented but unconnected.

### Phase 11 — Risk engine
**BE:** deterministic exposure scoring, threshold rules, response detection linking
incoming reports to open risks.
**FE:** the Risk → Action → Response → Result chain view.
**Done when:** a mitigation mentioned in a field report is proposed as a response to
an open risk, and approving it recalculates exposure.

---

## 16. Open questions to take back to him

Ask these before building phases 3, 4 and 11 — they will change the design and cost
nothing to ask.

1. For EVM, is progress measured in man-hours, quantity, or cost in his organisation?
   That single answer determines the weighting scheme.
2. Does the client mandate a RAID format? Most large EPC clients have a template, and
   matching it is worth more than a better one.
3. Who owns risks in his organisation — the PM, or a separate Risk Manager? That
   changes the permission model.
4. Are lessons learned expected at activity level, or only at project closeout? It
   changes when the lesson is written.
5. Is Senior Management single-project or portfolio? Portfolio changes the data model.
6. What is the actual approval chain for a schedule change? Some organisations require
   a change-control board, not a single PM.

---

*Companion documents: `FINDINGS.md` (current defects, evidenced), `ARCHITECTURE.md`
(as-built system), `FLOW.md` (execution paths).*
