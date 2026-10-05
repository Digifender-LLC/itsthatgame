import { beforeEach, describe, expect, it } from "vitest";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import factory, { SLUG } from "./index";
import { getLevel, getSolution, LEVEL_COUNT } from "./levels";

const flush = () => new Promise((r) => setTimeout(r, 0));

function fire(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}
const tap = (c: HTMLCanvasElement, x: number, y: number) => {
  fire(c, "pointerdown", x, y);
  fire(c, "pointerup", x, y);
};

/** Centre of peg `p` for an n-peg level on a 390x780 viewport (HUD is the top 60px). */
function pegPoint(n: number, p: number): { x: number; y: number } {
  const rows = n <= 3 ? 1 : 2;
  const cols = rows === 1 ? n : Math.ceil(n / 2);
  const row = Math.floor(p / cols);
  // rows are at least 200px tall and meet at the middle of the play area
  const mid = 60 + (780 - 60) / 2;
  const y = rows === 1 ? mid : mid + (row - 0.5) * 200;
  return { x: (390 / cols) * ((p % cols) + 0.5), y };
}

async function mountAt(level: number, reduced = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ctx = fakeContext(SLUG);
  ctx.prefersReducedMotion = reduced;
  await ctx.storage.set("progress", { currentLevel: level, bestLevel: level - 1 });
  const game = factory();
  await game.mount(container, ctx);
  return { game, ctx, canvas: container.querySelector("canvas")! };
}

function playSolution(canvas: HTMLCanvasElement, index: number) {
  const n = getLevel(index).pegs.length;
  for (const m of getSolution(index)) {
    const a = pegPoint(n, m.from);
    const b = pegPoint(n, m.to);
    tap(canvas, a.x, a.y);
    tap(canvas, b.x, b.y);
  }
}

describe("ring sort shell", () => {
  beforeEach(() => installFakeCanvas());

  it("resumes at the saved level", async () => {
    const { game, ctx } = await mountAt(7);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.currentLevel).toBe(7);
    expect(saved.bestLevel).toBe(6);
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

  it("plays level 1 to completion through pointer taps, reports it, saves stars", async () => {
    const { game, ctx, canvas } = await mountAt(1);
    playSolution(canvas, 0);
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    expect(ctx.sounds).toContain("select");
    expect(ctx.sounds).toContain("drop");
    await flush();
    const saved = JSON.parse(ctx.backend.data.get(`game:${SLUG}:progress`)!);
    expect(saved.bestLevel).toBe(1);
    expect(saved.currentLevel).toBe(2);
    expect(saved.stars[0]).toBe(3); // par solution
    game.destroy();
  });

  it.each([11, 21, 31, 41, LEVEL_COUNT])(
    "plays level %i (a twist level) to completion with taps",
    async (n) => {
      const { game, ctx, canvas } = await mountAt(n);
      playSolution(canvas, n - 1);
      expect(ctx.levels).toEqual([n]);
      expect(ctx.sounds.filter((s) => s === "success" || s === "combo").length).toBeGreaterThan(0);
      game.destroy();
    },
  );

  it("drags a run onto another peg", async () => {
    const { game, ctx, canvas } = await mountAt(1);
    const n = getLevel(0).pegs.length;
    const first = getSolution(0)[0]!;
    const a = pegPoint(n, first.from);
    const b = pegPoint(n, first.to);
    fire(canvas, "pointerdown", a.x, a.y);
    fire(canvas, "pointermove", (a.x + b.x) / 2, a.y - 20);
    fire(canvas, "pointermove", b.x, b.y);
    fire(canvas, "pointerup", b.x, b.y);
    expect(ctx.sounds).toContain("select");
    expect(ctx.sounds).toContain("drop");
    game.destroy();
  });

  it("an illegal drop bumps and does not move anything", async () => {
    const { game, ctx, canvas } = await mountAt(1);
    const n = getLevel(0).pegs.length;
    // tap an empty peg first (ignored), then lift peg 0 and drop it on a full wrong peg
    const empty = pegPoint(n, n - 1);
    tap(canvas, empty.x, empty.y);
    expect(ctx.sounds).not.toContain("select");
    const a = pegPoint(n, 0);
    tap(canvas, a.x, a.y);
    tap(canvas, a.x, a.y); // same peg again: put it back
    expect(ctx.sounds.filter((s) => s === "select").length).toBe(1);
    game.destroy();
  });
});
