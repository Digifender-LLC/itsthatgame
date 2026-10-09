// Paint Path: pure game logic (no DOM). Cells are indexed row-major: index = row * cols + col.
//
// Rules in one place (`Board`):
//   - The brush starts on the start cell and moves one orthogonal step at a time.
//   - Open cells are painted once. Walls block.
//   - Bend tiles (turn): after entering one you must leave at a right angle.
//   - Crossing tiles (bridge): must be crossed twice, once horizontally and once vertically,
//     and each crossing goes straight through.
//   - Portal tiles come in pairs: stepping onto one carries the brush to its twin (both are
//     painted); the next step starts from the twin.
//   - Every cell must end up painted (crossings twice). The level is won then.

export interface Level {
  /** 1-based level number. */
  id: number;
  cols: number;
  rows: number;
  /** Indices of wall cells (blocked). */
  walls: number[];
  /** Index of the start cell (the path always begins here). */
  start: number;
  /** Bend tiles. */
  turns: number[];
  /** Crossing tiles (passed twice). */
  bridges: number[];
  /** Portal pairs. */
  portals: [number, number][];
  /** A known solution (cell indices, start first; portal jumps list both cells). */
  solution: number[];
}

export const K_OPEN = 0;
export const K_WALL = 1;
export const K_TURN = 2;
export const K_BRIDGE = 3;
export const K_PORTAL = 4;

/**
 * Text format for level data: one string per row.
 *   `#` wall, `.` open, `S` start, `t` bend, `x` crossing, `1`..`9` portal pair id.
 */
export function parseLevel(
  id: number,
  rows: readonly string[],
  solution: readonly number[],
): Level {
  const cols = rows[0]!.length;
  const level: Level = {
    id,
    cols,
    rows: rows.length,
    walls: [],
    start: -1,
    turns: [],
    bridges: [],
    portals: [],
    solution: [...solution],
  };
  const pairs = new Map<string, number[]>();
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`level ${id}: ragged row ${r}`);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const ch = row[c]!;
      if (ch === "#") level.walls.push(i);
      else if (ch === "S") level.start = i;
      else if (ch === "t") level.turns.push(i);
      else if (ch === "x") level.bridges.push(i);
      else if (ch >= "1" && ch <= "9") pairs.set(ch, [...(pairs.get(ch) ?? []), i]);
    }
  });
  for (const cells of pairs.values()) {
    if (cells.length !== 2) throw new Error(`level ${id}: portal needs exactly two cells`);
    level.portals.push([cells[0]!, cells[1]!]);
  }
  if (level.start < 0) throw new Error(`level ${id}: no start`);
  return level;
}

/** Inverse of parseLevel (used by the offline generator). */
export function levelRows(level: Level): string[] {
  const chars: string[] = new Array<string>(level.cols * level.rows).fill(".");
  for (const w of level.walls) chars[w] = "#";
  for (const t of level.turns) chars[t] = "t";
  for (const b of level.bridges) chars[b] = "x";
  level.portals.forEach(([a, b], k) => {
    chars[a] = String(k + 1);
    chars[b] = String(k + 1);
  });
  chars[level.start] = "S";
  const rows: string[] = [];
  for (let r = 0; r < level.rows; r++)
    rows.push(chars.slice(r * level.cols, (r + 1) * level.cols).join(""));
  return rows;
}

export function cellCol(level: Pick<Level, "cols">, i: number): number {
  return i % level.cols;
}

export function cellRow(level: Pick<Level, "cols">, i: number): number {
  return Math.floor(i / level.cols);
}

/** Orthogonal neighbours inside the grid (walls included). */
export function neighbours(level: Pick<Level, "cols" | "rows">, i: number): number[] {
  const c = i % level.cols;
  const r = Math.floor(i / level.cols);
  const out: number[] = [];
  if (r > 0) out.push(i - level.cols);
  if (c < level.cols - 1) out.push(i + 1);
  if (r < level.rows - 1) out.push(i + level.cols);
  if (c > 0) out.push(i - 1);
  return out;
}

