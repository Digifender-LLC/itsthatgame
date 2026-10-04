import { describe, expect, it } from "vitest";
import { LEVELS } from "./levels";
import { SIZE, isSolved, parseLevel, solve } from "./logic";

describe("park-out levels", () => {
  it("ships at least 20 levels with sequential ids", () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it("orders levels by non-decreasing optimal length", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.optimal).toBeGreaterThanOrEqual(LEVELS[i - 1]!.optimal);
    }
  });

  it("has well-formed rows and one horizontal target on each level", () => {
    for (const l of LEVELS) {
      expect(l.rows).toHaveLength(SIZE);
      for (const r of l.rows) expect(r).toHaveLength(SIZE);
      const vs = parseLevel(l.rows);
      expect(vs.filter((v) => v.target)).toHaveLength(1);
      expect(vs[0]!.target).toBe(true);
      expect(vs[0]!.horizontal).toBe(true);
      expect(isSolved(vs), `level ${l.id} starts solved`).toBe(false);
    }
  });

  it("every level is solvable and its stored optimal equals the BFS optimum", () => {
    for (const l of LEVELS) {
      const sol = solve(parseLevel(l.rows));
      expect(sol, `level ${l.id} unsolvable`).not.toBeNull();
      expect(sol!.moves, `level ${l.id} optimal`).toBe(l.optimal);
    }
  });
});
