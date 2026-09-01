#!/usr/bin/env python3
"""Validate checksums, provenance labels, formats, counts, and corpus separation."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
REAL_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
RAW_ROOT = REAL_ROOT / "raw"
NORMALIZED_ROOT = REAL_ROOT / "normalized"
LABELS_ROOT = REAL_ROOT / "labels"
MANIFESTS_ROOT = REAL_ROOT / "manifests"
REPORTS_ROOT = REAL_ROOT / "reports"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}:{line_number}: {exc}") from exc
    return rows


def csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    payload = path.read_bytes()
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = payload.decode(encoding)
        except UnicodeDecodeError:
            continue
        lines = text.splitlines(keepends=True)
        reader = csv.DictReader(lines)
        return list(reader.fieldnames or []), list(reader)
    raise ValueError(f"Unable to decode CSV: {path}")


def format_bytes(value: int) -> str:
    units = ["B", "KiB", "MiB", "GiB"]
    amount = float(value)
    for unit in units:
        if amount < 1024 or unit == units[-1]:
            return f"{amount:.2f} {unit}"
        amount /= 1024
    return f"{value} B"


class Validator:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.checks: list[dict[str, Any]] = []

    def check(self, condition: bool, name: str, detail: Any) -> None:
        self.checks.append({"name": name, "passed": bool(condition), "detail": detail})
        if not condition:
            self.errors.append(f"{name}: {detail}")

    def warn(self, condition: bool, message: str) -> None:
        if not condition:
            self.warnings.append(message)


def validate_artifacts(validator: Validator) -> tuple[list[dict[str, Any]], int]:
    manifest_path = MANIFESTS_ROOT / "artifacts.jsonl"
    artifacts = read_jsonl(manifest_path)
    validator.check(len(artifacts) == 124, "artifact_manifest_count", {"expected": 124, "actual": len(artifacts)})
    seen_paths: set[str] = set()
    total_bytes = 0
    hash_groups: dict[str, list[str]] = {}
    for row in artifacts:
        raw_relative = row.get("native_relative_path", "")
        validator.check(raw_relative not in seen_paths, "unique_artifact_path", raw_relative)
        seen_paths.add(raw_relative)
        path = REAL_ROOT / raw_relative
        validator.check(path.is_file(), "artifact_exists", raw_relative)
        if not path.is_file():
            continue
        digest = sha256_file(path)
        total_bytes += path.stat().st_size
        validator.check(row.get("data_origin") == "real" and row.get("is_real") is True, "artifact_real_marker", raw_relative)
        validator.check(digest == row.get("sha256"), "artifact_sha256", raw_relative)
        validator.check(path.stat().st_size == row.get("byte_count"), "artifact_byte_count", raw_relative)
        if path.suffix.lower() == ".pdf":
            validator.check(path.read_bytes()[:5] == b"%PDF-", "pdf_magic_bytes", raw_relative)
        sidecar = path.with_name(path.name + ".provenance.json")
        validator.check(sidecar.is_file(), "artifact_sidecar_exists", sidecar.relative_to(REAL_ROOT).as_posix())
        if sidecar.is_file():
            sidecar_row = json.loads(sidecar.read_text(encoding="utf-8"))
            validator.check(sidecar_row == row, "artifact_sidecar_matches_manifest", raw_relative)
        staging_relative = row.get("source_staging_relative_path")
        if staging_relative:
            staging_path = REPO_ROOT / staging_relative
            validator.check(staging_path.is_file(), "staging_source_exists", staging_relative)
            if staging_path.is_file():
                validator.check(sha256_file(staging_path) == digest, "raw_is_byte_identical_to_staging", raw_relative)
        hash_groups.setdefault(digest, []).append(raw_relative)

    for row in artifacts:
        expected_group = sorted(hash_groups[row["sha256"]])
        declared = row.get("duplicate_paths", []) or []
        if len(expected_group) == 1:
            validator.check(not declared and row.get("duplicate_group_size") == 1, "unique_artifact_duplicate_declaration", row["native_relative_path"])
        else:
            validator.check(declared == expected_group, "duplicate_group_declaration", row["native_relative_path"])
            validator.check(row.get("duplicate_canonical_path") == expected_group[0], "duplicate_canonical_declaration", row["native_relative_path"])
    validator.check(total_bytes == 263_579_199, "raw_byte_total", {"expected": 263_579_199, "actual": total_bytes})
    return artifacts, total_bytes


def validate_real_markers(validator: Validator) -> None:
    csv_paths = sorted(
        path for base in (NORMALIZED_ROOT, LABELS_ROOT)
        for path in base.rglob("*.csv")
    )
    for path in csv_paths:
        if "uniclass/snapshot_2022/native_csv" in path.as_posix():
            sidecar = path.with_name(path.name + ".provenance.json")
            validator.check(sidecar.is_file(), "uniclass_identity_csv_sidecar", path.relative_to(REAL_ROOT).as_posix())
            if sidecar.is_file():
                value = json.loads(sidecar.read_text(encoding="utf-8"))
                validator.check(value.get("data_origin") == "real", "uniclass_sidecar_real_marker", path.name)
                validator.check(value.get("content_preservation", "").startswith("byte-for-byte"), "uniclass_no_derivative_content_policy", path.name)
            continue
        fields, rows = csv_rows(path)
        validator.check("data_origin" in fields and "is_real" in fields, "csv_real_marker_columns", path.relative_to(REAL_ROOT).as_posix())
        bad_rows = [index for index, row in enumerate(rows, start=2) if row.get("data_origin") != "real" or row.get("is_real", "").lower() != "true"]
        validator.check(not bad_rows, "csv_real_marker_values", {"file": path.relative_to(REAL_ROOT).as_posix(), "bad_rows": bad_rows[:10]})

    for path in sorted(NORMALIZED_ROOT.rglob("*.jsonl")) + sorted(MANIFESTS_ROOT.glob("*.jsonl")):
        rows = read_jsonl(path)
        bad_rows = [index for index, row in enumerate(rows, start=1) if row.get("data_origin") != "real" or row.get("is_real") is not True]
        validator.check(not bad_rows, "jsonl_real_marker_values", {"file": path.relative_to(REAL_ROOT).as_posix(), "bad_rows": bad_rows[:10]})

    for path in sorted(NORMALIZED_ROOT.rglob("*.json")) + [MANIFESTS_ROOT / "dataset_summary.json"]:
        value = json.loads(path.read_text(encoding="utf-8"))
        validator.check(value.get("data_origin") == "real" and value.get("is_real") is True, "json_real_marker", path.relative_to(REAL_ROOT).as_posix())


def validate_counts(validator: Validator) -> dict[str, int]:
    checks: dict[str, tuple[int, str, str]] = {
        "paimana_project_month_rows": (18_601, "csv", "normalized/paimana/project_months.csv"),
        "paimana_unique_projects": (2_243, "jsonl", "normalized/paimana/projects_latest_available.jsonl"),
        "constructcie_narratives": (530, "csv", "normalized/constructcie/accident_narratives.csv"),
        "constructcie_causal_spans": (3_520, "csv", "labels/constructcie/causal_spans.csv"),
        "constructcie_classifications": (1_580, "csv", "labels/constructcie/classifications.csv"),
        "safety_risk_rows": (466, "csv", "normalized/safety_risk_library/risk_treatments.csv"),
        "cfihos_core_rows": (43_753, "jsonl", "normalized/cfihos/v2.0/all_core_tables.jsonl"),
        "cpwd_em_item_rows": (1_661, "csv", "normalized/cpwd/dsr_em_2025/item_rates.csv"),
        "wsdot_schedule_snapshot_rows": (54, "csv", "normalized/schedules/wsdot_c8078_schedule_snapshots.csv"),
        "hard_negative_rows": (100, "csv", "labels/hard_negatives_cross_source.csv"),
        "wsdot_ocr_pages": (73, "jsonl", "normalized/wsdot/C8078/idr_pages_ocr.jsonl"),
        "wsdot_ocr_lines": (4_315, "csv", "normalized/wsdot/C8078/idr_ocr_lines.csv"),
        "wsdot_activity_mentions": (13, "csv", "labels/wsdot/C8078_activity_mentions_machine_candidates.csv"),
    }
    actuals: dict[str, int] = {}
    for name, (expected, kind, relative) in checks.items():
        path = REAL_ROOT / relative
        if kind == "csv":
            _, rows = csv_rows(path)
            actual = len(rows)
        else:
            actual = len(read_jsonl(path))
        actuals[name] = actual
        validator.check(actual == expected, name, {"expected": expected, "actual": actual})

    idr_count = len(list((RAW_ROOT / "wsdot" / "C8078" / "idrs").glob("*.pdf")))
    flash_count = len(list((RAW_ROOT / "mospi_paimana" / "paimana_flash_reports").glob("*.pdf")))
    cpwd_pdf_count = len(list((RAW_ROOT / "cpwd").glob("*.pdf")))
    validator.check(idr_count == 21, "canonical_wsdot_idr_pdf_count", {"expected": 21, "actual": idr_count})
    validator.check(flash_count == 13, "paimana_flash_report_pdf_count", {"expected": 13, "actual": flash_count})
    validator.check(cpwd_pdf_count == 3, "cpwd_dsr_pdf_count", {"expected": 3, "actual": cpwd_pdf_count})

    _, schedule_rows = csv_rows(NORMALIZED_ROOT / "schedules" / "wsdot_c8078_schedule_snapshots.csv")
    unique_ids = {row["activity_id"] for row in schedule_rows}
    validator.check(len(unique_ids) == 27, "wsdot_distinct_schedule_activity_ids", {"expected": 27, "actual": len(unique_ids)})
    return actuals


def validate_separation_and_status(validator: Validator) -> None:
    forbidden = [
        path.relative_to(REAL_ROOT).as_posix()
        for path in REAL_ROOT.rglob("*")
        if path.is_file() and path.name.lower() in {"paimana_cookies.txt", "cookies.txt", "cookie.txt"}
    ]
    validator.check(not forbidden, "no_session_cookie_files", forbidden)
    validator.check(not (RAW_ROOT / "synthetic").exists(), "no_synthetic_raw_collection", "raw/synthetic must not exist")

    _, hard_rows = csv_rows(LABELS_ROOT / "hard_negatives_cross_source.csv")
    source_counts: dict[str, int] = {}
    for row in hard_rows:
        source_counts[row["source_file"]] = source_counts.get(row["source_file"], 0) + 1
    validator.check(
        source_counts == {
            "raw/constructcie/constructcie.json": 50,
            "raw/safety_risk_library/v1/Safety Risk Library dataset.csv": 50,
        },
        "balanced_hard_negative_sources",
        source_counts,
    )
    validator.check(
        all(row.get("verification_status") == "rule_based_unverified" for row in hard_rows),
        "hard_negatives_not_mislabeled_as_gold",
        "all rows must remain rule_based_unverified",
    )

    _, mention_rows = csv_rows(LABELS_ROOT / "wsdot" / "C8078_activity_mentions_machine_candidates.csv")
    validator.check(
        all(row.get("verification_status") == "machine_candidate_unverified" for row in mention_rows),
        "wsdot_ocr_candidates_not_mislabeled_as_gold",
        "all rows must remain machine_candidate_unverified",
    )


def write_reports(validator: Validator, total_bytes: int, counts: dict[str, int]) -> dict[str, Any]:
    REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": "real-corpus-validation-v1",
        "validated_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_origin": "real",
        "is_real": True,
        "passed": not validator.errors,
        "error_count": len(validator.errors),
        "warning_count": len(validator.warnings),
        "raw_bytes": total_bytes,
        "counts": counts,
        "checks": validator.checks,
        "errors": validator.errors,
        "warnings": validator.warnings,
    }
    (REPORTS_ROOT / "validation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    status = "PASS" if report["passed"] else "FAIL"
    lines = [
        "# Real corpus validation",
        "",
        f"**Status:** {status}",
        "",
        f"Validated raw size: {format_bytes(total_bytes)} ({total_bytes:,} bytes).",
        f"Checks: {len(validator.checks):,}; errors: {len(validator.errors)}; warnings: {len(validator.warnings)}.",
        "",
        "## Key counts",
        "",
        "| Dataset | Rows |",
        "|---|---:|",
    ]
    for name, value in sorted(counts.items()):
        lines.append(f"| `{name}` | {value:,} |")
    lines.extend(["", "## Errors", ""])
    lines.extend(f"- {message}" for message in validator.errors)
    if not validator.errors:
        lines.append("- None.")
    lines.extend(["", "## Warnings", ""])
    lines.extend(f"- {message}" for message in validator.warnings)
    if not validator.warnings:
        lines.append("- None.")
    lines.append("")
    (REPORTS_ROOT / "validation.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main() -> int:
    validator = Validator()
    _, total_bytes = validate_artifacts(validator)
    validate_real_markers(validator)
    counts = validate_counts(validator)
    validate_separation_and_status(validator)
    report = write_reports(validator, total_bytes, counts)
    print(json.dumps({
        "passed": report["passed"],
        "checks": len(report["checks"]),
        "errors": report["errors"],
        "warnings": report["warnings"],
        "counts": counts,
    }, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
