# Running the demo

> **Every number in this file was re-walked end to end on 2026-09-03 against
> commit `f9336bf`**, from a clean `scripts\demo_reset.ps1` run on a live server,
> with every screen loaded at 1280×800 in all three roles and every quoted
> string read back off the running application. Demo-database counts are
> for the **120-activity demo schedule** (`dataset/baseline_schedule.json`) —
> they are not evaluation-corpus figures and not research-corpus figures.
> `METRICS.md` §1 explains the difference and is the authority for any
> matcher-quality number quoted here.

Two terminals, both from the project root (the folder containing
`ARCHITECTURE.md`).

```powershell
# terminal 1 — API on :8000
python -m uvicorn server.main:app --reload

# terminal 2 — UI on :5173
cd frontend
npm run dev
```

Then open <http://localhost:5173>. It lands on the **role picker**, not on a
dashboard. There is no `frontend/.env` in the repository, so the UI calls
`http://<hostname>:8000` by default; set `VITE_API_URL` only if you move the
API off port 8000.

---

## Roles, and how you get into one

The app has three roles. Which one you are decides which application you see —
different navigation, different screens, and for the field role a different
shell entirely.

| Role | Signed-in label | Nav | Lands on |
|---|---|---|---|
| `planner` | Project Manager | Home · Reconcile · Schedule · Ingest · Exposure · Memory | `/home` |
| `executive` | Senior Management | Overview · Exposure · Data | `/executive` |
| `field` | Field Supervisor | Home · Reports · Clarifications · Profile | `/field` |

Executive routes are `/executive`, `/executive/exposure`,
`/executive/provenance`. Field routes are `/field`, `/field/reports`,
`/field/clarifications`, `/field/profile`.

### There is no URL that skips the picker

The role lives in `localStorage` under the key **`navis.role`**, values
`field` | `planner` | `executive` (`frontend/src/lib/role.ts`). With no role
set, `App.tsx` renders `<Login>` **before the router**, so a signed-out visitor
cannot deep-link past it — `http://localhost:5173/?view=field` shows the
picker, and so does any other path.

`?view=field` and `?view=planner` still exist, but they force only the **mobile
or desktop shell** (`hooks/useDevice.ts`, storage key `view_override`). They do
not set the role. **Earlier versions of this runbook told you to reach the
field supervisor with `?view=field`. That is no longer how it works** — pick
Field Supervisor on the login screen instead.

### ⚠ The role is browser state. A reset does not clear it.

This is the single most likely thing to break a rehearsal, so read it twice:

- `scripts\demo_reset.ps1` and `scripts\reset_demo.py` reset **server** state —
  ingests, review items, audit records, actual dates.
- The role is **browser** state — one `localStorage` key on the presenting
  machine.

So a reset does **not** return the browser to the role picker, and a presenter
who reloads the page stays in whatever role they last chose. Two ways back to
the picker:

1. **Sign out in the UI** — *Switch Role* at the bottom of the desktop sidebar
   (it calls `clearRole()`). Verified: the picker renders immediately, over
   whatever URL you were on.
2. **Clear the key** — in the browser console:
   ```js
   localStorage.removeItem('navis.role'); location.reload()
   ```

Switching role mid-demo means signing out and signing back in. There is no
role switcher that keeps your place.

### What the login screen says, and why it matters

The picker states in its own copy:

> There is no authentication here. This screen selects a role so each person
> sees the screens built for them; it does not check a credential and it does
> not restrict data. Every API endpoint stays reachable to anyone who can reach
> the server. Single sign-on and real permission enforcement are production
> work, deliberately out of scope for the prototype.

That is a deliberate honesty choice and it is worth one sentence out loud:
*we chose to say that on the screen rather than let a judge discover it.*
Route guards keep each role's screens coherent; they are not a security
boundary and the product does not pretend otherwise.

---

## Resetting between rehearsals

Resolving review items changes the database. Three ways back to a known state —
all of them clear ingest data and re-ingest `dataset/`, and **none needs the
server stopped**. They clear rows rather than deleting the file, so there is no
held-file-handle problem on Windows and no restart.

### Demo reset

The one to run before demoing: it resets, re-ingests a fixed file set in a fixed
order, and then reads the numbers back so there is something to check rather
than trust. Needs the server up **with reset enabled**:

```powershell
# terminal 1 — API, with the reset route turned on
$env:NAVIS_ENABLE_RESET = "1"
python -m uvicorn server.main:app --reload
```

