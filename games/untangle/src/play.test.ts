import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";
import { LEVELS } from "./levels";
import { partnerOf } from "./logic";

// Layout for the default 390x780 fake viewport: play area y 60..780, board padding 26/44/26.
const BX = 26;
const BY = 104;
const BW = 338;
const BH = 650;
const BOTTOM = 780;

const fire = (el: Element, type: string, x: number, y: number) =>
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Finger position that puts a bead (held above the fingertip) at board point (nx, ny). */
function finger(nx: number, ny: number) {
  const ty = BY + ny * BH;
  let y = ty + 34;
  for (let i = 0; i < 6; i++) y = ty + 34 * Math.min(1, Math.max(0.1, (BOTTOM - y) / 80));
  return { x: BX + nx * BW, y: y + 0 };
}

describe("untangle play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it("solves level 1 by dragging every displaced bead home, earning 3 stars", async () => {
    const level = LEVELS[0]!;
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    let drags = 0;
    for (let i = 0; i < level.nodeCount; i++) {
      if (partnerOf(level, i) >= 0 && partnerOf(level, i) < i) continue;
      const a = level.start[i]!;
      const s = level.solution[i]!;
      if (Math.hypot(a.x - s.x, a.y - s.y) < 1e-6) continue;
      const from = { x: BX + a.x * BW, y: BY + a.y * BH };
      const to = finger(s.x, s.y);
      fire(canvas, "pointerdown", from.x, from.y);
      for (let k = 1; k <= 10; k++) {
        fire(
          canvas,
          "pointermove",
          from.x + ((to.x - from.x) * k) / 10,
          from.y + ((to.y - from.y) * k) / 10,
        );
        await sleep(20);
      }
      fire(canvas, "pointerup", to.x, to.y);
      await sleep(250);
      drags++;
    }
    expect(drags).toBe(level.par);
    for (let t = 0; t < 60 && ctx.levels.length === 0; t++) await sleep(100);
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("pop");
    expect(ctx.sounds).toContain("win");
    const saved = await ctx.storage.get<{ stars: number[]; bestLevel: number }>("progress");
    expect(saved!.bestLevel).toBe(1);
    expect(saved!.stars[0]).toBe(3);
    game.destroy();
  });
});
