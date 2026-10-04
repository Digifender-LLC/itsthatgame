# ADR-0006: No user accounts in MVP; install-scoped identity

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated]
- **Supersedes / superseded by:** —
- **Related requirements:** `FR-SUB-6`, `DATA-2`, `DATA-4`, `SEC-7`

## Context

The experience principle is instant play (PRD §7). Accounts add sign-up friction,
personal data, password or OAuth handling, and deletion obligations. Purchases can be
restored through the store account. Submissions need only enough identity to show a
player their own requests and to rate limit.

## Decision

No accounts. The app generates a random UUIDv4 install ID on first launch and stores it
locally. The server stores only an HMAC of it. Purchases are tied to the store account
via RevenueCat's anonymous app user ID and restore. Progress is local only.

## Alternatives considered

- **Optional accounts (Sign in with Apple/Google):** enables cloud save and cross-device
  status, but adds scope and personal data with no validation benefit.
- **Device identifiers (IDFV/Android ID):** stable across reinstall on some platforms, but
  closer to tracking and contrary to [ADR-0003](0003-no-ads-no-third-party-tracking.md).

## Consequences

- Reinstall loses local progress and submission history (purchases restore).
- No personal data beyond what the stores and RevenueCat process.
- Install IDs are forgeable; they gate only rate limits and own-status reads
  ([HLD §5](../design/HLD.md#5-trust-boundaries-and-threats)).

## Revisit when

Players ask for cloud save or cross-device progress in meaningful numbers, or a feature
needs a durable identity (e.g. public voting).
