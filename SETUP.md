# Setup — Windows, from nothing

Roughly 15 minutes, most of it waiting on `pip`. No Docker. No frontend
(there isn't one — this repo is the Python API).

---

## 0. What you need

**Python 3.12** (3.11 also works). Nothing else.

Check what you have, in PowerShell:

```powershell
python --version
```

If that prints anything other than `Python 3.11.x` or `3.12.x`, install 3.12
from <https://www.python.org/downloads/windows/> and **tick "Add python.exe to
PATH"** on the first screen of the installer.

> If `python` opens the Microsoft Store instead of running, Windows' app
> alias is shadowing it. Settings → Apps → Advanced app settings → App
> execution aliases → turn off both `python.exe` and `python3.exe` entries.

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

## 2. Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

**This downloads about 2–3 GB and takes 5–10 minutes.** Almost all of it is
`torch`, pulled in by `sentence-transformers` for dense retrieval. That is
expected — do not interrupt it.

The first run also downloads the `all-MiniLM-L6-v2` embedding model (~90 MB)
into your Hugging Face cache. After that it loads offline. If the model
cannot be downloaded, the matcher falls back to a hashed-ngram embedder and
still runs, with weaker dense recall; `scripts/healthcheck.py` tells you
which path is live.

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

## 4. Start the server

**From the project root, not from inside `server\`.** Running it from inside
`server\` breaks the relative imports.

```powershell
python -m uvicorn server.main:app --reload
```

Leave it running. Open <http://127.0.0.1:8000/docs> — you should see the
interactive API docs with **8 endpoints**.

---

## 5. Verify

In a **second** terminal, with the venv activated:

```powershell
cd "path\to\SIH 2026"
.\.venv\Scripts\Activate.ps1
python scripts\healthcheck.py
```

It imports every module, checks the dataset files, reports which retrieval
and extraction paths are live, and exercises all 8 endpoints. Expect:

```
  31 passed, 0 failed, 0 skipped
```

It is non-destructive: the `/ingest` check re-uploads a file already in the
database (the duplicate-content guard rejects it without writing), and the
review-resolve check probes a non-existent id expecting a 404.

Use `--offline` to run just the import and dataset checks with no server.

Finally, the test suite and the evaluation:

```powershell
python -m pytest -q          # 182 tests
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
| `server/` | FastAPI app, SQLAlchemy models, the 8 endpoints |
| `scripts/` | `seed.py`, `healthcheck.py` |
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
