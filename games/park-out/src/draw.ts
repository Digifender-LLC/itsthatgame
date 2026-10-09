// Procedural top-down art for Park Out: asphalt lot, painted lines, gates, bollards and
// vehicles. Everything is drawn with Canvas 2D paths (no image files). Shadows are darker
// offset shapes, never shadowBlur.
import { PALETTE, inkFor, roundRectPath, shade, starPath } from "@itg/game-sdk";
import type { BoardLayout } from "./layout";

export type ShapeName =
  "circle" | "square" | "diamond" | "plus" | "hex" | "triangle" | "star" | "star-outline";

export interface VehicleStyle {
  color: string;
  shape: ShapeName;
}

/** Ordinary vehicles. Colour plus a roof symbol, so colour is never the only cue (NFR-4). */
export const STYLES: readonly VehicleStyle[] = [
  { color: PALETTE.orange, shape: "circle" },
  { color: PALETTE.green, shape: "square" },
  { color: PALETTE.yellow, shape: "diamond" },
  { color: PALETTE.blue, shape: "plus" },
  { color: PALETTE.purple, shape: "hex" },
  { color: "#E4E0EE", shape: "triangle" },
];
export const HERO_T: VehicleStyle = { color: PALETTE.vermillion, shape: "star" };
export const HERO_U: VehicleStyle = { color: PALETTE.sky, shape: "star-outline" };

export const ASPHALT = "#2D2E38";
const CURB = "#6F6C7E";
const GLASS = "#22324A";
export const GOLD = "#FFD23F";

/** Deterministic specks so the asphalt has grain without per-frame randomness. */
export function makeSpecks(size: number, seed: number): number[] {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: number[] = [];
  const n = size * size * 5;
  for (let i = 0; i < n; i++) out.push(rnd() * size, rnd() * size, rnd() < 0.5 ? 0 : 1);
  return out;
}

export function drawShape(
  g: CanvasRenderingContext2D,
  shape: ShapeName,
  r: number,
  fill: string,
): void {
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.lineWidth = Math.max(1.5, r * 0.22);
  g.lineJoin = "round";
  switch (shape) {
    case "circle":
      g.beginPath();
      g.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      g.fill();
      break;
    case "square":
      g.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      break;
    case "diamond":
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r, 0);
      g.lineTo(0, r);
      g.lineTo(-r, 0);
      g.closePath();
      g.fill();
      break;
    case "plus":
      g.fillRect(-r * 0.3, -r, r * 0.6, r * 2);
      g.fillRect(-r, -r * 0.3, r * 2, r * 0.6);
      break;
    case "hex":
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      break;
    case "triangle":
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.95, r * 0.75);
      g.lineTo(-r * 0.95, r * 0.75);
      g.closePath();
      g.fill();
      break;
    case "star":
      starPath(g, 0, 0, r * 1.15, r * 0.5);
      g.fill();
      break;
    case "star-outline":
      starPath(g, 0, 0, r * 1.1, r * 0.48);
      g.lineWidth = Math.max(2, r * 0.26);
      g.stroke();
      break;
  }
}

// ---- Lot -----------------------------------------------------------------------

export function drawLot(
  g: CanvasRenderingContext2D,
  l: BoardLayout,
  specks: readonly number[],
): void {
  const { x, y, w, cell, size } = l;
  // concrete curb with a soft drop shadow (offset shape)
  roundRectPath(g, x - 8, y - 4, w + 16, w + 16, 20);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fill();
  roundRectPath(g, x - 8, y - 8, w + 16, w + 16, 20);
  g.fillStyle = CURB;
  g.fill();
  roundRectPath(g, x - 2, y - 7, w + 4, 3, 1.5);
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fill();
  // asphalt
  roundRectPath(g, x, y, w, w, 12);
  g.fillStyle = ASPHALT;
  g.fill();
  g.save();
  roundRectPath(g, x, y, w, w, 12);
  g.clip();
  // alternating patches of slightly different asphalt
  g.fillStyle = "rgba(255,255,255,0.025)";
  for (let r = 0; r < size; r++) {
    for (let c = (r + 1) % 2; c < size; c += 2) g.fillRect(x + c * cell, y + r * cell, cell, cell);
  }
  // grain
  g.beginPath();
  for (let i = 0; i < specks.length; i += 3) {
    if (specks[i + 2] === 0) g.rect(x + specks[i]! * cell, y + specks[i + 1]! * cell, 2, 2);
  }
  g.fillStyle = "rgba(255,255,255,0.07)";
  g.fill();
  g.beginPath();
  for (let i = 0; i < specks.length; i += 3) {
    if (specks[i + 2] === 1) g.rect(x + specks[i]! * cell, y + specks[i + 1]! * cell, 3, 2);
  }
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fill();
  // painted bay marks: a small cross at every interior grid vertex
  const t = cell * 0.13;
  g.beginPath();
  for (let r = 1; r < size; r++) {
    for (let c = 1; c < size; c++) {
      const px = x + c * cell;
      const py = y + r * cell;
      g.moveTo(px - t, py);
      g.lineTo(px + t, py);
      g.moveTo(px, py - t);
      g.lineTo(px, py + t);
    }
  }
  g.strokeStyle = "rgba(244,241,234,0.22)";
  g.lineWidth = 2;
  g.lineCap = "round";
  g.stroke();
  g.restore();
  // dashed painted edge line
  roundRectPath(g, x + 4, y + 4, w - 8, w - 8, 9);
  g.setLineDash([9, 7]);
  g.strokeStyle = "rgba(244,241,234,0.2)";
  g.lineWidth = 2;
  g.stroke();
  g.setLineDash([]);
}

