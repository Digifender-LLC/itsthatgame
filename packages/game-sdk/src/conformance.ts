// SDK conformance test (FR-GAME-1). Every game runs this in its own test suite:
//
//   import { describeConformance } from "@itg/game-sdk/conformance";
//   import factory from "./index";
//   describeConformance("ring-sort", factory);
//
// It asserts the lifecycle rules in docs/design/LLD.md §1 and that a game leaves no
// timers, animation frames, DOM nodes, or listeners behind after destroy().
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameFactory } from "./index";
import { fakeContext, installFakeCanvas } from "./testing";

export function describeConformance(slug: string, factory: GameFactory): void {
  describe(`game conformance: ${slug}`, () => {
    let container: HTMLElement;
    let rafIds: Set<number>;
    let timers: Set<unknown>;
    let windowListeners: number;
    const realRaf = globalThis.requestAnimationFrame;
    const realCaf = globalThis.cancelAnimationFrame;
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const realSetInterval = globalThis.setInterval;
    const realClearInterval = globalThis.clearInterval;
    const realAdd = window.addEventListener.bind(window);
    const realRemove = window.removeEventListener.bind(window);
    const realDocAdd = document.addEventListener.bind(document);
    const realDocRemove = document.removeEventListener.bind(document);

    beforeEach(() => {
      installFakeCanvas();
      container = document.createElement("div");
      document.body.appendChild(container);
      rafIds = new Set();
      timers = new Set();
      windowListeners = 0;
      let next = 1;
      globalThis.requestAnimationFrame = ((_cb: FrameRequestCallback) => {
        const id = next++;
        rafIds.add(id);
        return id;
      }) as typeof requestAnimationFrame;
      globalThis.cancelAnimationFrame = ((id: number) => {
        rafIds.delete(id);
      }) as typeof cancelAnimationFrame;
      globalThis.setTimeout = ((fn: () => void, ms?: number) => {
        const id = realSetTimeout(() => {
          timers.delete(id);
          fn();
        }, ms);
        timers.add(id);
        return id;
      }) as typeof setTimeout;
      globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
        timers.delete(id);
        realClearTimeout(id);
      }) as typeof clearTimeout;
      globalThis.setInterval = ((fn: () => void, ms?: number) => {
        const id = realSetInterval(fn, ms);
        timers.add(id);
        return id;
      }) as typeof setInterval;
      globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
        timers.delete(id);
        realClearInterval(id);
      }) as typeof clearInterval;
      const add = (real: typeof realAdd) =>
        ((...args: Parameters<typeof realAdd>) => {
          windowListeners++;
          real(...args);
        }) as typeof window.addEventListener;
      const remove = (real: typeof realRemove) =>
        ((...args: Parameters<typeof realRemove>) => {
          windowListeners--;
          real(...args);
        }) as typeof window.removeEventListener;
      window.addEventListener = add(realAdd);
      window.removeEventListener = remove(realRemove);
      document.addEventListener = add(realDocAdd);
      document.removeEventListener = remove(realDocRemove);
    });

    afterEach(() => {
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCaf;
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
      window.addEventListener = realAdd;
      window.removeEventListener = realRemove;
      document.addEventListener = realDocAdd;
      document.removeEventListener = realDocRemove;
      container.remove();
      vi.restoreAllMocks();
    });

    it("declares the catalog slug", () => {
      expect(factory().slug).toBe(slug);
    });

    it("mounts within 5 s and renders into the container", async () => {
      const game = factory();
      const ctx = fakeContext(slug);
      await withTimeout(game.mount(container, ctx), 5000);
      game.start();
      expect(container.childNodes.length).toBeGreaterThan(0);
      game.destroy();
    });

    it("survives the full lifecycle including repeated pause/resume", async () => {
      const game = factory();
      const ctx = fakeContext(slug);
      await game.mount(container, ctx);
      game.start();
      game.pause();
      game.pause(); // idempotent
      game.resume();
      game.resume(); // ignored, not paused
      game.pause();
      game.resume();
      ctx.fireResize(320, 568);
      game.destroy();
    });

    it("cleans up everything on destroy", async () => {
      const game = factory();
      const ctx = fakeContext(slug);
      await game.mount(container, ctx);
      game.start();
      game.destroy();
      expect(rafIds.size, "animation frames left running").toBe(0);
      expect(timers.size, "timers left running").toBe(0);
      expect(windowListeners, "window/document listeners left attached").toBe(0);
      expect(container.childNodes.length, "DOM left in container").toBe(0);
    });

    it("uses only scoped storage", async () => {
      const game = factory();
      const ctx = fakeContext(slug);
      await game.mount(container, ctx);
      game.start();
      game.destroy();
      for (const key of ctx.backend.data.keys()) {
        expect(key.startsWith(`game:${slug}:`)).toBe(true);
      }
    });

    it("does not touch the network", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const game = factory();
      await game.mount(container, fakeContext(slug));
      game.start();
      game.destroy();
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`mount did not resolve within ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
