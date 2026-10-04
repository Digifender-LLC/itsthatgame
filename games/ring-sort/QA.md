# QA checklist: Ring Sort

Status as of 2026-10-04. Automated items were run in this repository; device items have not been run.

## Automated

- [x] SDK conformance suite (`describeConformance`, `src/index.test.ts`): lifecycle, no leaked timers, frames, listeners or DOM, scoped storage only, no network.
- [x] Rules, win/lose, undo and restart tests (`src/logic.test.ts`).
- [x] Level solvability: every level is solved by the solver in `src/logic.ts` and the solution is replayed (`src/logic.test.ts`).
- [x] Shell behavior: resume from saved progress, level completion event, progress saved (`src/ui.test.ts`).
- [x] Typecheck, ESLint (no network or storage globals in games), Prettier.

## Accessibility (NFR-4)

- [x] Color is never the only cue (glyphs or distinct shapes on every colored piece).
- [x] Colorblind-safe palette (SDK `PALETTE`, Okabe-Ito).
- [x] Reduced motion respected (`prefersReducedMotion` skips tweens).
- [x] HUD buttons and overlay buttons are at least 44 px high.
- [ ] Board touch targets of at least 44 px at 320x568: see README Controls; larger tolerance is used where cells are small. Not measured on a device.
- [ ] Screen reader support: not provided. The game is drawn on a canvas; only the container has an application label. Known gap.
- [ ] Text contrast measured against WCAG AA: palette chosen for contrast, not formally measured.

## Device checklist

- [ ] Reference low-end Android device: pending device testing (Roadmap P4)
- [ ] Reference iPhone: pending device testing (Roadmap P4)
- [ ] 320x568 portrait layout: pending device testing (Roadmap P4)
- [ ] Tablet layout: pending device testing (Roadmap P4)
- [ ] Frame rate and load time (NFR-2): pending device testing (Roadmap P4)
- [ ] Background/foreground (pause/resume) in the real shell: pending device testing (Roadmap P4)
- [ ] Sound and haptics feel: pending device testing (Roadmap P4)
