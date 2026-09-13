# NAVIS — Demo Video Script · the three-device cut

**Phone → laptop → desktop. One report, three roles, 5:30.**

> **This is a companion to [`DEMO_VIDEO_SCRIPT.md`](DEMO_VIDEO_SCRIPT.md), not a
> replacement.** That file is the 9:00 full feature walkthrough on one machine,
> and it remains the authority for **§1 (six things that will bite you on
> camera)**, **§6 (numbers you may say)** and its **Never say** list. Read both.
>
> This cut answers a different brief: *only the main features of each role*,
> each role on the device that role actually uses, with the hand-offs between
> them as the spine of the video.
>
> **Verified on the merged tree on 2026-09-12** — API `:8000`, UI `:5173`,
> after `python backend/scripts/reset_demo.py`. Every quoted label, chip,
> heading and number below was read off the running application. The field
> report was filed, it landed in the planner's queue as
> `#FR-2026-09-12-4838 · PIP-ERC-1030 · 65.2%`, and the queue went **198 → 199**.

---

## 0 · Staging

### The three devices

| Device | Open | Role | Never leaves |
|---|---|---|---|
| **Phone** | `http://<laptop-ip>:5173` | Field Supervisor | `/field` |
| **Laptop** | `http://localhost:5173` | Project Manager / Planner | Review & Reconcile → Schedule |
| **Desktop** | `http://localhost:5173` | Senior Management | `/executive` |

Each device holds its own role in its own browser storage, so **you never
switch roles on camera** and never show the picker twice. Get `<laptop-ip>`
from `ipconfig` (Wi-Fi IPv4). All three on the same Wi-Fi.

> If the desktop is a second machine, it uses `http://<laptop-ip>:5173` too.
> `frontend/.env` must **not** exist — if it does, the phone calls itself and
> every screen is empty. There is no `.env` in the repo by default.

### Start it (do not use `START_DEMO.bat`)

```bash
python -m uvicorn server.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

```bash
npm --prefix frontend run dev
```

```bash
python backend/scripts/reset_demo.py
```

`--app-dir backend` is not optional since the Python restructure (D-112).
`START_DEMO.bat` and `GO_GLOBAL.bat` in the project root still call the old
`server.main:app` without it, and they do not set `SERVE_FRONTEND`, so the tab
they open at `localhost:8000` shows `{"detail":"Not Found"}`. Don't use them
for this.

### Warm the matcher before you record

The **first** field report after a server start takes **30–40 seconds** —
MiniLM loads on that request. Verified today: the screen sits on *"Checking
your report · Reading it against the schedule. Nothing is stored yet."* the
whole time. File one throwaway report, then reset, then record. Every later
match is a second or two.

### Voice on the phone — decide before you record

Browser speech needs a secure context. On `http://<ip>:5173` the phone shows
**"Microphone unavailable — Typing works just as well"** — a designed state,
not an error. Two honest options:

- **Type on the phone.** Say *"he can speak it or type it"* — the screen offers
  both, and the typed path is what the script below uses.
- **Film the phone act on the laptop** in Chrome device emulation (F12 → device
  toolbar → iPhone 12 Pro) at `http://localhost:5173`, which *is* a secure
  context, so the mic works and the capture is clean.

### Counts on this machine after reset

`120` activities · `266` events · `75` auto-linked · `198` pending review ·
`46` with actual dates (`34` completed) · `141` audit records · `25` source
conflicts recorded. **These are not the counts printed in `DEMO.md` or in the
master script's pre-flight table** — those predate D-103. Read the screen.

**Workforce, added 2026-09-12 (D-117):** `8` crews · `368` musters · `6`
assignments (4 committed, 1 proposed, 1 withdrawn). The proposal is the one Act
2.4 commits, so **if you rehearse 2.4 you must re-seed before the take** — once
committed it leaves the *Waiting on you* list and the beat has nothing to click.
Re-seed with a reset, or POST one back:

```bash
curl -X POST http://localhost:8000/workforce/assignments \
  -H "Content-Type: application/json" \
  -d '{"crew_id":"CIV-TEAM-02","activity_id":"CIV-SIT-1002","from_date":"2026-09-14","to_date":"2026-09-20","allocated_strength":6,"note":"Backfill at the rack trenches is running slow","requested_by":"field"}'
```

