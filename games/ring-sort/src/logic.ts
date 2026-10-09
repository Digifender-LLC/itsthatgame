// Ring Sort: pure game model (no DOM). Pegs hold rings bottom-to-top as colour ids (0-6).
//
// Move rule: pick the top run of same-coloured, visible rings on a source peg and drop as
// many of them as fit onto a target peg whose top ring has the same colour (or which is
// empty). Pegs have their own capacity.
//
// Twists:
//  - Hidden rings: the bottom `hid[p]` rings of a peg are shown as "?" until every ring
//    above them is gone (the ring becomes the top). Once seen, it stays seen. A hidden
//    ring is never part of a lifted run.
//  - Locked pegs: a peg with `locks[p] = c` cannot be used until colour `c` is complete
//    (all of its rings together on one peg). Unlocking is permanent for the attempt.
//
// Complete: a peg that holds every ring of a single colour. Solved: every peg is empty or
// complete, so no colour is split over pegs.

export interface RingLevel {
  /** Rings per peg, bottom to top; values are colour ids. */
  pegs: number[][];
  /** Capacity of each peg. */
  caps: number[];
  /** Number of bottom rings hidden on each peg (default none). */
  hidden?: number[];
  /** Per peg: the colour whose completion unlocks it, or -1 (default none). */
  locks?: number[];
}

export interface RingState {
  pegs: number[][];
  caps: readonly number[];
  /** Hidden bottom rings per peg. */
  hid: number[];
  /** Unlock colour per peg (-1 = never locked). */
  locks: readonly number[];
  /** Locked pegs that have been opened. */
  open: boolean[];
  /** Total rings of each colour (indexed by colour id). */
  totals: readonly number[];
}

export interface Move {
  from: number;
  to: number;
  /** Number of rings that moved. */
  count: number;
  /** Colour that moved. */
  color: number;
  /** Colour completed on the target peg by this move, or -1. */
  completed: number;
  /** Pegs unlocked by this move. */
  unlocked: number[];
  /** True if the move uncovered a hidden ring on the source peg. */
  revealed: boolean;
  prevHidFrom: number;
  prevHidTo: number;
}

export const MAX_COLORS = 7;

export function newState(level: RingLevel): RingState {
  const totals = new Array<number>(MAX_COLORS).fill(0);
  for (const p of level.pegs) for (const c of p) totals[c] = (totals[c] ?? 0) + 1;
  const s: RingState = {
    pegs: level.pegs.map((p) => [...p]),
    caps: level.caps,
    hid: level.pegs.map((p, i) => Math.min(level.hidden?.[i] ?? 0, Math.max(0, p.length - 1))),
    locks: level.pegs.map((_, i) => level.locks?.[i] ?? -1),
    open: level.pegs.map(() => false),
    totals,
  };
  for (let i = 0; i < s.pegs.length; i++) normalize(s, i);
  return s;
}

export function cloneState(s: RingState): RingState {
  return {
    pegs: s.pegs.map((p) => [...p]),
    caps: s.caps,
    hid: [...s.hid],
    locks: s.locks,
    open: [...s.open],
    totals: s.totals,
  };
}

function isUniform(peg: readonly number[]): boolean {
  for (let i = 1; i < peg.length; i++) if (peg[i] !== peg[0]) return false;
  return true;
}

/** Keeps the hidden-ring invariant: the top ring is never hidden; uniform pegs show all. */
function normalize(s: RingState, p: number): void {
  const peg = s.pegs[p]!;
  s.hid[p] = Math.max(0, Math.min(s.hid[p]!, peg.length - 1));
  if (isUniform(peg)) s.hid[p] = 0;
}

/** Length of the visible run of equal colours at the top of a peg (0 for an empty peg). */
export function topRun(peg: readonly number[], hid = 0): number {
  const top = peg[peg.length - 1];
  if (top === undefined) return 0;
  let n = 0;
  for (let i = peg.length - 1; i >= hid && peg[i] === top; i--) n++;
  return n;
}

export function isLocked(s: RingState, p: number): boolean {
  return (s.locks[p] ?? -1) >= 0 && !s.open[p];
}

/** True when the peg holds every ring of one colour (and nothing else). */
export function isComplete(s: RingState, p: number): boolean {
  const peg = s.pegs[p]!;
  return peg.length > 0 && isUniform(peg) && peg.length === s.totals[peg[0]!];
}

