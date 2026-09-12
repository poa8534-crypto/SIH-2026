"""Evaluation of the duration-suggestion feature.

The system suggests how long an activity type really takes, derived from
observed actuals. Until this module existed nobody had measured whether
those suggestions beat the baseline plan. This module scores a predictor
against actual_mean_days per activity type, using the baseline plan as the
default predictor so there is always a reference point to beat.

Every figure is reported with its n. Rows that cannot be scored are never
dropped silently: each is counted under an explicit exclusion reason.
"""
from __future__ import annotations

from typing import Callable, Optional, Sequence

from evalstats import bootstrap_ci, mae, r2, rmse

# R2 below this sample size is not reported. With 1-3 completed instances per
# activity type (the common case in this dataset) R2 swings between wildly
# positive and wildly negative on the movement of a single point, and a
# bootstrap over so few points mostly resamples duplicates. Eight is the
# smallest n at which the bootstrap distribution of R2 stops being dominated
# by exact-duplicate resamples and a reported value says something about the
# predictor rather than the sample.
MIN_N_FOR_R2 = 8

# A bootstrap over a single item returns the point estimate as both bounds,
# which would present a meaningless interval as a tight one.
MIN_N_FOR_CI = 2

Predictor = Callable[[dict], Optional[float]]


def baseline_planned_mean(row: dict) -> Optional[float]:
    """Default predictor: the baseline plan's mean duration for the activity type.

    WHY: a duration model is only worth having if it beats the plan we
    already have. Scoring the plan itself gives the number to beat.
    """
    value = row.get("planned_mean_days")
    if value is None:
        return None
    return float(value)


def _to_float(value: object) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _metric_entry(
    pairs: Sequence[tuple[float, float]],
    statistic: Callable[[Sequence[tuple[float, float]]], Optional[float]],
    min_n: int,
    below_min_note: str,
    undefined_note: str,
) -> dict:
    n = len(pairs)
    if n == 0:
        return {"value": None, "ci": None, "n": 0, "note": "no scored rows"}
    if n < min_n:
        return {"value": None, "ci": None, "n": n, "note": below_min_note}
    value = statistic(pairs)
    if value is None:
        return {"value": None, "ci": None, "n": n, "note": undefined_note}
    if n < MIN_N_FOR_CI:
        return {"value": value, "ci": None, "n": n,
                "note": f"n < MIN_N_FOR_CI ({MIN_N_FOR_CI}); bootstrap CI not meaningful"}
    ci = bootstrap_ci(pairs, statistic)
    return {"value": value, "ci": ci, "n": n, "note": None}


def evaluate_duration_predictions(rows: Sequence[dict], predictor: Optional[Predictor] = None) -> dict:
    """Score a duration predictor against observed actual_mean_days per activity type.

    WHY these metrics: MAE is the typical miss in days a planner feels; RMSE
    exposes whether a few huge misses dominate; R2 says whether the predictor
    beats guessing the mean actual at all. Each carries a bootstrap CI because
    the per-type sample sizes are tiny and a point estimate alone would
    overstate what we know.

    Exclusions (all counted, none silent):
      no_actuals     actuals_count == 0 (or missing): nothing to score against
      no_prediction  predictor returned None for the row
      malformed      actual_mean_days missing or non-numeric

    R2 is withheld (None) when n < MIN_N_FOR_R2; see that constant.
    """
    if predictor is None:
        predictor = baseline_planned_mean
        predictor_name = "planned_mean_days (baseline plan)"
    else:
        predictor_name = getattr(predictor, "__name__", "custom predictor")

    excluded = {"no_actuals": 0, "no_prediction": 0, "malformed": 0}
    pairs: list[tuple[float, float]] = []
    scored_types: list[str] = []

    for row in rows:
        if not isinstance(row, dict):
            excluded["malformed"] += 1
            continue
        actuals_count = _to_float(row.get("actuals_count"))
        if actuals_count is None or actuals_count <= 0:
            excluded["no_actuals"] += 1
            continue
        actual = _to_float(row.get("actual_mean_days"))
        if actual is None:
            excluded["malformed"] += 1
            continue
        predicted = _to_float(predictor(row))
        if predicted is None:
            excluded["no_prediction"] += 1
            continue
        pairs.append((predicted, actual))
        scored_types.append(str(row.get("activity_type", "")))

    n_scored = len(pairs)
    n_excluded = sum(excluded.values())

    metrics = {
        "rmse": _metric_entry(pairs, rmse, 1, "", "rmse undefined"),
        "mae": _metric_entry(pairs, mae, 1, "", "mae undefined"),
        "r2": _metric_entry(
            pairs, r2, MIN_N_FOR_R2,
            f"n < MIN_N_FOR_R2 ({MIN_N_FOR_R2}); R2 withheld",
            "actual values have zero variance; R2 undefined",
        ),
    }

    return {
        "predictor": predictor_name,
        "n_input": len(rows),
        "n_scored": n_scored,
        "n_excluded": n_excluded,
        "excluded": excluded,
        "activity_types_scored": scored_types,
        "metrics": metrics,
        "min_n_for_r2": MIN_N_FOR_R2,
        "min_n_for_ci": MIN_N_FOR_CI,
    }


def format_duration_report(result: dict) -> str:
    """Render evaluate_duration_predictions output as a fixed-width CLI table.

    WHY n is printed on every line: a reader scanning the table must not be
    able to separate a figure from the sample size that qualifies it.
    """
    ex = result["excluded"]
    metrics = result["metrics"]
    lines = [
        "DURATION PREDICTION EVALUATION",
        f"predictor : {result['predictor']}",
        f"rows in   : {result['n_input']:>6}",
        f"scored    : {result['n_scored']:>6}",
        (f"excluded  : {result['n_excluded']:>6}  "
         f"(no_actuals={ex['no_actuals']}, no_prediction={ex['no_prediction']}, "
         f"malformed={ex['malformed']})"),
        "",
        f"{'metric':<6} {'value':>10} {'95% CI':>22} {'n':>5}  note",
        "-" * 64,
    ]
    for name in ("rmse", "mae", "r2"):
        entry = metrics[name]
        value = "n/a" if entry["value"] is None else f"{entry['value']:.4f}"
        if entry["ci"] is None:
            ci = "n/a"
        else:
            ci = f"[{entry['ci'][0]:.4f}, {entry['ci'][1]:.4f}]"
        note = entry["note"] or ""
        lines.append(f"{name:<6} {value:>10} {ci:>22} {entry['n']:>5}  {note}".rstrip())
    return "\n".join(lines)
