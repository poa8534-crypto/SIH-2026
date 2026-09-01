# NAVIS

**Smart India Hackathon 2026 · Problem Statement SIH26122 · Oil India Limited**
*Intelligent Data Capture & Schedule-Linking Layer for Infrastructure Project Management*

This is the front door. If you are new to the project, read this file top to bottom
first — it should take about fifteen minutes and you will understand the whole system.

---

## 1. What problem are we solving?

Big construction projects — refineries, well-sites, pipelines — are planned in
software called **Primavera** or **MS Project**. The plan breaks the whole job into
thousands of small tasks. Each task has an ID, a planned start date and a planned
finish date.

That is the **plan**. The problem is the **reality**.

Out on site, engineers report what actually happened in daily reports, spreadsheets,
site diaries and WhatsApp messages. They write in normal human language. They do not
write activity IDs.

**A real example:**

> A site engineer types: *"spool erection on the 24 inch header is done, 6 nos"*
>
> The plan says: `PIP-ERC-1030 — Spool Erection — 24"-P-1001-A1A`

Same work. Completely different words. Right now a human called a **planner** sits
down and matches these by hand, one by one, for thousands of tasks. It takes days or
weeks. By the time the schedule is updated, it is already out of date.

And every decision that depends on that schedule — is the project late, will we
finish on time, who do we chase — is being made on stale, wrong information.

**NAVIS does the matching automatically**, gives every match a confidence score, and
asks a human whenever it is not sure.

---

## 2. What does the system actually do?

Five steps. This is the whole product.

**Step 1 — Take in messy input.**
Upload a daily progress report (`.txt`) or a discipline spreadsheet (`.xlsx`). Or a
site supervisor speaks into their phone.

**Step 2 — Pull out the facts.**
Find the useful bits inside the messy text: which pipe, how much, what date, what
discipline, is it finished. We call each of these an **event**. We always record
*exactly which characters* in the original text an event came from — this is called
**provenance**, and it is what lets a human check our work later.

**Step 3 — Match each event to a task in the plan.**
This is the hard part and the core of the project. Given "spool erection on the 24
inch header is done", find `PIP-ERC-1030` out of 218 possible tasks. See section 4.

**Step 4 — Decide how confident we are.**
- Very confident → update the schedule automatically.
- Somewhat confident → put it in a **review queue** for a human to approve.
- Not confident → flag it as possibly new work nobody planned.

Nothing is ever silently thrown away.

**Step 5 — Remember what we learned.**
If a task was planned for 5 days and actually took 10, store that. The next project
can ask "how long does this really take?" and get a real answer instead of a guess.
This is called **institutional memory**, and the problem statement specifically asks
for it. Most teams will skip it. We did not.

---

## 3. The one rule that matters

> **We never write a wrong date into the schedule.**

If a planner cannot trust the automatic updates, they will go back to doing it by
hand, and the whole product is pointless.

So the system is deliberately **cautious**. When it is not sure, it refuses to act
and asks a human. That is why our measured numbers look the way they do:

| Number | What it means |
|---|---|
| **100%** auto-link precision | Every single automatic match we made was correct |
| **50.4%** coverage | We only auto-matched about half. The rest went to a human |
| **87.2%** top-1 accuracy | Our best guess was right 87% of the time |

If someone asks "why only 50%?", the answer is: *because we would rather send half
to a human than write one wrong date.* That is a deliberate design choice, not a
weakness. We can show the exact trade-off curve.

Two other rules that follow from this:

- **Planned dates are read-only.** We only ever write *actual* dates. We never touch
  the original plan.
- **Every change is logged forever.** Every time the system writes anything, it
  saves a record of what changed, why, from which source line, and with what
  confidence. This is the **audit trail**.

---

## 4. How the matching works (the interesting part)

**We do not use an AI language model to pick the activity.** This surprises people,
so here is why.

A language model would give you an answer but could not tell you *why*, could not be
audited, and would sometimes confidently invent an activity that does not exist. For
a system that writes into a real project schedule, that is unacceptable.

Instead we use **maths that can be explained**. Two stages:

**Stage 1 — Retrieval ("find me 20 candidates").**
Three different search methods run at once, because each is good at something
different:

