import { describe, expect, it } from "vitest";
import {
  RingGame,
  applyMove,
  heuristic,
  isComplete,
  isLocked,
  isSolved,
  isStuck,
  legalMoves,
  moveCount,
  newState,
  replay,
  solve,
  solveDetailed,
  topRun,
  undoMove,
  type RingLevel,
} from "./logic";

const lvl = (
  pegs: number[][],
  cap: number | number[],
  extra: Partial<RingLevel> = {},
): RingLevel => ({
  pegs,
  caps: Array.isArray(cap) ? cap : pegs.map(() => cap),
  ...extra,
});

describe("rules", () => {
  it("topRun counts the visible same-coloured run at the top", () => {
    expect(topRun([])).toBe(0);
    expect(topRun([1, 2, 2, 2])).toBe(3);
    expect(topRun([2, 1])).toBe(1);
    expect(topRun([2, 2, 2], 2)).toBe(1); // two bottom rings are hidden
  });

  it("moves onto an empty peg or a matching top ring only", () => {
    const s = newState(lvl([[0, 1, 0], [1, 0, 1], [], []], 3));
    expect(moveCount(s, 0, 1)).toBe(0);
    expect(moveCount(s, 0, 2)).toBe(1);
    expect(moveCount(s, 0, 0)).toBe(0);
    expect(moveCount(s, 2, 0)).toBe(0);
    applyMove(s, 0, 2);
    expect(moveCount(s, 1, 0)).toBe(1);
  });

  it("moves the whole run when it fits and only what fits otherwise", () => {
    const t = newState(lvl([[2, 1, 1, 1], [1, 1], [], []], 4));
    expect(moveCount(t, 0, 1)).toBe(2);
    const m = applyMove(t, 0, 1)!;
    expect(m.count).toBe(2);
    expect(t.pegs[1]).toEqual([1, 1, 1, 1]);
    expect(t.pegs[0]).toEqual([2, 1]);
  });

  it("respects each peg's own capacity", () => {
    const s = newState(lvl([[0, 0, 0], [0], []], [3, 2, 5]));
    expect(moveCount(s, 0, 1)).toBe(1); // only one slot left on the short peg
    expect(moveCount(s, 0, 2)).toBe(3);
    expect(moveCount(s, 1, 0)).toBe(0); // full
  });

  it("detects solved: every peg empty or holding all rings of one colour", () => {
    expect(isSolved(newState(lvl([[0, 0], [1, 1], []], 2)))).toBe(true);
    expect(isSolved(newState(lvl([[0], [0], [1, 1]], 2)))).toBe(false);
    expect(isSolved(newState(lvl([[0, 1], [1, 0], []], 2)))).toBe(false);
  });

  it("detects stuck states", () => {
    const s = newState(
      lvl(
        [
          [0, 1],
          [1, 0],
        ],
        2,
      ),
    );
    expect(isStuck(s)).toBe(true);
    expect(legalMoves(s)).toEqual([]);
  });

  it("undo restores everything", () => {
    const s = newState(lvl([[0, 1], [1, 0], []], 3));
    const before = JSON.stringify(s);
    const m = applyMove(s, 0, 2)!;
    undoMove(s, m);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("hidden rings", () => {
  const level = lvl([[0, 1, 2], [2, 2], [1, 0, 0], []], 3, { hidden: [2, 0, 1, 0] });

  it("hides the bottom rings and keeps the top visible", () => {
    const s = newState(level);
    expect(s.hid).toEqual([2, 0, 1, 0]);
    // clamped: a peg can never hide its top ring
    expect(newState(lvl([[0, 1]], 3, { hidden: [5] })).hid).toEqual([1]);
  });

  it("reveals a ring when it becomes the top, and undo hides it again", () => {
    const s = newState(level);
    const m = applyMove(s, 0, 3)!; // moves the 2 off peg 0
    expect(m.revealed).toBe(true);
    expect(s.hid[0]).toBe(1);
    const m2 = applyMove(s, 3, 1);
    expect(m2).not.toBeNull();
    undoMove(s, m2!);
    undoMove(s, m);
    expect(s.hid).toEqual([2, 0, 1, 0]);
  });

  it("never lifts a hidden ring as part of a run", () => {
    const s = newState(lvl([[1, 1, 1], [], []], 3, { hidden: [2, 0, 0] }));
    // uniform peg shows everything
    expect(s.hid[0]).toBe(0);
    const t = newState(lvl([[1, 1, 0, 1], [], []], 4, { hidden: [2, 0, 0] }));
    expect(moveCount(t, 0, 1)).toBe(1);
  });
});

describe("locked pegs", () => {
  const level = lvl([[0, 0], [0, 1], [1, 1], [], []], [3, 3, 3, 3, 3], {
    locks: [-1, -1, -1, 0, -1],
  });

  it("blocks moves from and onto a locked peg until the colour is complete", () => {
    const s = newState(lvl([[0, 1], [1, 0], [], []], 2, { locks: [-1, -1, 0, -1] }));
    expect(isLocked(s, 2)).toBe(true);
    expect(moveCount(s, 0, 2)).toBe(0);
    expect(moveCount(s, 0, 3)).toBe(1);
  });

  it("opens permanently when the key colour completes, and undo relocks", () => {
    const s = newState(level);
    expect(isLocked(s, 3)).toBe(true);
    // park the 1 on the free peg, then finish colour 0 on peg 0
    const a = applyMove(s, 1, 4)!;
    const b = applyMove(s, 1, 0)!;
    expect(b.completed).toBe(0);
    expect(b.unlocked).toEqual([3]);
    expect(isComplete(s, 0)).toBe(true);
    expect(isLocked(s, 3)).toBe(false);
    undoMove(s, b);
    expect(isLocked(s, 3)).toBe(true);
    undoMove(s, a);
  });
});

describe("game session", () => {
  it("tracks moves, undo, restart and win/lose", () => {
    const g = new RingGame(lvl([[0, 1], [1, 0], []], 2));
    expect(g.status()).toBe("playing");
    expect(g.move(0, 0)).toBeNull();
    expect(g.move(0, 2)).not.toBeNull();
    expect(g.moves).toBe(1);
    g.undo();
    expect(g.moves).toBe(0);
    expect(g.canUndo()).toBe(false);
    const win = new RingGame(lvl([[0, 1], [1], [0]], 2));
    win.move(0, 1);
    win.move(2, 0);
    expect(win.status()).toBe("won");
    win.restart();
    expect(win.status()).toBe("playing");
  });
});

describe("solver", () => {
  it("heuristic is zero when solved and never exceeds the optimum", () => {
    expect(heuristic(newState(lvl([[0, 0], [1, 1], []], 2)))).toBe(0);
    const s = newState(lvl([[0, 1, 0], [1, 0, 1], [], []], 3));
    const r = solveDetailed(s, { weight: 1 })!;
    expect(r.optimal).toBe(true);
    expect(heuristic(s)).toBeLessThanOrEqual(r.moves.length);
  });

  it("finds a shortest solution on a tiny puzzle", () => {
    const level = lvl([[0, 1], [1, 0], []], 2);
    const r = solveDetailed(newState(level), { weight: 1 })!;
    expect(r.moves.length).toBe(3);
    expect(replay(level, r.moves)).toBe(true);
  });

  it("returns null for an unsolvable state", () => {
    expect(
      solve(
        newState(
          lvl(
            [
              [0, 1],
              [1, 0],
            ],
            2,
          ),
        ),
      ),
    ).toBeNull();
  });
});
