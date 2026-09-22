# CLAUDE.md — dignity

Guidance for AI assistants working in this repository.

---

## Repository status

**The deterministic core exists and is tested.** `src/lib/` holds the
character table, the Hebrew date logic, the inscription composer, the form
renderer, the translation vetting and the model-driven dialogue, with 128
passing tests.

**Running the dialogue needs `ANTHROPIC_API_KEY`.** Everything else runs
offline; the conversation and translation layers are typechecked and
unit-tested against stubs but have never made a live call. It goes end to end: names and a
Gregorian date in, a filled PDF of the vendor's own form out. There is no
application around it yet — no Next.js app, no database, no UI.

```
npm test          # vitest, 128 tests
npm run typecheck # tsc --noEmit, strict
npx tsx scripts/render-sample.ts <blank-image> out.pdf
npm run build:web  # bundle src/browser for an artifact page
```

**Two ways to ship the same page**, differing only in how they reach the
model:

- **Hosted** (`entry-web.ts` + `api/chat.ts`) — a public URL, no accounts,
  a shared passcode. The API key sits on the server and never reaches a
  browser. This is the one for testers who do not have Claude accounts. See
  `DEPLOY.md`.
- **Artifact** (`entry-artifact.ts`) — published to claude.ai, calling Claude
  through the viewer's own account, so no key and no hosting. Requires every
  viewer to be signed in to Claude.

`public/blank-form.jpg` is the vendor's blank order sheet and **is
committed**, so every deployment can fill a form without asking anyone for
anything. It carries no personal data — empty boxes, the character chart, and
Eagle Granite's and the cemetery's own pre-printed details. `public/app.js`
is build output and stays gitignored. If the deployment is ever missing the
blank, the page falls back to asking a viewer for a photo of theirs and keeps
it in their browser.

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
| `src/lib/form-grid.ts` | Detects the 5×28 box grid on a blank; refuses anything else |
| `src/lib/form-render.ts` | Draws the numbers onto the vendor's blank, out as PDF |
| `src/lib/translation.ts` | Vets model output; independent back-translation (ADR 0006) |
| `src/lib/translation-claude.ts` | Claude adapter — **not yet run against the live API** |
| `src/lib/conversation.ts` | Model-driven dialogue — logic only, **no SDK import**; strips Hebrew from replies |
| `src/lib/conversation-claude.ts` | Server driver: the Anthropic SDK |
| `src/browser/ask-claude.ts` | Browser driver: the artifact `sample` capability |
| `src/browser/render-browser.ts` | Canvas twin of `form-render.ts`; out as a picture |
| `src/browser/app.ts` | The page — UI only; the transport is injected |
| `src/browser/entry-artifact.ts` | Artifact build: model via `sample` |
| `src/browser/entry-web.ts` | Hosted build: model via `/api/chat` |
| `api/chat.ts` | The one server endpoint; the API key lives only here |

Design notes that are easy to undo by accident:

- `encodeLine` returns a **discriminated union**, never throws and never
  drops a character. Unrepresentable input comes back as a list so the family
  can be told everything that failed at once.
- `hebrewDateOfDeath(..., "unknown")` returns **both** candidate dates and
  resolves nothing. Code that treats `ambiguous` as "use `ifDaytime`" has
  reintroduced the bug the type exists to prevent.
- **`stripPointing` is for hebcal output only, and it takes the dagesh too.**
  hebcal renders months fully pointed (`כִּסְלֵו`, `תִּשְׁרֵי`) and there the dagesh
  is pointing, not spelling. Keeping it broke two ways at once: Kislev,
  Iyyar, Tamuz and Elul carried כּ יּ מּ וּ, which the form has no code for, so
  those months could not be filled at all; and Tishrei's תּ encoded as code 1
  where plain ת is code 29 — silently the wrong character. Every month of
  four years is now encoded in the tests. Text a *person* supplied goes
  through `stripNikud`, keeps its marks and is refused by the encoder instead
  — so a family is told their spelling cannot be engraved rather than having
  it silently altered.
- `layOutRightToLeft` is the only place that knows about fill direction. The
  encoder has no opinion about it and so cannot silently reverse anything.
- **`detectGrid` throws rather than returning a near-miss.** It asserts five
  rows of twenty-eight with an even pitch. A grid that is nearly right is the
  dangerous case — every number lands in the wrong box and nothing looks
  wrong — so "nearly" is rejected too.
- **`renderForm` takes the blank as an argument**, never reads it from a
  fixed path. The deployment ships one, but the library has no opinion about
  where it came from — in production it is stored per `order.form_revision`,
  so a revised form is a new asset rather than a code change.
- `prepareBlank`'s scan cleaning only touches pixels that are light *and*
  unsaturated, so it cannot erase a rule the detector needs.
