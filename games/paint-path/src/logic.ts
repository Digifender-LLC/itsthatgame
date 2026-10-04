// Paint Path: pure game logic (no DOM). Cells are indexed row-major: index = row * cols + col.

export interface Level {
  /** 1-based level number. */
  id: number;
  cols: number;
  rows: number;
  /** Indices of wall cells (blocked). */
  walls: number[];
  /** Index of the start cell (the path always begins here). */
  start: number;
  /** A known solution path (cell indices, start first) that visits every open cell once. */
  solution: number[];
}

export interface PaintState {
  level: Level;
  /** Cells painted so far, in order; path[0] is always the start cell. */
  path: number[];
  /** Number of open (non-wall) cells. */
  openCount: number;
}

export function cellCol(level: Pick<Level, "cols">, i: number): number {
  return i % level.cols;
}

export function cellRow(level: Pick<Level, "cols">, i: number): number {
  return Math.floor(i / level.cols);
}

export function isWall(level: Level, i: number): boolean {
  return level.walls.includes(i);
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

export function openCellCount(level: Level): number {
  return level.cols * level.rows - level.walls.length;
}

export function createState(level: Level): PaintState {
  return { level, path: [level.start], openCount: openCellCount(level) };
}

export function head(state: PaintState): number {
  return state.path[state.path.length - 1]!;
}

export function isWon(state: PaintState): boolean {
  return state.path.length === state.openCount;
}

export type StepResult = "extended" | "backtracked" | "blocked" | "none";

/**
 * Try to move the brush to `cell`.
 * - adjacent, open, unpainted: extend the path ("extended")
 * - an already painted cell earlier in the path: rewind to it ("backtracked")
 * - the current head: nothing ("none")
 * - anything else (wall, painted-but-not-reachable, non-adjacent): "blocked"
 */
export function step(state: PaintState, cell: number): { state: PaintState; result: StepResult } {
  const { level, path } = state;
  if (cell < 0 || cell >= level.cols * level.rows) return { state, result: "blocked" };
  if (isWon(state)) return { state, result: "none" };
  const h = head(state);
  if (cell === h) return { state, result: "none" };
  const idx = path.indexOf(cell);
  if (idx >= 0) {
    return { state: { ...state, path: path.slice(0, idx + 1) }, result: "backtracked" };
  }
  if (isWall(level, cell) || !areAdjacent(level, h, cell)) return { state, result: "blocked" };
  return { state: { ...state, path: [...path, cell] }, result: "extended" };
}

/** Remove the last painted cell (the start cell can never be removed). */
export function undo(state: PaintState): PaintState {
  if (state.path.length <= 1) return state;
  return { ...state, path: state.path.slice(0, -1) };
}

export function restart(state: PaintState): PaintState {
  return createState(state.level);
}

/** Cells the brush could move to right now. */
export function availableMoves(state: PaintState): number[] {
  if (isWon(state)) return [];
  const used = new Set(state.path);
  return neighbours(state.level, head(state)).filter(
    (n) => !used.has(n) && !isWall(state.level, n),
  );
}

/** True when `path` is a valid complete solution of `level`. */
export function verifyPath(level: Level, path: number[]): boolean {
  if (path.length !== openCellCount(level) || path[0] !== level.start) return false;
  const seen = new Set<number>();
  for (let k = 0; k < path.length; k++) {
    const c = path[k]!;
    if (seen.has(c) || isWall(level, c) || c < 0 || c >= level.cols * level.rows) return false;
    seen.add(c);
    if (k > 0 && !areAdjacent(level, path[k - 1]!, c)) return false;
  }
  return true;
}

/**
 * Exhaustive DFS solver with connectivity and dead-end pruning. Independent of the level
 * generator: used by tests to prove every level is solvable. Returns null if no solution
 * exists (or the node limit is hit).
 */
export function solve(level: Level, nodeLimit = 5_000_000): number[] | null {
  const total = level.cols * level.rows;
  const wall = new Uint8Array(total);
  for (const w of level.walls) wall[w] = 1;
  const used = new Uint8Array(total);
  const open = total - level.walls.length;
  const nbrs: number[][] = [];
  for (let i = 0; i < total; i++) nbrs.push(neighbours(level, i).filter((n) => !wall[n]));
  const path: number[] = [level.start];
  used[level.start] = 1;
  let nodes = 0;

  const viable = (h: number): boolean => {
    const remaining = open - path.length;
    if (remaining === 0) return true;
    // Flood fill from head through unused cells: everything must be reachable.
    const seen = new Uint8Array(total);
    const stack: number[] = [];
    let reached = 0;
    for (const n of nbrs[h]!) {
      if (!used[n] && !seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    }
    while (stack.length) {
      const c = stack.pop()!;
      reached++;
      for (const n of nbrs[c]!) {
        if (!used[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (reached !== remaining) return false;
    // Dead ends: an unused cell with at most one free exit must be the final cell.
    let deadEnds = 0;
    for (let c = 0; c < total; c++) {
      if (wall[c] || used[c]) continue;
      let deg = 0;
      for (const n of nbrs[c]!) if (!used[n] || n === h) deg++;
      if (deg <= 1) deadEnds++;
    }
    return deadEnds <= 1;
  };

  const dfs = (h: number): boolean => {
    if (path.length === open) return true;
    if (++nodes > nodeLimit) return false;
    for (const n of nbrs[h]!) {
      if (used[n]) continue;
      used[n] = 1;
      path.push(n);
      if (viable(n) && dfs(n)) return true;
      path.pop();
      used[n] = 0;
    }
    return false;
  };

  if (!viable(level.start)) return null;
  return dfs(level.start) ? path.slice() : null;
}
