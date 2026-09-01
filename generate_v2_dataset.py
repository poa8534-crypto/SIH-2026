#!/usr/bin/env python3
"""Generate the v2 evaluation dataset against dataset/baseline_schedule_v2.json.

The schedule, the daily reports, the spreadsheets and the ground truth are one
artifact family. A partial swap silently destroys every metric, so this script
regenerates all of them together from a single seed and validates the result
before it writes anything permanent.

Outputs (all under dataset/v2/, nothing in dataset/ is touched):

    dpr_day_XX.txt          28 daily progress reports across the v2 date range
    *_progress.xlsx         5 discipline registers
    ground_truth_v2.csv     the evaluation key
    splits.json             stratified train / dev / test, fixed seed
    VALIDATION.md           the checks this script ran and their results

`ground_truth_v2.csv` carries two columns the v1 key does not:

    mention_date  the date stated IN the mention text, resolved to ISO, empty
                  when the text states none. This is what lets eval tell an
                  EXPLICIT finish date from one DEFAULTED_TO_REPORT_DATE — the
                  harness artefact that made the v1 roll-up withhold every
                  finish date it had.
    split         train | dev | test

Usage:  python generate_v2_dataset.py
"""

from __future__ import annotations

import csv
import json
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from extraction.prepass import extract_tags  # noqa: E402
from matching.providers import JsonScheduleProvider  # noqa: E402

SEED = 20260901
SCHEDULE = PROJECT_ROOT / "dataset" / "baseline_schedule_v2.json"
OUT = PROJECT_ROOT / "dataset" / "v2"

N_DPRS = 28
MESSY_DPRS = {7, 15, 22, 26}          # deliberately degraded reports
TARGET_MENTIONS = 700
MIN_HARD_NEGATIVES = 60
MIN_TAG_FREE_FRACTION = 0.35

rng = random.Random(SEED)


# ══════════════════════════════════════════════════════════════════════════════
# Tag handling
# ══════════════════════════════════════════════════════════════════════════════

# A line tag as the schedule writes it: 10"-P-1602-B1A
LINE_TAG_RE = re.compile(r'(\d{1,2})\s*"\s*-\s*([A-Z]{1,3}-\d{3,4}(?:-[A-Z0-9]+)?)')
# An equipment / instrument tag: V-1101, PT-1101, TK-2101, MCC-1, P-1401A/B
EQUIP_TAG_RE = re.compile(r'\b([A-Z]{1,4})-(\d{1,4}[A-Z]?(?:/[A-Z])?)\b')

#: What a tag is, in words, so a tag-free mention can still name the thing.
GENERIC = {
    "V": "separator vessel", "TK": "storage tank", "FST": "flare stack",
    "P": "pump", "PK": "compressor package", "T": "transformer",
    "PT": "pressure transmitter", "LT": "level transmitter",
    "TE": "temperature element", "FE": "flow meter", "MCC": "MCC",
    "OWS": "oily water sewer", "WHCP": "wellhead control panel",
    "SDV": "shutdown valve", "PSV": "relief valve", "JB": "junction box",
    "MOV": "motorised valve", "HT": "heater treater", "KOD": "knockout drum",
}

SIZE_WORD = {
    "2": "two inch", "3": "three inch", "4": "four inch", "6": "six inch",
    "8": "eight inch", "10": "ten inch", "12": "twelve inch",
    "14": "fourteen inch", "16": "sixteen inch", "18": "eighteen inch",
    "20": "twenty inch", "24": "twenty four inch",
}


def make_tag_free(text: str) -> str:
    """Rewrite a description so no line or equipment tag survives.

    A matcher that can only work when a tag is present has not solved the
    problem the PS describes — most field prose names no tag at all. These
    variants are what force the ranker to earn the match from description
    similarity, discipline and date instead.
    """
    def line_sub(m):
        size = SIZE_WORD.get(m.group(1), f"{m.group(1)} inch")
        return f"the {size} line"

    out = LINE_TAG_RE.sub(line_sub, text)

    def equip_sub(m):
        prefix = m.group(1).upper()
        return f"the {GENERIC.get(prefix, 'unit')}"

    out = EQUIP_TAG_RE.sub(equip_sub, out)
    out = re.sub(r'\b\d{1,2}\s*"\s*', lambda m: SIZE_WORD.get(
        m.group(0).strip().strip('"').strip(), "") + " ", out)
    out = _tidy_substitutions(out)
    out = re.sub(r'\s{2,}', " ", out).replace(" ,", ",").strip()

    # Belt and braces: whatever the regexes missed, the extractor is the
    # authority on what counts as a tag, so ask it and strip token by token.
    guard = 0
    while extract_tags(out) and guard < 6:
        for tag in extract_tags(out):
            out = out.replace(tag, "").strip()
        out = re.sub(r'\s{2,}', " ", out)
        guard += 1
    if extract_tags(out):
        out = " ".join(w for w in out.split() if not re.search(r'\d.*-|-.*\d', w))
    return re.sub(r'\s{2,}', " ", out).strip(" ,-")


def _tidy_substitutions(text: str) -> str:
    """Repair the doubled nouns that tag substitution creates.

    Replacing a tag with what it is in words leaves the noun stated twice:
    `Erect line 8"-P-1502-A3A` becomes *"Erect line the eight inch line"*, and
    `flare stack base FST-1301` becomes *"flare stack base the flare stack"*.
    Field prose is terse and ungrammatical, but it is not redundant like that,
    and a corpus full of it reads as generated rather than written.
    """
    # A noun immediately before its own restatement: "line the eight inch line"
    # -> "the eight inch line".
    text = re.sub(
        r'\b(\w+)\s+(the\s+(?:\w+\s+){0,3}\1)\b',
        lambda m: m.group(2), text, flags=re.IGNORECASE)

    # The same noun phrase restated later in the clause: "flare stack base the
    # flare stack" -> "flare stack base".
    def drop_trailing_repeat(m):
        return m.group(1) + m.group(2)

    text = re.sub(
        r'\b((?:\w+\s+){0,2}\w+)((?:\s+\w+){0,2}?)\s+the\s+\1\b',
        drop_trailing_repeat, text, flags=re.IGNORECASE)

    # "pumps the pump to manifold" -> "the pumps to manifold": a plural head
    # noun swallowed by its own singular restatement.
    text = re.sub(
        r'\b(\w+?)s\s+the\s+\1\b', lambda m: f"the {m.group(1)}s",
        text, flags=re.IGNORECASE)

    text = re.sub(r'\s+,', ",", text)
    return re.sub(r'\s{2,}', " ", text).strip()


