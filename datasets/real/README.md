# NAVIS real-world construction corpus

This directory contains a provenance-preserving corpus assembled from public, real-world construction and infrastructure sources. It is intentionally separate from the repository's generated fixtures:

- `datasets/real/` — real public-source artifacts and real-source-derived records.
- `dataset/` — existing synthetic demo/evaluation data.

The two roots are not mixed.

## What is included

| Collection | Native/source material | Usable derived data | Verification status |
|---|---:|---:|---|
| WSDOT C8078 | 21 canonical IDR PDFs (73 pages), 2 same-contract schedules, contract-time/progress context, official forms/manual | 4,315 OCR lines; 13 non-empty activity-summary candidates; 54 schedule-snapshot rows / 27 distinct activities | Schedule transcription manually reviewed; OCR/candidate matches unverified |
| MoSPI PAIMANA | 13 official monthly JSON snapshots and 13 monthly Flash Report PDFs | 18,601 project-month rows; 2,243 unique projects at their latest available snapshot | Official structured records, not independently audited |
| CPWD / Indian Railways | DSR 2023 Civil Volumes 1–2 and DSR E&M 2025 (1,245 PDF pages total) | 1,661 E&M item/unit/rate rows | Machine-extracted and unverified; Civil volumes retained native-only because they are image scans |
| CFIHOS v2.0 | Official CORE CSV ZIP, Excel workbooks, guides, data model, templates | 21 tables / 43,753 reference rows | Source reference records, unreviewed |
| ConstructCIE | Source JSONL, Parquet, repository archive and metadata | 530 real OSHA-derived narratives; 3,520 source-published causal spans; 1,580 classifications | Source-published annotations, not re-adjudicated here |
| Safety Risk Library v1 | Published CSV and ZIP | 466 risk/treatment rows | Source-published records, unreviewed |
| Uniclass snapshot | January 2022 Buildig CSV snapshot plus July 2026 official metadata page | 15,375 rows in the combined table; 14 identity-copied CSVs including component tables | Byte-for-byte copies only; no content adaptation |
| FHWA reporting guidance | 196-page inspection guide and four official HTML sections | 26-field DPR/reporting inventory derived with WSDOT Form 422-004 | Manually reviewed source-derived schema |
| Cross-source hard negatives | Real ConstructCIE sentences and Safety Risk Library treatments | 100 rows balanced 50/50 against the unrelated WSDOT schedule | Rule-based/unverified, not manual gold |

Exact machine-readable counts are in [`manifests/dataset_summary.json`](manifests/dataset_summary.json). Independent validation is in [`reports/validation.md`](reports/validation.md).

## Directory layout

```text
datasets/real/
  raw/                  byte-for-byte source artifacts
    ...file.ext
    ...file.ext.provenance.json
  normalized/           structured views with explicit real-data markers
  labels/               published annotations and clearly marked candidate labels
  manifests/
    artifacts.jsonl     one record per source artifact
    records.jsonl       one record per normalized dataset
    dataset_summary.json
  reports/
    validation.json
    validation.md
  scripts/
    build_real_dataset.py
    validate_real_dataset.py
```

## Meaning of “real”

`data_origin = real` means the content came from a cited public source rather than being generated as a synthetic example. It does **not** mean every extracted value or label has been manually verified.

The corpus keeps three concepts separate:

- `data_origin` / `is_real` — source provenance.
- `annotation_origin` — who or what supplied the label (source publisher, manual transcription, OCR/rules).
- `verification_status` — whether the extraction or annotation was manually reviewed.

Raw files are never modified to inject metadata. Every original has a neighboring `.provenance.json` sidecar. Derived CSVs contain `data_origin` and `is_real` columns; JSON/JSONL records contain the same fields at the top level.

## Benchmark-target audit

| Requested target | Result | Notes |
|---|---|---|
| 20–30 DPRs | Met: 21 | Canonical WSDOT C8078 IDR PDFs; legacy duplicate copies are tracked separately |
| 500–800 labeled field mentions | Exceeded for published causal spans: 3,520 | These are ConstructCIE safety-causal spans, not WSDOT schedule-link gold labels |
| 200–300 distinct schedule activities | Partial: 27 authentic same-contract activities | Two real snapshots produce 54 rows. No synthetic padding or taxonomy rows are misrepresented as schedule activities |
| 6 disciplines | Met at collection level | Civil, electrical, piping, static equipment, instrumentation and HSE |
| 50–100+ hard negatives | Met: 100 | Real cross-source lexical confusers; explicitly rule-based/unverified |
| Tagged and tag-free examples | Present | CFIHOS supplies tag-class data; WSDOT report summaries are tag-free |
| Different dates/contracts/locations | Present | WSDOT dates/locations, PAIMANA states/ministries/projects, and cross-source negatives |

