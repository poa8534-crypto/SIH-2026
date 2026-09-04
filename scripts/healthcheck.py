"""Verify an installation end to end: imports, data, and all 8 endpoints.

    python -m uvicorn server.main:app --reload     # in one terminal
    python scripts/healthcheck.py                  # in another

Non-destructive. The /ingest check re-uploads a file that is already in the
database, which the duplicate-content guard rejects without writing, and the
review-resolve check probes a non-existent id expecting a 404. Neither
changes any schedule data.

Exits 0 if every check passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results: list[tuple[str, str, str]] = []


def record(name: str, ok: bool, detail: str = "") -> bool:
    results.append((PASS if ok else FAIL, name, detail))
    return ok


def skip(name: str, detail: str) -> None:
    results.append((SKIP, name, detail))


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def request(base: str, method: str, path: str, body=None, files=None, timeout=120):
    """Returns (status_code, parsed_body_or_text)."""
    url = f"{base}{path}"
    data, headers = None, {}
    if files is not None:
        name, payload = files
        boundary = uuid.uuid4().hex
        data = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
            f'filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'
        ).encode() + payload + f"\r\n--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw.decode("utf-8", "replace")


# ── Checks ───────────────────────────────────────────────────────────────────

MODULES = [
    "extraction.models", "extraction.prepass", "extraction.spreadsheet",
    "extraction.llm_backend", "extraction.extractor",
    "matching.models", "matching.textutils", "matching.schedule_index",
    "matching.retrieval", "matching.features", "matching.engine",
    "server.db", "server.schemas", "server.main",
]


def check_imports() -> bool:
    ok = True
    for mod in MODULES:
        try:
            __import__(mod)
            record(f"import {mod}", True)
        except Exception as e:                        # noqa: BLE001
            record(f"import {mod}", False, f"{type(e).__name__}: {e}")
            ok = False
    return ok


def check_dataset() -> None:
    dataset = PROJECT_ROOT / "dataset"
    required = ["baseline_schedule.json", "ground_truth.csv",
                "civil_progress.xlsx", "piping_progress.xlsx"]
    for name in required:
        record(f"dataset/{name}", (dataset / name).exists())
    dprs = sorted(dataset.glob("dpr_day_*.txt"))
    record("dataset/dpr_day_*.txt", len(dprs) >= 10, f"{len(dprs)} files")


def check_provider() -> None:
    """The LLM is optional. Absence is a PASS, not a failure."""
    from extraction.llm_backend import NullBackend, make_backend_from_env
    backend = make_backend_from_env()
    name = type(backend).__name__
    if isinstance(backend, NullBackend):
        record("extraction provider", True, "rules-only (LLM off — this is the default)")
    else:
        record("extraction provider", True, f"{name} (LLM explicitly enabled)")


def check_embedder() -> None:
    """Dense retrieval degrades gracefully; report which path is live."""
    try:
        from matching import MatchingEngine
        engine = MatchingEngine(PROJECT_ROOT / "dataset" / "baseline_schedule.json")
        neural = engine.retriever.embedder.is_neural
        record("dense retrieval", True,
               "MiniLM (offline)" if neural
               else "hashed-ngram fallback — sentence-transformers or model cache missing")
        record("schedule index", len(engine.index.records) == 120,
               f"{len(engine.index.records)} activities")
    except Exception as e:                            # noqa: BLE001
        record("dense retrieval", False, f"{type(e).__name__}: {e}")


def check_endpoints(base: str) -> None:
    status, docs = request(base, "GET", "/openapi.json", timeout=30)
    n_endpoints = sum(len(v) for v in docs["paths"].values()) if status == 200 else 0
    # The expected count is pinned, not a floor: an operation appearing or
    # disappearing without anyone noticing is exactly what this check is for.
    # It read 8 long after the surface had grown to 30 (D-072 counted them),
    # so the check had been failing on every run regardless of server health.
    expected_endpoints = 34
    record("GET  /openapi.json (/docs)", status == 200 and n_endpoints == expected_endpoints,
           f"{n_endpoints} endpoints exposed, expected {expected_endpoints}")

    # 1. GET /schedule
    status, body = request(base, "GET", "/schedule")
    ok = status == 200 and body.get("total_activities", 0) == 120
    record("GET  /schedule", ok,
           f"{body.get('total_activities')} activities, "
           f"{body.get('activities_with_actuals')} with actuals" if status == 200 else str(body)[:80])

    # 2. GET /review-queue
    status, body = request(base, "GET", "/review-queue")
    record("GET  /review-queue", status == 200 and isinstance(body, list),
           f"{len(body)} pending" if isinstance(body, list) else str(body)[:80])

    # 3. POST /ingest — duplicate content, rejected without writing
    sample = PROJECT_ROOT / "dataset" / "dpr_day_01.txt"
    status, body = request(base, "POST", "/ingest",
                           files=(sample.name, sample.read_bytes()), timeout=300)
    record("POST /ingest", status == 200 and "job_id" in body,
           str(body.get("message", body))[:70])
    job_id = body.get("job_id") if isinstance(body, dict) else None

    # 4. GET /jobs/{id}
    if job_id:
        status, body = request(base, "GET", f"/jobs/{job_id}")
        record("GET  /jobs/{id}", status == 200 and "events" in body,
               f"{len(body.get('events', []))} events" if status == 200 else str(body)[:70])
    else:
        skip("GET  /jobs/{id}", "no job id from /ingest")

    # 5. POST /review/{id}/resolve — liveness probe, expects 404
    status, _ = request(base, "POST", "/review/00000000-0000-0000-0000-000000000000/resolve",
                        body={"action": "ignore"})
    record("POST /review/{id}/resolve", status == 404, "404 on unknown id, as expected")

    # 6. POST /schedule/export
    status, body = request(base, "POST", "/schedule/export",
                           body={"format": "pmxml", "include_actuals": True})
    record("POST /schedule/export", status == 200,
           str(body)[:70] if status != 200 else "pmxml (xer also supported)")

    # 7. GET /memory/query
    status, body = request(base, "GET", "/memory/query?query_type=delay_reasons")
    record("GET  /memory/query", status == 200, str(body)[:70] if status != 200 else "ok")

    # 8. POST /agent/turn
    status, body = request(base, "POST", "/agent/turn",
                           body={"session_id": f"healthcheck-{uuid.uuid4().hex[:8]}",
                                 "message": "poured 20 m3 at the pipe rack pedestals today"})
    record("POST /agent/turn", status == 200, str(body)[:70] if status != 200 else "ok")


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify the installation")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--offline", action="store_true",
                    help="skip the endpoint checks (no running server)")
    args = ap.parse_args()

    print("=" * 72)
    print("  EPC progress tracker — health check")
    print("=" * 72)

    t0 = time.time()
    imports_ok = check_imports()
    check_dataset()
    if imports_ok:
        check_provider()
        check_embedder()

    if args.offline:
        skip("endpoints", "--offline")
    elif not imports_ok:
        skip("endpoints", "imports failed; fix those first")
    else:
        try:
            request(args.base_url, "GET", "/openapi.json", timeout=5)
            check_endpoints(args.base_url)
        except Exception as e:                        # noqa: BLE001
            record(f"server at {args.base_url}", False,
                   f"unreachable ({type(e).__name__}) — start it with: "
                   "python -m uvicorn server.main:app --reload")

    width = max(len(name) for _, name, _ in results) + 2
    print()
    for state, name, detail in results:
        print(f"  [{state}] {name:<{width}}{detail}")

    n_fail = sum(1 for s, _, _ in results if s == FAIL)
    n_pass = sum(1 for s, _, _ in results if s == PASS)
    n_skip = sum(1 for s, _, _ in results if s == SKIP)
    print()
    print("=" * 72)
    print(f"  {n_pass} passed, {n_fail} failed, {n_skip} skipped  ({time.time() - t0:.1f}s)")
    print("=" * 72)
    return 1 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
