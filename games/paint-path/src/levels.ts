// Paint Path levels: committed data (see levelData.ts, produced offline by generator.ts and
// verified by tests), plus world names, palettes and the banners that introduce each twist.
import { LEVEL_DATA } from "./levelData";
import { parseLevel, type Level } from "./logic";

export const LEVELS: Level[] = LEVEL_DATA.map((d, i) => parseLevel(i + 1, d.rows, d.solution));
export const LEVEL_COUNT = LEVELS.length;

export interface World {
  name: string;
  /** 1-based first level. */
  from: number;
  /** Brush gradient stops, painted start to end. */
  palette: readonly string[];
}

export const WORLDS: readonly World[] = [
  { name: "Sunrise", from: 1, palette: ["#FF8A4C", "#F2527F", "#A83FD0"] },
  { name: "Bends", from: 11, palette: ["#22C1B0", "#2B8FE0", "#5A4FD8"] },
  { name: "Crossings", from: 21, palette: ["#8FCB2F", "#22A66A", "#1B8394"] },
  { name: "Portals", from: 31, palette: ["#FFC23A", "#FF8630", "#E23E57"] },
  { name: "Mixer", from: 41, palette: ["#FF5FAE", "#B057F0", "#3F7BFF"] },
  {
    name: "Masterpiece",
    from: 51,
    palette: ["#FF5252", "#FFB02E", "#38CC84", "#2F86F5", "#9B55F2"],
  },
];

export function worldOf(index: number): World {
  let w = WORLDS[0]!;
  for (const cand of WORLDS) if (index + 1 >= cand.from) w = cand;
  return w;
}

/** Banners shown when a level is first loaded, keyed by 0-based level index. */
const INTROS: Record<number, string> = {
  0: "Drag from the star and paint every tile in one stroke.",
  5: "New: dark walls. Walls can't be painted, fill everything else.",
  10: "New: bend tiles. After a bend you must turn a corner.",
  20: "New: crossings. Pass through twice, once across and once up or down.",
  30: "New: portals. Step on one and you pop out of its twin.",
  40: "Mixer: crossings, bends and portals can all show up together.",
  50: "Masterpiece: the biggest canvases. Take your time.",
};

export function introFor(index: number): string | undefined {
  return INTROS[index];
}
