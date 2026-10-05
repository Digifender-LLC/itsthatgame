// Park Out: pure, DOM-free sliding-block model on a 6x6 or 7x7 lot.
//
// Vehicles slide along their own axis only. Hero cars (drawn with a star) must reach their
// exit gate: `T` leaves through the gate on the right edge of its row, `U` (levels with two
// heroes) through the gate on the left edge. Bollards (`#`) never move. A level is solved
// when every hero is at its gate.
//
// A "move" is one vehicle sliding any number of cells. Consecutive slides of the same
// vehicle (e.g. several single-cell nudges) count as ONE move, which matches the move
// metric used by the BFS solver, so the optimal count shown as "par" is comparable.

export const MIN_SIZE = 6;
export const MAX_SIZE = 7;
/** Positions are packed into the BFS state key in base 8, so at most 16 vehicles fit. */
export const MAX_VEHICLES = 16;

export interface Lot {
  size: number;
  /** Row-major flags for immovable bollards (length size * size). */
  walls: readonly boolean[];
}

export interface Vehicle {
  /** Letter from the level rows; "T" and "U" are the hero cars. */
  id: string;
  /** Column / row of the top-left cell. */
  x: number;
  y: number;
  len: number;
  horizontal: boolean;
  hero: boolean;
  /** Gate side for a hero: 1 = right edge, -1 = left edge. 1 for ordinary vehicles. */
  exit: 1 | -1;
}

export interface Level {
  lot: Lot;
  vehicles: Vehicle[];
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

/** Parse N rows of N characters ('.' empty, '#' bollard, 'T'/'U' heroes, other letters). */
export function parseLevel(rows: readonly string[]): Level {
  const size = rows.length;
  if (size < MIN_SIZE || size > MAX_SIZE)
    throw new Error(`level needs ${MIN_SIZE}-${MAX_SIZE} rows`);
  const walls = new Array<boolean>(size * size).fill(false);
  const cells = new Map<string, { x: number; y: number }[]>();
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`row ${y} needs ${size} cells`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      if (ch === "#") {
        walls[y * size + x] = true;
        return;
      }
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
    const hero = id === "T" || id === "U";
    out.push({ id, x, y, len, horizontal, hero, exit: id === "U" ? -1 : 1 });
  }
  if (out.length > MAX_VEHICLES) throw new Error(`at most ${MAX_VEHICLES} vehicles`);
  const heroes = out.filter((v) => v.hero);
  if (heroes.length < 1 || heroes.some((h) => !h.horizontal)) {
    throw new Error("level needs at least one horizontal hero T");
  }
  if (heroes.some((h) => h.id === "U") && !heroes.some((h) => h.id === "T")) {
    throw new Error("hero U needs hero T");
  }
  // Stable order: heroes first (T before U), then by id.
  out.sort((a, b) => (a.hero === b.hero ? a.id.localeCompare(b.id) : a.hero ? -1 : 1));
  return { lot: { size, walls }, vehicles: out };
}

/** Occupancy grid: vehicle index per cell, -1 when empty, -2 for a bollard. */
export function occupancy(lot: Lot, vs: readonly Vehicle[], skip = -1): number[] {
  const { size } = lot;
  const g: number[] = lot.walls.map((w) => (w ? -2 : -1));
  vs.forEach((v, i) => {
    if (i === skip) return;
    for (let k = 0; k < v.len; k++) {
      const x = v.horizontal ? v.x + k : v.x;
      const y = v.horizontal ? v.y : v.y + k;
      g[y * size + x] = i;
    }
  });
  return g;
}

/** Inclusive range of positions vehicle `i` can slide to without hitting anything. */
export function slideRange(
  lot: Lot,
  vs: readonly Vehicle[],
  i: number,
): { min: number; max: number } {
  const v = vs[i]!;
  const g = occupancy(lot, vs, i);
  const p = posOf(v);
  const free = (q: number) => {
    const x = v.horizontal ? q : v.x;
    const y = v.horizontal ? v.y : q;
    return g[y * lot.size + x] === -1;
  };
  let min = p;
  while (min - 1 >= 0 && free(min - 1)) min--;
  let max = p;
  while (max + v.len < lot.size && free(max + v.len)) max++;
  return { min, max };
}

/** Position along its axis at which hero `v` is at its gate. */
export const gatePos = (lot: Lot, v: Vehicle): number => (v.exit === 1 ? lot.size - v.len : 0);

export const heroOut = (lot: Lot, v: Vehicle): boolean => v.hero && v.x === gatePos(lot, v);

export function isSolved(lot: Lot, vs: readonly Vehicle[]): boolean {
  let any = false;
  for (const v of vs) {
    if (!v.hero) continue;
    any = true;
    if (!heroOut(lot, v)) return false;
  }
  return any;
}