| Method | What it is good at |
|---|---|
| **Exact tag match** | Finding `24"-P-1001-A1A` when the text contains that tag |
| **BM25** | Classic keyword search. Good when the words genuinely overlap |
| **Embeddings** | Understands *meaning*, so "erected" can match "installation" |

Their results are merged into one shortlist of about 20.

**Stage 2 — Ranking ("which of these 20 is right?").**
Each candidate gets scored on features we chose and can explain: tag overlap, fuzzy
text similarity, meaning similarity, how close the dates are, whether the discipline
matches, whether the previous task has started.

Then a **confidence policy** decides:
- Score above 0.775 **and** clearly better than second place → auto-link.
- Between 0.5 and 0.775 → send to the human review queue.
- Below 0.5 → flag as possibly new work.

That "clearly better than second place" bit is called the **margin rule**, and it
matters: if two activities score 0.9 and 0.89, we are not actually confident — we
just have two plausible answers. So we ask a human.

**Where the AI language model does fit in:** only for reading messy text into
structured fields, and it is turned **off by default** because we measured it and it
made zero difference to the matches while being 20,000 times slower.

---

## 5. Where the project stands

**Working and tested:**

- Backend API — 17 endpoints, Python + FastAPI
- Extraction from `.txt` and `.xlsx`
- The matching engine, measured and documented
- SQLite database with a full audit trail
- Frontend — Home, Reconcile, Schedule, Ingest, Memory, plus the field supervisor
  screens
- Voice input on the phone screen (browser speech)
- Institutional memory — four kinds of historical query
- 435 Python tests and 55 frontend tests passing

**Known gaps we are actively working on** — see `FINDINGS.md`:

- The matcher is bad at recognising when *nothing* in the plan fits (1 in 12)
- Planner corrections are saved but never used to improve future matching
- No importing from Primavera or MS Project files yet — we can only export
- No RAID log, no Earned Value Management, no risk engine — see `ROADMAP.md`

---

## 6. What tools we used, and why

| Tool | What it does | Why we chose it |
|---|---|---|
| **Python 3.12** | Backend language | One language for extraction, matching and the API |
| **FastAPI** | Builds the web API | Auto-generates live API docs at `/docs` — a free thing to show judges |
| **Pydantic** | Checks data shapes | Catches bad data at the boundary instead of deep in the code |
| **SQLite** | The database | A single file. No install, no server, resets instantly. At 218 activities a bigger database buys nothing |
| **SQLAlchemy** | Talks to the database | Lets us write Python instead of raw SQL |
| **openpyxl** | Reads `.xlsx` | Handles the merged headers and mixed date formats real site spreadsheets have |
| **rank-bm25** | Keyword search | Pure Python, no search server to install |
| **rapidfuzz** | Fuzzy text matching | Fast, and handles word-order differences |
| **sentence-transformers** | Meaning-based search | Runs offline on a CPU. ⚠️ Pulls in PyTorch, about 2–3 GB |
| **NumPy** | Maths | 218 × 384 numbers is small enough for brute force. No vector database needed |
| **React + TypeScript** | The user interface | TypeScript catches mistakes before they reach the browser |
| **Vite** | Frontend build tool | Instant reload while developing |
| **Tailwind CSS v4** | Styling | Every colour comes from one file, so the whole theme changes in one place |
| **TanStack Query** | Fetches data | Handles loading, errors, caching and refetching for us |
| **Recharts** | Charts | We only need three |
| **pytest / vitest** | Tests | The standard choice for each language |
| **Ollama + qwen3:8b** | Optional local AI | Optional and off by default. Runs on your own machine, so no cloud, no API key |

**The theme running through all of it: everything runs offline on a laptop.** No
cloud service, no API key, no internet needed for the demo. If the venue Wi-Fi dies,
we still work.

---

## 7. What is in the repo

```
dataset/       Test data — daily reports, spreadsheets, the plan, the correct answers
extraction/    Reading messy text → structured events
matching/      The matching engine. The heart of the project
server/        The API, the database, all 17 endpoints
frontend/      The React app
scripts/       Demo reset, health check, seeding
research/      Evidence: measurements, graphs, the generated report
eval.py        Measures how good the matching is
```

**Documents, in the order worth reading:**

