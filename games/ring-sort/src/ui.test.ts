import { beforeEach, describe, expect, it } from "vitest";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import factory, { SLUG } from "./index";
import { getLevel } from "./levels";
import { newState, solve } from "./logic";

const flush = () => new Promise((r) => setTimeout(r, 0));

function tap(canvas: HTMLCanvasElement, x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
}

describe("ring sort shell", () => {
  beforeEach(() => installFakeCanvas());

  it("resumes at the saved level", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    await ctx.storage.set("progress", { currentLevel: 7, bestLevel: 6 });
    const game = factory();
    await game.mount(container, ctx);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved).toEqual({ currentLevel: 7, bestLevel: 6 });
    game.destroy();
  });

  it("ignores corrupt saved progress", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    await ctx.storage.set("progress", { currentLevel: 999, bestLevel: "x" });
    const game = factory();
    await game.mount(container, ctx);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.currentLevel).toBeGreaterThanOrEqual(1);
    expect(saved.bestLevel).toBe(0);
    game.destroy();
  });

  it("completing a level by tapping reports it and saves progress", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    ctx.prefersReducedMotion = true;
    const game = factory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    const level = getLevel(0);
    const solution = solve(newState(level))!;
    const cellW = ctx.viewport.width / level.pegs.length;
    for (const m of solution) {
      tap(canvas, cellW * (m.from + 0.5), 400);
      tap(canvas, cellW * (m.to + 0.5), 400);
    }
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved).toEqual({ currentLevel: 2, bestLevel: 1 });
    game.destroy();
  });
});
