# Architecture Decision Records

Each significant architectural decision gets one file, `NNNN-short-title.md`, numbered
sequentially and never renumbered. Use [`template.md`](template.md).

**When to write one** (see [agents.md](../../agents.md)): new runtime dependency or
service; change to data storage, trust boundaries, identity, entitlement, or platform;
anything that reverses an accepted ADR. Not for routine library or style choices; those
go in the [TDD](../design/TDD.md).

**Status values:** `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, `Deprecated`.
Accepted ADRs are not edited except to change status and add a supersession link. To
change a decision, write a new ADR and link both ways.

**Provenance:** each ADR states who decided. `[Delegated]` means an agent decided under
the owner's delegation; the owner has not reviewed it and may overturn it with a new ADR.

| ADR | Title | Status | Provenance |
|---|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted | `[Delegated]` |
| [0002](0002-typescript-games-in-capacitor-shell.md) | TypeScript games in a Capacitor native shell | Accepted | `[Delegated]` |
| [0003](0003-no-ads-no-third-party-tracking.md) | No ads and no third-party ad or tracking SDKs | Accepted | `[User]` premise, formalized `[Delegated]` |
| [0004](0004-cloudflare-workers-d1-backend.md) | Backend on Cloudflare Workers and D1 | Accepted | `[Delegated]` |
| [0005](0005-store-iap-via-revenuecat.md) | Store in-app purchases via RevenueCat | Accepted | `[Delegated]` |
| [0006](0006-no-accounts-install-scoped-identity.md) | No user accounts in MVP; install-scoped identity | Accepted | `[Delegated]` |
| [0007](0007-games-bundled-in-binary.md) | Games bundled in the app binary | Accepted | `[Delegated]` |
| [0008](0008-text-only-moderated-submissions.md) | Text-only, private, moderated submissions | Accepted | `[Delegated]` |
| [0009](0009-android-first-ios-deferred.md) | Android first; iOS deferred | Accepted | `[User]` direction, formalized `[Delegated]` |
