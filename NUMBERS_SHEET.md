# NAVIS — THE NUMBERS SHEET

**PRINT THIS. ONE COPY PER PERSON. CARRY IT ON STAGE.**

Verified by running the code on **2026-09-10** against commit **`3db290c`**.
**Row 7 re-counted 2026-09-11 against `bee2694` — see the warning under the table.**
Rows 1, 2, 3, 8 and 9 were re-run on 2026-09-11 and are unchanged. Rows 4, 5, 6 and 10
are `METRICS.md` figures and were not re-run today.
Authority: `METRICS.md`. If this sheet and `METRICS.md` disagree, `METRICS.md` wins.

> ## THE RULE
> ## If a number is not on this sheet, do not say it.
> ## If you are unsure, say "I'd have to check that" — never estimate out loud.

---

## 1 · THE TEN NUMBERS

| # | Claim | SAY THIS | NEVER SAY |
|:--|:---|:---|:---|
| 1 | **Auto-link precision** | **100.0%** — 67 of 67. Zero wrong auto-links | — |
| 2 | **Coverage** | **43.5%** — 67 of 154 mentions | ~~50.4%~~ |
| 3 | **Top-1 accuracy** | **86.9%** — 126 of 145 | ~~87.2%~~ ~~96.7%~~ |
| 4 | **Held-out v2 top-1** | **71.4%** — 132 of 185, 218-activity corpus | — |
| 5 | **Recall@3** (planner depth) | **88.1%** — 163 of 185 | ~~Recall@20 = 100%~~ |
| 6 | **NO_MATCH refusal** | **80.0%** — 56 of 70, pooled | ~~8.3%~~ |
| 7 | **Automated tests** | **1,284** — 1,055 pytest + 229 vitest, all passing | ~~580~~ ~~635~~ ~~1,250~~ ~~1,422~~ ~~1,426~~ ~~1,431~~ |
| 8 | **Demo schedule** | **120 activities** | ~~218~~ *(that's research only)* |
| 9 | **Thresholds** | **0.80 / 0.40 / margin 0.03** | ~~0.85 / 0.15~~ |
| 10 | **Wrong review rows** | **28 queued, never written** | — |

**Reproduce any of these live:** `python eval.py`

> ### ⚠ THE PRINTED DECK SAYS 1,431. IT IS WRONG.
> `pytest -q` prints **1,055**, and it prints 1,055 at `3db290c` — the very commit the
> deck was verified against — as well as at `bee2694`. The test surface is identical at
> both commits (102 test functions, statically parametrised), so 1,202 was never a real
> run; it was a transcription error that then propagated into the deck, the flow charts
> and the drill answers. **1,284 is the number.**
>
> **If a judge points at the slide:** *"That figure on the slide is stale — the real
> count is 1,284, 1,055 Python and 229 TypeScript. You can run `python -m pytest -q`
> on this laptop right now."* Owning it costs you nothing. Defending 1,431 costs you
> the room, because it is the one number they can check in ten seconds.

---

## 2 · THE TWO FUNNELS — NEVER MIX THEM

### Funnel A — the evaluation (`python eval.py`)

```
154   held-out test mentions   (no threshold tuned on them)
 67   auto-linked              43.5% coverage · 100% precision
 39   schedule nodes touched
 32   had no measurable quantity  → no percentage, no date
  7   had a measurable quantity, and all 7 finish dates were WITHHELD
      because the only date available was the report header (D-015)
```

### Funnel B — the live demo database (what a judge sees on screen)

```
120   activities in the baseline
 67   carrying actuals
 38   completed
 12   on the critical path
 18   source conflicts surfaced for planner adjudication
```

> **CONFIRM FUNNEL B ON SCREEN TODAY** after `python scripts/reset_demo.py`,
> before the first rehearsal. Write the confirmed figures here:
>
> activities ______ · actuals ______ · completed ______ · critical ______ · conflicts ______

---

## 3 · THE SIX ANSWERS — deliver cold, no notes

**Q1 · "Why only 43.5% coverage?"**
> *"Of 154 held-out mentions we auto-link 67. Everything else goes to a human. Of the
> nodes we touched, most received no date at all — a node with no measurable quantity
> gets no percentage and no date, and a finish date that exists only because a report
> header carried it is withheld and routed to the planner. In an oil field a wrong date
> triggers false billing or a premature hydrotest. We would rather send half to a human
> than write one wrong date. That constraint is exactly why precision is 100%."*

**Q2 · "What if the work isn't in the plan?"** ← *weakest live answer, rehearse most*
> *"Pooled over 70 negatives we correctly refuse 80%. On this nine-item demo slice all
> nine go to the review queue rather than being linked — nothing is dropped and nothing
> is silently written. Separating genuinely new scope from an uncertain match is our
> next calibration, and we can show you the curve we'd tune along."*

**Q3 · "Does it learn from planner corrections?"**
> *"Corrections are persisted as a training signal today. We measured wiring them back
> into retrieval and it cannot help: alias recall@20 on the test split is zero percent,
> only 16 of 793 keys ever repeat, and fusion recall@20 is already 100% — no retrieval
> channel has anything left to contribute. Corrections belong in ranking, not retrieval.
> We do not claim the system self-learns today."*
>
> ❌ Never say "to prevent runaway bias." Nothing measured any bias.

**Q4 · "Why not just use an LLM?"**
> *"A language model can't tell you why it chose an activity, can't be audited, and will
> occasionally invent an activity ID that doesn't exist. For something writing into a
> real project schedule that's unacceptable. So the model is never in the ranking loop —
> every number we quote is measured with it switched off. It may help read a messy
> report; it can never choose what that report links to."*
>
> ❌ Never say "our ablation proved zero gain." That comparison is n = 1.

**Q5 · "Is this real Oil India data?"**
> *"No, and we're explicit about it. The schedule is synthetic — we authored it,
> structured against CFIHOS oil & gas taxonomy, which is genuinely public and sits in
> `datasets/real/`. We also audit our own benchmark in `METRICS.md` §3.4a and state what
> it doesn't establish: 84% of test positives reuse an activity seen in training, so
> these are in-distribution numbers and don't establish performance on an unseen
> project. Give us a real export and we'll run it in front of you."*
>
> ❌ Never say "authentic Upper Assam WBS." The baseline is a file we wrote.

**Q6 · "Can you read Primavera?"** ← *this is a STRENGTH, do not concede it*
> *"Yes. `matching/primavera.py` implements pure-Python parsers for Oracle P6 PMXML and
> tabular XER — no MPXJ, no JVM. `POST /schedule/import` accepts `.json`, `.xml` and
> `.xer`, and an imported baseline becomes the project the matcher runs against. We
> export both too — to be precise, our XER writer emits our own simplified shape, not a
> P6-valid file, and we document that in D-047."*

**Bonus · "What are its limitations?"** — volunteer this before they find it.
> Coverage is under half by design · NO_MATCH refusal is our weakest metric · there is
> no authentication, the login screen is a role picker and says so · single project ·
> synthetic corpus.

---

## 4 · FIVE THINGS THAT ARE FALSE — never say them

| ❌ Do not say | ✅ Truth |
|:---|:---|
| "Offline-first PWA" | **No service worker exists.** Say: *"runs entirely on-premise — no cloud, no API key, nothing leaves your network"* |
| "Zero external calls, everything works offline" | **Browser speech uses `webkitSpeechRecognition`, which needs the network.** Everything *else* runs with the cable pulled |
| "We have 200+ real schedule activities" | The authentic WSDOT schedule has **27** |
| "Bi-directional MS Project" | **No `.mpp` support.** P6 PMXML and XER only |
| "Empirical monsoon factor" | It is a **planning assumption**. Label it, keep the unadjusted figure visible |

---

## 5 · RECONCILE DEMO — read the reason OFF THE SCREEN

Do **not** script why a row was queued. A row is queued because its score is between
0.40 and 0.80 **or** because the margin is under 0.03 — and each row stores its own
reason. Live rows read `low_confidence`. **If you say "margin" while the screen says
"low_confidence," the judge sees the mismatch.**

> *"This row is in the queue, and the screen tells you why. It shows the source text,
> the exact file and line it came from, its confidence, and the alternatives it
> considered. Our ranker suggested this activity; reading the field note, the correct
> one is that one. I reject the suggestion and confirm the right activity — and that
> correction goes to an append-only audit trail with its reason. When it isn't sure, it
> doesn't guess. It asks."*

---

*NAVIS · SIH26122 · Oil India Limited · verified at commit `3db290c`, 2026-09-10*
