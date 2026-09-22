# 0008. An unknown hour follows the date as given

Date: 2026-09-22
Status: Accepted — supersedes ADR 0007

## Context

ADR 0007 had the family choose between the two possible Hebrew dates when the
hour of death could not be found, and blocked the order until they did.

Tried on a phone, that is still a wall. A family who does not know the hour
does not know which date to pick either, and the app cannot tell them —
nobody has answered the question in `open-questions.md` § A4. So the screen
asked a grieving person to decide something it had just told them was
undecidable, and then waited.

The owner's instruction, after using it: if the hour is unknown, use the date
as given.

## Decision

**When the hour cannot be found, the Hebrew date follows the civil date as
given — no sunset adjustment — and the order carries on.**

Nothing about it is silent:

- The conversation says which date is being used, what the other one would
  be, and that it is the date kept every year, with one button to swap.
- The inscription's own gloss reads *"the hour of death is unknown and this
  is the date as given, with no sunset adjustment; after sunset it would be
  6 Kislev 5706"* — so it can never be read later as a date somebody knew.
- A family that does decide gets marked as having decided: *"this date was
  chosen by the family"*. The default and a decision are distinguishable in
  the record.

`DateOfDeath.chosen` therefore carries `by: "family" | "as-given"`.
`hebrewDateOfDeath` is unchanged and still returns `ambiguous` with both
candidates — the library still refuses to pick. The default is applied in
`derive`, in one place, where the inscription that says so is built.

## What this trades away

**The yahrzeit can be one day out.** If the death was in fact after sunset,
the engraved date is the day before the true one, and a family may keep the
wrong anniversary for generations. That is a real cost and it is why ADR 0007
existed.

It is accepted because the alternative was measured and is worse: an order
that can never be completed, for the deaths most likely to need a stone
ordered this way. The paper process has always resolved this by writing down
the civil date; this does the same thing and, unlike the paper, says on the
record that it did.

## What this still rules out

- **Silence.** A date settled by default must always render with the gloss
  that says so. A `chosen` date that reads like a `resolved` one is a bug.
- **The model choosing.** It cannot set the field. Only the family's button
  can, and only to mark a decision they actually made.
- **Guessing the hour.** Nothing anywhere infers "probably daytime". The hour
  stays unknown; only the date is settled.

## Still open

`open-questions.md` § A4 — whether there is an accepted practice for which
date to use when the hour is lost. If there is, and it is not this one, this
ADR is the thing to revisit.
