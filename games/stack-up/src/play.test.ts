import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";

function tap(el: Element, x: number, y: number) {
  el.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
}

describe("stack-up play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it("ends a run on a miss, reports the run number and persists the best", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    // First block starts at x=0 over a base at 30..70: overlaps and is trimmed.
    tap(canvas, 200, 400);
    expect(ctx.sounds).toContain("pop");
    // The next block enters from the right (x=70) over a tower at 30..40: a clean miss.
    tap(canvas, 200, 400);
    expect(ctx.sounds).toContain("win"); // first run beats the stored best of 0
    expect(ctx.levels).toEqual([1]);
    await new Promise((r) => setTimeout(r, 0));
    expect(await ctx.storage.get<number>("best")).toBe(1);
    expect(await ctx.storage.get<number>("runs")).toBe(1);
    game.destroy();
  });
});
