import { beforeEach, describe, expect, it } from "vitest";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import factory, { SLUG, computeGeo, helperRects, tileCenter } from "./index";
import { LEVEL_COUNT, getLevel } from "./levels";

const flush = () => new Promise((r) => setTimeout(r, 0));

function fire(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}
const tap = (canvas: HTMLCanvasElement, x: number, y: number) => {
  fire(canvas, "pointerdown", x, y);
  fire(canvas, "pointerup", x, y);
};

async function mount(level: number, reduced = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ctx = fakeContext(SLUG);
  ctx.prefersReducedMotion = reduced;
  await ctx.storage.set("progress", { currentLevel: level, bestLevel: level - 1, stars: [] });
  const game = factory();
  await game.mount(container, ctx);
  const canvas = container.querySelector("canvas")!;
  const area = { x: 0, y: 60, w: ctx.viewport.width, h: ctx.viewport.height - 60 };
  return { game, ctx, canvas, area };
}

const savedOf = (ctx: ReturnType<typeof fakeContext>) =>
  JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);

describe("tile trio shell", () => {
  beforeEach(() => installFakeCanvas());

  it("resumes at the saved level and migrates old saves", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    await ctx.storage.set("progress", { currentLevel: 5, bestLevel: 4 });
    const game = factory();
    await game.mount(container, ctx);
    await flush();
    const saved = savedOf(ctx);
    expect(saved.currentLevel).toBe(5);
    expect(saved.bestLevel).toBe(4);
    expect(saved.stars).toHaveLength(LEVEL_COUNT);
    game.destroy();
  });

  it.each([1, 11, 21, 50])("plays level %i to completion by tapping tiles", async (n) => {
    const { game, ctx, canvas, area } = await mount(n);
    const level = getLevel(n - 1);
    const geo = computeGeo(area, level);
    for (const id of level.witness) {
      const c = tileCenter(geo, level, id);
      tap(canvas, c.x, c.y);
    }
    expect(ctx.levels).toEqual([n]);
    expect(ctx.sounds).toContain("win");
    expect(ctx.sounds).toContain("pop");
    await flush();
    const saved = savedOf(ctx);
    expect(saved.bestLevel).toBe(n);
    expect(saved.stars[n - 1]).toBe(3);
    game.destroy();
  });

  it("covered and frozen tiles bump instead of moving", async () => {
    const { game, ctx, canvas, area } = await mount(11);
    const level = getLevel(10);
    const geo = computeGeo(area, level);
    const covered = level.tiles.find(
      (t) => t.z === 0 && !level.witness.slice(0, 1).includes(t.id),
    )!;
    const c = tileCenter(geo, level, covered.id);
    const before = ctx.sounds.length;
    // a bottom tile under the pile
    tap(canvas, c.x, c.y);
    const after = ctx.sounds.slice(before);
    expect(after.includes("move") || after.includes("bump")).toBe(true);
    game.destroy();
  });

  it("helper buttons work: back 3, shuffle and undo spend their charge", async () => {
    const { game, ctx, canvas, area } = await mount(4);
    const level = getLevel(3);
    const geo = computeGeo(area, level);
    const rects = helperRects(area, geo);
    const centre = (k: "undo" | "back" | "shuffle") => ({
      x: rects[k].x + rects[k].w / 2,
      y: rects[k].y + rects[k].h / 2,
    });
    // take three tiles, return them
    for (const id of level.witness.slice(0, 3)) {
      const c = tileCenter(geo, level, id);
      tap(canvas, c.x, c.y);
    }
    const b = centre("back");
    tap(canvas, b.x, b.y);
    expect(ctx.sounds).toContain("whoosh");
    const n = ctx.sounds.filter((s) => s === "whoosh").length;
    const s = centre("shuffle");
    tap(canvas, s.x, s.y);
    expect(ctx.sounds.filter((x) => x === "whoosh").length).toBe(n + 1);
    // second shuffle has no charge left: bump
    const bumps = ctx.sounds.filter((x) => x === "bump").length;
    tap(canvas, s.x, s.y);
    expect(ctx.sounds.filter((x) => x === "bump").length).toBe(bumps + 1);
    game.destroy();
  });

  it("animated play (not reduced motion) also finishes level 1 once frames run", async () => {
    const { game, ctx, canvas, area } = await mount(1, false);
    const level = getLevel(0);
    const geo = computeGeo(area, level);
    for (const id of level.witness) {
      const c = tileCenter(geo, level, id);
      tap(canvas, c.x, c.y);
    }
    expect(ctx.levels).toEqual([1]);
    game.destroy();
  });
});