/** Number of rings a move from -> to would transfer; 0 means the move is illegal. */
export function moveCount(s: RingState, from: number, to: number): number {
  if (from === to) return 0;
  const a = s.pegs[from];
  const b = s.pegs[to];
  if (!a || !b || a.length === 0) return 0;
  if (isLocked(s, from) || isLocked(s, to)) return 0;
  const space = s.caps[to]! - b.length;
  if (space <= 0) return 0;
  const color = a[a.length - 1];
  if (b.length > 0 && b[b.length - 1] !== color) return 0;
  return Math.min(topRun(a, s.hid[from]), space);
}

/** Applies a move in place and returns it, or null if illegal. */
export function applyMove(s: RingState, from: number, to: number): Move | null {
  const count = moveCount(s, from, to);
  if (count === 0) return null;
  const a = s.pegs[from]!;
  const b = s.pegs[to]!;
  const color = a[a.length - 1]!;
  const prevHidFrom = s.hid[from]!;
  const prevHidTo = s.hid[to]!;
  const moved = a.splice(a.length - count, count);
  for (const c of moved) b.push(c);
  normalize(s, from);
  normalize(s, to);
  const revealed = a.length > 0 && a.length - 1 < prevHidFrom;
  let completed = -1;
  const unlocked: number[] = [];
  if (isComplete(s, to)) {
    completed = color;
    for (let q = 0; q < s.pegs.length; q++) {
      if (s.locks[q] === color && !s.open[q]) {
        s.open[q] = true;
        unlocked.push(q);
      }
    }
  }
  return { from, to, count, color, completed, unlocked, revealed, prevHidFrom, prevHidTo };
}

export function undoMove(s: RingState, m: Move): void {
  const b = s.pegs[m.to]!;
  const moved = b.splice(b.length - m.count, m.count);
  for (const c of moved) s.pegs[m.from]!.push(c);
  s.hid[m.from] = m.prevHidFrom;
  s.hid[m.to] = m.prevHidTo;
  for (const q of m.unlocked) s.open[q] = false;
}

export function isSolved(s: RingState): boolean {
  for (let p = 0; p < s.pegs.length; p++) {
    if (s.pegs[p]!.length > 0 && !isComplete(s, p)) return false;
  }
  return true;
}

export function legalMoves(s: RingState): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < s.pegs.length; i++) {
    for (let j = 0; j < s.pegs.length; j++) {
      if (moveCount(s, i, j) > 0) out.push([i, j]);
    }
  }
  return out;
}

/** No legal move and not solved. */
export function isStuck(s: RingState): boolean {
  return !isSolved(s) && legalMoves(s).length === 0;
}

export type Status = "playing" | "won" | "lost";

/** Mutable game session with undo and restart. */
export class RingGame {
  state: RingState;
  private readonly initial: RingLevel;
  private history: Move[] = [];

  constructor(level: RingLevel) {
    this.initial = level;
    this.state = newState(level);
  }

  get moves(): number {
    return this.history.length;
  }

  status(): Status {
    if (isSolved(this.state)) return "won";
    if (isStuck(this.state)) return "lost";
    return "playing";
  }

  move(from: number, to: number): Move | null {
    if (this.status() === "won") return null;
    const m = applyMove(this.state, from, to);
    if (m) this.history.push(m);
    return m;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): Move | null {
    const m = this.history.pop();
    if (!m) return null;
    undoMove(this.state, m);
    return m;
  }

  restart(): void {
    this.state = newState(this.initial);
    this.history = [];
  }
}

// ---- Solver -------------------------------------------------------------------

/**
 * Admissible lower bound on remaining moves: every move takes rings of one colour from one
 * peg, and a peg must shed every colour that sits above its bottom run of equal rings.
 */
export function heuristic(s: RingState): number {
  let h = 0;
  for (const peg of s.pegs) {
    const n = peg.length;
    if (n === 0) continue;
    const base = peg[0];
    let i = 0;
    while (i < n && peg[i] === base) i++;
    let mask = 0;
    for (; i < n; i++) mask |= 1 << peg[i]!;
    while (mask) {
      h++;
      mask &= mask - 1;
    }
  }
  return h;
}

/** Canonical key: interchangeable pegs (same capacity and lock) are order independent. */
export function canonicalKey(s: RingState): string {
  const parts: string[] = [];
  for (let p = 0; p < s.pegs.length; p++) {
    const lock = s.locks[p]!;
    parts.push(
      `${s.caps[p]}${lock >= 0 ? `L${lock}${s.open[p] ? "o" : "c"}` : ""}:${s.hid[p]}:${s.pegs[p]!.join("")}`,
    );
  }
  return parts.sort().join("|");
}

