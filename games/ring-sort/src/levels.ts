// Ring Sort levels: a seeded deterministic generator. Each plan row names the seed whose
// shuffle was verified solvable by the solver in logic.ts (see logic.test.ts, which
// re-verifies every level). No Math.random anywhere.
import type { RingLevel } from "./logic";

export interface LevelPlan {
  colors: number;
  cap: number;
  /** Extra empty pegs. */
  empty: number;
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
  { colors: 3, cap: 3, empty: 2, seed: 1000 },
  { colors: 3, cap: 3, empty: 2, seed: 2000 },
  { colors: 3, cap: 4, empty: 2, seed: 3000 },
  { colors: 4, cap: 3, empty: 2, seed: 4000 },
  { colors: 4, cap: 4, empty: 2, seed: 5000 },
  { colors: 5, cap: 3, empty: 2, seed: 6000 },
  { colors: 5, cap: 4, empty: 2, seed: 7000 },
  { colors: 4, cap: 3, empty: 1, seed: 8001 },
  { colors: 5, cap: 3, empty: 1, seed: 9000 },
  { colors: 5, cap: 4, empty: 2, seed: 10000 },
  { colors: 6, cap: 3, empty: 2, seed: 11000 },
  { colors: 6, cap: 4, empty: 2, seed: 12001 },
  { colors: 5, cap: 4, empty: 1, seed: 13001 },
  { colors: 6, cap: 3, empty: 1, seed: 14003 },
  { colors: 6, cap: 4, empty: 2, seed: 15000 },
  { colors: 7, cap: 3, empty: 2, seed: 16000 },
  { colors: 6, cap: 4, empty: 1, seed: 17013 },
  { colors: 7, cap: 4, empty: 2, seed: 18000 },
  { colors: 7, cap: 3, empty: 1, seed: 19006 },
  { colors: 7, cap: 4, empty: 2, seed: 20000 },
  { colors: 7, cap: 4, empty: 1, seed: 21074 },
  { colors: 6, cap: 5, empty: 2, seed: 22000 },
  { colors: 7, cap: 5, empty: 2, seed: 23000 },
  { colors: 7, cap: 5, empty: 1, seed: 24031 },
];

export const LEVEL_COUNT = PLANS.length;

export function buildLevel(plan: LevelPlan): RingLevel {
  const rnd = mulberry32(plan.seed);
  const rings: number[] = [];
  for (let c = 0; c < plan.colors; c++) for (let i = 0; i < plan.cap; i++) rings.push(c);
  for (let i = rings.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rings[i], rings[j]] = [rings[j]!, rings[i]!];
  }
  const pegs: number[][] = [];
  for (let p = 0; p < plan.colors; p++) pegs.push(rings.slice(p * plan.cap, (p + 1) * plan.cap));
  for (let e = 0; e < plan.empty; e++) pegs.push([]);
  return { pegs, cap: plan.cap };
}

export function getLevel(index: number): RingLevel {
  const plan = PLANS[Math.max(0, Math.min(PLANS.length - 1, index))]!;
  return buildLevel(plan);
}
