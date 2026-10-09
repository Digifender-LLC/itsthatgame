// Pin Drop: pure, deterministic grid model (no DOM, no physics engine).
//
// Grid legend (level rows):
//   #  wall             .  empty            P  removable pin (blocks until pulled)
//   >  slide right      <  slide left       (g a b c r sit on an empty cell)
//   g  ball (any cup)   a b c  coloured ball, class 0 / 1 / 2     r  grey rock
//   U  open cup (takes any ball)            A B C  coloured cup, takes class 0 / 1 / 2
//   ~  lava             G H  gate, closed until a ball touches a sensor of the same channel
//   s t  sensor (channel 0 / 1), passable; any ball entering it opens that channel for good
//
// Rules:
//  * Gravity runs in discrete ticks. A ball in a slide cell moves one cell sideways, else (or if
//    that is blocked) one cell down. Anything out of bounds, a wall, an unpulled pin, a closed
//    gate or another ball blocks. Balls are processed bottom-to-top, left-to-right.
//  * A ball that enters a cup is collected, unless the cup is coloured and the ball is another
//    colour (lose: "wrong"). A rock that enters any cup loses.
//  * Lava burns a ball that enters it (lose), but a rock that enters lava cools it for good: the
//    rock is used up and the cell becomes ordinary empty space.
//  * A rock destroys any ball it touches (orthogonally adjacent after a tick): lose.
//  * Pulling a pin removes it; the contents then fall until everything is at rest.
//  * Win: every ball is in a cup. Lose: any of the above, or no pins remain while balls are still
//    on the board.

export type Cell = "#" | "." | ">" | "<" | "U" | "A" | "B" | "C" | "~" | "G" | "H" | "s" | "t";
export type Kind = "good" | "rock";
export type LossReason = "crush" | "rock" | "stuck" | "lava" | "wrong";
export type Status = "playing" | "won" | "lost";

export interface PinDropLevel {
  rows: string[];
}

export interface Ball {
  id: number;
  kind: Kind;
  /** Cosmetic colour index (equals `cls` for coloured balls). */
  color: number;
  /** Colour class that must match a coloured cup, or -1 for a ball any cup accepts. */
  cls: number;
  x: number;
  y: number;
}

export interface Pin {
  x: number;
  y: number;
  pulled: boolean;
}

export interface Cup {
  x: number;
  y: number;
  /** -1 for an open cup, otherwise the colour class it takes. */
  cls: number;
  /** Balls this cup is expected to end with (for the fill gauge). */
  need: number;
  n: number;
}

export interface PinDropState {
  w: number;
  h: number;
  cells: Cell[][];
  pins: Pin[];
  balls: Ball[];
  cups: Cup[];
  totalGood: number;
  collected: number;
  lost: LossReason | null;
  /** Bit mask of opened gate channels. */
  open: number;
  /** Cell indices (y * w + x) of lava that has been cooled. */
  cooled: number[];
}

export interface FrameBall {
  id: number;
  kind: Kind;
  color: number;
  cls: number;
  x: number;
  y: number;
}

export type RemovalWhy = "cup" | "crush" | "rock" | "lava" | "cool" | "wrong";

export interface Removal {
  id: number;
  kind: Kind;
  color: number;
  cls: number;
  x: number;
  y: number;
  why: RemovalWhy;
  /** Index into `state.cups` for cup removals. */
  cup: number;
}

/** One gravity tick: ball positions after the tick plus balls that left the board in it. */
export interface Frame {
  balls: FrameBall[];
  removed: Removal[];
  collected: number;
  /** Gate channels that opened during this tick (bit mask). */
  opened: number;
}

const MAX_TICKS = 300;
const CLASS_LETTERS = ["a", "b", "c"] as const;
const CUP_LETTERS = ["A", "B", "C"] as const;

