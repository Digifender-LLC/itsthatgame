import { describe, expect, it } from "vitest";
import {
  COLS,
  GOALS,
  ROWS,
  danger,
  drop,
  findMerge,
  goalIndex,
  isMergeState,
  maxTile,
  newGame,
  newGoals,
  rngNext,
  seedFromRun,
  spawnPool,
  wouldMerge,
  type MergeState,
} from "./logic";

function board(cols: number[][], current = 2, next = 2): MergeState {
  const s = newGame(1);
  s.cols = Array.from({ length: COLS }, (_, i) => [...(cols[i] ?? [])]);
  s.current = current;
  s.next = next;
  return s;
}

describe("merge-drop logic", () => {
  it("starts with an empty board, a current tile and a preview", () => {
    const s = newGame(7);
    expect(s.cols).toHaveLength(COLS);
    expect(s.cols.every((c) => c.length === 0)).toBe(true);
    expect([2, 4]).toContain(s.current);
    expect([2, 4]).toContain(s.next);
    expect(s.score).toBe(0);
    expect(s.over).toBe(false);
  });

  it("stacks a tile on a column and advances the preview", () => {
    const s = board([], 4, 2);
    const r = drop(s, 2);
    expect(r.ok).toBe(true);
    expect(s.cols[2]).toEqual([4]);
    expect(s.current).toBe(2);
    expect(r.chain).toBe(0);
    expect(s.score).toBe(0);
  });

  it("rejects invalid columns", () => {
    const s = board([]);
    expect(drop(s, -1).ok).toBe(false);
    expect(drop(s, COLS).ok).toBe(false);
    expect(drop(s, 1.5).ok).toBe(false);
    expect(s.drops).toBe(0);
  });

  it("merges equal tiles stacked vertically and scores the new value", () => {
    const s = board([[], [4]], 4);
    const r = drop(s, 1);
    expect(s.cols[1]).toEqual([8]);
    expect(r.gained).toBe(8);
    expect(s.score).toBe(8);
    expect(r.merges).toHaveLength(1);
    expect(r.merges[0]!.value).toBe(8);
  });

  it("merges equal tiles that touch sideways", () => {
    const s = board([[2], []], 2);
    drop(s, 1);
    expect(s.cols[0]).toEqual([4]);
    expect(s.cols[1]).toEqual([]);
  });

  it("does not merge different values", () => {
    const s = board([[2], [4]], 8);
    const r = drop(s, 2);
    expect(r.chain).toBe(0);
    expect(s.cols[2]).toEqual([8]);
  });

  it("merges a group of three into v * 4 at the lowest, leftmost cell", () => {
    // col0:[2] col1:[2] ; drop 2 on col 2 -> row 0 has 2,2,2 -> one tile of 8? n=3 => 2*4 = 8
    const s = board([[2], [2], []], 2);
    drop(s, 2);
    expect(s.cols[0]).toEqual([8]);
    expect(s.cols[1]).toEqual([]);
    expect(s.cols[2]).toEqual([]);
  });

  it("applies gravity to tiles above merged cells", () => {
    // col1 holds [2, 8]; dropping a 2 in col0 (beside the bottom 2) merges them, the 8 falls.
    const s = board([[], [2, 8]], 2);
    drop(s, 0);
    expect(s.cols[0]).toEqual([4]);
    expect(s.cols[1]).toEqual([8]);
  });

  it("resolves chain merges with an increasing multiplier", () => {
    // Drop 2 on col 0 beside [2]: merge -> 4 at col0? Build so that result touches another 4.
    // col0:[2] col1:[4]; drop 2 on col 0 ... uses vertical 2+2=4 at col0 row0, touches col1's 4
    const s = board([[2], [4]], 2);
    const r = drop(s, 0);
    expect(r.chain).toBe(2);
    expect(r.merges.map((m) => m.value)).toEqual([4, 8]);
    // 4 * 1 + 8 * 2
    expect(r.gained).toBe(4 + 16);
    expect(s.cols[0]).toEqual([8]);
    expect(s.cols[1]).toEqual([]);
  });

  it("findMerge returns null when nothing touches and a group when it does", () => {
    expect(findMerge(board([[2], [4], [2]]).cols)).toBeNull();
    expect(findMerge(board([[2, 2]]).cols)).not.toBeNull();
  });

  it("ends the run when a column overflows", () => {
    // Alternate 2/4 so nothing merges; fill column 0 to ROWS, then add one more.
    const col = Array.from({ length: ROWS }, (_, i) => (i % 2 === 0 ? 4 : 8));
    const s = board([col], 2);
    const r = drop(s, 0);
    expect(r.ok).toBe(true);
    expect(s.cols[0]).toHaveLength(ROWS + 1);
    expect(s.over).toBe(true);
    expect(drop(s, 1).ok).toBe(false);
  });

  it("does not end the run if the overflowing tile merges away", () => {
    // Column is 4,8,4,8,4,8,4 (full, nothing touching); a 4 on top merges and cascades down.
    const col = Array.from({ length: ROWS }, (_, i) => (i % 2 === 0 ? 4 : 8));
    const s = board([col], 4);
    const r = drop(s, 0);
    expect(r.chain).toBeGreaterThan(0);
    expect(s.over).toBe(false);
    expect(s.cols[0]!.length).toBeLessThanOrEqual(ROWS);
  });

  it("spawn pool grows with the largest tile", () => {
    expect(spawnPool(2)).toEqual([2, 4]);
    expect(spawnPool(32)).toEqual([2, 4]);
    expect(spawnPool(64)).toEqual([2, 4, 8]);
    expect(spawnPool(1 << 20)).toEqual([2, 4, 8, 16, 32, 64]);
    expect(maxTile([[2, 16], [4]])).toBe(16);
  });

  it("rng is a pure function of its state", () => {
    expect(rngNext(5)).toEqual(rngNext(5));
    const [f] = rngNext(123);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
    expect(seedFromRun(1)).not.toBe(seedFromRun(2));
    expect(seedFromRun(3)).toBe(seedFromRun(3));
  });

  it("is deterministic for a seed and a drop sequence", () => {
    const play = (seed: number) => {
      const s = newGame(seed);
      const log: unknown[] = [];
      for (let i = 0; i < 60 && !s.over; i++) {
        log.push(drop(s, (i * 3 + (i >> 2)) % COLS));
      }
      return JSON.stringify({ s, log });
    };
    expect(play(seedFromRun(1))).toBe(play(seedFromRun(1)));
    expect(play(seedFromRun(1))).not.toBe(play(seedFromRun(2)));
  });

  it("a state round-trips through JSON and resumes identically", () => {
    const a = newGame(seedFromRun(9));
    for (let i = 0; i < 10; i++) drop(a, i % COLS);
    const b = JSON.parse(JSON.stringify(a)) as MergeState;
    expect(isMergeState(b)).toBe(true);
    for (let i = 0; i < 10; i++) {
      drop(a, (i * 2) % COLS);
      drop(b, (i * 2) % COLS);
    }
    expect(b).toEqual(a);
  });

  it("rejects malformed snapshots", () => {
    expect(isMergeState(null)).toBe(false);
    expect(isMergeState({ cols: [] })).toBe(false);
    const s = newGame(1);
    expect(isMergeState({ ...s, current: 3.5 })).toBe(false);
    expect(isMergeState(s)).toBe(true);
  });

  it("random play never produces invalid boards and eventually ends", () => {
    const s = newGame(seedFromRun(4));
    let n = 0;
    while (!s.over && n < 5000) {
      drop(s, n % COLS);
      for (const c of s.cols) expect(c.every((v) => v >= 2 && (v & (v - 1)) === 0)).toBe(true);
      n++;
    }
    expect(s.over).toBe(true);
  });
});

