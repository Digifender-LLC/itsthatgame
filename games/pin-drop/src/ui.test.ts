import { beforeEach, describe, expect, it } from "vitest";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import factory, { SLUG, computeGeometry } from "./index";
import { getLevel } from "./levels";
import { parseLevel, solve } from "./logic";

const flush = () => new Promise((r) => setTimeout(r, 0));

function tap(canvas: HTMLCanvasElement, x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
}

describe("pin drop shell", () => {
  beforeEach(() => installFakeCanvas());

  it("resumes at the saved level", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    await ctx.storage.set("progress", { currentLevel: 9, bestLevel: 8 });
    const game = factory();
    await game.mount(container, ctx);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved).toEqual({ currentLevel: 9, bestLevel: 8 });
    game.destroy();
  });

  it("completing a level by tapping pins reports it and saves progress", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    ctx.prefersReducedMotion = true;
    const game = factory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    const level = getLevel(0);
    const st = parseLevel(level);
    const geo = computeGeometry(
      { x: 0, y: 56, w: ctx.viewport.width, h: ctx.viewport.height - 56 },
      st.w,
      st.h,
    );
    for (const i of solve(level)!) {
      const pin = st.pins[i]!;
      tap(canvas, geo.x0 + (pin.x + 0.5) * geo.cell, geo.y0 + (pin.y + 0.5) * geo.cell);
    }
    expect(ctx.levels).toEqual([1]);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved).toEqual({ currentLevel: 2, bestLevel: 1 });
    game.destroy();
  });
});
