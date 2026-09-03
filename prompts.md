# NAVIS — Stitch prompts, rewritten for screen generation

Basis: `ca63ba01fa17d74bc7f23df842b62fab8b2af442`, where local and remote `main` agree. Backend claims below were re-checked against that commit.

## Start here

Copy the text inside **Prompt 01 only** into Stitch first. Do not paste this whole file. Each box below is a separate request for one visible screen, not a specification to discuss.

- Attach your own Report Progress and blue/white design-system images if available. Do not attach the rejected executive dashboard as a style reference.
- There is no master/setup prompt. Generate 01, keep the version you like, then generate the other screens individually in the same project.
- Each main prompt contains its own visual direction. Once you have a favourite screen, also use it as the reference for subsequent screens.
- Numbers, dates, activity IDs, filenames, names and conversations below are illustrative design-preview content, not verified live project data. Implementation must use API responses.

The old pack mixed visual requests with implementation specifications and often requested several screens at once. This version separates those concerns. I have checked the prompt structure and backend alignment; I have not executed these prompts inside your Stitch session.

If Stitch produces a written explanation instead of a design, try this single recovery request:

~~~text
Generate the actual visual UI screen on the canvas now from my previous request. Use the supplied example content and make reasonable layout choices. The deliverable is one high-fidelity screen, not a plan, requirements document, code listing, or explanation.
~~~

If it still produces nothing, share the exact response or error. A prompt rewrite cannot establish whether an account, generation or service error is blocking the session.

## Prompt 01 — START HERE: Report Progress, desktop

~~~text
Create one high-fidelity desktop web-app screen now, 1440px wide, for NAVIS, a construction progress intelligence tool. Screen: Report Progress. Render the actual interface on the canvas.

Use an engineered, precise blue-and-white aesthetic: #2563EB primary, #111827 text, #64748B secondary text, #F7F8FC background, white surfaces, fine borders, 8px corners, Inter typography. Use my Report Progress reference if attached.

Left sidebar: NAVIS, Home, Report Progress selected, My Updates, Clarifications, Preferences. Header: OIL Well-Site Duliajan, Field Supervisor, data date 15 Sep 2026. No Planner/Field toggle.

Main workspace: title “Report Progress”, subtitle “Turn what happened on site into a verified update.” Connect two clearly numbered sections: “1. Your report” and “2. NAVIS understood”. The initial report says “P-201 spool erection is complete.” The structured summary shows Piping, P-201, Completed, reported work date 14 Sep 2026, and proposed schedule activity Spool Erection — P-201. Use a thin blue connector between the original report and extracted facts.

Dock a 360px Field Update Assistant on the right. Show it asking for the work date and the user replying “14 September 2026”. Include a message composer and Send action for answering follow-up questions.

Primary button: “Send to planner review”. Secondary: “Revise report”. Small note: “The schedule changes after planner approval.” Make this a populated working screen, not a landing page.
~~~

## Prompt 02 — Report Progress, mobile capture

~~~text
Create one high-fidelity mobile web-app screen now, 390px wide, for NAVIS Report Progress. Render a usable field-work capture screen.

Style: white and #F7F8FC surfaces, #2563EB primary, #111827 headings, slate metadata, Inter, 8px corners, 16px body text and large touch targets.

Header: back arrow to Home, “Report Progress”, small Field Supervisor label. Below, a compact context strip reads “OIL Well-Site Duliajan · Piping · P-201”.

Lead with a large “Speak your update” microphone button. Under it, an equally accessible “Type instead” control switches to a text area. Show the text-entry state with “P-201 spool erection is complete.” already entered. Explain that voice becomes editable text before sending.

Place a blue “Send update” button below the input; it begins the Field Update Assistant conversation. Add a small instruction: “NAVIS will ask for any missing details before you send this for review.”

Bottom navigation: Home, Report selected, Updates, Questions, More. Keep actions above the navigation and phone safe area. Use the available space for the report, not decorative cards. Show no photo upload, offline-sync badge or role toggle.
~~~

## Prompt 03 — Field Home, desktop

~~~text
Create one high-fidelity desktop screen now, 1440px wide: NAVIS Field Home. Use an engineering blue-and-white interface with #2563EB actions, #111827 text, Inter, thin borders and compact white surfaces on #F7F8FC.

