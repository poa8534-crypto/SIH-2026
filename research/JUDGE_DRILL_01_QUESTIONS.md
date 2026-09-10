# NAVIS — the brutal Q&A drill · PART 1 of 2: THE QUESTIONS

> **This file is the questions only — 103 of them, deliberately without answers, so it
> can be read aloud by whoever is playing the judge.**
> Model answers: `JUDGE_DRILL_02_ANSWERS.md`, same folder, same numbering (Q1 → A1).
> Not to be confused with `JUDGE_QUESTIONS.md` in this folder, which is the older
> 12-question v1 document.

**103 questions. SIH26122 · Oil India Limited · Team NamasteByte.**
Prepared 2026-09-10 against commit `0a1eb23`. Answer authority: `../NUMBERS_SHEET.md`,
then `../METRICS.md`. Nothing in this file is an answer script — it is the list of blows.

---

## How to run this drill

**The setup that matters.** Assume five judges. One or two can read code. The other
three or four cannot, and *they are the ones who decide*. A panel like that does not
attack your architecture — it attacks your confidence, your relevance, and your right
to be in the room. Most of the questions below are not about NAVIS at all. That is the
point.

**Rules for the two people being drilled.**

1. **Twenty seconds.** Any answer past twenty seconds is you talking yourself into a
   hole. Answer, stop, let them ask the follow-up.
2. **If the number is not on `../NUMBERS_SHEET.md`, do not say it.** "I'd have to check
   that" is a full, complete, respectable answer. Guessing out loud in front of five
   judges is the only unrecoverable move.
3. **Never say "actually" or "as I said earlier".** Both read as correcting the judge.
4. **One owner per question type.** Decide *now*, in writing, who takes metrics, who
   takes the demo, who takes business and adoption. A three-second silence while you
   look at each other costs more than a wrong answer.
5. **Volunteer the weakness before they dig it out.** Coverage is under half by design.
   There is no authentication. The corpus is synthetic. Said first, each of those is
   engineering judgment. Extracted under pressure, each is a cover-up.
6. **When you are interrupted, stop talking immediately.** Do not finish the sentence.
7. **You are allowed to say "that's a fair criticism."** It ends more attacks than any
   defence you can construct.

**How to drill.** One person reads questions in a flat, bored, slightly irritated
voice. No smiling, no "good question". Skip around the blocks — never in order.
Interrupt the answer at eight seconds on every third question. Ask "and?" after a
complete answer. Anyone who takes over thirty seconds, or quotes a number that is not
on the sheet, restarts that block from the top.

---

## Block A — the lay judge, who has not understood you yet

*These come from the three judges who will not read a line of your code. If you cannot
clear this block, nothing in blocks E or F will ever be asked.*

1. In one sentence a person with no engineering background can repeat back to someone
   else: what does this do?
2. So it's a data-entry app?
3. My nephew built a WhatsApp bot last year that did roughly this. What is the
   difference?
4. Explain the problem to me without using the words "schedule", "activity", "link" or
   "AI".
5. Who exactly asked for this? Name the person at the site who is waiting for it.
6. You say planners waste days on this. Which planner told you that? What is their
   name?
7. If it is such an obvious problem, why has Oil India not already solved it?
8. Isn't this just Excel with extra steps?
9. Why should the government fund this instead of hiring two more planners?
10. Show me, on the screen, right now, the single moment where this saves someone time.
    Not a slide. The screen.
11. My daughter uses ChatGPT for her homework. Why is this different from her doing
    that?
12. What breaks tomorrow morning if this software disappears?
13. You have six minutes. Convince me you understood the problem before you started
    coding.
14. Which part of this did you build and which part did a library build?
15. If I gave this to a 55-year-old site supervisor in Assam who has never used a
    laptop, what happens in the first five minutes?

---

## Block B — designed to make you feel small

*None of these are answerable on the merits. They are dominance tests. The only wrong
response is a defensive one. Answer the reasonable question underneath, in one
sentence, without flinching and without apologising for existing.*

16. Have any of you ever set foot on an oil field?
17. How old are you? And you are telling a PSU how to run its project controls?
18. Which of you is the actual developer? The rest of you — what did you do?
19. You have been talking for four minutes and I have not heard one original idea.
20. This is a first-year project. What is the innovation?
21. I have been in project management for thirty years. Nothing you have said is new to
    me. React to that.
