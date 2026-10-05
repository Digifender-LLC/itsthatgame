// IF-5: the contract between the app shell and every game (docs/design/LLD.md §1).
// Games import only from this package. They never touch the network, Capacitor,
// navigation, purchases, or other games' data.

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  width: number;
  height: number;
  safeArea: Insets;
  /** Subscribe to size changes; returns an unsubscribe function. */
  onResize(cb: () => void): () => void;
}

export interface ScopedStorage {
  get<T>(key: string): Promise<T | undefined>;
  /** JSON-serializable values only, at most 64 KB serialized. */
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export type Sfx =
  | "tap"
  | "move"
  | "success"
  | "fail"
  | "win"
  | "pop"
  | "select"
  | "drop"
  | "combo"
  | "perfect"
  | "star"
  | "unlock"
  | "whoosh"
  | "bump";

/** Every effect name, for hosts and tests. */
export const SFX_NAMES: readonly Sfx[] = [
  "tap",
  "move",
  "success",
  "fail",
  "win",
  "pop",
  "select",
  "drop",
  "combo",
  "perfect",
  "star",
  "unlock",
  "whoosh",
  "bump",
];

export interface SfxOptions {
  /** Pitch multiplier, e.g. 1.12 per combo step (clamped by the host to 0.5..3). */
  pitch?: number;
  /** Volume multiplier 0..1 (default 1). */
  volume?: number;
}

export interface AudioFacade {
  /** Short synthesized effect; no-op when sound effects are disabled. */
  play(sfx: Sfx, opts?: SfxOptions): void;
}

export interface Haptics {
  impact(style: "light" | "medium" | "heavy"): void;
}

export interface GameEvents {
  /** Report a completed level (analytics `game_complete_level`). */
  levelComplete(level: number): void;
}

export interface GameContext {
  storage: ScopedStorage;
  audio: AudioFacade;
  haptics: Haptics;
  viewport: Viewport;
  prefersReducedMotion: boolean;
  events: GameEvents;
  /** Ask the host to return to the library. */
  exit(): void;
}

export interface GameModule {
  /** Must equal the catalog entry slug. */
  readonly slug: string;
  mount(container: HTMLElement, ctx: GameContext): Promise<void>;
  /** Called once after mount resolves. */
  start(): void;
  /** App backgrounded or overlay shown. Idempotent. */
  pause(): void;
  /** Ignored unless paused. */
  resume(): void;
  /** Release timers, listeners, audio. The game must not touch anything afterwards. */
  destroy(): void;
}

/** A game package's default export: a factory, so each launch gets fresh state. */
export type GameFactory = () => GameModule;

export const MAX_STORAGE_VALUE_BYTES = 64 * 1024;

// ---- Helpers games may use ----------------------------------------------------

export interface KeyValueBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Storage namespaced to `game:<slug>:` so games cannot read each other's data (FR-APP-4). */
export function createScopedStorage(slug: string, backend: KeyValueBackend): ScopedStorage {
  const prefix = `game:${slug}:`;
  return {
    async get<T>(key: string) {
      const raw = await backend.get(prefix + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T) {
      const raw = JSON.stringify(value);
      if (raw === undefined) throw new Error("value is not JSON-serializable");
      if (new TextEncoder().encode(raw).length > MAX_STORAGE_VALUE_BYTES) {
        throw new Error(`value for "${key}" exceeds ${MAX_STORAGE_VALUE_BYTES} bytes`);
      }
      await backend.set(prefix + key, raw);
    },
    async remove(key: string) {
      await backend.remove(prefix + key);
    },
  };
}

export function memoryBackend(seed: Record<string, string> = {}): KeyValueBackend & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    async get(k) {
      return data.get(k) ?? null;
    },
    async set(k, v) {
      data.set(k, v);
    },
    async remove(k) {
      data.delete(k);
    },
  };
}

/** Creates a full-size, DPR-aware canvas in the container. */
export function createCanvas(
  container: HTMLElement,
  viewport: Viewport,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; resize(): void } {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas not supported");
  const resize = () => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(viewport.width * dpr));
    canvas.height = Math.max(1, Math.round(viewport.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  return { canvas, ctx, resize };
}

/** requestAnimationFrame loop that can be paused, resumed and stopped. */
export function createLoop(frame: (dtMs: number) => void): {
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  readonly running: boolean;
} {
  let handle: number | null = null;
  let last = 0;
  let stopped = false;
  const tick = (t: number) => {
    const dt = last ? Math.min(t - last, 100) : 16;
    last = t;
    frame(dt);
    if (handle !== null) handle = requestAnimationFrame(tick);
  };
  const run = () => {
    if (stopped || handle !== null) return;
    last = 0;
    handle = requestAnimationFrame(tick);
  };
  const halt = () => {
    if (handle !== null) cancelAnimationFrame(handle);
    handle = null;
  };
  return {
    start: run,
    pause: halt,
    resume: run,
    stop() {
      halt();
      stopped = true;
    },
    get running() {
      return handle !== null;
    },
  };
}

export interface PointerPoint {
  x: number;
  y: number;
}

/**
 * Normalized pointer input in CSS pixels relative to the element. Tracks one finger at a
 * time (a second finger is ignored), captures it so drags continue outside the element,
 * and reports pointercancel as `up`. Returns a disposer.
 */
export function onPointer(
  el: HTMLElement,
  handlers: {
    down?(p: PointerPoint): void;
    move?(p: PointerPoint): void;
    up?(p: PointerPoint): void;
  },
): () => void {
  let active: number | null = null;
  const pos = (e: PointerEvent): PointerPoint => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const idOf = (e: PointerEvent) => (typeof e.pointerId === "number" ? e.pointerId : 1);
  const down = (e: PointerEvent) => {
    if (active !== null && active !== idOf(e)) return;
    active = idOf(e);
    try {
      el.setPointerCapture?.(active);
    } catch {
      // synthetic events in tests have no capturable pointer
    }
    handlers.down?.(pos(e));
  };
  const move = (e: PointerEvent) => {
    if (active !== null && active !== idOf(e)) return;
    handlers.move?.(pos(e));
  };
  const up = (e: PointerEvent) => {
    if (active !== null && active !== idOf(e)) return;
    active = null;
    handlers.up?.(pos(e));
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
}

/** Colorblind-safe palette (Okabe–Ito) plus neutrals; pair colors with shapes/labels (NFR-4). */
export const PALETTE = {
  orange: "#E69F00",
  sky: "#56B4E9",
  green: "#009E73",
  yellow: "#F0E442",
  blue: "#0072B2",
  vermillion: "#D55E00",
  purple: "#CC79A7",
  black: "#1B1B1F",
  ink: "#24242B",
  paper: "#FAF7F0",
  muted: "#8A8794",
} as const;

/** Ordered list for "N distinct colors" needs. */
export const PIECE_COLORS = [
  PALETTE.orange,
  PALETTE.sky,
  PALETTE.green,
  PALETTE.yellow,
  PALETTE.blue,
  PALETTE.vermillion,
  PALETTE.purple,
] as const;

/** Distinct glyphs drawn on pieces so color is never the only cue (NFR-4). */
export const PIECE_GLYPHS = ["●", "▲", "■", "◆", "★", "✚", "⬟"] as const;

export * from "./juice";
export * from "./kit";
