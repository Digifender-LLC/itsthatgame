// Offline level generator. `levelData.ts` is generated from this file and committed; the game
// never runs the generator at runtime. To regenerate after changing it:
//
//   write renderLevelData(generateAll()) to src/levelData.ts from a throwaway vitest file
//   (there is no tsx in this repo), then run prettier on it. generate.test.ts fails whenever
//   the committed file and the generator disagree.
//
// Method (per level): scatter points, add edges shortest-first only while they cross nothing
// (a triangulation, so a crossing-free drawing exists by construction), keep a spanning tree
// plus extra edges up to a density target, pick pinned nodes and rigid pairs, then build the
// start layout by displacing `par` movable units (single nodes or pairs) of that solution.
// Each displaced unit is kept only if displacing it alone already creates a crossing, so every
// counted drag is necessary and par is honest.
import { crossingCount, edgesCross, type Edge, type Point } from "./logic";

export interface RawLevel {
  n: number;
  edges: [number, number][];
  /** Solution layout, [x, y] pairs rounded to 3 decimals. */
  sol: [number, number][];
  start: [number, number][];
  pins: number[];
  pairs: [number, number][];
  par: number;
}

export const LEVEL_COUNT = 60;
/** Height of the board relative to its width; distances are measured with y scaled by this. */
const ASPECT = 1.5;
const MARGIN = 0.06;

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

const dist = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + ((a.y - b.y) * ASPECT) ** 2);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function nodeCountFor(index: number): number {
  return 5 + Math.round((index * 21) / (LEVEL_COUNT - 1));
}
export function pinCountFor(index: number): number {
  return index < 20 ? 0 : Math.min(5, 1 + Math.floor((index - 20) / 7));
}
export function pairCountFor(index: number): number {
  return index < 30 ? 0 : Math.min(4, 1 + Math.floor((index - 30) / 10));
}
export function parTargetFor(index: number): number {
  return 2 + Math.floor(index / 7);
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
    if (pts.every((q) => dist(q, p) >= d)) {
      pts.push({ x: round3(p.x), y: round3(p.y) });
      tries = 0;
    } else if (++tries > 400) {
      d *= 0.92;
      tries = 0;
    }
  }
  return pts;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const ax = a.x;
  const ay = a.y * ASPECT;
  const dx = b.x - ax;
  const dy = b.y * ASPECT - ay;
  const px = p.x;
  const py = p.y * ASPECT;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function planarEdges(pts: Point[]): Edge[] {
  const cands: Edge[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) cands.push([i, j]);
  const len = (e: Edge) => dist(pts[e[0]]!, pts[e[1]]!);
  cands.sort((a, b) => len(a) - len(b));
  const kept: Edge[] = [];
  for (const e of cands) {
    const a = pts[e[0]]!;
    const b = pts[e[1]]!;
    // keep every thread clear of other beads (>= 0.035 board widths)
    if (pts.some((p, k) => k !== e[0] && k !== e[1] && distToSegment(p, a, b) < 0.035)) continue;
    if (kept.every((f) => !edgesCross(e, f, pts))) kept.push(e);
  }
  return kept;
}

