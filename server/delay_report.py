"""The Delay Attribution Report: the document a claim is argued from.

Phase 3 of the Contractor Dispute Shield. D-077 made each delay a row and D-078
let a planner rule on it; this renders both into something that can leave the
application - a CSV for analysis and a printable HTML document for a file.

WHAT MAKES IT A DOCUMENT RATHER THAN A DUMP
-------------------------------------------
Three things, and all three are the reason it exists:

**It names the schedule it was computed against.** Two baselines ship and they
share no activity ids, so "21 days on CIV-DWG-1015" means nothing without the
baseline sha256 and the data date. Both are stamped on the HTML and repeated on
every CSV row.

**Every figure carries its citation.** Source file, row or line, and the
verbatim sentence the classification was read from. A delay attributed without
the document behind it is an assertion; with it, it is evidence.

**It states its own limits on its face.** `impact_days` is an upper bound, an
unadjudicated row is a proposal and not a finding, and the phrase list only
recognises what it recognises. A reader who has to discover those from the
source code will not trust anything else on the page either.

CSV SHAPE
---------
RFC 4180 has no comment syntax, so the provenance stamp is repeated as columns
on every row rather than written as a preamble a parser would choke on. The
repetition is deliberate: a single row pasted into an email still names the
schedule version and data date it was true for.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from html import escape
from typing import Optional

from sqlalchemy.orm import Session

from server.db import Activity, BaselineVersion
from server.delay_events import (
    NOTICE_WINDOW_DAYS,
    ConcurrencyKind,
    ConcurrencyStatus,
    NoticeStatus,
    attribution,
    days_to_notice,
    effective_liability,
    is_adjudicated,
    notice_status,
)
from server.delay_taxonomy import Liability

#: Report order. Owner-side first, because that is the column a contractor's
#: claim is built from and the one a client reads first; contested last,
#: because it is the work still outstanding rather than a finding.
LIABILITY_ORDER = (
    Liability.COMPENSABLE,
    Liability.NON_COMPENSABLE,
    Liability.EXCUSABLE,
    Liability.CONTESTED,
)

LIABILITY_LABEL = {
    Liability.COMPENSABLE: "Compensable — owner responsibility",
    Liability.NON_COMPENSABLE: "Non-compensable — contractor responsibility",
    Liability.EXCUSABLE: "Excusable — neither party",
    Liability.CONTESTED: "Contested — awaiting a planner's ruling",
}

#: Printed on every rendering of the report. Written here rather than in a
#: template so the two formats cannot drift into saying different things about
#: the same numbers.
CAVEATS = (
    (
        "Days are attributed, not measured",
        "An activity's whole finish slip is credited to every cause recorded "
        "against it, so a per-cause figure is an upper bound and the columns "
        "do not sum to a project delay. Separating float consumption from "
        "project delay requires a critical-path pass this system does not yet "
        "perform.",
    ),
    (
        "A row without a ruling is a proposal",
        "Liability shown for an unadjudicated row is the deterministic "
        "proposal from the delay taxonomy, not a finding. Proposals are "
        "excluded from the adjudicated totals.",
    ),
    (
        "Detection recognises a fixed phrase list",
        "Delay causes are found by matching a fixed vocabulary against the "
        "field text already recorded in the audit trail. Wording outside that "
        "list is not classified and does not appear here at all.",
    ),
    (
        "Notice windows are a default, not a contract term",
        f"A window of {NOTICE_WINDOW_DAYS} days from the date a delay was "
        "evidenced is applied, taken from FIDIC 1999 Sub-Clause 20.1. The "
        "governing contract may say otherwise. A delay marked as lapsed means "
        "only that no notice has been recorded in this system, which holds no "
        "notice register of its own.",
    ),
    (
        "Concurrent delay is named, never apportioned",
        "Where two delays were open over the same period this report says so "
        "and cites both, and stops there. Splitting concurrent delay between "
        "parties is a matter for the contract and the parties, not for "
        "software. An overlap between two DIFFERENT activities is temporal "
        "only: whether both moved the completion date needs a critical-path "
        "analysis, which this system does not perform.",
    ),
    (
        "Rulings are not authenticated",
        "This system has no user authentication. The name recorded against a "
        "ruling is whatever the client supplied and nothing verifies it.",
    ),
)


def report_context(
    db: Session,
    discipline: Optional[str] = None,
    data_date: Optional[date] = None,
) -> dict:
    """Everything both renderings need, gathered once.

    Deliberately one function feeding both formats: a CSV and an HTML document
    that disagreed about a total would be worse than either alone.

    The data date doubles as the date the notice windows are judged against.
    Without one every window reads UNKNOWN, which is the honest answer - a
    lapsed claim asserted against today's date on an undated report would be a
    false accusation.
    """
    data = attribution(db, discipline=discipline, as_of=data_date)

    baseline = (
        db.query(BaselineVersion)
        .filter(BaselineVersion.is_active.is_(True))
        .order_by(BaselineVersion.imported_at.desc())
        .first()
    )

    total_activities = db.query(Activity).count()
    with_actuals = (
        db.query(Activity)
        .filter(
            (Activity.actual_start.isnot(None))
            | (Activity.actual_finish.isnot(None))
        )
        .count()
    )

    grouped: dict[str, list] = {liability.value: [] for liability in LIABILITY_ORDER}
    for row in data["events"]:
        grouped.setdefault(effective_liability(row), []).append(row)

    return {
        "events": data["events"],
        "grouped": grouped,
        "total_events": data["total_events"],
        "adjudicated_events": data["adjudicated_events"],
        "adjudicated_days": data["adjudicated_days"],
        "proposed_days": data["proposed_days"],
        "days_by_month": data["days_by_month"],
        "notice_window_days": data["notice_window_days"],
        "notice_counts": data["notice_counts"],
        "notice_lapsed_days": data["notice_lapsed_days"],
        "concurrency": data["concurrency"],
        "discipline": discipline,
        "data_date": data_date,
        "baseline_name": baseline.name if baseline else None,
        "baseline_filename": baseline.filename if baseline else None,
        "baseline_sha256": baseline.sha256 if baseline else None,
        "total_activities": total_activities,
        "activities_with_actuals": with_actuals,
        "generated_at": datetime.now(),
    }


def filename_for(context: dict, extension: str) -> str:
    """A filename that identifies the run: date, and the baseline it was on."""
    stamp = context["data_date"].isoformat() if context["data_date"] else "undated"
    sha = (context["baseline_sha256"] or "nobaseline")[:8]
    discipline = f"-{context['discipline']}" if context["discipline"] else ""
    return f"navis-delay-attribution{discipline}-{stamp}-{sha}.{extension}"


CSV_COLUMNS = (
    "liability_effective", "adjudicated", "liability_proposed", "liability_ruled",
    "activity_id", "discipline", "category", "phrase", "impact_days", "month",
    "source_file", "source_row", "source_line", "source_span",
    "evidenced_on", "evidenced_basis", "notice_due_on", "notice_status",
    "notice_days_remaining", "notice_served_on", "notice_reference",
    "adjudicated_by", "adjudicated_at", "adjudication_note",
    "delay_event_id", "audit_record_id",
    # Repeated on every row on purpose - see the module docstring.
    "data_date", "baseline_sha256", "generated_at",
)


def to_csv(context: dict) -> str:
    """The rows, in the report's own order, one line each."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)

    stamp = context["data_date"].isoformat() if context["data_date"] else ""
    sha = context["baseline_sha256"] or ""
    generated = context["generated_at"].isoformat(timespec="seconds")

    for liability in LIABILITY_ORDER:
        for row in context["grouped"].get(liability.value, []):
            writer.writerow([
                effective_liability(row),
                "yes" if is_adjudicated(row) else "no",
                row.liability_proposed,
                row.liability_final or "",
                row.activity_id or "",
                row.discipline or "",
                row.category,
                row.phrase,
                row.impact_days or 0,
                row.month or "",
                row.source_file or "",
                row.source_row if row.source_row is not None else "",
                row.source_line if row.source_line is not None else "",
                (row.source_span or "").replace("\n", " ").strip(),
                row.evidenced_on.isoformat() if row.evidenced_on else "",
                row.evidenced_basis or "",
                row.notice_due_on.isoformat() if row.notice_due_on else "",
                notice_status(row, context["data_date"]),
                (lambda d: "" if d is None else d)(
                    days_to_notice(row, context["data_date"])),
                row.notice_served_on.isoformat() if row.notice_served_on else "",
                row.notice_reference or "",
                row.adjudicated_by or "",
                row.adjudicated_at.isoformat(timespec="seconds") if row.adjudicated_at else "",
                row.adjudication_note or "",
                row.id,
                row.audit_record_id or "",
                stamp,
                sha,
                generated,
            ])

    return buffer.getvalue()


