import { memoryBackend, type GameContext, type GameModule } from "@itg/game-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameHost, type HostDeps } from "./gameHost";

function fakeGame(slug = "ring-sort", over: Partial<GameModule> = {}) {
  const log: string[] = [];
  let ctx: GameContext | null = null;
  const game: GameModule = {
    slug,
    async mount(_c, c) {
      ctx = c;
      log.push("mount");
    },
    start: () => log.push("start"),
    pause: () => log.push("pause"),
    resume: () => log.push("resume"),
    destroy: () => log.push("destroy"),
    ...over,
  };
  return { game, log, ctx: () => ctx! };
}

function setup() {
  const tracked: string[] = [];
  let appActive: ((a: boolean) => void) | null = null;
  const kv = memoryBackend();
  const haptic = vi.fn();
  const play = vi.fn();
  const settings = { haptics: true };
  const deps: HostDeps = {
    kv,
    audio: { play },
    haptic,
    hapticsOn: () => settings.haptics,
    reducedMotion: () => true,
    onAppActive: (cb) => {
      appActive = cb;
      return () => (appActive = null);
    },
    track: (name, slug) => tracked.push(`${name}:${slug}`),
  };
  const cb = { onExit: vi.fn(), onFailure: vi.fn() };
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    deps,
    cb,
    container,
    tracked,
    kv,
    haptic,
    play,
    settings,
    setActive: (a: boolean) => appActive?.(a),
    hasListener: () => appActive !== null,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GameHost lifecycle (FR-APP-2, LLD §1)", () => {
  it("mounts, starts, pauses/resumes on app state, and destroys on exit", async () => {
    const s = setup();
    const g = fakeGame();
    const host = new GameHost("ring-sort", s.deps, s.cb);
    await host.launch(s.container, async () => ({ default: () => g.game }));
    s.setActive(false);
    s.setActive(true);
    host.exit();
    expect(g.log).toEqual(["mount", "start", "pause", "resume", "destroy"]);
    expect(s.tracked).toEqual(["game_start:ring-sort", "game_exit:ring-sort"]);
    expect(s.cb.onExit).toHaveBeenCalledOnce();
    expect(s.hasListener()).toBe(false);
  });

  it("gives the game scoped storage, settings-aware haptics, reduced motion and level events", async () => {
    const s = setup();
    const g = fakeGame();
    const host = new GameHost("ring-sort", s.deps, s.cb);
    await host.launch(s.container, async () => ({ default: () => g.game }));
    const ctx = g.ctx();
    await ctx.storage.set("best", 7);
    expect(await s.kv.get("game:ring-sort:best")).toBe("7");
    expect(ctx.prefersReducedMotion).toBe(true);
    ctx.haptics.impact("light");
    s.settings.haptics = false;
    ctx.haptics.impact("light");
    expect(s.haptic).toHaveBeenCalledTimes(1);
    ctx.audio.play("tap");
    expect(s.play).toHaveBeenCalledWith("tap");
    ctx.events.levelComplete(3);
    expect(s.tracked).toContain("game_complete_level:ring-sort");
    expect(typeof ctx.viewport.width).toBe("number");
    const off = ctx.viewport.onResize(() => undefined);
    off();
    host.exit();
    ctx.audio.play("tap");
    expect(s.play).toHaveBeenCalledTimes(1); // nothing after destroy
  });

  it("ctx.exit() returns to the library", async () => {
    const s = setup();
    const g = fakeGame();
    const host = new GameHost("ring-sort", s.deps, s.cb);
    await host.launch(s.container, async () => ({ default: () => g.game }));
    g.ctx().exit();
    await Promise.resolve();
    expect(s.cb.onExit).toHaveBeenCalledOnce();
    expect(g.log.at(-1)).toBe("destroy");
  });

  it("a throwing mount destroys the game, reports game_error and fails (WF-2)", async () => {
    const s = setup();
    const g = fakeGame("ring-sort", {
      mount: async () => {
        throw new Error("boom");
      },
    });
    const host = new GameHost("ring-sort", s.deps, s.cb);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await host.launch(s.container, async () => ({ default: () => g.game }));
    expect(s.cb.onFailure).toHaveBeenCalledOnce();
    expect(g.log).toEqual(["destroy"]);
    expect(s.tracked).toEqual(["game_error:ring-sort"]);
  });

  it("an error thrown from pause, or a window error while mounted, fails the game", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = setup();
    const g = fakeGame("ring-sort", {
      pause: () => {
        throw new Error("pause broke");
      },
    });
    const host = new GameHost("ring-sort", s.deps, s.cb);
    await host.launch(s.container, async () => ({ default: () => g.game }));
    s.setActive(false);
    expect(s.cb.onFailure).toHaveBeenCalledOnce();
    expect(g.log.at(-1)).toBe("destroy");

    const s2 = setup();
    const g2 = fakeGame();
    const host2 = new GameHost("ring-sort", s2.deps, s2.cb);
    await host2.launch(s2.container, async () => ({ default: () => g2.game }));
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("async boom") }));
    expect(s2.cb.onFailure).toHaveBeenCalledOnce();
    expect(s2.tracked).toContain("game_error:ring-sort");
  });

  it("rejects a module whose slug differs from the catalog entry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = setup();
    const host = new GameHost("ring-sort", s.deps, s.cb);
    await host.launch(s.container, async () => ({ default: () => fakeGame("other").game }));
    expect(s.cb.onFailure).toHaveBeenCalledOnce();
  });

  it("treats a mount slower than 5 s as a load failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = setup();
    const g = fakeGame("ring-sort", { mount: () => new Promise(() => undefined) });
    const host = new GameHost("ring-sort", s.deps, s.cb);
    const p = host.launch(s.container, async () => ({ default: () => g.game }));
    await vi.advanceTimersByTimeAsync(5001);
    await p;
    expect(s.cb.onFailure).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
