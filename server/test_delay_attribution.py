"""Delay attribution: derived rows, and the totals built on them.

Phase 1 of the Contractor Dispute Shield (D-077). These assert the three
properties the feature stands or falls on:

  1. A `DelayEvent` is derived from the audit trail and re-derives cleanly.
     Running the sync twice must not double the rows, because it runs on every
     ingest and a duplicated delay is a duplicated claim.
  2. Derived fields track the schedule. `impact_days` moves when an activity's
     variance moves.
  3. Proposals and findings are never mixed. A row nobody has ruled on stays
     out of `adjudicated_days`.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, AuditRecord, DelayEvent
from server.delay_events import attribution, sync_delay_events
from server.delay_taxonomy import DelayCategory, Liability


@pytest.fixture(autouse=True)
def _clean(db_session):
    """Each test owns the evidence it writes.

    The test database is a real file shared across the module and these tests
    assert exact counts - the same reason `test_delay_evidence.py` isolates
    itself.
    """
    db_session.query(DelayEvent).delete()
    db_session.query(AuditRecord).delete()
    db_session.commit()
    yield
    db_session.query(DelayEvent).delete()
    db_session.query(AuditRecord).delete()
    db_session.commit()


def _audit(db, *, activity_id, field, span, file="civil_progress.xlsx",
           line=None, row=None, when=None):
    rec = AuditRecord(
        id=str(uuid.uuid4()),
        activity_id=activity_id,
        timestamp=when or datetime.utcnow(),
        field_changed=field,
        old_value=None,
        new_value="2026-08-01",
        source="matching",
        source_file=file,
        source_line=line,
        source_row=row,
        source_span=span,
        confidence=0.91,
        model_version="test",
        auto_applied=True,
    )
    db.add(rec)
    return rec


def _slip(db, activity_id, days, finish=date(2026, 8, 20)):
    """Give an activity a positive finish variance, the way a roll-up would."""
    act = db.query(Activity).filter(Activity.activity_id == activity_id).first()
    act.actual_finish = finish
    act.finish_variance_days = days
    return act


RIG = "Bored Piling — Pipe Rack — 1 day over, piling rig breakdown"
RAIN = "Tank Foundation — 1 day over, rain delay"
FENCE = "Drainage Channels — Delayed by fencing conflict"


class TestSyncDerivesRowsFromTheAuditTrail:
    def test_one_observation_becomes_one_row(self, db_session):
        """The three audit writes one spreadsheet row produces - actual_start,
        actual_finish and actual_qty - are one delay, not three."""
        act = db_session.query(Activity).first().activity_id
        for field in ("actual_start", "actual_finish", "actual_qty"):
            _audit(db_session, activity_id=act, field=field, span=RIG)
        db_session.commit()

        assert sync_delay_events(db_session) == 1
        db_session.commit()

        rows = db_session.query(DelayEvent).all()
        assert len(rows) == 1
        assert rows[0].phrase == "piling rig breakdown"
        assert rows[0].category == DelayCategory.EQUIPMENT.value
        assert rows[0].liability_proposed == Liability.NON_COMPENSABLE.value

    def test_the_sync_is_idempotent(self, db_session):
        """It runs on every ingest. A second run must update, not duplicate -
        a duplicated delay event is a duplicated claim."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_start", span=RIG)
        db_session.commit()

        sync_delay_events(db_session)
        db_session.commit()
        first = db_session.query(DelayEvent).one().id

        sync_delay_events(db_session)
        db_session.commit()

        assert db_session.query(DelayEvent).count() == 1
        assert db_session.query(DelayEvent).one().id == first

    def test_two_causes_on_one_activity_are_two_rows(self, db_session):
        """Concurrency is the whole point of keying on the phrase as well as
        the activity: one activity can be delayed by two different things."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_start", span=RIG)
        _audit(db_session, activity_id=act, field="actual_finish", span=RAIN)
        db_session.commit()

        sync_delay_events(db_session)
        db_session.commit()

        assert {r.phrase for r in db_session.query(DelayEvent)} == {
            "piling rig breakdown", "rain delay",
        }

    def test_it_cites_the_earliest_audit_row(self, db_session):
        """The citation is the first time the project recorded the claim, not
        whichever of the writes happened to land last."""
        act = db_session.query(Activity).first().activity_id
        first = _audit(db_session, activity_id=act, field="actual_start", span=RIG,
                       when=datetime(2026, 8, 1, 9, 0), row=7)
        _audit(db_session, activity_id=act, field="actual_qty", span=RIG,
               when=datetime(2026, 8, 1, 9, 5), row=None)
        db_session.commit()

        sync_delay_events(db_session)
        db_session.commit()

        row = db_session.query(DelayEvent).one()
        assert row.audit_record_id == first.id
        assert row.source_row == 7


class TestDerivedFieldsTrackTheSchedule:
    def test_impact_days_is_the_activity_finish_slip(self, db_session):
        act = db_session.query(Activity).first().activity_id
        _slip(db_session, act, 21)
        _audit(db_session, activity_id=act, field="actual_finish", span=FENCE)
        db_session.commit()

        sync_delay_events(db_session)
        db_session.commit()

        assert db_session.query(DelayEvent).one().impact_days == 21

    def test_impact_days_moves_when_the_variance_moves(self, db_session):
        """A resolution can change an activity's finish, which is why resolve
        re-syncs. A stale impact figure is a wrong number in a claim."""
        act = db_session.query(Activity).first().activity_id
        _slip(db_session, act, 21)
        _audit(db_session, activity_id=act, field="actual_finish", span=FENCE)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        _slip(db_session, act, 3)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        assert db_session.query(DelayEvent).one().impact_days == 3

    def test_month_is_the_month_the_activity_concluded(self, db_session):
        """The field ARCHITECTURE 2.7 said "enables seasonality" and never
        got. Without it the system cannot answer what monsoon costs on civil
        work."""
        act = db_session.query(Activity).first().activity_id
        _slip(db_session, act, 5, finish=date(2026, 7, 14))
        _audit(db_session, activity_id=act, field="actual_finish", span=RAIN)
        db_session.commit()

        sync_delay_events(db_session)
        db_session.commit()

        assert db_session.query(DelayEvent).one().month == "2026-07"


class TestProposalsAreNotFindings:
    def test_an_unadjudicated_row_stays_out_of_adjudicated_days(self, db_session):
        act = db_session.query(Activity).first().activity_id
        _slip(db_session, act, 21)
        _audit(db_session, activity_id=act, field="actual_finish", span=RIG)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        data = attribution(db_session)
        assert data["total_events"] == 1
        assert data["adjudicated_events"] == 0
        assert data["proposed_days"][Liability.NON_COMPENSABLE.value] == 21
        assert data["adjudicated_days"][Liability.NON_COMPENSABLE.value] == 0

    def test_a_ruling_moves_it_into_the_adjudicated_total(self, db_session):
        act = db_session.query(Activity).first().activity_id
        _slip(db_session, act, 21)
        _audit(db_session, activity_id=act, field="actual_finish", span=RIG)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        # Phase 2 supplies the endpoint; the storage contract holds already.
        row = db_session.query(DelayEvent).one()
        row.liability_final = Liability.EXCUSABLE.value
        row.adjudicated_at = datetime.utcnow()
        db_session.commit()

        data = attribution(db_session)
        assert data["adjudicated_events"] == 1
        assert data["adjudicated_days"][Liability.EXCUSABLE.value] == 21
        assert data["adjudicated_days"][Liability.NON_COMPENSABLE.value] == 0

    def test_a_ruling_survives_a_re_sync(self, db_session):
        """The sync re-derives category and impact on every ingest. If it also
        reset the ruling, a planner's decision would silently vanish the next
        time a file was uploaded."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_finish", span=RIG)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        row = db_session.query(DelayEvent).one()
        row.liability_final = Liability.EXCUSABLE.value
        row.adjudication_note = "Rig was owner-supplied on this package."
        db_session.commit()

        sync_delay_events(db_session)
        db_session.commit()

        row = db_session.query(DelayEvent).one()
        assert row.liability_final == Liability.EXCUSABLE.value
        assert row.adjudication_note == "Rig was owner-supplied on this package."
        # The proposal is still visible beside the ruling, so an override reads
        # as an override.
        assert row.liability_proposed == Liability.NON_COMPENSABLE.value

    def test_every_liability_appears_in_the_totals(self, db_session):
        """A bucket with nothing in it reports zero rather than being absent,
        so a client never has to guess whether a missing key means zero."""
        data = attribution(db_session)
        assert set(data["adjudicated_days"]) == {liability.value for liability in Liability}
        assert set(data["proposed_days"]) == {liability.value for liability in Liability}


