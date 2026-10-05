// Tile Trio: pure game model (no DOM).
//
// Tiles sit on layers. A tile is 2x2 board units; a tile is covered when a tile on a higher
// layer overlaps it (rectangles intersect). Tap a free tile to move it to the 7-slot tray; the
// tray keeps equal symbols together, and three equal symbols clear. You lose when the tray is
// full after a move (no clear happened) or when nothing can be tapped any more; you win when
// the board and tray are empty.
//
// Twists: a frozen tile (`ice: n`) cannot be taken until n tiles have been taken in total
// (`taps >= n`); fog is a rendering-only flag (covered tiles hide their symbol).
// Helpers: undo (any move or helper), return the last 3 tray tiles to the board, and a
// shuffle that re-deals the symbols of the tiles left on the board so the level stays winnable.

export const TRAY_SIZE = 7;
export const TILE_UNITS = 2;

export interface Tile {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Symbol index. */
  type: number;
  /** Frozen until this many tiles have been taken (absent or 0 = not frozen). */
  ice?: number;
}

export interface TileLevel {
  tiles: Tile[];
  /** Covered tiles hide their symbol (rendering only). */
  fog?: boolean;
}

export type Status = "playing" | "won" | "lost";

export function overlaps(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) < TILE_UNITS && Math.abs(a.y - b.y) < TILE_UNITS;
}

/** coveredBy[i] lists ids of tiles directly above (and overlapping) tile i. */
export function computeCovers(tiles: readonly Tile[]): number[][] {
  return tiles.map((t) => tiles.filter((o) => o.z > t.z && overlaps(t, o)).map((o) => o.id));
}

export interface MoveResult {
  id: number;
  /** Tray content right after insertion, before any clear (for animation). */
  trayBeforeClear: number[];
  cleared: number[];
}

interface Snapshot {
  removed: boolean[];
  tray: number[];
  taps: number;
  types: number[];
  log: number[];
}

// ---- Ordering and dealing (shared by level generation and the shuffle helper) ----------

/**
 * A random legal removal order of the tiles still on the board: every tile is free (nothing
 * unremoved above it) and thawed at the moment it is taken. `taps0` is the number of taps
 * already made. Returns null when a frozen tile makes the board deadlock.
 */
export function legalOrder(
  tiles: readonly Tile[],
  covers: readonly number[][],
  removed: readonly boolean[],
  taps0: number,
  rnd: () => number,
): number[] | null {
  const left = new Set<number>();
  for (const t of tiles) if (!removed[t.id]) left.add(t.id);
  const out: number[] = [];
  while (left.size) {
    const free: number[] = [];
    for (const id of left) {
      if (covers[id]!.some((c) => left.has(c))) continue;
      if ((tiles[id]!.ice ?? 0) > taps0 + out.length) continue;
      free.push(id);
    }
    if (!free.length) return null;
    const pick = free[Math.floor(rnd() * free.length)]!;
    left.delete(pick);
    out.push(pick);
  }
  return out;
}

/**
 * Assigns a symbol to each of `n` successive taps so that a player following that order never
 * holds more than `cap` tiles in the tray after a move, and at most `active` symbols are
 * "open" at once when possible. `pool[s]` is how many tiles of symbol s are still to be
 * dealt, `tray[s]` how many of symbol s already sit in the tray (0-2). The result is a
 * witness: following the order wins. Returns null when no valid deal exists under `cap`.
 */
export function dealAlong(
  n: number,
  pool: readonly number[],
  tray: readonly number[],
  cap: number,
  rnd: () => number,
  active: number,
): number[] | null {
  const left = [...pool];
  const open = pool.map((_, s) => tray[s] ?? 0);
  let trayLen = open.reduce((a, b) => a + b, 0);
  let groups = open.filter((o) => o > 0).length;
  const out: number[] = [];
  const weights = new Array<number>(pool.length).fill(0);
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (let relax = 0; relax < 2 && total === 0; relax++) {
      total = 0;
      for (let s = 0; s < left.length; s++) {
        let w = 0;
        if (left[s]! > 0) {
          const o = open[s]!;
          if (o >= 2) w = 3;
          else if (o === 1) w = trayLen + 1 <= cap ? 2 : 0;
          else if (trayLen + 1 <= cap && (groups < active || relax === 1)) w = 1;
        }
        weights[s] = w;
        total += w;
      }
    }
    if (total === 0) return null;
    let r = rnd() * total;
    let s = 0;
    for (; s < weights.length - 1; s++) {
      if (r < weights[s]!) break;
      r -= weights[s]!;
    }
    while (weights[s] === 0) s--;
    out.push(s);
    left[s]!--;
    if (open[s]! >= 2) {
      open[s] = 0;
      trayLen -= 2;
      groups--;
    } else {
      if (open[s] === 0) groups++;
      open[s]!++;
      trayLen++;
    }
  }
  return out;
}