- **Translation output is never repaired, only rejected** (ADR 0006). No
  stripping marks, no truncating to fit. A silently corrected inscription is
  the failure the project exists to prevent.
- **`backTranslate` must never see the original request.** A gloss from the
  pass that wrote the Hebrew restates the intent instead of checking it. The
  isolation *is* the verification.
- `possibleDrift` is a hint, not a verdict. Never present it as a correctness
  judgement.
- **No hardcoded phrase tables or question scripts.** Understanding what a
  family meant is the model's job. Translation and name spelling come from
  the model; a lookup table was tried and removed.
- **The model never computes the Hebrew date** and is told so explicitly. The
  library derives it from the Gregorian date and the time of death. Anything
  the model writes in Hebrew letters for a date would be wrong.
- `derive()` decides whether an inscription is finished, not the model —
  and `promptFor` tells the model what is still open, or it announces that a
  blocked order is complete and the family reads that as done.
- **Hebrew cannot reach the family through the prose.** `applyTurn` runs
  every reply through `withoutHebrew`, so no driver can carry it: an aside
  that held only Hebrew is dropped, Hebrew followed by its English gloss is
  dropped, and anything left becomes "the Hebrew". Instruction was not
  enough — the model wrote names, a family's line and a Hebrew date into the
  chat. Vetted Hebrew still reaches the family in the proposal cards, with
  how it sounds and what it means.
- **The model has no way to send anything** and is told so. It has claimed to
  be "passing this along to the engraver"; nothing is sent anywhere, and a
  family believing an order was placed is a serious failure.
- **Only what the Hebrew needs can block the form.** `derive` requires the
  Hebrew name, the father's, the gender and the date. The English names are
  the family's gloss and are never engraved, so a missing one falls back to
  how the Hebrew sounds. Blocking on one stalled an order with every question
  answered and nothing on screen saying why.
- **A blocker names the missing thing.** "The inscription is not complete
  yet" tells a family nothing they can act on.
- **`conversation.ts` must never import the SDK.** It is shared by the server
  and the browser bundle; a driver moves a turn across the wire and hands it
  to `applyTurn`. Both drivers build the prompt with `promptFor`, so the
  model is asked exactly the same thing either way.
- **`sample` has no system prompt and no schema enforcement.** The browser
  driver puts the instructions in a leading user turn and validates the reply
  against the same zod schema before anything reaches `applyTurn` — an
  unparseable turn is a failed turn, never a partially applied one.
- **`form-grid.ts` runs unchanged in the browser.** It takes greyscale bytes,
  which canvas produces. Only decoding and drawing differ between
  `form-render.ts` (sharp, PDF) and `render-browser.ts` (canvas, picture);
  the detection and placement are the same tested code.
- **On a phone the finished form is a picture, not a PDF.** A picture goes
  into the photo library, where a family can find it again, print it, and see
  every version they saved — a PDF on a phone goes somewhere less obvious.
  The page also leaves the picture on screen, because pressing and holding it
  is the one route to the photo library that works without any permission.
- **Nobody is asked for the blank order sheet.** The app ships with it. The
  picker is only a fallback for a deployment that lacks one, and it explains
  what it wants before it opens — "choose a file" with no explanation was not
  understood, and asking at all was the wrong question to put to a grieving
  family.

## Scope discipline — read this before proposing anything

**The only goal right now is: can a dialogue with one family produce correct
output?** Names and dates in, correct Hebrew and a correctly filled form out.
Nothing else is in scope.

Explicitly NOT now, however sensible they sound:

- accounts, logins, roles, staff consoles
- lists of other orders, handoff between workers, multi-tenancy
- sessions, persistence, magic links, retention jobs
- scaling, caching, queues, background work

A worker using this alongside a family operates the family's own session.
That is all. It needs nothing built for it.

ADRs 0002 and 0003 describe an eventual shape. **They are not a build list.**
Do not implement ahead of them.

Rules that follow:

- Prefer the smallest change that tests whether the output is correct.
- Do not write an ADR for a decision nobody is making yet. The ADR log is for
  choices already taken, not options surveyed.
- Do not ask the user to settle a question that does not block correct
  output. Pick the obvious default, say so in one line, move on.
- When a requirement could be read two ways and both produce correct output,
  take the simpler one.

Correctness of the inscription is still the thing that cannot be traded away
— see the priority ordering above. Simplicity applies to everything *around*
it, not to the Hebrew.

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
src/lib/__tests__/      128 tests
src/browser/            browser bundle for the artifact page
scripts/render-sample.ts  dev utility: fill a blank and write a PDF
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
  0006-translation-propose-vet-decide.md
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