```powershell
# terminal 2 — from the project root
.\scripts\demo_reset.ps1
```

Windows PowerShell 5.1, no arguments. Add `-BaseUrl http://127.0.0.1:8001` if
the API is on another port. It takes about three seconds, or ten on the first
call after a server restart while MiniLM loads.

The last three lines are the point:

```
         2 ingested here, 11 already present, 0 failed
SUMMARY  activities=120  with actuals=67  review queue=135
Demo state is clean. Reload the browser -- no restart needed.
```

**`11 already present` is expected, not a warning.** `POST /admin/reset` is not a
clear-only call — it clears the ingest rows and then re-ingests `dataset/`
itself, and its only knob is `?dpr_only=true`. So the script asks reset for the
least it can do (the eleven DPR text files), then POSTs all thirteen files in a
fixed order of its own. `POST /ingest` refuses byte-identical content by sha256,
so re-POSTing the eleven is a deliberate no-op and the two spreadsheets are what
the script actually ingests. Spreadsheets go last, matching the order the server
uses, because on a source conflict the stored value is whichever source was
ingested last — that is what makes the conflict rows on Home reproducible.

The two spreadsheet lines are worth watching; on a clean run they read:

```
  civil_progress.xlsx    Extracted 22 events, 21 linked, 1 need review
  piping_progress.xlsx   Extracted 30 events, 20 linked, 10 need review
```

If the SUMMARY line reads anything other than `120 / 67 / 135`, the script says
so on the next line; check `dataset/` before assuming the run failed.

**If the server refuses to start** with `no such column: activities.wbs_level`,
the local `dataset/epc_progress.db` predates the v2 baseline work. It is
gitignored, disposable and rebuilt entirely from `dataset/`. Run
`python scripts\reset_demo.py` once — it detects the schema mismatch and
recreates the tables — then start the server again.

Exit codes: `0` reset and all thirteen ingests succeeded; `1` they did not (API
unreachable, reset not enabled, or a file failed to ingest) — the state is not
clean; `2` a dataset file is missing and nothing was touched.

### From a terminal

```powershell
python scripts\reset_demo.py
```

Takes about 30 seconds and prints per-file counts plus a fuller summary block
than the PowerShell script does. Reload the browser afterwards; the running
server picks it up immediately.

`python scripts\seed.py` does the same thing and is what `SETUP.md` documents
for first-time setup. `reset_demo.py` is the shorter one to reach for mid-run.

### Over HTTP, without leaving the browser

Off by default, because it destroys every ingest, review decision and audit
record. Start the server with the flag to enable it:

```powershell
$env:NAVIS_ENABLE_RESET = "1"
python -m uvicorn server.main:app --reload
```

Then:

```powershell
curl.exe -X POST http://127.0.0.1:8000/admin/reset
```

It returns the summary counts. Without the flag the route answers 404 with a
message pointing at the script, so it cannot fire by accident.

### The known-good state after a reset

| | | |
|---|---|---|
| activities in baseline | 120 | the demo schedule, `baseline_schedule.json` |
| files ingested | 13 | 11 DPRs + 2 spreadsheets |
| events extracted | 266 | |
| auto-linked | 148 | events, not activities |
| review items pending | **135** | 118 `low_confidence` + 17 `defaulted_finish_date` |
| activities with actual dates | 67 | |
| … of which completed | **38** | has an `actual_finish` |
| audit records | 275 | append-only |
| conflict-flagged audit rows | 68 | row counter |
| conflicts shown on Home | **18** rows across **17** activities | `GET /schedule/conflicts`, deduplicated: 17 on `actual_start`, 1 on `actual_finish` |

Verified 2026-09-03 by `scripts\demo_reset.ps1` followed by direct counts
against `dataset/epc_progress.db` and `GET /schedule/conflicts`. If those
numbers do not match after a reset, something is wrong with the dataset rather
than with the run. The script's own `$Expected` assertion (`120 / 67 / 135`)
passes on this state.

Note the two conflict counts are different things and both are real: **68** is
the number of audit rows carrying a conflict flag, **18** is what the Home
screen shows, because `GET /schedule/conflicts` collapses them to one row per
(activity, field).

---

## The demo path, in order

Every step below was walked end to end against a live server on 2026-09-03. The
numbers are what it actually produced. The lanes are in presentation order:
planner, then senior management, then field.

### Step 0 — the role picker

