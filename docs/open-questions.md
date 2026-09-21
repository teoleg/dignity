# Open questions

Tracks what we do not yet know. Nothing here should be guessed at in code.
When a question is answered, move the answer into the relevant doc and delete
the entry.

---

## A. Blocking — the samples should answer these

These block implementation of the encoder. The user is uploading the
cemetery's order sheet and a finished-product sample; both go in `samples/`.

### A1. The character → number table
- [ ] Full table transcribed, every character the sheet supports
- [ ] Is it 1-based or 0-based?
- [ ] Do final (sofit) forms — ך ם ן ף ץ — have their own codes, separate
      from their non-final counterparts?
- [ ] Are Yiddish characters (אַ אָ בֿ פֿ וו ױ ײ ײַ) coded? As single codes, or
      as sequences of base + mark?
- [ ] Are geresh ׳ and gershayim ״ coded? They are unavoidable — every date
      and every abbreviation uses them.
- [ ] Is there a code for a space? For a line break? For centering?
- [ ] Is the mapping bijective, or do several characters share a code?

### A2. Ordering and layout
- [ ] Is the number sequence in **logical** order (first letter read = first
      number) or **visual** RTL order (rightmost letter = first number)?
      Getting this backwards produces a mirrored inscription.
- [ ] How are line breaks represented on the sheet?
- [ ] Is line centering the engraver's job or the orderer's?
- [ ] Is there a maximum characters-per-line or lines-per-stone?
- [ ] Fixed-width numeric fields (leading zeros) or variable?

### A3. House style, from the finished-product sample
- [ ] פ״נ or פ״ט as the opening?
- [ ] חשון or מרחשון? אב or מנחם אב?
- [ ] Is the year written with לפ״ק appended?
- [ ] Are honorifics (ר׳, מרת) standard, optional, or family-specific?
- [ ] Is the English side of the stone part of the same order, or separate?

---

## B. Product scope

- [ ] Who is the actual user — funeral home staff, cemetery office staff, or
      the bereaved family directly? This changes the entire UX and the
      Hebrew-literacy assumption.
- [ ] Is the output a **printable form matching the cemetery's sheet**, a
      file they upload, or something transmitted directly?
- [ ] Does the cemetery need to agree to this, or does it produce their
      existing sheet so well that no agreement is needed? (The second is far
      easier to ship.)
- [ ] Does a record need to persist — reopened, amended, reprinted — or is
      each session one-shot?
- [ ] Multiple names on one stone (spouses, family monuments)?

## C. Correctness governance

- [ ] Who is the rabbinic authority for review? The generated Hebrew needs
      review by someone qualified before the first real stone is ordered.
- [ ] What is the policy when time of death is unknown? (Likely the most
      frequent real-world case.)
- [ ] Do we need a curated English → Hebrew name suggestion table, and who
      vets it?

## D. Legal and privacy

- [ ] Deceased-person records with family contact details — what retention
      and access policy applies? This is not HIPAA, but it is sensitive and
      the community is small.
- [ ] Any agreement needed with the cemetery before using their form layout?

---

## E. Technical decisions — deliberately unmade

Not blocking; will be settled once scope above is clearer. Recorded as
Architecture Decision Records in `docs/decisions/` when decided.

- [ ] Language and runtime
- [ ] Web framework and rendering approach
- [ ] Persistence — whether any is needed at all for v1
- [ ] Hebrew typeface for on-screen preview (must be licensed for the use)
- [ ] PDF generation approach for the printable form
- [ ] Hosting
