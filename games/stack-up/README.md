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
  animation is skipped, and the camera snaps instead of easing.

## Inspiration

The generic one-tap block-stacking timing format common in mobile ads. Only the genre idea
is used; the name, look, and audio are our own (see `ORIGINALITY.md`).

## Controls

- Tap anywhere (or click) to drop the block.
- Restart button (top right, 44 px high) starts a fresh tower at any time.
- After a run ends, "Play again" appears (taps are ignored for 0.5 s so a frantic tap cannot skip the result).

## Persistence and analytics

- `ctx.storage` keys: `best` (best height) and `runs` (completed run counter).
- A run is not resumed after the app closes: it is a single-tap timing game and a frozen
  mid-slide state is meaningless; best score and run count persist.
- `ctx.events.levelComplete(n)` is called when a run ends, with `n` = the run number
  (1, 2, 3, ...), because the game is endless and has no levels.

## Level plan

Endless; difficulty is the speed curve and narrowing tower. No level data.