export function areAdjacent(level: Pick<Level, "cols" | "rows">, a: number, b: number): boolean {
  return neighbours(level, a).includes(b);
}

/** Painted-cell count needed to win: every open cell once, every crossing twice. */
export function requiredCount(level: Level): number {
  return level.cols * level.rows - level.walls.length + level.bridges.length;
}

export type StepResult = "extended" | "backtracked" | "blocked" | "none";

export class Board {
  readonly level: Level;
  readonly total: number;
  readonly kind: Uint8Array;
  readonly partner: Int16Array;
  readonly required: number;
  readonly nbr: number[][];
  path: number[];
  private visits: Uint8Array;
  private axes: Uint8Array;

  constructor(level: Level) {
    this.level = level;
    this.total = level.cols * level.rows;
    this.kind = new Uint8Array(this.total);
    this.partner = new Int16Array(this.total).fill(-1);
    for (const w of level.walls) this.kind[w] = K_WALL;
    for (const t of level.turns) this.kind[t] = K_TURN;
    for (const b of level.bridges) this.kind[b] = K_BRIDGE;
    for (const [a, b] of level.portals) {
      this.kind[a] = K_PORTAL;
      this.kind[b] = K_PORTAL;
      this.partner[a] = b;
      this.partner[b] = a;
    }
    this.required = requiredCount(level);
    this.nbr = [];
    for (let i = 0; i < this.total; i++) this.nbr.push(neighbours(level, i));
    this.visits = new Uint8Array(this.total);
    this.axes = new Uint8Array(this.total);
    this.path = [level.start];
    this.visits[level.start] = 1;
  }

  clone(): Board {
    const b = new Board(this.level);
    b.path = this.path.slice();
    b.visits.set(this.visits);
    b.axes.set(this.axes);
    return b;
  }

  reset(): void {
    this.path = [this.level.start];
    this.visits.fill(0);
    this.axes.fill(0);
    this.visits[this.level.start] = 1;
  }

  head(): number {
    return this.path[this.path.length - 1]!;
  }

  isWon(): boolean {
    return this.path.length === this.required;
  }

  visitCount(cell: number): number {
    return this.visits[cell]!;
  }

  /** How many times `cell` must be painted. */
  cap(cell: number): number {
    const k = this.kind[cell];
    return k === K_WALL ? 0 : k === K_BRIDGE ? 2 : 1;
  }

  /** 0 = horizontal, 1 = vertical, -1 = not adjacent. */
  axisOf(a: number, b: number): number {
    const d = b - a;
    const cols = this.level.cols;
    if (d === cols || d === -cols) return 1;
    if ((d === 1 || d === -1) && Math.floor(a / cols) === Math.floor(b / cols)) return 0;
    return -1;
  }

  /** Cell the brush would land on when stepping to `n`, or -1 when the step is illegal. */
  landing(n: number): number {
    const h = this.head();
    const axis = this.axisOf(h, n);
    if (axis < 0) return -1;
    const path = this.path;
    if (path.length >= 2) {
      const prev = path[path.length - 2]!;
      const inAxis = this.axisOf(prev, h);
      if (inAxis >= 0) {
        const hk = this.kind[h];
        if (hk === K_BRIDGE && n - h !== h - prev) return -1;
        if (hk === K_TURN && inAxis === axis) return -1;
      }
    }
    switch (this.kind[n]) {
      case K_WALL:
        return -1;
      case K_BRIDGE:
        return this.visits[n]! < 2 && (this.axes[n]! & (1 << axis)) === 0 ? n : -1;
      case K_PORTAL: {
        const p = this.partner[n]!;
        return this.visits[n] === 0 && this.visits[p] === 0 ? p : -1;
      }
      default:
        return this.visits[n] === 0 ? n : -1;
    }
  }

  /** Cells the brush can step to right now. */
  moves(): number[] {
    if (this.isWon()) return [];
    const out: number[] = [];
    for (const n of this.nbr[this.head()]!) if (this.landing(n) >= 0) out.push(n);
    return out;
  }

