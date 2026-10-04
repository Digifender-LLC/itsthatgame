# Untangle (`untangle`)

Premium graph puzzle for ItsThatGame (roadmap M3). Implements `FR-GAME-1`, `FR-GAME-2`
against the game contract in `docs/design/LLD.md` §1.

## Mechanic

Nodes are joined by lines. Drag nodes around the board until no two lines cross. Crossing
lines are drawn dashed in vermillion with a diamond marker at each intersection, and a live
"Crossings: N" counter is shown (color is never the only cue). The level is complete when
the count reaches 0. Undo reverts the last drag; Restart restores the scrambled start.

## Inspiration

The genre/ad format "untangle the knot" and the classic planar-graph drawing puzzle. Only the
general mechanic is used; art, naming, UI and look are original (see `ORIGINALITY.md`).

## Level plan

24 levels with node counts rising from 5 to 22 (about 1.2 to 1.55 edges per node). For each
level (`src/levels.ts`, seeded PRNG): scatter nodes, add edges shortest-first only while
they cross nothing (a maximal planar layout), keep a spanning tree plus extra edges, record
the crossing-free layout as the solution, then deterministically scramble node positions to
a start layout that has crossings. Positions are normalized to 0..1, so the board scales to
any viewport. Tests assert the stored solution has 0 crossings and every start has more
than 0.

Edge crossing (`src/logic.ts`) uses orientation tests with an epsilon; edges sharing an
endpoint never cross there (they only count if they overlap along a line), and a node lying
on another edge counts as a crossing.

## Structure

- `src/logic.ts`: geometry, state, move/undo/restart, win detection.
- `src/levels.ts`: seeded level generation.
- `src/index.ts`: canvas rendering, pointer input, HUD, overlay, persistence.

Progress (`{ currentLevel, bestLevel }`) is stored through `ctx.storage` under `progress`;
`ctx.events.levelComplete(n)` fires once per completed level.
