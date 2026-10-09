// Offline level generator for Paint Path. NOT imported by the game at runtime: it is run
// from `generate.test.ts` (set PAINT_PATH_GEN=1) to write `levelData.ts`. Every level it
// returns has been replayed through `Board` and `verifyPath`, so it is solvable by
// construction and re-checked by the same rules the game uses.
import { Board, levelRows, neighbours, parseLevel, verifyPath, type Level } from "./logic";

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

export interface Spec {
  cols: number;
  rows: number;
  /** Fraction of cells that stay open before portals carve gaps (1 = fully open). */
  open: number;
  turns?: number;
  bridges?: number;
  portals?: number;
}

/** [cols, rows, open fraction, turns, bridges, portals] for each of the 60 levels. */
const T: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  // World 1: Sunrise (plain, walls from level 6)
  [3, 3, 1, 0, 0, 0],
  [3, 3, 1, 0, 0, 0],
  [3, 4, 1, 0, 0, 0],
  [4, 4, 1, 0, 0, 0],
  [4, 4, 1, 0, 0, 0],
  [4, 4, 0.85, 0, 0, 0],
  [4, 5, 0.85, 0, 0, 0],
  [5, 5, 0.9, 0, 0, 0],
  [5, 5, 0.85, 0, 0, 0],
  [5, 5, 0.8, 0, 0, 0],
  // World 2: Bends
  [4, 5, 0.9, 1, 0, 0],
  [5, 5, 0.9, 1, 0, 0],
  [5, 5, 0.88, 2, 0, 0],
  [5, 5, 0.85, 2, 0, 0],
  [5, 6, 0.88, 2, 0, 0],
  [5, 6, 0.85, 3, 0, 0],
  [6, 6, 0.9, 3, 0, 0],
  [6, 6, 0.85, 3, 0, 0],
  [6, 6, 0.85, 4, 0, 0],
  [6, 6, 0.8, 4, 0, 0],
  // World 3: Crossings
  [4, 4, 0.95, 0, 1, 0],
  [5, 5, 0.9, 0, 1, 0],
  [5, 5, 0.9, 1, 1, 0],
  [5, 5, 0.88, 0, 2, 0],
  [5, 6, 0.88, 0, 2, 0],
  [5, 6, 0.85, 2, 2, 0],
  [6, 6, 0.85, 0, 2, 0],
  [6, 6, 0.85, 2, 2, 0],
  [6, 7, 0.85, 2, 2, 0],
  [6, 7, 0.82, 2, 3, 0],
  // World 4: Portals
  [4, 4, 0.95, 0, 0, 1],
  [5, 5, 0.9, 0, 0, 1],
  [5, 5, 0.9, 1, 0, 1],
  [5, 6, 0.88, 2, 0, 1],
  [5, 6, 0.88, 0, 0, 2],
  [6, 6, 0.85, 0, 0, 2],
  [6, 6, 0.85, 2, 0, 2],
  [6, 6, 0.85, 3, 0, 2],
  [6, 7, 0.85, 2, 0, 2],
  [6, 7, 0.82, 2, 0, 3],
  // World 5: Mixer
  [5, 5, 0.9, 0, 1, 1],
  [5, 6, 0.88, 1, 1, 1],
  [6, 6, 0.88, 2, 1, 1],
  [6, 6, 0.85, 2, 2, 1],
  [6, 7, 0.85, 2, 2, 1],
  [6, 7, 0.85, 2, 2, 2],
  [7, 7, 0.85, 3, 2, 2],
  [7, 7, 0.85, 3, 2, 2],
  [7, 7, 0.82, 3, 3, 2],
  [7, 8, 0.82, 3, 3, 2],
  // World 6: Masterpiece
  [6, 7, 0.88, 3, 2, 1],
  [7, 7, 0.85, 3, 2, 2],
  [7, 8, 0.85, 3, 2, 2],
  [7, 8, 0.85, 4, 2, 2],
  [7, 8, 0.82, 4, 3, 2],
  [7, 9, 0.85, 4, 3, 2],
  [7, 9, 0.82, 4, 3, 2],
  [7, 9, 0.82, 5, 3, 2],
  [7, 9, 0.8, 5, 3, 3],
  [7, 9, 0.8, 5, 3, 3],
];

