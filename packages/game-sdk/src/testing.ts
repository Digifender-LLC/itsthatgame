// Test helpers: a fake GameContext and a recording 2D canvas context for headless tests.
import { createScopedStorage, memoryBackend, type GameContext, type Sfx } from "./index";

export interface FakeContext extends GameContext {
  exits: number;
  sounds: Sfx[];
  levels: number[];
  backend: ReturnType<typeof memoryBackend>;
  fireResize(width: number, height: number): void;
}

export function fakeContext(
  slug: string,
  opts: { width?: number; height?: number } = {},
): FakeContext {
  const backend = memoryBackend();
  const listeners = new Set<() => void>();
  const ctx: FakeContext = {
    backend,
    exits: 0,
    sounds: [],
    levels: [],
    storage: createScopedStorage(slug, backend),
    audio: { play: (s) => ctx.sounds.push(s) },
    haptics: { impact: () => {} },
    viewport: {
      width: opts.width ?? 390,
      height: opts.height ?? 780,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      onResize(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
    prefersReducedMotion: false,
    events: { levelComplete: (n) => ctx.levels.push(n) },
    exit: () => {
      ctx.exits++;
    },
    fireResize(width, height) {
      ctx.viewport.width = width;
      ctx.viewport.height = height;
      for (const l of listeners) l();
    },
  };
  return ctx;
}

/** Install a no-op 2D context on HTMLCanvasElement for DOM emulators without canvas. */
export function installFakeCanvas(): void {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (type: string) => unknown;
  };
  proto.getContext = function () {
    const noop = () => {};
    return new Proxy(
      { canvas: this, measureText: () => ({ width: 10 }) } as Record<string, unknown>,
      {
        get(target, prop) {
          if (prop in target) return target[prop as string];
          return noop;
        },
        set(target, prop, value) {
          target[prop as string] = value;
          return true;
        },
      },
    );
  };
}
