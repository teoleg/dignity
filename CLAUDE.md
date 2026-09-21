# CLAUDE.md — dignity

Guidance for AI assistants working in this repository.

---

## Repository status: PLANNING. There is no code yet.

As of the last update to this file, this repository contains documentation
only — no source, no build, no tests, no chosen language.

**If you are an assistant reading this and the repository now contains code,
this file is out of date. Re-derive it from the actual tree and rewrite it.**
Everything below the "What we're building" section is intent, not fact.

---

## What we're building

A tool that helps the Philadelphia Jewish community order monuments
(matzevot) with **correct Hebrew inscriptions**.

The problem it solves: the largest local Jewish cemetery takes monument
orders on a form where the Hebrew portion must be hand-encoded as numbers —
one number per letter, across a mixed Hebrew and Yiddish character set. That
process is slow, opaque to anyone who does not read Hebrew, and produces
mistakes. Hebrew date conversion, gender agreement, and inscription style are
all places where errors get through.

Intended shape of v1:

1. A simple form: the deceased's details — names, dates, relationships.
2. The service composes the Hebrew inscription, including the Hebrew date.
3. A live preview of the finished stone, updating as the user types.
4. A chat assistant alongside it, for questions and adjustments.
5. On approval, output a printable form with the numeric encoding the
   cemetery requires, plus a visual proof of the final product.

### The thing that makes this project different

**The output is carved into granite.** There is no patch release for a stone.
A wrong letter means a family pays to recut it, or lives with an error over a
grave.

This makes the project's priority ordering unusual, and it should hold in
every design decision:

> **Correctness > verifiability > convenience > speed of development.**

A feature that is convenient but makes an error harder to catch is a bad
trade here. Prefer blocking on an ambiguity over resolving it cleverly.

---

## Domain knowledge — read before touching inscription logic

`docs/domain/hebrew-inscriptions.md` is required reading before writing or
reviewing any code that touches Hebrew text, dates, or the numeric encoding.
It covers inscription structure, gender agreement, the sunset rule, Adar and
leap years, gematria's ט״ו/ט״ז special cases, Yiddish orthography and Unicode
normalization, and the encoding architecture.

The short version of the hard parts:

- **The Hebrew day starts at sunset.** Date of death is not enough; we need
  time and place. When time is unknown, the Hebrew date is genuinely
  ambiguous — flag it, never guess.
- **Never hand-roll the Hebrew calendar.** Use `@hebcal/core` (JS/TS) or
  `pyluach` (Python).
- **Gematria 15 and 16 are ט״ו and ט״ז**, not י״ה and י״ו, which spell a name
  of God. Place-value conversion gets this wrong.
- **The cemetery's number-per-letter code is a glyph index, not gematria.**
  It must be transcribed from their sheet. Never infer it.
- **Canonical Unicode Hebrew is the source of truth**; the numeric code is a
  render target produced by a pure, table-driven, round-trip-tested function.
- **Gender is one field per record**, and every derived string reads from it.

---

## Current state and what to do next

Work is blocked on samples the user is providing: the cemetery's order sheet
and an example of a finished monument. They belong in `samples/`.

`docs/open-questions.md` is the live list of what we don't know. It is
organized so the blocking items — the ones the samples answer — are first.
**Read it before proposing implementation work**, and keep it current: when a
question gets answered, move the answer into the right doc and delete the
entry.

Do not write encoder code against a guessed character table. A guessed table
produces wrong stones, which is the exact failure this project exists to
prevent.

---

## Conventions

### Repository layout (as it stands)

```
CLAUDE.md               this file
docs/domain/            domain knowledge — Hebrew, calendar, encoding
docs/decisions/         architecture decision records (empty; see below)
docs/open-questions.md  what we don't know yet
samples/                cemetery order sheet + finished-product examples
```

No source layout yet — it follows from decisions not yet made.

### Recording decisions

Technical decisions go in `docs/decisions/` as short ADRs, numbered and
dated: context, the decision, and what it rules out. This project will
accumulate a lot of "why is it done this odd way" — usually because of a
halachic or typographic constraint — and that reasoning is worth more than
the code it explains.

### Writing style in this repo

State what is verified and what is assumed, and keep them visually distinct.
This file and the domain notes both mark unverified claims explicitly. Keep
doing that. In a domain where a confident-sounding wrong answer gets carved
into stone, unmarked guesses are the main hazard.

### Hebrew text in source and docs

- Store and compare Hebrew in one canonical Unicode normalization form,
  applied at input boundaries.
- Test data must include both precomposed and combining-mark spellings of the
  same Yiddish glyphs — they look identical and encode differently.
- Never reverse Hebrew strings to "fix" display direction. Fix the rendering.

### Git

- Development branch for this work: `claude/claude-md-docs-vecjqm`
- No commit-message convention chosen yet.

---

## Working agreements for assistants

- **Do not invent domain facts.** If a Hebrew, calendar, or halachic detail
  is uncertain, say so and flag it for rabbinic review. Confident wrong
  answers are the primary risk in this project.
- **Do not fill in the character encoding table from inference.** It comes
  from the cemetery's sheet or it does not exist.
- Prefer a hard error or a blocking flag over a plausible default, anywhere
  an ambiguity affects what gets engraved.
- When you add real code, update this file to describe what is actually
  there, and remove the planning-stage framing at the top.
