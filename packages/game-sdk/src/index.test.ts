import { describe, expect, it } from "vitest";
import { createLoop, createScopedStorage, memoryBackend, type GameModule } from "./index";
import { describeConformance } from "./conformance";

describe("scoped storage", () => {
  it("namespaces keys per game and isolates games", async () => {
    const backend = memoryBackend();
    const a = createScopedStorage("game-a", backend);
    const b = createScopedStorage("game-b", backend);
    await a.set("level", 3);
    expect(await a.get("level")).toBe(3);
    expect(await b.get("level")).toBeUndefined();
    expect([...backend.data.keys()]).toEqual(["game:game-a:level"]);
    await a.remove("level");
    expect(await a.get("level")).toBeUndefined();
  });

  it("rejects oversized values", async () => {
    const s = createScopedStorage("game-a", memoryBackend());
    await expect(s.set("big", "x".repeat(70 * 1024))).rejects.toThrow(/exceeds/);
  });
});

describe("loop", () => {
  it("pauses, resumes and stops", () => {
    const loop = createLoop(() => {});
    loop.start();
    expect(loop.running).toBe(true);
    loop.pause();
    expect(loop.running).toBe(false);
    loop.resume();
    expect(loop.running).toBe(true);
    loop.stop();
    loop.resume();
    expect(loop.running).toBe(false);
  });
});

// A minimal well-behaved game proves the conformance suite itself passes on correct code.
function stubFactory(): GameModule {
  let el: HTMLElement | null = null;
  let raf = 0;
  let paused = false;
  const onResize = () => {};
  return {
    slug: "stub-game",
    async mount(container, ctx) {
      el = document.createElement("div");
      container.appendChild(el);
      await ctx.storage.set("seen", true);
      window.addEventListener("resize", onResize);
    },
    start() {
      raf = requestAnimationFrame(() => {});
    },
    pause() {
      if (paused) return;
      paused = true;
      cancelAnimationFrame(raf);
    },
    resume() {
      if (!paused) return;
      paused = false;
      raf = requestAnimationFrame(() => {});
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el?.remove();
    },
  };
}

describeConformance("stub-game", stubFactory);