function encode(s: RingState): string {
  const parts: string[] = [];
  let open = 0;
  for (let p = 0; p < s.pegs.length; p++) {
    parts.push(`${s.hid[p]}${s.pegs[p]!.join("")}`);
    if (s.open[p]) open |= 1 << p;
  }
  return `${open}|${parts.join(",")}`;
}

function decode(like: RingState, enc: string): RingState {
  const [open, rest] = enc.split("|") as [string, string];
  const parts = rest.split(",");
  const openMask = Number(open);
  return {
    pegs: parts.map((t) => (t.length > 1 ? t.slice(1).split("").map(Number) : [])),
    caps: like.caps,
    hid: parts.map((t) => Number(t[0])),
    locks: like.locks,
    open: parts.map((_, p) => (openMask & (1 << p)) !== 0),
    totals: like.totals,
  };
}

interface Node {
  enc: string;
  g: number;
  parent: number;
  move: Move | null;
}

export interface SolveOptions {
  /** Node expansion budget. */
  maxNodes?: number;
  /** Heuristic weight: 1 is optimal, larger is faster but may be longer. */
  weight?: number;
}

export interface SolveResult {
  moves: Move[];
  /** True when the search completed with weight 1, so the length is provably minimal. */
  optimal: boolean;
  nodes: number;
}

/** Binary min-heap keyed by number (stable enough for A*). */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0]!;
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1]! < k[c]!) c++;
        if (k[c]! >= lk) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

/**
 * Weighted A* over canonical states. Returns a move list that solves the state, or null if
 * none was found within the node budget. With `weight: 1` and a completed search the result
 * is a shortest solution.
 */
export function solveDetailed(start: RingState, opts: SolveOptions = {}): SolveResult | null {
  const maxNodes = opts.maxNodes ?? 200_000;
  const weight = opts.weight ?? 1;
  const root = cloneState(start);
  if (isSolved(root)) return { moves: [], optimal: true, nodes: 0 };
  const nodes: Node[] = [{ enc: encode(root), g: 0, parent: -1, move: null }];
  const best = new Map<string, number>([[canonicalKey(root), 0]]);
  const open = new Heap();
  open.push(weight * heuristic(root), 0);
  let expanded = 0;
  while (open.size > 0) {
    const id = open.pop();
    const node = nodes[id]!;
    const s = decode(root, node.enc);
    if (isSolved(s)) {
      const moves: Move[] = [];
      for (let n = id; nodes[n]!.parent >= 0; n = nodes[n]!.parent) moves.push(nodes[n]!.move!);
      moves.reverse();
      return { moves, optimal: weight === 1, nodes: expanded };
    }
    if (best.get(canonicalKey(s))! < node.g) continue;
    if (++expanded > maxNodes) return null;
    const seenEmpty = new Set<string>();
    for (let f = 0; f < s.pegs.length; f++) {
      const src = s.pegs[f]!;
      if (src.length === 0) continue;
      for (let t = 0; t < s.pegs.length; t++) {
        const cnt = moveCount(s, f, t);
        if (cnt === 0) continue;
        const dst = s.pegs[t]!;
        if (dst.length === 0) {
          // Pointless: relocating a whole uniform peg onto an empty peg of equal size.
          if (src.length === cnt && isUniform(src) && s.caps[f] === s.caps[t]) continue;
          // Interchangeable empty pegs give identical children.
          const sig = `${s.caps[t]}:${s.locks[t]}:${s.open[t]}`;
          if (s.locks[t]! < 0 && seenEmpty.has(sig)) continue;
          seenEmpty.add(sig);
        }
        const m = applyMove(s, f, t)!;
        const g = node.g + 1;
        const key = canonicalKey(s);
        const prev = best.get(key);
        if (prev === undefined || g < prev) {
          best.set(key, g);
          nodes.push({ enc: encode(s), g, parent: id, move: m });
          open.push(g + weight * heuristic(s), nodes.length - 1);
        }
        undoMove(s, m);
      }
    }
  }
  return null;
}

/** Moves that solve the state (a good, not necessarily shortest, solution) or null. */
export function solve(start: RingState, maxNodes = 200_000, weight = 1.5): Move[] | null {
  return solveDetailed(start, { maxNodes, weight })?.moves ?? null;
}

/** Replays a move list from a level and reports whether it ends solved. */
export function replay(level: RingLevel, moves: ReadonlyArray<{ from: number; to: number }>) {
  const s = newState(level);
  for (const m of moves) {
    if (applyMove(s, m.from, m.to) === null) return false;
  }
  return isSolved(s);
}
