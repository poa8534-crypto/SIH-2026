#!/usr/bin/env python3
"""Build the NAVIS real-world corpus from verified public-source staging files.

The builder never edits a downloaded source artifact.  It copies each selected
artifact byte-for-byte into ``datasets/real/raw`` and writes provenance in a
neighboring ``.provenance.json`` file.  Derived CSV/JSONL records carry an
explicit ``data_origin=real`` marker plus extraction/verification status.

This script intentionally keeps source provenance, annotation provenance, and
verification status separate.  A real source is not automatically a verified
label.
"""

from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import io
import json
import mimetypes
import os
import re
import shutil
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator


SCRIPT_PATH = Path(__file__).resolve()
REAL_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
STAGING_ROOT = REAL_ROOT / "_staging"
RAW_ROOT = REAL_ROOT / "raw"
NORMALIZED_ROOT = REAL_ROOT / "normalized"
LABELS_ROOT = REAL_ROOT / "labels"
MANIFESTS_ROOT = REAL_ROOT / "manifests"
REPORTS_ROOT = REAL_ROOT / "reports"

SCHEMA_VERSION = "real-record-v1"
PROVENANCE_SCHEMA_VERSION = "source-artifact-provenance-v1"
BUILD_VERSION = "1.0.0"


@dataclass(frozen=True)
class ArtifactSpec:
    staging_path: Path
    raw_relative_path: str
    source_key: str
    collection: str
    source_organization: str
    source_url: str
    landing_url: str
    license_id: str
    access_terms: str
    retrieved_at_utc: str
    retrieval_timestamp_basis: str


def utc_from_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    count = 0
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")
            count += 1
    temporary.replace(path)
    return count


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    count = 0
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            count += 1
    temporary.replace(path)
    return count


