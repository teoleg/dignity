# 0004. Render by overlaying the vendor's blank, not by redrawing it

Date: 2026-09-21
Status: Accepted

Supersedes the open implementation question left by ADR 0001.

## Context

ADR 0001 requires the output to be a completed copy of Eagle Granite's own
form, visually identical to the blank they issue. Two ways to produce it:

- **(a) Redraw** the form in vector from measurements, then fill the boxes.
- **(b) Overlay** — use the vendor's own blank as the page, draw only the
  numbers on top.

Both were prototyped. (a) was built first and rejected on sight: no logo,
wrong proportions, labels colliding with the grid. It was recognisably *not*
the form, which defeats the entire point of ADR 0001.

## Decision

**Use the vendor's blank as the template. Draw nothing but the numbers.**

The generator: loads the blank, detects the five rows of 28 boxes from the
image, computes each box centre, and draws one number per filled box,
right to left. Everything else on the page is the vendor's own artwork,
untouched.

## Why

Fidelity is not a nice-to-have here, it is the requirement. Cemetery staff
and the vendor recognise the form at a glance; anything that reads as a
lookalike invites a second look, a question, or a rejection. A redraw can
only ever approach the original, and every element we approximate — logo,
typeface, rule weights, spacing — is a way to fall short. Overlaying starts
at perfect and cannot drift.

It is also far less code, and it survives a form revision by swapping one
image instead of re-deriving a layout.

## What this rules out

- Generating the form's static content — logo, headings, the character
  reference strip, footer fields — in code.
- Restyling or "improving" the vendor's layout in any way.

## Consequences

- **The blank is an asset the project depends on**, versioned alongside the
  code and keyed to `order.form_revision`.
- **Quality of the blank sets quality of the output.** The current prototype
  works from a scan of a *used* form. The pipeline removes faint pencil
  marks and scan haze and trims the scanner's edge bar, and deskews when
  needed — but the right fix is a clean blank from Eagle Granite, ideally a
  PDF. Then the overlay is drawn on vector artwork and prints perfectly at
  any size. Tracked in `docs/open-questions.md` § A2.
- Box positions are **detected from the blank**, not hard-coded, so a
  replacement blank does not require re-measuring by hand. The detector must
  assert it found exactly 5 rows of 28 and fail loudly otherwise — a
  mis-detected grid would silently put every number in the wrong box.
- Output is US Letter landscape, scaled to fit with a small margin.

## Verification sheet

The generator emits a second page: the Hebrew at large size, the English
back-translation line by line, the box numbers, the sunset caveat, and a
sign-off line. This is for the family, not the vendor, and is separable —
page 1 alone is a valid order form.
