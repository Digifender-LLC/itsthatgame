import { describe, expect, it } from "vitest";
import { LEVELS, LEVEL_COUNT } from "./levels";
import {
  commitMove,
  createState,
  crossingCount,
  crossingEdgeSet,
  edgesCross,
  intersectionPoint,
  isSolved,
  moveNode,
  nodeAt,
  bestRelocation,
  isPinned,
  moveCount,
  partnerOf,
  restart,
  starLimits,
  starsFor,
  segmentsIntersect,
  undo,
  type Point,
} from "./logic";

const P = (x: number, y: number): Point => ({ x, y });

describe("segment intersection", () => {
  it("detects a proper X crossing", () => {
    expect(segmentsIntersect(P(0, 0), P(1, 1), P(0, 1), P(1, 0))).toBe(true);
    expect(intersectionPoint(P(0, 0), P(1, 1), P(0, 1), P(1, 0))).toEqual({ x: 0.5, y: 0.5 });
  });
  it("rejects disjoint and parallel segments", () => {
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(0, 1), P(1, 1))).toBe(false);
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(2, 0), P(3, 0))).toBe(false);
    expect(segmentsIntersect(P(0, 0), P(1, 1), P(2, 2), P(3, 3))).toBe(false);
  });
  it("counts touching and collinear overlap", () => {
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(1, 0), P(1, 1))).toBe(true); // T junction
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(1, 0), P(3, 0))).toBe(true); // overlap
  });
  it("edges sharing an endpoint do not cross", () => {
    const pos = [P(0, 0), P(1, 0), P(0, 1)];
    expect(edgesCross([0, 1], [0, 2], pos)).toBe(false);
    expect(edgesCross([0, 1], [2, 0], pos)).toBe(false);
    expect(edgesCross([1, 0], [1, 2], pos)).toBe(false);
  });
  it("edges sharing an endpoint but overlapping along a line do cross", () => {
    const pos = [P(0, 0), P(1, 0), P(2, 0)];
    expect(edgesCross([0, 1], [0, 2], pos)).toBe(true);
    const fold = [P(1, 0), P(0, 0), P(2, 0)]; // shared node 0 in the middle, opposite sides
    expect(edgesCross([0, 1], [0, 2], fold)).toBe(false);
  });
  it("is robust to nearly-collinear float noise", () => {
    expect(segmentsIntersect(P(0, 0), P(1, 1e-12), P(0.5, 1), P(0.5, 2))).toBe(false);
  });
});

describe("untangle state", () => {
  const level = LEVELS[0]!;
  it("moves with clamping, undoes and restarts", () => {
    let s = createState(level);
    const before = s.pos.map((p) => ({ ...p }));
    s = moveNode(s, 0, P(5, -3));
    expect(s.pos[0]).toEqual({ x: 1, y: 0 });
    s = commitMove(s, before);
    expect(moveCount(s)).toBe(1);
    s = undo(s);
    expect(s.pos).toEqual(before);
    expect(undo(s)).toBe(s);
    s = moveNode(s, 1, P(0.5, 0.5));
    expect(restart(s).pos).toEqual(level.start);
  });
  it("does not count drags that barely moved anything", () => {
    const s = createState(level);
    const moved = moveNode(s, 0, { x: s.pos[0]!.x + 0.002, y: s.pos[0]!.y });
    expect(commitMove(moved, s.pos).history.length).toBe(0);
  });
  it("does not mutate the level's start layout", () => {
    const before = JSON.stringify(level.start);
    moveNode(createState(level), 0, P(0.1, 0.1));
    expect(JSON.stringify(level.start)).toBe(before);
  });
  it("applying the stored solution solves the level", () => {
    let s = createState(level);
    expect(isSolved(s)).toBe(false);
    level.solution.forEach((p, i) => (s = moveNode(s, i, p)));
    expect(isSolved(s)).toBe(true);
  });
  it("nodeAt finds the nearest node within radius", () => {
    const pos = [P(0.2, 0.2), P(0.25, 0.2)];
    expect(nodeAt(pos, P(0.24, 0.2), 0.05)).toBe(1);
    expect(nodeAt(pos, P(0.9, 0.9), 0.05)).toBe(-1);
  });
});

describe("pinned nodes and twin pairs", () => {
  const pinLevel = LEVELS.find((l) => l.pinned.length > 0)!;
  const pairLevel = LEVELS.find((l) => l.pairs.length > 0)!;
  it("pinned nodes never move", () => {
    const s = createState(pinLevel);
    const pin = pinLevel.pinned[0]!;
    expect(isPinned(pinLevel, pin)).toBe(true);
    const after = moveNode(s, pin, P(0.5, 0.5));
    expect(after).toBe(s);
  });
  it("twins move together and keep their offset", () => {
    const [a, b] = pairLevel.pairs[0]!;
    expect(partnerOf(pairLevel, a)).toBe(b);
    expect(partnerOf(pairLevel, b)).toBe(a);
    const s = createState(pairLevel);
    const offX = s.pos[b]!.x - s.pos[a]!.x;
    const offY = s.pos[b]!.y - s.pos[a]!.y;
    const moved = moveNode(s, a, P(0.4, 0.45));
    expect(moved.pos[b]!.x - moved.pos[a]!.x).toBeCloseTo(offX, 9);
    expect(moved.pos[b]!.y - moved.pos[a]!.y).toBeCloseTo(offY, 9);
    // dragging past the edge clamps the shared translation so both stay on the board
    const edge = moveNode(s, a, P(9, 9));
    for (const k of [a, b]) {
      expect(edge.pos[k]!.x).toBeLessThanOrEqual(1);
      expect(edge.pos[k]!.y).toBeLessThanOrEqual(1);
    }
    expect(edge.pos[b]!.x - edge.pos[a]!.x).toBeCloseTo(offX, 9);
    expect(edge.pos[b]!.y - edge.pos[a]!.y).toBeCloseTo(offY, 9);
  });
});

