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
  /** The starting layout: the solution with `par` movable units displaced (has crossings). */
  start: Point[];
  /** Nodes that cannot be moved (same position in `start` and `solution`). */
  pinned: number[];
  /** Pairs of nodes that move together, keeping their offset. */
  pairs: [number, number][];
  /** Drags needed by the intended solution: the number of displaced units. */
  par: number;
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
  /** The whole layout before the drag. */
  before: Point[];
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

export function isPinned(level: Level, node: number): boolean {
  return level.pinned.includes(node);
}

/** The node that moves together with `node`, or -1. */
export function partnerOf(level: Level, node: number): number {
  for (const [a, b] of level.pairs) {
    if (a === node) return b;
    if (b === node) return a;
  }
  return -1;
}

/**
 * Move a node toward `to`. Pinned nodes do not move. A paired node drags its partner along
 * with the same offset; the shared translation is clamped so both stay on the board.
 * Positions are clamped to 0..1. Returns a new state.
 */
export function moveNode(state: UntangleState, node: number, to: Point): UntangleState {
  if (node < 0 || node >= state.pos.length || isPinned(state.level, node)) return state;
  const pos = state.pos.slice();
  const cur = pos[node]!;
  const partner = partnerOf(state.level, node);
  let dx = to.x - cur.x;
  let dy = to.y - cur.y;
  if (partner >= 0) {
    const q = pos[partner]!;
    dx = Math.min(Math.max(dx, -Math.min(cur.x, q.x)), 1 - Math.max(cur.x, q.x));
    dy = Math.min(Math.max(dy, -Math.min(cur.y, q.y)), 1 - Math.max(cur.y, q.y));
    pos[partner] = { x: q.x + dx, y: q.y + dy };
  } else {
    dx = clamp01(to.x) - cur.x;
    dy = clamp01(to.y) - cur.y;
  }
  pos[node] = { x: cur.x + dx, y: cur.y + dy };
  return { ...state, pos };
}

const MOVED_EPS = 0.012;

/**
 * Record a completed drag (`before` is the layout when the finger went down) so it can be
 * undone. Drags that barely moved anything are not counted.
 */
export function commitMove(state: UntangleState, before: readonly Point[]): UntangleState {
  const moved = state.pos.some((p, i) => {
    const b = before[i]!;
    return Math.hypot(p.x - b.x, p.y - b.y) > MOVED_EPS;
  });
  if (!moved) return state;
  const snapshot = before.map((p) => ({ ...p }));
  return { ...state, history: [...state.history.slice(-199), { before: snapshot }] };
}

/** Number of counted drags so far. */
export function moveCount(state: UntangleState): number {
  return state.history.length;
}

export function undo(state: UntangleState): UntangleState {
  const last = state.history[state.history.length - 1];
  if (!last) return state;
  return { ...state, pos: last.before.map((p) => ({ ...p })), history: state.history.slice(0, -1) };
}

/**
 * Star rules. `par` is the number of displaced units in the start layout (each one needs one
 * drag). 3 stars: at most ceil(1.5 x par) drags; 2 stars: at most ceil(2.5 x par) + 1.
 */
export function starLimits(par: number): [number, number] {
  return [Math.ceil(par * 1.5), Math.ceil(par * 2.5) + 1];
}

export function starsFor(par: number, moves: number): number {
  const [three, two] = starLimits(par);
  return moves <= three ? 3 : moves <= two ? 2 : 1;
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

// ---- Hints ----------------------------------------------------------------------------

export interface Relocation {
  /** The node to grab (for a pair, the first node of the pair). */
  node: number;
  /** Where that node should go (its partner follows). */
  to: Point;
  /** Crossings after the move. */
  count: number;
}

/**
 * The single drag that leaves the fewest crossings, searched over a coarse grid of spots plus
 * the known solution spot of each movable unit. Falls back to moving the most displaced unit to
 * its solution spot when no single drag reduces the count. Null when nothing can move.
 */
export function bestRelocation(state: UntangleState): Relocation | null {
  const { level } = state;
  const edges = level.edges;
  const pos = state.pos.map((p) => ({ ...p }));
  const current = crossingCount(edges, pos);
  if (current === 0) return null;
  const seen = new Set<number>();
  let best: (Relocation & { dist: number }) | null = null;
  let fallback: { node: number; to: Point; disp: number } | null = null;
  const COLS = 10;
  const ROWS = 14;
  for (let u = 0; u < level.nodeCount; u++) {
    if (seen.has(u) || isPinned(level, u)) continue;
    const v = partnerOf(level, u);
    seen.add(u);
    if (v >= 0) seen.add(v);
    const inc: number[] = [];
    const other: number[] = [];
    edges.forEach((e, k) => {
      (e[0] === u || e[1] === u || e[0] === v || e[1] === v ? inc : other).push(k);
    });
    let base = 0;
    for (let a = 0; a < other.length; a++) {
      for (let b = a + 1; b < other.length; b++) {
        if (edgesCross(edges[other[a]!]!, edges[other[b]!]!, pos)) base++;
      }
    }
    const pu = pos[u]!;
    const pv = v >= 0 ? pos[v]! : null;
    const su = level.solution[u]!;
    const disp = Math.hypot(pu.x - su.x, pu.y - su.y);
    if (!fallback || disp > fallback.disp) fallback = { node: u, to: { ...su }, disp };
    const offX = pv ? pv.x - pu.x : 0;
    const offY = pv ? pv.y - pu.y : 0;
    const tryAt = (x: number, y: number) => {
      if (pv && (x + offX < 0 || x + offX > 1 || y + offY < 0 || y + offY > 1)) return;
      if (Math.hypot(x - pu.x, y - pu.y) < 0.06) return;
      // keep clear of other beads so the hint is a spot the player can actually use
      for (let i = 0; i < pos.length; i++) {
        if (i === u || i === v) continue;
        const q = pos[i]!;
        if (Math.hypot(q.x - x, (q.y - y) * 0.7) < 0.05) return;
      }
      pos[u] = { x, y };
      if (v >= 0) pos[v] = { x: x + offX, y: y + offY };
      let c = base;
      for (let a = 0; a < inc.length && c <= (best?.count ?? 1e9); a++) {
        const ea = edges[inc[a]!]!;
        for (let b = a + 1; b < inc.length; b++) if (edgesCross(ea, edges[inc[b]!]!, pos)) c++;
        for (const o of other) if (edgesCross(ea, edges[o]!, pos)) c++;
      }
      const d = Math.hypot(x - su.x, y - su.y);
      if (!best || c < best.count || (c === best.count && d < best.dist)) {
        best = { node: u, to: { x, y }, count: c, dist: d };
      }
    };
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) tryAt((i + 0.5) / COLS, (j + 0.5) / ROWS);
    }
    tryAt(su.x, su.y);
    pos[u] = { ...pu };
    if (v >= 0) pos[v] = { ...pv! };
  }
  const b = best as (Relocation & { dist: number }) | null;
  if (b && b.count < current) return { node: b.node, to: b.to, count: b.count };
  if (fallback) return { node: fallback.node, to: fallback.to, count: current };
  return null;
}
