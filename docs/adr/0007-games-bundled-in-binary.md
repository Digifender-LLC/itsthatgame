# ADR-0007: Games bundled in the app binary

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated]
- **Supersedes / superseded by:** —
- **Related requirements:** `FR-APP-3`, `FR-APP-5`, `NFR-3`, `NFR-6`

## Context

Offline play is core (`CAP-3`). New games keep players paying (`BO-3`), so there is a
temptation to download new games without app updates. Store rules restrict downloading
executable code that changes app functionality, and remote code delivery adds a content
server and a security surface.

## Decision

Every game ships inside the app binary. New games arrive by app update. The catalog
manifest is bundled; there is no remote catalog or remote game code in v1.

## Alternatives considered

- **Remote game bundles (downloaded JS):** faster cadence without review, but store-
  policy risk, offline complexity (download before play), and a code-signing/integrity
  problem to solve.
- **Remote catalog only (no code):** could announce upcoming games, but adds a network
  dependency for little value at launch.

## Consequences

- Fully offline from install; simple security model.
- Each new game requires a store release and review; release cadence is bounded by review
  time (M7 planning).
- App size grows with the library; tracked by `NFR-3`.

## Revisit when

App size exceeds the `NFR-3` budget (consider on-demand resources / Play Asset Delivery
for assets, not code), or cadence is blocked by review times.