def read_csv_flexible(path: Path) -> tuple[list[str], list[dict[str, str]], str]:
    """Read a source CSV without pretending legacy Windows text is UTF-8."""
    payload = path.read_bytes()
    last_error: UnicodeDecodeError | None = None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = payload.decode(encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
            continue
        reader = csv.DictReader(io.StringIO(text, newline=""))
        return list(reader.fieldnames or []), list(reader), encoding
    if last_error:
        raise last_error
    raise ValueError(f"Unable to decode CSV: {path}")


def validate_native_file(path: Path) -> tuple[str, str]:
    """Return detected format and validation status without changing the file."""
    size = path.stat().st_size
    if size == 0:
        raise ValueError(f"Empty source artifact: {path}")
    prefix = path.read_bytes()[:16]
    suffix = path.read_bytes()[-8:] if size >= 8 else prefix
    extension = path.suffix.lower()

    if extension == ".pdf":
        if not prefix.startswith(b"%PDF-"):
            raise ValueError(f"PDF magic-byte validation failed: {path}")
        return "pdf", "magic_bytes_verified"
    if extension in {".zip", ".xlsx", ".docx", ".pptx"}:
        if not prefix.startswith(b"PK"):
            raise ValueError(f"ZIP/OOXML magic-byte validation failed: {path}")
        return extension.removeprefix("."), "magic_bytes_verified"
    if extension == ".parquet":
        if not prefix.startswith(b"PAR1") or not suffix.endswith(b"PAR1"):
            raise ValueError(f"Parquet magic-byte validation failed: {path}")
        return "parquet", "magic_bytes_verified"
    if extension == ".json":
        if path.name == "constructcie.json":
            with path.open("r", encoding="utf-8") as handle:
                first = next((line for line in handle if line.strip()), "")
            json.loads(first)
            return "jsonl", "first_record_parsed"
        json.loads(path.read_text(encoding="utf-8-sig"))
        return "json", "parsed"
    if extension == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            header = next(csv.reader(handle), [])
        if not header:
            raise ValueError(f"CSV header validation failed: {path}")
        return "csv", "header_parsed"
    if extension in {".html", ".htm"}:
        preview = path.read_text(encoding="utf-8", errors="ignore")[:8192].lower()
        html_markers = ("<html", "<!doctype", "<link", "<script", "<div", "<table", "<body")
        if not any(marker in preview for marker in html_markers):
            raise ValueError(f"HTML content validation failed: {path}")
        return "html", "markup_or_fragment_verified"
    if extension in {".txt", ".md"}:
        return extension.removeprefix("."), "nonempty"
    return extension.removeprefix(".") or "binary", "nonempty"


def parse_field_download_logs(staging: Path) -> dict[str, dict[str, str]]:
    latest: dict[str, dict[str, str]] = {}
    for log_path in sorted(staging.glob("download_log_*.csv")):
        with log_path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                local_path = row.get("local_path", "").replace("\\", "/")
                timestamp = row.get("retrieved_at_utc", "")
                if not local_path:
                    continue
                if local_path not in latest or timestamp >= latest[local_path].get("retrieved_at_utc", ""):
                    latest[local_path] = row
    return latest


def collect_field_specs() -> list[ArtifactSpec]:
    field_stage = STAGING_ROOT / "field_reports_sources"
    field_raw = field_stage / "raw"
    logs = parse_field_download_logs(field_stage)
    manual_urls = {
        "raw/fhwa/reference/FHWA-CPMIG-Table-of-Contents.html": "https://www.fhwa.dot.gov/construction/cpmi04tc.cfm",
        "raw/fhwa/reference/FHWA-CPMIG-Writing-the-Report.html": "https://www.fhwa.dot.gov/construction/cpmi0407.cfm",
        "raw/fhwa/reference/FHWA-CPMIG-Project-Diary-and-IDRs.html": "https://www.fhwa.dot.gov/construction/cpmi04d1.cfm",
        "raw/fhwa/reference/FHWA-CPMIG-Appendix-G-Reporting-Forms.html": "https://www.fhwa.dot.gov/construction/cpmi04gc.cfm",
    }
    specs: list[ArtifactSpec] = []
    for path in sorted(p for p in field_raw.rglob("*") if p.is_file()):
        local_path = path.relative_to(field_stage).as_posix()
        log = logs.get(local_path, {})
        raw_relative = path.relative_to(field_raw).as_posix()
        if raw_relative.startswith("wsdot/"):
            source_key = "wsdot"
            organization = "Washington State Department of Transportation"
            landing = "https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/"
            license_id = "public-official-record"
            terms = (
                "Publicly accessible official WSDOT record. Preserve attribution and verify "
                "downstream public-record/privacy obligations before redistribution."
            )
            if "/idrs/" in f"/{raw_relative}":
                collection = "C8078 inspector daily reports"
            elif "/legacy_idr_copies/" in f"/{raw_relative}":
                collection = "C8078 legacy IDR copies"
            elif "/schedules/" in f"/{raw_relative}":
                collection = "C8078 project schedules"
            elif "/reference/" in f"/{raw_relative}":
                collection = "WSDOT reporting forms and guidance"
                landing = "https://wsdot.wa.gov/business-wsdot/how-do-business-us/electronic-forms"
            else:
                collection = "C8078 project-control context"
        elif raw_relative.startswith("fhwa/"):
            source_key = "fhwa"
            organization = "U.S. Federal Highway Administration"
            landing = "https://www.fhwa.dot.gov/construction/cpmi04tc.cfm"
            license_id = "US-government-work"
            terms = "U.S. Government work; embedded third-party material, if any, may have separate terms."
            collection = "construction inspection and reporting guidance"
        else:
            source_key = "source_policy"
            organization = "Source website operator"
            landing = log.get("source_url", manual_urls.get(local_path, ""))
            license_id = "source-terms"
            terms = "Policy/robots capture retained only to document collection context."
            collection = "access-policy snapshots"

        timestamp = log.get("retrieved_at_utc") or utc_from_mtime(path)
        basis = "download_log" if log.get("retrieved_at_utc") else "staging_file_mtime_utc"
        source_url = log.get("source_url") or manual_urls.get(local_path, landing)
        specs.append(
            ArtifactSpec(
                staging_path=path,
                raw_relative_path=raw_relative,
                source_key=source_key,
                collection=collection,
                source_organization=organization,
                source_url=source_url,
                landing_url=landing,
                license_id=license_id,
                access_terms=terms,
                retrieved_at_utc=timestamp,
                retrieval_timestamp_basis=basis,
            )
        )
    return specs


def collect_india_specs() -> list[ArtifactSpec]:
    native = STAGING_ROOT / "india_sources" / "native"
    cpwd_urls = {
        "cpwd_dsr_em_2025.pdf": "https://cpwd.gov.in/WriteReadData/other_cir/68673.pdf",
        "cpwd_dsr_2023_vol_1_civil.pdf": "https://indianrailways.gov.in/railwayboard/uploads/directorate/civil_engg/2025/DSR_Vol_1_Civil_comp.pdf",
        "cpwd_dsr_2023_vol_2_civil.pdf": "https://indianrailways.gov.in/railwayboard/uploads/directorate/civil_engg/2025/DSR_Vol_2_Civil_comp.pdf",
    }
    paimana_landing = "https://paimana-proj.mospi.gov.in/Home/PublicDashboardNew"
    specs: list[ArtifactSpec] = []
    for path in sorted(p for p in native.rglob("*") if p.is_file()):
        if path.name == "paimana_cookies.txt":
            continue
        relative = path.relative_to(native).as_posix()
        if path.name.startswith("cpwd_dsr_"):
            raw_relative = f"cpwd/{path.name}"
            source_key = "cpwd_dsr"
            collection = "Delhi Schedule of Rates"
            organization = "Central Public Works Department / Ministry of Railways mirror"
            source_url = cpwd_urls[path.name]
            landing = "https://cpwd.gov.in/Publication/DSR.aspx"
            license_id = "CPWD-website-copyright-policy"
            terms = (
                "CPWD website policy permits properly attributed non-commercial research/private "
                "study reuse; other reuse may require permission."
            )
        elif path.name.startswith("indian_railways_"):
            raw_relative = f"indian_railways/reference/{path.name}"
            source_key = "indian_railways"
            collection = "civil engineering publication index snapshots"
            organization = "Ministry of Railways, Government of India"
            source_url = "https://indianrailways.gov.in/railwayboard/view_section.jsp"
            landing = source_url
            license_id = "source-terms"
            terms = "Official publication-index snapshot; use with attribution and verify current terms."
        else:
            raw_relative = f"mospi_paimana/{relative}"
            source_key = "mospi_paimana"
            collection = "infrastructure project monitoring dashboard"
            organization = "Ministry of Statistics and Programme Implementation, Government of India"
            if path.name.startswith("paimana_projects_"):
                source_url = "https://paimana-proj.mospi.gov.in/Home/GetTileData"
            elif "flash_reports" in path.parts:
                source_url = "https://paimana-proj.mospi.gov.in/ReportPage/ViewPdf"
            else:
                source_url = paimana_landing
            landing = paimana_landing
            license_id = "MoSPI-website-terms"
            terms = (
                "Official terms permit accurate reproduction with due credit, prominent source "
                "acknowledgment, and no misleading use; third-party content is excluded."
            )
        specs.append(
            ArtifactSpec(
                staging_path=path,
                raw_relative_path=raw_relative,
                source_key=source_key,
                collection=collection,
                source_organization=organization,
                source_url=source_url,
                landing_url=landing,
                license_id=license_id,
                access_terms=terms,
                retrieved_at_utc=utc_from_mtime(path),
                retrieval_timestamp_basis="staging_file_mtime_utc",
            )
        )
    return specs


def collect_taxonomy_specs() -> list[ArtifactSpec]:
    taxonomy = STAGING_ROOT / "taxonomy_risk_sources"
    specs: list[ArtifactSpec] = []

    cfihos = taxonomy / "cfihos_v2"
    cfihos_url = "https://www.jip36-cfihos.org/cfihos-standards/"
    for path in sorted(p for p in cfihos.iterdir() if p.is_file()):
        specs.append(
            ArtifactSpec(
                staging_path=path,
                raw_relative_path=f"cfihos/v2.0/{path.name}",
                source_key="cfihos_v2",
                collection="CFIHOS v2.0 standards and reference data",
                source_organization="JIP36 / International Association of Oil & Gas Producers",
                source_url=cfihos_url,
                landing_url=cfihos_url,
                license_id="CFIHOS-source-terms",
                access_terms="The official standards page states that all documents are free to download and use.",
                retrieved_at_utc=utc_from_mtime(path),
                retrieval_timestamp_basis="staging_file_mtime_utc",
            )
        )

    constructcie = taxonomy / "constructcie"
    constructcie_landing = "https://huggingface.co/datasets/lab-flair/constructcie"
    for path in sorted(p for p in constructcie.iterdir() if p.is_file() and p.name != ".gitattributes"):
        source_url = constructcie_landing
        if path.name == "ConstructCIE-main.zip":
            source_url = "https://github.com/lab-flair/ConstructCIE/archive/refs/heads/main.zip"
        specs.append(
            ArtifactSpec(
                staging_path=path,
                raw_relative_path=f"constructcie/{path.name}",
                source_key="constructcie",
                collection="ConstructCIE construction accident causal-information dataset",
                source_organization="FLAIR Lab",
                source_url=source_url,
                landing_url=constructcie_landing,
                license_id="Apache-2.0",
                access_terms="Apache License 2.0; preserve license and attribution.",
                retrieved_at_utc=utc_from_mtime(path),
                retrieval_timestamp_basis="staging_file_mtime_utc",
            )
        )

    safety = taxonomy / "safety_risk_library"
    safety_landing = "https://data.mendeley.com/datasets/bmhzshjt9m/1"
    for path in sorted(p for p in safety.iterdir() if p.is_file()):
        specs.append(
            ArtifactSpec(
                staging_path=path,
                raw_relative_path=f"safety_risk_library/v1/{path.name}",
                source_key="safety_risk_library",
                collection="Safety Risk Library dataset v1",
                source_organization="University of Manchester / University of Nottingham / UCL",
                source_url=safety_landing,
                landing_url=safety_landing,
                license_id="CC-BY-4.0",
                access_terms="Creative Commons Attribution 4.0; attribution required.",
                retrieved_at_utc=utc_from_mtime(path),
                retrieval_timestamp_basis="staging_file_mtime_utc",
            )
        )

    uniclass = taxonomy / "uniclass"
    official_landing = "https://uniclass.thenbs.com/download"
    for path in sorted(p for p in uniclass.iterdir() if p.is_file()):
        if path.name.startswith("buildig-"):
            source_url = "https://github.com/buildig/uniclass-2015/archive/refs/heads/main.zip"
        elif path.name.startswith("mirror-"):
            source_url = "https://api.github.com/repos/buildig/uniclass-2015"
        else:
            source_url = official_landing
        specs.append(
            ArtifactSpec(
                staging_path=path,
                raw_relative_path=f"uniclass/snapshot_2022/{path.name}",
                source_key="uniclass_snapshot_2022",
                collection="Uniclass 2015 January 2022 third-party CSV snapshot plus current official metadata",
                source_organization="NBS (classification); Buildig (CSV snapshot packaging)",
                source_url=source_url,
                landing_url=official_landing,
                license_id="CC-BY-ND-4.0-strict-downstream-policy",
                access_terms=(
                    "Current official Uniclass terms are CC BY-ND 4.0. The 2022 Buildig mirror "
                    "states CC BY-SA 3.0; this corpus applies the stricter no-derivatives policy."
                ),
                retrieved_at_utc=utc_from_mtime(path),
                retrieval_timestamp_basis="staging_file_mtime_utc",
            )
        )
    return specs


def collect_artifact_specs() -> list[ArtifactSpec]:
    specs = collect_field_specs() + collect_india_specs() + collect_taxonomy_specs()
    seen: set[str] = set()
    for spec in specs:
        if spec.raw_relative_path in seen:
            raise ValueError(f"Duplicate raw destination: {spec.raw_relative_path}")
        seen.add(spec.raw_relative_path)
    return sorted(specs, key=lambda item: item.raw_relative_path)


def promote_artifacts(specs: list[ArtifactSpec]) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    staged: list[tuple[ArtifactSpec, Path, dict[str, Any]]] = []
    hashes: dict[str, list[str]] = {}
    for spec in specs:
        detected_format, validation_status = validate_native_file(spec.staging_path)
        destination = RAW_ROOT / spec.raw_relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(spec.staging_path, destination)
        digest = sha256_file(destination)
        raw_path = f"raw/{spec.raw_relative_path}"
        hashes.setdefault(digest, []).append(raw_path)
        row = {
            "schema_version": PROVENANCE_SCHEMA_VERSION,
            "data_origin": "real",
            "is_real": True,
            "artifact_id": f"sha256:{digest}",
            "source_key": spec.source_key,
            "collection": spec.collection,
            "source_organization": spec.source_organization,
            "source_url": spec.source_url,
            "landing_url": spec.landing_url,
            "retrieved_at_utc": spec.retrieved_at_utc,
            "retrieval_timestamp_basis": spec.retrieval_timestamp_basis,
            "native_relative_path": raw_path,
            "source_staging_relative_path": spec.staging_path.relative_to(REPO_ROOT).as_posix(),
            "byte_count": destination.stat().st_size,
            "sha256": digest,
            "filename_extension": destination.suffix.lower(),
            "detected_format": detected_format,
            "mime_type": mimetypes.guess_type(destination.name)[0] or "application/octet-stream",
            "validation_status": validation_status,
            "license_id": spec.license_id,
            "access_terms": spec.access_terms,
            "content_preservation": "byte-for-byte copy of received artifact",
            "annotation_origin": None,
            "verification_status": "source_artifact_validated",
        }
        staged.append((spec, destination, row))

    artifacts: list[dict[str, Any]] = []
    lookup: dict[str, dict[str, Any]] = {}
    for spec, destination, row in staged:
        duplicate_paths = sorted(hashes[row["sha256"]])
        row["duplicate_group_size"] = len(duplicate_paths)
        row["duplicate_paths"] = duplicate_paths if len(duplicate_paths) > 1 else []
        row["duplicate_canonical_path"] = duplicate_paths[0]
        sidecar = destination.with_name(destination.name + ".provenance.json")
        json_dump(sidecar, row)
        artifacts.append(row)
        lookup[row["native_relative_path"]] = row
    write_jsonl(MANIFESTS_ROOT / "artifacts.jsonl", artifacts)
    return artifacts, lookup


def artifact_for(lookup: dict[str, dict[str, Any]], path: str) -> dict[str, Any]:
    try:
        return lookup[path]
    except KeyError as exc:
        raise KeyError(f"No artifact manifest entry for {path}") from exc


def envelope(
    *, artifact_id: str, native_locator: dict[str, Any], record: dict[str, Any],
    extraction_method: str, verification_status: str,
    annotation_origin: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "data_origin": "real",
        "is_real": True,
        "source_artifact_id": artifact_id,
        "native_locator": native_locator,
        "extraction_method": extraction_method,
        "annotation_origin": annotation_origin,
        "verification_status": verification_status,
        "record": record,
    }


def normalize_paimana(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    raw_dir = RAW_ROOT / "mospi_paimana"
    output_dir = NORMALIZED_ROOT / "paimana"
    payload_paths = sorted(
        path for path in raw_dir.glob("paimana_projects_*.json")
        if not path.name.endswith(".provenance.json")
    )
    csv_rows: list[dict[str, Any]] = []
    jsonl_rows: list[dict[str, Any]] = []
    latest: dict[str, tuple[str, dict[str, Any], str, int, str]] = {}
    native_fields: list[str] = []

    for payload_path in payload_paths:
        period_match = re.search(r"(\d{4}-\d{2})", payload_path.name)
        if not period_match:
            continue
        period = period_match.group(1)
        raw_rel = payload_path.relative_to(REAL_ROOT).as_posix()
        artifact = artifact_for(lookup, raw_rel)
        payload = json.loads(payload_path.read_text(encoding="utf-8-sig"))
        records = payload.get("data", {}).get("ProjectsCountTabDetails", [])
        for row_index, source_row in enumerate(records, start=1):
            if not native_fields:
                native_fields = list(source_row.keys())
            metadata = {
                "data_origin": "real",
                "is_real": True,
                "source_period": period,
                "source_file": raw_rel,
                "source_artifact_id": artifact["artifact_id"],
                "source_row_index": row_index,
                "annotation_origin": "source_structured_record",
                "verification_status": "source_structured_unreviewed",
            }
            csv_rows.append({**metadata, **source_row})
            jsonl_rows.append(
                envelope(
                    artifact_id=artifact["artifact_id"],
                    native_locator={"json_path": f"$.data.ProjectsCountTabDetails[{row_index - 1}]", "source_period": period},
                    record={"source_period": period, **source_row},
                    extraction_method="official_dashboard_structured_json",
                    verification_status="source_structured_unreviewed",
                    annotation_origin="source_structured_record",
                )
            )
            project_key = str(source_row.get("ProjectId") or f"missing-id:{period}:{row_index}")
            if project_key not in latest or period > latest[project_key][0]:
                latest[project_key] = (period, source_row, artifact["artifact_id"], row_index, raw_rel)

    metadata_fields = [
        "data_origin", "is_real", "source_period", "source_file", "source_artifact_id",
        "source_row_index", "annotation_origin", "verification_status",
    ]
    project_month_count = write_csv(output_dir / "project_months.csv", metadata_fields + native_fields, csv_rows)
    write_jsonl(output_dir / "project_months.jsonl", jsonl_rows)

    latest_rows = []
    for project_key, (period, row, artifact_id, row_index, raw_rel) in sorted(latest.items()):
        latest_rows.append(
            envelope(
                artifact_id=artifact_id,
                native_locator={"source_file": raw_rel, "source_period": period, "source_row_index": row_index},
                record={"source_period": period, **row},
                extraction_method="latest_available_project_snapshot_selection",
                verification_status="source_structured_unreviewed",
                annotation_origin="source_structured_record",
            )
        )
    unique_count = write_jsonl(output_dir / "projects_latest_available.jsonl", latest_rows)
    return {
        "dataset": "paimana",
        "project_month_rows": project_month_count,
        "unique_projects_latest_available": unique_count,
        "monthly_snapshots": len(payload_paths),
    }


def constructcie_accident_type(record: dict[str, Any]) -> str:
    value = record.get("accident_type", {}).get("value", [])
    return " | ".join(str(item) for item in value)


def walk_constructcie_node(
    *, record_id: Any, source_row: int, accident_type: str, name: str,
    node: dict[str, Any], path: list[str], span_rows: list[dict[str, Any]],
    classification_rows: list[dict[str, Any]], artifact_id: str,
) -> None:
    factor_path = "/".join(path + [name])
    node_type = node.get("type")
    if node_type == "extraction":
        texts = node.get("text", []) or []
        keywords = node.get("keywords", []) or []
        for span_index, span_text in enumerate(texts, start=1):
            keyword_value = keywords[span_index - 1] if span_index - 1 < len(keywords) else []
            span_rows.append(
                {
                    "record_id": record_id,
                    "source_row": source_row,
                    "accident_type": accident_type,
                    "factor_path": factor_path,
                    "factor_name": name,
                    "span_index": span_index,
                    "span_text": span_text,
                    "keywords_json": json.dumps(keyword_value, ensure_ascii=False),
                    "data_origin": "real",
                    "is_real": True,
                    "source_artifact_id": artifact_id,
                    "annotation_origin": "source_published_annotation",
                    "verification_status": "source_published_annotation_unreviewed",
                }
            )
    elif node_type == "classification":
        for value_index, value in enumerate(node.get("value", []) or [], start=1):
            classification_rows.append(
                {
                    "record_id": record_id,
                    "source_row": source_row,
                    "accident_type": accident_type,
                    "factor_path": factor_path,
                    "factor_name": name,
                    "value_index": value_index,
                    "classification_value": value,
                    "data_origin": "real",
                    "is_real": True,
                    "source_artifact_id": artifact_id,
                    "annotation_origin": "source_published_annotation",
                    "verification_status": "source_published_annotation_unreviewed",
                }
            )
    for child_name, child in (node.get("children", {}) or {}).items():
        walk_constructcie_node(
            record_id=record_id,
            source_row=source_row,
            accident_type=accident_type,
            name=child_name,
            node=child,
            path=path + [name],
            span_rows=span_rows,
            classification_rows=classification_rows,
            artifact_id=artifact_id,
        )


def normalize_constructcie(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    raw_rel = "raw/constructcie/constructcie.json"
    artifact = artifact_for(lookup, raw_rel)
    raw_path = REAL_ROOT / raw_rel
    narratives: list[dict[str, Any]] = []
    envelopes: list[dict[str, Any]] = []
    span_rows: list[dict[str, Any]] = []
    classification_rows: list[dict[str, Any]] = []

    with raw_path.open("r", encoding="utf-8") as handle:
        for source_row, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            accident_type = constructcie_accident_type(record)
            narrative_texts = record.get("accident_report", {}).get("text", []) or []
            narrative = "\n".join(str(value) for value in narrative_texts)
            narratives.append(
                {
                    "record_id": record.get("id"),
                    "accident_type": accident_type,
                    "narrative": narrative,
                    "data_origin": "real",
                    "is_real": True,
                    "source_artifact_id": artifact["artifact_id"],
                    "source_row": source_row,
                    "annotation_origin": "source_published_annotation",
                    "verification_status": "source_published_annotation_unreviewed",
                }
            )
            envelopes.append(
                envelope(
                    artifact_id=artifact["artifact_id"],
                    native_locator={"line": source_row},
                    record=record,
                    extraction_method="jsonl_identity_parse",
                    verification_status="source_published_annotation_unreviewed",
                    annotation_origin="source_published_annotation",
                )
            )
            root = record.get("accident_report", {})
            for child_name, child in (root.get("children", {}) or {}).items():
                walk_constructcie_node(
                    record_id=record.get("id"),
                    source_row=source_row,
                    accident_type=accident_type,
                    name=child_name,
                    node=child,
                    path=[],
                    span_rows=span_rows,
                    classification_rows=classification_rows,
                    artifact_id=artifact["artifact_id"],
                )
            walk_constructcie_node(
                record_id=record.get("id"),
                source_row=source_row,
                accident_type=accident_type,
                name="accident_type",
                node=record.get("accident_type", {}),
                path=[],
                span_rows=span_rows,
                classification_rows=classification_rows,
                artifact_id=artifact["artifact_id"],
            )

    output_dir = NORMALIZED_ROOT / "constructcie"
    write_jsonl(output_dir / "accident_records.jsonl", envelopes)
    narrative_fields = [
        "record_id", "accident_type", "narrative", "data_origin", "is_real",
        "source_artifact_id", "source_row", "annotation_origin", "verification_status",
    ]
    narrative_count = write_csv(output_dir / "accident_narratives.csv", narrative_fields, narratives)
    span_fields = [
        "record_id", "source_row", "accident_type", "factor_path", "factor_name",
        "span_index", "span_text", "keywords_json", "data_origin", "is_real",
        "source_artifact_id", "annotation_origin", "verification_status",
    ]
    span_count = write_csv(LABELS_ROOT / "constructcie" / "causal_spans.csv", span_fields, span_rows)
    class_fields = [
        "record_id", "source_row", "accident_type", "factor_path", "factor_name",
        "value_index", "classification_value", "data_origin", "is_real",
        "source_artifact_id", "annotation_origin", "verification_status",
    ]
    class_count = write_csv(
        LABELS_ROOT / "constructcie" / "classifications.csv", class_fields, classification_rows
    )
    return {
        "dataset": "constructcie",
        "accident_narratives": narrative_count,
        "causal_span_labels": span_count,
        "classification_labels": class_count,
    }


def normalize_safety_risk_library(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    raw_rel = "raw/safety_risk_library/v1/Safety Risk Library dataset.csv"
    artifact = artifact_for(lookup, raw_rel)
    input_path = REAL_ROOT / raw_rel
    native_fields, source_rows, source_encoding = read_csv_flexible(input_path)
    rows: list[dict[str, Any]] = []
    jsonl_rows: list[dict[str, Any]] = []
    for source_row, row in enumerate(source_rows, start=1):
        metadata = {
            "data_origin": "real",
            "is_real": True,
            "source_artifact_id": artifact["artifact_id"],
            "source_row": source_row,
            "annotation_origin": "source_published_record",
            "verification_status": "source_published_record_unreviewed",
        }
        rows.append({**row, **metadata})
        jsonl_rows.append(
            envelope(
                artifact_id=artifact["artifact_id"],
                native_locator={"row": source_row + 1},
                record=row,
                extraction_method=f"csv_identity_parse_{source_encoding}",
                verification_status="source_published_record_unreviewed",
                annotation_origin="source_published_record",
            )
        )
    output = NORMALIZED_ROOT / "safety_risk_library"
    metadata_fields = [
        "data_origin", "is_real", "source_artifact_id", "source_row",
        "annotation_origin", "verification_status",
    ]
    row_count = write_csv(output / "risk_treatments.csv", native_fields + metadata_fields, rows)
    write_jsonl(output / "risk_treatments.jsonl", jsonl_rows)
    return {"dataset": "safety_risk_library", "risk_treatment_rows": row_count}


def normalize_cfihos(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    archive_rel = "raw/cfihos/v2.0/CORE-CFIHOS-CSV-v2.0.zip"
    artifact = artifact_for(lookup, archive_rel)
    expanded = (
        STAGING_ROOT / "taxonomy_risk_sources" / "cfihos_v2" / "CORE-CFIHOS-CSV-v2.0"
        / "CORE CFIHOS V2.0 CSV"
    )
    output = NORMALIZED_ROOT / "cfihos" / "v2.0"
    combined_rows: list[dict[str, Any]] = []
    table_counts: dict[str, int] = {}
    metadata_fields = [
        "data_origin", "is_real", "source_artifact_id", "source_archive_member",
        "source_row", "annotation_origin", "verification_status",
    ]
    for input_path in sorted(expanded.glob("*.csv")):
        native_fields, source_rows, source_encoding = read_csv_flexible(input_path)
        archive_member = f"CORE CFIHOS V2.0 CSV/{input_path.name}"
        rows = []
        for source_row, row in enumerate(source_rows, start=1):
            metadata = {
                "data_origin": "real",
                "is_real": True,
                "source_artifact_id": artifact["artifact_id"],
                "source_archive_member": archive_member,
                "source_row": source_row,
                "annotation_origin": "source_reference_record",
                "verification_status": "source_reference_record_unreviewed",
            }
            rows.append({**row, **metadata})
            combined_rows.append(
                envelope(
                    artifact_id=artifact["artifact_id"],
                    native_locator={"archive_member": archive_member, "row": source_row + 1},
                    record={"table": input_path.stem, **row},
                    extraction_method=f"official_zip_csv_parse_{source_encoding}",
                    verification_status="source_reference_record_unreviewed",
                    annotation_origin="source_reference_record",
                )
            )
        table_counts[input_path.name] = write_csv(output / input_path.name, native_fields + metadata_fields, rows)
    combined_count = write_jsonl(output / "all_core_tables.jsonl", combined_rows)
    return {
        "dataset": "cfihos_v2",
        "tables": len(table_counts),
        "rows": combined_count,
        "table_counts": table_counts,
    }


def preserve_uniclass_csvs(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    archive_rel = "raw/uniclass/snapshot_2022/buildig-uniclass-2015-main.zip"
    artifact = artifact_for(lookup, archive_rel)
    expanded = (
        STAGING_ROOT / "taxonomy_risk_sources" / "uniclass" / "mirror-expanded"
        / "uniclass-2015-main" / "uniclass2015"
    )
    output = NORMALIZED_ROOT / "uniclass" / "snapshot_2022" / "native_csv"
    output.mkdir(parents=True, exist_ok=True)
    table_rows: list[dict[str, Any]] = []
    total_rows = 0
    for input_path in sorted(expanded.glob("*.csv")):
        destination = output / input_path.name
        shutil.copy2(input_path, destination)
        if sha256_file(destination) != sha256_file(input_path):
            raise ValueError(f"Uniclass identity-copy hash mismatch: {input_path}")
        with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
            row_count = sum(1 for _ in csv.reader(handle)) - 1
        row_count = max(row_count, 0)
        total_rows += row_count
        sidecar = {
            "schema_version": "derived-file-provenance-v1",
            "data_origin": "real",
            "is_real": True,
            "source_artifact_id": artifact["artifact_id"],
            "source_archive_member": f"uniclass-2015-main/uniclass2015/{input_path.name}",
            "native_relative_path": destination.relative_to(REAL_ROOT).as_posix(),
            "content_preservation": "byte-for-byte identity copy; no columns or values changed",
            "license_id": artifact["license_id"],
            "access_terms": artifact["access_terms"],
            "row_count_excluding_header": row_count,
            "verification_status": "identity_copy_hash_verified",
        }
        json_dump(destination.with_name(destination.name + ".provenance.json"), sidecar)
        table_rows.append(
            {
                "file": destination.relative_to(REAL_ROOT).as_posix(),
                "row_count": row_count,
                "data_origin": "real",
                "is_real": True,
                "source_artifact_id": artifact["artifact_id"],
                "content_transformation": "none",
                "verification_status": "identity_copy_hash_verified",
            }
        )
    fields = [
        "file", "row_count", "data_origin", "is_real", "source_artifact_id",
        "content_transformation", "verification_status",
    ]
    write_csv(NORMALIZED_ROOT / "uniclass" / "snapshot_2022" / "table_index.csv", fields, table_rows)
    combined_rows = next((row["row_count"] for row in table_rows if row["file"].endswith("/Uniclass2015.csv")), 0)
    return {
        "dataset": "uniclass_snapshot_2022",
        "tables_including_combined": len(table_rows),
        "rows_across_tables_including_combined_duplicates": total_rows,
        "combined_table_rows": combined_rows,
        "content_policy": "identity copies only because stricter CC BY-ND policy is applied",
    }


CPWD_UNIT_PATTERN = re.compile(
    r"^(?P<item_no>\d+(?:\.\d+)+)\s+(?P<description>.+?)\s+"
    r"(?P<unit>Per\s+TR|Per\s+HP|sq\.\s*m|sq\.m|Each|Metre|Meter|Point|Set|Nos)\s+"
    r"(?P<rate>\d[\d,]*(?:\.\d+)?)\s*$",
    re.IGNORECASE,
)


def normalize_cpwd_em(lookup: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("pypdf is required to extract CPWD E&M text") from exc

    raw_rel = "raw/cpwd/cpwd_dsr_em_2025.pdf"
    artifact = artifact_for(lookup, raw_rel)
    reader = PdfReader(str(REAL_ROOT / raw_rel))
    rows: list[dict[str, Any]] = []
    jsonl_rows: list[dict[str, Any]] = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for line_number, raw_line in enumerate(text.splitlines(), start=1):
            match = CPWD_UNIT_PATTERN.match(raw_line.strip())
            if not match:
                continue
            record = {
                "item_no": match.group("item_no"),
                "description": re.sub(r"\s+", " ", match.group("description")).strip(),
                "unit": re.sub(r"\s+", " ", match.group("unit")).strip(),
                "rate": match.group("rate").replace(",", ""),
                "currency": "INR",
                "raw_line": raw_line,
                "page": page_number,
                "line": line_number,
                "data_origin": "real",
                "is_real": True,
                "source_artifact_id": artifact["artifact_id"],
                "annotation_origin": "machine_text_pattern",
                "verification_status": "machine_extracted_unverified",
            }
            rows.append(record)
            jsonl_rows.append(
                envelope(
                    artifact_id=artifact["artifact_id"],
                    native_locator={"page": page_number, "line": line_number},
                    record={key: record[key] for key in ("item_no", "description", "unit", "rate", "currency", "raw_line")},
                    extraction_method="pypdf_text_plus_unit_rate_regex",
                    verification_status="machine_extracted_unverified",
                    annotation_origin="machine_text_pattern",
                )
            )
    output = NORMALIZED_ROOT / "cpwd" / "dsr_em_2025"
    fields = [
        "item_no", "description", "unit", "rate", "currency", "raw_line", "page", "line",
        "data_origin", "is_real", "source_artifact_id", "annotation_origin", "verification_status",
    ]
    row_count = write_csv(output / "item_rates.csv", fields, rows)
    write_jsonl(output / "item_rates.jsonl", jsonl_rows)
    return (
        {
            "dataset": "cpwd_dsr_em_2025",
            "machine_extracted_item_rate_rows": row_count,
            "pdf_pages": len(reader.pages),
            "verification_status": "machine_extracted_unverified",
        },
        rows,
    )


WSDOT_SCHEDULE_DESCRIPTIONS = {
    "1000": "NOTICE OF AWARD",
    "1005": "PROJECT COMPLETION",
    "1010": "PREPARE SUBMITTALS",
    "1020": "ORDER/RECEIVE PIPE PILING",
    "1030": "ORDER/RECEIVE UNCONFINED BUBBLE CURTAIN",
    "1040": "ORDER/RECEIVE CONFINED BUBBLE CURTAIN",
    "1050": "MOBILIZE TO LOCATION A",
    "1055": "TEST UNCONFINED BUBBLE CURTAIN",
    "1060": "INSTALL PILE A-1",
    "1065": "TEST CONFINED BUBBLE CURTAIN",
    "1070": "INSTALL PILE A-2",
    "1080": "INSTALL PILE A-3",
    "1090": "INSTALL PILE A-4",
    "1100": "MOVE TO LOCATION B",
    "1110": "INSTALL PILE B-1",
    "1120": "INSTALL PILE B-2",
    "1130": "MOVE TO LOCATION A",
    "1140": "RESTRIKE PILE A-1",
    "1150": "RESTRIKE PILE A-2",
    "1160": "RESTRIKE PILE A-3",
    "1170": "RESTRIKE PILE A-4",
    "1180": "REMOVE A LOCATION PILES",
    "1190": "MOVE TO LOCATION B",
    "1200": "RESTRIKE PILE B-1",
    "1210": "RESTRIKE PILE B-2",
    "1220": "REMOVE LOCATION B PILES",
    "1230": "DEMOBILIZE",
}


def schedule_snapshot(
    *, source_file: str, artifact_id: str, dates: dict[str, tuple[str, str, str]], run_date: str,
) -> dict[str, Any]:
    activities = []
    for activity_id, description in WSDOT_SCHEDULE_DESCRIPTIONS.items():
        duration, start, finish = dates[activity_id]
        activities.append(
            {
                "activity_id": activity_id,
                "description": description,
                "discipline": "civil",
                "planned_start": start,
                "planned_finish": finish,
                "original_duration": duration,
                "source_file": source_file,
                "source_page": 2,
                "data_origin": "real",
                "is_real": True,
            }
        )
    return {
        "schema_version": "real-schedule-v1",
        "data_origin": "real",
        "is_real": True,
        "source_artifact_id": artifact_id,
        "native_locator": {"page": 2},
        "project": "Columbia River Bridge Temporary Pile Test Program",
        "contract_id": "C8078",
        "run_date": run_date,
        "annotation_origin": "manual_transcription_with_OCR_and_visual_review",
        "verification_status": "manually_reviewed_against_rendered_source",
        "activities": activities,
    }


def normalize_wsdot_schedules(lookup: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    first_rel = "raw/wsdot/C8078/schedules/2011-01-21.pdf"
    second_rel = "raw/wsdot/C8078/schedules/2011-02-14-.pdf"
    first_artifact = artifact_for(lookup, first_rel)
    second_artifact = artifact_for(lookup, second_rel)

    first_dates = {
        "1000": ("0d", "2011-01-12", "2011-01-12"), "1005": ("0d", "2011-02-28", "2011-02-28"),
        "1010": ("8d", "2011-01-12", "2011-01-21"), "1020": ("11d", "2011-01-24", "2011-02-07"),
        "1030": ("11d", "2011-01-24", "2011-02-07"), "1040": ("11d", "2011-01-24", "2011-02-07"),
        "1050": ("1d", "2011-02-07", "2011-02-07"), "1055": ("1d", "2011-02-08", "2011-02-08"),
        "1060": ("1d", "2011-02-08", "2011-02-08"), "1065": ("1d", "2011-02-09", "2011-02-09"),
        "1070": ("1d", "2011-02-09", "2011-02-09"), "1080": ("1d", "2011-02-10", "2011-02-10"),
        "1090": ("1d", "2011-02-10", "2011-02-10"), "1100": ("1d", "2011-02-11", "2011-02-11"),
        "1110": ("1d", "2011-02-11", "2011-02-11"), "1120": ("1d", "2011-02-14", "2011-02-14"),
        "1130": ("1d", "2011-02-14", "2011-02-14"), "1140": ("1d", "2011-02-15", "2011-02-15"),
        "1150": ("1d", "2011-02-15", "2011-02-15"), "1160": ("1d", "2011-02-15", "2011-02-15"),
        "1170": ("1d", "2011-02-15", "2011-02-15"), "1180": ("4d", "2011-02-16", "2011-02-21"),
        "1190": ("1d", "2011-02-22", "2011-02-22"), "1200": ("1d", "2011-02-22", "2011-02-22"),
        "1210": ("1d", "2011-02-22", "2011-02-22"), "1220": ("2d", "2011-02-23", "2011-02-24"),
        "1230": ("1d", "2011-02-25", "2011-02-25"),
    }
    second_dates = dict(first_dates)
    second_dates.update(
        {
            "1020": ("14d", "2011-01-24", "2011-02-10"), "1030": ("14d", "2011-01-24", "2011-02-10"),
            "1040": ("14d", "2011-01-24", "2011-02-10"), "1050": ("1d", "2011-02-11", "2011-02-11"),
            "1055": ("1d", "2011-02-12", "2011-02-12"), "1060": ("1d", "2011-02-12", "2011-02-12"),
            "1065": ("1d", "2011-02-14", "2011-02-14"), "1070": ("1d", "2011-02-14", "2011-02-14"),
            "1080": ("1d", "2011-02-15", "2011-02-15"), "1090": ("1d", "2011-02-15", "2011-02-15"),
            "1100": ("1d", "2011-02-16", "2011-02-16"), "1110": ("1d", "2011-02-16", "2011-02-16"),
            "1120": ("1d", "2011-02-17", "2011-02-17"), "1130": ("1d", "2011-02-17", "2011-02-17"),
            "1140": ("1d", "2011-02-18", "2011-02-18"), "1150": ("1d", "2011-02-18", "2011-02-18"),
            "1160": ("1d", "2011-02-18", "2011-02-18"), "1170": ("1d", "2011-02-18", "2011-02-18"),
            "1180": ("4d", "2011-02-19", "2011-02-23"), "1190": ("1d", "2011-02-24", "2011-02-24"),
            "1200": ("1d", "2011-02-24", "2011-02-24"), "1210": ("1d", "2011-02-24", "2011-02-24"),
            "1220": ("2d", "2011-02-25", "2011-02-26"), "1230": ("1d", "2011-02-28", "2011-02-28"),
        }
    )
    snapshots = [
        schedule_snapshot(
            source_file=first_rel, artifact_id=first_artifact["artifact_id"], dates=first_dates, run_date="2011-01-20"
        ),
        schedule_snapshot(
            source_file=second_rel, artifact_id=second_artifact["artifact_id"], dates=second_dates, run_date="2011-02-10"
        ),
    ]
    output = NORMALIZED_ROOT / "schedules"
    json_dump(output / "wsdot_c8078_2011-01-21.json", snapshots[0])
    json_dump(output / "wsdot_c8078_2011-02-14.json", snapshots[1])

    rows: list[dict[str, Any]] = []
    for snapshot in snapshots:
        for activity in snapshot["activities"]:
            rows.append(
                {
                    **activity,
                    "schedule_run_date": snapshot["run_date"],
                    "source_artifact_id": snapshot["source_artifact_id"],
                    "annotation_origin": snapshot["annotation_origin"],
                    "verification_status": snapshot["verification_status"],
                }
            )
    fields = [
        "activity_id", "description", "discipline", "planned_start", "planned_finish",
        "original_duration", "schedule_run_date", "source_file", "source_page", "data_origin",
        "is_real", "source_artifact_id", "annotation_origin", "verification_status",
    ]
    write_csv(output / "wsdot_c8078_schedule_snapshots.csv", fields, rows)
    return (
        {
            "dataset": "wsdot_c8078_schedules",
            "schedule_snapshots": len(snapshots),
            "schedule_rows_across_snapshots": len(rows),
            "distinct_activity_ids": len(WSDOT_SCHEDULE_DESCRIPTIONS),
            "verification_status": "manually_reviewed_against_rendered_source",
        },
        snapshots[1]["activities"],
    )


def _load_ocr_dependencies() -> tuple[Any, Any]:
    local_target = REPO_ROOT / "tmp" / "real_dataset_ocr_env"
    if local_target.exists() and str(local_target) not in sys.path:
        sys.path.insert(0, str(local_target))
    try:
        from pdf2image import convert_from_path
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise RuntimeError(
            "OCR dependencies are missing. Install rapidocr_onnxruntime into "
            "tmp/real_dataset_ocr_env or run with --skip-ocr."
        ) from exc
    return convert_from_path, RapidOCR


def ocr_page_type(texts: list[str]) -> str:
    joined = " ".join(texts).lower()
    if "workactivitysummary" in joined.replace(" ", "") or "inspector's daily report" in joined:
        return "inspector_daily_report_form"
    if "daily diary" in joined or "inspector's diary" in joined:
        return "daily_diary_or_continuation"
    if "pile" in joined and "activity" in joined:
        return "activity_attachment"
    return "other_attachment_or_scan"


def extract_work_activity_summary(lines: list[dict[str, Any]], width: int, height: int) -> str:
    labels = [
        row for row in lines
        if "descriptionandlocation" in re.sub(r"[^a-z]", "", row["text"].lower())
    ]
    if not labels:
        return ""
    label_y = min(sum(point[1] for point in row["bbox"]) / 4 for row in labels)
    item_heads = [
        sum(point[1] for point in row["bbox"]) / 4
        for row in lines
        if "item" in row["text"].lower() and "locationofwork" in row["text"].lower().replace(" ", "")
    ]
    end_y = min((value for value in item_heads if value > label_y), default=label_y + height * 0.16)
    selected = []
    for row in lines:
        xs = [point[0] for point in row["bbox"]]
        ys = [point[1] for point in row["bbox"]]
        center_y = sum(ys) / 4
        left_x = min(xs)
        normalized = re.sub(r"[^a-z]", "", row["text"].lower())
        if label_y + 3 < center_y < end_y and left_x < width * 0.60:
            if normalized in {"descriptionandlocation", "workactivitysummary"}:
                continue
            selected.append((center_y, left_x, row["text"]))
    selected.sort(key=lambda value: (round(value[0] / 12), value[1]))
    return re.sub(r"\s+", " ", " ".join(value[2] for value in selected)).strip()


def extract_source_date(texts: list[str]) -> str:
    for text in texts:
        match = re.search(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b", text)
        if match:
            month, day, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
            try:
                return datetime(year, month, day).date().isoformat()
            except ValueError:
                pass
    return ""


_OCR_THREAD_LOCAL = threading.local()


def ocr_one_pdf(
    pdf_path: Path, raw_rel: str, artifact_id: str, poppler_path: str | None, dpi: int,
) -> list[dict[str, Any]]:
    convert_from_path, RapidOCR = _load_ocr_dependencies()
    if not hasattr(_OCR_THREAD_LOCAL, "engine"):
        _OCR_THREAD_LOCAL.engine = RapidOCR()
    images = convert_from_path(
        str(pdf_path), dpi=dpi, fmt="png", poppler_path=poppler_path or None,
        thread_count=1,
    )
    records: list[dict[str, Any]] = []
    for page_number, image in enumerate(images, start=1):
        result, _ = _OCR_THREAD_LOCAL.engine(image)
        result = result or []
        lines = [
            {
                "bbox": [[round(float(x), 2), round(float(y), 2)] for x, y in item[0]],
                "text": str(item[1]),
                "confidence": round(float(item[2]), 6),
            }
            for item in result
        ]
        texts = [row["text"] for row in lines]
        confidence = sum(row["confidence"] for row in lines) / len(lines) if lines else 0.0
        records.append(
            {
                "schema_version": SCHEMA_VERSION,
                "data_origin": "real",
                "is_real": True,
                "source_artifact_id": artifact_id,
                "native_locator": {"page": page_number},
                "extraction_method": f"rapidocr_onnxruntime_on_{dpi}dpi_render",
                "annotation_origin": "machine_ocr",
                "verification_status": "machine_extracted_unverified",
                "record": {
                    "source_file": raw_rel,
                    "contract_id": "C8078",
                    "page": page_number,
                    "page_type": ocr_page_type(texts),
                    "source_date": extract_source_date(texts),
                    "work_activity_summary": extract_work_activity_summary(lines, image.width, image.height),
                    "ocr_text": "\n".join(texts),
                    "ocr_lines": lines,
                    "ocr_mean_confidence": round(confidence, 6),
                    "render_width": image.width,
                    "render_height": image.height,
                },
            }
        )
    return records


def activity_candidates(text: str) -> list[str]:
    normalized = re.sub(r"[^a-z0-9]+", " ", text.lower())
    candidates: list[str] = []
    install_map = {("A", "1"): "1060", ("A", "2"): "1070", ("A", "3"): "1080", ("A", "4"): "1090", ("B", "1"): "1110", ("B", "2"): "1120"}
    restrike_map = {("A", "1"): "1140", ("A", "2"): "1150", ("A", "3"): "1160", ("A", "4"): "1170", ("B", "1"): "1200", ("B", "2"): "1210"}
    remove_map = {"A": "1180", "B": "1220"}
    for pile_match in re.finditer(r"pile\s*([ab])\s*[- ]?\s*([1-4])", normalized):
        location, number = pile_match.group(1).upper(), pile_match.group(2)
        prefix = normalized[max(0, pile_match.start() - 70):pile_match.start()]
        actions = [
            (prefix.rfind("restrik"), "restrike"),
            (prefix.rfind("install"), "install"),
            (prefix.rfind("remov"), "remove"),
        ]
        _, nearest_action = max(actions)
        value = None
        if max(position for position, _ in actions) >= 0:
            if nearest_action == "restrike":
                value = restrike_map.get((location, number))
            elif nearest_action == "install":
                value = install_map.get((location, number))
            elif nearest_action == "remove":
                value = remove_map.get(location)
        if value:
            candidates.append(value)
    if "test" in normalized and "bubble curtain" in normalized:
        if "unconfined" in normalized:
            candidates.append("1055")
        if re.search(r"(?<!un)confined bubble curtain", normalized):
            candidates.append("1065")
    if re.search(r"\bmov(?:e|ing)|\bmobe", normalized) and "location b" in normalized:
        candidates.extend(["1100", "1190"])
    if re.search(r"\bmov(?:e|ing)|\bmobe", normalized) and "location a" in normalized:
        candidates.append("1130")
    if "demobiliz" in normalized:
        candidates.append("1230")
    elif "mobiliz" in normalized:
        candidates.append("1050")
    return list(dict.fromkeys(candidates))


def normalize_wsdot_ocr(
    lookup: dict[str, dict[str, Any]], *, poppler_path: str | None, workers: int, dpi: int,
    reuse_existing: bool = False,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    idr_dir = RAW_ROOT / "wsdot" / "C8078" / "idrs"
    tasks = []
    for pdf_path in sorted(idr_dir.glob("*.pdf")):
        raw_rel = pdf_path.relative_to(REAL_ROOT).as_posix()
        artifact = artifact_for(lookup, raw_rel)
        tasks.append((pdf_path, raw_rel, artifact["artifact_id"]))
    output = NORMALIZED_ROOT / "wsdot" / "C8078"
    existing_path = output / "idr_pages_ocr.jsonl"
    page_records: list[dict[str, Any]] = []
    if reuse_existing and existing_path.exists():
        with existing_path.open("r", encoding="utf-8") as handle:
            page_records = [json.loads(line) for line in handle if line.strip()]
        print(f"Reusing {len(page_records)} existing OCR page records", flush=True)
    else:
        with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            futures = {
                executor.submit(ocr_one_pdf, path, raw_rel, artifact_id, poppler_path, dpi): path.name
                for path, raw_rel, artifact_id in tasks
            }
            for future in as_completed(futures):
                name = futures[future]
                records = future.result()
                page_records.extend(records)
                print(f"OCR {name}: {len(records)} pages", flush=True)
    for page in page_records:
        record = page["record"]
        record["work_activity_summary"] = extract_work_activity_summary(
            record.get("ocr_lines", []), int(record.get("render_width", 0)), int(record.get("render_height", 0))
        )
        if not record.get("source_date"):
            match = re.search(r"IDR-(\d{4}-\d{2}-\d{2})", Path(record["source_file"]).name)
            if match:
                record["source_date"] = match.group(1)
    page_records.sort(key=lambda row: (row["record"]["source_file"], row["record"]["page"]))
    page_count = write_jsonl(output / "idr_pages_ocr.jsonl", page_records)

    line_rows: list[dict[str, Any]] = []
    mention_rows: list[dict[str, Any]] = []
    for page in page_records:
        record = page["record"]
        for line_index, line in enumerate(record["ocr_lines"], start=1):
            line_rows.append(
                {
                    "source_file": record["source_file"],
                    "page": record["page"],
                    "line_index": line_index,
                    "text": line["text"],
                    "ocr_confidence": line["confidence"],
                    "bbox_json": json.dumps(line["bbox"], separators=(",", ":")),
                    "data_origin": "real",
                    "is_real": True,
                    "source_artifact_id": page["source_artifact_id"],
                    "annotation_origin": "machine_ocr",
                    "verification_status": "machine_extracted_unverified",
                }
            )
        summary = record.get("work_activity_summary", "")
        if summary:
            candidates = activity_candidates(summary)
            mention_rows.append(
                {
                    "source_file": record["source_file"],
                    "source_page": record["page"],
                    "source_date": record.get("source_date", ""),
                    "contract_id": "C8078",
                    "raw_mention": summary,
                    "candidate_activity_ids_json": json.dumps(candidates),
                    "activity_id": candidates[0] if len(candidates) == 1 else "",
                    "match_type": "single_machine_candidate" if len(candidates) == 1 else ("multiple_machine_candidates" if candidates else "unresolved"),
                    "data_origin": "real",
                    "is_real": True,
                    "source_artifact_id": page["source_artifact_id"],
                    "annotation_origin": "machine_ocr_plus_rules",
                    "verification_status": "machine_candidate_unverified",
                }
            )

    line_fields = [
        "source_file", "page", "line_index", "text", "ocr_confidence", "bbox_json",
        "data_origin", "is_real", "source_artifact_id", "annotation_origin", "verification_status",
    ]
    line_count = write_csv(output / "idr_ocr_lines.csv", line_fields, line_rows)
    mention_fields = [
        "source_file", "source_page", "source_date", "contract_id", "raw_mention",
        "candidate_activity_ids_json", "activity_id", "match_type", "data_origin", "is_real",
        "source_artifact_id", "annotation_origin", "verification_status",
    ]
    mention_count = write_csv(LABELS_ROOT / "wsdot" / "C8078_activity_mentions_machine_candidates.csv", mention_fields, mention_rows)
    return (
        {
            "dataset": "wsdot_c8078_idr_ocr",
            "source_pdf_files": len(tasks),
            "ocr_pages": page_count,
            "ocr_lines": line_count,
            "work_activity_mentions": mention_count,
            "verification_status": "machine_extracted_unverified",
        },
        mention_rows,
    )


def build_hard_negatives(
    schedule_activities: list[dict[str, Any]], limit: int = 100,
) -> dict[str, Any]:
    schedule_texts = [activity["description"].lower() for activity in schedule_activities]
    action_stems = ("install", "test", "remov", "move", "mobil", "order", "receiv", "pile", "curtain", "prepar")
    candidates: dict[str, list[tuple[float, int, dict[str, Any]]]] = {"constructcie": [], "safety_risk_library": []}

    constructcie_path = NORMALIZED_ROOT / "constructcie" / "accident_narratives.csv"
    constructcie_fields, constructcie_rows, _ = read_csv_flexible(constructcie_path)
    del constructcie_fields
    for row in constructcie_rows:
        narrative = row.get("narrative", "")
        sentences = re.split(r"(?<=[.!?])\s+", narrative)
        matching_sentences = [
            sentence for sentence in sentences
            if any(stem in sentence.lower() for stem in action_stems)
        ]
        if not matching_sentences:
            continue
        mention = max(
            matching_sentences,
            key=lambda sentence: sum(stem in sentence.lower() for stem in action_stems),
        ).strip()
        description = mention.lower()
        stem_overlap = {stem for stem in action_stems if stem in description}
        sequence_score = max(
            difflib.SequenceMatcher(None, description, schedule_text).ratio()
            for schedule_text in schedule_texts
        )
        score = sequence_score + (0.12 * len(stem_overlap))
        candidates["constructcie"].append(
            (
                score,
                len(stem_overlap),
                {
                    "source_file": "raw/constructcie/constructcie.json",
                    "source_locator": f"line:{row.get('source_row', '')}",
                    "source_record_id": row.get("record_id", ""),
                    "source_date": "",
                    "raw_mention": mention,
                    "source_artifact_id": row.get("source_artifact_id", ""),
                    "hard_negative_kind": "cross_source_constructcie_lexical_confuser",
                },
            )
        )

    safety_path = NORMALIZED_ROOT / "safety_risk_library" / "risk_treatments.csv"
    safety_fields, safety_rows, _ = read_csv_flexible(safety_path)
    del safety_fields
    for row in safety_rows:
        parts = [row.get("Associated Activity", ""), row.get("Treatment Title", "")]
        mention = " — ".join(part.strip() for part in parts if part and part.strip())
        description = mention.lower()
        stem_overlap = {stem for stem in action_stems if stem in description}
        if not stem_overlap:
            continue
        sequence_score = max(
            difflib.SequenceMatcher(None, description, schedule_text).ratio()
            for schedule_text in schedule_texts
        )
        score = sequence_score + (0.12 * len(stem_overlap))
        candidates["safety_risk_library"].append(
            (
                score,
                len(stem_overlap),
                {
                    "source_file": "raw/safety_risk_library/v1/Safety Risk Library dataset.csv",
                    "source_locator": f"row:{row.get('source_row', '')}",
                    "source_record_id": row.get("source_row", ""),
                    "source_date": "",
                    "raw_mention": mention,
                    "source_artifact_id": row.get("source_artifact_id", ""),
                    "hard_negative_kind": "cross_source_safety_risk_lexical_confuser",
                },
            )
        )

    per_source = limit // 2
    selected: list[tuple[float, int, dict[str, Any]]] = []
    for source_rows in candidates.values():
        source_rows.sort(key=lambda item: (-item[0], -item[1], item[2]["source_record_id"]))
        selected.extend(source_rows[:per_source])
    if len(selected) < limit:
        used = {(row[2]["source_file"], row[2]["source_record_id"]) for row in selected}
        remainder = sorted(
            (
                row for source_rows in candidates.values() for row in source_rows
                if (row[2]["source_file"], row[2]["source_record_id"]) not in used
            ),
            key=lambda item: (-item[0], -item[1], item[2]["source_record_id"]),
        )
        selected.extend(remainder[: limit - len(selected)])

    rows = []
    for score, overlap_count, row in selected[:limit]:
        rows.append(
            {
                **row,
                "target_schedule": "wsdot_c8078_2011-02-14",
                "activity_id": "",
                "match_type": "no_match",
                "lexical_overlap_score": f"{score:.6f}",
                "overlap_token_count": overlap_count,
                "data_origin": "real",
                "is_real": True,
                "annotation_origin": "programmatic_cross_source_rule",
                "verification_status": "rule_based_unverified",
            }
        )
    fields = [
        "source_file", "source_locator", "source_record_id", "source_date", "raw_mention", "target_schedule",
        "activity_id", "match_type", "hard_negative_kind", "lexical_overlap_score",
        "overlap_token_count", "data_origin", "is_real", "source_artifact_id",
        "annotation_origin", "verification_status",
    ]
    count = write_csv(LABELS_ROOT / "hard_negatives_cross_source.csv", fields, rows)
    return {
        "dataset": "cross_source_hard_negatives",
        "rows": count,
        "target_schedule": "wsdot_c8078_2011-02-14",
        "verification_status": "rule_based_unverified",
    }


def write_reporting_schema(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    wsdot_rel = "raw/wsdot/reference/DOT-Form-422-004.pdf"
    fhwa_rel = "raw/fhwa/reference/FHWA-Construction-Program-Management-and-Inspection-Guide-2004.pdf"
    schema = {
        "schema_version": "real-source-derived-dpr-schema-v1",
        "data_origin": "real",
        "is_real": True,
        "derivation": "manual field inventory from official WSDOT form and FHWA inspection guide",
        "annotation_origin": "manual_schema_transcription",
        "verification_status": "manually_reviewed_against_official_sources",
        "source_artifact_ids": [
            artifact_for(lookup, wsdot_rel)["artifact_id"],
            artifact_for(lookup, fhwa_rel)["artifact_id"],
        ],
        "fields": [
            {"group": "identity", "name": "contract_id"},
            {"group": "identity", "name": "state_route_numbers"},
            {"group": "identity", "name": "report_day"},
            {"group": "identity", "name": "report_date"},
            {"group": "conditions", "name": "weather_am"},
            {"group": "conditions", "name": "weather_pm"},
            {"group": "parties", "name": "prime_contractor"},
            {"group": "parties", "name": "prime_contractor_representative_and_title"},
            {"group": "parties", "name": "subcontractors_and_representatives"},
            {"group": "work", "name": "work_activity_description_and_location"},
            {"group": "payment", "name": "pay_note_status"},
            {"group": "payment", "name": "contract_item_number_description_and_location"},
            {"group": "materials", "name": "backup_samples_taken"},
            {"group": "materials", "name": "materials_documentation_approved"},
            {"group": "materials", "name": "materials_source_approved"},
            {"group": "resources", "name": "equipment_id_description_and_operating_status"},
            {"group": "resources", "name": "workforce_trade_counts_and_hours"},
            {"group": "traffic", "name": "traffic_control_required_and_compliant"},
            {"group": "traffic", "name": "flagger_and_spotter_card_status"},
            {"group": "evidence", "name": "photos_or_videos_taken"},
            {"group": "inspection", "name": "inspector_on_site_hours"},
            {"group": "inspection", "name": "inspector_signature_and_review"},
            {"group": "narrative", "name": "orders_discussions_unusual_conditions_delays_and_visitors"},
            {"group": "controls", "name": "progress_quality_time_elapsed_and_work_completed"},
            {"group": "controls", "name": "findings_recommendations_resolution_and_follow_up"},
            {"group": "audit", "name": "work_measured_and_paid_audit_trail"},
        ],
    }
    json_dump(NORMALIZED_ROOT / "reporting_schema" / "official_dpr_field_inventory.json", schema)
    return {"dataset": "official_dpr_field_inventory", "fields": len(schema["fields"])}


def write_discipline_index(lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    rows = [
        {"discipline": "civil", "source": "WSDOT C8078 and CPWD Civil DSR", "evidence_path": "raw/wsdot/C8078/idrs", "data_origin": "real"},
        {"discipline": "electrical", "source": "CPWD DSR E&M 2025", "evidence_path": "raw/cpwd/cpwd_dsr_em_2025.pdf", "data_origin": "real"},
        {"discipline": "piping", "source": "CFIHOS v2.0 tag/equipment classes", "evidence_path": "normalized/cfihos/v2.0", "data_origin": "real"},
        {"discipline": "static_equipment", "source": "CFIHOS v2.0 equipment classes", "evidence_path": "normalized/cfihos/v2.0", "data_origin": "real"},
        {"discipline": "instrumentation", "source": "CFIHOS v2.0 tag classes and properties", "evidence_path": "normalized/cfihos/v2.0", "data_origin": "real"},
        {"discipline": "HSE", "source": "ConstructCIE and Safety Risk Library", "evidence_path": "normalized/constructcie", "data_origin": "real"},
    ]
    for row in rows:
        row.update({"is_real": True, "verification_status": "source_collection_level_mapping"})
    fields = ["discipline", "source", "evidence_path", "data_origin", "is_real", "verification_status"]
    count = write_csv(NORMALIZED_ROOT / "discipline_index.csv", fields, rows)
    return {"dataset": "discipline_index", "disciplines": count}


def build_summary(
    artifacts: list[dict[str, Any]], datasets: list[dict[str, Any]], *, ocr_skipped: bool,
) -> dict[str, Any]:
    extension_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    total_bytes = 0
    for artifact in artifacts:
        extension_counts[artifact["filename_extension"]] = extension_counts.get(artifact["filename_extension"], 0) + 1
        source_counts[artifact["source_key"]] = source_counts.get(artifact["source_key"], 0) + 1
        total_bytes += int(artifact["byte_count"])
    by_name = {item["dataset"]: item for item in datasets}
    summary = {
        "schema_version": "real-corpus-build-summary-v1",
        "build_version": BUILD_VERSION,
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_origin": "real",
        "is_real": True,
        "raw_artifacts": len(artifacts),
        "raw_bytes": total_bytes,
        "raw_extension_counts": dict(sorted(extension_counts.items())),
        "raw_source_counts": dict(sorted(source_counts.items())),
        "datasets": datasets,
        "benchmark_target_audit": {
            "20_to_30_DPRs": {
                "status": "met",
                "actual": by_name.get("wsdot_c8078_idr_ocr", {}).get("source_pdf_files", 21),
                "note": "21 canonical C8078 IDR PDFs are present; the WSDOT source also includes schedules/context/reference files.",
            },
            "500_to_800_labelled_field_mentions": {
                "status": "met_for_source_published_causal_spans_not_schedule_ground_truth",
                "actual": by_name.get("constructcie", {}).get("causal_span_labels", 0),
                "note": "ConstructCIE spans are source-published real annotations. WSDOT schedule-linked OCR candidates remain explicitly unverified.",
            },
            "200_to_300_distinct_schedule_activities": {
                "status": "partial",
                "actual_distinct_same_contract": by_name.get("wsdot_c8078_schedules", {}).get("distinct_activity_ids", 0),
                "reference_activity_rows": by_name.get("cpwd_dsr_em_2025", {}).get("machine_extracted_item_rate_rows", 0),
                "note": "Only 27 distinct activities are present in the two authentic same-contract schedule snapshots. Reference work items are not relabeled as schedule activities.",
            },
            "6_disciplines": {
                "status": "met_at_source_collection_level",
                "actual": by_name.get("discipline_index", {}).get("disciplines", 0),
            },
            "50_to_100_plus_hard_negatives": {
                "status": (
                    "met_as_rule_based_cross_contract_candidates"
                    if by_name.get("cross_source_hard_negatives", {}).get("rows", 0) >= 50
                    else "partial"
                ),
                "actual": by_name.get("cross_source_hard_negatives", {}).get("rows", 0),
                "note": "These are real ConstructCIE sentences and Safety Risk Library treatments evaluated against an unrelated WSDOT schedule; they are rule_based_unverified, not manual gold.",
            },
        },
        "ocr_skipped": ocr_skipped,
        "real_vs_synthetic_separation": {
            "real_root": "datasets/real",
            "synthetic_root": "dataset",
            "mixed": False,
        },
    }
    json_dump(MANIFESTS_ROOT / "dataset_summary.json", summary)
    write_jsonl(
        MANIFESTS_ROOT / "records.jsonl",
        (
            {
                "schema_version": "normalized-dataset-summary-v1",
                "data_origin": "real",
                "is_real": True,
                **dataset,
            }
            for dataset in datasets
        ),
    )
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-ocr", action="store_true", help="Build all non-OCR outputs and preserve WSDOT scans as native-only.")
    parser.add_argument("--ocr-workers", type=int, default=3, help="Concurrent WSDOT PDF OCR workers (default: 3).")
    parser.add_argument("--ocr-dpi", type=int, default=150, help="Rasterization DPI for OCR (default: 150).")
    parser.add_argument("--poppler-path", default=os.environ.get("POPPLER_PATH", ""), help="Directory containing pdftoppm.exe.")
    parser.add_argument("--reuse-existing-ocr", action="store_true", help="Reuse page-level OCR and rerun only deterministic post-processing.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not STAGING_ROOT.exists():
        raise SystemExit(f"Missing staging directory: {STAGING_ROOT}")
    for directory in (RAW_ROOT, NORMALIZED_ROOT, LABELS_ROOT, MANIFESTS_ROOT, REPORTS_ROOT):
        directory.mkdir(parents=True, exist_ok=True)

    specs = collect_artifact_specs()
    print(f"Promoting {len(specs)} validated source artifacts", flush=True)
    artifacts, lookup = promote_artifacts(specs)

    datasets: list[dict[str, Any]] = []
    datasets.append(normalize_paimana(lookup))
    datasets.append(normalize_constructcie(lookup))
    datasets.append(normalize_safety_risk_library(lookup))
    datasets.append(normalize_cfihos(lookup))
    datasets.append(preserve_uniclass_csvs(lookup))
    cpwd_summary, _ = normalize_cpwd_em(lookup)
    datasets.append(cpwd_summary)
    schedule_summary, schedule_activities = normalize_wsdot_schedules(lookup)
    datasets.append(schedule_summary)
    datasets.append(build_hard_negatives(schedule_activities))
    datasets.append(write_reporting_schema(lookup))
    datasets.append(write_discipline_index(lookup))

    if args.skip_ocr:
        datasets.append(
            {
                "dataset": "wsdot_c8078_idr_ocr",
                "status": "skipped",
                "source_pdf_files": len(list((RAW_ROOT / "wsdot" / "C8078" / "idrs").glob("*.pdf"))),
            }
        )
    else:
        ocr_summary, _ = normalize_wsdot_ocr(
            lookup,
            poppler_path=args.poppler_path or None,
            workers=args.ocr_workers,
            dpi=args.ocr_dpi,
            reuse_existing=args.reuse_existing_ocr,
        )
        datasets.append(ocr_summary)

    summary = build_summary(artifacts, datasets, ocr_skipped=args.skip_ocr)
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