describe("goal ladder and UI helpers", () => {
  it("indexes goals and reports newly reached ones", () => {
    expect(goalIndex(16)).toBe(0);
    expect(goalIndex(32)).toBe(1);
    expect(goalIndex(128)).toBe(3);
    expect(goalIndex(1 << 20)).toBe(GOALS.length);
    expect(newGoals(16, 64)).toEqual([32, 64]);
    expect(newGoals(64, 64)).toEqual([]);
    expect(newGoals(64, 256)).toEqual([128, 256]);
  });
  it("rates column danger", () => {
    expect(danger(0)).toBe(0);
    expect(danger(ROWS - 3)).toBe(0);
    expect(danger(ROWS - 2)).toBe(1);
    expect(danger(ROWS)).toBe(2);
    expect(danger(ROWS + 1)).toBe(3);
  });
  it("predicts merges for the ghost tile", () => {
    const cols = [[4], [8, 2], [], [], []];
    expect(wouldMerge(cols, 0, 4)).toBe(true); // lands on the 4
    expect(wouldMerge(cols, 0, 2)).toBe(true); // touches the 2 on its right
    expect(wouldMerge(cols, 2, 8)).toBe(true); // touches the 8 on its left
    expect(wouldMerge(cols, 2, 2)).toBe(false);
    expect(wouldMerge(cols, 3, 2)).toBe(false);
  });
});