Sidebar: NAVIS, Home selected, Report Progress, My Updates, Clarifications, Preferences. Header: OIL Well-Site Duliajan, Field Supervisor, data date 15 Sep 2026. No role toggle.

Lead with “What happened on site today?” and one strong “Report progress” button that opens report capture. Beside this, show a compact work-context label, not management KPIs.

Below, create an asymmetric working layout. The larger column is “Questions needing your answer”, with two planner questions, related report excerpts and an “Answer question” link on each. The narrower column is “Recent updates”, with three dated reports labelled Pending review or Reviewed; each opens its report detail.

A full-width lower section, “What your reports changed”, shows two recorded outcomes with activity description, changed field, previous value and accepted value. Each opens the relevant report outcome. Include a Field Update Assistant launcher that opens report capture. Make the hierarchy clear and avoid a generic four-card dashboard.
~~~

## Prompt 04 — My Updates with selected report

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS My Updates. Use #2563EB blue, white surfaces, #F7F8FC background, Inter, subtle dividers and compact, readable rows.

Field sidebar: Home, Report Progress, My Updates selected, Clarifications, Preferences. Header: OIL Well-Site Duliajan and Field Supervisor. No Planner/Field toggle.

Use a two-column master-detail layout. Left: dated report list with a local text filter and status filter. Show report excerpts for spool erection, cable pulling and concrete work, each with Pending review or Reviewed status. Selecting a row changes the detail panel.

Right: selected report “P-201 spool erection completed”. Show the submitted statement, reported work date, matched activity description and submission reference. Under “Review outcome”, show either a pending-review explanation or the actual recorded change; use Pending review for this selected example.

Include an “Open planner question” link for a report with a clarification and a “New report” button leading to Report Progress. Keep unanswered questions separate from accepted schedule changes. This is report history, not an editable chat archive; omit edit, delete, sync and attachment-download buttons.
~~~

## Prompt 05 — Field Clarifications

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Clarifications for a field supervisor. Use the precise NAVIS blue/white style, Inter, thin borders and restrained 8px corners.

Sidebar: Home, Report Progress, My Updates, Clarifications selected, Preferences. Header: OIL Well-Site Duliajan and Field Supervisor.

Main title: “Questions from the planner”. Use a narrow list of report-linked questions on the left and one readable question-and-answer workspace on the right. Tabs “Unanswered” and “Answered” filter the list.

Selected question: “Was spool erection completed on 14 September, or only the fit-up?” Above it, show the related report excerpt and proposed activity Spool Erection — P-201.

Below, provide an answer text area containing “Spool erection was completed on 14 September. Welding is separate and has not started.” Primary action “Send answer” saves the response for the planner. Secondary link “View related report” opens My Updates detail.

Show a quiet note: “Answering a question does not approve the report or update the schedule.” Keep this a focused clarification workflow, with no social chat features, attachments or teammate mentions.
~~~

## Prompt 06 — Entry / demo workspace selection

~~~text
Create one high-fidelity desktop entry screen now, 1440px wide, for NAVIS. Render the actual screen, not a design-system board.

Use a refined blue-and-white split layout. Left: NAVIS wordmark, “Field reality. Verified against the plan.” and a subtle engineering-grid motif connecting a report symbol to a schedule row. Right: a focused panel titled “Choose your demo workspace”. Use Inter, #2563EB primary, #111827 text, white surfaces and fine grey borders.

Show three selectable role cards with concise descriptions:
Field Supervisor — Report site progress and answer planner questions.
Planner / Project Manager — Review evidence and manage the project schedule.
Senior Management — Understand schedule exposure and evidence coverage.

Show Planner / Project Manager selected. A blue “Enter workspace” button opens the selected role's home. Place a small “Demo access profiles” label below the panel.

This prototype uses role selection, so show no email/password form, password recovery, SSO or RBAC security claim. Preserve the calm composition of the attached NAVIS login reference, if provided.
~~~

## Prompt 07 — Field Preferences, mobile

~~~text
Create one high-fidelity 390px mobile screen now: NAVIS Preferences. Use white surfaces, #F7F8FC background, #2563EB controls, Inter and clear 44px touch targets.

