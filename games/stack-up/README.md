# Stack Up

Roadmap M3 premium game. Slug `stack-up`.

## Mechanic

A block slides back and forth above a tower. Tap anywhere to drop it. Only the part that
lands on the block below stays; the overhang is trimmed off, so the tower narrows with every
sloppy drop. A drop within about 1 unit of perfect snaps into place and keeps the full
width; three perfect drops in a row grow the block back by 2 units (never beyond the start
width). The run ends when a block misses the tower entirely. Score = tower height (blocks
placed above the base).

- Speed rises gradually: 38 units/s plus 1.3 per block, capped at 100 (`speedAt` in `logic.ts`).
- The entry side alternates every block so the rhythm never goes stale.
- The simulation (`src/logic.ts`) is pure and has no randomness: identical `step(dt)` and
  `drop()` sequences give identical results.
- Reduced motion (`ctx.prefersReducedMotion`): the slide runs at 55 percent speed, debris
  animation is skipped, and the camera and sky snap instead of easing.

## Inspiration

The generic one-tap block-stacking timing format common in mobile ads. Only the genre idea
is used; the name, look, and audio are our own (see `ORIGINALITY.md`).

## Look and feel

Built on the shared run shell (`createRunGame` in `@itg/game-sdk`): ready screen, score HUD,
best score, game-over card and NEW BEST celebration come from the kit; `src/index.ts` is only
the controller (rendering, input, feedback).

- Slabs are drawn procedurally as isometric-looking blocks: lighter top face, mid front face,
  darker right face, a highlight edge, and a glyph per floor (colour is never the only cue).
  Hue shifts gradually with every floor (`hueAt`).
- Sky moves from day (with drifting clouds) through dusk to night with twinkling stars as the
  tower rises (`skyProgress`, 20 floors per stage). The camera eases after the tower; on game
  over it zooms out to show the whole tower.
- A faint guide column above the top slab shows where to land. While the streak is one drop
  from regrowth (2 perfects), the moving slab gets a pulsing gold halo.
- Perfect drop: a note that climbs a pentatonic scale with the streak (`perfectPitch`), a ring
  ripple along the top face, sparks (stars from streak 3), floating "Perfect xN" text, and a
  bright flash when the slab regrows ("wider!").
- Trimmed overhang tumbles off with rotation, a dull thud (`drop` + low `bump`), dust and a
  small shake. A landing squash plays on every placed slab.
- Progress markers: dashed floor lines every 10 floors (the next goal is always visible), and
  reaching a multiple of 10 shows a "FLOOR n" banner, confetti and a chime. The HUD line shows
  the streak and the next milestone.
- The first touch on the ready screen only starts the run (it never drops a block). Drops
  closer together than 90 ms, or within 160 ms of the start, are ignored so a double tap can
  not cost a block.

## Controls

- Tap anywhere (or click) to drop the block.
- Shell HUD: back button (top left) and restart (top right, 46x44) start a fresh tower at any time.
- After a run ends the shell's game-over card appears; its "Play again" button ignores taps for 0.4 s so a frantic tap cannot skip the result.

## Persistence and analytics

- Saved by the shell under storage key `progress`: `{ best, runs }` (best height and completed
  run counter). A run is not resumed after the app closes: it is a single-tap timing game and
  a frozen mid-slide state is meaningless.
- The kit's run shell does not report `ctx.events.levelComplete`; the previous per-run
  analytics call was dropped with the migration (proposal: let `createRunGame` report the run
  number, as this game did before).

## Level plan

Endless; difficulty is the speed curve and narrowing tower, with a milestone every 10 floors.
No level data.
