"""Generate every chart in research/graphs/ from the evidence in research/.

Nothing here is invented. Each figure names its source:

  * MEASURED   - read from research/data/*.json, produced by the read-only
                 harnesses in research/data/*.py against the real engine.
  * AUDITED    - counted from the repository audit in
                 NAVIS_TECHNICAL_AUDIT.md (component status, PS coverage).
  * RUBRIC     - scored by the stated rubric in INNOVATION_ANALYSIS.md /
                 SIH_JUDGE_ANALYSIS.md / COMPETITIVE_LANDSCAPE.md. These are
                 judgements, not measurements, and are labelled as such on
                 the figure itself.

Run:  python research/graphs/make_graphs.py
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
DATA = RESEARCH / "data"

plt.rcParams.update({
    "figure.dpi": 130,
    "savefig.dpi": 130,
    "font.size": 9,
    "axes.titlesize": 11,
    "axes.titleweight": "bold",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.25,
    "grid.linewidth": 0.6,
})

INK = "#1b1f24"
MUTED = "#6b737c"
BLUE = "#2f6f9f"
TEAL = "#2a9d8f"
AMBER = "#e9a13b"
RED = "#c1553b"
GREY = "#adb5bd"
VIOLET = "#7a5c9e"


def load(name: str):
    return json.loads((DATA / name).read_text())


def stamp(fig, text: str):
    fig.text(0.005, 0.005, text, fontsize=6.5, color=MUTED, ha="left", va="bottom")


def save(fig, name: str):
    out = HERE / name
    fig.savefig(out, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", out.relative_to(RESEARCH.parent))


# ══════════════════════════════════════════════════════════════════════════════
# 1. Competitor feature coverage                                       RUBRIC
# ══════════════════════════════════════════════════════════════════════════════
# Scoring method, stated on the chart and in COMPETITIVE_LANDSCAPE.md:
#   21 NAVIS-relevant capabilities. YES = 1.0, PARTIAL = 0.5, NO/UNKNOWN = 0.
#   UNKNOWN scores 0 because absence of published evidence is not evidence of
#   the capability - so every bar except NAVIS is a LOWER BOUND on what that
#   product can really do. Vendor marketing pages are not audited code.

def competitor_coverage():
    rows = list(csv.DictReader((RESEARCH / "competitor_matrix.csv").open(encoding="utf-8")))
    caps = [k for k in rows[0] if k not in ("system", "category", "url", "evidence_confidence")]
    scores, names, cats = [], [], []
    for r in rows:
        v = sum(1.0 if r[c].strip() == "YES" else 0.5 if r[c].strip() == "PARTIAL" else 0.0
                for c in caps)
        scores.append(v / len(caps) * 100)
        names.append(r["system"])
        cats.append(r["category"])
    order = np.argsort(scores)
    scores = [scores[i] for i in order]
    names = [names[i] for i in order]
    cats = [cats[i] for i in order]
    palette = {"A. Direct": RED, "B. Partial": AMBER, "C. Adjacent": BLUE,
               "D. Complementary": GREY, "E. Research/OSS": VIOLET, "NAVIS": TEAL}
    colors = [palette.get(c, GREY) for c in cats]

    fig, ax = plt.subplots(figsize=(9, 7.2))
    ax.barh(names, scores, color=colors, height=0.68)
    for i, (s, c) in enumerate(zip(scores, cats)):
        ax.text(s + 1, i, f"{s:.0f}%", va="center", fontsize=8,
                color=INK, fontweight="bold" if c == "NAVIS" else "normal")
    ax.set_xlim(0, 100)
    ax.set_xlabel("% of the 21 NAVIS-relevant capabilities with supporting evidence")
    ax.set_title("Competitor coverage of the NAVIS capability set\n"
                 "every non-NAVIS bar is a LOWER BOUND (UNKNOWN scores 0)")
    handles = [plt.Rectangle((0, 0), 1, 1, color=v) for v in palette.values()]
    ax.legend(handles, palette.keys(), fontsize=7.5, loc="lower right", frameon=False)
    stamp(fig, "RUBRIC + published evidence - scoring defined in research/COMPETITIVE_LANDSCAPE.md; "
                "cells in research/competitor_matrix.csv. YES=1, PARTIAL=0.5, NO/UNKNOWN=0.")
    save(fig, "competitor_feature_coverage.png")


# ══════════════════════════════════════════════════════════════════════════════
# 2. NAVIS innovation scores                                           RUBRIC
# ══════════════════════════════════════════════════════════════════════════════

def innovation_scores():
    rows = list(csv.DictReader((RESEARCH / "innovation_scores.csv").open(encoding="utf-8")))
    rows.sort(key=lambda r: float(r["defensibility"]))
    names = [r["feature"] for r in rows]
    dims = [("industry_novelty", "Industry novelty", RED),
            ("technical_difficulty", "Technical difficulty", BLUE),
            ("sih_demo_value", "SIH demo value", AMBER),
            ("defensibility", "Defensibility", TEAL)]
    y = np.arange(len(names))
    h = 0.20
    fig, ax = plt.subplots(figsize=(10, 9))
    for k, (key, label, color) in enumerate(dims):
        vals = [float(r[key]) for r in rows]
        ax.barh(y + (k - 1.5) * h, vals, height=h, color=color, label=label)
    ax.set_yticks(y, names, fontsize=8)
    ax.set_xlim(0, 10)
    ax.set_xlabel("score (0-10)")
    ax.set_title("NAVIS feature-by-feature innovation profile\n"
                 "sorted by defensibility - the bottom of this chart is what NOT to claim")
    ax.legend(fontsize=8, ncol=4, loc="lower right", frameon=False)
    ax.axvline(5, color=MUTED, lw=0.8, ls=":")
    stamp(fig, "RUBRIC - each axis defined in research/INNOVATION_ANALYSIS.md. These are reasoned "
                "judgements against the evidence in EVIDENCE.md, not measurements.")
    save(fig, "navis_innovation_scores.png")


# ══════════════════════════════════════════════════════════════════════════════
# 3. PS requirement coverage                                          AUDITED
# ══════════════════════════════════════════════════════════════════════════════

def ps_coverage():
    rows = list(csv.DictReader((RESEARCH / "feature_gap_matrix.csv").open(encoding="utf-8")))
    order = ["IMPLEMENTED", "PARTIAL", "DEMO/MOCK", "MISSING", "NOT_REQUIRED_FOR_MVP"]
    color = {"IMPLEMENTED": TEAL, "PARTIAL": AMBER, "DEMO/MOCK": BLUE,
             "MISSING": RED, "NOT_REQUIRED_FOR_MVP": GREY}
    counts = {k: sum(1 for r in rows if r["status"] == k) for k in order}

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 5.6),
                                   gridspec_kw={"width_ratios": [1, 1.45]})
    ax1.bar(range(len(order)), [counts[k] for k in order],
            color=[color[k] for k in order], width=0.62)
    for i, k in enumerate(order):
        ax1.text(i, counts[k] + 0.12, str(counts[k]), ha="center", fontweight="bold")
    ax1.set_xticks(range(len(order)),
                   [k.replace("_", "\n").replace("/", "/\n") for k in order], fontsize=7.5)
    ax1.set_ylabel("PS requirements")
    ax1.set_title(f"PS requirement coverage ({len(rows)} requirements)")
    ax1.set_ylim(0, max(counts.values()) + 1.2)

    stat = {k: i for i, k in enumerate(order)}
    rows2 = sorted(rows, key=lambda r: (stat[r["status"]], r["requirement"]))
    ax2.set_axis_off()
    ax2.set_title("per requirement", loc="left")
    for i, r in enumerate(rows2):
        yv = 1 - i / (len(rows2) + 0.5)
        ax2.add_patch(plt.Rectangle((0, yv - 0.018), 0.028, 0.026,
                                    color=color[r["status"]], transform=ax2.transAxes,
                                    clip_on=False))
        ax2.text(0.042, yv - 0.006, r["requirement"][:74], fontsize=7,
                 transform=ax2.transAxes, va="center", color=INK)
    stamp(fig, "AUDITED - status read from code, not documentation. Cells in "
                "research/feature_gap_matrix.csv; reasoning in research/PS_ANALYSIS.md.")
    save(fig, "ps_requirement_coverage.png")


# ══════════════════════════════════════════════════════════════════════════════
# 4. SIH scorecard                                                     RUBRIC
# ══════════════════════════════════════════════════════════════════════════════

SIH = [  # (dimension, score/10, weight) - defined in SIH_JUDGE_ANALYSIS.md
    ("Problem understanding", 9.0, 8),
    ("Relevance to PS", 9.0, 10),
    ("Innovation", 6.0, 10),
    ("Technical sophistication", 8.0, 9),
    ("Practicality", 7.5, 7),
    ("Scalability", 6.0, 5),
    ("UX / field usability", 7.0, 6),
    ("AI justification", 6.5, 7),
    ("Architecture", 8.5, 8),
    ("Data handling", 8.0, 6),
    ("Security", 4.5, 4),
    ("Explainability", 9.5, 8),
    ("Demo strength", 7.5, 9),
    ("Commercial usefulness", 7.0, 5),
    ("Deployment feasibility", 7.5, 4),
]


def sih_scorecard():
    labels = [d for d, _, _ in SIH]
    vals = [s for _, s, _ in SIH]
    wts = [w for _, _, w in SIH]
    weighted = sum(s * w for _, s, w in SIH) / sum(wts)

    fig = plt.figure(figsize=(12.5, 5.8))
    ax = fig.add_subplot(1, 2, 1)
    cols = [TEAL if v >= 8 else AMBER if v >= 6.5 else RED for v in vals]
    o = np.argsort(vals)
    ax.barh([labels[i] for i in o], [vals[i] for i in o], color=[cols[i] for i in o], height=0.66)
    for k, i in enumerate(o):
        ax.text(vals[i] + 0.12, k, f"{vals[i]:.1f}", va="center", fontsize=8)
    ax.set_xlim(0, 10)
    ax.set_xlabel("score (0-10)")
    ax.set_title(f"SIH evaluation dimensions\nweighted overall = {weighted:.1f}/10")
    ax.axvline(weighted, color=INK, lw=1.1, ls="--")
    ax.text(weighted + 0.1, -0.85, "weighted mean", fontsize=7, color=INK)

    axr = fig.add_subplot(1, 2, 2, polar=True)
    ang = np.linspace(0, 2 * np.pi, len(labels), endpoint=False).tolist()
    v = vals + vals[:1]
    a = ang + ang[:1]
    axr.plot(a, v, color=BLUE, lw=1.8)
    axr.fill(a, v, color=BLUE, alpha=0.18)
    axr.set_xticks(ang)
    axr.set_xticklabels([l.replace(" / ", "/\n").replace(" ", "\n", 1) for l in labels], fontsize=6.5)
    axr.set_ylim(0, 10)
    axr.set_yticks([2, 4, 6, 8, 10])
    axr.set_yticklabels(["2", "4", "6", "8", "10"], fontsize=6, color=MUTED)
    axr.grid(alpha=0.35)
    axr.set_title("shape of the project", pad=18)
    stamp(fig, "RUBRIC - scores and weights are this analysis's judgement, defined with reasoning "
                "in research/SIH_JUDGE_ANALYSIS.md. Not a measurement and not an SIH rubric.")
    save(fig, "sih_scorecard.png")


# ══════════════════════════════════════════════════════════════════════════════
# 5. Implementation status                                            AUDITED
# ══════════════════════════════════════════════════════════════════════════════

PIPELINE = [  # (stage, status) - from NAVIS_TECHNICAL_AUDIT.md, read from code
    ("Input: DPR free text (.txt)", "IMPLEMENTED"),
    ("Input: discipline spreadsheet (.xlsx)", "IMPLEMENTED"),
    ("Input: conversational agent turn", "IMPLEMENTED"),
    ("Input: browser speech-to-text", "PARTIAL"),
    ("Input: scanned document / OCR", "NOT FOUND"),
    ("Input: Primavera PMXML / XER import", "NOT FOUND"),
    ("Ingestion: upload, sha256 dedup, job record", "IMPLEMENTED"),
    ("Extraction: deterministic regex pre-pass", "IMPLEMENTED"),
    ("Extraction: LLM structured output", "PARTIAL"),
    ("Extraction: forecast-vs-actual date guard", "IMPLEMENTED"),
    ("Extraction: provenance line/row/span", "IMPLEMENTED"),
    ("Retrieval: exact tag channel", "IMPLEMENTED"),
    ("Retrieval: BM25 channel", "IMPLEMENTED"),
    ("Retrieval: dense MiniLM channel", "IMPLEMENTED"),
    ("Retrieval: weighted RRF fusion", "IMPLEMENTED"),
    ("Ranking: 6-feature scoring", "IMPLEMENTED"),
    ("Ranking: dense feature for all candidates", "DEFECT"),
    ("Confidence: threshold + margin policy", "IMPLEMENTED"),
    ("Decision: AUTO_LINK / REVIEW / NEW_ACTIVITY", "IMPLEMENTED"),
    ("Granularity: many-to-one roll-up", "IMPLEMENTED"),
    ("Granularity: partial-scope finish guard", "IMPLEMENTED"),
    ("Persistence: SQLite schedule write", "IMPLEMENTED"),
    ("Persistence: append-only audit trail", "IMPLEMENTED"),
    ("Persistence: cross-upload conflict detect", "IMPLEMENTED"),
    ("Review: planner queue + resolve", "IMPLEMENTED"),
    ("Review: clarification back to supervisor", "IMPLEMENTED"),
    ("Learning: alias lexicon WRITE", "IMPLEMENTED"),
    ("Learning: alias lexicon READ by matcher", "NOT FOUND"),
    ("UI: planner ingest/reconcile/schedule/memory", "IMPLEMENTED"),
    ("UI: field supervisor agent screens", "IMPLEMENTED"),
    ("Analytics: duration / productivity / delay", "PARTIAL"),
    ("Export: PMXML + XER write-out", "IMPLEMENTED"),
    ("Auth / users / project isolation", "NOT FOUND"),
]


def implementation_status():
    color = {"IMPLEMENTED": TEAL, "PARTIAL": AMBER, "DEFECT": VIOLET,
             "MOCKED": BLUE, "NOT FOUND": RED}
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 8.4),
                                   gridspec_kw={"width_ratios": [2.5, 1]})
    names = [n for n, _ in PIPELINE][::-1]
    stats = [s for _, s in PIPELINE][::-1]
    ax1.barh(names, [1] * len(names), color=[color[s] for s in stats], height=0.72)
    for i, s in enumerate(stats):
        ax1.text(0.5, i, s, ha="center", va="center", fontsize=6.8,
                 color="white", fontweight="bold")
    ax1.set_xlim(0, 1)
    ax1.set_xticks([])
    ax1.tick_params(labelsize=7.5)
    ax1.grid(False)
    ax1.set_title("NAVIS pipeline components, verified against code")

    counts = {}
    for _, s in PIPELINE:
        counts[s] = counts.get(s, 0) + 1
    ks = sorted(counts, key=lambda k: -counts[k])
    ax2.pie([counts[k] for k in ks], labels=[f"{k}\n{counts[k]}" for k in ks],
            colors=[color[k] for k in ks], autopct="%1.0f%%",
            textprops={"fontsize": 7.5}, wedgeprops={"linewidth": 1, "edgecolor": "white"})
    ax2.set_title(f"{len(PIPELINE)} components audited")
    stamp(fig, "AUDITED - every row traced to a file and symbol in research/NAVIS_TECHNICAL_AUDIT.md. "
                "DEFECT = implemented but measurably wrong (see research/EXPERIMENTS.md).")
    save(fig, "implementation_status.png")


# ══════════════════════════════════════════════════════════════════════════════
# 6. Risk matrix                                                       RUBRIC
# ══════════════════════════════════════════════════════════════════════════════

RISKS = [  # (label, probability 1-5, impact 1-5, short)
    ("R1", 4, 5, "Judge asks 'why not just BM25/an LLM?' - answer needs the\n"
                 "measured gate curve, not an opinion"),
    ("R2", 5, 3, "Baseline is a hand-written JSON, not a parsed Primavera file"),
    ("R3", 3, 5, "Dense-feature renormalisation defect costs 2.5 pts of top-1"),
    ("R4", 4, 4, "Ground truth and DPRs generated together - circular evaluation"),
    ("R5", 3, 4, "'LLM-based agent' in the PS; agent slot-filling is regex"),
    ("R6", 2, 5, "Live demo fails on venue laptop (cold model / offline)"),
    ("R7", 4, 3, "Alias lexicon is write-only: no learning loop despite the claim"),
    ("R8", 3, 3, "Institutional memory thin: 47/120 activities have both dates"),
    ("R9", 5, 2, "No authentication - any caller can move a schedule date"),
    ("R10", 2, 4, "NO_MATCH rejection is 1/12; unplanned work lands in REVIEW"),
    ("R11", 3, 2, "MiniLM download needed on a cold machine"),
    ("R12", 2, 3, "Vision competitors (Buildots/Doxel) framed as rivals, not\n"
                  "complements, and the pitch loses its niche"),
]


def risk_matrix():
    fig, ax = plt.subplots(figsize=(9.5, 7.6))
    xs = np.arange(0.5, 5.6, 0.02)
    ax.imshow(np.add.outer(np.linspace(1, 5, 200), np.linspace(1, 5, 200)),
              extent=[0.5, 5.5, 0.5, 5.5], origin="lower", cmap="RdYlGn_r",
              alpha=0.20, aspect="auto")
    for label, p, i, txt in RISKS:
        sev = p * i
        c = RED if sev >= 16 else AMBER if sev >= 9 else TEAL
        ax.scatter(p, i, s=430, color=c, edgecolor="white", linewidth=1.6, zorder=3)
        ax.text(p, i, label, ha="center", va="center", fontsize=8,
                color="white", fontweight="bold", zorder=4)
    ax.set_xlim(0.5, 5.5)
    ax.set_ylim(0.5, 5.5)
    ax.set_xticks(range(1, 6), ["1 rare", "2", "3 possible", "4", "5 near-certain"], fontsize=8)
    ax.set_yticks(range(1, 6), ["1 minor", "2", "3 moderate", "4", "5 severe"], fontsize=8)
    ax.set_xlabel("probability before the demo")
    ax.set_ylabel("impact on the SIH outcome")
    ax.set_title("NAVIS pre-demo risk matrix (probability x impact)")
    legend = "\n".join(f"{l}  {t}" for l, _, _, t in RISKS)
    fig.text(1.0, 0.5, legend, fontsize=7.2, va="center", ha="left", color=INK)
    stamp(fig, "RUBRIC - probability/impact are this analysis's judgement; each risk traces to a "
                "finding in NAVIS_TECHNICAL_AUDIT.md or JUDGE_QUESTIONS.md.")
    save(fig, "risk_matrix.png")


# ══════════════════════════════════════════════════════════════════════════════
# 7. Architecture pipeline                                            AUDITED
# ══════════════════════════════════════════════════════════════════════════════

def architecture():
    fig, ax = plt.subplots(figsize=(13.5, 8.6))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")

    def box(x, y, w, h, title, sub, fc, ec, fs=8.2):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.6,rounding_size=1.4",
                                    facecolor=fc, edgecolor=ec, linewidth=1.3, zorder=2))
        ax.text(x + w / 2, y + h - 3.0, title, ha="center", va="top", fontsize=fs,
                fontweight="bold", color=INK, zorder=3)
        if sub:
            ax.text(x + w / 2, y + h - 7.2, sub, ha="center", va="top", fontsize=6.6,
                    color=MUTED, zorder=3, linespacing=1.45)

    def arrow(x1, y1, x2, y2, color=MUTED, style="-|>", lw=1.3, ls="-"):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                                     mutation_scale=12, color=color, lw=lw,
                                     linestyle=ls, zorder=1,
                                     shrinkA=1, shrinkB=1))

    ax.text(50, 97.5, "NAVIS pipeline as implemented", ha="center",
            fontsize=13, fontweight="bold", color=INK)
    ax.text(50, 94.2, "solid = deterministic and always on   |   dashed = optional LLM, off by default "
            "(EXTRACTION_PROVIDER=rules)", ha="center", fontsize=7.4, color=MUTED)

    # Row 1 - untrusted inputs
    box(2, 78, 20, 13, "UNTRUSTED FIELD INPUT",
        "DPR .txt  |  discipline .xlsx\nagent turn  |  browser speech", "#fdf0ec", RED)
    box(26, 78, 20, 13, "INGESTION",
        "POST /ingest\nsha256 dedup -> Job\nextension allow-list", "#eef4f9", BLUE)
    box(50, 78, 22, 13, "EXTRACTION",
        "regex pre-pass owns tags + dates\nLLM (optional) reads intent only\nforecast guard blocks plans",
        "#eef4f9", BLUE)
    box(76, 78, 22, 13, "SCHEMA VALIDATION",
        "ExtractedEvent (Pydantic,\nextra='forbid')\nprovenance mandatory", "#eef7f4", TEAL)

    arrow(22, 84.5, 26, 84.5)
    arrow(46, 84.5, 50, 84.5)
    arrow(72, 84.5, 76, 84.5)

    # Row 2 - retrieval
    box(6, 56, 21, 15, "HYBRID RETRIEVAL  (recall)",
        "TAG exact  w=1.0\nBM25 lexical  w=0.7\nDENSE MiniLM  w=0.7", "#f4f0f8", VIOLET)
    box(31, 56, 17, 15, "RRF FUSION",
        "w / (60 + rank)\ntop-20 pool\nchannel provenance kept", "#f4f0f8", VIOLET)
    box(52, 56, 22, 15, "FEATURE SCORING  (precision)",
        "tag_overlap .32   fuzzy .20\nembedding .22   date .10\ndiscipline .06   predecessor .06",
        "#f4f0f8", VIOLET)
    box(78, 56, 20, 15, "CONFIDENCE POLICY",
        "tau_high 0.775 / tau_low 0.5\nmargin(top1,top2) >= 0.03\ndiscipline-conflict veto",
        "#fdf7ec", AMBER)

    arrow(87, 78, 87, 71)
    ax.text(88.4, 74.4, "one event", fontsize=6.4, color=MUTED)
    arrow(78, 63.5, 74, 63.5, style="<|-")
    arrow(52, 63.5, 48, 63.5, style="<|-")
    arrow(31, 63.5, 27, 63.5, style="<|-")

    # Row 3 - decisions
    box(4, 36, 19, 12, "AUTO_LINK",
        "score >= tau_high AND margin ok\nmeasured 100% precision\nat 50.4% coverage", "#eef7f4", TEAL)
    box(27, 36, 19, 12, "REVIEW",
        "planner queue with evidence\n+ clarification back to\nthe supervisor", "#fdf7ec", AMBER)
    box(50, 36, 19, 12, "NEW_ACTIVITY",
        "score < tau_low\nunplanned scope surfaced,\nnever silently dropped", "#fdf0ec", RED)
    box(73, 36, 25, 12, "NOTHING IS WRITTEN BY THE LLM",
        "every schedule mutation goes through\n_apply_rollup_to_schedule() or\nPOST /review/{id}/resolve",
        "#f3f4f6", MUTED)

    arrow(83, 56, 60, 48.5)
    arrow(83, 56, 37, 48.5)
    arrow(83, 56, 14, 48.5)

    # Row 4 - roll-up and persistence
    box(6, 17, 27, 14, "GRANULARITY ROLL-UP",
        "many mentions -> one L5/L6 node\nqty-based % complete; unit required\nActual Finish only at 100%\n"
        "earliest start / latest finish wins", "#eef4f9", BLUE)
    box(37, 17, 26, 14, "PERSISTENCE (SQLite)",
        "activities  linked_events\nreview_queue  alias_lexicon\naudit_records = APPEND ONLY\n"
        "cross-upload conflict detection", "#eef4f9", BLUE)
    box(67, 17, 31, 14, "PLANNER + FIELD UI (React)",
        "Ingest | Reconcile | Schedule | Memory\nField: agent, reports, clarifications\n"
        "every row shows confidence + source line", "#eef4f9", BLUE)

    arrow(14, 36, 19, 31)
    arrow(37, 36, 45, 31)
    arrow(33, 24, 37, 24)
    arrow(63, 24, 67, 24)

    # Row 5 - memory
    box(6, 2, 42, 11, "INSTITUTIONAL MEMORY  (GET /memory/query)",
        "actual-vs-planned duration per activity type  |  discipline productivity\n"
        "keyword-matched delay causes  |  suggested duration (>= 2 completions)\n"
        "computed live from captured execution data, sample size shown", "#eef7f4", TEAL)
    box(52, 2, 22, 11, "EXPORT",
        "POST /schedule/export\nPMXML + XER write-out\n(no import path yet)", "#fdf7ec", AMBER)
    box(78, 2, 20, 11, "LEARNING LOOP",
        "planner correction ->\nalias_lexicon WRITE\nnever read back: GAP", "#fdf0ec", RED)

    arrow(50, 24, 27, 13)
    arrow(50, 17, 63, 13)
    arrow(50, 17, 88, 13)

    stamp(fig, "AUDITED - drawn from matching/, extraction/, server/ and frontend/src as they exist "
                "on this branch. Threshold and coverage figures are measured (research/EXPERIMENTS.md).")
    save(fig, "architecture_pipeline.png")


# ══════════════════════════════════════════════════════════════════════════════
# 8. Matching engine ablation                                        MEASURED
# ══════════════════════════════════════════════════════════════════════════════

def ablation():
    ab = load("ablation.json")
    dn = load("densefix.json")
    gate = load("bm25gate.json")

    arms = ab["arms"]
    names = [a["arm"] for a in arms]
    top1 = [a["top1"] * 100 for a in arms]
    r5 = [a["recall5"] * 100 for a in arms]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.5, 5.9),
                                   gridspec_kw={"width_ratios": [1.15, 1]})

    x = np.arange(len(names))
    ax1.bar(x - 0.19, top1, 0.38, label="Top-1 accuracy", color=BLUE)
    ax1.bar(x + 0.19, r5, 0.38, label="Recall@5", color=TEAL)
    for i, (t, r) in enumerate(zip(top1, r5)):
        ax1.text(i - 0.19, t + 1.2, f"{t:.1f}", ha="center", fontsize=7.4)
        ax1.text(i + 0.19, r + 1.2, f"{r:.1f}", ha="center", fontsize=7.4)
    fx = dn["dense_filled"]["top1"] * 100
    ax1.bar(len(names) - 1 + 0.0, 0, 0)  # keep spacing
    ax1.axhline(fx, color=VIOLET, ls="--", lw=1.2)
    ax1.text(len(names) - 0.5, fx + 1.2, f"{fx:.1f}  hybrid with the dense-feature fix",
             fontsize=7.2, color=VIOLET, ha="right")
    ax1.set_xticks(x, [n.replace(" (", "\n(") for n in names], fontsize=7.4)
    ax1.set_ylim(0, 108)
    ax1.set_ylabel("%")
    ax1.set_title(f"Retrieval / ranking ablation\n{ab['n_gold_positive']} gold-positive mentions, "
                  "identical events to eval.py")
    ax1.legend(fontsize=8, frameon=False, loc="lower left")

    cov = [g["coverage"] * 100 for g in gate]
    prec = [g["auto_precision"] * 100 for g in gate]
    ax2.plot(cov, prec, "-o", color=AMBER, ms=4.5, lw=1.6, label="BM25 score gate")
    for g in gate:
        if g["gate"] in (6, 12, 14, 20):
            ax2.annotate(f"BM25>={g['gate']}", (g["coverage"] * 100, g["auto_precision"] * 100),
                         textcoords="offset points", xytext=(6, -10), fontsize=6.8, color=MUTED)
    ax2.scatter([50.4], [100.0], s=170, color=TEAL, zorder=5, edgecolor="white", linewidth=1.5,
                label="NAVIS shipped operating point")
    ax2.scatter([dn["dense_filled"]["coverage"] * 100], [dn["dense_filled"]["auto_precision"] * 100],
                s=170, color=VIOLET, zorder=5, marker="D", edgecolor="white", linewidth=1.5,
                label="NAVIS with the dense-feature fix")
    ax2.annotate("same precision,\n+15.4 pts coverage", (50.4, 100.0),
                 textcoords="offset points", xytext=(-96, -30), fontsize=7.6, color=INK,
                 arrowprops=dict(arrowstyle="->", color=INK, lw=1))
    ax2.set_xlabel("coverage - % of mentions auto-linked without a planner")
    ax2.set_ylabel("auto-link precision (%)")
    ax2.set_ylim(90, 101.5)
    ax2.set_xlim(0, 100)
    ax2.set_title("Why the hybrid earns its place\nBM25 ranks better; the hybrid GATES better")
    ax2.legend(fontsize=7.6, frameon=False, loc="lower left")

    stamp(fig, "MEASURED - research/data/ablation.py, densefix.py, bm25gate.py against the real "
                "engine and dataset/ground_truth.csv. Reproduce: see research/EXPERIMENTS.md.")
    save(fig, "matching_engine_ablation.png")


# ══════════════════════════════════════════════════════════════════════════════
# 9. Precision-at-coverage + latency                                 MEASURED
# ══════════════════════════════════════════════════════════════════════════════

CURVE = [  # from `python eval.py`, verbatim (research/data/eval_output.txt)
    (0.550, 72.4, 92.4), (0.600, 71.3, 92.8), (0.650, 67.7, 94.8),
    (0.700, 64.6, 96.3), (0.750, 57.1, 97.9), (0.775, 50.4, 100.0),
    (0.800, 44.9, 100.0), (0.825, 35.4, 100.0), (0.850, 20.9, 100.0),
    (0.875, 12.6, 100.0), (0.900, 6.7, 100.0), (0.925, 1.6, 100.0),
]


def operating_point():
    lat = load("latency.json")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.4))

    tau = [c[0] for c in CURVE]
    cov = [c[1] for c in CURVE]
    pre = [c[2] for c in CURVE]
    ax1.plot(tau, cov, "-o", color=BLUE, ms=4, label="coverage (auto-linked)")
    ax1.plot(tau, pre, "-s", color=TEAL, ms=4, label="auto-link precision")
    ax1.axvline(0.775, color=RED, ls="--", lw=1.2)
    ax1.text(0.778, 30, "shipped tau_high = 0.775\nfirst point where a wrong\nauto-link stops happening",
             fontsize=7.2, color=RED)
    ax1.set_xlabel("tau_high")
    ax1.set_ylabel("%")
    ax1.set_ylim(0, 105)
    ax1.set_title("Calibration: what the threshold buys\n(from `python eval.py`)")
    ax1.legend(fontsize=8, frameon=False, loc="center left")

    files = [f["file"].replace(".txt", "").replace("dpr_day_", "DPR ") for f in lat["files"]]
    ex = [f["extract_s"] * 1000 for f in lat["files"]]
    mt = [f["match_s"] * 1000 for f in lat["files"]]
    y = np.arange(len(files))
    ax2.barh(y, ex, color=AMBER, label="extraction")
    ax2.barh(y, mt, left=ex, color=VIOLET, label="retrieval + scoring")
    ax2.set_yticks(y, files, fontsize=7)
    ax2.set_xlabel("milliseconds per file (rules-only, the default provider)")
    ax2.set_title(f"End-to-end latency\n{lat['total_events']} events in {lat['total_s']:.2f} s = "
                  f"{lat['total_s']/lat['total_events']*1000:.1f} ms/event")
    ax2.legend(fontsize=8, frameon=False, loc="lower right")
    stamp(fig, "MEASURED - left: `python eval.py`. right: research/data/latency.py. "
                f"Cold start (index + embed 120 activities) {lat['cold_start_s']:.1f} s, once per process.")
    save(fig, "operating_point_and_latency.png")


if __name__ == "__main__":
    competitor_coverage()
    innovation_scores()
    ps_coverage()
    sih_scorecard()
    implementation_status()
    risk_matrix()
    architecture()
    ablation()
    operating_point()
    print("\nall figures written to research/graphs/")
