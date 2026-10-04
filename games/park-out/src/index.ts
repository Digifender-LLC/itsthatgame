// Park Out (TDD §8): a sliding-block unblock puzzle on a 6x6 lot. Drag vehicles along their
// axis (or select one and use the arrow buttons) to clear a path for the marked vehicle.
// Rules and the solver live in logic.ts; levels in levels.ts. This file renders and wires input.
import {
  createCanvas,
  createLoop,
  onPointer,
  PALETTE,
  PIECE_COLORS,
  type GameContext,
  type GameFactory,
  type GameModule,
} from "@itg/game-sdk";
import { LEVELS } from "./levels";
import {
  SIZE,
  moveCount,
  newPuzzle,
  nudge,
  occupancy,
  posOf,
  replay,
  reset,
  slideRange,
  slideTo,
  undo,
  isSolved,
  type Puzzle,
} from "./logic";

export const SLUG = "park-out";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Progress {
  /** Highest level index the player may open. */
  unlocked: number;
  /** Best (lowest) move count per level id. */
  bests: Record<string, number>;
  /** Level index to resume on. */
  level: number;
}

interface Current {
  level: number;
  slides: [number, number][];
}

interface Drag {
  v: number;
  /** Pointer offset inside the vehicle along its axis, in cells. */
  grab: number;
  start: number;
  pos: number;
  min: number;
  max: number;
  moved: boolean;
}

const BTN_H = 48;
/** Glyph per vehicle style so colour is never the only cue (NFR-4). */
const STYLES: { color: string; glyph: string }[] = [
  { color: PIECE_COLORS[0], glyph: "●" },
  { color: PIECE_COLORS[1], glyph: "▲" },
  { color: PIECE_COLORS[2], glyph: "■" },
  { color: PIECE_COLORS[3], glyph: "◆" },
  { color: PIECE_COLORS[4], glyph: "✚" },
  { color: PIECE_COLORS[6], glyph: "⬟" },
];
const TARGET_STYLE = { color: PALETTE.vermillion, glyph: "★" };
const LOT = "#3A3946";

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

function isProgress(v: unknown): v is Progress {
  if (!v || typeof v !== "object") return false;
  const p = v as Progress;
  return (
    Number.isInteger(p.unlocked) &&
    Number.isInteger(p.level) &&
    !!p.bests &&
    typeof p.bests === "object"
  );
}

