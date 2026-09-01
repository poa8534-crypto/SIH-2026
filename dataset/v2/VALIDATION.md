# VALIDATION — dataset/v2

Generated with seed 20260901 by `generate_v2_dataset.py`.

## Composition

- total mentions: **700**
- gold positives: **632**
- hard negatives: **68** (9.7%)
- distinct activity ids referenced: **218** of 218
- deliberate near-miss mentions: **35**

## 1. Every positive label's activity_id exists in v2

- **PASS** — all 632 positive labels resolve exactly.

## 2. No hard negative accidentally matches an activity

- **PASS** — 0 of 68 hard negatives auto-link at default thresholds (tau_high=0.78, margin_min=0.06).

## 3. Tag-free positive mentions

- **68.2%** (431/632) carry no tag-shaped token at all — the honest reading of the requirement (PASS, minimum 35%).
- **84.8%** (536/632) carry no tag that `extraction.prepass.extract_tags` can SEE.

| discipline | positives | no literal tag | share | invisible to extractor | share |
|---|---:|---:|---:|---:|---:|
| civil | 131 | 108 | 82.4% | 129 | 98.5% |
| electrical | 61 | 37 | 60.7% | 42 | 68.9% |
| hse | 87 | 84 | 96.6% | 87 | 100.0% |
| instrumentation | 105 | 70 | 66.7% | 86 | 81.9% |
| piping | 136 | 79 | 58.1% | 82 | 60.3% |
| static_equipment | 112 | 53 | 47.3% | 110 | 98.2% |

### The tag-recognition gap

`extract_tags` recognises 22 of 40 distinct tag strings in v2. It does **not** recognise 18:

    CS-2501, FE-1401, FST-1301, LT-1201, OWS-2201, P-1401A, PK-2401, PT-1101, TE-1301, TK-2101, TK-2102, V-1101, V-1201, V-1401, V-2101, V-2201, V-2301, WHCP-2101

`EQUIPMENT_TAG_RE` allows a 1-3 digit suffix (`[A-Z]{1,3}-\d{1,3}[A-Z]?`). Every v1 tag fits that — `V-101`, `TK-1`, `CS-01` — and all 12 are recognised. v2 numbers its equipment with 4 digits (`V-1101`, `PT-1101`, `TK-2101`, `PK-2401`), so those tags sit in the text unread.

The consequence is not cosmetic. `tag_overlap` is the near-decisive feature in the ranker, so on v2 the tag channel is roughly half blind, and the mentions above are matched on description similarity alone. **This was left unchanged deliberately** — the regex lives in `extraction/prepass.py`, feeds `tag_overlap`, and widening it would move v1's published numbers too. It is reported here as the first thing to fix, not silently patched under an evaluation.

### No mention implies an impossible percentage

- **PASS** — 0 of 700 mentions parse to a percentage outside 0-100.

`FRACTION_RE` in `extraction/prepass.py` is `(\d+)\s+(?:of|out of|of total)\s+(\d+)`, which reads the digit inside a unit suffix. `40 m3 of 120 m3` parses as **3/120 = 2.5%**, not 33%; `320 m2 of 480 m2` parses as **0.4%**. It affects every unit ending in a digit — m2 and m3, which is 42 of v2's 218 activities and most of the civil scope. This corpus phrases quantities as `40 of 120 m3` to avoid the collision, so the numbers here are correct, but **the extractor bug is live for any real DPR that writes it the natural way.** Reported, not fixed: the regex feeds `percentage`, which gates `actual_finish` (D-008/D-015).

## 4. Hard-negative count

- 68 hard negatives (PASS, minimum 60)

## 5. Splits

| split | mentions | positives | negatives |
|---|---:|---:|---:|
| train | 423 | 381 | 42 |
| dev | 140 | 127 | 13 |
| test | 137 | 124 | 13 |

Per-discipline distribution across splits:

| discipline | train | dev | test |
|---|---:|---:|---:|
| civil | 78 | 27 | 26 |
| electrical | 37 | 12 | 12 |
| hse | 52 | 17 | 18 |
| instrumentation | 64 | 21 | 20 |
| piping | 83 | 27 | 26 |
| static_equipment | 67 | 23 | 22 |

## 6. No mention appears in more than one split

- **PASS** — 689 distinct mention texts, each in exactly one split.

## 7. Dates stated in the mention text

- 340 of 632 positive mentions state a date in the text (53.8%).
- Those resolve as EXPLICIT / RELATIVE_RESOLVED; the rest fall back to the report date and are DEFAULTED_TO_REPORT_DATE.
- mention_date values not traceable to the text: 0

## Result

**All checks passed.**
