# Ring Sort

Design note for the `ring-sort` game package. Part of the free tier (roadmap M2/M3).

## Mechanic

Pegs hold stacks of colored rings. Tap a peg to lift its top run of same-colored rings, then tap another peg to drop them there. A drop is legal when the target is empty or its top ring has the same color, and has room (capacity 3 to 5 rings). If the run is longer than the free space, as many rings as fit are moved. A level is solved when every peg is empty or holds a single color and no color is split over two pegs. If no legal move exists the level is lost (Undo or Restart).

## Inspiration (genre / ad format only)

The generic 'sort the colors into tubes' puzzle format that is common in mobile ads (a water-sort / ball-sort family). Only the abstract rule of stacking and sorting is used. Our look is rings on wooden-style pegs on a dark slate board, with a glyph on each ring.

## Level plan

24 levels from a seeded generator (src/levels.ts). Difficulty rises through colors (3 to 7), ring capacity (3 to 5) and fewer spare empty pegs (2 down to 1). Every level's seed was chosen so that the solver in src/logic.ts finds a solution; src/logic.test.ts re-solves all 24.

Progress is stored through `ctx.storage` as `{currentLevel, bestLevel}` (1-based) under the key `progress`, and the game resumes at `currentLevel` on mount. Finishing a level calls `ctx.events.levelComplete(n)`.

## Controls

Tap peg to lift, tap another peg to drop, tap the same peg to cancel. HUD: Back, Undo, Restart. After a win, Next level.

## Look and feel

Dark slate-teal background, cream/yellow accents, wide pill-shaped rings with a dark hole and two glyphs (circle, triangle, square, diamond, star, cross, pentagon) per ring so color is never the only cue. Pegs are grey metal rods; the lifted run gets a white outline.

Animation: Ring hop between pegs (220 ms), skipped when prefersReducedMotion is set.

## Implementation notes

- Files: src/logic.ts (model, solver), src/levels.ts (generator + plan), src/index.ts (rendering, input), src/shell.ts (shared HUD/lifecycle).
- `src/logic.ts` is pure TypeScript with no DOM access; `src/index.ts` draws with plain Canvas 2D through the SDK helpers.
- `src/shell.ts` is a copy of the same small shell in the other free games (lifecycle, HUD, overlay, progress). It is duplicated on purpose because games import only from `@itg/game-sdk`.
- Sounds are requested only through `ctx.audio.play` (`tap`, `move`, `pop`, `success`, `fail`, `win`); haptics through `ctx.haptics`.
- Touch targets: HUD buttons are 44 px high; board targets are described under Controls.
