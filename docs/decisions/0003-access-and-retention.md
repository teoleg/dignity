# 0003. Access and retention: no accounts, magic links, bounded life

Date: 2026-09-21
Status: Accepted

## Context

The people using this are bereaved families, typically once in their lives,
within days of a death. The data is the deceased's name and dates plus one
contact address — sensitive, and the community is small enough that records
are identifying even without contact details.

An alternative design gave cemetery and funeral-home staff accounts and a
queue of orders across families. That was considered and rejected.

## Decision

**No user accounts. Access is by emailed magic link. Records have a bounded
life and are purged automatically.**

- A family receives a signed, expiring link to their own order. Nothing else.
- No passwords, no registration, no profile, no staff console.
- We store only what the inscription needs — the deceased's names, dates,
  gender, and one contact email for the link — and nothing more. No postal
  addresses, no phone numbers.
- Every order carries an expiry. On expiry it is deleted, not archived.

## Why

**Asking a grieving family to create an account is a bad thing to do**, and
it is also the wrong engineering trade: they will use this once. An account
is pure friction guarding data they already own.

**The smallest store of personal data is the safest one.** No accounts means
no credential store, no password resets, no session management, no
cross-family access path to get wrong. The entire category of "user X saw
user Y's order" disappears by construction.

## Retention window

**The window must outlive the vendor's turnaround, which is long.** The
proof drawing comes back for approval, and the vendor's own paperwork quotes
a multi-month import lead time. A 30-day expiry would delete the record
before the family ever needs it again.

Rule: **keep until approved, then 90 days; hard cap 12 months from creation.**
Both numbers are configuration, not constants in code. Revisit once real
turnaround times are observed.

## Security notes

- The link **is** the credential. Sign it, expire it, and store only a hash
  of the token — never the token itself.
- No personal data in the URL, in query strings, or in logs. A link that
  leaks via a referrer header or a screenshot should expose nothing by
  itself.
- Purge must be a scheduled job that actually runs and is monitored. A
  retention policy nobody verifies is not a retention policy.

## Consequences

- If staff later need visibility, that is a new decision and a new ADR, not
  a quiet widening of this one. Adding a staff console re-introduces every
  concern removed above.
- Losing an email address means losing access to the order. Accepted: the
  family can start again, and the alternative is worse.
- `approval` records are append-only (see the data model). Purging an order
  deletes its approval snapshot with it — the audit trail is bounded by the
  same window, deliberately.
