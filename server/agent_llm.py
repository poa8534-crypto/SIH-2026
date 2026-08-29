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
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Optional, Protocol

from server.agent_slots import (
    DISCIPLINE_VALUES,
    parse_status,
    parse_tags,
)

logger = logging.getLogger(__name__)

# The agent turn is interactive, so it needs a much tighter bound than the
# batch ingest path's OLLAMA_TIMEOUT (120s). A supervisor waiting on a phone
# will not tolerate that, and the deterministic path can answer immediately.
DEFAULT_TIMEOUT_SECONDS = 5.0


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
    """Values the model proposed, already validated. All optional."""

    discipline: Optional[str] = None
    status: Optional[str] = None
    activity_description: Optional[str] = None
    tags: Optional[list[str]] = None


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

    return _validate(outputs)


def _validate(outputs) -> Optional[LLMSuggestion]:
    """Keep only values that survive the deterministic validators."""
    if not outputs:
        return None
    try:
        first = outputs[0]
    except (TypeError, IndexError):
        logger.warning("LLM returned an unusable payload; using rules only")
        return None

    suggestion = LLMSuggestion()

    discipline = _attr(first, "discipline")
    if isinstance(discipline, str) and discipline in DISCIPLINE_VALUES:
        suggestion.discipline = discipline
    elif discipline not in (None, "", "unknown"):
        logger.warning("LLM proposed an unknown discipline; ignoring that field")

    status = _attr(first, "status")
    if isinstance(status, str):
        # Re-parsed rather than trusted: the model's vocabulary and ours only
        # overlap by convention.
        suggestion.status = parse_status(status)

    description = _attr(first, "activity_description")
    if isinstance(description, str) and description.strip():
        suggestion.activity_description = description.strip()[:500]

    tags = _attr(first, "tags")
    if isinstance(tags, list):
        # Tags reach the matcher's strongest feature, so they are taken from
        # the regex pre-pass over the model's own text, never from the model's
        # free choice.
        joined = " ".join(t for t in tags if isinstance(t, str))
        found = parse_tags(joined)
        if found:
            suggestion.tags = found

    if not any((suggestion.discipline, suggestion.status,
                suggestion.activity_description, suggestion.tags)):
        return None
    return suggestion


def _attr(obj, name):
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)
