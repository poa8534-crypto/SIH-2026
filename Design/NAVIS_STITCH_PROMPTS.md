# NAVIS — copy-paste Stitch prompt pack

> Superseded for screen generation: use [the rewritten prompts.md](../prompts.md), starting with Prompt 01. This older, detailed pack is retained as an implementation/state reference; do not paste it wholesale into Stitch.

Basis refreshed to `ca63ba01fa17d74bc7f23df842b62fab8b2af442`, where local and remote `main` agree. Originally written against `34e4a1c` plus an unmerged remote delta; that delta is now merged, so the "remote-only" wording below has been corrected. Read `NAVIS_BACKEND_UI_AUDIT.md` for evidence, the API mapping, and which integration defects are still open.

## How to use this pack

1. Use one Stitch project for the whole product. Attach your preferred login, design-system, and Report Progress images. Do not use the rejected executive screenshot as a style target.
2. Paste **Prompt 0** first. Then paste the page prompts one at a time, retaining the same design system and components.
3. Start with Field Report, Planner Review, and Schedule/Audit. These three must visibly belong to one workflow. Then design supporting pages.
4. API descriptions below are implementation annotations, not text to print inside the product UI. Stitch is designing screens; it does not make these endpoints connected by drawing them.
5. Prompts 1–15 are grounded in existing backend capabilities, though several need new frontend wiring. Prompt 16 reuses the `QAAgent` core in `server/qa_agent.py` — now merged locally, but still unmounted: no route imports it — and explicitly requires **HTTP/data/client integration**. Broader audit/review/RAID questions need added fact support. Do not present the drawn chatbot as already connected.
6. Ask Stitch for desktop and mobile frames, plus the named important states. Do not accept a single beautiful happy-path screenshot as a complete flow.

## Prompt 0 — master direction and shared components

```text
Design NAVIS, an evidence-backed construction progress intelligence application for Oil India Limited. This is a working-tool interface for field supervisors, planners/project managers, and senior management—not a SaaS marketing dashboard.

Use the attached blue/white NAVIS login, design-system, and Report Progress references as the visual direction. Preserve their clean engineering character but improve hierarchy, readability, density, and consistency. Do not copy the rejected executive screenshot.

DESIGN THESIS
“Field reality, verified against the plan.” Make the chain Report → Evidence → Schedule activity → Human decision → Recorded outcome visible. The signature visual element is an evidence-to-activity connection, not a grid of generic KPI cards. Each page answers one question and has one primary action. Use strong typography, compact contextual metadata, disciplined tables, and clear source links.

VISUAL SYSTEM
- Primary #2563EB; deep ink #111827; secondary slate #64748B; warning/burnt orange #BC4B00; canvas #F7F8FC; white working surfaces; pale blue #E8F0FF selection; subtle #D9E1EC dividers.
- Inter for headings and body. Use a restrained technical monospace only for activity IDs, dates, quantities, hashes, and source positions. Do not set every label in widely spaced uppercase monospace.
- Desktop body 14–16px, mobile body 16px, metadata at least 12px. Clear 28–32px page title and 18–20px section hierarchy.
- 4px spacing rhythm; desktop padding 24px, mobile 16px. Controls 40px minimum desktop, 44–48px mobile. Small 6–8px radii; larger panels at most 10px.
- Flat surfaces, thin outlines, quiet tonal grouping. No gradients, glassmorphism, neon, cartoon robot, giant floating cards, or gratuitous construction photography.
- Blue check + label for completed/confirmed, amber for uncertainty or review, red only for actionable failure/critical exception. Unknown is neutral—not red, not zero. Color never carries meaning alone.
- Give tables and evidence text room. Avoid oversized empty panels and repetitive four-card dashboard layouts.

SHARED SHELL
Desktop reference width 1440px: approximately 232px left navigation, 64px top bar, fluid working area. Right-side NAVIS assistant is collapsible, approximately 360–400px wide. On dense planner pages it opens as a drawer rather than crushing the work area. Show both open and closed variants where requested. Mobile reference width 390px: role-appropriate navigation; assistant opens full-height; sticky bottom actions must not cover content or the keyboard.

Top bar contains real project identity, project data date, current role, and the page title/context. Treat project identity as a label, not a multi-project dropdown. Keep utility controls minimal. No decorative search, gear, bell, or globe: add one only where a later prompt defines exactly what it does.

Remove the top-right Planner/Field toggle completely. Remove Force Mobile View and Force Desktop View. Role determines permissions/navigation; viewport changes layout only. A planner remains a planner on a phone. Put “Change demo role” in the role/preferences menu, returning to the role picker. Exactly one navigation item is active.

NAVIGATION
Field: Home, Report Progress, My Updates, Clarifications, Preferences.
Planner / Project Manager: Overview, Review Inbox, Schedule, Ingest, RAID, Project Memory.
Senior Management: Overview, Exposure, Data Confidence.
Use “Planner / Project Manager” consistently in the role picker; “Planner” in compact operational copy. Do not alternate with Planning Engineer or invent Admin.

FUNCTIONAL TRUTH
This prototype has local role selection, not real authentication or RBAC. It has one project, not a portfolio. No photo/PDF/OCR/audio-file upload, offline sync, live Primavera connection, cost KPIs, predictive finish, or historical SPI series. No pretend employee identity. No empty Settings/Support pages.

Every visible control must have a specified route, existing API action, or meaningful local-state transition. No button that only looks functional. Use explicit disabled/loading/error/empty states. Never show zero/“all clear” when the API is unavailable.

Create the reusable component foundation and three role-shell reference frames first. Include buttons, inputs, local filters, data table, source citation, match-confidence badge with a reason, unknown-value label, evidence panel, audit timeline, drawer, confirmation dialog, inline validation, and API failure panel. Do not generate all pages until I send the page prompts.
```

