// Pin Drop levels: committed data (levelData.ts) plus worlds and mechanic intros.
import { LEVEL_DATA } from "./levelData";
import type { PinDropLevel } from "./logic";

export const LEVEL_COUNT = LEVEL_DATA.length;

export const WORLDS: { name: string; from: number }[] = [
  { name: "The Workshop", from: 1 },
  { name: "Lava Lab", from: 11 },
  { name: "Trapdoors", from: 21 },
  { name: "Rainbow Cups", from: 31 },
  { name: "The Grand Machine", from: 41 },
];

/** Banners shown on the level where a mechanic first appears (0-based level index). */
export const INTROS: Record<number, string> = {
  0: "Pull the pin so the balls drop in the cup!",
  1: "Several pins: pull them in the right order",
  5: "Grey rocks crush balls. Keep them apart!",
  10: "Lava burns balls. Cool it with a rock!",
  20: "Gates open when a ball rolls over the pad",
  30: "Coloured cups only take their own colour",
  40: "Everything at once. Good luck!",
};

export function getLevel(index: number): PinDropLevel {
  const i = Math.max(0, Math.min(LEVEL_COUNT - 1, index));
  return { rows: LEVEL_DATA[i]!.rows };
}

/** Fewest pins in any winning order (from the solver, checked in tests). */
export function getPar(index: number): number {
  return LEVEL_DATA[Math.max(0, Math.min(LEVEL_COUNT - 1, index))]!.par;
}
