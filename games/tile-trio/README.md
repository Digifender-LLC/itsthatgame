# Tile Trio

Design note for the `tile-trio` game package. Part of the free tier (roadmap M2/M3). Built on the shared level shell (`createLevelGame` in `@itg/game-sdk`): HUD, level map, win/stuck cards, stars and saves come from the kit.

## Mechanic

A board of layered tiles, each showing a symbol. A tile is free when no tile on a higher layer overlaps it (and it is not frozen). Tap a free tile and it flies to the 7-slot tray, which keeps equal symbols together; three equal symbols pop and clear. You lose if the tray is full after a move (no clear) or if nothing can be tapped; you win when the board and tray are empty.

## Inspiration (genre / ad format only)

The generic "match three from a pile into a tray" format seen in mobile ads and tile-matching games. Only the abstract rules are used; symbols, tile look, shapes and layouts are our own.

## Levels and worlds (50 levels)

| World | Levels | What it adds |
|---|---|---|
| Orchard | 1-10 | Plain boards (block, tri, twin shapes), 3 to 6 symbols, 9 to 48 tiles. |
| Gem Cave | 11-20 | Diamond, cross and ring shapes, 6 to 8 symbols, **frozen tiles** from level 11. |
| Foggy Woods | 21-30 | **Fog** from level 21; heart, bowtie shapes; 7 to 10 symbols. |
| Crystal Market | 31-40 | Fog and ice together, 5 layers, 10 to 11 symbols, up to 114 tiles. |
| Starlit Summit | 41-50 | All 12 symbols, up to 126 tiles, up to 8 frozen tiles. |

New mechanics, each introduced by an `intro()` banner on the level where it first appears: helpers (level 3), bonus helpers for chains (level 7), frozen tiles (level 11: a tile marked with a number cannot be taken until that many tiles have been taken in total; it thaws with a burst), fog (level 21: tiles buried under two or more tiles hide their symbol until uncovered). Board shapes (block, tri, twin, diamond, cross, ring, heart, bowtie) are listed in `src/levels.ts` (`PLANS`, one explicit row per level).

Solvable by construction: a level is a layered layout, a legal removal order that respects ice thaw counts, and symbols dealt along that order so the tray never holds more than `cap` tiles (4 for every level from 4 on). That order is a witness. `src/logic.test.ts` replays the witness (tray peak at most 4, so 3 stars are always reachable) and also runs the independent DFS solver on every level. All levels are seeded (`mulberry32`), no `Math.random`.

## Stars

The tray size is the score. Peak = the largest number of tiles the tray held after any move (undo never lowers it).

- 3 stars: peak at most 4 (the tray never showed its warning glow).
- 2 stars: peak 5.
- 1 star: peak 6 (the most you can survive).

The HUD second line shows "Peak n · ★★★ ≤4".

## Helpers (drawn inside the play area, below the tray)

Each level starts with one of each; a chain of 3 clears earns +1 (to the helper with the fewest charges, max 3).

- **Undo**: reverts the last move or helper (also the HUD undo button). Once the game is lost, undo is free.
- **Back 3**: returns the last 3 tiles taken that are still in the tray to their board spots.
- **Shuffle**: re-deals the symbols of the tiles left on the board (same multiset, tray untouched). The new deal follows a legal tap order from the current tray, so the level stays winnable (tested with the solver). The hint button uses the solver to point at a winning next tap.

Combo: a clear within 4 taps of the previous clear raises the combo (x2, x3 ...); sound pitch rises with it and a "Combo xN" chip shows the taps left.

## Controls

Tap a free tile (generous snap to the nearest free tile within 12 px). Covered, dimmed tiles shake and bump; frozen tiles say how many taps are left. Helper buttons are 48 px high.

## Look and feel

Navy-to-violet background with a faint world tint and drifting motes. Tiles are thick ivory cards (side edge, soft offset shadow, recessed plate) lifting slightly when free, with a gloss sweep. Twelve original symbols (cherries, lemon, pear, sapphire, star, carrot, hex gem, heart, bell, moon, flower, bolt) each with its own silhouette and colour. Tiles fly to the tray on an eased arc and squash on landing; the tray slides to make room; trios pop with particles and a floating "+1"; the tray glows amber at 5 and pulses red at 6. Reduced motion skips flights, shake and tile intro.

## Implementation notes

- Files: `src/logic.ts` (model, ordering and dealing, solver), `src/levels.ts` (shapes, plans, builder), `src/symbols.ts` (symbol art), `src/index.ts` (controller, drawing, input).
- `src/logic.ts` is pure TypeScript with no DOM access.
- Sounds only through `env.audio` (`move`, `drop`, `pop`, `combo`, `bump`, `whoosh`, `select`, `unlock`); haptics through `env.haptics`.
- Progress is the kit's `{ currentLevel, bestLevel, stars[] }` under the key `progress`; old saves load.
