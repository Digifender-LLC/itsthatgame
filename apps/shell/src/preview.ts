// Dev-only game preview: `pnpm --filter @itg/shell dev`, then open
// /preview.html?game=<slug>[&reset=1][&reduced=1]. Mounts one game full-screen with real
// audio and a sessionStorage-backed store, bypassing the library, paywall and host. Not part
// of the production build (vite builds index.html only).
import { createScopedStorage, type GameContext, type KeyValueBackend } from "@itg/game-sdk";
import { GAME_MODULES } from "./catalog";
import { createAudio } from "./host/audio";

const params = new URLSearchParams(location.search);
const slug = params.get("game") ?? "ring-sort";
if (params.get("reset")) sessionStorage.clear();

const backend: KeyValueBackend = {
  async get(k) {
    return sessionStorage.getItem(k);
  },
  async set(k, v) {
    sessionStorage.setItem(k, v);
  },
  async remove(k) {
    sessionStorage.removeItem(k);
  },
};

const container = document.getElementById("game")!;
const listeners = new Set<() => void>();
const ctx: GameContext = {
  storage: createScopedStorage(slug, backend),
  audio: createAudio(() => true),
  haptics: { impact: () => navigator.vibrate?.(10) },
  viewport: {
    width: innerWidth,
    height: innerHeight,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    onResize(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  },
  prefersReducedMotion: params.has("reduced"),
  events: { levelComplete: (n) => console.info(`[preview] level ${n} complete`) },
  exit: () => console.info("[preview] exit"),
};
addEventListener("resize", () => {
  ctx.viewport.width = innerWidth;
  ctx.viewport.height = innerHeight;
  for (const l of listeners) l();
});

const load = GAME_MODULES[slug];
if (!load) throw new Error(`unknown game ${slug}`);
const game = (await load()).default();
await game.mount(container, ctx);
game.start();
(window as unknown as { __game: unknown }).__game = game;
