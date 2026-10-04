import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { SLUG } from "./index";
import { COLS, drop, newGame, seedFromRun } from "./logic";

// Layout for the default 390x780 fake viewport (see layout() in index.ts).
const BOARD_X = 13;
const CELL = 73;
const Y = 300;

function fire(el: Element, type: string, x: number, y: number) {
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

describe("merge-drop play-through", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  const tapColumn = (col: number) => {
    const canvas = container.querySelector("canvas")!;
    const x = BOARD_X + CELL * (col + 0.5);
    fire(canvas, "pointerdown", x, Y);
    fire(canvas, "pointerup", x, Y);
  };

  it("drops tiles by tapping columns, saves the run and resumes it identically", async () => {
    const ctx = fakeContext(SLUG);
    const picks = [2, 0, 2, 4, 1, 1];
    const expected = newGame(seedFromRun(1)); // first run uses counter value 1
    for (const c of picks) drop(expected, c);

    const a = factory();
    await a.mount(container, ctx);
    a.start();
    for (const c of picks.slice(0, 3)) tapColumn(c);
    await new Promise((r) => setTimeout(r, 0));
    a.destroy();

    const b = factory();
    await b.mount(container, ctx);
    b.start();
    expect(await ctx.storage.get<number>("runs")).toBe(1); // resumed, not a new run
    for (const c of picks.slice(3)) tapColumn(c);
    await new Promise((r) => setTimeout(r, 0));
    expect(await ctx.storage.get<unknown>("game")).toEqual(expected);
    expect(COLS).toBe(5);
    b.destroy();
  });
});
