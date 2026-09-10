// NAVIS - SIH 2026 IDEA submission deck builder.
//
// Layout language copied from the reference winning deck (see FLOWCHART_PROMPTS.md section 1):
// a text column beside a dominant flow chart, small underlined blue section headings inside the
// canvas, one evidence box in the bottom-right corner, and diagram density that is grouped
// rather than scattered.
//
// Three Eraser diagrams carry the argument (bridge, master flow chart, on-premise stack); the
// remaining Eraser diagrams were deliberately left out and their content is set as native text,
// which stays sharper and reads better at slide size.
//
// Every figure on these slides is on the NUMBERS_SHEET.md allow list.

import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const WORKSPACE = "C:/Users/tcgxu/OneDrive/Desktop/SIH 2026";
const SOURCE = "C:/Users/tcgxu/Downloads/SIH2026-IDEA-Presentation-Format.pptx";
const FINAL = path.join(WORKSPACE, "deliverables", "NAVIS_SIH2026_NamasteByte_FINAL.pptx");
const ASSETS = path.join(WORKSPACE, "ppt_build", "assets");
process.env.RUNTIME_NODE_MODULES = "C:/Users/tcgxu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";

async function dataUrl(file) {
  return `data:image/png;base64,${(await fs.readFile(path.join(ASSETS, file))).toString("base64")}`;
}
const IMG_BRIDGE = await dataUrl("diagram_A_bridge.png");     // 3.787 : 1
const IMG_FLOW = await dataUrl("diagram_B_flowchart.png");    // 2.565 : 1
const IMG_ONPREM = await dataUrl("diagram_D1_onprem.png");    // 4.520 : 1

// Canvas is 1280 x 720 px. Fixed template zones: title above y=125, blue footer below y=658.
const X0 = 36;
const X1 = 1244;
const W = X1 - X0;

const C = {
  navy: "#123F78",
  blue: "#0B67B2",
  paleBlue: "#EAF3FB",
  paleBlue2: "#F4F8FC",
  green: "#1B7F4B",
  paleGreen: "#EAF6EF",
  orange: "#C2660A",
  paleOrange: "#FFF3E6",
  red: "#B42318",
  paleRed: "#FDECEC",
  ink: "#182230",
  muted: "#5A6676",
  line: "#C7D3E3",
  white: "#FFFFFF",
};

function setText(shape, text, style = {}) {
  shape.text = text;
  shape.text.style = {
    typeface: "Arial",
    color: C.ink,
    fontSize: 13,
    alignment: "left",
    verticalAlignment: "middle",
    autoFit: "shrinkText",
    wrap: "square",
    insets: { left: 6, right: 6, top: 3, bottom: 3 },
    ...style,
  };
  return shape;
}

function textBox(slide, text, position, style = {}) {
  const shape = slide.shapes.add({ geometry: "textbox", position });
  return setText(shape, text, { insets: { left: 0, right: 0, top: 0, bottom: 0 }, ...style });
}

function card(slide, { x, y, w, h }, fill = C.white, stroke = C.line, radius = 12) {
  return slide.shapes.add({
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: stroke, width: 1.3 },
    borderRadius: radius,
  });
}

// Small underlined blue heading inside the canvas - the reference deck's "FLOW CHART" device.
function sectionLabel(slide, text, x, y, rule = 190, color = C.blue) {
  textBox(slide, text, { left: x, top: y, width: 460, height: 22 }, {
    fontSize: 13,
    bold: true,
    color,
  });
  slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y + 23, width: rule, height: 0 },
    fill: "none",
    line: { style: "solid", fill: color, width: 1.6 },
  });
}

function rule(slide, { x, y, w = 0, h = 0, color = C.line, width = 1.1, style = "solid" }) {
  slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style, fill: color, width },
  });
}

function arrow(slide, from, to, color = C.blue, width = 1.8, kind = "straight") {
  slide.shapes.connect(from, to, {
    kind,
    fromSide: "right",
    toSide: "left",
    line: { style: "solid", fill: color, width },
    tail: { type: "triangle", width: "sm", length: "sm" },
  });
}

