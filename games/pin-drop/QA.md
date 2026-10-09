# QA checklist: Pin Drop

Status as of 2026-10-05. Automated items were run in this repository; device items have not been run.

## Automated

- [x] SDK conformance suite (`describeConformance`, `src/index.test.ts`): lifecycle, no leaked timers, frames, listeners or DOM, scoped storage only, no network.
- [x] Rules, win/lose, undo and restart tests (`src/logic.test.ts`).
- [x] Level solvability: all 50 levels are regenerated from their recorded plan, solved by breadth-first search, replayed, and their par equals the shortest solution (`src/logic.test.ts`).
- [x] Mechanics: lava (burn, cool by rock), gates and sensors (two channels), coloured cups, gauge counts (`src/logic.test.ts`).
- [x] Worlds, intro banners and per-world mechanics present (`src/logic.test.ts`).
- [x] Play-through by pointer events: tap, swipe, resume, stars saved, animated pull (`src/play.test.ts`).
- [x] Screenshots reviewed at 390x844: level 1, mid-animation splash, win card, levels 11, 21 and 50 (dev preview, not a device).
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

## Feel checklist (not run on a device)

- [ ] Pin pull recoil and whoosh, landing squash and plink pitch variation feel right on a phone.
- [ ] Rising chime counts up with the cup (3/5), cup fill gauge reads at arm's length.
- [ ] Swipe-to-pull does not trigger by accident when aiming at a pin.
- [ ] Longest board (4 tiers, 18 rows) keeps 60 fps and readable cells at 360 px wide.