#: A tag as a human reads it, independent of what the extractor recognises.
#: Needed because `extraction.prepass.extract_tags` misses every 4-digit
#: equipment tag v2 uses (V-1101, PT-1101, TK-2101 ...), so measuring
#: "tag-free" with it alone would report a corpus as tag-free when the tags are
#: sitting in the text unread. Both numbers are reported; the gap between them
#: IS the finding.
LITERAL_TAG_RE = re.compile(
    r'(\d{1,2}\s*"\s*-\s*[A-Z]{1,3}-\d{3,4}(?:-[A-Z0-9]+)?)'   # 10"-P-1602-B1A
    r'|\b([A-Z]{1,4}-\d{1,4}[A-Z]?(?:/[A-Z])?)\b'                 # V-1101, P-1401A/B
)


def literal_tags(text: str) -> list[str]:
    """Every tag-shaped token in the text, as a person would pick them out."""
    return ["".join(m) for m in LITERAL_TAG_RE.findall(text)]


# ══════════════════════════════════════════════════════════════════════════════
# Date rendering
# ══════════════════════════════════════════════════════════════════════════════

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def render_date(d: date, report_date: date, style: int | None = None) -> tuple[str, date]:
    """A date as a site engineer would write it, plus what it resolves to.

    Mixed formats within one file are the point: the v1 corpus proved the
    extractor handles them, and a regenerated corpus that quietly standardised
    on ISO would make the date pipeline look more robust than it is.
    """
    style = rng.randrange(7) if style is None else style
    if style == 0:
        return d.strftime("%d/%m/%Y"), d
    if style == 1:
        return d.isoformat(), d
    if style == 2:
        return f"{d.day:02d}/{MONTHS[d.month - 1]}/{d.year}", d
    if style == 3:
        return f"{d.day} {MONTHS[d.month - 1]}", d
    if style == 4:
        return f"{d.day} {MONTHS[d.month - 1]} {d.year}", d
    if style == 5 and d == report_date - timedelta(days=1):
        return "yesterday", d
    if style == 6 and d == report_date:
        return "today", d
    return f"{d.day} {MONTHS[d.month - 1]}", d


# ══════════════════════════════════════════════════════════════════════════════
# Mention generation
# ══════════════════════════════════════════════════════════════════════════════

ABBREV = {
    "foundation": "fdn", "installation": "instln", "equipment": "equip",
    "temporary": "temp", "substation": "s/s", "transformer": "xmer",
    "instrument": "instr", "electrical": "elec", "hydrotest": "hydro",
    "concrete": "conc", "reinforcement": "reinf", "excavation": "excav",
    "compaction": "compctn", "termination": "termn", "calibration": "calib",
}

HINGLISH = [
    "kaam chalu hai", "baaki kal karenge", "material ka issue tha",
    "labour kam tha aaj", "aaj shuru kiya", "thoda delay hua",
]


def abbreviate(text: str) -> str:
    for full, short in ABBREV.items():
        if full in text.lower() and rng.random() < 0.5:
            text = re.sub(full, short, text, flags=re.IGNORECASE)
    return text


def core_phrases(act: dict) -> tuple[str, str]:
    """(tagged core, tag-free core) for one activity.

    Only 51 of the 218 v2 descriptions contain an extractable tag, but 101
    activities carry one in their `tag` field. Without folding that in, almost
    every generated mention would be tag-free and the corpus would never
    exercise the tag retrieval channel at all — the opposite failure to the one
    the 35% floor guards against.
    """
    desc = act["description"].strip()
    tagged = desc
    if not extract_tags(desc) and act.get("tag"):
        tagged = rng.choice([
            f"{desc} ({act['tag']})",
            f"{desc}, tag {act['tag']}",
            f"{act['tag']} — {desc}",
        ])
    return tagged, make_tag_free(desc)


def quantity_clause(act: dict, fraction: float) -> str:
    qty = act.get("planned_qty") or 0
    uom = (act.get("uom") or "").strip()
    if not qty or not uom:
        return ""
    done = max(1, round(qty * fraction))
    if uom == "nos":
        return f"{done:g} nos out of {qty:g}"
    # NOT "{done} {uom} of {qty} {uom}". `extraction.prepass.FRACTION_RE` is
    # `(\d+)\s+(?:of|out of)\s+(\d+)`, which reads the digit inside a unit
    # suffix: "40 m3 of 120 m3" parses as 3/120 = 2.5%, not 33%. Putting the
    # unit after the denominator keeps the phrasing natural and the arithmetic
    # honest. The extractor bug is real and is reported in VALIDATION.md rather
    # than fixed here.
    return f"{done:g} of {qty:g} {uom}"


def build_mention(act: dict, report_date: date, want_tag_free: bool,
                  messy: bool) -> tuple[str, str]:
    """One field mention of one activity, plus the ISO date it states ("" if
    it states none)."""
    tagged, free = core_phrases(act)
    core = free if want_tag_free else tagged
    if messy:
        core = abbreviate(core)

    ps = date.fromisoformat(act["planned_start"])
    pf = date.fromisoformat(act["planned_finish"])

    # Which kind of claim this line makes. Completions carry a date far more
    # often than progress lines do, which is exactly the distribution the
    # date_basis gate cares about.
    roll = rng.random()
    stated = ""

    if roll < 0.34:                                    # completion
        when = max(ps, min(pf, report_date - timedelta(days=rng.randrange(0, 6))))
        if rng.random() < 0.78:
            text_date, resolved = render_date(when, report_date)
            stated = resolved.isoformat()
            body = rng.choice([
                f"{core} completed {text_date}",
                f"{core} — completed on {text_date}",
                f"{core}, finished {text_date}, JMR raised",
                f"{core} closed out {text_date}",
            ])
        else:
            body = rng.choice([
                f"{core} completed",
                f"{core} is done and signed off",
                f"{core} — closed out this week",
            ])
    elif roll < 0.60:                                  # quantified progress
        qty = quantity_clause(act, rng.uniform(0.25, 0.85))
        if qty:
            body = rng.choice([
                f"{core} — {qty} done",
                f"{core}, {qty} complete so far",
                f"{core} in progress, {qty} achieved",
            ])
        else:
            body = f"{core} in progress, about {rng.randrange(20, 90)}% complete"
        if rng.random() < 0.28:
            text_date, resolved = render_date(
                report_date - timedelta(days=rng.randrange(0, 3)), report_date)
            stated = resolved.isoformat()
            body += f", as of {text_date}"
    elif roll < 0.76:                                  # start
        when = max(ps, report_date - timedelta(days=rng.randrange(0, 4)))
        if rng.random() < 0.6:
            text_date, resolved = render_date(when, report_date)
            stated = resolved.isoformat()
            body = rng.choice([
                f"{core} started {text_date}",
                f"{core} — commenced {text_date}",
                f"Work front opened for {core} on {text_date}",
            ])
        else:
            body = rng.choice([
                f"{core} started this morning",
                f"Mobilised for {core}",
                f"{core} taken up at site",
            ])
    elif roll < 0.88:                                  # delay / blocked
        body = rng.choice([
            f"{core} held up, awaiting client RFI clearance",
            f"{core} delayed by {rng.randrange(2, 6)} days, crane availability",
            f"{core} — progress slow, {rng.randrange(30, 70)}% only",
            f"{core} stopped, material shortage at store",
        ])
    else:                                              # bare narrative
        body = rng.choice([
            f"{core} ongoing",
            f"Crew deployed on {core}",
            f"{core} under way at the work front",
        ])

    if messy and rng.random() < 0.4:
        body = f"{body}. {rng.choice(HINGLISH)}"
    if messy and rng.random() < 0.25:
        body = body.lower()

    body = re.sub(r'\s{2,}', " ", body).strip()
    return body, stated