  /** Step to the adjacent cell `n` (must be legal). Returns false if illegal. */
  push(n: number): boolean {
    const land = this.landing(n);
    if (land < 0) return false;
    const axis = this.axisOf(this.head(), n);
    this.visits[n]!++;
    this.axes[n] = this.axes[n]! | (1 << axis);
    this.path.push(n);
    if (this.kind[n] === K_PORTAL) {
      this.visits[land]!++;
      this.path.push(land);
    }
    return true;
  }

  /** Undo the last step (a portal jump counts as one step). */
  popMove(): boolean {
    const path = this.path;
    if (path.length <= 1) return false;
    const last = path.pop()!;
    this.visits[last]!--;
    const prev = path[path.length - 1]!;
    if (this.kind[last] === K_PORTAL && this.partner[last] === prev) {
      path.pop();
      this.visits[prev]!--;
      return true;
    }
    if (this.kind[last] === K_BRIDGE) {
      const axis = this.axisOf(prev, last);
      if (axis >= 0) this.axes[last] = this.axes[last]! & ~(1 << axis);
    }
    return true;
  }

  /** Undo steps until the head sits at path index `index` (never removes the start). */
  rewindTo(index: number): number {
    let n = 0;
    while (this.path.length - 1 > Math.max(0, index) && this.popMove()) n++;
    return n;
  }

  /** Last index of `cell` in the path, or -1. */
  lastIndexOf(cell: number): number {
    return this.path.lastIndexOf(cell);
  }

  /**
   * Tap-style step: extend if legal, rewind if the cell is already painted, else blocked.
   */
  step(cell: number): StepResult {
    if (cell < 0 || cell >= this.total) return "blocked";
    if (this.isWon() || cell === this.head()) return "none";
    if (this.landing(cell) >= 0) {
      this.push(cell);
      return "extended";
    }
    const idx = this.lastIndexOf(cell);
    if (idx >= 0) {
      this.rewindTo(idx);
      return "backtracked";
    }
    return "blocked";
  }

  /**
   * Necessary condition for a solution: every cell that still needs paint must be reachable
   * from the head through cells with paint left (twist rules are ignored, so this only ever
   * over-approximates). False means the position is definitely stuck.
   */
  reachable(): boolean {
    if (this.isWon()) return true;
    const seen = new Uint8Array(this.total);
    const stack: number[] = [];
    const h = this.head();
    const visit = (c: number) => {
      if (seen[c]) return;
      seen[c] = 1;
      stack.push(c);
    };
    for (const n of this.nbr[h]!) {
      if (this.visits[n]! < this.cap(n)) {
        visit(n);
        if (this.kind[n] === K_PORTAL && this.visits[this.partner[n]!] === 0)
          visit(this.partner[n]!);
      }
    }
    while (stack.length) {
      const c = stack.pop()!;
      for (const n of this.nbr[c]!) {
        if (this.visits[n]! < this.cap(n)) {
          visit(n);
          if (this.kind[n] === K_PORTAL && this.visits[this.partner[n]!] === 0)
            visit(this.partner[n]!);
        }
      }
    }
    for (let c = 0; c < this.total; c++) {
      if (this.visits[c]! < this.cap(c) && !seen[c]) return false;
    }
    return true;
  }

  /** A position that can no longer be completed (cheap necessary-condition check). */
  isStuck(): boolean {
    if (this.isWon()) return false;
    return this.moves().length === 0 || !this.reachable();
  }

  /** Dead-end pruning for plain cells: at most one needed cell may have a single exit. */
  private deadEnds(): number {
    const h = this.head();
    let count = 0;
    for (let c = 0; c < this.total; c++) {
      const k = this.kind[c];
      if ((k !== K_OPEN && k !== K_TURN) || this.visits[c]! >= 1) continue;
      let deg = 0;
      for (const n of this.nbr[c]!) {
        if (n === h || this.visits[n]! < this.cap(n)) deg++;
      }
      if (deg <= 1) count++;
    }
    return count;
  }

