# 0002. Stack and platform

Date: 2026-09-21
Status: Accepted

## Context

The tool needs a UI, server-side logic (Hebrew composition, encoding, form
generation), and storage that survives between sessions — an order is filled
in, sent out, and re-opened when the vendor's proof comes back. Target
platform is AWS. Volume is unknown but expected to be small: one cemetery's
annual monument orders.

## Decision

**TypeScript end to end. Next.js, Postgres on RDS, S3, running on AWS.**

| Concern | Choice |
|---|---|
| Language | TypeScript, everywhere |
| App | Next.js — UI and server routes in one deployable |
| Hebrew calendar | `@hebcal/core` |
| Database | PostgreSQL on RDS, smallest instance |
| File storage | S3 — generated forms, approval snapshots |
| Email | SES — magic links (see ADR 0003) |
| Hosting | App Runner (a plain container) |

## Why

**One language.** The encoder, the live preview, the PDF generation and the
server all share the character table and the composition rules. Splitting
languages would mean maintaining that table twice — and a table that exists
in two places will eventually disagree with itself. That is a wrong-stone
failure mode.

**`@hebcal/core` over `pyluach`.** Both are sound; the JS one keeps us in one
language. See `docs/domain/hebrew-inscriptions.md` §2.5 — we do not hand-roll
the calendar either way.

**Postgres, not DynamoDB.** This is the load-bearing choice. The project's
value is not getting it wrong, and Postgres lets the *database* enforce that:
`NOT NULL` on gender, a check constraint that refuses an order whose Hebrew
date is still flagged ambiguous, foreign keys, enums for status. In DynamoDB
every one of those invariants becomes application code someone has to
remember to write. At this data volume the scaling argument for DynamoDB is
irrelevant; the correctness argument for Postgres is not.

**Next.js rather than a separate API.** One service to deploy, monitor and
secure. At this scale a split frontend/backend is overhead with no benefit.

## What this rules out

- Python for application code. (A Python prototype exists in development
  scratch; it is not project code and does not survive this decision.)
- A NoSQL primary store.
- Serverless-for-scale architectures. Volume does not justify the complexity.

## Consequences

- **SES starts in sandbox mode** and can only send to verified addresses.
  Production access must be requested before magic links work for real
  families. This will block launch if left to the end — do it early.
- Cost is dominated by the always-on RDS instance and the App Runner service.
  Expect tens of dollars a month, not hundreds. Verify against current AWS
  pricing rather than trusting an estimate written here.
- If volume ever grows by orders of magnitude, almost nothing about this has
  to change except instance size.

## Sequencing note

The encoder and form generation are valuable with **no database at all** — 
fill in, download the filled form, done. Persistence only becomes necessary
for the proof-checking loop (ADR 0001, and `eagle-granite-form.md` §1). If
schedule pressure appears, shipping a stateless v1 first is a legitimate cut,
and this architecture accommodates adding the database afterwards without
rework.