# ══════════════════════════════════════════════════════════════════════════════
# Hard negatives — plausible construction text with NO matching activity
# ══════════════════════════════════════════════════════════════════════════════

HARD_NEGATIVES: list[str] = [
    # unplanned / out-of-contract scope
    "Client requested additional bollards near the gatehouse, not in contract scope",
    "Extra soak pit constructed for wash bay, variation order raised",
    "Temporary diesel bowser stand fabricated at the laydown, unplanned scope",
    "Additional 40 m of boundary drain built on the north side at OIL request",
    "Rework of the guardhouse plinth after client comment, VO pending",
    "Extra crash barrier at the tanker turning circle, quoted separately",
    "Additional signage in Assamese requested by the district administration",
    "Unplanned soil replacement below the store shed, 60 m3 removed",
    "Client asked for a second wash bay, awaiting commercial approval",
    "Extra hardstanding for the client vehicle park, not in the BOQ",
    "Additional cable route survey requested for future Unit 3 tie-in",
    "Provision of an extra fire extinguisher rack at the workshop, VO raised",
    # site narrative and logistics
    "Two 40-ton trailers arrived at the gate, unloading tomorrow morning",
    "Crane operator on leave, replacement mobilised from Guwahati",
    "Night shift cancelled due to lighting tower breakdown",
    "Material reconciliation meeting held with the client store",
    "Weekly progress photo compilation submitted to the PMC",
    "JMR for November progress billing submitted to OIL",
    "Consumables inventory check carried out at the fabrication shed",
    "Diesel consumption reconciliation for the month completed",
    "Manpower histogram updated and circulated to the planning cell",
    "Client PMC walkdown carried out, observations noted in the log",
    "Subcontractor invoice verification pending with commercial team",
    "Store bin cards updated after physical verification",
    "Transporter detention charges under discussion with logistics",
    "Weighbridge calibration certificate received from the vendor",
    "Site coordination meeting minutes circulated to all agencies",
    "Vendor representative for the compressor arrives next Tuesday",
    "Scaffolding material returned to the hire company, 8 loads",
    "Rebar cutting and bending yard relocated to the east side",
    "Fuel tanker delayed at Numaligarh, expected tomorrow",
    "Idle time recorded for the piling rig, awaiting client decision",
    # safety observations and HSE narrative with no scheduled activity
    "Toolbox talk conducted on working at height for 42 workers",
    "Near miss reported: dropped spanner at the rack, no injury",
    "Mock fire drill conducted at the temporary office, 3 minutes response",
    "Housekeeping drive carried out across all work fronts",
    "First aid administered for a minor hand laceration at the fab shed",
    "Safety harness inspection carried out, 4 units condemned",
    "Heat stress advisory issued to all supervisors",
    "Snake sighting reported near the tank farm, area cordoned",
    "Alcohol breathalyser checks carried out at the main gate",
    "PPE stock replenished, 120 helmets received",
    "Emergency contact list updated on all notice boards",
    "Behavioural safety observation cards collected, 34 this week",
    "Permit audit carried out by the client HSE officer",
    "Site ambulance serviced and returned to standby",
    # weather and ground conditions
    "Heavy rainfall from 1400 hrs, all work fronts stopped for the day",
    "Waterlogging in the excavation, dewatering pumps deployed overnight",
    "High wind warning issued, crane operations suspended",
    "Ambient temperature 39 C, work rescheduled to early morning",
    "Access road washed out after overnight rain, grading needed",
    "Fog delayed the morning shift start by two hours",
    "Ground water table encountered higher than the soil report indicated",
    "Site flooded near the south fence after the Brahmaputra rose",
    # quality and documentation narrative
    "NCR raised by the client on concrete cube results, under review",
    "Third party inspection agency mobilised for weld review",
    "Welder qualification tests conducted for four new welders",
    "Radiography film review pending with the client inspector",
    "As-built markup received from the survey team for checking",
    "Material test certificates for the imported valves under verification",
    "Concrete mix design approval received from the consultant",
    "Coating DFT gauge sent out for recalibration",
    "Client comments on the P&ID revision under incorporation",
    "Method statement for tank erection resubmitted after comments",
    "Weld map updated for the revised isometric issue",
    "Site query raised on the foundation bolt projection detail",
]


# ══════════════════════════════════════════════════════════════════════════════
# Near-miss pairs
# ══════════════════════════════════════════════════════════════════════════════

def near_miss_partner(act: dict, by_disc: dict[str, list[dict]]) -> dict | None:
    """A sibling activity of the same discipline whose description is close
    enough that a careless matcher would confuse the two.

    These are the pairs worth testing: v2 is full of "Unit 1"/"Unit 2" and
    "Module 2"/"Module 3" siblings that differ by one token. The mention keeps
    the discriminator, so the label is unambiguous — what makes it hard is that
    everything else in the sentence points at the wrong row.
    """
    words = set(re.findall(r"[a-z]{4,}", act["description"].lower()))
    best, best_score = None, 0.0
    for other in by_disc[act["discipline"]]:
        if other["activity_id"] == act["activity_id"]:
            continue
        ow = set(re.findall(r"[a-z]{4,}", other["description"].lower()))
        if not words or not ow:
            continue
        overlap = len(words & ow) / len(words | ow)
        if overlap > best_score:
            best, best_score = other, overlap
    return best if best_score >= 0.45 else None


