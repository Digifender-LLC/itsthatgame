// Pin Drop: pure, deterministic grid model (no DOM, no physics engine).
//
// Grid legend (level rows):
//   #  wall            .  empty           P  removable pin (blocks until pulled)
//   >  slide right     <  slide left      U  goal cup cell
//   g  colored ball    r  grey rock       (g and r sit on an empty cell)
//
// Rules:
//  * Gravity runs in discrete ticks. A ball in a slide cell moves one cell sideways, else (or if
//    that is blocked) one cell down. Anything out of bounds, a wall, an unpulled pin or another
//    ball blocks. Balls are processed bottom-to-top, left-to-right, so the result is fixed.
//  * A colored ball that enters a cup cell is collected. A rock that enters a cup cell loses.
//  * A rock destroys any colored ball it touches (orthogonally adjacent after a tick): lose.
//  * Pulling a pin (tap) removes it; the contents then fall until everything is at rest.
//  * Win: every colored ball is in the cup. Lose: a rock reached the cup, a rock touched a
//    colored ball, or no pins remain while colored balls are still on the board.

export type Cell = "#" | "." | ">" | "<" | "U";
export type Kind = "good" | "rock";
export type LossReason = "crush" | "rock" | "stuck";
export type Status = "playing" | "won" | "lost";

export interface PinDropLevel {
  rows: string[];
}

export interface Ball {
  id: number;
  kind: Kind;
  color: number;
  x: number;
  y: number;
}

export interface Pin {
  x: number;
  y: number;
  pulled: boolean;
}

export interface PinDropState {
  w: number;
  h: number;
  cells: Cell[][];
  pins: Pin[];
  balls: Ball[];
  totalGood: number;
  collected: number;
  lost: LossReason | null;
}

export interface FrameBall {
  id: number;
  kind: Kind;
  color: number;
  x: number;
  y: number;
}

export interface Removal {
  id: number;
  kind: Kind;
  color: number;
  x: number;
  y: number;
  why: "cup" | "crush" | "rock";
}

/** One gravity tick: ball positions after the tick plus balls that left the board in it. */
export interface Frame {
  balls: FrameBall[];
  removed: Removal[];
  collected: number;
}

const MAX_TICKS = 300;

export function parseLevel(level: PinDropLevel): PinDropState {
  const h = level.rows.length;
  const w = level.rows[0]!.length;
  const cells: Cell[][] = [];
  const pins: Pin[] = [];
  const balls: Ball[] = [];
  let goodIndex = 0;
  for (let y = 0; y < h; y++) {
    const row = level.rows[y]!;
    if (row.length !== w) throw new Error(`row ${y} has width ${row.length}, expected ${w}`);
    const out: Cell[] = [];
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      switch (ch) {
        case "#":
        case ">":
        case "<":
        case "U":
        case ".":
          out.push(ch);
          break;
        case "P":
          out.push(".");
          pins.push({ x, y, pulled: false });
          break;
        case "g":
          out.push(".");
          balls.push({ id: balls.length, kind: "good", color: goodIndex++, x, y });
          break;
        case "r":
          out.push(".");
          balls.push({ id: balls.length, kind: "rock", color: 0, x, y });
          break;
        default:
          throw new Error(`unknown cell "${ch}"`);
      }
    }
    cells.push(out);
  }
  const state: PinDropState = {
    w,
    h,
    cells,
    pins,
    balls,
    totalGood: goodIndex,
    collected: 0,
    lost: null,
  };
  settle(state); // balls placed in the air come to rest before play begins
  return state;
}

export function cloneState(s: PinDropState): PinDropState {
  return {
    ...s,
    cells: s.cells,
    pins: s.pins.map((p) => ({ ...p })),
    balls: s.balls.map((b) => ({ ...b })),
  };
}

function pinAt(s: PinDropState, x: number, y: number): boolean {
  for (const p of s.pins) if (!p.pulled && p.x === x && p.y === y) return true;
  return false;
}

