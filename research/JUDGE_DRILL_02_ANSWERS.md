# NAVIS — the brutal Q&A drill · PART 2 of 2: THE MODEL ANSWERS

> **Answers to all 103 questions in `JUDGE_DRILL_01_QUESTIONS.md`.** Same numbering:
> Q17 in that file is A17 here. Not to be confused with `JUDGE_QUESTIONS.md` in this
> folder, which is the older 12-question v1 document.
>
> Prepared 2026-09-10 against commit `0a1eb23`. Every figure here is verified against
> `../NUMBERS_SHEET.md`, `../METRICS.md`, `matching/config.py` or the source file named
> in the answer. **`../METRICS.md` wins any disagreement.**

**How to use these.** They are the *shape* of the answer, not a script — memorise the
first sentence of each and let the rest come out in your own words. Every one is built
the same way: **concede, then give the number, then say why that trade was chosen.**
Anything marked ⚠ is a landmine where a natural-sounding answer is a false one.

**Blank answers.** A few of these say *"answer this honestly, we do not have that."*
Do not fill them in with something plausible. "I don't have that number" beats an
invented one every single time, and a panel that catches one invented figure treats
every other number you gave as invented too.

---

## Block A — the lay judge

**A1 · What does it do, in one sentence.**
"It reads what the site already writes and says, works out which planned activity that
describes, and updates the real start and finish dates in the schedule — with a record
of the exact file and line every date came from."

**A2 · So it's a data-entry app?**
"The opposite. Data entry is a person typing into a form. We take the report they
already wrote and do the part that costs a planner days — deciding which of the
schedule's activities each sentence is about."

**A3 · My nephew's WhatsApp bot did this.**
"Capturing the message is the easy half, and a bot does it well. The hard half is
choosing between 120 planned activities that all sound alike, and refusing when the
evidence is weak. That refusal is the product."

**A4 · Explain it without the jargon.**
"A large project has a plan listing thousands of small jobs. The work happens, and
people describe it in their own words. Somebody has to decide which sentence belongs to
which job. Today a person does that by hand, weeks late. We do that matching in
seconds, and we mark the ones we are not sure about instead of guessing."

**A5 · Who asked for this? Name the person.** ⚠
"Nobody at Oil India — this is problem statement 26122 as they published it, and we
built against that text. We have not interviewed their planners, and I am not going to
pretend otherwise." *Never invent a name or a site visit.*

**A6 · Which planner told you it takes days?**
"The problem statement does: it says reconciliation 'lags the schedule update cycle by
days or weeks'. That claim is theirs, not ours."

**A7 · Why has Oil India not solved it already?**
"Primavera solves planning, not capture. The gap is unstructured input, and the cost of
a wrong actual date is high enough that nobody automates it without a way to refuse. We
built the refusal first, which is the part that makes the rest safe."

**A8 · Isn't this Excel with extra steps?**
"Excel cannot tell you that 'spool erected' is activity PIP-1420-060, cannot say it is
unsure, and cannot show you the line of the report a date came from six months later."

**A9 · Why not hire two more planners?**
"Two more planners still reconcile by hand, still lag by days, and their knowledge
still leaves with them at project close. And we do not replace the planner — the
planner reviews the exceptions; we remove the transcription."

**A10 · Show me the moment it saves time. On the screen.**
Go to the review queue. "This row is queued, and the screen tells you why. Source text,
the file and line it came from, the confidence, and the alternatives it considered. Our
ranker suggested this activity; reading the note, the correct one is that one. I reject
and confirm — and the correction goes to an append-only audit trail with its reason."

**A11 · Why is this different from my daughter using ChatGPT?**
"A language model cannot tell you why it chose an activity, cannot be audited, and will
occasionally invent an activity ID that does not exist. Ours is switched off for every
number we quote. It may help read a messy sentence; it never chooses."

**A12 · What breaks tomorrow without it?** ⚠
"Nothing breaks. Planners go back to reconciling by hand, and the schedule keeps
lagging. This is a lag and memory problem, not a safety system, and I am not going to
dress it up as one."

**A13 · Convince me you understood the problem first.**
"The statement lists four consequences: fragmented data, slow manual reconciliation,
analytics inheriting late data, and knowledge lost at project close. Our four answers
are: one ingestion path for mixed formats, automatic linking with a confidence gate, a
structured discipline-tagged dataset, and a queryable record of real durations. The
fourth one is the one most teams skip."