Note `Crew` survives a reset by design — the roster is reference data — so a
reset restores the musters and assignments without duplicating the eight crews.

---

## ACT 1 — FIELD SUPERVISOR · phone · 2:15

Phone fills the frame, app open on **Home**, signed in as Field Supervisor.

### 1.1 · Where the data actually comes from — 0:25

**ON SCREEN**
Hold on Home. Header: **NAVIS**, the **EN** chip, `OIL Well-Site Duliajan`, the
green **Online** pill. One thumb-flick down past **QUICK PRESETS** — Work
Progress, Material Delivery, Delay / Constraint, Inspection — and **Current
Context** (`Well Pad 04 · Sector A · Piping · Day · 07:00–17:00`). Flick back.
Bottom nav: **Home · Updates · Questions · Settings**.

**VOICEOVER**
> "A well-site project is planned in Primavera — thousands of activities, each
> with an ID and planned dates. But reality is produced here, at the end of a
> shift, by a supervisor with muddy boots and a phone. Today that becomes a
> paper diary, a WhatsApp message, or a spreadsheet somebody retypes on Monday.
> By the time it reaches the plan it is a week old, and nobody can prove where
> any date came from.
> NAVIS gives him one box and one question: what happened on site today. No
> activity ID. No form. And he can say it in English, Hindi or Assamese."

### 1.2 · One sentence in — 0:35

**ON SCREEN**
Tap the box and type (or speak):

> **"spool erection on the 24 inch header is done, 6 out of 18 done yesterday"**

**Send Update.** The **Report Progress** sheet opens — stepper
**1 Capture → 2 Review → 3 Submit**, context bar already reading
`Well Pad 04 · Sector A · Piping · Day · 07:00–17:00`. Let *"Checking your
report — Reading it against the schedule. Nothing is stored yet."* be readable.

**VOICEOVER**
> "He writes it the way he'd say it to a colleague. No code, no dropdown. And
> notice the context strip — his workfront, his discipline, his shift are
> already attached, because the app knows who is holding it. The only thing he
> types is what happened."

### 1.3 · Structure out, and the refusal — 0:40

**ON SCREEN**
**STEP 2 · NAVIS REVIEW** lands. Hold on it. Point at, in this order:
**65% confidence** → **WHAT YOU REPORTED** (his exact sentence) →
**NAVIS EXTRACTED**: `Discipline · Piping`, `Activity · PIP-ERC-1030 — Spool
Erection — 24"-P-1001-A1A`, `Quantity · 6 nos`, `Status · Finished`, each
tagged *read from your report*. Then the footer line, and hold:
*"The project schedule has not been changed yet. A Planning Engineer must
verify this report before actuals are committed."*
Press **Submit Update**. Show the new row in **My Recent Updates** at
**PROCESSING**. One beat on **Updates**, one on **Questions**.

**VOICEOVER**
> "One sentence, and here is what came back. It read the discipline, the
> quantity, the date and the status straight out of his words, and matched them
> to spool erection on the twenty-four-inch header — the correct activity in
> the Primavera baseline.
> Now the important part. Sixty-five per cent confident is not confident
> enough, so it did **not** touch the schedule. The card says so itself: the
> project schedule has not been changed; a planning engineer must verify this.
> In this system a field update is a proposal. It is never a write.
> He can see everything he has filed and its live status — and *Questions* is
> the return channel, for when the planner needs something clarified."

> **Cut to 3:00** — compress 1.1 to two sentences; keep 1.2 and 1.3 whole. The
> refusal is the point of the act; never cut it.

---

### 1.4 · The muster, and the signal — 0:35 · **the manpower thread starts here**

Film this **before** the transition — Acts 2 and 3 both call back to it, and
neither lands if the audience has not watched the number being created.

**ON SCREEN**
Tap **Crew**. Twelve teams, contracted strength on each. On **Civil Team 1**,
press **−** twice, expand **2 missing · 2 unexplained**, tap **No show** twice,
press **Correct today's count**. Then tap the **signal pill** in the header and
hold on the panel for three seconds.

