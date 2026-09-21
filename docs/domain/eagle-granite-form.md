# The Eagle Granite "Hebrew Characters" order form

Transcribed from a scan of the real form and a real returned proof. **All
personal details have been stripped.** The source images are deliberately not
in this repository — see `samples/README.md`.

- **Manufacturer:** Eagle Granite Company, Inc., Elberton, GA
- **Location code on the form:** `0355 - Forest Hills/Shalom`
- **Proof issued by:** Shalom Memorial Park, Philadelphia, PA
- **Hebrew font named on the proof:** `HEBREW TDS`

---

## 1. How an order actually moves

```
cemetery staff  ──gives blank form──▶  family member
family member   ──fills Hebrew as numbers, by hand──▶  staff
staff           ──sends──▶  Eagle Granite
Eagle Granite   ──returns proof drawing──▶  family member
family member   ──checks and signs──▶  stone is cut
```

**The person hand-encoding Hebrew into numbers is a grieving family member**,
not a professional. They may not read Hebrew. They are doing this within days
of a death. That is the whole problem.

Note there are **two** places this tool can help, not one:

1. **Filling the form** — generate the correct Hebrew and the number sequence.
2. **Checking the returned proof** — verify that what came back matches what
   was ordered. This step is currently also done by someone who may not read
   Hebrew, and it is the last line of defense before granite is cut.

(2) is arguably as valuable as (1) and is a smaller build. Worth considering
for v1.

---

## 2. The character table — CONFIRMED

Read directly from the scanned form. 29 characters plus 2 punctuation marks.

The "Key" column is the ASCII character printed above each cell — the
keystroke for the engraving font. **The number is what goes on the form.**
The key column is recorded for completeness; we do not need it.

| # | Char | Name | Key |
|---|---|---|---|
| 1 | תּ | tav **with dagesh** | `^` |
| 2 | בּ | bet **with dagesh** | `B` |
| 3 | א | alef | `A` |
| 4 | ב | vet (no dagesh) | `C` |
| 5 | ג | gimel | `D` |
| 6 | ד | dalet | `E` |
| 7 | ה | he | `F` |
| 8 | ו | vav | `G` |
| 9 | ז | zayin | `H` |
| 10 | ח | het | `I` |
| 11 | ט | tet | `J` |
| 12 | י | yod | `K` |
| 13 | כ | kaf | `M` |
| 14 | ך | kaf **sofit** | `N` |
| 15 | ל | lamed | `O` |
| 16 | מ | mem | `Q` |
| 17 | ם | mem **sofit** | `R` |
| 18 | נ | nun | `S` |
| 19 | ן | nun **sofit** | `T` |
| 20 | ס | samekh | `U` |
| 21 | ע | ayin | `V` |
| 22 | פ | pe | `X` |
| 23 | ף | pe **sofit** | `Y` |
| 24 | צ | tsadi | `Z` |
| 25 | ץ | tsadi **sofit** | `!` |
| 26 | ק | qof | `@` |
| 27 | ר | resh | `$` |
| 28 | ש | shin | `%` |
| 29 | ת | tav (no dagesh) | `&` |
| 30 | ׳ | geresh | — |
| 31 | ״ | gershayim | — |

Composition check: 22 base letters + 5 sofit forms = 27, plus תּ and בּ = 29.
Codes 30–31 sit in a separate box at the top right of the form.

**It is not gematria** — as predicted, it is a glyph index. Code 1 is tav, not
alef. Any assumption of a letter/value relationship is wrong.

### 2.1 What the table does NOT contain — important

- **No space.** There is no code for a word break. Working hypothesis: you
  leave a box empty. **Must be confirmed** — it affects every inscription.
- **No Yiddish diacritics whatsoever**: no אַ, אָ, בֿ, פֿ, ױ, ײ, ײַ.
- **No nikud** (vowel points) beyond the two dagesh forms.
- **No shin/sin dot** — ש only, no שׁ / שׂ.
- **No פּ or כּ** — only bet and tav have dagesh variants.
- No digits, no Latin characters.

