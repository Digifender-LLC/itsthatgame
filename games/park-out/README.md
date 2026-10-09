# Park Out

Roadmap M3 premium game. Slug `park-out`. Built on the shared level shell
(`createLevelGame` from `@itg/game-sdk`): HUD, level map with stars and world headers,
animated win card, hint button, undo and restart come from the shell.

## Mechanic

A 6x6 or 7x7 lot holds vehicles (cars 2 cells long, trucks 3). Each vehicle slides only along
its own axis and cannot pass other vehicles or bollards. Free the star car so it can drive
out of the gate on the right edge of its row.

- A move is one vehicle sliding any number of cells. Consecutive slides of the same vehicle
  count as one move, matching the BFS solver used for par.
- Par is the optimal move count, verified by breadth-first search over every reachable lot
  state (`solve` in `src/logic.ts`). The HUD shows "Moves 7 · par 5".
- Stars: 3 for finishing at par or better, 2 within par + max(2, 40 % of par), otherwise 1
  (`starsFor` in `logic.ts`).
- Hint: the next move of an optimal solution from the current position, shown as a ghost
  outline at the destination and a pulsing arrow on that vehicle.

## Twists (each introduced with a banner on the level where it first appears)

- Level 11, bollards `#`: immovable orange cones that vehicles cannot pass.
- Level 21, two hero cars: the star car `T` leaves through the right gate and a second hero
  `U` (blue, outlined star) through the gate on the left edge. Both must be out.
- Level 31, bigger 7x7 lots. Worlds 5 and 6 mix 7x7, bollards and two heroes.

## Controls

- Drag a vehicle: it follows the finger along its axis, clamped to its free range, and snaps
  to the nearest cell on release with a small overshoot. Pushing into a blocker gives a bump
  sound, sparks and a tiny shake of that vehicle.
- Tap alternative: tap a vehicle to select it (free cells light up with arrows), then tap a
  highlighted cell to slide there. Tapping a bollard or a stuck vehicle bumps.
- Every vehicle shows a roof symbol (circle, square, diamond, plus, hexagon, triangle) in
  addition to its colour; heroes show a filled or outlined star.
- Reduced motion: slides snap, no shake, and the drive-out is skipped.

## Look and juice

Top-down asphalt lot with grain, painted bay marks, concrete curb and pulsing green gate
chevrons with a striped barrier arm. Vehicles have wheels, glass, roofs, lights and soft
offset shadows; they lift while dragged and squash on landing. Dust on landing, sparks on a
bump, a star burst when one of two heroes reaches its gate, and on the final move the
gate opens, the heroes accelerate out with exhaust puffs and a whoosh before the win card.

## Persistence and analytics

- Shell-owned `progress` (`currentLevel`, `bestLevel`, best `stars[]`); saves from before the
  shell migration still load. The old per-level `current` replay save is no longer used.
- `ctx.events.levelComplete(id)` is called when a level is solved (`id` = 1-based number).

## Level plan

60 levels in `src/levels.ts` (generated offline by a seeded hill-climbing search that targets
an exact par, then verified by the solver; `levels.test.ts` re-runs the solver for all 60).

| World | Levels | Lot | Twist | Par |
|---|---|---|---|---|
| Corner Lot | 1-10 | 6x6 | classic | 2-10 |
| Bollard Row | 11-20 | 6x6 | bollards | 9-17 |
| Twin Gates | 21-30 | 6x6 | two heroes, later with a bollard | 10-19 |
| Big Garage | 31-40 | 7x7 | bigger lot | 12-21 |
| Airport Deck | 41-50 | 7x7 | bollards, then two heroes | 15-24 |
| Gridlock | 51-60 | 7x7 | bollards and heroes combined | 19-27 |
