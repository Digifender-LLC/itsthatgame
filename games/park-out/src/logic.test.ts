import { describe, expect, it } from "vitest";
import {
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
  undo,
} from "./logic";

// T at row 2 cols 0-1, blocker A vertical at col 2 rows 1-3 (length 3), free elsewhere.
const SIMPLE = ["......", "..A...", "TTA...", "..A...", "......", "......"];

describe("park-out logic", () => {
  it("parses vehicles with orientation, length and target flag", () => {
    const vs = parseLevel(SIMPLE);
    expect(vs).toHaveLength(2);
    expect(vs[0]).toMatchObject({ id: "T", x: 0, y: 2, len: 2, horizontal: true, target: true });
    expect(vs[1]).toMatchObject({ id: "A", x: 2, y: 1, len: 3, horizontal: false });
  });

  it("rejects malformed levels", () => {
    expect(() => parseLevel(["......"])).toThrow();
    expect(() => parseLevel(["......", "......", "......", "......", "......", "....."])).toThrow();
    expect(() =>
      parseLevel(["A.A...", "......", "......", "......", "......", "......"]),
    ).toThrow();
    expect(() => parseLevel(["AA....", "......", "......", "......", "......", "......"])).toThrow(
      /target/,
    );
  });

  it("computes slide ranges bounded by walls and other vehicles", () => {
    const vs = parseLevel(SIMPLE);
    expect(slideRange(vs, 0)).toEqual({ min: 0, max: 0 }); // T blocked by A at col 2
    expect(slideRange(vs, 1)).toEqual({ min: 0, max: 3 }); // A: vertical, length 3
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

  it("detects the solved state when the target reaches the right edge", () => {
    const p = newPuzzle(SIMPLE);
    expect(isSolved(p.vehicles)).toBe(false);
    slideTo(p, 1, 3);
    expect(isSolved(p.vehicles)).toBe(false);
    slideTo(p, 0, 4);
    expect(isSolved(p.vehicles)).toBe(true);
    expect(slideTo(p, 0, 3)).toBe(false); // locked after solving
  });

  it("counts consecutive slides of the same vehicle as one move", () => {
    const p = newPuzzle(SIMPLE);
    expect(nudge(p, 1, 1)).toBe(true);
    expect(nudge(p, 1, 1)).toBe(true);
    expect(nudge(p, 1, 1)).toBe(false); // at the bottom wall
    expect(p.history).toHaveLength(2);
    expect(moveCount(p.history)).toBe(1);
    slideTo(p, 0, 1);
    expect(moveCount(p.history)).toBe(2);
    slideTo(p, 0, 2);
    expect(p.history).toHaveLength(4);
    expect(moveCount(p.history)).toBe(2);
  });

  it("undoes slides one at a time and restores positions", () => {
    const p = newPuzzle(SIMPLE);
    slideTo(p, 1, 3);
    slideTo(p, 0, 4);
    expect(undo(p)).toEqual({ v: 0, from: 0, to: 4 });
    expect(posOf(p.vehicles[0]!)).toBe(0);
    undo(p);
    expect(posOf(p.vehicles[1]!)).toBe(1);
    expect(undo(p)).toBeNull();
  });

  it("reset returns to the starting layout", () => {
    const p = newPuzzle(SIMPLE);
    slideTo(p, 1, 3);
    reset(p);
    expect(p.history).toHaveLength(0);
    expect(p.vehicles).toEqual(parseLevel(SIMPLE));
  });

  it("replay rebuilds saved progress and rejects illegal saves", () => {
    const p = replay(SIMPLE, [[1, 3]]);
    expect(p).not.toBeNull();
    expect(posOf(p!.vehicles[1]!)).toBe(3);
    expect(replay(SIMPLE, [[0, 5]])).toBeNull();
  });

  it("BFS finds the optimum and a path that actually solves the level", () => {
    const sol = solve(parseLevel(SIMPLE))!;
    expect(sol.moves).toBe(2);
    const p = newPuzzle(SIMPLE);
    for (const [v, to] of sol.path) expect(slideTo(p, v, to)).toBe(true);
    expect(isSolved(p.vehicles)).toBe(true);
    expect(moveCount(p.history)).toBe(sol.moves);
  });

  it("BFS reports unsolvable lots", () => {
    // Two length-3 verticals fill column 2 top to bottom and cannot move.
    const stuck = parseLevel(["..A...", "..A...", "TTA...", "..B...", "..B...", "..B..."]);
    expect(solve(stuck)).toBeNull();
  });

  it("solve returns 0 moves for an already-solved lot", () => {
    const vs = parseLevel(["......", "......", "....TT", "......", "......", "......"]);
    expect(solve(vs)).toEqual({ moves: 0, path: [] });
  });
});
