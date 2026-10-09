// Tile Trio levels: 50 levels in 5 worlds, solvable by construction. A level is built in steps:
//  1. a layered layout cut into a board shape (block, tri, twin, diamond, cross, ring, heart,
//     bowtie), upper layers shrinking by one cell and shifted half a tile,
//  2. a few tiles are frozen (ice) in later levels,
//  3. a legal removal order (a random linear extension of the "covers" relation that also
//     respects the ice thaw counts),
//  4. symbols dealt along that order so the tray never holds more than `cap` tiles.
// Following that order wins, so it is a witness; the DFS solver in logic.ts is run over every
// level in logic.test.ts as a second, independent check. Everything is seeded (no
// Math.random), so the levels are identical on every device and every run.
import {
  computeCovers,
  dealAlong,
  legalOrder,
  peakOf,
  TILE_UNITS,
  type Tile,
  type TileLevel,
} from "./logic";

export type Shape = "block" | "tri" | "twin" | "diamond" | "cross" | "ring" | "heart" | "bowtie";

export interface LevelPlan {
  shape: Shape;
  layers: number;
  cols: number;
  rows: number;
  /** Chance a cell on upper layers exists (the bottom layer is always full). */
  density: number;
  /** Number of distinct symbols. */
  symbols: number;
  /** How many symbols may be open (partly in the tray) at once in the witness order. */
  active: 1 | 2 | 3;
  /** Largest tray size the witness order reaches (4-5 for the later levels). */
  cap: number;
  /** Number of frozen tiles. */
  ice: number;
  /** Covered tiles hide their symbol. */
  fog: boolean;
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

export const WORLDS = [
  { name: "Orchard", from: 1 },
  { name: "Gem Cave", from: 11 },
  { name: "Foggy Woods", from: 21 },
  { name: "Crystal Market", from: 31 },
  { name: "Starlit Summit", from: 41 },
] as const;

const p = (
  shape: Shape,
  layers: number,
  cols: number,
  rows: number,
  density: number,
  symbols: number,
  active: 1 | 2 | 3,
  cap: number,
  ice: number,
  fog: boolean,
  seed: number,
): LevelPlan => ({ shape, layers, cols, rows, density, symbols, active, cap, ice, fog, seed });

export const PLANS: readonly LevelPlan[] = [
  // World 1: Orchard. Plain boards, learning the tray.
  p("block", 1, 3, 3, 1, 3, 1, 2, 0, false, 101),
  p("block", 1, 4, 3, 1, 4, 1, 3, 0, false, 102),
  p("block", 2, 4, 3, 1, 4, 1, 3, 0, false, 103),
  p("twin", 2, 5, 4, 1, 5, 2, 4, 0, false, 104),
  p("block", 2, 4, 4, 0.9, 5, 2, 4, 0, false, 105),
  p("tri", 2, 5, 5, 1, 5, 2, 4, 0, false, 106),
  p("block", 3, 5, 4, 0.85, 6, 2, 4, 0, false, 107),
  p("twin", 3, 6, 5, 0.9, 6, 2, 4, 0, false, 108),
  p("tri", 3, 5, 6, 0.9, 6, 2, 4, 0, false, 109),
  p("block", 3, 5, 5, 0.85, 6, 3, 4, 0, false, 110),
  // World 2: Gem Cave. New board shapes, then frozen tiles.
  p("diamond", 3, 5, 5, 1, 6, 2, 4, 2, false, 111),
  p("cross", 3, 5, 5, 1, 7, 2, 4, 2, false, 112),
  p("diamond", 3, 6, 6, 0.9, 7, 2, 4, 3, false, 113),
  p("twin", 3, 6, 5, 0.9, 7, 3, 4, 3, false, 114),
  p("cross", 3, 6, 6, 0.9, 7, 3, 4, 3, false, 115),
  p("ring", 3, 6, 6, 0.9, 8, 2, 4, 3, false, 116),
  p("diamond", 4, 6, 7, 0.9, 8, 3, 4, 4, false, 117),
  p("ring", 4, 6, 6, 0.9, 8, 3, 4, 4, false, 118),
  p("cross", 4, 6, 7, 0.9, 8, 3, 4, 4, false, 119),
  p("diamond", 4, 7, 7, 0.9, 8, 3, 4, 5, false, 120),
  // World 3: Foggy Woods. Covered tiles hide their symbol.
  p("block", 3, 5, 5, 0.9, 7, 2, 4, 0, true, 121),
  p("heart", 3, 6, 6, 1, 8, 2, 4, 0, true, 122),
  p("tri", 3, 6, 7, 0.95, 8, 2, 4, 2, true, 123),
  p("bowtie", 3, 6, 6, 1, 8, 3, 4, 2, true, 124),
  p("heart", 4, 6, 6, 0.95, 9, 3, 4, 3, true, 125),
  p("ring", 4, 6, 7, 0.9, 9, 3, 4, 3, true, 126),
  p("bowtie", 4, 6, 7, 0.95, 9, 3, 4, 4, true, 127),
  p("heart", 4, 7, 7, 0.9, 9, 3, 4, 4, true, 128),
  p("cross", 4, 7, 7, 0.95, 10, 3, 4, 4, true, 129),
  p("tri", 4, 7, 8, 0.9, 10, 3, 4, 5, true, 130),
  // World 4: Crystal Market. Everything together, bigger boards.
  p("diamond", 4, 7, 7, 0.95, 10, 3, 4, 4, true, 131),
  p("heart", 4, 7, 7, 1, 10, 3, 4, 5, true, 132),
  p("bowtie", 4, 7, 8, 0.95, 10, 3, 4, 5, true, 133),
  p("ring", 5, 7, 7, 0.85, 10, 3, 4, 5, true, 134),
  p("twin", 5, 7, 7, 0.95, 11, 3, 4, 5, true, 135),
  p("cross", 5, 7, 8, 0.85, 11, 3, 4, 6, true, 136),
  p("diamond", 5, 7, 8, 0.9, 11, 3, 4, 6, true, 137),
  p("heart", 5, 7, 8, 0.95, 11, 3, 4, 6, true, 138),
  p("tri", 5, 7, 9, 0.85, 11, 3, 4, 6, true, 139),
  p("ring", 5, 7, 8, 0.85, 11, 3, 4, 6, true, 140),
  // World 5: Starlit Summit. All twelve symbols.
  p("bowtie", 5, 7, 8, 0.95, 12, 3, 4, 6, true, 141),
  p("heart", 5, 7, 8, 1, 12, 3, 4, 6, true, 142),
  p("diamond", 5, 7, 9, 0.95, 12, 3, 4, 7, true, 143),
  p("cross", 5, 7, 9, 0.8, 12, 3, 4, 7, true, 144),
  p("ring", 5, 7, 9, 0.75, 12, 3, 4, 7, true, 145),
  p("tri", 5, 7, 9, 1, 12, 3, 4, 7, true, 146),
  p("twin", 5, 7, 9, 0.9, 12, 3, 4, 8, true, 147),
  p("heart", 5, 7, 9, 1, 12, 3, 4, 8, true, 148),
  p("bowtie", 5, 7, 9, 1, 12, 3, 4, 8, true, 149),
  p("block", 5, 7, 8, 0.7, 12, 3, 4, 8, true, 150),
];

export const LEVEL_COUNT = PLANS.length;
export const MAX_SYMBOLS = 12;

export interface BuiltLevel extends TileLevel {
  /** A legal tap order that wins (the construction witness). */
  witness: number[];
  /** Board size in units. */
  width: number;
  height: number;
  /** Tray peak of the witness order (the level's "par"). */
  par: number;
  plan: LevelPlan;
}

/** Whether cell (i, j) of a cols x rows grid belongs to the shape (mirror symmetric). */
export function inShape(shape: Shape, i: number, j: number, cols: number, rows: number): boolean {
  const nx = ((i + 0.5) / cols) * 2 - 1;
  const ny = ((j + 0.5) / rows) * 2 - 1;
  switch (shape) {
    case "block":
      return true;
    case "tri":
      return Math.abs(nx) <= (ny + 1) / 2 + 0.12;
    case "twin":
      return Math.abs(nx) >= 0.3;
    case "diamond":
      return Math.abs(nx) + Math.abs(ny) <= 1.1;
    case "cross":
      return Math.abs(nx) <= 0.45 || Math.abs(ny) <= 0.45;
    case "ring":
      return Math.abs(nx) > 0.4 || Math.abs(ny) > 0.4;
    case "bowtie":
      return Math.abs(nx) >= Math.abs(ny) * 0.8 + 0.1;
    case "heart": {
      const x = nx * 1.25;
      const y = -ny * 1.2 + 0.25;
      return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0;
    }
  }
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
        if (!inShape(plan.shape, i, j, cols, rows)) continue;
        const keep = z === 0 || rnd() < plan.density;
        if (!keep) continue;
        const mirror = cols - 1 - i;
        const ys = j * TILE_UNITS + z;
        cells.push({ x: i * TILE_UNITS + z, y: ys, z });
        if (mirror !== i) cells.push({ x: mirror * TILE_UNITS + z, y: ys, z });
      }
    }
  }
  // Total must be a multiple of 3: drop top-most tiles.
  while (cells.length % 3 !== 0) {
    let top = 0;
    for (let i = 1; i < cells.length; i++) if (cells[i]!.z >= cells[top]!.z) top = i;
    cells.splice(top, 1);
  }
  const tiles: Tile[] = cells.map((c, i) => ({ id: i, x: c.x, y: c.y, z: c.z, type: 0 }));
  const covers = computeCovers(tiles);
  const none = tiles.map(() => false);

  // Frozen tiles: thaw after 3 + a few taps. Retry the layout of ice until a legal order exists.
  let witness: number[] | null = null;
  for (let attempt = 0; attempt < 40 && !witness; attempt++) {
    for (const t of tiles) delete t.ice;
    const ids = tiles.map((t) => t.id);
    for (let k = 0; k < plan.ice && ids.length; k++) {
      const at = Math.floor(rnd() * ids.length);
      const id = ids.splice(at, 1)[0]!;
      tiles[id]!.ice = 3 + Math.floor(rnd() * Math.min(10, 3 + plan.ice));
    }
    witness = legalOrder(tiles, covers, none, 0, rnd);
  }
  if (!witness) throw new Error("tile-trio: no legal order for plan " + plan.seed);

  // Deal symbols along the order. Which symbols appear is a seeded pick from all twelve.
  const kinds = Math.min(plan.symbols, tiles.length / 3);
  const all = Array.from({ length: MAX_SYMBOLS }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const groups = tiles.length / 3;
  const pool = new Array<number>(MAX_SYMBOLS).fill(0);
  for (let g = 0; g < groups; g++) pool[all[g % kinds]!]! += 3;
  const zeros = new Array<number>(MAX_SYMBOLS).fill(0);
  let deal: number[] | null = null;
  for (let attempt = 0; attempt < 50 && !deal; attempt++) {
    deal = dealAlong(tiles.length, pool, zeros, plan.cap, rnd, plan.active);
  }
  if (!deal) throw new Error("tile-trio: no deal for plan " + plan.seed);
  witness.forEach((id, i) => (tiles[id]!.type = deal![i]!));

  const maxX = Math.max(...tiles.map((t) => t.x)) + TILE_UNITS;
  const maxY = Math.max(...tiles.map((t) => t.y)) + TILE_UNITS;
  const built: BuiltLevel = {
    tiles,
    fog: plan.fog,
    witness,
    width: maxX,
    height: maxY,
    par: 0,
    plan,
  };
  built.par = peakOf(built, witness);
  return built;
}

const cache = new Map<number, BuiltLevel>();

export function getLevel(index: number): BuiltLevel {
  const i = Math.max(0, Math.min(PLANS.length - 1, index));
  let lv = cache.get(i);
  if (!lv) {
    lv = buildLevel(PLANS[i]!);
    cache.set(i, lv);
  }
  return lv;
}

/** Tray size that still earns 3 stars / 2 stars for a level (see README, "Stars"). */
export function starLimits(par: number): { three: number; two: number } {
  const three = Math.min(par + 1, 5);
  return { three, two: Math.min(three + 1, 6) };
}
