"""LLM backend interface for structured event extraction.

Two backends behind one interface:
  - OpenAICompatibleBackend: for any OpenAI-compatible API (Claude via proxy, OpenAI, etc.)
  - OllamaBackend: local model via Ollama for offline/demo fallback

The interface takes prepass-enriched text and returns structured ExtractedEvents.
"""

from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from .models import (
    Discipline,
    EventStatus,
    ExtractedEvent,
    ExtractionMethod,
    Provenance,
)

logger = logging.getLogger(__name__)


# ── LLM output schema (what we ask the model to produce) ─────────────────────

class LLMEventOutput(BaseModel):
    """Structured output we request from the LLM.

    Deliberately asks for NO dates and NO tags-as-truth. Dates are resolved by
    the deterministic pre-pass and bound to start/finish claims in
    extractor._bind_assertion_dates; tags come from the regex pre-pass alone
    (they feed the matcher's near-decisive tag_overlap feature). The model is
    used for the things regex is bad at — reading intent out of informal
    prose — and is kept away from the fields that reach the schedule.

    `discipline` and `status` carry explicit enums so that Ollama's
    grammar-constrained decoding cannot emit an out-of-vocabulary value.
    """

    raw_text: str = Field(..., description="The progress text being analyzed")
    activity_description: str = Field(..., description="Formal description of the progress")
    tags: list[str] = Field(default_factory=list, description="Equipment/line tags mentioned")
    discipline: str = Field(
        ...,
        description="Discipline of the work described",
        json_schema_extra={"enum": [d.value for d in Discipline]},
    )
    status: str = Field(
        ...,
        description="Progress status of the work described",
        json_schema_extra={"enum": [s.value for s in EventStatus]},
    )
    percentage: Optional[float] = Field(None, description="Percentage complete if mentioned")
    quantity: Optional[float] = Field(None, description="Quantity mentioned")
    uom: Optional[str] = Field(None, description="Unit of measurement")
    reasoning: str = Field(..., description="Why you classified it this way")
    alternatives: list[str] = Field(
        default_factory=list,
        description="Other possible activity_ids this could match",
    )


class LLMBatchOutput(BaseModel):
    """Batch output for multiple text spans."""
    events: list[LLMEventOutput]


# ── Abstract interface ───────────────────────────────────────────────────────

class LLMBackend(ABC):
    """Abstract LLM backend for structured event extraction."""

    @abstractmethod
    def extract_events(
        self,
        text_spans: list[str],
        schedule_context: str,
        prepass_hints: list[dict],
    ) -> list[LLMEventOutput]:
        """Extract structured events from text spans.

        Args:
            text_spans: Free-text lines to analyze
            schedule_context: Compact schedule rendering for the prompt
            prepass_hints: Pre-extracted data (tags, dates, quantities) per span

        Returns:
            List of LLMEventOutput, one per input span
        """
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this backend is reachable."""
        ...


# ── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an EPC construction progress extractor. You analyze informal field
reports (daily progress reports, WhatsApp messages, spreadsheet entries) and
extract structured progress events.

RULES:
1. You receive free text and pre-extracted hints (tags, dates, quantities).
2. For each text span, produce ONE structured event.
3. Use the schedule context to infer discipline and status.
4. Return STRICT JSON matching the schema. No markdown, no explanation outside JSON.
5. If you cannot determine a field, use null — do not guess.
6. Alternative activity_ids are encouraged when ambiguous.
7. reasoning must explain your classification in 1-2 sentences.

FIELD VOCABULARY (EPC domain):
- "completed", "done", "passed", "all X done" → status: completed
- "started", "ongoing", "X of Y done" → status: in_progress
- "delayed", "held up", "behind" → status: delayed
- "khotom", "ho gaya" (Hindi) → completed
- "chalu hai", "shuru" (Hindi) → in_progress
- "kal se" (Hindi) → "from tomorrow"
"""


# ── OpenAI-compatible backend ────────────────────────────────────────────────