export const SPECS: Spec[] = T.map(([cols, rows, open, turns, bridges, portals]) => ({
  cols,
  rows,
  open,
  turns,
  bridges,
  portals,
}));

interface Walk {
  cells: number[];
}

/** Randomised self-avoiding walk that may cross itself straight through bridge cells. */
function carve(spec: Spec, rng: () => number): Walk | null {
  const { cols, rows } = spec;
  const total = cols * rows;
  const target = Math.max(4, Math.round(total * spec.open));
  const wantBridges = spec.bridges ?? 0;
  const grid = { cols, rows };
  // direction ids: 0 up, 1 right, 2 down, 3 left
  const step = (c: number, d: number): number => {
    const col = c % cols;
    const row = Math.floor(c / cols);
    if (d === 0) return row > 0 ? c - cols : -1;
    if (d === 2) return row < rows - 1 ? c + cols : -1;
    if (d === 1) return col < cols - 1 ? c + 1 : -1;
    return col > 0 ? c - 1 : -1;
  };
  for (let attempt = 0; attempt < 80; attempt++) {
    const start = Math.floor(rng() * total);
    const visits = new Uint8Array(total);
    const enter = new Int8Array(total).fill(-1);
    const straight = new Uint8Array(total);
    const walk: number[] = [start];
    visits[start] = 1;
    let distinct = 1;
    let bridges = 0;
    let budget = 6000;
    const free = (n: number) => {
      let f = 0;
      for (const m of neighbours(grid, n)) if (!visits[m]) f++;
      return f;
    };
    const dfs = (h: number): boolean => {
      if (distinct === target && bridges === wantBridges) return true;
      if (--budget < 0) return false;
      if (distinct >= target) return false;
      const options: { n: number; d: number; bridge: boolean; score: number }[] = [];
      for (let d = 0; d < 4; d++) {
        const n = step(h, d);
        if (n < 0) continue;
        if (!visits[n]) {
          options.push({ n, d, bridge: false, score: free(n) + rng() * 0.9 });
        } else if (
          bridges < wantBridges &&
          visits[n] === 1 &&
          straight[n] &&
          enter[n]! >= 0 &&
          (enter[n]! & 1) !== (d & 1)
        ) {
          const m = step(n, d);
          if (m >= 0 && !visits[m]) options.push({ n, d, bridge: true, score: -5 + rng() });
        }
      }
      options.sort((a, b) => a.score - b.score);
      for (const o of options) {
        const prevStraight = straight[h]!;
        if (visits[h] === 1 && enter[h]! >= 0) straight[h] = enter[h] === o.d ? 1 : 0;
        if (o.bridge) {
          const m = step(o.n, o.d);
          visits[o.n] = 2;
          visits[m] = 1;
          enter[m] = o.d;
          walk.push(o.n, m);
          distinct++;
          bridges++;
          if (dfs(m)) return true;
          bridges--;
          distinct--;
          walk.length -= 2;
          visits[m] = 0;
          enter[m] = -1;
          visits[o.n] = 1;
        } else {
          visits[o.n] = 1;
          enter[o.n] = o.d;
          walk.push(o.n);
          distinct++;
          if (dfs(o.n)) return true;
          distinct--;
          walk.pop();
          visits[o.n] = 0;
          enter[o.n] = -1;
        }
        straight[h] = prevStraight;
      }
      return false;
    };
    if (dfs(start)) return { cells: walk };
  }
  return null;
}

interface Built {
  level: Level;
}

