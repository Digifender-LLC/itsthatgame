import { describe, expect, it } from "vitest";
import {
  gatePos,
  heroOut,
  isSolved,
  moveCount,
  newPuzzle,
  nudge,
  parseLevel,
  posOf,
  replay,
  reset,
  slideRange,
  slideTo,
  solve,
  starsFor,
  undo,
} from "./logic";

// T at row 2 cols 0-1, blocker A vertical at col 2 rows 1-3 (length 3), free elsewhere.
const SIMPLE = ["......", "..A...", "TTA...", "..A...", "......", "......"];
const W = "......";

describe("park-out logic", () => {
  it("parses vehicles with orientation, length and hero flag", () => {
    const { lot, vehicles: vs } = parseLevel(SIMPLE);
    expect(lot.size).toBe(6);
    expect(vs).toHaveLength(2);
    expect(vs[0]).toMatchObject({
      id: "T",
      x: 0,
      y: 2,
      len: 2,
      horizontal: true,
      hero: true,
      exit: 1,
    });
    expect(vs[1]).toMatchObject({ id: "A", x: 2, y: 1, len: 3, horizontal: false, hero: false });
  });

  it("parses 7x7 lots, bollards and the left-gate hero U", () => {
    const { lot, vehicles } = parseLevel([
      "#......",
      ".......",
      "TT.....",
      ".......",
      ".....UU",
      ".......",
      ".......",
    ]);
    expect(lot.size).toBe(7);
    expect(lot.walls[0]).toBe(true);
    expect(lot.walls.filter(Boolean)).toHaveLength(1);
    const u = vehicles.find((v) => v.id === "U")!;
    expect(u).toMatchObject({ hero: true, exit: -1 });
    expect(gatePos(lot, u)).toBe(0);
    expect(gatePos(lot, vehicles[0]!)).toBe(5);
  });

  it("rejects malformed levels", () => {
    expect(() => parseLevel(["......"])).toThrow();
    expect(() => parseLevel([W, W, W, W, W, "....."])).toThrow();
    expect(() => parseLevel(["A.A...", W, W, W, W, W])).toThrow();
    expect(() => parseLevel(["AA....", W, W, W, W, W])).toThrow(/hero/);
    expect(() => parseLevel(["UU....", W, W, W, W, W])).toThrow();
  });

  it("computes slide ranges bounded by walls, bollards and other vehicles", () => {
    const { lot, vehicles: vs } = parseLevel(SIMPLE);
    expect(slideRange(lot, vs, 0)).toEqual({ min: 0, max: 0 }); // T blocked by A at col 2
    expect(slideRange(lot, vs, 1)).toEqual({ min: 0, max: 3 }); // A: vertical, length 3
    const b = parseLevel(["......", "......", "TT.#..", "......", "......", "......"]);
    expect(slideRange(b.lot, b.vehicles, 0)).toEqual({ min: 0, max: 1 }); // bollard at col 3
  });

  it("only allows legal slides", () => {
    const p = newPuzzle(SIMPLE);
    expect(slideTo(p, 0, 3)).toBe(false); // through A
    expect(slideTo(p, 1, 4)).toBe(false); // off the board
    expect(slideTo(p, 1, 1)).toBe(false); // no-op
    expect(slideTo(p, 9, 0)).toBe(false);
    expect(p.history).toHaveLength(0);
    expect(slideTo(p, 1, 3)).toBe(true);
    expect(posOf(p.vehicles[1]!)).toBe(3);
  });

  it("detects the solved state when the hero reaches its gate", () => {
    const p = newPuzzle(SIMPLE);
    expect(isSolved(p.lot, p.vehicles)).toBe(false);
    slideTo(p, 1, 3);
    expect(isSolved(p.lot, p.vehicles)).toBe(false);
    slideTo(p, 0, 4);
    expect(heroOut(p.lot, p.vehicles[0]!)).toBe(true);
    expect(isSolved(p.lot, p.vehicles)).toBe(true);
    expect(slideTo(p, 1, 0)).toBe(false); // frozen once solved
  });

  it("needs both heroes at their gates on two-hero levels", () => {
    const rows = ["......", "TT....", W, W, "....UU", W];
    const p = newPuzzle(rows);
    expect(solve(p.lot, p.vehicles)!.moves).toBe(2);
    slideTo(p, 0, 4);
    expect(isSolved(p.lot, p.vehicles)).toBe(false);
    slideTo(p, 1, 0);
    expect(isSolved(p.lot, p.vehicles)).toBe(true);
  });

  it("counts consecutive slides of one vehicle as a single move", () => {
    const p = newPuzzle(SIMPLE);
    nudge(p, 1, 1);
    nudge(p, 1, 1);
    expect(moveCount(p.history)).toBe(1);
    slideTo(p, 0, 1);
    expect(moveCount(p.history)).toBe(2);
    nudge(p, 0, 1); // same vehicle again: still the same move
    expect(moveCount(p.history)).toBe(2);
  });

  it("undoes and resets", () => {
    const p = newPuzzle(SIMPLE);
    slideTo(p, 1, 3);
    expect(undo(p)).toEqual({ v: 1, from: 1, to: 3 });
    expect(posOf(p.vehicles[1]!)).toBe(1);
    expect(undo(p)).toBeNull();
    slideTo(p, 1, 3);
    slideTo(p, 0, 4);
    reset(p);
    expect(p.history).toHaveLength(0);
    expect(posOf(p.vehicles[0]!)).toBe(0);
  });

  it("replays saved slides and rejects illegal ones", () => {
    const p = replay(SIMPLE, [
      [1, 3],
      [0, 4],
    ]);
    expect(p && isSolved(p.lot, p.vehicles)).toBe(true);
    expect(replay(SIMPLE, [[0, 4]])).toBeNull();
  });

  it("finds the BFS optimum and a legal optimal path", () => {
    const p = newPuzzle(SIMPLE);
    const sol = solve(p.lot, p.vehicles)!;
    expect(sol.moves).toBe(2);
    for (const [v, to] of sol.path) expect(slideTo(p, v, to)).toBe(true);
    expect(isSolved(p.lot, p.vehicles)).toBe(true);
  });

  it("solves from a mid-game state (used by hints)", () => {
    const p = newPuzzle(SIMPLE);
    slideTo(p, 1, 3);
    expect(solve(p.lot, p.vehicles)!.path).toEqual([[0, 4]]);
  });

  it("reports unsolvable and already-solved lots", () => {
    const stuck = parseLevel(["TT.#..", W, W, W, W, W]);
    expect(solve(stuck.lot, stuck.vehicles)).toBeNull();
    const done = parseLevel(["....TT", W, W, W, W, W]);
    expect(solve(done.lot, done.vehicles)).toEqual({ moves: 0, path: [] });
  });

  it("awards stars against par", () => {
    expect(starsFor(5, 5)).toBe(3);
    expect(starsFor(3, 5)).toBe(3);
    expect(starsFor(6, 5)).toBe(2);
    expect(starsFor(7, 5)).toBe(2);
    expect(starsFor(8, 5)).toBe(1);
    expect(starsFor(2, 1)).toBe(2);
    expect(starsFor(4, 1)).toBe(1);
    expect(starsFor(14, 10)).toBe(2);
    expect(starsFor(15, 10)).toBe(1);
  });
});
