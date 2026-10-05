# Park Out QA checklist (TDD §8)

Run from the repo root: `pnpm --filter @itg/game-park-out typecheck`, `... test`,
`pnpm exec eslint games/park-out`, `pnpm exec prettier --check games/park-out`.

## Automated

- [x] SDK conformance suite (`src/index.test.ts`, FR-GAME-1): lifecycle, repeated pause/resume,
  resize, no leaked animation frames / timers / listeners / DOM after `destroy()`, scoped
  storage only, no network.
- [x] Logic tests (`src/logic.test.ts`): parse/validation incl. 7x7, bollards and the left-gate hero U, slide ranges, legal and illegal slides, solved detection (one and two heroes), move counting, undo, reset, replay, BFS optimum and path, mid-game solve (hints), unsolvable and already-solved lots, star thresholds; level tests (`src/levels.test.ts`): 60 levels in 6 worlds, distinct, par curve, each twist introduced once with a banner, every level solvable by BFS with the stored par.
- [x] Play-through tests (`src/ui.test.ts`): real pointer events through the mounted game. Drag-solves level 1 (3 stars saved), the animated drive-out, the first two-hero level, the first 7x7 bollard level, bump on a blocked drag, tap-to-move, hint and undo buttons.
- [x] ESLint (no fetch / localStorage / Capacitor in games), Prettier, and `tsc` pass.

## Accessibility (NFR-4)

- [x] Touch targets are at least 44 px high (buttons 44-52 px; cells are at least 46 px at 320 px; arrow, Undo, Restart and level buttons are 48 px high; tap-to-select plus arrow buttons are the non-drag alternative).
- [x] Colour is never the only cue: Okabe-Ito palette plus a glyph or number on every piece.
- [x] Text on pieces picks ink or white by contrast against the piece colour.
- [x] `ctx.prefersReducedMotion` honoured: vehicles snap to cells, no shake or jitter, and the drive-out is skipped (the win card shows immediately).
- [x] Juice rows: drag follow and lift, snap with overshoot, landing squash and dust, bump sound + spark + vehicle shake, bollard shake, hero-at-gate burst, gate open + accelerating drive-out with exhaust and whoosh, hint arrow, gate chevron and hero glow idle motion (checked visually via preview screenshots, not automated).
- [x] Layout is computed from `ctx.viewport` each frame and on `onResize`; sized for 320x568
  up to tablets (board capped, centred) and respects `safeArea` insets.
- [ ] Screen-reader semantics: the game is canvas-only; no text alternative beyond on-screen
  text yet. Tracked as a known gap, to be reviewed in device testing.

## Device checklist

- [ ] Pending device testing (Roadmap P4): low-end Android, recent iPhone, tablet, offline
  launch, backgrounding mid-play, rotation, 60 fps feel, touch comfort.
