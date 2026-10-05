# Paint Path (`paint-path`)

Premium one-stroke painting puzzle for ItsThatGame (roadmap M3). Implements `FR-GAME-1`,
`FR-GAME-2` against the game contract in `docs/design/LLD.md` §1. Built on the shared level
shell (`createLevelGame`): HUD, level map with worlds and stars, win card, stuck card, saves.

## Mechanic

Drag a wet brush from the star so every open tile is painted exactly once in a single
stroke. Drag back over the trail (or tap a painted tile, or press Undo) to rewind.
Diagonal-ish finger motion resolves to the nearer orthogonal neighbour, and fast drags fill
straight-line runs. If the brush is boxed in, or a tile can no longer be reached, the stuck
card appears (Undo or Restart).

Twists (each introduced by a banner on the level where it first appears):

- **Walls** (level 6): dark hatched blocks that cannot be painted.
- **Bend tiles** (level 11, elbow arrow): after entering one you must turn a corner.
- **Crossings** (level 21, cross with two pips): painted twice, once across and once up or
  down, always straight through. The pips show how many passes are done.
- **Portals** (level 31, numbered rings): stepping on one carries the brush to its twin; both
  tiles are painted and the next step starts from the twin.

## Level plan

60 levels in 6 worlds of 10 (map rows of 5): Sunrise (1-10, plain, walls from 6), Bends
(11-20), Crossings (21-30), Portals (31-40), Mixer (41-50, all twists together), Masterpiece
(51-60, up to 7x9 with three portals and three crossings). Grids grow from 3x3 to 7x9 (never
more than 7 columns, so tiles stay at least 44 px on a 360 px phone).

Levels are committed data in `src/levelData.ts`, produced offline by the seeded generator
`src/generator.ts` (carve a walk that may cross itself straight through bridges; portals cut
a short stretch out of the walk; bends are placed where the solution really turns) and
checked by tests. The committed file must equal the generator's output
(`src/generate.test.ts`); regenerate with
`PAINT_PATH_GEN=1 pnpm --filter @itg/game-paint-path exec vitest run src/generate.test.ts`.

## Stars and hints

3 stars = clean solve. The Undo button costs 1, a hint costs 2: total 0 gives 3 stars, 1-3
gives 2, more gives 1 (rewinding by dragging back is free). `hudInfo()` shows tiles painted,
the stars currently on offer, and hints/undos used. A hint shows the next 3 tiles of a valid
solution as numbered discs; if the player has wandered off every solution, it searches from
the current position (bounded) or rewinds to the last shared tile.

## Structure

- `src/logic.ts`: pure rules (`Board`: moves, rewind, twists, stuck check, DFS solver, hints,
  independent `verifyPath`).
- `src/levelData.ts`, `src/levels.ts`: level data, worlds, palettes, intro banners.
- `src/generator.ts`: offline generator (not used at runtime).
- `src/index.ts`: rendering, touch resolution, juice and sound.

## Feel

The trail is a thick rounded stroke whose colour runs through the world's palette along the
whole path, with a dark rim and a wet highlight. New tiles pop and shed droplets and play a
pentatonic note that climbs as the path grows; retracting shrinks the stroke smoothly with a
low whoosh; blocked moves shake the board with a bump. Completing a level sends a shimmer
with rising notes along the path before the win card. Reduced motion shortens or skips these.
