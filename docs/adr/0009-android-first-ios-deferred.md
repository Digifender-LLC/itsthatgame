# ADR-0009: Android first; iOS deferred

- **Status:** Accepted
- **Date:** 2026-10-05
- **Provenance:** `[User]` direction ("Start working on actual games, just stick to android
  for now", 2026-10-05), formalized `[Delegated]`
- **Supersedes / superseded by:** — (narrows the platform scope of
  [ADR-0002](0002-typescript-games-in-capacitor-shell.md) in time; does not reverse it)
- **Related requirements:** `FR-APP-1`, `FR-APP-3`, `NFR-1`, `NFR-2`, `NFR-5`

## Context

ADR-0002 chose a Capacitor shell so one TypeScript codebase can ship on iOS and Android.
iOS builds need macOS (prerequisite P4) and an Apple Developer account (P2), neither of
which is available. The owner asked to focus on the games and Android only for now.

## Decision

1. Android is the only platform built, tested and distributed until this ADR is
   superseded. The Capacitor Android project is committed at `apps/shell/android/`; the
   iOS project stays uncommitted and ungenerated.
2. CI builds an installable debug APK on every pull request and main push
   (`.github/workflows/ci.yml`, job `android`), so the owner can sideload builds without a
   Play Console account (Roadmap D16).
3. Code stays cross-platform: games and the shell keep using only web APIs and Capacitor
   plugins that also exist on iOS, so adding iOS later is a build task, not a rewrite.

## Alternatives considered

- **Keep both platforms in lockstep:** blocked on P2/P4 today; would stall all native
  testing.
- **Web-only (PWA) testing:** no native haptics, back button, or install feel; the owner
  asked for Android.

## Consequences

- M2-T5 device checks, per-game device QA and M6 release planning are Android-only for
  now; iOS rows are `Deferred`.
- The iOS minimum-version and App Store items in `NFR-5` and the release checklist remain
  requirements for a later iOS release; they are not dropped.

## Revisit when

The owner asks for iOS, or P2 (Apple) and P4 (macOS) become available.