## Prompt 1 — entry / demo role selection

```text
Continue the NAVIS design system. Design the entry page in desktop 1440px and mobile 390px.

Keep the calm split composition of my login reference: NAVIS identity, one concise product statement, a very subtle engineering-grid/linework motif, and a focused entry panel. Make it feel deliberately designed, not a stock auth template.

However, this backend has no authentication. Replace email/password, Forgot Password, Remember Me, SSO, and “secured by RBAC” with a transparent “Choose your demo workspace” experience.

Three selectable role cards:
1. Field Supervisor — “Report site progress and answer planner questions.”
2. Planner / Project Manager — “Verify evidence, reconcile updates, and manage the schedule.”
3. Senior Management — “Understand schedule exposure and the strength of the evidence.”

Selecting a card highlights it; “Enter workspace” stores the chosen role locally and opens that role’s home. Include a quiet note: “Prototype access profiles. Role selection is not authentication.” Do not add an Admin role or fake software version.

On mobile, retain all three roles, not just Demo Admin/Demo User. Design default, selected, and storage-unavailable-but-session-still-works states. There is no network sign-in spinner because no authentication request occurs.
```

## Prompt 2 — field home and Report Progress, with side agent

```text
Continue NAVIS. Design Field Home and Report Progress for desktop and mobile, using my Report Progress reference as the main visual anchor.

FIELD HOME
Question: “What do I need to report or respond to?”
Lead with a compact project/work-front context and a strong “Report progress” action, not management KPIs. Below: unanswered planner questions, recent submissions, and “What your reports changed.” Recent rows open their report details; do not style inert rows as clickable. Use real role labels, not fabricated authenticated names.

REPORT PROGRESS — DESKTOP
Use a two-part working layout: main report/structured-evidence workspace on the left; NAVIS “Field Update Assistant” docked on the right. This is one shared session, not duplicate conversations. The main area starts with “What happened on site?” and editable text. The assistant helps collect missing facts and explains the next step.

Context strip: project, work front/location, discipline, and project data date. Work-front and discipline edits are local context sent when starting a new conversation. If changed after slots are populated, explicitly start a new session rather than pretending existing slots were overwritten. Never present these as saved assignments to a user account.

Primary actions: Type update, Record voice, and Send update for analysis. Remove Add Photo, Camera, Upload Audio, and Offline Sync. Bulk TXT/XLSX upload belongs in planner Ingest because that path can automatically apply confident actuals; it is not equivalent to field proposal submission.

The assistant accepts a text message through POST /agent/turn, with session_id and structured context. It asks one missing detail at a time. Use closed-set chips only for backend-supplied discipline/status choices. Show collected facts without pretending the AI chose the schedule activity; matching comes from the real matcher.

When ready, show “NAVIS understood” with description, discipline, location if available in current session, status, “Reported work date,” completed/planned quantity and unit, proposed activity ID/description, schedule-link confidence, and outcome. The agent has one date slot, not independently asserted start/finish fields. Missing values read “Not supplied” or “Planner review needed.” Do not invent time-of-day precision.

Primary final action: “Send to planner review.” It calls /agent/turn with confirm=true. Copy beneath: “The schedule changes only after planner review.” Even a high-confidence match follows this rule.

Do not use the current broken pencil controls to edit already-filled server slots. Offer “Revise report” as an explicit new-session flow with editable text before resending, or annotate field-by-field editing as requiring a slot-edit backend contract. Never silently claim a correction succeeded.

MOBILE
Home prioritizes a large microphone action and an equally accessible text option. Report Progress becomes a full-height conversation with a collapsible context strip and a structured-review sheet. Bottom navigation: Home, Report, Updates, Questions, More. Preserve safe areas and visible submit actions.

Design states: empty capture, typed report, assistant asking a missing question, ready-to-review, structured proposal, submitting, submitted with report/review reference, and “not a progress report” refusal. The success message says “Sent for planner review,” not “Schedule updated.”
```

