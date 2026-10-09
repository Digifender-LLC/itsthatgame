import { describe, expect, it } from "vitest";
import { LEVELS, LEVEL_COUNT, WORLDS, introFor } from "./levels";
import { Board, hintFor, parseLevel, requiredCount, verifyPath } from "./logic";

// 3x2:  a b c / d # e   (start d)
const tiny = parseLevel(0, ["...", "S#."], [3, 0, 1, 2, 5]);

describe("Board basics", () => {
  it("extends, backtracks, blocks", () => {
    const b = new Board(tiny);
    expect(b.step(4)).toBe("blocked");
    expect(b.step(1)).toBe("blocked");
    expect(b.step(0)).toBe("extended");
    expect(b.step(1)).toBe("extended");
    expect(b.step(0)).toBe("backtracked");
    expect(b.path).toEqual([3, 0]);
    expect(b.step(0)).toBe("none");
    b.step(1);
    b.step(2);
    expect(b.isWon()).toBe(false);
    b.step(5);
    expect(b.isWon()).toBe(true);
    expect(b.moves()).toEqual([]);
  });

  it("popMove and reset", () => {
    const b = new Board(tiny);
    b.step(0);
    b.step(1);
    b.popMove();
    expect(b.path).toEqual([3, 0]);
    b.reset();
    expect(b.path).toEqual([3]);
    expect(b.popMove()).toBe(false);
  });
});

describe("twists", () => {
  it("bend tiles force a turn", () => {
    // S . t .   row 0 ; open row 1 below
    const l = parseLevel(1, ["S.t.", "...."], [0]);
    const b = new Board(l);
    b.step(1);
    b.step(2); // on the bend, arrived heading right
    expect(b.moves().sort()).toEqual([6]); // only down (up is off-grid, right is straight)
  });

  it("crossings are passed twice, once per axis, straight through", () => {
    // 3x3 with the centre a crossing. Start top-left.
    const l = parseLevel(2, ["S..", ".x.", "..."], []);
    const b = new Board(l);
    expect(requiredCount(l)).toBe(10);
    b.step(3); // down
    b.step(4); // into crossing heading down... wait: 3 -> 4 is horizontal
    expect(b.path).toEqual([0, 3, 4]);
    expect(b.moves()).toEqual([5]); // must go straight (right)
    b.step(5);
    b.step(2);
    b.step(1);
    expect(b.moves()).toEqual([4]); // cross vertically (down), horizontal is used up
    b.step(4);
    expect(b.moves()).toEqual([7]); // straight down only
    expect(b.visitCount(4)).toBe(2);
    b.popMove();
    expect(b.visitCount(4)).toBe(1);
    expect(b.moves()).toEqual([4]);
  });

  it("portals teleport to the twin and undo as one step", () => {
    const l = parseLevel(3, ["S1..", "...1"], []);
    const b = new Board(l);
    expect(b.step(1)).toBe("extended");
    expect(b.path).toEqual([0, 1, 7]);
    expect(b.head()).toBe(7);
    b.popMove();
    expect(b.path).toEqual([0]);
  });

  it("stuck detection never fires along a stored solution", () => {
    for (const level of LEVELS) {
      const b = new Board(level);
      for (let k = 1; k < level.solution.length; k++) {
        if (b.path.length !== k) continue; // portal landing already added
        expect(b.isStuck(), `level ${level.id} step ${k}`).toBe(false);
        expect(b.push(level.solution[k]!)).toBe(true);
      }
      expect(b.isWon()).toBe(true);
    }
  });
});

describe("levels", () => {
  it("has 60 levels in 6 worlds aligned to rows of 5", () => {
    expect(LEVEL_COUNT).toBe(60);
    expect(WORLDS.map((w) => w.from)).toEqual([1, 11, 21, 31, 41, 51]);
  });

  it("every stored solution passes the independent verifier and replays to a win", () => {
    for (const level of LEVELS) {
      expect(verifyPath(level, level.solution), `level ${level.id}`).toBe(true);
      const b = new Board(level);
      for (let k = 1; k < level.solution.length; k++) {
        if (b.path.length === k) expect(b.push(level.solution[k]!)).toBe(true);
      }
      expect(b.isWon(), `level ${level.id}`).toBe(true);
    }
  });

  it("the search solver finds solutions for the smaller levels", () => {
    for (const level of LEVELS) {
      if (level.cols * level.rows > 25) continue;
      const b = new Board(level);
      const rest = b.solve(2_000_000);
      expect(rest, `level ${level.id}`).not.toBeNull();
      expect(verifyPath(level, [level.start, ...rest!])).toBe(true);
    }
  });

  it("twists first appear with an intro banner", () => {
    const first = (pred: (i: number) => boolean) => LEVELS.findIndex((_, i) => pred(i));
    const firstWalls = first((i) => LEVELS[i]!.walls.length > 0);
    const firstTurn = first((i) => LEVELS[i]!.turns.length > 0);
    const firstBridge = first((i) => LEVELS[i]!.bridges.length > 0);
    const firstPortal = first((i) => LEVELS[i]!.portals.length > 0);
    for (const i of [firstWalls, firstTurn, firstBridge, firstPortal]) {
      expect(introFor(i), `intro at level ${i + 1}`).toBeTruthy();
    }
    expect([firstTurn, firstBridge, firstPortal]).toEqual([10, 20, 30]);
  });

  it("grids stay phone friendly", () => {
    for (const l of LEVELS) {
      expect(l.cols).toBeLessThanOrEqual(7);
      expect(l.rows).toBeLessThanOrEqual(9);
    }
  });
});

describe("hints", () => {
  it("reveals the next 3 solution cells while on the solution", () => {
    const level = LEVELS[12]!;
    const b = new Board(level);
    const r = hintFor(b, 3)!;
    expect(r.rewindTo).toBeNull();
    expect(r.cells).toEqual(level.solution.slice(1, 4));
  });

  it("recovers when the player wandered off, and the hint is playable", () => {
    for (const level of [LEVELS[12]!, LEVELS[35]!, LEVELS[55]!]) {
      const b = new Board(level);
      // wander: take the first legal move that differs from the solution
      const m = b.moves().find((n) => n !== level.solution[1]);
      if (m !== undefined) b.push(m);
      const r = hintFor(b, 3)!;
      if (r.rewindTo !== null) b.rewindTo(r.rewindTo);
      for (const c of r.cells) {
        if (b.path.includes(c) && b.kind[c] !== 3) continue;
        expect(b.landing(c), `level ${level.id} cell ${c}`).toBeGreaterThanOrEqual(0);
        b.push(c);
      }
    }
  });
});
