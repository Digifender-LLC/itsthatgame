# Merge Drop QA checklist (TDD §8)

Run from the repo root: `pnpm --filter @itg/game-merge-drop typecheck`, `... test`,
`pnpm exec eslint games/merge-drop`, `pnpm exec prettier --check games/merge-drop`.

## Automated

- [x] SDK conformance suite (`src/index.test.ts`, FR-GAME-1): lifecycle, repeated pause/resume,
  resize, no leaked animation frames / timers / listeners / DOM after `destroy()`, scoped
  storage only, no network.
- [x] Logic tests (`src/logic.test.ts`): merge, chain multiplier, group of three, gravity, overflow game over (and not over when a merge frees space), spawn pool, seeded RNG, determinism, JSON round-trip resume, malformed snapshot rejection, random-play invariants plus goal ladder, danger rating and merge prediction (21 tests).
- [x] Controller tests (`src/play.test.ts`): start touch does not drop; tap and drag-aim drops; animated board and score match the logic model after every drop; one buffered drop; game over then reset; unlock sound and HUD on a new highest tile; every tile tier, danger and banner draw without error; pointer events through the mounted run shell.
- [x] Feature rows: drag-to-aim with ghost and merge hint, accelerating fall + landing squash, slide-and-pop merges with particles and floating score, rising chain pitch, danger stripes and pulse, goal ladder celebration (`play.test.ts`, screenshots at 390x844).
- [x] ESLint (no fetch / localStorage / Capacitor in games), Prettier, and `tsc` pass.

## Accessibility (NFR-4)

- [x] Touch targets are at least 44 px high (buttons 44-52 px; columns are at least 59 px wide at 320 px; Restart 92x44).
- [x] Colour is never the only cue: Okabe-Ito palette plus a glyph or number on every piece.
- [x] Text on pieces picks ink or white by contrast against the piece colour.
- [x] `ctx.prefersReducedMotion` honoured: animations run about 2x faster, no danger pulse or shake, fewer particles (shell).
- [x] Layout is computed from `ctx.viewport` each frame and on `onResize`; sized for 320x568
  up to tablets (board capped, centred) and respects `safeArea` insets.
- [ ] Screen-reader semantics: the game is canvas-only; no text alternative beyond on-screen
  text yet. Tracked as a known gap, to be reviewed in device testing.

## Device checklist

- [ ] Pending device testing (Roadmap P4): low-end Android, recent iPhone, tablet, offline
  launch, backgrounding mid-play, rotation, 60 fps feel, touch comfort.
