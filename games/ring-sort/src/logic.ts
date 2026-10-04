// Ring Sort: pure game model (no DOM). Pegs hold rings bottom-to-top as color indices.
// Move rule: pick the top run of same-colored rings on a source peg and drop as many of
// them as fit onto a target peg whose top ring has the same color (or which is empty).
// Solved: every peg is empty or holds a single color, and no color is split over pegs.

export interface RingLevel {
  /** Rings per peg, bottom to top; values are color indices. */
  pegs: number[][];
  /** Maximum rings a peg can hold. */
  cap: number;
}

export interface RingState {
  pegs: number[][];
  cap: number;
}

export interface Move {
  from: number;
  to: number;
  /** Number of rings that moved. */
  count: number;
}

export function newState(level: RingLevel): RingState {
  return { pegs: level.pegs.map((p) => [...p]), cap: level.cap };
}

export function cloneState(s: RingState): RingState {
  return { pegs: s.pegs.map((p) => [...p]), cap: s.cap };
}

/** Length of the run of equal colors at the top of a peg (0 for an empty peg). */
export function topRun(peg: readonly number[]): number {
  const top = peg[peg.length - 1];
  if (top === undefined) return 0;
  let n = 0;
  for (let i = peg.length - 1; i >= 0 && peg[i] === top; i--) n++;
  return n;
}

/** Number of rings a move from -> to would transfer; 0 means the move is illegal. */
export function moveCount(s: RingState, from: number, to: number): number {
  if (from === to) return 0;
  const a = s.pegs[from];
  const b = s.pegs[to];
  if (!a || !b || a.length === 0) return 0;
  const space = s.cap - b.length;
  if (space <= 0) return 0;
  const color = a[a.length - 1];
  if (b.length > 0 && b[b.length - 1] !== color) return 0;
  return Math.min(topRun(a), space);
}

/** Applies a move in place and returns it, or null if illegal. */
export function applyMove(s: RingState, from: number, to: number): Move | null {
  const count = moveCount(s, from, to);
  if (count === 0) return null;
  const a = s.pegs[from]!;
  const b = s.pegs[to]!;
  const moved = a.splice(a.length - count, count);
  b.push(...moved);
  return { from, to, count };
}

export function undoMove(s: RingState, m: Move): void {
  const b = s.pegs[m.to]!;
  const moved = b.splice(b.length - m.count, m.count);
  s.pegs[m.from]!.push(...moved);
}

export function isSolved(s: RingState): boolean {
  const seen = new Set<number>();
  for (const p of s.pegs) {
    if (p.length === 0) continue;
    const c = p[0]!;
    if (seen.has(c)) return false;
    seen.add(c);
    if (!p.every((x) => x === c)) return false;
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

function canonicalKey(s: RingState): string {
  return s.pegs
    .map((p) => p.join(","))
    .sort()
    .join("|");
}

/**
 * Depth-first search with a visited set over canonical (peg-order independent) states.
 * Returns a move list that solves the state, or null if none was found within `maxNodes`.
 */
export function solve(start: RingState, maxNodes = 400_000): Move[] | null {
  const s = cloneState(start);
  const seen = new Set<string>();
  const path: Move[] = [];
  let nodes = 0;

  const score = (from: number, to: number): number => {
    const a = s.pegs[from]!;
    const b = s.pegs[to]!;
    const run = topRun(a);
    let v = 0;
    if (b.length > 0) v += 10; // stack onto a matching ring
    if (run === a.length) v -= 5; // moving a whole uniform peg is rarely useful
    if (b.length === 0 && run === a.length) v -= 20;
    v += run;
    // exposing a different color below is progress for the source peg
    return v;
  };

  const dfs = (): boolean => {
    if (isSolved(s)) return true;
    if (++nodes > maxNodes) return false;
    const key = canonicalKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    const moves = legalMoves(s).filter(([f, t]) => {
      // Pointless: relocating an entire uniform peg onto an empty peg.
      const a = s.pegs[f]!;
      return !(s.pegs[t]!.length === 0 && topRun(a) === a.length);
    });
    moves.sort((x, y) => score(y[0], y[1]) - score(x[0], x[1]));
    for (const [f, t] of moves) {
      const m = applyMove(s, f, t)!;
      path.push(m);
      if (dfs()) return true;
      path.pop();
      undoMove(s, m);
      if (nodes > maxNodes) return false;
    }
    return false;
  };

  return dfs() ? path : null;
}

/** Replays a move list from a level and reports whether it ends solved. */
export function replay(level: RingLevel, moves: readonly Move[]): boolean {
  const s = newState(level);
  for (const m of moves) {
    if (applyMove(s, m.from, m.to) === null) return false;
  }
  return isSolved(s);
}