export interface GateDraw {
  row: number;
  /** 1 = right edge, -1 = left edge. */
  side: 1 | -1;
  /** 0 closed .. 1 open. */
  open: number;
}

export function drawGate(
  g: CanvasRenderingContext2D,
  l: BoardLayout,
  gate: GateDraw,
  nowMs: number,
): void {
  const { x, y, w, cell } = l;
  const gx = gate.side === 1 ? x + w : x;
  const top = y + gate.row * cell + 3;
  const h = cell - 6;
  // open the curb: asphalt strip through it
  g.fillStyle = ASPHALT;
  g.fillRect(gate.side === 1 ? gx - 6 : gx - 10, top, 16, h);
  // pulsing chevrons pointing out of the lot
  const dir = gate.side;
  for (let i = 0; i < 3; i++) {
    const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(nowMs / 260 - i * 0.9));
    g.globalAlpha = pulse;
    g.fillStyle = "#58E08F";
    const cx = gx;
    const cy = top + h * (0.25 + i * 0.25);
    g.beginPath();
    g.moveTo(cx - dir * 4, cy - 5);
    g.lineTo(cx + dir * 4, cy);
    g.lineTo(cx - dir * 4, cy + 5);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  // posts and barrier arm
  const post = (py: number) => {
    roundRectPath(g, gx - 5, py - 5, 10, 10, 3);
    g.fillStyle = "#F4F1EA";
    g.fill();
    roundRectPath(g, gx - 5, py - 5, 10, 4, 2);
    g.fillStyle = "#E5484D";
    g.fill();
  };
  const arm = h * (1 - gate.open);
  if (arm > 2) {
    g.lineCap = "butt";
    g.lineWidth = 5;
    g.strokeStyle = "#F4F1EA";
    g.beginPath();
    g.moveTo(gx, top + 2);
    g.lineTo(gx, top + 2 + arm);
    g.stroke();
    g.setLineDash([6, 6]);
    g.strokeStyle = "#E5484D";
    g.stroke();
    g.setLineDash([]);
  }
  post(top);
  post(top + h);
}

// ---- Bollard -------------------------------------------------------------------

