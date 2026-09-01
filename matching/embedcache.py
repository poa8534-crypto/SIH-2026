"""On-disk cache for the activity-embedding matrix.

The 218 activity descriptions never change between runs, yet every process
re-encoded them: 347 ms of the cold start on the v2 baseline, paid again on
every server restart, every eval run and every worker process.

The cache is keyed by the CONTENT that produced the matrix — model name plus a
sha256 over the exact document strings — not by the file path. That makes
invalidation automatic and total: edit one activity description, add an
activity, or switch embedding models, and the key changes, so a stale matrix
can never be served. A file-path or mtime key would not have that property.

The matrix is written as a plain .npy and read back with `mmap_mode="r"`, so a
second process pays page-cache faults rather than a decode.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

#: Overridable so tests and CI never write into a developer's checkout.
ENV_CACHE_DIR = "NAVIS_EMBED_CACHE"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "embeddings"


def cache_dir() -> Path:
    return Path(os.environ.get(ENV_CACHE_DIR) or DEFAULT_CACHE_DIR)


def content_key(model_name: str, docs: list[str], dim_hint: int | None = None) -> str:
    """Stable key over the exact inputs that determine the matrix."""
    h = hashlib.sha256()
    h.update(model_name.encode("utf-8"))
    h.update(b"\x00")
    if dim_hint is not None:
        h.update(str(dim_hint).encode("utf-8"))
    h.update(b"\x00")
    for d in docs:
        h.update(d.encode("utf-8"))
        h.update(b"\x1f")          # unit separator: 'ab','c' != 'a','bc'
    h.update(str(len(docs)).encode("utf-8"))
    return h.hexdigest()[:32]


def load(key: str) -> np.ndarray | None:
    path = cache_dir() / f"{key}.npy"
    if not path.exists():
        return None
    try:
        return np.load(path, mmap_mode="r")
    except Exception as e:                      # truncated or foreign file
        logger.warning("embedding cache %s unreadable (%s); recomputing", path.name, e)
        try:
            path.unlink()
        except OSError:
            pass
        return None


def store(key: str, matrix: np.ndarray) -> Path | None:
    """Write atomically: a half-written .npy read by a concurrent process is
    the one failure mode a cache must not have."""
    d = cache_dir()
    tmp = None
    try:
        d.mkdir(parents=True, exist_ok=True)
        # The suffix must already be .npy: np.save APPENDS .npy to any other
        # name, which would rename a different file from the one created here
        # and leave the empty original behind.
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".npy")
        with os.fdopen(fd, "wb") as fh:
            np.save(fh, np.ascontiguousarray(matrix, dtype=np.float32),
                    allow_pickle=False)
        final = d / f"{key}.npy"
        os.replace(tmp, final)
        return final
    except OSError as e:
        logger.warning("could not write embedding cache: %s", e)
        if tmp:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        return None
