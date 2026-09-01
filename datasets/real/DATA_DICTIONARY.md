# Real corpus data dictionary

## Common provenance fields

| Field | Meaning |
|---|---|
| `schema_version` | Version of the local envelope or provenance format |
| `data_origin` | Always `real` for this corpus |
| `is_real` | Boolean `true` counterpart to `data_origin` |
| `source_artifact_id` | `sha256:<digest>` of the exact native source artifact |
| `native_locator` | Page, line, row, JSONPath or archive-member locator |
| `extraction_method` | Identity parse, PDF text pattern, OCR, manual transcription, etc. |
| `annotation_origin` | Source-published annotation, manual transcription, OCR/rule candidate, etc. |
| `verification_status` | Manual/source/machine verification state; never infer gold quality from `data_origin` |

## JSONL envelope

```json
{
  "schema_version": "real-record-v1",
  "data_origin": "real",
  "is_real": true,
  "source_artifact_id": "sha256:...",
  "native_locator": {"page": 1, "line": 17, "row": null},
  "extraction_method": "...",
  "annotation_origin": "...",
  "verification_status": "...",
  "record": {}
}
```

## Dataset-specific records

### PAIMANA project months

The original official dashboard fields are retained, including project ID/name, sector, state, ministry, company/agency, original/revised cost, expenditure, sanction/start/end dates, delay, cost-overrun values, physical progress and remarks. Local provenance columns add the source month, file, row and artifact hash.

### ConstructCIE

- `accident_narratives.csv`: record ID, accident type and source narrative.
- `causal_spans.csv`: hierarchical `factor_path`, factor name, source span, associated keywords and record ID.
- `classifications.csv`: hierarchical classification path/value and record ID.

### CFIHOS

Every official CORE CSV table keeps its original columns. Added columns identify the ZIP artifact, archive member, row, real-data origin and verification state. `all_core_tables.jsonl` adds the originating table name inside each record.

### CPWD E&M

`item_rates.csv` contains `item_no`, `description`, `unit`, numeric-string `rate`, `currency=INR`, original PDF text line, page and line. It is a regex extraction from the PDF text layer and is not manually adjudicated.

### WSDOT schedules

Each activity contains activity ID, source description, civil discipline, planned start/finish, original duration, source PDF/page and schedule run date. Two snapshots share 27 activity IDs and differ in dates/durations.

### WSDOT IDR OCR

Page records retain OCR text, per-line bounding boxes and confidence, page type, source date, contract ID and any extracted Work Activity Summary. Candidate activity IDs are rule-generated and remain unverified.

### Hard negatives

Rows are real construction sentences/treatments from a source unrelated to WSDOT C8078. `activity_id` is empty, `match_type=no_match`, and `verification_status=rule_based_unverified`. They are useful candidates for manual review, not pre-approved gold labels.

### Uniclass

The CSVs in `normalized/uniclass/snapshot_2022/native_csv/` are identity copies, not modified tables. Their adjacent sidecars carry real-data provenance and row counts.