function bullet(slide, { x, y, w, text, color = C.blue, fontSize = 11.5, h = 34 }) {
  slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y + 6, width: 8, height: 8 },
    fill: color,
    line: { style: "solid", fill: color, width: 1 },
  });
  textBox(slide, text, { left: x + 17, top: y - 2, width: w - 17, height: h }, {
    fontSize,
    color: C.ink,
    verticalAlignment: "top",
    lineSpacing: 1.02,
  });
}

function statChip(slide, { x, y, w, h, value, label, fill, stroke, valueColor }) {
  card(slide, { x, y, w, h }, fill, stroke, 11);
  textBox(slide, value, { left: x + 6, top: y + 9, width: w - 12, height: 34 }, {
    fontSize: 24, bold: true, color: valueColor, alignment: "center",
  });
  textBox(slide, label, { left: x + 8, top: y + 44, width: w - 16, height: h - 50 }, {
    fontSize: 10.5, bold: true, color: C.ink, alignment: "center", verticalAlignment: "top", lineSpacing: 1.05,
  });
}

function pointerCard(slide, { x, y, w, h, kicker, kickerColor, body, fill, stroke }) {
  card(slide, { x, y, w, h }, fill, stroke, 12);
  textBox(slide, kicker, { left: x + 14, top: y + 11, width: w - 28, height: 20 }, {
    fontSize: 12.5, bold: true, color: kickerColor,
  });
  textBox(slide, body, { left: x + 14, top: y + 35, width: w - 28, height: h - 46 }, {
    fontSize: 12, color: C.ink, verticalAlignment: "top", lineSpacing: 1.1,
  });
}

function deleteNamed(slide, name) {
  const shape = slide.shapes.getItem(name);
  if (shape) shape.delete();
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines.join("\n"));
  slide.speakerNotes.setVisible(false);
}

const presentation = await PresentationFile.importPptx(await FileBlob.load(SOURCE));

/* ------------------------------------------------------------------ SLIDE 1 */
// The cover is left exactly as the template ships it. Its six fill-in lines and the team-name
// ovals are filled run-by-run afterwards by fill_template_fields.py, so the template's own
// fonts, sizes and bullet geometry survive untouched.
{
  const slide = presentation.slides.getItem(0);
  notes(slide, [
    "Problem statement metadata taken from the SIH portal listing for PS 26122, Oil India Limited.",
    "Team ID intentionally left blank until the portal issues it.",
  ]);
}

/* ------------------------------------------------------------------ SLIDE 2 */
{
  const slide = presentation.slides.getItem(1);
  deleteNamed(slide, "TextBox 8");

  sectionLabel(slide, "PROPOSED SOLUTION", X0, 126, 152);
  textBox(slide, "NAVIS - one evidence trail from a field sentence to a reviewed P6 actual.", { left: X0 + 184, top: 124, width: 700, height: 24 }, {
    fontSize: 14, bold: true, color: C.ink,
  });

  slide.images.add({
    dataUrl: IMG_BRIDGE,
    alt: "Field inputs flow into NAVIS - extract, retrieve, rank, confidence gate - and out to the P6 schedule. A dashed line shows the gap being crossed by hand today.",
    position: { left: X0, top: 160, width: W, height: 319 },
    fit: "contain",
  });

  const cw = (W - 32) / 3;
  pointerCard(slide, {
    x: X0, y: 494, w: cw, h: 156,
    kicker: "THE PROBLEM",
    kickerColor: C.red,
    body: "Progress is reported as prose - daily reports, discipline sheets, voice notes. Primavera P6 needs an activity ID and a date. A planner bridges that gap by hand, every cycle, on a schedule of thousands of activities.",
    fill: C.paleRed, stroke: "#F0BDB8",
  });
  pointerCard(slide, {
    x: X0 + cw + 16, y: 494, w: cw, h: 156,
    kicker: "HOW NAVIS SOLVES IT",
    kickerColor: C.navy,
    body: "Extract the fact with the file and line it came from, retrieve 20 candidate activities, rank on 6 explainable features, then gate on confidence. Actuals are written with an append-only audit record.",
    fill: C.paleBlue, stroke: "#9DC2E6",
  });
  pointerCard(slide, {
    x: X0 + 2 * (cw + 16), y: 494, w: cw, h: 156,
    kicker: "WHAT IS NEW - REFUSAL IS THE FEATURE",
    kickerColor: C.green,
    body: "100% auto-link precision, 67 of 67 on a held-out test. The rest is queued for a planner, never guessed. A wrong actual date triggers false billing or a premature hydrotest - so the system asks instead.",
    fill: C.paleGreen, stroke: "#92C9AA",
  });

  notes(slide, [
    "Diagram: Eraser workspace 2qnRjujRIBvJMgxD2vov, diagram 9JyHxB0LPKk1vQ5E_QwS.",
    "100 percent auto-link precision, 67 of 67, on the held-out test split - reproduce with python eval.py.",
    "Coverage is 43.5 percent by design; the remaining mentions go to the planner review queue.",
  ]);
}

