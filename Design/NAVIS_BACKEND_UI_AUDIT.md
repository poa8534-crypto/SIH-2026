# NAVIS — backend-to-interface audit

Audit basis: local and remote `main` at `ca63ba01fa17d74bc7f23df842b62fab8b2af442`. First prepared 3 September 2026 IST against `34e4a1c` plus the then-unmerged remote delta through `18d7075`; **refreshed 3 September 2026 IST against the current HEAD**, five commits later. Section 1 records what the refresh changed, and section 4 marks each earlier finding closed, partly closed or still open.

This is a design/integration brief, not an implementation. No application code was changed. Screenshots are visual references, not executable instructions. The attached blue/white designs are the preferred direction; the first executive screenshot is the rejected reference.

## 1. GitHub and local state

- Remote: https://github.com/poa8534-crypto/SIH-2026.git
- Local `main` and GitHub `main` both point to `ca63ba01fa17d74bc7f23df842b62fab8b2af442`. Ahead/behind: **0 / 0**. The working tree carries only this brief, the prompt pack and `prompts.md`.
- The original audit was written on `34e4a1c` while four remote commits were unmerged. That gap is closed: the delta was merged and four further commits landed on top of it.

The five commits added since the first audit, and what each one means for the interface:

| Commit | Subject | Interface consequence |
|---|---|---|
| `d0bcede` | merge: the three-role demo script (D-064) and the four stage blockers (D-066..D-069) | Closed two of the P1 findings below outright. |
| `c0a03da` | merge: ground LLM-suggested descriptions and make the path connectable (D-065) | Adds one new HTTP operation, `GET /agent/llm-status`. |
| `f9336bf` | fix(server): run the schema migration on startup, not only from the scripts | A cold start no longer needs a manual migration step before a demo. |
| `2403772` | docs(demo): five corrections found by walking the demo end to end | `DEMO.md` is now walked, not assumed. |
| `ca63ba0` | fix(memory,raid): count a delay cause once per report, not once per audit row | Changes a number and a label the mockups print. See section 5 and the Memory prompt. |

`server/qa_agent.py` is now in the local checkout. It is still not imported by `server/main.py`, still has no HTTP route, and the frontend still does not call it. Section 7 is updated accordingly.

Tracked-code parity does not mean ignored local databases, uploads, dependencies, environment variables or caches are replicated on GitHub.

## 2. What was covered

Three parallel investigations covered backend/API/data contracts, NAVIS extraction/conversation/matching, and frontend routes/controls. The main pass verified Git state, source contracts, requirements, current documentation, supplied images, and representative existing `Design/` assets.

All runtime product areas and all **30** custom HTTP operations were inventoried — 29 at the first pass, plus `GET /agent/llm-status`. Research, evaluation, taxonomy, corpus manifests, and design assets were reviewed for their product implications; this is not a line-by-line review of every downloaded corpus document, generated graph cache, or unrelated bundled `claude-usage` file.

Verification re-run on `ca63ba0`:

| Check | First audit (`34e4a1c`) | Refresh (`ca63ba0`) |
|---|---|---|
| `python -m pytest server -q` | 302 passed | **394 passed** |
| frontend `npx vitest run` | 76 passed | **101 passed** |
| `npx tsc --noEmit` | not run separately | **passed** |
| frontend build | passed | **passed** |
| code graph, indexed files | 320 | **334** |

Passing tests still do not establish that every current control works. The integration mismatches in section 4 that are marked open pass the suite today, because no test asserts the frontend's request body against the backend's accepted actions.

Some README/DEMO/FLOW descriptions predate the latest backend merges. In particular, claims that RAID, EVM, notifications, or PMXML/XER import do not exist are stale. Current source and tests take precedence. The alias-loop commit does not turn learning on: it records why exact-text alias retrieval remains deliberately disabled after measurement.

## 3. Product definition

NAVIS is an evidence-backed bridge from field reports to schedule actuals. Its distinctive interface should make this chain visible:

**Report → Extract facts → Match to planned activity → Review uncertainty → Record actuals with provenance → Explain outcomes and learn from execution.**

There are two different write paths. Do not blur them:

1. **Document ingest:** confident, eligible events can automatically update actuals; uncertain/new-scope/defaulted-finish cases enter review.
2. **Field conversational agent:** even a high-confidence proposed match goes to planner review after the supervisor confirms. Chat submission itself never updates schedule actuals.

The LLM is an optional interpreter, off by default. Activity selection and confidence are produced by the matching engine, not by the LLM. The assistant must not claim to calculate schedule metrics or autonomously approve anything.

