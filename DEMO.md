# Running the demo

> **Every number in this file is reproducible from the current application
> state.** They are demo-database counts for the **120-activity demo schedule**
> (`dataset/baseline_schedule.json`) — they are not evaluation-corpus figures
> and not research-corpus figures. `METRICS.md` §1 explains the difference and
> is the authority for any number quoted here.

Two terminals, both from the project root (the folder containing
`ARCHITECTURE.md`).

```powershell
# terminal 1 — API
python -m uvicorn server.main:app --reload

# terminal 2 — UI
cd frontend
npm run dev
```

Then open <http://localhost:5173>. It lands on **Home**.

To force the field-supervisor view on a desktop browser, add `?view=field`:
<http://localhost:5173/?view=field>. `?view=planner` forces the desktop view
back. The sidebar also has a **Force Mobile View** toggle.

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

Takes about 30 seconds and prints per-file counts plus a summary. Reload the
browser afterwards; the running server picks it up immediately.

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
| review items pending | **135** | |
| activities with actual dates | 67 | |
| … of which completed | **38** | has an `actual_finish` |
| audit records | **275** | append-only |
| conflict-flagged audit rows | **68** | row counter |
| conflicts shown on Home | **18** rows across **17** activities | `GET /schedule/conflicts`, deduplicated |

Verified 2026-09-01 by `python scripts\reset_demo.py` and confirmed over HTTP
by `scripts\demo_reset.ps1`. If those numbers do not match after a reset,
something is wrong with the dataset rather than with the run.

Note the two conflict counts are different things and both are real: **68** is
the number of audit rows carrying a conflict flag, **18** is what the Home
screen shows, because `GET /schedule/conflicts` collapses them to one row per
(activity, field).

---

## The demo path, in order

Every step below has been run end to end against a live server. The numbers are
what it actually produced.

### 1. Home — the state of the project

Four tiles: **120** activities, **67** with actual dates, **135** awaiting
review, **100%** auto-link precision.

*(The 100% is measured on the v1 evaluation corpus — `METRICS.md` §3.1. If a
judge asks whether that is held-out, the honest answer is no, and the held-out
figure is in §3.2. Do not present it as a held-out result.)*

Scroll to **SOURCE CONFLICTS**. This is the differentiator and it is worth
dwelling on: the system found **18 cases across 17 activities where two field
sources disagree about the same activity** — every one of them a discipline
spreadsheet against a daily report, 17 on `actual_start` and 1 on
`actual_finish`. Each row names the exact file and line or row on both sides,
and the Resolve link opens that activity's audit trail.

The line worth saying out loud: *the stored value is whichever source was
ingested last, not whichever is correct — and until now nothing in the product
told you the disagreement had happened at all.*

### 2. Ingest — watch the pipeline

To ingest a file that is not already in the database, first hold one out:

```powershell
move dataset\dpr_day_03.txt %TEMP%\
python scripts\reset_demo.py
move %TEMP%\dpr_day_03.txt dataset\
```

Now drop `dataset/dpr_day_03.txt` on the Ingest screen. The trace reveals one
line at a time:

```
PARSED       dpr_day_03.txt · 2,151 bytes
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

### 3. Reconcile — resolve one

The queue is sorted worst-first. Pick a high-confidence item, confirm the
suggested activity. Keyboard: `j`/`k` to move, `Enter` to confirm.

Worth saying while the queue is on screen: **135 items is the system declining
to guess, not the system failing.** Part of that queue is the withheld-finish
rule — a node can be 100% complete and still not get an Actual Finish, because
no source ever named the date. Those go to a planner rather than being stamped
with the day the report was typed.

Confirming an item writes an `alias_lexicon` row as a training signal. Be
precise about what that does today: it is **stored, and not yet read back at
match time** — see `METRICS.md` §5. Do not say the system learns from
corrections.

### 4. Schedule — confirm it landed

Find the activity you just confirmed. It now has actual dates and a confidence
badge. Click the row to open the audit drawer.

The drawer is the forensic view: every write to that activity, newest first,
each naming the field, old value → new value, the source file **and the exact
line or spreadsheet row**, the confidence at the time, and whether it was
applied automatically or confirmed by a planner. It is append-only and says so.

A worked example from a real run — confirming one item produced four audit
records on `PIP-SPL-1028`, three of them citing `piping_progress.xlsx row 10`.

Where a row shows a file but no line, that is honest: the value came from the
report's own date rather than from a specific line. The drawer says "no single
line" rather than inventing one.

### 5. Field — the voice agent

Open `?view=field`. Tap **Tap & Speak**, say something like *"spool erection on
the 24 inch header is done, 6 nos"*.

**The transcript review step is the point**, not an obstacle: ASR mangles tags
like `24"-P-1001-A1A`, and tag overlap is the matcher's strongest feature. Edit
the transcript, then send.