**A14 · What did you build, what did a library build?**
"Libraries: FastAPI, rank_bm25, sentence-transformers for MiniLM, SQLAlchemy, React.
Ours: the extraction rules, the three-channel retrieval fusion, the six-feature ranker,
the confidence policy, the quantity roll-up, the audit trail and the pure-Python
Primavera parsers."

**A15 · A 55-year-old supervisor in Assam, first five minutes.**
"He does not touch the laptop. He speaks one sentence, or his existing daily report
gets uploaded by whoever already types it. The honest limitation: browser speech needs
a network, so on a site with no signal it is the typed path, which we have tested end
to end."

---

## Block B — designed to make you feel small

*Concede in three words, answer the reasonable question underneath, stop talking.*

**A16 · Have you ever set foot on an oil field?**
"No. None of us. That is exactly why the system asks a planner instead of deciding —
we built it to be corrected by someone who has."

**A17 · How old are you, and you're telling a PSU how to work?**
"I'm [age]. We are not telling anyone how to run project controls. The planner keeps
every decision; we remove the typing between the report and the schedule."

**A18 · Which of you is the actual developer? The rest — what did you do?**
Answer plainly and specifically, by name and by area. Silence or vagueness here reads
as one person carrying two passengers, which is what the question is fishing for.

**A19 · Four minutes and not one original idea.**
"Fair. The original part is one sentence: the system refuses to write a date when the
evidence is weak, and we can show you the measured refusal rate rather than assert it."

**A20 · This is a first-year project. Where's the innovation?**
"The matching is not novel. The confidence policy is: a score threshold, a margin
between the top two candidates, and a rule that a finish date that exists only because
a report header carried it is withheld and routed to a human. That is what holds
precision at 100% on the held-out test."

**A21 · Thirty years in PM. Nothing you said is new.**
"Then you are the right person to tell us where it breaks first, and I mean that. Which
would you attack — the granularity mismatch, or the terminology drift between
disciplines?"

**A22 · Do you know what a hydrotest is?**
"A hydrostatic pressure test — you fill the completed line or vessel with water,
pressurise it above operating pressure and hold it to prove integrity before
commissioning. It is also why a wrong actual date is expensive: it can trigger one
early."

**A23 · L4 versus L6, ten seconds.**
"L4 is a management-level summary rolled up for reporting. L6 is the executable task a
crew actually performs on a given day. The plan cascades L1 down to L5/L6; field
reporting happens at L6 or finer."

**A24 · Who has read the whole problem statement?**
"All of us. The clause most teams skip is the last expected outcome — institutional
memory: a queryable repository of real durations, recurring delay causes and
discipline-wise productivity, so the knowledge does not die at project close."

**A25 · You built what was easy.**
"Some of it, yes — there is no authentication, and that was a deliberate cut. What we
did not skip is the part the statement actually scores: linking field language to L5/L6
activity IDs, and refusing when unsure."

**A26 · How much of this was written by AI?** ⚠
"It was written with AI assistance, and I can explain any line of it. Pick a file —
`matching/features.py` or `server/main.py` — and ask me what it does and why."
*Never claim none. A judge who catches that has caught you lying about something
harmless, and will assume you lied about the numbers too.*

**A27 · What if I told you the whole approach is wrong?**
"Which part? If it is the threshold, we can show you the precision-coverage sweep and
change one constant. If it is separating retrieval from ranking, that one we would
argue for — it is what makes the explanation auditable."

**A28 · Your teammate hasn't spoken. Ask them.**
Hand over immediately, by name, with the question intact. Every member must own at
least one answer cold — recommended split: metrics, the demo, adoption and cost.

---

## Block C — money, adoption, procurement

**A29 · Cost per project per year?** ⚠
"I do not have a costed model and I am not going to invent one here. What I can tell
you is the cost floor: it runs on one laptop CPU with no GPU and no paid API calls, so
there is no per-transaction cost to pass on."

**A30 · Who pays?**
"The owner — the PSU. They carry the schedule risk, they own the baseline, and they are
the ones whose analytics inherit the bad data today."

**A31 · The contractor causing the delay has every reason not to use it.**
"That is the real adoption risk, and it is a contractual problem before it is a
software one. Two things reduce it: we read the reports they are already contractually
required to submit rather than adding a new obligation, and nothing is auto-written
without an audit record the contractor can contest."

**A32 · P6 already costs a licence per seat.**
"P6 stores the plan. It will not read a daily progress report, and it has no opinion
about which activity a sentence describes. We import the baseline, write actuals back,
and never touch the planned dates."