## High-value files

- `normalized/paimana/project_months.csv` — all 18,601 project-month observations.
- `normalized/paimana/projects_latest_available.jsonl` — one latest-available record per 2,243 project IDs.
- `labels/constructcie/causal_spans.csv` — 3,520 source-published real span labels.
- `normalized/cfihos/v2.0/all_core_tables.jsonl` — 43,753 CFIHOS CORE records with table and row provenance.
- `normalized/cpwd/dsr_em_2025/item_rates.csv` — 1,661 machine-extracted DSR item/unit/rate rows.
- `normalized/schedules/wsdot_c8078_2011-02-14.json` — later same-contract WSDOT schedule snapshot.
- `normalized/wsdot/C8078/idr_pages_ocr.jsonl` — 73 page-level OCR records with line boxes/confidence.
- `labels/wsdot/C8078_activity_mentions_machine_candidates.csv` — 13 non-empty field summaries and candidate activity IDs.
- `labels/hard_negatives_cross_source.csv` — 100 real cross-source no-match candidates.
- `normalized/reporting_schema/official_dpr_field_inventory.json` — official-source-derived field inventory.

## Rebuild and validate

Install the non-standard extraction dependencies in an isolated environment:

```powershell
python -m pip install -r datasets/real/scripts/requirements.txt
```

Run a complete build (the Poppler directory must contain `pdftoppm.exe`):

```powershell
python datasets/real/scripts/build_real_dataset.py --poppler-path "<poppler-bin-directory>" --ocr-workers 3
python datasets/real/scripts/validate_real_dataset.py
```

To rerun deterministic post-processing without repeating OCR:

```powershell
python datasets/real/scripts/build_real_dataset.py --reuse-existing-ocr
python datasets/real/scripts/validate_real_dataset.py
```

The validator recomputes source hashes, compares promoted files with staging, checks every real-data marker, validates PDF magic bytes, audits duplicates, and checks all published row counts.

## Source and reuse notes

- [WSDOT C8078 public project-delivery repository](https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/) and [WSDOT electronic forms](https://wsdot.wa.gov/business-wsdot/how-do-business-us/electronic-forms): official public records/forms. Preserve attribution and review public-record/privacy obligations for downstream redistribution.
- [FHWA Construction Program Management and Inspection Guide](https://www.fhwa.dot.gov/construction/cpmi04tc.cfm): U.S. Government guidance; embedded third-party material may have separate terms.
- [MoSPI/PAIMANA](https://paimana-proj.mospi.gov.in/Home/PublicDashboardNew): official project-monitoring data. Its published terms require accurate reproduction, due credit, prominent source acknowledgment, and non-misleading use.
- [CPWD copyright policy](https://cpwd.gov.in/copyright_policy.aspx): permits properly attributed non-commercial research/private-study reuse; other uses may require permission.
- [CFIHOS standards](https://www.jip36-cfihos.org/cfihos-standards/): the official page states the documents are free to download and use.
- [ConstructCIE](https://huggingface.co/datasets/lab-flair/constructcie): Apache-2.0.
- [Safety Risk Library](https://data.mendeley.com/datasets/bmhzshjt9m/1): CC BY 4.0.
- [Official Uniclass download/terms](https://uniclass.thenbs.com/download): current terms are CC BY-ND 4.0. The older [Buildig CSV snapshot](https://github.com/buildig/uniclass-2015) states CC BY-SA 3.0; this corpus applies the stricter no-derivatives treatment and keeps table content unchanged.

This repository records source terms for traceability; it is not legal advice. Recheck current terms before publishing or commercial reuse.

## Access boundaries respected

- Newer `highways.dot.gov` FHWA form downloads returned HTTP 403. They were recorded as failed staging attempts and were not bypassed; the openly retrievable FHWA guide/HTML and WSDOT forms supply the reporting schema.
- The current official Uniclass bundle uses a registration modal. No registration gate was bypassed; the corpus uses the openly published 2022 Buildig snapshot and retains the current official page only as metadata.
- The newer 2025 Construction Risk Library is form-gated. It was not scraped through the form; this corpus uses the openly licensed Safety Risk Library v1 from Mendeley Data.