## Prompt 3 — field voice and failure-state suite

```text
Continue the same Field Update Assistant. Create a coherent state sheet, desktop dock and mobile full-height variants, for the following exact flow:

Idle → Listening → Editable transcript review → Assistant questions → Structured proposal → Submitting → Submitted.

Listening shows an active microphone indicator, elapsed recording/listening time, live transcript, Stop, and Cancel. Voice uses the browser speech recognizer and only text reaches NAVIS. Do not display an audio attachment/player or promise fully offline speech.

Transcript review must be a real step before sending. Show an editable transcript with technical tags clearly legible; actions “Use transcript” and “Record again.” Never auto-submit an unreviewed speech transcript.

Speech-language options are English, Hindi, and Assamese. Label the control “Speech language”; it is not an app-wide translation switch or proof of equal extraction quality in all languages.

Required alternate states:
- Microphone permission denied / unsupported: calm message, typing becomes primary, no alarm-red screen.
- No speech detected: Record again or Type instead.
- API unavailable: preserve text visibly in the current page; Retry; explain it has not been submitted. Do not say saved offline or pending sync.
- Slow request: clear working state; prevent duplicate sends.
- Ambiguous match or no suitable match: keep the report and send it for planner review; do not manufacture a confident activity.
- Quantity exceeds planned: retain the reported number and show a warning, not a silently clamped value.
- Missing/invalid date: ask for clarification; label the current single date slot “Reported work date.” Separate asserted start/finish dates and date-basis controls require a backend enhancement and are not current field-agent fields.
- Closing an unfinished session: confirmation says “Leave this unfinished report?” It must not claim server conversation history is deleted.

Keep transitions visually quiet. The assistant is a precise field colleague, not a novelty chatbot. Generate consistent component states rather than unrelated page compositions.
```

## Prompt 4 — My Updates and approved-outcome feedback

```text
Continue NAVIS. Design Field “My Updates” in desktop and mobile, with report detail and outcome states.

Purpose: the supervisor can see what they submitted, what the planner needs, and what actually changed as a result.

Use two local tabs:
1. Submissions — GET /field/reports.
2. What changed — GET /field/notifications.

Submissions filters: All, In review, Needs response, Confirmed, Rejected/ignored where returned by the data. Search is a local filter over available report text/reference. Each row shows report reference, concise original report, submission date, proposed/confirmed activity if supplied, and explicit status. Clicking opens a detail drawer/sheet with original text, fields actually returned by /field/reports, current review status, and available clarification. Current history does not preserve the session location/planned-quantity details fully; do not invent them.

“Respond to question” opens the relevant clarification. “Report another update” opens Report Progress. Do not add edit/delete for already-submitted reports because there is no such endpoint.

What changed displays actual audit-derived outcomes: activity, field changed, old → new value, timestamp, planner-confirmed versus automatic, and early/late day movement only when supplied. Show “No approved changes yet” as distinct from “No submissions.” Link an outcome back to its report detail through linked_event_id.

No unread badge, Mark read, notification settings, or push controls. The backend has no per-user read state. Use “Recent outcomes,” not “5 unread notifications.” The prototype is a shared field-demo scope; do not imply authenticated personal privacy.

Include empty, loading, failed, populated, expanded-report, needs-response, and outcome-without-comparable-planned-date states. Use readable mobile rows instead of squeezing a desktop table onto a phone.
```

## Prompt 5 — Clarifications and field preferences

```text
Continue NAVIS. Design two small purposeful destinations: Clarifications and Preferences, desktop and mobile.

CLARIFICATIONS
Purpose: close the planner ↔ supervisor evidence loop.
GET /field/clarifications supplies questions. Tabs All / Needs response / Answered are filters. Each question card shows the report reference, original report excerpt, planner question, asked time, and status. The primary action is “Answer question.”

Answer supports typed text or browser speech followed by editable transcript review. POST /field/clarifications/{item_id}/respond sends the response. Show sending, server validation, retry, and answer-sent states. Once answered, render the response read-only because the backend accepts a first answer rather than an editable conversation thread.

Success copy: “Answer sent to the planner. Your report is still under review.” Never show “Schedule updated” or “Approved” on answering. Preserve a link to the related report. No invented message attachments, teammate mentions, or real-time chat presence.

PREFERENCES
Keep this deliberately small: current project/data date, current demo role, speech language English/Hindi/Assamese, optional local light/dark preference, Return home, and Change demo role. Change demo role clears the local role and opens the role picker; it must not merely force desktop layout.

No editable employee profile, password/account settings, crew roster, notification settings, sync dashboard, or claimed secure RBAC. Do not state browser speech never reaches a third-party service; its behavior depends on the browser implementation.
```

