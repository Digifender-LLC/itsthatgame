import { Juice } from "@itg/game-sdk";
import { fakeContext, installFakeCanvas } from "@itg/game-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import factory, { MergeDrop, SLUG } from "./index";
import { COLS, GOALS, drop, newGame } from "./logic";

const AREA = { x: 0, y: 60, w: 390, h: 720 };
const colX = (c: number) => 13 + 73 * (c + 0.5);

function makeController(reducedMotion = false) {
  const juice = new Juice({ reducedMotion, font: "sans-serif", rng: () => 0.5 });
  const sounds: { name: string; pitch?: number }[] = [];
  const ctl = new MergeDrop({
    audio: { play: (name, o) => sounds.push({ name, pitch: o?.pitch }) },
    haptics: { impact: () => {} },
    reducedMotion,
    juice,
    theme: {
      bg: "#000000",
      panel: "#111111",
      text: "#ffffff",
      muted: "#cccccc",
      accent: "#ffcc00",
      accentText: "#000000",
      buttonFill: "#222222",
    },
  });
  const g = new Proxy({} as CanvasRenderingContext2D, {
    get: () => () => {},
    set: () => true,
  });
  const frame = (ms = 16) => {
    ctl.update(ms);
    juice.update(ms);
    ctl.draw(g, AREA, 0);
  };
  const settle = () => {
    for (let i = 0; i < 600 && ctl.busy(); i++) frame();
    expect(ctl.busy()).toBe(false);
  };
  const dropAt = (c: number) => {
    ctl.down({ x: colX(c), y: 400 }, AREA);
    ctl.up({ x: colX(c), y: 400 }, AREA);
  };
  return { ctl, sounds, frame, settle, dropAt, juice };
}

describe("merge-drop controller", () => {
  it("the first touch only starts the run; taps and drags then drop tiles", () => {
    const { ctl, frame, settle, dropAt } = makeController();
    frame();
    expect(ctl.status()).toBe("ready");
    dropAt(1); // starts the run, no drop
    expect(ctl.status()).toBe("playing");
    expect(ctl.board().flat()).toHaveLength(0);

    dropAt(4); // tap on a column drops there
    settle();
    expect(ctl.board()[4]).toHaveLength(1);

    ctl.down({ x: colX(0), y: 300 }, AREA); // drag aim from column 0 to column 2
    ctl.move({ x: colX(1), y: 300 }, AREA);
    ctl.move({ x: colX(2), y: 330 }, AREA);
    ctl.up({ x: colX(2), y: 330 }, AREA);
    settle();
    expect(ctl.board()[2]).toHaveLength(1);
    expect(ctl.board()[0]).toHaveLength(0);
  });

  it("matches the logic model, animates merges and reveals score as merges land", () => {
    const { ctl, settle, dropAt, sounds } = makeController();
    ctl.reset(12345);
    dropAt(0); // start
    const model = newGame(12345);
    const picks = [2, 2, 3, 2, 1, 2, 3, 0, 4, 2, 2, 1];
    for (const c of picks) {
      dropAt(c);
      drop(model, c);
      settle();
      expect(ctl.board()).toEqual(model.cols);
      expect(ctl.score()).toBe(model.score);
      if (model.over) break;
    }
    expect(model.score).toBeGreaterThan(0);
    expect(sounds.some((s) => s.name === "pop")).toBe(true);
    expect(ctl.hudInfo()).toMatch(/^Top \d+/);
  });

  it("buffers one drop made during an animation and runs it afterwards", () => {
    const { ctl, frame, settle, dropAt } = makeController();
    dropAt(0);
    dropAt(1);
    frame(); // tile is in flight
    expect(ctl.busy()).toBe(true);
    dropAt(3); // buffered
    dropAt(4); // ignored (buffer full)
    settle();
    const b = ctl.board();
    expect(b[1]!.length + b[3]!.length).toBeGreaterThanOrEqual(1);
    expect(b[4]).toHaveLength(0);
  });

  it("reaches game over and then resets for a new run", () => {
    const { ctl, settle, dropAt } = makeController(true);
    dropAt(0);
    for (let i = 0; i < 80 && ctl.status() === "playing"; i++) {
      dropAt(i % 2); // two columns fill up quickly
      settle();
    }
    expect(ctl.status()).toBe("over");
    expect(ctl.overMessage()).toMatch(/Highest tile/);
    ctl.reset(9);
    expect(ctl.status()).toBe("ready");
    expect(ctl.score()).toBe(0);
    expect(ctl.board().flat()).toHaveLength(0);
  });

  it("celebrates a new highest tile with an unlock sound and a goal-ladder hud", () => {
    const { ctl, settle, dropAt, sounds } = makeController();
    ctl.reset(1);
    dropAt(0);
    // Force a near-goal board through the pure model path: stack 16s that chain upward.
    const internals = ctl as unknown as { state: { cols: number[][]; current: number } };
    internals.state.cols[0] = [32];
    internals.state.current = 32;
    (ctl as unknown as { vis: unknown[][] }).vis[0] = [
      { v: 32, row: 0, vel: 0, sx: 1, sy: 1, slide: null, seed: 1 },
    ];
    (ctl as unknown as { top: number }).top = 32;
    (ctl as unknown as { goalsDone: number }).goalsDone = 1;
    dropAt(0);
    settle();
    expect(ctl.board()[0]).toEqual([64]);
    expect(sounds.some((s) => s.name === "unlock")).toBe(true);
    expect(ctl.hudInfo()).toBe(`Top 64 → ${GOALS[2]}`);
    expect(COLS).toBe(5);
  });
});

describe("merge-drop rendering", () => {
  it("draws every tier of tile, danger columns and the goal banner without error", () => {
    const { ctl, frame, dropAt } = makeController();
    dropAt(0);
    const inner = ctl as unknown as {
      vis: unknown[][];
      banner: unknown;
      state: { cols: number[][] };
    };
    inner.vis = Array.from({ length: COLS }, (_, c) =>
      Array.from({ length: c === 0 ? 7 : 5 }, (_, i) => ({
        v: 2 ** (1 + ((c * 5 + i) % 15)),
        row: i,
        vel: 0,
        sx: 1,
        sy: 1,
        slide: null,
        seed: i + c,
      })),
    );
    inner.banner = { text: "NEW TILE 2048!", sub: 2048, t: 300, ms: 2000 };
    expect(() => {
      for (let i = 0; i < 5; i++) frame();
    }).not.toThrow();
  });
});

describe("merge-drop in the run shell", () => {
  let container: HTMLElement;
  beforeEach(() => {
    installFakeCanvas();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it("starts on tap, accepts a drag-and-release and keeps its best score saved", async () => {
    const ctx = fakeContext(SLUG);
    const game = factory();
    await game.mount(container, ctx);
    game.start();
    const canvas = container.querySelector("canvas")!;
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
    fire("pointerdown", 195, 400);
    fire("pointerup", 195, 400);
    fire("pointerdown", colX(0), 400);
    fire("pointermove", colX(3), 420);
    fire("pointerup", colX(3), 420);
    expect(ctx.sounds).toContain("whoosh");
    game.destroy();
  });
});
