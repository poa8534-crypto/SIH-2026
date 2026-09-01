# WSDOT C8078 candidate-link verification review

Status: **assistant-reviewed; pending dataset-owner confirmation**

This review checks the 13 real WSDOT Inspector Daily Report (DPR/IDR) summaries in `wsdot_c8078_verification_sheet.txt` against the two preserved real C8078 schedule PDFs and their 27 stable activity IDs. It does **not** label the result as human verified. The dataset owner should inspect and approve these decisions before promotion into the canonical benchmark.

## Review method

1. Read the Work Activity Summary from page 1 of each original IDR PDF.
2. Cross-check useful details in the Item, Description, and Location of Work table on the same page.
3. Compare each described action with all 27 activities on the original schedule pages, using activity identity rather than planned date because the two schedule snapshots move several dates while retaining the same IDs.
4. Treat a summary as multi-label when it explicitly describes multiple scheduled activities.
5. Do not invent labels for structure survey or dynamic pile testing because this 27-activity schedule has no distinct activities for them.

## Proposed decisions

| Row | Date | Proposed | Expected after review | Verdict | Why |
|---:|---|---|---|---|---|
| 1 | 2011-02-10 | 1055 | 1055, **1065** | Incomplete | The DPR says both confined and unconfined curtains were tested. |
| 2 | 2011-02-11 | 1060, 1050 | 1050, 1060 | Correct | Mobilize to A and install A-1. |
| 3 | 2011-02-11 | 1060, 1055, **1130** | **1050**, 1055, 1060 | Wrong + incomplete | This is initial mobilization to A (1050), not the later return-to-A activity (1130). |
| 4 | 2011-02-12 | 1080, 1055 | 1055, 1080 | Correct | Install A-3 plus unconfined-curtain work. |
| 5 | 2011-02-12 | 1080 | 1080 | Correct | Exact pile identity match. |
| 6 | 2011-02-14 | 1140, 1180, 1070 | 1070, 1140, 1180 | Correct | Install A-2, restrike A-1, remove an A pile. |
| 7 | 2011-02-15 | 1160, 1180, 1090 | 1090, 1160, 1180 | Correct | Install A-4, restrike A-3, attempt A-pile removal. |
| 8 | 2011-02-16 | 1120, 1065 | 1065, 1120 | Correct | Install B-2 plus confined-curtain work. |
| 9 | 2011-02-16 | 1120 | **1100**, 1120 | Incomplete | The DPR also explicitly says the barge moved to the Washington/Location B side. |
| 10 | 2011-02-17 | 1110, 1150, 1180, 1065 | 1065, 1110, **1130**, 1150, 1180 | Incomplete | The explicit move from B back to A was omitted. |
| 11 | 2011-02-17 | 1110 | 1110, **1130** | Incomplete | The summary also reports moving the barge to the Oregon/Location A side. |
| 12 | 2011-02-18 | 1180, 1170 | 1170, 1180 | Correct | A-pile removal plus A-4 restrike. |
| 13 | 2011-02-21 | 1210, 1220 | **1200**, 1210, 1220 | Incomplete | The DPR says both B-1 and B-2 were restruck; B-1 restrike was omitted. |

Bold IDs are changes from the machine candidate set.

## Preliminary metrics if these labels are approved

- Exact activity-set accuracy: **7/13 = 53.8%** (Wilson 95% CI: **29.1%-76.8%**)
- Proposed-link precision: **26/27 = 96.3%**
- Proposed-link recall: **26/32 = 81.3%**
- Micro F1: **52/59 = 88.1%**
- One wrong proposed link: row 3 proposed activity 1130 instead of 1050.
- Six omitted links: 1065 (row 1), 1050 (row 3), 1100 (row 9), 1130 (rows 10 and 11), and 1200 (row 13).

These metrics describe exact multi-label schedule linking. They should not be compared directly with single top-1 retrieval accuracy without stating the different unit of evaluation.

## Decisions worth a second look

- Rows 4 and 8 map DPR wording "install [un]confined bubble curtain system" to schedule wording "TEST [UN]CONFINED BUBBLE CURTAIN." This is the only available schedule work package for that curtain work and the timing aligns, but the wording is not exact.
- Row 11 labels the explicit movement as 1130 but does not label the stated future purpose (restrikes/removal) as completed work.