function snapshot(s: PinDropState, removed: Removal[]): Frame {
  return {
    balls: s.balls.map((b) => ({ id: b.id, kind: b.kind, color: b.color, x: b.x, y: b.y })),
    removed,
    collected: s.collected,
  };
}

/** Advances gravity by one tick. Returns whether anything moved or was removed. */
function tick(s: PinDropState, removed: Removal[]): boolean {
  const occ = new Map<number, Ball>();
  for (const b of s.balls) occ.set(b.y * s.w + b.x, b);
  const order = [...s.balls].sort((a, b) => b.y - a.y || a.x - b.x || a.id - b.id);
  let moved = false;
  const gone = new Set<number>();
  const blocked = (x: number, y: number): boolean =>
    x < 0 ||
    y < 0 ||
    x >= s.w ||
    y >= s.h ||
    s.cells[y]![x] === "#" ||
    pinAt(s, x, y) ||
    occ.has(y * s.w + x);
  for (const b of order) {
    const cell = s.cells[b.y]![b.x]!;
    const targets: Array<[number, number]> = [];
    if (cell === ">") targets.push([b.x + 1, b.y]);
    else if (cell === "<") targets.push([b.x - 1, b.y]);
    targets.push([b.x, b.y + 1]);
    for (const [tx, ty] of targets) {
      if (blocked(tx, ty)) continue;
      occ.delete(b.y * s.w + b.x);
      b.x = tx;
      b.y = ty;
      moved = true;
      if (s.cells[ty]![tx] === "U") {
        gone.add(b.id);
        if (b.kind === "good") {
          s.collected++;
          removed.push({ id: b.id, kind: b.kind, color: b.color, x: tx, y: ty, why: "cup" });
        } else {
          s.lost = "rock";
          removed.push({ id: b.id, kind: b.kind, color: b.color, x: tx, y: ty, why: "rock" });
        }
      } else {
        occ.set(ty * s.w + tx, b);
      }
      break;
    }
  }
  if (gone.size) s.balls = s.balls.filter((b) => !gone.has(b.id));
  return moved;
}

/** Rocks destroy touching colored balls. Returns true if any were destroyed. */
function crush(s: PinDropState, removed: Removal[]): boolean {
  const rocks = new Set<number>();
  for (const b of s.balls) if (b.kind === "rock") rocks.add(b.y * s.w + b.x);
  if (rocks.size === 0) return false;
  const doomed: Ball[] = [];
  for (const b of s.balls) {
    if (b.kind !== "good") continue;
    const k = b.y * s.w + b.x;
    if (
      (b.x > 0 && rocks.has(k - 1)) ||
      (b.x < s.w - 1 && rocks.has(k + 1)) ||
      (b.y > 0 && rocks.has(k - s.w)) ||
      (b.y < s.h - 1 && rocks.has(k + s.w))
    ) {
      doomed.push(b);
    }
  }
  if (doomed.length === 0) return false;
  for (const b of doomed) {
    removed.push({ id: b.id, kind: b.kind, color: b.color, x: b.x, y: b.y, why: "crush" });
  }
  const ids = new Set(doomed.map((b) => b.id));
  s.balls = s.balls.filter((b) => !ids.has(b.id));
  s.lost = "crush";
  return true;
}

/** Runs gravity until rest or a loss. Mutates `s`; returns the tick frames (frame 0 = start). */
export function settle(s: PinDropState): Frame[] {
  const frames: Frame[] = [snapshot(s, [])];
  for (let i = 0; i < MAX_TICKS; i++) {
    const removed: Removal[] = [];
    const moved = tick(s, removed);
    if (!moved) break;
    crush(s, removed);
    frames.push(snapshot(s, removed));
    if (s.lost) break;
  }
  return frames;
}