describe("stars and par", () => {
  it("3 stars within ceil(1.5 x par), 2 within ceil(2.5 x par) + 1, otherwise 1", () => {
    expect(starLimits(2)).toEqual([3, 6]);
    expect(starLimits(10)).toEqual([15, 26]);
    expect(starsFor(4, 4)).toBe(3);
    expect(starsFor(4, 6)).toBe(3);
    expect(starsFor(4, 7)).toBe(2);
    expect(starsFor(4, 11)).toBe(2);
    expect(starsFor(4, 12)).toBe(1);
  });
  it("par drags (moving each displaced unit home) solve every level", () => {
    for (const level of LEVELS) {
      let s = createState(level);
      const seen = new Set<number>();
      let drags = 0;
      for (let i = 0; i < level.nodeCount; i++) {
        if (seen.has(i)) continue;
        const sol = level.solution[i]!;
        const cur = s.pos[i]!;
        const partner = partnerOf(level, i);
        seen.add(i);
        if (partner >= 0) seen.add(partner);
        if (Math.hypot(sol.x - cur.x, sol.y - cur.y) > 1e-6) {
          s = moveNode(s, i, sol);
          drags++;
        }
      }
      expect(drags, `level ${level.id}`).toBe(level.par);
      expect(isSolved(s), `level ${level.id}`).toBe(true);
    }
  });
});

describe("hints", () => {
  it("suggests a drag that reduces crossings, or a solution spot, on every level", () => {
    for (const level of LEVELS) {
      const s = createState(level);
      const r = bestRelocation(s)!;
      expect(r, `level ${level.id}`).not.toBeNull();
      expect(isPinned(level, r.node)).toBe(false);
      expect(r.count).toBeLessThanOrEqual(crossingCount(level.edges, s.pos));
      // applying it really gives that crossing count
      const after = moveNode(s, r.node, r.to);
      expect(crossingCount(level.edges, after.pos)).toBe(r.count);
    }
  });
  it("returns null on a solved board", () => {
    const level = LEVELS[3]!;
    expect(bestRelocation({ level, pos: level.solution, history: [] })).toBeNull();
  });
});

describe("untangle levels", () => {
  it("has 60 levels in six worlds with rising node counts", () => {
    expect(LEVELS.length).toBe(LEVEL_COUNT);
    expect(LEVEL_COUNT).toBe(60);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.nodeCount).toBeGreaterThanOrEqual(LEVELS[i - 1]!.nodeCount);
      expect(LEVELS[i]!.par).toBeGreaterThanOrEqual(LEVELS[i - 1]!.par);
    }
    expect(LEVELS[0]!.nodeCount).toBe(5);
    expect(LEVELS[59]!.nodeCount).toBeGreaterThanOrEqual(24);
  });
  it("introduces pins at level 21 and twins at level 31, not before", () => {
    expect(LEVELS.slice(0, 20).every((l) => l.pinned.length === 0 && l.pairs.length === 0)).toBe(
      true,
    );
    expect(LEVELS[20]!.pinned.length).toBeGreaterThan(0);
    expect(LEVELS.slice(20, 30).every((l) => l.pairs.length === 0)).toBe(true);
    expect(LEVELS[30]!.pairs.length).toBeGreaterThan(0);
  });

  for (const level of LEVELS) {
    it(`level ${level.id} (${level.nodeCount} nodes, ${level.edges.length} edges, par ${level.par}) is solvable and starts tangled`, () => {
      expect(level.solution.length).toBe(level.nodeCount);
      expect(level.start.length).toBe(level.nodeCount);
      const keys = new Set(level.edges.map((e) => `${e[0]}-${e[1]}`));
      expect(keys.size).toBe(level.edges.length);
      for (const [a, b] of level.edges) {
        expect(a).not.toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(level.nodeCount);
      }
      for (const p of [...level.solution, ...level.start]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
      // solvable: a crossing-free layout exists that respects pins and twin offsets
      expect(crossingCount(level.edges, level.solution)).toBe(0);
      expect(crossingEdgeSet(level.edges, level.solution).size).toBe(0);
      expect(crossingCount(level.edges, level.start)).toBeGreaterThan(0);
      for (const pin of level.pinned) expect(level.start[pin]).toEqual(level.solution[pin]);
      for (const [a, b] of level.pairs) {
        expect(level.pinned.includes(a) || level.pinned.includes(b)).toBe(false);
        const so = [
          level.solution[b]!.x - level.solution[a]!.x,
          level.solution[b]!.y - level.solution[a]!.y,
        ];
        const st = [level.start[b]!.x - level.start[a]!.x, level.start[b]!.y - level.start[a]!.y];
        expect(st[0]).toBeCloseTo(so[0]!, 6);
        expect(st[1]).toBeCloseTo(so[1]!, 6);
      }
      // beads are never on top of each other in the solution
      for (let i = 0; i < level.nodeCount; i++) {
        for (let j = i + 1; j < level.nodeCount; j++) {
          const d = Math.hypot(
            level.solution[i]!.x - level.solution[j]!.x,
            (level.solution[i]!.y - level.solution[j]!.y) * 1.5,
          );
          expect(d).toBeGreaterThan(0.05);
        }
      }
    });
  }
});