**A33 · Who owns the data?**
"The owner does, and it never leaves their network — everything runs on premise, no
cloud service, no API key. We store nothing. Beyond that it is a contract question, not
a software one."

**A34 · A planner overrules the system and is wrong. Who is accountable?**
"The planner, exactly as today. The difference is that the audit record shows who
decided, when, on what evidence and with what confidence — so the error is findable
instead of anonymous."

**A35 · Wrong date, early payment. Who is liable?** ⚠
"Not something I can answer as a liability question — that sits in the contract. What I
can tell you is the control: no date is auto-written unless the score clears 0.80 and
the margin over the second candidate clears 0.03, and every write carries its source
line." *Do not offer any indemnity, ever.*

**A36 · Product, feature or research project?**
"Today it is a working prototype. Commercially it is a feature — a linking layer
between field reporting and the PMIS. It should not be a separate product a PSU has to
adopt on its own."

**A37 · Oracle could ship this in one release.**
"They could. They have not, and the gap has been there for a decade. And what a PSU
needs is not a cloud feature — it is something that runs inside their network with a
refusal policy they can audit."

**A38 · What's your moat, and not the audit trail.** ⚠
"There is no moat. What is hard to copy quickly is the calibration — the thresholds,
the evaluation discipline, and the domain vocabulary. That is months of measurement,
not a secret."

**A39 · How do you sell into a PSU? What's a GeM tender?**
Answer honestly. If you know the Government e-Marketplace route, say it in one line. If
you do not: "I do not know that process. If we were serious about this we would learn
it before writing a business plan."

**A40 · Have you spoken to anyone in the industry?**
Answer honestly — yes, with names, or no. ⚠ *Do not invent an advisor.*

**A41 · ₹50 lakh — what do you show in six months?**
"A labelled real-data pass with a partner project, a production Primavera connector,
authentication and multi-tenancy, and one pilot with a measured before-and-after on
reconciliation lag. If the pilot does not move the lag, the honest answer is that it
did not work."

---

## Block D — the synthetic data hammer

**A42 · Is any of it real Oil India data?**
"No. The problem statement says live project data will not be shared and instructs
teams to work with synthetic data of similar structure. That is what we did."

**A43 · You wrote the test and graded yourself.**
"Yes, and we audit that ourselves in `METRICS.md` §3.4a: 84% of test positives reuse an
activity seen in training, so these are in-distribution numbers. We say what they do
not establish."

**A44 · What did your accuracy actually measure?**
"That the pipeline is consistent under vocabulary we authored, on data no threshold was
tuned against — the split is by source document, not by row, so near-duplicate mentions
from one report cannot straddle it. It does not establish performance on an unseen
project."

**A45 · Where did the vocabulary come from?**
"Structured against CFIHOS, the public oil and gas equipment taxonomy, which is in
`datasets/real/`. There is also a genuinely authentic public schedule in there — 27
activities, WSDOT — and we do not inflate that number."

**A46 · Real reports are shorthand, contractor tag schemes, local phrasing.**
"Accuracy would drop and we would expect it to. That is why coverage is a dial and not
a fixed property: at a stricter threshold you link fewer and stay correct. The metric
we defend is precision at whatever coverage the site can live with."

**A47 · Real export, in this room, right now.**
"We would import it — `POST /schedule/import` takes P6 PMXML and XER through
pure-Python parsers, no MPXJ and no JVM — and run against it live. And I would expect
lower numbers than the ones on our slide."

**A48 · Explain "in-distribution" to the non-technical judges.**
"It means our test looked a lot like our practice material. It is like scoring 90% on a
mock paper set by your own teacher — it says the method works, it does not say what you
will score on the real exam."

**A49 · Then why is it on your slide?**
"Because it is the bound of what we have actually measured, and the scope is printed
next to it. The alternative is a slide with no numbers at all, which is worse."

**A50 · Would you sign your name to it in front of a controls head?**
"Yes — with the scope line attached: 154 held-out mentions, synthetic corpus, one
project, in-distribution. I would not sign the number on its own."

---

## Block E — the metric interrogation

**A51 · 43.5% coverage — so it fails more than half the time.**
"It auto-links 67 of 154 and sends the rest to a planner with ranked candidates. None
are lost. The 43.5% is the price of the 100%, and if a site wants more coverage the
threshold is one constant."

**A52 · Proud of giving up on 87 of 154?**
"It does not give up on them — it queues them with the source text, the confidence and
the alternatives, which is a smaller job than reconciling from scratch. In an oil field
a wrong date can trigger false billing or an early hydrotest. We would rather send half
to a human."

