# 0006. Translation: the model proposes, the code vets, the family decides

Date: 2026-09-21
Status: Accepted

## Context

Tier 2 of the inscription is the family's own words, rendered into Hebrew —
see `docs/domain/eagle-granite-form.md` § "What this means for translation".

This is the riskiest thing the system does. A name can be checked by sound
and a date by arithmetic, but **a translated tribute can only be handed back
to a family who cannot read it.** A mistranslation is carved exactly as
faithfully as a correct one.

## Decision

Three parties, with distinct jobs and no overlap.

**The model proposes.** It offers two or three Hebrew renderings, each with a
pronunciation and a gloss. It is never trusted and never has the last word.

**The code vets, mechanically.** Every candidate is encoded against the form's
character table and measured against the line before it is shown as usable.
Anything that fails is **rejected with a reason, never repaired.** Silently
correcting a family's inscription is precisely the failure this project
exists to prevent.

**The family decides.** They see the Hebrew, how it sounds, and — separately —
an independent reading of what it says.

### The back-translation is a second, isolated call

Every accepted candidate is translated back to English by a call that is
given **the Hebrew and nothing else.**

This is the point of the design. A gloss written by the same pass that
produced the Hebrew restates the intent rather than checking it; only a
reading of the Hebrew *alone* can disagree with what was asked for. It is the
same shape as `decode(encode(x)) === x` in `form-table.ts`, applied to
meaning instead of characters.

Both readings are shown. `meaning` is what the model set out to write;
`backTranslation` is what the Hebrew was found to say. The family compares.

### Drift is flagged, never adjudicated

`looksDivergent` compares content words between the request and the
back-translation and sets `possibleDrift`. It is crude on purpose: it catches
a translation that came back about something else entirely, and cannot judge
nuance. It is surfaced as a hint, never as a verdict. Only the family can say
whether the Hebrew means what they wanted.

### Names are verified differently

A name has no meaning to check, so it is never back-translated. Its
verification is the **pronunciation**, said aloud by someone who heard the
name used. Every name proposal carries `needsConfirmation: true`
unconditionally — a Hebrew name is frequently not a translation of the
English one, and a patronymic may be a Russian given name in Hebrew letters,
so no proposal is ever self-verifying.

### The model is injected

`TranslationModel` is an interface. `ClaudeTranslationModel` implements it;
so could a curated phrase book, or a different model. Every safety property
lives in `translation.ts` and is unit-tested against a stub, including the
cases that only arise when the model misbehaves — returning niqqud, Yiddish
diacritics, Latin text, or a line that will not fit.

## What this rules out

- Trusting model output because it looks like Hebrew.
- Repairing a candidate — stripping marks, truncating — to make it fit.
- Using the forward gloss as the verification shown to the family.
- Presenting the drift heuristic as a correctness judgement.
- Auto-filling a Hebrew name without confirmation.

## Consequences

- Two model calls per candidate. Worth it: the second one is the check.
- The system will sometimes return nothing. That is a correct outcome, and
  the prompt says so explicitly — better than something approximate.
- **The Claude adapter has not been run against the live API.** There were no
  credentials in the environment where it was written. The vetting logic is
  fully tested; `translation-claude.ts` is typechecked but unexercised, and
  the prompts are unevaluated. Running it once and reviewing the output is a
  prerequisite to shipping, and the prompts deserve an eval set of their own.
- A rabbinic review of generated phrasings is still wanted before any of this
  reaches a real stone.
