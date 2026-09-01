# Setup — Windows, from nothing

Roughly 20 minutes, most of it waiting on `pip`. No Docker.

This repo is **two processes**: a Python API (`server/`) and a React frontend
(`frontend/`). They are not served from one another — the frontend calls the API
over HTTP and CORS. For the full product you need both running, in two terminals.
The API is usable on its own via <http://127.0.0.1:8000/docs>.

---

## 0. What you need

**Python 3.12** (3.11 also works) and **Node.js 22 LTS**.

Check what you have, in PowerShell:

```powershell
python --version
node --version
npm --version
```

### Python

If `python --version` prints anything other than `Python 3.11.x` or `3.12.x`,
install 3.12 from <https://www.python.org/downloads/windows/> and **tick "Add
python.exe to PATH"** on the first screen of the installer.

> If `python` opens the Microsoft Store instead of running, Windows' app
> alias is shadowing it. Settings → Apps → Advanced app settings → App
> execution aliases → turn off both `python.exe` and `python3.exe` entries.

### Node.js

| Version | Status |
|---|---|
| **22 LTS** | **Required — use this** |
| 20 LTS | Works |
| 18 or older | **Not supported.** Node 18 is end-of-life and Vite 6 does not support it. Symptoms are confusing rather than obvious: the install may appear to succeed and then fail at `npm run dev`. |

Install from <https://nodejs.org/> (the LTS download). `npm` ships with it — you
do not install it separately.

`frontend/package.json` declares `"engines": { "node": ">=20" }`, so npm will warn
you on an unsupported version rather than letting you discover it later.

---

## 1. Get the repo and create a virtual environment

Run everything from the **project root** — the folder containing
`ARCHITECTURE.md`, `eval.py`, and the `server/` directory.

```powershell
cd "path\to\SIH 2026"

python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Your prompt should now start with `(.venv)`.

> **If activation is blocked** with "running scripts is disabled on this
> system", allow it for your user once:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> then run the `Activate.ps1` line again. On `cmd.exe` instead of
> PowerShell, use `.\.venv\Scripts\activate.bat`.

---

## 2. Install Python dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

> ## ⚠ THIS IS THE SLOW STEP. IT IS NOT HUNG.
>
> **`pip install -r requirements.txt` downloads roughly 2–3 GB and takes 5–10
> minutes**, longer on a slow connection. Almost all of it is **PyTorch**, pulled
> in transitively by `sentence-transformers` for dense retrieval — it is not
> listed in `requirements.txt` by name, which is why the size is a surprise.
>
> pip can sit on a single `torch` wheel for **several minutes with no visible
> progress**. This is the most common point at which people assume the install
> has hung and press Ctrl-C. **Do not interrupt it.** An interrupted install
> leaves a partial environment that fails later with confusing import errors; if
> you do interrupt it, re-run the same command rather than trying to repair it.
>
> If you genuinely want to watch it move: `python -m pip install -v -r
> requirements.txt`.

### The embedding model must be cached before any offline demo

The **first run of the matcher** — not the install — downloads the
`all-MiniLM-L6-v2` model (~90 MB) into your Hugging Face cache. Every run after
that loads it from disk with no network.

> ## ⚠ Cache the model before you go offline.
>
> If the model is not cached and cannot be downloaded, **the matcher does not
> fail.** `matching/retrieval.py` falls back to a deterministic hashed-ngram
> embedder and carries on with materially weaker dense recall. Nothing in the API
> or the UI tells you this has happened — only a log line does.
>
> **Every measured number in this repository assumes the real model is loaded.**
> On the fallback embedder the published Top-1, coverage and precision figures no
> longer hold, and results from that run are not comparable to anything in
> `research/` or `eval.py`.

Step 3 below warms the cache as a side effect, so run it **while you still have a
network**. Then confirm which path is actually live — do this before any offline
demo:

```powershell
python eval.py
```

The second line of its output must name the real model:

```
  schedule: 120 activities | dense: sentence-transformers all-MiniLM-L6-v2 (local, offline)
```

If it says anything else, the fallback is active. `scripts\healthcheck.py` reports
the same thing.

---

## 3. Seed the database

```powershell
python scripts\seed.py
```

This creates `dataset\epc_progress.db`, loads the 120-activity baseline
schedule, and runs all 11 DPR text files plus both discipline spreadsheets
through the real ingest pipeline. Takes about 30 seconds.

Expect a summary like:

```
  activities                                   120
  events extracted                             266
  auto-linked                                  148
  review items pending                         118
  activities with actual dates                  67
    ... of which completed                      47
    ... with distinct start and finish          42
  audit records                                259
  source conflicts recorded                     35