/* ------------------------------------------------------------------ SLIDE 3 */
{
  const slide = presentation.slides.getItem(2);
  deleteNamed(slide, "TextBox 8");

  // Left: technology column.
  sectionLabel(slide, "TECHNOLOGIES USED", X0, 128, 148);
  const stack = [
    "React + TypeScript - Vite front end",
    "FastAPI - 46 HTTP routes, live OpenAPI docs",
    "Deterministic rules extraction - .txt, .xlsx, .pdf, .csv, image OCR",
    "Hybrid retrieval - exact tag + BM25 + MiniLM embeddings, RRF fused",
    "Ranking - 6 explainable features, no black box in the loop",
    "SQLite - actuals, review queue, append-only audit",
    "Primavera P6 PMXML and XER - pure Python, no MPXJ, no JVM",
    "Local LLM via Ollama - optional, OFF by default",
  ];
  stack.forEach((item, i) => bullet(slide, {
    x: X0, y: 172 + i * 56, w: 296, text: item, h: 48,
    color: i === 7 ? C.muted : C.blue,
  }));
  textBox(slide, "Runs on one laptop CPU. No cloud service, no API key.", { left: X0, top: 622, width: 296, height: 30 }, {
    fontSize: 11, bold: true, color: C.green, verticalAlignment: "top", lineSpacing: 1.05,
  });

  rule(slide, { x: 348, y: 132, h: 516 });

  // Right: the hero flow chart.
  sectionLabel(slide, "FLOW CHART", 368, 128, 92);
  slide.images.add({
    dataUrl: IMG_FLOW,
    alt: "Master flow chart: field input, deterministic extraction, three-channel retrieval, ranking on six features, a three-way confidence decision, and writes restricted to actuals with an append-only audit trail.",
    position: { left: 368, top: 158, width: 876, height: 342 },
    fit: "contain",
  });

  rule(slide, { x: 368, y: 514, w: 876, style: "dash", color: "#B9C6D8" });

  statChip(slide, { x: 368, y: 528, w: 148, h: 118, value: "100%", label: "AUTO-LINK PRECISION\n67 of 67 correct", fill: C.paleGreen, stroke: "#92C9AA", valueColor: C.green });
  statChip(slide, { x: 528, y: 528, w: 148, h: 118, value: "43.5%", label: "COVERAGE\n67 of 154 mentions", fill: C.paleBlue, stroke: "#9DC2E6", valueColor: C.navy });
  statChip(slide, { x: 688, y: 528, w: 148, h: 118, value: "86.9%", label: "TOP-1 ACCURACY\n126 of 145", fill: C.paleOrange, stroke: "#F1B36F", valueColor: C.orange });

  card(slide, { x: 852, y: 528, w: 392, h: 118 }, C.paleBlue2, C.line, 12);
  textBox(slide, "GitHub", { left: 868, top: 540, width: 70, height: 20 }, { fontSize: 11.5, bold: true, color: C.navy });
  textBox(slide, "github.com/poa8534-crypto/SIH-2026", { left: 938, top: 540, width: 296, height: 20 }, { fontSize: 11.5, color: C.blue });
  textBox(slide, "Verify", { left: 868, top: 566, width: 70, height: 20 }, { fontSize: 11.5, bold: true, color: C.navy });
  textBox(slide, "python eval.py  reproduces every figure above", { left: 938, top: 566, width: 296, height: 20 }, { fontSize: 11.5, color: C.ink });
  textBox(slide, "Working prototype - 1,426 automated tests passing", { left: 868, top: 598, width: 366, height: 36 }, {
    fontSize: 13, bold: true, color: C.red, verticalAlignment: "top", lineSpacing: 1.05,
  });

  notes(slide, [
    "Diagram: Eraser workspace 2qnRjujRIBvJMgxD2vov, diagram LxOWrZi9aG3a2C87B7_8.",
    "Thresholds shown on the chart are the shipped configuration: high 0.80, low 0.40, margin 0.03 (matching/config.py).",
    "Auto-link precision 100 percent (67/67), coverage 43.5 percent (67/154), top-1 86.9 percent (126/145) on the held-out test split.",
    "1,426 automated tests = 1,202 pytest plus 224 vitest, all passing on 10 September 2026.",
    "The optional local LLM may help read a messy report. It never chooses the activity and never writes a date.",
  ]);
}

