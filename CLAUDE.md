# CLAUDE.md — Repository Operating Rules

**This file governs how any AI agent (Claude Code or otherwise) must work in this
repository. It is permanent. It survives new sessions, context resets, different
machines, different developers, and different agents.**

Project: **NAVIS** — Intelligent Data Capture & Schedule-Linking Layer
(SIH 2026, Problem Statement 26122).

---

## THE PRIME RULE

> **BEFORE AND AFTER ANY TASK THAT MODIFIES THIS REPOSITORY, READ AND MAINTAIN
> `DECISIONS.md` AND `FLOW.md`. A repository-changing task is not complete until
> those files accurately represent the resulting architecture, decisions, and
> execution flow. After verification, commit the completed work to Git and push it
> to the configured remote repository so the remote repo remains synchronized with
> the working project.**

This applies to **every** prompt that modifies, creates, deletes, renames, moves,
restructures, or configures anything inside this project folder.

---

## SOURCE OF TRUTH MODEL

```
CODE          → WHAT the system does
FLOW.md       → HOW execution travels through the system
DECISIONS.md  → WHY the system was designed that way
CLAUDE.md     → HOW this repository must be maintained (this file)
GIT HISTORY   → WHEN and through which changes the project evolved
```

All five must remain synchronized. Documentation that contradicts the code is worse
than no documentation, because it is trusted.

---

## MANDATORY WORKFLOW

```
READ EXISTING PROJECT CONTEXT
        ↓
UNDERSTAND EXISTING EXECUTION
        ↓
IMPLEMENT
        ↓
TEST / VERIFY
        ↓
UPDATE DECISIONS.md
        ↓
UPDATE FLOW.md
        ↓
VERIFY DOCUMENTATION AGAINST CODE
        ↓
REVIEW GIT DIFF + CHECK FOR SECRETS
        ↓
COMMIT
        ↓
PUSH
        ↓
VERIFY REMOTE SYNC
```

### Before implementing

1. **Read project memory** — `CLAUDE.md`, `DECISIONS.md`, `FLOW.md`.
2. **Inspect the relevant code** — directories, files, functions, classes, tests,
   schemas, interfaces, APIs, configuration. Do not recreate functionality that
   already exists.
3. **Trace existing execution** — what calls this, what this calls next, both
   upstream and downstream, before modifying the path.
4. **Check previous decisions** — read the relevant `DECISIONS.md` entries and
   determine whether the requested change conflicts with an earlier architectural
   choice. Do not blindly overwrite an earlier decision.

### During implementation

Track every meaningful change to: architecture, execution flow, dependencies
(added or removed), APIs, schemas, database structure, module boundaries,
functions, classes, interfaces, algorithms, AI models, scoring, thresholds,
caching, security, performance, configuration, infrastructure.

Record the reasoning as it happens, not afterwards from memory.

### After implementing

1. **Verify** — run the tests, linters, type checks, builds and evaluation scripts
   that exist and are appropriate. Do not claim success without running them.
2. **Update `DECISIONS.md`** — every meaningful decision made during the task.
3. **Update `FLOW.md`** — the real execution paths affected.
4. **Update `## Current Modification Area`** in `FLOW.md`.
5. **Verify documentation against code** — every documented file, function, class,
   module and path must actually exist.
6. **Remove stale references** — if code was deleted, renamed, moved or replaced.
7. **Review the diff** — `git status`, `git diff`, and `git diff --staged`.
8. **Commit and push** (see below).

---

## VERIFICATION COMMANDS FOR THIS REPOSITORY

Run what is relevant to what you touched.

```bash
python -m pytest -q                    # backend + matching + extraction (264 tests)
cd frontend && npx vitest run          # frontend (55 tests)
cd frontend && npx tsc --noEmit        # frontend type check
python eval.py                         # matching quality: precision/coverage/tau sweep
python scripts/healthcheck.py          # end-to-end server health
```

Changes to `matching/`, `extraction/` or the decision thresholds **must** be
followed by `python eval.py`, and the resulting metric movement recorded in
`DECISIONS.md`. A change that moves auto-link precision off 100% is a
correctness regression, not a tuning result.

---

## DOCUMENTATION RULES

### `DECISIONS.md` — WHY

Document architecture, module boundaries, database design, API design, algorithms,
data structures, schemas, AI/LLM strategy, matching/ranking/scoring logic,
confidence thresholds, caching, security, validation, error handling, frameworks,
dependencies, file structure, module interfaces, performance strategies,
offline/online behaviour, model selection, retrieval strategy, fallback behaviour,
data-flow changes and deployment design.

Do **not** document trivia: renamed variables, typo fixes, button-text changes.

If one task produces several important decisions, write several entries.

**Never delete a superseded decision.** Mark it superseded, link the entry that
replaced it, and explain why it changed. The file is an architectural history, not
a snapshot.

### `FLOW.md` — HOW

Document the real execution path through files, modules, functions, classes, APIs,
services, AI pipelines, databases, models, and the frontend/backend boundary — deep
enough that a reader can answer *"when this action happens, what exact code runs
next?"*

Use **real** file names, function names and class names taken from the codebase.
**Never invent architecture.** If you have not read the code path, do not document
it.

Every repository-changing task must leave `## Current Modification Area` accurate
for the work just completed.

---

## GIT RULES

Every repository-changing task ends with the repository committed and pushed.