Open <http://localhost:5173>. Three cards: **Field Supervisor**, **Project
Manager**, **Senior Management**, each with one sentence saying what that person
is accountable for, and an **ENTER** link.

Say the honesty line here, once, and then never apologise for it again: *there
is no authentication behind this screen, no endpoint is restricted, and the
screen says so itself* — the paragraph under the cards is quoted in full
above. It costs one sentence and it removes the question from the Q&A.

---

## Planner lane — sign in as **Project Manager**

### 1. Home — the state of the project

The page is three rows deep and the order matters; walk it top to bottom.

**Four tiles:** **120** activities in baseline, **67** with actual dates,
**135** awaiting your review, **38** completed.

There is deliberately **no accuracy tile**. Every tile is a figure off
`/schedule` or `/review-queue`; there is no endpoint behind a matcher-precision
number, so no tile claims one. If a judge asks about accuracy, answer from
"The numbers you may say out loud" below — do not point at the screen.

**Source conflicts**, with the count **18** on the panel header. This is the
differentiator and it is worth dwelling on: the system found **18 cases across
17 activities where two field sources disagree about the same activity** —
every one of them a discipline spreadsheet against a daily report, 17 on
`actual_start` and 1 on `actual_finish`. Each row names the exact file and line
or row on both sides, and **VIEW** opens that activity's audit trail.

The line worth saying out loud: *the stored value is whichever source was
ingested last, not whichever is correct — and until now nothing in the product
told you the disagreement had happened at all.* The panel's own footer says the
same thing, and adds that the Primavera baseline is read-only and is never a
side of a disagreement.

**Needs your attention** (worst-first slice of the review queue) beside
**Recent activity** (audit writes and ingest jobs interleaved, newest first).

That is the whole page. There is no schedule-health section on Home; schedule
health lives on the Schedule screen's banner and on the executive Overview.

### 2. Ingest — watch the pipeline

To ingest a file that is not already in the database, first hold one out:

```powershell
move dataset\dpr_day_03.txt %TEMP%\
python scripts\reset_demo.py
move %TEMP%\dpr_day_03.txt dataset\
```

With `dpr_day_03.txt` held out, that reset reports a twelve-file state —
**248** events, **136** auto-linked, **128** review items, **64** activities
with actual dates, 38 completed, **257** audit records, **61** source conflicts
recorded. Those are the numbers the file you are about to drop will move.

Now drop `dataset/dpr_day_03.txt` on the Ingest screen. The trace reveals one
line at a time:

```
PARSED       dpr_day_03.txt · 2,165 bytes
EXTRACTED    18 progress events
MATCHED      12 auto-linked · 6 sent to review
WRITTEN      8 activities updated · 15 audit records
```

Note that 12 events auto-linked but only 8 activities changed — a link is not a
write, and the number shown is what the roll-up actually did.

Below it, every extracted event with its source line, what was extracted, its
confidence, and its outcome. Auto-linked rows link through to the activity.

Drop the same file again to show the duplicate guard: it is refused by content
hash with an explanation, not an error.

> **This step does not leave you back at the known-good state.** Re-ingesting
> `dpr_day_03.txt` last rather than in sequence produces **272** audit records,
> not 275 — on a source conflict the stored value is whichever source arrived
> last, so order changes what gets recorded. Activities, events, the review
> queue and the actual dates all come back to 120 / 266 / 135 / 67 / 38. If you
> are going to quote the audit count later, run `scripts\demo_reset.ps1` again
> first.

### 3. Reconcile — resolve one

The queue header shows **135 PENDING** and is sorted worst-first (the top item
is the lowest-confidence one). The right pane is three columns: **what the
supervisor said**, **why the matcher chose this** (score, margin over next,
method, and the named signals that fired — `discipline_match`,
`within_planned_window`, `margin_too_small`), and the ranked **candidate
activities**.

Actions are **CONFIRM MATCH**, **MARK NEW [N]**, **ASK SUPERVISOR [A]**,
**REJECT [R]**. The keyboard bar at the foot reads
`↑↓ J/K NAV · 1-9 PICK · ENTER FOCUS CONFIRM · N NEW · A ASK · R ×2 · ESC CANCEL`
— reject is a deliberate double-press, not a single key.

Worth saying while the queue is on screen: **135 items is the system declining
to guess, not the system failing.** 118 of them are low-confidence matches; the
other **17** are the withheld-finish rule — a node can be 100% complete and
still not get an Actual Finish, because no source ever named the date. Those go
to a planner rather than being stamped with the day the report was typed.

