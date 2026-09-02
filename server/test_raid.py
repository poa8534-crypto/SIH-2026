"""RAID register — ROADMAP §14 MUST #2, D-048.

The two properties that matter are asserted first and hardest:

  1. a candidate never reaches the register without an explicit human POST;
  2. exposure is arithmetic, and is never accepted from the caller.

Everything else is filters, provenance and lifecycle.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import Activity, AuditRecord, Base, RaidItem
from server.main import app, get_db
from server.raid import RaidValidationError, compute_exposure, propose_candidates, validate

TEST_DB = "sqlite:///dataset/test_raid.db"
_engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
_Session = sessionmaker(bind=_engine)


def _override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def db():
    Base.metadata.create_all(bind=_engine)
    # server/conftest.py installs its own get_db override at import time. Popping
    # ours would delete THAT one too and leave every later test pointed at the
    # real database, so the previous value is saved and put back.
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = _override_get_db
    session = _Session()
    try:
        yield session
    finally:
        session.close()
        if previous is not None:
            app.dependency_overrides[get_db] = previous
        else:
            app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def client(db):
    return TestClient(app)


# ── Exposure is arithmetic ──────────────────────────────────────────────────

class TestExposure:
    def test_exposure_is_the_product(self):
        assert compute_exposure(0.5, 10) == 2.5 * 2      # 5.0
        assert compute_exposure(0.25, 8) == 2.0
        assert compute_exposure(1.0, 3) == 3.0

    def test_zero_impact_is_a_real_zero(self):
        """A risk with no schedule impact scores 0.0 — a measured value."""
        assert compute_exposure(0.9, 0) == 0.0

    def test_unscored_is_none_not_zero(self):
        """None means 'not calculable'. Confusing it with 0.0 would let an
        unscored risk sort as though it had been assessed and found harmless."""
        assert compute_exposure(None, 10) is None
        assert compute_exposure(0.5, None) is None
        assert compute_exposure(None, None) is None

    def test_the_api_computes_it_and_ignores_any_supplied_value(self, client):
        r = client.post("/raid", json={
            "kind": "risk", "title": "Monsoon window",
            "probability": 0.4, "impact_days": 15,
            "exposure": 999.0,          # must be ignored — it is derived
        })
        assert r.status_code == 201, r.text
        assert r.json()["exposure"] == pytest.approx(6.0)

    def test_rescoring_recomputes_exposure(self, client):
        item = client.post("/raid", json={
            "kind": "risk", "title": "Crane availability",
            "probability": 0.5, "impact_days": 10,
        }).json()
        assert item["exposure"] == pytest.approx(5.0)

        patched = client.patch(f"/raid/{item['id']}", json={"probability": 0.8}).json()
        assert patched["exposure"] == pytest.approx(8.0)   # 0.8 x 10, not stale 5.0


# ── A candidate is never auto-committed ─────────────────────────────────────

class TestCandidatesAreNeverAutoCommitted:
    """Mirrors D-009 for dates: the system proposes, a human commits."""

    @pytest.fixture
    def with_delay_evidence(self, db):
        db.add(Activity(
            activity_id="CIV-FDN-1007", wbs_path="1.1", description="Foundation",
            discipline="civil", planned_start=date(2026, 6, 1),
            planned_finish=date(2026, 6, 10), planned_qty=0, uom="",
            predecessors="[]", finish_variance_days=4,
        ))
        for i in range(3):
            db.add(AuditRecord(
                activity_id="CIV-FDN-1007", field_changed="actual_finish",
                new_value="2026-06-14", source="ingest", model_version="v1",
                source_span=f"crane breakdown on day {i}, work stopped",
            ))
        db.commit()

    def test_candidates_are_proposed(self, client, with_delay_evidence):
        body = client.get("/raid/candidates").json()
        assert len(body["candidates"]) >= 1
        c = body["candidates"][0]
        assert "crane breakdown" in c["title"]
        assert c["occurrences"] == 3
        assert "CIV-FDN-1007" in c["linked_activity_ids"]

    def test_proposing_writes_nothing_to_the_register(self, client, with_delay_evidence):
        """The whole rule, in one assertion."""
        assert client.get("/raid").json() == []
        client.get("/raid/candidates")
        client.get("/raid/candidates")          # twice, in case of side effects
        assert client.get("/raid").json() == []

    def test_every_candidate_declares_it_is_uncommitted(self, client, with_delay_evidence):
        body = client.get("/raid/candidates").json()
        assert all(c["committed"] is False for c in body["candidates"])
        assert "None has been written" in body["note"]

    def test_a_candidate_reaches_the_register_only_through_post(
        self, client, with_delay_evidence
    ):
        candidate = client.get("/raid/candidates").json()["candidates"][0]
        assert client.get("/raid").json() == []

        created = client.post("/raid", json={
            "kind": candidate["kind"], "title": candidate["title"],
            "description": candidate["description"], "category": candidate["category"],
            "linked_activity_ids": candidate["linked_activity_ids"],
            "source_kind": candidate["source_kind"], "source_id": candidate["source_id"],
        })
        assert created.status_code == 201
        assert len(client.get("/raid").json()) == 1

    def test_a_committed_cause_is_not_proposed_again(self, client, with_delay_evidence):
        candidate = client.get("/raid/candidates").json()["candidates"][0]
        client.post("/raid", json={
            "kind": "issue", "title": candidate["title"],
            "source_kind": "delay_analysis", "source_id": candidate["source_id"],
        })
        titles = [c["title"] for c in client.get("/raid/candidates").json()["candidates"]]
        assert candidate["title"] not in titles

    def test_candidates_are_issues_not_scored_risks(self, client, with_delay_evidence):
        """A delay that already happened is an issue. Inventing a probability
        for a past event is the fabrication this module exists to avoid."""
        for c in client.get("/raid/candidates").json()["candidates"]:
            assert c["kind"] == "issue"
            assert "probability" not in c
            assert "exposure" not in c

    def test_no_evidence_means_no_candidates(self, client):
        assert client.get("/raid/candidates").json()["candidates"] == []


# ── Validation ──────────────────────────────────────────────────────────────

class TestValidation:
    def test_kind_and_status_are_closed_sets(self):
        with pytest.raises(RaidValidationError):
            validate("opportunity", "open", None, None)
        with pytest.raises(RaidValidationError):
            validate("risk", "in_progress", None, None)

    def test_probability_is_a_probability(self):
        with pytest.raises(RaidValidationError):
            validate("risk", "open", 1.5, 10)
        with pytest.raises(RaidValidationError):
            validate("risk", "open", -0.1, 10)

    def test_scoring_a_non_risk_is_refused_not_silently_dropped(self, client):
        """An issue with a probability is a category error. Discarding the
        number quietly would leave the caller believing it was stored."""
        r = client.post("/raid", json={
            "kind": "issue", "title": "Rebar shortage", "probability": 0.5,
        })
        assert r.status_code == 400
        assert "risk" in r.json()["detail"]

    def test_api_rejects_a_bad_kind_with_the_allowed_set(self, client):
        r = client.post("/raid", json={"kind": "opportunity", "title": "x"})
        assert r.status_code in (400, 422)

    def test_a_title_is_required(self, client):
        r = client.post("/raid", json={"kind": "risk", "title": ""})
        assert r.status_code == 422


# ── Filters and ordering ────────────────────────────────────────────────────

class TestFiltersAndOrdering:
    @pytest.fixture
    def seeded(self, client):
        client.post("/raid", json={"kind": "risk", "title": "Low risk",
                                   "probability": 0.1, "impact_days": 2})       # 0.2
        client.post("/raid", json={"kind": "risk", "title": "High risk",
                                   "probability": 0.9, "impact_days": 20})      # 18.0
        client.post("/raid", json={"kind": "issue", "title": "Open issue",
                                   "linked_activity_ids": ["PIP-ERC-1030"]})
        client.post("/raid", json={"kind": "action", "title": "Chase vendor",
                                   "status": "closed"})
        return client

    def test_filter_by_kind(self, seeded):
        assert len(seeded.get("/raid?kind=risk").json()) == 2
        assert len(seeded.get("/raid?kind=issue").json()) == 1
        assert len(seeded.get("/raid?kind=decision").json()) == 0

    def test_filter_by_status(self, seeded):
        assert len(seeded.get("/raid?status=closed").json()) == 1
        assert len(seeded.get("/raid?status=open").json()) == 3

    def test_filter_by_activity(self, seeded):
        got = seeded.get("/raid?activity_id=PIP-ERC-1030").json()
        assert [i["title"] for i in got] == ["Open issue"]

    def test_unknown_filter_value_is_a_clear_400(self, seeded):
        r = seeded.get("/raid?kind=opportunity")
        assert r.status_code == 400
        assert "risk" in r.json()["detail"]

    def test_scored_risks_lead_and_unscored_do_not_sort_as_zero(self, seeded):
        titles = [i["title"] for i in seeded.get("/raid").json()]
        assert titles[0] == "High risk"      # 18.0
        assert titles[1] == "Low risk"       # 0.2
        # The unscored items follow — they are not treated as exposure 0.
        assert set(titles[2:]) == {"Open issue", "Chase vendor"}


# ── Provenance survives a round trip ────────────────────────────────────────

class TestProvenance:
    def test_the_link_back_to_source_evidence_survives(self, client, db):
        record = AuditRecord(
            activity_id="PIP-ERC-1030", field_changed="actual_finish",
            new_value="2026-09-01", source="ingest", model_version="v1",
            source_span="spool erection delayed, crane breakdown",
            source_file="dpr_day_06.txt",
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        created = client.post("/raid", json={
            "kind": "issue", "title": "Crane breakdown stopped erection",
            "source_kind": "audit_record", "source_id": record.id,
            "linked_activity_ids": ["PIP-ERC-1030"],
        }).json()

        fetched = client.get(f"/raid/{created['id']}").json()
        assert fetched["source_kind"] == "audit_record"
        assert fetched["source_id"] == record.id
        assert fetched["evidence"]["detail"] == "spool erection delayed, crane breakdown"
        assert fetched["evidence"]["source_file"] == "dpr_day_06.txt"
        assert fetched["linked_activity_ids"] == ["PIP-ERC-1030"]

    def test_a_planner_authored_item_has_no_evidence_and_says_so(self, client):
        created = client.post("/raid", json={
            "kind": "decision", "title": "Use 24-inch header throughout",
        }).json()
        assert created["source_kind"] is None
        assert created["evidence"] is None

    def test_a_source_row_that_no_longer_exists_reports_null_not_a_fake(self, client):
        created = client.post("/raid", json={
            "kind": "issue", "title": "Orphaned",
            "source_kind": "audit_record", "source_id": "does-not-exist",
        }).json()
        fetched = client.get(f"/raid/{created['id']}").json()
        assert fetched["source_id"] == "does-not-exist"
        assert fetched["evidence"] is None


# ── Lifecycle ───────────────────────────────────────────────────────────────

class TestLifecycle:
    def test_closing_an_item_dates_it(self, client):
        item = client.post("/raid", json={"kind": "action", "title": "Order steel"}).json()
        assert item["date_closed"] is None
        closed = client.patch(f"/raid/{item['id']}", json={"status": "closed"}).json()
        assert closed["status"] == "closed"
        assert closed["date_closed"] is not None

    def test_rejected_is_distinct_from_closed(self, client):
        """A dismissed risk is not a mitigated one; a register that conflates
        them cannot be audited."""
        item = client.post("/raid", json={"kind": "risk", "title": "Considered"}).json()
        rejected = client.patch(f"/raid/{item['id']}", json={"status": "rejected"}).json()
        assert rejected["status"] == "rejected"

    def test_patch_leaves_absent_fields_alone(self, client):
        item = client.post("/raid", json={
            "kind": "risk", "title": "Original", "owner": "Priya",
            "probability": 0.3, "impact_days": 10,
        }).json()
        patched = client.patch(f"/raid/{item['id']}", json={"title": "Renamed"}).json()
        assert patched["title"] == "Renamed"
        assert patched["owner"] == "Priya"
        assert patched["probability"] == pytest.approx(0.3)
        assert patched["exposure"] == pytest.approx(3.0)

    def test_date_raised_defaults_to_today(self, client):
        item = client.post("/raid", json={"kind": "risk", "title": "Today"}).json()
        assert item["date_raised"] == date.today().isoformat()

    def test_missing_item_is_404(self, client):
        assert client.get("/raid/nope").status_code == 404
        assert client.patch("/raid/nope", json={"title": "x"}).status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
