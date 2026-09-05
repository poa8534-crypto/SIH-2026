# NAVIS UI Redesign Checklist
*Tracked screen-by-screen according to the ChatGPT/Codex minimalist visual direction and structural reference.*

## 1. Shared Design System & Token Foundation
- [x] CSS Variables & Tailwind Theme (`frontend/src/index.css`): Light/Dark minimalist tokens (#FFFFFF canvas, #F7F7F8 sidebar, #FAFAFA cards, #202123 text, #E5E5E5 borders).
- [x] Shared Button Component (`frontend/src/components/ui/Button.tsx`): Neutral primary, subtle secondary, 6-8px rounding, minimal shadows.
- [x] Shared Panel, Card, Header Primitives (`frontend/src/components/ui/primitives.tsx`): Standardized padding, hairline borders, scannable empty & error states.
- [x] Badges & Status Indicators (`ConfidenceBadge.tsx`, `DisciplineTag.tsx`): Muted green, amber, red indicators always paired with label/icon.

## 2. Global Shells & Layout
- [x] Desktop Navigation Shell (`App.tsx`): Persistent 240px left sidebar, compact contextual header, project identity ("Oil India Limited · EPC Schedule Engine"), data date, theme toggle, switch role.
- [x] Mobile/Field Navigation Shell (`FieldWorkspaceShell.tsx` / `MobileShell`): Responsive layout for handheld site devices (<768px) and desktop workstation (>768px) without changing the user's role.
- [x] Role Picker / Login (`Login.tsx`): Strip out fake synchronization telemetry/latency; replace with honest role definitions, project baseline context, and clean ChatGPT/Codex visual styling.

## 3. Planner / Project Manager Role (`/home`, `/reconcile`, `/schedule`, `/ingest`, `/raid`, `/delay`, `/memory`)
- [x] **Home (`Home.tsx`)**:
  - [x] Restrained 4-card summary strip (Pending review, Ingests today, Started activities, Critical path variance).
  - [x] Scannable operational table for "Needs Attention" review items.
  - [x] Recent ingest jobs table.
  - [x] Unresolved source conflicts table.
  - [x] Recent append-only audit feed.
- [x] **Reconcile (`Reconcile.tsx`)**:
  - [x] Review queue tabs (All, High Confidence, Low Confidence / Granularity Mismatch, New Scope).
  - [x] Review candidate cards with exact source line/row provenance highlight.
  - [x] Human review actions: Confirm, Reassign, Mark New Activity, Reject.
- [x] **Schedule (`Schedule.tsx`)**:
  - [x] View switchers: Operational Table ⇄ Gantt Chart ⇄ Schedule Doctor.
  - [x] Scannable operational table: Activity ID, Name, WBS, Discipline, Planned, Actual, Variance, Float, Status.
  - [x] Activity Detail & Append-only Audit Trail slide-over drawer.
  - [x] Gantt Timeline (`GanttChart.tsx`): Planned vs Actual bars, critical path filter, zoom controls.
  - [x] Schedule Doctor (`ScheduleDoctor.tsx`): Feasibility gauge, 4 pillar bars, DCMA 14-point checks, monsoon clash alerts, P6 XML download modal.
- [x] **Ingest (`Ingest.tsx`)**:
  - [x] File drop zone for `.txt` and `.xlsx` with format specifications.
  - [x] Direct text paste input for rapid updates.
  - [x] Ingestion run history table with extracted/auto-linked counts.
- [x] **Exposure (`Raid.tsx`)**:
  - [x] Exposure register table, risk score cards, mitigation actions.
- [x] **Delay Attribution (`Delay.tsx`)**:
  - [x] Delay events table, liability classification, notice deadline clock.
- [x] **Institutional Memory (`Memory.tsx`)**:
  - [x] Tabs: Duration Benchmarks, Recurring Delay Causes, Productivity Rates, Knowledge Base Rules, Tender Estimator.

## 4. Field Supervisor Role (`/field`, `/field/report`, `/field/reports`, `/field/clarifications`, `/field/profile`)
- [x] **Field Home (`Field.tsx` / `IdleStage.tsx`)**:
  - [x] Shift briefing card with active work packages for today.
  - [x] Quick-action capture buttons (Tap & speak voice pill, Studio text entry).
  - [x] Pending planner clarifications counter.
  - [x] Recent field updates table.
- [x] **Report Studio (`ReportStudio.tsx`)**:
  - [x] Natural language text entry & multi-turn slot completion flow.
  - [x] Clean provenance and authentic discipline, workfront, and data-date inputs.
  - [x] Extracted events preview before submission to planner review queue.
- [x] **Reports Ledger (`FieldReports.tsx` / `UpdatesLedger.tsx`)**:
  - [x] Chronological field submission history with status badges (Auto-linked, Pending Review, Committed).
- [x] **Clarifications (`FieldClarifications.tsx`)**:
  - [x] Planner inquiry cards with response forms.
- [x] **Profile (`FieldProfile.tsx`)**:
  - [x] Supervisor identity, site front assignment, switch role.

## 5. Senior Management Role (`/executive`, `/executive/exposure`, `/executive/provenance`)
- [x] **Overview (`ExecutiveOverview.tsx`)**:
  - [x] Executive summary strip (Progress %, Float consumption, Critical slippage, EVM variance).
  - [x] Cumulative EVM S-Curve chart (Planned vs Earned vs Forecast).
  - [x] Discipline execution summary table.
  - [x] Milestone timeline and What-If simulator.
- [x] **Exposure (`ExecutiveExposure.tsx`)**:
  - [x] Contractual dispute shield, delay impact breakdown.
- [x] **Provenance (`ExecutiveProvenance.tsx`)**:
  - [x] Data lineage breakdown (Field reports vs spreadsheets vs voice).

## 6. On-Demand "Ask NAVIS" Conversational AI Chatbot
- [x] **Universal Header Integration**: Labeled "Ask NAVIS" trigger button with Sparkles icon present across Field Supervisor, Project Manager, and Senior Management headers.
- [x] **Non-Intrusive Drawer / Modal (`AskNavisChat.tsx`)**:
  - [x] Desktop / tablet: Clean slide-out panel on the right (420px), dismissible with close button or Esc key.
  - [x] Mobile: Full-width responsive modal with touch targets >= 44px.
  - [x] Closed by default (never auto-opens, never interrupts work).
- [x] **Role-Specific Grounding & Starter Prompts**:
  - [x] Field Supervisor: Report guidance with ready-to-use example sentences, recent submission status lookups, and planner clarification tracking.
  - [x] Project Manager: Match justification explanation, critical path delay attribution, historical productivity benchmarks.
  - [x] Senior Management: Forecast completion dates with evidence coverage disclaimers, top exposure breakdown, and data reliability metrics.
- [x] **Actionable Interactions**:
  - [x] "Insert into report draft" action button for Field Supervisor (copies structured report text into Report Studio).
  - [x] Deep navigation links ("Open in Reconcile", "View in Schedule", "View Exposure Register", "View Data Lineage").
  - [x] Copy to clipboard control with instant visual feedback.
  - [x] Clear conversation thread control.
- [x] **Deterministic Read-Only Architecture (`/chat` & `/qa/ask`)**:
  - [x] Zero mutations: bot cannot alter actuals, approve matches, or modify baselines.
  - [x] Grounded citation tracking citing specific P6 activities, reports, and EVM data sources.
  - [x] Resilient offline fallback: when Ollama is unavailable, deterministic Python facts provide immediate answers.

## 7. Verification & Quality Gates
- [x] TypeScript compilation (`npx tsc --noEmit`) with 0 errors.
- [x] Complete Vitest test suite (`npm test -- --run`) with 100% pass rate (19 test files, 171 tests).
- [x] Backend Pytest suite (`pytest`) with 100% pass rate (1,196 tests passed, including new Ask NAVIS chat test suite).
- [x] Loading, empty, error, validation, and success state coverage on all redesigned views.
- [x] Visual verification of Light and Dark modes with ChatGPT/Codex minimalist palette.

