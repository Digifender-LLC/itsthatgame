import { describe, expect, it } from "vitest";
import { LEVEL_COUNT, PLANS, getLevel } from "./levels";
import {
  PinDropGame,
  analyze,
  parseLevel,
  pullPin,
  replay,
  solve,
  status,
  type PinDropLevel,
} from "./logic";

const lvl = (...rows: string[]): PinDropLevel => ({ rows });

describe("physics rules", () => {
  it("a ball rests on an unpulled pin and falls into the cup when it is pulled", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#.#", "#U#"));
    expect(g.state.balls[0]).toMatchObject({ x: 1, y: 0 });
    expect(g.status()).toBe("playing");
    const frames = g.pull(0)!;
    expect(frames.length).toBeGreaterThan(1);
    expect(g.state.collected).toBe(1);
    expect(g.status()).toBe("won");
  });

  it("balls placed in the air settle before play starts", () => {
    const s = parseLevel(lvl("#g#", "#.#", "#.#", "###"));
    expect(s.balls[0]).toMatchObject({ x: 1, y: 2 });
  });

  it("slides carry balls sideways", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#>U"));
    g.pull(0);
    expect(g.status()).toBe("won");
  });

  it("balls stack on each other", () => {
    const s = parseLevel(lvl("#g#", "#g#", "#.#", "###"));
    const ys = s.balls.map((b) => b.y).sort();
    expect(ys).toEqual([1, 2]);
  });

  it("a rock in the cup loses", () => {
    const g = new PinDropGame(lvl("#r#g#", "#P#P#", "#U#.#", "#####"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("rock");
  });

  it("a rock touching a colored ball destroys it and loses", () => {
    const g = new PinDropGame(lvl("#.r#", "#.P#", "#g.#", "####"));
    expect(g.status()).toBe("playing");
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("crush");
  });

  it("running out of pins with balls stranded loses", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "###"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("stuck");
  });

  it("cannot pull a pulled pin or pull after the game ended", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#U#"));
    expect(g.pull(0)).not.toBeNull();
    expect(g.pull(0)).toBeNull();
    expect(pullPin(g.state, 3)).toBeNull();
  });

  it("is deterministic", () => {
    const run = () => {
      const g = new PinDropGame(getLevel(12));
      const sol = solve(getLevel(12))!;
      for (const i of sol) g.pull(i);
      return JSON.stringify(g.state);
    };
    expect(run()).toBe(run());
  });
});

describe("session", () => {
  it("supports undo and restart", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#.#", "#U#"));
    const before = JSON.stringify(g.state);
    expect(g.canUndo()).toBe(false);
    g.pull(0);
    expect(g.canUndo()).toBe(true);
    expect(g.undo()).toBe(true);
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.undo()).toBe(false);
    g.pull(0);
    g.restart();
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.canUndo()).toBe(false);
  });

  it("a lost game can be undone back to playing", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "###"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    g.undo();
    expect(g.status()).toBe("playing");
  });
});

describe("levels", () => {
  it("has at least 20 levels", () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(20);
  });

  it("every level starts playable (no instant loss/win), with goods, rocks and pins", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const s = parseLevel(getLevel(i));
      expect(s.lost, `level ${i + 1}`).toBeNull();
      expect(status(s), `level ${i + 1}`).toBe("playing");
      expect(s.totalGood).toBeGreaterThanOrEqual(2);
      expect(s.balls.some((b) => b.kind === "rock")).toBe(true);
      expect(s.pins.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("every level is solvable (solver finds a replayable pin order)", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const level = getLevel(i);
      const sol = solve(level);
      expect(sol, `level ${i + 1} unsolved`).not.toBeNull();
      expect(replay(level, sol!), `level ${i + 1} replay`).toBe("won");
    }
  });

  it("difficulty rises: later levels need more pulls and have a smaller winning fraction", () => {
    const rate = (i: number) => {
      const a = analyze(getLevel(i));
      return { frac: a.wins / a.sequences, min: a.minPulls };
    };
    const early = rate(0);
    const late = rate(LEVEL_COUNT - 1);
    expect(late.min).toBeGreaterThan(early.min);
    expect(late.frac).toBeLessThan(early.frac);
    expect(PLANS.filter((p) => p.tiers === 3).length).toBeGreaterThan(10);
  });

  it("some pin orders lose on every non-trivial level (puzzles are not luck-proof)", () => {
    for (let i = 4; i < LEVEL_COUNT; i++) {
      const a = analyze(getLevel(i));
      expect(a.wins, `level ${i + 1}`).toBeLessThan(a.sequences);
    }
  });
});