**A53 · 100% on 67 samples. Give me a confidence interval.**
"On 67 out of 67, the 95% one-sided lower bound is about 95.6%, two-sided about 94.6% —
by the rule of three the true error rate could be up to roughly 4.5%. So the honest
claim is 'no wrong auto-links observed in 67', not 'perfect'. We would need several
hundred more to say more."

**A54 · The count, not the percentage.**
"Zero wrong auto-links. Twenty-eight wrong top suggestions, all of them sitting in the
review queue where a planner sees them, none written to the schedule."

**A55 · 86.9% or 71.4% — which is real?**
"Both, on different corpora. 86.9% is top-1 on the shipped v1 held-out test, 126 of
145. 71.4% is top-1 on the harder v2 research corpus, 132 of 185 against 218
activities. Neither supersedes the other; `METRICS.md` §1 and §3 defines both, and the
deck carries the one that describes the build that ships."

**A56 · What happens at 79% confident?**
"It goes to the planner. Auto-link needs the top score at 0.80 or above *and* a margin
of 0.03 or more over the second candidate. Below 0.40 it is treated as new scope.
Between the two, or with too small a margin, it is a review row."

**A57 · Where did 0.80 come from? Prove it wasn't tuned to look good.** ⚠
"It is in `matching/config.py`, and the selection rule is written above it. On the
100-mention dev split we took, among threshold sets holding 100% dev precision at 45%
dev coverage or better, the *most conservative* — highest tau_high, then largest margin
— not the highest-coverage one. The dev-optimal set, 0.75/0.30/0.02, also hits 100% on
dev and collapses to 93.2% on test: seven wrong auto-links. That is the whole argument
for conservatism, and it is D-093."

**A58 · Did you tune on the data you report on?**
"No. The split is assigned by source file, so all mentions from one daily report land
on one side. Nothing was tuned on the 154 test mentions, and the server and the
evaluator read the same constant, so the reported figure describes the shipping build."

**A59 · How many review rows carry a wrong top suggestion?**
"Twenty-eight. A planner rejects those; none of them reached the schedule."

**A60 · Name your own worst metric.**
"NO_MATCH refusal — telling genuinely new scope apart from an uncertain match. Pooled
over 70 negatives we refuse 80.0%. On the nine-negative slice in the shipped eval, zero
of nine were refused outright — all nine went to the review queue instead, which is the
safe failure direction but is not the same as refusing."

**A61 · recall@20 is 100%, so retrieval is solved.**
"Correct, and we say so: every remaining error is ranking, not retrieval. It is on the
slide because it is the guarantee to the planner — the right activity is in the list
you are being shown. It is also why we stopped improving retrieval: four planned
improvements each measured +0.00."

**A62 · How many of your 1,426 tests would fail if the matcher were wrong?** ⚠
"Not all of them — 1,202 are backend and 224 frontend, and plenty of the frontend ones
are UI. The ones that pin behaviour are in `matching/` and `server/`: the threshold
policy, the date-basis guard that withholds a report-header finish date, the append-only
audit trail, and the P6 round trip. I would not claim all 1,426 are matcher tests."

**A63 · Run it now.**
"`python eval.py`." Have the terminal open, the venv active and the run rehearsed
before you walk in. If it is slow, say what it is doing while it runs.

---

## Block F — the technical judge

**A64 · Name the six features and their weights.**
"`tag_overlap` 0.32, `embedding_cosine` 0.22, `fuzzy_similarity` 0.20, `date_proximity`
0.10, `discipline_agreement` 0.06, `predecessor_plausibility` 0.06 —
`matching/features.py`, `FEATURE_WEIGHTS`."

**A65 · Which feature carries it, and what if that field is misspelled?**
"Tag overlap dominates at 0.32, and that is why a hallucinated tag from a language
model would corrupt linking — so tags never come from the LLM. When the tag is absent
or wrong, BM25 and the dense channel carry it: on the tag-stripped ablation top-1 falls
from 87.2% to 70.1%. We report that drop rather than hide it."

**A66 · The PS asks for an LLM agent. Yours is off by default.**
"The conversational agent exists and is what a supervisor talks to — slot filling in
`server/agent_slots.py`, deterministic so it cannot fail on stage. The language model
sits behind one environment flag with a timeout and a silent fallback. It can read
intent out of informal prose; it never chooses the activity and never writes a date.
That is a design decision we will defend, not a gap."

