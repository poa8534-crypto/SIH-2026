"""Optional LLM interpretation for one conversational turn.

The LLM is an interpreter and nothing more. It may suggest a discipline, a
status, a description or tags; every value it returns is re-validated by the
deterministic parsers in `agent_slots` before it is allowed near SlotState. It
never picks an activity id, never produces a confidence, never writes schedule
data and never learns an alias — those come from MatchingEngine and from the
Planning Engineer's confirmation.

It is off by default. The repository already has a feature flag,
`EXTRACTION_PROVIDER`, which defaults to "rules" and yields a NullBackend, so
no flag was added: setting anything else is the opt-in. When it is off, this
module makes no client, no connection and no wait.

Every failure is silent to the supervisor. A refused connection, a timeout, a
missing model, malformed JSON or a schema violation all land in the same place:
return nothing, let the deterministic path continue, log a warning server-side.
An Ollama problem is not a NAVIS outage and must never be presented as one.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from typing import Optional, Protocol

from matching.textutils import tokenize
from server.agent_slots import (
    ACTIVITY_ID_RE,
    DISCIPLINE_VALUES,
    parse_status,
    parse_tags,
)

logger = logging.getLogger(__name__)

# The agent turn is interactive, so it needs a much tighter bound than the
# batch ingest path's OLLAMA_TIMEOUT (120s). A supervisor waiting on a phone
# will not tolerate that, and the deterministic path can answer immediately.
DEFAULT_TIMEOUT_SECONDS = 5.0

# ── Description grounding ───────────────────────────────────────────────────
#
# `activity_description` was the one model-supplied field that reached SlotState
# without a deterministic re-check: everything else is either membership-tested
# against a closed vocabulary (discipline), re-parsed by our own parser
# (status), or re-derived from the regex pre-pass (tags). A description only got
# `.strip()[:500]`, and it is echoed back to the supervisor and persisted in the
# conversation record — so an unfaithful model could put words in their mouth.
#
# The fix is containment, not similarity: every content token of the description
# must be traceable to the supervisor's own message. `tokenize` is reused rather
# than reimplemented so the test sees the same normalisation the matcher does —
# stopwords dropped, field abbreviations expanded ("erected" -> "erection"), and
# tag-like tokens ("24-inch", "p-1001") kept whole.
#
# THRESHOLD = 0.75, measured, not guessed. On a hand-built set of 21 pairs
# (12 faithful restatements of real DPR lines, 9 that add a location, quantity,
# scope or judgement the message never carried) the two classes separate
# cleanly: every faithful description scored >= 0.833, every unfaithful one
# <= 0.556. Any cut in [0.60, 0.80] gives zero errors on that set; 0.75 is taken
# because it is inside the band with margin on both sides and states a rule you
# can defend out loud — three in four of the description's content words must be
# the supervisor's own. The bias is deliberately toward rejecting: a false
# reject costs nothing, because the deterministic path then supplies the
# supervisor's own sentence, while a false accept is words put in their mouth.
# The calibration set is small (n=21) and hand-built; it bounds the rule's
# behaviour on realistic input, it does not establish an error rate.
DESCRIPTION_GROUNDING_THRESHOLD = 0.75

# A one-line progress description. The longest activity description in the demo
# baseline is 48 characters and the longest content line across the eleven DPRs
# is 150, so a faithful restatement of one line has no legitimate reason to run
# past 160. The previous cap of 500 left room for roughly three times the
# longest real input — enough for a paragraph of narrative padded with echoed
# source words, which is precisely the shape that can drift past a ratio test.
DESCRIPTION_MAX_CHARS = 160

# Structure a one-line description has no business carrying: markdown emphasis
# and headings, table pipes, code fences, and JSON/array punctuation. A model
# emitting these is formatting or leaking scaffolding, not describing work.
_STRUCTURE_RE = re.compile(r"[{}\[\]|`*#<>]|\*\*|__")

# Crude but sufficient: a description is a noun phrase about work, never an
# instruction. Anything that reads like one is refused rather than sanitised.
_INSTRUCTION_RE = re.compile(
    r"\b(ignore (?:all |any )?(?:previous|prior|above)|disregard (?:the |all )?"
    r"(?:previous|prior|above)|system prompt|you are (?:now )?an?\b|"
    r"act as|respond with|output only|new instructions?)\b",
    re.IGNORECASE,
)


def llm_enabled() -> bool:
    """True when the operator has opted in to the LLM path."""
    provider = os.environ.get("EXTRACTION_PROVIDER", "rules").strip().lower()
    return provider not in ("", "rules", "none", "null", "prepass")


def llm_timeout_seconds() -> float:
    raw = os.environ.get("NAVIS_LLM_TIMEOUT_SECONDS", "")
    try:
        value = float(raw)
        return value if value > 0 else DEFAULT_TIMEOUT_SECONDS
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


class SupportsExtract(Protocol):
    """The part of LLMBackend this module uses."""

    def extract_events(self, text_spans, schedule_context, prepass_hints): ...


@dataclass
class LLMSuggestion:
    """Values the model proposed, already validated. All optional.

    `suggested_fields` is the provenance record: the names of the slots this
    object is offering. The project already carries `date_basis` end to end so a
    planner can tell an asserted date from an inferred one; a slot a model
    proposed and a slot parsed from the supervisor's own words deserve the same
    distinction, and a reviewer needs it to know which fields a model touched.
    """

    discipline: Optional[str] = None
    status: Optional[str] = None
    activity_description: Optional[str] = None
    tags: Optional[list[str]] = None
    suggested_fields: list[str] = field(default_factory=list)


def interpret(
    message: str,
    *,
    backend: Optional[SupportsExtract] = None,
    schedule_context: str = "",
    timeout: Optional[float] = None,
) -> Optional[LLMSuggestion]:
    """Ask the model to read one message. Returns None on any problem.

    `backend` is injected so tests never need a real Ollama; when omitted and
    the flag is off, this returns None without constructing anything.
    """
    if backend is None:
        if not llm_enabled():
            return None
        try:
            from extraction.llm_backend import make_backend_from_env

            backend = make_backend_from_env()
        except Exception as e:  # noqa: BLE001
            logger.warning("LLM backend unavailable (%s); using rules only", type(e).__name__)
            return None

    if not message.strip():
        return None

    bound = timeout if timeout is not None else llm_timeout_seconds()

    # One attempt, bounded. No retry loop: a slow model must not turn one
    # supervisor turn into a multi-second stall.
    # Not a `with` block: ThreadPoolExecutor.__exit__ joins its workers, so a
    # stalled model would still hold the request for its own full timeout even
    # after we gave up waiting. Shut down without waiting and let the orphaned
    # thread finish into a result nobody reads.
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        future = pool.submit(backend.extract_events, [message], schedule_context, [{}])
        outputs = future.result(timeout=bound)
    except FutureTimeout:
        logger.warning("LLM extraction exceeded %.1fs; using rules only", bound)
        return None
    except Exception as e:  # noqa: BLE001
        # Connection refused, model missing, bad JSON, anything at all.
        logger.warning("LLM extraction failed (%s); using rules only", type(e).__name__)
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    return _validate(outputs, message)


def _validate_description(candidate: str, source_message: str) -> Optional[str]:
    """The supervisor's own words, formalised — or None.

    Returns the cleaned description when it is safe to show back to the person
    who spoke it, and None when it is not. Every rejection logs which rule
    fired and lets the deterministic path continue; none of them is ever
    surfaced to the supervisor.
    """
    if not isinstance(candidate, str):
        return None

    # 1. Control characters. Whitespace is collapsed first, which folds away
    #    the tabs, newlines and carriage returns a model uses for layout; what
    #    survives that is a genuine control or format character and is refused
    #    rather than stripped, because silently deleting one changes the text
    #    the supervisor is shown without saying so.
    collapsed = " ".join(candidate.split()).strip()
    if not collapsed:
        return None
    if any(unicodedata.category(ch) in ("Cc", "Cf") for ch in collapsed):
        logger.warning("LLM description carried control characters; ignoring that field")
        return None

    # 2. Structure and instructions. A one-line progress description is a noun
    #    phrase, not markup and not a command.
    if _STRUCTURE_RE.search(collapsed):
        logger.warning("LLM description carried markup or JSON structure; ignoring that field")
        return None
    if _INSTRUCTION_RE.search(collapsed):
        logger.warning("LLM description read as an instruction; ignoring that field")
        return None

    # 3. An activity id. Naming one is choosing one, which is exactly what
    #    D-006 forbids the model to do — the MatchingEngine decides, and it
    #    decides from the supervisor's text, never from this field.
    if ACTIVITY_ID_RE.search(collapsed):
        logger.warning("LLM description named an activity id; ignoring that field (D-006)")
        return None

    # 4. Length, truncated on a word boundary so the result is never a torn
    #    token. Done before grounding so the ratio is measured on the string
    #    that will actually be used.
    if len(collapsed) > DESCRIPTION_MAX_CHARS:
        head = collapsed[:DESCRIPTION_MAX_CHARS]
        cut = head.rfind(" ")
        collapsed = (head[:cut] if cut > 0 else head).rstrip(" ,;:-")
        if not collapsed:
            return None

    # 5. Grounding. Every content token must be traceable to what the
    #    supervisor actually said.
    described = tokenize(collapsed)
    if not described:
        # Nothing but stopwords: no content to ground, and nothing worth
        # showing back either.
        return None
    spoken = set(tokenize(source_message))
    grounded = sum(1 for t in described if t in spoken) / len(described)
    if grounded < DESCRIPTION_GROUNDING_THRESHOLD:
        logger.warning(
            "LLM description only %.0f%% grounded in the supervisor's message "
            "(floor %.0f%%); ignoring that field",
            grounded * 100, DESCRIPTION_GROUNDING_THRESHOLD * 100,
        )
        return None

    return collapsed


def _validate(outputs, source_message: str = "") -> Optional[LLMSuggestion]:
    """Keep only values that survive the deterministic validators."""
    if not outputs:
        return None
    try:
        count = len(outputs)
        first = outputs[0]
    except (TypeError, IndexError, KeyError):
        logger.warning("LLM returned an unusable payload; using rules only")
        return None

    # One message goes in as one span, so the contract is one event out. More
    # than one means the model did not follow it, and there is no honest way to
    # pick: taking outputs[0] is silent truncation of model output — the exact
    # bug class this repository has been closing everywhere else — and merging
    # would fuse two different readings of one sentence into a record the
    # supervisor never said. The whole payload is refused and the rules path
    # continues, which is the same posture as every other LLM failure here.
    if count > 1:
        logger.warning(
            "LLM returned %d events for a single span; expected 1, using rules only",
            count,
        )
        return None

    suggestion = LLMSuggestion()

    discipline = _attr(first, "discipline")
    if isinstance(discipline, str) and discipline in DISCIPLINE_VALUES:
        suggestion.discipline = discipline
        suggestion.suggested_fields.append("discipline")
    elif discipline not in (None, "", "unknown"):
        logger.warning("LLM proposed an unknown discipline; ignoring that field")

    status = _attr(first, "status")
    if isinstance(status, str):
        # Re-parsed rather than trusted: the model's vocabulary and ours only
        # overlap by convention.
        suggestion.status = parse_status(status)
        if suggestion.status:
            suggestion.suggested_fields.append("status")

    description = _attr(first, "activity_description")
    if isinstance(description, str) and description.strip():
        suggestion.activity_description = _validate_description(
            description, source_message
        )
        if suggestion.activity_description:
            suggestion.suggested_fields.append("activity_description")

    tags = _attr(first, "tags")
    if isinstance(tags, list):
        # Tags reach the matcher's strongest feature, so they are taken from
        # the regex pre-pass over the model's own text, never from the model's
        # free choice.
        joined = " ".join(t for t in tags if isinstance(t, str))
        found = parse_tags(joined)
        if found:
            suggestion.tags = found
            suggestion.suggested_fields.append("tags")

    if not suggestion.suggested_fields:
        return None
    return suggestion


def _attr(obj, name):
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


# ── Status probe ────────────────────────────────────────────────────────────

def configured_provider() -> str:
    """The provider name the operator selected, normalised. Never a secret."""
    return os.environ.get("EXTRACTION_PROVIDER", "rules").strip().lower() or "rules"


def probe(
    *,
    backend: Optional[SupportsExtract] = None,
    timeout: Optional[float] = None,
) -> dict:
    """Answer whether the LLM path is on and whether it actually responds.

    Read-only and bounded by the same mechanism `interpret` uses, so a hung
    endpoint costs one timeout rather than the request. Never returns an API
    key, a base URL (which can carry credentials in userinfo) or any other
    secret — only the provider name, a reachability verdict and the bound.

    `reachable` is deliberately three-valued: None when the path is off and
    nothing was attempted, so "we did not look" is never reported as "it works".
    """
    bound = timeout if timeout is not None else llm_timeout_seconds()
    provider = configured_provider()
    enabled = llm_enabled()

    result = {
        "enabled": enabled,
        "provider": provider,
        "reachable": None,
        "detail": "",
        "timeout_seconds": bound,
    }

    if not enabled and backend is None:
        result["detail"] = (
            "The LLM path is off. EXTRACTION_PROVIDER is 'rules', so every "
            "turn is handled by the deterministic parsers. This is the default."
        )
        return result

    if backend is None:
        try:
            from extraction.llm_backend import make_backend_from_env

            backend = make_backend_from_env()
        except Exception as e:  # noqa: BLE001
            result["reachable"] = False
            result["detail"] = f"Backend could not be constructed ({type(e).__name__})."
            return result

    # make_backend_from_env falls back to NullBackend when the configured
    # provider is unusable, so an opted-in provider that comes back as the null
    # one is a misconfiguration, not a working path. Say so rather than
    # reporting a healthy probe against a backend that does nothing.
    if type(backend).__name__ == "NullBackend" and enabled:
        result["reachable"] = False
        result["detail"] = (
            f"EXTRACTION_PROVIDER is '{provider}' but no usable backend was "
            "built (unreachable, model not pulled, or no key). Running "
            "rules-only."
        )
        return result

    # The cheapest call that still exercises the real path end to end.
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        future = pool.submit(backend.extract_events, ["probe"], "", [{}])
        outputs = future.result(timeout=bound)
    except FutureTimeout:
        result["reachable"] = False
        result["detail"] = f"No response within {bound:.1f}s."
        return result
    except Exception as e:  # noqa: BLE001
        result["reachable"] = False
        result["detail"] = f"Unreachable ({type(e).__name__})."
        return result
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    result["reachable"] = True
    result["detail"] = f"Answered a trivial probe with {len(outputs or [])} event(s)."
    return result