**Rejecting a withheld-finish item works.** Verified on this build against a
live `defaulted_finish_date` item: `POST /review/{id}/resolve` with
`{"action":"reject"}` returns HTTP 200 and

```json
{"resolution":"ignore","audit_records_created":0,
 "message":"Withheld finish date left unwritten"}
```

The activity keeps its Actual Start, its Actual Finish stays empty, and **no
audit record is written** — the append-only trail is not polluted by a decision
not to write. That is the deliberate-rejection beat, and it holds (D-038).

Confirming an item writes an `alias_lexicon` row. Be precise about what that
does today — see the third bullet under "Do not do this on stage".

### 4. Schedule — confirm it landed

The banner reads **"91 items flagged for review — 68 source conflicts, 23 date
warnings"**, with **CLICK TO FILTER** on the right. It is not called "integrity
warnings" any more; if you have rehearsed that phrase, drop it.

The footer strip is the summary to gesture at: `120 OF 120 ACTIVITIES ·
67 WITH ACTUALS · 38 COMPLETED · AVG START VAR 1.6D · AVG FINISH VAR 3.6D ·
BASELINE BASELINE_SCHEDULE @1BFDE35 · PLANNED DATES ARE BASELINE — READ ONLY`.

Find the activity you just confirmed, or search for one. Click the row to open
the audit drawer.

**A worked example that reproduces on a clean reset: `CIV-FNC-1016`** — search
*Fence & Gate*. It is also row twelve of Home's conflict panel, so you can
arrive here by clicking **VIEW** there instead. Its drawer holds **eight**
records across three source files and shows every kind of provenance the system
records:

- an **Actual Finish** and an **Actual Start** from `civil_progress.xlsx · row
  19`, both `AUTO`, `conf 100.0%`, each naming the spreadsheet cell text;
- the Actual Start row also carries **2 SOURCES ASSERTED THIS FIELD**, listing
  `2026-08-23 from dpr_day_06.txt` against `2026-08-10 from civil_progress.xlsx
  row 19` — the disagreement, in the audit trail, at the point of the write;
- a **SOURCE CONFLICT** record spelling out *actual_start disagreement: kept
  2026-08-23, did not apply 2026-09-02 from dpr_day_08.txt*;
- a **FINISH WITHHELD** record — the D-015 rule, visible;
- a second **SOURCE CONFLICT** giving the partial-scope reason in full:
  *finish asserted, but the evidence accounts for only 66.7% of the node's
  planned quantity (480 lm) — Actual Finish withheld, scope is partial*;
- rows citing `dpr_day_08.txt · line 8` and rows citing `dpr_day_06.txt · no
  single line`.

The drawer closes with **`APPEND-ONLY · 8 RECORDS · NEVER EDITED`**.

Where a row shows a file but no line, that is honest: the value came from the
report's own date rather than from a specific line. The drawer says "no single
line" rather than inventing one, and adds *"Value taken from the report's date,
not a single line."*

*(The older worked example, `PIP-SPL-1028`, does not reproduce here: it had four
audit records only because that run had already confirmed a review item.
`CIV-FNC-1016` has eight on a clean reset, before anyone touches anything.)*

### 4a. Exposure — adjudicate what the evidence proposes

The planner's **Exposure** screen is where a detected candidate becomes a
register entry. It has two panels.

**Detected candidates** — four on a clean reset, derived from the audit trail:
*fencing conflict* (1 report, 21d lost, CIV-DWG-1015), *holiday delay*
(1, 20d, CIV-FLR-1020), *piling rig breakdown* (1, 1d, CIV-PLY-1004) and *rain
delay* (1, 1d, CIV-PLY-1006). Each carries the API's own sentence — *"This is a
PROPOSAL: nothing has been written to the register."*

**One report, not one database row.** Each of these four causes is named in
exactly one line of `civil_progress.xlsx`, against one activity. That single
line writes two or three audit records (start, finish, sometimes quantity), and
both screens used to count those — so one observation was reported as two or
three. It is counted once now, by one shared function, and the screens say
"report" rather than "occurrence". If a judge asks whether anything recurs on
this dataset: nothing does, and the screen no longer implies otherwise.

**Register** — empty until you press **Accept into register** on one. Do it
once on stage: the candidate leaves the proposals list, the register gains a
row, and the same entry appears on Senior Management's Exposure page (step 7).

