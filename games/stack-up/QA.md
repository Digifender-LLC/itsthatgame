# Stack Up QA checklist (TDD §8)

Run from the repo root: `pnpm --filter @itg/game-stack-up typecheck`, `... test`,
`pnpm exec eslint games/stack-up`, `pnpm exec prettier --check games/stack-up`.

## Automated

- [x] SDK conformance suite (`src/index.test.ts`, FR-GAME-1): lifecycle, repeated pause/resume,
  resize, no leaked animation frames / timers / listeners / DOM after `destroy()`, scoped
  storage only, no network.
- [x] Logic tests (`src/logic.test.ts`): block slide and wall bounce, trim left/right, perfect snap and streak growth, miss ends the run, post-game-over no-ops, speed curve and cap, side alternation, reduced-motion speed, determinism, plus milestone, pentatonic pitch (within the host's 3x clamp), sky progress and hue helpers.
- [x] Play-through tests (`src/play.test.ts`): real pointer events through the mounted game on the run shell. Verify the first touch starts the run without a drop sound, a run drops blocks until a miss ends it ("fail" sound), persisted `{ best, runs }`, and that a double tap lands only one block.
- [x] Screenshots at 390x844 reviewed (ready screen, mid-tower, dusk, night, milestone banner, perfect text, halo, ripple).
- [x] ESLint (no fetch / localStorage / Capacitor in games), Prettier, and `tsc` pass.

## Feel and visuals

- [x] Isometric-looking slabs with per-floor glyph, hue shift, landing squash, trimmed overhang falls with rotation and thud.
- [x] Perfect streak: pentatonic pitch climb, ring ripple, "Perfect xN", regrow flash and halo.
- [x] Sky day to dusk to night with stars and clouds; smooth camera; zoom-out on game over.
- [x] Milestone every 10 floors: floor line, banner, confetti, chime.
- [x] First touch on the ready screen does not drop a block; double taps are debounced.

## Accessibility (NFR-4)

- [x] Touch targets are at least 44 px high (shell HUD buttons are 46x44 and the shell's Play again is 54 px high; the whole play area is the drop target).
- [x] Colour is never the only cue: a glyph on every slab (the hue shifts continuously, so it is decoration, not a cue).
- [x] Text on pieces picks ink or white by contrast against the piece colour.
- [x] `ctx.prefersReducedMotion` honoured: slide speed is 55 percent, debris animation skipped, camera, zoom and sky snap, particles are thinned and shake is off (kit).
- [x] Layout is computed from `ctx.viewport` each frame and on `onResize`; sized for 320x568
  up to tablets (board capped, centred); drawing stays inside the shell's play area below the HUD.
- [ ] Screen-reader semantics: the game is canvas-only; no text alternative beyond on-screen
  text yet. Tracked as a known gap, to be reviewed in device testing.

## Device checklist

- [ ] Pending device testing (Roadmap P4): low-end Android, recent iPhone, tablet, offline
  launch, backgrounding mid-play, rotation, 60 fps feel, touch comfort.
