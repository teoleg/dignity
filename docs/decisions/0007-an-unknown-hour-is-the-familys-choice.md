# 0007. An unknown hour is the family's choice, not ours

Date: 2026-09-22
Status: Superseded by ADR 0008

> **Superseded by ADR 0008.** Blocking until the family chose was still a
> wall: a family who cannot find the hour cannot pick a date either. An
> unknown hour now follows the date as given, and says so. What survives from
> this ADR: the `chosen` state, the date not used being carried alongside,
> and the rule that a settled date never reads as a known one.

## Context

The Jewish day begins at sunset, so a death after sunset belongs to the
following Hebrew day. Without the hour, the Hebrew date is genuinely two
dates, one day apart — and it is the date the family keeps every year.

The system has always refused to pick one. `hebrewDateOfDeath(…, "unknown")`
returns both candidates and resolves nothing, and the order stays blocked.
That is right as far as it goes: a guess here is a wrong yahrzeit carved in
granite.

But it has no end. Tested against a 1945 death, the order could never be
completed: everyone who could have known the hour is gone. The tool answered
"the date cannot be finished until someone knows" to a family for whom nobody
will ever know. That is not caution — the stone still gets made, just without
us, by the process we exist to replace.

The paper form has always had this problem and has always resolved it the
same way: somebody decides.

## Decision

**The system still never picks a date. The family picks, and the system
records that they did.**

`DateOfDeath` gains a third state, `chosen`, reachable only through
`chooseWhenUnknown(date, which)` — which takes an ambiguous date and an
explicit choice, and has no default. It carries the date that was *not*
chosen alongside the one that was.

The page puts the two dates in front of the family in English, on buttons,
with what the choice means, and a third button — "I will ask someone first" —
that leaves the order open. It offers no recommendation and marks neither
date as usual, likely, or safe.

The inscription's English gloss then reads:

> Died 6 Kislev 5706 — the hour of death is unknown and this date was chosen
> by the family; the other possible date is 5 Kislev 5706

so the choice is visible everywhere the lines are read back, including the
check list the family approves before anything is sent.

## What this rules out

- **Any default.** No "assume daytime", no "the civil date is usually right".
  An unknown hour with no choice made still blocks, exactly as before.
- **The model choosing.** It is told the choice is the family's, never its
  own, and it cannot set the field — only a button press can.
- **A silent resolution.** A chosen date can never render as though the hour
  were known: the gloss says it was a choice, and names the date not taken.

## Still open

Whether there is an accepted practice — halachic or local to this community —
for which date to use when the hour cannot be found. We do not know, so we
say nothing and point the family at the rabbi or the funeral home. If there
is a practice, it belongs in `docs/domain/hebrew-inscriptions.md` and the
copy on that screen should say so. See `docs/open-questions.md` § A3.
