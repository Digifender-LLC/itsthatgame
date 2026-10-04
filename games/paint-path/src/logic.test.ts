import { describe, expect, it } from "vitest";
import { LEVELS, LEVEL_COUNT, generateLevel } from "./levels";
import {
  availableMoves,
  createState,
  head,
  isWon,
  openCellCount,
  restart,
  solve,
  step,
  undo,
  verifyPath,
  type Level,
} from "./logic";

// 3x2 grid:  0 1 2 / 3 #4 5  -> open cells 0,1,2,3,5; path 3-0-1-2-5 starts at 3.
const tinyLevel: Level = {
  id: 0,
  cols: 3,
  rows: 2,
  walls: [4],
  start: 3,
  solution: [3, 0, 1, 2, 5],
};

describe("paint-path logic", () => {
  it("extends, backtracks and blocks", () => {
    let s = createState(tinyLevel);
    expect(head(s)).toBe(3);
    expect(step(s, 4).result).toBe("blocked"); // wall
    expect(step(s, 1).result).toBe("blocked"); // not adjacent
    let r = step(s, 0);
    expect(r.result).toBe("extended");
    s = r.state;
    r = step(s, 1);
    s = r.state;
    expect(s.path).toEqual([3, 0, 1]);
    r = step(s, 0);
    expect(r.result).toBe("backtracked");
    expect(r.state.path).toEqual([3, 0]);
    expect(step(r.state, 0).result).toBe("none");
  });

  it("undo and restart", () => {
    let s = createState(tinyLevel);
    s = step(s, 0).state;
    s = step(s, 1).state;
    expect(undo(s).path).toEqual([3, 0]);
    expect(undo(createState(tinyLevel)).path).toEqual([3]);
    expect(restart(s).path).toEqual([3]);
  });

  it("detects a win only when every open cell is painted", () => {
    let s = createState(tinyLevel);
    for (const c of [0, 1, 2]) s = step(s, c).state;
    expect(isWon(s)).toBe(false);
    expect(availableMoves(s)).toEqual([5]);
    s = step(s, 5).state;
    expect(isWon(s)).toBe(true);
    expect(step(s, 2).result).toBe("none"); // frozen once won
  });

  it("verifyPath rejects bad paths", () => {
    expect(verifyPath(tinyLevel, [3, 0, 1, 2, 5])).toBe(true);
    expect(verifyPath(tinyLevel, [3, 0, 1, 2])).toBe(false);
    expect(verifyPath(tinyLevel, [0, 1, 2, 5, 3])).toBe(false);
    expect(verifyPath(tinyLevel, [3, 0, 1, 5, 2])).toBe(false);
  });

  it("solver reports unsolvable levels", () => {
    // 3x1 corridor started in the middle cannot cover both ends.
    const bad: Level = { id: 0, cols: 3, rows: 1, walls: [], start: 1, solution: [] };
    expect(solve(bad)).toBeNull();
  });
});

describe("paint-path levels", () => {
  it("has at least 20 levels with rising size", () => {
    expect(LEVELS.length).toBe(LEVEL_COUNT);
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
    const sizes = LEVELS.map((l) => l.cols * l.rows);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
    expect(sizes[sizes.length - 1]!).toBeGreaterThan(sizes[0]!);
  });

  it("is deterministic", () => {
    expect(generateLevel(10)).toEqual(LEVELS[10]);
    expect(generateLevel(10)).toEqual(generateLevel(10));
  });

  it("later levels have walls", () => {
    expect(LEVELS.slice(-8).every((l) => l.walls.length > 0)).toBe(true);
  });

  for (const level of LEVELS) {
    it(`level ${level.id} (${level.cols}x${level.rows}, ${level.walls.length} walls) is solvable`, () => {
      expect(verifyPath(level, level.solution)).toBe(true);
      expect(level.solution.length).toBe(openCellCount(level));
      const found = solve(level);
      expect(found, "DFS solver found no solution").not.toBeNull();
      expect(verifyPath(level, found!)).toBe(true);
      // Replaying the solver's answer through the game logic wins.
      let s = createState(level);
      for (const c of found!.slice(1)) s = step(s, c).state;
      expect(isWon(s)).toBe(true);
    });
  }
});
