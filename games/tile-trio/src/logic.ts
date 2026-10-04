// Tile Trio: pure game model (no DOM).
//
// Tiles sit on layers. A tile is 2x2 board units; a tile is covered when a tile on a higher
// layer overlaps it (rectangles intersect). Tap an uncovered tile to move it to the 7-slot
// tray; the tray keeps equal symbols together, and three equal symbols clear. You lose when
// the tray is full after a move (no clear happened); you win when the board is empty.

export const TRAY_SIZE = 7;
export const TILE_UNITS = 2;

export interface Tile {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Symbol index. */
  type: number;
}

export interface TileLevel {
  tiles: Tile[];
}

export type Status = "playing" | "won" | "lost";

export function overlaps(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) < TILE_UNITS && Math.abs(a.y - b.y) < TILE_UNITS;
}

/** coveredBy[i] lists ids of tiles directly above (and overlapping) tile i. */
export function computeCovers(tiles: readonly Tile[]): number[][] {
  return tiles.map((t) => tiles.filter((o) => o.z > t.z && overlaps(t, o)).map((o) => o.id));
}

export interface Snapshot {
  removed: boolean[];
  tray: number[];
}

export interface MoveResult {
  id: number;
  /** Tray content right after insertion, before any clear (for animation). */
  trayBeforeClear: number[];
  cleared: number[];
}

export class TileGame {
  readonly tiles: readonly Tile[];
  readonly covers: number[][];
  removed: boolean[];
  /** Tile ids currently in the tray, equal symbols adjacent. */
  tray: number[] = [];
  private history: Snapshot[] = [];

  constructor(level: TileLevel) {
    // ids must equal indices
    this.tiles = level.tiles.map((t, i) => ({ ...t, id: i }));
    this.covers = computeCovers(this.tiles);
    this.removed = this.tiles.map(() => false);
  }

  get remaining(): number {
    return this.removed.filter((r) => !r).length;
  }

  isFree(id: number): boolean {
    if (this.removed[id]) return false;
    return this.covers[id]!.every((c) => this.removed[c]);
  }

  freeTiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  status(): Status {
    if (this.remaining === 0 && this.tray.length === 0) return "won";
    if (this.tray.length >= TRAY_SIZE) return "lost";
    return "playing";
  }

  /** Moves a free tile into the tray; returns null if not allowed. */
  take(id: number): MoveResult | null {
    if (this.status() !== "playing" || !this.isFree(id)) return null;
    this.history.push({ removed: [...this.removed], tray: [...this.tray] });
    this.removed[id] = true;
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
    return true;
  }

  restart(): void {
    this.removed = this.tiles.map(() => false);
    this.tray = [];
    this.history = [];
  }
}

// ---- Solver -------------------------------------------------------------------

/**
 * Depth-first search with memoization over (removed set, tray symbol counts). Returns the
 * order of tile ids to tap, or null if none is found within `maxNodes` expansions.
 */
export function solve(level: TileLevel, maxNodes = 400_000): number[] | null {
  const tiles = level.tiles.map((t, i) => ({ ...t, id: i }));
  const covers = computeCovers(tiles);
  const n = tiles.length;
  const removed = new Array<boolean>(n).fill(false);
  const trayCount = new Map<number, number>();
  let trayLen = 0;
  const seen = new Set<string>();
  const path: number[] = [];
  let nodes = 0;
  const coverCount = tiles.map(() => 0);
  // number of tiles that each tile covers (higher = more valuable to free)
  const coversOthers = tiles.map((t) => tiles.filter((o) => o.z < t.z && overlaps(t, o)).length);
  for (const t of tiles) coverCount[t.id] = covers[t.id]!.length;

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
      if (!removed[i] && covers[i]!.every((c) => removed[c])) free.push(i);
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
      removed[id] = false;
      if (nodes > maxNodes) return false;
    }
    return false;
  };

  return dfs(n) ? [...path] : null;
}

/** Replays a tap order; returns the final status. */
export function replay(level: TileLevel, order: readonly number[]): Status {
  const g = new TileGame(level);
  for (const id of order) if (!g.take(id)) return "lost";
  return g.status();
}
