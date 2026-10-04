// Paint Path: one-stroke grid puzzle. Paint every open cell exactly once in a single
// continuous path. All visuals are drawn procedurally on a 2D canvas.
import {
  createCanvas,
  createLoop,
  onPointer,
  PALETTE,
  type GameContext,
  type GameFactory,
  type GameModule,
} from "@itg/game-sdk";
import { LEVELS, LEVEL_COUNT } from "./levels";
import {
  availableMoves,
  cellCol,
  cellRow,
  createState,
  head,
  isWall,
  isWon,
  restart,
  step,
  undo,
  type PaintState,
} from "./logic";

export const SLUG = "paint-path";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Progress {
  currentLevel: number;
  bestLevel: number;
}

const MIN_TARGET = 48;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
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

      let progress: Progress = { currentLevel: 0, bestLevel: 0 };
      try {
        const saved = await ctx.storage.get<Partial<Progress>>("progress");
        if (saved) {
          progress = {
            currentLevel: clampInt(saved.currentLevel, 0, LEVEL_COUNT - 1, 0),
            bestLevel: clampInt(saved.bestLevel, 0, LEVEL_COUNT, 0),
          };
        }
      } catch {
        /* corrupt or unavailable storage: start fresh */
      }
      if (destroyed) return;

      let levelIndex = progress.currentLevel;
      let state: PaintState = createState(LEVELS[levelIndex]!);
      let pressing = false;
      let lastPoint: { x: number; y: number } | null = null;
      let winAge = -1; // ms since win; -1 while playing
      let blockedFlash = 0; // ms remaining of the "blocked" shake cue

      const save = () => {
        if (destroyed) return;
        void ctx.storage.set("progress", progress).catch(() => {});
      };

      const layout = () => {
        const { width, height, safeArea } = ctx.viewport;
        const top = safeArea.top;
        const bottom = safeArea.bottom;
        const pad = 16 + Math.max(safeArea.left, safeArea.right);
        const hudH = 56;
        const btnH = MIN_TARGET;
        const btnY = height - bottom - 16 - btnH;
        const btnW = Math.min(150, (width - pad * 2 - 12) / 2);
        const level = state.level;
        const gx0 = pad;
        const gy0 = top + hudH + 8;
        const aw = width - pad * 2;
        const ah = btnY - 16 - gy0;
        const cell = Math.max(
          8,
          Math.min(72, Math.floor(Math.min(aw / level.cols, ah / level.rows))),
        );
        const gw = cell * level.cols;
        const gh = cell * level.rows;
        const grid: Rect = {
          x: gx0 + (aw - gw) / 2,
          y: gy0 + Math.max(0, (ah - gh) / 2),
          w: gw,
          h: gh,
        };
        const center = width / 2;
        const restartBtn: Rect = { x: center - btnW - 6, y: btnY, w: btnW, h: btnH };
        const undoBtn: Rect = { x: center + 6, y: btnY, w: btnW, h: btnH };
        const backBtn: Rect = { x: pad - 8, y: top + 6, w: MIN_TARGET, h: MIN_TARGET };
        const cardW = Math.min(300, width - 32);
        const card: Rect = { x: (width - cardW) / 2, y: height / 2 - 100, w: cardW, h: 200 };
        const nextBtn: Rect = {
          x: card.x + 24,
          y: card.y + card.h - 24 - 52,
          w: cardW - 48,
          h: 52,
        };
        return { width, height, top, pad, grid, cell, restartBtn, undoBtn, backBtn, card, nextBtn };
      };

      const cellAt = (x: number, y: number): number => {
        const L = layout();
        const c = Math.floor((x - L.grid.x) / L.cell);
        const r = Math.floor((y - L.grid.y) / L.cell);
        if (c < 0 || r < 0 || c >= state.level.cols || r >= state.level.rows) return -1;
        return r * state.level.cols + c;
      };

      const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
        g.beginPath();
        g.moveTo(x + r, y);
        g.lineTo(x + w - r, y);
        g.quadraticCurveTo(x + w, y, x + w, y + r);
        g.lineTo(x + w, y + h - r);
        g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        g.lineTo(x + r, y + h);
        g.quadraticCurveTo(x, y + h, x, y + h - r);
        g.lineTo(x, y + r);
        g.quadraticCurveTo(x, y, x + r, y);
        g.closePath();
      };

      const star = (cx: number, cy: number, R: number) => {
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 === 0 ? R : R * 0.45;
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
      };

      const button = (r: Rect, label: string, enabled = true, primary = false) => {
        g.save();
        roundRect(r.x, r.y, r.w, r.h, 12);
        g.fillStyle = primary ? PALETTE.blue : PALETTE.paper;
        g.globalAlpha = enabled ? 1 : 0.45;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = PALETTE.ink;
        g.stroke();
        g.fillStyle = primary ? "#FFFFFF" : PALETTE.ink;
        g.font = `700 17px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
        g.restore();
      };

      const draw = () => {
        const L = layout();
        const { width, height } = L;
        const level = state.level;
        g.setLineDash([]);
        g.globalAlpha = 1;
        g.fillStyle = PALETTE.paper;
        g.fillRect(0, 0, width, height);

        // HUD
        g.fillStyle = PALETTE.ink;
        g.textBaseline = "middle";
        g.textAlign = "center";
        g.font = `800 20px ${FONT}`;
        g.fillText(`Level ${level.id} / ${LEVEL_COUNT}`, width / 2, L.top + 30);
        g.font = `600 14px ${FONT}`;
        g.textAlign = "right";
        g.fillText(`${state.path.length} / ${state.openCount}`, width - L.pad, L.top + 30);
        // back arrow
        g.save();
        g.strokeStyle = PALETTE.ink;
        g.lineWidth = 3;
        g.lineCap = "round";
        g.lineJoin = "round";
        const bx = L.backBtn.x + L.backBtn.w / 2;
        const by = L.backBtn.y + L.backBtn.h / 2;
        g.beginPath();
        g.moveTo(bx + 6, by - 9);
        g.lineTo(bx - 4, by);
        g.lineTo(bx + 6, by + 9);
        g.stroke();
        g.restore();

        // Board
        const { grid, cell } = L;
        const shake =
          blockedFlash > 0 && !ctx.prefersReducedMotion ? Math.sin(blockedFlash * 0.12) * 3 : 0;
        g.save();
        g.translate(shake, 0);
        for (let i = 0; i < level.cols * level.rows; i++) {
          const x = grid.x + cellCol(level, i) * cell;
          const y = grid.y + cellRow(level, i) * cell;
          const inset = Math.max(1.5, cell * 0.04);
          if (isWall(level, i)) {
            roundRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.16);
            g.fillStyle = PALETTE.ink;
            g.fill();
            // diagonal hatch so walls are not distinguished by color alone
            g.save();
            g.clip();
            g.strokeStyle = PALETTE.muted;
            g.lineWidth = 2;
            g.beginPath();
            for (let k = -cell; k < cell * 2; k += 10) {
              g.moveTo(x + k, y + cell);
              g.lineTo(x + k + cell, y);
            }
            g.stroke();
            g.restore();
          } else {
            roundRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.16);
            g.fillStyle = "#EDE6D4";
            g.fill();
            g.lineWidth = 1.5;
            g.strokeStyle = PALETTE.muted;
            g.stroke();
          }
        }

        // Painted trail
        const centre = (i: number) => ({
          x: grid.x + cellCol(level, i) * cell + cell / 2,
          y: grid.y + cellRow(level, i) * cell + cell / 2,
        });
        g.lineCap = "round";
        g.lineJoin = "round";
        g.strokeStyle = PALETTE.sky;
        g.lineWidth = cell * 0.5;
        g.beginPath();
        state.path.forEach((c, k) => {
          const p = centre(c);
          if (k === 0) g.moveTo(p.x, p.y);
          else g.lineTo(p.x, p.y);
        });
        if (state.path.length === 1) {
          const p = centre(state.path[0]!);
          g.lineTo(p.x + 0.01, p.y);
        }
        g.stroke();
        g.strokeStyle = PALETTE.blue;
        g.lineWidth = cell * 0.2;
        g.stroke();

        // Hints: dashed rings on cells the brush can move to next
        if (!isWon(state)) {
          g.save();
          g.setLineDash([5, 4]);
          g.lineWidth = 2.5;
          g.strokeStyle = PALETTE.vermillion;
          for (const m of availableMoves(state)) {
            const p = centre(m);
            g.beginPath();
            g.arc(p.x, p.y, cell * 0.3, 0, Math.PI * 2);
            g.stroke();
          }
          g.restore();
        }

        // Start marker (star) and brush head (filled circle with ring)
        const sp = centre(level.start);
        star(sp.x, sp.y, cell * 0.3);
        g.fillStyle = PALETTE.yellow;
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = PALETTE.ink;
        g.setLineDash([]);
        g.stroke();
        const hp = centre(head(state));
        if (state.path.length > 1) {
          g.beginPath();
          g.arc(hp.x, hp.y, cell * 0.24, 0, Math.PI * 2);
          g.fillStyle = PALETTE.orange;
          g.fill();
          g.lineWidth = 3;
          g.strokeStyle = PALETTE.ink;
          g.stroke();
        } else {
          g.beginPath();
          g.arc(hp.x, hp.y, cell * 0.38, 0, Math.PI * 2);
          g.lineWidth = 3;
          g.strokeStyle = PALETTE.orange;
          g.stroke();
        }
        g.restore();

        // Bottom buttons
        button(L.restartBtn, "Restart");
        button(L.undoBtn, "Undo", state.path.length > 1);

        // Level complete overlay
        if (winAge >= 0) {
          const a = ctx.prefersReducedMotion ? 1 : Math.min(1, winAge / 250);
          g.save();
          g.globalAlpha = 0.6 * a;
          g.fillStyle = PALETTE.black;
          g.fillRect(0, 0, width, height);
          g.globalAlpha = a;
          const lift = ctx.prefersReducedMotion ? 0 : (1 - a) * 16;
          g.translate(0, lift);
          roundRect(L.card.x, L.card.y, L.card.w, L.card.h, 20);
          g.fillStyle = PALETTE.paper;
          g.fill();
          g.lineWidth = 4;
          g.strokeStyle = PALETTE.ink;
          g.stroke();
          g.fillStyle = PALETTE.ink;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = `800 26px ${FONT}`;
          g.fillText("Level complete!", L.card.x + L.card.w / 2, L.card.y + 50);
          g.font = `500 15px ${FONT}`;
          g.fillText(
            levelIndex >= LEVEL_COUNT - 1
              ? "That was the last level."
              : `${state.openCount} cells painted in one stroke.`,
            L.card.x + L.card.w / 2,
            L.card.y + 88,
          );
          button(
            L.nextBtn,
            levelIndex >= LEVEL_COUNT - 1 ? "Play again" : "Next level",
            true,
            true,
          );
          g.restore();
        }
      };

      const loadLevel = (idx: number) => {
        levelIndex = idx;
        state = createState(LEVELS[idx]!);
        winAge = -1;
        pressing = false;
        lastPoint = null;
        progress = { ...progress, currentLevel: idx };
        save();
      };

      const applyStep = (cell: number, fromDrag: boolean) => {
        const r = step(state, cell);
        if (r.result === "extended") {
          state = r.state;
          ctx.audio.play("move");
          ctx.haptics.impact("light");
        } else if (r.result === "backtracked") {
          state = r.state;
          ctx.audio.play("tap");
        } else if (r.result === "blocked" && !fromDrag) {
          blockedFlash = 260;
          ctx.audio.play("fail");
        }
        if (r.result !== "none" && r.result !== "blocked" && isWon(state)) {
          winAge = 0;
          pressing = false;
          const done = levelIndex + 1;
          progress = {
            bestLevel: Math.max(progress.bestLevel, done),
            currentLevel: done >= LEVEL_COUNT ? 0 : done,
          };
          save();
          ctx.audio.play("win");
          ctx.haptics.impact("medium");
          ctx.events.levelComplete(done);
        }
      };

      /** Visit every cell the pointer crossed since the last sample (handles fast drags). */
      const dragTo = (x: number, y: number) => {
        if (lastPoint) {
          const dx = x - lastPoint.x;
          const dy = y - lastPoint.y;
          const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
          let prev = -2;
          for (let k = 1; k <= n; k++) {
            const c = cellAt(lastPoint.x + (dx * k) / n, lastPoint.y + (dy * k) / n);
            if (c >= 0 && c !== prev) {
              applyStep(c, true);
              prev = c;
            }
          }
        }
        lastPoint = { x, y };
      };

      disposePointer = onPointer(canvas, {
        down: (p) => {
          if (paused) return;
          const L = layout();
          if (winAge >= 0) {
            if (inRect(L.nextBtn, p.x, p.y)) {
              ctx.audio.play("tap");
              loadLevel(levelIndex + 1 >= LEVEL_COUNT ? 0 : levelIndex + 1);
              draw();
            }
            return;
          }
          if (inRect(L.backBtn, p.x, p.y)) {
            ctx.exit();
            return;
          }
          if (inRect(L.restartBtn, p.x, p.y)) {
            state = restart(state);
            ctx.audio.play("tap");
            draw();
            return;
          }
          if (inRect(L.undoBtn, p.x, p.y)) {
            if (state.path.length > 1) {
              state = undo(state);
              ctx.audio.play("tap");
            }
            draw();
            return;
          }
          const c = cellAt(p.x, p.y);
          if (c >= 0) {
            pressing = true;
            lastPoint = { x: p.x, y: p.y };
            applyStep(c, false);
            draw();
          }
        },
        move: (p) => {
          if (paused || !pressing || winAge >= 0) return;
          dragTo(p.x, p.y);
          draw();
        },
        up: () => {
          pressing = false;
          lastPoint = null;
        },
      });

      disposeResize = ctx.viewport.onResize(() => {
        resize();
        draw();
      });

      loop = createLoop((dt) => {
        if (winAge >= 0) winAge += dt;
        if (blockedFlash > 0) blockedFlash = Math.max(0, blockedFlash - dt);
        draw();
      });
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
      loop = null;
      disposePointer = null;
      disposeResize = null;
    },
  };
};

export default factory;
