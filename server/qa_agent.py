"""Read-only question answering over NAVIS project data.

The agent receives a plain data dict and returns text. It holds no database
handle, exposes no write path, and never lets the language model compute or
invent a number: every fact is pre-computed in Python from the supplied data,
the model only phrases it, and the phrasing is checked before it is returned.
If the model is unavailable or misbehaves, the deterministic phrasing is used.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
_MARKER_RE = re.compile(r"\[\d+(?:\s*[,\]\[]\s*\d+)*\]")
_CODE_RE = re.compile(r"\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b")

_UNSUPPORTED = "The supplied project data does not support an answer to that question."
_DONT_KNOW = "i don't know"

_TOPIC_KEYWORDS: dict[str, frozenset[str]] = {
    "delay": frozenset({
        "why", "delay", "delays", "delayed", "slip", "slipping", "slipped", "late", "behind",
        "lost", "overrun", "overruns", "driving", "cause", "causes", "reason", "reasons",
        "blocked", "blocker", "blockers",
    }),
    "duration": frozenset({
        "duration", "durations", "long", "take", "takes", "took", "days", "estimate",
        "suggest", "suggested", "median", "p80", "typical", "baseline", "planned",
    }),
    "productivity": frozenset({
        "productivity", "rate", "rates", "output", "discipline", "disciplines", "completed",
        "progress", "qty", "quantity",
    }),
    "status": frozenset({
        "doing", "status", "health", "overall", "schedule", "performance", "spi", "track",
        "coverage", "evidence", "project",
    }),
    "recommend": frozenset({
        "should", "recommend", "recommendation", "recommendations", "action", "actions",
        "next", "priority", "prioritise", "prioritize", "fix", "address", "mitigate",
    }),
}


@dataclass(frozen=True)
class _Fact:
    text: str
    citations: tuple[str, ...]
    topics: frozenset[str]
    entities: frozenset[str]


def _num(value: object) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _fmt(value: float) -> str:
    return f"{value:g}"


def _coverage_fraction(value: object) -> Optional[float]:
    """Evidence coverage, from either shape the API has used.

    GET /evm returns `evidence_coverage` as an OBJECT — {fraction,
    weight_with_evidence, weight_total, activities_with_evidence,
    activities_total} — not a bare float. Reading it as a float made the agent
    say "evidence coverage is unknown" while the server was reporting 45.13%.
    The SPI guard still held (it keys on spi_headline_safe, not on this), but
    the explanation given to the user was wrong, and an explanation that is
    wrong about its own evidence is worth very little here.

    Both shapes are accepted so the agent survives the payload changing back.
    """
    if isinstance(value, dict):
        return _num(value.get("fraction"))
    return _num(value)


def _percent(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    pct = value * 100.0 if value <= 1.0 else value
    return f"{pct:.1f}%"


def _ordered_unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _delay_facts(data: dict) -> list[_Fact]:
    facts: list[_Fact] = []
    reasons = [r for r in (data.get("delay_reasons") or []) if isinstance(r, dict)]
    reasons.sort(key=lambda r: _num(r.get("days_lost")) or 0.0, reverse=True)
    for r in reasons:
        reason = str(r.get("reason") or "").strip()
        if not reason:
            continue
        freq = _num(r.get("frequency"))
        lost = _num(r.get("days_lost"))
        affected = [str(a) for a in (r.get("affected_activities") or []) if str(a).strip()]
        details = []
        if freq is not None:
            details.append(f"{_fmt(freq)} occurrence(s)")
        if lost is not None:
            details.append(f"{_fmt(lost)} day(s) lost")
        text = f"Delay reason '{reason}'" + (": " + ", ".join(details) if details else "")
        text += f", affecting {', '.join(affected)}." if affected else ", with no listed activities."
        facts.append(_Fact(
            text=text,
            citations=(reason, *affected),
            topics=frozenset({"delay", "recommend"}),
            entities=frozenset({reason.lower(), *(a.lower() for a in affected)}),
        ))
    if reasons:
        top = reasons[0]
        reason = str(top.get("reason") or "").strip()
        lost = _num(top.get("days_lost"))
        freq = _num(top.get("frequency"))
        affected = [str(a) for a in (top.get("affected_activities") or []) if str(a).strip()]
        if reason and lost is not None:
            text = (f"Recommended first action: resolve '{reason}', the largest observed loss "
                    f"({_fmt(lost)} day(s)")
            if freq is not None:
                text += f" over {_fmt(freq)} occurrence(s)"
            text += ")"
            text += f", affecting {', '.join(affected)}." if affected else "."
            facts.append(_Fact(
                text=text,
                citations=(reason, *affected),
                topics=frozenset({"recommend"}),
                entities=frozenset({reason.lower(), *(a.lower() for a in affected)}),
            ))
    return facts


def _duration_facts(data: dict) -> list[_Fact]:
    facts: list[_Fact] = []
    scored: list[tuple[float, dict, float, float, float]] = []
    for row in data.get("duration_distribution") or []:
        if not isinstance(row, dict):
            continue
        at = str(row.get("activity_type") or "").strip()
        ac = _num(row.get("actuals_count"))
        planned = _num(row.get("planned_mean_days"))
        actual = _num(row.get("actual_mean_days"))
        if not at or ac is None or ac <= 0 or planned is None or actual is None:
            continue
        scored.append((actual - planned, row, planned, actual, ac))
    scored.sort(key=lambda t: t[0], reverse=True)
    for delta, row, planned, actual, ac in scored:
        at = str(row["activity_type"]).strip()
        sign = "+" if delta >= 0 else ""
        text = (f"Activity type {at}: planned mean {_fmt(planned)} d, actual mean {_fmt(actual)} d "
                f"over {_fmt(ac)} completed instance(s) ({sign}{_fmt(delta)} d vs plan).")
        if ac < 3:
            text += " Low sample; indicative only."
        topics = {"duration"}
        if delta > 0:
            topics |= {"delay", "recommend"}
        facts.append(_Fact(text=text, citations=(at,), topics=frozenset(topics),
                           entities=frozenset({at.lower()})))
    if scored and scored[0][0] > 0:
        delta, row, planned, actual, ac = scored[0]
        at = str(row["activity_type"]).strip()
        text = (f"Recommended: re-baseline {at}; actuals run {_fmt(actual)} d against "
                f"{_fmt(planned)} d planned over {_fmt(ac)} completed instance(s).")
        if ac < 3:
            text += " Low sample; confirm before re-baselining."
        facts.append(_Fact(text=text, citations=(at,), topics=frozenset({"recommend"}),
                           entities=frozenset({at.lower()})))
    return facts


def _productivity_facts(data: dict) -> list[_Fact]:
    facts: list[_Fact] = []
    for row in data.get("productivity") or []:
        if not isinstance(row, dict):
            continue
        disc = str(row.get("discipline") or "").strip()
        if not disc:
            continue
        total = _num(row.get("total_activities"))
        completed = _num(row.get("completed"))
        ap = _num(row.get("average_planned_days"))
        aa = _num(row.get("average_actual_days"))
        qpd = _num(row.get("average_qty_per_day"))
        clauses = []
        if completed is not None and total is not None:
            clauses.append(f"{_fmt(completed)} of {_fmt(total)} activities completed")
        if ap is not None and aa is not None:
            clauses.append(f"average planned {_fmt(ap)} d vs average actual {_fmt(aa)} d per activity")
        if qpd is not None:
            clauses.append(f"average {_fmt(qpd)} qty/day")
        if not clauses:
            continue
        topics = {"productivity"}
        if ap is not None and aa is not None and aa > ap:
            topics |= {"delay"}
        facts.append(_Fact(text=f"Discipline {disc}: " + "; ".join(clauses) + ".",
                           citations=(disc,), topics=frozenset(topics),
                           entities=frozenset({disc.lower()})))
    return facts


def _suggested_duration_facts(data: dict) -> list[_Fact]:
    sd = data.get("suggested_duration")
    if not isinstance(sd, dict):
        return []
    pattern = str(sd.get("activity_type_pattern") or "").strip()
    ac = _num(sd.get("actuals_count"))
    if not pattern or ac is None or ac <= 0:
        return []
    clauses = []
    mp = _num(sd.get("median_planned_days"))
    ma = _num(sd.get("median_actual_days"))
    p80 = _num(sd.get("p80_actual_days"))
    ss = _num(sd.get("sample_size"))
    if mp is not None:
        clauses.append(f"median planned {_fmt(mp)} d")
    if ma is not None:
        clauses.append(f"median actual {_fmt(ma)} d")
    if p80 is not None:
        clauses.append(f"80th-percentile actual {_fmt(p80)} d")
    sample = f"from {_fmt(ac)} completed"
    if ss is not None:
        sample += f" of {_fmt(ss)} sampled"
    clauses.append(sample)
    text = f"Suggested duration for {pattern}: " + ", ".join(clauses)
    rec = str(sd.get("recommendation") or "").strip()
    if rec:
        text += f"; recommendation on record: {rec}"
    text += "."
    return [_Fact(text=text, citations=(pattern,), topics=frozenset({"duration", "recommend"}),
                  entities=frozenset({pattern.lower()}))]


def _evm_facts(data: dict) -> list[_Fact]:
    evm = data.get("evm")
    if not isinstance(evm, dict):
        return []
    coverage = _percent(_coverage_fraction(evm.get("evidence_coverage")))
    spi = _num(evm.get("spi"))
    safe = evm.get("spi_headline_safe") is True
    if safe and spi is not None:
        cov = f" at {coverage} evidence coverage" if coverage else ""
        text = f"Schedule performance index (SPI) {_fmt(spi)}{cov}."
    else:
        cov = f"at {coverage} evidence coverage" if coverage else "because evidence coverage is unknown"
        text = (f"Schedule performance (SPI) cannot be reported {cov}; "
                f"the figure is withheld until coverage is sufficient.")
    return [_Fact(text=text, citations=("evm",), topics=frozenset({"status"}), entities=frozenset())]


def _build_facts(data: dict) -> list[_Fact]:
    facts: list[_Fact] = []
    facts.extend(_delay_facts(data))
    facts.extend(_duration_facts(data))
    facts.extend(_productivity_facts(data))
    facts.extend(_suggested_duration_facts(data))
    facts.extend(_evm_facts(data))
    return facts


def _entity_match(asked: str, have: str) -> bool:
    return asked == have or have.startswith(asked + "-") or asked.startswith(have + "-")


def _extract_entities(question: str, facts: list[_Fact]) -> set[str]:
    found: set[str] = set()
    for code in _CODE_RE.findall(question):
        found.add(code.lower())
    q = question.lower()
    known: set[str] = set()
    for f in facts:
        known |= f.entities
    for key in known:
        if len(key) < 3:
            continue
        if re.search(r"(?<![a-z0-9])" + re.escape(key) + r"(?![a-z0-9])", q):
            found.add(key)
    return found


def _select(facts: list[_Fact], question: str) -> tuple[list[_Fact], set[str]]:
    tokens = set(re.findall(r"[a-z0-9']+", question.lower()))
    topics = {t for t, kws in _TOPIC_KEYWORDS.items() if tokens & kws}
    entities = _extract_entities(question, facts)
    if entities:
        matched = [f for f in facts if any(_entity_match(e, fe) for e in entities for fe in f.entities)]
        if topics:
            narrowed = [f for f in matched if f.topics & topics]
            matched = narrowed or matched
        return matched, (set() if matched else entities)
    if not topics:
        return [], set()
    return [f for f in facts if f.topics & topics], set()


def _compose(facts: list[_Fact]) -> str:
    return "\n".join(f"- {f.text} [{'; '.join(f.citations)}]" for f in facts)


def _build_prompt(question: str, facts: list[_Fact]) -> str:
    lines = [
        "You are NAVIS, a read-only assistant for an EPC construction schedule.",
        "Answer the question using ONLY the numbered facts below.",
        "Rules:",
        "- Do not add, round, estimate, or compute any number. Copy figures exactly as written.",
        "- End every sentence with the fact number(s) it is drawn from, e.g. [1] or [2][3].",
        "- Do not give generic project-management advice; only restate what the facts support.",
        "- If the facts do not answer the question, reply exactly: I don't know.",
        "",
        f"Question: {question.strip()}",
        "",
        "Facts:",
    ]
    for i, f in enumerate(facts, 1):
        lines.append(f"[{i}] {f.text}")
    lines += ["", "Answer in plain prose, at most six sentences."]
    return "\n".join(lines)


def _allowed_numbers(facts: list[_Fact]) -> set[float]:
    allowed: set[float] = set()
    for f in facts:
        for token in _NUMBER_RE.findall(f.text + " " + " ".join(f.citations)):
            allowed.add(float(token))
    return allowed


def _forbidden_strings(data: dict) -> set[str]:
    evm = data.get("evm")
    if not isinstance(evm, dict) or evm.get("spi_headline_safe") is True:
        return set()
    spi = _num(evm.get("spi"))
    if spi is None:
        return set()
    return {_fmt(spi), f"{spi:.4f}", f"{spi:.3f}", f"{spi:.2f}", f"{spi:.1f}", str(evm.get("spi"))}


def _accept(text: str, facts: list[_Fact], forbidden: set[str]) -> bool:
    if not text or _DONT_KNOW in text.lower():
        return False
    for s in forbidden:
        if s and s in text:
            return False
    stripped = _MARKER_RE.sub(" ", text)
    allowed = _allowed_numbers(facts)
    for token in _NUMBER_RE.findall(stripped):
        if float(token) not in allowed:
            return False
    return True


class QAAgent:
    """Read-only Q&A over a supplied project-data dict.

    Holds exactly one thing: an optional text-generation callable. It has no
    database handle and no method that writes anywhere. Facts are computed
    from the data in Python; the model is only asked to phrase them, and its
    phrasing is rejected if it introduces any number not present in the
    facts or states a withheld SPI figure.
    """

    __slots__ = ("_generate",)

    def __init__(self, generate: Callable[[str], str] | None = None):
        self._generate = generate

    def answer(self, question: str, data: dict) -> dict:
        question = str(question or "")
        data = data if isinstance(data, dict) else {}
        facts = _build_facts(data)
        selected, unknown = _select(facts, question)
        configured = self._generate is not None

        if not selected:
            if unknown:
                names = ", ".join(sorted(e.upper() if "-" in e else e for e in unknown))
                text = f"The supplied project data contains no observations for {names}. {_UNSUPPORTED}"
            else:
                text = _UNSUPPORTED
            return {"answer": text, "citations": [], "grounded": False, "model_available": configured}

        citations = _ordered_unique(c for f in selected for c in f.citations)
        body = _compose(selected)
        available = False
        if self._generate is not None:
            try:
                raw = self._generate(_build_prompt(question, selected))
                available = True
            except Exception:
                raw = None
                available = False
            if available and isinstance(raw, str):
                candidate = raw.strip()
                if _accept(candidate, selected, _forbidden_strings(data)):
                    body = candidate

        return {
            "answer": body + "\n\nSources: " + ", ".join(citations),
            "citations": citations,
            "grounded": True,
            "model_available": available,
        }
