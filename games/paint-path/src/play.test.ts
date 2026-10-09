import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG, notePitch, starsForHelp } from "./index";
import { LEVELS } from "./levels";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("paint-path play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  // Layout for the 390x780 fake viewport: play area y 60..780, 16px padding, cell <= 78.
  const geom = (level: { cols: number; rows: number }) => {
    const cell = Math.min(
      78,
      Math.floor(Math.min((390 - 32) / level.cols, (720 - 32) / level.rows)),
    );
    const gx = Math.round((390 - cell * level.cols) / 2);
    const gy = Math.round(60 + (720 - cell * level.rows) / 2);
    return {
      cell,
      at: (c: number) =>
        [
          gx + ((c % level.cols) + 0.5) * cell,
          gy + (Math.floor(c / level.cols) + 0.5) * cell,
        ] as const,
    };
  };

  const fire = (canvas: Element, type: string, x: number, y: number) =>
    canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));

  it("solves level 1 by dragging, awards 3 stars, and saves progress", async () => {
    const ctx = fakeContext(SLUG);
    ctx.prefersReducedMotion = true;
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    const level = LEVELS[0]!;
    const { at } = geom(level);
    const [sx, sy] = at(level.start);
    fire(canvas, "pointerdown", sx, sy);
    for (const c of level.solution.slice(1)) {
      const [x, y] = at(c);
      fire(canvas, "pointermove", x, y);
    }
    const [ex, ey] = at(level.solution[level.solution.length - 1]!);
    fire(canvas, "pointerup", ex, ey);
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    expect(ctx.sounds.filter((s) => s === "select").length).toBeGreaterThanOrEqual(8);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.bestLevel).toBe(1);
    expect(saved.stars[0]).toBe(3);
    game.destroy();
  });

  it("fills straight-line runs on a fast drag and resolves diagonal motion", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    const level = LEVELS[3]!; // 4x4 open, start index 4
    const { at } = geom(level);
    const [sx, sy] = at(level.start);
    fire(canvas, "pointerdown", sx, sy);
    // jump straight to the end of the first row-run in the solution
    const sol = level.solution;
    let run = 1;
    const d = sol[1]! - sol[0]!;
    while (sol[run + 1]! - sol[run]! === d) run++;
    const [x, y] = at(sol[run]!);
    fire(canvas, "pointermove", x, y);
    fire(canvas, "pointerup", x, y);
    // all cells of the run are painted: undo is enabled, and a solution move follows legally
    fire(canvas, "pointerdown", x, y);
    const next = sol[run + 1]!;
    // diagonal-ish: aim between the next cell and its neighbour, closer to `next`
    const [nx, ny] = at(next);
    fire(canvas, "pointermove", nx + (nx > x ? -5 : 5), ny + (ny > y ? -5 : 5));
    fire(canvas, "pointerup", nx, ny);
    expect(ctx.sounds.filter((s) => s === "select").length).toBeGreaterThanOrEqual(run + 1);
    game.destroy();
  });

  it("bumps on a blocked move instead of staying silent", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    const level = LEVELS[5]!;
    const { at, cell } = geom(level);
    const [sx, sy] = at(level.start);
    // find a direction whose neighbour is a wall or off the grid
    const col = level.start % level.cols;
    const row = Math.floor(level.start / level.cols);
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const blocked = dirs.find(([dx, dy]) => {
      const c = col + dx;
      const r = row + dy;
      return (
        c < 0 ||
        r < 0 ||
        c >= level.cols ||
        r >= level.rows ||
        level.walls.includes(r * level.cols + c)
      );
    });
    expect(blocked).toBeDefined();
    fire(canvas, "pointerdown", sx, sy);
    fire(canvas, "pointermove", sx + blocked![0] * cell * 1.1, sy + blocked![1] * cell * 1.1);
    fire(canvas, "pointerup", sx, sy);
    expect(ctx.sounds).toContain("bump");
    game.destroy();
  });
});

describe("paint-path helpers", () => {
  it("stars drop with undo/hint use", () => {
    expect(starsForHelp(0, 0)).toBe(3);
    expect(starsForHelp(1, 0)).toBe(2);
    expect(starsForHelp(1, 1)).toBe(2);
    expect(starsForHelp(2, 1)).toBe(1);
    expect(starsForHelp(0, 2)).toBe(1);
  });

  it("note pitch climbs as the path grows and stays in range", () => {
    expect(notePitch(40, 50)).toBeGreaterThan(notePitch(2, 50));
    for (let k = 0; k < 60; k++) {
      const p = notePitch(k, 60);
      expect(p).toBeGreaterThanOrEqual(0.5);
      expect(p).toBeLessThanOrEqual(3);
    }
  });
});