22. Do you know what a hydrotest is? Explain it to me.
23. What is the difference between an L4 and an L6 activity? Answer in ten seconds.
24. Who on this team has read the actual problem statement? All of it?
25. You did not understand the problem statement. You built what was easy to build.
26. Be honest — how much of this was written by AI?
27. If I told you right now that the whole approach is wrong, what would you say?
28. Your teammate has not spoken once. Do they know how this works? Ask them, not me.

---

## Block C — money, adoption, and the questions engineers never rehearse

*Somebody on the panel is not technical and not impressed by accuracy. They want to
know if this survives contact with an organisation.*

29. What does this cost per project per year? Give me a number.
30. Who pays for it — the PSU, the EPC contractor, or the subcontractor whose data it
    exposes?
31. If it makes delays visible, the contractor who is causing the delay has every
    reason to stop using it. How do you solve that?
32. Primavera already costs the client a licence per seat. Why would they buy another
    layer?
33. Who owns the data? The contractor generated it, the PSU paid for it, you are
    storing it.
34. What happens the day a planner overrules the software and is wrong? Who is
    accountable?
35. Say a wrong date reaches a billing milestone and a contractor is paid early. Who is
    liable — you, the planner, or the PSU?
36. Is this a product, a feature, or a research project? Pick one.
37. Oracle could add this to P6 in one release. What stops them?
38. What is your moat? And do not say "the audit trail".
39. How do you sell into a PSU? Do you know what a GeM tender is?
40. Have you spoken to anyone in the industry who is not a judge or a mentor?
41. What is the first thing you would do with fifty lakh rupees, and what would you have
    to show for it in six months?

---

## Block D — the synthetic data hammer

*The PS states outright that live project data will not be shared. That is your defence
and they know it — which is why the pressure is on how honestly you handle the
substitute. Volunteer the limitation before it is extracted.*

42. Is any of this real Oil India data? Yes or no.
43. So you wrote the test, wrote the answers, and then graded yourself?
44. If you wrote the schedule and you wrote the reports, what exactly did your accuracy
    measure?
45. Where did the vocabulary in your synthetic reports come from? Your imagination?
46. On a real project the reports are in Assamese-inflected English, half in shorthand,
    with a contractor's own tag scheme. What does your accuracy become then?
47. What would your numbers do if I handed you a real Oil India export right now, in
    this room?
48. You said your benchmark is "in-distribution". Explain what that means to the two
    judges here who do not know, and then tell us why we should care about the number
    at all.
49. If your evaluation cannot establish real-world accuracy, why is it on your slide?
50. Would you sign your name under these numbers in front of an Oil India project
    controls head?

---

## Block E — the metric interrogation

*The two technical judges start here. Every one of these has a real answer on
`../NUMBERS_SHEET.md`. Any answer given from memory instead of from the sheet is how a
wrong number reaches a judge.*

51. 43.5% coverage. So it fails more than half the time.
52. You are proud of a system that gives up on 87 out of 154 inputs?
53. 100% precision on 67 samples is not a result, it is a small number. Do you know what
    a confidence interval is? Give me one.
54. What is the actual count of wrong records this would write into a live schedule?
    Not the percentage. The count.
55. Your deck says 86.9% top-1 and 71.4% on a second set. Which is the real number, and
    why did you show me the bigger one?
56. What does your system do when it is 79% confident? Walk me through the arithmetic.
57. Where did 0.80 come from? Prove it was not tuned until the demo looked good.
58. Did you tune those thresholds on the same data you are reporting on?
59. How many of your review-queue rows have a wrong top suggestion? You know the number.
    Say it.
60. Your worst metric — name it yourself, right now, before I find it.
61. Recall@20 is 100%. That means retrieval is solved and ranking is not. So why are you
    showing me retrieval on the slide?
62. 1,431 tests. How many of them assert anything that would fail if the matcher were
    wrong?
63. Run it. Right now. On this laptop. I want to see the number appear, not a
    screenshot.

---

## Block F — technical, from the one judge who reads code

64. Six explainable features. Name all six, with their weights.
65. Which single feature carries the decision? What happens to your precision if a
    report misspells that field?
66. The PS asks for an LLM-based conversational agent. Yours is off by default. Did you
    answer the problem statement or dodge it?
67. So what is the AI in this? Regex and BM25 are from the 1990s.
68. Why MiniLM? Did you try anything else, and did you measure it or just assume?
69. What does your system do with two reports that contradict each other about the same
    activity on the same day?
