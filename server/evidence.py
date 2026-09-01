"""What the real corpus actually contains, read from its own manifests.

`datasets/real` is 630 MB across 864 tracked files. This module summarises it
for the Evidence page **without opening a single raw artifact**: everything
below is read from two files the corpus build already produced -
`manifests/dataset_summary.json` and `reports/validation.json`.

WHY IT READS MANIFESTS AND NOT THE CORPUS
-----------------------------------------
Loading 630 MB per request is not a design. The manifests are the corpus's own
account of itself, written by the build that assembled it, and re-deriving those
counts here would produce a second set of numbers that could disagree with the
first. Read once at first use and cached for the process lifetime; the corpus is
static.

THE HONESTY FIELDS ARE DATA, NOT PROSE
--------------------------------------
The corpus is genuinely useful and genuinely partial, and the partial half has
to travel with it or the Evidence page becomes a marketing slide. Four things in
particular are easy to overclaim, so each ships as a structured field with its
own status and note rather than as text the frontend has to compose:

  * **27 distinct schedule activities**, not the 200-300 a benchmark target
    named. Two authentic same-contract WSDOT snapshots contain 27 between them.
    The 1,661 CPWD reference work items are *reference rows* and are NOT
    relabelled as schedule activities to make the number look better.
  * **WSDOT OCR activity mentions and the 100 hard negatives are unverified.**
    They are rule-based cross-contract candidates, not manual gold.
  * **ConstructCIE labels are source-published annotations**, produced by that
    project, not by us.
  * **Real and synthetic stay separate.** Real under `datasets/real`, synthetic
    under `dataset`. `mixed: false` in the manifest, surfaced here.

Every one of those statements is taken from the manifest's own
`benchmark_target_audit` block - this module reports them, it does not author
them. See D-050.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

#: The corpus root, and the two files that describe it.
REAL_ROOT = Path(__file__).resolve().parent.parent / "datasets" / "real"
SUMMARY_PATH = REAL_ROOT / "manifests" / "dataset_summary.json"
VALIDATION_PATH = REAL_ROOT / "reports" / "validation.json"
ARTIFACTS_PATH = REAL_ROOT / "manifests" / "artifacts.jsonl"


class CorpusUnavailable(RuntimeError):
    """The corpus manifests are not present. Names which file is missing."""


@lru_cache(maxsize=1)
def _load() -> tuple[dict, dict]:
    """Both manifests, read once. Raises `CorpusUnavailable` if either is gone.

    Cached for the process: the corpus is static, and re-reading it per request
    would be work with no possible change in the answer.
    """
    for path in (SUMMARY_PATH, VALIDATION_PATH):
        if not path.exists():
            raise CorpusUnavailable(
                f"{path.name} not found at {path}. The real corpus is a large "
                "optional download; this endpoint reports on it and cannot "
                "reconstruct it."
            )
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    validation = json.loads(VALIDATION_PATH.read_text(encoding="utf-8"))
    return summary, validation


def _caveats(summary: dict) -> list[dict]:
    """The four things that must not be overclaimed, as structured fields.

    Sourced from the manifest's `benchmark_target_audit`, so the numbers here
    and the numbers in the corpus build cannot drift apart.
    """
    audit = summary.get("benchmark_target_audit", {}) or {}
    separation = summary.get("real_vs_synthetic_separation", {}) or {}

    activities = audit.get("200_to_300_distinct_schedule_activities", {}) or {}
    negatives = audit.get("50_to_100_plus_hard_negatives", {}) or {}
    mentions = audit.get("500_to_800_labelled_field_mentions", {}) or {}

    return [
        {
            "id": "distinct_schedule_activities",
            "headline": (
                f"{activities.get('actual_distinct_same_contract', 27)} distinct "
                "schedule activities, not 200-300"
            ),
            "status": activities.get("status", "partial"),
            "value": activities.get("actual_distinct_same_contract"),
            "detail": activities.get("note", ""),
            "padded_with_synthetic_or_taxonomy": False,
        },
        {
            "id": "wsdot_ocr_and_hard_negatives_unverified",
            "headline": "WSDOT OCR matches and the hard negatives are unverified",
            "status": negatives.get("status", "unverified"),
            "value": negatives.get("actual"),
            "detail": negatives.get("note", ""),
            "manually_verified": False,
        },
        {
            "id": "constructcie_labels_are_source_published",
            "headline": "ConstructCIE labels are source-published, not ours",
            "status": mentions.get("status", ""),
            "value": mentions.get("actual"),
            "detail": mentions.get("note", ""),
            "authored_by_this_project": False,
        },
        {
            "id": "real_and_synthetic_are_separate",
            "headline": "Real and synthetic data are never mixed",
            "status": "met",
            "value": None,
            "detail": (
                f"Real under '{separation.get('real_root', 'datasets/real')}', "
                f"synthetic under '{separation.get('synthetic_root', 'dataset')}'. "
                "The demo baseline remains the synthetic 120-activity schedule."
            ),
            "mixed": bool(separation.get("mixed", False)),
        },
    ]


def corpus_summary() -> dict:
    """The Evidence page's whole payload. Reads manifests only."""
    summary, validation = _load()
    counts = validation.get("counts", {}) or {}
    checks = validation.get("checks", []) or []

    return {
        "data_origin": summary.get("data_origin", "real"),
        "built_at_utc": summary.get("built_at_utc"),
        "validated_at_utc": validation.get("validated_at_utc"),
        "artifacts": {
            "count": summary.get("raw_artifacts", 0),
            "bytes": summary.get("raw_bytes", 0),
            "by_extension": summary.get("raw_extension_counts", {}) or {},
            "by_source": summary.get("raw_source_counts", {}) or {},
        },
        "records": {
            "paimana_project_month_rows": counts.get("paimana_project_month_rows", 0),
            "paimana_unique_projects": counts.get("paimana_unique_projects", 0),
            "constructcie_narratives": counts.get("constructcie_narratives", 0),
            "constructcie_causal_spans": counts.get("constructcie_causal_spans", 0),
            "constructcie_classifications": counts.get("constructcie_classifications", 0),
            "safety_risk_rows": counts.get("safety_risk_rows", 0),
            "cfihos_core_rows": counts.get("cfihos_core_rows", 0),
            "cpwd_em_item_rows": counts.get("cpwd_em_item_rows", 0),
            "wsdot_schedule_snapshot_rows": counts.get("wsdot_schedule_snapshot_rows", 0),
            "hard_negative_rows": counts.get("hard_negative_rows", 0),
        },
        "ocr": {
            "pages": counts.get("wsdot_ocr_pages", 0),
            "lines": counts.get("wsdot_ocr_lines", 0),
            "activity_mentions": counts.get("wsdot_activity_mentions", 0),
            "verified": False,
        },
        "validation": {
            "passed": bool(validation.get("passed", False)),
            "checks_run": len(checks),
            "errors": validation.get("error_count", 0),
            "warnings": validation.get("warning_count", 0),
        },
        "caveats": _caveats(summary),
        # Stated on the envelope so a reader knows the cost of this call.
        "source": (
            "Read from datasets/real/manifests/dataset_summary.json and "
            "datasets/real/reports/validation.json. No raw artifact is opened."
        ),
    }
