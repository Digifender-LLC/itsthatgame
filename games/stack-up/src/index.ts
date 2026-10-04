// Stack Up (TDD §8): a one-tap timing game. A block slides over the tower; tap to drop it,
// the overhang is trimmed, and the run ends when a block misses completely.
// Rules live in logic.ts (pure, tested); this file only renders and wires input.
import {
  createCanvas,
  createLoop,
  onPointer,
  PALETTE,
  PIECE_COLORS,
  PIECE_GLYPHS,
  type GameContext,
  type GameFactory,
  type GameModule,
} from "@itg/game-sdk";
import { FIELD, drop, newGame, step, type Block, type StackState } from "./logic";

export const SLUG = "stack-up";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Debris extends Block {
  worldY: number;
  vy: number;
}

const BTN_H = 44;
/** Taps are ignored this long after a run ends so a frantic tap cannot skip the result. */
const OVER_COOLDOWN_MS = 500;

function hit(r: Rect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function roundRect(g: CanvasRenderingContext2D, r: Rect, rad: number): void {
  const k = Math.min(rad, r.w / 2, r.h / 2);
  g.beginPath();
  g.moveTo(r.x + k, r.y);
  g.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  g.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  g.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  g.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  g.closePath();
}

const factory: GameFactory = (): GameModule => {
  let root: HTMLDivElement | null = null;
  let disposePointer: (() => void) | null = null;
  let disposeResize: (() => void) | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let paused = false;
  let destroyed = false;

  return {
    slug: SLUG,
    async mount(container: HTMLElement, ctx: GameContext) {
      root = document.createElement("div");
      root.style.cssText = "position:absolute;inset:0";
      container.appendChild(root);
      const { canvas, ctx: g, resize } = createCanvas(root, ctx.viewport);

      const reduced = ctx.prefersReducedMotion;
      const speedMul = reduced ? 0.55 : 1;
      let best = (await ctx.storage.get<number>("best")) ?? 0;
      let runs = (await ctx.storage.get<number>("runs")) ?? 0;
      if (destroyed) return;

      let state: StackState = newGame(speedMul);
      let debris: Debris[] = [];
      let cam = 0;
      let overMs = 0;
      let newBest = false;
      let flash: { text: string; ms: number } | null = null;

      const save = (key: string, value: number) => {
        ctx.storage.set(key, value).catch(() => {});
      };

      const layout = () => {
        const { width, height, safeArea } = ctx.viewport;
        const unit = Math.min(width - 32, 420) / FIELD;
        const fieldX = (width - FIELD * unit) / 2;
        const bh = Math.max(16, Math.min(30, unit * 6));
        const top = safeArea.top + 12;
        const baseline = height - safeArea.bottom - 48; // top edge of the base block
        const restart: Rect = {
          x: width - safeArea.right - 12 - 96,
          y: top,
          w: 96,
          h: BTN_H,
        };
        const again: Rect = { x: width / 2 - 90, y: height / 2 + 40, w: 180, h: 52 };
        return { width, height, unit, fieldX, bh, top, baseline, restart, again };
      };

      const restart = () => {
        state = newGame(speedMul);
        debris = [];
        overMs = 0;
        newBest = false;
        flash = null;
        ctx.audio.play("tap");
      };

      const worldY = (i: number, L: ReturnType<typeof layout>) => L.baseline - i * L.bh;
      const targetCam = (L: ReturnType<typeof layout>) =>
        Math.max(0, state.tower.length * L.bh - (L.baseline - L.height * 0.42));

      const endRun = () => {
        runs += 1;
        save("runs", runs);
        if (state.score > best) {
          best = state.score;
          newBest = true;
          save("best", best);
          ctx.audio.play("win");
        } else {
          ctx.audio.play("fail");
        }
        // Run number is reported as the "level" for analytics (endless game).
        ctx.events.levelComplete(runs);
      };

      const doDrop = () => {
        const L = layout();
        const r = drop(state);
        ctx.haptics.impact("light");
        if (r.kind === "miss") {
          if (r.debris && !reduced) {
            debris.push({ ...r.debris, worldY: worldY(state.tower.length, L), vy: 0 });
          }
          overMs = 0;
          endRun();
          return;
        }
        if (r.kind === "perfect") {
          ctx.audio.play("success");
          flash = { text: state.streak >= 3 ? `Perfect x${state.streak}` : "Perfect", ms: 900 };
        } else {
          ctx.audio.play("pop");
          if (r.debris && !reduced) {
            debris.push({ ...r.debris, worldY: worldY(r.index, L), vy: 0 });
          }
        }
      };

      const blockRect = (b: Block, y: number, L: ReturnType<typeof layout>): Rect => ({
        x: L.fieldX + b.x * L.unit,
        y,
        w: b.w * L.unit,
        h: L.bh,
      });

      const drawBlock = (
        r: Rect,
        i: number,
        L: ReturnType<typeof layout>,
        outlined: boolean,
      ): void => {
        roundRect(g, { x: r.x, y: r.y, w: r.w, h: r.h - 1 }, 4);
        g.fillStyle = PIECE_COLORS[i % PIECE_COLORS.length]!;
        g.fill();
        g.lineWidth = outlined ? 3 : 1.5;
        g.strokeStyle = PALETTE.ink;
        g.stroke();
        // Glyph so colour is never the only way to tell layers apart (NFR-4).
        if (r.w > L.bh * 1.2) {
          g.fillStyle = PALETTE.ink;
          g.font = `${Math.round(L.bh * 0.55)}px system-ui, sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(PIECE_GLYPHS[i % PIECE_GLYPHS.length]!, r.x + r.w / 2, r.y + r.h / 2);
        }
      };

      const button = (r: Rect, label: string, primary = false) => {
        roundRect(g, r, 10);
        g.fillStyle = primary ? PALETTE.ink : PALETTE.paper;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = PALETTE.ink;
        g.stroke();
        g.fillStyle = primary ? PALETTE.paper : PALETTE.ink;
        g.font = "600 17px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
      };

      const draw = () => {
        const L = layout();
        const { width, height } = L;
        g.fillStyle = PALETTE.paper;
        g.fillRect(0, 0, width, height);

        // Ground.
        g.fillStyle = PALETTE.ink;
        g.fillRect(0, L.baseline + L.bh + cam, width, height);

        g.save();
        g.translate(0, cam);
        state.tower.forEach((b, i) => {
          drawBlock(blockRect(b, worldY(i, L), L), i, L, false);
        });
        if (!state.over) {
          const m = state.mover;
          drawBlock(blockRect(m, worldY(state.tower.length, L), L), state.tower.length, L, true);
        }
        for (const d of debris) {
          g.globalAlpha = 0.85;
          drawBlock(blockRect(d, d.worldY, L), state.tower.length - 1, L, false);
          g.globalAlpha = 1;
        }
        g.restore();

        // HUD.
        g.fillStyle = PALETTE.ink;
        g.textAlign = "center";
        g.textBaseline = "top";
        g.font = "700 44px system-ui, sans-serif";
        g.fillText(String(state.score), width / 2, L.top);
        g.textAlign = "left";
        g.font = "600 16px system-ui, sans-serif";
        g.fillText(`Best ${best}`, ctx.viewport.safeArea.left + 16, L.top + 4);
        button(L.restart, "Restart");

        if (flash) {
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = "700 22px system-ui, sans-serif";
          g.fillStyle = PALETTE.blue;
          g.fillText(flash.text, width / 2, L.top + 78);
        }

        if (state.over) {
          g.fillStyle = "rgba(27,27,31,0.72)";
          g.fillRect(0, 0, width, height);
          g.fillStyle = PALETTE.paper;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = "700 32px system-ui, sans-serif";
          g.fillText("Tower down", width / 2, height / 2 - 70);
          g.font = "600 20px system-ui, sans-serif";
          g.fillText(`Height ${state.score}`, width / 2, height / 2 - 30);
          g.fillText(newBest ? `New best ${best}` : `Best ${best}`, width / 2, height / 2 - 2);
          button(L.again, "Play again", true);
        }
      };

      const frame = (dtMs: number) => {
        const L = layout();
        const dt = dtMs / 1000;
        if (!state.over) step(state, dt);
        else overMs += dtMs;
        if (flash) {
          flash.ms -= dtMs;
          if (flash.ms <= 0) flash = null;
        }
        // Debris falls (skipped entirely in reduced-motion mode).
        for (const d of debris) {
          d.vy += 900 * dt;
          d.worldY += d.vy * dt;
        }
        debris = debris.filter((d) => d.worldY + cam < L.height + 80);
        const t = targetCam(L);
        cam = reduced ? t : cam + (t - cam) * Math.min(1, dt * 6);
        draw();
      };

      disposePointer = onPointer(canvas, {
        down: (p) => {
          const L = layout();
          if (hit(L.restart, p)) {
            restart();
            return;
          }
          if (state.over) {
            if (overMs >= OVER_COOLDOWN_MS && hit(L.again, p)) restart();
            return;
          }
          doDrop();
        },
      });
      disposeResize = ctx.viewport.onResize(() => {
        resize();
        draw();
      });
      loop = createLoop(frame);
      draw();
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
      destroyed = true;
      loop?.stop();
      disposePointer?.();
      disposeResize?.();
      root?.remove();
      root = null;
    },
  };
};

export default factory;