Header: back to Home, “Preferences”. Show a simple project-information group with OIL Well-Site Duliajan, data date 15 Sep 2026 and current demo role Field Supervisor.

Below, show “Speech language” with English, Hindi and Assamese as selectable options. English is selected. Explain “Used when your browser supports speech recognition.”

Add one clearly separated “Change demo role” action that returns to the three-role workspace picker. It does not change the device layout. Include a short “Demo preferences are stored on this device” note.

Bottom navigation: Home, Report, Updates, Questions, More selected. Keep this deliberately short and well spaced. Do not fill the screen with invented account settings, employee information, password changes, notification settings or offline-sync controls.
~~~

## Prompt 08 — Planner Overview

~~~text
Create one high-fidelity desktop screen now, 1440px wide: NAVIS Planner Overview. Give it the character of a precise engineering workbench: Inter, #2563EB actions, ink headings, white surfaces, fine rules and restrained orange review indicators on #F7F8FC.

Sidebar: Overview selected, Review Inbox, Schedule, Ingest, RAID, Project Memory. Header: OIL Well-Site Duliajan, Planner, 15 Sep 2026, and “Ask NAVIS” opening a side assistant. No Planner/Field toggle.

Lead with “Decisions before the next update.” Use one compact summary strip for baseline activities, pending reviews and source disagreements, not oversized metric cards.

The dominant section is “Needs your decision”: five report rows with source excerpt, proposed activity, discipline and reason for review. “Review next” opens the first pending item in Review Inbox.

Alongside it, show “Sources disagree” with two source values and the stored value for one activity; “View evidence” opens its audit. Below, a dated “Recent changes” feed distinguishes planner-approved changes from automatically applied file updates and completed ingests. Rows open the relevant activity or ingest result. Keep priorities and evidence visible at a glance.
~~~

## Prompt 09 — Planner Review Inbox

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Review Inbox, an evidence-to-schedule decision workbench. Use #2563EB, white, ink text, Inter and thin dividers; use orange only for uncertainty.

Planner sidebar: Overview, Review Inbox selected, Schedule, Ingest, RAID, Project Memory. Header includes project, data date and an Ask NAVIS drawer launcher. No role toggle.

Build three purposeful columns: a compact queue on the left, source evidence in the centre, and the decision panel on the right. Queue rows show activity description, priority and reason for review. Priority and status controls filter the queue.

Selected item is a normal activity-matching proposal. Evidence: “P-201 spool erection completed on 14 September.” Show its source reference and reported facts. Visually connect it to the proposed schedule activity Spool Erection — P-201. Display a plain-language match explanation when available.

The decision panel shows the currently proposed activity and a searchable alternate-activity picker. Primary button “Confirm proposed match”. Other actions: “Choose another activity”, “Ask field for clarification”, “Create activity” and “Ignore proposal”. Selecting another activity changes the primary label to “Reassign to selected activity”. Keep ignored proposals distinct from approved changes and give every action a clear label.
~~~

## Prompt 10 — Schedule register

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Schedule. Make it a dense but highly readable project-control register, using Inter, white surfaces, #2563EB selection, subtle grid rules and technical monospace only for activity IDs.

Planner sidebar: Overview, Review Inbox, Schedule selected, Ingest, RAID, Project Memory. Header: project name, data date, Planner and Ask NAVIS. No role toggle.

Title “Schedule” with active baseline name underneath. Top controls: local activity search, discipline filter, “Import baseline” and “Export schedule”. Search and discipline filter narrow the rows; the two actions open their respective dialogs.

Show eight realistic rows across Civil, Piping and Electrical. Columns: activity description and ID, discipline, planned start, planned finish, actual start, actual finish, recorded finish variance and evidence indicator. Use “Not reported” for missing actuals, not zero progress. Explain that variance compares recorded actual and planned dates, not a forecast.

Selecting a row opens an activity inspector containing evidence and the audit trail. Keep table headers sticky and controls compact. No inline date editing or unsupported rescheduling button.
~~~

## Prompt 11 — Activity evidence and audit drawer

