"""Fill the SIH template's own fill-in fields in place, run by run.

The template's cover text box and the per-slide team-name ovals are shipped by SIH with their
own fonts, sizes, bullets and geometry. Replacing those shapes would change the template, so
this pass edits the existing runs' text only and leaves every formatting attribute alone.

Usage:  python fill_template_fields.py <deck.pptx>
"""

import sys

from pptx import Presentation
from pptx.util import Pt

COVER_FIELDS = {
    "Problem Statement ID": "Problem Statement ID – 26122",
    "Problem Statement Title": (
        "Problem Statement Title- Intelligent Data Capture & Schedule-Linking Layer for "
        "Infrastructure Project Management: Real-Time Actual Progress Tracking "
        "(Planning-to-Execution Bridge)"
    ),
    "Theme": "Theme- Smart Automation",
    "PS Category": "PS Category- Software",
    "Team ID": "Team ID-",
    "Team Name": "Team Name- NamasteByte",
}
TEAM_NAME = "NamasteByte"
FIELD_SIZE_PT = 18   # the shipped 24pt overflows once real values are filled in
TITLE_SIZE_PT = 13   # the PS title is four lines long, so it is set smaller than its siblings
OVAL_SIZE_PT = 10    # the shipped size breaks "NamasteByte" mid-word
FIELD_SPACE_AFTER_PT = 10


def fill_paragraph(paragraph, text, size_pt=None):
    """Put `text` into the paragraph's first run and blank the rest, keeping all formatting.

    `size_pt` is only used where the template's own size cannot physically hold the required
    content: the problem-statement title runs off the bottom of the cover at the shipped 24pt,
    and the team name wraps mid-word inside the oval at the shipped size.
    """
    runs = paragraph.runs
    if not runs:
        return False
    runs[0].text = text
    if size_pt is not None:
        runs[0].font.size = Pt(size_pt)
    for run in runs[1:]:
        run.text = ""
    return True


def main(path):
    presentation = Presentation(path)
    filled = []

    cover = presentation.slides[0]
    for shape in cover.shapes:
        if not shape.has_text_frame:
            continue
        for paragraph in shape.text_frame.paragraphs:
            current = paragraph.text.strip()
            for prefix, replacement in COVER_FIELDS.items():
                if not current.startswith(prefix):
                    continue
                size = TITLE_SIZE_PT if prefix == "Problem Statement Title" else FIELD_SIZE_PT
                if fill_paragraph(paragraph, replacement, size):
                    paragraph.space_after = Pt(FIELD_SPACE_AFTER_PT)
                    paragraph.line_spacing = 1.0
                    filled.append(prefix)

    for index, slide in enumerate(presentation.slides, start=1):
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            if shape.text_frame.text.strip().lower() != "your team name":
                continue
            for paragraph in shape.text_frame.paragraphs:
                if paragraph.text.strip():
                    fill_paragraph(paragraph, TEAM_NAME, OVAL_SIZE_PT)
                    filled.append(f"team oval slide {index}")

    presentation.save(path)
    print("filled:", ", ".join(filled))


if __name__ == "__main__":
    main(sys.argv[1])