## Prompt 6 — planner overview / operational command page

```text
Continue NAVIS. Design Planner Overview. It should look like a disciplined project-control workbench, not the generic rejected dashboard.

Question: “What needs my decision, and what changed since I last looked?”

Compose a compact top summary band using real counts: activities in baseline, activities with actual dates, pending review items, and source conflicts. Do not display an evaluation precision percentage as a live operational KPI. Show project data date and active baseline identity in a quiet context strip.

Main hierarchy:
1. Needs your decision — the highest-priority/least-certain pending reports. Show source excerpt, discipline, reason for review, and proposed activity if present. “Review next” is the page's primary action and opens that exact item in Review Inbox.
2. Source disagreements — a compact comparison of two named field sources, the disputed field and values, and the currently stored value. Action is “View evidence,” opening the activity audit. Do not offer a fake direct “Resolve conflict” action.
3. Recent changes — combined audit and ingest feed, explicitly distinguishing automatic actual updates, planner decisions, and file ingests. Every row opens the relevant activity or ingest job.
4. A compact schedule-performance/evidence module may use GET /evm, but honor spi_headline_safe. If false, show evidence coverage and evidenced-subset SPI prominently, with the whole-project figure secondary and explained.

Data: GET /schedule, /review-queue, /schedule/conflicts, /audit/recent, /jobs, optionally /evm. Primary links: Review Inbox, Ingest report, Schedule. No global search, fake notifications bell, unsupported “Generate report,” or decorative quick actions.

Use asymmetric emphasis: a strong decision queue and slimmer evidence/activity rail. Avoid equal-height blank panels. Include loading, partial-API-failure, true queue-clear, and API-unavailable states. Queue-clear must only appear after a successful empty response.
```

## Prompt 7 — Review Inbox / evidence reconciliation

```text
Continue NAVIS. Design the most important planner screen: Review Inbox, with selected report, alternate candidate, new work, clarification, and success/error variants.

Question: “Does this source justify changing this activity?”

Desktop layout: compact review queue on the left and a wide evidence/decision workbench on the right. Preserve enough width for original text and candidate comparisons. On mobile use queue → detail navigation, not three crushed columns. The optional NAVIS helper opens as an overlay drawer.

QUEUE
Priority, discipline, review reason, confidence, concise source excerpt. Local search/discipline filters; backend status/priority filters. Keep selection stable during refresh. Count remaining items. Do not reorder the selected row under the user's pointer.

DETAIL ORDER
1. Source identity: filename, line or spreadsheet row, and report reference where supplied.
2. Original words, verbatim, with the extracted span highlighted only if the API supplies it. Missing source position is stated honestly.
3. What was extracted: discipline, tags, quantity/unit, status, asserted dates and date basis where available.
4. Why review is required: low confidence, close alternatives, new/unmatched work, or withheld finish date. Match rationale/margin appear only when present. Never synthesize missing candidate scores.
5. Candidate activities: activity ID, description, discipline, planned dates, quantity, and each available score. Strong but restrained selected state. Distinguish suggested from selected.
6. Before/after preview of the proposed affected fields using current schedule data. If the API cannot provide an exact final roll-up, label it “Proposed interpretation” rather than claiming an exact server diff.
7. Planner question and supervisor answer. Read the clarification endpoint and join by review-item ID, or annotate the required response projection. A received answer must be visible before the planner decides.

ACTION CONTRACTS — annotate for handoff, do not print API syntax in the UI:
- Confirm original suggestion → POST /review/{id}/resolve with action=confirm.
- Select another existing activity and apply → action=reassign plus activity_id.
- Create new activity → explicit dialog collecting new_activity_id and new_description, optional note; action=create. Explain prototype planning defaults; do not offer WBS/planned-date fields the endpoint cannot accept.
- Reject proposal → confirmation dialog, action=ignore. Evidence remains; schedule is not changed.
- Ask supervisor → question field, POST /review/{id}/clarify; item remains pending.

Special withheld-finish item: the activity match is already established. Show the unsupported/defaulted date and its basis. Offer only the appropriate confirm-date or leave-finish-unknown decision; do not show reassignment/new-activity controls for this case.

Sticky action bar names the target activity. No bulk approval or arbitrary field editing without a supporting contract. Keyboard hints must not trigger irreversible writes by accident. Success gives the actual result and “View activity audit.” Failures preserve selection and all input; no optimistic false success.
```

## Prompt 8 — Schedule, activity inspector, source conflicts, export