~~~text
Create one high-fidelity desktop screen now showing NAVIS Schedule with an Activity Evidence drawer open on the right. Use a 1440px canvas and the blue/white NAVIS engineering style: Inter, fine borders, #2563EB accents and ink text.

Keep the schedule table visible behind a 560px drawer. Drawer title: “Spool Erection — P-201”, with a smaller activity ID. The close control returns to the unchanged schedule table.

At the top, compare planned and actual dates in a compact table. Beneath, tabs “Evidence” and “Audit trail” switch the drawer content. Show Audit trail selected.

Render a chronological timeline of recorded changes: field name, old value, new value, timestamp and decision origin. Expand one entry to show the original source excerpt and available source reference. Give descriptions visual priority over technical IDs.

Include a quiet notice when two sources disagree, with their different values and the currently stored value. “View source excerpt” expands the provided evidence locally. This is a read-only history: no undo, delete or choose-winning-source button.
~~~

## Prompt 12 — Ingest report

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Ingest for planners. Use #2563EB primary, #111827 text, white surfaces, #F7F8FC background, Inter and compact engineering-style typography.

Sidebar: Overview, Review Inbox, Schedule, Ingest selected, RAID, Project Memory. Header includes project, data date, Planner and Ask NAVIS. No Planner/Field toggle.

Title “Bring field evidence into the schedule”. Lead with a file drop area and “Browse file” control. Supported types shown clearly: TXT, MD, LOG, XLSX. Show one selected file, daily-progress-14-sep.xlsx, with filename and size, plus “Remove file” before submission.

Above the blue “Ingest report” button, place a readable notice: “Eligible high-confidence updates may be applied automatically. Uncertain events go to planner review.”

Below, show recent ingest jobs with filename, submitted time and available outcome counts. Selecting a job opens its result page. Keep this different from field report submission. Do not show photo, PDF, CSV, audio upload or a fake animated pipeline percentage. Use a clear file-first layout, not a storage dashboard.
~~~

## Prompt 13 — Ingest results and event evidence

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Ingest Results. Use the NAVIS blue/white engineering aesthetic, Inter, compact white surfaces and fine table dividers.

Planner sidebar with Ingest selected. Header: OIL Well-Site Duliajan, Planner and Ask NAVIS. Page title: “daily-progress-14-sep.xlsx”, with job reference and completed timestamp.

Use a compact result strip: extracted events, applied updates and items requiring review. Keep these as separate counts. Add the primary action “Review uncertain items”, opening the relevant review work.

Main area: an event table showing source row, original excerpt, proposed activity and outcome. Include examples marked Applied, Needs review and No confident match. Selecting an event reveals its source excerpt, extracted facts and available matching explanation in a right-hand detail panel.

An applied event has “View activity audit”; a review event has “Open review item”. Add “Back to Ingest” for another file. No additional commit button: applied changes are already recorded. Make evidence traceability, not decorative charts, the visual focus.
~~~

## Prompt 14 — Baseline import preview

~~~text
Create one high-fidelity desktop screen now showing NAVIS Schedule with an Import Baseline drawer open, on a 1440px canvas. Use Inter, #2563EB actions, white surfaces, subtle borders and restrained orange warnings.

Drawer title: “Import baseline”. Show the active baseline name and a selected replacement file. Accepted formats: JSON, Primavera XML and XER.

Show a three-step indicator: Choose file, Validate, Confirm. Display the validated-preview step with a compact summary of file format and activity count. State clearly “Preview only — no schedule changes have been saved.” Include an optional reason field.

Below, explain “Import updates planned schedule fields and preserves recorded actuals and audit history.” Show a separate warning: “The schedule matcher uses a configured baseline. Confirm it is aligned before processing new reports.”

Provide Back, Cancel and a deliberate blue “Replace baseline” action with a confirmation checkbox. File selection and validation must not imply replacement already happened. Keep the schedule visible behind the drawer. Do not add an automatic matcher-rebuild, restore-version or live-Primavera connection control.
~~~

## Prompt 15 — RAID register

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS RAID, a register of Risks, Issues, Actions and Decisions. Use an exacting engineering style with #2563EB, Inter, white surfaces, slate metadata and subtle orange attention markers.

