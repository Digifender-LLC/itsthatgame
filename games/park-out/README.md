# Park Out

Roadmap M3 premium game. Slug `park-out`.

## Mechanic

A 6x6 lot holds vehicles that are 2 or 3 cells long. Each vehicle slides only along its own
axis (horizontal vehicles left/right, vertical ones up/down) and cannot pass other
vehicles. Free the marked vehicle (red-orange, star glyph) so it can drive out of the exit
gate on the right edge of its row.

- A move is one vehicle sliding any number of cells. Consecutive slides of the same vehicle
  (for example several single-step arrow taps) count as one move, matching the BFS solver
  used for the target counts.
- The target number shown on screen is the optimal move count, verified by breadth-first
  search over every reachable lot state (`solve` in `src/logic.ts`).
- Finishing in the optimal count shows "Perfect: optimal solution".

## Inspiration

The classic sliding-block unblock puzzle genre. Only the genre idea is used; the name,
vocabulary, look, and all 24 level layouts are our own (see `ORIGINALITY.md`).

## Controls

- Drag a vehicle along its axis; it snaps to the nearest cell on release.
- Accessible alternative: tap a vehicle to select it, then use the Left/Right (or Up/Down)
  buttons to slide it one cell at a time. All buttons are at least 44 px high.
- Undo (any number of steps), Restart level, and `‹ ›` to revisit unlocked levels.
- Every vehicle shows a distinct glyph in addition to its color.

## Persistence and analytics

- `ctx.storage` keys: `progress` (highest unlocked level, best moves per level, current
  level) and `current` (slides made in the unfinished level, replayed on launch).
- `ctx.events.levelComplete(id)` is called each time a level is solved (`id` = 1-based level
  number).

## Level plan

24 levels in `src/levels.ts`, ordered by optimal solution length from short to long
(see the table in that file's header). Levels are unlocked in order. A test
(`levels.test.ts`) parses every level, runs the BFS solver, and asserts each is solvable
with the stored optimal move count.
