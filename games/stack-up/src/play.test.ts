import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";

function tap(el: Element, x: number, y: number) {
  el.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
  el.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: y, bubbles: true }));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("stack-up play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it("the first touch starts the run without dropping a block", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    tap(canvas, 200, 400);
    expect(ctx.sounds).toEqual(["select"]);
    game.destroy();
  });

  it("drops blocks until one misses, then ends the run and persists best and run count", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    tap(canvas, 200, 400); // start
    await wait(220);
    tap(canvas, 200, 400); // first drop: lands (trim or perfect), never a miss
    expect(ctx.sounds.some((s) => s === "drop" || s === "perfect")).toBe(true);
    expect(ctx.sounds).not.toContain("fail");
    // Keep dropping at a steady beat; the slab shrinks, so a miss ends the run soon.
    for (let i = 0; i < 80 && !ctx.sounds.includes("fail"); i++) {
      await wait(130);
      tap(canvas, 200, 400);
    }
    expect(ctx.sounds).toContain("fail");
    await wait(20);
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.runs).toBe(1);
    expect(saved.best).toBeGreaterThanOrEqual(1);
    game.destroy();
  });

  it("ignores a double tap so one gesture cannot drop two blocks", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    tap(canvas, 200, 400);
    await wait(220);
    const before = ctx.sounds.length;
    tap(canvas, 200, 400);
    tap(canvas, 200, 400);
    const landings = ctx.sounds.slice(before).filter((s) => s === "drop" || s === "perfect");
    expect(landings).toHaveLength(1);
    game.destroy();
  });
});
