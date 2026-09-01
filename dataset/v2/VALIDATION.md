# VALIDATION — dataset/v2

Generated with seed 20260901 by `generate_v2_dataset.py`.

## Composition

- total mentions: **814**
- gold positives: **744**
- hard negatives: **70** (8.6%)
- distinct activity ids referenced: **218** of 218
- deliberate near-miss mentions: **160** (19.7%)
    - shared_tag: 117
    - discriminator_omitted: 27
    - adjacent_sequence: 16
    - split placement: train 37 | dev 55 | test 68
    - every near-miss names the discriminator it omits: True

## 1. Every positive label's activity_id exists in v2

- **PASS** — all 744 positive labels resolve exactly.

## 2. No hard negative accidentally matches an activity

- **PASS** — 0 of 70 hard negatives auto-link at default thresholds (tau_high=0.78, margin_min=0.06).

## 3. Tag-free positive mentions

- **54.3%** (404/744) carry no tag-shaped token at all — the honest reading of the requirement (PASS, minimum 35%).
- **53.9%** (401/744) carry no tag that `extraction.prepass.extract_tags` can SEE.

| discipline | positives | no literal tag | share | invisible to extractor | share |
|---|---:|---:|---:|---:|---:|
| civil | 147 | 97 | 66.0% | 97 | 66.0% |
| electrical | 78 | 46 | 59.0% | 46 | 59.0% |
| hse | 87 | 83 | 95.4% | 83 | 95.4% |
| instrumentation | 112 | 72 | 64.3% | 70 | 62.5% |
| piping | 173 | 67 | 38.7% | 66 | 38.2% |
| static_equipment | 147 | 39 | 26.5% | 39 | 26.5% |

### The tag-recognition gap

`extract_tags` recognises 40 of 40 distinct tag strings in v2. It does **not** recognise 0:

    

`EQUIPMENT_TAG_RE` allows a 1-3 digit suffix (`[A-Z]{1,3}-\d{1,3}[A-Z]?`). Every v1 tag fits that — `V-101`, `TK-1`, `CS-01` — and all 12 are recognised. v2 numbers its equipment with 4 digits (`V-1101`, `PT-1101`, `TK-2101`, `PK-2401`), so those tags sit in the text unread.

The consequence is not cosmetic. `tag_overlap` is the near-decisive feature in the ranker, so on v2 the tag channel is roughly half blind, and the mentions above are matched on description similarity alone. **This was left unchanged deliberately** — the regex lives in `extraction/prepass.py`, feeds `tag_overlap`, and widening it would move v1's published numbers too. It is reported here as the first thing to fix, not silently patched under an evaluation.

### No mention implies an impossible percentage

- **PASS** — 0 of 814 mentions parse to a percentage outside 0-100.

`FRACTION_RE` in `extraction/prepass.py` is `(\d+)\s+(?:of|out of|of total)\s+(\d+)`, which reads the digit inside a unit suffix. `40 m3 of 120 m3` parses as **3/120 = 2.5%**, not 33%; `320 m2 of 480 m2` parses as **0.4%**. It affects every unit ending in a digit — m2 and m3, which is 42 of v2's 218 activities and most of the civil scope. This corpus phrases quantities as `40 of 120 m3` to avoid the collision, so the numbers here are correct, but **the extractor bug is live for any real DPR that writes it the natural way.** Reported, not fixed: the regex feeds `percentage`, which gates `actual_finish` (D-008/D-015).

## 4. Hard-negative count

- 70 hard negatives (PASS, minimum 60)

## 5. Splits

| split | mentions | positives | negatives |
|---|---:|---:|---:|
| train | 430 | 387 | 43 |
| dev | 186 | 172 | 14 |
| test | 198 | 185 | 13 |

Per-discipline distribution across splits:

| discipline | train | dev | test |
|---|---:|---:|---:|
| civil | 71 | 37 | 39 |
| electrical | 43 | 17 | 18 |
| hse | 51 | 18 | 18 |
| instrumentation | 63 | 23 | 26 |
| piping | 88 | 42 | 43 |
| static_equipment | 71 | 35 | 41 |

## 6. No mention appears in more than one split

- **PASS** — 793 distinct mention texts, each in exactly one split.

## 7. Dates stated in the mention text

- 381 of 744 positive mentions state a date in the text (51.2%).
- Those resolve as EXPLICIT / RELATIVE_RESOLVED; the rest fall back to the report date and are DEFAULTED_TO_REPORT_DATE.
- mention_date values not traceable to the text: 0

## Result

**All checks passed.**
