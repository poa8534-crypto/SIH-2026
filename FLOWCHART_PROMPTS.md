# NAVIS — Diagram Plan & Prompts, mapped to the official SIH 2026 template

**PS SIH26122 · Oil India Limited** · numbers verified against `NUMBERS_SHEET.md` (commit `3db290c`, 2026-09-10).
Template: `SIH2026IDEAPresentationFormat.pptx` — **6 slides maximum, title slide included**, upload as PDF.

---

## 0 · What the template actually gives you

| Slide | Fixed title | Fixed pointers you must answer |
|:--|:---|:---|
| 1 | *(title page)* | PS ID · PS title · Theme · Category · Team ID · Team name |
| 2 | **IDEA TITLE** | Detailed explanation of the solution · how it addresses the problem · innovation and uniqueness |
| 3 | **TECHNICAL APPROACH** | Technologies used · methodology and process (flow charts / images / working prototype) |
| 4 | **FEASIBILITY AND VIABILITY** | Feasibility analysis · challenges and risks · mitigation strategies |
| 5 | **IMPACT AND BENEFITS** | Impact on target audience · social / economic / environmental benefits |
| 6 | **RESEARCH AND REFERENCES** | Links to reference and research work |

**Usable canvas on every content slide** (13.33 × 7.5 in deck):
x from **0.35" to 12.95"**, y from **1.30" to 6.85"** — i.e. **12.6" wide × 5.5" tall**.
Above 1.30" is the fixed title, team-name oval and SIH logo. Below 6.85" is the fixed blue footer bar. **Nothing you generate may enter those zones.**

So: **four content slides, four diagrams, one per slide.** Slide 3 gets a big one plus a mini, exactly like the reference deck.

---

## 1 · What the reference (winning) deck does — copy these seven habits

1. **Column split, not full bleed.** Left ~27% is a text column (tech bullets), right ~73% is diagram. A vertical divider line separates them.
2. **Underlined section headings inside the canvas** — "FLOW CHART", "3 LAYER APPROACH" — small, blue, underlined. They tell the judge what they're looking at without spending a slide title.
3. **Grouped pastel containers.** Related boxes sit inside a soft tinted rectangle with a tiny caption above it. Each subsystem gets its own tint.
4. **The logic lives on the arrows.** "No signal", ">70% matches", "<70% matches". Edge labels are what make a dense chart readable.
5. **Two diagrams per slide, unequal weight.** One dominant flowchart, one small supporting schematic below it, separated by a dashed divider.
6. **An evidence box in the bottom-right corner** — GitHub link, video link, and a completion claim in red.
7. **Density is fine if it is organised.** They are not afraid of 20 boxes. They are afraid of 20 *ungrouped* boxes.

---

## 2 · Global style block — paste at the top of every prompt

> Style: flat 2D technical flowchart for a government hackathon slide, in the style of an engineering block diagram. Pastel filled boxes (light blue, mint, lavender, peach) with thin darker borders and rounded corners; related boxes grouped inside soft tinted background containers, each container carrying a small caption above it. Arrows are thin dark grey with labelled conditions on them. Section headings inside the canvas are small, blue, underlined. Sans-serif throughout. No 3D, no shadows, no gradients, no clipart, no icons of people or buildings, no emoji. Every box label 6 words or fewer. Must stay legible when projected and when printed in greyscale, so never use colour alone to carry meaning.

**Only these numbers may appear on a diagram:**
100% auto-link precision (67/67) · 43.5% coverage · 86.9% top-1 (126/145) · 71.4% held-out v2 top-1 · 88.1% recall@3 · 80.0% NO_MATCH refusal · 1,431 tests · 120 activities · 0.80 / 0.40 / margin 0.03 · 6 disciplines · 46 HTTP routes · 100% recall@20.

**Never let a diagram say:** "Offline-first PWA" · "96.7%" · "0.42 spools/day" · "dual-engine OCR" beside "zero internet" · "learns from planner corrections" · "bi-directional MS Project" · "empirical monsoon factor" · "218 activities" as the demo size · "real Oil India data".

---

## 3 · The prompts

---

### SLIDE 2 — IDEA TITLE
### PROMPT A — "Two worlds, one bridge" solution overview

*Placement: right 65% of the canvas, approx **8.0" × 5.3"**. Left 35% carries your three text pointers.*

