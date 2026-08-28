# SIH26122 — 7-Day Build Plan
### Oil India Limited | Field-Update-to-Gantt Automation
**Team of 6 · Zero manual coding · Day 7 = demo-ready**

---

## 0. What We're Actually Building (Plain Language)

A field engineer at an Oil India drilling site types a message into a chat box — *"Zone 3 foundation concreting khotom, curing shuru kal se"* — and optionally attaches a photo. Within a few seconds:

1. The system figures out **which task** in a 40-task project schedule that message is about.
2. It proposes a **status change** — e.g. "Task C-14 Foundation Concreting → 100% complete, actual finish 22 Aug."
3. A site engineer sees that proposal in a **review queue**, glances at the attached photo as evidence, and clicks **Confirm** or **Reject**.
4. Only on Confirm does the schedule update — and the system then **recalculates every downstream task** whose dates depend on it, redrawing the Gantt chart.

That's the whole product. Three moving parts: an **AI interpreter** (informal text → structured schedule event), a **deterministic scheduling engine** (dependency recalculation — plain code, no AI), and a **human gate** between them.

**What is real vs. simulated, stated plainly (this goes in the pitch):**

| Component | Status in demo |
|---|---|
| Project schedule | Synthetic but realistic — a plausible OIL well-site / pipeline EPC schedule |
| WhatsApp input | Simulated chat UI. Real WhatsApp Business API needs Meta approval — out of scope, by design |
| AI task matching | Real. Live LLM call, measured accuracy on a held-out test set |
| Photo handling | Real upload + AI caption/extraction, presented as **human-reviewable evidence**, not autonomous verification |
| Dependency recalculation | Real. Standard forward-pass CPM logic |
| Human confirmation | Real, and mandatory — no status change happens without it |

**Our differentiation line (repeat it in every deliverable):** OpenSpace, Buildots and Track3D all require dedicated 360° capture hardware and a trained operator walking the site. We require a phone and a text message someone was going to send anyway. That's the gap — zero-friction ingestion for Indian PSU/EPC field conditions, including code-mixed Assamese/Hindi/English site vocabulary.

---

## Tool Stack (decided up front — do not re-litigate mid-week)

| Layer | Tool | Owner |
|---|---|---|
| App generation (frontend + backend) | **Lovable.dev** (fallback: Bolt.new) | Suranjan |
| Database + auth + file storage | **Supabase** (comes with Lovable) | Arin |
| LLM calls | **Claude API** via a Supabase Edge Function | Arin + Suranjan |
| Gantt rendering | **frappe-gantt** JS library inside the app | Akshaya |
| Schedule authoring / seed data | **Google Sheets** → CSV → Supabase | Kenneth |
| Prompt iteration & eval | **Claude / ChatGPT web** + a Google Sheet scorecard | Kenneth + Suranjan |
| Deck & visuals | **Canva** + Gamma | Akshaya + Tarun |

**Hard rule:** every line of code is AI-generated. Humans read, test, and direct — nobody hand-writes implementation. When AI output is wrong, the fix is a better prompt or a smaller-scoped prompt, not manual editing.

---

# DAY 1 — Foundation: The Schedule Is Real Before Anything Else Is

### Goal for the day
A realistic 40-task synthetic Oil India project schedule exists as structured data, is loaded into a live Supabase database, and renders as a static (non-interactive) Gantt chart in a deployed Lovable app. Nothing is intelligent yet — but the thing the AI will eventually modify is real and visible.

### What we're building and how
Two parallel tracks.

**Track A — the schedule dataset.** In Google Sheets, build a plausible EPC schedule for an Oil India well-site development at, say, a Duliajan-area location: site preparation → civil foundations → mechanical erection → piping → electrical & instrumentation → pre-commissioning. 40 tasks, each with: `task_id`, `wbs_code`, `task_name`, `zone/location`, `discipline`, `planned_start`, `planned_finish`, `duration_days`, `predecessor_ids`, `dependency_type` (start with Finish-to-Start only), `percent_complete`, `status`, `responsible_crew`. Dependencies must form a genuine chain at least 6 levels deep — otherwise the Day 3 recalculation demo has nothing to cascade through. Include 2–3 parallel branches that reconverge, because a straight line looks fake to a judge who has used Primavera.

