# Pin Drop

Design note for the `pin-drop` game package. Part of the free tier (roadmap M2/M3).

## Mechanic

A tall board of chambers separated by brass pins. Pull a pin (tap it, or swipe along it) and whatever rests on it falls, tick by tick, under a fixed gravity rule: balls fall one cell per tick, slides push sideways, and walls, unpulled pins, closed gates and other balls block. The goal is to get every ball into its cup. The model is a deterministic grid (`src/logic.ts`, pure and tested), with no physics engine; `src/index.ts` only animates it.

Rules (see the header of `logic.ts`):

- A ball that enters a cup is collected. A rock that enters a cup loses.
- A rock touching a ball (orthogonally, after any tick) destroys it and loses.
- Running out of pins with balls still on the board loses.
- **Lava** burns any ball that enters it (lose), but a rock that falls in cools it for good (the rock is used up and the cell becomes empty space).
- **Gates** (`G`) block like walls until any ball enters a **sensor pad** (`s`); then they stay open.
- **Coloured cups** (`A` `B`) only take balls of their own colour class (`a` `b`); a ball in the wrong cup loses. Colour classes also carry a glyph (circle, triangle, square) so colour is never the only cue.

## Inspiration (genre / ad format only)

The generic "pull the pin to release things" puzzle format seen in mobile ads. Only the idea of ordering pin pulls is used; the hopper/slide/cup design, the rock, lava, gate and coloured-cup rules, and all visuals are our own.

## Levels and worlds (50)

| World | Levels | New element (intro banner on its first level) |
|---|---|---|
| The Workshop | 1-10 | Pins, slides, cup (L1); several pins and an order (L2); grey rocks (L6) |
| Lava Lab | 11-20 | Lava that must be cooled by a rock (L11) |
| Trapdoors | 21-30 | Gates opened by a sensor pad (L21) |
| Rainbow Cups | 31-40 | Two coloured cups (L31) |
| The Grand Machine | 41-50 | Combinations: coloured cups with lava or gates, up to 4 tiers (L41) |

Levels come from a seeded generator over a "tiered hopper" family (`src/generator.ts`, an offline tool). The committed data (`src/levelData.ts`) records each level's plan (including the seed) and its par. `logic.test.ts` re-generates every level from its plan, solves it by breadth-first search over pin orders, checks that the par equals the shortest solution, that no level starts lost, that the right mechanic appears in each world, and that every level from World 1's rock levels on has losing orders as well as winning ones.

## Stars

Par is the fewest pins in any winning order (from the solver). The HUD shows `Pins <pulled> · par <n> · Cup <in>/<total>`.

- 3 stars: at most par pins and at most one do-over (undo, restart or a lost try).
- 2 stars: at most one pin over par with no do-overs, or a few do-overs (penalty = 2 x extra pins + do-overs, 2 stars up to 4).
- 1 star: any win.

Because some levels have optional or decoy pins, pulling pins you do not need costs stars. Progress is saved by the kit under `progress` (`currentLevel`, `bestLevel`, `stars[]`).

## Controls

Tap a pin, or put a finger on it and swipe (14 px) to pull it. The hit area is the whole rod, the ring handle and a band of at least 44 px around it; the nearest pin wins. Tapping during an animation fast-forwards it (4x). HUD (kit): Back, level map, hint (highlights the next pin of a shortest solution from the current position), Undo, Restart.

## Look and feel

Dark slate workshop: bevelled stone walls, pale-blue ramps with chevrons, brass rods with ring handles (idle sway and shine), glossy glyph balls with soft shadows, angular grey rocks marked with an X, a glass cup that visibly fills and shows `n/need`, animated lava with hazard hatching, amber/violet gates and pads with different shapes.

Juice: the pin recoils then whooshes out and fades; balls fall with eased motion and a slight stretch, squash and hop on landing with a plink whose pitch depends on the column (rocks thud lower with dust); each ball into the cup splashes colour particles, pulses the cup, floats `3/5` and plays a rising-pitch chime; the last ball adds a star burst and the kit confetti; rocks touching balls give a dust puff, ring, shake and a low bump; lava gives sparks, rocks cooling give steam and a hiss; gates unlock with sparks. Reduced motion skips all tweens (results are applied instantly, sounds still play).

## Implementation notes

- Files: `src/logic.ts` (model, solver, analyzer), `src/generator.ts` (offline level generator), `src/levelData.ts` (committed levels), `src/levels.ts` (worlds, intros, par), `src/index.ts` (controller: drawing, input, effects) built on `createLevelGame` from `@itg/game-sdk`.
- Tests: `logic.test.ts` (rules, solver, level checks), `play.test.ts` (play-through by pointer events, swipe, resume), `index.test.ts` (SDK conformance).
- Sounds are requested through `env.audio` only; haptics through `env.haptics`.