// ---- Solver ---------------------------------------------------------------------

export interface Solution {
  /** Minimum number of moves (one vehicle sliding any distance = one move). */
  moves: number;
  /** One optimal sequence, as [vehicle index, destination position]. */
  path: [number, number][];
}

/** Breadth-first search over all reachable lot states. Null when unsolvable or too big. */
export function solve(lot: Lot, vs: readonly Vehicle[], maxStates = 3_000_000): Solution | null {
  if (isSolved(lot, vs)) return { moves: 0, path: [] };
  const n = vs.length;
  const size = lot.size;
  const heroes: { i: number; goal: number }[] = [];
  vs.forEach((v, i) => {
    if (v.hero) heroes.push({ i, goal: gatePos(lot, v) });
  });
  const pack = (p: number[]): number => {
    let k = 0;
    for (let i = 0; i < n; i++) k = k * 8 + p[i]!;
    return k;
  };
  const unpack = (k: number, p: number[]): void => {
    for (let i = n - 1; i >= 0; i--) {
      p[i] = k % 8;
      k = Math.floor(k / 8);
    }
  };
  const wallCells: number[] = [];
  lot.walls.forEach((w, c) => {
    if (w) wallCells.push(c);
  });

  const start = vs.map(posOf);
  const keys: number[] = [pack(start)];
  const parent: number[] = [-1];
  const moveOf: number[] = [0];
  const seen = new Map<number, number>([[keys[0]!, 0]]);
  const p: number[] = new Array<number>(n).fill(0);
  const g = new Int8Array(size * size);
  let levelStart = 0;
  let depth = 0;
  while (levelStart < keys.length) {
    depth++;
    const levelEnd = keys.length;
    for (let s = levelStart; s < levelEnd; s++) {
      unpack(keys[s]!, p);
      g.fill(-1);
      for (const c of wallCells) g[c] = -2;
      for (let i = 0; i < n; i++) {
        const v = vs[i]!;
        for (let k = 0; k < v.len; k++) {
          const x = v.horizontal ? p[i]! + k : v.x;
          const y = v.horizontal ? v.y : p[i]! + k;
          g[y * size + x] = i;
        }
      }
      for (let i = 0; i < n; i++) {
        const v = vs[i]!;
        const cur = p[i]!;
        const cellAt = (q: number) => (v.horizontal ? v.y * size + q : q * size + v.x);
        const free = (q: number) => {
          const c = g[cellAt(q)]!;
          return c === -1 || c === i;
        };
        let lo = cur;
        while (lo - 1 >= 0 && free(lo - 1)) lo--;
        let hi = cur;
        while (hi + v.len < size && free(hi + v.len)) hi++;
        for (let q = lo; q <= hi; q++) {
          if (q === cur) continue;
          p[i] = q;
          const k = pack(p);
          p[i] = cur;
          if (seen.has(k)) continue;
          const idx = keys.length;
          seen.set(k, idx);
          keys.push(k);
          parent.push(s);
          moveOf.push(i * 8 + q);
          if (heroes.length && v.hero) {
            p[i] = q;
            let done = true;
            for (const h of heroes) if (p[h.i] !== h.goal) done = false;
            p[i] = cur;
            if (done) {
              const path: [number, number][] = [];
              for (let at = idx; at > 0; at = parent[at]!) {
                const m = moveOf[at]!;
                path.push([Math.floor(m / 8), m % 8]);
              }
              return { moves: depth, path: path.reverse() };
            }
          }
        }
      }
      if (keys.length > maxStates) return null;
    }
    levelStart = levelEnd;
  }
  return null;
}

// ---- Playable puzzle -------------------------------------------------------------

export interface Puzzle {
  lot: Lot;
  vehicles: Vehicle[];
  history: Slide[];
}

export function newPuzzle(rows: readonly string[]): Puzzle {
  const { lot, vehicles } = parseLevel(rows);
  return { lot, vehicles, history: [] };
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

/**
 * Stars for finishing in `moves` against the solver's `par`: 3 at par, 2 within a
 * generous margin (40 % of par, at least 2 extra moves), otherwise 1.
 */
export function starsFor(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(2, Math.round(par * 0.4))) return 2;
  return 1;
}

/** Slide vehicle `v` to `to` along its axis. Returns false if illegal or a no-op. */
export function slideTo(p: Puzzle, v: number, to: number): boolean {
  const veh = p.vehicles[v];
  if (!veh || !Number.isInteger(to) || isSolved(p.lot, p.vehicles)) return false;
  const from = posOf(veh);
  if (to === from) return false;
  const { min, max } = slideRange(p.lot, p.vehicles, v);
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