def build_near_miss_mention(act: dict, partner: dict, report_date: date) -> tuple[str, str]:
    """Text that reads like the partner activity but is genuinely about `act`."""
    _tagged, free = core_phrases(act)
    partner_free = make_tag_free(partner["description"])
    # Lead with the shared language, land the discriminator at the end.
    shared = " ".join(partner_free.split()[:5])
    disc_bits = [w for w in free.split() if w.lower() not in partner_free.lower()]
    tail = " ".join(disc_bits[-4:]) if disc_bits else free.split()[-1]
    when = report_date - timedelta(days=rng.randrange(0, 4))
    text_date, resolved = render_date(when, report_date)
    body = rng.choice([
        f"{shared} — this is the {tail} one, {rng.randrange(20, 90)}% done",
        f"{shared} progressing at the {tail} location as of {text_date}",
        f"{shared}, {tail} portion only, balance still open",
    ])
    stated = resolved.isoformat() if text_date in body else ""
    return re.sub(r'\s{2,}', " ", body).strip(), stated


# ══════════════════════════════════════════════════════════════════════════════
# DPR assembly
# ══════════════════════════════════════════════════════════════════════════════

DISCIPLINE_HEADINGS = {
    "civil": ["CIVIL WORKS", "CIVIL", "1. CIVIL / STRUCTURAL"],
    "piping": ["PIPING", "PIPING WORKS", "MECHANICAL - PIPING"],
    "static_equipment": ["EQUIPMENT", "STATIC EQUIPMENT", "MECHANICAL - EQUIPMENT"],
    "electrical": ["ELECTRICAL", "ELECTRICAL WORKS", "E&I - ELECTRICAL"],
    "instrumentation": ["INSTRUMENTATION", "INSTRUMENTS", "E&I - INSTRUMENTATION"],
    "hse": ["HSE", "SAFETY", "HSE / SAFETY"],
}

ENGINEERS = ["Vikram Saikia", "R. Gogoi", "A. Bhuyan", "P. Deka", "S. Hazarika",
             "M. Rahman", "K. Baruah", "J. Tamuly"]
CONTRACTORS = ["ABC Infra Pvt Ltd", "ABC Infra", "ABC Infra Pvt. Ltd.",
               "M/s ABC Infrastructure"]
WEATHER = ["Hot, 38C", "Overcast, light drizzle after 4pm", "Clear, 31C",
           "Humid, 34C, brief shower midday", "Fog till 0900, then clear",
           "Heavy rain 1400-1600", "Windy, 28C, gusts 30 km/h"]


def dpr_header(idx: int, d: date, messy: bool) -> list[str]:
    """Inconsistent headers on purpose — the v1 corpus has them and the
    extractor's header skipping is tuned against exactly this variety."""
    eng = rng.choice(ENGINEERS)
    con = rng.choice(CONTRACTORS)
    wx = rng.choice(WEATHER)
    date_str, _ = render_date(d, d, style=rng.choice([0, 1, 2]))
    if messy:
        return rng.choice([
            [f"DPR {date_str}", f"site: Duliajan  contractor: {con}", ""],
            ["DAILY PROGRESS REPORT",
             f"Date: {date_str}  Weather: {wx}",
             f"prepared: {eng}", ""],
            [f"Progress report - {date_str}", f"{con} / OIL Duliajan", ""],
        ])
    return rng.choice([
        ["DAILY PROGRESS REPORT",
         f"Date: {date_str}  |  Weather: {wx}",
         f"Contractor: {con}  |  Project: OIL Well-Site Duliajan",
         f"Prepared by: {eng}, Site Engineer", ""],
        ["DAILY PROGRESS REPORT — OIL DULIAJAN WELL-SITE",
         f"Report Date: {date_str}",
         f"Weather: {wx}",
         f"Contractor: {con}",
         f"Site Engineer: {eng}", ""],
        [f"DAILY PROGRESS REPORT  ({date_str})",
         f"Project: OIL Well-Site Duliajan  |  Contractor: {con}",
         f"Weather: {wx}  |  Prepared by: {eng}", ""],
    ])


def bullet(i: int, messy: bool) -> str:
    if messy:
        return rng.choice(["   - ", "   * ", "   "])
    return f"   {chr(ord('a') + i)}) "


# ══════════════════════════════════════════════════════════════════════════════
# Spreadsheets
# ══════════════════════════════════════════════════════════════════════════════

def xlsx_date(d: date) -> str:
    """Mixed formats WITHIN one sheet — the v1 registers do this and it is the
    single most useful piece of realism in the corpus."""
    return rng.choice([
        d.isoformat(),
        d.strftime("%d/%m/%Y"),
        f"{d.day:02d}/{MONTHS[d.month - 1]}/{d.year}",
    ])


