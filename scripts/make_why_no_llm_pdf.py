"""Build deliverables/NAVIS_Why_No_LLM.pdf - the two-page judge handout that
explains, in plain language, why the language model is not in the matching
decision and what is already built behind the EXTRACTION_PROVIDER flag.

The PDF is a generated artefact and is committed, so this generator is
committed beside it: a binary in the repo with no source is not reproducible.

Content is a plain-language restatement of existing decisions - H-003 (V1
LLM-as-matcher, abandoned), D-001 (retrieval and ranking are separate stages),
D-003 (rationale is feature names, not prose), D-005 (the LLM is optional and
off by default) and D-006 (tags never come from the LLM). It introduces no new
architecture; if those entries change, this handout must be regenerated.

Numbers quoted come from `python eval.py` (100.0% auto-link precision at 50.4%
coverage, tau_high=0.775) and research/data/ablation.json / latency.json.

Requires reportlab, which is a documentation-build dependency only and is
deliberately NOT in requirements.txt - nothing the server imports needs it:

    pip install reportlab
    python scripts/make_why_no_llm_pdf.py
"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, HRFlowable)

OUT = str(Path(__file__).resolve().parents[1] / "deliverables" / "NAVIS_Why_No_LLM.pdf")

INK   = colors.HexColor("#14181F")
MUTE  = colors.HexColor("#5B6472")
ACC   = colors.HexColor("#0F5C4A")
RULE  = colors.HexColor("#D4D9E0")
BAND  = colors.HexColor("#F2F5F7")
GOOD  = colors.HexColor("#0F5C4A")
WARN  = colors.HexColor("#9A3412")

ss = getSampleStyleSheet()

def S(name, **kw):
    base = dict(name=name, fontName="Helvetica", fontSize=9.3, leading=13.2,
                textColor=INK, alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(**base)

title   = S("title", fontName="Helvetica-Bold", fontSize=19, leading=22, textColor=INK)
sub     = S("sub", fontSize=9.6, leading=13, textColor=MUTE)
h2      = S("h2", fontName="Helvetica-Bold", fontSize=11.6, leading=14,
            textColor=ACC, spaceBefore=0, spaceAfter=0)
body    = S("body", fontSize=9.4, leading=13.4)
bodysm  = S("bodysm", fontSize=8.7, leading=12.2)
lead    = S("lead", fontSize=11.2, leading=15.4, textColor=INK)
cellb   = S("cellb", fontName="Helvetica-Bold", fontSize=8.8, leading=11.8)
cell    = S("cell", fontSize=8.8, leading=11.8)
cellm   = S("cellm", fontSize=8.8, leading=11.8, textColor=MUTE)
mono    = S("mono", fontName="Courier", fontSize=8.6, leading=11.8, textColor=INK)
foot    = S("foot", fontSize=7.8, leading=10.4, textColor=MUTE)
numbig  = S("numbig", fontName="Helvetica-Bold", fontSize=17, leading=19, textColor=ACC)
numlbl  = S("numlbl", fontSize=7.9, leading=10.2, textColor=MUTE)

def rule(sp_before=3, sp_after=6):
    return [Spacer(1, sp_before),
            HRFlowable(width="100%", thickness=0.6, color=RULE),
            Spacer(1, sp_after)]

def section(text):
    return [Paragraph(text, h2), Spacer(1, 4)]

story = []

# ---------------- PAGE 1 ----------------
story.append(Paragraph("Why NAVIS does not use an LLM to decide matches", title))
story.append(Spacer(1, 3))
story.append(Paragraph(
    "NAVIS &mdash; Intelligent Data Capture &amp; Schedule-Linking Layer &nbsp;|&nbsp; "
    "SIH 2026, Problem Statement 26122 &nbsp;|&nbsp; Status as of 11 September 2026", sub))
story += rule(6, 9)

story.append(Paragraph(
    "<b>The short version.</b> We could have asked a language model to read a site report and simply "
    "pick the matching schedule task. We built that first, measured it, and threw it away. The reason is "
    "simple: when a model says <i>\"91% confident\"</i>, that number is not real. You cannot tune it, you "
    "cannot test it, and if it is wrong it quietly writes a wrong date into a live project schedule.", lead))
story.append(Spacer(1, 10))

story += section("What is actually running right now")

rows = [
    [Paragraph("Step", cellb), Paragraph("What does the work today", cellb), Paragraph("LLM?", cellb)],
    [Paragraph("Reading a messy daily report", cell),
     Paragraph("Pattern rules that pull out tags, dates, quantities", cellm),
     Paragraph("<b>No</b>", cell)],
    [Paragraph("Understanding what the words mean", cell),
     Paragraph("MiniLM &mdash; a small neural language model, always on", cellm),
     Paragraph("<font color='#0F5C4A'><b>Yes (small)</b></font>", cell)],
    [Paragraph("Choosing which schedule task it belongs to", cell),
     Paragraph("A score built from 6 visible signals", cellm),
     Paragraph("<b>No &mdash; on purpose</b>", cell)],
    [Paragraph("Talking to the site supervisor", cell),
     Paragraph("Question-by-question form filling", cellm),
     Paragraph("<b>No (switchable)</b>", cell)],
]
t = Table(rows, colWidths=[52*mm, 78*mm, 35*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), BAND),
    ("LINEBELOW", (0,0), (-1,0), 0.6, RULE),
    ("LINEBELOW", (0,1), (-1,-2), 0.35, colors.HexColor("#E8ECF1")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LEFTPADDING", (0,0), (-1,-1), 7),
    ("RIGHTPADDING", (0,0), (-1,-1), 7),
]))
story.append(t)
story.append(Spacer(1, 5))
story.append(Paragraph(
    "So the honest answer to <i>\"are you using AI?\"</i> is <b>yes</b> &mdash; a neural model reads meaning "
    "on every single event. The answer to <i>\"is a large language model making the decision?\"</i> is "
    "<b>no</b>, and that is a design choice, not a shortcut.", body))
story.append(Spacer(1, 11))

story += section("Four plain reasons we keep the model out of the decision")

reasons = [
    ("1. A model's confidence is not a real number.",
     "\"91% sure\" is just words the model produced. Our score is built from things you can point at, so we "
     "can set a safety line and prove where it sits. That is the difference between a claim and a measurement."),
    ("2. A model cannot say \"it's one of these two.\"",
     "Our system compares the best answer against the second-best. If they are too close, it refuses to decide "
     "and sends it to a human. A model gives you one answer and no sense of how close the runner-up was."),
    ("3. A model explains itself in paragraphs, not in facts.",
     "NAVIS explains every match with fixed labels a planner can check: <i>tag matched</i>, <i>dates line up</i>, "
     "<i>same discipline</i>. A written explanation can sound convincing and still be wrong &mdash; which is worse "
     "than a short one that is right."),
    ("4. A wrong answer here is silent and expensive.",
     "A bad auto-link corrupts a project schedule and nobody notices for weeks. A review item costs a planner "
     "about ten seconds. Those two costs are nowhere near equal, so we designed for the one you cannot undo."),
]
for head, txt in reasons:
    story.append(Paragraph("<b>%s</b> %s" % (head, txt), body))
    story.append(Spacer(1, 6))

story.append(Spacer(1, 3))
story += section("What we get in return")

stats = [[
    Paragraph("100%", numbig), Paragraph("50.4%", numbig),
    Paragraph("1 command", numbig), Paragraph("~6 ms", numbig)],
    [Paragraph("auto-link accuracy:<br/>zero wrong links", numlbl),
     Paragraph("of updates linked with<br/>no human involved", numlbl),
     Paragraph("re-proves the numbers<br/>from scratch", numlbl),
     Paragraph("to match one update,<br/>not seconds", numlbl)]]
st = Table(stats, colWidths=[41*mm]*4)
st.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), BAND),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TOPPADDING", (0,0), (-1,0), 8),
    ("BOTTOMPADDING", (0,0), (-1,0), 1),
    ("TOPPADDING", (0,1), (-1,1), 0),
    ("BOTTOMPADDING", (0,1), (-1,1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 9),
]))
story.append(st)

story.append(PageBreak())

# ---------------- PAGE 2 ----------------
story.append(Paragraph("The LLM is built, tested, and one line away", title))
story.append(Spacer(1, 3))
story.append(Paragraph("Page 2 of 2 &nbsp;|&nbsp; What exists, how to turn it on, and what it is allowed to touch", sub))
story += rule(6, 9)

story.append(Paragraph(
    "<b>Nothing is missing.</b> The language model path is fully written, wired in and covered by tests. "
    "It ships switched off because the offline path is the one we have measured, and a demo must not depend "
    "on a model being reachable.", lead))
story.append(Spacer(1, 10))

story += section("Turning it on takes one setting")

story.append(Paragraph("In the configuration file, change one line:", body))
story.append(Spacer(1, 4))
code = Table([[Paragraph("EXTRACTION_PROVIDER=rules&nbsp;&nbsp;&nbsp;# today: no model, no network", mono)],
              [Paragraph("EXTRACTION_PROVIDER=ollama&nbsp;&nbsp;# local model (qwen3:8b) takes over", mono)]],
             colWidths=[165*mm])
code.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), BAND),
    ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LINEBELOW", (0,0), (-1,0), 0.35, colors.white),
]))
story.append(code)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "It also accepts a cloud model instead of a local one. A built-in status check reports which mode the "
    "system is in, so we can never accidentally claim a model is running when it is not:", body))
story.append(Spacer(1, 4))
story.append(Paragraph("GET /agent/llm-status", mono))
story.append(Spacer(1, 11))

story += section("The safety rails that are already in the code")

safety = [
    [Paragraph("Guard", cellb), Paragraph("What it does", cellb)],
    [Paragraph("5-second timeout, one try", cell),
     Paragraph("If the model is slow or unreachable, the system falls back to the offline path silently. "
               "A model outage is never a product outage.", cellm)],
    [Paragraph("Everything re-checked", cell),
     Paragraph("Every value the model returns is re-validated by our own rules before it can be used.", cellm)],
    [Paragraph("Tags never come from the model", cell),
     Paragraph("Tag numbers are the strongest matching signal, so an invented one would do the most damage. "
               "They come only from pattern rules.", cellm)],
    [Paragraph("Dates never come from the model", cell),
     Paragraph("A date is what actually gets written into the schedule. It is read by our own parser, never "
               "taken on trust.", cellm)],
    [Paragraph("The model never picks the task", cell),
     Paragraph("Choosing the schedule activity stays with the scoring engine, always.", cellm)],
    [Paragraph("Words must be the supervisor's own", cell),
     Paragraph("If the model suggests a description, at least 75% of it must already appear in what the "
               "supervisor actually said. Otherwise it is thrown away.", cellm)],
]
t2 = Table(safety, colWidths=[52*mm, 113*mm])
t2.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), BAND),
    ("LINEBELOW", (0,0), (-1,0), 0.6, RULE),
    ("LINEBELOW", (0,1), (-1,-2), 0.35, colors.HexColor("#E8ECF1")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
]))
story.append(t2)
story.append(Spacer(1, 5))
story.append(Paragraph(
    "<b>The rule in one sentence:</b> the model may <i>suggest wording</i>; it may never choose a task, a tag, "
    "or a date.", body))
story.append(Spacer(1, 11))

story += section("What we honestly give up")

story.append(Paragraph(
    "Without the model switched on, very informal reports are hard for us &mdash; mixed Hindi and English "
    "(<i>\"kaam chalu hai\"</i>), references with no tag number (<i>\"the big tank\"</i>), loose quantities "
    "(<i>\"roughly 30 cum\"</i>). We keep one deliberately messy report in our test data for exactly this "
    "reason: it is the file that shows where the offline path stops and where the model earns its place. "
    "We show that file rather than hide it.", body))
story.append(Spacer(1, 11))

story += section("If a judge asks, the answer is one paragraph")

quote = Table([[Paragraph(
    "\"The language model path is built, tested and switchable. We ship with it off because the offline path "
    "is the one we have measured, and we will not make a live schedule depend on a model being reachable. "
    "A neural model still reads meaning on every event. What we removed is the model's power to <i>decide</i> "
    "&mdash; because a wrong link corrupts a schedule silently, and a review item costs a planner ten seconds.\"",
    body)]], colWidths=[165*mm])
quote.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), BAND),
    ("LINEBEFORE", (0,0), (0,-1), 2.2, ACC),
    ("LEFTPADDING", (0,0), (-1,-1), 11), ("RIGHTPADDING", (0,0), (-1,-1), 11),
    ("TOPPADDING", (0,0), (-1,-1), 9), ("BOTTOMPADDING", (0,0), (-1,-1), 9),
]))
story.append(quote)

def footer(canv, doc):
    canv.saveState()
    canv.setStrokeColor(RULE); canv.setLineWidth(0.5)
    canv.line(22*mm, 15*mm, A4[0]-22*mm, 15*mm)
    canv.setFont("Helvetica", 7.4); canv.setFillColor(MUTE)
    canv.drawString(22*mm, 10.6*mm, "NAVIS  |  SIH 2026  |  PS 26122  |  Why no LLM in the matching decision")
    canv.drawRightString(A4[0]-22*mm, 10.6*mm, "Page %d of 2" % doc.page)
    canv.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=22*mm, rightMargin=22*mm,
                        topMargin=18*mm, bottomMargin=20*mm,
                        title="NAVIS - Why we are not using an LLM to decide matches",
                        author="Team NamasteByte")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("written:", OUT)
