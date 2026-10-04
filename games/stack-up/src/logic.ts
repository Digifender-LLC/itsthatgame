// Stack Up: pure, DOM-free simulation. All positions are in field units (the field is
// FIELD units wide). The model is deterministic: the same sequence of step(dt) and drop()
// calls always yields the same state. There is no randomness at all.

export const FIELD = 100;
export const START_WIDTH = 40;
/** A drop this close (in units) to the block below counts as perfect and snaps into place. */
export const PERFECT_TOLERANCE = 1.2;
/** Blocks thinner than this are treated as a miss. */
export const MIN_WIDTH = 0.5;
/** Consecutive perfect drops needed before the block grows back. */
export const STREAK_FOR_GROWTH = 3;
export const GROWTH = 2;
export const BASE_SPEED = 38;
export const SPEED_PER_BLOCK = 1.3;
export const MAX_SPEED = 100;

export interface Block {
  x: number;
  w: number;
}

export interface Mover extends Block {
  dir: 1 | -1;
}

export interface StackState {
  /** Placed blocks, bottom first. tower[0] is the base block and is not scored. */
  tower: Block[];
  mover: Mover;
  /** Blocks placed on top of the base = height = score. */
  score: number;
  /** Consecutive perfect drops. */
  streak: number;
  over: boolean;
  /** 1 normally; lower in reduced-motion mode. */
  speedMul: number;
}

export type DropKind = "miss" | "perfect" | "trim";

export interface DropResult {
  kind: DropKind;
  /** The sliced-off (or fully missed) part, for debris animation. */
  debris: Block | null;
  /** Index in the tower of the newly placed block (-1 on miss). */
  index: number;
}

/** Slide speed in units per second for a given score. Rises gradually, capped. */
export function speedAt(score: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_BLOCK * score);
}

function spawnMover(top: Block, score: number): Mover {
  // Alternate the side the block enters from so the rhythm never goes stale.
  const fromLeft = score % 2 === 0;
  const w = top.w;
  return fromLeft ? { x: 0, w, dir: 1 } : { x: FIELD - w, w, dir: -1 };
}

export function newGame(speedMul = 1): StackState {
  const base: Block = { x: (FIELD - START_WIDTH) / 2, w: START_WIDTH };
  return {
    tower: [base],
    mover: spawnMover(base, 0),
    score: 0,
    streak: 0,
    over: false,
    speedMul,
  };
}

/** Advance the sliding block by dtSec seconds; it bounces off both walls. */
export function step(s: StackState, dtSec: number): void {
  if (s.over || dtSec <= 0) return;
  const m = s.mover;
  let dist = speedAt(s.score) * s.speedMul * dtSec;
  const max = FIELD - m.w;
  // Walk in segments so a long frame can never tunnel through a wall.
  while (dist > 0) {
    const room = m.dir === 1 ? max - m.x : m.x;
    if (dist <= room) {
      m.x += m.dir * dist;
      dist = 0;
    } else {
      m.x += m.dir * room;
      dist -= room;
      m.dir = m.dir === 1 ? -1 : 1;
    }
  }
}

/** Drop the sliding block onto the tower. */
export function drop(s: StackState): DropResult {
  if (s.over) return { kind: "miss", debris: null, index: -1 };
  const top = s.tower[s.tower.length - 1]!;
  const m = s.mover;
  const left = Math.max(m.x, top.x);
  const right = Math.min(m.x + m.w, top.x + top.w);
  const overlap = right - left;

  if (overlap < MIN_WIDTH) {
    s.over = true;
    s.streak = 0;
    return { kind: "miss", debris: { x: m.x, w: m.w }, index: -1 };
  }

  let placed: Block;
  let kind: DropKind;
  let debris: Block | null = null;
  if (Math.abs(m.x - top.x) <= PERFECT_TOLERANCE && Math.abs(m.w - top.w) < 1e-9) {
    kind = "perfect";
    s.streak += 1;
    const grow = s.streak >= STREAK_FOR_GROWTH ? GROWTH : 0;
    const w = Math.min(START_WIDTH, top.w + grow);
    // Grow symmetrically around the snapped centre, staying inside the field.
    const x = Math.min(FIELD - w, Math.max(0, top.x - (w - top.w) / 2));
    placed = { x, w };
  } else {
    kind = "trim";
    s.streak = 0;
    placed = { x: left, w: overlap };
    debris =
      m.x < top.x
        ? { x: m.x, w: top.x - m.x }
        : { x: top.x + top.w, w: m.x + m.w - (top.x + top.w) };
  }

  s.tower.push(placed);
  s.score += 1;
  s.mover = spawnMover(placed, s.score);
  return { kind, debris, index: s.tower.length - 1 };
}

/** Defensive check for state restored from storage or tests. */
export function isStackState(v: unknown): v is StackState {
  if (!v || typeof v !== "object") return false;
  const s = v as StackState;
  return (
    Array.isArray(s.tower) &&
    s.tower.length >= 1 &&
    typeof s.score === "number" &&
    typeof s.over === "boolean" &&
    !!s.mover &&
    typeof s.mover.x === "number"
  );
}