The line worth saying: *the system found the pattern in its own audit trail and
proposed it. It did not enter it. A person did, and the register records which
person.* That is D-009 for dates applied to governance — and it is the half
that was missing until now: the detector and the executive's read-only view
both existed, with nothing in between.

An issue carries no probability and no impact score, and the server refuses
them rather than dropping them quietly — only a risk is scored, because
scoring something that has already happened is a category error.

### 5. Memory — the half nobody else builds

Four sections, all computed from captured execution data, with the standing
caveat printed at the top of the page: these patterns come from actual
execution data, not from the baseline plan.

- **Planned vs actual duration** by activity type, worst overrun first, with a
  completed-of-total count on every row. It lists **19** types and says so:
  *"37 further activity types have no completed activity yet and are not
  listed."* Worst row is `CIV-PLT`, 6.0d planned against 35.0d actual — +29.0d,
  +483%, on 1 of 1.
- **Slip by discipline**, six rows. **Civil +6.6d (21/22)** and **Piping 0.0d
  (17/30)** are the only two with completed work; the other four — Static
  Equipment, Electrical, Instrumentation, HSE — say *"no completed activities
  yet"* in words rather than drawing an empty bar.
- **Delay causes**: Fencing Conflict (1 report, 21d), Holiday Delay (1, 20d),
  Piling Rig Breakdown (1, 1d), Rain Delay (1, 1d) — the same four, with the
  same numbers, as the planner's Exposure screen in step 4a. The panel notes
  that an activity recording more than one cause is counted against each, so
  the days-lost column is an upper bound.

  The column is headed **Reports**, not Occurrences, and it means one field
  report naming that cause for one activity. Show this panel and step 4a in the
  same breath if you like — they agree by construction now, because they call
  the same counter.
- **Suggested duration** — pick an activity type and get what the actuals say
  the next project should plan for, against the baseline figure. It opens on
  **`PIP-HYT` — 3 of 5 completed**: baseline planned **5d**, suggested **6d**,
  P80 **7d**, with the sentence *"For PIP-HYT activities, actual median (6d)
  exceeds planned (5d). Consider revising planned duration to 6d or using P80
  (7d)."*

Be ready for the obvious question, and answer it with the number rather than
around it. The sample sizes are small — **38 of 120 activities have both an
actual start and finish**, and only **9 of 56 activity types have two or more
completions** — and the screen shows the count on every row rather than hiding
it. The four delay causes are keyword hits over DPR prose, not a modelled cause
taxonomy. `ARCHITECTURE.md` §7 has the full account.

---

## Senior Management lane — sign out, sign in as **Senior Management**

Sidebar reads *Senior Management* under the project name. Three destinations:
**Overview**, **Exposure**, **Data**.

**Make the absence the argument.** This role has **no review queue**, and that
is deliberate, not unfinished: an executive who can approve an update bypasses
the single accountable owner of the plan. Say it in one line — *governance sees
everything and approves nothing; the Project Manager is the only role that
changes the schedule* — and the missing queue stops looking like a gap.

### 6. Overview — schedule health, read-only

**Lead with the caveat, not the number.** The page does, in a banner above
everything else:

> **SPI understates progress on this dataset.** 64 of 120 activities are scored
> at 0% because no source has reported on them yet — not because work has
> stopped. Earned value counts only what a field report actually evidenced.

The sentence to give the presenter: *"That 0.43 is not a project in trouble —
it is a project where 64 of 120 activities have no field evidence yet, and we
score evidence, not optimism. We surfaced that above the number rather than
below it."*

Then the four tiles: **SCHEDULE PERFORMANCE 0.43** (Behind), **EARNED /
PLANNED 554/1285** duration-weighted work units, **ACTIVITIES EVIDENCED 56** of
120, **SOURCE CONFLICTS 18**.

**Where the schedule is slipping** — a per-discipline bar with the unevidenced
count beside it: SEQ 0.02 (21 unevidenced), HSE 0.02 (9), ELE 0.25 (14), INS
0.41 (9), PIP 0.67 (10), CIV 0.96 (1). Read it alongside the banner: the
disciplines that look worst are the disciplines nobody has reported on.

**Biggest finish slips** — CIV-PLT-1021 +29d, CIV-GBM-1014 +26d, CIV-APN-1022
+23d, CIV-DWG-1015 +21d, CIV-FLR-1020 +20d, CIV-FNC-1016 +15d, then two at +1d.

