# Ring Sort

Design note for the `ring-sort` game package. Part of the free tier (roadmap M2/M3), so it is
many players' first impression: it is built on the shared level shell (`createLevelGame`) and
has 60 solver-verified levels in six worlds.

## Mechanic

Pegs hold stacks of glossy colored rings. Tap a peg to lift its top run of same-colored rings
(they hop up and hover), then tap another peg to drop them there, or drag the run to a peg. A
drop is legal when the target is empty or its top ring has the same color, and has room (each
peg has its own capacity, 2 to 5 rings). If the run is longer than the free space, as many rings
as fit are moved and the rest settle back. A peg is complete when it holds every ring of one
color (it gets a gold star and a sparkle burst); the level is solved when every peg is empty or
complete. If no legal move exists the level is lost (Undo or Restart).

## Inspiration (genre / ad format only)

The generic 'sort the colors into tubes' puzzle format that is common in mobile ads (a
water-sort / ball-sort family). Only the abstract rule of stacking and sorting is used. The look
(chunky donut rings on wooden pegs, glyphs, locks, ribbons of stars) and all twists are our own.

## Worlds and mechanics

| World | Levels | What it adds |
|---|---|---|
| Sunny Meadow | 1-10 | The basics: 2 to 5 colors, 3 to 4 rings, two spare pegs. Gentle (par 4 to 18). |
| Copper Hills | 11-20 | Pegs of different heights (own capacity), up to 7 colors. Intro banner on level 11. |
| Mystery Mine | 21-30 | Hidden rings shown as "?" until they become the top ring. Intro banner on level 21. |
| Locksmith Row | 31-40 | A locked peg that opens permanently when a given color is complete (the lock shows that color and glyph). Up to two locks. Intro banner on level 31. |
| Crystal Falls | 41-50 | Hidden rings, locks and uneven heights combined. Intro banner on level 41. |
| Grand Hall | 51-60 | Tight space (one spare peg), 6 to 7 colors, every twist. Intro banner on level 51. |

Hidden rings never take part in a lifted run. A peg that becomes uniform shows all its rings.

## Stars, par and hint

Par is the length of a shortest solution found by the offline solver. All 60 levels were solved
to proven optimality (A* with an admissible heuristic that finished its search), recorded as
`proven: true` in `src/level-data.ts`. 3 stars: moves <= par + max(1, floor(par*0.25)) (plus 2 on
levels with hidden rings, because the solver sees them); 2 stars: moves <= par + max(3,
floor(par*0.75)) (same hidden bonus); otherwise 1 star. The HUD second line shows
"Moves n · ★★★ ≤ target". Hint runs the same solver (weighted A*, capped) from the current
position and pulses an arrow over the source peg, then the target peg; if the position is a
dead end it says so and suggests Undo.

## Levels and how they are verified

Levels are committed data (`src/level-data.ts`), generated offline by
`tools/generate-levels.ts` (run `node tools/build-and-run.mjs`; it bundles the tool with the
repo's esbuild and rewrites the data file). The plan per level is in `tools/specs.ts`; the
generator tries seeded shuffles until the solver finds a solution in the level's par band.
Nothing is generated at runtime. `src/levels.test.ts` replays every stored solution (must reach
solved in exactly par moves), re-runs the optimal solver on the first 30 levels, and checks
shape limits, the mechanic introduction order and the easy start.

## Controls

Tap peg to lift, tap another to drop, tap the same peg to put back. Or press a peg and drag the
run onto a peg (the target peg glows green when legal, red when not). Whole peg columns are the
touch targets (at least 65 px wide at 390 px, 10 pegs). HUD: Back, level map, Hint, Undo,
Restart.

## Juice

Springy lift with bob, rings fly in an arc with a staggered cascade and land with a squash and a
click (pitch rises per ring), complete pegs get a gold star, burst and sound (`success`, then
`combo` with rising pitch for consecutive completing moves, with "Combo xN!" text), hidden rings
flip over when uncovered, locks pop off with sparkles, invalid taps wobble the peg with a bump
sound, shake and floating hint text. Reduced motion skips flights, bobs and shake.

## Implementation notes

- Files: `src/logic.ts` (pure model with hidden rings, locks, per-peg capacity, weighted A*
  solver), `src/levels.ts` (level decoding, worlds, intros, stars), `src/level-data.ts`
  (generated), `src/index.ts` (rendering, input, juice), `src/rng.ts` (seeded PRNG for tools),
  `tools/` (offline generator).
- Progress is handled by the shell: `{currentLevel, bestLevel, stars[]}` under `progress`.
- Sounds only through `env.audio.play`; haptics through `env.haptics`.
