# Domain notes: Hebrew matzevah inscriptions

**Status: drafted from general domain knowledge, NOT yet verified against the
cemetery's actual order sheet or finished-product samples.** Nothing in this
file has been reviewed by a rabbi or by the cemetery. Treat every claim as a
hypothesis to confirm. See `docs/open-questions.md`.

The stakes shape the whole design: the output is sandblasted into granite. A
wrong letter is not a bug report, it is a family paying to recut a stone, or
living with an error over a grave. Everything below exists to prevent that.

---

## 1. Structure of a typical Ashkenazi matzevah inscription

Usual line order, top to bottom:

```
פ״נ                              opening abbreviation
[honorific] [Hebrew given name]  the deceased
בן / בת [father's Hebrew name]   patronymic
נפטר / נפטרה [day] [month] [year]  Hebrew date of death
תנצב״ה                            closing abbreviation
```

### Abbreviations in common use

| Written | Expands to | Notes |
|---|---|---|
| פ״נ | פה נקבר / פה נקברה | "here lies buried" |
| פ״ט | פה טמון / פה טמונה | alternative opening |
| תנצב״ה | תהא נפשו/נפשה צרורה בצרור החיים | from 1 Samuel 25:29; some traditions use נשמתו |
| ז״ל | זכרונו / זכרונה לברכה | |
| ע״ה | עליו / עליה השלום | |
| לפ״ק | לפרט קטן | marks a year written without the 5000s |
| ר׳ | ר(ב) — "Reb" | courtesy title for a man |
| מרת | Mrs. | courtesy title for a married woman |

Priestly/Levite lineage is appended to the name: הכהן or הלוי.

### Gender agreement — a systematic failure mode

Gender must be applied consistently across the whole inscription, not
per-field. The pairs that change:

- נקבר / נקברה (though the abbreviation פ״נ covers both)
- נפטר / נפטרה
- בן / בת
- The expansion behind תנצב״ה (נפשו / נפשה) — abbreviation is identical
- ז״ל, ע״ה — written identically, expand differently

Design implication: **gender is one field on the record, and every derived
string reads from it.** Never let a UI offer per-line gender.

---

## 2. Hebrew date conversion — the highest-risk area

### 2.1 The sunset rule

The Hebrew day begins at sunset, not midnight. A death at 8pm on 3 March is
already the *next* Hebrew day. This is the single most common source of wrong
yahrzeit dates.

Consequences for the design:

- Date of death alone is **insufficient**. We need the **time of death** and
  the **place** (Philadelphia, for sunset times).
- If time of death is unknown — which will happen — the system must say so,
  not silently pick one. Two candidate Hebrew dates should be shown and the
  ambiguity escalated to the family or a rabbi.
- Deaths near sunset fall in *bein hashmashot* (twilight, between sunset and
  nightfall), which is halachically ambiguous even with an exact time. This
  is a rabbinic question, not a software question. The system's job is to
  **detect and flag** it, never to resolve it.

### 2.2 Leap years and Adar

Hebrew leap years have 13 months: Adar I (אדר א׳) and Adar II (אדר ב׳). A
death in Adar of a common year has non-obvious yahrzeit behavior in later leap
years. Relevant to the stone: the month name engraved must match the year that
actually occurred.

Cheshvan and Kislev vary in length year to year, so day-of-month arithmetic
cannot be done naively.

### 2.3 Gematria (numbers written as Hebrew letters)

Years are conventionally written in the *minor reckoning* — the 5000 is
dropped. Hebrew year 5785 is engraved תשפ״ה (400+300+80+5 = 785).

Punctuation rule: a single letter takes a geresh (׳); multiple letters take a
gershayim (״) before the final letter. Day 5 → ה׳. Day 15 → ט״ו. Year → תשפ״ה.

**Two special cases that must never be produced mechanically:**

- 15 is written ט״ו (9+6), **not** י״ה — because י״ה spells a name of God.
- 16 is written ט״ז (9+7), **not** י״ו — same reason.

A naive place-value converter gets both of these wrong. This is exactly the
kind of error the cemetery's manual process would produce and that we exist to
eliminate.

### 2.4 Month names

