import { describe, expect, it } from "vitest";
import { LEVELS, WORLDS, introFor } from "./levels";
import { isSolved, parseLevel, solve } from "./logic";

describe("park-out levels", () => {
  it("ships 60 levels with sequential ids and world starts on rows of five", () => {
    expect(LEVELS).toHaveLength(60);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    expect(WORLDS.length).toBeGreaterThanOrEqual(3);
    for (const w of WORLDS) expect((w.from - 1) % 5).toBe(0);
    expect(WORLDS[0]!.from).toBe(1);
  });

  it("has distinct, well-formed lots", () => {
    const seen = new Set<string>();
    for (const l of LEVELS) {
      const key = l.rows.join("/");
      expect(seen.has(key), `level ${l.id} duplicates another`).toBe(false);
      seen.add(key);
      const { lot, vehicles } = parseLevel(l.rows);
      expect(vehicles[0]!.id).toBe("T");
      expect(isSolved(lot, vehicles), `level ${l.id} starts solved`).toBe(false);
    }
  });

  it("has a smooth par curve: rising overall, never jumping by more than 4", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const d = LEVELS[i]!.optimal - LEVELS[i - 1]!.optimal;
      expect(d, `par step into level ${i + 1}`).toBeLessThanOrEqual(4);
    }
    const avg = (a: number, b: number) =>
      LEVELS.slice(a, b).reduce((s, l) => s + l.optimal, 0) / (b - a);
    expect(avg(0, 10)).toBeLessThan(avg(20, 30));
    expect(avg(20, 30)).toBeLessThan(avg(50, 60));
    expect(LEVELS[0]!.optimal).toBeLessThanOrEqual(2);
    expect(LEVELS[59]!.optimal).toBeGreaterThanOrEqual(24);
  });

  it("introduces bollards, two heroes and 7x7 lots, each once, with a banner", () => {
    const first = (pred: (rows: readonly string[]) => boolean) =>
      LEVELS.findIndex((l) => pred(l.rows));
    const w = first((r) => r.some((x) => x.includes("#")));
    const u = first((r) => r.some((x) => x.includes("U")));
    const big = first((r) => r.length === 7);
    expect([w, u, big].every((i) => i >= 0)).toBe(true);
    expect(new Set([0, w, u, big]).size).toBe(4);
    for (const i of [0, w, u, big]) expect(introFor(i)).toBeTruthy();
    expect(LEVELS.filter((l) => l.rows.some((x) => x.includes("U"))).length).toBeGreaterThanOrEqual(
      10,
    );
    expect(LEVELS.filter((l) => l.rows.length === 7).length).toBeGreaterThanOrEqual(20);
    // mechanics appear at the start of a world, never before their intro
    expect(LEVELS.slice(0, w).some((l) => l.rows.some((x) => x.includes("#")))).toBe(false);
  });

  it("every level is solvable and its stored optimal equals the BFS optimum", () => {
    for (const l of LEVELS) {
      const { lot, vehicles } = parseLevel(l.rows);
      const sol = solve(lot, vehicles);
      expect(sol, `level ${l.id} unsolvable`).not.toBeNull();
      expect(sol!.moves, `level ${l.id} optimal`).toBe(l.optimal);
    }
  }, 120_000);
});
