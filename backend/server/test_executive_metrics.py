"""Tests for the executive oversight payload.

WHY THESE ASSERT VALUES AND NOT KEYS.

The previous version of this file checked that `contractor_ld_risk_cr` was
present in the payload and never what it held. It held 0.0, on every run, for
every corpus, because the module read the delay layer with key names
("EMPLOYER", "CONTRACTOR") that layer has never emitted - so every `.get()`
fell to its default. The endpoint was broken and its test suite was green,
which is the only thing worth learning from that bug.

So the tests below pin values and behaviour: that liability days arrive under
the delay layer's own vocabulary, that no rupee figure appears unless an
operator supplied a contract, that the completion range is three computed
dates rather than percentiles, that the S-curve's history is measured rather
than back-cast, and that nothing here invents a cause, a confidence or a
milestone. See D-090.
"""

import json
from datetime import date, timedelta
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.db import Activity, Base
from server.delay_taxonomy import Liability
from server import executive_metrics
from server.executive_metrics import compute_executive_metrics
from server.main import app, get_db, DATA_DATE

TEST_DB_PATH = Path("dataset/test_executive_metrics.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=test_engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestSession()
    try:
        schedule_path = Path(__file__).resolve().parent.parent.parent / "dataset" / "baseline_schedule.json"
        with open(schedule_path, encoding="utf-8") as f:
            activities = json.load(f)
        for act in activities:
            db.add(
                Activity(
                    activity_id=act["activity_id"],
                    wbs_path=act.get("wbs_path", ""),
                    description=act.get("description", ""),
                    detail=act.get("detail", ""),
                    discipline=act.get("discipline", "unknown"),
                    tag=act.get("tag"),
                    planned_start=date.fromisoformat(act["planned_start"]),
                    planned_finish=date.fromisoformat(act["planned_finish"]),
                    planned_qty=act.get("planned_qty", 0),
                    uom=act.get("uom", ""),
                    predecessors=json.dumps(act.get("predecessors", [])),
                )
            )
        db.commit()
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink(missing_ok=True)
        except OSError:
            pass


def metrics(**kwargs):
    db = TestSession()
    try:
        return compute_executive_metrics(db, as_of=DATA_DATE, **kwargs)
    finally:
        db.close()


class _FakeDelayRow:
    """The fields `compute_executive_metrics` reads off a DelayEvent."""

    def __init__(self, **kw):
        self.activity_id = kw.get("activity_id")
        self.phrase = kw.get("phrase", "client drawing hold")
        self.category = kw.get("category", "DESIGN_CHANGE")
        self.liability_proposed = kw.get("liability_proposed", Liability.COMPENSABLE.value)
        self.liability_final = kw.get("liability_final")
        self.impact_days = kw.get("impact_days", 0)
        self.beyond_float_days = kw.get("beyond_float_days", 0)
        self.on_critical_path = kw.get("on_critical_path", False)
        self.source_file = kw.get("source_file", "dpr_day_11.txt")
        self.source_line = kw.get("source_line", 42)


def _attribution_payload(**overrides):
    """A delay-layer payload keyed the way the delay layer really keys it."""
    payload = {
        "events": [],
        "total_events": 0,
        "adjudicated_events": 0,
        "proposed_days": {liability.value: 0 for liability in Liability},
        "adjudicated_days": {liability.value: 0 for liability in Liability},
        "beyond_float_days": {liability.value: 0 for liability in Liability},
        "adjudicated_beyond_float_days": {liability.value: 0 for liability in Liability},
        "notice_counts": {"SERVED": 0, "OPEN": 0, "LAPSED": 0, "UNKNOWN": 0},
        "concurrency": {"total_pairs": 0, "counts": {}},
        "notice_note": "note",
        "impact_days_basis": "basis",
        "unadjudicated_note": "unadjudicated",
    }
    payload.update(overrides)
    return payload


# ── The bug this module shipped ─────────────────────────────────────────────

def test_liability_days_arrive_under_the_delay_layers_own_key_names(monkeypatch):
    """The regression this file exists for.

    The delay layer keys `proposed_days` by `Liability`. Reading it with
    "EMPLOYER" / "CONTRACTOR" silently produced zeros. If someone reintroduces
    a hand-written key name, these four assertions fail.
    """
    monkeypatch.setattr(
        executive_metrics, "delay_attribution",
        lambda db, as_of=None: _attribution_payload(
            proposed_days={
                Liability.COMPENSABLE.value: 24,
                Liability.NON_COMPENSABLE.value: 8,
                Liability.EXCUSABLE.value: 10,
                Liability.CONTESTED.value: 41,
            },
            beyond_float_days={
                Liability.COMPENSABLE.value: 6,
                Liability.NON_COMPENSABLE.value: 3,
                Liability.EXCUSABLE.value: 0,
                Liability.CONTESTED.value: 0,
            },
        ),
    )

    dispute = metrics()["dispute_shield"]
    assert dispute["employer_delay_days"] == 24
    assert dispute["contractor_delay_days"] == 8
    assert dispute["neutral_delay_days"] == 10
    assert dispute["contested_delay_days"] == 41
    assert dispute["employer_beyond_float_days"] == 6
    assert dispute["contractor_beyond_float_days"] == 3


def test_concurrency_comes_from_the_concurrency_analysis_not_a_liability_bucket(monkeypatch):
    """There is no CONCURRENT liability, and the payload no longer implies one."""
    monkeypatch.setattr(
        executive_metrics, "delay_attribution",
        lambda db, as_of=None: _attribution_payload(
            concurrency={"total_pairs": 5, "counts": {"CONFLICT": 2}},
        ),
    )

    dispute = metrics()["dispute_shield"]
    assert dispute["concurrent_pairs"] == 5
    assert dispute["concurrent_conflicts"] == 2
    assert "concurrent_delay_days" not in dispute


# ── Money ───────────────────────────────────────────────────────────────────

def test_no_contract_value_means_no_rupee_figure_and_a_stated_reason():
    financial = metrics()["financial"]

    assert financial["available"] is False
    assert financial["contract_value_cr"] is None
    assert financial["employer_claim_cr"] is None
    assert financial["contractor_ld_risk_cr"] is None
    # The absence is data, not something a reader has to infer.
    assert "no contract value" in financial["reason"].lower()
    # And the old hardcoded baseline is gone from the module entirely.
    assert not hasattr(executive_metrics, "ESTIMATED_CONTRACT_VALUE_CR")
    assert not hasattr(executive_metrics, "DAILY_PROLONGATION_COST_LAKHS")


def test_supplied_contract_parameters_price_the_days_and_are_labelled(monkeypatch):
    monkeypatch.setattr(
        executive_metrics, "delay_attribution",
        lambda db, as_of=None: _attribution_payload(
            proposed_days={
                Liability.COMPENSABLE.value: 24,
                Liability.NON_COMPENSABLE.value: 14,
                Liability.EXCUSABLE.value: 0,
                Liability.CONTESTED.value: 0,
            },
        ),
    )

    financial = metrics(
        contract_value_cr=180.0, prolongation_lakhs_per_day=12.5
    )["financial"]

    assert financial["available"] is True
    assert financial["basis"] == "operator_supplied"
    # 24 days x 12.5 lakh = 300 lakh = 3.00 Cr.
    assert financial["employer_claim_cr"] == 3.0
    # 14 days = 2 weeks at 0.5% of 180 Cr = 1.80 Cr.
    assert financial["contractor_ld_risk_cr"] == 1.8
    assert "operator" in financial["note"].lower()


def test_a_contract_value_alone_prices_liquidated_damages_but_not_the_claim():
    """Prolongation cost is a separate assumption and is not invented from one."""
    financial = metrics(contract_value_cr=180.0)["financial"]

    assert financial["available"] is True
    assert financial["contractor_ld_risk_cr"] is not None
    assert financial["employer_claim_cr"] is None


def test_liquidated_damages_are_capped_under_fidic_8_7(monkeypatch):
    monkeypatch.setattr(
        executive_metrics, "delay_attribution",
        lambda db, as_of=None: _attribution_payload(
            proposed_days={
                Liability.COMPENSABLE.value: 0,
                Liability.NON_COMPENSABLE.value: 5000,
                Liability.EXCUSABLE.value: 0,
                Liability.CONTESTED.value: 0,
            },
        ),
    )

    financial = metrics(contract_value_cr=180.0)["financial"]
    assert financial["contractor_ld_risk_cr"] == 18.0  # 10% of 180


# ── The completion range ────────────────────────────────────────────────────

def test_the_completion_range_is_three_computed_dates_and_says_it_is_not_probabilistic():
    forecast = metrics()["completion_forecast"]

    for invented in ("p10_finish", "p50_finish", "p90_finish", "monte_carlo_runs"):
        assert invented not in forecast

    assert forecast["is_probabilistic"] is False
    assert forecast["baseline_finish"] is not None
    assert forecast["logic_finish"] is not None
    assert "not percentiles" in forecast["basis"]


def test_exposed_finish_adds_only_open_critical_delay(monkeypatch):
    """Exposure the network has already absorbed must not be counted twice."""
    monkeypatch.setattr(
        executive_metrics, "delay_attribution",
        lambda db, as_of=None: _attribution_payload(
            events=[
                # Counted: critical, and the activity has not finished.
                _FakeDelayRow(activity_id="CIV-SIT-1001", beyond_float_days=9,
                              on_critical_path=True),
                # Not counted: not on the critical path.
                _FakeDelayRow(activity_id="CIV-SIT-1002", beyond_float_days=30,
                              on_critical_path=False),
            ],
        ),
    )

    forecast = metrics()["completion_forecast"]
    assert forecast["open_critical_exposure_days"] == 9
    assert (
        date.fromisoformat(forecast["exposed_finish"])
        == date.fromisoformat(forecast["logic_finish"]) + timedelta(days=9)
    )


def test_the_range_discloses_a_baseline_that_disagrees_with_its_own_logic():
    """`variance_days` is not all progress slip when the ties are broken."""
    forecast = metrics()["completion_forecast"]

    assert forecast["logic_conflicts"] > 0
    assert "broken by its own authored dates" in forecast["logic_conflicts_note"]


# ── The S-curve ─────────────────────────────────────────────────────────────

def test_historical_earned_value_is_measured_from_actual_finishes():
    """No activity here has an actual finish, so no earned value may appear.

    The old back-cast multiplied today's earned value by (elapsed) ** 1.15 and
    therefore drew a rising history out of a corpus with no completed work at
    all.
    """
    payload = metrics()
    history = [pt for pt in payload["s_curve"] if not pt["is_future"]]

    assert history, "expected at least one point at or before the data date"
    assert all(pt["ev_cumulative"] == 0.0 for pt in history)
    assert "0/100" in payload["ev_basis"]


def test_future_points_carry_no_measured_earned_value():
    future = [pt for pt in metrics()["s_curve"] if pt["is_future"]]

    assert future
    assert all(pt["ev_cumulative"] is None for pt in future)


# ── Causes, milestones ──────────────────────────────────────────────────────

def test_the_driving_delay_is_the_recorded_one_with_its_citation(monkeypatch):
    critical_id = None
    db = TestSession()
    try:
        from server.cpm import compute_schedule
        network = compute_schedule(db.query(Activity).all())
        critical_id = next(
            a for a, sched in network.activities.items() if sched.critical
        )
    finally:
        db.close()

    monkeypatch.setattr(
        executive_metrics, "delay_attribution",
        lambda db, as_of=None: _attribution_payload(
            events=[_FakeDelayRow(
                activity_id=critical_id,
                phrase="client drawing hold",
                category="DESIGN_CHANGE",
                impact_days=4,
                source_file="dpr_day_11.txt",
                source_line=42,
            )],
        ),
    )

    drivers = metrics()["critical_drivers"]
    driver = next(d for d in drivers if d["activity_id"] == critical_id)
    assert driver["driving_delay"] == "client drawing hold"
    assert driver["driving_delay_category"] == "DESIGN_CHANGE"
    assert driver["driving_delay_adjudicated"] is False
    assert driver["driving_delay_source"] == "dpr_day_11.txt, line 42"


def test_a_driver_with_no_recorded_cause_is_never_given_one():
    """The old code produced a cause from the activity id prefix."""
    for driver in metrics()["critical_drivers"]:
        if driver["driving_delay"] is None:
            assert driver["driving_delay_category"] is None
        assert driver["driving_delay"] != "Foundation curing & monsoon hold"
        assert driver["driving_delay"] != "Vendor lead time"


def test_milestones_are_derived_from_the_schedule_and_carry_no_confidence():
    payload = metrics()
    milestones = payload["milestones"]

    assert milestones
    for milestone in milestones:
        assert milestone["derived"] is True
        assert milestone["derivation"]
        assert "confidence" not in milestone
        assert milestone["basis"] in {
            "actual_finish", "cpm_early_finish", "cpm_project_finish", "not_scheduled",
        }

    # Every discipline in the baseline gets one, plus the project finish.
    db = TestSession()
    try:
        disciplines = {
            a.discipline for a in db.query(Activity).all()
            if a.discipline and a.planned_finish
        }
    finally:
        db.close()
    assert len(milestones) == len(disciplines) + 1
    assert milestones[-1]["name"] == "Project finish"
    assert "carries no milestone flag" in payload["milestones_note"]


def test_no_milestone_date_is_hardcoded():
    """Four of the five old rows named August and October dates unconditionally."""
    dates = {
        m["baseline_date"] for m in metrics()["milestones"]
    } | {m["forecast_date"] for m in metrics()["milestones"]}

    for invented in ("2026-08-15", "2026-08-22", "2026-09-10", "2026-10-08", "2026-10-22"):
        assert invented not in dates


# ── The endpoint ────────────────────────────────────────────────────────────

def test_api_get_executive_metrics():
    client = TestClient(app)
    response = client.get("/executive/metrics")
    assert response.status_code == 200

    data = response.json()
    assert data["financial"]["available"] is False
    assert data["completion_forecast"]["is_probabilistic"] is False
    assert len(data["s_curve"]) > 0
    assert len(data["milestones"]) > 0


def test_api_accepts_contract_parameters_as_query_arguments():
    client = TestClient(app)
    response = client.get(
        "/executive/metrics",
        params={"contract_value_cr": 180.0, "prolongation_lakhs_per_day": 12.5},
    )
    assert response.status_code == 200

    financial = response.json()["financial"]
    assert financial["available"] is True
    assert financial["contract_value_cr"] == 180.0
    assert financial["basis"] == "operator_supplied"


def test_api_rejects_a_zero_or_negative_contract_value():
    """A zero contract value is a mistake, not a request for zero exposure."""
    client = TestClient(app)
    assert client.get(
        "/executive/metrics", params={"contract_value_cr": 0}
    ).status_code == 422