```
Create a flat 2D technical block diagram, canvas 8 x 5.3 inches (landscape), titled
with a small underlined blue heading at top-left reading "HOW IT WORKS".

Structure: three stacked horizontal bands connected vertically.

BAND 1, tinted grey, captioned "THE FIELD — how progress is actually reported":
four small boxes in a row — "Free-text daily report", "Discipline spreadsheet",
"Site diary / WhatsApp note", "Supervisor voice update". All four feed downward into
band 2 with converging arrows.

BAND 2, tinted blue, captioned "NAVIS — the bridge", is the visual hero and should be
the tallest band. Inside it, five boxes left to right joined by arrows:
"Extract facts + provenance" -> "Retrieve 20 candidates" -> "Rank by 6 explainable
features" -> "Confidence gate" -> "Write actuals + audit record".
From the "Confidence gate" box draw two short downward arrows to two small boxes
sitting inside the same band: a green one labelled "AUTO-LINK" and an amber one
labelled "PLANNER REVIEW". Label the arrows "confident" and "not sure".

BAND 3, tinted grey, captioned "THE PLAN — Primavera P6 / MS Project L5-L6 schedule":
three small boxes in a row — "Actual start / finish updated", "Critical path
recomputed", "Institutional memory grows".

To the LEFT of band 2, outside it, place a vertical red-outlined callout box reading
"Today this gap is crossed by hand — days to weeks of planner effort per update."

Along the RIGHT edge, outside the bands, place three small stacked stat tiles:
"100% auto-link precision", "0 wrong dates written", "Every write traceable to a
source line".

Keep band 2 visually dominant. Bands 1 and 3 are context, not content.
```

---

### SLIDE 3 — TECHNICAL APPROACH
### PROMPT B — the master flowchart *(the big one)*

*Placement: right 72% of the canvas, approx **9.0" × 3.6"**, upper region. Left 28% carries the technology bullets. Draw a thin vertical divider between them, exactly like the reference deck.*

```
Create a dense but strictly organised flat 2D engineering flowchart, canvas 9 x 3.6
inches (wide landscape), with a small underlined blue heading at top-left reading
"FLOW CHART". Flow runs left to right. Use grouped tinted containers, each with a
small caption above it.

FAR LEFT, ungrouped: a stack of three input boxes labelled "Daily progress report
(.txt)", "Discipline spreadsheet (.xlsx)", "Voice / chat update", converging by
arrows into one box "Raw input recorded — file, line, character span".

GROUP 1, mint tint, captioned "EXTRACTION — deterministic":
one box "Regex pre-pass" with a dashed side box "Local LLM — optional, OFF by
default" attached to it. Output box "Extracted event: tag · quantity · date ·
discipline · status".
Arrow leaving this group is labelled "structured event".

GROUP 2, lavender tint, captioned "RETRIEVAL — recall oriented":
three stacked parallel boxes "Exact tag lookup", "BM25 keyword", "Dense embeddings
(MiniLM)", all three feeding one box "Reciprocal rank fusion" then "Top 20 candidates
from 120 activities". Annotate this group with a small label "recall@20 = 100%".

GROUP 3, peach tint, captioned "RANKING — precision oriented":
one box listing six features as a compact vertical list: "tag overlap · fuzzy
similarity · embedding cosine · date proximity · discipline agreement · predecessor
plausibility", feeding a diamond decision node "Confidence gate".

From the diamond, three labelled arrows leaving to the right:
- arrow labelled "score >= 0.80 and margin >= 0.03" -> green box "AUTO-LINK"
- arrow labelled "0.40 to 0.80, or margin too small" -> amber box "PLANNER REVIEW QUEUE"
- arrow labelled "score < 0.40" -> red-outlined box "NEW SCOPE PROPOSAL"

GROUP 4, light blue tint, captioned "WRITE — actuals only":
all three outcome boxes feed into "Quantity-based roll-up" then a final box "SQLite:
actual dates, linked events, review queue" with an attached box "Append-only audit
trail". Put a small guard label on the arrow into the roll-up reading "actual finish
only at 100% and only if a source named the date".

Add one horizontal annotation strip along the BOTTOM of the whole diagram, spanning
groups 2 to 4: "No language model ever selects an activity ID or computes a date."

Every arrow that leaves a group must carry a label. Keep all four group captions the
same size and style.
```

