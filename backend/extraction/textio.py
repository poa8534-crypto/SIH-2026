"""Reading source documents without losing characters.

The supplied DPRs are cp1252, not UTF-8: an em-dash is the single byte 0x97,
which is not valid UTF-8 at all. Reading them as UTF-8 with errors="replace"
turned every one into U+FFFD, and because the replacement happens at ingest the
damage is permanent — it lands in LinkedEvent.raw_text, in the audit trail's
source_span, and on screen as "flange start <?> P-1002 flange boltup".

So: try the encodings a real site document is likely to be, in order, and only
fall back to lossy decoding if none of them work.
"""

from pathlib import Path

# utf-8-sig first so a BOM is consumed rather than becoming a leading \ufeff.
# cp1252 before latin-1 because it maps 0x80-0x9f to real punctuation (em-dash,
# curly quotes) where latin-1 maps them to control characters; latin-1 is last
# because it accepts any byte and would otherwise mask the others.
_ENCODINGS = ("utf-8-sig", "cp1252", "latin-1")


def read_text(path: str | Path) -> str:
    """Read a text document, preserving every character it actually contains."""
    raw = Path(path).read_bytes()
    for encoding in _ENCODINGS:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    # Unreachable with latin-1 in the list, but keep the file readable rather
    # than raising during a demo.
    return raw.decode("utf-8", errors="replace")


def read_json_text(path: str | Path) -> str:
    """Read a JSON document. Same rules, named separately for intent."""
    return read_text(path)
