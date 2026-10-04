import { describe, expect, it } from "vitest";
import { buildLevel, getLevel, LEVEL_COUNT, PLANS } from "./levels";
import {
  applyMove,
  isSolved,
  isStuck,
  legalMoves,
  moveCount,
  newState,
  replay,
  RingGame,
  solve,
  topRun,
  type RingLevel,
} from "./logic";

const tiny: RingLevel = { cap: 3, pegs: [[0, 1, 0], [1, 0, 1], [], []] };

describe("rules", () => {
  it("topRun counts the same-colored run at the top", () => {
    expect(topRun([])).toBe(0);
    expect(topRun([1, 2, 2, 2])).toBe(3);
    expect(topRun([2, 1])).toBe(1);
  });

  it("moves onto an empty peg or a matching top ring only", () => {
    const s = newState(tiny);
    expect(moveCount(s, 0, 1)).toBe(0); // top 0 onto top 1
    expect(moveCount(s, 0, 2)).toBe(1); // onto empty
    expect(moveCount(s, 0, 0)).toBe(0); // same peg
    expect(moveCount(s, 2, 0)).toBe(0); // empty source
    applyMove(s, 0, 2);
    expect(moveCount(s, 1, 0)).toBe(1); // 1 onto top 1
  });

  it("moves the whole run when it fits and only what fits otherwise", () => {
    const s = newState({ cap: 4, pegs: [[2, 1, 1, 1], [1, 1, 0, 1], [], []] });
    expect(moveCount(s, 0, 1)).toBe(0); // dest top is 1 but has no room? len 4 = cap
    const t = newState({ cap: 4, pegs: [[2, 1, 1, 1], [1, 1], [], []] });
    expect(moveCount(t, 0, 1)).toBe(2); // run of 3, space 2
    const m = applyMove(t, 0, 1)!;
    expect(m.count).toBe(2);
    expect(t.pegs[1]).toEqual([1, 1, 1, 1]);
    expect(t.pegs[0]).toEqual([2, 1]);
  });

  it("refuses to exceed capacity", () => {
    const s = newState({ cap: 2, pegs: [[0, 0], [0], []] });
    expect(moveCount(s, 1, 0)).toBe(0);
  });

  it("detects solved: single-colored pegs and no split colors", () => {
    expect(isSolved(newState({ cap: 2, pegs: [[0, 0], [1, 1], []] }))).toBe(true);
    expect(isSolved(newState({ cap: 2, pegs: [[0], [0], [1, 1]] }))).toBe(false);
    expect(isSolved(newState({ cap: 2, pegs: [[0, 1], [1, 0], []] }))).toBe(false);
  });

  it("detects stuck states (lose)", () => {
    const s = newState({
      cap: 2,
      pegs: [
        [0, 1],
        [1, 0],
      ],
    });
    expect(legalMoves(s)).toEqual([]);
    expect(isStuck(s)).toBe(true);
    const g = new RingGame({
      cap: 2,
      pegs: [
        [0, 1],
        [1, 0],
      ],
    });
    expect(g.status()).toBe("lost");
  });
});

describe("game session", () => {
  it("supports undo, restart and win detection", () => {
    const g = new RingGame({ cap: 2, pegs: [[0, 1], [1, 0], []] });
    expect(g.status()).toBe("playing");
    expect(g.canUndo()).toBe(false);
    expect(g.move(0, 0)).toBeNull();
    expect(g.moves).toBe(0);
    g.move(0, 2); // 1 -> empty
    g.move(1, 0); // 0 -> onto 0
    g.move(2, 1); // 1 -> onto 1
    expect(g.status()).toBe("won");
    expect(g.move(0, 2)).toBeNull(); // no moves after a win
    g.undo();
    expect(g.status()).toBe("playing");
    expect(g.state.pegs[2]).toEqual([1]);
    g.undo();
    g.undo();
    expect(g.canUndo()).toBe(false);
    expect(g.state.pegs).toEqual([[0, 1], [1, 0], []]);
    g.move(0, 2);
    g.restart();
    expect(g.state.pegs).toEqual([[0, 1], [1, 0], []]);
    expect(g.canUndo()).toBe(false);
  });

  it("undo restores a partial-run move exactly", () => {
    const g = new RingGame({ cap: 4, pegs: [[2, 1, 1, 1], [1, 1], [], [0, 0, 0, 2]] });
    const before = JSON.stringify(g.state.pegs);
    g.move(0, 1);
    g.undo();
    expect(JSON.stringify(g.state.pegs)).toBe(before);
  });
});

describe("levels", () => {
  it("has at least 20 levels with rising difficulty", () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(20);
    const first = PLANS[0]!;
    const last = PLANS[PLANS.length - 1]!;
    expect(last.colors * last.cap).toBeGreaterThan(first.colors * first.cap * 2);
  });

  it("is deterministic and well formed", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const a = getLevel(i);
      const b = getLevel(i);
      expect(a).toEqual(b);
      const counts = new Map<number, number>();
      for (const p of a.pegs) {
        expect(p.length).toBeLessThanOrEqual(a.cap);
        for (const c of p) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      for (const n of counts.values()) expect(n).toBe(a.cap);
      expect(isSolved(newState(a))).toBe(false);
      expect(a.pegs.some((p) => p.length === a.cap && p.every((x) => x === p[0]))).toBe(false);
    }
  });

  it("uses no more colors than the SDK palette provides", () => {
    expect(Math.max(...PLANS.map((p) => p.colors))).toBeLessThanOrEqual(7);
  });

  it("every level is solvable (solver finds a replayable solution)", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const level = getLevel(i);
      const solution = solve(newState(level));
      expect(solution, `level ${i + 1} unsolved`).not.toBeNull();
      expect(replay(level, solution!), `level ${i + 1} replay`).toBe(true);
    }
  });

  it("the solver reports null for an unsolvable position", () => {
    const level = buildLevel({ colors: 2, cap: 2, empty: 0, seed: 1 });
    const stuck: RingLevel = {
      cap: level.cap,
      pegs: [
        [0, 1],
        [1, 0],
      ],
    };
    expect(solve(newState(stuck))).toBeNull();
  });
});