function isCurrent(v: unknown): v is Current {
  if (!v || typeof v !== "object") return false;
  const c = v as Current;
  return (
    Number.isInteger(c.level) &&
    Array.isArray(c.slides) &&
    c.slides.every(
      (s) => Array.isArray(s) && s.length === 2 && Number.isInteger(s[0]) && Number.isInteger(s[1]),
    )
  );
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

      const storedProgress = await ctx.storage.get<unknown>("progress");
      const storedCurrent = await ctx.storage.get<unknown>("current");
      if (destroyed) return;

      const clampLevel = (n: number) => Math.max(0, Math.min(LEVELS.length - 1, n));
      const progress: Progress = isProgress(storedProgress)
        ? {
            unlocked: clampLevel(storedProgress.unlocked),
            level: clampLevel(storedProgress.level),
            bests: { ...storedProgress.bests },
          }
        : { unlocked: 0, level: 0, bests: {} };
      progress.level = Math.min(progress.level, progress.unlocked);

      const save = (key: string, value: unknown) => {
        ctx.storage.set(key, value).catch(() => {});
      };

      let level = progress.level;
      let puzzle: Puzzle = newPuzzle(LEVELS[level]!.rows);
      let selected = -1;
      let drag: Drag | null = null;
      let display: number[] = puzzle.vehicles.map(posOf);
      let winMs = -1; // -1 = not solved; otherwise ms since solving
      let pressed: string | null = null;

      const saveCurrent = () => {
        const c: Current = { level, slides: puzzle.history.map((s) => [s.v, s.to]) };
        save("current", c);
      };

      const loadLevel = (idx: number, slides: [number, number][] = []) => {
        level = clampLevel(idx);
        const p = replay(LEVELS[level]!.rows, slides) ?? newPuzzle(LEVELS[level]!.rows);
        puzzle = p;
        selected = -1;
        drag = null;
        winMs = -1;
        display = puzzle.vehicles.map(posOf);
        progress.level = level;
        save("progress", progress);
        saveCurrent();
      };

      // Resume the saved in-progress level, if consistent with saved progress.
      if (isCurrent(storedCurrent) && storedCurrent.level === level) {
        const p = replay(LEVELS[level]!.rows, storedCurrent.slides);
        if (p && !isSolved(p.vehicles)) {
          puzzle = p;
          display = puzzle.vehicles.map(posOf);
        }
      }

      const layout = () => {
        const { width, height, safeArea } = ctx.viewport;
        const top = safeArea.top + 8;
        const bottom = safeArea.bottom + 12;
        const headerH = 44;
        const statsH = 26;
        const controlsH = BTN_H * 2 + 8 + 12;
        const size = Math.floor(
          Math.max(
            180,
            Math.min(width - 40, height - top - headerH - statsH - controlsH - bottom, 520),
          ),
        );
        const cell = size / SIZE;
        const boardX = Math.round((width - size) / 2);
        const boardY = top + headerH + statsH;
        const navW = 48;
        const prev: Rect = { x: boardX, y: top, w: navW, h: headerH };
        const next: Rect = { x: boardX + size - navW, y: top, w: navW, h: headerH };
        const half = (size - 8) / 2;
        const ctlY = boardY + size + 12;
        const back: Rect = { x: boardX, y: ctlY, w: half, h: BTN_H };
        const fwd: Rect = { x: boardX + half + 8, y: ctlY, w: half, h: BTN_H };
        const undoB: Rect = { x: boardX, y: ctlY + BTN_H + 8, w: half, h: BTN_H };
        const restartB: Rect = { x: boardX + half + 8, y: ctlY + BTN_H + 8, w: half, h: BTN_H };
        const ow = Math.min(width - 48, 300);
        const ox = (width - ow) / 2;
        const oy = boardY + size / 2 - 90;
        const retry: Rect = { x: ox + 16, y: oy + 150, w: (ow - 48) / 2, h: BTN_H };
        const nextB: Rect = { x: ox + 32 + (ow - 48) / 2, y: oy + 150, w: (ow - 48) / 2, h: BTN_H };
        return {
          width,
          height,
          top,
          size,
          cell,
          boardX,
          boardY,
          prev,
          next,
          back,
          fwd,
          undoB,
          restartB,
          overlay: { x: ox, y: oy, w: ow, h: 220 } as Rect,
          retry,
          nextB,
        };
      };

      const button = (r: Rect, label: string, opts: { primary?: boolean; off?: boolean } = {}) => {
        g.globalAlpha = opts.off ? 0.4 : 1;
        roundRect(g, r, 10);
        g.fillStyle = opts.primary ? PALETTE.ink : PALETTE.paper;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = PALETTE.ink;
        g.stroke();
        g.fillStyle = opts.primary ? PALETTE.paper : PALETTE.ink;
        g.font = "600 17px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
        g.globalAlpha = 1;
      };

      const vehicleRect = (i: number, pos: number, L: ReturnType<typeof layout>): Rect => {
        const v = puzzle.vehicles[i]!;
        const inset = 3;
        return v.horizontal
          ? {
              x: L.boardX + pos * L.cell + inset,
              y: L.boardY + v.y * L.cell + inset,
              w: v.len * L.cell - inset * 2,
              h: L.cell - inset * 2,
            }
          : {
              x: L.boardX + v.x * L.cell + inset,
              y: L.boardY + pos * L.cell + inset,
              w: L.cell - inset * 2,
              h: v.len * L.cell - inset * 2,
            };
      };

      const styleOf = (i: number) => {
        const v = puzzle.vehicles[i]!;
        if (v.target) return TARGET_STYLE;
        return STYLES[(i - 1) % STYLES.length]!;
      };

      const exitOffset = () => {
        if (winMs < 0 || reduced) return 0;
        return Math.min(1, winMs / 400) * 2.6;
      };

      const draw = () => {
        const L = layout();
        const { width, height, cell } = L;
        g.fillStyle = PALETTE.paper;
        g.fillRect(0, 0, width, height);

        // Header: level navigation.
        const canPrev = level > 0;
        const canNext = level < progress.unlocked;
        button(L.prev, "‹", { off: !canPrev });
        button(L.next, "›", { off: !canNext });
        g.fillStyle = PALETTE.ink;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = "700 22px system-ui, sans-serif";
        g.fillText(`Level ${level + 1} / ${LEVELS.length}`, width / 2, L.top + 22);

        // Stats.
        const moves = moveCount(puzzle.history);
        const bestMoves = progress.bests[String(LEVELS[level]!.id)];
        g.font = "600 15px system-ui, sans-serif";
        g.fillText(
          `Moves ${moves}   Target ${LEVELS[level]!.optimal}` +
            (bestMoves ? `   Best ${bestMoves}` : ""),
          width / 2,
          L.top + 44 + 13,
        );

        // Lot.
        const lot: Rect = { x: L.boardX, y: L.boardY, w: L.size, h: L.size };
        roundRect(g, lot, 10);
        g.fillStyle = LOT;
        g.fill();
        g.strokeStyle = "rgba(250,247,240,0.14)";
        g.lineWidth = 1;
        for (let k = 1; k < SIZE; k++) {
          g.beginPath();
          g.moveTo(L.boardX + k * cell, L.boardY);
          g.lineTo(L.boardX + k * cell, L.boardY + L.size);
          g.moveTo(L.boardX, L.boardY + k * cell);
          g.lineTo(L.boardX + L.size, L.boardY + k * cell);
          g.stroke();
        }
        // Exit gate on the right edge of the target's row.
        const target = puzzle.vehicles[0]!;
        g.fillStyle = PALETTE.green;
        g.fillRect(L.boardX + L.size - 3, L.boardY + target.y * cell + 4, 6, cell - 8);
        g.fillStyle = PALETTE.green;
        g.font = "700 18px system-ui, sans-serif";
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText("▶", L.boardX + L.size + 3, L.boardY + target.y * cell + cell / 2);

        // Vehicles (clipped to the lot so the winning exit slides out of sight).
        g.save();
        g.beginPath();
        g.rect(0, L.boardY, L.boardX + L.size + 40, L.size);
        g.clip();
        puzzle.vehicles.forEach((v, i) => {
          let pos = display[i]!;
          if (drag && drag.v === i) pos = drag.pos;
          if (v.target) pos += exitOffset();
          const r = vehicleRect(i, pos, L);
          const st = styleOf(i);
          roundRect(g, r, cell * 0.2);
          g.fillStyle = st.color;
          g.fill();
          g.lineWidth = selected === i ? 4 : 2;
          g.strokeStyle = selected === i ? PALETTE.paper : PALETTE.ink;
          g.stroke();
          if (selected === i) {
            g.lineWidth = 2;
            g.strokeStyle = PALETTE.blue;
            roundRect(g, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, cell * 0.24);
            g.stroke();
          }
          // Glyph in the middle, direction marks at the ends.
          g.fillStyle = PALETTE.ink;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = `700 ${Math.round(cell * 0.4)}px system-ui, sans-serif`;
          g.fillText(st.glyph, r.x + r.w / 2, r.y + r.h / 2);
          g.globalAlpha = 0.55;
          g.font = `700 ${Math.round(cell * 0.24)}px system-ui, sans-serif`;
          const a = v.horizontal ? "◂" : "▴";
          const b = v.horizontal ? "▸" : "▾";
          if (v.horizontal) {
            g.fillText(a, r.x + cell * 0.2, r.y + r.h / 2);
            g.fillText(b, r.x + r.w - cell * 0.2, r.y + r.h / 2);
          } else {
            g.fillText(a, r.x + r.w / 2, r.y + cell * 0.2);
            g.fillText(b, r.x + r.w / 2, r.y + r.h - cell * 0.2);
          }
          g.globalAlpha = 1;
        });
        g.restore();

        // Controls.
        const sel = selected >= 0 ? puzzle.vehicles[selected] : undefined;
        let canBack = false;
        let canFwd = false;
        if (sel && !isSolved(puzzle.vehicles)) {
          const range = slideRange(puzzle.vehicles, selected);
          const p = posOf(sel);
          canBack = range.min < p;
          canFwd = range.max > p;
        }
        const backLabel = sel ? (sel.horizontal ? "◀ Left" : "▲ Up") : "◀ ▲";
        const fwdLabel = sel ? (sel.horizontal ? "Right ▶" : "Down ▼") : "▶ ▼";
        button(L.back, backLabel, { off: !canBack });
        button(L.fwd, fwdLabel, { off: !canFwd });
        button(L.undoB, "Undo", { off: puzzle.history.length === 0 });
        button(L.restartB, "Restart");
        if (!sel && winMs < 0) {
          g.fillStyle = PALETTE.muted;
          g.font = "500 13px system-ui, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(
            "Drag a vehicle, or tap one then use the arrows",
            width / 2,
            L.restartB.y + BTN_H + 16,
          );
        }

        // Completion overlay.
        if (winMs >= (reduced ? 0 : 450)) {
          g.fillStyle = "rgba(27,27,31,0.55)";
          g.fillRect(0, 0, width, height);
          roundRect(g, L.overlay, 16);
          g.fillStyle = PALETTE.paper;
          g.fill();
          g.lineWidth = 3;
          g.strokeStyle = PALETTE.ink;
          g.stroke();
          g.fillStyle = PALETTE.ink;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = "700 28px system-ui, sans-serif";
          g.fillText("Level clear", width / 2, L.overlay.y + 36);
          const optimal = LEVELS[level]!.optimal;
          g.font = "600 18px system-ui, sans-serif";
          g.fillText(`Moves ${moves}   Target ${optimal}`, width / 2, L.overlay.y + 74);
          g.font = "700 18px system-ui, sans-serif";
          g.fillStyle = moves <= optimal ? PALETTE.green : PALETTE.ink;
          g.fillText(
            moves <= optimal ? "★ Perfect: optimal solution" : `Optimal is ${optimal}`,
            width / 2,
            L.overlay.y + 106,
          );
          button(L.retry, "Retry");
          button(L.nextB, level + 1 < LEVELS.length ? "Next" : "Replay", { primary: true });
          if (level + 1 >= LEVELS.length) {
            g.fillStyle = PALETTE.ink;
            g.font = "600 14px system-ui, sans-serif";
            g.fillText("All levels cleared", width / 2, L.overlay.y + 135);
          }
        }
      };

      const finishLevel = () => {
        const moves = moveCount(puzzle.history);
        const id = String(LEVELS[level]!.id);
        const prev = progress.bests[id];
        if (prev === undefined || moves < prev) progress.bests[id] = moves;
        progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length - 1, level + 1));
        save("progress", progress);
        ctx.storage.remove("current").catch(() => {});
        ctx.audio.play("win");
        ctx.events.levelComplete(LEVELS[level]!.id);
        winMs = 0;
      };

      const afterSlide = () => {
        if (isSolved(puzzle.vehicles)) finishLevel();
        else saveCurrent();
      };

      const frame = (dtMs: number) => {
        // Ease displayed positions toward the logical ones (snap in reduced motion).
        puzzle.vehicles.forEach((v, i) => {
          const goal = posOf(v);
          const cur = display[i] ?? goal;
          const d = goal - cur;
          display[i] = reduced || Math.abs(d) < 0.01 ? goal : cur + d * Math.min(1, dtMs / 70);
        });
        if (winMs >= 0) winMs += dtMs;
        draw();
      };

      const cellOf = (p: { x: number; y: number }, L: ReturnType<typeof layout>) => ({
        cx: Math.floor((p.x - L.boardX) / L.cell),
        cy: Math.floor((p.y - L.boardY) / L.cell),
      });

      disposePointer = onPointer(canvas, {
        down: (p) => {
          const L = layout();
          pressed = null;
          const overlayOn = winMs >= (reduced ? 0 : 450);
          if (overlayOn) {
            if (inside(L.retry, p)) pressed = "retry";
            else if (inside(L.nextB, p)) pressed = "next";
            return;
          }
          if (winMs >= 0) return;
          const buttons: [string, Rect][] = [
            ["prev", L.prev],
            ["next", L.next],
            ["back", L.back],
            ["fwd", L.fwd],
            ["undo", L.undoB],
            ["restart", L.restartB],
          ];
          for (const [name, r] of buttons) if (inside(r, p)) pressed = name;
          if (pressed) return;
          const { cx, cy } = cellOf(p, L);
          if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return;
          const i = occupancy(puzzle.vehicles)[cy * SIZE + cx]!;
          if (i < 0) return;
          const v = puzzle.vehicles[i]!;
          const range = slideRange(puzzle.vehicles, i);
          const along = v.horizontal ? (p.x - L.boardX) / L.cell : (p.y - L.boardY) / L.cell;
          drag = {
            v: i,
            grab: along - posOf(v),
            start: posOf(v),
            pos: posOf(v),
            min: range.min,
            max: range.max,
            moved: false,
          };
        },
        move: (p) => {
          if (!drag) return;
          const L = layout();
          const v = puzzle.vehicles[drag.v]!;
          const along = v.horizontal ? (p.x - L.boardX) / L.cell : (p.y - L.boardY) / L.cell;
          drag.pos = Math.max(drag.min, Math.min(drag.max, along - drag.grab));
          if (Math.abs(drag.pos - drag.start) > 0.15) drag.moved = true;
        },
        up: (p) => {
          const L = layout();
          const d = drag;
          drag = null;
          const was = pressed;
          pressed = null;
          if (was) {
            const rects: Record<string, Rect> = {
              prev: L.prev,
              next: L.next,
              back: L.back,
              fwd: L.fwd,
              undo: L.undoB,
              restart: L.restartB,
              retry: L.retry,
            };
            const r = was === "next" && winMs >= 0 ? L.nextB : rects[was];
            if (!r || !inside(r, p)) return;
            if (winMs >= 0) {
              if (was === "retry") loadLevel(level);
              else if (was === "next") loadLevel(level + 1 < LEVELS.length ? level + 1 : 0);
              ctx.audio.play("tap");
              return;
            }
            switch (was) {
              case "prev":
                if (level > 0) loadLevel(level - 1);
                break;
              case "next":
                if (level < progress.unlocked) loadLevel(level + 1);
                break;
              case "back":
              case "fwd": {
                if (selected < 0) break;
                if (nudge(puzzle, selected, was === "back" ? -1 : 1)) {
                  ctx.audio.play("move");
                  ctx.haptics.impact("light");
                  afterSlide();
                } else ctx.audio.play("fail");
                break;
              }
              case "undo":
                if (undo(puzzle)) {
                  ctx.audio.play("tap");
                  saveCurrent();
                }
                break;
              case "restart":
                reset(puzzle);
                selected = -1;
                saveCurrent();
                ctx.audio.play("tap");
                break;
            }
            return;
          }
          if (!d || winMs >= 0) return;
          if (!d.moved) {
            selected = selected === d.v ? -1 : d.v;
            ctx.audio.play("tap");
            return;
          }
          const to = Math.round(d.pos);
          // Keep the dragged vehicle visually where it was dropped, then ease to the cell.
          display[d.v] = d.pos;
          selected = d.v;
          if (to !== d.start && slideTo(puzzle, d.v, to)) {
            ctx.audio.play("move");
            ctx.haptics.impact("light");
            afterSlide();
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