---

### SLIDE 3 (same slide, lower strip)
### PROMPT C — the mini schematic *(the reference deck's "3 LAYER APPROACH" slot)*

*Placement: bottom-left of the right column, approx **4.6" × 1.5"**, under a dashed pink horizontal divider. Bottom-right of that strip stays free for your evidence box (see §4).*

```
Create a very small, very simple flat schematic, canvas 4.6 x 1.5 inches, with a small
underlined blue heading at top-left reading "3-WAY DECISION — it never guesses".

Draw one box on the left labelled "Best candidate score". From it, three arrows fan
out to the right to three boxes stacked vertically:
- top, green: "AUTO-LINK — 43.5% of mentions"
- middle, amber: "HUMAN REVIEW — the rest"
- bottom, red outline: "NEW SCOPE — not in the plan"

Label the three arrows respectively "high score AND clear margin", "uncertain",
"no plausible match".

Under the three boxes place one line of caption text: "Two candidates at 0.90 and
0.89 is not confidence. That goes to a human."

Extremely low density — six shapes total. This must read in under two seconds at the
bottom of a busy slide.
```

---

### SLIDE 4 — FEASIBILITY AND VIABILITY
### PROMPT D — deployment boundary + risk/mitigation panel

*Placement: full canvas width, approx **12.4" × 4.4"**, split into two halves by a vertical divider. Your three text pointers sit as short captions above or below.*

```
Create a two-panel flat technical diagram, canvas 12.4 x 4.4 inches (very wide
landscape), divided by a thin vertical line into a left panel and a right panel of
roughly equal width. Each panel has its own small underlined blue heading.

LEFT PANEL, heading "DEPLOYS INSIDE YOUR NETWORK":
Draw one thick-bordered outer rectangle whose top edge is labelled "On-premise
boundary — no cloud service, no API key, nothing leaves the network". This border is
the visual hero of the panel. Inside it, four stacked layers, each a full-width box
with a small left-edge label:
- "CLIENT" : "Planner web app · Field supervisor screen (React + TypeScript)"
- "API"    : "FastAPI — 18 REST routes, live OpenAPI docs"
- "ENGINE" : "Extraction · Hybrid matcher · Roll-up and confidence policy"
- "DATA"   : "SQLite — actuals, review queue, append-only audit records"
Attach a dashed optional box to the ENGINE layer: "Local LLM via Ollama — optional,
off by default".
On the right inside edge of the boundary, a vertical strip labelled "P6 PMXML import ·
P6 XER import · JSON baseline import · PMXML / XER export".
Below the boundary, three small stat tiles: "1,431 automated tests passing",
"Single-command Docker deploy", "Runs on a laptop CPU — no GPU".

RIGHT PANEL, heading "RISKS AND HOW WE HANDLE THEM":
Five horizontal pairs, each a red-tinted risk box on the left, a short arrow, and a
green-tinted mitigation box on the right:
1. "A wrong date triggers false billing" -> "Nothing is auto-written unless score,
   margin and discipline all agree — 100% precision measured"
2. "Field wording never matches the WBS" -> "Three retrieval channels fused; correct
   activity in the top 20 every time"
3. "No live Oil India data available" -> "Synthetic schedule structured against public
   CFIHOS oil and gas taxonomy; stated openly"
4. "Venue has no internet" -> "Entire stack runs offline on one laptop"
5. "Unplanned scope appears on site" -> "Raised as a new-scope proposal to the planner,
   never dropped silently"

Keep the two panels visually parallel — same box heights, same type size, so the slide
reads as one composition and not two pasted images.
```

---

### SLIDE 5 — IMPACT AND BENEFITS
### PROMPT E — institutional memory loop + beneficiary strip

*Placement: full canvas width, approx **12.4" × 4.6"**. Loop on the left, beneficiaries on the right.*

