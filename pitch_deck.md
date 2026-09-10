# NAVIS — PSU Grand Finale Pitch Deck Specification

> ## ⚠ RETRACTED — DO NOT PRESENT FROM THIS FILE
>
> **This document is superseded and several of its claims are false.** It is kept only
> as a record of an earlier draft. An external review on 2026-09-10 read this file and
> reported these defects, all of which are confirmed:
>
> | Claim in this file | Reality in the code |
> |:---|:---|
> | "96.7% Top-1" | **86.9%** (126/145) on the shipped v1 held-out test; 71.4% on the v2 corpus |
> | "Offline-First PWA, local caching, offline voice queue" | **No service worker, no IndexedDB, no offline queue.** `Field.tsx` says so in a comment |
> | "Bi-directional Primavera P6 and MS Project" | **No `.mpp` support at all.** The XER writer emits a simplified shape that P6 will not import (D-047) |
> | "Dual-engine OCR for scanned diaries" | Wrappers exist; **there is not one scanned diary image in the benchmark**, and the cloud path needs a key and a network |
> | "The system learns from planner corrections" | Corrections are stored; `w_alias = 0.0`, so the matcher never reads them back (D-061) |
> | "1,250+ automated tests" | **1,431** (1,202 pytest + 229 vitest), re-counted 2026-09-10 |
>
> **What to present instead:** `NUMBERS_SHEET.md` for every figure,
> `deliverables/NAVIS_SIH2026_NamasteByte_FINAL.pptx` for the deck, and
> `research/JUDGE_DRILL_02_ANSWERS.md` for the Q&A. See D-102.

**Problem Statement SIH26122** · Ministry of Petroleum and Natural Gas / Oil India Limited (OIL)  
*AI-Powered EPC Project Progress Tracking & Institutional Memory System*

---

## Slide 1: The Oil India Reality (The Problem Ground Zero)
**Headline**: Oil India's Capital Projects Don't Suffer from Bad Scheduling. They Suffer from Information Loss Between Rig and Boardroom.

### Visual / Layout:
- **Left Column ("The Ground Reality")**: Photos/illustrations of Duliajan well sites, heavy rain, muddy access roads, handwritten supervisor pocket diaries, WhatsApp chat logs with voice notes like *"4 spools hydrotested at Sector 4, crane got stuck in mud"*, and mismatched vendor spreadsheets.
- **Right Column ("The Boardroom Dilemma")**: Executive Primavera P6 Gantt chart showing "85% on schedule", while the field is actually 6 weeks behind on the critical path.
- **The Core Metric**:
  - **₹100s of Crores** in contractual dispute claims annually across PSU upstream pipelines.
  - **FIDIC Clause 20.1 / Cl. 8.4 Time-Bar**: Contractors lose legitimate extension-of-time (EOT) claims because delay notices weren't served within the mandatory **28-day statutory window**.

### Presenter Talking Track (20 seconds):
> *"Honorable Jury, in Oil India's operational fields across Upper Assam, hundreds of millions in infrastructure capital are managed through two disjointed worlds: pristine Primavera schedules in the project office, and handwritten diaries or informal voice notes in the field. When monsoon hits or equipment breaks down, that information sits in a supervisor's notebook for weeks. By the time it reaches P6, the critical path has shifted, the contractor has missed the FIDIC 28-day notice deadline, and both owner and contractor head straight into arbitration. NAVIS solves this not with empty AI promises, but with deterministic engineering truth."*

---

## Slide 2: Why Generic LLMs Fail in PSU EPC (The Trap)
**Headline**: Hallucinated Dates & Invented Activity IDs Have No Place in FIDIC Arbitration.

### Comparison Table:
| Dimension | Generic LLM Chatbots (ChatGPT / Wrappers) | NAVIS Platform |
| :--- | :--- | :--- |
| **Activity Resolution** | Invented task IDs like `PIP-999` (Hallucinations) | **Deterministic Hybrid Matcher**: Strict tag exact-match + BM25 + Dense cosine, margin-guarded |
| **Schedule Math** | LLM computes finish dates (Random date guessing) | **Pure CPM Forward/Backward Pass**: Network floats and critical path calculated with zero LLM math |
| **Auditability** | Ephemeral chat tokens; non-reproducible | **Immutable Audit Ledger**: Every field reading points to exact PDF page, line, span, or audio hash |
| **Connectivity** | Requires persistent high-bandwidth cloud | **Offline-First PWA**: Progressive Web App with local caching and offline voice queue |
| **Model Failure Mode** | Fails completely if LLM is down or disconnected | **100% Deterministic Fallback**: System functions end-to-end with LLM unplugged |

### Key Callout Box:
> **NAVIS Law D-006**: *The Language Model is NEVER permitted to calculate project dates, compute float, or invent activity IDs. It extracts and clarifies; mathematics remains pure.*

---

## Slide 3: The NAVIS Hybrid Matcher Architecture
**Headline**: 96.7% Top-1 Precision Linking Chaotic Field Prose to Strict WBS Codes.

### Visual Architecture Diagram:
```
[ Field Input ] ─► [ Prepass & Sanitization ]
 (PDF / CSV /       • Equipment tags (V-1101, PT-1201)
  Speech / XLSX)    • Quantities & UOMs (40 m3, 6/18 nos)
                    • Dates & Multilingual Status (kal, ho gaya)
                           │
                           ▼
                 [ Multi-Stage Retriever ]
                 ┌───────────────────────────────────────┐
                 │ Stage 1: Tag Exact Match (100% conf) │
                 │ Stage 2: BM25 Lexical (WBS keywords)  │
                 │ Stage 3: Sentence-Transformer Cosine  │
                 └───────────────────────────────────────┘
                           │
                           ▼
                 [ Margin & Gate Verification ]
                 • High Confidence (≥0.85 & margin ≥0.15) ─► AUTO_LINK
                 • Close Contest (margin < 0.15)          ─► HUMAN REVIEW QUEUE
                 • Unmatched / Out-of-Scope               ─► NEW SCOPE PROPOSAL
```

