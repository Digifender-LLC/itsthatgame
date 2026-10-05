import { describe, expect, it } from "vitest";
import { describeConformance } from "./conformance";
import { Particles, Tweens, ease } from "./juice";
import {
  createLevelGame,
  createRunGame,
  sanitizeLevelProgress,
  sanitizeRunProgress,
  shade,
  type LevelController,
  type RunController,
  type Status,
} from "./kit";
import { fakeContext, installFakeCanvas } from "./testing";

const THEME = {
  bg: "#101820",
  panel: "#203040",
  text: "#FFFFFF",
  muted: "#AABBCC",
  accent: "#FFCC00",
  accentText: "#000000",
  buttonFill: "#304050",
};

/** A level is won by tapping `taps` times; tapping the top-left corner loses it. */
class StubLevel implements LevelController {
  taps = 0;
  st: Status = "playing";
  loaded: number[] = [];
  loadLevel(i: number) {
    this.loaded.push(i);
    this.restart();
  }
  restart() {
    this.taps = 0;
    this.st = "playing";
  }
  undo() {
    this.taps = Math.max(0, this.taps - 1);
    this.st = "playing";
  }
  canUndo() {
    return this.taps > 0;
  }
  status() {
    return this.st;
  }
  busy() {
    return false;
  }
  update() {}
  draw() {}
  down(p: { x: number; y: number }, area: { x: number; y: number }) {
    if (p.x < area.x + 10 && p.y < area.y + 10) {
      this.st = "lost";
      return;
    }
    if (++this.taps >= 2) this.st = "won";
  }
  stars() {
    return 2;
  }
}

class StubRun implements RunController {
  st: "ready" | "playing" | "over" = "ready";
  sc = 0;
  reset() {
    this.st = "ready";
    this.sc = 0;
  }
  status() {
    return this.st;
  }
  score() {
    return this.sc;
  }
  busy() {
    return false;
  }
  update() {}
  draw() {}
  down() {
    if (this.st === "ready") this.st = "playing";
    else if (this.sc < 3) this.sc++;
    else this.st = "over";
  }
}

const levelFactory = createLevelGame({
  slug: "stub-level",
  title: "Stub",
  levelCount: 12,
  theme: THEME,
  create: () => new StubLevel(),
});
const runFactory = createRunGame({
  slug: "stub-run",
  title: "Stub",
  theme: THEME,
  create: () => new StubRun(),
});

describeConformance("stub-level", levelFactory);
describeConformance("stub-run", runFactory);

const flush = () => new Promise((r) => setTimeout(r, 0));
const press = (el: Element, type: string, x: number, y: number) =>
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const tap = (el: Element, x: number, y: number) => {
  press(el, "pointerdown", x, y);
  press(el, "pointerup", x, y);
};

describe("sanitizeLevelProgress", () => {
  it("clamps garbage and never resumes past the first locked level", () => {
    const p = sanitizeLevelProgress({ currentLevel: 99, bestLevel: 3, stars: [3, 9, -1] }, 10);
    expect(p.currentLevel).toBe(4);
    expect(p.bestLevel).toBe(3);
    expect(p.stars.slice(0, 4)).toEqual([3, 3, 1, 0]);
    expect(p.stars).toHaveLength(10);
  });
  it("reads progress saved before stars existed", () => {
    const p = sanitizeLevelProgress({ currentLevel: 3, bestLevel: 2 }, 5);
    expect(p).toEqual({ currentLevel: 3, bestLevel: 2, stars: [1, 1, 0, 0, 0] });
  });
  it("handles a missing save", () => {
    expect(sanitizeLevelProgress(undefined, 3)).toEqual({
      currentLevel: 1,
      bestLevel: 0,
      stars: [0, 0, 0],
    });
  });
});

describe("sanitizeRunProgress", () => {
  it("keeps non-negative integers", () => {
    expect(sanitizeRunProgress({ best: 12.7, runs: -3 })).toEqual({ best: 12, runs: 0 });
    expect(sanitizeRunProgress(undefined)).toEqual({ best: 0, runs: 0 });
  });
});

describe("createLevelGame", () => {
  it("records stars and advances when a level is won", async () => {
    installFakeCanvas();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext("stub-level");
    ctx.prefersReducedMotion = true;
    const game = levelFactory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    tap(canvas, 200, 400);
    tap(canvas, 200, 400);
    expect(ctx.levels).toEqual([1]);
    expect(ctx.sounds).toContain("win");
    await flush();
    const saved = JSON.parse(ctx.backend.data.get("game:stub-level:progress")!);
    expect(saved.bestLevel).toBe(1);
    expect(saved.currentLevel).toBe(2);
    expect(saved.stars[0]).toBe(2);
    game.destroy();
  });

  it("plays a sound when a level is lost", async () => {
    installFakeCanvas();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext("stub-level");
    const game = levelFactory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    tap(canvas, 2, 62);
    expect(ctx.sounds).toContain("fail");
    expect(ctx.levels).toEqual([]);
    game.destroy();
  });
});

describe("createRunGame", () => {
  it("saves the best score when a run ends", async () => {
    installFakeCanvas();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ctx = fakeContext("stub-run");
    const game = runFactory();
    await game.mount(container, ctx);
    const canvas = container.querySelector("canvas")!;
    for (let i = 0; i < 5; i++) tap(canvas, 200, 400);
    await flush();
    const saved = JSON.parse(ctx.backend.data.get("game:stub-run:progress")!);
    expect(saved).toEqual({ best: 3, runs: 1 });
    expect(ctx.sounds).toContain("fail");
    game.destroy();
  });
});

describe("juice", () => {
  it("tweens reach their end value and call done once", () => {
    const tw = new Tweens();
    let v = -1;
    let done = 0;
    tw.add(100, (x) => (v = x), { ease: ease.linear, done: () => done++ });
    tw.update(50);
    expect(v).toBeCloseTo(0.5);
    tw.update(80);
    expect(v).toBe(1);
    expect(done).toBe(1);
    expect(tw.active).toBe(false);
  });

  it("particles expire and reduced motion emits fewer", () => {
    const p = new Particles(false, () => 0.5);
    p.burst(0, 0, { count: 20, life: 100 });
    expect(p.count).toBe(20);
    p.update(500);
    expect(p.count).toBe(0);
    const r = new Particles(true, () => 0.5);
    r.burst(0, 0, { count: 20 });
    expect(r.count).toBe(5);
  });

  it("shade lightens and darkens", () => {
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
  });
});
