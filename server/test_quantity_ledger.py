"""The quantity ledger, and the refusals it exists to make visible.

Phase 1 of the Granularity Resolution Engine (D-085). Three properties matter
more than any individual field:

  1. The ledger explains the total the schedule holds, and says which KIND of
     number that is - counted readings, a quantity back-derived from an
     asserted percentage, or neither.
  2. A refused reading is shown with its reason. A ledger that quietly drops
     what the roll-up declined hides the judgement it was making.
  3. The classification is the roll-up's own. `classify_quantity` is called by
     both, so the explanation cannot drift from the answer.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from matching.engine import (
    QTY_COUNTED,
    QTY_NO_PLANNED_QTY,
    QTY_NO_QUANTITY,
    QTY_TAG_DIGITS,
    QTY_UNITLESS,
    QTY_UOM_MISMATCH,
    classify_quantity,
)
from server.db import Activity, Job, LinkedEvent
from server.quantity_ledger import (
    BASIS_COUNTED,
    BASIS_DERIVED_FROM_PERCENTAGE,
    BASIS_UNATTRIBUTED,
    ledger,
)


@pytest.fixture(autouse=True)
def _clean(db_session):
    db_session.query(LinkedEvent).delete()
    db_session.query(Job).delete()
    db_session.commit()
    yield
    db_session.query(LinkedEvent).delete()
    db_session.query(Job).delete()
    db_session.commit()


def _job(db, name="civil_progress.xlsx"):
    job = Job(id=str(uuid.uuid4()), filename=name, file_type="xlsx",
              status="completed")
    db.add(job)
    db.flush()
    return job


def _event(db, job, activity_id, *, quantity=None, uom=None, percentage=None,
           tags="", reported_date=date(2026, 8, 1), row=None, span="x"):
    event = LinkedEvent(
        id=str(uuid.uuid4()),
        job_id=job.id,
        activity_id=activity_id,
        source_file=job.filename,
        source_row=row,
        source_span=span,
        raw_text=span,
        tags=tags,
        quantity=quantity,
        uom=uom,
        percentage=percentage,
        reported_date=reported_date,
        confidence=0.95,
    )
    db.add(event)
    return event


def _quantified(db, activity_id, planned_qty, uom, actual_qty=None):
    act = db.query(Activity).filter(Activity.activity_id == activity_id).first()
    act.planned_qty = planned_qty
    act.uom = uom
    act.actual_qty = actual_qty
    return act


# ── The shared classifier ───────────────────────────────────────────────────

class TestClassifyQuantityIsTheOneRule:
    """Extracted from `RollupAccumulator.add` so the ledger explains the
    accumulation with the rules that produced it, rather than a second copy
    that can drift (D-048)."""

    def test_a_matching_unit_is_counted(self):
        counted, code, note = classify_quantity(34, "m", [], 120, "m")
        assert (counted, code) == (34, QTY_COUNTED)
        assert note == "+34 m"

    def test_a_mismatched_unit_is_refused(self):
        counted, code, note = classify_quantity(1.2, "km", [], 1200, "m")
        assert counted is None
        assert code == QTY_UOM_MISMATCH
        assert "uom mismatch" in note

    def test_a_unitless_quantity_is_refused(self):
        """A model reading "All 12 pockets grouted" returns 12 with no unit,
        and against a 48 m3 node that would silently register 25%."""
        counted, code, _ = classify_quantity(12, None, [], 48, "m3")
        assert counted is None
        assert code == QTY_UNITLESS

    def test_tag_digits_are_refused(self):
        counted, code, _ = classify_quantity(1001, "nos", ["P-1001"], 12, "nos")
        assert counted is None
        assert code == QTY_TAG_DIGITS

    def test_a_node_with_no_planned_quantity_yields_nothing(self):
        counted, code, _ = classify_quantity(40, "m3", [], 0, "m3")
        assert counted is None
        assert code == QTY_NO_PLANNED_QTY

    def test_no_quantity_is_not_a_refusal(self):
        """Nothing was refused - there was nothing to refuse. The ledger counts
        these separately so a silent event is never presented as a rejection."""
        counted, code, _ = classify_quantity(None, "m", [], 120, "m")
        assert counted is None
        assert code == QTY_NO_QUANTITY


# ── The ledger ──────────────────────────────────────────────────────────────

class TestTheLedgerExplainsTheTotal:
    def test_counted_readings_account_for_the_stored_total(self, db_session):
        act = _quantified(db_session, "CIV-SIT-1001", 1200, "m", actual_qty=800)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=500, uom="m", row=3)
        _event(db_session, job, act.activity_id, quantity=300, uom="m", row=7)
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["counted_total"] == 800
        assert d["totals_agree"] is True
        assert d["stored_total_basis"] == BASIS_COUNTED
        assert d["percent_complete_from_quantity"] == pytest.approx(66.7)
        assert d["counted_events"] == 2

    def test_every_contribution_carries_its_citation(self, db_session):
        act = _quantified(db_session, "CIV-SIT-1001", 1200, "m", actual_qty=500)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=500, uom="m", row=18,
               span="Cable pulling Zone A - 500 m")
        db_session.commit()

        c = ledger(db_session, act.activity_id)["contributions"][0]
        assert c["source_file"] == "civil_progress.xlsx"
        assert c["source_row"] == 18
        assert c["source_span"] == "Cable pulling Zone A - 500 m"
        assert c["counted"] is True

    def test_a_refused_reading_is_shown_with_its_reason(self, db_session):
        """The point of the ledger. This is `ELE-CBL-1076` on the real corpus:
        a second reading of 1.2 km against a node planned in metres, refused,
        and invisible to anyone before this."""
        act = _quantified(db_session, "CIV-SIT-1001", 1200, "m", actual_qty=800)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=800, uom="m")
        _event(db_session, job, act.activity_id, quantity=1.2, uom="km")
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["counted_events"] == 1
        assert d["refused_events"] == 1
        refused = [c for c in d["contributions"] if not c["counted"]][0]
        assert refused["reason_code"] == QTY_UOM_MISMATCH
        assert "1.2" in refused["reason"]
        # And it did not quietly join the total.
        assert d["counted_total"] == 800

    def test_an_event_with_no_quantity_is_not_counted_as_a_refusal(
            self, db_session):
        act = _quantified(db_session, "CIV-SIT-1001", 1200, "m", actual_qty=0)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=None, percentage=50.0)
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["refused_events"] == 0
        assert d["events_without_quantity"] == 1

    def test_an_unknown_activity_is_none(self, db_session):
        assert ledger(db_session, "NOT-AN-ACTIVITY") is None


class TestTheTotalIsAMaximumAcrossIngests:
    """The schedule writes `actual_qty = max(current, rolled-up installed)`, so
    two ingests reporting the same work leave the LARGER accumulation, not
    their sum. A ledger that summed across ingests would report a disagreement
    it does not have - the first version of this module did exactly that."""

    def test_the_same_work_reported_twice_does_not_double(self, db_session):
        act = _quantified(db_session, "CIV-SIT-1001", 120, "m3", actual_qty=180)
        first, second = _job(db_session, "a.xlsx"), _job(db_session, "b.txt")
        _event(db_session, first, act.activity_id, quantity=120, uom="m3")
        _event(db_session, second, act.activity_id, quantity=180, uom="m3")
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["counted_total"] == 180        # the larger ingest
        assert d["naive_sum_all_jobs"] == 300   # both added together
        assert d["reported_by_jobs"] == 2
        assert d["totals_agree"] is True

    def test_an_over_report_is_visible_uncapped(self, db_session):
        """`CIV-FDN-1008`: 180 of a planned 120 m3, because a backfilling
        quantity landed on a concreting node. D-084 caps this for earned
        value; the ledger shows the raw figure so the mis-link is findable."""
        act = _quantified(db_session, "CIV-SIT-1001", 120, "m3", actual_qty=180)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=180, uom="m3")
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["percent_complete_from_quantity"] == 100.0
        assert d["raw_percent_from_quantity"] == 150.0


class TestNotEveryStoredQuantityIsAMeasurement:
    """`_apply_rollup_to_schedule` back-derives a quantity from an asserted
    percentage when no reading was counted. On the seeded corpus 28 of 120
    activities hold such a number, and the ledger has to say so rather than
    report a disagreement."""

    def test_a_percentage_derived_total_is_named_as_one(self, db_session):
        # PIP-SPL-1025: 18 of 18 nos stored, no quantity on any event.
        act = _quantified(db_session, "CIV-SIT-1001", 18, "nos", actual_qty=18)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=None, percentage=100.0)
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["counted_total"] == 0
        assert d["stored_actual_qty"] == 18
        assert d["stored_total_basis"] == BASIS_DERIVED_FROM_PERCENTAGE
        # Not reported as a fault: the schedule is holding exactly what the
        # write rule says it should.
        assert d["totals_agree"] is False

    def test_a_total_neither_counted_nor_derived_is_unattributed(
            self, db_session):
        """`PIP-SPL-1026` on the real corpus: 8 nos counted in one ingest, 12
        stored from a percentage-derived write in another. Both mechanisms on
        one node, and neither explains the total on its own."""
        act = _quantified(db_session, "CIV-SIT-1001", 12, "nos", actual_qty=12)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=8, uom="nos")
        _event(db_session, job, act.activity_id, quantity=None, percentage=100.0)
        db_session.commit()

        d = ledger(db_session, act.activity_id)
        assert d["counted_total"] == 8
        assert d["stored_total_basis"] == BASIS_UNATTRIBUTED


class TestTheEndpoint:
    def test_it_returns_the_ledger(self, client, db_session):
        act = _quantified(db_session, "CIV-SIT-1001", 1200, "m", actual_qty=800)
        job = _job(db_session)
        _event(db_session, job, act.activity_id, quantity=800, uom="m", row=3)
        _event(db_session, job, act.activity_id, quantity=1.2, uom="km", row=9)
        db_session.commit()

        body = client.get(f"/activity/{act.activity_id}/quantity").json()
        assert body["counted_total"] == 800
        assert body["counted_events"] == 1
        assert body["refused_events"] == 1
        assert len(body["contributions"]) == 2
        # The caveats travel in the payload, not only in the docs.
        assert "max(current" in body["total_note"]
        assert "decision, not a gap" in body["refusal_note"]

    def test_an_unknown_activity_is_404(self, client, db_session):
        assert client.get("/activity/NOPE/quantity").status_code == 404
