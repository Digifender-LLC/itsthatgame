import { describeConformance } from "@itg/game-sdk/conformance";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";

describeConformance(SLUG, factory);

describe("paint-path input and persistence", () => {
  it("survives pointer input and a resize while resuming saved progress", async () => {
    installFakeCanvas();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext(SLUG);
    await ctx.storage.set("progress", { currentLevel: 4, bestLevel: 4 });
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
    for (let x = 20; x < 380; x += 17) {
      fire("pointerdown", x, 200);
      for (let y = 200; y < 600; y += 23) fire("pointermove", x, y);
      fire("pointerup", x, 600);
    }
    ctx.fireResize(320, 568);
    fire("pointerdown", 160, 300);
    game.destroy();
    expect(container.childNodes.length).toBe(0);
    container.remove();
  });
});