This constrains the product. A name whose correct spelling needs a pasekh
alef **cannot be expressed on this form at all.** When a user enters something
unrepresentable, the tool must say so plainly and offer the nearest
representable spelling for a human to accept — never substitute silently.

This also revises an earlier assumption: the character set is *Hebrew with
dagesh variants*, not a Hebrew/Yiddish hybrid. The בּ/ב and תּ/ת distinctions
are likely what made it feel like a mixed alphabet.

### 2.2 Normalization consequence

Because בּ and תּ are **separate codes**, input normalization matters in a
specific direction: Unicode NFC will not merge ב + dagesh into a single
codepoint (there is no precomposed בּ), so the encoder must handle
`base letter + U+05BC` as a **two-codepoint sequence mapping to one code**.
A naive per-codepoint loop emits a code for ב and then fails on the dagesh.
This needs an explicit test.

---

## 3. Form layout

Five rows of boxes, labeled top to bottom:

```
Inscription
First Line
Second Line
Third Line
Fourth Line
```

Printed instruction, verbatim:

> Enter the corresponding number below to add characters to your memorial:
> **(right to left)**

So the fill order is stated on the form and matches Hebrew reading order —
the first character of the text goes in the **rightmost** box. This resolves
the ordering question, but it is also the single most dangerous thing to get
backwards, because the failure is silent and symmetrical (see §4.2).

Header fields: Customer · Eagle Granite Sales Rep · Family Name · Order Placed
By · Date · Location · Address · Email · Phone.

### Measured geometry — CONFIRMED

Measured off the scan by gridline detection:

| Property | Value |
|---|---|
| Rows of boxes | **5** |
| Boxes per row | **28** |
| Total capacity | **140 characters** |
| Box pitch | uniform, 41.6 px at 1254 px page width (min 41, max 43) |
| Row band height | ~48 px, consistent across all five rows |

So each line holds **28 characters including spaces**, and the whole
inscription holds 140. For scale, a typical death line such as an
abbreviation + day + month + year runs around 16 characters, so a normal line
fits comfortably — but a long name plus patronymic can approach the limit,
and the tool must count and warn before the family writes anything.

The pitch is uniform to within measurement noise, so box centers are
computable from the row origin and pitch rather than needing per-box
coordinates.

**Caveat:** these are proportions from a working scan of unknown DPI, with
slight skew and pencil marks. They are sound for box *counting* and relative
layout. For print-accurate output we need a clean blank original — see
`docs/open-questions.md` § A2.

**Still to confirm:** whether the "Inscription" row is a shared/title line or
simply the first of five equal lines.

---

## 4. House style, read off a real proof

The proof carried two decedents on one monument, each with three Hebrew lines,
sharing a closing line.

Per person:

```
פ״נ
[given name] בן / בת [father's given name]
נ״פ [day] [month] [year]
```

Then the English name, birth date, death date. Centered below both: the
closing formula, then "In Loving Memory".

Confirmed style points:

- Opening is **פ״נ**, not פ״ט.
- **No honorifics** — no ר׳, no מרת, no ז״ל.
- Year in **minor reckoning**, no לפ״ק. (A year observed as תשפ״ו = 786.)
- Month names appear in their standard short forms.
- Gender agreement correct on the observed sample: בת with a woman, בן with
  a man.
- **A patronymic may be a non-Hebrew name transliterated into Hebrew
  letters.** The reference inscription's father's name is a Russian given
  name written in Hebrew characters — the kind common in Soviet-immigrant
  families, and one that appears in no table of Hebrew or biblical names.
  Product consequence: name entry must accept **free Hebrew text**, validated
  only against the form's character table. A dropdown or autocomplete of
  traditional names would silently fail exactly the families this tool is
  for. Suggestions may assist; they must never constrain.
- Day-of-month gematria punctuation was **correct** on both lines observed:
  a single letter took a geresh (ה׳), two letters took gershayim before the
  last (י״ג). This matches the convention documented in
  `hebrew-inscriptions.md` §2.3.

### 4.1 Style points — one resolved, one open

