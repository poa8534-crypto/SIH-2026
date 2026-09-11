from __future__ import annotations

import pytest

from evalstats import (
    accuracy,
    confusion_counts,
    f1,
    mae,
    precision,
    r2,
    recall,
    rmse,
)


def _o(suggested: bool, correct: bool, gold: bool, discipline: str = "CIV") -> dict:
    return {"discipline": discipline, "suggested": suggested, "correct": correct, "gold_positive": gold}


# Mixed set:
#   1. suggested, correct, gold      -> tp
#   2. suggested, wrong, gold        -> fp AND fn
#   3. not suggested, gold           -> fn
#   4. not suggested, not gold       -> tn
#   5. suggested, correct, gold      -> tp
# tp=2 fp=1 fn=2 tn=1
# gold positives = rows 1,2,3,5 = 4  (NOT 3 — the original comment miscounted)
# precision = tp/(tp+fp) = 2/3
# recall    = tp/gold    = 2/4 = 0.5
# f1        = 2*(2/3)*(1/2) / ((2/3)+(1/2)) = (2/3)/(7/6) = 4/7
# accuracy  = rows 1,4,5 right = 3/5
MIXED = [
    _o(True, True, True),
    _o(True, False, True),
    _o(False, False, True),
    _o(False, False, False),
    _o(True, True, True),
]


def test_confusion_counts_mixed():
    assert confusion_counts(MIXED) == {"tp": 2, "fp": 1, "fn": 2, "tn": 1}


def test_precision_recall_f1_accuracy_mixed():
    assert precision(MIXED) == pytest.approx(2 / 3)
    assert recall(MIXED) == pytest.approx(0.5)
    assert f1(MIXED) == pytest.approx(4 / 7)
    assert accuracy(MIXED) == pytest.approx(0.6)


def test_empty_input_returns_none_everywhere():
    assert precision([]) is None
    assert recall([]) is None
    assert accuracy([]) is None
    assert f1([]) is None
    assert confusion_counts([]) == {"tp": 0, "fp": 0, "fn": 0, "tn": 0}


def test_no_suggestions_precision_none_recall_zero():
    obs = [_o(False, False, True), _o(False, False, True), _o(False, False, False)]
    assert precision(obs) is None
    assert recall(obs) == pytest.approx(0.0)  # 0 of 2 gold found: defined, and zero
    assert f1(obs) is None
    assert accuracy(obs) == pytest.approx(1 / 3)


def test_no_gold_positives_recall_none():
    obs = [_o(True, False, False), _o(False, False, False)]
    assert recall(obs) is None
    assert precision(obs) == pytest.approx(0.0)  # 1 suggestion, wrong: defined, and zero
    assert f1(obs) is None


def test_single_class_all_true_negatives():
    obs = [_o(False, False, False)] * 4
    assert precision(obs) is None
    assert recall(obs) is None
    assert f1(obs) is None
    assert accuracy(obs) == pytest.approx(1.0)  # the misleading number the docstring warns about
    assert confusion_counts(obs) == {"tp": 0, "fp": 0, "fn": 0, "tn": 4}


def test_f1_none_when_precision_and_recall_both_zero():
    obs = [_o(True, False, True)]  # one wrong suggestion on the only gold item
    assert precision(obs) == pytest.approx(0.0)
    assert recall(obs) == pytest.approx(0.0)
    assert f1(obs) is None


def test_correct_without_suggested_is_not_counted():
    obs = [_o(False, True, True)]
    assert confusion_counts(obs) == {"tp": 0, "fp": 0, "fn": 1, "tn": 0}
    assert precision(obs) is None


# Regression set (predicted, actual): (2,1) (3,3) (5,4) (6,8)
# residuals actual-pred: -1, 0, -1, 2 ; squares 1,0,1,4 -> mean 1.5 -> rmse sqrt(1.5)
# mae = (1+0+1+2)/4 = 1.0
# mean actual = 4 ; ss_tot = 9+1+0+16 = 26 ; ss_res = 6 ; r2 = 1 - 6/26 = 20/26
PAIRS = [(2.0, 1.0), (3.0, 3.0), (5.0, 4.0), (6.0, 8.0)]


def test_rmse_mae_r2_hand_computed():
    assert rmse(PAIRS) == pytest.approx(1.5 ** 0.5)
    assert mae(PAIRS) == pytest.approx(1.0)
    assert r2(PAIRS) == pytest.approx(20 / 26)


def test_regression_empty_returns_none():
    assert rmse([]) is None
    assert mae([]) is None
    assert r2([]) is None


def test_r2_none_on_zero_variance_target():
    assert r2([(1.0, 5.0), (2.0, 5.0), (3.0, 5.0)]) is None
    assert r2([(4.0, 5.0)]) is None  # a single point has zero variance


def test_r2_perfect_and_negative():
    assert r2([(1.0, 1.0), (2.0, 2.0), (3.0, 3.0)]) == pytest.approx(1.0)
    # predicting far from every actual is worse than the mean -> negative
    assert r2([(100.0, 1.0), (100.0, 2.0), (100.0, 3.0)]) < 0.0


def test_rmse_at_least_mae():
    assert rmse(PAIRS) >= mae(PAIRS)
