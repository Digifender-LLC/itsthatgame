import { describe, expect, it } from "vitest";
import {
  BASE_SPEED,
  FIELD,
  GROWTH,
  MAX_SPEED,
  START_WIDTH,
  STREAK_FOR_GROWTH,
  drop,
  hueAt,
  isMilestone,
  newGame,
  nextMilestone,
  perfectPitch,
  perfectSemitones,
  skyProgress,
  speedAt,
  step,
  type StackState,
} from "./logic";

/** Place the mover at an exact x without waiting for the simulation. */
function dropAt(s: StackState, x: number) {
  s.mover.x = x;
  return drop(s);
}

describe("stack-up logic", () => {
  it("starts centred with one base block and score 0", () => {
    const s = newGame();
    expect(s.tower).toHaveLength(1);
    expect(s.tower[0]!.w).toBe(START_WIDTH);
    expect(s.tower[0]!.x + s.tower[0]!.w / 2).toBe(FIELD / 2);
    expect(s.score).toBe(0);
    expect(s.over).toBe(false);
  });

  it("slides and bounces off both walls, never leaving the field", () => {
    const s = newGame();
    for (let i = 0; i < 2000; i++) {
      step(s, 0.016);
      expect(s.mover.x).toBeGreaterThanOrEqual(-1e-9);
      expect(s.mover.x + s.mover.w).toBeLessThanOrEqual(FIELD + 1e-9);
    }
  });

  it("does not tunnel on a very long frame", () => {
    const s = newGame();
    step(s, 100);
    expect(s.mover.x).toBeGreaterThanOrEqual(0);
    expect(s.mover.x + s.mover.w).toBeLessThanOrEqual(FIELD);
  });

  it("trims the overhang and keeps the overlap", () => {
    const s = newGame();
    const base = s.tower[0]!;
    const r = dropAt(s, base.x + 10);
    expect(r.kind).toBe("trim");
    expect(s.score).toBe(1);
    expect(s.tower[1]!.x).toBeCloseTo(base.x + 10);
    expect(s.tower[1]!.w).toBeCloseTo(START_WIDTH - 10);
    expect(r.debris).toEqual({ x: base.x + START_WIDTH, w: 10 });
  });

  it("trims overhang on the left side too", () => {
    const s = newGame();
    const base = s.tower[0]!;
    const r = dropAt(s, base.x - 6);
    expect(r.kind).toBe("trim");
    expect(s.tower[1]!.x).toBeCloseTo(base.x);
    expect(s.tower[1]!.w).toBeCloseTo(START_WIDTH - 6);
    expect(r.debris!.x).toBeCloseTo(base.x - 6);
    expect(r.debris!.w).toBeCloseTo(6);
  });

  it("snaps a near-perfect drop and keeps the width", () => {
    const s = newGame();
    const base = s.tower[0]!;
    const r = dropAt(s, base.x + 0.8);
    expect(r.kind).toBe("perfect");
    expect(s.tower[1]).toEqual(base);
    expect(r.debris).toBeNull();
  });

  it("grows the block back after a perfect streak", () => {
    const s = newGame();
    dropAt(s, s.tower[0]!.x + 10); // trim to width 30
    const w0 = s.tower[1]!.w;
    for (let i = 0; i < STREAK_FOR_GROWTH; i++) dropAt(s, s.tower[s.tower.length - 1]!.x);
    expect(s.tower[s.tower.length - 1]!.w).toBe(w0 + GROWTH);
    expect(s.streak).toBe(STREAK_FOR_GROWTH);
  });

  it("never grows beyond the starting width", () => {
    const s = newGame();
    for (let i = 0; i < 20; i++) dropAt(s, s.tower[s.tower.length - 1]!.x);
    expect(s.tower[s.tower.length - 1]!.w).toBe(START_WIDTH);
  });

  it("resets the streak on a trim", () => {
    const s = newGame();
    dropAt(s, s.tower[0]!.x);
    expect(s.streak).toBe(1);
    dropAt(s, s.tower[1]!.x + 5);
    expect(s.streak).toBe(0);
  });

  it("ends the game when the block misses entirely, without scoring it", () => {
    const s = newGame();
    const r = dropAt(s, 0); // base spans 30..70, mover 0..40 overlaps; move off instead
    expect(r.kind).not.toBe("miss");
    const t = s.tower[s.tower.length - 1]!;
    s.mover.x = t.x + t.w + 2;
    const score = s.score;
    const miss = drop(s);
    expect(miss.kind).toBe("miss");
    expect(miss.debris).not.toBeNull();
    expect(s.over).toBe(true);
    expect(s.score).toBe(score);
  });

  it("ignores drops and steps after game over", () => {
    const s = newGame();
    s.mover.x = 0;
    s.mover.w = 10;
    s.tower[0] = { x: 60, w: 10 };
    drop(s);
    expect(s.over).toBe(true);
    const snapshot = JSON.stringify(s);
    step(s, 1);
    expect(drop(s).kind).toBe("miss");
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("score equals tower height above the base", () => {
    const s = newGame();
    for (let i = 0; i < 7; i++) dropAt(s, s.tower[s.tower.length - 1]!.x);
    expect(s.score).toBe(7);
    expect(s.tower).toHaveLength(8);
  });

  it("speeds up gradually and is capped", () => {
    expect(speedAt(0)).toBe(BASE_SPEED);
    expect(speedAt(10)).toBeGreaterThan(speedAt(0));
    expect(speedAt(20)).toBeGreaterThan(speedAt(10));
    expect(speedAt(10_000)).toBe(MAX_SPEED);
  });

  it("alternates the side the next block enters from", () => {
    const s = newGame();
    expect(s.mover.dir).toBe(1);
    dropAt(s, s.tower[0]!.x);
    expect(s.mover.dir).toBe(-1);
    dropAt(s, s.tower[1]!.x);
    expect(s.mover.dir).toBe(1);
  });

  it("reduced motion slows the slide", () => {
    const a = newGame(1);
    const b = newGame(0.5);
    step(a, 0.1);
    step(b, 0.1);
    expect(Math.abs(b.mover.x)).toBeLessThan(Math.abs(a.mover.x));
  });

  it("is deterministic: identical inputs give identical state", () => {
    const run = () => {
      const s = newGame();
      const results: string[] = [];
      for (let i = 0; i < 40 && !s.over; i++) {
        for (let k = 0; k < 17 + i; k++) step(s, 0.016);
        results.push(drop(s).kind);
      }
      return JSON.stringify({ s, results });
    };
    expect(run()).toBe(run());
  });
});

describe("stack-up presentation helpers", () => {
  it("flags every tenth floor as a milestone", () => {
    expect([0, 1, 9, 10, 11, 20, 30].map(isMilestone)).toEqual([
      false,
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
    expect(nextMilestone(0)).toBe(10);
    expect(nextMilestone(9)).toBe(10);
    expect(nextMilestone(10)).toBe(20);
  });

  it("climbs the pentatonic scale with the streak and stays within the pitch clamp", () => {
    expect([1, 2, 3, 4, 5, 6].map(perfectSemitones)).toEqual([0, 2, 4, 7, 9, 12]);
    let prev = 0;
    for (let s = 1; s <= 40; s++) {
      const p = perfectPitch(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(3);
      prev = p;
    }
    expect(perfectPitch(1)).toBeCloseTo(0.75);
  });

  it("moves the sky from day to dusk to night and caps there", () => {
    expect(skyProgress(0)).toBe(0);
    expect(skyProgress(20)).toBe(1);
    expect(skyProgress(40)).toBe(2);
    expect(skyProgress(500)).toBe(2);
  });

  it("shifts hue gradually and keeps it in range", () => {
    for (let i = 0; i < 200; i++) {
      expect(hueAt(i)).toBeGreaterThanOrEqual(0);
      expect(hueAt(i)).toBeLessThan(360);
    }
    expect(hueAt(1)).not.toBe(hueAt(0));
  });
});
