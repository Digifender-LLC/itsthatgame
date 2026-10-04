// Game template (TDD §8). Copy this folder to games/<slug>/, rename the package, set SLUG,
// then replace the placeholder logic. The conformance test must keep passing.
import {
  createCanvas,
  createLoop,
  onPointer,
  PALETTE,
  type GameContext,
  type GameFactory,
  type GameModule,
} from "@itg/game-sdk";

export const SLUG = "pin-drop";

const factory: GameFactory = (): GameModule => {
  let root: HTMLDivElement | null = null;
  let disposePointer: (() => void) | null = null;
  let disposeResize: (() => void) | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let paused = false;
  let taps = 0;

  return {
    slug: SLUG,
    async mount(container: HTMLElement, ctx: GameContext) {
      root = document.createElement("div");
      root.style.cssText = "position:absolute;inset:0";
      container.appendChild(root);
      const { canvas, ctx: g, resize } = createCanvas(root, ctx.viewport);
      taps = (await ctx.storage.get<number>("taps")) ?? 0;
      const draw = () => {
        const { width, height } = ctx.viewport;
        g.fillStyle = PALETTE.paper;
        g.fillRect(0, 0, width, height);
        g.fillStyle = PALETTE.ink;
        g.font = "20px system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(`Taps: ${taps}`, width / 2, height / 2);
      };
      disposePointer = onPointer(canvas, {
        down: () => {
          taps++;
          ctx.audio.play("tap");
          void ctx.storage.set("taps", taps);
        },
      });
      disposeResize = ctx.viewport.onResize(() => {
        resize();
        draw();
      });
      loop = createLoop(draw);
    },
    start() {
      loop?.start();
    },
    pause() {
      if (paused) return;
      paused = true;
      loop?.pause();
    },
    resume() {
      if (!paused) return;
      paused = false;
      loop?.resume();
    },
    destroy() {
      loop?.stop();
      disposePointer?.();
      disposeResize?.();
      root?.remove();
      root = null;
    },
  };
};

export default factory;
