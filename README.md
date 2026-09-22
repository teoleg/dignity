# Dignity Project

A tool that helps families order a Jewish monument with the Hebrew inscription
correct — written for the Philadelphia Jewish community, and for one specific
piece of paper.

---

## The problem

The largest Jewish cemetery in the area takes monument orders on a paper form
where the Hebrew inscription has to be **hand-encoded as numbers**: one number
per letter, read off a printed chart of 31 glyphs, filled right to left into
five rows of twenty-eight boxes.

```
cemetery staff  ──gives blank form──▶  family member
family member   ──hand-encodes Hebrew as numbers──▶  staff
staff           ──sends──▶  the monument company
company         ──returns proof drawing──▶  family member
family member   ──checks and signs──▶  the stone is cut
```

The person doing that encoding is **a grieving family member**, days after a
death, frequently unable to read Hebrew at all. They are asked to get right,
by hand:

- the Hebrew date of death — which is not the civil date, and shifts to the
  next day if the death was after sunset;
- gender agreement, which runs through the whole inscription;
- the spelling of names that often have no standard Hebrew form;
- and then the transcription of all of it into numbers.

**The output is carved into granite.** There is no patch release for a stone.
A wrong letter means a family pays to recut it, or lives with an error over a
grave.

## What this does

A conversation in plain English — who died, when, their father's name,
anything the family wants to add in their own words — and out of it:

- the Hebrew inscription, composed line by line;
- the Hebrew date, computed from the civil date and the time of death;
- every line shown back with **how it sounds and what it means**, because the
  family cannot check the Hebrew itself;
- **a filled copy of the monument company's own order form**, as a picture
  that saves to a phone's photo library and prints from there.

The numbers are drawn onto a photograph of the company's actual blank. The
form that arrives is theirs, not a redrawing of it.

## The rule everything follows

> **Correctness > verifiability > convenience > speed of development.**

A feature that is convenient but makes an error harder to catch is a bad
trade here. In practice that means:

- **The model writes the language; code decides correctness.** Every piece of
  Hebrew the model proposes is encoded against the form's confirmed character
  table and measured against the line before it can be used, and rejected if
  it fails. Nothing is repaired to fit — a silently corrected inscription is
  the exact failure this exists to prevent.
- **The model never computes the Hebrew date.** A library does, from the
  civil date and the hour. The model is forbidden to write a Hebrew date, and
  Hebrew is stripped from its prose in code rather than by instruction.
- **Ambiguity is surfaced, not resolved cleverly.** Where a decision has to be
  made — an hour of death nobody can find, a name the form cannot spell — the
  app says so in words the family can act on. Where a default is unavoidable,
  the inscription itself discloses it (see ADR 0008).
- **The grid is never guessed.** The box grid is detected on the blank and
  rejected unless it is exactly five rows of twenty-eight with even spacing.
  A nearly-right grid is the dangerous case: every number lands in the wrong
  box and nothing looks wrong.

## Status

**Working prototype, deployed, used by a handful of testers.** The
deterministic core — character table, Hebrew calendar, inscription composer,
grid detection, form rendering, dialogue logic — is covered by 162 tests, and
the whole path from a conversation to a filled form has been run end to end.

Not yet true:

- **No rabbinic review.** Nothing the system produces has been checked by a
  rabbi. Until it has, output is a draft for a human who reads Hebrew.
- **No accounts, no database, nothing kept.** One conversation in one browser.
  Whatever a family types is gone when the tab closes.
- `docs/decisions/` describes an eventual shape beyond what is built. Treat
  the ADRs as intent and `src/` as fact.
- Open questions — including one for a rabbi about unknown hours of death —
  are tracked, honestly, in `docs/open-questions.md`.

## Running it

```
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit, strict
npm run build:web   # bundle the page into public/
```

Everything except the conversation runs offline. The dialogue needs an
Anthropic API key; see `DEPLOY.md` for the hosted setup, which keeps the key
on the server and gates access with a shared passcode.

```
npx tsx scripts/render-sample.ts <blank-image> out.pdf   # fill a form directly
```

## Layout

| Path | What is in it |
|---|---|
| `src/lib/` | The tested core: encoder, calendar, composer, grid, renderer, dialogue |
| `src/browser/` | The phone-first page; the transport is injected |
| `api/chat.ts` | The one server endpoint — the only place an API key lives |
| `docs/domain/` | Hebrew inscriptions, and the vendor form's decoded character table |
| `docs/decisions/` | Why it is done the odd way — usually a halachic or typographic constraint |
| `docs/open-questions.md` | What is not known yet. Nothing here is guessed at in code |
| `CLAUDE.md` | Working notes for AI assistants in this repository |

TypeScript throughout, no framework in `src/lib/`, `@hebcal/core` for the
calendar — never a hand-rolled Hebrew date.

## Privacy

No real order material is in this repository, and none should ever be added:
no decedent names, no dates of death, no family contact details, no scans of
filled forms or proofs. Every example and test uses invented names and
synthetic dates. `samples/` is gitignored.

The committed blank order form carries no personal data — empty boxes, the
character chart, and the companies' own pre-printed details.

## Licence

None yet. Not open for reuse while the domain questions are unsettled.
