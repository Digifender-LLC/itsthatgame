// Game host (SDD §3, LLD §1, WF-2): mounts one GameModule, drives its lifecycle
// (mount → start → (pause ↔ resume)* → destroy) and isolates failures.
import {
  createScopedStorage,
  type AudioFacade,
  type GameContext,
  type GameFactory,
  type GameModule,
  type Insets,
  type KeyValueBackend,
} from "@itg/game-sdk";

export const MOUNT_TIMEOUT_MS = 5000; // [Proposal] LLD §1

export interface HostDeps {
  kv: KeyValueBackend;
  audio: AudioFacade;
  haptic(style: "light" | "medium" | "heavy"): void;
  hapticsOn(): boolean;
  reducedMotion(): boolean;
  /** Subscribe to app foreground/background; returns an unsubscribe function. */
  onAppActive(cb: (active: boolean) => void): () => void;
  track(
    name: "game_start" | "game_exit" | "game_error" | "game_complete_level",
    slug: string,
  ): void;
}

export interface HostCallbacks {
  onExit(): void;
  onFailure(error: unknown): void;
}

/** Reads env(safe-area-inset-*) through a probe element. */
export function readSafeArea(): Insets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const insets = {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
  probe.remove();
  return insets;
}

export class GameHost {
  private game: GameModule | null = null;
  private cleanups: (() => void)[] = [];
  private finished = false;
  private started = false;

  constructor(
    private slug: string,
    private deps: HostDeps,
    private cb: HostCallbacks,
  ) {}

  /** Loads the module, mounts and starts it. Any failure ends in onFailure. */
  async launch(
    container: HTMLElement,
    load: () => Promise<{ default: GameFactory }>,
  ): Promise<void> {
    this.watchGlobalErrors();
    try {
      const mod = await load();
      if (this.finished) return;
      const game = mod.default();
      if (game.slug !== this.slug) throw new Error(`module slug "${game.slug}" ≠ "${this.slug}"`);
      this.game = game;
      const ctx = this.buildContext(container);
      await withTimeout(game.mount(container, ctx), MOUNT_TIMEOUT_MS);
      if (this.finished) return;
      game.start();
      this.started = true;
      this.deps.track("game_start", this.slug);
      this.cleanups.push(
        this.deps.onAppActive((active) => (active ? this.resume() : this.pause())),
      );
      if (document.visibilityState === "hidden") this.pause();
    } catch (e) {
      this.fail(e);
    }
  }

  pause(): void {
    this.call(() => this.game?.pause());
  }

  resume(): void {
    this.call(() => this.game?.resume());
  }

  /** Player chose Exit (or the game called ctx.exit()). */
  exit(): void {
    if (this.finished) return;
    this.teardown();
    if (this.started) this.deps.track("game_exit", this.slug);
    this.cb.onExit();
  }

  /** Host is being unmounted without an explicit exit (e.g. route change). */
  dispose(): void {
    if (!this.finished) this.teardown();
  }

  private fail(error: unknown): void {
    if (this.finished) return;
    this.teardown();
    this.deps.track("game_error", this.slug);
    console.error(`[host] ${this.slug} failed`, error);
    this.cb.onFailure(error);
  }

  private teardown(): void {
    this.finished = true;
    for (const c of this.cleanups.splice(0)) c();
    const game = this.game;
    this.game = null;
    try {
      game?.destroy();
    } catch (e) {
      console.error(`[host] ${this.slug} destroy threw`, e);
    }
  }

  private call(fn: () => void): void {
    if (this.finished) return;
    try {
      fn();
    } catch (e) {
      this.fail(e);
    }
  }

  private watchGlobalErrors(): void {
    const onError = (e: ErrorEvent) => this.fail(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => this.fail(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    this.cleanups.push(() => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    });
  }

  private buildContext(container: HTMLElement): GameContext {
    const { deps, slug } = this;
    const resizeSubs = new Set<() => void>();
    let safeArea = readSafeArea();
    const notify = () => {
      safeArea = readSafeArea();
      for (const cb of resizeSubs) this.call(cb);
    };
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(notify) : null;
    ro?.observe(container);
    window.addEventListener("resize", notify);
    this.cleanups.push(() => {
      ro?.disconnect();
      window.removeEventListener("resize", notify);
      resizeSubs.clear();
    });
    const live = () => !this.finished;
    return {
      storage: createScopedStorage(slug, deps.kv),
      audio: { play: (sfx) => live() && deps.audio.play(sfx) },
      haptics: { impact: (style) => live() && deps.hapticsOn() && deps.haptic(style) },
      viewport: {
        get width() {
          return container.clientWidth || window.innerWidth;
        },
        get height() {
          return container.clientHeight || window.innerHeight;
        },
        get safeArea() {
          return safeArea;
        },
        onResize(cb) {
          resizeSubs.add(cb);
          return () => resizeSubs.delete(cb);
        },
      },
      prefersReducedMotion: deps.reducedMotion(),
      events: {
        levelComplete: () => live() && deps.track("game_complete_level", slug),
      },
      exit: () => queueMicrotask(() => this.exit()),
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`mount timed out after ${ms} ms`)), ms);
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