### 7. Exposure — the RAID register and unresolved conflicts

**The RAID register is empty on a clean reset — and that is now a choice
somebody can make, not a dead end.** It reads:

> No risks, issues, actions or decisions have been accepted into the register
> yet. Candidates detected from field reports stay proposals until a Project
> Manager adjudicates them.

`GET /raid/candidates` proposes four items derived from the audit trail — the
recurring delay causes, with occurrence counts and days lost — and every one
carries `"committed": false` and the note *"This is a PROPOSAL: nothing has
been written to the register."*

**The planner adjudicates them on their own Exposure screen** (step 4a). Until
somebody does, this panel stays empty, and that is the design rather than a
gap: *the system will propose a risk from the evidence; it will not enter one
into the register on its own authority.* Same rule as D-009 for dates, applied
to governance.

If you want the register populated for the demo, accept a candidate as the
planner first — it appears here immediately. `scripts\demo_reset.ps1` clears
the register again, so a rehearsal cannot leave a stray entry behind.

Below it, **Source conflicts (18)** — the same detections the planner sees, at
executive altitude: one row per activity and field, with the stored value. The
panel's own note is the sentence to say: *these are detections — a spreadsheet
would have kept whichever arrived last and shown no conflict at all.*

### 8. Data — provenance of the corpus

Sourced from `GET /evidence/corpus`. Four tiles: **124** verified artifacts,
**0.26 GB** corpus size, **1,462** validation checks, **0 / 0** errors and
warnings — with the line *"All 1,462 validation checks passed with zero errors
and zero warnings. Every derived record is marked `data_origin=real` and every
original carries an adjacent provenance sidecar."*

Then, prominently, **WHAT THIS CORPUS DOES NOT ESTABLISH** — four caveats,
including *"Only 27 distinct activities are present in the two authentic
same-contract schedule snapshots"* and *"Real under 'datasets/real', synthetic
under 'dataset'. The demo baseline remains the synthetic 120-activity
schedule."*

**Those caveats are rendered from the API's own `caveats` array, not hardcoded
in the component** (`frontend/src/pages/executive/Provenance.tsx`; the endpoint
returns four caveat objects). That is the sentence worth saying: *the limits
travel with the data, not with the slide.*

Below: records by dataset (CFIHOS 43,753 rows, PAIMANA 18,601, ConstructCIE
3,520 causal spans, …), artifacts by source (wsdot 46, mospi_paimana 35,
cfihos_v2 15, …), and OCR coverage — **73 pages read, 4,315 lines extracted,
13 activity mentions found**, labelled unverified.

---

## Field lane — sign out, sign in as **Field Supervisor**

The field surface is a phone UI. On a desktop it is capped at a phone width and
centred, so the same markup reads correctly on a handset and on a projector.
Header shows the project and **Field Supervisor**; the location chip reads
*Sector A · Digboi Well #4*; language chips offer EN / हि / অস. Bottom nav:
Home, Reports, Clarifications, Profile.

**This is a role choice now, not `?view=field`.** See the routing section above.

### 9. Report an update by voice — or by typing

Tap **Tap & Speak** and say the opener, or type it. **Use this three-turn
script; it is the one covered by `server/test_agent.py` and it is the one that
works:**

1. *"spool erection on the 24 inch header is done"*
2. **Yesterday** (a chip; the agent offers Today / Yesterday)
3. *"6 out of 18"*

After turn 1 the session chips already read `DISCIPLINE Piping`, `LOCATION
Sector A · Digboi Well #4`, `STATUS Finished`, and the agent asks only for what
it still lacks — the date, then the quantity. It does not interrogate you for
what it can already infer.

The script above is the one to rehearse, but you are no longer punished for
straying from it. Putting the quantity in the opening sentence used to strand
the session: the agent asked *"How many were planned in total?"*, no plain
answer satisfied it, and a **CONFIRM & SUBMIT** pressed in that state was
silently swallowed. All three halves of that are fixed — a bare number now
answers the planned-total question, a slot the agent has given up on stays
given up on, and a confirm it genuinely cannot honour says so instead of
vanishing (*"I need one more thing before I can send this."*). Verified on this
build.

**The transcript review step is the point**, not an obstacle: ASR mangles tags
like `24"-P-1001-A1A`, and tag overlap is the matcher's strongest feature. Edit
the transcript, then send.