// ---- Game ---------------------------------------------------------------------------

export class TileGame {
  readonly tiles: Tile[];
  readonly covers: number[][];
  readonly fog: boolean;
  removed: boolean[];
  /** Tile ids currently in the tray, equal symbols adjacent. */
  tray: number[] = [];
  /** Tiles taken so far (thaws frozen tiles). Restored by undo. */
  taps = 0;
  /** Largest tray size seen after any move (never lowered by undo; drives the stars). */
  peak = 0;
  /** Ids in the order they were taken. */
  log: number[] = [];
  private history: Snapshot[] = [];
  private cached: Status | null = null;

  constructor(level: TileLevel) {
    // ids must equal indices
    this.tiles = level.tiles.map((t, i) => ({ ...t, id: i }));
    this.covers = computeCovers(this.tiles);
    this.fog = !!level.fog;
    this.removed = this.tiles.map(() => false);
  }

  get remaining(): number {
    let n = 0;
    for (const r of this.removed) if (!r) n++;
    return n;
  }

  /** True while the tile is frozen: still on the board and not yet thawed. */
  isFrozen(id: number): boolean {
    return !this.removed[id] && (this.tiles[id]!.ice ?? 0) > this.taps;
  }

  /** Not covered by another tile (ignores ice). */
  isUncovered(id: number): boolean {
    return !this.removed[id] && this.covers[id]!.every((c) => this.removed[c]);
  }

  isFree(id: number): boolean {
    return this.isUncovered(id) && !this.isFrozen(id);
  }

  freeTiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  /** Number of tiles above (still on the board) that cover this one. */
  coverCount(id: number): number {
    let n = 0;
    for (const c of this.covers[id]!) if (!this.removed[c]) n++;
    return n;
  }

  private compute(): Status {
    const rem = this.remaining;
    if (rem === 0 && this.tray.length === 0) return "won";
    if (this.tray.length >= TRAY_SIZE) return "lost";
    if (rem === 0) return "lost";
    for (let i = 0; i < this.tiles.length; i++) if (this.isFree(i)) return "playing";
    return "lost";
  }

  status(): Status {
    return (this.cached ??= this.compute());
  }

  /** Why the game is lost, for the message on the stuck card. */
  lossReason(): "tray" | "stuck" | null {
    if (this.status() !== "lost") return null;
    return this.tray.length >= TRAY_SIZE ? "tray" : "stuck";
  }

  private snapshot(): void {
    this.history.push({
      removed: [...this.removed],
      tray: [...this.tray],
      taps: this.taps,
      types: this.tiles.map((t) => t.type),
      log: [...this.log],
    });
  }

  /** Moves a free tile into the tray; returns null if not allowed. */
  take(id: number): MoveResult | null {
    if (this.status() !== "playing" || !this.isFree(id)) return null;
    this.snapshot();
    this.cached = null;
    this.removed[id] = true;
    this.taps++;
    this.log.push(id);
    const type = this.tiles[id]!.type;
    let at = -1;
    for (let i = 0; i < this.tray.length; i++) if (this.tiles[this.tray[i]!]!.type === type) at = i;
    if (at < 0) this.tray.push(id);
    else this.tray.splice(at + 1, 0, id);
    const trayBeforeClear = [...this.tray];
    const same = this.tray.filter((t) => this.tiles[t]!.type === type);
    let cleared: number[] = [];
    if (same.length >= 3) {
      cleared = same.slice(0, 3);
      this.tray = this.tray.filter((t) => !cleared.includes(t));
    }
    this.peak = Math.max(this.peak, this.tray.length);
    return { id, trayBeforeClear, cleared };
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): boolean {
    const h = this.history.pop();
    if (!h) return false;
    this.removed = h.removed;
    this.tray = h.tray;
    this.taps = h.taps;
    this.log = h.log;
    h.types.forEach((ty, i) => (this.tiles[i]!.type = ty));
    this.cached = null;
    return true;
  }

  /** Puts the last `n` tiles taken that still sit in the tray back on the board. */
  returnFromTray(n = 3): number[] | null {
    if (this.status() === "won" || this.tray.length === 0) return null;
    const ids: number[] = [];
    for (let i = this.log.length - 1; i >= 0 && ids.length < n; i--) {
      const id = this.log[i]!;
      if (this.tray.includes(id) && !ids.includes(id)) ids.push(id);
    }
    if (!ids.length) return null;
    this.snapshot();
    for (const id of ids) this.removed[id] = false;
    this.tray = this.tray.filter((t) => !ids.includes(t));
    this.cached = null;
    return ids;
  }