Planner sidebar: Overview, Review Inbox, Schedule, Ingest, RAID selected, Project Memory. Header has project, Planner, data date and Ask NAVIS. No role toggle.

Title “Risk, issue and action control”. Below, meaningful tabs All, Risks, Issues, Actions, Decisions filter the register. Add status and linked-activity filters.

Main table columns: title, kind, status, owner, due date, linked activity and risk exposure in days. Show six realistic items, including one unowned action and one risk with “Not scored” exposure. Use statuses Open, Mitigating, Closed and Rejected.

Primary “Add item” opens the entry drawer. Secondary “Review suggested items” opens evidence-derived proposals for human review. Selecting a row opens its details. Place a compact explanation below the exposure heading: “Probability × impact days”. No delete, automatic mitigation or export button. Give ownership and next decisions priority over decorative risk gauges.
~~~

## Prompt 16 — RAID suggested-item review drawer

~~~text
Create one high-fidelity 1440px desktop screen now showing the NAVIS RAID register with a 560px “Review suggested item” drawer open. Use the same blue/white engineering aesthetic: Inter, #2563EB, thin borders and compact labelled fields.

Show a draft risk titled “Welding crew availability may delay P-201 work”. Lead with its supporting field-report excerpt and label it “Suggestion — not yet in the register”.

Editable fields: kind, title, description, category, owner as a free-text input, due date, linked schedule activity, status, probability and impact in days. For the selected Risk kind, display probability and impact together; explain that exposure is calculated when saved.

The primary “Add to register” saves this human-reviewed item. “Not now” closes the drawer without claiming the suggestion has been permanently dismissed. Keep the underlying register visible.

Use a clear separation between source evidence and the planner's entered judgment. Show no AI auto-approve, user-directory avatar picker, assign-notification or delete control.
~~~

## Prompt 17 — Project Memory

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Project Memory. This is a current-project evidence workspace for planners, not a generic AI dashboard. Use Inter, #2563EB, white surfaces, fine rules and legible labels.

Planner sidebar with Project Memory selected. Header: project, data date, Planner and Ask NAVIS opening a side panel. No role toggle.

Title “Use completed work to plan better”. Add discipline and activity-type selectors. Main area: a horizontal comparison chart of planned versus recorded actual duration by activity type, with days on the axis and completed sample counts beside every row.

To the right, show a selected-type evidence summary: planned median, actual median, P80 and sample size, with a read-only planning suggestion. Make small sample warnings visible.

Below, add “Delay causes”, a compact keyword-based table of causes with a **Reports** count column. One field report is one report even when it wrote a start, a finish and a quantity, so these are small numbers — show 1 and 2, not inflated totals. A secondary “Activity terminology” button opens a reference drawer for looking up canonical activity types. Include metric-explanation links that expand definitions. Recommendations do not modify the schedule, so omit an Apply button and unsupported forecasts.
~~~

## Prompt 18 — Senior Management Overview

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Senior Management Overview. Use a confident editorial engineering layout: Inter, large ink heading, #2563EB accents, white surfaces, fine rules and warm orange only for attention. Avoid a generic grid of KPI cards.

Sidebar: Overview selected, Exposure, Data Confidence. Header: OIL Well-Site Duliajan, Senior Management, data date 15 Sep 2026 and Ask NAVIS. No Planner/Field toggle.

Lead with “Schedule position, with evidence in view.” Show a deliberate two-part summary: “SPI of evidenced work” beside “Reporting coverage”. Use an illustrative SPI of 0.91 and 56 of 120 activities evidenced; label both clearly. Add a short explanation: “Unreported work is not proof that work has stopped.”

Below, show discipline-level performance beside evidence counts, then a prioritised “Recorded finish slips” list with human activity descriptions and actual-versus-planned variance. These are recorded slips, not predicted finishes.

A compact exposure summary links to Exposure; “Understand this evidence” opens Data Confidence. Keep the page read-only, with no approval actions, cost metrics or fabricated historical trend chart. Use a balanced information-rich composition instead of giant empty panels.
~~~

## Prompt 19 — Senior Management Exposure

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Exposure for Senior Management. Use Inter, #2563EB, white surfaces, ink headings and compact, clear tables on #F7F8FC.