export function drawBollard(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  jitter: number,
): void {
  const r = cell * 0.34;
  g.save();
  g.translate(cx + jitter, cy);
  g.beginPath();
  g.arc(2, 4, r + 3, 0, Math.PI * 2);
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.fill();
  roundRectPath(g, -r - 4, -r - 4, (r + 4) * 2, (r + 4) * 2, 6);
  g.fillStyle = "#4A4958";
  g.fill();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = "#FF8A1F";
  g.fill();
  g.beginPath();
  g.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  g.fillStyle = "#F7F4EC";
  g.fill();
  g.beginPath();
  g.arc(0, 0, r * 0.38, 0, Math.PI * 2);
  g.fillStyle = "#FF8A1F";
  g.fill();
  g.beginPath();
  g.arc(-r * 0.2, -r * 0.22, r * 0.14, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fill();
  g.restore();
}

// ---- Vehicles ------------------------------------------------------------------

export interface VehicleDraw {
  /** Centre in canvas px. */
  cx: number;
  cy: number;
  /** Length in cells. */
  len: number;
  cell: number;
  /** Heading in radians: 0 = facing right (+x), PI/2 = facing down. */
  angle: number;
  style: VehicleStyle;
  hero: boolean;
  /** 0..1 while dragged: bigger, higher shadow. */
  lift: number;
  /** Landing squash, -1..1 (positive stretches along the length). */
  squash: number;
  /** Highlight ring for the selected vehicle. */
  selected: boolean;
  /** 0..1 idle glow for heroes. */
  glow: number;
}

export function drawVehicle(g: CanvasRenderingContext2D, o: VehicleDraw): void {
  const L = o.len * o.cell - 8;
  const W = o.cell - 12;
  const s = 1 + o.lift * 0.06;
  const sx = s * (1 + o.squash * 0.06);
  const sy = s * (1 - o.squash * 0.04);
  const col = o.style.color;
  const truck = o.len >= 3;

  // shadow: a darker offset copy of the body
  g.save();
  g.translate(o.cx + 1.5, o.cy + 3 + o.lift * 5);
  g.rotate(o.angle);
  g.scale(sx, sy);
  roundRectPath(g, -L / 2, -W / 2, L, W, W * 0.3);
  g.fillStyle = "rgba(0,0,0,0.36)";
  g.fill();
  g.restore();

  g.save();
  g.translate(o.cx, o.cy);
  g.rotate(o.angle);
  g.scale(sx, sy);

  if (o.hero && o.glow > 0) {
    roundRectPath(g, -L / 2 - 4, -W / 2 - 4, L + 8, W + 8, W * 0.4);
    g.globalAlpha = 0.25 + 0.35 * o.glow;
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.stroke();
    g.globalAlpha = 1;
  }

  // wheels peek out of the sides
  const wheelX = truck
    ? [L / 2 - o.cell * 0.42, -L / 2 + o.cell * 0.4, -L / 2 + o.cell * 0.92]
    : [L * 0.3, -L * 0.3];
  const ww = L * (truck ? 0.1 : 0.18);
  g.fillStyle = "#15151B";
  for (const wx of wheelX) {
    roundRectPath(g, wx - ww / 2, -W / 2 - 2, ww, W + 4, 3);
    g.fill();
  }

  const edge = shade(col, -0.4);
  if (truck) {
    const cabL = o.cell * 0.88;
    // cargo box
    const boxL = L - cabL - 2;
    roundRectPath(g, -L / 2, -W / 2, boxL, W, W * 0.14);
    g.fillStyle = col;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = edge;
    g.stroke();
    roundRectPath(g, -L / 2 + 2, -W / 2 + 2, boxL - 4, W * 0.34, W * 0.1);
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.fill();
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const rx = -L / 2 + (boxL * i) / 4;
      g.moveTo(rx, -W / 2 + 3);
      g.lineTo(rx, W / 2 - 3);
    }
    g.strokeStyle = "rgba(0,0,0,0.16)";
    g.lineWidth = 1.5;
    g.stroke();
    // cab
    const cabX = L / 2 - cabL;
    roundRectPath(g, cabX, -W * 0.45, cabL, W * 0.9, W * 0.26);
    g.fillStyle = shade(col, -0.18);
    g.fill();
    g.strokeStyle = edge;
    g.stroke();
    roundRectPath(g, cabX + cabL * 0.5, -W * 0.34, cabL * 0.4, W * 0.68, 4);
    g.fillStyle = GLASS;
    g.fill();
    // roof symbol sits on the cargo box
    g.save();
    g.translate(-L / 2 + boxL / 2, 0);
    drawShape(g, o.style.shape, Math.min(W * 0.26, 11), inkFor(col));
    g.restore();
  } else {
    roundRectPath(g, -L / 2, -W / 2, L, W, W * 0.32);
    g.fillStyle = col;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = edge;
    g.stroke();
    roundRectPath(g, -L / 2 + 3, -W / 2 + 2, L - 6, W * 0.3, W * 0.14);
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.fill();
    // cabin glass with the roof inside it
    const cabL = L * 0.5;
    const cabX = -L * 0.06 - cabL / 2;
    roundRectPath(g, cabX, -W * 0.39, cabL, W * 0.78, 6);
    g.fillStyle = GLASS;
    g.fill();
    roundRectPath(g, cabX + cabL * 0.16, -W * 0.33, cabL * 0.54, W * 0.66, 5);
    g.fillStyle = shade(col, -0.06);
    g.fill();
    g.save();
    g.translate(cabX + cabL * 0.43, 0);
    drawShape(g, o.style.shape, Math.min(W * 0.24, 10), inkFor(shade(col, -0.06)));
    g.restore();
  }
  if (o.hero) {
    // racing stripes on hood and boot
    g.fillStyle = "rgba(255,244,200,0.9)";
    const front = L / 2;
    if (!truck) {
      g.fillRect(-L * 0.06 + L * 0.25 + 2, -W * 0.09, front - (L * 0.19 + 2) - 6, W * 0.18);
      g.fillRect(-L / 2 + 5, -W * 0.09, L * 0.17, W * 0.18);
    }
  }
  // lights
  g.fillStyle = "#FFF3B0";
  g.beginPath();
  g.arc(L / 2 - 3.5, -W * 0.3, W * 0.09, 0, Math.PI * 2);
  g.arc(L / 2 - 3.5, W * 0.3, W * 0.09, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#E5484D";
  g.beginPath();
  g.arc(-L / 2 + 2.5, -W * 0.3, W * 0.07, 0, Math.PI * 2);
  g.arc(-L / 2 + 2.5, W * 0.3, W * 0.07, 0, Math.PI * 2);
  g.fill();

  if (o.selected) {
    roundRectPath(g, -L / 2 - 3, -W / 2 - 3, L + 6, W + 6, W * 0.38);
    g.strokeStyle = "#FFFFFF";
    g.lineWidth = 3;
    g.stroke();
  }
  g.restore();
}

/** Pulsing arrow used for hints and the selected vehicle's free range. */
export function drawArrow(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  size: number,
  color: string,
): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(size, 0);
  g.lineTo(-size * 0.6, -size * 0.8);
  g.lineTo(-size * 0.2, 0);
  g.lineTo(-size * 0.6, size * 0.8);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.stroke();
  g.restore();
}
