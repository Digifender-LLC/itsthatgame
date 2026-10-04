# ADR-0002: TypeScript games in a Capacitor native shell

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated]
- **Supersedes / superseded by:** —
- **Related requirements:** `FR-APP-*`, `FR-GAME-1`, `NFR-1`, `NFR-2`, `NFR-5`, `IF-5`

## Context

The product needs many small 2D games on iOS and Android (`BO-3`), built cheaply by one
operator with AI coding agents (`BC-2`). Games are mechanically simple (sorting, pin-pull,
stacking, merge, runners). The same team also needs a landing page and a backend.

## Decision

Build the app as a Capacitor native shell hosting a TypeScript web UI, with each game a
TypeScript module (default engine Phaser) implementing a shared game contract (`IF-5`).
The landing page and backend also use TypeScript.

## Alternatives considered

- **Unity (C#):** strong for games and performance, but heavier tooling, larger binaries,
  editor-centric workflow that agents handle less well, separate stack from backend.
- **Native Swift + Kotlin:** best platform fit, but two codebases per game.
- **Flutter/Flame:** good single codebase, but a separate language from backend and web,
  smaller game ecosystem than Phaser.
- **React Native:** UI-focused; game rendering would still need a canvas/WebGL layer.

## Consequences

- One language and toolchain across repo; games testable in a browser and in CI.
- Risk: WebView performance on low-end Android and App Store "minimum functionality"
  perception. M2 measures performance before the library is built.
- Native features go through Capacitor plugins; purchases via RevenueCat's plugin
  ([ADR-0005](0005-store-iap-via-revenuecat.md)).

## Revisit when

M2 measurements fall clearly short of `NFR-1`/`NFR-2` on the reference Android device,
or a store rejects the app for being web-based.