  /**
   * Re-deals the symbols of every tile left on the board (the multiset of symbols is kept,
   * the tray is untouched). The new deal follows a legal tap order, so the board is still
   * winnable from the current tray. Returns false when no safe deal was found.
   */
  shuffle(rnd: () => number): boolean {
    if (this.status() !== "playing") return false;
    const board = this.tiles.filter((t) => !this.removed[t.id]);
    if (board.length < 3) return false;
    const kinds = Math.max(...this.tiles.map((t) => t.type)) + 1;
    const pool = new Array<number>(kinds).fill(0);
    for (const t of board) pool[t.type]!++;
    const trayCount = new Array<number>(kinds).fill(0);
    for (const id of this.tray) trayCount[this.tiles[id]!.type]!++;
    for (let attempt = 0; attempt < 12; attempt++) {
      const order = legalOrder(this.tiles, this.covers, this.removed, this.taps, rnd);
      if (!order) continue;
      const deal = dealAlong(order.length, pool, trayCount, attempt < 6 ? 5 : 6, rnd, 3);
      if (!deal) continue;
      this.snapshot();
      order.forEach((id, i) => (this.tiles[id]!.type = deal[i]!));
      this.cached = null;
      return true;
    }
    return false;
  }

  restart(): void {
    this.removed = this.tiles.map(() => false);
    this.tray = [];
    this.history = [];
    this.log = [];
    this.taps = 0;
    this.peak = 0;
    this.cached = null;
  }
}

// ---- Solver -------------------------------------------------------------------

/**
 * Depth-first search with memoization over (removed set, tray symbol counts), starting from the
 * state of `game`. Returns the order of tile ids to tap, or null if none is found within
 * `maxNodes` expansions.
 */
export function solveFrom(game: TileGame, maxNodes = 400_000): number[] | null {
  const tiles = game.tiles;
  const covers = game.covers;
  const n = tiles.length;
  const removed = [...game.removed];
  const trayCount = new Map<number, number>();
  for (const id of game.tray) {
    const ty = tiles[id]!.type;
    trayCount.set(ty, (trayCount.get(ty) ?? 0) + 1);
  }
  let trayLen = game.tray.length;
  let taps = game.taps;
  const seen = new Set<string>();
  const path: number[] = [];
  let nodes = 0;
  // number of tiles that each tile covers (higher = more valuable to free)
  const coversOthers = tiles.map((t) => tiles.filter((o) => o.z < t.z && overlaps(t, o)).length);

  const key = (): string => {
    let k = "";
    for (let i = 0; i < n; i++) k += removed[i] ? "1" : "0";
    const parts: string[] = [];
    for (const [t, c] of trayCount) if (c > 0) parts.push(`${t}:${c}`);
    parts.sort();
    return k + "|" + parts.join(",");
  };

  const dfs = (left: number): boolean => {
    if (left === 0) return trayLen === 0;
    if (++nodes > maxNodes) return false;
    const k = key();
    if (seen.has(k)) return false;
    seen.add(k);
    const free: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!removed[i] && (tiles[i]!.ice ?? 0) <= taps && covers[i]!.every((c) => removed[c]))
        free.push(i);
    }
    const score = (id: number): number => {
      const have = trayCount.get(tiles[id]!.type) ?? 0;
      let v = have === 2 ? 1000 : have === 1 ? 300 : 0;
      if (have === 0) v -= trayLen * 20;
      v += coversOthers[id]! * 3;
      return v;
    };
    free.sort((a, b) => score(b) - score(a) || a - b);
    for (const id of free) {
      const type = tiles[id]!.type;
      const have = trayCount.get(type) ?? 0;
      const clears = have === 2;
      if (!clears && trayLen + 1 >= TRAY_SIZE) continue; // would fill the tray
      removed[id] = true;
      taps++;
      if (clears) {
        trayCount.set(type, 0);
        trayLen -= 2;
      } else {
        trayCount.set(type, have + 1);
        trayLen += 1;
      }
      path.push(id);
      if (dfs(left - 1)) return true;
      path.pop();
      if (clears) {
        trayCount.set(type, 2);
        trayLen += 2;
      } else {
        trayCount.set(type, have);
        trayLen -= 1;
      }
      taps--;
      removed[id] = false;
      if (nodes > maxNodes) return false;
    }
    return false;
  };

  const left = removed.filter((r) => !r).length;
  return dfs(left) ? [...path] : null;
}

/** Solves a fresh level. */
export function solve(level: TileLevel, maxNodes = 400_000): number[] | null {
  return solveFrom(new TileGame(level), maxNodes);
}

/** Replays a tap order; returns the final status. */
export function replay(level: TileLevel, order: readonly number[]): Status {
  const g = new TileGame(level);
  for (const id of order) if (!g.take(id)) return "lost";
  return g.status();
}

/** Largest tray size reached while replaying a tap order. */
export function peakOf(level: TileLevel, order: readonly number[]): number {
  const g = new TileGame(level);
  for (const id of order) g.take(id);
  return g.peak;
}
