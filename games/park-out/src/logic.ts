// Park Out: pure, DOM-free sliding-block model on a 6x6 lot.
//
// Vehicles slide along their own axis only. The marked vehicle (the "target", always the
// vehicle drawn with a T in level rows) must reach the exit on the right edge of its row.
//
// A "move" is one vehicle sliding any number of cells. Consecutive slides of the same
// vehicle (e.g. several single-cell arrow taps) count as ONE move, which matches the move
// metric used by the BFS solver, so the optimal count shown as the target is comparable.

export const SIZE = 6;

export interface Vehicle {
  /** Letter from the level rows; "T" is the target vehicle. */
  id: string;
  /** Column / row of the top-left cell. */
  x: number;
  y: number;
  len: number;
  horizontal: boolean;
  target: boolean;
}

/** One committed slide: vehicle index, position along its axis before and after. */
export interface Slide {
  v: number;
  from: number;
  to: number;
}

/** Position of a vehicle along its sliding axis. */
export const posOf = (v: Vehicle): number => (v.horizontal ? v.x : v.y);

function withPos(v: Vehicle, p: number): Vehicle {
  return v.horizontal ? { ...v, x: p } : { ...v, y: p };
}

/** Parse six 6-character rows ('.' empty, letters = vehicles, 'T' = target). */
export function parseLevel(rows: readonly string[]): Vehicle[] {
  if (rows.length !== SIZE) throw new Error("level needs 6 rows");
  const cells = new Map<string, { x: number; y: number }[]>();
  rows.forEach((row, y) => {
    if (row.length !== SIZE) throw new Error(`row ${y} needs 6 cells`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      if (!/^[A-Z]$/.test(ch)) throw new Error(`bad cell "${ch}"`);
      const list = cells.get(ch) ?? [];
      list.push({ x, y });
      cells.set(ch, list);
    });
  });
  const out: Vehicle[] = [];
  for (const [id, list] of cells) {
    const len = list.length;
    if (len < 2 || len > 3) throw new Error(`vehicle ${id} has length ${len}`);
    const horizontal = list.every((c) => c.y === list[0]!.y);
    const vertical = list.every((c) => c.x === list[0]!.x);
    if (!horizontal && !vertical) throw new Error(`vehicle ${id} is not straight`);
    const xs = list.map((c) => c.x);
    const ys = list.map((c) => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const span = horizontal ? Math.max(...xs) - x + 1 : Math.max(...ys) - y + 1;
    if (span !== len) throw new Error(`vehicle ${id} has a gap`);
    out.push({ id, x, y, len, horizontal, target: id === "T" });
  }
  const targets = out.filter((v) => v.target);
  if (targets.length !== 1 || !targets[0]!.horizontal) {
    throw new Error("level needs exactly one horizontal target T");
  }
  // Stable order: target first, then by id.
  out.sort((a, b) => (a.target ? -1 : b.target ? 1 : a.id.localeCompare(b.id)));
  return out;
}

/** Occupancy grid: vehicle index per cell, -1 when empty. */
export function occupancy(vs: readonly Vehicle[], skip = -1): number[] {
  const g = new Array<number>(SIZE * SIZE).fill(-1);
  vs.forEach((v, i) => {
    if (i === skip) return;
    for (let k = 0; k < v.len; k++) {
      const x = v.horizontal ? v.x + k : v.x;
      const y = v.horizontal ? v.y : v.y + k;
      g[y * SIZE + x] = i;
    }
  });
  return g;
}

/** Inclusive range of positions vehicle `i` can slide to without hitting anything. */
export function slideRange(vs: readonly Vehicle[], i: number): { min: number; max: number } {
  const v = vs[i]!;
  const g = occupancy(vs, i);
  const p = posOf(v);
  const free = (q: number) => {
    const x = v.horizontal ? q : v.x;
    const y = v.horizontal ? v.y : q;
    return g[y * SIZE + x] === -1;
  };
  let min = p;
  while (min - 1 >= 0 && free(min - 1)) min--;
  let max = p;
  while (max + v.len < SIZE && free(max + v.len)) max++;
  return { min, max };
}

