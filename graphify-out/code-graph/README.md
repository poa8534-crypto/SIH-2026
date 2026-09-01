# Code graph — NAVIS architecture

`graph.html` is the visual map. Open it in a browser; nothing else is needed.

## What this is

An AST-derived graph of **this project's own source**: 151 code files across
`server/`, `matching/`, `extraction/`, `frontend/src/`, `scripts/`, `eval.py`
and `eval_real.py`, giving **2,272 nodes and 5,121 edges** in 126 communities.

Every edge is structural — a real import, call, or definition read out of the
syntax tree. Nothing here was inferred by a language model, so an edge that is
present is present in the code.

## Why it is separate from `graphify-out/graph.json`

The graph one level up is a **different, older artifact**: 3,601 nodes built at
commit `29c139ce`, and it carries a *semantic* layer — nodes extracted by an LLM
from `DECISIONS.md` (325), `.agents/` (283), `.claude/` (82) and `research/`
(89). That layer cannot be rebuilt without an LLM pass, so it was left intact
rather than overwritten by this smaller, code-only graph. graphify's own
shrink-guard refuses that overwrite, and it is right to.

Use this one to answer "how does the code fit together". Use the one above for
"what did we decide and why".

## Rebuilding

```bash
graphify update .
```

`.graphifyignore` at the repo root pins the scope: `datasets/` is a 630 MB
vendored third-party corpus (CFIHOS, ConstructCIE, Uniclass, PAIMANA) — data
the system reads, not code it is made of. It contributed **zero** nodes to the
existing graph, so excluding it costs nothing and saves scanning 692 files.

To add the semantic layer over docs, set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
and re-run the full `/graphify` pipeline.

## What it found

**God nodes** — the abstractions everything else hangs off:
`MatchingEngine` (92 edges), `ScheduleIndex` (53), `Activity` (53),
`EngineConfig` (46), `extract_tags()` (45).

**One import cycle**, worth knowing about:

    matching/__init__.py -> matching/engine.py -> matching/retrieval.py -> matching/__init__.py

**Communities** map onto the architecture cleanly — Event Extraction, Matching
Engine, API Endpoints, Persistence Layer, Conversational Agent, Evaluation
Harness, Field UI Components — which is a sign the module boundaries in this
repo are real rather than nominal.