### Key Differentiators:
1. **Never Silently Guesses**: If the top two candidate activities are separated by less than 0.15 confidence margin, NAVIS forces human planner review rather than guessing wrong.
2. **Standard Vocabulary**: Built against CFIHOS / JIP33 oil & gas taxonomy and ISO 14224 equipment classification.

---

## Slide 4: Multi-Format Ingestion Engine
**Headline**: Ingesting the Real Field: From Scanned Site Diaries to Hinglish Field Voice.

### Feature Showcase:
- **Scanned Diary & PDF OCR**:
  - Dual-engine OCR with automated scanned-page detection.
  - Digitizes skewed, stamp-covered daily progress reports, tabular logs, and field diary scans.
- **Multilingual Field Voice (Assam & North-East Ground Reality)**:
  - Supports Hindi, Hinglish, and Assamese operational phrasing (*"kal rain ki wajah se kaam ruk gaya"*, *"piping hydrotest shesh hoise"*).
  - Automatically resolves relative dates (`kal` = T-1, `parso` = T-2) relative to the project data-date, not machine clock.
- **Universal Spreadsheet Parser**:
  - Auto-detects delimiters (`,`, `;`, `\t`, `|`), resolves column aliases (`achieved_qty`, `done_m3`), and rejects non-data summary rows.

---

## Slide 5: Dual-Bar Interactive Gantt & Dynamic CPM Engine
**Headline**: Real-Time Network Analysis: Watch the Critical Path Shift as Floats Erode.

### Visual Elements:
- **Dual-Bar Schedule Visualization**:
  - **Top Bar**: Baseline Planned Schedule (Primavera P6 baseline import).
  - **Bottom Bar**: Actual & Earned Progress with dynamic percentage fill.
- **Critical Path Highlighting**:
  - Zero-float and negative-float paths highlighted in pulsing red.
  - Float slack connector dashed lines reveal exactly where delay is being absorbed before it penetrates the completion milestone.
- **Scale Switcher**: Instant transition between Compact, Standard, and Detailed day-level views.
- **Schedule Sync**: Zero-latency forward/backward CPM calculation with link confidence verification.

---

## Slide 6: Dispute Shield & Contractor Delay Attribution
**Headline**: Turning Subjective Arguments into Incontestable FIDIC Proof.

### The 4 Pillars of the Dispute Shield:
1. **FIDIC Clause 20.1 Statutory Notice Clock**:
   - Counts down the 28-day notice window from the first evidenced day of delay.
   - Status indicators: `SERVED`, `OPEN (X days remaining)`, or `LAPSED`.
2. **Baseline Float Split (Owner vs Contractor)**:
   - Evaluates whether delay consumed owner float or breached critical path.
   - Eliminates speculative time extension claims.
3. **Concurrent Delay Guard**:
   - Distinguishes employer-caused delays (access permits, drawing approvals) from contractor-caused delays (unmobilized labor, defective welding) during the same time window.
4. **Exportable Dispute Dossier**:
   - Single-click export of an audited PDF/CSV delay ledger citing exact source files and line numbers ready for arbitration or dispute adjudication boards (DAB).

---

## Slide 7: Institutional Memory v2 & Tender Intelligence
**Headline**: The Second Half of Problem Statement SIH26122: Learning from Past Projects.

### Interactive Tender Estimator:
- **Scope Parameters**:
  - Discipline & Activity Scope (Piping Spools, Tankage, Foundation Excavation, Loop Checking).
  - Target Quantities (e.g. 5,000 meters, 800 m3).
  - Regional & Season Factor: **Upper Assam Monsoon (+35% delay risk)**, Remote Drill Site (+20% logistics).
- **Outputs Built on Pure Historical Truth**:
  - **P10 / P50 / P90 Empirical Durations**: Confidence intervals computed from actual completion distributions, not guesswork.
  - **Verified Historical Productivity Rates**: e.g., `0.42 spools/day` derived from real field ledger measurements.
  - **Empirical Risk Contingency Matrix**: Exact probabilities and historical impact days for monsoons, crane breakdowns, and permit hold-ups.
- **Direct Primavera Export**:
  - One-click export of calibrated Oracle Primavera P6 PMXML `<Activity>` snippets to initialize realistic baseline tender schedules.

---

## Slide 8: Enterprise Integration & Grand Finale Roadmap
**Headline**: Ready for Immediate Deployment in Oil India Limited Environments.

### Deployment & Interoperability Architecture:
- **Enterprise Standards**:
  - Direct bi-directional compatibility with Oracle Primavera P6 (`.pmxml` and `.xer`) and MS Project.
  - Open RESTful API with automated OpenAPI / Swagger documentation.
- **Deployment Models**:
  - Single-command containerized Docker deployment (`docker-compose up`).
  - Deployable on PSU On-Premise Sovereign Cloud (NIC / OIL Data Center) with zero internet dependency.
  - Edge-capable PWA running on low-cost Android field tablets.
- **The Grand Finale Verdict**:
  - **1,250+ Automated Tests** (100% pass rate).
  - **Audited Mathematical Precision**.
  - **Zero Hallucination Tolerance**.
  - Built specifically for Oil India Limited.
