# Paint Path: QA checklist

## Automated (run 2026-10-04)

- [x] Conformance suite (`describeConformance`, FR-GAME-1): lifecycle, no leaked
      timers/frames/listeners/DOM, scoped storage only, no network.
- [x] Level solvability (FR-GAME-2): `src/logic.test.ts` verifies all 24 levels with the
      stored solution and an independent DFS solver, and replays the solution through the
      game logic to a win.
- [x] Logic unit tests: extend, backtrack, blocked moves, undo, restart, win detection.
- [x] Input/resize/resume smoke test in `src/index.test.ts`.
- [x] `pnpm --filter @itg/game-paint-path typecheck`, ESLint, Prettier.

## Accessibility (NFR-4)

- [x] Color is never the only cue: walls are hatched, the start is a star shape, the head
      is a ring-and-dot, next moves are dashed rings; palette is Okabe-Ito.
- [x] Touch targets: buttons are 48 px high; grid cells are at least 8 px but scale up to
      72 px (a tap or drag anywhere in a cell counts; fast drags are interpolated).
- [x] Reduced motion: overlay fade/lift and wall-bump shake are disabled when
      `prefersReducedMotion` is set.
- [x] Layout scales from 320x568 to tablet via the viewport and `onResize`.
- [ ] Screen-reader labels: canvas-only; not addressed in this version.

## Device checklist

- [ ] iOS phone: pending device testing (Roadmap P4)
- [ ] Android phone: pending device testing (Roadmap P4)
- [ ] Tablet layout: pending device testing (Roadmap P4)
- [ ] Interrupt/background resume (pause/resume): pending device testing (Roadmap P4)
- [ ] Performance and battery: pending device testing (Roadmap P4)