class OpenAICompatibleBackend(LLMBackend):
    """Backend for any OpenAI-compatible API (Claude, OpenAI, etc.)."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: str = "https://api.openai.com/v1",
        temperature: float = 0.0,
        max_retries: int = 2,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature
        self.max_retries = max_retries

    def is_available(self) -> bool:
        """Check API connectivity."""
        try:
            import urllib.request
            req = urllib.request.Request(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False

    def extract_events(
        self,
        text_spans: list[str],
        schedule_context: str,
        prepass_hints: list[dict],
    ) -> list[LLMEventOutput]:
        """Call the API to extract structured events."""
        import urllib.request

        results: list[LLMEventOutput] = []

        # Process in batches of 5 to stay within token limits
        batch_size = 5
        for i in range(0, len(text_spans), batch_size):
            batch_spans = text_spans[i : i + batch_size]
            batch_hints = prepass_hints[i : i + batch_size]

            user_msg = self._build_user_message(batch_spans, schedule_context, batch_hints)

            for attempt in range(self.max_retries + 1):
                try:
                    response = self._call_api(user_msg)
                    batch_results = self._parse_response(response, batch_spans)
                    results.extend(batch_results)
                    break
                except Exception as e:
                    logger.warning(f"LLM attempt {attempt + 1} failed: {e}")
                    if attempt == self.max_retries:
                        # Fall back to prepass-only events
                        for span in batch_spans:
                            results.append(LLMEventOutput(
                                raw_text=span,
                                activity_description="",
                                discipline="unknown",
                                status="unknown",
                                reasoning=f"LLM failed: {e}",
                            ))

        return results

    def _build_user_message(
        self,
        spans: list[str],
        schedule_context: str,
        hints: list[dict],
    ) -> str:
        parts = [
            "SCHEDULE CONTEXT (for reference — pick matching activity_ids from this):",
            schedule_context,
            "",
            "TEXT SPANS TO ANALYZE:",
        ]
        for i, (span, hint) in enumerate(zip(spans, hints)):
            parts.append(f"\n--- Span {i + 1} ---")
            parts.append(f"Text: {span}")
            if hint:
                parts.append(f"Pre-extracted hints: {json.dumps(hint, default=str)}")
        parts.append(f"\nReturn a JSON object with key \"events\" containing one LLMEventOutput per span.")
        return "\n".join(parts)

    def _call_api(self, user_message: str) -> str:
        import urllib.request

        payload = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": self.temperature,
            "response_format": {"type": "json_object"},
        }).encode()

        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"]

    def _parse_response(
        self, response: str, spans: list[str]
    ) -> list[LLMEventOutput]:
        data = json.loads(response)
        events_raw = data.get("events", data if isinstance(data, list) else [])
        results = []
        for i, ev in enumerate(events_raw):
            try:
                results.append(LLMEventOutput(**ev))
            except Exception as e:
                logger.warning(f"Failed to parse event {i}: {e}")
                results.append(LLMEventOutput(
                    raw_text=spans[i] if i < len(spans) else "",
                    activity_description="",
                    discipline="unknown",
                    status="unknown",
                    reasoning=f"Parse error: {e}",
                ))
        return results


# ── Ollama backend ───────────────────────────────────────────────────────────

class OllamaBackend(LLMBackend):
    """Local Ollama backend for offline/demo mode.

    Two things matter for correctness here:

    * **Grammar-constrained decoding.** The `format` parameter is given the
      full JSON Schema of LLMEventOutput, not the string "json". Ollama
      compiles the schema to a grammar and constrains sampling to it, so the
      response is structurally valid and enum fields cannot go out of
      vocabulary. Asking for JSON in the prompt only makes it likely.
    * **Thinking disabled.** qwen3 is a hybrid reasoning model. Its think
      block is emitted before the JSON, which breaks structured output and
      costs latency for a task that needs extraction, not deliberation.
      `think: false` is sent explicitly rather than relying on the default.
    """

    def __init__(
        self,
        model: str = "qwen3:8b",
        base_url: str = "http://localhost:11434",
        temperature: float = 0.0,
        think: bool = False,
        timeout: int = 120,
        num_ctx: int = 8192,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature
        self.think = think
        self.timeout = timeout
        self.num_ctx = num_ctx

    # ── availability ─────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        """Reachable AND actually serving the configured model."""
        try:
            import urllib.request
            with urllib.request.urlopen(f"{self.base_url}/api/tags", timeout=3) as resp:
                if resp.status != 200:
                    return False
                names = {m.get("name", "") for m in json.loads(resp.read()).get("models", [])}
        except Exception as e:
            logger.warning("Ollama unreachable at %s: %s", self.base_url, e)
            return False
        if self.model not in names:
            logger.warning(
                "Ollama is up but model %r is not pulled (have: %s)",
                self.model, ", ".join(sorted(names)) or "none",
            )
            return False
        return True

    # ── extraction ───────────────────────────────────────────────────────────

    def extract_events(
        self,
        text_spans: list[str],
        schedule_context: str,
        prepass_hints: list[dict],
    ) -> list[LLMEventOutput]:
        schema = LLMEventOutput.model_json_schema()
        results: list[LLMEventOutput] = []

        # schedule_context is accepted for interface compatibility and is
        # deliberately not sent -- see _generate for why.
        for i, (span, hint) in enumerate(zip(text_spans, prepass_hints)):
            try:
                raw = self._generate(span, hint, schema)
                results.append(self._parse(raw, span))
            except Exception as e:
                logger.warning("Ollama call failed for span %d: %s", i, e)
                results.append(self._fallback(span, f"Ollama error: {e}"))

        return results

    def _generate(self, span: str, hint: dict, schema: dict) -> str:
        """Build and send one request.

        The ~3,000-token baseline schedule is deliberately NOT included. It
        existed only so the model could populate `alternatives` with
        plausible activity_ids, and nothing downstream reads that field:
        matching/ never references it, and server.main overwrites
        LinkedEvent.alternatives with the matcher's own candidates.
        Re-sending it per span cost more than the inference itself - the
        first call of every run stalled past its timeout on prefill - to
        produce information no consumer uses. Linking is the matcher's job,
        not the model's.
        """
        import urllib.request

        prompt = (
            f"Text: {span}\n"
            f"Deterministic pre-extracted hints: {json.dumps(hint, default=str)}\n\n"
            "Produce one structured event for this text."
        )
        payload = json.dumps({
            "model": self.model,
            "system": SYSTEM_PROMPT,
            "prompt": prompt,
            "stream": False,
            # Hybrid reasoning off: the think block breaks structured output.
            "think": self.think,
            # Grammar-constrained decoding against our Pydantic schema.
            "format": schema,
            "options": {
                "temperature": self.temperature,
                "num_ctx": self.num_ctx,
            },
        }).encode()

        req = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read())

        if data.get("thinking"):
            logger.warning(
                "Model emitted a think block despite think=false (%d chars)",
                len(data["thinking"]),
            )
        return data.get("response", "{}")

    def _parse(self, raw: str, span: str) -> LLMEventOutput:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            return self._fallback(span, f"Non-JSON response: {e}")
        if isinstance(parsed, dict) and "events" in parsed:
            events = parsed["events"]
            parsed = events[0] if events else {}
        parsed.setdefault("raw_text", span)
        try:
            return LLMEventOutput(**parsed)
        except Exception as e:
            return self._fallback(span, f"Schema mismatch: {e}")

    @staticmethod
    def _fallback(span: str, reason: str) -> LLMEventOutput:
        return LLMEventOutput(
            raw_text=span,
            activity_description="",
            discipline="unknown",
            status="unknown",
            reasoning=reason,
        )


# ── Configuration (.env) ─────────────────────────────────────────────────────

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def _env(key: str, default: str) -> str:
    """Read config with precedence: real environment, then .env, then default.

    The .env file is read on every call rather than cached, so the provider
    can be switched between runs without restarting the server.
    """
    if key in os.environ:
        return os.environ[key]
    try:
        from dotenv import dotenv_values
        return dotenv_values(ENV_PATH).get(key) or default
    except Exception:
        return default


def make_backend_from_env() -> LLMBackend:
    """Build the extraction backend named by EXTRACTION_PROVIDER.

    Defaults to rules-only. The LLM path is opt-in: an unset or unrecognised
    provider, an unreachable Ollama, or a model that is not pulled all fall
    back to NullBackend, so the deterministic pipeline is what runs unless
    the LLM is explicitly configured AND actually working.
    """
    provider = _env("EXTRACTION_PROVIDER", "rules").strip().lower()

    if provider in ("", "rules", "none", "null", "prepass"):
        return NullBackend()

    if provider == "ollama":
        backend = OllamaBackend(
            model=_env("OLLAMA_MODEL", "qwen3:8b"),
            base_url=_env("OLLAMA_BASE_URL", "http://localhost:11434"),
            temperature=float(_env("OLLAMA_TEMPERATURE", "0")),
            think=_env("OLLAMA_THINK", "false").strip().lower() in ("1", "true", "yes"),
            timeout=int(_env("OLLAMA_TIMEOUT", "120")),
            num_ctx=int(_env("OLLAMA_NUM_CTX", "8192")),
        )
        if not backend.is_available():
            logger.warning("EXTRACTION_PROVIDER=ollama but it is unusable; using rules-only")
            return NullBackend()
        return backend

    if provider == "openai":
        api_key = _env("OPENAI_API_KEY", "")
        if not api_key:
            logger.warning("EXTRACTION_PROVIDER=openai but OPENAI_API_KEY is unset; using rules-only")
            return NullBackend()
        return OpenAICompatibleBackend(
            api_key=api_key,
            model=_env("OPENAI_MODEL", "gpt-4o-mini"),
            base_url=_env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            temperature=float(_env("OPENAI_TEMPERATURE", "0")),
        )

    logger.warning("Unknown EXTRACTION_PROVIDER %r; using rules-only", provider)
    return NullBackend()


# ── Null backend (prepass only, no LLM) ──────────────────────────────────────

class NullBackend(LLMBackend):
    """No-op backend that returns empty LLM output. Useful for testing prepass-only."""

    def extract_events(
        self,
        text_spans: list[str],
        schedule_context: str,
        prepass_hints: list[dict],
    ) -> list[LLMEventOutput]:
        return [
            LLMEventOutput(
                raw_text=span,
                activity_description="",
                discipline="unknown",
                status="unknown",
                reasoning="No LLM backend available",
            )
            for span in text_spans
        ]

    def is_available(self) -> bool:
        return True
