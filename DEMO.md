# Running the demo

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

Resolving review items changes the database. Two ways back to a known state —
both clear ingest data and re-ingest `dataset/`, and **neither needs the server
stopped**. They clear rows rather than deleting the file, so there is no
held-file-handle problem on Windows and no restart.

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

| | |
|---|---|
| activities in baseline | 120 |
| files ingested | 13 |
| events extracted | 266 |
| auto-linked | 148 |
| review items pending | 118 |
| activities with actual dates | 67 |
| … of which completed | 47 |
| audit records | 274 |
| source conflicts recorded | 75 |

If those numbers do not match after a reset, something is wrong with the
dataset rather than with the run.

---

## The demo path, in order

Every step below has been run end to end against a live server. The numbers are
what it actually produced.

### 1. Home — the state of the project

Four tiles: **120** activities, **67** with actual dates, **118** awaiting
review, **100%** auto-link precision.

Scroll to **SOURCE CONFLICTS**. This is the differentiator and it is worth
dwelling on: the system found **25 cases where two field sources disagree about
the same activity**, 21 of them a discipline spreadsheet against a daily report.
Each row names the exact file and line or row on both sides, and the Resolve
link opens that activity's audit trail.

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
  `PIP-HYT`: baseline 5d, suggested 6d, based on 3 completed of 5.

Be ready for the obvious question. The sample sizes are small — 47 of 120
activities have both an actual start and finish — and the screen shows them
rather than hiding them. `ARCHITECTURE.md` §7 has the full account.

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