function build(spec: Spec, id: number, rng: () => number): Built | null {
  const walk = carve(spec, rng);
  if (!walk) return null;
  const { cols, rows } = spec;
  const total = cols * rows;
  let cells = walk.cells.slice();
  const kinds = new Map<number, "t" | "p">();
  const countOf = (arr: number[], c: number) => arr.filter((x) => x === c).length;
  const portals: [number, number][] = [];

  // Portals: cut a short stretch out of the walk; the skipped cells become walls.
  for (let p = 0; p < (spec.portals ?? 0); p++) {
    const options: [number, number][] = [];
    for (let i = 1; i < cells.length - 3; i++) {
      for (let j = i + 3; j < Math.min(cells.length, i + 7); j++) {
        const a = cells[i]!;
        const b = cells[j]!;
        if (neighbours({ cols, rows }, a).includes(b)) continue;
        let ok =
          countOf(cells, a) === 1 && countOf(cells, b) === 1 && !kinds.has(a) && !kinds.has(b);
        for (let k = i + 1; k < j && ok; k++) {
          if (countOf(cells, cells[k]!) !== 1 || kinds.has(cells[k]!)) ok = false;
        }
        if (ok) options.push([i, j]);
      }
    }
    if (options.length === 0) return null;
    const [i, j] = options[Math.floor(rng() * options.length)]!;
    portals.push([cells[i]!, cells[j]!]);
    kinds.set(cells[i]!, "p");
    kinds.set(cells[j]!, "p");
    cells = [...cells.slice(0, i + 1), ...cells.slice(j)];
  }

  // Bend tiles: cells where the solution really turns.
  const bends: number[] = [];
  for (let k = 1; k < cells.length - 1; k++) {
    const a = cells[k - 1]!;
    const b = cells[k]!;
    const c = cells[k + 1]!;
    if (kinds.has(b) || countOf(cells, b) !== 1) continue;
    if (!neighbours({ cols, rows }, b).includes(a) || !neighbours({ cols, rows }, b).includes(c))
      continue;
    if (b - a !== c - b) bends.push(b);
  }
  const wantTurns = spec.turns ?? 0;
  if (bends.length < wantTurns) return null;
  const turns: number[] = [];
  while (turns.length < wantTurns) {
    const k = Math.floor(rng() * bends.length);
    turns.push(bends.splice(k, 1)[0]!);
  }

  const used = new Set(cells);
  const bridges = [...used].filter((c) => countOf(cells, c) === 2);
  if (bridges.length !== (spec.bridges ?? 0)) return null;
  const walls: number[] = [];
  for (let i = 0; i < total; i++) if (!used.has(i)) walls.push(i);
  const level: Level = {
    id,
    cols,
    rows,
    walls,
    start: cells[0]!,
    turns: turns.sort((a, b) => a - b),
    bridges: bridges.sort((a, b) => a - b),
    portals: portals.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]),
    solution: cells,
  };
  // Round-trip through the text format so what we store is exactly what the game loads.
  const parsed = parseLevel(id, levelRows(level), cells);
  if (!verifyPath(parsed, cells)) return null;
  const board = new Board(parsed);
  for (let k = 1; k < cells.length; k++) {
    if (board.path.length === k) {
      if (!board.push(cells[k]!)) return null;
    }
  }
  if (!board.isWon()) return null;
  return { level: parsed };
}

/** Generate level `index` (0-based). Deterministic. */
export function generateLevel(index: number): Level {
  const spec = SPECS[index]!;
  const rng = mulberry32(0x5eed + index * 7919);
  for (let attempt = 0; attempt < 400; attempt++) {
    const built = build(spec, index + 1, rng);
    if (built) return built.level;
  }
  throw new Error(`could not generate level ${index + 1}`);
}

/** Source text for `levelData.ts`. */
export function renderLevelData(levels: Level[]): string {
  const out: string[] = [
    "// GENERATED by generate.test.ts (PAINT_PATH_GEN=1). Do not edit by hand.",
    "// Row format: # wall, . open, S start, t bend, x crossing, 1-9 portal pair.",
    "// `solution` is a complete winning path (portal jumps list both cells).",
    "export interface LevelData {",
    "  rows: string[];",
    "  solution: number[];",
    "}",
    "",
    "export const LEVEL_DATA: LevelData[] = [",
  ];
  for (const l of levels) {
    out.push("  {");
    out.push(
      `    rows: [${levelRows(l)
        .map((r) => JSON.stringify(r))
        .join(", ")}],`,
    );
    out.push(`    solution: [${l.solution.join(", ")}],`);
    out.push("  },");
  }
  out.push("];", "");
  return out.join("\n");
}
