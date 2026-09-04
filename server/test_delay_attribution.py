"""Delay attribution: derived rows, planner rulings, totals, and the report.

Phases 1 to 3 of the Contractor Dispute Shield (D-077, D-078, D-079). These
assert the five properties the feature stands or falls on:

  1. A `DelayEvent` is derived from the audit trail and re-derives cleanly.
     Running the sync twice must not double the rows, because it runs on every
     ingest and a duplicated delay is a duplicated claim.
  2. Derived fields track the schedule. `impact_days` moves when an activity's
     variance moves.
  3. Proposals and findings are never mixed. A row nobody has ruled on stays
     out of `adjudicated_days`.
  4. A ruling is audited, not merely stored, and a second ruling appends
     rather than overwrites - an overturned decision has to read as one.
  5. The exported report carries its provenance and its own caveats. A
     document that cannot name the schedule it was computed against, or that
     presents a proposal as a finding, is worse than no document.
"""

from __future__ import annotations

import csv
import io
import sys
import uuid
from datetime import date, datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, AuditRecord, BaselineVersion, DelayEvent
from server import delay_report
from server.delay_events import attribution, sync_delay_events
from server.delay_taxonomy import DelayCategory, Liability
from server.main import DATA_DATE


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


def escape_free(text: str) -> str:
    """The rendered form of a span in the HTML report.

    The report escapes its content, so a test looking for the raw sentence has
    to look for the escaped one. Nothing in these spans needs escaping today;
    this keeps the assertion honest if one ever does.
    """
    from html import escape

    return escape(text.strip())


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


class TestAdjudication:
    """POST /delay/{id}/classify — the step that turns a proposal into a finding.

    D-009 applied to liability instead of dates: nothing the machine proposes
    counts until a planner rules, and the ruling is audited rather than merely
    stored.
    """

    def _one_event(self, db, span=RIG, days=21):
        act = db.query(Activity).first().activity_id
        _slip(db, act, days)
        _audit(db, activity_id=act, field="actual_finish", span=span)
        db.commit()
        sync_delay_events(db)
        db.commit()
        return db.query(DelayEvent).one()

    def test_a_ruling_is_recorded_and_audited(self, client, db_session):
        row = self._one_event(db_session)
        before = db_session.query(AuditRecord).count()

        body = client.post(
            f"/delay/{row.id}/classify",
            json={
                "liability": "COMPENSABLE",
                "note": "Rig was owner-supplied under this package.",
                "adjudicated_by": "Priya Das",
            },
        ).json()

        assert body["liability_final"] == Liability.COMPENSABLE.value
        assert body["liability_proposed"] == Liability.NON_COMPENSABLE.value
        assert body["overrides_proposal"] is True
        assert body["audit_records_created"] == 1
        assert db_session.query(AuditRecord).count() == before + 1

    def test_the_audit_row_says_what_it_replaced(self, client, db_session):
        """Setting the column alone would leave the register saying WHAT was
        decided and never who, when, or against what."""
        row = self._one_event(db_session)

        client.post(f"/delay/{row.id}/classify",
                    json={"liability": "EXCUSABLE", "adjudicated_by": "Priya Das"})

        audit = (db_session.query(AuditRecord)
                 .filter(AuditRecord.field_changed == "delay_liability").one())
        assert audit.old_value == Liability.NON_COMPENSABLE.value
        assert audit.new_value == Liability.EXCUSABLE.value
        assert audit.source == "planner_review"
        assert audit.auto_applied is False
        # The citation travels onto the ruling, so the decision and the
        # sentence it was made about never come apart.
        assert audit.source_file == "civil_progress.xlsx"
        assert audit.source_span == RIG

    def test_confirming_the_proposal_is_still_a_ruling(self, client, db_session):
        """There is no "accept" shortcut. A planner who agrees types the same
        value, and the trail then shows a human agreed rather than a default
        nobody read."""
        row = self._one_event(db_session)

        body = client.post(f"/delay/{row.id}/classify",
                           json={"liability": "NON_COMPENSABLE"}).json()

        assert body["overrides_proposal"] is False
        assert "confirming the proposal" in body["message"]
        db_session.expire_all()
        assert db_session.query(DelayEvent).one().liability_final == (
            Liability.NON_COMPENSABLE.value)

    def test_a_second_ruling_appends_rather_than_overwrites(self, client, db_session):
        """Evidence arrives late. An overturned decision must read as an
        overturned decision, not as a value that quietly changed (D-004)."""
        row = self._one_event(db_session)

        client.post(f"/delay/{row.id}/classify", json={"liability": "EXCUSABLE"})
        body = client.post(f"/delay/{row.id}/classify",
                           json={"liability": "COMPENSABLE"}).json()

        assert body["liability_previous"] == Liability.EXCUSABLE.value
        audits = (db_session.query(AuditRecord)
                  .filter(AuditRecord.field_changed == "delay_liability").all())
        assert len(audits) == 2
        # The second names the first as what it replaced, not the proposal.
        pairs = {(a.old_value, a.new_value) for a in audits}
        assert (Liability.NON_COMPENSABLE.value, Liability.EXCUSABLE.value) in pairs
        assert (Liability.EXCUSABLE.value, Liability.COMPENSABLE.value) in pairs

    def test_the_ruling_moves_the_totals(self, client, db_session):
        row = self._one_event(db_session)

        client.post(f"/delay/{row.id}/classify", json={"liability": "COMPENSABLE"})

        body = client.get("/delay/attribution").json()
        assert body["adjudicated_events"] == 1
        assert body["adjudicated_days"][Liability.COMPENSABLE.value] == 21
        assert body["adjudicated_days"][Liability.NON_COMPENSABLE.value] == 0
        assert body["events"][0]["adjudicated"] is True
        # The proposal stays visible beside the ruling, so an override reads as
        # an override for as long as the row exists.
        assert body["events"][0]["liability_proposed"] == (
            Liability.NON_COMPENSABLE.value)

    def test_an_unknown_liability_is_refused(self, client, db_session):
        """A planner's ruling is the one value in this system a human types
        directly. Coercing an unrecognised string to CONTESTED would record a
        decision nobody made."""
        row = self._one_event(db_session)

        response = client.post(f"/delay/{row.id}/classify",
                               json={"liability": "PROBABLY_THEIRS"})
        assert response.status_code == 400
        assert "not a liability" in response.json()["detail"]
        assert db_session.query(AuditRecord).filter(
            AuditRecord.field_changed == "delay_liability").count() == 0

    def test_an_unknown_delay_event_is_404(self, client, db_session):
        response = client.post("/delay/no-such-id/classify",
                               json={"liability": "EXCUSABLE"})
        assert response.status_code == 404


