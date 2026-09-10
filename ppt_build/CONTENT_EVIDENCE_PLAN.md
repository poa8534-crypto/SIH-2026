# NAVIS presentation evidence plan

Prepared only as a content source while the editable PPTX template is unavailable. Do not assign these modules to slide numbers until the source deck has been inspected. The source deck's slide count, masters, layouts, placeholders, fonts, colours, logos, footer, and spacing must remain unchanged.

## Authority order

1. Current command output and current source code.
2. `METRICS.md` for metric definitions and evaluation caveats.
3. `NUMBERS_SHEET.md` for stage-safe wording.
4. Older research and pitch documents only after reconciliation against the sources above.

## Current verification on 2026-09-10

- Backend: `python -m pytest -q` completed with **1,202 passed** and no failures. The run emitted **69,523 warnings**, mostly repeated deprecation warnings. Do not hide the warning backlog if test quality is discussed.
- Frontend: Vitest JSON output records **224 passed**, **0 failed**, across **87 test suites**.
- TypeScript: `npm run lint` passed.
- Frontend build: `npm run build` passed. Vite warned that the main generated bundle is larger than 500 kB.
- Total passing automated tests from this run: **1,426**.
- **Re-counted later the same day: 1,431** (1,202 pytest + 229 vitest, 89 suites). The frontend gained five tests in the responsive-layout work (D-099). 1,431 is the current figure; 1,426 above is preserved as the record of the earlier run.
- Matcher: `python eval.py` reproduced the shipped v1 configuration on a held-out test split.

## Safe measured claims

| Claim | Exact wording | Evidence |
|---|---|---|
| Auto-link precision | **100.0%, 67 of 67 auto-links correct on this held-out test** | `python eval.py`, `METRICS.md` section 3.1 |
| Coverage | **43.5%, 67 of 154 mentions auto-linked** | `python eval.py` |
| Top-1 | **86.9%, 126 of 145 gold-positive mentions ranked first** | `python eval.py` |
| Planner-visible recall | **Recall@3 97.2%, 141 of 145, on the shipped v1 held-out test** | `python eval.py` output from 2026-09-10 |
| Review safety | **28 wrong suggestions were queued for review and never written** | `python eval.py` |
| Demo schedule | **120 activities** | `dataset/baseline_schedule.json`, `python eval.py` |
| Decision thresholds | **0.80 high, 0.40 low, margin 0.03** | `matching/config.py`, `python eval.py` |
| Tests | **1,426 passing: 1,202 backend and 224 frontend** | commands above |

Always add the scope beside a percentage. These figures describe the supplied synthetic evaluation corpus and do not establish accuracy on an unseen Oil India project.

## Safe implementation claims

- Ingests `.txt`, `.md`, `.log`, `.csv`, `.xlsx`, `.pdf`, `.png`, `.jpg`, and `.jpeg` through `extraction/extractor.py`.
- Reads JSON, Oracle P6 PMXML, and tabular XER baselines through `POST /schedule/import`. The import supports a dry run, preserves prior actuals, records a file hash, and rebuilds the matching index.
- Exports PMXML and a simplified project XER shape. Never describe the simplified XER writer as full P6 round-trip compatibility.
- Extracts tags, status, dates, quantities, and source position with deterministic rules. An optional language model may help interpret text but does not choose the schedule activity.
- Retrieves candidates using tag, BM25, and dense channels. The shipped decision uses score thresholds and a margin; uncertain cases go to a planner.
- Planner resolution is the only path that commits reviewed actual dates. The audit trail retains the source file and exact position where available.
- OCR exists for images and scanned content. Local Tesseract works only when installed. Gemini or OpenAI vision requires credentials, a network, and external data processing.
- The current application has 46 route decorators in `server/main.py`.

## Claims that must not appear

- No claim of real Oil India schedule-linking accuracy. The evaluation schedule and labels are synthetic.
- No claim of an offline-first or an offline event queue. There is no service worker or IndexedDB progress queue.
- No claim of authentication or production security. The login screen is a role picker; the server has no user authentication.
- No claim that the system learns from planner corrections. Corrections are stored, but the shipped matcher does not read them back.
- No claim of full Microsoft Project support. `.mpp` is unsupported.
- No claim that all OCR stays on-premise. Only local Tesseract can do that, and only when present.
- No claim that the LLM performs matching or improves accuracy. Shipped evaluation runs with it off.
- No claim that XER export is a full P6-valid round trip.
- No claim of empirical Assam monsoon multipliers. Any such factor is a labelled planning assumption.

## Content modules adaptable to the source template

These are modules, not assumed slides.

### Problem bridge

Minimal text: “Field updates arrive as reports, sheets, and speech. The schedule needs activity IDs and approved dates.”

Flow: field report or supervisor update → structured event → schedule candidate → reviewed actual.

### End-to-end workflow

Flow: ingest → extract facts with source position → retrieve three candidates → confidence gate → auto-link or planner review → append-only audit → schedule update.

### Technical approach

Left text block: supported inputs and core components. Main canvas: the workflow above. Small proof block: 100.0% auto-link precision, 43.5% coverage, 86.9% top-1, with “held-out synthetic test” visible.

### Human control

Flow: clear match → auto-link; close match → review; no safe match → new-activity review. State plainly that review protects the schedule from unsupported dates.

### Schedule integration

Flow: JSON / PMXML / XER → dry-run validation → active baseline → matching index → reviewed actuals → PMXML / simplified XER export.

### Evidence and failures

Use one compact evidence block and one honest limitation block. Evidence: 1,426 tests pass, build and type check pass. Limitations: synthetic labels, no authentication, no offline progress queue, external vision OCR needs a network, NO_MATCH remains weak, learning loop is open.

### Pilot proof

Label as a proposal, not a result: test one real customer export, independently label field statements, measure precision and coverage, then decide whether any automatic writeback is acceptable.

## Reference-slide design cues

The supplied winning-slide image is 16:9 and uses a fixed title bar, a narrow explanation column, a larger flowchart area, a small proof/caveat block, and a footer with slide number. Match only the content density and use of flowcharts. Do not copy its branding or redraw the missing NAVIS template from the screenshot.