תשרי · חשון (or מרחשון) · כסלו · טבת · שבט · אדר (אדר א׳ / אדר ב׳ in leap
years) · ניסן · אייר · סיון · תמוז · אב (or מנחם אב) · אלול

Variants like חשון/מרחשון and אב/מנחם אב are a **house style choice**, not a
correctness issue. The cemetery's samples decide which we use; make it
configurable rather than hardcoded.

### 2.5 Engineering rule

**Do not hand-roll the Hebrew calendar.** Use a mature, tested library —
`@hebcal/core` for JS/TS, `pyluach` for Python. Both handle leap years, month
lengths, sunset-relative dates and gematria formatting. Confirm the exact API
against current docs at implementation time rather than from memory.

Our own code should own only: the sunset/time-of-death policy, the
ambiguity flagging, and the house-style choices.

---

## 3. Names, Hebrew and Yiddish

The Philadelphia community this serves is substantially of Yiddish-speaking
immigrant descent, which is why the cemetery's character set mixes Hebrew and
Yiddish letters.

Yiddish orthography adds characters Hebrew liturgical text does not use:

- Precomposed/pointed forms: אַ (pasekh alef), אָ (komets alef), בֿ, פֿ, שׂ
- Digraphs: וו (tsvey vovn), ױ (vov yod), ײ (tsvey yudn), ײַ

In Unicode these may appear as precomposed codepoints or as base letter +
combining mark — **the same visual glyph can have two different encodings.**
Any lookup table keyed on raw input will silently miss one of them.

Design implication: **normalize all Hebrew/Yiddish input to a single canonical
Unicode form (likely NFC) at the boundary**, before storage or encoding. Write
tests that feed both representations and assert identical output.

Separately: a person's Hebrew name is frequently *not* a transliteration of
their English name (Harry → צבי, Bessie → פסיא). The system must accept a
Hebrew name as its own field and never attempt to derive it from the English
name automatically. Offering *suggestions* from a curated name table is
useful; auto-filling is not acceptable.

---

## 4. The cemetery's numeric encoding

What we know from the user: the order form requires the Hebrew portion to be
entered as numbers, one number per letter, covering both Hebrew and Yiddish
characters.

**This is almost certainly a glyph index into a legacy engraving font or
stencil catalog. It is NOT gematria.** Do not assume any relationship between
a letter's numeric code and its gematria value. The table must be transcribed
from the cemetery's own sheet — guessing it produces wrong stones.

Unknowns that the sample sheet must resolve are tracked in
`docs/open-questions.md`.

### Architectural rule

Canonical Unicode Hebrew is the **source of truth** on the record. The numeric
code is a **render target**, produced by a pure, table-driven function with no
business logic in it:

```
encode(unicode_hebrew) -> number sequence
decode(number sequence) -> unicode_hebrew
```

Round-trip property test: `decode(encode(x)) == x` for every string in the
corpus. If the mapping is not bijective, that fact needs to be discovered
early, because it constrains the whole design.

---

## 5. Verification, not just generation

Generating the Hebrew is the easy half. The system's real value is letting a
non-Hebrew-reading funeral director or family member **confirm** it is right.

Minimum verification surface before anything is marked approved:

- Hebrew rendered large, in a real engraving-appropriate typeface, RTL correct
- A line-by-line back-translation into English of what the Hebrew actually says
- The date shown both ways — Gregorian in, Hebrew out — with the sunset
  assumption stated in words ("died after sunset, so the Hebrew date is the
  following day")
- Every flagged ambiguity surfaced, unresolved, and blocking
- An explicit human sign-off, recorded with a snapshot of exactly what was
  approved

The approval snapshot is the audit trail. If a stone comes out wrong, we need
to be able to say precisely what was shown to whom, and when.

---

## 6. Things this system must never do silently

- Pick a Hebrew date when time of death is unknown
- Resolve a *bein hashmashot* case
- Derive a Hebrew name from an English name
- Emit a numeric code for a character not in the confirmed table
- Produce 15 or 16 by place-value gematria
- Apply gender per-line rather than per-record

Each of these should be a hard error or a blocking flag, never a default.