export function parseLevel(level: PinDropLevel): PinDropState {
  const h = level.rows.length;
  const w = level.rows[0]!.length;
  const cells: Cell[][] = [];
  const pins: Pin[] = [];
  const balls: Ball[] = [];
  const cups: Cup[] = [];
  let goodIndex = 0;
  for (let y = 0; y < h; y++) {
    const row = level.rows[y]!;
    if (row.length !== w) throw new Error(`row ${y} has width ${row.length}, expected ${w}`);
    const out: Cell[] = [];
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      const cls = CLASS_LETTERS.indexOf(ch as (typeof CLASS_LETTERS)[number]);
      const cupCls = CUP_LETTERS.indexOf(ch as (typeof CUP_LETTERS)[number]);
      if (cls >= 0) {
        out.push(".");
        balls.push({ id: balls.length, kind: "good", color: cls, cls, x, y });
        goodIndex++;
        continue;
      }
      if (cupCls >= 0) {
        out.push(ch as Cell);
        cups.push({ x, y, cls: cupCls, need: 0, n: 0 });
        continue;
      }
      switch (ch) {
        case "#":
        case ">":
        case "<":
        case ".":
        case "~":
        case "G":
        case "H":
        case "s":
        case "t":
          out.push(ch);
          break;
        case "U":
          out.push("U");
          cups.push({ x, y, cls: -1, need: 0, n: 0 });
          break;
        case "P":
          out.push(".");
          pins.push({ x, y, pulled: false });
          break;
        case "g":
          out.push(".");
          balls.push({ id: balls.length, kind: "good", color: goodIndex, cls: -1, x, y });
          goodIndex++;
          break;
        case "r":
          out.push(".");
          balls.push({ id: balls.length, kind: "rock", color: 0, cls: -1, x, y });
          break;
        default:
          throw new Error(`unknown cell "${ch}"`);
      }
    }
    cells.push(out);
  }
  for (const c of cups) {
    c.need = c.cls < 0 ? goodIndex : balls.filter((b) => b.cls === c.cls).length;
  }
  const state: PinDropState = {
    w,
    h,
    cells,
    pins,
    balls,
    cups,
    totalGood: goodIndex,
    collected: 0,
    lost: null,
    open: 0,
    cooled: [],
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
    cups: s.cups.map((c) => ({ ...c })),
    cooled: [...s.cooled],
  };
}

function pinAt(s: PinDropState, x: number, y: number): boolean {
  for (const p of s.pins) if (!p.pulled && p.x === x && p.y === y) return true;
  return false;
}

/** The cell as it is now: cooled lava is plain empty space. */
export function cellAt(s: PinDropState, x: number, y: number): Cell {
  const c = s.cells[y]![x]!;
  if (c === "~" && s.cooled.includes(y * s.w + x)) return ".";
  return c;
}

export function gateChannel(c: Cell): number {
  return c === "G" ? 0 : c === "H" ? 1 : -1;
}

export function sensorChannel(c: Cell): number {
  return c === "s" ? 0 : c === "t" ? 1 : -1;
}

function snapshot(s: PinDropState, removed: Removal[], opened: number): Frame {
  return {
    balls: s.balls.map((b) => ({
      id: b.id,
      kind: b.kind,
      color: b.color,
      cls: b.cls,
      x: b.x,
      y: b.y,
    })),
    removed,
    collected: s.collected,
    opened,
  };
}

function removal(b: Ball, x: number, y: number, why: RemovalWhy, cup = -1): Removal {
  return { id: b.id, kind: b.kind, color: b.color, cls: b.cls, x, y, why, cup };
}

/** Advances gravity by one tick. Returns whether anything moved or was removed. */
function tick(s: PinDropState, removed: Removal[]): { moved: boolean; opened: number } {
  const occ = new Map<number, Ball>();
  for (const b of s.balls) occ.set(b.y * s.w + b.x, b);
  const order = [...s.balls].sort((a, b) => b.y - a.y || a.x - b.x || a.id - b.id);
  let moved = false;
  let opened = 0;
  const gone = new Set<number>();
  const blocked = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return true;
    const c = s.cells[y]![x]!;
    if (c === "#" || pinAt(s, x, y) || occ.has(y * s.w + x)) return true;
    const ch = gateChannel(c);
    return ch >= 0 && (s.open & (1 << ch)) === 0;
  };
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
      const dest = cellAt(s, tx, ty);
      const cupIndex = s.cups.findIndex((c) => c.x === tx && c.y === ty);
      if (cupIndex >= 0) {
        const cup = s.cups[cupIndex]!;
        gone.add(b.id);
        if (b.kind === "rock") {
          s.lost = "rock";
          removed.push(removal(b, tx, ty, "rock", cupIndex));
        } else if (cup.cls >= 0 && b.cls >= 0 && b.cls !== cup.cls) {
          s.lost = "wrong";
          removed.push(removal(b, tx, ty, "wrong", cupIndex));
        } else {
          s.collected++;
          cup.n++;
          removed.push(removal(b, tx, ty, "cup", cupIndex));
        }
      } else if (dest === "~") {
        gone.add(b.id);
        if (b.kind === "rock") {
          s.cooled.push(ty * s.w + tx);
          removed.push(removal(b, tx, ty, "cool"));
        } else {
          s.lost = "lava";
          removed.push(removal(b, tx, ty, "lava"));
        }
      } else {
        occ.set(ty * s.w + tx, b);
        const ch = sensorChannel(dest);
        if (ch >= 0 && (s.open & (1 << ch)) === 0) {
          s.open |= 1 << ch;
          opened |= 1 << ch;
        }
      }
      break;
    }
  }
  if (gone.size) s.balls = s.balls.filter((b) => !gone.has(b.id));
  return { moved, opened };
}