Sidebar: Overview, Exposure selected, Data Confidence. Header: project, Senior Management, data date and Ask NAVIS. No role toggle.

Title “Where attention is needed”. Tabs “Recorded RAID items” and “Source disagreements” switch between two different kinds of exposure. Show Recorded RAID items selected, with kind and status filters.

Table: item title, kind, status, owner, due date, linked activity and risk exposure in days. Keep “Not scored” distinct from zero. Show one selected risk with its read-only description and evidence in a side inspector.

The Source disagreements tab compares two reported values with the currently stored value and offers “View evidence”. Explain that disagreement does not automatically establish a project delay.

Rows open details and filters narrow the results. This is an executive read-only view: no add, edit, approve, close, escalate or export actions. Let the risk descriptions and evidence carry the page, not decorative gauges.
~~~

## Prompt 20 — Data Confidence

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Data Confidence for Senior Management. Use a calm, precise blue-and-white style, Inter, fine borders and a clear editorial hierarchy.

Sidebar: Overview, Exposure, Data Confidence selected. Header includes project, role, data date and Ask NAVIS. No Planner/Field toggle.

Title “What supports the numbers?” Create three clearly separated sections, not interchangeable metric cards.

First, “Active project baseline”: filename, format, activity count and data date, with an expandable Technical details row.

Second, “Live reporting coverage”: evidenced versus unreported activities, a labelled coverage bar and a short explanation that missing reports do not establish zero progress.

Third, “Reference corpus”: provenance, source categories and available validation notes, explicitly labelled as reference/research material rather than live site reporting.

End with a concise “Limits of this evidence” block. Expand controls reveal definitions and available metadata locally. Include no download, revalidate or upload action. Keep unknown information labelled unavailable, and do not mix reference-corpus record counts with current-project activity totals.
~~~

## Prompt 21 — NAVIS helping chatbot, open side panel

~~~text
Create one high-fidelity 1440px desktop screen now: NAVIS Project Memory with the “Ask NAVIS” conversational side panel open. Render the interface with an actual example conversation.

Use Inter, #2563EB, ink text, white surfaces and fine borders. Sidebar: Overview, Review Inbox, Schedule, Ingest, RAID, Project Memory selected. Main area: a duration table with Spool erection selected, planned median 4 days, actual median 6 days and 8 completed samples. Give the assistant a 380px right-side panel with header, close button, project context and message composer.

User asks: “What does completed spool-erection work tell us about duration?” NAVIS answers: “The planned median is 4 days and the recorded actual median is 6 days, from 8 completed activities. This is evidence to review, not an automatic schedule change.”

Below the answer, show source label “Project Memory · Spool erection” and “Open duration evidence”, selecting that table row. Suggestions “What delay causes recur?” and “How much work is evidenced?” fill the composer; Send submits it.

Keep messages readable, without a robot or neon treatment. The assistant explains evidence; it does not approve reports or edit the schedule.
~~~

## Prompt 22 — Planner Review, mobile

~~~text
Create one high-fidelity 390px mobile screen now: NAVIS Planner Review. Keep the user a Planner on mobile. Use Inter, #2563EB, white surfaces, fine borders, 16px body text and large touch targets.

Header: navigation menu, “Review report”, Planner label and Ask NAVIS opening a full-height assistant sheet. Below, a compact “Item 2 of 8” indicator returns to the review queue when tapped.

Show a normal activity-matching proposal. Stack its evidence vertically: original field-report excerpt, reported facts, proposed activity Spool Erection — P-201, and the reason it needs review. Show the source reference in quieter text.

Provide “Choose another activity” and “Ask for clarification” below the evidence. Put the primary “Confirm proposed match” button in a sticky bottom action area, above the safe area and without covering content. Put Create activity and Ignore proposal in a labelled More actions sheet.

Keep the content readable without squeezing a desktop table onto the phone. Do not substitute field navigation or add a Planner/Field switch.
~~~

## Prompt 23 — Senior Management Overview, mobile

~~~text
Create one high-fidelity 390px mobile screen now: NAVIS Senior Management Overview. Use Inter, #2563EB accents, white and #F7F8FC surfaces, ink headings and comfortable 16px body text.