70. Granularity mismatch is explicitly in the PS — the field reports one spool, the plan
    has one line. Show me the code path that handles that, not the slide.
71. Same physical work, three disciplines, three vocabularies. Which one wins, and why is
    that not arbitrary?
72. The PS asks for institutional memory. How many completed activities are behind your
    duration suggestions, and would you plan a real project on that sample?
73. Does it learn from planner corrections? Careful.
74. Where is the authentication? Anyone can write to the project schedule?
75. Your audit trail is append-only. Show me the code that prevents an UPDATE, not the
    comment that says it is append-only.
76. What is your P95 latency on one report, and on a thousand?
77. Two supervisors submit at the same second. What does SQLite do?
78. What happens when the mic does not work, the model file is missing, and the port is
    already in use — all at once?
79. You export XER. Will Primavera open that file? Be precise.
80. Show me the last commit. Explain what it did and why it was needed the night before
    the finale.

---

## Block G — irrelevant, off-topic, and pure time-waste

*These are not mistakes by the judge. They are a test of whether you can be knocked off
your line and whether you will contradict a person with power. Answer briefly, do not
correct their framing unless it is a factual error about your project, and steer back
in one move.*

81. Why is it called NAVIS? Is that a real word?
82. Your slide has a spelling mistake. Does that bother you?
83. Which college are you from? And which branch?
84. Why did none of you sit for placements instead of doing this?
85. What do you think about the government's stance on AI regulation?
86. Do you think AI will take the jobs of the planners you are talking about?
87. Is this project sustainable? What is its carbon footprint?
88. How does this help farmers?
89. What is your team name supposed to mean?
90. Why should I believe any student prototype ever reaches production? Name three from
    past SIH editions that did.
91. Do you have a patent? Why not?
92. Can this run on a mobile phone? Why did you not build an app?

---

## Block H — stress, silence, and patience tests

*Behavioural, not informational. Run these unannounced during the drill.*

93. *(Judge interrupts eight seconds into your answer)* — Stop. That is not what I
    asked. Answer the question I asked.
94. *(You finish. Complete silence for eight seconds. The judge stares at the screen.)*
    — Now what do you do?
95. *(Judge, flatly)* And? … Keep going.
96. *(Two judges start a side conversation while you present.)* — Continue as if nothing
    is happening. For how long?
97. *(Judge repeats a question you have already answered, word for word.)*
98. That contradicts what your teammate just said. Which of you is wrong?
99. I already asked that. Are you listening to me?
100. You have thirty seconds left. Best thing about this project — go.
101. *(After the demo crashes or a screen hangs)* — Is this the thing you have been
     working on for a month?
102. If I gave you one more week, what would you fix — and why did you not fix it in the
     last week?
103. Give me one reason to pass you to the next round that I have not already heard from
     the last four teams.

---

## The five things that lose the round if they leave your mouth

From `../NUMBERS_SHEET.md` §4. Any of these is a bigger loss than any question above.

| Never say | Because |
|:---|:---|
| "Offline-first PWA" | No service worker exists. Say: *runs entirely on-premise — no cloud, no API key, nothing leaves your network.* |
| "Zero external calls, fully offline" | Browser speech uses `webkitSpeechRecognition`, which needs the network. Everything else runs with the cable pulled. |
| "We have 200+ real schedule activities" | The demo baseline is 120 activities and it is synthetic. |
| "Bi-directional MS Project support" | No `.mpp` support. Primavera P6 PMXML and XER only. |
| "It learns from planner corrections" | Corrections are stored, and the shipped matcher does not read them back. You measured why. Say that instead. |

Plus three of your own making: **never quote a figure from memory**, never say "our
ablation proved zero gain" (n = 1), and never say "to prevent runaway bias" — nothing
measured any bias.

---

## The four questions you must be able to answer cold, in your sleep

If you drill nothing else, drill these — they are the ones a panel actually reaches.

- **Q51 / Q1** — why coverage is under half, said as a strength, in twenty seconds.
- **Q42 / Q50** — the synthetic-data answer, volunteered before it is asked.
- **Q73** — does it learn? (The honest answer is stronger than the flattering one.)
- **Q60** — name your own worst metric before a judge does.

The full answers are in `../NUMBERS_SHEET.md` §3. Read them aloud until they are boring.

---

*One last thing. A panel that attacks you for fifteen minutes is a panel that is
engaged. The teams that get three polite questions and a thank-you are the ones already
out.*
