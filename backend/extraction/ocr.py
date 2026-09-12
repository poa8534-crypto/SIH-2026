"""Optical Character Recognition (OCR) and Vision transcription for scanned site diaries.

Supports:
  1. Local Tesseract (via pytesseract if installed)
  2. Gemini Vision (via Google AI REST API with GEMINI_API_KEY)
  3. OpenAI Vision (via OPENAI_API_KEY)
  4. Graceful fallback with clear diagnostic messages
"""

from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.request
from io import BytesIO
from typing import Optional

logger = logging.getLogger(__name__)


class OCRUnavailableError(Exception):
    """Raised when an image/scanned document requires OCR but no engine is active."""
    pass


def is_ocr_available() -> bool:
    """Check if any OCR or Vision transcription engine is configured."""
    if os.environ.get("GEMINI_API_KEY"):
        return True
    if os.environ.get("OPENAI_API_KEY"):
        return True
    try:
        import pytesseract  # type: ignore
        return True
    except ImportError:
        pass
    return False


def ocr_image_bytes(image_bytes: bytes, mime_type: str = "image/png") -> str:
    """Transcribe text from image bytes using the best available engine.

    Args:
        image_bytes: Raw bytes of the image (.png, .jpg, etc.)
        mime_type: MIME type of the image

    Returns:
        Transcribed plain text lines.
    """
    # 1. Try local pytesseract if installed
    try:
        import pytesseract  # type: ignore
        from PIL import Image

        img = Image.open(BytesIO(image_bytes))
        text = pytesseract.image_to_string(img)
        if text.strip():
            return text.strip()
    except (ImportError, Exception) as e:
        logger.debug("Pytesseract not usable: %s", e)

    # 2. Try Gemini Vision if GEMINI_API_KEY is present
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        try:
            return _transcribe_with_gemini(image_bytes, mime_type, gemini_key)
        except Exception as e:
            logger.warning("Gemini Vision OCR failed: %s", e)

    # 3. Try OpenAI Vision if OPENAI_API_KEY is present
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        try:
            return _transcribe_with_openai(image_bytes, mime_type, openai_key)
        except Exception as e:
            logger.warning("OpenAI Vision OCR failed: %s", e)

    raise OCRUnavailableError(
        "Scanned site document detected, but no OCR engine is active. "
        "Provide GEMINI_API_KEY or install pytesseract to enable AI/OCR transcription."
    )


def _transcribe_with_gemini(image_bytes: bytes, mime_type: str, api_key: str) -> str:
    """Transcribe scanned site diary using Google Gemini Vision."""
    b64_data = base64.b64encode(image_bytes).decode("utf-8")
    model = os.environ.get("GEMINI_VISION_MODEL", "gemini-1.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    prompt = (
        "You are an OCR specialist transcribing an Oil & Gas / EPC site daily progress report "
        "or construction site diary. Transcribe all text, activity descriptions, dates, quantities, "
        "equipment tags, and progress notes accurately. Preserve line breaks and tabular layout. "
        "Return plain text transcription only with no markdown or intro."
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_data,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 2048,
        },
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        candidates = res_data.get("candidates", [])
        if candidates and "content" in candidates[0]:
            parts = candidates[0]["content"].get("parts", [])
            return "\n".join(p.get("text", "") for p in parts).strip()

    return ""


def _transcribe_with_openai(image_bytes: bytes, mime_type: str, api_key: str) -> str:
    """Transcribe scanned site diary using OpenAI Vision API."""
    b64_data = base64.b64encode(image_bytes).decode("utf-8")
    url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
    model = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o-mini")

    payload = {
        "model": model,
        "temperature": 0.0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Transcribe all text from this EPC construction daily report / site diary. "
                            "Preserve dates, quantities, tags, and progress notes."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{b64_data}"},
                    },
                ],
            }
        ],
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        choices = res_data.get("choices", [])
        if choices and "message" in choices[0]:
            return choices[0]["message"].get("content", "").strip()

    return ""