```

Re-running it rebuilds from scratch. `--keep` adds to the existing database
instead.

---

## 4. Start the backend — from the PROJECT ROOT

> ## ⚠ Start the backend from the PROJECT ROOT, never from inside `server\`.
>
> The project root is the folder containing `ARCHITECTURE.md`, `eval.py`,
> `requirements.txt` and the `server\` directory.
>
> `cd server` first and it **will not work**: `server/main.py` resolves the repo
> root from its own location and inserts it on `sys.path`, and the package uses
> relative imports (`from .db import ...`). Running from inside `server\` gives
> you `ModuleNotFoundError: No module named 'server'`.
>
> It also matters for the database. `server/db.py` anchors `DB_PATH` to the repo
> root rather than the working directory precisely so this cannot happen — but a
> wrong CWD elsewhere in the stack silently creates a **second, empty** database
> and the app looks like it lost your data.

In terminal 1, with the venv activated:

```powershell
cd "path\to\SIH 2026"
.\.venv\Scripts\Activate.ps1
python -m uvicorn server.main:app --reload
```

Leave it running. Open <http://127.0.0.1:8000/docs> — you should see the
interactive API docs with **17 routes**.

---

## 5. Install and start the frontend

The frontend is a separate Vite dev server on **port 5173**. It needs the backend
from step 4 already running on port 8000.

Open a **second** terminal. The venv is **not** needed here — this is Node, not
Python. Run one command per line:

```powershell
cd "path\to\SIH 2026\frontend"
npm install
npm run dev
```

`npm install` takes 1–2 minutes on a first run and writes `frontend\node_modules\`
(gitignored). It is nowhere near as slow as the `pip` step.

`npm run dev` starts Vite on port 5173 and stays in the foreground. Leave it
running and open <http://127.0.0.1:5173>.

> **PowerShell note.** Do not chain these with `&&` — Windows PowerShell 5.1 does
> not support the `&&` operator and will fail with a parser error. Run each line
> on its own, or separate them with `;`.

**You do not need to configure an API URL.** The app derives it from the browser's
own host and port 8000, which is what makes the two-device LAN demo work with no
rebuild. Only if the backend runs somewhere else do you need:

```powershell
copy .env.example .env
```

then set `VITE_API_URL` in `frontend\.env` — for example
`VITE_API_URL=http://192.168.1.42:8000`.

### Frontend checks

```powershell
npm run test
npm run lint
```

`npm run test` runs Vitest (expect **55 passed**); `npm run lint` is
`tsc --noEmit` and should print nothing.

---

## 6. Verify

In a **third** terminal, with the venv activated:

```powershell
cd "path\to\SIH 2026"
.\.venv\Scripts\Activate.ps1
python scripts\healthcheck.py
```

It imports every module, checks the dataset files, reports which retrieval
and extraction paths are live, and exercises the API.

> **Known failure — one check is wrong, not your install.**
> `scripts/healthcheck.py` asserts that `/openapi.json` exposes exactly **8**
> endpoints. The app has grown to **17 routes**, so that single check reports
> FAIL on a correct installation. Every other check should pass. This is a stale
> assertion in the healthcheck, not a problem with your setup — see `FLOW.md`
> §13 for the running defect list.

It is non-destructive: the `/ingest` check re-uploads a file already in the
database (the duplicate-content guard rejects it without writing), and the
review-resolve check probes a non-existent id expecting a 404.

Use `--offline` to run just the import and dataset checks with no server.

Finally, the test suite and the evaluation:

```powershell
python -m pytest -q          # 264 tests
python eval.py               # matcher metrics table
```

---

## The LLM is optional and OFF by default

**You do not need Ollama, a GPU, or an API key.** With no `.env` file and
nothing installed, the system runs the deterministic rules-only extraction
path and produces no errors and no warnings about a missing model. That is
the default and the supported configuration — every number quoted in
`ARCHITECTURE.md` and printed by `eval.py` comes from it.

`scripts\healthcheck.py` confirms it:

```
  [PASS] extraction provider    rules-only (LLM off — this is the default)
```

If you *want* to try the LLM path, it is opt-in:

```powershell
copy .env.example .env
```

then edit `.env` and set `EXTRACTION_PROVIDER=ollama`. It needs
[Ollama](https://ollama.com/download) running with `ollama pull qwen3:8b`.

The fallback is total: an unset provider, an unknown provider, an
unreachable Ollama, or a model that has not been pulled all fall back to
rules-only with a log line. It cannot break a working install.

Be aware of what you are opting into: measured on `dpr_day_01.txt` the LLM
path takes ~55 s against ~0.003 s, and on both that file and the
deliberately messy `dpr_day_11_messy.txt` it produces **identical linking
results**. See ARCHITECTURE.md §7C. It is wired up and guarded, but it is
not the default for a reason.

---

## Layout

| Path | What it is |
|---|---|
| `dataset/` | Baseline schedule, 11 DPRs, 2 spreadsheets, ground truth, the SQLite DB |
| `extraction/` | Regex pre-pass, spreadsheet parser, optional LLM backend |
| `matching/` | Hybrid retrieval (tag, BM25, fuzzy, dense) → feature scoring → decision |
| `server/` | FastAPI app, SQLAlchemy models, the 17 routes |
| `frontend/` | React 19 + Vite + TanStack Query; planner and field-supervisor screens |
| `scripts/` | `seed.py`, `healthcheck.py`, `reset_demo.py`, `demo_reset.ps1` |
| `eval.py` | Matcher evaluation against `ground_truth.csv` |
| `ARCHITECTURE.md` | The spec, including §7 Known Limitations |

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'server'`** — you are not in the
project root, or the venv is not activated. `cd` to the folder containing
`ARCHITECTURE.md` and re-activate.

**`ImportError` mentioning `python-multipart`** — `POST /ingest` needs it.
It is in `requirements.txt`; re-run the install step.

**Port 8000 already in use** — `python -m uvicorn server.main:app --reload
--port 8001`, and pass `--base-url http://127.0.0.1:8001` to the
healthcheck.

**Database looks wrong or empty** — delete `dataset\epc_progress.db` and
re-run `python scripts\seed.py`. Everything in it is regenerated from
`dataset/`, so there is nothing to preserve.

**The server holds the database file** — stop the server before deleting the
`.db`, or Windows reports "the process cannot access the file".
