from __future__ import annotations

import pytest

from evalduration import (
    MIN_N_FOR_CI,
    MIN_N_FOR_R2,
    evaluate_duration_predictions,
    format_duration_report,
)


def _row(at: str, planned: float, actual, actuals_count: int = 1) -> dict:
    return {
        "activity_type": at,
        "count": actuals_count or 1,
        "actuals_count": actuals_count,
        "planned_mean_days": planned,
        "actual_mean_days": actual,
        "planned_min_days": planned,
        "planned_max_days": planned,
    }


# Known set (planned -> actual): 10->12, 20->18, 30->33
# errors: +2, -2, +3 ; squares 4, 4, 9 ; mean 17/3 ; rmse = sqrt(17/3)
# mae = (2+2+3)/3 = 7/3
# n=3 < MIN_N_FOR_R2 -> r2 withheld
# plus one row with actuals_count=0 -> excluded no_actuals=1
KNOWN = [
    _row("CIV-A", 10.0, 12.0),
    _row("CIV-B", 20.0, 18.0),
    _row("CIV-C", 30.0, 33.0),
    _row("CIV-Z", 9.0, None, actuals_count=0),
]


def test_known_set_metrics_and_exclusions():
    res = evaluate_duration_predictions(KNOWN)
    assert res["n_input"] == 4
    assert res["n_scored"] == 3
    assert res["n_excluded"] == 1
    assert res["excluded"] == {"no_actuals": 1, "no_prediction": 0, "malformed": 0}
    assert res["metrics"]["rmse"]["value"] == pytest.approx((17 / 3) ** 0.5)
    assert res["metrics"]["mae"]["value"] == pytest.approx(7 / 3)
    assert res["metrics"]["rmse"]["n"] == 3
    assert res["metrics"]["mae"]["n"] == 3
    assert res["metrics"]["r2"]["value"] is None
    assert res["metrics"]["r2"]["ci"] is None
    assert res["metrics"]["r2"]["n"] == 3
    assert "MIN_N_FOR_R2" in res["metrics"]["r2"]["note"]


def test_ci_present_for_rmse_and_mae():
    res = evaluate_duration_predictions(KNOWN)
    for name in ("rmse", "mae"):
        ci = res["metrics"][name]["ci"]
        assert ci is not None
        lo, hi = ci
        assert isinstance(lo, float) and isinstance(hi, float)
        assert lo <= hi


def test_r2_reported_at_or_above_min_n_with_perfect_predictor():
    assert MIN_N_FOR_R2 == 8
    rows = [_row(f"T-{i}", 10.0 + 2 * i, 10.0 + 2 * i) for i in range(MIN_N_FOR_R2)]
    res = evaluate_duration_predictions(rows)
    assert res["metrics"]["r2"]["value"] == pytest.approx(1.0)
    assert res["metrics"]["r2"]["n"] == MIN_N_FOR_R2


def test_r2_none_on_zero_variance_even_with_enough_rows():
    rows = [_row(f"T-{i}", 10.0 + i, 15.0) for i in range(MIN_N_FOR_R2)]
    res = evaluate_duration_predictions(rows)
    assert res["metrics"]["r2"]["value"] is None
    assert "variance" in res["metrics"]["r2"]["note"]


def test_empty_input():
    res = evaluate_duration_predictions([])
    assert res["n_input"] == 0
    assert res["n_scored"] == 0
    for name in ("rmse", "mae", "r2"):
        assert res["metrics"][name]["value"] is None
        assert res["metrics"][name]["ci"] is None
        assert res["metrics"][name]["n"] == 0


def test_single_row_has_value_but_no_ci():
    assert MIN_N_FOR_CI == 2
    res = evaluate_duration_predictions([_row("CIV-APN", 9.0, 32.0)])
    assert res["metrics"]["mae"]["value"] == pytest.approx(23.0)
    assert res["metrics"]["mae"]["ci"] is None
    assert "MIN_N_FOR_CI" in res["metrics"]["mae"]["note"]


def test_custom_predictor_and_no_prediction_exclusion():
    def planned_max(row: dict):
        return None if row["activity_type"] == "CIV-B" else row["planned_max_days"]

    res = evaluate_duration_predictions(KNOWN, predictor=planned_max)
    assert res["predictor"] == "planned_max"
    assert res["n_scored"] == 2
    assert res["excluded"] == {"no_actuals": 1, "no_prediction": 1, "malformed": 0}
    assert res["n_excluded"] == 2
    # rows A (10->12) and C (30->33): errors 2, 3 -> mae 2.5
    assert res["metrics"]["mae"]["value"] == pytest.approx(2.5)


def test_malformed_rows_are_counted_not_dropped():
    rows = KNOWN + [_row("BAD", 5.0, "not-a-number", actuals_count=2), "garbage"]
    res = evaluate_duration_predictions(rows)
    assert res["n_input"] == 6
    assert res["excluded"]["malformed"] == 2
    assert res["n_scored"] + res["n_excluded"] == res["n_input"]


def test_report_contains_counts_and_n_for_every_metric():
    res = evaluate_duration_predictions(KNOWN)
    text = format_duration_report(res)
    assert "rows in   :      4" in text
    assert "scored    :      3" in text
    assert "no_actuals=1" in text
    for name in ("rmse", "mae", "r2"):
        line = next(l for l in text.splitlines() if l.startswith(name))
        assert "3" in line  # n is on every metric line
    r2_line = next(l for l in text.splitlines() if l.startswith("r2"))
    assert "n/a" in r2_line
