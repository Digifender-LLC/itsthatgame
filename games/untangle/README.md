# Untangle (`untangle`)

Premium graph puzzle for ItsThatGame (roadmap M3). Implements `FR-GAME-1`, `FR-GAME-2`
against the game contract in `docs/design/LLD.md` §1. Built on the shared level shell
(`createLevelGame`): HUD, level map with stars and locks, win card, hint and undo buttons.

## Mechanic

Glowing beads sit on elastic threads. Drag beads until no two threads cross. Grabbing takes
the nearest bead within 44 px, scales it up and lifts it (its shadow grows); it floats about
34 px above the fingertip so the finger never covers it, and follows with a slight lag.
It drops with a soft spring bounce. Crossing threads turn coral and dashed with a pulsing
diamond-X marker, and a "Crossings N" readout is shown (color is never the only cue).
When a move removes crossings the markers pop with sparks and a rising note plays (pitch
climbs with consecutive reductions); adding crossings plays a low tone. At zero crossings a
wave of light runs across every thread, the beads pulse in sequence with rising notes, then
the win card appears. Undo slides the layout back; Restart restores the start.

## Stars and par

Each start layout is the stored solution with `par` movable units displaced (a unit is one
bead or one twin pair), each kept only if displacing it alone already causes a crossing. So
`par` drags (moving each displaced unit home) always solve the level; tests prove it. A drag
counts when it moves something more than 1.2 % of the board; undo refunds the drag.
3 stars: at most ceil(1.5 x par) drags. 2 stars: at most ceil(2.5 x par) + 1. Otherwise 1.
The HUD shows `Moves N · ★★★ ≤ limit` for the tier you are currently in.

## Hint

Highlights one bead (pulsing ring) and a dashed ghost target with an animated line. The target
is the best single drag found by searching a 10x14 grid of spots plus each unit's solution spot
(`bestRelocation` in `logic.ts`); if no single drag reduces crossings it points the most
displaced bead at its solution spot.

## Levels and worlds (60)

| World | Levels | Beads | New |
|---|---|---|---|
| Loose Threads | 1-10 | 5-8 | the basics |
| Knot Garden | 11-20 | 8-12 | bigger tangles |
| Pinned Down | 21-30 | 12-15 | pinned beads (steel screw heads) never move |
| Twin Beads | 31-40 | 15-19 | twins (gold ring + clasp on the thread) move as one, keeping their offset |
| Loom Hall | 41-50 | 19-22 | pins and twins together |
| The Grand Web | 51-60 | 22-26 | the biggest boards, up to 5 pins and 4 twins |

Par rises from 2 to 10 and thread density from about 1.25 to 1.65 per bead. Banners (`intro`)
appear at levels 1, 11, 21, 31, 41 and 51.

## Level data and solvability

`src/generate.ts` (seeded, pure) builds each level: scatter beads, add threads shortest-first
only while they cross nothing (so a crossing-free drawing exists), keep a spanning tree plus
extra threads, choose pins and twin pairs, then displace `par` units. Output is committed as
`src/levelData.ts` (positions rounded to 3 decimals, normalized 0..1); the game never runs the
generator. Tests (`logic.test.ts`) check, for all 60 levels: the stored solution has 0 crossings
and respects pins and twin offsets, the start has crossings, pins are identical in start and
solution, twin offsets are preserved, beads are well separated, and moving the displaced units
home takes exactly `par` drags. `generate.test.ts` fails if `levelData.ts` and the generator
disagree.

## Structure

- `src/logic.ts`: geometry, state, pins/twins, undo, stars, hint search.
- `src/generate.ts`, `src/levelData.ts`, `src/levels.ts`: level generation and committed data.
- `src/index.ts`: controller (rendering, touch, juice, win wave) handed to `createLevelGame`.
- `src/play.test.ts`: plays level 1 through pointer events to a 3-star win.
