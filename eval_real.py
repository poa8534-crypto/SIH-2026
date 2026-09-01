#!/usr/bin/env python3
"""Real-corpus benchmark — the second, independent evaluation.

`datasets/real/` is public-source material we did not author. `dataset/v2/` is
synthetic material we did. They measure different things and they are NEVER
combined here: no shared metric, no mean of the two, no single headline. Every
row this script prints carries `data_origin`, the source id, the record count,
and how its labels were produced.

    python eval_real.py                 full report
    python eval_real.py --wsdot-sheet   print the 13-pair verification sheet

Run `python eval.py --schedule dataset/baseline_schedule_v2.json
--ground-truth dataset/v2/ground_truth_v2.csv` for the synthetic side; the
two-column section below quotes its last published figures rather than
recomputing them, and says so.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from extraction.prepass import (  # noqa: E402
    extract_dates,
    extract_fractions,
    extract_percentages,
    extract_quantities,
    extract_tags,
    infer_discipline,
    infer_status,
)

# The report uses box-drawing characters, and a Windows console defaults to
# cp1252, which cannot encode them. Reconfigure rather than degrade the output.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

#: Words `extract_dates` resolves against a reference date rather than reading
#: from the text. Needed to separate a date the source stated from one we
#: inferred.
RELATIVE_WORD_RE = re.compile(
    r'\b(yesterday|today|tomorrow)\b', re.IGNORECASE)


def _iso(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


REAL = PROJECT_ROOT / "datasets" / "real"
BOOTSTRAP_N = 2000
SEED = 20260901

rng = random.Random(SEED)


# ══════════════════════════════════════════════════════════════════════════════
# Provenance — every number in this report is stamped with where it came from
# ══════════════════════════════════════════════════════════════════════════════

#: How a label was produced. This is NOT the same as whether the data is real,
#: and the corpus README is explicit about the distinction: `data_origin=real`
#: means the content came from a cited public source, not that anyone checked
#: the extraction. A metric computed against unverified labels is marked in the
#: table itself, never only in a footnote.
LABEL_QUALITY = {
    "human": "human-verified",
    "source": "source-published",
    "machine": "MACHINE-DERIVED, UNVERIFIED",
}


class Provenance:
    def __init__(self, source_id: str, origin: str, n: int, labels: str,
                 note: str = ""):
        self.source_id = source_id
        self.origin = origin           # real | synthetic
        self.n = n
        self.labels = labels
        self.note = note

    def row(self) -> list[str]:
        return [self.origin.upper(), self.source_id, f"{self.n:,}",
                LABEL_QUALITY[self.labels]]


# ══════════════════════════════════════════════════════════════════════════════
# Formatting
# ══════════════════════════════════════════════════════════════════════════════

W = 78


def rule(ch="─"):
    return ch * W


def title(s: str):
    print()
    print(rule("═"))
    print(f" {s}")
    print(rule("═"))


def sub(s: str):
    print()
    print(f"── {s} " + "─" * max(0, W - len(s) - 4))


def table(headers, rows, aligns=None):
    if not rows:
        print("   (no rows)")
        return
    cols = len(headers)
    aligns = aligns or ["<"] * cols
    widths = [len(str(h)) for h in headers]
    for r in rows:
        for i, c in enumerate(r):
            widths[i] = max(widths[i], len(str(c)))
    line = "  " + "  ".join(
        f"{str(h):{aligns[i]}{widths[i]}}" for i, h in enumerate(headers))
    print(line)
    print("  " + "  ".join("-" * w for w in widths))
    for r in rows:
        print("  " + "  ".join(
            f"{str(c):{aligns[i]}{widths[i]}}" for i, c in enumerate(r)))


def pct(x):
    return "-" if x is None else f"{x * 100:.1f}%"


def boot_ci(values, stat=lambda v: sum(v) / len(v), n=BOOTSTRAP_N):
    """Bootstrap 95% CI. Reported with every real-corpus metric, because most
    of them rest on small n and a point estimate alone would overstate them."""
    if not values:
        return (None, None)
    obs = []
    k = len(values)
    for _ in range(n):
        sample = [values[rng.randrange(k)] for _ in range(k)]
        try:
            obs.append(stat(sample))
        except ZeroDivisionError:
            continue
    if not obs:
        return (None, None)
    obs.sort()
    return (obs[int(0.025 * len(obs))], obs[int(0.975 * len(obs))])


def ci_str(lo, hi, as_pct=True):
    if lo is None:
        return ""
    if as_pct:
        return f"[{lo*100:.1f}, {hi*100:.1f}]"
    return f"[{lo:.2f}, {hi:.2f}]"


# ══════════════════════════════════════════════════════════════════════════════
# Loaders
# ══════════════════════════════════════════════════════════════════════════════

def load_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def load_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def wsdot_ocr_lines() -> list[dict]:
    """Every OCR line from the 73 IDR pages, with its page provenance."""
    out = []
    for page in load_jsonl(REAL / "normalized/wsdot/C8078/idr_pages_ocr.jsonl"):
        rec = page.get("record", page)
        for ln in rec.get("ocr_lines", []) or []:
            text = (ln.get("text") or "").strip()
            if text:
                out.append({
                    "text": text,
                    "page": rec.get("page"),
                    "source_date": rec.get("source_date"),
                    "confidence": ln.get("confidence"),
                })
    return out


def wsdot_activities() -> dict:
    d = json.load(open(REAL / "normalized/schedules/wsdot_c8078_2011-01-21.json",
                       encoding="utf-8"))
    return {a["activity_id"]: a for a in d["activities"]}


# ══════════════════════════════════════════════════════════════════════════════
# 1 — WSDOT: extraction quality on real OCR
# ══════════════════════════════════════════════════════════════════════════════

def wsdot_extraction():
    lines = wsdot_ocr_lines()
    prov = Provenance("wsdot_c8078_idr_ocr", "real", len(lines), "machine",
                      "OCR of 73 pages from 21 official IDR PDFs")

    title("REAL — WSDOT C8078: EXTRACTION QUALITY ON OCR'd FIELD REPORTS")
    print(f"  source        : {prov.source_id}")
    print(f"  records       : {len(lines):,} OCR lines, 73 pages, 21 IDR PDFs")
    print(f"  label quality : {LABEL_QUALITY['machine']}")
    print("  These are real daily inspection reports typed by WSDOT inspectors")
    print("  in 2011 and scanned. Nothing here was authored by us.")

    tags = quantities = dates = pcts = fracs = 0
    relative_dates = explicit_dates = 0
    us_ambiguous = []
    disc_hits = Counter()
    status_hits = Counter()
    tag_examples, qty_examples, date_examples = [], [], []
    low_conf = 0

    for ln in lines:
        t = ln["text"]
        # confidence is published on a 0..1 scale in this source
        if (ln.get("confidence") or 1.0) < 0.60:
            low_conf += 1
        tg = extract_tags(t)
        if tg:
            tags += 1
            if len(tag_examples) < 8:
                tag_examples.append((tg, t[:58]))
        q = extract_quantities(t)
        if q:
            quantities += 1
            if len(qty_examples) < 8:
                qty_examples.append((q[0], t[:58]))
        # Resolve against the page's OWN report date, not today's. Without a
        # reference, "Pay Note Made Today?" — printed form furniture — resolves
        # to the day the report is run, and the date count fills with the
        # current date. That is a measurement bug, and it is also a real
        # deployment hazard: the extractor must always be handed the source's
        # date.
        ref = _iso(ln.get("source_date"))
        d = extract_dates(t, ref)
        if d:
            dates += 1
            if ref and any(x == ref for x in d) and RELATIVE_WORD_RE.search(t):
                relative_dates += 1
            else:
                explicit_dates += 1
            if len(date_examples) < 8:
                date_examples.append((d[0].isoformat(), t[:58]))
        # Day/month ambiguity. WSDOT is a US source and writes M/D/YYYY;
        # `DATE_DMY_SLASH_RE` resolves d/m first, so "2/1/2011" (1 February)
        # comes out as 2 January. Only ambiguous when both parts are <= 12.
        for m in re.finditer(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b', t):
            a, b = int(m.group(1)), int(m.group(2))
            if a <= 12 and b <= 12 and a != b and len(us_ambiguous) < 6:
                us_ambiguous.append((m.group(0), t[:52]))
        if extract_percentages(t):
            pcts += 1
        if extract_fractions(t):
            fracs += 1
        disc = infer_discipline(t)
        disc_hits[disc.value] += 1
        st, _c = infer_status(t)
        status_hits[st] += 1

    n = len(lines)
    sub("Signal extraction rate over real OCR text")
    table(
        ["Signal", "Lines with it", "Rate", "95% CI"],
        [
            ["equipment / line tag", tags, pct(tags / n),
             ci_str(*boot_ci([1] * tags + [0] * (n - tags)))],
            ["quantity + uom", quantities, pct(quantities / n),
             ci_str(*boot_ci([1] * quantities + [0] * (n - quantities)))],
            ["date", dates, pct(dates / n),
             ci_str(*boot_ci([1] * dates + [0] * (n - dates)))],
            ["percentage", pcts, pct(pcts / n), ""],
            ["fraction", fracs, pct(fracs / n), ""],
        ],
        aligns=["<", ">", ">", ">"],
    )
    print()
    table(
        ["Of the dates found", "Lines"],
        [["stated explicitly in the text", explicit_dates],
         ["resolved from a relative word ('today') against the page date",
          relative_dates]],
        aligns=["<", ">"],
    )
    print()
    print(f"  OCR lines below 60% confidence: {low_conf:,} ({low_conf/n:.1%})")
    print("  Rates are LOW by construction: an IDR page is mostly form furniture,")
    print("  headers, signature blocks and boilerplate. The denominator is every")
    print("  OCR line on the page, not every line that describes work.")

    sub("Discipline inference over the same lines")
    table(["Discipline", "Lines", "Share"],
          [[k, v, pct(v / n)] for k, v in disc_hits.most_common()],
          aligns=["<", ">", ">"])
    print()
    print("  'unknown' dominating is the honest result: our discipline keywords")
    print("  were written for an Indian oil-and-gas well-site, and this is a")
    print("  Washington State test-pile marine contract.")

    sub("What the extractor actually pulled out — real examples")
    if tag_examples:
        print("  TAGS:")
        for tg, t in tag_examples:
            print(f"    {str(tg):28s} <- {t}")
    if qty_examples:
        print("  QUANTITIES:")
        for q, t in qty_examples:
            print(f"    {str(q):28s} <- {t}")
    if date_examples:
        print("  DATES:")
        for d, t in date_examples:
            print(f"    {d:28s} <- {t}")
    print()
    if us_ambiguous:
        sub("FINDING — day/month order is wrong for this source")
        print("  WSDOT is a US agency and writes M/D/YYYY. `DATE_DMY_SLASH_RE`")
        print("  resolves the day first, so these parse to the wrong month:")
        for raw, ctx in us_ambiguous:
            print(f"    {raw:12s} <- {ctx}")
        print()
        print("  Only ambiguous when both parts are <= 12, so it is silent the")
        print("  rest of the time — which is what makes it dangerous. Our corpora")
        print("  are Indian (D/M/Y) and the convention was never parameterised.")
        print("  NOT FIXED HERE: this report does not change the extractor.")

    print("  These are the spot-check rows. They are printed rather than scored")
    print("  because there is no human-verified extraction gold for this source:")
    print("  scoring them against rules we wrote would measure the rules against")
    print("  themselves.")
    return prov


# ══════════════════════════════════════════════════════════════════════════════
# 2 — WSDOT: the linking probe (BLOCKED pending human verification)
# ══════════════════════════════════════════════════════════════════════════════

def wsdot_linking_sheet(print_only=False):
    acts = wsdot_activities()
    rows = load_csv(REAL / "labels/wsdot/C8078_activity_mentions_machine_candidates.csv")

    if not print_only:
        title("REAL — WSDOT C8078: SCHEDULE LINKING (WITHHELD)")
        print(f"  source        : wsdot_c8078_activity_mentions")
        print(f"  records       : {len(rows)} mentions, {len(acts)} real activities")
        print(f"  label quality : {LABEL_QUALITY['machine']}")
        print()
        print("  NO LINKING ACCURACY IS REPORTED FOR THIS SOURCE.")
        print()
        print("  The candidate activity ids were generated by rule from OCR text.")
        print("  Scoring against them would measure our rules against another set")
        print("  of rules, and report the agreement as accuracy. The corpus itself")
        print("  marks them `machine_candidate_unverified`.")
        print()
        n_multi = sum(1 for r in rows
                      if len(json.loads(r["candidate_activity_ids_json"])) > 1)
        print(f"  Note also that these are not 13 clean pairs: {n_multi} of the 13")
        print("  mentions carry more than one candidate, so the sheet below holds")
        total = sum(len(json.loads(r['candidate_activity_ids_json'])) for r in rows)
        print(f"  {total} candidate links across {len(rows)} mentions.")
        print()
        print("  Run `python eval_real.py --wsdot-sheet` for the verification sheet.")
        return Provenance("wsdot_c8078_linking", "real", len(rows), "machine")

    print("# WSDOT C8078 — linking verification sheet")
    print()
    print("13 real field-report summaries against the 27 real activities on the")
    print("same contract. Mark each candidate CORRECT or WRONG, or write the")
    print("activity id that should have been proposed. Once returned, this")
    print("becomes a human-verified benchmark and accuracy can be computed —")
    print("reported with n=13 and a bootstrap CI, because 13 is a very small n.")
    print()
    for i, r in enumerate(rows, 1):
        cands = json.loads(r["candidate_activity_ids_json"])
        print(rule("─"))
        print(f"{i:2d}.  IDR {r['source_date']}   page {r['source_page']}")
        print(f"    MENTION: {r['raw_mention']}")
        print(f"    proposed {len(cands)} candidate(s):")
        for c in cands:
            a = acts.get(c, {})
            print(f"      [ ] {c}  {a.get('description', '(NOT IN SCHEDULE)')}")
            if a:
                print(f"          planned {a.get('planned_start')} .. "
                      f"{a.get('planned_finish')}  ({a.get('original_duration')})")
        print("      [ ] none of these are correct — correct id: ________")
    print(rule("─"))
    print()
    print("For reference, the full 27-activity schedule:")
    for aid, a in sorted(acts.items()):
        print(f"    {aid}  {a['description']:34s} {a['planned_start']} .. "
              f"{a['planned_finish']}")
    return None


# ══════════════════════════════════════════════════════════════════════════════
# 3 — ConstructCIE: causal span detection harness + baselines
# ══════════════════════════════════════════════════════════════════════════════

def constructcie():
    spans = load_csv(REAL / "labels/constructcie/causal_spans.csv")
    narratives = load_csv(REAL / "normalized/constructcie/accident_narratives.csv")
    prov = Provenance("constructcie_causal_spans", "real", len(spans), "source",
                      "OSHA-derived narratives, annotations published with the dataset")

    title("REAL — ConstructCIE: CAUSAL SPAN DETECTION")
    print(f"  source        : {prov.source_id}  (Apache-2.0)")
    print(f"  records       : {len(narratives):,} narratives, {len(spans):,} causal spans")
    print(f"  label quality : {LABEL_QUALITY['source']}")
    print("  The labels shipped with the dataset. We did not write them and we")
    print("  did not re-adjudicate them.")

    by_record = defaultdict(list)
    for s in spans:
        by_record[s["record_id"]].append(s)
    top_factors = Counter(s["factor_path"].split("/")[0] for s in spans)

    sub("What the labels contain")
    table(["Top-level causal factor", "Spans", "Share"],
          [[k, v, pct(v / len(spans))] for k, v in top_factors.most_common()],
          aligns=["<", ">", ">"])
    print()
    print(f"  spans per narrative: mean "
          f"{len(spans)/len(by_record):.1f}, "
          f"max {max(len(v) for v in by_record.values())}")
    print(f"  accident types: "
          f"{dict(Counter(s['accident_type'] for s in spans))}")

    sub("Detector status")
    print("  NAVIS HAS NO RISK OR ISSUE DETECTOR. There is nothing to score.")
    print()
    print("  What exists is `_compute_delay_reasons` (server/main.py:2645), a")
    print("  12-keyword substring scan over audit spans. It is not a classifier,")
    print("  it produces no probabilities, and it is aimed at schedule delay")
    print("  causes rather than safety causality. Scoring it here would be a")
    print("  category error.")
    print()
    print("  The harness below is built and the baselines are computed, so the")
    print("  moment a detector exists it can be scored without further work.")

    # Baselines for the span-detection task, framed as: given a sentence from a
    # narrative, does it contain a causal span of the majority factor class?
    sentences, labels = [], []
    span_texts_by_record = {rid: {s["span_text"].strip().lower() for s in v}
                            for rid, v in by_record.items()}
    for nrec in narratives:
        rid = nrec.get("record_id")
        text = nrec.get("narrative") or nrec.get("source_narrative") or ""
        gold = span_texts_by_record.get(rid, set())
        for sent in re.split(r'(?<=[.!?])\s+', text):
            sent = sent.strip()
            if len(sent) < 15:
                continue
            sentences.append(sent)
            labels.append(1 if any(g and (g in sent.lower() or sent.lower() in g)
                                   for g in gold) else 0)

    if sentences:
        pos = sum(labels)
        n = len(labels)
        prevalence = pos / n

        def prf(preds):
            tp = sum(1 for p, y in zip(preds, labels) if p and y)
            fp = sum(1 for p, y in zip(preds, labels) if p and not y)
            fn = sum(1 for p, y in zip(preds, labels) if not p and y)
            prec = tp / (tp + fp) if tp + fp else 0.0
            rec = tp / (tp + fn) if tp + fn else 0.0
            f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
            return prec, rec, f1

        always = prf([1] * n)
        rand = prf([1 if rng.random() < prevalence else 0 for _ in range(n)])

        sub("Baselines on the span-detection task (sentence level)")
        print(f"  units: {n:,} sentences from {len(narratives)} narratives; "
              f"positive rate {prevalence:.1%}")
        table(
            ["Baseline", "Precision", "Recall", "F1"],
            [
                ["majority class (predict all positive)",
                 pct(always[0]), pct(always[1]), pct(always[2])],
                [f"random at prevalence ({prevalence:.1%})",
                 pct(rand[0]), pct(rand[1]), pct(rand[2])],
            ],
            aligns=["<", ">", ">", ">"],
        )
        print()
        print("  PR-AUC is not reported: it needs a ranked score, and neither")
        print("  baseline produces one. Any real detector must beat the majority")
        print(f"  F1 of {always[2]*100:.1f}% to be worth anything.")
    return prov


# ══════════════════════════════════════════════════════════════════════════════
# 4 — PAIMANA: delay and cost-overrun prediction
# ══════════════════════════════════════════════════════════════════════════════

def _f(v):
    try:
        x = float(str(v).replace(",", "").strip())
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _months_between(a, b):
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            da = datetime.strptime(str(a)[:19], fmt)
            db = datetime.strptime(str(b)[:19], fmt)
            return (db.year - da.year) * 12 + (db.month - da.month)
        except (ValueError, TypeError):
            continue
    return None


def paimana():
    rows = [r.get("record", r) for r in
            load_jsonl(REAL / "normalized/paimana/projects_latest_available.jsonl")]
    prov = Provenance("paimana_projects_latest", "real", len(rows), "source",
                      "MoSPI official project-monitoring records")

    title("REAL — MoSPI PAIMANA: DELAY AND COST-OVERRUN PREDICTION")
    print(f"  source        : {prov.source_id}")
    print(f"  records       : {len(rows):,} unique Indian infrastructure projects")
    print(f"  label quality : {LABEL_QUALITY['source']}")
    print("  Official government records. Values are as published; MoSPI's terms")
    print("  require accurate reproduction and source acknowledgment.")

    # The dashboard's DERIVED fields are published empty in these snapshots:
    # DELAYED_TIME, COST_OVERRUN and COST_OVERRUN_PERC are zero for all 2,243
    # projects. The RAW inputs are present, so delay and overrun are recomputed
    # here from the dates and costs themselves rather than reported as zero.
    delays, overruns = [], []
    for r in rows:
        months = _months_between(r.get("OriginalEndDate"), r.get("RevisedDate"))
        if months is not None:
            delays.append(float(months))
        oc, rc = _f(r.get("OriginalCost")), _f(r.get("RevisedCost"))
        if oc and rc and oc > 0:
            overruns.append((rc - oc) / oc * 100.0)

    published_delay = [d for d in (_f(r.get("DELAYED_TIME")) for r in rows)
                       if d not in (None, 0.0)]

    sub("What the records support")
    table(
        ["Field", "Projects with a usable value", "Usable for"],
        [
            ["DELAYED_TIME (published)", f"{len(published_delay):,}",
             "NOTHING — published as 0 for every project"],
            ["COST_OVERRUN_PERC (published)", "0",
             "NOTHING — published as 0 for every project"],
            ["OriginalEndDate + RevisedDate", f"{len(delays):,}",
             "delay, RECOMPUTED here"],
            ["OriginalCost + RevisedCost", f"{len(overruns):,}",
             "cost overrun, RECOMPUTED here"],
            ["RevisedDateReason", "0", "NOTHING — empty in all rows"],
            ["RevisedCostReason", "0", "NOTHING — empty in all rows"],
            ["Remarks", "0", "NOTHING — empty in all rows"],
        ],
        aligns=["<", ">", "<"],
    )
    print()
    print("  The three derived fields MoSPI publishes are zero-filled in these")
    print("  snapshots. Quoting them would have reported 2,243 projects with")
    print("  exactly zero delay and zero overrun, which is plainly false of")
    print("  Indian infrastructure and would have been a fabricated finding.")
    print("  Delay and overrun below are recomputed from the raw dates and costs.")

    # ── The regression, against the only baseline that matters ──────────────
    def regress(values, label, unit):
        if len(values) < 10:
            print(f"  {label}: too few values ({len(values)})")
            return
        mean = sum(values) / len(values)
        errs = [v - mean for v in values]
        rmse = math.sqrt(sum(e * e for e in errs) / len(errs))
        mae = sum(abs(e) for e in errs) / len(errs)
        lo, hi = boot_ci(values, stat=lambda v: sum(v) / len(v))
        srt = sorted(values)
        med = srt[len(srt) // 2]
        p10, p90 = srt[int(0.10 * len(srt))], srt[int(0.90 * len(srt))]
        print()
        print(f"  {label}  (n={len(values):,}, {unit})")
        table(
            ["Metric", "Value"],
            [
                ["observed mean", f"{mean:.2f}"],
                ["observed median", f"{med:.2f}"],
                ["mean 95% CI (bootstrap)", ci_str(lo, hi, as_pct=False)],
                ["p10 .. p90", f"{p10:.1f} .. {p90:.1f}"],
                ["RMSE a model must beat", f"{rmse:.2f}"],
                ["MAE a model must beat", f"{mae:.2f}"],
                ["R^2 of the mean-predictor", "0.000 (by definition)"],
                ["mean signed error of the mean-predictor",
                 "0.0000 (by definition)"],
            ],
            aligns=["<", ">"],
        )

    sub("Baseline: always predict the mean")
    regress(delays, "Delay", "months")
    regress(overruns, "Cost overrun", "percent")
    print()
    print("  R^2 and signed error are 0 BY DEFINITION for a mean-predictor —")
    print("  they are printed to make the bar explicit, not as a result. NAVIS")
    print("  HAS NO DURATION OR DELAY PREDICTOR, so there is nothing to compare.")
    print("  The RMSE rows above are the number any future model must beat.")

    # ── The taxonomy task, which this source cannot support ─────────────────
    sub("Delay-reason taxonomy coverage — CANNOT BE COMPUTED ON THIS SOURCE")
    print("  The task asks what fraction of real stated delay reasons our")
    print("  categories can express. PAIMANA carries NO free-text reasons:")
    print("  `RevisedDateReason`, `RevisedCostReason` and `Remarks` are present")
    print("  as columns and empty in all 18,601 project-month rows and all")
    print("  2,243 latest-available records.")
    print()
    print("  This is a property of the published snapshots, not of the corpus")
    print("  build — the fields exist in the schema and the dashboard does not")
    print("  populate them. Reporting a coverage number here would require")
    print("  inventing the reasons to cover.")
    print()
    print("  The taxonomy is measured against ConstructCIE instead — see the")
    print("  next section — which does carry real causal text.")
    return prov


# ══════════════════════════════════════════════════════════════════════════════
# 5 — Taxonomy coverage against real causal text
# ══════════════════════════════════════════════════════════════════════════════

#: The delay vocabulary NAVIS actually has, lifted verbatim from
#: `_compute_delay_reasons` in server/main.py. It is a substring list, not a
#: taxonomy, and naming it accurately is part of the finding.
NAVIS_DELAY_KEYWORDS = [
    "crane breakdown", "rain delay", "piling rig breakdown", "fencing conflict",
    "holiday delay", "crane issue", "material delay", "labour shortage",
    "design change", "weather", "monsoon", "flooding",
]


def taxonomy_coverage():
    spans = load_csv(REAL / "labels/constructcie/causal_spans.csv")
    title("REAL — DELAY / CAUSE TAXONOMY COVERAGE")
    print("  source        : constructcie_causal_spans (substituted for PAIMANA,")
    print("                  which publishes no free-text reasons)")
    print(f"  records       : {len(spans):,} real causal spans")
    print(f"  label quality : {LABEL_QUALITY['source']}")

    texts = [(s["span_text"] or "").lower() for s in spans]
    hit = sum(1 for t in texts if any(k in t for k in NAVIS_DELAY_KEYWORDS))
    per_kw = Counter()
    for t in texts:
        for k in NAVIS_DELAY_KEYWORDS:
            if k in t:
                per_kw[k] += 1

    sub("Direction 1 — what fraction of real causal text our vocabulary expresses")
    lo, hi = boot_ci([1] * hit + [0] * (len(texts) - hit))
    table(
        ["Metric", "Value", "95% CI"],
        [["real causal spans our 12 keywords match",
          f"{hit}/{len(texts)} = {hit/len(texts):.2%}", ci_str(lo, hi)]],
        aligns=["<", ">", ">"],
    )
    print()
    if per_kw:
        table(["Keyword that fired", "Spans"],
              [[k, v] for k, v in per_kw.most_common()], aligns=["<", ">"])
    else:
        print("  Not one of the twelve keywords appears in any of the 3,520 spans.")
    print()
    print("  This is a finding, not a bug in the measurement. Our vocabulary was")
    print("  written from our own synthetic DPRs — 'monsoon', 'piling rig")
    print("  breakdown', 'fencing conflict' — and it is a closed list of twelve")
    print("  substrings, not a taxonomy with structure.")

    sub("Direction 2 — what real causal structure we cannot express at all")
    factors = Counter(s["factor_path"] for s in spans)
    uncovered = [(f, c) for f, c in factors.most_common()
                 if not any(k in f.replace("_", " ") for k in NAVIS_DELAY_KEYWORDS)]
    print(f"  ConstructCIE organises causes into {len(factors)} hierarchical")
    print(f"  factor paths. Our list has no structure and no equivalent for "
          f"{len(uncovered)} of them.")
    print()
    table(["Real factor path we cannot express", "Spans"],
          [[f, c] for f, c in uncovered[:12]], aligns=["<", ">"])
    print()
    print("  Caveat that a sceptical reader should apply: ConstructCIE is OSHA")
    print("  SAFETY causality (what injured someone), and our keywords are")
    print("  SCHEDULE delay causality (what made work late). The two overlap")
    print("  — weather, equipment failure — but they are not the same question.")
    print("  The honest statement is that we have no real-text benchmark for")
    print("  schedule-delay reasons at all, and this is the closest proxy.")


# ══════════════════════════════════════════════════════════════════════════════
# 6 — Semantic layer coverage: CFIHOS / Uniclass / CPWD
# ══════════════════════════════════════════════════════════════════════════════

def semantic_layer():
    title("REAL — SEMANTIC LAYER COVERAGE (CFIHOS / CPWD / Uniclass)")

    cfihos_uom = load_csv(
        REAL / "normalized/cfihos/v2.0/CFIHOS CORE unit of measure v2.0.csv")
    cfihos_disc = load_csv(
        REAL / "normalized/cfihos/v2.0/CFIHOS CORE discipline v2.0.csv")
    cfihos_tagclass = load_csv(
        REAL / "normalized/cfihos/v2.0/CFIHOS CORE tag class v2.0.csv")
    cpwd = load_csv(REAL / "normalized/cpwd/dsr_em_2025/item_rates.csv")

    print(f"  sources       : CFIHOS v2.0 CORE ({len(cfihos_uom):,} UoM, "
          f"{len(cfihos_disc)} disciplines, {len(cfihos_tagclass)} tag classes)")
    print(f"                  CPWD DSR E&M 2025 ({len(cpwd):,} item rows)")
    print(f"  label quality : {LABEL_QUALITY['source']} (CFIHOS), "
          f"{LABEL_QUALITY['machine']} (CPWD)")

    # ── Units of measure ────────────────────────────────────────────────────
    ours = set()
    for path, col in [
        (PROJECT_ROOT / "dataset/baseline_schedule.json", "uom"),
        (PROJECT_ROOT / "dataset/baseline_schedule_v2.json", "uom"),
    ]:
        for a in json.load(open(path, encoding="utf-8")):
            u = (a.get(col) or "").strip().lower()
            if u:
                ours.add(u)

    def norm(s):
        return re.sub(r"[^a-z0-9]", "", (s or "").lower())

    cf_syms = {norm(r.get("unit of measure symbol")) for r in cfihos_uom}
    cf_names = {norm(r.get("unit of measure name")) for r in cfihos_uom}
    cf_all = {x for x in cf_syms | cf_names if x}
    cpwd_units = {norm(r.get("unit")) for r in cpwd if r.get("unit")}

    covered = {u for u in ours if norm(u) in cf_all}
    sub("Direction 1 — our units, found in real published reference data")
    table(
        ["Our unit", "In CFIHOS v2.0?", "In CPWD DSR?"],
        [[u, "yes" if norm(u) in cf_all else "NO",
          "yes" if norm(u) in cpwd_units else "no"] for u in sorted(ours)],
        aligns=["<", ">", ">"],
    )
    lo, hi = boot_ci([1 if norm(u) in cf_all else 0 for u in sorted(ours)])
    print()
    print(f"  {len(covered)}/{len(ours)} = {len(covered)/len(ours):.1%} of our units "
          f"appear in CFIHOS  {ci_str(lo, hi)}")

    sub("Direction 2 — real reference vocabulary we cannot express")
    print(f"  CFIHOS publishes {len(cf_all):,} distinct unit symbols/names.")
    print(f"  We use {len(ours)}. We can express "
          f"{len(ours)/len(cf_all):.2%} of CFIHOS's unit vocabulary.")
    print()
    print(f"  CPWD DSR E&M uses {len(cpwd_units)} distinct units across "
          f"{len(cpwd):,} priced items;")
    shared = {u for u in cpwd_units if u in {norm(o) for o in ours}}
    print(f"  {len(shared)} of them overlap with ours: "
          f"{sorted(shared) if shared else 'none'}")
    print()
    print("  Both directions are findings. A 6-unit vocabulary is enough for one")
    print("  well-site schedule and nowhere near a handover-grade data standard.")

    # ── Disciplines ─────────────────────────────────────────────────────────
    our_disc = {"civil", "piping", "static_equipment", "electrical",
                "instrumentation", "hse"}
    cf_disc_names = {(r.get("discipline name") or "").strip().lower()
                     for r in cfihos_disc}
    sub("Disciplines")
    matched = {d for d in our_disc
               if any(d.replace("_", " ") in c or c in d.replace("_", " ")
                      for c in cf_disc_names if c)}
    table(["Our discipline", "Present in CFIHOS discipline table?"],
          [[d, "yes" if d in matched else "NO"] for d in sorted(our_disc)],
          aligns=["<", ">"])
    print()
    print(f"  CFIHOS publishes {len(cf_disc_names)} disciplines; we model 6.")
    print(f"  We can express {len(our_disc)/len(cf_disc_names):.1%} of theirs.")

    # ── Tag patterns ────────────────────────────────────────────────────────
    sub("Tag patterns")
    fmts = [(r.get("tag number format") or "").strip()
            for r in cfihos_tagclass if (r.get("tag number format") or "").strip()]
    print(f"  CFIHOS tag classes: {len(cfihos_tagclass)}, of which "
          f"{len(fmts)} publish an explicit tag-number format.")
    ours_recognised = 0
    for f in fmts[:400]:
        if extract_tags(f):
            ours_recognised += 1
    if fmts:
        print(f"  Our tag regexes recognise {ours_recognised}/{min(len(fmts),400)} "
              f"of the published format strings as tags.")
        print("  That number is LOW by nature — a format string is a TEMPLATE")
        print("  ('XX-9999'), not an instance, so this measures pattern shape")
        print("  rather than real coverage. Reported for transparency, not as a")
        print("  score.")


# ══════════════════════════════════════════════════════════════════════════════
# 7 — The two-column view
# ══════════════════════════════════════════════════════════════════════════════

#: Last published synthetic figures, from
#: `python eval.py --schedule dataset/baseline_schedule_v2.json
#:  --ground-truth dataset/v2/ground_truth_v2.csv` (held-out test, n=198).
#: Quoted rather than recomputed so this script never touches dataset/v2.
SYNTHETIC = {
    "corpus": "dataset/v2 (authored by us)",
    "n": "198 held-out / 814 total",
    "top1": "71.4%",
    "top1_near_miss": "26.5%",
    "top1_rest": "97.4%",
    "auto_precision": "100.0%",
    "coverage": "41.4%",
    "no_match": "84.6%",
    "labels": "authored by us",
}


def two_column():
    title("SYNTHETIC vs REAL — SIDE BY SIDE, NEVER COMBINED")
    print("  These columns are never averaged, summed, or reduced to one number.")
    print("  They measure different things on different data of different origin.")
    print()
    table(
        ["Task", "SYNTHETIC (dataset/v2)", "REAL (datasets/real)"],
        [
            ["schedule linking accuracy",
             f"top-1 {SYNTHETIC['top1']} (n=185 pos)",
             "WITHHELD — labels unverified"],
            ["  on near-misses", SYNTHETIC["top1_near_miss"], "n/a — no real near-miss labels"],
            ["  on the rest", SYNTHETIC["top1_rest"], "n/a"],
            ["auto-link precision", SYNTHETIC["auto_precision"], "not computable yet"],
            ["NO_MATCH rejection", SYNTHETIC["no_match"],
             "100 rule-based candidates, unverified"],
            ["extraction over field text",
             "not measured (mentions are given)",
             "4,315 real OCR lines — rates reported"],
            ["causal / risk detection", "none in corpus",
             "3,520 published spans, baselines only"],
            ["delay prediction", "none in corpus",
             "2,243 projects, mean-baseline only"],
            ["units / discipline vocabulary", "6 units, 6 disciplines",
             "1,472 CFIHOS units, 34 disciplines"],
            ["label provenance", SYNTHETIC["labels"],
             "source-published or unverified"],
        ],
        aligns=["<", ">", ">"],
    )

    sub("Tasks only the SYNTHETIC corpus can evaluate, and why")
    print("  * schedule-linking accuracy at scale — it needs a labelled mention")
    print("    against a known activity, 814 times. The real corpus has 13")
    print("    unverified candidates against 27 activities.")
    print("  * near-miss discrimination — it needs sibling activities that differ")
    print("    by one token, deliberately constructed. Real schedules are not")
    print("    built to order.")
    print("  * date-basis behaviour (EXPLICIT vs DEFAULTED_TO_REPORT_DATE) — it")
    print("    needs a known answer for what date the text stated.")
    print()
    print("  These are legitimate uses of synthetic data. They are also exactly")
    print("  the numbers a sceptic should discount most.")

    sub("Tasks only the REAL corpus can evaluate")
    print("  * whether our extractor survives OCR noise from a real scanner")
    print("  * whether our discipline keywords generalise past one project type")
    print("  * whether our unit and discipline vocabulary matches a published")
    print("    handover standard")
    print("  * causal-span detection against labels someone else published")
    print("  * delay magnitude on 2,243 real projects")


# ══════════════════════════════════════════════════════════════════════════════
# 8 — The honest statement
# ══════════════════════════════════════════════════════════════════════════════

def what_it_proves():
    title("WHAT OUR REAL DATA DOES AND DOES NOT PROVE")
    print("""
  Written for a reader who assumes we are overselling.

  WHAT IT DOES NOT PROVE

  It does not prove our matcher works on real schedules. The only real
  schedule-linking evidence we hold is 13 field-report summaries against 27
  activities on one small WSDOT test-pile contract, and the links between them
  were proposed by a rule, not confirmed by a person. We report no accuracy
  from them. Twenty-seven activities is roughly one eighth of our synthetic
  schedule and covers one discipline on one contract over six weeks. Even
  fully verified, it could not support a claim about matcher quality — the
  confidence interval on thirteen samples is about plus or minus twenty-five
  points, which is wide enough to contain almost any hypothesis.

  It does not prove our delay analysis works. We have no delay predictor. The
  PAIMANA section establishes the bar a predictor must clear and nothing more.

  It does not prove our taxonomy is adequate. It shows the opposite: twelve
  hard-coded substrings match almost none of the real causal text we could
  find, and PAIMANA — the source that should have settled the question —
  publishes no free-text reasons at all.

  WHAT IT DOES PROVE

  That the extractor runs on real OCR'd inspection reports from a different
  country, a different contract type and a different decade, and pulls out
  dates and quantities without special-casing. The rates are low, and the
  reason is legible: an inspection page is mostly form furniture.

  That our vocabulary is narrow against a published standard. Six units where
  CFIHOS publishes 1,472; six disciplines where CFIHOS publishes 34. That is a
  measured gap against real reference data, in both directions.

  That the corpus is honestly built. Every record carries its source hash, its
  extraction method and its verification status, and this report refuses to
  compute the numbers those statuses do not support.

  THE HONEST SUMMARY

  Our real data proves the system is not brittle to real text, and measures the
  gap between our vocabulary and a real standard. Our claims about MATCHING
  QUALITY rest on synthetic data we authored, and should be read that way. The
  fix is not a better argument — it is the thirteen-pair verification sheet,
  and then more real labelled data.
""")


# ══════════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="Real-corpus benchmark")
    ap.add_argument("--wsdot-sheet", action="store_true",
                    help="print the 13-pair human verification sheet and exit")
    args = ap.parse_args()

    if args.wsdot_sheet:
        wsdot_linking_sheet(print_only=True)
        return 0

    title("NAVIS REAL-CORPUS BENCHMARK")
    print("  datasets/real — public-source material, not authored by us.")
    print("  Reported separately from dataset/v2 in every section. No metric on")
    print("  this page is combined with, or averaged against, a synthetic one.")

    provs = [
        wsdot_extraction(),
        wsdot_linking_sheet(),
        constructcie(),
        paimana(),
    ]
    taxonomy_coverage()
    semantic_layer()
    two_column()

    title("PROVENANCE OF EVERY SOURCE USED ABOVE")
    table(["origin", "source_id", "records", "label quality"],
          [p.row() for p in provs if p], aligns=["<", "<", ">", "<"])
    print()
    print("  A row marked MACHINE-DERIVED, UNVERIFIED supports no accuracy claim.")

    what_it_proves()
    return 0


if __name__ == "__main__":
    sys.exit(main())
