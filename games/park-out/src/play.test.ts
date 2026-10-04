import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";
import { LEVELS } from "./levels";
import { parseLevel, solve } from "./logic";

// Layout for the default 390x780 fake viewport (see layout() in index.ts).
const BOARD_X = 20;
const BOARD_Y = 78;
const CELL = 350 / 6;

function fire(el: Element, type: string, x: number, y: number) {
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

describe("park-out play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  const dragMove = (v: number, to: number) => {
    const canvas = container.querySelector("canvas")!;
    const veh = parseLevel(LEVELS[0]!.rows)[v]!;
    const from = veh.horizontal ? veh.x : veh.y;
    const cx = BOARD_X + (veh.x + 0.5) * CELL;
    const cy = BOARD_Y + (veh.y + 0.5) * CELL;
    const dx = veh.horizontal ? (to - from) * CELL : 0;
    const dy = veh.horizontal ? 0 : (to - from) * CELL;
    fire(canvas, "pointerdown", cx, cy);
    fire(canvas, "pointermove", cx + dx / 2, cy + dy / 2);
    fire(canvas, "pointermove", cx + dx, cy + dy);
    fire(canvas, "pointerup", cx + dx, cy + dy);
  };

  it("solves level 1 by dragging along the optimal path, reports it, and resumes mid-level", async () => {
    const path = solve(parseLevel(LEVELS[0]!.rows))!.path;
    expect(path).toHaveLength(LEVELS[0]!.optimal);
    const ctx = fakeContext(SLUG);

    const a = factory();
    await a.mount(container, ctx);
    a.start();
    dragMove(path[0]![0], path[0]![1]);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.levels).toEqual([]);
    a.destroy();

    // Relaunch with the same storage: the first move must still be in place.
    const b = factory();
    await b.mount(container, ctx);
    b.start();
    dragMove(path[1]![0], path[1]![1]);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    const progress = await ctx.storage.get<{ unlocked: number; bests: Record<string, number> }>(
      "progress",
    );
    expect(progress!.unlocked).toBe(1);
    expect(progress!.bests["1"]).toBe(2);
    b.destroy();
  });
});