**VOICEOVER**
> "Progress is half of what he knows. The other half is who actually turned up —
> and that is the number the whole industry loses.
>
> It opens at full strength, because a full turnout is the normal case and this
> has to take fifteen seconds with gloves on. Two taps: two masons didn't show.
> And it tells him the first reading is never overwritten — a muster is what a
> contractor gets paid against.
>
> This is a well-site in Assam. The signal is measured, not assumed. If it goes,
> the muster stays on the phone and sends itself when the signal comes back."

> **The strong optional shot, +0:10.** Turn the phone's Wi-Fi off *before*
> pressing save. The pill flips to **Offline**, the button reads **Will send
> when online**. Turn it back on and it flushes on its own. **Rehearse it** — on
> a venue network the reconnect can take several seconds, and a long silent
> pause on camera is worse than skipping the shot.

> **Do not say "AI" here.** Nothing on this screen is a model. It is a headcount
> and a ping.

---

## TRANSITION 1 → the laptop · 0:10

**Best shot:** one continuous take. Frame the phone in front of the laptop
screen, already on **Review & Reconcile**. Press **Submit Update** on the
phone; the planner's queue polls every three seconds, so the item appears on
the laptop **in shot, without anybody touching it**. Then push in on the
laptop. (Verified: pending went 198 → 199, and the new row sorts to the top.)

**Fallback:** hard cut on the word *"desk"*.

**VOICEOVER**
> "He presses send. Two hundred kilometres away, on the planner's desk —"

---

## ACT 2 — PROJECT MANAGER / PLANNER · laptop · 2:25

Laptop signed in as Project Manager, on **Review & Reconcile**, 1280×800 or
wider.

### 2.1 · It arrived, and it is labelled — 0:20

**ON SCREEN**
Header: **EVIDENCE CONTROL · Review & reconcile · 199 awaiting decision**.
Click the **⚡ Field Reports (1)** chip. The row is badged
**FIELD REPORT · #FR-2026-09-12-4838**, `65.2%`, `PIP`.

**VOICEOVER**
> "— it is already here. Badged as a field report, with its own reference
> number, sitting at the top of the queue because it is the one the system is
> least sure about. Worst first: the planner's attention goes where the
> machine's confidence is lowest."

### 2.2 · Why, not just what — 0:50 · **the heart of the video**

**ON SCREEN**
Open the item. Walk the detail pane top to bottom with the cursor:
**Origin: Field Supervisor · PIPING** → **What the supervisor said** →
**NAVIS EXTRACTED / Entity Extraction** → **Why NAVIS did not auto-link**:
`NO MATCH`, `BEST CANDIDATE 65.2%`, `MARGIN OVER #2 0.0 pts`, and the three
bullets — *match score too low*, *top candidates too close together*, *no
strong equipment/tag evidence*. Then **Candidate Activities (3)**, with the
per-candidate chips `~ Date off-window`, `✕ No tag`, `~ Weak text`.

**VOICEOVER**
> "And this is what makes it auditable rather than magical. The planner is not
> asked to trust a black box. The left is exactly what the supervisor said. The
> middle is *why* — and it is a refusal with reasons: the score was below the
> auto-link threshold, the top two candidates were too close together to
> separate, and there was no equipment tag in the sentence to break the tie.
> No language model wrote that explanation. Those are named, deterministic
> signals, and each one is a number she can argue with.
> And she gets the runners-up, not just the winner — three candidates, each one
> showing exactly which evidence it matched and which it failed."

> **Don't say a threshold number out loud** — the pane prints 77.5% and the
> shipped matcher runs 0.80 (master script §1.1). Say *"below the auto-link
> threshold"*. Don't zoom the `LOCATION` row either; the extractor put *"is
> done"* in it.

### 2.3 · The one place a date gets committed — 0:40

**ON SCREEN**
Scroll to **IF CONFIRMED — Schedule Write: Primavera P6 Baseline** and the
**What will change if accepted (Schedule Impact)** table — attribute, current
baseline, proposed field value, float & CPM consequence. Land on
*"Confirming writes an immutable entry into the append-only audit trail and
advances downstream float."* Press **Confirm**. Let the count drop. Then
**Schedule** in the sidebar — **click the sidebar, never type the URL** — open
the activity's audit drawer and hold on **APPEND-ONLY · NEVER EDITED**.

