// Untangle: pure game logic (no DOM). Node positions are normalized to 0..1 on both axes.

export interface Point {
  x: number;
  y: number;
}

export type Edge = readonly [number, number];

export interface Level {
  /** 1-based level number. */
  id: number;
  nodeCount: number;
  edges: Edge[];
  /** A crossing-free layout of the same graph (proof of solvability). */
  solution: Point[];
  /** The scrambled starting layout (has at least one crossing). */
  start: Point[];
}

const EPS = 1e-9;

function orient(p: Point, q: Point, r: Point): number {
  const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return v > EPS ? 1 : v < -EPS ? -1 : 0;
}

/** r is known to be collinear with p-q; is it within the segment's bounding box? */
function withinSegment(p: Point, q: Point, r: Point): boolean {
  return (
    r.x >= Math.min(p.x, q.x) - EPS &&
    r.x <= Math.max(p.x, q.x) + EPS &&
    r.y >= Math.min(p.y, q.y) - EPS &&
    r.y <= Math.max(p.y, q.y) + EPS
  );
}

/**
 * Do segments a-b and c-d intersect? Touching counts (an endpoint lying on the other
 * segment, or collinear overlap). Use {@link edgesCross} for edges of a graph, which
 * excludes legitimately shared endpoints.
 */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && withinSegment(a, b, c)) return true;
  if (o2 === 0 && withinSegment(a, b, d)) return true;
  if (o3 === 0 && withinSegment(c, d, a)) return true;
  if (o4 === 0 && withinSegment(c, d, b)) return true;
  return false;
}

/**
 * Do two graph edges cross? Edges that share a node never cross at that node; they only
 * count when they overlap along a line (the two other endpoints point the same way).
 */
export function edgesCross(e: Edge, f: Edge, pos: readonly Point[]): boolean {
  const [a, b] = e;
  const [c, d] = f;
  let shared = -1;
  let eo = -1;
  let fo = -1;
  if (a === c) [shared, eo, fo] = [a, b, d];
  else if (a === d) [shared, eo, fo] = [a, b, c];
  else if (b === c) [shared, eo, fo] = [b, a, d];
  else if (b === d) [shared, eo, fo] = [b, a, c];
  if (shared >= 0) {
    if (eo === fo) return true; // duplicate edge
    const s = pos[shared]!;
    const p = pos[eo]!;
    const q = pos[fo]!;
    if (orient(s, p, q) !== 0) return false;
    return (p.x - s.x) * (q.x - s.x) + (p.y - s.y) * (q.y - s.y) > 0;
  }
  return segmentsIntersect(pos[a]!, pos[b]!, pos[c]!, pos[d]!);
}

/** All crossing edge pairs as index pairs (i < j) into `edges`. */
export function crossingPairs(edges: readonly Edge[], pos: readonly Point[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edgesCross(edges[i]!, edges[j]!, pos)) out.push([i, j]);
    }
  }
  return out;
}

export function crossingCount(edges: readonly Edge[], pos: readonly Point[]): number {
  return crossingPairs(edges, pos).length;
}

/** Set of edge indices involved in at least one crossing. */
export function crossingEdgeSet(edges: readonly Edge[], pos: readonly Point[]): Set<number> {
  const s = new Set<number>();
  for (const [i, j] of crossingPairs(edges, pos)) {
    s.add(i);
    s.add(j);
  }
  return s;
}

/** Where two properly crossing edges intersect (for drawing markers), else null. */
export function intersectionPoint(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < EPS) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

// ---- Game state ---------------------------------------------------------------------

export interface MoveRecord {
  node: number;
  from: Point;
}

export interface UntangleState {
  level: Level;
  pos: Point[];
  history: MoveRecord[];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createState(level: Level): UntangleState {
  return { level, pos: level.start.map((p) => ({ ...p })), history: [] };
}

export function crossings(state: UntangleState): number {
  return crossingCount(state.level.edges, state.pos);
}

export function isSolved(state: UntangleState): boolean {
  return crossings(state) === 0;
}

/** Move a node (position is clamped to the board). Returns a new state. */
export function moveNode(state: UntangleState, node: number, to: Point): UntangleState {
  if (node < 0 || node >= state.pos.length) return state;
  const pos = state.pos.slice();
  pos[node] = { x: clamp01(to.x), y: clamp01(to.y) };
  return { ...state, pos };
}

/** Record a completed drag so it can be undone. */
export function commitMove(state: UntangleState, node: number, from: Point): UntangleState {
  const now = state.pos[node];
  if (!now || (now.x === from.x && now.y === from.y)) return state;
  return { ...state, history: [...state.history.slice(-199), { node, from: { ...from } }] };
}

export function undo(state: UntangleState): UntangleState {
  const last = state.history[state.history.length - 1];
  if (!last) return state;
  const pos = state.pos.slice();
  pos[last.node] = { ...last.from };
  return { ...state, pos, history: state.history.slice(0, -1) };
}

export function restart(state: UntangleState): UntangleState {
  return createState(state.level);
}

/** Nearest node within `radius` (normalized units) of p, or -1. */
export function nodeAt(pos: readonly Point[], p: Point, radius: number): number {
  let best = -1;
  let bestD = radius * radius;
  pos.forEach((q, i) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