The agent asks for what it still needs — it asks about **discipline, location
and status**, in that order. Answer `Zone A` when it asks where. The structured
card then shows the matched activity, status, date, quantity and a real
confidence from the matching engine. Confirm and it goes to the planner's queue;
the schedule is not touched.

**If the microphone is blocked** — which it may well be on a venue network —
the screen shows a quiet "Microphone unavailable / Typing works just as well",
the text input grows to become the primary control, and the whole conversation
works by typing. This is a normal state, not an error, and there is no red on
screen. Verified end to end: a typed-only session produced a matched activity
and a review item.

### 6. Memory — the half nobody else builds

Four sections, all computed from captured execution data:

- **Planned vs actual duration** by activity type, worst overrun first, with a
  completed-of-total count on every row.
- **Slip by discipline**, six bars. Two disciplines have no completed work yet
  and say so in words rather than drawing an empty bar.
- **Recurring delay causes** with occurrence counts and days lost.
- **Suggested duration** — pick an activity type and get what the actuals say
  the next project should plan for, against the baseline figure. It opens on
  `PIP-SPL`: planned median 16d, actual median 17.5d, P80 21d, based on
  **2 completed of 5**.

Be ready for the obvious question, and answer it with the number rather than
around it. The sample sizes are small — **38 of 120 activities have both an
actual start and finish**, and only **9 of 56 activity types have two or more
completions** — and the screen shows the count on every row rather than hiding
it. The four delay causes are keyword hits over DPR prose, not a modelled cause
taxonomy. `ARCHITECTURE.md` §7 has the full account.

---

## The numbers you may say out loud

Full definitions and provenance: `METRICS.md`. Nothing below may be quoted
without the phrase in its "say it like this" column.

| Number | Say it like this |
|---|---|
| **120 activities** | "the demo project schedule" — not the corpus size |
| **135 review items** | "what this demo run produced" |
| **100% auto-link precision** | "on our v1 evaluation corpus, 128 of 128, zero wrong auto-links — that figure is not held-out" |
| **87.2% top-1** | "on the same v1 corpus, calibrated and reported on the same data" |
| **71.4% top-1** | "our honest held-out number, on the harder v2 corpus" |
| **97.4% / 26.5%** | "97.4% on ordinary mentions; 26.5% on deliberately ambiguous ones — **and 100% of those go to review, none are auto-linked**" |
| **recall@20 = 100%** | "the right activity is always in our top 20 — the remaining error is ranking, not retrieval" |
| **99.8%** | "auto-link precision in the pooled cross-validated run" — a *different* setting from the 100% above |
| **27 activities** | the authentic WSDOT schedule. Never inflate it |

Three sentences that must **not** be said:

- ❌ "The system learns from planner corrections." — corrections are stored;
  the matcher does not read them back yet.
- ❌ "We import Primavera files." — PMXML/XER **import** is declared and not
  implemented. **Export** works, both formats.
- ❌ "NAVIS is 74.1% accurate." — that is an experimental configuration that
  the running server does not load, and its confidence interval spans zero.

---

## If something goes wrong on stage

**The UI shows an error banner.** It is the server's own message. The API is
probably not running, or is on a different port — check `frontend/.env` against
the uvicorn port.

**A panel is empty but the rest of the page works.** That is by design; each
panel fetches independently and one failing endpoint cannot blank the screen.

**The microphone does nothing.** Expected on a locked-down browser. The screen
falls back to typing automatically; carry on typing.

**State got messy.** `python scripts\reset_demo.py`, reload the browser.

**Port 8000 is held after a crash.** Start on another port
(`--port 8001`) and set `VITE_API_URL=http://127.0.0.1:8001` in
`frontend/.env`, rather than hunting the stale process.