export function isSolved(vs: readonly Vehicle[]): boolean {
  const t = vs.find((v) => v.target)!;
  return t.x + t.len === SIZE;
}

// ---- Solver ---------------------------------------------------------------------

export interface Solution {
  /** Minimum number of moves (one vehicle sliding any distance = one move). */
  moves: number;
  /** One optimal sequence, as [vehicle index, destination position]. */
  path: [number, number][];
}

/** Breadth-first search over all reachable lot states. Null when unsolvable. */
export function solve(vs: readonly Vehicle[], maxStates = 2_000_000): Solution | null {
  const start = vs.map(posOf);
  const key = (p: number[]) => p.join(",");
  if (isSolved(vs)) return { moves: 0, path: [] };
  const parent = new Map<string, { prev: string; move: [number, number] } | null>();
  parent.set(key(start), null);
  let frontier: number[][] = [start];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const nextFrontier: number[][] = [];
    for (const p of frontier) {
      const cur = vs.map((v, i) => withPos(v, p[i]!));
      for (let i = 0; i < cur.length; i++) {
        const { min, max } = slideRange(cur, i);
        for (let q = min; q <= max; q++) {
          if (q === p[i]) continue;
          const np = p.slice();
          np[i] = q;
          const k = key(np);
          if (parent.has(k)) continue;
          parent.set(k, { prev: key(p), move: [i, q] });
          if (i === 0 && cur[0]!.target && q + cur[0]!.len === SIZE) {
            const path: [number, number][] = [];
            let at: string | undefined = k;
            for (let e = parent.get(at); e; e = parent.get(at)) {
              path.push(e.move);
              at = e.prev;
            }
            return { moves: depth, path: path.reverse() };
          }
          nextFrontier.push(np);
        }
      }
      if (parent.size > maxStates) return null;
    }
    frontier = nextFrontier;
  }
  return null;
}

// ---- Playable puzzle -------------------------------------------------------------

export interface Puzzle {
  vehicles: Vehicle[];
  history: Slide[];
}

export function newPuzzle(rows: readonly string[]): Puzzle {
  return { vehicles: parseLevel(rows), history: [] };
}

/** Number of moves made: runs of consecutive slides of the same vehicle count once. */
export function moveCount(history: readonly Slide[]): number {
  let n = 0;
  let last = -1;
  for (const s of history) {
    if (s.v !== last) n++;
    last = s.v;
  }
  return n;
}

/** Slide vehicle `v` to `to` along its axis. Returns false if illegal or a no-op. */
export function slideTo(p: Puzzle, v: number, to: number): boolean {
  const veh = p.vehicles[v];
  if (!veh || !Number.isInteger(to) || isSolved(p.vehicles)) return false;
  const from = posOf(veh);
  if (to === from) return false;
  const { min, max } = slideRange(p.vehicles, v);
  if (to < min || to > max) return false;
  p.vehicles[v] = withPos(veh, to);
  p.history.push({ v, from, to });
  return true;
}

/** Slide one cell in direction -1 (left/up) or +1 (right/down). */
export function nudge(p: Puzzle, v: number, dir: -1 | 1): boolean {
  const veh = p.vehicles[v];
  if (!veh) return false;
  return slideTo(p, v, posOf(veh) + dir);
}

export function undo(p: Puzzle): Slide | null {
  const s = p.history.pop();
  if (!s) return null;
  p.vehicles[s.v] = withPos(p.vehicles[s.v]!, s.from);
  return s;
}

export function reset(p: Puzzle): void {
  while (undo(p));
}

/** Rebuild a puzzle from saved slides; null if any slide is illegal. */
export function replay(
  rows: readonly string[],
  slides: readonly [number, number][],
): Puzzle | null {
  const p = newPuzzle(rows);
  for (const [v, to] of slides) {
    if (!slideTo(p, v, to)) return null;
  }
  return p;
}
