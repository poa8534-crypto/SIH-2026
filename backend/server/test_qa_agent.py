"""The Q&A agent must be safe before it is useful.

This agent reads project data and talks about it. Three failures would each be
worse than not shipping it at all: writing to the schedule, inventing a number,
or quoting a schedule-performance figure the evidence does not support. The
tests below exist for those three, and for the requirement that an Ollama
outage degrades the answer rather than removing it (D-005).

The truncated half of this file was written here rather than regenerated, so
every assertion below was checked against observed behaviour.
"""
from __future__ import annotations

import pytest

from server.qa_agent import QAAgent


def _data(spi: float = 0.1783, safe: bool = False, coverage: float = 0.241) -> dict:
    """The real /memory/query + /evm payload shape, with real values."""
    return {
        "duration_distribution": [
            {"activity_type": "CIV-APN", "count": 1, "actuals_count": 1,
             "planned_mean_days": 9.0, "actual_mean_days": 32.0,
             "planned_min_days": 9, "planned_max_days": 9},
            {"activity_type": "CIV-FDN", "count": 4, "actuals_count": 0,
             "planned_mean_days": 12.0, "actual_mean_days": None,
             "planned_min_days": 10, "planned_max_days": 14},
        ],
        "productivity": [
            {"discipline": "Piping", "total_activities": 40, "completed": 12,
             "average_planned_days": 10.0, "average_actual_days": 14.0,
             "average_qty_per_day": 3.5},
        ],
        "delay_reasons": [
            {"reason": "fencing conflict", "frequency": 2,
             "affected_activities": ["CIV-DWG-1015"], "days_lost": 21},
        ],
        "suggested_duration": {
            "activity_type_pattern": "CIV-APN", "sample_size": 1, "actuals_count": 1,
            "median_planned_days": 9.0, "median_actual_days": 32.0,
            "p80_actual_days": 32.0, "recommendation": "use 32 days",
        },
        "evm": {"spi": spi, "spi_headline_safe": safe, "evidence_coverage": coverage},
    }


# ── (a) grounded answers cite real records ──────────────────────────────────

def test_delay_question_is_grounded_and_cites_a_real_activity():
    result = QAAgent().answer("why is the project delayed?", _data())
    assert result["grounded"] is True
    assert result["citations"], "a grounded answer must cite something"
    assert "CIV-DWG-1015" in result["citations"]
    assert "fencing conflict" in result["answer"]
    assert "21" in result["answer"]


def test_every_grounded_answer_has_a_non_empty_citation_list():
    for question in ("why is it delayed?", "how long do things take?",
                     "how is productivity?", "what should I do next?"):
        result = QAAgent().answer(question, _data())
        if result["grounded"]:
            assert result["citations"], question


def test_recommendation_traces_to_observed_data_not_generic_advice():
    result = QAAgent().answer("what should I do?", _data())
    assert result["grounded"] is True
    # The recommendation must name the observed cause and its measured cost.
    assert "fencing conflict" in result["answer"]
    assert "21" in result["answer"]


# ── (b) it refuses rather than guesses ──────────────────────────────────────

def test_unanswerable_question_is_not_grounded():
    result = QAAgent().answer("what is the client's phone number?", _data())
    assert result["grounded"] is False
    assert result["citations"] == []


def test_question_about_an_activity_with_no_data_says_so():
    result = QAAgent().answer("why is ELE-XYZ-9999 late?", _data())
    assert result["grounded"] is False
    assert "ELE-XYZ-9999" in result["answer"].upper()


# ── (c)+(d) it degrades, never fails: D-005 ─────────────────────────────────

def test_no_model_still_returns_the_grounded_figures():
    result = QAAgent(generate=None).answer("why is the project delayed?", _data())
    assert result["model_available"] is False
    assert result["grounded"] is True
    assert "fencing conflict" in result["answer"]


def test_a_raising_model_is_handled_exactly_like_no_model():
    def explodes(_prompt: str) -> str:
        raise ConnectionError("ollama is not running")

    down = QAAgent(generate=explodes).answer("why is the project delayed?", _data())
    absent = QAAgent(generate=None).answer("why is the project delayed?", _data())
    assert down["model_available"] is False
    assert down["grounded"] is True
    assert down["answer"] == absent["answer"]