/** Rocks destroy touching balls. Returns true if any were destroyed. */
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
  for (const b of doomed) removed.push(removal(b, b.x, b.y, "crush"));
  const ids = new Set(doomed.map((b) => b.id));
  s.balls = s.balls.filter((b) => !ids.has(b.id));
  s.lost = "crush";
  return true;
}

/** Runs gravity until rest or a loss. Mutates `s`; returns the tick frames (frame 0 = start). */
export function settle(s: PinDropState): Frame[] {
  const frames: Frame[] = [snapshot(s, [], 0)];
  for (let i = 0; i < MAX_TICKS; i++) {
    const removed: Removal[] = [];
    const { moved, opened } = tick(s, removed);
    if (!moved) break;
    crush(s, removed);
    frames.push(snapshot(s, removed, opened));
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

export function pinsPulled(s: PinDropState): number {
  let n = 0;
  for (const p of s.pins) if (p.pulled) n++;
  return n;
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

  pulled(): number {
    return pinsPulled(this.state);
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

/** Balls of the same class are interchangeable, so the key ignores ids. */
function stateKey(s: PinDropState): string {
  const pins = s.pins.map((p) => (p.pulled ? "1" : "0")).join("");
  const balls = s.balls
    .map((b) => `${b.kind === "rock" ? "r" : b.cls < 0 ? "g" : b.cls}@${b.x},${b.y}`)
    .sort()
    .join(";");
  const cooled = [...s.cooled].sort((a, b) => a - b).join(",");
  return `${pins}|${balls}|${s.collected}|${s.open}|${cooled}`;
}

/**
 * Breadth-first search over pin orders from `from` (memoised on the full state). Returns the pin
 * indices of a shortest winning order (so its length is the par), or null when none exists.
 */
export function solveFrom(from: PinDropState): number[] | null {
  if (status(from) === "won") return [];
  const seen = new Set<string>([stateKey(from)]);
  let layer: Array<{ s: PinDropState; path: number[] }> = [{ s: from, path: [] }];
  while (layer.length) {
    const next: typeof layer = [];
    for (const { s, path } of layer) {
      for (let i = 0; i < s.pins.length; i++) {
        const r = pullPin(s, i);
        if (!r) continue;
        const st = status(r.state);
        if (st === "won") return [...path, i];
        if (st === "lost") continue;
        const key = stateKey(r.state);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ s: r.state, path: [...path, i] });
      }
    }
    layer = next;
  }
  return null;
}

/** Shortest winning pin order for a level, or null. `solve(level).length` is the par. */
export function solve(level: PinDropLevel): number[] | null {
  return solveFrom(parseLevel(level));
}

export interface Analysis {
  /** Complete pin sequences (stopping at a win or loss) examined. */
  sequences: number;
  wins: number;
  /** Fewest pins pulled in any winning sequence (Infinity if none). */
  minPulls: number;
  /** Most pins pulled in any winning sequence (0 if none). */
  maxPulls: number;
  /** Sequences ending in each loss reason. */
  losses: Partial<Record<LossReason, number>>;
}

/** Exhaustively explores every pin order (memoised); used to rate level difficulty. */
export function analyze(level: PinDropLevel): Analysis {
  interface Sub {
    sequences: number;
    wins: number;
    min: number;
    max: number;
    losses: Partial<Record<LossReason, number>>;
  }
  const memo = new Map<string, Sub>();
  const rec = (s: PinDropState): Sub => {
    const st = status(s);
    if (st !== "playing") {
      const losses: Partial<Record<LossReason, number>> = {};
      const reason = lossReason(s);
      if (st === "lost" && reason) losses[reason] = 1;
      return {
        sequences: 1,
        wins: st === "won" ? 1 : 0,
        min: st === "won" ? 0 : Infinity,
        max: st === "won" ? 0 : -Infinity,
        losses,
      };
    }
    const key = stateKey(s);
    const hit = memo.get(key);
    if (hit) return hit;
    const out: Sub = { sequences: 0, wins: 0, min: Infinity, max: -Infinity, losses: {} };
    for (let i = 0; i < s.pins.length; i++) {
      const r = pullPin(s, i);
      if (!r) continue;
      const sub = rec(r.state);
      out.sequences += sub.sequences;
      out.wins += sub.wins;
      out.min = Math.min(out.min, sub.min + 1);
      out.max = Math.max(out.max, sub.max + 1);
      for (const [k, v] of Object.entries(sub.losses)) {
        const kk = k as LossReason;
        out.losses[kk] = (out.losses[kk] ?? 0) + v;
      }
    }
    memo.set(key, out);
    return out;
  };
  const r = rec(parseLevel(level));
  return {
    sequences: r.sequences,
    wins: r.wins,
    minPulls: r.min,
    maxPulls: r.wins ? r.max : 0,
    losses: r.losses,
  };
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