At **READY TO DRAFT** the agent says *"I have enough to prepare the update."*
Press **Review Structured Update** and the card shows the matched activity,
status, date, quantity, and a real confidence off the matching engine — on the
run above, `PIP-INS-1045 · Insulation — 24"-P-1001-A1A`, Finished, 14 Sep 2026,
6 of 18, **69.2%**, tagged **PLANNER CONFIRMS**. Every field has a pencil; the
supervisor can correct the activity before submitting.

Note that it did **not** auto-apply at 69.2%. Say so: *the supervisor said "24
inch header", the matcher found a 24-inch line, and it still refused to write
the schedule on its own.* The card's own footer says the rest — *"Submitting
confirms the report information only. The Planning Engineer must review it
before any project data changes."*

**CONFIRM & SUBMIT** gives you a confirmation screen with a report reference,
*"Sent for Planning Engineer review"* and *"The project schedule has not been
changed."* The submission shows in **RECENT UPDATES** as `PROCESSING`. Verified
end to end: the review queue went 135 → 136 and the new row is
`PIP-INS-1045 / low_confidence`. The schedule was not touched (D-009).

**If the microphone is blocked** — which it may well be on a venue network —
the screen shows a quiet "Microphone unavailable / Typing works just as well",
the text input grows to become the primary control, and the whole conversation
works by typing. This is a normal state, not an error, and there is no red on
screen. The three-turn script above was driven entirely by typing.

---

## The numbers you may say out loud

Full definitions and provenance: `METRICS.md`, which is the single source of
truth. Every figure below was re-run on 2026-09-03 and agrees with it. Nothing
here may be quoted without the phrase in its "say it like this" column.

### Demo-database counts (this run, this schedule)

| Number | Say it like this |
|---|---|
| **120 activities** | "the demo project schedule" — not the corpus size |
| **135 review items** | "what this demo run produced — 118 low-confidence, 17 withheld finishes" |
| **18 source conflicts** | "18 disagreements across 17 activities, spreadsheet against daily report" |
| **27 activities** | the authentic WSDOT schedule. Never inflate it |

### v1 — what the running server actually does (`python eval.py`)

Baseline v1, 120 activities, 254 mentions, **no train/test split** — calibrated
and reported on the same data, and it must be labelled that way.

| Number | Say it like this |
|---|---|
| **100% auto-link precision** | "on our v1 evaluation corpus, 128 of 128, zero wrong auto-links — that figure is not held-out" |
| **87.2% top-1** | "on the same v1 corpus, 211 of 242, calibrated and reported on the same data" |
| **50.4% coverage** | "128 of 254 mentions handled automatically at that precision" |

### v2 — the honest held-out numbers

Baseline v2, thresholds calibrated on dev, reported on a held-out test split of
198 mentions (185 positive).

| Number | Say it like this |
|---|---|
| **71.4% top-1** | "our honest held-out number, 132 of 185, on the harder v2 corpus" |
| **97.4% / 26.5%** | "97.4% on ordinary mentions; 26.5% on deliberately ambiguous ones — **and 100% of those go to review, none are auto-linked**" |
| **100% REVIEW on near-misses** | "all 68 near-miss mentions were routed to review; 0 were auto-linked" |
| **100% auto-link precision** | "held on the held-out test split too — the system does not write wrong dates" |

### Recall@3 — the one to quote, and the one that replaces Recall@20

The review queue shows a planner **three** candidates (`server/main.py:491`;
the `candidates` useMemo in `Reconcile.tsx`), so k=3 is the number that
describes the product.

| Split | Recall@3 | |
|---|---|---|
| Overall | **88.1%** | 163 / 185 |
| Ordinary mentions | **100.0%** | 117 / 117 |
| Near-miss | **67.6%** | 46 / 68 |

The honest sentence, and it is a good one: *on ordinary text the correct
activity is in the planner's top three every time; where the deciding word is
missing, two times in three — and none of those are auto-linked.*

### Sentences that must **not** be said

- ❌ **"Recall@20 is 100%, so a planner can always fix it from the queue."**
  The queue shows **three** candidates, not twenty. On roughly a third of
  near-miss items the correct activity is **not in front of the planner at
  all**, and resolving it needs the search/reassign path. Quote **Recall@3 =
  88.1%** (67.6% on near-misses), or say "in the top 20 retrieved internally"
  and expect the follow-up.
- ❌ "The system learns from planner corrections." — see below; it does not.
- ❌ "We import Primavera files." — PMXML/XER **import** is declared and not
  implemented. **Export** works for PMXML.