**A67 · So where's the AI? BM25 is from the 1990s.**
"The embedding channel is a transformer, and the decision is a weighted ranking over
six features. But the deliberate part is that the decision stays explainable — a
planner can see which feature carried it. Regex is the extraction layer, not the
matcher."

**A68 · Why MiniLM? Did you measure alternatives?**
"It runs on a CPU with the weights cached locally, which is the constraint. And
measurement said the channel choice barely matters: fusion recall@20 is already 100%,
and four planned retrieval improvements each measured +0.00. A cross-encoder rerank
costs about 45 ms per event — roughly twenty times the whole pipeline — and we did not
evaluate its accuracy, so I will not claim we rejected it on quality." ⚠

**A69 · Two reports contradict each other about the same activity.**
"It becomes a source conflict and is surfaced for planner adjudication rather than
resolved silently — `list_source_conflicts` in `server/main.py`. The later file does not
silently overwrite the earlier one; both sources stay attached to the row."

**A70 · Granularity mismatch — one spool versus one line.**
"That is the quantity roll-up. Many field mentions map onto one activity and the
percentage is computed from quantity against the planned quantity, not from the count
of mentions. And a node with no measurable quantity gets no percentage and no date at
all — in the eval funnel that is 32 of the 39 nodes we touched."

**A71 · Three disciplines, three vocabularies. Which wins?**
"The tag wins when there is one. Discipline is deliberately a soft signal at 0.06,
because inference from field text is noisy — 'pipe rack' reads as piping inside a civil
sentence. A genuine discipline conflict blocks the auto-link and sends it to review
rather than picking a winner."

**A72 · Institutional memory from how many completions?**
"Three. `MIN_ACTUALS_FOR_ESTIMATE = 3` in `server/main.py`. Below that the endpoint
returns no duration at all and says how many records it found and how many it needs —
it does not fall back to the planned value. Would I plan a real project on three? No.
The architecture is the contribution; the sample grows with every ingest."

**A73 · Does it learn from planner corrections? Careful.** ⚠
"No, and this is the one we measured instead of claiming. Corrections are persisted as
a training signal, and the shipped matcher does not read them back. We tested wiring
them into retrieval: alias recall@20 on the test split is 0.0%, zero of 185 test
mentions share an alias key with training, only 16 of 793 keys ever repeat, and fusion
recall@20 is already 100% — so no retrieval channel has anything left to give.
Corrections belong in ranking, not retrieval. `w_alias` ships at 0.0." *Never say "to
prevent runaway bias" — nothing measured any bias.*

**A74 · Where's the authentication?**
"There is none. The login screen is a role picker and it says so on screen. Single
project, single tenant. It is the first production item, and it is exactly why the
audit trail is append-only — every write is attributable even without accounts."

**A75 · Show me the code that prevents an UPDATE.**
"`server/db.py` — audit records are inserted, never mutated; a correction writes a new
row referencing the old one, and the import path is guarded so a new baseline cannot
destroy the trail. That is D-004." Have the file open in the editor before you present.

**A76 · P95 latency, one report and a thousand?** ⚠
"The matcher is 2.84 ms per event batched, about 352 events per second, from
`research/bench/profile_latency.py`. End-to-end HTTP P95 under concurrent load we have
not measured, so I am not going to give you a number for it."

**A77 · Two supervisors submit in the same second.**
"SQLite is a single-writer store, and the app is one project on one machine, so the
second write waits. That is fine for the scope we claim and it is not a concurrency
story — for a real deployment it is Postgres, and the data layer goes through
SQLAlchemy precisely so that is a configuration change."

**A78 · Mic dead, model file missing, port occupied — all at once.**
"Typed entry replaces the mic and is tested end to end. The dense model loads with
`local_files_only` and falls back to a hashed n-gram channel at reduced quality rather
than failing. The port case is in the runbook — the pre-flight in `DEMO.md` checks it
before we present."

**A79 · Will Primavera open your XER?** ⚠
"Not as it stands. Our XER writer emits our own simplified shape and we document that as
D-047 — I will not call it a P6-valid round trip. PMXML is the interchange we would use
in both directions, and import of both formats is real."

**A80 · Show me the last commit.**
"`0a1eb23` — a rebuild of the submission deck on the official SIH template. Documents
and build scripts only; no engine code changed. The engine has been frozen since the
threshold work in D-093, which is deliberate the night before a finale."

---

## Block G — off-topic and time-waste

*Answer in one sentence. Do not correct their framing. Steer back with one move, or do
not steer back at all — some of these are just noise, and treating noise as an attack
is itself a tell.*