```text
Continue NAVIS. Design Schedule as a usable engineering table with a powerful activity inspector, desktop and mobile.

Question: “What does the plan say, what is actually evidenced, and why?”

Header: project data date, active baseline filename/format/activity count, and compact baseline status. Main actions: Import baseline and Export schedule. Baseline import is a deliberate workflow, not a casual upload button.

Filters: discipline (server query), local activity ID/description search, With actuals only, Has warnings only, reset filters. Table columns: activity ID, description/WBS, discipline, planned start/finish, actual start/finish, quantity/progress where available, start/finish variance, and link confidence. Use sticky identity columns and horizontal scrolling only for the table. Do not make the whole page horizontally scroll. Sorting may be a specified local sort, not inert clickable-looking headers.

Unknown actual dates show an em dash with “Not evidenced” on inspection. Inferred/defaulted dates carry an explicit marker. Percent complete is not interchangeable with an evidenced finish date. Do not allow inline editing of planned or actual fields: no direct edit endpoint exists.

Clicking a row opens an activity inspector with local tabs:
- Summary: plan versus actual, date basis, quantity/progress, predecessor links and warnings supplied by /schedule.
- Audit: GET /schedule/{activity_id}/audit; newest first, field, old → new, source file/line/row/span, confidence if present, and automatic versus planner-confirmed.
- Source conflicts: filter GET /schedule/conflicts for the activity; show both sources and stored value. This is inspection, not a fake A/B resolution tool.
- Related RAID: GET /raid?activity_id=...; link to the real RAID detail.

Only show source-download controls if an actual retrievable URL exists. The current /uploads route serves generated XML/XER exports, not arbitrary original reports. “View evidence” can show supplied source text; it must not promise a full source document that the API cannot fetch.

Export dialog: PMXML or XER, include actuals checkbox, all disciplines/current discipline scope. POST /schedule/export then download from returned URL. Show generating, failure, download-ready, and re-download. Add a quiet compatibility note that XER export is a simplified prototype format, not a certified live Primavera integration.

Optional local Table/Timeline toggle is allowed only if the timeline faithfully plots returned planned/actual dates. It is not a critical-path scheduler or forecast. Include filter-empty, API-error, audit-empty, source-missing, and baseline/matcher-drift warning states.
```

## Prompt 9 — report ingest and job history

```text
Continue NAVIS. Design Ingest for planners, with upload, result, event detail, and past-job states.

Question: “What did this file contribute, and what still needs review?”

A purposeful upload zone supports TXT/MD/LOG/XLSX; feature TXT and XLSX as the main demo formats. Explicitly exclude CSV, PDF, images, scanned diaries, and audio. Do not include camera/OCR buttons.

Before upload, explain: “Eligible high-confidence updates may be applied automatically; uncertain events are sent to review.” This is different from field chat, where all submissions require planner review.

Browse/drop selects a file; “Ingest report” sends multipart POST /ingest. Show filename/type/size and actual pending state. The backend request is not a streaming pipeline: do not invent percent-complete or pretend stage events are arriving live.

After GET /jobs/{job_id}, show a compact trace of actual outcomes: parsed file, extracted events, matched outcomes, activities updated/audit records where supplied. Events, links, and changed activities are different counts—label them precisely.

Event table: source line/row, original excerpt, discipline/tags, date/quantity where supplied, schedule-link confidence, outcome, and available rationale/margin. Clicking opens evidence details. Auto-linked activity opens Schedule inspector; review event opens its Review Inbox item; unmatched work goes to review rather than disappearing.

Primary post-ingest action: “Review uncertain items.” Do not add “Commit validated”—writes may already have occurred.

History from GET /jobs is selectable; selecting a job loads GET /jobs/{id}. Include duplicate-content state with an explanation, unsupported format, empty file, extraction failure, zero extracted events, completed with mixed outcomes, and server-unreachable retry. A duplicate is not a generic crash.
```

## Prompt 10 — controlled baseline import

```text
Continue NAVIS. Design a Baseline Control drawer/wizard launched from Schedule, with desktop and mobile variants.

Purpose: safely inspect and deliberately import a JSON, Primavera PMXML (.xml), or XER baseline. No MPP or live Primavera connection.

Step 1: choose file; show current active baseline identity and a note that replacement preserves actuals/audit and does not delete activities absent from the new file.
Step 2: Validate and preview → POST /schedule/import with dry_run=true. If an active baseline exists, the API requires replace=true even for this validation request; the UI must still explain that dry_run makes no committed schedule change. Show parse/validation errors and returned file activity count, dated activity information where supplied, overlap summary, format, and hash. Do not invent per-row preview data or projected changed counts the response does not contain.
Step 3: explicit confirmation, optional reason/note, then POST /schedule/import with dry_run=false and explicit replace=true when replacing. Show actual created/updated counts returned after commit.

Critical warning: the current live matcher is pinned to the configured demo baseline. Importing another baseline updates the schedule database but does not automatically rebuild/repoint that matcher. Design a prominent “Matching baseline differs” state and a safe instruction to resolve backend configuration before using new reports. Do not show “Ready for matching” merely because import succeeded.

Actions: Browse file, Validate, Back, Cancel, Import/Replace baseline. No delete baseline, restore version, edit schedule date, or automatic matcher-rebuild button without an endpoint. Destructive/meaningful replacement requires explicit confirmation and never happens on file drop.
```