/* ------------------------------------------------------------------ SLIDE 4 */
{
  const slide = presentation.slides.getItem(3);
  deleteNamed(slide, "TextBox 8");

  sectionLabel(slide, "FEASIBILITY - IT RUNS ON ONE LAPTOP", X0, 126, 268);
  textBox(slide, "No cloud service, no API key, nothing leaves your network.", { left: X0 + 300, top: 124, width: 620, height: 24 }, {
    fontSize: 14, bold: true, color: C.ink,
  });

  slide.images.add({
    dataUrl: IMG_ONPREM,
    alt: "On-premise boundary containing the React client, FastAPI service, extraction and hybrid matching engine, SQLite store and the Primavera P6 import and export path.",
    position: { left: 97, top: 152, width: 1086, height: 240 },
    fit: "contain",
  });

  sectionLabel(slide, "CHALLENGES AND RISKS", X0, 408, 170, C.red);
  sectionLabel(slide, "MITIGATION - ALREADY BUILT", 654, 408, 200, C.green);

  const risks = [
    ["Field wording never matches the WBS text", "Three retrieval channels fused - the correct activity is inside the top 20, recall@20 = 100%"],
    ["A wrong actual date means false billing or a premature hydrotest", "Nothing is auto-written unless score, margin and discipline all agree - 0 wrong auto-links"],
    ["Work happens that nobody planned", "Raised to the planner as a new-scope proposal, never dropped silently"],
    ["No live Oil India schedule is available to us", "Synthetic schedule structured on the public CFIHOS oil and gas taxonomy - and we say so"],
    ["Site or venue has no internet", "The whole stack runs on one laptop CPU - no cloud, no GPU, no API key"],
  ];
  risks.forEach(([risk, fix], i) => {
    const y = 444 + i * 37;
    slide.shapes.add({
      geometry: "ellipse",
      position: { left: X0, top: y + 8, width: 8, height: 8 },
      fill: C.red, line: { style: "solid", fill: C.red, width: 1 },
    });
    textBox(slide, risk, { left: X0 + 16, top: y, width: 570, height: 32 }, {
      fontSize: 11.5, color: C.ink, verticalAlignment: "top", lineSpacing: 1.03,
    });
    slide.shapes.add({
      geometry: "ellipse",
      position: { left: 654, top: y + 8, width: 8, height: 8 },
      fill: C.green, line: { style: "solid", fill: C.green, width: 1 },
    });
    textBox(slide, fix, { left: 670, top: y, width: 574, height: 32 }, {
      fontSize: 11.5, color: C.ink, verticalAlignment: "top", lineSpacing: 1.03,
    });
  });

  textBox(slide, "Known gaps, stated: no authentication (the login screen is a role picker), no offline queue, no .mpp import, synthetic labels.", { left: X0, top: 628, width: W, height: 24 }, {
    fontSize: 11, bold: true, color: C.muted,
  });

  notes(slide, [
    "Diagram: Eraser workspace 2qnRjujRIBvJMgxD2vov, diagram Vwn78M3zjDixZbTZ4tdn.",
    "recall@20 = 100 percent on the held-out test split; fusion places the correct activity inside the retrieved 20.",
    "The XER writer emits a simplified shape and is not a P6-valid round trip (D-047).",
    "OCR is on-premise only when local Tesseract is installed; an optional cloud vision provider would send that document out.",
  ]);
}