Header: NAVIS, Senior Management and data date 15 Sep 2026. Title “Schedule position”. Lead with two clearly labelled stacked summaries: SPI of evidenced work and reporting coverage. Include the note “Missing reports do not prove work has stopped.”

Below, show a compact discipline breakdown with a performance value and evidence count per row. Follow with three recorded finish-slip items, prioritising readable activity descriptions over IDs. A “View exposure” link opens the read-only exposure register.

Bottom navigation: Overview selected, Exposure, Data. A separate compact Ask NAVIS launcher opens a full-height conversation sheet, not a tiny floating window over the content.

Preserve executive read-only behaviour. Do not show field report capture, approve controls, role switches, historical trend charts or cost estimates. Make this an intentional mobile composition rather than a shrunk desktop dashboard.
~~~

## Small follow-ups — use individually after the relevant screen exists

### A — Field report success

~~~text
Create one additional mobile screen for the NAVIS field-report flow: the submission-success state. Show “Sent for planner review”, a report reference, the submitted activity summary and a short explanation that the schedule has not changed yet. “View my update” opens its report detail; “Report another update” starts a new report. Match the existing mobile screen's exact colours, type and navigation. Render the screen now.
~~~

### B — Planner clarification drawer

~~~text
Create one additional NAVIS Review Inbox screen with the Ask for clarification drawer open. Show the related report excerpt, proposed activity and one question text area. “Send question” sends it to field Clarifications; “Cancel” closes the drawer. Add “The report stays pending while clarification is requested.” Match the existing Review Inbox style and render this single screen now.
~~~

### C — Create-activity decision drawer

~~~text
Create one additional NAVIS Review Inbox screen with a Create activity drawer open. Show the source report and two required fields: New activity ID and Description, plus an optional decision note. Primary action “Create activity and resolve review”; secondary “Cancel”. State “The current import/review workflow supplies the initial planning defaults.” Do not add editable baseline dates, dependencies or an unsupported schedule editor. Match the existing screen and render the drawer state now.
~~~

### D — Schedule export dialog

~~~text
Create one additional NAVIS Schedule screen with an Export schedule dialog open. Provide format choices Primavera XML and XER, an Include actuals checkbox, and discipline scope All disciplines or Current discipline. “Generate export” creates the file; after success it becomes “Download file”. Include Cancel and a quiet note that XER is a simplified prototype format. Match the existing screen and render this single dialog state now.
~~~

### E — Real failure state

~~~text
Create one additional version of the selected NAVIS screen showing its data service unavailable. Preserve the navigation and page identity, replace unavailable results with a clear error panel and give Retry a visible action. Do not display zero counts, fabricated results or an all-clear message. Retain any unsent text locally in the visible form. Match the selected screen and render this single error state now.
~~~

### F — Remove the rejected toggle

The application itself removed these controls in `d0bcede`. Use this only if a generated screen reintroduces them.

~~~text
Update only the selected NAVIS screen. Remove the top-right Planner/Field toggle and any Force Mobile or Force Desktop control. Keep the current role as a small text label and preserve the current navigation, content and visual style. Render the updated screen now.
~~~

### G — Visual consistency correction

~~~text
Update only the selected NAVIS screen to match my approved Report Progress reference: identical #2563EB primary colour, Inter typography, sidebar width, header height, fine borders and 8px panel corners. Preserve its role-specific navigation and content. Make only these visual-consistency changes and render the updated screen now.
~~~

## Coverage and suggested order

Start with 01 → 09 → 10 → 21 to establish the core report, decision, schedule and helping-assistant experience. Then generate the remaining screens as needed.

| Area | Prompts |
| --- | --- |
| Field reporting, home, history, questions, preferences | 01–05, 07; follow-up A |
| Demo role entry | 06 |
| Planner overview and review decisions | 08–09, 22; follow-ups B–C |
| Schedule, evidence, baseline import and export | 10–11, 14; follow-up D |
| File ingest and results | 12–13 |
| RAID register and human-reviewed suggestions | 15–16 |
| Project Memory and contextual helping chatbot | 17, 21 |
| Executive overview, exposure and data confidence | 18–20, 23 |
| Failure handling and visual corrections | Follow-ups E–G |