_STYLE = """
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 11pt/1.5 Georgia, "Times New Roman", serif; color: #1a1a1a;
         background: #fff; margin: 0; padding: 24px; }
  .sheet { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 12pt; margin: 28px 0 8px; padding-bottom: 4px;
       border-bottom: 1px solid #1a1a1a; text-transform: uppercase;
       letter-spacing: 0.08em; font-family: Arial, Helvetica, sans-serif; }
  .sub { font-size: 10pt; color: #444; margin: 0 0 16px; }
  .stamp { font: 8.5pt/1.6 "Courier New", monospace; color: #333;
           border: 1px solid #bbb; padding: 10px 12px; margin-bottom: 8px; }
  .stamp b { font-weight: normal; color: #666; display: inline-block;
             min-width: 128px; vertical-align: top; }
  .stamp > div { word-break: break-word; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt;
          font-family: Arial, Helvetica, sans-serif; }
  th { text-align: left; border-bottom: 1.5px solid #1a1a1a; padding: 6px 8px;
       font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase;
       color: #444; }
  td { border-bottom: 1px solid #ddd; padding: 7px 8px; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums;
           white-space: nowrap; }
  td.mono, .mono { font-family: "Courier New", monospace; font-size: 9pt; }
  .quote { font-family: Georgia, serif; font-style: italic; color: #222; }
  .cite { font-family: "Courier New", monospace; font-size: 8pt; color: #555; }
  .group { margin-top: 22px; page-break-inside: avoid; }
  .group h3 { font-size: 10.5pt; margin: 0 0 6px; font-family: Arial, sans-serif;
              padding: 5px 8px; background: #f0f0f0;
              border-left: 4px solid var(--band, #666); }
  .g-compensable { --band: #1a4f8a; }
  .g-noncompensable { --band: #8a1f19; }
  .g-excusable { --band: #7a5d14; }
  .g-contested { --band: #4a3f70; }
  .empty { font-size: 9.5pt; color: #666; font-style: italic; padding: 6px 8px; }
  .proposal { font-size: 8pt; color: #8a1f19; font-family: Arial, sans-serif; }
  .notice { font-size: 8pt; font-family: Arial, sans-serif; margin-top: 3px; }
  .n-lapsed { color: #8a1f19; font-weight: bold; }
  .n-open { color: #1a4f8a; }
  .n-served { color: #1f6b3a; }
  .n-unknown { color: #666; }
  .alarm { border: 1.5px solid #8a1f19; padding: 10px 12px; margin: 10px 0 0;
           font-size: 9.5pt; font-family: Arial, sans-serif; color: #8a1f19; }
  tfoot td { font-weight: bold; border-top: 1.5px solid #1a1a1a;
             border-bottom: none; }
  .caveat { margin-bottom: 12px; page-break-inside: avoid; }
  .caveat b { display: block; font-family: Arial, sans-serif; font-size: 9.5pt; }
  .caveat span { font-size: 9.5pt; color: #333; }
  .foot { margin-top: 28px; padding-top: 8px; border-top: 1px solid #bbb;
          font-size: 8.5pt; color: #666; }
"""


