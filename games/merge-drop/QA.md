# Merge Drop QA checklist (TDD §8)

Run from the repo root: `pnpm --filter @itg/game-merge-drop typecheck`, `... test`,
`pnpm exec eslint games/merge-drop`, `pnpm exec prettier --check games/merge-drop`.

## Automated

- [x] SDK conformance suite (`src/index.test.ts`, FR-GAME-1): lifecycle, repeated pause/resume,
  resize, no leaked animation frames / timers / listeners / DOM after `destroy()`, scoped
  storage only, no network.
- [x] Logic tests (`src/logic.test.ts`): merge, chain multiplier, group of three, gravity, overflow game over (and not over when a merge frees space), spawn pool, seeded RNG, determinism, JSON round-trip resume, malformed snapshot rejection, random-play invariants (18 tests).
- [x] Play-through test (`src/play.test.ts`): drives real pointer events through the mounted game. Verifies column taps, per-drop saving, and that a relaunch resumes the run and ends in exactly the state the logic produces for the same seed.
- [x] ESLint (no fetch / localStorage / Capacitor in games), Prettier, and `tsc` pass.

## Accessibility (NFR-4)

- [x] Touch targets are at least 44 px high (buttons 44-52 px; columns are at least 59 px wide at 320 px; Restart 92x44).
- [x] Colour is never the only cue: Okabe-Ito palette plus a glyph or number on every piece.
- [x] Text on pieces picks ink or white by contrast against the piece colour.
- [x] `ctx.prefersReducedMotion` honoured: no tile fall animation exists; chain feedback is a text banner.
- [x] Layout is computed from `ctx.viewport` each frame and on `onResize`; sized for 320x568
  up to tablets (board capped, centred) and respects `safeArea` insets.
- [ ] Screen-reader semantics: the game is canvas-only; no text alternative beyond on-screen
  text yet. Tracked as a known gap, to be reviewed in device testing.

## Device checklist

- [ ] Pending device testing (Roadmap P4): low-end Android, recent iPhone, tablet, offline
  launch, backgrounding mid-play, rotation, 60 fps feel, touch comfort.