## Implementation guardrails — reference only; do not paste into Stitch

These prompts produce visual designs, not proof that interactions are connected. Keep the existing [backend/UI audit](Design/NAVIS_BACKEND_UI_AUDIT.md) as the implementation contract. The previous [detailed prompt pack](Design/NAVIS_STITCH_PROMPTS.md) is retained for its deeper state and API notes, not as the generation input.

1. **Roles are demo selection, not authentication.** Do not imply user accounts or server-enforced RBAC. Role and screen size are separate. A mobile planner remains a planner.
2. **Two agent purposes must stay separate.** Field Update Assistant uses POST /agent/turn to collect a progress report. It does not answer general project questions. The wider Ask NAVIS helper has a read-only QA core at `server/qa_agent.py` — merged locally, imported by nothing — and still needs its HTTP/data/frontend adapter. The drawn side panel is an integration target, not an already-connected feature.
3. **All field confirmations go to review.** Sending the report creates a pending proposal, not a direct schedule update. Revise report starts a new session with editable report text; the current agent does not support arbitrary overwrites of already-collected slots. Use Reported work date, not fabricated separate start/finish timestamps. Use browser speech only where supported; provide text fallback.
4. **Planner actions have distinct contracts.** Confirm keeps the original match; selecting another target uses reassign. Create requires a new activity ID and description. Ignore uses the backend ignore action, not an unsupported reject action. Defaulted-finish review items need their restricted confirm/ignore controls, not every normal matching action. The previously audited frontend bindings need correction during implementation.
5. **Clarification is not approval.** Sending or answering a question leaves the item for planner review. Show returned answers in the planner's review evidence. Submitted answers are not an editable messaging thread.
6. **Ingest may write automatically.** TXT/MD/LOG/XLSX only for the audited working path. File ingestion differs from field confirmation: eligible confident changes may already be applied. Do not add a second commit button or claim streaming progress. Duplicate, unsupported, empty and failed files need explicit states.
7. **Schedule history is read-only.** Do not add date editing, undo, deleting audit entries or a source-conflict winner selector. Evidence links show supplied excerpts; the upload route does not provide arbitrary original documents. Export downloads are generated XML/XER files.
8. **Baseline validation and commit are different requests.** Validation is dry-run, not replacement. Existing baselines require the API's replacement flag even for validation. Require explicit confirmation for the actual replacement. Imported schedule data does not automatically repoint the configured matcher; show a drift warning when applicable.
9. **RAID requires human judgment.** Suggestions are not accepted records. Owners are free text; risk exposure is computed from probability and impact. Register creation and edits use their actual endpoints. No invented deletes, permanent suggestion-dismissals, exported documents or automatic mitigation.
10. **Memory and executive metrics are evidence-bound.** Use real sample sizes and server values. Honour the SPI headline-safety flag — the wire name is `spi_headline_safe`, with `spi_headline_reason`, `evidence_coverage` and `evidenced_subset` beside it; the current frontend type misnames it `headline_safe` and omits the last two. When unsafe, foreground evidenced-subset SPI and coverage, not the raw whole-project number. Activity-count coverage is different from weighted coverage. No fake time series, cost KPIs, completion forecasts or automatic application of suggested durations.
11. **Ground the helping chatbot.** Initially support the QA core's duration, productivity, delay-cause and evidence/SPI questions, counting a delay cause once per field report. Use deterministic facts, adapt the EVM data shape, and validate citations. Audit/review/RAID-specific Q&A needs further fact support. Map source links to real destinations; leave unavailable sources as plain labels. No fabricated document citations, approvals or silent writes.
12. **Every visible interaction needs a destination or state change.** Wire navigation, row selection, filters, drawers, form submission, retry and downloads explicitly. Test pending, success, error, empty, unknown and unsupported states. Remove placeholder bells, profile menus, searches and settings with no function. No photo/PDF/OCR uploads, offline sync or fake live integrations.

The shorter, screen-by-screen approach is consistent with the [Stitch Prompt Guide](https://discuss.ai.google.dev/t/stitch-prompt-guide/83844). Whether your particular failed attempt was caused by prompt wording or a Stitch/session error remains unverified until its response is inspected.
