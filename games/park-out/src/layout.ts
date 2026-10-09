// Pure board geometry, shared by the controller and the tests.
import type { Area } from "@itg/game-sdk";

export interface BoardLayout {
  /** Cell edge in px. */
  cell: number;
  /** Cells per side (6 or 7). */
  size: number;
  /** Top-left corner of the asphalt, in canvas px. */
  x: number;
  y: number;
  /** Asphalt edge length in px (cell * size). */
  w: number;
}

/** Side room for the curb and the gate chevrons. */
const SIDE = 18;
const VERT = 16;

/** Fit a square lot into the play area (never under the HUD) and centre it. */
export function boardLayout(area: Area, size: number): BoardLayout {
  const cell = Math.max(
    24,
    Math.floor(Math.min((area.w - SIDE * 2) / size, (area.h - VERT * 2) / size, 72)),
  );
  const w = cell * size;
  return {
    cell,
    size,
    x: Math.round(area.x + (area.w - w) / 2),
    y: Math.round(area.y + Math.max(VERT, (area.h - w) / 2 - 10)),
    w,
  };
}

export function cellCenter(l: BoardLayout, cx: number, cy: number): { x: number; y: number } {
  return { x: l.x + (cx + 0.5) * l.cell, y: l.y + (cy + 0.5) * l.cell };
}

/** Grid cell under a canvas point, or null when outside the lot. */
export function cellAt(l: BoardLayout, px: number, py: number): { cx: number; cy: number } | null {
  const cx = Math.floor((px - l.x) / l.cell);
  const cy = Math.floor((py - l.y) / l.cell);
  if (cx < 0 || cy < 0 || cx >= l.size || cy >= l.size) return null;
  return { cx, cy };
}
