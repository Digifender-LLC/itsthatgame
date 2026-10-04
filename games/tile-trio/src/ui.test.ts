import { beforeEach, describe, expect, it } from "vitest";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import factory, { SLUG, computeGeo } from "./index";
import { getLevel } from "./levels";

const flush = () => new Promise((r) => setTimeout(r, 0));

function tap(canvas: HTMLCanvasElement, x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
}

describe("tile trio shell", () => {
  beforeEach(() => installFakeCanvas());

  it("resumes at the saved level", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    await ctx.storage.set("progress", { currentLevel: 5, bestLevel: 4 });
    const game = factory();
    await game.mount(container, ctx);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved).toEqual({ currentLevel: 5, bestLevel: 4 });
    game.destroy();
  });

  it("completing a level by tapping tiles reports it and saves progress", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    ctx.prefersReducedMotion = true;
    const game = factory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    const level = getLevel(0);
    const geo = computeGeo(
      { x: 0, y: 56, w: ctx.viewport.width, h: ctx.viewport.height - 56 },
      level,
    );
    for (const id of level.witness) {
      const t = level.tiles[id]!;
      tap(canvas, geo.bx + (t.x + 1) * geo.u, geo.by + (t.y + 1) * geo.u);
    }
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved).toEqual({ currentLevel: 2, bestLevel: 1 });
    game.destroy();
  });
});
