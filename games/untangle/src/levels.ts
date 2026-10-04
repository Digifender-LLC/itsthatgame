// Untangle levels, generated from seeded planar graphs. For each level a crossing-free
// straight-line layout is built first (random points, then edges added shortest-first while
// they cross nothing), the edge list is recorded, and the nodes are then scrambled to a
// deterministic start layout that does have crossings. The stored solution layout is the
// proof of solvability.
import { crossingCount, edgesCross, type Edge, type Level, type Point } from "./logic";

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LEVEL_COUNT = 24;
const MARGIN = 0.07;

/** Node counts rise from 5 to 22 across the levels. */
export function nodeCountFor(index: number): number {
  return 5 + Math.round(index * 0.75);
}

function scatter(n: number, rng: () => number, minDist: number): Point[] {
  const pts: Point[] = [];
  let d = minDist;
  let tries = 0;
  while (pts.length < n) {
    const p = {
      x: MARGIN + rng() * (1 - 2 * MARGIN),
      y: MARGIN + rng() * (1 - 2 * MARGIN),
    };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= d)) {
      pts.push(p);
      tries = 0;
    } else if (++tries > 400) {
      d *= 0.9; // relax spacing rather than loop forever
      tries = 0;
    }
  }
  return pts;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Maximal crossing-free edge set, shortest edges first (a triangulation of the points). */
function planarEdges(pts: Point[]): Edge[] {
  const cands: Edge[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) cands.push([i, j]);
  const len = (e: Edge) => Math.hypot(pts[e[0]]!.x - pts[e[1]]!.x, pts[e[0]]!.y - pts[e[1]]!.y);
  cands.sort((a, b) => len(a) - len(b));
  const kept: Edge[] = [];
  for (const e of cands) {
    const a = pts[e[0]]!;
    const b = pts[e[1]]!;
    const passesThroughNode = pts.some(
      (p, k) => k !== e[0] && k !== e[1] && distToSegment(p, a, b) < 0.012,
    );
    if (passesThroughNode) continue;
    if (kept.every((f) => !edgesCross(e, f, pts))) kept.push(e);
  }
  return kept;
}

export function generateLevel(index: number): Level {
  const n = nodeCountFor(index);
  const rng = mulberry32(0x51ed + index * 104729);
  const solution = scatter(n, rng, 0.62 / Math.sqrt(n));
  const all = planarEdges(solution);

  // Spanning tree first (graph stays connected), then extra edges up to the density target.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const tree: Edge[] = [];
  const rest: Edge[] = [];
  for (const e of all) {
    const ra = find(e[0]);
    const rb = find(e[1]);
    if (ra !== rb) {
      parent[ra] = rb;
      tree.push(e);
    } else rest.push(e);
  }
  const density = 1.2 + 0.35 * (index / (LEVEL_COUNT - 1));
  const target = Math.min(all.length, Math.round(n * density));
  const edges: Edge[] = [
    ...tree,
    ...shuffle(rest, rng).slice(0, Math.max(0, target - tree.length)),
  ];
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Deterministic scramble: random placements, keep the first one that is tangled enough.
  const wanted = Math.max(1, Math.floor(edges.length / 4));
  let best: Point[] = solution;
  let bestCount = -1;
  for (let attempt = 0; attempt < 400; attempt++) {
    const cand = scatter(n, rng, 0.45 / Math.sqrt(n));
    const c = crossingCount(edges, cand);
    if (c > bestCount) {
      best = cand;
      bestCount = c;
    }
    if (c >= wanted) break;
  }
  return { id: index + 1, nodeCount: n, edges, solution, start: best };
}

export const LEVELS: Level[] = Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i));
