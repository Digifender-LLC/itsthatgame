import { describe, expect, it } from "vitest";
import { LEVELS, LEVEL_COUNT, generateLevel } from "./levels";
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
  restart,
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
    const from = { ...s.pos[0]! };
    s = moveNode(s, 0, P(5, -3));
    expect(s.pos[0]).toEqual({ x: 1, y: 0 });
    s = commitMove(s, 0, from);
    expect(s.history.length).toBe(1);
    s = undo(s);
    expect(s.pos[0]).toEqual(from);
    expect(undo(s)).toBe(s);
    s = moveNode(s, 1, P(0.5, 0.5));
    expect(restart(s).pos).toEqual(level.start);
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

describe("untangle levels", () => {
  it("has at least 20 levels with rising node counts", () => {
    expect(LEVELS.length).toBe(LEVEL_COUNT);
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.nodeCount).toBeGreaterThanOrEqual(LEVELS[i - 1]!.nodeCount);
    }
    expect(LEVELS[LEVELS.length - 1]!.nodeCount).toBeGreaterThan(LEVELS[0]!.nodeCount);
  });
  it("is deterministic", () => {
    expect(generateLevel(7)).toEqual(LEVELS[7]);
  });

  for (const level of LEVELS) {
    it(`level ${level.id} (${level.nodeCount} nodes, ${level.edges.length} edges) is solvable and starts tangled`, () => {
      expect(level.solution.length).toBe(level.nodeCount);
      expect(level.start.length).toBe(level.nodeCount);
      // every endpoint valid, no self loops or duplicate edges
      const keys = new Set(level.edges.map((e) => `${e[0]}-${e[1]}`));
      expect(keys.size).toBe(level.edges.length);
      for (const [a, b] of level.edges) {
        expect(a).not.toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(level.nodeCount);
      }
      // positions normalized
      for (const p of [...level.solution, ...level.start]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
      expect(crossingCount(level.edges, level.solution)).toBe(0);
      expect(crossingEdgeSet(level.edges, level.solution).size).toBe(0);
      expect(crossingCount(level.edges, level.start)).toBeGreaterThan(0);
    });
  }
});