**A81 · Why NAVIS?** "It is just a name — short, and it does not claim anything about
the software." ⚠ *Do not invent an etymology or an acronym expansion on the spot.*

**A82 · Your slide has a spelling mistake.** "Thank you — I will fix it. If it is on one
of the numbers, tell me which and I will correct it now."

**A83 · Which college, which branch?** Answer plainly. One line, no defensiveness.

**A84 · Why not sit for placements?** "We did/we will — this was worth the time." One
line, then stop. Do not justify.

**A85 · Your view on AI regulation?** "Not my area to opine on. The part that touches us
is auditability — every decision our system makes is traceable to a source line and a
human confirmation, which is the direction most of the guidance points."

**A86 · Will this take planners' jobs?** "No. It removes the transcription, not the
judgement — the planner still decides every uncertain row, and 87 of 154 mentions come
to them by design."

**A87 · Carbon footprint?** "It runs on one laptop CPU with no GPU and no cloud
inference. That is the entire honest scope of the answer."

**A88 · How does this help farmers?** ⚠ "It does not. It is a project-controls tool for
infrastructure execution." *Do not stretch. The stretch is the trap.*

**A89 · What does your team name mean?** Answer plainly in one line.

**A90 · Name three past SIH projects that reached production.** ⚠ "I cannot name three
off the top of my head. I am not going to make them up."

**A91 · Do you have a patent? Why not?** "No. There is nothing patentable here yet — the
value is in calibration and evidence, not a novel algorithm."

**A92 · Can it run on a phone?** "The interface is responsive and works in a phone
browser; there is no native app. The one caveat is browser speech, which needs a
network."

---

## Block H — stress, silence and patience

*These are behavioural. The answer is what you do, not what you say.*

**A93 · Interrupted at eight seconds.** Stop mid-word. "Understood — the question was
[repeat it in five words]. The answer is [one sentence]." Never finish the sentence you
were on.

**A94 · Eight seconds of silence after your answer.** Say nothing for the first three.
Then offer one concrete artefact, not more words: "Would you like the evaluation output
on screen?" Silence is a test of whether you will start babbling. Most teams babble.

**A95 · "And? … keep going."** Give exactly one more sentence — the next most important
fact, not a restatement — then stop again.

**A96 · Two judges start talking to each other.** Keep going at the same pace for two
sentences. Then pause and ask: "Would you like me to continue, or move to the demo?"
Do not speed up and do not raise your voice.

**A97 · The same question again, word for word.** Answer it again, shorter, in different
words. ⚠ *Never say "as I mentioned" or "like I said."*

**A98 · That contradicts your teammate.** "You are right that we said it differently.
The accurate figure is [X] — [name] was describing [the other thing]." Agree beforehand
who defers to whom on numbers, so this never becomes a live negotiation.

**A99 · "Are you even listening to me?"** "Yes — short answer: [one sentence]." No
apology beyond the word sorry, if that.

**A100 · Thirty seconds. Best thing about it.** "It refuses. On a held-out test it wrote
67 actual dates and got all 67 right, because the 87 it was not sure about went to a
planner instead. And every date it did write points back to the file and line it came
from."

**A101 · The demo crashes.** "Yes." Then move, do not explain: "Here is the same result
from the command line" — and run `python eval.py`, or show the rendered slides. ⚠ *Never
blame the laptop, the wifi, the projector or the venue. Every judge has watched a team
do that.*

**A102 · One more week — what would you fix, and why not last week?**
"Authentication, and a labelled pass over real data with a partner. Last week went into
the threshold work instead — the choice that took auto-link precision from 95.2% to
100% on held-out data. Given one week, that was the right order."

**A103 · One reason to pass you that I haven't heard.**
"Because I can show you the four dates our system refused to write and tell you exactly
why it refused each one — and every team before us has shown you only the ones theirs
got right."

---

## The single sentence to end on, whatever they asked

> "Every date this system writes points back to the file, the line and the confidence
> it came from — and when it is not sure, it does not guess, it asks."

---

*Answer authority: `../NUMBERS_SHEET.md` §1 and §3, `../METRICS.md`, `matching/config.py`
(SHIPPED_THRESHOLDS and D-093), `matching/features.py` (FEATURE_WEIGHTS),
`server/main.py` (MIN_ACTUALS_FOR_ESTIMATE, source conflicts), `server/db.py` (D-004).
Verified 2026-09-10 at commit `0a1eb23`.*
