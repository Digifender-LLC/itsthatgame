// Pin Drop levels: a seeded deterministic generator over a "tiered hopper" family, with the
// verified seed recorded per level. logic.test.ts re-solves every level. No Math.random.
//
// Layout: 7 columns; each tier is 2 chamber rows, a slide row and a shelf row (4 rows). A wall
// divides each tier into a left and right hopper; slides funnel balls to that hopper's gap,
// which holds a pin. Pulling a pin drops the hopper's contents into whichever hopper sits
// below the gap. The last tier's cup-side gap leads to a cup row; the other side is a dead end.
import type { PinDropLevel } from "./logic";

export interface LevelPlan {
  tiers: 2 | 3;
  /** Chance that a hopper starts with balls in it. */
  fill: number;
  seed: number;
}

export const WIDTH = 7;

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

/** Builds a level from a plan; returns null when the random layout is structurally unusable. */
export function tryBuild(plan: LevelPlan): PinDropLevel | null {
  const rnd = mulberry32(plan.seed);
  const pick = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const T = plan.tiers;
  const H = T * 4 + 1;
  const grid: string[][] = [];
  for (let y = 0; y < H; y++) grid.push(Array.from({ length: WIDTH }, () => "#"));
  const dividers: number[] = [];
  const gaps: Array<[number, number]> = [];
  for (let t = 0; t < T; t++) dividers.push(pick(2, 4));
  const cupSide = rnd() < 0.5 ? 0 : 1;
  for (let t = 0; t < T; t++) {
    const d = dividers[t]!;
    gaps.push([pick(0, d - 1), pick(d + 1, WIDTH - 1)]);
  }
  // A gap must not sit directly above the next tier's divider.
  for (let t = 0; t + 1 < T; t++) {
    const d = dividers[t + 1]!;
    if (gaps[t]![0] === d || gaps[t]![1] === d) return null;
  }
  for (let t = 0; t < T; t++) {
    const base = t * 4;
    const d = dividers[t]!;
    for (let r = 0; r < 2; r++) {
      for (let x = 0; x < WIDTH; x++) grid[base + r]![x] = x === d ? "#" : ".";
    }
    for (let x = 0; x < WIDTH; x++) {
      if (x === d) {
        grid[base + 2]![x] = "#";
        continue;
      }
      const gap = x < d ? gaps[t]![0] : gaps[t]![1];
      grid[base + 2]![x] = x < gap ? ">" : x > gap ? "<" : ".";
    }
    for (let side = 0; side < 2; side++) {
      const isDead = t === T - 1 && side !== cupSide;
      if (!isDead) grid[base + 3]![gaps[t]![side]!] = "P";
    }
  }
  grid[H - 1]![gaps[T - 1]![cupSide]!] = "U";
  // Contents: each hopper is all colored balls or all rocks (never mixed).
  let goods = 0;
  let rocks = 0;
  for (let t = 0; t < T; t++) {
    const d = dividers[t]!;
    for (let side = 0; side < 2; side++) {
      if (t === T - 1 && side === cupSide) continue;
      if (rnd() > plan.fill) continue;
      const isRock = rnd() < 0.45 || (t === T - 1 && side !== cupSide && rnd() < 0.7);
      if (t === T - 1 && !isRock) continue; // colored balls in the dead end could never score
      const n = pick(1, 3);
      const lo = side === 0 ? 0 : d + 1;
      const hi = side === 0 ? d - 1 : WIDTH - 1;
      const cells: Array<[number, number]> = [];
      for (let r = 0; r < 2; r++) for (let x = lo; x <= hi; x++) cells.push([x, t * 4 + r]);
      for (let i = 0; i < n && cells.length; i++) {
        const k = Math.floor(rnd() * cells.length);
        const [x, y] = cells.splice(k, 1)[0]!;
        grid[y]![x] = isRock ? "r" : "g";
        if (isRock) rocks++;
        else goods++;
      }
    }
  }
  if (goods < 2 || rocks < 1) return null;
  return { rows: grid.map((r) => r.join("")) };
}

export const PLANS: readonly LevelPlan[] = [
  { tiers: 2, fill: 0.9, seed: 1011 },
  { tiers: 2, fill: 0.9, seed: 2008 },
  { tiers: 2, fill: 0.9, seed: 3001 },
  { tiers: 2, fill: 0.9, seed: 4001 },
  { tiers: 2, fill: 0.95, seed: 5015 },
  { tiers: 2, fill: 0.95, seed: 6486 },
  { tiers: 2, fill: 0.95, seed: 7020 },
  { tiers: 2, fill: 0.95, seed: 8424 },
  { tiers: 3, fill: 0.8, seed: 9174 },
  { tiers: 3, fill: 0.8, seed: 10019 },
  { tiers: 3, fill: 0.8, seed: 11172 },
  { tiers: 3, fill: 0.8, seed: 12564 },
  { tiers: 3, fill: 0.9, seed: 13198 },
  { tiers: 3, fill: 0.9, seed: 14989 },
  { tiers: 3, fill: 0.9, seed: 15496 },
  { tiers: 3, fill: 0.9, seed: 17615 },
  { tiers: 3, fill: 0.95, seed: 25953 },
  { tiers: 3, fill: 0.95, seed: 28550 },
  { tiers: 3, fill: 0.95, seed: 29385 },
  { tiers: 3, fill: 0.95, seed: 33653 },
  { tiers: 3, fill: 1, seed: 33653 },
  { tiers: 3, fill: 1, seed: 39173 },
  { tiers: 3, fill: 1, seed: 41307 },
  { tiers: 3, fill: 1, seed: 41366 },
];

export const LEVEL_COUNT = PLANS.length;

export function buildLevel(plan: LevelPlan): PinDropLevel {
  const lvl = tryBuild(plan);
  if (!lvl) throw new Error(`plan with seed ${plan.seed} does not build`);
  return lvl;
}

export function getLevel(index: number): PinDropLevel {
  return buildLevel(PLANS[Math.max(0, Math.min(PLANS.length - 1, index))]!);
}
