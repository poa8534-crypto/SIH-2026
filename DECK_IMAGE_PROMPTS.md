# NAVIS — image prompts for GPT Image 2.0

For the deck built by `ppt_build/build_navis_sih_deck.mjs` (D-100).
Generated 2026-09-10.

---

## Read this first

**Do not generate the flow charts.** Slides 2, 3 and 4 carry real flow charts exported
from Eraser. An image model renders box labels as approximate letter shapes — at
projector size a judge reads "Recipmcal rank fuson" and stops trusting the slide. The
three Eraser diagrams are already in the deck and stay there.

Everything below is art with **no text inside it**, which is the only thing an image
model is reliably better at than a diagram tool. All of it is optional — the deck is
complete without any of it. Order of value: **1 → 2 → 3**.

Output settings for every prompt: **PNG, transparent background where stated,
square 1:1 unless a size is given.**

---

## 1 · Six role icons — slide 5, and the technology column on slide 3

The highest-value addition. Six flat icons in one consistent set, one per beneficiary
and per technology group. Generate as **one sheet**, then cut them up.

```
A single flat 2D icon sheet on a pure white background, arranged as a 3 x 2 grid with
generous even spacing between cells. Six icons, all in one consistent style:

1. a hard hat with a small speech bubble beside it
2. a clipboard with a checkmark and a magnifying glass over it
3. a Gantt chart - three horizontal bars of different lengths on a grid
4. a shield containing a document with a line of text and a small tick
5. a database cylinder with a clock in front of it
6. a laptop with a padlock on its screen

Style: flat vector, single weight 3px strokes, no fills except one flat accent colour,
no gradients, no shadows, no 3D, no perspective, no text or letters or numbers
anywhere in the image, no drop shadows, no background shapes or circles behind the
icons. Two colours only: dark navy #123F78 for the strokes and a muted blue #0B67B2
accent. Each icon must read clearly at 40 x 40 pixels and in greyscale. Icons must be
optically the same visual weight and sit on the same baseline.
```

**Where they go:** one icon in each beneficiary card on slide 5, and optionally at the
top of the technology column on slide 3. If you place them, place all six — a single
icon on one card looks like a mistake.

---

## 2 · Slide 1 cover accent (only if you want the cover less bare)

The template already carries the SIH brain-and-hexagon art on the right. This is a
**small** mark for the empty lower-right area, not a second hero image.

```
A minimal flat 2D emblem on a fully transparent background. A single continuous line
starts at the lower left as a loose, irregular, hand-drawn-looking squiggle and
gradually straightens as it travels right, ending as a clean straight horizontal bar
with three evenly spaced tick marks on it. Nothing else in the frame.

Style: flat vector, one stroke weight of 4px, no fill, no gradient, no shadow, no 3D,
no text, no letters, no numbers, no icons, no arrowheads, no background. Colour: the
squiggle end is warm orange #F58220 and it transitions along the line to dark navy
#123F78 at the straight end. Wide landscape, 3:1. Must read at 250 pixels wide.
```

**Why this image:** messy field reporting on the left becoming a structured schedule on
the right — the entire pitch as one line, with no words to misspell.

---

## 3 · Slide 4 "runs on one laptop" mark (lowest priority)

Only if the on-premise band on slide 4 looks like it needs an anchor. It usually does
not.

```
A flat 2D line illustration on a pure white background. An open laptop seen from a
slight three-quarter angle, with a simple closed padlock resting in front of its base.
Around the laptop, a single dashed rectangular boundary line encloses both objects with
even margin on all sides. Nothing crosses the dashed boundary. The frame is otherwise
empty.

Style: flat vector, uniform 3px strokes, no fills, no gradients, no shadows, no 3D
rendering, no cloud symbols, no wifi symbols, no server racks, no people, no text, no
letters, no numbers. Two colours: dark navy #123F78 strokes and a green #1B7F4B dashed
boundary. Square. Must read at 120 x 120 pixels and in greyscale.
```

---

## Rules for anything you generate later

- **No text inside a generated image**, ever. If a label is needed, it goes in a
  PowerPoint text box on top, where it stays sharp and is spelled correctly.
- **No people, no faces, no logos, no branded hardware.** Faces date the deck and
  invented logos read as filler.
- Stay inside the deck's palette: navy `#123F78`, blue `#0B67B2`, green `#1B7F4B`,
  orange `#F58220`, red `#B42318`.
- Every generated image must survive being printed in greyscale — the reviewers may
  not see it in colour.
- Nothing generated may imply a capability NAVIS does not have. No satellite dishes, no
  robot arms, no phones showing an offline sync badge (there is no offline queue — see
  `NUMBERS_SHEET.md` §4).

---

## Where each asset would be dropped in

| Asset | Slide | Approximate box |
|:--|:--|:--|
| Six role icons | 5 | 28 × 28 px, top-left inside each beneficiary card |
| Six role icons (reuse) | 3 | 20 × 20 px, replacing the bullet dots in the technology column |
| Cover accent | 1 | lower-right of the cover, roughly 250 × 83 px |
| Laptop mark | 4 | right edge of the on-premise band, roughly 110 × 110 px |

After placing any of them, re-run:

```bash
node ppt_build/render_final.mjs
```

and look at all six PNGs before exporting the PDF.