export function status(s: PinDropState): Status {
  if (s.lost) return "lost";
  if (s.collected >= s.totalGood) return "won";
  if (s.pins.every((p) => p.pulled)) return "lost"; // stuck
  return "playing";
}

export function lossReason(s: PinDropState): LossReason | null {
  if (s.lost) return s.lost;
  if (s.collected < s.totalGood && s.pins.every((p) => p.pulled)) return "stuck";
  return null;
}

export function canPull(s: PinDropState, i: number): boolean {
  const p = s.pins[i];
  return !!p && !p.pulled && status(s) === "playing";
}

/** Pulls pin `i` on a copy of the state. Returns null if the pull is not allowed. */
export function pullPin(
  s: PinDropState,
  i: number,
): { state: PinDropState; frames: Frame[] } | null {
  if (!canPull(s, i)) return null;
  const next = cloneState(s);
  next.pins[i]!.pulled = true;
  const frames = settle(next);
  return { state: next, frames };
}

/** Mutable session with undo and restart. */
export class PinDropGame {
  state: PinDropState;
  private readonly start: PinDropState;
  private history: PinDropState[] = [];

  constructor(level: PinDropLevel) {
    this.start = parseLevel(level);
    this.state = cloneState(this.start);
  }

  status(): Status {
    return status(this.state);
  }

  reason(): LossReason | null {
    return lossReason(this.state);
  }

  pull(i: number): Frame[] | null {
    const r = pullPin(this.state, i);
    if (!r) return null;
    this.history.push(this.state);
    this.state = r.state;
    return r.frames;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.state = prev;
    return true;
  }

  restart(): void {
    this.state = cloneState(this.start);
    this.history = [];
  }
}

// ---- Solver -------------------------------------------------------------------

function stateKey(s: PinDropState): string {
  const pins = s.pins.map((p) => (p.pulled ? "1" : "0")).join("");
  const balls = s.balls
    .map((b) => `${b.id}@${b.x},${b.y}`)
    .sort()
    .join(";");
  return `${pins}|${balls}|${s.collected}`;
}

/** Depth-first search over pin orders (memoized on full state). Returns pin indices or null. */
export function solve(level: PinDropLevel): number[] | null {
  const seen = new Set<string>();
  const dfs = (s: PinDropState, path: number[]): number[] | null => {
    const st = status(s);
    if (st === "won") return path;
    if (st === "lost") return null;
    const key = stateKey(s);
    if (seen.has(key)) return null;
    seen.add(key);
    for (let i = 0; i < s.pins.length; i++) {
      const r = pullPin(s, i);
      if (!r) continue;
      const found = dfs(r.state, [...path, i]);
      if (found) return found;
    }
    return null;
  };
  return dfs(parseLevel(level), []);
}

export interface Analysis {
  /** Complete pin sequences (stopping at a win or loss) examined. */
  sequences: number;
  wins: number;
  /** Fewest pins pulled in any winning sequence (Infinity if none). */
  minPulls: number;
}

/** Exhaustively explores every pin order; used to rate level difficulty. */
export function analyze(level: PinDropLevel): Analysis {
  const out: Analysis = { sequences: 0, wins: 0, minPulls: Infinity };
  const rec = (s: PinDropState, depth: number) => {
    const st = status(s);
    if (st !== "playing") {
      out.sequences++;
      if (st === "won") {
        out.wins++;
        out.minPulls = Math.min(out.minPulls, depth);
      }
      return;
    }
    for (let i = 0; i < s.pins.length; i++) {
      const r = pullPin(s, i);
      if (r) rec(r.state, depth + 1);
    }
  };
  rec(parseLevel(level), 0);
  return out;
}

/** Replays a pin sequence; returns the final status. */
export function replay(level: PinDropLevel, pins: readonly number[]): Status {
  let s = parseLevel(level);
  for (const i of pins) {
    const r = pullPin(s, i);
    if (!r) return "lost";
    s = r.state;
  }
  return status(s);
}