def build_spreadsheet(path: Path, title: str, period: str, acts: list[dict],
                      report_date: date) -> list[dict]:
    """One discipline register. Returns the ground-truth rows it produced."""
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]

    head_fill = PatternFill("solid", fgColor="DDDDDD")
    bold = Font(bold=True)
    centre = Alignment(horizontal="center", vertical="center")

    ws.append([f"OIL INDIA LIMITED — DULIAJAN WELL-SITE — {title.upper()}"])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
    ws["A1"].font = Font(bold=True, size=12)
    ws["A1"].alignment = centre

    ws.append([f"Reporting Period: {period}   |   Sheet generated for progress review"])
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=10)

    # A merged banding row above the real header, exactly as the v1 registers
    # have it — two header rows is what makes header detection non-trivial.
    ws.append(["Identification", "", "", "Work Description", "", "",
               "Schedule", "", "Progress", ""])
    for a, b in [(1, 3), (4, 6), (7, 8), (9, 10)]:
        ws.merge_cells(start_row=3, start_column=a, end_row=3, end_column=b)
    for col in range(1, 11):
        c = ws.cell(row=3, column=col)
        c.font = bold
        c.fill = head_fill
        c.alignment = centre

    ws.append(["Activity ID", "Tag / Ref", "WBS Level", "Work Item",
               "Discipline", "Location", "Commenced", "Actual / Est. Completion",
               "Planned Qty", "Achieved Qty"])
    for col in range(1, 11):
        ws.cell(row=4, column=col).font = bold
        ws.cell(row=4, column=col).fill = head_fill

    rows: list[dict] = []
    for act in acts:
        ps = date.fromisoformat(act["planned_start"])
        pf = date.fromisoformat(act["planned_finish"])
        done = pf <= report_date
        fraction = 1.0 if done else rng.uniform(0.2, 0.8)
        qty = act.get("planned_qty") or 0
        achieved = round(qty * fraction, 1) if qty else None

        # Blank cells on purpose: a register with no gaps is not a register.
        commenced = xlsx_date(ps) if rng.random() > 0.10 else None
        completion = xlsx_date(pf) if (done and rng.random() > 0.08) else None
        location = rng.choice(["Unit 1", "Unit 2", "Tank Farm", "Substation",
                               "Manifold", "Workshop", None])

        ws.append([
            act["activity_id"],
            act.get("tag") or "—",
            f"L{act['wbs_level']}" if act.get("wbs_level") else None,
            act["description"][:70],
            act["discipline"][:3].upper(),
            location,
            commenced,
            completion,
            qty or None,
            achieved,
        ])

        # The register row's own mention. A spreadsheet states its dates in
        # adjacent cells, so the row text carries the completion date with it —
        # otherwise `mention_date` would name a date the mention itself does
        # not contain, and eval would read the most reliably dated rows in the
        # corpus as DEFAULTED_TO_REPORT_DATE.
        mention = act["description"][:70]
        if act.get("tag") and not extract_tags(mention) and rng.random() < 0.6:
            mention = f"{mention} [{act['tag']}]"
        stated = ""
        if completion:
            mention = f"{mention} — completed {completion}"
            stated = pf.isoformat()
        elif commenced and rng.random() < 0.5:
            mention = f"{mention} — commenced {commenced}"
            stated = ps.isoformat()
        rows.append({
            "source": path.name,
            "source_date": report_date.isoformat(),
            "raw_mention": mention,
            "activity_id": act["activity_id"],
            "match_type": "exact",
            "mention_date": stated,
            "discipline": act["discipline"],
        })

    ws.append([f"Total rows: {len(acts)}"])
    ws.merge_cells(start_row=ws.max_row, start_column=1,
                   end_row=ws.max_row, end_column=4)

    widths = [16, 18, 10, 46, 12, 14, 14, 22, 12, 12]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[chr(ord("A") + i - 1)].width = w

    wb.save(path)
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# Main generation
# ══════════════════════════════════════════════════════════════════════════════