**Track B — the app shell.** One Lovable prompt creates a project with Supabase attached, a `tasks` table matching the schema above, plus empty `updates`, `proposals`, and `audit_log` tables. Import the CSV. Add one page that reads `tasks` and renders them through frappe-gantt. Read-only. Deployed to a live URL by end of day.

### Task breakdown by person

- **Tarun (lead — scope):** Writes the one-paragraph scope statement that defines *done* for the week, and pins the "not doing" list: no real WhatsApp API, no Primavera import/export, no multi-project support, no mobile app, no role-based permissions beyond a single "site engineer" view. Gets every member to acknowledge it in writing. This is his single most valuable contribution all week.
- **Kenneth (lead — data):** Builds the 40-task schedule in Sheets. Researches real EPC activity naming for oil-field surface facilities so task names sound authentic ("Skid Erection & Alignment," "Hydrotest of Flowline Section 2," not "Task 14"). Documents source references for the pitch.
- **Arin (lead — architecture):** Defines the database schema before Lovable touches it, so the AI builds against a decided structure rather than inventing one. Reviews Suranjan's Lovable output and owns the Supabase project.
- **Suranjan (lead — generation):** Drives Lovable. Creates project, wires Supabase, imports CSV, gets the read-only Gantt page deployed.
- **Akshaya (support):** Sets the visual direction — colour tokens for task status (not started / in progress / complete / at risk / blocked), typography, and the OIL-appropriate palette. Delivers a single reference frame in Canva that the Gantt styling will match from Day 3.
- **Soumyak (support):** Independently sanity-checks Kenneth's schedule — verifies no circular dependencies, no task starting before its predecessor finishes, no orphans. Writes this up as the first entry in the test log.

### Concepts each person should understand today

- **Kenneth:** What a WBS is and why codes are hierarchical; what Finish-to-Start / Start-to-Start / Finish-to-Finish dependencies mean; what "float" or "slack" means; the rough sequence of an oil-field surface facility build. He needs enough to defend "this schedule is realistic" to a judge who works in EPC.
- **Arin:** Relational schema design for a task graph — self-referencing foreign keys for predecessors, or a separate `dependencies` join table (recommend the join table; it makes many-to-many predecessors trivial on Day 3). Supabase row-level security basics.
- **Suranjan:** How Lovable's prompt→scaffold loop behaves — that it works far better with one specific instruction per prompt than one long one, and that "make it work like X" fails where "add a page at /schedule that queries table Y and renders Z" succeeds.
- **Akshaya:** What information a Gantt bar must convey at a glance (duration, progress fill, dependency arrows, critical path) so the design serves the data instead of decorating it.
- **Tarun:** Why over-scoping is the number one cause of hackathon failure, and what a 30-second "what it does" statement sounds like when it's tight.

### End-of-day checkpoint
✅ A public Lovable URL loads a Gantt chart showing exactly 40 tasks with visible dependency links, sourced live from Supabase — and Soumyak's dependency audit returns zero errors. If the chart renders but the data is hardcoded rather than from the database, **you are behind** — fix it tonight, not tomorrow.

---

# DAY 2 — The AI Core: Informal Text → The Right Task

### Goal for the day
Given a messy, code-mixed field message, the system returns a structured JSON proposal naming the correct task, the proposed status change, and a confidence score — with measured accuracy on a test set we built ourselves. This is the day the project either has a real technical claim or doesn't.

### What we're building and how
**The test set comes first, before the prompt.** Kenneth writes 60–80 synthetic field messages against the Day 1 schedule, each labelled with the correct `task_id`. They must span the realistic range: clean ("Foundation for Zone 3 completed today"), abbreviated ("z3 fdn done"), code-mixed ("zone 3 ka foundation ho gaya, curing kal se"), Assamese-English mixed, ambiguous-by-design ("piping work finished" when three piping tasks exist), partial-progress ("about 60% of the trenching done"), and negative cases (a message about nothing in the schedule, or a delay report). At least 15 should be deliberately hard.

**Then the matcher.** A Supabase Edge Function `parse-update` that takes message text, injects a compact rendering of the current schedule (task_id, name, zone, discipline, status — not the whole row) into the prompt, and asks Claude to return strict JSON:

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

