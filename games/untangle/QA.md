# Untangle: QA checklist

## Automated (run 2026-10-04)

- [x] Conformance suite (`describeConformance`, FR-GAME-1): lifecycle, no leaked
      timers/frames/listeners/DOM, scoped storage only, no network.
- [x] Level solvability (FR-GAME-2): `src/logic.test.ts` asserts, for all 24 levels, that
      the stored solution layout has 0 crossings and the scrambled start has more than 0,
      plus well-formed edges and normalized positions.
- [x] Geometry tests: proper crossings, T-junctions, collinear overlap, shared endpoints,
      near-collinear float noise.
- [x] State tests: move clamping, undo, restart, solution applies to a win.
- [x] Input/resize/resume smoke test in `src/index.test.ts`.
- [x] `pnpm --filter @itg/game-untangle typecheck`, ESLint, Prettier.

## Accessibility (NFR-4)

- [x] Color is never the only cue: crossing edges are dashed and thicker, intersections
      carry diamond markers, and a numeric "Crossings: N" counter is shown; palette is
      Okabe-Ito.
- [x] Touch targets: nodes have a 24 px hit radius (48 px diameter); buttons are 48 px high.
- [x] Reduced motion: overlay fade/lift disabled when `prefersReducedMotion` is set.
- [x] Layout scales from 320x568 to tablet (positions normalized 0..1, `onResize`).
- [ ] Screen-reader labels: canvas-only; not addressed in this version.

## Device checklist

- [ ] iOS phone: pending device testing (Roadmap P4)
- [ ] Android phone: pending device testing (Roadmap P4)
- [ ] Tablet layout: pending device testing (Roadmap P4)
- [ ] Dense levels (20+ nodes) comfortable on a 320 px wide screen: pending device testing (Roadmap P4)
- [ ] Interrupt/background resume (pause/resume): pending device testing (Roadmap P4)
- [ ] Performance and battery: pending device testing (Roadmap P4)