class TestTheReport:
    """GET /delay/report — the document that leaves the application.

    The report is the deliverable; everything before it is machinery. These
    assert the three things that make it a document rather than a dump: it
    names the schedule it was computed against, every figure carries its
    citation, and it states its own limits on its face.
    """

    def _baseline(self, db, sha="a1b2c3d4e5f60718293a4b5c6d7e8f90"):
        """Record an active baseline.

        `conftest` seeds activities straight into the table, so a test database
        has no BaselineVersion row at all. That is realistic for a fixture and
        wrong for this test: the report's whole provenance claim is that it
        names the schedule it was computed against, so the row has to exist for
        the assertion to mean anything.
        """
        db.query(BaselineVersion).delete()
        db.add(BaselineVersion(
            id=str(uuid.uuid4()),
            name="OIL Well-Site Duliajan v1",
            filename="baseline_schedule.json",
            sha256=sha,
            activity_count=db.query(Activity).count(),
            source_format="json",
            is_active=True,
            source="seed",
        ))
        db.commit()
        return sha

    def _corpus(self, db):
        """Two delays: one ruled against the proposal, one left as a proposal."""
        civil = db.query(Activity).filter(
            Activity.discipline == "civil").first().activity_id
        piping = db.query(Activity).filter(
            Activity.discipline == "piping").first().activity_id
        _slip(db, civil, 21, finish=date(2026, 9, 2))
        _slip(db, piping, 4, finish=date(2026, 7, 14))
        _audit(db, activity_id=civil, field="actual_finish", span=FENCE, row=18)
        _audit(db, activity_id=piping, field="actual_finish", span=RIG, row=7)
        db.commit()
        sync_delay_events(db)
        db.commit()
        return civil, piping

    def test_the_html_names_the_schedule_it_was_computed_against(
            self, client, db_session):
        """Two baselines ship and they share no activity ids, so a figure
        quoted without the baseline sha256 and the data date is
        unattributable."""
        sha = self._baseline(db_session)
        self._corpus(db_session)

        body = client.get("/delay/report").text

        assert "Delay Attribution Report" in body
        assert str(DATA_DATE) in body
        assert sha in body
        assert "baseline_schedule.json" in body
        # Sample size, stated before anyone asks for it.
        assert "activities carry actual dates" in body

    def test_it_says_so_when_no_baseline_is_recorded(self, client, db_session):
        """A test database seeds activities with no baseline row, and so could
        a hand-built one. The report says "not recorded" rather than printing
        an empty field that reads like a rendering bug."""
        db_session.query(BaselineVersion).delete()
        db_session.commit()
        self._corpus(db_session)

        body = client.get("/delay/report").text
        assert "not recorded" in body

    def test_every_figure_carries_its_citation(self, client, db_session):
        self._corpus(db_session)

        body = client.get("/delay/report").text

        assert "civil_progress.xlsx" in body
        assert "row 18" in body
        # The sentence itself, not a paraphrase of it.
        assert escape_free(FENCE) in body

    def test_it_states_its_own_limits(self, client, db_session):
        """A reader who has to discover the caveats from the source code will
        not trust anything else on the page either."""
        self._corpus(db_session)

        body = client.get("/delay/report").text

        assert "attributed, not measured" in body
        assert "upper bound" in body
        assert "proposal" in body.lower()
        assert "no user authentication" in body

    def test_an_unruled_row_is_marked_as_a_proposal(self, client, db_session):
        self._corpus(db_session)

        body = client.get("/delay/report").text

        assert "no planner ruling" in body.lower()

    def test_a_ruling_appears_with_its_reason_and_who_made_it(
            self, client, db_session):
        self._corpus(db_session)
        fence = db_session.query(DelayEvent).filter(
            DelayEvent.phrase == "fencing conflict").one()

        client.post(f"/delay/{fence.id}/classify", json={
            "liability": "COMPENSABLE",
            "note": "Fence handover was an owner obligation on this package.",
            "adjudicated_by": "Priya Das",
        })

        body = client.get("/delay/report").text
        assert "Ruled by Priya Das" in body
        assert "overriding the proposed CONTESTED" in body
        assert "owner obligation on this package" in body

    def test_an_empty_bucket_says_so_rather_than_vanishing(
            self, client, db_session):
        """A missing section reads as an oversight. An explicit "none on this
        evidence" reads as a finding, which is what it is."""
        self._corpus(db_session)

        body = client.get("/delay/report").text

        assert "Compensable" in body
        assert "No delays attributed here on this evidence." in body

    def test_the_csv_repeats_the_stamp_on_every_row(self, client, db_session):
        """RFC 4180 has no comment syntax, so the provenance travels as
        columns. A row pasted into an email still names its schedule."""
        sha = self._baseline(db_session)
        self._corpus(db_session)

        response = client.get("/delay/report?format=csv")
        assert response.headers["content-type"].startswith("text/csv")
        assert "navis-delay-attribution" in response.headers["content-disposition"]

        rows = list(csv.DictReader(io.StringIO(response.text)))
        assert len(rows) == 2
        for row in rows:
            assert row["data_date"] == str(DATA_DATE)
            assert row["baseline_sha256"] == sha
            assert row["source_file"] == "civil_progress.xlsx"

    def test_the_csv_carries_the_ruling_and_the_proposal_side_by_side(
            self, client, db_session):
        """An override has to be readable as an override in the export too,
        not only in the HTML."""
        self._corpus(db_session)
        fence = db_session.query(DelayEvent).filter(
            DelayEvent.phrase == "fencing conflict").one()
        client.post(f"/delay/{fence.id}/classify",
                    json={"liability": "COMPENSABLE", "adjudicated_by": "Priya Das"})

        rows = {r["phrase"]: r for r in csv.DictReader(
            io.StringIO(client.get("/delay/report?format=csv").text))}

        ruled = rows["fencing conflict"]
        assert ruled["adjudicated"] == "yes"
        assert ruled["liability_proposed"] == Liability.CONTESTED.value
        assert ruled["liability_ruled"] == Liability.COMPENSABLE.value
        assert ruled["liability_effective"] == Liability.COMPENSABLE.value
        assert ruled["adjudicated_by"] == "Priya Das"

        unruled = rows["piling rig breakdown"]
        assert unruled["adjudicated"] == "no"
        assert unruled["liability_ruled"] == ""

    def test_it_filters_by_discipline(self, client, db_session):
        self._corpus(db_session)

        rows = list(csv.DictReader(io.StringIO(
            client.get("/delay/report?format=csv&discipline=piping").text)))
        assert len(rows) == 1
        assert rows[0]["discipline"] == "piping"

    def test_an_unsupported_format_is_refused(self, client, db_session):
        response = client.get("/delay/report?format=pdf")
        assert response.status_code == 400
        assert "html or csv" in response.json()["detail"]

    def test_the_two_formats_agree_on_the_totals(self, client, db_session):
        """One computation, two renderings. A CSV and a document that
        disagreed about a total would be worse than either alone."""
        self._corpus(db_session)

        matrix = client.get("/delay/attribution").json()
        rows = list(csv.DictReader(io.StringIO(
            client.get("/delay/report?format=csv").text)))

        assert len(rows) == matrix["total_events"]
        csv_days = sum(int(r["impact_days"]) for r in rows)
        assert csv_days == sum(matrix["proposed_days"].values())


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
