// Pin Drop level generator (offline tool). A seeded deterministic generator over a "tiered
// hopper" family; the committed level data in levelData.ts records the plan (including the seed)
// that produced each level, and tests re-generate and re-solve every one. No Math.random, and
// the game never runs this at runtime: it only reads levelData.ts.
//
// Layout: 7 columns; each tier is 2 chamber rows, a slide row and a shelf row (4 rows). A wall
// divides each tier into a left and right hopper; slides funnel balls to that hopper's gap,
// which holds a pin. Pulling a pin drops the hopper's contents into whichever hopper sits
// below the gap. The last tier's two lanes end in the "tail", which differs per plan:
//
//   plain     one lane ends in an open cup, the other is a dead end
//   lava      the cup lane has a lava cell above the cup (a rock must cool it first)
//   gate      the cup lane has a closed gate above the cup; the other lane ends on a sensor
//   dual      both lanes end in coloured cups (A and B), balls are coloured (a and b)
//   dualLava  dual, with lava above one cup
//   dualGate  dual, with a gate above one cup and a sensor above the other
import type { PinDropLevel } from "./logic";

export type Tail = "plain" | "lava" | "gate" | "dual" | "dualLava" | "dualGate";

export interface LevelPlan {
  tiers: 1 | 2 | 3 | 4;
  tail: Tail;
  /** Chance that a hopper starts with balls in it. */
  fill: number;
  /** Chance that a filled hopper holds rocks instead of balls. */
  rocks: number;
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

interface Lane {
  pin: boolean;
  /** Row H-2 cell for two-row tails. */
  mid: string | null;
  /** Row H-1 cell: a cup letter, or a wall. */
  bottom: string;
  /** True when balls dropped here can never score. */
  dead: boolean;
}

function lanesFor(tail: Tail, first: number): [Lane, Lane] {
  const dead: Lane = { pin: false, mid: null, bottom: "#", dead: true };
  const open = (cup: string, mid: string | null = null): Lane => ({
    pin: true,
    mid,
    bottom: cup,
    dead: false,
  });
  const sensorLane: Lane = { pin: true, mid: "s", bottom: "#", dead: true };
  const lanes: [Lane, Lane] = [dead, dead];
  const other = 1 - first;
  switch (tail) {
    case "plain":
      lanes[first] = open("U");
      break;
    case "lava":
      lanes[first] = open("U", "~");
      break;
    case "gate":
      lanes[first] = open("U", "G");
      lanes[other] = sensorLane;
      break;
    case "dual":
      lanes[first] = open("A");
      lanes[other] = open("B");
      break;
    case "dualLava":
      lanes[first] = open("A", "~");
      lanes[other] = open("B", ".");
      break;
    case "dualGate":
      lanes[first] = open("A", "G");
      lanes[other] = open("B", "s");
      break;
  }
  return lanes;
}

const twoRowTail = (t: Tail) => t !== "plain" && t !== "dual";
const isDual = (t: Tail) => t.startsWith("dual");

/** Builds a level from a plan; returns null when the random layout is structurally unusable. */
export function buildLevel(plan: LevelPlan): PinDropLevel | null {
  const rnd = mulberry32(plan.seed);
  const pick = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const T = plan.tiers;
  const tailRows = twoRowTail(plan.tail) ? 2 : 1;
  const H = T * 4 + tailRows;
  const grid: string[][] = [];
  for (let y = 0; y < H; y++) grid.push(Array.from({ length: WIDTH }, () => "#"));
  const dividers: number[] = [];
  const gaps: Array<[number, number]> = [];
  for (let t = 0; t < T; t++) dividers.push(pick(2, 4));
  const first = rnd() < 0.5 ? 0 : 1;
  const lanes = lanesFor(plan.tail, first);
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
      if (t < T - 1 || lanes[side]!.pin) grid[base + 3]![gaps[t]![side]!] = "P";
    }
  }
  for (let side = 0; side < 2; side++) {
    const lane = lanes[side]!;
    const gx = gaps[T - 1]![side]!;
    if (tailRows === 2) grid[H - 2]![gx] = lane.mid ?? ".";
    grid[H - 1]![gx] = lane.bottom;
  }
  // Contents: each hopper is all balls of one colour, or all rocks (never mixed).
  const dual = isDual(plan.tail);
  let goods = 0;
  let rocks = 0;
  for (let t = 0; t < T; t++) {
    const d = dividers[t]!;
    for (let side = 0; side < 2; side++) {
      if (rnd() > plan.fill) continue;
      const lastDead = t === T - 1 && lanes[side]!.dead;
      const isRock = rnd() < plan.rocks || (lastDead && rnd() < 0.7);
      if (lastDead && !isRock) continue; // balls in a dead end could never score
      const ch = isRock ? "r" : dual ? "ab"[pick(0, 1)]! : "g";
      const n = pick(1, 3);
      const lo = side === 0 ? 0 : d + 1;
      const hi = side === 0 ? d - 1 : WIDTH - 1;
      const cells: Array<[number, number]> = [];
      for (let r = 0; r < 2; r++) for (let x = lo; x <= hi; x++) cells.push([x, t * 4 + r]);
      for (let i = 0; i < n && cells.length; i++) {
        const k = Math.floor(rnd() * cells.length);
        const [x, y] = cells.splice(k, 1)[0]!;
        grid[y]![x] = ch;
        if (isRock) rocks++;
        else goods++;
      }
    }
  }
  if (goods < 1) return null;
  if (rocks < 1 && plan.rocks > 0) return null;
  return { rows: grid.map((r) => r.join("")) };
}
