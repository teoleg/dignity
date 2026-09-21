# 0005. English-first, chat-led, with the stone always on screen

Date: 2026-09-21
Status: Accepted

## Context

The person using this **does not read Hebrew**. They know the deceased's
English name and a Gregorian date. Everything the tool produces is in an
alphabet they cannot check.

## Decision

**The interface is English-first and conversational. The app asks; the family
answers. The finished stone is drawn on screen at all times.**

### 1. The app interviews, the family answers

Not a free-form chat box. The app knows what it still needs and asks for it,
one numbered question at a time, with tappable answers and free text as a
fallback. A grieving person should not have to work out what to say next.

### 2. Three things per line, never just the Hebrew

Showing Hebrew to someone who cannot read it is decoration, not verification.
Every line carries:

| | |
|---|---|
| The Hebrew | the artifact itself |
| **How it sounds** | `SAH-rah bat av-ra-HAM` |
| What it means | "Sarah, daughter of Abraham" |

**The pronunciation is the verification mechanism.** A family cannot check
spelling they cannot read, but they know how the name was said at the
funeral. Read it aloud and an error is obvious.

Pronunciation appears only where it does work — the name, and family-authored
lines. On `פ״נ` it would be noise; the meaning carries that line.

### 3. The stone is drawn, and never hidden

Not a tab, not a preview panel that can be switched away from: a rendered
monument, pinned on screen, updating as the conversation goes. An earlier
prototype put it behind a tab and that was wrong.

### 4. Two viewers, not one

The screen serves the family member typing **and anyone sitting beside them**
— a rabbi, an older relative, a neighbour — who may read Hebrew.

These need opposite things. The first needs English and sound. The second
needs the Hebrew large, clean and **unabbreviated**: nothing simplified "for
clarity", because a Hebrew reader checking a stone must see the real
characters. The page says so explicitly, inviting the family to turn the
screen.

One competent reader glancing at the screen catches more than any amount of
our own checking. It is the cheapest verification the product will ever get,
and it costs a sentence of copy.

### 5. Russian is offered; English is the baseline

The community is substantially Soviet-immigrant, but **its members read
English too** — Russian is a comfort, not a rescue, and the product is not
blocked without it. Offered as a toggle covering the interview, the meanings
and the pronunciation.

The pronunciation must be **re-transliterated per language**: `SAH-rah` is an
English respelling and a Russian speaker would read it wrong. In Russian it
is `СА-ра бат ав-ра-ХАМ`. A translated interface that keeps English phonetics
has broken the one mechanism that makes the name checkable.

**The Hebrew itself never varies by interface language.** It is the artifact;
only the scaffolding around it is translated.

## What this rules out

- Requiring any Hebrew literacy to complete an order.
- Hiding the stone behind a tab or a step.
- Deriving a Hebrew name from an English one without confirmation — see
  `docs/domain/hebrew-inscriptions.md` §3.
- Sharing one phonetic respelling across interface languages.

## Consequences

- Hebrew name confirmation is a **blocking check**, with options ordered by
  how trustworthy the source is: the family recognising how it sounded, a
  written record (funeral papers, death certificate, a parent's stone — the
  best source), or "I'm not sure", which stays blocked and goes to a rabbi.
- Time of death is the other blocking check, explained without Hebrew: the
  Jewish day starts at sunset, so an evening death is recorded on the next
  day.
- Approval is disabled while either is open, and the button states what is
  outstanding.
- Adding a language means adding a phonetic scheme, not just strings.
