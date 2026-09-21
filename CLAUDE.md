# CLAUDE.md — dignity

Guidance for AI assistants working in this repository.

---

## Repository status

**The deterministic core exists and is tested.** `src/lib/` holds the
character table, the Hebrew date logic and the inscription composer, with 53
passing tests. There is no application around it yet — no Next.js app, no
database, no UI.

```
npm test          # vitest, 53 tests
npm run typecheck # tsc --noEmit, strict
```

Everything in `docs/decisions/` beyond ADR 0002 describes work not yet built.
Treat the ADRs as intent; treat `src/` as fact, and update this file when
that changes.

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

### How an order works today

```
cemetery staff  ──gives blank form──▶  family member
family member   ──hand-encodes Hebrew as numbers──▶  staff
staff           ──sends──▶  Eagle Granite (Elberton, GA)
Eagle Granite   ──returns proof drawing──▶  family member
family member   ──checks and signs──▶  stone is cut
```

**The person hand-encoding Hebrew into numbers is a grieving family member**,
not a professional, possibly not a Hebrew reader, days after a death. That is
the problem.

There are **two** moments where this tool helps:

1. **Filling the form** — compose the Hebrew, emit the number sequence.
2. **Checking the returned proof** — confirm what came back is what was
   ordered. Currently also done by someone who may not read Hebrew, and it is
   the last line of defense before granite is cut.

(2) is arguably as valuable as (1) and is a smaller build. Which comes first
is still open — see `docs/open-questions.md` § B.

Intended shape of v1:

1. A simple form: the deceased's details — names, dates, relationships.
2. The service composes the Hebrew inscription, including the Hebrew date.
3. A live preview of the finished stone, updating as the user types.
4. A chat assistant alongside it, for questions and adjustments.
5. On approval, output **a completed copy of Eagle Granite's own order form**
   — visually identical to the blank they issue, number boxes filled — plus a
   visual proof of the finished stone.

**The filled vendor form is the deliverable** (ADR 0001). Not a number list
for someone to copy by hand: hand transcription is the error source we exist
to remove. The form holds **5 rows × 28 boxes = 140 characters**.

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
- **The number-per-letter code is a glyph index, not gematria** — confirmed:
  code 1 is תּ, not א. The full 1–31 table is decoded in
  `docs/domain/eagle-granite-form.md`. Never infer a letter/value relation.
- **The form has no nikud and no Yiddish diacritics.** Some names genuinely
  cannot be expressed on it. Say so plainly; never substitute silently.
  There is no space code either — **a space is simply an empty box.**
- **Never redraw the vendor's form** (ADR 0004). Overlay numbers onto their
  blank. Detect the box grid from the image and fail loudly unless exactly
  5 rows of 28 are found — a mis-detected grid puts every number in the
  wrong box, silently.
- **`פ״נ` ("here lies buried") and `נ״פ` ("died") are the same two characters
  reversed, and both appear on one stone.** A transposition therefore
  produces *valid* Hebrew and is catchable only by position. Validate
  structurally, and always render the numbers back into Hebrew for the user.
- **Canonical Unicode Hebrew is the source of truth**; the numeric code is a
  render target produced by a pure, table-driven, round-trip-tested function.
- **Gender is one field per record**, and every derived string reads from it.
- **The user does not read Hebrew** (ADR 0005). Never show Hebrew alone —
  always with how it sounds and what it means.
- **The core function is English → Hebrew translation, not template-filling.**
  The family says what they want; the app produces the Hebrew. The standard
  four lines are a starting point, not the output shape — the form holds 140
  characters and the spare room is for the family's own words.

---

## What is built

| Module | Does |
|---|---|
| `src/lib/hebrew-text.ts` | NFC canonicalisation; strips niqqud, keeps the dagesh |
| `src/lib/form-table.ts` | The 1–31 table, `encodeLine`/`decodeLine`, right-to-left layout |
| `src/lib/hebrew-date.ts` | `@hebcal/core` wrapper; the sunset rule and unknown-time ambiguity |
| `src/lib/inscription.ts` | Composes the standard lines; capacity and blockers |

Design notes that are easy to undo by accident:

- `encodeLine` returns a **discriminated union**, never throws and never
  drops a character. Unrepresentable input comes back as a list so the family
  can be told everything that failed at once.
- `hebrewDateOfDeath(..., "unknown")` returns **both** candidate dates and
  resolves nothing. Code that treats `ambiguous` as "use `ifDaytime`" has
  reintroduced the bug the type exists to prevent.