## Prompt 11 — planner RAID workspace

```text
Continue NAVIS. Design a full planner RAID workspace. This is the highest-value missing screen because its backend already exists.

Question: “Which risks, issues, actions, and decisions need ownership?”

Use a dense register with purposeful local tabs All / Risks / Issues / Actions / Decisions, status filters Open / Mitigating / Closed / Rejected, and optional activity filter. GET /raid supports kind/status/activity_id. Show title, kind, status, owner, due date, linked activities, and risk exposure where applicable. Unscored exposure is “Not scored,” never 0.

Top actions: “Add item” and “Review suggested items.” The latter loads GET /raid/candidates. Suggested items are evidence-derived proposals, not committed records and not a magical LLM risk engine. Each shows supporting source, recurrence/impact information actually supplied, and “Review draft.”

Draft/detail drawer:
- kind, title, description, category;
- owner as a free-text field, not a fake user directory;
- status, raised/due/closed dates as supported;
- linked activity IDs selected from the schedule;
- risk-only probability and impact in days;
- computed exposure, read-only;
- available source evidence and source note.

“Add to register” uses POST /raid. Editing/status changes use PATCH /raid/{id}. Risk exposure is computed server-side from probability × impact days; show the saved result, not an AI-generated number. Closing is a status change, not deletion.

No Delete, Export RAID document, assign-notification, automatic mitigation, or risk→response graph: those capabilities do not exist. “Not now” may close a candidate drawer locally but must not claim a permanent dismissal. No confidence-based auto-accept.

Design empty register, candidates available, candidate review, saved detail, edit, close confirmation, unscored risk, overdue action (date-derived), missing source evidence, validation error, and API failure states. Keep governance decisions deliberate and readable.
```

## Prompt 12 — Project Memory and terminology reference

```text
Continue NAVIS. Design Project Memory as a practical evidence-based learning workspace, not a vague AI knowledge dashboard.

Question: “What does completed work tell us about planning the next similar activity?”

GET /memory/query supplies four real analyses:
1. Planned versus actual duration by activity type, including completed-of-total sample count.
2. Discipline slip/productivity summary using available completed work.
3. Recurring delay keywords/causes, occurrence counts and supplied days-lost measure.
4. Suggested duration for a selected activity type: planned median, actual median, P80 where returned, recommendation text, and actuals count.

Use one strong comparison table/chart and a focused recommendation panel. Avoid four anonymous KPI cards. All charts need units, labels, and a plain-language takeaway. Display small sample sizes adjacent to the number, not hidden in a tooltip. Fewer than enough completions must show “Insufficient completed evidence,” not a confident forecast. No completed work must not look like zero delay.

Controls: discipline filter; activity-type selector; local sorting; expandable metric explanation. A recommendation is read-only—no “Apply to schedule” button. This is current-project history, not a proven cross-project knowledge base. Delay categories are keyword-derived, not validated causal inference.

Optional “Activity terminology” drawer uses GET /vocabulary/activity-types and /vocabulary/resolve. It can list canonical types and resolve a supplied description/activity ID, with a no-match state. Label it as a reference; do not claim it is already driving the live matcher.

Include normal, no-completed-data, low-sample, no-suggestion, filter-empty, and API-error states. Retain the NAVIS visual system and source/sample honesty.
```

## Prompt 13 — executive overview with honest schedule performance

