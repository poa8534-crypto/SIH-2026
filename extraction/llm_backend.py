"""LLM backend interface for structured event extraction.

Two backends behind one interface:
  - OpenAICompatibleBackend: for any OpenAI-compatible API (Claude via proxy, OpenAI, etc.)
  - OllamaBackend: local model via Ollama for offline/demo fallback

The interface takes prepass-enriched text and returns structured ExtractedEvents.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
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
    """Structured output we request from the LLM."""

    raw_text: str = Field(..., description="The progress text being analyzed")
    activity_description: str = Field(..., description="Formal description of the progress")
    tags: list[str] = Field(default_factory=list, description="Equipment/line tags mentioned")
    discipline: str = Field(..., description="One of: civil, piping, static_equipment, electrical, instrumentation, hse, unknown")
    status: str = Field(..., description="One of: completed, in_progress, not_started, delayed, unknown")
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
    """Local Ollama backend for offline/demo mode."""

    def __init__(
        self,
        model: str = "llama3.1",
        base_url: str = "http://localhost:11434",
        temperature: float = 0.0,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature

    def is_available(self) -> bool:
        try:
            import urllib.request
            with urllib.request.urlopen(f"{self.base_url}/api/tags", timeout=3) as resp:
                return resp.status == 200
        except Exception:
            return False

    def extract_events(
        self,
        text_spans: list[str],
        schedule_context: str,
        prepass_hints: list[dict],
    ) -> list[LLMEventOutput]:
        import urllib.request

        results: list[LLMEventOutput] = []

        for i, (span, hint) in enumerate(zip(text_spans, prepass_hints)):
            user_msg = (
                f"{SYSTEM_PROMPT}\n\n"
                f"SCHEDULE CONTEXT:\n{schedule_context}\n\n"
                f"Text: {span}\n"
                f"Hints: {json.dumps(hint, default=str)}\n\n"
                f'Return JSON: {{"events": [LLMEventOutput]}}'
            )

            try:
                payload = json.dumps({
                    "model": self.model,
                    "prompt": user_msg,
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": self.temperature},
                }).encode()

                req = urllib.request.Request(
                    f"{self.base_url}/api/generate",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read())

                response_text = data.get("response", "{}")
                parsed = json.loads(response_text)
                events_raw = parsed.get("events", [parsed])
                for ev in events_raw:
                    try:
                        results.append(LLMEventOutput(**ev))
                    except Exception:
                        results.append(LLMEventOutput(
                            raw_text=span,
                            activity_description="",
                            discipline="unknown",
                            status="unknown",
                            reasoning="Parse error from Ollama",
                        ))
            except Exception as e:
                logger.warning(f"Ollama call failed for span {i}: {e}")
                results.append(LLMEventOutput(
                    raw_text=span,
                    activity_description="",
                    discipline="unknown",
                    status="unknown",
                    reasoning=f"Ollama error: {e}",
                ))

        return results


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