export function generateLevel(index: number): RawLevel {
  const n = nodeCountFor(index);
  const rng = mulberry32(0x7a11 + index * 104729);
  const sol = scatter(n, rng, 0.7 / Math.sqrt(n * ASPECT));
  const all = planarEdges(sol);

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
  const density = 1.25 + 0.4 * (index / (LEVEL_COUNT - 1));
  const target = Math.min(all.length, Math.round(n * density));
  const edges: Edge[] = [
    ...tree,
    ...shuffle(rest, rng).slice(0, Math.max(0, target - tree.length)),
  ];
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Pinned nodes: well-connected nodes, preferring ones far from earlier pins.
  const deg = new Array<number>(n).fill(0);
  for (const [a, b] of edges) {
    deg[a]!++;
    deg[b]!++;
  }
  const pins: number[] = [];
  const pinWant = pinCountFor(index);
  while (pins.length < pinWant) {
    const pool = shuffle(
      Array.from({ length: n }, (_, i) => i).filter((i) => !pins.includes(i) && deg[i]! >= 2),
      rng,
    ).slice(0, 5);
    pool.sort(
      (a, b) =>
        Math.min(...pins.map((p) => dist(sol[b]!, sol[p]!)), 9) -
        Math.min(...pins.map((p) => dist(sol[a]!, sol[p]!)), 9),
    );
    pins.push(pool[0]!);
  }
  pins.sort((a, b) => a - b);

  // Rigid pairs: short threads between two free nodes.
  const pairs: [number, number][] = [];
  const used = new Set<number>(pins);
  const pairEdges = shuffle(
    edges.filter((e) => dist(sol[e[0]]!, sol[e[1]]!) < 0.3),
    rng,
  );
  for (const e of pairEdges) {
    if (pairs.length >= pairCountFor(index)) break;
    if (used.has(e[0]) || used.has(e[1])) continue;
    pairs.push([e[0], e[1]]);
    used.add(e[0]);
    used.add(e[1]);
  }

  // Movable units: [lead, partner or -1].
  const units: [number, number][] = [];
  const inPair = new Set(pairs.flat());
  for (const [a, b] of pairs) units.push([a, b]);
  for (let i = 0; i < n; i++) if (!pins.includes(i) && !inPair.has(i)) units.push([i, -1]);

  const withUnitAt = (base: Point[], u: [number, number], dx: number, dy: number): Point[] => {
    const out = base.map((p) => ({ ...p }));
    out[u[0]] = { x: round3(sol[u[0]]!.x + dx), y: round3(sol[u[0]]!.y + dy) };
    if (u[1] >= 0) out[u[1]] = { x: round3(sol[u[1]]!.x + dx), y: round3(sol[u[1]]!.y + dy) };
    return out;
  };
  const inside = (p: Point) => p.x >= 0.03 && p.x <= 0.97 && p.y >= 0.03 && p.y <= 0.97;

  const wantPar = Math.min(parTargetFor(index), units.length);
  let bestStart: Point[] = sol;
  let bestPar = 0;
  for (let attempt = 0; attempt < 600 && bestPar < wantPar; attempt++) {
    const chosen = shuffle(units, rng).slice(0, wantPar);
    let cand = sol.map((p) => ({ ...p }));
    const placed: [number, number][] = [];
    for (const u of chosen) {
      // random spot 0.25 to 0.6 away from home, not on top of another bead
      for (let t = 0; t < 40; t++) {
        const dx = round3(rng() - sol[u[0]]!.x);
        const dy = round3(rng() - sol[u[0]]!.y);
        const next = withUnitAt(cand, u, dx, dy);
        const movedNodes = u[1] >= 0 ? [u[0], u[1]] : [u[0]];
        if (!movedNodes.every((m) => inside(next[m]!))) continue;
        const travel = Math.sqrt(dx * dx + (dy * ASPECT) ** 2);
        if (travel < 0.25 || travel > 0.6) continue;
        const clear = movedNodes.every((m) =>
          next.every((q, k) => k === m || movedNodes.includes(k) || dist(q, next[m]!) > 0.07),
        );
        if (!clear) continue;
        cand = next;
        placed.push(u);
        break;
      }
    }
    // keep a unit only if displacing it alone (everything else at home) makes a crossing
    const keepers = placed.filter((u) => {
      const alone = withUnitAt(sol, u, cand[u[0]]!.x - sol[u[0]]!.x, cand[u[0]]!.y - sol[u[0]]!.y);
      return crossingCount(edges, alone) > 0;
    });
    const start = sol.map((p) => ({ ...p }));
    for (const u of keepers) {
      start[u[0]] = cand[u[0]]!;
      if (u[1] >= 0) start[u[1]] = cand[u[1]]!;
    }
    if (keepers.length > bestPar && crossingCount(edges, start) > 0) {
      bestPar = keepers.length;
      bestStart = start;
    }
  }
  if (bestPar === 0) throw new Error(`level ${index + 1}: could not build a start layout`);
  return {
    n,
    edges: edges.map((e) => [e[0], e[1]]),
    sol: sol.map((p) => [p.x, p.y]),
    start: bestStart.map((p) => [p.x, p.y]),
    pins,
    pairs,
    par: bestPar,
  };
}

export function generateAll(): RawLevel[] {
  return Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i));
}

export function renderLevelData(levels: RawLevel[]): string {
  const row = (l: RawLevel) =>
    `  {\n    n: ${l.n},\n    edges: ${JSON.stringify(l.edges)},\n    sol: ${JSON.stringify(l.sol)},\n    start: ${JSON.stringify(l.start)},\n    pins: ${JSON.stringify(l.pins)},\n    pairs: ${JSON.stringify(l.pairs)},\n    par: ${l.par},\n  },`;
  return `// GENERATED by src/generate.ts (see its header to regenerate). Do not edit by hand.
import type { RawLevel } from "./generate";

export const LEVEL_DATA: RawLevel[] = [
${levels.map(row).join("\n")}
];
`;
}