```text
Continue NAVIS. Design Senior Management Overview. Do not reproduce the rejected executive screenshot's generic cards, giant warning banner, raw-ID-heavy list, or Planner/Field toggle.

Question: “What can we confidently say about this project's schedule position?”

This role is read-only. It uses GET /evm, GET /schedule, GET /raid, and GET /schedule/conflicts. It does not approve reports or edit the plan.

Make evidence coverage a first-class part of performance, not a disclaimer underneath a misleading headline.
- If spi_headline_safe=true, show project SPI with its period/data-date context and coverage.
- If spi_headline_safe=false, headline evidenced_subset.spi, explicitly labelled “SPI of evidenced work,” alongside evidence_coverage fraction and activities-with-evidence/total. The whole-project SPI can appear in a secondary explanation panel, labelled as a reporting-floor calculation. Do not simply show it huge and red.
- Use the server's spi_headline_reason in a concise expandable explanation. Unknown SPI is “Not calculable,” not 0.

Layout: an editorial-style headline summary, a coverage/performance comparison, discipline breakdown with evidence counts, and a prioritized exceptions list. Use returned PV/EV/SV in duration-weighted work units only. Show recorded actual-finish variance as “Recorded finish slips,” not predicted finish dates.

Include a compact accepted-RAID exposure summary and source-disagreement count; each opens the read-only Exposure page. No fake historical trend, S-curve, CPI, cost savings, EAC, portfolio map, milestone forecast, or AI-calculated metric. This API is a snapshot, not a time series.

Use human activity descriptions first, technical IDs second. No review queue or approve button. Add subtle “As of project data date” context, especially for the demo's fixed date. Include thin-evidence, healthy-evidence, empty-data, and partial-service-failure variants.
```

## Prompt 14 — executive Exposure

```text
Continue NAVIS. Design Senior Management Exposure, desktop and mobile, read-only.

Question: “Where is intervention most likely to be needed?”

Use two meaningful sections or local tabs:
1. Accepted RAID register, using GET /raid; high exposure first, with filters by kind/status. Show title, accountable owner if supplied, due date, status, linked activity description, and risk exposure in days. Unscored is distinct from zero.
2. Source disagreements, using GET /schedule/conflicts; explain which field sources disagree and the stored value. This is a data-confidence exposure, not automatically a confirmed project delay.

Selecting a RAID row opens read-only detail via GET /raid/{id}, showing description, dates, linked activities, risk factors, and available evidence. No Add, Edit, Approve, Close, Escalate, Comment, Acknowledge, or Export button—those executive actions do not have a supported workflow here.

Overdue actions may be computed from supplied due date/status; name the date basis. Do not invent severity scores or mitigation-response relationships. Make unowned/unscored items legible without pretending to have scored them.

Include empty accepted register, filters with no results, unscored risk, missing evidence, and API failure. An empty register does not mean “No project risks exist”; say “No accepted RAID items recorded.”
```

## Prompt 15 — Data Confidence / evidence provenance

```text
Continue NAVIS. Design Data Confidence for Senior Management, with an optional planner-accessible evidence view.

Question: “What data is this system actually built on, and what does it not establish?”

Keep three concepts visually separate:
- Active project baseline identity from GET /schedule: filename, format, activity count, data date, hash available in an expandable technical detail.
- Live reporting coverage from GET /evm: evidenced versus unreported activities/weight.
- Reference/research corpus provenance from GET /evidence/corpus: dataset/source counts, validation, OCR coverage and caveats returned by manifests.

Do not combine corpus record counts with current-project progress totals. Do not present a research accuracy figure as a live project KPI. The corpus may contain OCR-derived material even though the app has no user-facing photo/PDF/OCR upload workflow; explain the distinction.

Use a clear provenance summary, source distribution, validation status, and a concise “What this evidence does not prove” section. Source details expand locally. No fictitious Download corpus, Revalidate, Upload data, or View original buttons unless an actual accessible artifact URL is available.

Include missing optional corpus manifests (404), API unavailable, no validation result, and populated states. Missing manifests are “Corpus information unavailable,” not “0 records.” Keep caveats visible but not as an oversized alarming banner.
```

## Prompt 16 — requested global NAVIS helping chatbot (integration-required variant)

