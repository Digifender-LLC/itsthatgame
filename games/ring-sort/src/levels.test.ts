import { describe, expect, it } from "vitest";
import { LEVEL_DATA } from "./level-data";
import {
  INTROS,
  LEVEL_COUNT,
  WORLDS,
  getLevel,
  getPar,
  getSolution,
  hasHidden,
  starLimits,
  starsFor,
} from "./levels";
import { isSolved, newState, replay, solveDetailed } from "./logic";

describe("level set", () => {
  it("has 60 levels in six worlds that start on rows of five", () => {
    expect(LEVEL_COUNT).toBe(60);
    expect(WORLDS.map((w) => w.from)).toEqual([1, 11, 21, 31, 41, 51]);
    for (const w of WORLDS) expect((w.from - 1) % 5).toBe(0);
  });

  it("introduces each new mechanic with a banner", () => {
    for (const idx of [0, 10, 20, 30]) expect(INTROS[idx]).toBeTruthy();
    expect(getLevel(10).caps.some((c) => c !== getLevel(10).caps[0])).toBe(true);
    expect(hasHidden(20)).toBe(true);
    expect(hasHidden(19)).toBe(false);
    expect(getLevel(30).locks!.some((l) => l >= 0)).toBe(true);
    for (let i = 0; i < 30; i++) expect(getLevel(i).locks!.every((l) => l < 0)).toBe(true);
    for (let i = 0; i < 20; i++) expect(hasHidden(i)).toBe(false);
  });

  it("stays within the board: at most ten pegs, seven colours, rings fit", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const l = getLevel(i);
      expect(l.pegs.length).toBeLessThanOrEqual(10);
      l.pegs.forEach((p, k) => {
        expect(p.length).toBeLessThanOrEqual(l.caps[k]!);
        for (const c of p) expect(c).toBeLessThan(7);
      });
    }
  });

  it("starts unsolved with at least one free (unlocked, empty) peg", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const l = getLevel(i);
      const s = newState(l);
      expect(isSolved(s)).toBe(false);
      expect(l.pegs.some((p, k) => p.length === 0 && (l.locks![k] ?? -1) < 0)).toBe(true);
    }
  });

  it("every level's stored solution replays to solved in exactly par moves", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const sol = getSolution(i);
      expect(sol.length).toBe(getPar(i));
      expect(replay(getLevel(i), sol), `level ${i + 1}`).toBe(true);
    }
  });

  it("par is the proven minimum: the optimal solver agrees on the first 30 levels", () => {
    for (let i = 0; i < 30; i++) {
      expect(LEVEL_DATA[i]!.proven).toBe(true);
      const r = solveDetailed(newState(getLevel(i)), { weight: 1, maxNodes: 400_000 })!;
      expect(r.optimal).toBe(true);
      expect(r.moves.length, `level ${i + 1}`).toBe(getPar(i));
    }
  });

  it("eases in: the first ten levels are small and have low par", () => {
    for (let i = 0; i < 10; i++) {
      expect(getLevel(i).pegs.length).toBeLessThanOrEqual(7);
      expect(getPar(i)).toBeLessThanOrEqual(18);
    }
    expect(getPar(0)).toBeLessThanOrEqual(5);
  });
});

describe("stars", () => {
  it("par is 3 stars, generous slack still 3, then 2, then 1", () => {
    const par = getPar(5);
    const lim = starLimits(5);
    expect(lim.three).toBeGreaterThan(par);
    expect(starsFor(5, par)).toBe(3);
    expect(starsFor(5, lim.three)).toBe(3);
    expect(starsFor(5, lim.three + 1)).toBe(2);
    expect(starsFor(5, lim.two)).toBe(2);
    expect(starsFor(5, lim.two + 1)).toBe(1);
  });
});