```
Create a composite flat diagram, canvas 12.4 x 4.6 inches (very wide landscape), with
two regions side by side, each under its own small underlined blue heading.

LEFT REGION (about 55% of the width), heading "THE LOOP THAT DOES NOT EXIST TODAY":
A clean clockwise circular loop of five nodes with an empty centre:
1. "Project executes — reports, diaries, field updates"
2. "NAVIS captures actuals — real start, real finish, real quantity"
3. "Structured record — durations, delay causes, discipline productivity"
4. "Queryable repository — how long does this really take here?"
5. "Next project's baseline — calibrated, not guessed"
Arrow from node 5 back to node 1 closes the loop.
In the empty centre, caption: "Today this knowledge dies in a supervisor's notebook at
project close."
Attach a small grey honesty label to node 3: "Sample size shown on every figure."

RIGHT REGION (about 45%), heading "WHO BENEFITS":
Four horizontal rows, each a role box on the left and its outcome on the right,
joined by a short arrow:
- "Site supervisor" -> "Speaks one sentence instead of filling a form"
- "Planner" -> "Reviews exceptions instead of matching thousands of rows by hand"
- "Project manager" -> "Sees a schedule that reflects this week, not last month"
- "PSU / owner" -> "Every actual date defensible with a file, line and confidence"
Below these four rows, a full-width outcome strip with three tiles:
"Days-to-weeks of reconciliation lag removed" · "Delay visible while it can still be
acted on" · "Execution knowledge retained after project close".

Keep the loop geometric and clean. No gears, no brains, no lightbulbs, no rupee icons.
```

---

### SLIDE 6 — RESEARCH AND REFERENCES
### PROMPT F — evidence funnel *(optional, only if you have vertical space left)*

*Placement: right 40% of the canvas, approx **4.8" × 3.6"**. References list sits on the left.*

```
Create a small stepped vertical funnel, canvas 4.8 x 3.6 inches, with a small
underlined blue heading reading "MEASURED, NOT CLAIMED — python eval.py".

Five steps, each narrower than the one above, count on the left, explanation on the
right:
154 -> "held-out test mentions, six source files, no threshold tuned on them"
 67 -> "auto-linked · 43.5% coverage · 100% precision"
 39 -> "schedule nodes touched"
 32 -> "no measurable quantity, so no date written"
  7 -> "date withheld — it came from the report header, not a line"

Bottom caption: "Every narrowing step is a deliberate refusal."

Keep it monochrome with a single accent colour. This is a supporting exhibit, not a
hero graphic.
```

---

## 4 · The reference deck's evidence box — copy it onto slide 3

Bottom-right corner of slide 3, roughly **4.0" × 1.3"**, light blue fill:

```
GitHub link:  <your repo URL>
Demo video:   <link>
Working prototype — 1,431 automated tests passing   ← this line in red
```

The winning deck put "Above 40% of the prototype is completed" there in red. You are further along than that, so say what is true and let it do the work: a link a judge can click plus a test count they can verify beats any adjective.

---

## 5 · Slide-by-slide assembly sheet

| Slide | Left / text side | Diagram | Prompt |
|:--|:---|:---|:--|
| 2 · IDEA TITLE | 3 short blocks: what it is · how it addresses the PS · what is unique (deterministic matcher, refuses to guess, institutional memory) | Two worlds, one bridge | **A** |
| 3 · TECHNICAL APPROACH | Tech bullets: Python 3.12 · FastAPI · SQLite + SQLAlchemy · rank-bm25 · sentence-transformers (MiniLM) · rapidfuzz · React + TypeScript + Tailwind · pytest / vitest · Ollama (optional) · Docker | Master flowchart **+** 3-way decision mini **+** evidence box | **B**, **C** |
| 4 · FEASIBILITY | 3 short captions under each panel half | Deployment boundary + risk/mitigation | **D** |
| 5 · IMPACT | Short caption strip only — the diagram carries this slide | Memory loop + beneficiaries | **E** |
| 6 · RESEARCH | CFIHOS / JIP33 taxonomy · ISO 14224 · public WSDOT schedule · FIDIC clause references · your repo and metrics doc | Evidence funnel (optional) | **F** |

**If you only generate three:** **B**, **C** and **E**. B proves you built it, C proves you can be trusted with it, E proves you answered the whole problem statement and not just the first half.

---

## 6 · Four checks before the PDF goes up

1. Nothing you paste crosses **y = 1.30"** at the top or **y = 6.85"** at the bottom, and nothing overlaps the SIH logo at the top-right.
2. Every number on every diagram appears in the allow-list in §2.
3. Six slides, title slide included. The "Important Instructions" slide is deleted.
4. Exported as **PDF** — the portal rejects PPTX.
