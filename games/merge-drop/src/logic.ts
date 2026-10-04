// Merge Drop: pure, DOM-free model. No Math.random anywhere: tile spawns come from a seeded
// 32-bit generator whose state is part of the game state, so a run is reproducible from its
// seed and the list of columns the player chose, and a saved game resumes identically.
//
// RULES
//  - The board has COLS columns, each holding up to ROWS tiles stacked from the bottom.
//  - Dropping a tile puts it on top of the chosen column. A column may briefly hold ROWS+1
//    tiles (overflow row) while merges resolve.
//  - Resolve loop (one "round" per iteration, chain step = 1, 2, 3, ...):
//      1. Scan rows bottom-to-top, columns left-to-right, for the first tile that has an
//         equal-valued neighbour (up, down, left or right).
//      2. Its connected group of equal tiles (4-neighbourhood) merges into ONE tile at the
//         scan-first cell (the lowest, then leftmost, cell of the group). With n tiles of
//         value v the new value is v * 2^(n-1) (2 tiles -> 2v, 3 tiles -> 4v, 4 -> 8v).
//      3. The other group cells are emptied and tiles above them fall (gravity).
//      4. Score += new value * chain step. Repeat until no equal tiles touch.
//  - After resolving, if any column still holds more than ROWS tiles the run is over.

export const COLS = 5;
export const ROWS = 7;

export interface MergeState {
  /** cols[c][r]: tile value, r = 0 is the bottom. */
  cols: number[][];
  current: number;
  next: number;
  /** State of the seeded generator (uint32). */
  rng: number;
  score: number;
  drops: number;
  over: boolean;
}

export interface MergeEvent {
  /** Cells (before the merge) that were combined, including `to`. */
  from: { col: number; row: number }[];
  to: { col: number; row: number };
  value: number;
  chain: number;
}

export interface DropResult {
  ok: boolean;
  merges: MergeEvent[];
  gained: number;
  /** Number of merge rounds this drop triggered (0 = no merge). */
  chain: number;
}

// ---- seeded RNG (mulberry32 step; state is the running counter) ------------------

/** Advance the generator: returns [float in [0,1), nextState]. */
export function rngNext(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Turn a run counter (stored in ctx.storage) into a well-mixed seed. */
export function seedFromRun(run: number): number {
  let h = (Math.imul(run >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function maxTile(cols: number[][]): number {
  let m = 2;
  for (const c of cols) for (const v of c) if (v > m) m = v;
  return m;
}

/** Spawnable values for the current board: 2 and 4 early, larger ones as the board grows. */
export function spawnPool(max: number): number[] {
  const top = Math.min(64, Math.max(4, max / 8));
  const pool: number[] = [];
  for (let v = 2; v <= top; v *= 2) pool.push(v);
  return pool;
}

function draw(rng: number, max: number): [number, number] {
  const pool = spawnPool(max);
  // Weight halves for each larger value: [4,2,1] for a pool of three.
  const weights = pool.map((_, i) => 2 ** (pool.length - 1 - i));
  const total = weights.reduce((a, b) => a + b, 0);
  const [f, next] = rngNext(rng);
  let roll = Math.floor(f * total);
  for (let i = 0; i < pool.length; i++) {
    if (roll < weights[i]!) return [pool[i]!, next];
    roll -= weights[i]!;
  }
  return [pool[0]!, next];
}

export function newGame(seed: number): MergeState {
  const [current, r1] = draw(seed >>> 0, 2);
  const [next, rng] = draw(r1, 2);
  return {
    cols: Array.from({ length: COLS }, () => []),
    current,
    next,
    rng,
    score: 0,
    drops: 0,
    over: false,
  };
}

const cell = (cols: number[][], c: number, r: number): number => cols[c]?.[r] ?? 0;

/** Connected group of equal tiles containing (c, r), in discovery order. */
function groupAt(cols: number[][], c: number, r: number): { col: number; row: number }[] {
  const v = cell(cols, c, r);
  const seen = new Set<number>([c * 100 + r]);
  const stack = [{ col: c, row: r }];
  const out: { col: number; row: number }[] = [];
  while (stack.length) {
    const p = stack.pop()!;
    out.push(p);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = p.col + dc;
      const nr = p.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0) continue;
      const k = nc * 100 + nr;
      if (seen.has(k) || cell(cols, nc, nr) !== v) continue;
      seen.add(k);
      stack.push({ col: nc, row: nr });
    }
  }
  return out;
}

/** First mergeable group in scan order (rows bottom-up, columns left-right), or null. */
export function findMerge(cols: number[][]): { col: number; row: number }[] | null {
  const height = Math.max(0, ...cols.map((c) => c.length));
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < COLS; c++) {
      if (cell(cols, c, r) === 0) continue;
      const g = groupAt(cols, c, r);
      if (g.length >= 2) return g;
    }
  }
  return null;
}

export function canDrop(s: MergeState, col: number): boolean {
  return !s.over && Number.isInteger(col) && col >= 0 && col < COLS;
}

/** Drop the current tile into a column and resolve all merges. */
export function drop(s: MergeState, col: number): DropResult {
  if (!canDrop(s, col)) return { ok: false, merges: [], gained: 0, chain: 0 };
  s.cols[col]!.push(s.current);
  s.drops += 1;

  const merges: MergeEvent[] = [];
  let gained = 0;
  let chain = 0;
  for (;;) {
    const group = findMerge(s.cols);
    if (!group) break;
    chain += 1;
    const v = cell(s.cols, group[0]!.col, group[0]!.row);
    // Scan-first cell = lowest row, then leftmost column.
    const sorted = [...group].sort((a, b) => a.row - b.row || a.col - b.col);
    const to = sorted[0]!;
    const value = v * 2 ** (group.length - 1);
    for (const p of sorted) s.cols[p.col]![p.row] = 0;
    s.cols[to.col]![to.row] = value;
    // Gravity: drop zeros out of every column, keeping order.
    s.cols = s.cols.map((c) => c.filter((x) => x !== 0));
    const points = value * chain;
    gained += points;
    merges.push({ from: sorted, to, value, chain });
  }
  s.score += gained;

  if (s.cols.some((c) => c.length > ROWS)) s.over = true;

  // Advance the preview queue.
  s.current = s.next;
  const [n, rng] = draw(s.rng, maxTile(s.cols));
  s.next = n;
  s.rng = rng;
  return { ok: true, merges, gained, chain };
}

/** Defensive validation for a snapshot restored from storage. */
export function isMergeState(v: unknown): v is MergeState {
  if (!v || typeof v !== "object") return false;
  const s = v as MergeState;
  const tile = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 2;
  return (
    Array.isArray(s.cols) &&
    s.cols.length === COLS &&
    s.cols.every((c) => Array.isArray(c) && c.length <= ROWS + 1 && c.every(tile)) &&
    tile(s.current) &&
    tile(s.next) &&
    typeof s.rng === "number" &&
    typeof s.score === "number" &&
    typeof s.drops === "number" &&
    typeof s.over === "boolean"
  );
}
