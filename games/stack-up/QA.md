# Stack Up QA checklist (TDD §8)

Run from the repo root: `pnpm --filter @itg/game-stack-up typecheck`, `... test`,
`pnpm exec eslint games/stack-up`, `pnpm exec prettier --check games/stack-up`.

## Automated

- [x] SDK conformance suite (`src/index.test.ts`, FR-GAME-1): lifecycle, repeated pause/resume,
  resize, no leaked animation frames / timers / listeners / DOM after `destroy()`, scoped
  storage only, no network.
- [x] Logic tests (`src/logic.test.ts`): block slide and wall bounce, trim left/right, perfect snap and streak growth, miss ends the run, post-game-over no-ops, speed curve and cap, side alternation, reduced-motion speed, determinism (16 tests).
- [x] Play-through test (`src/play.test.ts`): drives real pointer events through the mounted game. Verifies trim, miss-to-game-over, run number via `levelComplete`, and persisted best/run counter.
- [x] ESLint (no fetch / localStorage / Capacitor in games), Prettier, and `tsc` pass.

## Accessibility (NFR-4)

- [x] Touch targets are at least 44 px high (buttons 44-52 px; Restart and Play again are 96x44 / 180x52; the whole screen is the drop target).
- [x] Colour is never the only cue: Okabe-Ito palette plus a glyph or number on every piece.
- [x] Text on pieces picks ink or white by contrast against the piece colour.
- [x] `ctx.prefersReducedMotion` honoured: slide speed is 55 percent, debris animation skipped, camera snaps.
- [x] Layout is computed from `ctx.viewport` each frame and on `onResize`; sized for 320x568
  up to tablets (board capped, centred) and respects `safeArea` insets.
- [ ] Screen-reader semantics: the game is canvas-only; no text alternative beyond on-screen
  text yet. Tracked as a known gap, to be reviewed in device testing.

## Device checklist

- [ ] Pending device testing (Roadmap P4): low-end Android, recent iPhone, tablet, offline
  launch, backgrounding mid-play, rotation, 60 fps feel, touch comfort.
