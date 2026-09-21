# Data model

Sketch, not yet implemented. Reflects ADR 0002 (Postgres) and ADR 0003 (no
accounts, magic links, bounded retention).

The guiding idea: **push invariants into the database.** If a constraint can
be expressed in the schema, it belongs there rather than in application code
someone has to remember to write. A wrong stone is not worth the convenience.

```
order
  id                uuid pk
  status            enum('draft','submitted','proof_received','approved')
  form_revision     text not null      -- which vendor form this targets
  contact_email     citext not null    -- the only contact data we hold
  closing_style     enum('classical','spaced') not null default 'classical'
  created_at        timestamptz not null
  expires_at        timestamptz not null

access_token
  order_id          uuid fk -> order on delete cascade
  token_hash        bytea not null     -- hash only, never the token
  expires_at        timestamptz not null
  used_at           timestamptz

decedent
  id                uuid pk
  order_id          uuid fk -> order on delete cascade
  gender            enum('male','female') not null     -- see note 1
  hebrew_given      text not null
  hebrew_patronymic text not null
  relation          enum('ben','bat') not null
  english_name      text
  date_of_death     date not null
  time_of_death     time                                -- nullable
  time_of_death_known boolean not null                  -- see note 2
  hebrew_date       text                                -- nullable until resolved
  hebrew_date_ambiguous boolean not null default true   -- see note 3

inscription_line
  order_id          uuid fk -> order on delete cascade
  line_index        smallint not null    -- 0..4, five rows on the form
  hebrew_text       text not null
  codes             smallint[] not null  -- null element = blank box
  primary key (order_id, line_index)
  check (cardinality(codes) <= 28)       -- see note 4

approval
  id                uuid pk
  order_id          uuid fk -> order on delete cascade
  approved_by       text not null        -- name typed at sign-off
  approved_at       timestamptz not null
  snapshot          jsonb not null       -- exactly what was displayed
  rendered_form_key text not null        -- S3 object
```

## Notes

**1. Gender is one column.** Every gendered string in the inscription —
`בן`/`בת`, `נפטר`/`נפטרה`, the expansions behind `פ״נ` and `תנצב״ה` — derives
from this single field. There is deliberately no per-line gender anywhere in
the schema, because that is how inscriptions end up internally inconsistent.
See `domain/hebrew-inscriptions.md` §1.

**2. `time_of_death_known` is separate from `time_of_death` being NULL.**
These are different facts: "we have not asked yet" versus "the family does
not know." The Hebrew day begins at sunset, so an unknown time makes the
Hebrew date genuinely ambiguous, and that must be represented explicitly
rather than inferred from a missing value.

**3. `hebrew_date_ambiguous` defaults to `true`** — safe by default. An order
cannot reach `approved` while any decedent still has it set. Enforce with a
constraint or trigger, not in application code:

```sql
-- an approved order may not contain an unresolved Hebrew date
```

**3a. `closing_style`** selects between `תנצב״ה` (default) and `ת׳נ׳צ׳ב׳ה׳`.
Both are acceptable — a family preference, not a correctness flag. It lives
on the order rather than per-decedent because a shared monument carries one
closing line.

**4. 28 is the form's line capacity**, measured — see
`domain/eagle-granite-form.md` §3. The check constraint means an
over-long line cannot be persisted at all, rather than being discovered at
render time.

## `approval` is append-only

```sql
revoke update, delete on approval from application_role;
```

If a stone comes out wrong, the question is what was shown to the person who
signed off, and when. A mutable audit trail cannot answer that. The snapshot
holds the rendered Hebrew, the back-translation, the resolved date and the
code sequences as displayed — not foreign keys to rows that may since have
changed.

## Retention

`order.expires_at` drives a scheduled purge. `on delete cascade` throughout
means deleting the order removes the tokens, the decedents, the lines and the
approval snapshot together. That is intentional: the audit trail is bounded
by the same window as the data it describes (ADR 0003).

The purge job must be monitored. A retention policy nobody verifies is not a
retention policy.
