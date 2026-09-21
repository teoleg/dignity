# Open questions

Tracks what we do not yet know. Nothing here should be guessed at in code.
When a question is answered, move the answer into the relevant doc and delete
the entry.

---

## RESOLVED — moved to docs

The character table, fill direction, form layout, house style and the order
workflow are now transcribed in `docs/domain/eagle-granite-form.md`.
Headlines:

- The 1–31 code table is **fully decoded and confirmed**. It is a glyph
  index, not gematria (code 1 is תּ, not א).
- Fill direction is printed on the form: **right to left**.
- The user is a **grieving family member**, not staff.
- There is a **second** high-value moment: checking the proof that comes back.

---

## A. Blocking — needs the cemetery, the vendor, or a rabbi

### A1. The two style anomalies on the proof
- [ ] Is `נ״פ` on the death line the intended abbreviation of נפטר/נפטרה, or
      a right-to-left transposition of `פ״נ`? **Do not reproduce until
      confirmed** — codifying an error would make every future stone wrong.
- [ ] Is `ת'נ'צ'ב'ה'` (geresh after each letter) house style, or an artifact
      of the encoding? Classical form is `תנצב״ה`.

Both are questions for the cemetery office or a rabbi, not for us.

### A2. Mechanics still unconfirmed
- [ ] How is a **space** represented? There is no code for it. Leave the box
      empty, or something else? Affects every inscription.
- [x] ~~Exact number of boxes per row~~ — **measured: 5 rows × 28 boxes =
      140 characters.** Recorded in `eagle-granite-form.md` § 3.
- [ ] Is "Inscription" a shared/title line, or simply the first of five
      equal lines?
- [ ] **A clean blank original of the form** (PDF, or a flat scan at known
      DPI). Required for print-accurate output per ADR 0001 — the scan we
      measured from is skewed and has pencil marks on it.
- [ ] What happens when text exceeds one line — who decides the break?
- [ ] Is line centering the engraver's job or the orderer's?

### A3. Character set limits
- [ ] The table has **no Yiddish diacritics and no nikud**. Confirm this is
      really all that is available — is there a second sheet, or an
      "additional characters" process for names that need אַ, פֿ, etc.?
- [ ] What is the fallback when a name cannot be spelled with these 31 codes?

---

## B. Product scope

- [ ] **Which of the two moments do we build first** — filling the form, or
      checking the returned proof? Checking is the smaller build and guards
      the last step before granite is cut.
- [x] ~~Output format~~ — **decided: a completed copy of Eagle Granite's own
      form, visually identical, boxes filled.** See ADR 0001. Hand
      transcription of numbers is explicitly ruled out.
- [ ] Does the cemetery or Eagle Granite need to agree to this, or does it
      simply produce their existing form well enough that nothing changes on
      their side? (The second is far easier to ship.)
- [ ] Multiple decedents on one monument — the observed proof had two. Is that
      one form or two?
- [ ] Does a record need to persist and be reopened, or is each session
      one-shot?

## C. Correctness governance

- [ ] Who is the rabbinic authority for review? Needed before the first real
      stone, and needed to settle A1.
- [ ] Policy when time of death is unknown — likely the most common real case,
      and unanswerable by software (see `hebrew-inscriptions.md` §2.1).
- [ ] Curated English → Hebrew name suggestion table: do we need one, and who
      vets it?

## D. Legal and privacy

- [ ] Retention and access policy for records of the deceased and family
      contact details. Not HIPAA, but sensitive, and the community is small.
- [ ] Is reproducing the vendor's form layout acceptable to them?
- [ ] **Settled for now:** real forms and proofs are excluded from version
      control via `.gitignore`. See `samples/README.md`.

---

## E. Technical decisions — deliberately unmade

Recorded as ADRs in `docs/decisions/` when decided.

- [ ] Language and runtime
- [ ] Web framework and rendering approach
- [ ] Persistence — whether any is needed for v1
- [ ] Hebrew typeface for preview. The proof names `HEBREW TDS`; we will not
      have it, so preview fidelity is approximate. Decide how close is close
      enough, and license whatever we do use.
- [ ] PDF generation for the printable form
- [ ] Hosting