/* ------------------------------------------------------------------ SLIDE 5 */
{
  const slide = presentation.slides.getItem(4);
  deleteNamed(slide, "TextBox 8");

  sectionLabel(slide, "THE LOOP THAT CLOSES", X0, 126, 158);
  textBox(slide, "Today this knowledge dies in a supervisor's notebook at project close.", { left: X0 + 180, top: 124, width: 700, height: 24 }, {
    fontSize: 13, bold: true, color: C.red,
  });

  const loop = [
    { t: "PROJECT EXECUTES", d: "reports, diaries,\nfield updates", fill: C.white, stroke: C.line, color: C.ink },
    { t: "NAVIS CAPTURES", d: "real start, real finish,\nreal quantity", fill: C.paleBlue, stroke: "#9DC2E6", color: C.navy },
    { t: "STRUCTURED RECORD", d: "durations, delay causes,\ndiscipline productivity", fill: C.paleGreen, stroke: "#92C9AA", color: C.green },
    { t: "QUERYABLE HISTORY", d: "how long does this\nreally take here", fill: C.paleBlue, stroke: "#9DC2E6", color: C.navy },
    { t: "NEXT BASELINE", d: "calibrated,\nnot guessed", fill: C.paleOrange, stroke: "#F1B36F", color: C.orange },
  ];
  const bw = 218;
  const gap = (W - loop.length * bw) / (loop.length - 1);
  const shapes = loop.map((node, i) => {
    const x = X0 + i * (bw + gap);
    const surface = card(slide, { x, y: 196, w: bw, h: 92 }, node.fill, node.stroke, 12);
    textBox(slide, node.t, { left: x + 10, top: 206, width: bw - 20, height: 20 }, {
      fontSize: 12, bold: true, color: node.color, alignment: "center",
    });
    textBox(slide, node.d, { left: x + 10, top: 230, width: bw - 20, height: 50 }, {
      fontSize: 11, color: C.ink, alignment: "center", verticalAlignment: "top", lineSpacing: 1.05,
    });
    return surface;
  });
  for (let i = 0; i < shapes.length - 1; i += 1) arrow(slide, shapes[i], shapes[i + 1], C.blue, 1.8);
  slide.shapes.connect(shapes[4], shapes[0], {
    kind: "elbow", fromSide: "top", toSide: "top",
    line: { style: "dash", fill: C.muted, width: 1.5 },
    tail: { type: "triangle", width: "sm", length: "sm" },
  });
  textBox(slide, "the loop closes - execution history becomes the next plan", { left: 430, top: 164, width: 420, height: 20 }, {
    fontSize: 11, bold: true, color: C.muted, alignment: "center",
  });

  sectionLabel(slide, "WHO GAINS, AND WHAT THEY GAIN", X0, 316, 232);
  const people = [
    ["SITE SUPERVISOR", "Speaks one sentence instead of filling a form. Reporting stops being a second job."],
    ["PLANNING ENGINEER", "Reviews ranked exceptions instead of matching thousands of rows by hand."],
    ["PROJECT MANAGER", "Sees a schedule that reflects this week, not last month - slippage while it can still be acted on."],
    ["PSU / OWNER", "Every actual date is defensible with a file, a line and a confidence."],
  ];
  const pw = (W - 18) / 2;
  people.forEach(([who, what], i) => {
    const x = X0 + (i % 2) * (pw + 18);
    const y = 352 + Math.floor(i / 2) * 96;
    card(slide, { x, y, w: pw, h: 84 }, i % 2 === 0 ? C.paleBlue2 : C.white, C.line, 12);
    textBox(slide, who, { left: x + 14, top: y + 12, width: pw - 28, height: 20 }, {
      fontSize: 12.5, bold: true, color: C.navy,
    });
    textBox(slide, what, { left: x + 14, top: y + 36, width: pw - 28, height: 40 }, {
      fontSize: 12, color: C.ink, verticalAlignment: "top", lineSpacing: 1.08,
    });
  });

  card(slide, { x: X0, y: 576, w: W, h: 74 }, C.paleOrange, "#F1B36F", 12);
  textBox(slide, "SCALE OF THE EXPOSURE", { left: X0 + 16, top: 590, width: 260, height: 20 }, {
    fontSize: 12, bold: true, color: C.orange,
  });
  textBox(slide, "1,948 monitored central-sector projects, \u20B941.99 lakh crore latest revised cost (MoSPI PAIMANA, February 2026).", { left: X0 + 16, top: 612, width: 700, height: 24 }, {
    fontSize: 11.5, color: C.ink,
  });
  textBox(slide, "Context only. NAVIS has run no field pilot, so no saving, ROI or productivity figure is claimed.", { left: 760, top: 600, width: 468, height: 40 }, {
    fontSize: 11.5, bold: true, color: C.red, verticalAlignment: "top", lineSpacing: 1.05,
  });

  notes(slide, [
    "MoSPI PAIMANA portal, February 2026: 1,948 monitored central-sector projects, latest revised cost 41,98,684.28 crore rupees.",
    "That figure sets the scale of the exposure. It is not a NAVIS savings claim and the slide says so.",
    "No field pilot has run, so no ROI, monetary saving or productivity percentage is claimed anywhere in this deck.",
  ]);
}

