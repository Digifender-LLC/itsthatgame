# Tile Trio

Design note for the `tile-trio` game package. Part of the free tier (roadmap M2/M3).

## Mechanic

A board of layered tiles, each showing a symbol. A tile is free when no tile on a higher layer overlaps it. Tap a free tile to send it to the 7-slot tray, which keeps equal symbols together; three equal symbols clear. You lose if the tray is full after a move (no clear), and win when the board and tray are empty.

## Inspiration (genre / ad format only)

The generic 'match three from a pile into a tray' format seen in mobile ads and 'tile-matching' games. Only the abstract rules are used; the symbols, tile look and layouts are our own.

## Level plan

24 levels from a seeded generator (src/levels.ts): 9 tiles on one layer up to 105 tiles on five layers, 3 to 9 symbols, and a rising number of triples left open at once. Solvable by construction: symbols are dealt in triples along a legal removal order (a witness) that never needs more than 6 tray slots. src/logic.test.ts replays the witness and also runs an independent DFS solver on every level.

Progress is stored through `ctx.storage` as `{currentLevel, bestLevel}` (1-based) under the key `progress`, and the game resumes at `currentLevel` on mount. Finishing a level calls `ctx.events.levelComplete(n)`.

## Controls

Tap a free tile. Dimmed tiles are covered. HUD: Back, Undo, Restart.

## Look and feel

Warm cream background, ivory tiles with a thick bottom edge, nine symbols drawn as distinct shapes (disc, triangle, square, diamond, star, plus, hexagon, ring, bolt) in the colorblind-safe palette with dark outlines, dark plum tray.

Animation: Tile flies to the tray (150 ms), skipped when prefersReducedMotion is set.

## Implementation notes

- Files: src/logic.ts (model, solver), src/levels.ts (generator + plan), src/index.ts (rendering, input), src/shell.ts (shared HUD/lifecycle).
- `src/logic.ts` is pure TypeScript with no DOM access; `src/index.ts` draws with plain Canvas 2D through the SDK helpers.
- `src/shell.ts` is a copy of the same small shell in the other free games (lifecycle, HUD, overlay, progress). It is duplicated on purpose because games import only from `@itg/game-sdk`.
- Sounds are requested only through `ctx.audio.play` (`tap`, `move`, `pop`, `success`, `fail`, `win`); haptics through `ctx.haptics`.
- Touch targets: HUD buttons are 44 px high; board targets are described under Controls.