**VOICEOVER**
> "Before she decides, the system shows her exactly what her decision will do —
> which attribute changes, from what to what, and what it costs the critical
> path. Then she confirms, and *that* is the moment the schedule changes. One
> role. One route. One accountable human.
> And it leaves this: every actual date carrying the file it came from, the
> line it came from, the confidence, and who approved it. Append-only — a
> correction writes a new row, nothing is ever silently overwritten. When a
> contractor disputes a date eighteen months from now, this is the answer."

> **Cut to 3:00** — keep 2.2 and the audit drawer; drop the impact table.

---

### 2.4 · The register argues back — 0:35 · **the payoff for 1.4**

**ON SCREEN**
**Delay Analysis**, a delay selected. Scroll to the green **manpower evidence**
panel sitting *above* the liability buttons. Hold on it. Then **Workforce** →
**Allocation**, change the request from **6** to **4**, press **Commit**.

**VOICEOVER**
> "Now watch the system disagree with me.
>
> The delay taxonomy has a manpower category, and it maps to non-compensable —
> the contractor carries the cost. It is the most expensive word on this screen,
> and until now no software could check it.
>
> It checks it. *Crews fielded ninety-four percent of contracted strength across
> twenty-four musters. The register does not support a manpower cause — the
> manpower was there.* Built from the attendance he entered on the phone, and
> put in front of me **before** I choose, not after.
>
> And it gives three answers, not two: supported, refuted, or *no register was
> kept* — because 'the crews were there' and 'nobody wrote it down' are not the
> same finding.
>
> He asked me for six more people. I have four. I commit four, and the audit row
> keeps both numbers. He proposes. I commit. Same rule as the schedule."

> **The exact quote above is `CIV-DWG-1015`** — the delay the queue selects first
> on a clean seed, at **94.0% over 24 musters**. If you land on a different item
> the wording is the same but the numbers move, so either select that one or read
> the panel rather than the script. `CIV-FLR-1020` also refutes, at 93.3% over 6.

> **Cut to 3:00** — drop this whole beat before dropping anything in 2.2. But if
> the brief mentions manpower, resourcing or attendance, drop 2.3 and keep this
> instead: it is the only moment in the film where the software tells the
> operator they are wrong.

---

## TRANSITION 2 → the desktop · 0:10

**ON SCREEN**
Hold two seconds on the audit drawer, then cut to the desktop, already on the
executive **Overview**.

**VOICEOVER**
> "One sentence from the field is now a verified, sourced, approved actual
> date. Step back one altitude, and a hundred of those become a decision."

---

## ACT 3 — SENIOR MANAGEMENT · desktop · 1:40

Desktop signed in as Senior Management, on **Overview**.

### 3.1 · The number a director actually wants — 0:30

**ON SCREEN**
Hold on the hero: **CURRENT SCHEDULE FORECAST `2026-10-12`**, `Baseline
2026-09-28`, **+14 days vs baseline**, and the line *Financial exposure not
quantified · contract value not supplied*. Then the four tiles — **Schedule
Performance**, **Critical Path Drift**, **FIDIC Dispute Exposure · Clause
20.1**, **Evidence Integrity** — and read the last one off the screen
(`46 of 120` today). Then run the cursor down the sidebar without clicking.

**VOICEOVER**
> "Senior management. Same data, one altitude up, and a different question —
> not *what happened today* but *will we hand this over on time, and can we
> defend it*. A forecast finish date against the baseline. Float erosion on the
> critical path. Statutory exposure under FIDIC clause twenty-point-one. And
> evidence integrity — how much of this project is actually backed by a field
> report, printed at the same size as the good news.
> It refuses to invent a rupee figure it has not been given. And look at what
> is missing from this sidebar: there is no review queue. This role sees
> everything and approves nothing — because an executive who can approve a
> progress update has just bypassed the one person accountable for the plan."

### 3.2 · Exceptions, not dashboards — 0:25

**ON SCREEN**
**RECOMMENDED MANAGEMENT ACTION**, then **Material Exceptions & Required
Management Attention · 4 Exceptions Active**. Read across the cards — the
critical-path slip driven by the piling rig breakdown, the 27 broken baseline
logic ties, the 74 unverified activities. Click **Inspect Supporting Evidence**
on one and let it land.

