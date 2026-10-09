# Merge Drop

Roadmap M3 premium game. Slug `merge-drop`.

## Mechanic

Five columns, seven tiles tall. Each turn you drop the current numbered tile (2, 4, 8, ...)
into a column; a preview shows the next one. Equal tiles that touch (up, down, left, right)
merge. The run ends when a column overflows.

Rules as implemented (`src/logic.ts`, all deterministic):

1. A dropped tile lands on top of the chosen column (a column may briefly hold an eighth
   tile while merges resolve).
2. Resolve loop, chain step k = 1, 2, 3, ...: scan rows bottom to top, columns left to
   right, for the first tile with an equal neighbour. Its whole connected group of equal
   tiles (4-neighbourhood) merges into one tile at the group's lowest, then leftmost, cell.
   With n tiles of value v the new value is `v * 2^(n-1)`. The other cells empty and tiles
   above fall. Score += new value x k. Repeat until nothing touches.
3. If any column still holds more than seven tiles, the run is over.
4. Spawn values: 2 and 4 at first; larger powers of two join as the board's biggest tile
   grows (max spawn = biggest tile / 8, between 4 and 64), smaller values more likely.

Randomness is a seeded 32-bit generator whose state is part of the game state; there is no
`Math.random`. The seed for run N is `seedFromRun(N)` where N comes from a counter stored in
`ctx.storage`, so any run can be reproduced from its run number and column choices.

## Inspiration

The generic drop-and-merge numbered-tile format common in mobile ads. Only the genre idea is
used; the merge rules, name, look, and audio are our own (see `ORIGINALITY.md`).

## Controls

- Press anywhere in the play area and drag horizontally to aim: the held tile glides over the
  column, the column highlights, a ghost tile shows where it will land (dashed outline when it
  will merge). Release to drop. A plain tap on a column drops there. The touch that starts a
  run only starts it. One drop made during an animation is buffered and runs when it ends.
- The shell supplies the HUD (back, restart), score pop, best score and game-over card.

## Feel

Tiles fall with acceleration and land with a squash; merges slide the group into the merge
cell, the result pops with an elastic scale, with star particles in the tile colour, a floating
"+64" and "Chain x3!"; the merge sound's pitch rises with each chain step. Tiles have their own
colour per value plus a glyph (small values) and growing decoration: ring (16+), corner gems
(64+), double ring and sparkle (256+), gold rim and crown (1024+). Columns two rows from the
top show moving danger stripes, and pulse red with a bar when one tile from overflow.

## Progress inside and across runs

- Goal ladder 32, 64, 128 ... 16384 (`GOALS` in `src/logic.ts`): the top bar shows a window of
  five goals with a progress bar to the next one, and the HUD line reads `Top 16 -> 32`.
  Each new highest tile on the ladder plays the unlock sound, bursts stars and shows a banner;
  128 and above add confetti, a heavier haptic and the star sound.
- Difficulty ramp: the spawn pool grows with the biggest tile (see rule 4), so runs get
  tenser as they go. Best score and run count are saved by the shell (`progress`).

## Persistence and analytics

- The shell saves `{ best, runs }` under the `progress` key. A run is not resumed after the
  app closes (the old `game` snapshot is gone with the private shell). Seeds vary per run.

## Level plan

Endless, with the goal ladder as milestones.