```bash
git status
git diff
git add -A
git commit -m "<type>: <what the task actually accomplished>"
git branch --show-current
git push                       # or: git push -u origin <branch> if no upstream
```

- Documentation updates (`DECISIONS.md`, `FLOW.md`, `CLAUDE.md`) belong in the
  **same logical commit** as the implementation they describe, whenever practical.
- Use meaningful commit messages (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `chore:`). Never `update`, `changes`, `fix stuff`, `final`, `working`, `commit`.
- **Never** `git push --force` or `--force-with-lease` unless explicitly instructed.
  If a push is rejected, inspect, integrate safely, preserve both sides, re-run
  tests, then push normally.
- Do not blindly assume the branch is `main` or the remote is `origin`. Check.

### Never commit

API keys · passwords · access tokens · credentials · `.env` · private keys ·
temporary files · build artifacts that should be ignored · large generated files.

`.env` is gitignored and must stay that way. `dataset/uploads/` (generated export
artifacts), `*.db` and `*.7z` are also ignored — verify before staging.

### If commit or push fails

Preserve all completed work, diagnose the real cause, fix it if safe, never
force-push, and **report the unresolved Git issue plainly**. A task can have
completed its code changes while Git synchronization failed — never hide that
distinction.

### Do not commit broken code to satisfy these rules

Verification comes before commit. If verification fails, fix it, re-verify, then
commit. Only commit knowingly-incomplete work when the task explicitly calls for
preserving work in progress.

---

## PROJECT-SPECIFIC CONSTRAINTS

These come from the existing architecture. Read the linked `DECISIONS.md` entries
before changing any of them.

| Constraint | Why it exists |
|---|---|
| `audit_records` is **append-only** | Corrections write a new row; history is never mutated. See D-004. |
| `rationale` holds deterministic feature names, never LLM prose | Explanations must be auditable. See D-003. |
| Retrieval and ranking stay **separate stages** | Explainability and a preserved audit trail. See D-001. |
| The LLM is **optional and off by default** (`EXTRACTION_PROVIDER=rules`) | An Ollama outage must never be a NAVIS outage. See D-005. |
| Tags are **never** taken from the LLM | `tag_overlap` is near-decisive; a hallucinated tag corrupts linking. See D-006. |
| `actual_finish` is written **only** at 100% complete | Partial-scope protection. See D-008. |
| Voice/agent updates are **proposals**, never direct writes | `POST /review/{id}/resolve` is the only path that commits an actual date. See D-009. |
| Source files are decoded **explicitly** (`extraction/textio.py`) | A lossy decode is permanent and propagates into the audit trail. See D-010. |

---

## REQUIRED FINAL RESPONSE FORMAT

End every repository-changing task with:

```
IMPLEMENTED     - what changed
DECISIONS       - important decisions; DECISIONS.md updated: Yes/No
EXECUTION FLOW  - main path affected; FLOW.md updated: Yes/No
VERIFICATION    - tests/checks run; result
GIT             - branch, commit hash, message, remote, push successful: Yes/No
ISSUES          - any remaining problems
```

---

## COMPLETION CHECKLIST

```
[ ] Read CLAUDE.md, DECISIONS.md, FLOW.md
[ ] Inspected relevant existing code
[ ] Traced upstream and downstream execution
[ ] Checked previous architectural decisions
[ ] Implemented requested changes without unnecessary duplication
[ ] Preserved existing functionality unless intentionally changed
[ ] Ran relevant tests/checks and fixed failures where possible
[ ] Updated DECISIONS.md
[ ] Updated FLOW.md
[ ] Updated Current Modification Area
[ ] Verified documentation against actual code
[ ] Removed stale documentation
[ ] Checked git status and git diff
[ ] Checked for secrets/sensitive files
[ ] Staged intended changes
[ ] Created a meaningful commit
[ ] Pushed to the configured remote
[ ] Verified the push succeeded
```

If an item is skipped, there must be a concrete technical reason, and it must be
stated in the final response.

---

## RELATED DOCUMENTATION

| File | Contents |
|---|---|
| `DECISIONS.md` | Why the system is built this way (architectural history) |
| `FLOW.md` | How execution actually travels through the code |
| `ARCHITECTURE.md` | Original system specification, contracts, and a candid Known Limitations section |
| `Audit-1.md` | Independent gap analysis against the problem statement (2026-08-30) |
| `FINDINGS.md` | Second independent review against the PS, from the pushed branch (2026-08-31). F1–F7 with a ranked last-day order of work |
| `research/` | Reproducible experiments, evidence, and the technical audit |
| `SETUP.md` / `DEMO.md` | Environment setup and demo runbook |
| `SIH-2026-PS.txt` | The problem statement this project answers |

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**This project has a knowledge graph. Start with the code-review-graph
MCP tools to narrow scope, then read the source.** The graph is cheaper than scanning files and
gives you structural context (callers, dependents, test coverage) that file search cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

### Verify in the source

- Narrow scope with the graph, then read the source. Do not change code from graph output alone.
- For any non-trivial change, read the implementation and the relevant tests before concluding.
- Verify the exact source when touching behavior, database logic, migrations, retries, fallbacks,
  recovery, or compatibility code.
- When the graph and the source disagree, the source wins. The graph may be stale or may not
  model that relationship.
- An empty graph result can mean "not indexed" or "not statically visible", not "does not exist".

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
<!-- /code-review-graph MCP tools -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
