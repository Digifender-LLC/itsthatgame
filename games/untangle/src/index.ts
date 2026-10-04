// Untangle: drag the nodes until no two lines cross. All visuals are drawn procedurally on
// a 2D canvas; node positions are stored normalized (0..1) so the board scales to any size.
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
  commitMove,
  createState,
  crossingPairs,
  intersectionPoint,
  moveNode,
  nodeAt,
  restart,
  undo,
  type Point,
  type UntangleState,
} from "./logic";

export const SLUG = "untangle";

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
      let state: UntangleState = createState(LEVELS[levelIndex]!);
      let dragging = -1;
      let dragOffset: Point = { x: 0, y: 0 };
      let dragFrom: Point = { x: 0, y: 0 };
      let winAge = -1; // ms since solved; -1 while playing

      const save = () => {
        if (destroyed) return;
        void ctx.storage.set("progress", progress).catch(() => {});
      };

      const layout = () => {
        const { width, height, safeArea } = ctx.viewport;
        const top = safeArea.top;
        const pad = 16 + Math.max(safeArea.left, safeArea.right);
        const btnH = MIN_TARGET;
        const btnY = height - safeArea.bottom - 16 - btnH;
        const btnW = Math.min(150, (width - pad * 2 - 12) / 2);
        const gy0 = top + 56 + 34;
        const aw = width - pad * 2;
        const ah = btnY - 16 - gy0;
        const size = Math.max(60, Math.min(aw, ah, 720));
        const board: Rect = {
          x: (width - size) / 2,
          y: gy0 + Math.max(0, (ah - size) / 2),
          w: size,
          h: size,
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
        const nodeR = Math.max(9, Math.min(16, size / 24));
        // Hit radius is at least 24 CSS px so every node has a >= 44 px touch target.
        const hitR = Math.max(24, nodeR + 8);
        return {
          width,
          height,
          top,
          pad,
          board,
          restartBtn,
          undoBtn,
          backBtn,
          card,
          nextBtn,
          nodeR,
          hitR,
        };
      };

      const toScreen = (L: ReturnType<typeof layout>, p: Point): Point => ({
        x: L.board.x + p.x * L.board.w,
        y: L.board.y + p.y * L.board.h,
      });

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
        const { width, height, board } = L;
        const level = state.level;
        const pairs = crossingPairs(level.edges, state.pos);
        const bad = new Set<number>();
        for (const [i, j] of pairs) {
          bad.add(i);
          bad.add(j);
        }
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
        g.font = `700 16px ${FONT}`;
        g.fillStyle = pairs.length === 0 ? PALETTE.green : PALETTE.vermillion;
        g.fillText(
          pairs.length === 0 ? "No crossings" : `Crossings: ${pairs.length}`,
          width / 2,
          L.top + 66,
        );
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
        roundRect(board.x, board.y, board.w, board.h, 14);
        g.fillStyle = "#EDE6D4";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = PALETTE.muted;
        g.stroke();

        const pts = state.pos.map((p) => toScreen(L, p));

        // Edges: clean ones solid blue; crossing ones dashed vermillion and thicker.
        g.lineCap = "round";
        level.edges.forEach((e, k) => {
          const a = pts[e[0]]!;
          const b = pts[e[1]]!;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          if (bad.has(k)) {
            g.setLineDash([10, 7]);
            g.lineWidth = 4;
            g.strokeStyle = PALETTE.vermillion;
          } else {
            g.setLineDash([]);
            g.lineWidth = 3.5;
            g.strokeStyle = PALETTE.blue;
          }
          g.stroke();
        });
        g.setLineDash([]);

        // Crossing markers (diamond outline) at each intersection
        g.lineWidth = 2.5;
        g.strokeStyle = PALETTE.ink;
        for (const [i, j] of pairs) {
          const ei = level.edges[i]!;
          const ej = level.edges[j]!;
          const ip = intersectionPoint(pts[ei[0]]!, pts[ei[1]]!, pts[ej[0]]!, pts[ej[1]]!);
          if (!ip) continue;
          g.beginPath();
          g.moveTo(ip.x, ip.y - 6);
          g.lineTo(ip.x + 6, ip.y);
          g.lineTo(ip.x, ip.y + 6);
          g.lineTo(ip.x - 6, ip.y);
          g.closePath();
          g.fillStyle = PALETTE.yellow;
          g.fill();
          g.stroke();
        }

        // Nodes
        pts.forEach((p, i) => {
          const active = i === dragging;
          const r = active ? L.nodeR * 1.25 : L.nodeR;
          g.beginPath();
          g.arc(p.x, p.y, r, 0, Math.PI * 2);
          g.fillStyle = active ? PALETTE.orange : PALETTE.sky;
          g.fill();
          g.lineWidth = active ? 4 : 3;
          g.strokeStyle = PALETTE.ink;
          g.stroke();
          // inner dot so nodes read as handles
          g.beginPath();
          g.arc(p.x, p.y, r * 0.3, 0, Math.PI * 2);
          g.fillStyle = PALETTE.ink;
          g.fill();
        });

        button(L.restartBtn, "Restart", state.history.length > 0 || dragging >= 0);
        button(L.undoBtn, "Undo", state.history.length > 0);

        if (winAge >= 0) {
          const a = ctx.prefersReducedMotion ? 1 : Math.min(1, winAge / 250);
          g.save();
          g.globalAlpha = 0.6 * a;
          g.fillStyle = PALETTE.black;
          g.fillRect(0, 0, width, height);
          g.globalAlpha = a;
          g.translate(0, ctx.prefersReducedMotion ? 0 : (1 - a) * 16);
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
          g.fillText("Untangled!", L.card.x + L.card.w / 2, L.card.y + 50);
          g.font = `500 15px ${FONT}`;
          g.fillText(
            levelIndex >= LEVEL_COUNT - 1
              ? "That was the last level."
              : `${level.nodeCount} nodes, zero crossings.`,
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
        dragging = -1;
        progress = { ...progress, currentLevel: idx };
        save();
      };

      const finishDrag = () => {
        if (dragging < 0) return;
        state = commitMove(state, dragging, dragFrom);
        dragging = -1;
        ctx.audio.play("pop");
        if (crossingPairs(state.level.edges, state.pos).length === 0) {
          winAge = 0;
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
            dragging = -1;
            ctx.audio.play("tap");
            draw();
            return;
          }
          if (inRect(L.undoBtn, p.x, p.y)) {
            if (state.history.length > 0) {
              state = undo(state);
              ctx.audio.play("tap");
            }
            draw();
            return;
          }
          // Pick the nearest node within the hit radius (screen space).
          const screen = state.pos.map((q) => toScreen(L, q));
          const idx = nodeAt(screen, p, L.hitR);
          if (idx >= 0) {
            dragging = idx;
            dragFrom = { ...state.pos[idx]! };
            const np = screen[idx]!;
            dragOffset = { x: np.x - p.x, y: np.y - p.y };
            ctx.audio.play("tap");
            draw();
          }
        },
        move: (p) => {
          if (paused || dragging < 0 || winAge >= 0) return;
          const L = layout();
          state = moveNode(state, dragging, {
            x: (p.x + dragOffset.x - L.board.x) / L.board.w,
            y: (p.y + dragOffset.y - L.board.y) / L.board.h,
          });
          draw();
        },
        up: () => {
          finishDrag();
          draw();
        },
      });

      disposeResize = ctx.viewport.onResize(() => {
        resize();
        draw();
      });

      loop = createLoop((dt) => {
        if (winAge >= 0) winAge += dt;
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
