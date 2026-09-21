# 0001. The deliverable is the vendor's own form, filled in

Date: 2026-09-21
Status: Accepted

## Context

Eagle Granite accepts monument orders on a specific printed form ("HEBREW
CHARACTERS"), on which the Hebrew inscription is entered as one number per
character. That form travels: family → cemetery staff → Eagle Granite.

We could invent our own output format and ask the parties to accept it.

## Decision

**The app produces a completed copy of Eagle Granite's existing form, visually
identical to the blank one they issue, with the number boxes filled in.**

Not a spreadsheet. Not a list of numbers to transcribe by hand. Not our own
redesigned order sheet. The same form, filled.

## Why

- **No one else has to change anything.** Cemetery staff and Eagle Granite
  receive exactly the document they already process. No agreement to
  negotiate, no new workflow to train, no adoption barrier. This is the
  single largest factor in whether the tool ever gets used.
- **Hand transcription is the error source we exist to remove.** Producing a
  number sequence for someone to copy into boxes reintroduces the exact
  failure mode — a transposed or shifted digit — that motivated the project.
  The numbers must land in the boxes mechanically.
- **It is checkable.** A filled form that looks like the familiar form can be
  eyeballed against the preview by someone who does not read Hebrew.

## What this rules out

- Any output that requires manual re-entry of the numbers.
- Redesigning the form "better". Fidelity beats improvement here.
- Treating the number sequence as the primary artifact; it is an intermediate
  value, and the filled form is the deliverable.

## Consequences

- We need the form's exact geometry, and ideally a **clean blank original**
  (PDF or a flat high-DPI scan) rather than the working scan we measured
  from. See `docs/open-questions.md` § A2.
- Print fidelity matters: the output must print at true size on US Letter and
  line up with the printed form the staff know. Box positions, not just box
  counts.
- If Eagle Granite ever revises the form, our template must be versioned
  against it. Record the form revision in the generated output.