Three design decisions to make deliberately today: (1) **only in-progress and not-started tasks are candidates** — filtering the candidate list is the cheapest accuracy win available; (2) **the model must return alternatives**, because the review UI on Day 4 shows them as one-click corrections; (3) **low confidence is a valid answer** — a `needs_clarification` flag beats a confident wrong match, and this is the honest-engineering point that plays well with judges.

Iterate the prompt against the test set until accuracy plateaus. Record every version's score.

### Task breakdown by person

- **Kenneth (lead — test set & taxonomy):** Builds the 60–80 message test set with gold labels. Starts the **Field Update Taxonomy** document: the controlled vocabulary of field verbs ("cast," "erected," "hydrotested," "energised," "khotom," "ho gaya," "shuru"), the zone/location naming conventions, and how partial progress is typically reported verbally. This document is a genuine asset — it's the thing that makes our matcher domain-specific rather than generic, and it's a slide in the deck.
- **Suranjan (lead — prompt engineering):** Owns the matcher prompt. Runs the test set, tunes, re-runs. Should get through at least 6–8 prompt iterations today.
- **Arin (lead — plumbing):** Builds the Edge Function via AI generation: API key handling, schedule-context query, JSON schema enforcement, error handling for malformed model output, and a retry. Makes sure a bad LLM response degrades to "needs clarification" rather than crashing.
- **Soumyak (support — evaluation):** Runs the scoring. Builds a simple Sheet: message, gold label, predicted label, confidence, correct Y/N. Produces the accuracy number and — more usefully — a categorised list of *failure types* (wrong zone, wrong discipline, ambiguous phrasing, hallucinated task ID).
- **Akshaya (parallel):** Designs the chat-style input component and the proposal card in Canva — what a pending proposal looks like, how confidence is shown (avoid a raw decimal; use High/Medium/Low with colour). Not implementing yet.
- **Tarun (lead — narrative):** Starts the demo script from the actual behaviour observed today, not from an idealised version. Watches for scope creep — if anyone proposes fine-tuning a model or building embeddings-based retrieval, kill it.

### Concepts each person should understand today

- **Suranjan:** What makes a structured-extraction prompt reliable — explicit output schema, few-shot examples drawn from the taxonomy, "return null rather than guess" instructions, and why constraining the candidate set beats a cleverer prompt. Also: temperature and why it should be near zero here.
- **Kenneth:** What a labelled evaluation set is and why building it before the prompt prevents you from unconsciously tuning to the examples you remember. The difference between accuracy and "it worked when I tried it."
- **Arin:** JSON-mode / structured output enforcement, why you validate model output server-side before it touches the database, and where API keys must live (server-side Edge Function, never the frontend — a judge may ask).
- **Soumyak:** How to read an error breakdown — that "78% accurate" is far less useful than "all 9 failures were ambiguous-piping cases," because the second tells you what to fix.
- **Tarun:** Enough of the above to explain the matcher in 45 seconds without saying "it uses AI."

### End-of-day checkpoint
✅ The matcher scores **≥ 80% top-1 accuracy** on the 60+ message test set, the score is written down with a date and prompt version, and Soumyak has a categorised failure list. If accuracy is under 70%, the cause is almost always an unconstrained candidate list or an under-specified schedule context — fix that before adding anything else.

---

# DAY 3 — The Engine: Dependency Recalculation and a Live Gantt

### Goal for the day
Changing one task's actual finish date, by hand in the database, correctly pushes every downstream dependent task and redraws the Gantt chart. Deterministic, explainable, no AI involved.

### What we're building and how
A **recalculation function** that runs on every confirmed status change. It's a forward pass over the dependency graph:

1. Topologically sort tasks by dependency (detect cycles and refuse to run if one exists).
2. For each task, `earliest_start = max(actual_finish or projected_finish of all predecessors) + lag`.
3. `projected_finish = earliest_start + remaining_duration`, where remaining duration scales with `percent_complete`.
4. Write `projected_start` / `projected_finish` back, leaving `planned_start` / `planned_finish` untouched so we can show **baseline vs. current** — the visual that makes slippage obvious.
5. Flag tasks whose projected finish now exceeds their planned finish as **delayed**, and compute the knock-on to the project end date.