/* ------------------------------------------------------------------ SLIDE 6 */
{
  const slide = presentation.slides.getItem(5);
  deleteNamed(slide, "TextBox 8");

  sectionLabel(slide, "REFERENCE AND RESEARCH WORK", X0, 126, 226);
  const refs = [
    ["MoSPI PAIMANA", "Central project monitoring scale", "ipm.mospi.gov.in"],
    ["GAO Schedule Assessment Guide", "What makes a schedule reliable", "gao.gov/products/gao-16-89g"],
    ["NIST AI Risk Management Framework", "Traceability and human oversight", "nist.gov/itl/ai-risk-management-framework"],
    ["Oracle Primavera P6 EPPM docs", "PMXML and XER interchange", "docs.oracle.com - primavera-p6"],
    ["CFIHOS oil and gas taxonomy", "Structure behind the synthetic schedule", "public specification, datasets/real/"],
  ];
  refs.forEach(([name, why, link], i) => {
    const y = 168 + i * 74;
    card(slide, { x: X0, y, w: 596, h: 64 }, i % 2 === 0 ? C.paleBlue2 : C.white, C.line, 11);
    textBox(slide, name, { left: X0 + 14, top: y + 9, width: 570, height: 20 }, {
      fontSize: 12.5, bold: true, color: C.navy,
    });
    textBox(slide, why, { left: X0 + 14, top: y + 31, width: 300, height: 20 }, {
      fontSize: 11, color: C.ink,
    });
    textBox(slide, link, { left: X0 + 320, top: y + 31, width: 264, height: 20 }, {
      fontSize: 11, color: C.blue, alignment: "right",
    });
  });

  // Native evidence funnel - the answer to "why only 43.5 percent?", drawn rather than argued.
  sectionLabel(slide, "OUR OWN EVIDENCE - WHY COVERAGE IS UNDER HALF", 664, 126, 330, C.green);
  const funnel = [
    { t: "154 held-out test mentions", s: "six source files, no threshold tuned on them", fill: C.white, stroke: C.line, color: C.ink },
    { t: "67 auto-linked", s: "43.5% coverage at 100% precision", fill: C.paleGreen, stroke: "#92C9AA", color: C.green },
    { t: "39 schedule nodes touched", s: "after quantity-based roll-up", fill: C.paleBlue, stroke: "#9DC2E6", color: C.navy },
  ];
  funnel.forEach((step, i) => {
    const y = 168 + i * 78;
    card(slide, { x: 664, y, w: 580, h: 62 }, step.fill, step.stroke, 11);
    textBox(slide, step.t, { left: 678, top: y + 10, width: 552, height: 20 }, {
      fontSize: 12.5, bold: true, color: step.color,
    });
    textBox(slide, step.s, { left: 678, top: y + 32, width: 552, height: 20 }, {
      fontSize: 11, color: C.muted,
    });
    if (i < 2) {
      textBox(slide, "\u25BC", { left: 664, top: y + 62, width: 580, height: 16 }, {
        fontSize: 9, color: C.muted, alignment: "center",
      });
    }
  });
  card(slide, { x: 664, y: 402, w: 282, h: 62 }, C.paleOrange, "#F1B36F", 11);
  textBox(slide, "32 had no measurable quantity", { left: 676, top: 412, width: 258, height: 20 }, {
    fontSize: 12, bold: true, color: C.orange,
  });
  textBox(slide, "no percentage, no date written", { left: 676, top: 434, width: 258, height: 20 }, {
    fontSize: 11, color: C.muted,
  });
  card(slide, { x: 962, y: 402, w: 282, h: 62 }, C.paleRed, "#F0BDB8", 11);
  textBox(slide, "7 finish dates withheld", { left: 974, top: 412, width: 258, height: 20 }, {
    fontSize: 12, bold: true, color: C.red,
  });
  textBox(slide, "the only date came from a report header", { left: 974, top: 434, width: 258, height: 20 }, {
    fontSize: 11, color: C.muted,
  });
  textBox(slide, "Every narrowing step is a deliberate refusal. Reproduce it live: python eval.py", { left: 664, top: 476, width: 580, height: 22 }, {
    fontSize: 11.5, bold: true, color: C.green,
  });

  card(slide, { x: X0, y: 546, w: W, h: 104 }, C.paleBlue2, C.line, 12);
  textBox(slide, "EVIDENCE BOUNDARY", { left: X0 + 16, top: 558, width: 260, height: 20 }, {
    fontSize: 12, bold: true, color: C.red,
  });
  const bounds = [
    "Synthetic schedule and reports",
    "No live Oil India data yet",
    "In-distribution benchmark",
    "1,426 tests - 1,202 pytest, 224 vitest",
  ];
  bounds.forEach((item, i) => {
    const x = X0 + 16 + i * 296;
    const pill = card(slide, { x, y: 586, w: 280, h: 46 }, C.white, C.line, 10);
    setText(pill, item, {
      fontSize: 11.5, bold: true, color: C.ink, alignment: "center",
      insets: { left: 8, right: 8, top: 4, bottom: 4 },
    });
  });

  notes(slide, [
    "MoSPI PAIMANA: https://ipm.mospi.gov.in/",
    "GAO Schedule Assessment Guide GAO-16-89G: https://www.gao.gov/products/gao-16-89g",
    "NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework",
    "Oracle Primavera P6 EPPM documentation: https://docs.oracle.com/en/industries/construction-engineering/primavera-p6-enterprise-project-portfolio/",
    "METRICS.md section 3.4a audits our own benchmark: 84 percent of test positives reuse an activity seen in training, so these are in-distribution numbers.",
  ]);
}

// The template's instruction page is not part of the submission.
presentation.slides.getItem(6).delete();

await fs.mkdir(path.dirname(FINAL), { recursive: true });
await (await PresentationFile.exportPptx(presentation)).save(FINAL);
console.log(JSON.stringify({ finalPath: FINAL, slideCount: presentation.slides.items.length }, null, 2));
