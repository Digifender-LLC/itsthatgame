# ADR-0004: Backend on Cloudflare Workers and D1

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated]
- **Supersedes / superseded by:** —
- **Related requirements:** `IF-1`, `IF-2`, `IF-3`, `IF-6`, `NFR-6`, `NFR-7`, `SEC-3`, `SEC-4`, `DATA-5`

## Context

The backend is small: a waitlist, submission intake and triage, analytics ingest, and an
operator API. One operator (`BC-2`) needs near-zero maintenance and low fixed cost. The
landing page needs static hosting and bot protection.

## Decision

Use Cloudflare: Workers for the API, D1 for relational data, Workers Analytics Engine for
event aggregates, Pages for the landing page, Turnstile for bot checks, and Access for
operator authentication. TypeScript, deployed with Wrangler.

## Alternatives considered

- **Firebase:** fast to start, but its analytics and SDKs conflict with
  [ADR-0003](0003-no-ads-no-third-party-tracking.md), and Firestore's model is a poorer
  fit for simple relational triage queries.
- **Supabase:** Postgres and auth are strong, but auth is unnecessary in MVP
  ([ADR-0006](0006-no-accounts-install-scoped-identity.md)) and it adds another vendor
  for bot checks and hosting.
- **AWS (Lambda, DynamoDB/RDS, CloudFront):** most flexible, highest setup and IAM
  burden for one person.

## Consequences

- One vendor and dashboard for hosting, API, data, bot checks, and admin auth.
- Low cost at expected volumes ([TDD §9](../design/TDD.md#9-observability-capacity-and-cost)).
- D1 is SQLite: single-writer per database, fine at MVP volumes; no stored procedures.
- Vendor coupling mostly in Access and Turnstile; Worker code is portable `fetch` handlers.

## Revisit when

Write volume or data size approaches D1 limits; a feature needs capabilities D1 lacks
(e.g. full-text search at scale); accounts are introduced and need a managed auth
provider.