  /**
   * Depth-first search for a completion from the current position. Returns the cells to
   * append to the path (portal jumps list both cells), or null if none is found within
   * `nodeLimit` nodes.
   */
  solve(nodeLimit = 400_000): number[] | null {
    const b = this.clone();
    const base = b.path.length;
    let nodes = 0;
    const dfs = (): boolean => {
      if (b.isWon()) return true;
      if (++nodes > nodeLimit) return false;
      if (!b.reachable() || b.deadEnds() > 1) return false;
      const ms = b.moves();
      if (ms.length > 1) {
        const free = (n: number) => {
          let f = 0;
          for (const m of b.nbr[n]!) if (b.visits[m]! < b.cap(m)) f++;
          return f;
        };
        ms.sort((x, y) => free(x) - free(y));
      }
      for (const n of ms) {
        b.push(n);
        if (dfs()) return true;
        b.popMove();
      }
      return false;
    };
    return dfs() ? b.path.slice(base) : null;
  }
}

/**
 * Independent check of a complete solution: re-derives every rule from the level data
 * without using `Board`. True when `path` is a valid winning path.
 */
export function verifyPath(level: Level, path: readonly number[]): boolean {
  const total = level.cols * level.rows;
  const wall = new Set(level.walls);
  const turn = new Set(level.turns);
  const bridge = new Set(level.bridges);
  const twin = new Map<number, number>();
  for (const [a, b] of level.portals) {
    twin.set(a, b);
    twin.set(b, a);
  }
  const need = total - wall.size + bridge.size;
  if (path.length !== need || path[0] !== level.start) return false;
  const count = new Map<number, number>();
  const axesUsed = new Map<number, number>();
  const adj = (a: number, b: number) => areAdjacent(level, a, b);
  const axis = (a: number, b: number) => (Math.abs(b - a) === 1 ? 0 : 1);
  count.set(path[0]!, 1);
  let k = 1;
  while (k < path.length) {
    const from = path[k - 1]!;
    const to = path[k]!;
    if (to < 0 || to >= total || wall.has(to) || !adj(from, to)) return false;
    // constraints on leaving `from`
    if (k >= 2 && adj(path[k - 2]!, from)) {
      const prev = path[k - 2]!;
      if (bridge.has(from) && to - from !== from - prev) return false;
      if (turn.has(from) && axis(prev, from) === axis(from, to)) return false;
    }
    const seen = count.get(to) ?? 0;
    if (bridge.has(to)) {
      const used = axesUsed.get(to) ?? 0;
      if (seen >= 2 || (used & (1 << axis(from, to))) !== 0) return false;
      axesUsed.set(to, used | (1 << axis(from, to)));
    } else if (seen >= 1) return false;
    count.set(to, seen + 1);
    k++;
    if (twin.has(to)) {
      const land = twin.get(to)!;
      if (path[k] !== land || (count.get(land) ?? 0) > 0) return false;
      count.set(land, 1);
      k++;
    }
  }
  return true;
}

/** Result of asking for a hint. `rewindTo` is a path index to rewind to first, if any. */
export interface HintResult {
  cells: number[];
  rewindTo: number | null;
}

/**
 * The next `count` cells of a valid solution that is consistent with the painted path. Uses
 * the stored solution while the player is on it, searches from the current position when
 * they have wandered off, and falls back to rewinding to the last shared cell.
 */
export function hintFor(board: Board, count = 3, nodeLimit = 60_000): HintResult | null {
  if (board.isWon()) return null;
  const sol = board.level.solution;
  let common = 0;
  while (common < board.path.length && common < sol.length && board.path[common] === sol[common]) {
    common++;
  }
  if (common === board.path.length) {
    return { cells: sol.slice(common, common + count), rewindTo: null };
  }
  const found = board.solve(nodeLimit);
  if (found) return { cells: found.slice(0, count), rewindTo: null };
  const keep = Math.max(1, common);
  return { cells: sol.slice(keep, keep + count), rewindTo: keep - 1 };
}