| File | What it is |
|---|---|
| `README.md` | This file. Start here |
| `SETUP.md` | How to install and run it |
| `DEMO.md` | The demo script |
| `FLOW.md` | How data travels through the code, step by step |
| `ARCHITECTURE.md` | The original design and the reasoning behind it |
| `DECISIONS.md` | Why we chose what we chose. Read before changing anything big |
| `FINDINGS.md` | Known problems, with file and line numbers |
| `ROADMAP.md` | Where the product is going next |

---

## 8. Getting it running

Full instructions are in **`SETUP.md`**. The short version, in **PowerShell**, one
command at a time:

```
python -m pip install -r requirements.txt
```

⚠️ That downloads about 2–3 GB because of PyTorch. It is slow. It has not frozen.

```
python -m uvicorn server.main:app --reload
```

**Run this from the project root, never from inside `server/`.** Then open
http://127.0.0.1:8000/docs to see every endpoint and try them live.

In a second PowerShell window:

```
cd frontend
```

```
npm install
```

```
npm run dev
```

Then open http://localhost:5173

**You need:** Python 3.12 and Node 22 LTS. Nothing else. No GPU, no API key, no
Ollama unless you are specifically working on the AI extraction path.

---

## 9. Vocabulary you will see everywhere

| Word | Meaning |
|---|---|
| **Activity** | One task in the plan, like `PIP-ERC-1030` |
| **L5 / L6** | How detailed a task is. L1 is "build the plant", L6 is "weld this joint" |
| **WBS** | Work Breakdown Structure — the tree the plan is organised into |
| **Discipline** | The trade doing the work. We have exactly six: civil, piping, static_equipment, electrical, instrumentation, hse |
| **DPR** | Daily Progress Report — the free-text report from site |
| **Tag** | An equipment or pipe identifier, like `24"-P-1001-A1A` or `TK-2101` |
| **Event** | One fact we pulled out of messy text |
| **Auto-link** | The system matched an event to an activity by itself |
| **Review queue** | Matches the system was unsure about, waiting for a human |
| **Provenance** | Exactly which characters in which file a fact came from |
| **Audit trail** | The permanent log of every change ever made |
| **Baseline** | The original plan. Read-only. We never change it |
| **Actuals** | What really happened. The only thing we ever write |
| **Precision** | When we say yes, how often are we right |
| **Coverage** | What percentage we handled automatically |

---

## 10. Where to jump in

Six workstreams. Each is genuinely separable — pick one and you can be useful
without understanding the rest.

**1 · Matching engine** — `matching/`
The most technically interesting work. Right now the system is bad at recognising
when nothing in the plan fits (see `FINDINGS.md` F4 and F5). Comfortable with maths
and search? This is yours.

**2 · Frontend** — `frontend/src/`
Three user types are planned: Field Supervisor, Project Manager, Senior Management.
Only two exist. `ROADMAP.md` §14 lists exactly what to build. React and TypeScript.

**3 · Data and evaluation** — `dataset/`, `eval.py`, `research/`
Our test data is too small to make strong scientific claims. Growing it and building
a proper benchmark is high-value and needs no deep knowledge of the rest of the
system. `ROADMAP.md` §12 has the full design.

**4 · Backend and API** — `server/`
New features from `ROADMAP.md`: RAID logs, Earned Value Management, notifications.
Python and FastAPI.

**5 · Integrations** — new work
Reading Primavera and MS Project files. One library (MPXJ) does both. `ROADMAP.md`
§10 has the verified details, including what will *not* work and why.

**6 · Demo and documentation** — `DEMO.md`, `research/`
Rehearsal, the metrics slide, judge questions, the report PDF. Sounds less glamorous
than the code. It is not — judges score what they see and hear.

---

## 11. Three things to know before you change code

**Run the backend from the project root.** Not from inside `server/`. Running it from
the wrong place produces an error that looks like a broken database and is not.

**Never put a colour code directly in a component.** Every colour lives in
`frontend/src/index.css` as a token. This is checked, and it is why the entire theme
can change in one file.

**Never add a button with nothing behind it.** Before adding any control, name the
endpoint or the local state it acts on. If there is nothing, do not build it. A
judge will click it, and a dead button costs more than a missing feature.

---

*Questions: ask in the team chat. If the answer is in `DECISIONS.md`, someone will
point you there — that file exists so we do not re-argue settled questions.*
