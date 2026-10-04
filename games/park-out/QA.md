# Park Out QA checklist (TDD §8)

Run from the repo root: `pnpm --filter @itg/game-park-out typecheck`, `... test`,
`pnpm exec eslint games/park-out`, `pnpm exec prettier --check games/park-out`.

## Automated

- [x] SDK conformance suite (`src/index.test.ts`, FR-GAME-1): lifecycle, repeated pause/resume,
  resize, no leaked animation frames / timers / listeners / DOM after `destroy()`, scoped
  storage only, no network.
- [x] Logic tests (`src/logic.test.ts`): parse/validation, slide ranges, legal and illegal slides, solved detection, move counting, undo, reset, replay, BFS optimum and path, unsolvable and already-solved lots (12 tests); level tests (4): 24 levels, ordered, well-formed, every level solvable by BFS with the stored optimal move count.
- [x] Play-through test (`src/play.test.ts`): drives real pointer events through the mounted game. Verifies dragging the optimal solution of level 1, `levelComplete(1)`, progress saving, and resume of an unfinished level after relaunch.
- [x] ESLint (no fetch / localStorage / Capacitor in games), Prettier, and `tsc` pass.

## Accessibility (NFR-4)

- [x] Touch targets are at least 44 px high (buttons 44-52 px; cells are at least 46 px at 320 px; arrow, Undo, Restart and level buttons are 48 px high; tap-to-select plus arrow buttons are the non-drag alternative).
- [x] Colour is never the only cue: Okabe-Ito palette plus a glyph or number on every piece.
- [x] Text on pieces picks ink or white by contrast against the piece colour.
- [x] `ctx.prefersReducedMotion` honoured: vehicles snap to cells instead of easing and the exit slide is skipped (the completion overlay shows immediately).
- [x] Layout is computed from `ctx.viewport` each frame and on `onResize`; sized for 320x568
  up to tablets (board capped, centred) and respects `safeArea` insets.
- [ ] Screen-reader semantics: the game is canvas-only; no text alternative beyond on-screen
  text yet. Tracked as a known gap, to be reviewed in device testing.

## Device checklist

- [ ] Pending device testing (Roadmap P4): low-end Android, recent iPhone, tablet, offline
  launch, backgrounding mid-play, rotation, 60 fps feel, touch comfort.