## 4. Priority defects and missing connections

Every row was re-checked against `ca63ba0`. **Status** says what the refresh found; line numbers are current.

| Priority | Status | Finding | Design/integration consequence | Source |
|---|---|---|---|---|
| P0 | **Open** | Selecting an alternative candidate still sends `confirm`; the server's `confirm` branch takes `item.activity_id` and never reads the supplied `activity_id`, so the original suggestion is committed. | Alternate selection must send `reassign` with `activity_id`. The confirmation dialog must name the actual target. | [Reconcile](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/Reconcile.tsx#L331), [server](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/main.py#L1474) |
| P0 | **Open** | New activity sends `new_activity` with only `new_description`; the backend accepts `create` and requires both `new_activity_id` and `new_description`. Any other action string is a 400. | New-work form must collect ID and description and use the real action. | [Reconcile](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/Reconcile.tsx#L348), [server](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/main.py#L1558) |
| P0 | **Open** | General reject sends `reject`; normal backend reviews accept `ignore`, and the final `else` rejects anything else with `Unknown action`. | UI may say "Reject proposal," but send `ignore`. The special withheld-finish path separately normalizes reject. | [Reconcile](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/Reconcile.tsx#L368), [server](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/main.py#L1612) |
| P1 | **Partly closed** | The executive Overview now shows a red banner naming the unevidenced-activity count and why SPI understates progress — but it keys on `percent_source_counts.no_evidence_floor > 0`, not on the server's own guard, and SPI is still the first figure. The frontend type still declares `headline_safe` / `headline_warning`; the server sends `spi_headline_safe` / `spi_headline_reason`, and `evidence_coverage` and `evidenced_subset` are still absent from the type. | Rename the type fields to the wire names, add the two missing objects, key the banner on `spi_headline_safe`, and lead with coverage and evidenced-subset SPI when the guard is false. | [EVM contract](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/evm.py#L259), [type](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/types.ts#L466), [UI](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/executive/Overview.tsx#L102) |
| P1 | **Open** | Structured field-card pencils still call `editRow`, but populated slots are not overwritten by the backend. | Do not retain deceptive pencil controls. Transcript editing before sending works. A "Revise report" flow can start a new session with editable text; in-session slot editing needs an explicit patch/reset contract. | [field editing](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/Field.tsx#L150), [slot fill](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/main.py#L3561) |
| P1 | **Closed** (`d0bcede`) | Role and device mode were conflated, and a narrow viewport forced planner/executive into field routes. The Force Mobile View control is gone; a comment at `App.tsx` L131 records where it was and why. | Keep it out of the mockups. Role chooses capabilities; viewport only changes layout. | [App](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/App.tsx#L131) |
| P1 | **Closed** (`d0bcede`) | Field "Return to role selection" only set a desktop override, which could not override the field-role branch. It now calls `signOut`, clears `navis.role` and shows the picker. | Draw it as a real exit to the role picker. | [Profile](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/FieldProfile.tsx#L118) |
| P1 | **Open** | Planner RAID, baseline import, field outcomes, and vocabulary are still not fully exposed. | Add purposeful pages/panels backed by the operations below. | [API client](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/lib/api.ts) |
| P2 | **Open** | Executive root navigation still uses `location.pathname.startsWith(item.path)`, so Overview stays active on Exposure/Data. | Exactly one active destination; root routes require exact matching. | [App](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/App.tsx#L103) |
| P2 | **Open** | Planner asks a question and field can answer, but the planner review page still only posts the question — it never reads the reply back. | Join `/field/clarifications` by review-item ID, or extend the review projection, and render the full question/answer before resolution. | [ask](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/frontend/src/pages/Reconcile.tsx#L295), [clarifications API](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/main.py#L2923) |

## 5. Complete operation-to-purpose map

“Ready” means implemented in backend source, not necessarily wired in the current frontend.

| Operation | UI purpose / controls | Important boundary |
|---|---|---|
| `POST /ingest` | Browse/drop report; ingest selected file | TXT/MD/LOG/XLSX. Offer TXT/XLSX as primary demo formats. No CSV/PDF/photo/audio. Confident actuals may be written during ingest. |
| `GET /jobs?limit=` | Ingest history; select earlier job | Count is jobs, not activities. |
| `GET /jobs/{job_id}` | Job result, extracted events, evidence, match reasoning | Real status/counts; no invented live streaming/progress percentage. |
| `GET /review-queue?status=&priority=` | Review inbox; priority/status filters | Frontend discipline/search filters may operate locally. |
| `POST /review/{item_id}/resolve` | Confirm, reassign, create new activity, reject/ignore | Correct actions: `confirm`, `reassign`, `create`, `ignore`. No arbitrary structured-field editing endpoint. |
| `POST /review/{item_id}/clarify` | Ask supervisor | Question is persisted; item remains pending. |
| `GET /schedule?discipline=&include_warnings=` | Schedule table/timeline, search, warnings, baseline summary | Search/sort/view selection are local controls. Dates and actuals are not directly editable here. |
| `GET /schedule/{activity_id}/audit` | Activity inspector and source trail | Append-only history; no undo/delete. |
| `GET /schedule/conflicts?limit=` | Conflicts list; compare both sources | No dedicated “choose source A/B” resolver. “View audit” is truthful; “Resolve” is not a direct operation. |
| `GET /audit/recent?limit=` | Recent changes feed; open affected activity | Preserve automatic vs planner-applied distinction. |
| `POST /schedule/import` | Baseline import validation and explicit replacement | Multipart file + `dry_run` + `replace` + optional note. JSON/PMXML/XER, not MPP. |
| `POST /schedule/export` | Export format, include-actuals, discipline scope | `pmxml` or `xer`; XER output is prototype/simplified, not guaranteed production P6 compatibility. |
| `GET /uploads/{filename}` | Download/re-download generated schedule export | This is not a general source-document download API. |
| `GET /evm` | Schedule performance snapshot | PV/EV/SV/SPI in duration-weighted work units, evidence coverage, evidenced subset. No costs, trend history, or forecast. |
| `GET /field/notifications?limit=` | “What changed” outcome feed | No read/unread or push subscription. No notification preference endpoint. |
| `GET /raid?kind=&status=&activity_id=` | RAID register filters and exposure ranking | Risk/issue/action/decision; open/mitigating/closed/rejected. |
| `GET /raid/candidates?limit=` | Proposed RAID findings for human review | Read-only deterministic evidence proposals; not autonomous LLM decisions. |
| `GET /raid/{item_id}` | RAID detail and available source evidence | Evidence can legitimately be absent. |
| `POST /raid` | Add manual item or accept a reviewed candidate | Exposure is computed by server from probability × impact days. |
| `PATCH /raid/{item_id}` | Edit, assign owner/due date, update status, close | No delete; no rich risk→action→response relationship model or audit-history endpoint. |
| `GET /field/reports` | Submitted field reports and planner status | Prototype field scope is all agent-origin reports, not authenticated per-person ownership. |
| `GET /field/clarifications?unanswered_only=` | Questions inbox and previous replies | Join with planner review to close the loop. |
| `POST /field/clarifications/{item_id}/respond` | Send one answer | First answer wins; does not approve the report or update schedule. |
| `GET /vocabulary/activity-types` | Optional terminology drawer/reference | Canonical vocabulary exists but is not wired into live matching. |
| `GET /vocabulary/resolve?description=&activity_id=` | Lookup canonical activity type | May return no match; not general semantic search or an LLM. |
| `GET /evidence/corpus` | Data-confidence/corpus-provenance page | Corpus manifests, validation, caveats. Not the live project's reporting coverage. Optional manifests can be unavailable. |
| `GET /memory/query?query_type=&activity_type=&discipline=` | Duration, discipline slip, delay causes, duration suggestion | Four historical query families; small samples must be shown. Not a cross-project knowledge base or general chat query. Since `ca63ba0` a delay cause is counted **once per field report**, not once per audit row, by the shared `server.raid.delay_evidence`; the panel is headed "Delay causes" and the count column is labelled **Reports**. Draw the label as "Reports", not "Occurrences", and expect single-digit counts. |
| `GET /agent/llm-status` | Optional-LLM health badge on a field/admin surface | Added in `c0a03da`. Read-only. Returns provider name, a reachability verdict and the timeout — never a key, base URL or model secret. `reachable` is null when the path is off, so "we did not look" cannot be drawn as "it works". A dead endpoint is `reachable: false` with a reason, not an error state. |
| `POST /agent/turn` | Field text/voice-transcript conversation; structured proposal; submit | Stateful progress-entry only. No general project Q&A, chat-history listing, streaming, attachment, or direct schedule write. |
| `POST /admin/reset?dpr_only=` | Developer-only demo maintenance | Destructive, gated by `NAVIS_ENABLE_RESET=1`. Keep out of normal role navigation. |

Source: [main route definitions](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/main.py#L993), [schemas](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/schemas.py), [database models](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/db.py). Thirty `@app` route decorators at `ca63ba0`, counted directly from `server/main.py`.

## 6. Roles and navigation to design

| Role | Destinations | Primary responsibility |
|---|---|---|
| Field Supervisor | Home, Report Progress, My Updates, Clarifications, Preferences | Describe reality, verify interpretation, answer questions, see outcomes. |
| Planner / Project Manager | Overview, Review Inbox, Schedule, Ingest, RAID, Project Memory | Reconcile evidence, commit permitted changes, manage exposure, inspect history. Baseline control lives under Schedule. |
| Senior Management | Overview, Exposure, Data Confidence | Read-only governance, exceptions, and the limits of the evidence. |

New names may map to current routes; adding a new frontend route does not require a new backend capability. Do not make a separate page for every endpoint. Outcomes fit in My Updates; vocabulary fits in a Memory/Help drawer; baseline import fits under Schedule.

No multi-project switcher. Project identity and data date come from `/schedule`; the prototype exposes one project context. Do not populate fake users/avatars/employee names as if authenticated.

## 7. The sidebar AI assistant: what is real and what must be added

The problem statement specifically asks for a conversational/voice **time agent for site supervisors**. The existing `/agent/turn` supports that bounded workflow. It should be a right-side dock on field desktop and a full-height conversational sheet on mobile, sharing the same report session as the main capture screen.

Current truthful controls: open/close, type, browser microphone, transcript review, speech-language preference, quick replies, structured proposal, start a new session, and “Send to planner review.” Match confidence must be labelled **schedule-link confidence**, not “LLM certainty.”

[QAAgent](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/qa_agent.py) is now merged into the local checkout. It accepts a question and a supplied project-data dictionary, selects deterministic facts about delays, duration, productivity, suggestions and EVM, optionally phrases them through an injected text-generation callable, and returns `answer`, `citations`, `grounded`, and `model_available`. It has no database handle and no write operation.

**Being local did not make it connected.** Re-checked at `ca63ba0`: `qa_agent` and `QAAgent` appear nowhere in `server/main.py` or `frontend/src/lib/api.ts`. No HTTP route assembles its data and the frontend does not call it. It does not inspect arbitrary activity audit, review evidence, or RAID records. Its citations are strings such as activity-type IDs, delay labels and `evm`, not typed document/line citations. Its EVM reader still expects a flat `spi` ([`qa_agent.py` L255](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/qa_agent.py#L255)) while `/evm` returns `project.spi`; the adapter must normalize this. It does read `spi_headline_safe` correctly and withholds SPI when the guard is false, so the adapter must pass that field through under its real name rather than the frontend type's `headline_safe`.

The optional LLM guard is still incomplete: [`_accept`](https://github.com/poa8534-crypto/SIH-2026/blob/ca63ba01fa17d74bc7f23df842b62fab8b2af442/server/qa_agent.py#L354) checks allowed numbers and withheld-SPI strings, but not factual prose or citation indices. A focused probe accepted unsupported prose and a `[999]` citation while returning `grounded=true`. The QA tests pass in the 394-test suite, but they do not cover this failure. **Start with deterministic QA responses; stronger semantic/citation validation is an integration gate before enabling optional generated phrasing.** Do not interpret `grounded=true` as a complete factual guarantee.

Separately, `c0a03da` made the optional path checkable from outside the process: `GET /agent/llm-status` reports whether the provider is configured and whether it answers. Use it for an honest "optional interpreter: off / on / unreachable" badge. It says nothing about `QAAgent`, which is a different module and still unmounted — do not let one green badge imply the other is wired.

The broader helping chatbot therefore needs a thin backend integration for those supported Q&A topics, and additional fact builders for wider audit/review/RAID questions. Reuse `QAAgent` rather than creating an unrelated second engine. Do not wire arbitrary questions to `/agent/turn`; that route is the field-report workflow.

Proposed HTTP adapter contract (not present in local or remote routes today):

```text
POST /assistant/turn
request:
  session_id?, message,
  context: {role, route, project_id?, data_date?, activity_id?, review_item_id?, raid_item_id?}
response:
  session_id, answer,
  citations: [{type, id, label, source_file?, line?, row?}],
  suggested_actions: [{label, action_type, target, requires_confirmation}],
  limitations: []
```

The first implementation should assemble Memory and EVM data for the existing `QAAgent`, normalize field shapes, and map known citation strings to real UI destinations. Wider schedule/audit/RAID support can then use explicit fact builders or an allowlisted read layer. Use server-computed numbers and never silently approve or write. In the current no-auth prototype, the role is presentation context, not a security boundary. Production requires server-side identity and authorization before trusting role-based tool access.

Supported first intents after the adapter: explain recurring delay observations; compare activity-type durations; summarize discipline productivity; retrieve duration suggestions with sample size; explain evidence-limited EVM. Selected activity audit, review reasoning, and RAID questions require extending the supplied facts. An action suggestion navigates to the actual form or prepares a draft; a human explicitly confirms the real operation.

Design this helper now as a clearly labelled integration-required variant. Until that HTTP/data adapter exists, the planner/executive rail can offer **guided navigation and deterministic explanations**, but it must not impersonate a functioning free-form AI chatbot. The optional generator is an injected callable; a live model client is not wired merely by the module existing.

## 8. Capability guardrails for the mockups

- Remove the top-right Planner/Field toggle, Force Mobile/Desktop controls, and any viewport-driven role change. The application already did this in `d0bcede`; a mockup that reintroduces them is a regression, not a proposal.
- Replace the credential form with an honest demo role picker. No working-looking password, Forgot Password, Remember Me, SSO, or “secured by RBAC” claim without auth implementation.
- Remove Add Photo/camera/OCR, audio upload, offline sync, queued-offline claims, and attachment controls. Browser speech produces text; it is not stored audio and may depend on the browser/vendor's service.
- Do not imply multilingual backend understanding is equally validated merely because three browser speech languages are selectable.
- Remove global search/settings/support buttons unless their exact local panel or destination is specified. A page-local filter is fine.
- No live Primavera connection, MPP import, cost KPIs, historical SPI trend, S-curve, predictive finish, board-pack export, or portfolio comparison.
- Do not show “learning improved” after correction: aliases are stored but not loaded into the live matcher.
- A delay cause counts **once per field report**, not once per database write. One spreadsheet row can write a start, a finish and a quantity, and that is one piece of evidence. Label the column “Reports”, expect single-digit counts on the demo dataset, and do not inflate them to look busier.
- No “commit validated” after document ingest: eligible actuals may already have been written. Show the result and the remaining review queue.
- No “conflict resolved” just because the audit drawer opened.
- No “all data discarded” when closing a conversation: conversation turns persist; cancel only abandons the client session/proposal.
- No time-of-day actual-start/finish precision that the date-based contract does not preserve.
- The field agent currently has one work-date slot, persisted as `reported_date`, not separately asserted start/finish dates with basis. Label it “Reported work date.” Its current-session location/planned quantity are not fully retained in report history; do not invent them on historical cards. Context changes should start a new session rather than pretending to overwrite filled slots.
- Importing a new baseline can create a matcher-baseline mismatch: the live matcher remains pinned to the configured v1 baseline. Show this warning prominently; do not claim an imported schedule is immediately safe for matching.
- Dates without evidence remain unknown; absent risk scores remain “Not scored”; missing source positions remain “No exact line supplied.” Never substitute zero or a made-up citation.

## 9. Demo-critical acceptance checklist

1. Role selection changes role; resizing never changes role. Exactly one nav item is active.
2. Text and voice-transcript paths reach the same field proposal; microphone failure falls back to typing.
3. No field schedule write occurs on submit; a real pending review item appears.
4. Planner can ask, field can answer, and planner sees the answer before deciding.
5. Confirm and alternate reassignment update the intended activity; create and reject use valid actions.
6. Every mutation has pending, success, failure, and retry behavior; failed requests never show success or clear data.
7. The activity audit proves the applied field, old/new values, source, and automatic/planner distinction.
8. Outcome feed shows the approved field submission's effect without inventing unread state.
9. Ingest duplicate, unsupported-file, extraction-error, and zero-event states are distinct.
10. Baseline preview and commit are separate, explicit operations; drift warning is preserved.
11. RAID candidates remain proposals until POST; risk exposure is server-computed.
12. EVM honors `spi_headline_safe`, coverage, and evidenced subset; absent cost metrics are not fabricated.
13. Memory displays completed sample counts and insufficient-data states.
14. Executive controls are read-only in presentation; no claim of backend RBAC.
15. The global helper is only enabled after its real read/citation/action contract is implemented.
16. Delay-cause counts on the Memory panel and the RAID candidate list agree, because both read the same counter. If they disagree, the screen is drawn against stale behaviour.

Use [`prompts.md`](../prompts.md) for the copy-paste design sequence, starting at Prompt 01. `NAVIS_STITCH_PROMPTS.md` is the superseded, longer pack, retained as an implementation reference only.
