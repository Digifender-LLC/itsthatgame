# Pin Drop

Design note for the `pin-drop` game package. Part of the free tier (roadmap M2/M3).

## Mechanic

A grid of chambers separated by removable pins. Tap a pin to pull it; the contents then fall, tick by tick, under a fixed gravity rule (balls fall one cell per tick; slide cells push sideways; walls, unpulled pins and other balls block). Colored balls must end up in the goal cup. Grey rocks must stay out: a rock that reaches the cup loses, and a rock that touches (is orthogonally adjacent to) a colored ball destroys it and loses. Running out of pins with colored balls still on the board also loses. The model is a deterministic grid, with no physics engine.

## Inspiration (genre / ad format only)

The generic 'pull the pin to release things' puzzle format seen in mobile ads. Only the idea of ordering pin pulls is used; the hopper/slide/cup design, the rock rule and all visuals are our own.

## Level plan

24 levels from a seeded 'tiered hopper' generator (src/levels.ts): levels 1 to 8 have two tiers (3 pins), levels 9 to 24 have three tiers (5 pins). The verified seed is recorded per level. An exhaustive analyzer rates each level (fraction of winning pin orders, fewest pulls). Levels 1 and 3 are intentionally forgiving (every order wins) and serve as the tutorial; every later level has losing orders. logic.test.ts re-solves all levels.

Progress is stored through `ctx.storage` as `{currentLevel, bestLevel}` (1-based) under the key `progress`, and the game resumes at `currentLevel` on mount. Finishing a level calls `ctx.events.levelComplete(n)`.

## Controls

Tap a pin (the hit area is larger than the drawn pin, at least 30 px). HUD: Back, Undo, Restart.

## Look and feel

Light paper board with slate walls, pale-blue slides with chevron arrows, yellow ring-handle pins, a green bucket-shaped cup, colored glyph balls, and angular grey rocks marked with an X.

Animation: Short per-tick tween (90 ms per tick) of falling balls, pin fade, cup shrink and crush ring; skipped when prefersReducedMotion is set.

## Implementation notes

- Files: src/logic.ts (model, solver, analyzer), src/levels.ts (generator + plan), src/index.ts (rendering, input), src/shell.ts (shared HUD/lifecycle).
- `src/logic.ts` is pure TypeScript with no DOM access; `src/index.ts` draws with plain Canvas 2D through the SDK helpers.
- `src/shell.ts` is a copy of the same small shell in the other free games (lifecycle, HUD, overlay, progress). It is duplicated on purpose because games import only from `@itg/game-sdk`.
- Sounds are requested only through `ctx.audio.play` (`tap`, `move`, `pop`, `success`, `fail`, `win`); haptics through `ctx.haptics`.
- Touch targets: HUD buttons are 44 px high; board targets are described under Controls.
