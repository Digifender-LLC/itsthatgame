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

- Touch or move over the board to aim a column (it highlights and the current tile follows),
  release to drop. A plain tap on a column drops there. Restart is a 92x44 button.
- Banner shows points and chain length after a merge.

## Persistence and analytics

- `ctx.storage` keys: `best`, `runs` (run counter used as the seed source), `game` (the
  full game snapshot, saved after every drop and removed when the run ends). The game
  resumes the unfinished run on relaunch.
- `ctx.events.levelComplete(n)` is called when a run ends, with `n` = the run number.

## Level plan

Endless; difficulty comes from the larger tiles that start to spawn as the board develops.
