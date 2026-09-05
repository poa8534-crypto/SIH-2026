# NAVIS — 2-Minute Grand Finale Live Demo Script
**Problem Statement SIH26122** · Oil India Limited / Ministry of Petroleum and Natural Gas  
**Target Duration**: 120 Seconds (2 Minutes Flat)  
**Presenter Setup**: Laptop showing NAVIS Web App (`localhost:8000`), second presenter holding a mobile phone connected to the PWA.

---

## Chronological Timeline & Stage Cues

### [00:00 – 00:15] The Hook: The Ground Truth Problem
- **Presenter 1 (Voice)**:
  > *"Good morning, respected judges. In an Oil India EPC project in Upper Assam, project managers look at clean Primavera P6 schedules in the office, while supervisors in Duliajan deal with this: handwritten site diaries, heavy monsoons, and WhatsApp voice notes. NAVIS bridges this gap with zero AI hallucinations and mathematical rigor."*
- **Visual**:
  - Show the NAVIS landing screen with the project dashboard (`Sector A · Digboi Well #4`).

---

### [00:15 – 00:40] Scene 1: Multi-Format Ingestion & Field Speech
- **Presenter 2 (Mobile / Field Persona)**:
  - Open the **Field Agent** on the phone.
  - Speak or type in Hinglish:
    > *"Kal heavy rain ki wajah se trenching ruk gaya aur piping hydrotest ho gaya."*
  - Watch the conversational agent instantly parse:
    - Status: `completed` (hydrotest) & `blocked` (trenching).
    - Relative date: `kal` automatically resolved against project data-date (`2026-09-14`), not machine clock.
- **Presenter 1 (Laptop Screen)**:
  - Click on **Ingest**.
  - Drag and drop a scanned site diary PDF or CSV report (`daily_progress_report.pdf`).
  - System extracts tabular rows, equipment tags (`V-1101`, `PT-1201`), and parses quantities with 100% audit provenance.

---

### [00:40 – 01:05] Scene 2: Interactive Gantt & Dynamic CPM Float Analysis
- **Presenter 1**:
  - Navigate to **Schedule** (`/schedule`).
  - Toggle from **Table View** to **Gantt Chart View**.
- **Talking Track**:
  > *"Look at this dual-bar timeline. The top bar is our P6 baseline. The bottom bar is our earned actual progress. Notice this red border? That's our dynamic Critical Path. Our CPM forward/backward pass calculated that rain in Sector A consumed all 14 days of total float on activity PIP-UG-010. The float dashed connector line is gone — every subsequent day of slip now pushes the project completion milestone day-for-day."*
- **Visual Action**:
  - Click the **"Critical Path Only"** toggle — the Gantt smoothly filters to only the 12 critical activities governing project delivery.

---

### [01:05 – 01:30] Scene 3: The Contractor Dispute Shield (FIDIC Cl. 20.1)
- **Presenter 1**:
  - Click on **Delay Attribution / Dispute Shield** (`/delay`).
- **Talking Track**:
  > *"In PSU contracts, contractors lose genuine claims because of FIDIC Clause 20.1: delay notices must be served within 28 days of the event. NAVIS maintains an automated statutory countdown clock. Look at this entry: 18 days remaining to serve notice for client access hold-up. Notice our concurrent delay engine: it separates contractor welding defects from employer drawing delays during the same window, preventing bogus arbitration."*
- **Visual Action**:
  - Show the `28-Day Notice Clock` badge and the `Export Dispute Dossier` button.

---

### [01:30 – 01:50] Scene 4: Future Project Estimator & Institutional Memory v2
- **Presenter 1**:
  - Click on **Memory** (`/memory`) and switch to the **Tender Estimator** tab.
- **Talking Track**:
  > *"The second half of Oil India's problem statement asks: how do future projects learn from the past? NAVIS doesn't just store logs — it generates calibrated tenders. We select Piping, 50 spools, and toggle 'Upper Assam Monsoon'. Look at the results: P10 aggressive at 22 days, P50 realistic at 38 days, and a recommended tender duration of 47 days with 9 days of weather buffer. Down here is the empirical risk matrix from past Digboi delays, and right here is the Oracle Primavera P6 XML snippet ready to inject directly into tender schedules."*
- **Visual Action**:
  - Click **"Copy PMXML"** (shows green checkmark) and highlight the P10/P50/P90 cards.

---

### [01:50 – 02:00] The Mic-Drop Closing: Why We Win
- **Presenter 1**:
  > *"1,250 automated tests passing. Zero LLM math. Multi-format PDF OCR, Hinglish field capture, live dual-bar CPM Gantt, FIDIC dispute shielding, and empirical tender intelligence. NAVIS is not a student hackathon demo — it is an enterprise-grade capital project engine ready for deployment across Oil India Limited. Thank you!"*

---

## Presenter Checklist Before Taking the Stage
1. Ensure backend is running (`uvicorn server.main:app --port 8000`) or Docker container is active.
2. Open `http://localhost:8000/schedule` in Chrome and verify the Gantt chart renders cleanly.
3. Keep the `/memory` tab ready to switch to Tender Estimator with one click.
4. Have the sample PDF/CSV file ready in a folder for instant drag-and-drop into `/ingest`.
5. Rehearse the 120-second timing with a stopwatch.