**RESOLVED — the death-line `נ״פ` is correct, not a transposition.** Confirmed
by the project owner against a known-good reference inscription. It is
intentional house style and must be reproduced.

**Its meaning is confirmed: `נ״פ` means "died"** (`נפטר` / `נפטרה`). Confirmed
by the project owner. It fits its position immediately before the date and
the normal two-letter abbreviation rule (gershayim before the final letter,
as in `ז״ל`, `ע״ה`).

Note the abbreviation is **written identically for either gender**, like
`פ״נ` — only the spelled-out form differs (`נפטר` / `נפטרה`). If the tool
ever offers an unabbreviated variant, gender agreement applies there.

### Confirmed back-translation template

Both abbreviations are now settled, so the English gloss shown to families is
no longer provisional:

| Hebrew line | English |
|---|---|
| `פ״נ` | Here lies buried |
| `[name] בן / בת [father's name]` | [name], son / daughter of [father] |
| `נ״פ [day] [month] [year]` | Died [day] [month] [year] |
| closing formula | *(pending — see below)* |

This template is the back-translation feature. A family who reads no Hebrew
sees exactly this beside the inscription before they approve anything.

**STILL OPEN — the closing formula.** The observed proof rendered it
`ת'נ'צ'ב'ה'`, a geresh after every letter, rather than the classical
`תנצב״ה`. Not covered by the reference inscription. Still needs an answer
before we reproduce it.

### 4.2 Mirror-image abbreviations — a structural hazard

A single stone carries **`פ״נ` and `נ״פ`: the same two characters in opposite
order, both correct.**

The consequence is sharp. A transposition of either one produces the other,
and the other is valid Hebrew. So a reversal **cannot be caught by any
"is this valid?" check on the text alone.** It is detectable only by
position: `פ״נ` opens the inscription, `נ״פ` introduces the date.

Two requirements follow:

1. **Validate structurally, not just lexically.** The composer should know
   which abbreviation belongs on which line and reject the other there,
   rather than accepting any well-formed Hebrew.
2. **Always render the codes back into Hebrew and show it.** A digit
   transposition in a row of numbers is invisible; the same error rendered as
   text puts `נ״פ` where the reader expects `פ״נ`. This is the argument for
   the decode step being part of the UI, not just a test.

## 5. Date handling — verified against the proof, documented with synthetic data

The Hebrew dates on the real proof were checked against `pyluach` and matched
the daytime conversion **exactly**, punctuation included. The real dates are
personal and are not recorded here. The examples below are **synthetic** and
make the same two points.

```
13 Jan 2024  ->  ג׳ שבט תשפ״ד        (single-letter day: geresh)
25 Jan 2024  ->  ט״ו שבט תשפ״ד       (day 15: tet-vav, NOT yod-he)
```

**The library reproduces the house conventions for free.** Minor reckoning
(no 5000s), geresh on a single-letter day, gershayim before the last letter
otherwise — and, critically, it produces `ט״ו` rather than the place-value
`י״ה`. We do not hand-write gematria formatting, so we cannot get the 15/16
cases wrong. (See `hebrew-inscriptions.md` §2.3 for why those two matter.)

**The sunset risk is real and unguarded.** Shift either example to after
sunset and it moves a day:

```
13 Jan 2024, after sunset  ->  ד׳ שבט תשפ״ד
25 Jan 2024, after sunset  ->  ט״ז שבט תשפ״ד
```

The second is a neat illustration of the whole problem: an unknown time of
death turns `ט״ו` into `ט״ז` — a different day, a different yahrzeit, and two
characters that a non-Hebrew reader checking a proof has no way to tell apart.

The real proof carried **no time of death anywhere on it**. The existing
process either verifies this out of band or assumes daytime. A tool that
silently assumes daytime produces a wrong yahrzeit roughly whenever someone
dies in the evening. See `hebrew-inscriptions.md` §2.1: ask for the time, and
when it is unknown, show both candidates rather than picking one.

### Test-data rule

Unit tests and documentation use **synthetic dates and invented names only.**
Never commit a real decedent's name or dates, in code, fixtures, or docs.