Explicitly **not** using an LLM for this. Say so out loud in the pitch: "scheduling maths is deterministic; we use AI only where language is involved." That sentence pre-empts the most common judge objection about AI reliability.

The Gantt view then gains: baseline bar (grey, behind) vs. projected bar (coloured), progress fill, dependency arrows, a today-line, and a project-finish-date readout that visibly moves.

### Task breakdown by person

- **Arin (lead):** Owns the recalculation engine end to end. This is the hardest deterministic piece of the week and it belongs to the strongest engineer. Directs AI generation of the topological sort + forward pass, then tests it against hand-computed expected values.
- **Soumyak (support — verification, critical):** Builds 5 hand-calculated test scenarios *on paper first* — "if C-14 finishes 3 days late, then M-02 starts 3 days late, M-05 starts 3 days late, project end moves from 12 Nov to 15 Nov" — then checks the engine's output against them. Do not accept "it looks right on the chart." This pairing exists so Arin isn't the sole verifier of his own work.
- **Akshaya (lead — visualisation):** Implements the baseline-vs-projected Gantt in the app, matching her Day 1 design frame. Dependency arrows, delay highlighting, project-end readout.
- **Suranjan (support):** Continues matcher improvement using Soumyak's Day 2 failure categories. Adds partial-progress parsing ("about 60% done" → `percent_complete: 60`) since the engine now consumes it.
- **Kenneth:** Writes the **Evidence & Confirmation Policy** — who is authorised to confirm a status change, what counts as sufficient evidence for each discipline (a photo suffices for civil completion; a hydrotest needs a reported pressure value and duration; electrical energisation needs a permit reference), and the audit-trail requirements. This is the document that turns "we added a confirm button" into "we designed a governance layer," and it's Kenneth's strongest pitch contribution.
- **Tarun:** Mid-week scope review. Compare actual progress against this plan honestly and decide now whether anything gets cut. Also drafts the risk slide.

### Concepts each person should understand today

