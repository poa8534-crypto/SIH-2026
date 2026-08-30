"""Build research/NAVIS_SIH_FINAL_REPORT.pdf from repository evidence.

Nothing invented: every number traces to research/data/*.json, eval.py output,
or the audited matrices in research/. Figure captions carry the evidence label.

Run:  python research/make_report.py
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image as PILImage

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GRAPHS = HERE / "graphs"
DESIGN = ROOT / "Design"
OUT = HERE / "NAVIS_SIH_FINAL_REPORT.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 2.0 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

INK = colors.HexColor("#1b1f24")
BLUE = colors.HexColor("#2f6f9f")
TEAL = colors.HexColor("#2a9d8f")
AMBER = colors.HexColor("#e9a13b")
RED = colors.HexColor("#c1553b")
MUTED = colors.HexColor("#6b737c")

# ── Styles ───────────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()

def st(name, **kw):
    return ParagraphStyle(name, parent=ss["Normal"], **kw)

S = {
    "title":  st("t",  fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=INK),
    "subtitle": st("st", fontName="Helvetica", fontSize=13, leading=18, textColor=MUTED),
    "h1": st("h1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=BLUE,
             spaceBefore=18, spaceAfter=8, keepWithNext=1),
    "h2": st("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INK,
             spaceBefore=12, spaceAfter=5, keepWithNext=1),
    "body": st("b", fontName="Helvetica", fontSize=9.5, leading=13.8, alignment=TA_JUSTIFY,
               spaceAfter=6),
    "bullet": st("b", fontName="Helvetica", fontSize=9.5, leading=13.5, leftIndent=14,
                 spaceAfter=3),
    "caption": st("c", fontName="Helvetica-Oblique", fontSize=8.2, leading=11,
                  textColor=MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=10),
    "small": st("sm", fontName="Helvetica", fontSize=8.2, leading=11, textColor=MUTED),
    "cell": st("cell", fontName="Helvetica", fontSize=8.2, leading=10.5),
    "callout_body": st("cob", fontName="Helvetica", fontSize=9.3, leading=13.5,
                       alignment=TA_LEFT, spaceAfter=2),
    "tocH": st("toch", fontName="Helvetica-Bold", fontSize=18, leading=24, textColor=BLUE,
               spaceAfter=12),
    "big": st("big", fontName="Helvetica-Bold", fontSize=13, leading=18,
              alignment=TA_CENTER, textColor=INK),
}

STATUS_COLORS = {
    "IMPLEMENTED": TEAL, "PARTIAL": AMBER, "DEFECT": colors.HexColor("#7a5c9e"),
    "MOCKED": BLUE, "NOT FOUND": RED, "MISSING": RED, "DEMO/MOCK": BLUE,
    "NOT_REQUIRED_FOR_MVP": colors.HexColor("#8a949c"),
}

fig_no = [0]
tab_no = [0]

def _resolve_img(path: str) -> Path:
    p = Path(path)
    if p.is_absolute() and p.exists():
        return p
    for base in (GRAPHS, ROOT, HERE, DESIGN, ROOT / "dataset"):
        cand = base / path
        if cand.exists():
            return cand
    cand = DESIGN / path
    if cand.exists():
        return cand
    raise FileNotFoundError(path)

def fig(path: str, caption: str, width: float = CONTENT_W):
    """Image + numbered caption, kept together. Aspect ratio preserved."""
    p = _resolve_img(path)
    fig_no[0] += 1
    with PILImage.open(p) as im:
        w, h = im.size
    w_pt = min(width, CONTENT_W)
    h_pt = w_pt * h / w
    max_h = PAGE_H - 2 * MARGIN - 2.4 * cm
    if h_pt > max_h:
        h_pt = max_h
        w_pt = h_pt * w / h
    img = Image(str(p), width=w_pt, height=h_pt)
    cap = Paragraph(f"<b>Figure {fig_no[0]}.</b>  {caption}", S["caption"])
    return KeepTogether([Spacer(1, 4), img, cap])

def table(header_row, body_rows, caption, col_widths=None, status_col=None):
    """Numbered data table with a caption; status_col cells are colour-coded."""
    tab_no[0] += 1
    data = [header_row] + body_rows
    rows = []
    for i, r in enumerate(data):
        line = []
        for j, c in enumerate(r):
            if i == 0:
                line.append(Paragraph(f"<font color='white'><b>{c}</b></font>", S["cell"]))
            elif status_col is not None and j == status_col:
                col = STATUS_COLORS.get(str(c), INK)
                line.append(Paragraph(f"<b>{c}</b>", st("x", textColor=col, fontSize=8.2,
                                                        leading=10.5)))
            else:
                line.append(Paragraph(str(c), S["cell"]))
        rows.append(line)
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c9d2da")),
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fb")]),
    ]))
    cap = Paragraph(f"<b>Table {tab_no[0]}.</b>  {caption}", S["caption"])
    return [KeepTogether([t, cap])]

def callout(title, body, color=TEAL, bg="#f2f9f7"):
    inner = [
        Paragraph(f"<b>{title}</b>", st("cot", fontName="Helvetica-Bold", fontSize=9.5,
                                        textColor=color, spaceAfter=3)),
        Paragraph(body, S["callout_body"]),
    ]
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
        ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [t, Spacer(1, 8)]

def bullets(items):
    return [Paragraph(f"• {x}", S["bullet"]) for x in items]

def P(text):
    return Paragraph(text, S["body"])

def H1(text):
    return Paragraph(text, S["h1"])

def H2(text):
    return Paragraph(text, S["h2"])

# ── Document template with TOC + page numbers ───────────────────────────────

class ReportDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "h1":
            self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))

def _footer(canvas, doc):
    if doc.page == 1:
        return
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 1.1 * cm, "NAVIS — SIH 2026 Final Report · PS 26122")
    canvas.drawRightString(PAGE_W - MARGIN, 1.1 * cm, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#c9d2da"))
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 1.35 * cm, PAGE_W - MARGIN, 1.35 * cm)
    canvas.restoreState()

doc = ReportDoc(str(OUT), pagesize=A4,
                leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=1.7*cm,
                title="NAVIS — SIH 2026 Final Report", author="NAVIS team")
frame = Frame(MARGIN, 1.7 * cm, CONTENT_W, PAGE_H - MARGIN - 1.7 * cm, id="f")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=lambda c, d: None),
    PageTemplate(id="main", frames=[frame], onPage=_footer),
])

story = [NextPageTemplate("main")]

# ── 1. COVER ─────────────────────────────────────────────────────────────────
story += [Spacer(1, 5.2 * cm),
          Paragraph("NAVIS", S["title"]),
          Spacer(1, 0.3 * cm),
          Paragraph("The Planning-to-Execution Bridge for Infrastructure Projects",
                    st("cov", fontName="Helvetica", fontSize=16, leading=22, textColor=BLUE)),
          Spacer(1, 1.4 * cm),
          Paragraph("Final Research &amp; Engineering Report", S["subtitle"]),
          Paragraph("Smart India Hackathon 2026 · Problem Statement 26122 · "
                    "Intelligent Data Capture &amp; Schedule-Linking Layer", S["subtitle"]),
          Spacer(1, 2.2 * cm)]
cov = Table([
    ["Evidence discipline", "every measured number traces to a runnable harness in research/data/"],
    ["Component statuses", "audited against code — research/NAVIS_TECHNICAL_AUDIT.md"],
    ["Rubric content", "clearly labelled as judgement, never presented as measurement"],
], colWidths=[4.0 * cm, CONTENT_W - 4.0 * cm])
cov.setStyle(TableStyle([
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
    ("TEXTCOLOR", (0, 0), (0, -1), BLUE), ("TEXTCOLOR", (1, 0), (1, -1), MUTED),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LINEABOVE", (0, 0), (-1, 0), 0.6, colors.HexColor("#c9d2da")),
    ("LINEBELOW", (0, -1), (-1, -1), 0.6, colors.HexColor("#c9d2da")),
]))
story += [cov, Spacer(1, 1.2 * cm),
          Paragraph("Self-contained: this report can be read without opening the source code. "
                    "Repository evidence is cited in every section.", S["small"]),
          PageBreak()]

# ── TABLE OF CONTENTS ────────────────────────────────────────────────────────
toc = TableOfContents()
toc.levelStyles = [ParagraphStyle("toc1", fontName="Helvetica", fontSize=9.5, leading=15.5,
                                  leftIndent=6, firstLineIndent=-6)]
story += [Paragraph("Contents", S["tocH"]), toc, PageBreak()]

# ── 2. EXECUTIVE SUMMARY ─────────────────────────────────────────────────────
story += [H1("1.  Executive summary"),
    P("NAVIS is a working planning-to-execution bridge for infrastructure projects. "
      "It ingests heterogeneous field inputs — free-text daily progress reports (DPRs), "
      "discipline spreadsheets, and a conversational supervisor agent — extracts "
      "activity-level actual start/finish events with per-event provenance, links them to "
      "L5/L6 schedule activities with a measured confidence score, and writes the schedule "
      "back with a full append-only audit trail. Anything it is not sure about goes to a "
      "planner review queue instead of the schedule."),
    P("The matching engine is <b>measured</b>, not claimed: on 242 gold-positive mentions "
      "against a 120-activity schedule it reaches <b>87.2% Top-1 accuracy</b>, and at the "
      "shipped operating point (tau_high = 0.775) it auto-links <b>50.4% of all mentions "
      "with 100.0% precision — zero wrong auto-links</b>. A wrong auto-link corrupts the "
      "schedule; a review item only costs a planner about 10 seconds. The policy is "
      "calibrated on that asymmetry, and the precision/coverage curve behind it is "
      "measured, not asserted."),
]
story += callout("Headline measured results (eval.py — 254 labelled mentions)",
    "Top-1 accuracy <b>87.2%</b> · auto-link precision <b>100.0%</b> at 50.4% coverage · "
    "suggestion precision 83.1% / recall 85.5% · end-to-end latency 266 events in 1.86 s "
    "(~7 ms/event) · cold start 4.4 s once per process. Ablations, the BM25-vs-hybrid gate "
    "curve and the dense-feature fix are all reproduced from research/data/.")
story += [
    P("Institutional memory — the half of the problem statement competitors skip — is "
      "implemented: actual-vs-planned durations, discipline slip, recurring delay causes "
      "and suggested durations, computed live from captured execution data with sample "
      "sizes shown rather than hidden. Equally important is what NAVIS does <i>not</i> "
      "claim: there is no OCR, no Primavera import (export only), no authentication, and "
      "the alias learning loop is write-only today. These limitations are named here and "
      "in every summary chart, because a claim that survives a judge's probe is worth "
      "more than one that does not."),
]

# ── 3. SIH PROBLEM STATEMENT ─────────────────────────────────────────────────
story += [H1("2.  SIH problem statement"),
    P("<b>PS 26122 — Intelligent Data Capture &amp; Schedule-Linking Layer for Infrastructure "
      "Project Management: Real-Time Actual Progress Tracking (Planning-to-Execution "
      "Bridge).</b> Infrastructure schedules cascade from macro milestones (L1) down to "
      "micro, executable activities (L5/L6) across civil, piping, equipment, electrical, "
      "instrumentation and HSE disciplines. The baseline plan is well-structured in "
      "Primavera/MS Project, but actual execution flows back through daily progress "
      "reports, site diaries, discipline spreadsheets and verbal supervisor updates — each "
      "in its own format, largely disconnected from the L5/L6 activity IDs in the plan."),
    P("The PS asks for five things: (1) ingest heterogeneous inputs and extract "
      "activity-level actual start/end events; (2) an LLM-based conversational or voice "
      "'time agent' for site supervisors; (3) fuzzy-match extracted descriptions to the "
      "correct L5/L6 node, handling terminology and granularity mismatches, flagging "
      "unmatched/new activities rather than dropping them; (4) auto-update actual dates "
      "with a confidence score and audit trail per entry; and (5) a clean, "
      "discipline-tagged progress dataset feeding both live analytics and a queryable "
      "institutional-memory repository. A prototype demonstrating 2–3 input formats, "
      "extraction and schedule-linking is deemed ideal; full production OCR/ASR is "
      "explicitly <i>not</i> required."),
]

# ── 4. REAL-WORLD PROBLEM ────────────────────────────────────────────────────
story += [H1("3.  The real-world problem"),
    P("On a real EPC site, the plan and the truth about the plan live in different worlds. "
      "The schedule is precise: <i>“Erect Line 24\"-P-1001-A1A, Unit 2 rack, planned "
      "2026-03-04 → 03-09, 120 M”</i>. The field says: <i>“spool erection on the 24 inch "
      "header is done, 6 nos”</i> — spoken, not typed; mangled by speech recognition; with "
      "no activity ID, no agreed date format, and no agreed unit."),
]
story += bullets([
    "<b>Fragmentation.</b> Each discipline reports in its own format and cadence; the same "
    "physical progress is described differently by piping, civil and electrical crews.",
    "<b>Latency.</b> Manual reconciliation with the baseline lags the schedule update cycle "
    "by days or weeks, so every downstream analysis inherits stale data.",
    "<b>Granularity mismatch.</b> Field work is often more granular than the planned WBS: "
    "many field mentions roll up into one L5/L6 node.",
    "<b>Lost knowledge.</b> When a project closes, real durations, bottlenecks and delay "
    "causes stay locked in supervisors' heads and paper records — not queryable.",
    "<b>Asymmetric error cost.</b> A missed update is an annoyance; a wrong actual date "
    "silently corrupts the schedule and every forecast built on it.",
])

# ── 5. SOLUTION OVERVIEW ─────────────────────────────────────────────────────
story += [H1("4.  NAVIS solution overview"),
    P("NAVIS is one FastAPI service plus a two-role React UI, organised around a single "
      "spine: <b>every schedule-relevant fact carries its provenance, its confidence and "
      "its audit trail</b>. Two roles share one database: the planning engineer ingests "
      "files and adjudicates the review queue; the field supervisor logs progress by "
      "talking or typing."),
]
story += bullets([
    "<b>Ingest</b> — POST /ingest accepts DPR text, spreadsheets and agent turns; "
    "byte-identical content is refused by sha256; each upload becomes a job record.",
    "<b>Extract</b> — a deterministic regex pre-pass owns tags, dates, quantities and units; "
    "an optional LLM (off by default) may only read intent out of informal prose.",
    "<b>Link</b> — hybrid retrieval (exact tag + BM25 + dense MiniLM, fused by RRF) feeds a "
    "6-feature scorer and a calibrated decision policy: AUTO_LINK, REVIEW, NEW_ACTIVITY.",
    "<b>Reconcile</b> — planners see every suggestion with its evidence and one-key confirm; "
    "clarifications can be sent back to the supervisor who raised the item.",
    "<b>Remember</b> — every decision appends to an immutable audit trail and feeds the "
    "institutional-memory queries: durations, delays, productivity, suggested durations.",
])
story += [fig("Design/navis_role_selection_desktop_final/screen.png",
              "Role selection — the entry point of the two-role React UI (planning engineer / "
              "field supervisor). Design mockup from Design/; illustrative data, not a live "
              "screenshot.", width=15.2 * cm)]

# ── 6. ARCHITECTURE ──────────────────────────────────────────────────────────
story += [H1("5.  Current system architecture"),
    P("The architecture keeps <b>retrieval and ranking deliberately separate</b>: retrieval "
      "is recall-oriented (cast a wide top-20 net), ranking is precision-oriented (feature "
      "scoring). Merging both into one opaque LLM call would destroy explainability and "
      "the audit trail. Solid stages in Figure 1 are deterministic and always on; the "
      "dashed LLM is optional and off by default (EXTRACTION_PROVIDER=rules)."),
]
story += [fig("architecture_pipeline.png",
              "NAVIS pipeline as implemented — audited against matching/, extraction/, server/ "
              "and frontend/src on this branch (AUDITED + MEASURED). Note the three decision "
              "outcomes, the 'nothing is written by the LLM' rule, and the red learning-loop "
              "box: the alias lexicon is written but never read back — a named gap.")]
story += [P("Two structural choices matter for the demo story: <b>retrieval and ranking are "
      "separate stages on purpose</b> (separating recall from precision keeps every match "
      "explainable), and <b>the LLM never touches the schedule</b> — every schedule "
      "mutation flows through the deterministic roll-up or a planner resolution endpoint.")]

# ── 7. END-TO-END DATA FLOW ──────────────────────────────────────────────────
story += [H1("6.  Complete end-to-end data flow"),
    P("One DPR sentence — <i>“Erection of 24\"-P-1001-A1A completed 6 out of 18 spools”</i> — "
      "traces through the system as follows (each step names its code location):"),
]
story += bullets([
    "<b>1 · Ingest.</b> POST /ingest stores the file, sha256-dedups byte-identical content, "
    "creates a Job row (server/main.py).",
    "<b>2 · Pre-pass.</b> Regex extracts the tag 24\"-P-1001-A1A, the year-less date (resolved "
    "against the report's own header date), the fraction 6/18 and the unit — each with its "
    "character span (extraction/prepass.py).",
    "<b>3 · Event.</b> An ExtractedEvent is formed: status FINISH, discipline PIPING, "
    "provenance = file + line + span (extraction/extractor.py, models.py).",
    "<b>4 · Retrieval.</b> The tag channel, BM25 and MiniLM each propose candidates; weighted "
    "RRF fuses them into a top-20 pool, keeping per-channel provenance (matching/retrieval.py).",
    "<b>5 · Scoring.</b> Six features per candidate — tag overlap, discipline agreement, date "
    "proximity, predecessor plausibility, fuzzy similarity, embedding cosine — blend with "
    "renormalised weights (matching/features.py).",
    "<b>6 · Decision.</b> AUTO_LINK if score ≥ 0.775 with margin ≥ 0.03 and no discipline "
    "conflict; NEW_ACTIVITY if score &lt; 0.5; REVIEW otherwise (matching/engine.py).",
    "<b>7 · Roll-up.</b> Mentions accumulate on the node: 6/18 = 33% complete; Actual Finish is "
    "withheld until 100%; earliest start / latest finish wins; disagreements are recorded, "
    "not silently resolved (matching/engine.py).",
    "<b>8 · Persist + audit.</b> The schedule row updates; an append-only AuditRecord stores "
    "field, old→new, source file + line, confidence, and whether a planner confirmed it.",
])

# ── 8. INGESTION ─────────────────────────────────────────────────────────────
story += [H1("7.  Data ingestion pipeline"),
    P("The seeded corpus is exactly what the PS recommends: eleven DPR text files (including "
      "one deliberately messy file, dpr_day_11_messy.txt) and two discipline spreadsheets — "
      "13 files, 266 events. Ingest is synchronous: the PS's “near real time” is delivered "
      "as <b>on-submission</b>, with no queues or workers to fail on stage."),
]
story += table(
    ["Input", "Handler", "Key behaviours"],
    [["DPR free text (.txt)", "extraction/textio.py → extractor.py",
      "encoding chain utf-8-sig → cp1252 → latin-1 (zero U+FFFD in the database); "
      "year-less dates resolved against the report header date, ambiguous beyond ±183 d flagged"],
     ["Discipline spreadsheets (.xlsx)", "extraction/spreadsheet.py",
      "merged-header tolerant; column semantics mapped per discipline; row-level provenance"],
     ["Conversational agent turn", "server/agent_slots.py",
      "slot-filling for discipline, location, status, date, completed + planned quantity; "
      "every value re-validated by deterministic parsers"],
     ["Browser speech-to-text", "frontend/src/hooks/useSpeech.ts",
      "Web Speech API with transcript review; typed fallback verified end-to-end"],
     ["Scanned diaries / OCR", "—", "NOT FOUND in the repo (PS waives production OCR)"]],
    "Ingestion surfaces and their guarantees.", status_col=None)
story += [fig("Design/planning_engineer_ingest/screen.png",
              "Planning engineer — Ingest screen. Design mockup; the shipped UI follows this "
              "layout (frontend/src/pages/Ingest.tsx).", width=15.2 * cm)]

# ── 9. EXTRACTION PIPELINE ───────────────────────────────────────────────────
story += [H1("8.  Extraction pipeline"),
    P("The extraction design answers one question well: <b>what is the LLM actually for?</b> "
      "Regex is excellent at tags, dates, quantities and units — so a deterministic "
      "pre-pass owns all of them, with character-span provenance on every fragment. The "
      "LLM is used only where regex is weak — reading intent out of informal prose — and "
      "is structurally prevented from inventing the fields that reach the schedule: it is "
      "never asked for dates or tags-as-truth (extraction/llm_backend.py)."),
]
story += table(
    ["Extraction stage", "Owner", "Notes"],
    [["Tags (pipe/equipment/instrument)", "regex pre-pass", "24\"-P-1001-A1A, V-101, PSV-01 patterns; feed the near-decisive tag_overlap feature"],
     ["Dates (explicit, ISO, year-less, relative)", "regex pre-pass", "year-less dates resolved against the report's own header date; ambiguous ones flagged, not guessed"],
     ["Forecast-vs-actual guard", "regex + extractor", "planned/forecast language can never write an actual date; tested in extraction/test_llm_guards.py"],
     ["Quantities, units, percentages", "regex pre-pass", "“6 out of 18” stored as completed 6, planned 18 — the denominator decides completion"],
     ["Discipline + status intent", "LLM (optional)", "enum-constrained output; off by default; deterministic inference when off"],
     ["Provenance", "all stages", "file + line/row + character span on every event"]],
    "Extraction responsibilities: deterministic where the data is structured, LLM only for intent.",
    status_col=None)
story += callout("Prompt-injection posture (extraction path)",
    "The LLM sees prepass-enriched text but its output is schema-validated (Pydantic, "
    "extra='forbid'), enum-constrained, and re-validated by the same deterministic parsers "
    "before use; it supplies no dates and no tags. A malicious DPR can at worst distort "
    "intent classification — the fields that reach the schedule remain regex-owned.",
    color=AMBER, bg="#fdf9f0")

# ── 10. MATCHING ENGINE ──────────────────────────────────────────────────────
story += [H1("9.  Schedule-linking / matching engine"),
    P("The engine (matching/engine.py) consumes ExtractedEvents and returns a LinkDecision "
      "with a ranked candidate list, per-channel retrieval sources, per-feature scores and "
      "a written rationale. The decision rule is precision-first:"),
]
story += table(
    ["Outcome", "Condition", "Consequence"],
    [["AUTO_LINK", "score ≥ 0.775 AND margin(top1, top2) ≥ 0.03 AND no discipline conflict",
      "written to the schedule automatically; measured 100% precision"],
     ["REVIEW", "everything in between — including a high score with an ambiguous margin",
      "planner queue with evidence; ~10 s per item; clarification can be sent back to the field"],
     ["NEW_ACTIVITY", "top-1 score &lt; 0.5", "unplanned scope surfaced for the planner — never silently dropped"]],
    "The three-outcome decision policy (matching/models.py Thresholds: tau_high=0.775, "
    "tau_low=0.5, margin_min=0.03).", status_col=0)
story += [P("A domain-specific rule sits at decision time: <b>the line lock</b>. A full "
      "line+size+spec tag match resolving to a unique schedule activity floors the score "
      "at 0.93 — the line number pins the node almost by itself — and any line-locked "
      "candidate floors just above tau_low, so the engine can never call identified-scope "
      "work NEW_ACTIVITY (matching/features.py, blend_with_line_lock).")]

# ── 11. HYBRID RETRIEVAL ─────────────────────────────────────────────────────
story += [H1("10.  Hybrid retrieval explanation"),
    P("Three channels retrieve a candidate pool; weighted reciprocal-rank fusion (k=60) "
      "combines them into a top-20 set. The tag channel dominates deliberately: a matching "
      "line number is near-decisive evidence and must anchor the pool."),
]
story += table(
    ["Channel", "Weight", "Role", "Measured"],
    [["TAG (exact tag)", "1.0", "anchor: line numbers resolve activity identity", "alone: Top-1 only 4.9% — tags identify, they don't rank"],
     ["BM25 (lexical)", "0.7", "terminology overlap: 'spool erection' ↔ 'Erect Line…'", "alone: Top-1 93.8%, best ranker"],
     ["DENSE (MiniLM, local)", "0.7", "paraphrase beyond shared words", "alone: Top-1 88.8%; R@20 100%"],
     ["Fusion (RRF k=60)", "—", "top-20 pool with per-channel provenance", "R@20 100% (ablation.json)"]],
    "Retrieval channels and their measured contributions (research/data/ablation.json).",
    status_col=None)

# ── 12. CONFIDENCE SCORING & RECONCILIATION ─────────────────────────────────
story += [H1("11.  Confidence scoring and reconciliation"),
    P("Confidence is a weighted blend over the features that are actually present; absent "
      "signals are excluded and the weights renormalise rather than penalising (None means "
      "'no evidence', not 'evidence against'). Discipline mismatch scores 0.3, not 0 — an "
      "inference error must not nuke a true match."),
]
story += table(
    ["Feature", "Weight", "What it encodes"],
    [["tag_overlap", "0.32", "exact/near-exact tag match; line+size+spec sets line_locked"],
     ["embedding_cosine", "0.22", "MiniLM cosine similarity"],
     ["fuzzy_similarity", "0.20", "rapidfuzz token-set ratio vs description and extended description"],
     ["date_proximity", "0.10", "reported date inside the planned window (+3/−10 d grace), exponential decay beyond"],
     ["discipline_agreement", "0.06", "soft signal — inference from field text is noisy"],
     ["predecessor_plausibility", "0.06", "is the activity logically startable at the reported date?"],
     ["line lock (decision-time)", "floor 0.93 / 0.46", "unique line match / any line-locked candidate"]],
    "Feature weights (matching/features.py FEATURE_WEIGHTS) and the line-lock rule.",
    status_col=None)
story += [P("Reconciliation across sources is governed by explicit rules rather than silence: "
      "<b>earliest start wins, latest finish wins, an explicit assertion beats a bare "
      "reported date</b>; quantity-based roll-up writes Actual Finish only at 100% of "
      "planned quantity (a partial-scope finish assertion is withheld and reported); "
      "disagreements between sources are recorded as conflicts for the planner "
      "(25 conflicts surfaced on the seeded corpus, 21 of them spreadsheet-vs-DPR).")]

# ── 13. HUMAN-IN-THE-LOOP ────────────────────────────────────────────────────
story += [H1("12.  Human-in-the-loop workflow"),
    P("The review queue is the system's safety valve and its learning surface. Items land "
      "there with full evidence: the source text with the matched span highlighted, the "
      "extracted entities, the ranked candidate activities with confidence, and the review "
      "reason. The planner confirms, reassigns, flags unscheduled work, or rejects — and "
      "can send a clarification back to the supervisor who raised the item, closing the "
      "loop at the field level."),
]
story += [fig("Design/planning_engineer_reconcile/screen.png",
              "Planning engineer — Reconcile screen with source evidence, extracted entities and "
              "candidate activities. Design mockup (illustrative data such as 'ACT-M-4012' and "
              "'113 PENDING' are from the design phase; the shipped queue in the seeded run "
              "holds 118 items).", width=15.6 * cm)]

# ── 14. HIGH VS LOW CONFIDENCE ───────────────────────────────────────────────
story += [H1("13.  High-confidence vs low-confidence handling"),
    P("The threshold is a measured operating point, not a guess. Raising tau_high trades "
      "coverage for precision; 0.775 is the first point where a wrong auto-link stops "
      "happening entirely — at the cost of pushing more items to review. Below it, "
      "coverage climbs (72.4% at 0.55) but precision drops to 92.4%: the schedule starts "
      "absorbing errors."),
]
story += [fig("operating_point_and_latency.png",
              "Left: precision-at-coverage sweep of tau_high from eval.py — the shipped "
              "tau_high=0.775 (MEASURED). Right: end-to-end latency per file, extraction vs "
              "retrieval+scoring (research/data/latency.py, MEASURED); 266 events in 1.86 s, "
              "cold start 4.4 s once per process.")]
story += [P("High-confidence items never touch a human; low-confidence items cost a planner "
      "about 10 seconds each (121 review items on the seeded corpus, ~20 minutes of "
      "planner time for 254 mentions). The demo rehearsal resets to this exact state with "
      "scripts/demo_reset.ps1 and verifies the summary line before the run.")]

# ── 15. UNMATCHED / NEW ACTIVITY ─────────────────────────────────────────────
story += [H1("14.  Unmatched / new activity handling"),
    P("Work that does not belong to any planned node is a finding, not noise. NEW_ACTIVITY "
      "surfaces it to the planner (who can create an activity or discard it explicitly); "
      "REVIEW items can be flagged as unscheduled work. Nothing is silently dropped — the "
      "PS asks for exactly this."),
    P("<b>Honest weakness:</b> NO_MATCH rejection is only <b>8.3% (1 of 12)</b> — most "
      "garbage lands in REVIEW rather than being refused outright. That is the safe "
      "failure direction (a human sees it) but it costs review-queue time; tightening it "
      "is listed under recommended improvements."),
]

# ── 16. DATABASE / DATA LIFECYCLE ────────────────────────────────────────────
story += [H1("15.  Database and data lifecycle"),
    P("Single-file SQLite via SQLAlchemy (server/db.py): activities, linked_events, "
      "review_queue (+ clarification columns), alias_lexicon, audit_records, jobs. The "
      "lifecycle is ingest → extract → link → (auto-write or review) → audit, and every "
      "write is attributable."),
]
story += bullets([
    "<b>Append-only audit.</b> AuditRecord rows are never mutated; corrections append. The "
    "audit drawer shows every write to an activity: field, old→new, source file and exact "
    "line/row, confidence, auto vs planner-confirmed. Where no single line applies it says "
    "“no single line” rather than inventing one (DEMO.md §4).",
    "<b>Demo reset that survives schema change.</b> scripts/reset_demo.py clears rows (no "
    "file deletion, works while the server runs) and rebuilds the schema when model columns "
    "differ — SQLAlchemy's create_all never adds missing columns, a mid-demo failure mode "
    "caught during testing.",
    "<b>Integrity rules.</b> No Actual Start after the data date (hard block); no Actual "
    "Finish before Actual Start (hard block); predecessor-not-started warns without "
    "blocking (server/main.py).",
])

# ── 17. SECURITY ARCHITECTURE ────────────────────────────────────────────────
story += [H1("16.  Security architecture"),
    P("Stated plainly: <b>the MVP has no authentication, no TLS, no multi-tenancy</b>. Any "
      "caller can POST /ingest or resolve a review item; the API trusts its network. This "
      "is scored honestly at 4.5/10 in the judge analysis (risk R9) and is the first "
      "production item. What the MVP does provide is <i>integrity machinery</i> that "
      "production security will stand on: append-only audit, sha256 dedup, per-write "
      "provenance, hard date-integrity blocks, and an extension allow-list on upload."),
]

# ── 18. PROMPT-INJECTION PROTECTION ─────────────────────────────────────────
story += [H1("17.  Prompt-injection protection"),
    P("NAVIS's defence is architectural: untrusted field text is processed by regex that "
      "cannot be talked out of its patterns, and the LLM — when enabled — is a bounded, "
      "read-only intent classifier whose output is re-validated before it may touch state."),
]
story += bullets([
    "The LLM output schema asks for <b>no dates and no tags-as-truth</b>; both stay "
    "regex-owned (extraction/llm_backend.py).",
    "Pydantic validation with extra='forbid'; enum-constrained discipline/status so a "
    "jailbroken output cannot inject out-of-vocabulary values.",
    "Every LLM value is re-validated by the same deterministic parsers before use.",
    "Voice-agent path: bounded timeout (5 s, one attempt, no retry), silent fallback that "
    "keeps all collected slots (server/agent_llm.py); a stalled executor is shut down "
    "without waiting — a bug found and fixed in testing.",
    "Slot parsing accepts only validated choices; unknown values fail tests, not the demo "
    "(discipline_label() raises on unknown enum).",
])
story += callout("Residual risk, stated",
    "A crafted DPR could still steer intent classification (e.g. mislabel a discipline). "
    "Because the fields that reach the schedule are regex-owned and every write is "
    "audited with provenance, the worst case is a wrong REVIEW suggestion — visible, "
    "attributable and reversible, never a silent schedule corruption.", color=RED,
    bg="#fdf3f0")

# ── 19. AUDIT TRAIL ──────────────────────────────────────────────────────────
story += [H1("18.  Audit trail"),
    P("Every actual-date write appends an immutable AuditRecord: which field changed, the "
      "old value, the new value, the source file <b>and the exact line or spreadsheet row</b>, "
      "the confidence at write time, and whether it was applied automatically or confirmed "
      "by a planner. A worked example from a real run: confirming one item produced four "
      "audit records on PIP-SPL-1028, three citing piping_progress.xlsx row 10. The "
      "append-only property is stated in the UI itself."),
]

# ── 20. INSTITUTIONAL MEMORY ─────────────────────────────────────────────────
story += [H1("19.  Institutional memory"),
    P("The PS names institutional memory a co-equal outcome, and NAVIS treats it as "
      "primary: GET /memory/query computes, from captured execution data alone — planned "
      "vs actual duration by activity type (worst overrun first), slip by discipline, "
      "recurring delay causes with occurrence counts and days lost, and a suggested "
      "duration for future planning (requires ≥ 2 completions; e.g. PIP-HYT: baseline 5 d, "
      "suggested 6 d, based on 3 completed of 5)."),
]
story += [fig("Design/planning_engineer_memory/screen.png",
              "Planning engineer — Memory screen: execution patterns become planning inputs. "
              "Design mockup; the shipped screen shows the same four panels with sample sizes "
              "visible.", width=15.2 * cm)]
story += callout("Sample size, shown not hidden",
    "47 of 120 activities have both an actual start and finish. Every memory panel prints "
    "its own n and says “no completed work yet” in words rather than drawing an empty bar. "
    "The architecture is the contribution; the sample grows with every real ingest.",
    color=AMBER, bg="#fdf9f0")

# ── 21. ANALYTICS ────────────────────────────────────────────────────────────
story += [H1("20.  Analytics"),
    P("The clean, discipline-tagged, provenance-bearing event dataset serves the PS's "
      "purpose (a): live input for performance analytics. Implemented today: duration "
      "overruns by activity type, productivity by discipline, keyword-matched delay causes "
      "with days lost, quantity-based % complete per node, and cross-source conflict "
      "surfaces. Forecasting / risk-pattern discovery is future work — the dataset design "
      "anticipates it but no forecasting model exists in the repo."),
]

# ── 22. COMPETITOR ANALYSIS ──────────────────────────────────────────────────
story += [H1("21.  Competitor analysis"),
    P("Competitor cells are <b>rubric scores from published evidence, not vendor code "
      "audits</b> (evidence confidence LOW for every non-NAVIS row; UNKNOWN scores 0, so "
      "each non-NAVIS bar is a lower bound). The positioning conclusion survives the "
      "caveat: the plan side (P6, MS Project) and the capture side (Procore, InEight) "
      "leave the linking layer — prose/voice to L5/L6 with provenance, confidence and "
      "audit — structurally unaddressed in published material. Vision competitors "
      "(Buildots, Doxel) are complements, not rivals (risk R12)."),
]
story += [fig("competitor_feature_coverage.png",
              "Competitor coverage of the 21 NAVIS-relevant capabilities (RUBRIC + published "
              "evidence; scoring method and honesty statement in "
              "research/COMPETITIVE_LANDSCAPE.md). Take-away: NAVIS's niche is the linking "
              "layer between capture tools and planning tools — not a replacement for either.")]

# ── 23. INNOVATION ANALYSIS ──────────────────────────────────────────────────
story += [H1("22.  Innovation analysis"),
    P("Feature-by-feature, self-assessed on four axes (RUBRIC — reasoned judgement against "
      "the code audit, not measurement). The chart is sorted by defensibility: the top of "
      "the chart is what to claim; the bottom is what <i>not</i> to claim."),
]
story += [fig("navis_innovation_scores.png",
              "Innovation profile (RUBRIC; defined in research/INNOVATION_ANALYSIS.md). Take-away: "
              "the defensible core is the measured decision policy + line lock + "
              "deterministic-extraction architecture; the alias learning loop (write-only "
              "today) is scored 2/10 and should never be claimed as 'self-learning'.")]

# ── 23. TECHNICAL DEFENSIBILITY ──────────────────────────────────────────────
story += [H1("23.  Technical defensibility"),
    P("What makes the engineering survive cross-examination: every headline number is "
      "reproducible from a read-only harness against the real engine and dataset "
      "(research/data/*.py); every design decision has a stated reason (ARCHITECTURE.md "
      "opens with 'five places I think you're wrong'); and the two known defects — the "
      "dense-feature renormalisation and the write-only lexicon — are documented with "
      "measurements rather than hidden (densefix.json: fixing the defect is worth +2.5 pts "
      "Top-1 and +1.6 pts coverage at unchanged 100% precision)."),
]
story += table(
    ["Claim a judge might challenge", "Defence", "Evidence"],
    [["“Why not just BM25?”", "BM25 ranks better but gates worse: at 100% auto-precision the hybrid covers 50.4% vs ~35% for BM25-only", "bm25gate.json + ablation.json"],
     ["“Why not just an LLM?”", "LLM never writes schedule fields; output re-validated; regex owns dates/tags", "llm_backend.py, test_llm_guards.py"],
     ["“Your eval is circular”", "conceded; tag-stripped subset (n=87) reported: Top-1 70.1% without the decisive tag", "ablation.json, EXPERIMENTS.md"],
     ["“There's a defect in scoring”", "yes — measured, documented, fix benchmarked", "densefix.json"],
     ["“Coverage of 50% seems low”", "it buys 100% precision; coverage-vs-precision is a measured dial, and review items cost ~10 s", "eval_output.txt curve"]],
    "Pre-answered challenges. Full drill in research/JUDGE_QUESTIONS.md.", status_col=None)

# ── 25. PS REQUIREMENT COVERAGE ──────────────────────────────────────────────
story += [H1("24.  PS requirement coverage"),
    P("All 26 requirements derived from the PS text are audited against code in "
      "research/feature_gap_matrix.csv (statuses read from code, not documentation): 16 "
      "IMPLEMENTED, 5 PARTIAL, 3 MISSING (OCR, P6/MSP import, authentication), 2 "
      "NOT_REQUIRED_FOR_MVP. Every PS Expected-Outcome bullet has at least a partial, "
      "demonstrable answer."),
]
story += [fig("ps_requirement_coverage.png",
              "PS requirement coverage (AUDITED — statuses read from code; cells in "
              "research/feature_gap_matrix.csv, reasoning in research/PS_ANALYSIS.md). Take-away: "
              "the red bars are exactly what to concede to judges before they find them.")]

# ── 26. MVP COMPLETENESS ─────────────────────────────────────────────────────
story += [H1("25.  Current MVP completeness"),
    P("34 pipeline components audited component-by-component (research/"
      "NAVIS_TECHNICAL_AUDIT.md): 24 IMPLEMENTED, 6 PARTIAL, 1 DEFECT (dense-feature "
      "renormalisation — measured and benchmarked), 3 NOT FOUND (OCR, PMXML/XER import, "
      "auth). The defects and gaps are part of the record."),
]
story += [fig("implementation_status.png",
              "Implementation status of every pipeline component, verified against code "
              "(AUDITED). Take-away: the MVP's core spine — ingest → extract → retrieve → "
              "score → decide → roll-up → persist → audit → review — is fully implemented; "
              "the gaps sit at the edges (OCR, schedule import, auth, closed learning loop).")]

# ── 27. SCALABILITY ──────────────────────────────────────────────────────────
story += [H1("26.  Scalability"),
    P("Measured only at demo scale — nothing beyond that is claimed. 120-activity schedule, "
      "266 events in 1.86 s (~7 ms/event), 4.4 s one-time cold start for index + embedding. "
      "The architecture scales linearly in schedule size for retrieval (BM25 index + one "
      "embedding pass) but <b>brute-force cosine similarity and SQLite bound the ceiling</b>: "
      "no vector index (FAISS/pgvector), no background workers, single-process. Real "
      "projects run 5k–50k L5/L6 activities; a vector index, Postgres and an async ingest "
      "queue are the identified scaling path."),
]

# ── 28. MVP vs PRODUCTION ────────────────────────────────────────────────────
story += [H1("27.  MVP architecture vs production architecture"),
]
story += table(
    ["Concern", "MVP (implemented)", "Production (proposed)"],
    [["Schedule store", "SQLite, single project", "PostgreSQL, multi-project with RLS"],
     ["Schedule import", "hand-written JSON baseline", "PMXML/XER/MS Project parsers; P6 web services"],
     ["Auth", "none", "SSO + role-based access; field role scoped to own discipline"],
     ["Retrieval", "brute-force cosine, in-process MiniLM", "pgvector/FAISS index; batched encoder service"],
     ["Ingest", "synchronous POST", "job queue + workers; SLA-monitored reprocessing"],
     ["LLM", "optional, off by default, bounded 5 s", "managed gateway with cost controls; per-tenant keys"],
     ["Learning loop", "alias lexicon written, never read", "lexicon read at retrieval; correction retraining"],
     ["Security", "trust-the-network", "TLS, auth, rate limits, tenant isolation; audit trail already append-only"],
     ["Deployment", "laptop (venv + npm)", "containers; offline site deployment with local model cache"]],
    "Honest MVP-to-production gap map. The integrity spine (provenance, audit, "
    "confidence) carries forward unchanged.", status_col=None)

# ── 29. EXPERIMENTS ──────────────────────────────────────────────────────────
story += [H1("28.  Experiments / evaluation results"),
    P("All results measured with read-only harnesses against the real engine and "
      "dataset/ground_truth.csv (254 labelled mentions; 242 gold-positive, 12 NO_MATCH). "
      "Reproduce with research/data/*.py and eval.py; full log in research/EXPERIMENTS.md."),
]
story += [fig("matching_engine_ablation.png",
              "Left: retrieval/ranking ablation on 242 gold positives (MEASURED). Right: the "
              "BM25-only gate curve vs the shipped hybrid operating point and the dense-feature "
              "fix (MEASURED). Take-away: BM25 ranks better; the hybrid GATES better — at 100% "
              "auto-link precision the hybrid covers 50.4% of mentions vs ~35% for BM25-only, "
              "and the fix adds a further point of coverage at unchanged precision.")]
story += table(
    ["Metric", "Value", "Detail"],
    [["Top-1 accuracy", "87.2%", "211/242 gold positives"],
     ["Precision (suggestions)", "83.1%", "207 correct suggestions"],
     ["Recall (suggestions)", "85.5%", "of 242 gold positives"],
     ["AUTO_LINK coverage", "50.4%", "128 correct auto-links / 254 mentions"],
     ["Auto-link precision", "100.0%", "zero wrong auto-links in the confusion table"],
     ["NO_MATCH rejection", "8.3%", "1/12 correctly refused — known weakness"],
     ["Review-queue load", "121 items", "~10 s each for the planner"],
     ["Tag-stripped Top-1", "70.1%", "n=87, matching without the decisive tag signal"],
     ["Latency", "1.86 s / 266 events", "~7 ms/event + 4.4 s one-time cold start"]],
    "Headline evaluation results (MEASURED — research/data/eval_output.txt).", status_col=None)

# ── 30. WEAKNESSES ───────────────────────────────────────────────────────────
story += [H1("29.  Weaknesses and limitations"),
    P("Twelve risks are plotted below (RUBRIC — probability × impact judgement; each risk "
      "traces to a finding in the technical audit or judge-question drill). The four "
      "highest-severity: no authentication (R9), the hand-written baseline instead of a "
      "parsed Primavera file (R2), the measured dense-feature defect (R3), and "
      "circular evaluation (R4)."),
]
story += [fig("risk_matrix.png",
              "Pre-demo risk matrix (RUBRIC — this analysis's judgement). Take-away: the two "
              "red-zone risks (R1 'why not just BM25/an LLM?', R9 no auth) are exactly the ones "
              "answered with measurements in §23 and conceded in §16.")]
story += bullets([
    "<b>Data caveats.</b> Ground truth and DPRs generated together — circular evaluation "
    "conceded; 47/120 activities with both actual dates bound the memory analytics.",
    "<b>Feature caveats.</b> Alias lexicon write-only (R7); NO_MATCH rejection 8.3% (R10); "
    "agent dialogue deterministic, LLM optional (R5).",
    "<b>Platform caveats.</b> No auth (R9); SQLite single-process; MiniLM download needed "
    "once on a cold machine (R11); browser-ASR dependent on venue browser (mitigated by "
    "typed fallback, verified end-to-end).",
])

# ── 31. RECOMMENDED IMPROVEMENTS ─────────────────────────────────────────────
story += [H1("30.  Recommended improvements"),
]
story += table(
    ["Priority", "Improvement", "Why"],
    [["1", "Ship the dense-feature fix (benchmarked: +2.5 pts Top-1, +1.6 pts coverage)", "already measured; smallest effort, clearest gain"],
     ["1", "Read alias_lexicon back in retrieval — close the learning loop", "converts the write-only gap into the PS's learning claim"],
     ["2", "PMXML/XER schedule import", "removes the hand-written-baseline objection (R2) at its root"],
     ["2", "Authentication + project isolation", "R9; prerequisite for any real deployment"],
     ["3", "Independent human relabelling of ground truth", "kills the circularity objection (R4) with data, not words"],
     ["3", "Vector index + Postgres + async ingest", "the identified scaling path beyond demo scale"],
     ["4", "Tighten NO_MATCH rejection beyond 8.3%", "saves review-queue time; keeps the safe failure direction"],
     ["4", "On-device ASR for noisy-site voice", "browser ASR is the field-UX ceiling today"]],
    "Prioritised improvements, ordered by measured impact per effort.", status_col=None)

# ── 32. SIH JUDGE ANALYSIS ───────────────────────────────────────────────────
story += [H1("31.  SIH judge analysis"),
    P("A 15-dimension self-scorecard (RUBRIC — this analysis's judgement, not an official "
      "SIH rubric). Weighted overall 7.6/10. Strategy: lead with explainability (9.5), "
      "architecture (8.5) and PS relevance (9.0); concede security (4.5), scalability (6.0) "
      "and innovation (6.0) before judges find them — conceding with a measurement "
      "converts a weakness into credibility."),
]
story += [fig("sih_scorecard.png",
              "SIH evaluation dimensions, self-scored (RUBRIC; defined in "
              "research/SIH_JUDGE_ANALYSIS.md). Take-away: the shape is broad with two "
              "deliberate dips — security and scalability — both owned and both answered.")]

# ── 33. DEMO STRATEGY ────────────────────────────────────────────────────────
story += [H1("32.  Demo strategy"),
    P("The demo path is rehearsed end-to-end (DEMO.md): two terminals, reset to a known "
      "state with scripts/demo_reset.ps1 (~3 s; expects the summary line 120 activities / "
      "67 with actuals / 118 review items), then: Home conflict cards → Ingest → Reconcile "
      "(confirm one item, open the audit drawer showing four appended records on "
      "PIP-SPL-1028) → Schedule (confidence badges) → Memory (sample sizes in words) → "
      "Field voice agent (?view=field)."),
]
story += bullets([
    "<b>Transcript review is the point, not an obstacle</b>: ASR mangles tags like "
    "24\"-P-1001-A1A, and tag overlap is the matcher's strongest feature — edit, then send.",
    "<b>Mic failure is a normal state</b>: the screen shows “Microphone unavailable / "
    "Typing works just as well”, the text input becomes primary, no red on screen. "
    "A typed-only session was verified end-to-end to a matched activity and review item.",
    "<b>The LLM is off by default</b> and cannot break the demo: no client built, no "
    "socket opened when EXTRACTION_PROVIDER=rules.",
    "Recovery playbook on stage: error banner = API port mismatch; empty panel = by design "
    "(independent fetches); stale port = restart on 8001 with VITE_API_URL.",
])
story += [fig("Design/field_supervisor_conversation_information_complete/screen.png",
              "Field supervisor — the voice agent asks for one slot at a time (date, then "
              "quantity: “6 out of 18” kept as completed 6 / planned 18) and hands over to a "
              "structured card. Design mockup of the shipped flow (frontend/src/pages/Field.tsx).",
              width=7.6 * cm)]

# ── 34. JUDGE Q&A ────────────────────────────────────────────────────────────
story += [H1("33.  Difficult judge questions and answers"),
    P("Condensed from research/JUDGE_QUESTIONS.md — every answer cites repository "
      "evidence, and each is backed by a measured number rather than an opinion."),
]
story += table(
    ["Judge question", "Answer (evidence-backed)"],
    [["“Why not just BM25 — or just hand everything to an LLM?”",
      "Measured: BM25-only covers ~35% at 100% gate precision vs 50.4% for the hybrid, zero wrong auto-links (bm25gate.json). The LLM never decides: output re-validated, dates/tags regex-owned."],
     ["“Your schedule is a JSON file, not a real Primavera export.”",
      "Correct and conceded. PMXML/XER exist as export only; import is the first post-hackathon item (risk R2)."],
     ["“There's a defect in your ranking?”",
      "Yes — the dense feature is missing for candidates absent from the dense channel. Fix measured at +2.5 pts Top-1 (densefix.json); documented, not rushed."],
     ["“Your evaluation is circular.”",
      "Conceded; mitigated by 87 tag-stripped mentions (Top-1 70.1% reported, not hidden). Independent relabelling recommended before external claims."],
     ["“The PS says LLM-based agent. Yours is regex?”",
      "Slot-filling is deterministic on purpose — it can't fail on stage; the LLM path exists behind a flag with a 5 s timeout and silent fallback."],
     ["“What if the demo laptop is offline?”",
      "Defaults are offline-first: rules provider, local MiniLM (local_files_only), typed fallback verified end-to-end."],
     ["“Show the learning loop.”",
      "Corrections write alias_lexicon rows today; the matcher doesn't read them yet — scored 2/10 defensibility rather than claimed."],
     ["“Institutional memory from 47 activities?”",
      "Sample sizes are shown on every panel; suggested duration requires ≥ 2 completions. The architecture is the contribution."],
     ["“Where is auth?”",
      "There is none in the MVP — named limitation, first production item; the append-only audit trail is what production security will stand on."],
     ["“What happens to unplanned work?”",
      "NEW_ACTIVITY surfaces it to the planner. NO_MATCH rejection is 8.3% — garbage lands in REVIEW (the safe direction), not in the schedule."],
     ["“Buildots/Doxel already do this.”",
      "They are camera-based complements; NAVIS links what supervisors say and write — positioning is the linking layer (R12)."]],
    "The hard-question drill (full 12 in research/JUDGE_QUESTIONS.md).", status_col=None)

# ── 35. FINAL VERDICT ────────────────────────────────────────────────────────
story += [H1("34.  Final verdict"),
    P("NAVIS is a complete, honest, measured answer to PS 26122's core: the full "
      "ingest → extract → link → reconcile → remember spine works end-to-end on the "
      "recommended corpus, its matching policy is calibrated to a measured 100% "
      "auto-link precision, its audit trail makes every write defensible, and its "
      "institutional-memory layer covers the PS outcome most teams will skip. Its known "
      "gaps — no auth, no schedule import, a write-only learning loop, demo-scale only — "
      "are documented with the same rigour as its results."),
]
story += callout("Where this wins or loses",
    "Wins on: measured linking quality with zero wrong auto-links; explainability and "
    "audit; institutional memory; offline practicality. Loses or draws on: raw "
    "innovation of individual components (hybrid retrieval is table stakes), scale "
    "beyond demo, and security. The strongest card is that every number in this "
    "report can be re-run in front of a judge: python eval.py.", color=BLUE, bg="#f0f5fa")

# ── 36. ONE-LINE DESCRIPTION ─────────────────────────────────────────────────
story += [H1("35.  The strongest one-line description of NAVIS"),
    Spacer(1, 0.4 * cm)]
big = Table([[Paragraph(
    "NAVIS turns what a site supervisor says, types or reports into audited schedule "
    "fact — linking every field mention to the right L5/L6 activity with measured "
    "100% auto-link precision, and turning every project into queryable institutional "
    "memory.", S["big"])]], colWidths=[CONTENT_W])
big.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef7f4")),
    ("LINEBEFORE", (0, 0), (0, -1), 3, TEAL),
    ("TOPPADDING", (0, 0), (-1, -1), 14), ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ("LEFTPADDING", (0, 0), (-1, -1), 16), ("RIGHTPADDING", (0, 0), (-1, -1), 16),
]))
story += [big, Spacer(1, 0.5 * cm),
          Paragraph("Shorter still: <b>“The field talks. The schedule listens. Every word "
                    "is audited.”</b>", S["body"])]

# ── Evidence appendix pointer ────────────────────────────────────────────────
story += [H1("Appendix — evidence index"),
    P("Every figure and table in this report carries an evidence label:"),
    P("<b>MEASURED</b> — read from research/data/*.json or eval.py output, produced by "
      "read-only harnesses against the real engine and dataset/ground_truth.csv."),
    P("<b>AUDITED</b> — component/requirement statuses traced to a file and symbol in "
      "research/NAVIS_TECHNICAL_AUDIT.md and the matrix CSVs."),
    P("<b>RUBRIC</b> — reasoned judgement (SIH scorecard, risks, innovation profile, "
      "competitor cells), labelled as such on the figure itself and never presented as "
      "measurement. Competitor cells use published evidence only, evidence confidence "
      "LOW, UNKNOWN scores 0 — every non-NAVIS bar is a lower bound."),
    P("Supporting documents: research/EXPERIMENTS.md · research/JUDGE_QUESTIONS.md · "
      "research/PS_ANALYSIS.md · research/COMPETITIVE_LANDSCAPE.md · "
      "research/INNOVATION_ANALYSIS.md · research/SIH_JUDGE_ANALYSIS.md · "
      "research/EVIDENCE.md."),
]

doc.multiBuild(story)
print(f"wrote {OUT}  figures={fig_no[0]}  tables={tab_no[0]}")