```text
Continue NAVIS. Design the contextual NAVIS Assistant as a separate integration-required variant. Important: the current HTTP API only has a field progress-entry agent. The codebase contains a read-only QAAgent core, but it has no HTTP route, data loader, model-client adapter, or frontend wiring. Reuse that core; do not misrepresent the chatbot as already connected.

Make a persistent, tasteful “Ask NAVIS” launcher on the right edge of planner/executive layouts. Open a 360–400px side panel with clear header, close/expand controls, current-page context chips, conversation, and a bottom composer. On mobile use a full-height sheet. Do not use a bouncing robot, neon gradient, or oversized sparkle decoration.

The helper is a project colleague that explains evidence and helps the user reach the right decision screen. It never approves, edits dates, computes dashboard numbers itself, or makes unsupported predictions.

Design these first-version grounded intents, supported by QAAgent once data and HTTP wiring are added:
- “What recurring delay causes are recorded?” → Memory delay observations.
- “Which activity types took longer than planned?” → duration distribution.
- “How is piping work performing?” → discipline productivity summary.
- “What duration evidence exists for spool erection?” → Memory response with sample size.
- “Can we trust the reported schedule SPI?” → EVM coverage guard and snapshot explanation.

Keep these broader questions in a separate extension frame, not advertised as supported by the current QA core: selected activity audit evidence, why a specific report needs review, and accepted RAID exposure Q&A. They need additional fact builders over their corresponding endpoints.

Every grounded answer includes compact sources. The current QA core returns flat citation strings (activity/type/discipline/delay label/evm), not typed document/line citations. The integration maps recognized strings to real memory/metric/activity destinations; unresolvable sources remain plain labels. Do not draw clickable source chips without a defined destination or fabricate document/page citations. Facts absent from the data produce an honest limitation. The assistant uses deterministic backend numbers verbatim and explains them.

Suggested actions are real navigation or drafts: Open activity, Open review, Open RAID item. Any write-capable suggestion opens the appropriate form and requires explicit human confirmation. Executive variant remains read-only. Never put an “Approve” button directly into a generated answer that silently bypasses the review workflow.

Design: empty conversation with 3 contextual suggestions; grounded answer with citations; no evidence found; API unavailable with retry; source-loading; and an explicit “Assistant integration unavailable” state that preserves guided links without pretending AI answers work.

Implementation annotation: add a POST /assistant/turn adapter (or equivalent) around server/qa_agent.py:QAAgent.answer(question,data), loading the relevant Memory/EVM facts. Normalize /evm's project.spi into the QA core's expected flat spi field and preserve spi_headline_safe/evidence_coverage. The core returns answer, citations, grounded, model_available; richer page context and allowlisted actions are additional adapter behavior, not existing fields. Do NOT send these questions to existing POST /agent/turn, which logs field progress. Persistent chat history, streaming, attachments, and voice for this helper are not assumed. Start with deterministic QA responses: the optional generator guard currently validates numbers but not all prose or citation indices. Enabling generated phrasing requires stronger factual/citation validation and a real model adapter; do not equate grounded=true with a complete guarantee.

Separately show the currently implementable field variant titled “Field Update Assistant,” connected to /agent/turn and sharing the report session. Keep the visual family consistent while making its narrower purpose explicit.
```

## Prompt 17 — final consistency and interaction audit

```text
Review every NAVIS screen created in this Stitch project against the same design system and interaction map. Do not add new features during this pass.

1. Remove Planner/Field toggles and Force Mobile/Desktop controls everywhere. Resizing must not change role. Exactly one nav item is active.
2. Verify consistent project name, data date, role labels, discipline labels (Civil, Piping, Static Equipment, Electrical, Instrumentation, HSE), colors, typography, spacing, and status language.
3. For every button, tab, clickable row, icon, menu item, and input, provide a short handoff annotation: destination or local-state change, API method/path if any, required input, loading state, success result, and failure behavior. Remove controls with no purpose.
4. Show unknown/no-evidence/empty/error/loading as different states. Never manufacture 0%, “Queue clear,” or “No risk” from failed requests.
5. Verify field submission → planner review → clarification → decision → schedule audit → field outcome continuity. A user should never arrive at a dead end.
6. Ensure “Confirm” versus “Reassign” target semantics, valid create fields, and reject/ignore mapping are reflected in handoff annotations.
7. Remove credential auth, photo/OCR, offline sync, general-chat functionality claims, cost KPIs, unsupported forecast/trend charts, direct conflict resolution, arbitrary schedule edits, RAID export, and fake document downloads from the current-capability frames.
8. Preserve the separately labelled integration-required global assistant variant; do not accidentally present it as current backend functionality.
9. Check desktop 1440, tablet 1024, and mobile 390. Tables scroll within their region. Drawers, bottom bars, and keyboard never cover primary actions. Minimum touch targets 44px. Focus, selected, disabled, validation, and reduced-motion states are clear.
10. Produce a final frame index grouped by role and state, plus reusable component names suitable for later MCP-based implementation. Keep the actual UI free of developer/API annotations.
```

## Recommended design and implementation order

1. Shared shell and role picker.
2. Field report + side agent + transcript/failure states.
3. Planner Review Inbox, including the broken-action contract corrections.
4. Schedule/audit and the complete field → planner → outcome loop.
5. Ingest and job detail/history.
6. RAID and baseline-control UI.
7. Memory and executive evidence-aware views.
8. The QAAgent core is already in the local code. Wire its HTTP/data/client adapter, then enable the separately designed helper panel. Add broader fact support only when implemented and tested.

## Definition of a non-dummy interface

Every designed interaction must be one of:

- **Existing API action:** mapped above, with truthful inputs/results.
- **New frontend wiring over existing data:** route, drawer, filter, sort, joined detail, or navigation with defined behavior.
- **Explicitly gated backend extension:** visibly separated in the handoff and not claimed functional until implemented and tested.

A polished visual is not proof of a working flow. The final integration must pass the acceptance checklist in `NAVIS_BACKEND_UI_AUDIT.md`.