def test_a_working_model_is_used_when_it_stays_within_the_facts():
    faithful = "Fencing conflict has cost 21 days across 2 occurrences on CIV-DWG-1015. [1]"
    result = QAAgent(generate=lambda _p: faithful).answer("why is it delayed?", _data())
    assert result["model_available"] is True
    assert faithful in result["answer"]


# ── the model may not invent numbers ────────────────────────────────────────

def test_a_model_that_fabricates_a_number_is_rejected():
    result = QAAgent(generate=lambda _p: "The project is 87% complete and will finish in 14 days.")
    out = result.answer("why is it delayed?", _data())
    assert out["model_available"] is True
    # Rejected: the deterministic phrasing is returned instead.
    assert "87" not in out["answer"]
    assert "fencing conflict" in out["answer"]


# ── (e) the SPI guard ───────────────────────────────────────────────────────

def test_an_unsafe_spi_is_never_stated():
    """spi_headline_safe=False at 24.1% coverage. The figure must be withheld."""
    out = QAAgent().answer("how is the project doing?", _data(spi=0.1783, safe=False))
    assert "0.1783" not in out["answer"]
    assert "cannot be reported" in out["answer"]
    assert "24.1%" in out["answer"]


def test_the_model_cannot_smuggle_an_unsafe_spi_back_in():
    leak = "The schedule performance index is 0.1783, which is poor. [1]"
    out = QAAgent(generate=lambda _p: leak).answer("how is the project doing?", _data(safe=False))
    assert "0.1783" not in out["answer"]


def test_evidence_coverage_accepts_the_real_nested_shape():
    """GET /evm returns evidence_coverage as an OBJECT, not a float.

    Read as a float it yielded "evidence coverage is unknown" while the server
    was reporting 45.13%. The guard held either way, but the reason given was
    wrong.
    """
    data = _data(safe=False)
    data["evm"]["evidence_coverage"] = {
        "weight_with_evidence": 607.0, "weight_total": 1345.0, "fraction": 0.4513,
        "activities_with_evidence": 56, "activities_total": 120,
    }
    out = QAAgent().answer("how is the project doing?", data)
    assert "45.1%" in out["answer"]
    assert "unknown" not in out["answer"]
    assert "0.1783" not in out["answer"]


def test_missing_evidence_coverage_still_withholds_and_says_unknown():
    data = _data(safe=False)
    data["evm"].pop("evidence_coverage")
    out = QAAgent().answer("how is the project doing?", data)
    assert "cannot be reported" in out["answer"]
    assert "0.1783" not in out["answer"]


def test_a_safe_spi_is_reported_normally():
    out = QAAgent().answer("how is the project doing?", _data(spi=0.94, safe=True, coverage=0.72))
    assert "0.94" in out["answer"]
    assert "cannot be reported" not in out["answer"]


# ── (f) read-only by construction ───────────────────────────────────────────

def test_the_agent_exposes_no_write_path():
    agent = QAAgent()
    public = [name for name in dir(agent) if not name.startswith("_")]
    assert public == ["answer"], f"unexpected public surface: {public}"

    forbidden = ("write", "save", "commit", "update", "delete", "insert",
                 "resolve", "set_", "put", "post", "execute", "db", "session")
    for name in dir(agent):
        assert not any(name.lower().startswith(f) for f in forbidden), name


def test_the_agent_holds_no_state_beyond_the_generate_callable():
    """__slots__ makes an accidental database handle impossible to attach."""
    agent = QAAgent()
    assert QAAgent.__slots__ == ("_generate",)
    assert not hasattr(agent, "__dict__")
    with pytest.raises(AttributeError):
        agent.db = object()  # type: ignore[attr-defined]


def test_answering_does_not_mutate_the_supplied_data():
    import copy
    data = _data()
    before = copy.deepcopy(data)
    QAAgent().answer("why is it delayed?", data)
    assert data == before
