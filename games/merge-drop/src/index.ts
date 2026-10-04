// Merge Drop (TDD §8): drop numbered tiles into one of five columns; equal tiles that touch
// merge (chains allowed); the run ends when a column overflows.
// Rules live in logic.ts (pure, seeded, tested); this file only renders and wires input.
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
import { COLS, ROWS, drop, isMergeState, newGame, seedFromRun, type MergeState } from "./logic";

export const SLUG = "merge-drop";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BTN_H = 44;
const OVER_COOLDOWN_MS = 500;

function inside(r: Rect, p: { x: number; y: number }): boolean {
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

/** Relative luminance, for choosing readable text on a tile colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function textOn(hex: string): string {
  const l = luminance(hex);
  const li = luminance(PALETTE.ink);
  const withInk = (Math.max(l, li) + 0.05) / (Math.min(l, li) + 0.05);
  const withWhite = 1.05 / (l + 0.05);
  return withInk >= withWhite ? PALETTE.ink : "#FFFFFF";
}

function tileIndex(v: number): number {
  return Math.max(0, Math.round(Math.log2(v)) - 1);
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

      let best = (await ctx.storage.get<number>("best")) ?? 0;
      let runs = (await ctx.storage.get<number>("runs")) ?? 0;
      const saved = await ctx.storage.get<unknown>("game");
      if (destroyed) return;

      const save = (key: string, value: unknown) => {
        ctx.storage.set(key, value).catch(() => {});
      };

      const startRun = (): MergeState => {
        runs += 1;
        save("runs", runs);
        const s = newGame(seedFromRun(runs));
        save("game", s);
        return s;
      };

      let state: MergeState = isMergeState(saved) && !saved.over ? saved : startRun();
      let aim = Math.floor(COLS / 2);
      let overMs = 0;
      let newBest = false;
      let banner: { text: string; ms: number } | null = null;
      let pressed: "restart" | "again" | null = null;

      const layout = () => {
        const { width, height, safeArea } = ctx.viewport;
        const top = safeArea.top + 8;
        const headerH = 52;
        const bottom = safeArea.bottom + 12;
        const cell = Math.floor(
          Math.max(
            30,
            Math.min((width - 24) / COLS, (height - top - headerH - bottom) / (ROWS + 0.95), 76),
          ),
        );
        const boardW = cell * COLS;
        const boardX = Math.round((width - boardW) / 2);
        const laneY = top + headerH;
        const laneH = Math.round(cell * 0.95);
        const boardY = laneY + laneH;
        const restart: Rect = { x: width - safeArea.right - 12 - 92, y: top, w: 92, h: BTN_H };
        const again: Rect = { x: width / 2 - 90, y: height / 2 + 40, w: 180, h: 52 };
        return { width, height, top, cell, boardW, boardX, laneY, laneH, boardY, restart, again };
      };

      const colAt = (x: number, L: ReturnType<typeof layout>): number =>
        Math.min(COLS - 1, Math.max(0, Math.floor((x - L.boardX) / L.cell)));

      const drawTile = (v: number, x: number, y: number, size: number, dim = false) => {
        const idx = tileIndex(v);
        const color = PIECE_COLORS[idx % PIECE_COLORS.length]!;
        const r: Rect = { x: x + 2, y: y + 2, w: size - 4, h: size - 4 };
        g.globalAlpha = dim ? 0.55 : 1;
        roundRect(g, r, size * 0.16);
        g.fillStyle = color;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = PALETTE.ink;
        g.stroke();
        g.fillStyle = textOn(color);
        g.textAlign = "center";
        g.textBaseline = "middle";
        const digits = String(v).length;
        const fs = size * (digits <= 2 ? 0.4 : digits === 3 ? 0.33 : 0.27);
        g.font = `700 ${Math.round(fs)}px system-ui, sans-serif`;
        g.fillText(String(v), x + size / 2, y + size / 2 + size * 0.05);
        // Glyph in the corner: colour is never the only cue (NFR-4).
        g.font = `${Math.round(size * 0.2)}px system-ui, sans-serif`;
        g.textAlign = "left";
        g.textBaseline = "top";
        g.fillText(PIECE_GLYPHS[idx % PIECE_GLYPHS.length]!, r.x + size * 0.08, r.y + size * 0.04);
        g.globalAlpha = 1;
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
        const { width, height, cell } = L;
        g.fillStyle = PALETTE.paper;
        g.fillRect(0, 0, width, height);

        // Header: score, best, next preview, restart.
        g.fillStyle = PALETTE.ink;
        g.textAlign = "left";
        g.textBaseline = "top";
        g.font = "700 28px system-ui, sans-serif";
        g.fillText(String(state.score), 16, L.top);
        g.font = "600 14px system-ui, sans-serif";
        g.fillText(`Best ${best}`, 16, L.top + 32);
        const pv = 40;
        const pvX = width / 2 - pv / 2;
        g.textAlign = "center";
        g.font = "600 12px system-ui, sans-serif";
        g.fillText("Next", width / 2, L.top);
        drawTile(state.next, pvX, L.top + 12, pv);
        button(L.restart, "Restart");

        // Board well.
        const well: Rect = { x: L.boardX, y: L.boardY, w: L.boardW, h: cell * ROWS };
        roundRect(g, well, 8);
        g.fillStyle = "#E9E4D6";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = PALETTE.ink;
        g.stroke();
        // Column highlight for the aimed column.
        if (!state.over) {
          g.fillStyle = "rgba(0,114,178,0.14)";
          g.fillRect(L.boardX + aim * cell, L.boardY, cell, cell * ROWS);
        }
        // Column dividers.
        g.strokeStyle = "rgba(36,36,43,0.18)";
        g.lineWidth = 1;
        for (let c = 1; c < COLS; c++) {
          g.beginPath();
          g.moveTo(L.boardX + c * cell, L.boardY);
          g.lineTo(L.boardX + c * cell, L.boardY + cell * ROWS);
          g.stroke();
        }
        // Tiles (row ROWS is the overflow row, drawn above the well).
        state.cols.forEach((col, c) => {
          col.forEach((v, r) => {
            drawTile(v, L.boardX + c * cell, L.boardY + (ROWS - 1 - r) * cell, cell);
          });
        });
        // Danger line: a column this tall is one tile from overflowing.
        g.strokeStyle = PALETTE.vermillion;
        g.setLineDash([6, 5]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(L.boardX, L.boardY);
        g.lineTo(L.boardX + L.boardW, L.boardY);
        g.stroke();
        g.setLineDash([]);

        // Lane: the current tile hovering over the aimed column.
        if (!state.over) {
          drawTile(state.current, L.boardX + aim * cell, L.laneY + (L.laneH - cell) / 2, cell);
        }

        if (banner) {
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = "700 20px system-ui, sans-serif";
          g.fillStyle = PALETTE.blue;
          g.fillText(banner.text, width / 2, L.laneY + L.laneH / 2 - cell * 0.62);
        }

        if (state.over) {
          g.fillStyle = "rgba(27,27,31,0.74)";
          g.fillRect(0, 0, width, height);
          g.fillStyle = PALETTE.paper;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = "700 32px system-ui, sans-serif";
          g.fillText("Column overflow", width / 2, height / 2 - 70);
          g.font = "600 20px system-ui, sans-serif";
          g.fillText(`Score ${state.score}`, width / 2, height / 2 - 30);
          g.fillText(newBest ? `New best ${best}` : `Best ${best}`, width / 2, height / 2 - 2);
          button(L.again, "Play again", true);
        }
      };

      const restart = () => {
        state = startRun();
        overMs = 0;
        newBest = false;
        banner = null;
        ctx.audio.play("tap");
      };

      const endRun = () => {
        if (state.score > best) {
          best = state.score;
          newBest = true;
          save("best", best);
          ctx.audio.play("win");
        } else {
          ctx.audio.play("fail");
        }
        ctx.storage.remove("game").catch(() => {});
        // Run number is reported as the "level" for analytics (endless game).
        ctx.events.levelComplete(runs);
        overMs = 0;
      };

      const play = (col: number) => {
        const r = drop(state, col);
        if (!r.ok) return;
        ctx.haptics.impact(r.chain > 0 ? "medium" : "light");
        if (r.chain > 0) {
          const top = Math.max(...r.merges.map((m) => m.value));
          banner = {
            text: r.chain > 1 ? `Chain x${r.chain}  +${r.gained}` : `+${r.gained}`,
            ms: 1200,
          };
          ctx.audio.play(r.chain > 1 || top >= 64 ? "success" : "pop");
        } else {
          ctx.audio.play("tap");
        }
        if (state.over) endRun();
        else save("game", state);
      };

      const frame = (dtMs: number) => {
        if (state.over) overMs += dtMs;
        if (banner) {
          banner.ms -= dtMs;
          if (banner.ms <= 0) banner = null;
        }
        draw();
      };

      disposePointer = onPointer(canvas, {
        down: (p) => {
          const L = layout();
          pressed = null;
          if (inside(L.restart, p)) pressed = "restart";
          else if (state.over && inside(L.again, p)) pressed = "again";
          else if (!state.over) aim = colAt(p.x, L);
        },
        move: (p) => {
          if (!state.over && !pressed) aim = colAt(p.x, layout());
        },
        up: (p) => {
          const L = layout();
          const was = pressed;
          pressed = null;
          if (was === "restart" && inside(L.restart, p)) {
            restart();
            return;
          }
          if (was === "again" && inside(L.again, p) && overMs >= OVER_COOLDOWN_MS) {
            restart();
            return;
          }
          if (was || state.over) return;
          if (p.y >= L.laneY && p.x >= L.boardX && p.x <= L.boardX + L.boardW) {
            aim = colAt(p.x, L);
            play(aim);
          }
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