**VOICEOVER**
> "It does not hand a director a dashboard to interpret. It hands them four
> exceptions, ranked by criticality and by statutory deadline — including the
> honest one: seventy-four activities nobody has reported on yet, which is a
> gap in evidence, not proof of progress. And every card clicks straight
> through to the field evidence underneath it. Board pack to the supervisor's
> own words, in one click."

### 3.2b · Manpower at board altitude — 0:20

**ON SCREEN**
**Workforce**. Hold on the four tiles, then the contractor table — long enough
for **Not measured** to be readable on the thin-sample row.

**VOICEOVER**
> "The same register, at board altitude. Eighty-five percent of the manpower we
> are contracted to have on site actually turned up. A contractor league table
> underneath it.
>
> And two refusals. It will not rank a contractor on fewer than five musters —
> those read *not measured*, because an accusation built on two data points is
> worse than none. And it will not call spare capacity waste, because that is a
> decision their own planner has not made yet.
>
> Nothing on this screen writes anything. This role governs. It does not
> operate."

> **If a judge asks whether the attendance data is real:** *synthetic, as the
> problem statement requires — but anchored to the corpus, not random. The
> shortfalls fall on the holiday, the rain day and the "labour kam tha aaj" line
> in the shipped daily reports. If it were random, the delay evidence in Act 2
> would confirm and refute causes at random too.*

### 3.3 · Close — 0:25

**ON SCREEN**
**Forecasts** → run the what-if, let the simulated completion delta move, press
**Reset to Baseline**. Then **Data Confidence** → stop on **WHAT THIS CORPUS
DOES NOT ESTABLISH** and hold through the last line.

**VOICEOVER**
> "They can ask what another fortnight of monsoon costs, and get the completion
> impact without touching the schedule — a scenario, not a commit.
> And then this. Every prototype claims accuracy. This one ships its own limits
> on screen, rendered from the data itself: what this corpus does *not*
> establish. Because on a PSU capital project, a number you cannot defend is
> worse than no number at all.
> NAVIS. From the man in the mud to the board pack — matched, reviewed,
> committed, and auditable, end to end. Thank you."

> **Cut to 3:00** — keep 3.1 and 3.3; drop 3.2.

---

## Optional callback · the loop closes · +0:20

If you have room, film this between Act 2 and Act 3 — it is the only thing in
the product that travels *back* to the phone.

**ON SCREEN** On the laptop, on **the field-submitted item only**, press **Ask
Supervisor**. Cut to the phone → **Questions** → the question is there → answer
it → cut back to the laptop, where the answer is attached to the queue item.

**VOICEOVER**
> "And when the planner needs one thing clarified, the question goes back to
> the man who filed it — on his phone, against his own report. One loop, one
> audit trail, no phone calls."

> **Only on a field-submitted row.** `GET /field/clarifications` filters to
> `match_method == "agent_turn"`, so asking on a DPR- or spreadsheet-sourced
> item reaches nobody, even though the button is offered (master script §1.4).

---

## Multi-device landmines

1. **Never type a URL or refresh on the Schedule screen** if you are serving
   the UI from port 8000. `/schedule` and `/raid` resolve to their API handlers
   and return raw JSON — the SPA catch-all is registered last. On `:5173` this
   cannot happen; navigate by sidebar anyway, out of habit.
2. **Don't open `http://localhost:8000` on camera.** No UI is served there
   without `SERVE_FRONTEND=1`; there is no root route, so you film a 404.
3. **Warm the matcher** (§0) or the phone sits on *"Checking your report"* for
   half a minute in your opening shot.
4. **Reset before every take**, and let the phone's throwaway report be part of
   the warm-up, not the recording — `⚡ Field Reports` must read **(1)**, not
   (3), when the laptop comes into frame.
5. **The phone must reach the laptop.** Test `http://<laptop-ip>:5173` on the
   phone *before* you set up lights. A corporate or guest Wi-Fi with client
   isolation will block it; a phone hotspot that the laptop joins works.
6. **Don't film a test run** and don't say "all tests passing" — `pytest -q`
   currently prints two cross-test-leakage failures (master script §1.2).
7. **Never say** the system learns from planner corrections, that NAVIS imports
   Primavera files, or that it works offline. Full list in the master script's
   **Never say** section.