def main() -> int:
    activities = JsonScheduleProvider(SCHEDULE).read_activities()
    by_id = {a["activity_id"]: a for a in activities}
    by_disc: dict[str, list[dict]] = defaultdict(list)
    for a in activities:
        by_disc[a["discipline"]].append(a)

    OUT.mkdir(parents=True, exist_ok=True)

    starts = [date.fromisoformat(a["planned_start"]) for a in activities]
    finishes = [date.fromisoformat(a["planned_finish"]) for a in activities]
    first, last = min(starts), max(finishes)

    # DPR dates spread across the whole programme, jittered so they are not a
    # neat arithmetic series.
    span = (last - first).days
    dpr_dates = []
    for i in range(N_DPRS):
        base = first + timedelta(days=int(span * (i + 0.5) / N_DPRS))
        dpr_dates.append(base + timedelta(days=rng.randrange(-3, 4)))
    dpr_dates = sorted(min(max(d, first), last) for d in dpr_dates)

    gt_rows: list[dict] = []
    negatives = list(HARD_NEGATIVES)
    rng.shuffle(negatives)
    neg_i = 0

    # Every activity must be mentioned at least once, or the corpus cannot
    # exercise the row it claims to cover.
    unmentioned = {a["activity_id"] for a in activities}
    tag_free_flags: list[bool] = []

    for idx, d in enumerate(dpr_dates, start=1):
        messy = idx in MESSY_DPRS
        # Activities plausibly live on this date: started, and not long finished.
        live = [
            a for a in activities
            if date.fromisoformat(a["planned_start"]) - timedelta(days=4) <= d
            <= date.fromisoformat(a["planned_finish"]) + timedelta(days=12)
        ]
        if len(live) < 8:
            live = sorted(
                activities,
                key=lambda a: abs((date.fromisoformat(a["planned_start"]) - d).days),
            )[:18]

        # Prefer activities nobody has written about yet.
        live.sort(key=lambda a: (a["activity_id"] not in unmentioned, rng.random()))
        picked = live[:rng.randrange(16, 24)]

        grouped: dict[str, list[dict]] = defaultdict(list)
        for a in picked:
            grouped[a["discipline"]].append(a)

        lines: list[str] = dpr_header(idx, d, messy)
        section = 0
        for disc in ["civil", "piping", "static_equipment", "electrical",
                     "instrumentation", "hse"]:
            if disc not in grouped:
                continue
            section += 1
            heading = rng.choice(DISCIPLINE_HEADINGS[disc])
            lines.append(f"{section}. {heading}" if not heading[0].isdigit() else heading)
            for i, act in enumerate(grouped[disc]):
                # Only 111 of v2's 218 activities can carry a tag at all
                # (46 have one in the description, 101 in the `tag` field), so
                # tag-free mentions cannot fall below ~49% without inventing
                # tags the schedule does not have. Within the taggable half,
                # drop the tag ~30% of the time: that lands the corpus near
                # 65% tag-free — far above the 35% floor, while still leaving
                # the tag channel something to retrieve on.
                want_free = rng.random() < 0.30
                partner = near_miss_partner(act, by_disc) if rng.random() < 0.30 else None
                if partner is not None:
                    text, stated = build_near_miss_mention(act, partner, d)
                    match_type = "near_miss"
                else:
                    text, stated = build_mention(act, d, want_free, messy)
                    match_type = "exact"

                lines.append(f"{bullet(i, messy)}{text}.")
                gt_rows.append({
                    "source": f"dpr_day_{idx:02d}.txt",
                    "source_date": d.isoformat(),
                    "raw_mention": text,
                    "activity_id": act["activity_id"],
                    "match_type": match_type,
                    "mention_date": stated,
                    "discipline": act["discipline"],
                })
                tag_free_flags.append(not extract_tags(text))
                unmentioned.discard(act["activity_id"])
            lines.append("")

        # Hard negatives, folded into the narrative sections where they belong.
        section += 1
        lines.append(f"{section}. GENERAL / SITE NARRATIVE")
        for i in range(rng.randrange(2, 4)):
            if neg_i >= len(negatives):
                rng.shuffle(negatives)
                neg_i = 0
            neg = negatives[neg_i]
            neg_i += 1
            lines.append(f"{bullet(i, messy)}{neg}.")
            gt_rows.append({
                "source": f"dpr_day_{idx:02d}.txt",
                "source_date": d.isoformat(),
                "raw_mention": neg,
                "activity_id": "NO_MATCH",
                "match_type": "no_match",
                "mention_date": "",
                "discipline": "",
            })
        lines.append("")
        lines.append("REMARKS")
        lines.append(f"   - Manpower: {rng.randrange(60, 240)} nos on site.")
        lines.append(f"   - Equipment: {rng.randrange(3, 12)} nos deployed.")
        lines.append("")

        (OUT / f"dpr_day_{idx:02d}.txt").write_text(
            "\n".join(lines), encoding="utf-8")

    # ── Any activity still unmentioned gets a final catch-up report ──────────
    if unmentioned:
        d = last
        lines = dpr_header(N_DPRS + 1, d, False)
        lines.append("1. PROJECT CLOSE-OUT SUMMARY")
        for i, aid in enumerate(sorted(unmentioned)):
            act = by_id[aid]
            text, stated = build_mention(act, d, rng.random() < 0.58, False)
            lines.append(f"{bullet(i % 8, False)}{text}.")
            gt_rows.append({
                "source": f"dpr_day_{N_DPRS + 1:02d}.txt",
                "source_date": d.isoformat(),
                "raw_mention": text,
                "activity_id": aid,
                "match_type": "exact",
                "mention_date": stated,
                "discipline": act["discipline"],
            })
            tag_free_flags.append(not extract_tags(text))
        lines.append("")
        (OUT / f"dpr_day_{N_DPRS + 1:02d}.txt").write_text(
            "\n".join(lines), encoding="utf-8")

    # ── Spreadsheets ────────────────────────────────────────────────────────
    sheet_specs = [
        ("civil_progress.xlsx", "Civil Works Progress", "Mar-Dec 2026", ["civil"]),
        ("piping_progress.xlsx", "Piping Progress", "Apr 2026-Jan 2027", ["piping"]),
        ("equipment_progress.xlsx", "Static Equipment Progress",
         "May 2026-Feb 2027", ["static_equipment"]),
        ("eni_progress.xlsx", "Electrical & Instrumentation",
         "Jun 2026-Feb 2027", ["electrical", "instrumentation"]),
        ("hse_progress.xlsx", "HSE & Commissioning Register",
         "Mar 2026-Mar 2027", ["hse"]),
    ]
    for filename, title, period, discs in sheet_specs:
        pool = [a for a in activities if a["discipline"] in discs]
        sample = pool if len(pool) <= 26 else rng.sample(pool, 26)
        sample.sort(key=lambda a: a["activity_id"])
        rows = build_spreadsheet(OUT / filename, title, period, sample, last)
        for r in rows:
            gt_rows.append(r)
            tag_free_flags.append(not extract_tags(r["raw_mention"]))

    # ── Top up to the mention target with extra phrasings ───────────────────
    # Weighted by how far each discipline currently sits below its share of the
    # schedule. Civil is 28% of v2 but is nearly all front-loaded into Mar-May,
    # so an even spread of report dates under-samples it badly; this is what
    # pulls the mention mix back onto the schedule's own weighting.
    schedule_share = Counter(a["discipline"] for a in activities)
    total_acts = sum(schedule_share.values())

    def deficit_pick() -> dict:
        have = Counter(r["discipline"] for r in gt_rows if r["discipline"])
        n = sum(have.values()) or 1
        gaps = {
            d: max(0.0, schedule_share[d] / total_acts - have[d] / n)
            for d in schedule_share
        }
        if sum(gaps.values()) <= 0:
            return rng.choice(activities)
        disc = rng.choices(list(gaps), weights=list(gaps.values()))[0]
        return rng.choice(by_disc[disc])

    while len(gt_rows) < TARGET_MENTIONS:
        act = deficit_pick()
        d = date.fromisoformat(act["planned_finish"])
        text, stated = build_mention(act, d, rng.random() < 0.60, False)
        src_idx = rng.randrange(1, N_DPRS + 1)
        gt_rows.append({
            "source": f"dpr_day_{src_idx:02d}.txt",
            "source_date": dpr_dates[src_idx - 1].isoformat(),
            "raw_mention": text,
            "activity_id": act["activity_id"],
            "match_type": "exact",
            "mention_date": stated,
            "discipline": act["discipline"],
        })
        tag_free_flags.append(not extract_tags(text))

    # ── Deduplicate identical (source, text) pairs ──────────────────────────
    seen: set[tuple[str, str]] = set()
    deduped = []
    for r in gt_rows:
        key = (r["source"], r["raw_mention"].strip().lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    gt_rows = deduped

    # ── Splits: stratified by discipline x match/no-match, fixed seed ───────
    # Identical mention TEXT is kept together, so the same sentence can never
    # appear in both a tuning split and the test split.
    split_rng = random.Random(SEED + 1)
    text_groups: dict[str, list[dict]] = defaultdict(list)
    for r in gt_rows:
        text_groups[r["raw_mention"].strip().lower()].append(r)

    strata: dict[tuple[str, str], list[str]] = defaultdict(list)
    for text, group in text_groups.items():
        head = group[0]
        kind = "no_match" if head["activity_id"] == "NO_MATCH" else "match"
        strata[(head["discipline"], kind)].append(text)

    assignment: dict[str, str] = {}
    for key, texts in strata.items():
        texts = sorted(texts)
        split_rng.shuffle(texts)
        n = len(texts)
        n_train = int(round(n * 0.60))
        n_dev = int(round(n * 0.20))
        # Tiny strata must still reach test, or a discipline vanishes from the
        # headline metric without anyone noticing.
        if n >= 3:
            n_train = min(n_train, n - 2)
            n_dev = max(1, min(n_dev, n - n_train - 1))
        for i, t in enumerate(texts):
            if i < n_train:
                assignment[t] = "train"
            elif i < n_train + n_dev:
                assignment[t] = "dev"
            else:
                assignment[t] = "test"

    for r in gt_rows:
        r["split"] = assignment[r["raw_mention"].strip().lower()]

    # ── Write ground truth ──────────────────────────────────────────────────
    gt_path = OUT / "ground_truth_v2.csv"
    fields = ["source", "source_date", "raw_mention", "activity_id",
              "match_type", "mention_date", "discipline", "split"]
    with open(gt_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in gt_rows:
            w.writerow({k: r.get(k, "") for k in fields})

    splits_path = OUT / "splits.json"
    split_counts = Counter(r["split"] for r in gt_rows)
    splits_path.write_text(json.dumps({
        "seed": SEED,
        "stratified_by": ["discipline", "match_or_no_match"],
        "grouping": "identical mention text is kept in a single split",
        "policy": {
            "train": "model/feature development",
            "dev": "threshold calibration ONLY",
            "test": "headline metrics ONLY",
        },
        "counts": dict(split_counts),
        "assignments": {
            split: sorted(
                {r["raw_mention"] for r in gt_rows if r["split"] == split}
            )
            for split in ("train", "dev", "test")
        },
    }, indent=2), encoding="utf-8")

    return validate(activities, by_id, gt_rows, split_counts)


# ══════════════════════════════════════════════════════════════════════════════
# Validation
# ══════════════════════════════════════════════════════════════════════════════

def validate(activities, by_id, gt_rows, split_counts) -> int:
    from matching.engine import MatchingEngine
    from matching.models import Decision, Thresholds
    from matching.schedule_index import ScheduleIndex

    lines: list[str] = []
    failures: list[str] = []

    def say(s=""):
        print(s)
        lines.append(s)

    pos = [r for r in gt_rows if r["activity_id"] != "NO_MATCH"]
    neg = [r for r in gt_rows if r["activity_id"] == "NO_MATCH"]

    say("# VALIDATION — dataset/v2")
    say()
    say(f"Generated with seed {SEED} by `generate_v2_dataset.py`.")
    say()
    say("## Composition")
    say()
    say(f"- total mentions: **{len(gt_rows)}**")
    say(f"- gold positives: **{len(pos)}**")
    say(f"- hard negatives: **{len(neg)}** ({len(neg)/len(gt_rows):.1%})")
    say(f"- distinct activity ids referenced: **{len({r['activity_id'] for r in pos})}** "
        f"of {len(activities)}")
    near = sum(1 for r in gt_rows if r["match_type"] == "near_miss")
    say(f"- deliberate near-miss mentions: **{near}**")
    say()

    # 1. every positive label exists in v2
    missing = sorted({r["activity_id"] for r in pos if r["activity_id"] not in by_id})
    say("## 1. Every positive label's activity_id exists in v2")
    say()
    if missing:
        failures.append(f"{len(missing)} labels not in v2: {missing[:10]}")
        say(f"- **FAIL** — {len(missing)} unknown ids: {missing[:10]}")
    else:
        say(f"- **PASS** — all {len(pos)} positive labels resolve exactly.")
    say()

    # 2. no hard negative accidentally matches an activity
    say("## 2. No hard negative accidentally matches an activity")
    say()
    engine = MatchingEngine(SCHEDULE, thresholds=Thresholds())
    from extraction.models import (ExtractedEvent, ExtractionMethod, Provenance)
    from extraction.prepass import infer_discipline

    auto_linked = []
    for r in neg:
        ev = ExtractedEvent(
            raw_text=r["raw_mention"],
            tags=extract_tags(r["raw_mention"]),
            discipline=infer_discipline(r["raw_mention"]),
            provenance=Provenance(source_file=r["source"],
                                  source_span=r["raw_mention"],
                                  method=ExtractionMethod.PREPASS),
        )
        d = engine.match_event(ev)
        if d.outcome is Decision.AUTO_LINK:
            auto_linked.append((r["raw_mention"], d.chosen_activity_id,
                                round(d.confidence, 3)))
    if auto_linked:
        failures.append(f"{len(auto_linked)} hard negatives auto-link")
        say(f"- **FAIL** — {len(auto_linked)} of {len(neg)} auto-link at default "
            f"thresholds:")
        for text, aid, conf in auto_linked[:10]:
            say(f"    - `{text[:70]}` → {aid} ({conf})")
    else:
        say(f"- **PASS** — 0 of {len(neg)} hard negatives auto-link at default "
            f"thresholds (tau_high=0.78, margin_min=0.06).")
    say()

    # 3. tag-free percentage — measured two ways, because they disagree
    say("## 3. Tag-free positive mentions")
    say()
    tag_free = [r for r in pos if not extract_tags(r["raw_mention"])]
    literal_free = [r for r in pos if not literal_tags(r["raw_mention"])]
    frac = len(tag_free) / len(pos) if pos else 0
    lit_frac = len(literal_free) / len(pos) if pos else 0
    ok = lit_frac >= MIN_TAG_FREE_FRACTION
    if not ok:
        failures.append(f"tag-free {lit_frac:.1%} below {MIN_TAG_FREE_FRACTION:.0%}")
    say(f"- **{lit_frac:.1%}** ({len(literal_free)}/{len(pos)}) carry no "
        f"tag-shaped token at all — the honest reading of the requirement "
        f"({'PASS' if ok else 'FAIL'}, minimum {MIN_TAG_FREE_FRACTION:.0%}).")
    say(f"- **{frac:.1%}** ({len(tag_free)}/{len(pos)}) carry no tag that "
        f"`extraction.prepass.extract_tags` can SEE.")
    say()
    say("| discipline | positives | no literal tag | share | invisible to extractor | share |")
    say("|---|---:|---:|---:|---:|---:|")
    per = defaultdict(lambda: [0, 0, 0])
    for r in pos:
        d = r["discipline"] or "?"
        per[d][0] += 1
        if not literal_tags(r["raw_mention"]):
            per[d][1] += 1
        if not extract_tags(r["raw_mention"]):
            per[d][2] += 1
    for d in sorted(per):
        tot, lf, tf = per[d]
        say(f"| {d} | {tot} | {lf} | {lf/tot:.1%} | {tf} | {tf/tot:.1%} |")
    say()

    # 3b. the gap between those two numbers is itself a finding
    say("### The tag-recognition gap")
    say()
    all_tags = sorted({a["tag"] for a in activities if a.get("tag")})
    unseen = [t for t in all_tags if not extract_tags(t)]
    say(f"`extract_tags` recognises {len(all_tags) - len(unseen)} of "
        f"{len(all_tags)} distinct tag strings in v2. It does **not** "
        f"recognise {len(unseen)}:")
    say()
    say(f"    {', '.join(unseen)}")
    say()
    say("`EQUIPMENT_TAG_RE` allows a 1-3 digit suffix "
        "(`[A-Z]{1,3}-\\d{1,3}[A-Z]?`). Every v1 tag fits that — `V-101`, "
        "`TK-1`, `CS-01` — and all 12 are recognised. v2 numbers its equipment "
        "with 4 digits (`V-1101`, `PT-1101`, `TK-2101`, `PK-2401`), so those "
        "tags sit in the text unread.")
    say()
    say("The consequence is not cosmetic. `tag_overlap` is the near-decisive "
        "feature in the ranker, so on v2 the tag channel is roughly half "
        "blind, and the mentions above are matched on description similarity "
        "alone. **This was left unchanged deliberately** — the regex lives in "
        "`extraction/prepass.py`, feeds `tag_overlap`, and widening it would "
        "move v1's published numbers too. It is reported here as the first "
        "thing to fix, not silently patched under an evaluation.")
    say()

    # 3c. no mention may imply an impossible percentage
    from extraction.prepass import extract_fractions, extract_percentages

    say("### No mention implies an impossible percentage")
    say()
    impossible = []
    for r in gt_rows:
        pcts = extract_percentages(r["raw_mention"])
        fr = extract_fractions(r["raw_mention"])
        pct = pcts[0] if pcts else (
            round(fr[0][0] / fr[0][1] * 100, 1) if fr and fr[0][1] > 0 else None)
        if pct is not None and (pct > 100 or pct < 0):
            impossible.append((pct, r["raw_mention"]))
    if impossible:
        failures.append(f"{len(impossible)} mentions imply an impossible percentage")
        say(f"- **FAIL** — {len(impossible)} mentions:")
        for pct, text in impossible[:8]:
            say(f"    - {pct}% — `{text[:80]}`")
    else:
        say(f"- **PASS** — 0 of {len(gt_rows)} mentions parse to a percentage "
            f"outside 0-100.")
    say()
    say("`FRACTION_RE` in `extraction/prepass.py` is "
        r"`(\d+)\s+(?:of|out of|of total)\s+(\d+)`, which reads the digit "
        "inside a unit suffix. `40 m3 of 120 m3` parses as **3/120 = 2.5%**, "
        "not 33%; `320 m2 of 480 m2` parses as **0.4%**. It affects every unit "
        "ending in a digit — m2 and m3, which is 42 of v2's 218 activities and "
        "most of the civil scope. This corpus phrases quantities as "
        "`40 of 120 m3` to avoid the collision, so the numbers here are "
        "correct, but **the extractor bug is live for any real DPR that writes "
        "it the natural way.** Reported, not fixed: the regex feeds "
        "`percentage`, which gates `actual_finish` (D-008/D-015).")
    say()

    # 4. hard-negative floor
    say("## 4. Hard-negative count")
    say()
    ok = len(neg) >= MIN_HARD_NEGATIVES
    if not ok:
        failures.append(f"only {len(neg)} hard negatives")
    say(f"- {len(neg)} hard negatives "
        f"({'PASS' if ok else 'FAIL'}, minimum {MIN_HARD_NEGATIVES})")
    say()

    # 5. splits
    say("## 5. Splits")
    say()
    say("| split | mentions | positives | negatives |")
    say("|---|---:|---:|---:|")
    for s in ("train", "dev", "test"):
        rows = [r for r in gt_rows if r["split"] == s]
        p = sum(1 for r in rows if r["activity_id"] != "NO_MATCH")
        say(f"| {s} | {len(rows)} | {p} | {len(rows)-p} |")
    say()
    say("Per-discipline distribution across splits:")
    say()
    say("| discipline | train | dev | test |")
    say("|---|---:|---:|---:|")
    discs = sorted({r["discipline"] for r in gt_rows if r["discipline"]})
    for d in discs:
        counts = Counter(r["split"] for r in gt_rows if r["discipline"] == d)
        say(f"| {d} | {counts['train']} | {counts['dev']} | {counts['test']} |")
    say()

    # 6. no mention in more than one split
    say("## 6. No mention appears in more than one split")
    say()
    text_splits = defaultdict(set)
    for r in gt_rows:
        text_splits[r["raw_mention"].strip().lower()].add(r["split"])
    leaked = {t: s for t, s in text_splits.items() if len(s) > 1}
    if leaked:
        failures.append(f"{len(leaked)} mentions span splits")
        say(f"- **FAIL** — {len(leaked)} mention texts appear in more than one split")
    else:
        say(f"- **PASS** — {len(text_splits)} distinct mention texts, each in "
            f"exactly one split.")
    say()

    # 7. dates
    say("## 7. Dates stated in the mention text")
    say()
    dated = [r for r in pos if r["mention_date"]]
    say(f"- {len(dated)} of {len(pos)} positive mentions state a date in the text "
        f"({len(dated)/len(pos):.1%}).")
    say("- Those resolve as EXPLICIT / RELATIVE_RESOLVED; the rest fall back to "
        "the report date and are DEFAULTED_TO_REPORT_DATE.")
    bad_dates = [r for r in dated
                 if r["mention_date"] not in r["raw_mention"]
                 and not _date_plausibly_in(r["raw_mention"], r["mention_date"])]
    say(f"- mention_date values not traceable to the text: {len(bad_dates)}")
    say()

    say("## Result")
    say()
    if failures:
        say("**FAILED**")
        for f in failures:
            say(f"- {f}")
    else:
        say("**All checks passed.**")

    (OUT / "VALIDATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 1 if failures else 0


def _date_plausibly_in(text: str, iso: str) -> bool:
    """The text states the date in some human format, or via a relative word."""
    d = date.fromisoformat(iso)
    candidates = [
        d.strftime("%d/%m/%Y"), d.isoformat(),
        f"{d.day:02d}/{MONTHS[d.month-1]}/{d.year}",
        f"{d.day} {MONTHS[d.month-1]}",
        f"{d.day} {MONTHS[d.month-1]} {d.year}",
    ]
    low = text.lower()
    return (any(c.lower() in low for c in candidates)
            or "yesterday" in low or "today" in low)


if __name__ == "__main__":
    sys.exit(main())