def _group_class(liability: Liability) -> str:
    return {
        Liability.COMPENSABLE: "g-compensable",
        Liability.NON_COMPENSABLE: "g-noncompensable",
        Liability.EXCUSABLE: "g-excusable",
        Liability.CONTESTED: "g-contested",
    }[liability]


def to_html(context: dict) -> str:
    """The printable document.

    Self-contained: no external stylesheet, no script, no font host. It has to
    survive being saved to disk, emailed, and printed by someone with no
    network - which is what a document attached to a contractual letter is.
    """
    out: list[str] = []
    w = out.append

    stamp = context["data_date"].isoformat() if context["data_date"] else "not stated"
    scope = context["discipline"] or "all disciplines"

    w("<!doctype html><html lang='en'><head><meta charset='utf-8'>")
    w("<title>NAVIS Delay Attribution Report</title>")
    w(f"<style>{_STYLE}</style></head><body><div class='sheet'>")

    w("<h1>Delay Attribution Report</h1>")
    w(f"<p class='sub'>Recorded delay causes, the party each is attributed to, "
      f"and the source document behind every attribution. Scope: "
      f"{escape(scope)}.</p>")

    w("<div class='stamp'>")
    w(f"<div><b>Data date</b>{escape(stamp)}</div>")
    w(f"<div><b>Baseline</b>{escape(context['baseline_name'] or 'not recorded')}"
      f" ({escape(context['baseline_filename'] or 'unknown file')})</div>")
    w(f"<div><b>Baseline sha256</b>{escape(context['baseline_sha256'] or 'not recorded')}</div>")
    w(f"<div><b>Schedule scope</b>{context['activities_with_actuals']} of "
      f"{context['total_activities']} activities carry actual dates</div>")
    ruled = context["adjudicated_events"]
    w(f"<div><b>Delays classified</b>{context['total_events']}, of which "
      f"{ruled} {'carries' if ruled == 1 else 'carry'} a planner's ruling</div>")
    w(f"<div><b>Generated</b>"
      f"{escape(context['generated_at'].isoformat(timespec='seconds'))}</div>")
    w("</div>")

    # ── Summary ──
    w("<h2>Summary of days by party</h2>")
    w("<table><thead><tr><th>Attribution</th><th style='text-align:right'>Ruled days</th>"
      "<th style='text-align:right'>Including proposals</th>"
      "<th style='text-align:right'>Delays</th></tr></thead><tbody>")
    ruled_total = proposed_total = 0
    for liability in LIABILITY_ORDER:
        ruled = context["adjudicated_days"].get(liability.value, 0)
        proposed = context["proposed_days"].get(liability.value, 0)
        count = len(context["grouped"].get(liability.value, []))
        ruled_total += ruled
        proposed_total += proposed
        w(f"<tr><td>{escape(LIABILITY_LABEL[liability])}</td>"
          f"<td class='num'>{ruled}</td><td class='num'>{proposed}</td>"
          f"<td class='num'>{count}</td></tr>")
    w(f"</tbody><tfoot><tr><td>Total</td><td class='num'>{ruled_total}</td>"
      f"<td class='num'>{proposed_total}</td>"
      f"<td class='num'>{context['total_events']}</td></tr></tfoot></table>")

    # ── Notice ──
    counts = context["notice_counts"]
    w("<h2>Contractual notice</h2>")
    w(f"<p class='sub'>Windows of {context['notice_window_days']} days from the "
      f"date each delay was evidenced, judged as at {escape(stamp)}.</p>")
    w("<table><thead><tr><th>Status</th><th style='text-align:right'>Delays</th>"
      "</tr></thead><tbody>")
    for status, label in (
        (NoticeStatus.LAPSED, "Lapsed — window closed, no notice recorded"),
        (NoticeStatus.OPEN, "Open — window has not closed"),
        (NoticeStatus.SERVED, "Served — notice recorded"),
        (NoticeStatus.UNKNOWN, "Unknown — no evidenced date established"),
    ):
        w(f"<tr><td>{escape(label)}</td>"
          f"<td class='num'>{counts.get(status.value, 0)}</td></tr>")
    w("</tbody></table>")
    if counts.get(NoticeStatus.LAPSED.value, 0):
        w(f"<p class='alarm'>{counts[NoticeStatus.LAPSED.value]} delay"
          f"{'' if counts[NoticeStatus.LAPSED.value] == 1 else 's'} carrying "
          f"{context['notice_lapsed_days']} days sit behind a notice window "
          f"that has already closed. Entitlement to an extension of time may "
          f"be barred on those, unless notice was in fact given and is simply "
          f"not recorded here.</p>")

    # ── Concurrent delay ──
    conc = context["concurrency"]
    w("<h2>Concurrent delay</h2>")
    if not conc["total_pairs"]:
        w("<p class='empty'>No two delays in this scope were open over the "
          "same period.</p>")
    else:
        w(f"<p class='sub'>{conc['total_pairs']} overlapping "
          f"pair{'' if conc['total_pairs'] == 1 else 's'}: "
          f"{conc['counts'].get(ConcurrencyStatus.CONFLICT.value, 0)} where the "
          f"two sides are attributed to different outcomes, "
          f"{conc['counts'].get(ConcurrencyStatus.UNRESOLVED.value, 0)} with at "
          f"least one side still unruled, "
          f"{conc['counts'].get(ConcurrencyStatus.ALIGNED.value, 0)} carrying "
          f"the same attribution.</p>")
        w("<table><thead><tr><th>Period</th><th style='text-align:right'>Days"
          "</th><th>One delay</th><th>The other</th><th>Reading</th></tr>"
          "</thead><tbody>")
        for pair in conc["pairs"]:
            if pair["status"] == ConcurrencyStatus.CONFLICT.value:
                reading = ("<span class='n-lapsed'>Both attributed, and to "
                           "different outcomes. Nothing in the evidence "
                           "apportions this period.</span>")
            elif pair["status"] == ConcurrencyStatus.UNRESOLVED.value:
                reading = ("At least one side is unruled. Ruling them "
                           "separately without reading this row is how a "
                           "concurrency gets missed.")
            else:
                reading = "Both carry the same attribution; the overlap changes nothing."
            if pair["kind"] == ConcurrencyKind.SAME_ACTIVITY.value:
                reading += ("<div class='cite'>Same activity — the two causes "
                            "share one overrun by construction.</div>")
            else:
                reading += ("<div class='cite'>Different activities — temporal "
                            "overlap only; criticality not established.</div>")
            w(f"<tr><td class='mono'>{pair['overlap_start'].isoformat()}"
              f"<div class='cite'>to {pair['overlap_end'].isoformat()}</div></td>"
              f"<td class='num'>{pair['overlap_days']}</td>"
              f"<td class='mono'>{escape(pair['left_activity_id'] or '—')}"
              f"<div class='cite'>{escape(pair['left_phrase'])}</div>"
              f"<div class='cite'>{escape(pair['left_liability'])}</div></td>"
              f"<td class='mono'>{escape(pair['right_activity_id'] or '—')}"
              f"<div class='cite'>{escape(pair['right_phrase'])}</div>"
              f"<div class='cite'>{escape(pair['right_liability'])}</div></td>"
              f"<td>{reading}</td></tr>")
        w("</tbody></table>")
        if conc["pairs_listed"] < conc["total_pairs"]:
            w(f"<p class='caption'>Showing the {conc['pairs_listed']} longest "
              f"of {conc['total_pairs']} overlapping pairs.</p>")

    if context["days_by_month"]:
        w("<h2>Days by month</h2>")
        w("<table><thead><tr><th>Month</th><th style='text-align:right'>Days</th>"
          "</tr></thead><tbody>")
        for month, days in context["days_by_month"].items():
            w(f"<tr><td class='mono'>{escape(month)}</td>"
              f"<td class='num'>{days}</td></tr>")
        w("</tbody></table>")

    # ── The rows ──
    w("<h2>Delays, grouped by attribution</h2>")
    for liability in LIABILITY_ORDER:
        rows = context["grouped"].get(liability.value, [])
        w(f"<div class='group {_group_class(liability)}'>")
        w(f"<h3>{escape(LIABILITY_LABEL[liability])} &middot; "
          f"{len(rows)} delay{'' if len(rows) == 1 else 's'}</h3>")
        if not rows:
            w("<p class='empty'>No delays attributed here on this evidence.</p>")
            w("</div>")
            continue
        w("<table><thead><tr><th>Activity</th><th>Cause</th>"
          "<th>Evidence and citation</th><th style='text-align:right'>Days</th>"
          "</tr></thead><tbody>")
        for row in rows:
            citation = escape(row.source_file or "source not recorded")
            if row.source_row is not None:
                citation += f", row {row.source_row}"
            elif row.source_line is not None:
                citation += f", line {row.source_line}"
            ruling = ""
            if is_adjudicated(row):
                who = escape(row.adjudicated_by or "planner")
                ruling = f"<div class='cite'>Ruled by {who}"
                if row.liability_final != row.liability_proposed:
                    ruling += (f", overriding the proposed "
                               f"{escape(row.liability_proposed)}")
                ruling += "</div>"
                if row.adjudication_note:
                    ruling += (f"<div class='quote'>&ldquo;"
                               f"{escape(row.adjudication_note)}&rdquo;</div>")
            else:
                ruling = ("<div class='proposal'>Proposal — no planner ruling "
                          "recorded</div>")

            status = notice_status(row, context["data_date"])
            remaining = days_to_notice(row, context["data_date"])
            css = {
                NoticeStatus.LAPSED.value: "n-lapsed",
                NoticeStatus.OPEN.value: "n-open",
                NoticeStatus.SERVED.value: "n-served",
            }.get(status, "n-unknown")
            if status == NoticeStatus.SERVED.value:
                text = (f"Notice served "
                        f"{row.notice_served_on.isoformat()}")
                if row.notice_reference:
                    text += f" ({escape(row.notice_reference)})"
            elif status == NoticeStatus.LAPSED.value:
                text = (f"Notice LAPSED — evidenced "
                        f"{row.evidenced_on.isoformat()} "
                        f"({escape(row.evidenced_basis or '')}), due "
                        f"{row.notice_due_on.isoformat()}, "
                        f"{abs(remaining)} days ago")
            elif status == NoticeStatus.OPEN.value:
                text = (f"Notice due {row.notice_due_on.isoformat()} — "
                        f"{remaining} days remaining")
            else:
                text = "Notice window not established — no evidenced date"
            ruling += f"<div class='notice {css}'>{text}</div>"
            w(f"<tr><td class='mono'>{escape(row.activity_id or '—')}"
              f"<div class='cite'>{escape(row.discipline or '')}</div></td>"
              f"<td class='mono'>{escape(row.category)}"
              f"<div class='cite'>{escape(row.phrase)}</div></td>"
              f"<td><div class='quote'>&ldquo;"
              f"{escape((row.source_span or '').strip())}&rdquo;</div>"
              f"<div class='cite'>{citation}</div>{ruling}</td>"
              f"<td class='num'>{row.impact_days or 0}"
              f"<div class='cite'>{escape(row.month or '')}</div></td></tr>")
        w("</tbody></table></div>")

    # ── Caveats ──
    w("<h2>How to read this report</h2>")
    for heading, body in CAVEATS:
        w(f"<div class='caveat'><b>{escape(heading)}</b>"
          f"<span>{escape(body)}</span></div>")

    w("<p class='foot'>Generated by NAVIS from the project audit trail. Every "
      "row above traces to an immutable audit record; nothing in this document "
      "was authored by hand.</p>")
    w("</div></body></html>")

    return "".join(out)