- **`stripNikud` is applied to hebcal output only.** hebcal renders months
  pointed (`שְׁבָט`) and the form has no code for those marks. Text a *person*
  supplied keeps its marks and is refused by the encoder instead — so a
  family is told their spelling cannot be engraved rather than having it
  silently altered.
- `layOutRightToLeft` is the only place that knows about fill direction. The
  encoder has no opinion about it and so cannot silently reverse anything.

## What to do next

The order form and a real proof have been read. The character table, fill
direction, layout and house style are transcribed in
`docs/domain/eagle-granite-form.md`. **The encoder is now unblocked.**

**All inscription style questions are resolved.** `פ״נ` ("here lies buried"),
`נ״פ` ("died") and both closing-formula variants are confirmed, and the
English back-translation template is complete — see
`docs/domain/eagle-granite-form.md` §4.1. Nothing about the Hebrew output is
guessed any more.

The mechanical questions are answered too: a space is an empty box, and the
form holds 5 rows × 28 boxes. **Rendering is settled by ADR 0004** — the
vendor's blank is the template and the generator draws nothing but the
numbers on top of it. A redraw was prototyped and rejected: it was
recognisably not their form.

What remains is a clean blank original from Eagle Granite. Not blocking —
the prototype cleans up a scan automatically — but output quality is capped
by the blank's quality, so it is the highest-value artifact still missing.

`docs/open-questions.md` is the live list of what we don't know. **Read it
before proposing implementation work**, and keep it current.

### Sample material is not in this repository

Real forms and proofs carry a named family's personal details. `.gitignore`
excludes everything under `samples/`. What was read from them has been
transcribed, personal details removed, into the domain docs. Do not commit
the images, and do not put real names or dates into committed files.

---

## Conventions

### Repository layout (as it stands)

```
CLAUDE.md               this file
package.json            npm test · npm run typecheck
src/lib/                the tested core — see "What is built"
src/lib/__tests__/      53 tests
docs/domain/
  hebrew-inscriptions.md  Hebrew, calendar, gematria, naming
  eagle-granite-form.md   the vendor form: code table, layout, house style
docs/data-model.md      Postgres schema sketch and its invariants
docs/decisions/         architecture decision records
  0001-output-is-the-vendors-own-form.md
  0002-stack-and-platform.md
  0003-access-and-retention.md
  0004-render-by-overlaying-the-vendor-blank.md
  0005-english-first-chat-led-interface.md
docs/open-questions.md  what we don't know yet
samples/                LOCAL ONLY — gitignored, never committed
```

The application layer — Next.js routes, persistence, the form renderer — is
not built yet. `src/lib/` has no framework dependencies and should keep none.

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
- Example and test dates are **synthetic**. `13 Jan 2024` and `25 Jan 2024`
  are the house examples — the second exercises the ט״ו/ט״ז trap and the
  sunset shift at once. Never reach for a real order to make a point.

### Stack (ADR 0002)

TypeScript end to end — Next.js, `@hebcal/core`, PostgreSQL on RDS, S3,
SES, App Runner. Postgres is chosen for constraint enforcement, not
scale: invariants belong in the schema (see `docs/data-model.md`).

**No user accounts** (ADR 0003). Families reach their order by emailed magic
link; records expire and are purged. Do not add a staff console, a login, or
a profile without a new ADR — that reverses a deliberate privacy decision.

### Git

- Development branch for this work: `claude/claude-md-docs-vecjqm`
- No commit-message convention chosen yet.
- `npm test` and `npm run typecheck` must both pass before a commit.

---

## Working agreements for assistants

- **Do not invent domain facts.** If a Hebrew, calendar, or halachic detail
  is uncertain, say so and flag it for rabbinic review. Confident wrong
  answers are the primary risk in this project.
- **Use the confirmed table in `eagle-granite-form.md` verbatim.** Do not
  extend it by inference — if a character is not in it, the form cannot
  express it, and that is a fact to surface, not a gap to fill.
- **Never commit real personal data — in docs, code, tests, or fixtures.**
  No real decedent names, no real dates of death, no family contact details,
  no sample forms or proofs. Use synthetic dates and invented names in every
  example and test. This is not a style preference: the repository is the one
  artifact that outlives any individual order.
- Prefer a hard error or a blocking flag over a plausible default, anywhere
  an ambiguity affects what gets engraved.
- When you add real code, update this file to describe what is actually
  there, and remove the planning-stage framing at the top.
