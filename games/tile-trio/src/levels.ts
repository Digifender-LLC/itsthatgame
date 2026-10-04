// Tile Trio levels: solvable by construction. A level is built in three steps:
//  1. a layered layout (pyramid of lattices, holes cut by a seeded RNG),
//  2. a legal removal order (a random linear extension of the "covers" relation),
//  3. symbols dealt along that order in triples, with at most `active` triples open at once.
// Taking tiles in that order never leaves more than 2 * active tiles in the 7-slot tray,
// so the order is a witness that the level can be won. The DFS solver in logic.ts is run
// over every level in logic.test.ts as a second, independent check. No Math.random.
import { computeCovers, TILE_UNITS, type Tile, type TileLevel } from "./logic";

export interface LevelPlan {
  layers: number;
  cols: number;
  rows: number;
  /** Chance a cell on upper layers exists (the bottom layer is always full). */
  density: number;
  /** Number of distinct symbols. */
  symbols: number;
  /** How many triples may be in progress at once in the witness order (<= 3). */
  active: 1 | 2 | 3;
  seed: number;
}

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

export const PLANS: readonly LevelPlan[] = [
  { layers: 1, cols: 3, rows: 3, density: 1, symbols: 3, active: 1, seed: 11 },
  { layers: 1, cols: 4, rows: 3, density: 1, symbols: 4, active: 1, seed: 12 },
  { layers: 2, cols: 4, rows: 3, density: 1, symbols: 4, active: 1, seed: 13 },
  { layers: 2, cols: 4, rows: 4, density: 0.9, symbols: 5, active: 2, seed: 14 },
  { layers: 2, cols: 4, rows: 4, density: 0.9, symbols: 5, active: 2, seed: 15 },
  { layers: 2, cols: 5, rows: 4, density: 0.85, symbols: 6, active: 2, seed: 16 },
  { layers: 3, cols: 5, rows: 4, density: 0.85, symbols: 6, active: 2, seed: 17 },
  { layers: 3, cols: 5, rows: 4, density: 0.8, symbols: 6, active: 2, seed: 18 },
  { layers: 3, cols: 5, rows: 5, density: 0.8, symbols: 7, active: 2, seed: 19 },
  { layers: 3, cols: 5, rows: 5, density: 0.8, symbols: 7, active: 3, seed: 20 },
  { layers: 3, cols: 5, rows: 5, density: 0.85, symbols: 7, active: 3, seed: 21 },
  { layers: 3, cols: 5, rows: 6, density: 0.8, symbols: 7, active: 3, seed: 22 },
  { layers: 4, cols: 5, rows: 5, density: 0.8, symbols: 8, active: 3, seed: 23 },
  { layers: 4, cols: 5, rows: 6, density: 0.8, symbols: 8, active: 3, seed: 24 },
  { layers: 4, cols: 6, rows: 5, density: 0.8, symbols: 8, active: 3, seed: 25 },
  { layers: 4, cols: 6, rows: 6, density: 0.75, symbols: 8, active: 3, seed: 26 },
  { layers: 4, cols: 6, rows: 6, density: 0.8, symbols: 9, active: 3, seed: 27 },
  { layers: 4, cols: 6, rows: 6, density: 0.85, symbols: 9, active: 3, seed: 28 },
  { layers: 4, cols: 6, rows: 6, density: 0.9, symbols: 9, active: 3, seed: 29 },
  { layers: 4, cols: 6, rows: 7, density: 0.85, symbols: 9, active: 3, seed: 30 },
  { layers: 4, cols: 6, rows: 7, density: 0.9, symbols: 9, active: 3, seed: 31 },
  { layers: 5, cols: 6, rows: 6, density: 0.85, symbols: 9, active: 3, seed: 32 },
  { layers: 5, cols: 6, rows: 7, density: 0.85, symbols: 9, active: 3, seed: 33 },
  { layers: 5, cols: 6, rows: 7, density: 0.95, symbols: 9, active: 3, seed: 34 },
];

export const LEVEL_COUNT = PLANS.length;
export const MAX_SYMBOLS = 9;

export interface BuiltLevel extends TileLevel {
  /** A legal tap order that wins (the construction witness). */
  witness: number[];
  /** Board size in units. */
  width: number;
  height: number;
}

export function buildLevel(plan: LevelPlan): BuiltLevel {
  const rnd = mulberry32(plan.seed);
  const cells: Array<{ x: number; y: number; z: number }> = [];
  for (let z = 0; z < plan.layers; z++) {
    const cols = plan.cols - z;
    const rows = plan.rows - z;
    if (cols < 2 || rows < 2) break;
    // Mirror left/right so the layout looks deliberate.
    const half = Math.ceil(cols / 2);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < half; i++) {
        const keep = z === 0 || rnd() < plan.density;
        if (!keep) continue;
        const mirror = cols - 1 - i;
        const ys = j * TILE_UNITS + z;
        cells.push({ x: i * TILE_UNITS + z, y: ys, z });
        if (mirror !== i) cells.push({ x: mirror * TILE_UNITS + z, y: ys, z });
      }
    }
  }
  // Total must be a multiple of 3: drop top-most tiles (never the bottom layer unless needed).
  const order = (a: { z: number }, b: { z: number }) => b.z - a.z;
  while (cells.length % 3 !== 0) {
    const sorted = [...cells].sort(order);
    const top = sorted[0]!;
    const idx = cells.findIndex((c) => c === top);
    cells.splice(idx, 1);
  }
  const base: Tile[] = cells.map((c, i) => ({ id: i, x: c.x, y: c.y, z: c.z, type: 0 }));
  const covers = computeCovers(base);
  // Legal removal order: repeatedly take a random free tile.
  const left = new Set(base.map((t) => t.id));
  const witness: number[] = [];
  while (left.size) {
    const free = [...left].filter((id) => covers[id]!.every((c) => !left.has(c)));
    const pick = free[Math.floor(rnd() * free.length)]!;
    left.delete(pick);
    witness.push(pick);
  }
  // Deal symbols along the order in triples with at most `active` triples open.
  const groups = base.length / 3;
  const symbolOrder = Array.from({ length: plan.symbols }, (_, i) => i);
  for (let i = symbolOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [symbolOrder[i], symbolOrder[j]] = [symbolOrder[j]!, symbolOrder[i]!];
  }
  const open: Array<{ symbol: number; left: number }> = [];
  let nextGroup = 0;
  const tiles = base.map((t) => ({ ...t }));
  for (const id of witness) {
    while (open.length < plan.active && nextGroup < groups) {
      open.push({ symbol: symbolOrder[nextGroup % symbolOrder.length]!, left: 3 });
      nextGroup++;
    }
    const k = Math.floor(rnd() * open.length);
    const g = open[k]!;
    tiles[id]!.type = g.symbol;
    g.left--;
    if (g.left === 0) open.splice(k, 1);
  }
  const maxX = Math.max(...tiles.map((t) => t.x)) + TILE_UNITS;
  const maxY = Math.max(...tiles.map((t) => t.y)) + TILE_UNITS;
  return { tiles, witness, width: maxX, height: maxY };
}

export function getLevel(index: number): BuiltLevel {
  return buildLevel(PLANS[Math.max(0, Math.min(PLANS.length - 1, index))]!);
}
