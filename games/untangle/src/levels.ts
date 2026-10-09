// Untangle levels: the committed data in `levelData.ts` (made offline by `generate.ts`) turned
// into typed levels. Positions are normalized to 0..1 and drawn on a tall board.
import type { Level } from "./logic";
import { LEVEL_DATA } from "./levelData";

export const LEVEL_COUNT = LEVEL_DATA.length;

export const LEVELS: Level[] = LEVEL_DATA.map((d, i) => ({
  id: i + 1,
  nodeCount: d.n,
  edges: d.edges.map(([a, b]) => [a, b] as const),
  solution: d.sol.map(([x, y]) => ({ x, y })),
  start: d.start.map(([x, y]) => ({ x, y })),
  pinned: d.pins.slice(),
  pairs: d.pairs.map(([a, b]) => [a, b] as [number, number]),
  par: d.par,
}));