- **Arin:** Forward-pass scheduling / critical path method basics; topological sort and cycle detection; why baseline and projected dates must be stored separately; lag and lead.
- **Soumyak:** How to hand-compute a schedule cascade well enough to catch an off-by-one-day error, which is exactly the bug this kind of generated code produces.
- **Akshaya:** Why a Gantt shows baseline behind actual; what a critical path looks like visually; why delayed tasks need colour *and* a non-colour indicator (judges may be colour-blind; also it's an accessibility point worth 10 seconds in the pitch).
- **Kenneth:** The concept of an audit trail and why regulated/PSU environments demand attributable changes — who changed what, when, on what evidence.
- **Suranjan:** How to translate a failure-category list into a prompt change rather than guessing.

### End-of-day checkpoint
✅ Manually setting one mid-chain task to complete-3-days-late cascades correctly through at least 4 downstream tasks, the project end date shifts by the exact amount Soumyak calculated on paper, and the chart shows baseline vs. projected side by side. Cycle detection has been tested by deliberately introducing a circular dependency.

---

# DAY 4 — Photo Evidence, the Human Gate, and Deliberate Slack

### Goal for the day
The full ingestion path works: a message (with optional photo) creates a **proposal**, the proposal appears in a **review queue**, and confirming it triggers Day 3's recalculation. **The second half of this day is protected buffer.**

### What we're building and how
**Morning — photo flow.** Photo uploads to Supabase Storage. A vision call extracts what's *observable*: a plain-language description, any readable signage or board text (site boards at Indian project sites frequently carry the location and activity), and visible discipline cues (rebar, formwork, flanges, cable trays). That output is used two ways: as **weak supporting signal** to the matcher, and — more importantly — as **a caption displayed next to the photo in the review queue**, so the human reviewer isn't squinting at a thumbnail.

The framing matters and must be enforced in the UI copy: the system never says "verified complete." It says *"Evidence attached — AI reads this as: formwork removed, concrete surface visible, Zone 3 board legible. Confirm status change?"* Never let a label in the product claim autonomous verification, because the moment a judge finds that string, the honesty of the whole pitch is in question.

**Also morning — the review queue.** A page listing pending proposals: the original message, the photo + caption, the matched task with confidence, the top 2–3 alternatives as one-click corrections, the proposed change stated in plain English, and **Confirm / Correct / Reject**. Confirm writes the status change, fires recalculation, and logs to `audit_log` with user, timestamp, evidence reference, and original message text.

**Afternoon — BUFFER.** This is scheduled slack, placed here deliberately rather than at the end. Realistically Days 2–3 overrun. If everything is genuinely on time, the afternoon is spent on the highest-value items from a short list Tarun keeps: matcher accuracy above 90%, a second demo scenario, or a delay-reporting path ("material not received, work stopped") that pushes dates *without* claiming progress — a strong extra beat if it's free.

### Task breakdown by person

- **Arin (lead):** Proposal → confirmation → recalculation pipeline, and the audit log. The transactional integrity here (a confirm must either fully apply or fully fail) is his call.
- **Akshaya (lead — review queue UI):** Builds the review queue. This screen is where the product's judgement is visible, so it gets the most design attention of any screen this week. Also owns the copy in it, with Kenneth.
- **Suranjan (lead — vision):** Wires the photo upload and the vision extraction call. Tunes the prompt to describe rather than conclude — "describe what is visible; do not state whether work is complete" is the literal instruction.
- **Kenneth (support):** Sources or generates 10–12 plausible site photos matched to specific tasks in the schedule. Writes the UI copy for the confirmation step so it reflects his Day 3 evidence policy. Documents the honest-limitations statement for the deck.
- **Soumyak (support):** Tests the confirm/reject/correct paths, especially the ugly ones — confirming twice, rejecting after confirming, a proposal for an already-complete task, a photo with no message.
- **Tarun (lead — buffer control):** Decides at 1pm whether the afternoon is buffer or bonus work. Nobody else makes this call. If any Day 1–3 checkpoint is still unmet, the answer is buffer, without discussion.

### Concepts each person should understand today

- **Suranjan:** What vision models actually do reliably (describe, read text, identify objects) versus unreliably (judge completion, assess quality, verify claims) — this distinction is the intellectual core of our design and he should be able to say it cleanly.
- **Akshaya:** Human-in-the-loop review UX — showing enough context for a decision in under 5 seconds, making the *safe* action easy and the *risky* action deliberate.
- **Kenneth:** What an audit trail must capture to be defensible; why "AI-assisted, human-approved" is a stronger claim than "automated."
- **Arin:** Transactional writes and idempotency — why a double-confirm must not double-apply.
- **Soumyak:** Edge-case testing as a discipline: the bug that kills a live demo is nearly always a state that wasn't tested, not a feature that wasn't built.
- **Tarun:** How to say no to good ideas on Day 4.

### End-of-day checkpoint
✅ End-to-end, without touching the database directly: type a message → attach a photo → proposal appears in queue with caption and alternatives → click Confirm → task status updates → dependent tasks shift → Gantt redraws → audit log records the change. If this works, you are on schedule with three days remaining, which is a comfortable position.

---

# DAY 5 — The Product Around the Engine

### Goal for the day
It stops looking like a prototype. A coherent dashboard, a convincing chat input, visible audit history, and a project-health view that a manager would actually open.

### What we're building and how
**The chat input** styled as a recognisable messaging thread — sender name, crew designation, timestamps, message bubbles, a photo attachment control, and the system's replies appearing inline ("Got it — I think this is C-14 Foundation Concreting, Zone 3. Sent to your site engineer for confirmation."). Two panes side by side in the demo layout: field view on the left, schedule view on the right, so the judge sees cause and effect in one glance without tab-switching. **This layout decision is worth more to the demo than any feature built this week.**

**The dashboard:** project completion percentage, tasks at risk, current projected finish vs. baseline finish with the variance in days, count of pending proposals, and a recent-activity feed drawn from the audit log.

**Task detail view:** click any Gantt bar → its history, the messages and photos that changed it, who confirmed each change and when. This is the screen that answers "how do we know this is trustworthy," and having it ready before the question is asked is worth a lot.

**Empty, loading and error states**, because a demo that shows a spinner forever is a failed demo.

### Task breakdown by person

- **Akshaya (lead):** Owns everything visual today — dashboard, chat pane, task detail, states, responsive behaviour at projector resolution. Her highest-leverage day of the week.
- **Suranjan (support — generation speed):** Pairs with Akshaya, converting her designs into Lovable prompts fast. She decides what it should look like; he makes the AI produce it.
- **Arin (lead — hardening):** Steps back from features to strengthen: loading states, error handling, performance with 40 tasks, and a **one-click demo reset** that restores the database to a known starting state. This reset is not optional — it is what allows the demo to be run twice, and what saves Day 7 if a rehearsal corrupts the data.
- **Soumyak (support):** Full regression pass over Days 1–4 functionality — new UI work routinely breaks working features. Logs bugs; does not fix them silently.
- **Kenneth (lead — deck):** Begins the deck content: problem framing with Oil India context, the competitive landscape and our differentiation, architecture diagram, the honest limitations slide, the evidence/governance policy, and business model. Uses real numbers from Soumyak's Day 2 accuracy testing — not invented ones.
- **Tarun (lead — script):** Writes the demo script beat by beat with timings. Decides who speaks which section. **Freezes the feature list at end of day** — nothing new gets built after tonight.

### Concepts each person should understand today

- **Akshaya:** Visual hierarchy under demo conditions — what survives a dim projector at 4 metres (contrast, size, one focal point per screen); why side-by-side beats tabbed for demonstrating causality.
- **Kenneth:** How to structure a technical pitch deck — problem, why now, what exists already, what we do differently, how it works, what's real vs. simulated, what's next. Also: why naming your limitations first defuses the question rather than inviting it.
- **Tarun:** Demo-script craft — open with the pain in one sentence, show the working system within 90 seconds, one clean surprise moment (the Gantt cascading), and close on differentiation. No feature tours.
- **Arin:** Why a reset-to-known-state function matters more than any remaining feature.
- **Soumyak:** Regression testing — the idea that "it worked yesterday" is a claim requiring re-verification.

### End-of-day checkpoint
✅ A person outside the team can be handed the URL and, with no explanation, understand within 60 seconds what the product does. Test this literally — find someone from another team and time them. Also: the demo-reset button works and has been used at least twice. Feature list is frozen in writing.

---

# DAY 6 — Integration and the First Honest End-to-End Run

### Goal for the day
The whole system runs start to finish, three times, without anyone touching the database. Every defect found is logged and triaged. No new features.

### What we're building and how
**Morning: the demo dataset freeze.** Kenneth and Tarun fix the exact demo sequence — which 4–5 messages get sent, in what order, with which photos, producing which cascade. It should build: (1) a clean, obvious match; (2) an ambiguous message where the system asks for clarification or offers alternatives — *deliberately included*, because showing the system's uncertainty handling is more persuasive than three easy wins; (3) a photo-backed completion; (4) a delay report that pushes the project end date visibly. Every message text and photo is frozen and stored. No improvising during the pitch.

**Midday: three full run-throughs**, on the actual laptop and, if possible, the actual projector. Reset between each. Every person present. Log everything that stutters, mismatches, or looks wrong.

**Afternoon: triage and fix.** Arin and Suranjan work the defect list in severity order. Anything that breaks the frozen demo path is P0. Anything cosmetic outside the demo path is P2 and probably never gets fixed — that's fine and should be stated explicitly so nobody burns Day 7 on it.

**Also today: the fallback plan.** Record a full screen-capture video of a successful end-to-end run, and export static screenshots of every key screen into the deck as backup slides. Venue wifi fails, APIs rate-limit, laptops sleep. A team that can keep pitching through a technical failure looks composed; a team that can't looks finished.

### Task breakdown by person

- **Arin (lead — defect fixing):** P0 and P1 defects only. Has authority to refuse any fix that risks the demo path.
- **Suranjan (support):** Second fixer, works P1s. Also verifies API quota/rate limits and confirms there's a spare key.
- **Soumyak (lead — test execution):** Runs the three end-to-end passes, maintains the defect log with severity, operates the demo during rehearsal so the primary presenter can focus on speaking.
- **Kenneth (lead — demo dataset + deck):** Freezes the message/photo set. Completes the deck. Records the fallback video.
- **Akshaya (support):** Cosmetic fixes on demo-path screens only. Finishes deck visuals and the architecture diagram.
- **Tarun (lead — integration owner):** Runs the day. Makes the triage calls. First full spoken run-through of the pitch with the working demo at day's end.

### Concepts each person should understand today

- **Everyone:** The demo path — every person should be able to describe what happens at each step and why, because judges ask questions of whoever is nearest.
- **Soumyak:** Severity triage — the difference between "breaks the demo," "visible during the demo," and "nobody will ever see it."
- **Arin:** Fix risk assessment — why a change on Day 6 that touches shared logic is more dangerous than the bug it fixes.
- **Tarun & Soumyak:** Presenter/operator split — how a two-person demo stays in sync, and the verbal cue that tells the operator to advance.
- **Kenneth:** Why a recorded fallback is a professionalism signal, not an admission of weakness.

### End-of-day checkpoint
✅ Three consecutive clean end-to-end runs with no manual database intervention, defect log with every P0 closed, fallback video recorded, deck complete, and one full spoken pitch delivered end to end within the time limit.

---

# DAY 7 — Rehearsal, Hardening, and the Story

### Goal for the day
Nothing new is built. The team is rehearsed, the answers to hard questions are prepared, and the demo has been run enough times that it's boring.

### What we're building and how
**No feature work. None.** The only code changes permitted are fixes to defects that break the frozen demo path, and each requires Tarun's explicit sign-off.

**Morning — Q&A preparation.** The team writes and rehearses answers to the questions judges will actually ask. Draft them now, out loud:

- *"How do you know the AI matched the right task?"* → Confidence scoring, alternatives surfaced, and a mandatory human confirmation. We measured 8x% top-1 accuracy on an 80-message test set we built; here is the failure breakdown.
- *"What if the photo doesn't actually show completed work?"* → We never claim it does. The photo is human-reviewable evidence with an AI-generated description. Autonomous visual verification of completion is not a solved problem and we deliberately don't claim it.
- *"OpenSpace and Buildots already do this."* → They require dedicated 360° capture hardware and a trained operator walking the site on a schedule. We ingest a message someone was already going to send. Different input cost, different adoption curve, and a fit for Indian PSU/EPC sites where hardware deployment is the blocker.
- *"Is this real Oil India data?"* → No, and we say so first. Synthetic but realistic — here's how we constructed it and why the schedule structure is representative.
- *"Why not just use WhatsApp directly?"* → Requires WhatsApp Business API approval from Meta with per-message cost and opt-in flows. It's an integration task, not a research problem — we scoped it out for the hackathon and simulated the input format instead.
- *"What breaks at scale?"* → LLM cost per message, matching accuracy as task count grows past a few hundred (mitigated by candidate filtering on discipline/zone/status), and review-queue fatigue if proposal volume is high — which is why confidence thresholds matter.
- *"What's the business model?"* → Oil India gets free lifetime access under SIH rules. Revenue comes from other EPC and infrastructure firms, per-project subscription, as an ingestion layer on top of whatever PM tool they already run.

**Midday — rehearsal block.** Minimum five full run-throughs. Tarun presents at least three; Soumyak presents at least two, complete, alone — the redundancy only counts if he's actually done it. Time every run. Rehearse the failure branch too: the demo breaks mid-run, switch to the fallback video, keep talking.

**Afternoon — logistics and rest.** Charged devices, offline copies of the deck and video, mobile hotspot as wifi backup, spare API key, browser tabs pre-opened, notifications off, demo reset run once and left in the starting state. Then stop working. A rested team out-presents a tired one, and Day 7 evening code changes are how demos die.

### Task breakdown by person

- **Tarun (lead):** Primary presenter. Runs rehearsals, gives feedback, owns final Q&A answers.
- **Soumyak (lead — secondary presenter):** Full solo run-throughs. Operates the demo when Tarun presents. Genuine redundancy — one of them freezing must not end the pitch.
- **Kenneth (lead — Q&A):** Compiles the Q&A document with citations for competitive and market claims. Fact-checks every number in the deck against its source. Anything unverifiable comes out.
- **Arin (on call):** Fixes only demo-blocking defects, only with sign-off. Otherwise prepares to answer architecture questions — schema, recalculation logic, why the LLM isn't in the scheduling path, where keys live.
- **Suranjan (on call):** API quota check, spare key, LLM-behaviour questions. Prepares the "how we built this with zero manual coding" answer — it's a legitimately interesting point about the build process, if asked.
- **Akshaya (support):** Final deck polish, then joins rehearsals as the practice audience asking hostile questions.

### Concepts each person should understand today

- **Everyone:** The one-sentence version of the product, and the honest-limitations statement, delivered identically by any team member. Inconsistency between speakers is the fastest way to lose a judge's confidence.
- **Tarun & Soumyak:** Pacing and recovery — what to do when the demo hangs (keep talking, narrate what should be happening, switch to video without apologising three times).
- **Arin & Suranjan:** Being able to defend the architecture in 60 seconds without jargon.
- **Kenneth:** Which claims are defensible and which are decoration — and cutting the decoration.

### End-of-day checkpoint
✅ Five timed full run-throughs completed, both presenters have delivered the pitch solo end to end, Q&A document covers all seven questions above with agreed answers, fallback video and offline deck are on at least two devices, and the app sits in its reset starting state. Laptops closed by evening.

---

## Where the Slack Is

| Slack | When | How to use it |
|---|---|---|
| **Primary buffer** | Day 4 afternoon | Tarun calls it at 1pm on Day 4. If any Day 1–3 checkpoint is unmet, it is buffer — not bonus work. |
| **Secondary** | Day 6 afternoon | Nominally defect-fixing; absorbs overrun from Day 5 if needed. |
| **Not slack** | Day 7 | Day 7 is rehearsal. Treating it as build time is the single most common way hackathon teams lose. |

---

## Biggest Risks to This Timeline

**1. Day 2's matcher accuracy — the highest-consequence risk.**
If informal text doesn't map to the right task reliably, there is no product; everything downstream is a Gantt chart with a chat box next to it. Protect it by having Kenneth's test set exist *before* prompt work starts, and by filtering the candidate task list hard. If accuracy is still under 70% by end of Day 3, fall back deliberately: restrict the demo schedule to 20 clearly-distinguished tasks, and lean the pitch on the *human-confirmation workflow* rather than raw matching accuracy — a defensible and honest pivot, but only if made by Day 3, not Day 6.

**2. Day 3's dependency recalculation — the highest single-point-of-failure risk.**
It lands almost entirely on Arin. If it slips, Days 4–6 have nothing to cascade into and the demo's most visually persuasive moment disappears. Mitigations: Arin does nothing else on Day 3; Soumyak's paper calculations catch errors independently; and if it's not working by end of Day 4, ship Finish-to-Start-only with fixed durations and no critical-path highlighting — 80% of the visual impact for 30% of the complexity.

**3. Lovable/Supabase generation quality on Day 1.**
If the app scaffold and database wiring aren't solid by end of Day 1, every subsequent day inherits the debt. If Lovable is fighting you by Day 1 evening, switch to Bolt.new or a Claude-generated single-page app with Supabase called directly — decide that night, not on Day 3.

**4. Scope creep between Days 3 and 5.**
The most likely *actual* failure mode, and it's social rather than technical. Multi-project support, real WhatsApp integration, mobile apps, Primavera export, role-based permissions — all will be proposed, all sound reasonable, all are fatal. Tarun's written "not doing" list from Day 1 and the Day 5 feature freeze are the countermeasures. Enforce both.

**5. Kenneth going idle.**
His work — schedule, taxonomy, test set, evidence policy, deck, Q&A — is genuinely load-bearing here, but only if it's treated as a real deliverable with deadlines rather than something to do while the coders code. If he drifts, the team loses its accuracy measurement, its domain credibility, and its Q&A preparation simultaneously.

**6. Demo fragility on Day 7.**
Live LLM calls over venue wifi, at a specific moment, in front of judges. The fallback video, the offline deck, the hotspot, the spare API key and the reset button are all cheap insurance built on Days 5 and 6. Build them then; you cannot build them on Day 7.

**Protect first, if you fall behind:** Day 2's matcher and Day 3's recalculation, in that order. Everything else — UI polish, photo captioning, dashboard, second demo scenario — is cuttable. Those two are the product.