- ❌ "NAVIS is 74.1% accurate." — that is an experimental configuration the
  running server does not load, its confidence interval spans zero, and the
  configuration was **selected on the test split** (`METRICS.md` §3.4a).
- ❌ "NAVIS is 87% accurate" — not without naming the corpus, the baseline, and
  the fact that it is not held-out.
- ❌ Quoting **99.8%** at all — it is the optimistic median-threshold figure
  `eval.py --cv` prints. The out-of-fold number is **99.5%** (437/439).
- ❌ Any claim about a **new project** or an **unseen activity** — 84% of v2
  test positives reuse a training activity.

---

## Do not do this on stage

**Do not export XER.** The Schedule export dropdown offers **PMXML** and
**XER**, and PMXML is the default — leave it alone. `_generate_xer` is recorded
in `DECISIONS.md` as still open and not emitting valid XER. Export PMXML, and if
asked, say plainly that XER export is written but not yet conformant.

**Do not drop an unsupported file on Ingest unless you mean to** — and if you
do mean to, make it a feature beat, because the error path is now clean.
Verified on this build:

- a `.csv` returns HTTP 400 with *"Could not read bogus.csv: CSV extraction not
  yet implemented. Nothing was written to the schedule."*
- an unknown extension returns HTTP 400 with *"Unsupported file type: .xyz"*

The Ingest screen renders the server's own sentence, not a generic failure. The
half worth pointing at is **"Nothing was written to the schedule."** — a
rejected file is a rejected file, not a partial write.

**Do not claim the system learns from planner corrections.** The honest
one-liner: *"Corrections are persisted as a training signal. We measured
whether reading them back would help, and it would not — so we did not ship
it."* The read path exists and is unit-tested, but `w_alias = 0.0`, nothing
populates the lexicon at match time, and D-061 closed the loop as
**measured, not implemented**: across a realistic train/test boundary **0%** of
lexicon keys ever match, and fusion recall@20 is already 100%, so a retrieval
channel has nothing left to retrieve. If pressed, the follow-up is the good
part: *the signal is real, it was plumbed into the saturated stage, and if we
close the loop it belongs in ranking as a prior over activities — not as a
lookup on exact text.*

**Present at 1280×800 or wider** — not because anything breaks now, but
because the planner and executive screens are dense and a projector at a lower
resolution will cost you the right-hand columns. A narrow window used to drop
whoever was signed in into the Field Supervisor application; it no longer does,
and the Force Mobile View button that did the same thing has been removed. The
role decides the application, and only the picker changes the role.

---

## If something goes wrong on stage

**You are in the wrong role, or the app is showing the login screen.** The role
is browser state and survives every reset. Sign in from the picker, or use
*Switch Role* in the sidebar to get back to it. If the picker will not go away,
the key did not write — check that the browser is not blocking site data, and
fall back to `localStorage.setItem('navis.role','planner')` in the console.

**You are looking at the field UI and did not mean to be.** Then the signed-in
role is Field Supervisor — nothing else can put you there any more. Use *Return
to role selection* on the Profile tab, or clear the key:
`localStorage.removeItem('navis.role'); location.reload()`. A stale
`view_override` from an older build is inert and can be ignored.

**The UI shows an error banner.** It is the server's own message. The API is
probably not running, or is on a different port — check `frontend/.env` against
the uvicorn port (there is no `.env` by default, and the UI assumes :8000).

**A panel is empty but the rest of the page works.** That is by design; each
panel fetches independently and one failing endpoint cannot blank the screen.

**The RAID register is empty.** Expected on a clean reset — see step 7. To
fill it, accept a candidate on the planner's Exposure screen (step 4a).

**The field agent asks something you cannot answer.** It gives up on any one
slot after two tries and moves on, so keep answering and it will reach the
card. If a session is genuinely wedged, **CLOSE** the data-entry session and
start again with the three-turn script in step 9.

**The microphone does nothing.** Expected on a locked-down browser. The screen
falls back to typing automatically; carry on typing.

**State got messy.** `python scripts\reset_demo.py`, reload the browser. The
role you are signed in as will not change.

**Port 8000 is held after a crash.** Start on another port
(`--port 8001`) and set `VITE_API_URL=http://127.0.0.1:8001` in
`frontend/.env`, rather than hunting the stale process. Pass the same port to
the reset script: `.\scripts\demo_reset.ps1 -BaseUrl http://127.0.0.1:8001`.
