# QA checklist: Tile Trio

Status as of 2026-10-05. Automated items were run in this repository; device items have not been run.

## Automated

- [x] SDK conformance suite (`describeConformance`, `src/index.test.ts`): lifecycle, no leaked timers, frames, listeners or DOM, scoped storage only, no network.
- [x] Rules, win/lose, undo and restart tests (`src/logic.test.ts`).
- [x] Level solvability: all 50 levels are solved by the solver in `src/logic.ts` and the solution replayed; the construction witness wins with tray peak at most 4 (`src/logic.test.ts`).
- [x] Frozen tiles thaw by tap count, undo re-freezes, stuck boards are detected (`src/logic.test.ts`).
- [x] Helpers: Back 3, undo and shuffle (symbol multiset kept, level still solvable from the current state) (`src/logic.test.ts`, `src/ui.test.ts`).
- [x] Pointer-driven play of levels 1, 11 (ice), 21 (fog) and 50 to completion with 3 stars, plus animated play of level 1 (`src/ui.test.ts`).
- [x] Stars by tray peak (3 at peak 4 or less, 2 at 5, 1 at 6); HUD shows the target.
- [x] Juice: eased arc flight, landing squash, tray slide, trio pop with particles and floating "+1", combo pitch, tray warning glow, thaw burst, shuffle flip, board-clear burst. Looked at in browser screenshots at 390x844.
- [x] Shell behavior: resume from saved progress (old saves migrate), level completion event, progress saved (`src/ui.test.ts`).
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
