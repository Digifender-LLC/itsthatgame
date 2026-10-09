import { fakeContext, installFakeCanvas, type FakeContext } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";
import { boardLayout } from "./layout";
import { LEVELS } from "./levels";
import { newPuzzle, posOf, slideRange, slideTo, solve, type Puzzle } from "./logic";

// Fake viewport 390x780, no safe area: the shell's play area sits below the 60 px HUD.
const AREA = { x: 0, y: 60, w: 390, h: 720 };

function fire(el: Element, type: string, x: number, y: number) {
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("park-out play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  async function boot(level: number, opts: { reduced?: boolean } = {}) {
    const ctx: FakeContext = fakeContext(SLUG);
    ctx.prefersReducedMotion = opts.reduced ?? true;
    if (level > 1) {
      await ctx.storage.set("progress", { currentLevel: level, bestLevel: level - 1, stars: [] });
    }
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    const puzzle = newPuzzle(LEVELS[level - 1]!.rows);
    const lay = boardLayout(AREA, puzzle.lot.size);
    return { ctx, game, canvas, puzzle, lay };
  }

  /** Drag vehicle `v` of `puzzle` to axis position `to` (may exceed its range). */
  function drag(
    canvas: Element,
    lay: ReturnType<typeof boardLayout>,
    puzzle: Puzzle,
    v: number,
    to: number,
  ) {
    const veh = puzzle.vehicles[v]!;
    const from = posOf(veh);
    const cx = lay.x + (veh.x + (veh.horizontal ? veh.len / 2 : 0.5)) * lay.cell;
    const cy = lay.y + (veh.y + (veh.horizontal ? 0.5 : veh.len / 2)) * lay.cell;
    const dx = veh.horizontal ? (to - from) * lay.cell : 0;
    const dy = veh.horizontal ? 0 : (to - from) * lay.cell;
    fire(canvas, "pointerdown", cx, cy);
    fire(canvas, "pointermove", cx + dx / 2, cy + dy / 2);
    fire(canvas, "pointermove", cx + dx, cy + dy);
    fire(canvas, "pointerup", cx + dx, cy + dy);
  }

  const cellPt = (lay: ReturnType<typeof boardLayout>, cx: number, cy: number) => ({
    x: lay.x + (cx + 0.5) * lay.cell,
    y: lay.y + (cy + 0.5) * lay.cell,
  });

  async function playOptimal(level: number, reduced = true) {
    const { ctx, game, canvas, puzzle, lay } = await boot(level, { reduced });
    const path = solve(puzzle.lot, puzzle.vehicles)!.path;
    expect(path).toHaveLength(LEVELS[level - 1]!.optimal);
    for (const [v, to] of path) {
      drag(canvas, lay, puzzle, v, to);
      expect(slideTo(puzzle, v, to)).toBe(true);
    }
    return { ctx, game };
  }

  it("solves level 1 by dragging the optimal path and saves 3 stars", async () => {
    const { ctx, game } = await playOptimal(1);
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.bestLevel).toBe(1);
    expect(saved.currentLevel).toBe(2);
    expect(saved.stars[0]).toBe(3);
    game.destroy();
  });

  it("plays the drive-out animation before the win with motion enabled", async () => {
    const { ctx, game } = await playOptimal(1, false);
    expect(ctx.levels).toEqual([]);
    for (let i = 0; i < 60 && ctx.levels.length === 0; i++) await wait(50);
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("whoosh");
    game.destroy();
  });

  it("solves a two-hero level (both gates)", async () => {
    const first = LEVELS.findIndex((l) => l.rows.some((r) => r.includes("U")));
    const { ctx, game } = await playOptimal(first + 1);
    expect(ctx.levels).toEqual([first + 1]);
    game.destroy();
  });

  it("solves a 7x7 level with bollards", async () => {
    const i = LEVELS.findIndex((l) => l.rows.length === 7 && l.rows.some((r) => r.includes("#")));
    const { ctx, game } = await playOptimal(i + 1);
    expect(ctx.levels).toEqual([i + 1]);
    game.destroy();
  });

  it("bumps (sound, no move) when a drag pushes into a blocker", async () => {
    const { ctx, game, canvas, puzzle, lay } = await boot(1);
    let v = -1;
    for (let i = 0; i < puzzle.vehicles.length; i++) {
      const r = slideRange(puzzle.lot, puzzle.vehicles, i);
      if (r.max - r.min >= 1 && r.max - r.min <= 3) v = i;
    }
    expect(v).toBeGreaterThanOrEqual(0);
    const r = slideRange(puzzle.lot, puzzle.vehicles, v);
    drag(canvas, lay, puzzle, v, r.max + 3);
    expect(ctx.sounds).toContain("bump");
    game.destroy();
  });

  it("tap-to-move: select a vehicle, then tap a free cell in line", async () => {
    const { ctx, game, canvas, puzzle, lay } = await boot(1);
    const [v, to] = solve(puzzle.lot, puzzle.vehicles)!.path[0]!;
    const veh = puzzle.vehicles[v]!;
    const a = cellPt(lay, veh.x, veh.y);
    fire(canvas, "pointerdown", a.x, a.y);
    fire(canvas, "pointerup", a.x, a.y);
    const tx = veh.horizontal ? (to > posOf(veh) ? to + veh.len - 1 : to) : veh.x;
    const ty = veh.horizontal ? veh.y : to > posOf(veh) ? to + veh.len - 1 : to;
    const b = cellPt(lay, tx, ty);
    fire(canvas, "pointerdown", b.x, b.y);
    fire(canvas, "pointerup", b.x, b.y);
    expect(ctx.sounds).toContain("drop");
    // the moves counter advanced: finishing the path from here still wins
    slideTo(puzzle, v, to);
    const rest = solve(puzzle.lot, puzzle.vehicles)!.path;
    for (const [pv, pt] of rest) {
      drag(canvas, lay, puzzle, pv, pt);
      slideTo(puzzle, pv, pt);
    }
    expect(ctx.levels).toEqual([1]);
    game.destroy();
  });

  it("hint button works and undo is available after a move", async () => {
    const { ctx, game, canvas, puzzle, lay } = await boot(4);
    const hintX = 390 - 8 - 46 - 2 * 52 + 23;
    fire(canvas, "pointerdown", hintX, 30);
    fire(canvas, "pointerup", hintX, 30);
    expect(ctx.sounds).toContain("select");
    const [v, to] = solve(puzzle.lot, puzzle.vehicles)!.path[0]!;
    drag(canvas, lay, puzzle, v, to);
    const undoX = 390 - 8 - 46 - 52 + 23;
    fire(canvas, "pointerdown", undoX, 30);
    fire(canvas, "pointerup", undoX, 30);
    expect(ctx.sounds).toContain("move");
    expect(ctx.levels).toEqual([]);
    game.destroy();
  });
});
