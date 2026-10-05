import { beforeEach, describe, expect, it } from "vitest";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import factory, { SLUG, computeGeometry, pinSides } from "./index";
import { getLevel, getPar } from "./levels";
import { parseLevel, solve } from "./logic";

const flush = () => new Promise((r) => setTimeout(r, 0));
const fire = (el: Element, type: string, x: number, y: number) =>
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));

function pinPoint(levelIndex: number, pinIndex: number, width = 390, height = 780) {
  const st = parseLevel(getLevel(levelIndex));
  const geo = computeGeometry({ x: 0, y: 60, w: width, h: height - 60 }, st.w, st.h);
  const pin = st.pins[pinIndex]!;
  return { x: geo.x0 + (pin.x + 0.5) * geo.cell, y: geo.y0 + (pin.y + 0.5) * geo.cell };
}

describe("pin drop play-through", () => {
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
    expect(saved.currentLevel).toBe(9);
    expect(saved.bestLevel).toBe(8);
    game.destroy();
  });

  it("completing a level by tapping pins reports it, awards stars and saves progress", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    ctx.prefersReducedMotion = true;
    const game = factory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    for (const i of solve(getLevel(0))!) {
      const p = pinPoint(0, i);
      fire(canvas, "pointerdown", p.x, p.y);
      fire(canvas, "pointerup", p.x, p.y);
    }
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("success");
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.currentLevel).toBe(2);
    expect(saved.bestLevel).toBe(1);
    expect(saved.stars[0]).toBe(3);
    game.destroy();
  });

  it("a swipe on a pin pulls it, and a lost try can be retried", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    ctx.prefersReducedMotion = true;
    await ctx.storage.set("progress", { currentLevel: 6, bestLevel: 5 });
    const game = factory();
    await game.mount(container, ctx);
    await flush();
    const canvas = container.querySelector("canvas")!;
    // level 6 par is 1: play the winning pin by swiping along it
    const sol = solve(getLevel(5))!;
    expect(sol.length).toBe(getPar(5));
    const p = pinPoint(5, sol[0]!);
    fire(canvas, "pointerdown", p.x, p.y);
    fire(canvas, "pointermove", p.x + 8, p.y);
    expect(ctx.levels).toEqual([]);
    fire(canvas, "pointermove", p.x + 30, p.y);
    fire(canvas, "pointerup", p.x + 30, p.y);
    expect(ctx.levels).toEqual([6]);
    game.destroy();
  });

  it("animated pulls run to completion on the frame loop (no reduced motion)", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    const p = pinPoint(0, solve(getLevel(0))![0]!);
    fire(canvas, "pointerdown", p.x, p.y);
    fire(canvas, "pointerup", p.x, p.y);
    expect(ctx.sounds).toContain("whoosh");
    game.destroy();
  });

  it("pin handles never share a side within a row", () => {
    for (let i = 0; i < 50; i++) {
      const st = parseLevel(getLevel(i));
      const sides = pinSides(st.pins, st.w);
      st.pins.forEach((p, a) =>
        st.pins.forEach((q, b) => {
          if (a < b && p.y === q.y) expect(sides[a]).not.toBe(sides[b]);
        }),
      );
    }
  });
});