class TestTheEndpoint:
    def test_it_returns_the_matrix_with_its_own_caveats(self, client, db_session):
        act = db_session.query(Activity).first().activity_id
        _slip(db_session, act, 21)
        _audit(db_session, activity_id=act, field="actual_finish", span=FENCE)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        body = client.get("/delay/attribution").json()
        assert body["total_events"] == 1
        event = body["events"][0]
        assert event["category"] == DelayCategory.OTHER.value
        assert event["liability_effective"] == Liability.CONTESTED.value
        assert event["adjudicated"] is False
        assert event["source_file"] == "civil_progress.xlsx"
        assert event["source_span"] == FENCE
        # The upper-bound caveat travels in the payload, not only in the docs.
        assert "upper bounds" in body["impact_days_basis"]
        assert "proposals" in body["unadjudicated_note"]

    def test_it_filters_by_discipline(self, client, db_session):
        civil = db_session.query(Activity).filter(
            Activity.discipline == "civil").first().activity_id
        _audit(db_session, activity_id=civil, field="actual_finish", span=RIG)
        db_session.commit()
        sync_delay_events(db_session)
        db_session.commit()

        assert client.get("/delay/attribution?discipline=civil").json()["total_events"] == 1
        assert client.get("/delay/attribution?discipline=piping").json()["total_events"] == 0

    def test_it_writes_nothing(self, client, db_session):
        """A GET that materialises its own answer hides when the work happened
        and makes two identical requests do different amounts of writing."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_finish", span=RIG)
        db_session.commit()

        assert client.get("/delay/attribution").json()["total_events"] == 0
        assert db_session.query(DelayEvent).count() == 0


class TestMemoryQueryCarriesTheClassification:
    def test_delay_reasons_gain_category_and_liability(self, client, db_session):
        """The Memory screen keeps computing at read time - a frequency needs
        no identity - but it now names the same category the attribution rows
        do, from the same deterministic table."""
        act = db_session.query(Activity).first().activity_id
        _audit(db_session, activity_id=act, field="actual_finish", span=RIG)
        db_session.commit()

        reasons = client.get("/memory/query?query_type=delay_reasons").json()["delay_reasons"]
        found = [r for r in reasons if r["reason"] == "piling rig breakdown"]
        assert found, "the shared vocabulary stopped reaching the Memory screen"
        assert found[0]["category"] == DelayCategory.EQUIPMENT.value
        assert found[0]["liability"] == Liability.NON_COMPENSABLE.value
