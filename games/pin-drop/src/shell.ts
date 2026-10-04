// Shared game shell: lifecycle, HUD, overlays, progress persistence (LLD §1, FR-GAME-1).
// Each game package keeps its own copy (games import only from @itg/game-sdk), so keep the
// three copies identical; game-specific behavior lives in the Controller.
import {
  createCanvas,
  createLoop,
  onPointer,
  type GameContext,
  type GameFactory,
  type GameModule,
  type PointerPoint,
} from "@itg/game-sdk";

export interface Progress {
  currentLevel: number;
  bestLevel: number;
}

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Env {
  audio: GameContext["audio"];
  haptics: GameContext["haptics"];
  reducedMotion: boolean;
}

export type Status = "playing" | "won" | "lost";

export interface Controller {
  /** Load level `index` (0-based) fresh. */
  loadLevel(index: number): void;
  restart(): void;
  undo(): void;
  canUndo(): boolean;
  status(): Status;
  /** True while an animation is running (input ignored, overlays deferred). */
  busy(): boolean;
  lostMessage(): string;
  update(dtMs: number): void;
  draw(g: CanvasRenderingContext2D, area: Area, nowMs: number): void;
  tap(p: PointerPoint, area: Area): void;
}

export interface Theme {
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  buttonFill: string;
}

export interface ShellConfig {
  slug: string;
  title: string;
  levelCount: number;
  theme: Theme;
  create(env: Env): Controller;
}

export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const HUD_H = 56;
const MIN_TOUCH = 44;

export function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

interface Button {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  primary?: boolean;
}

function hit(b: Button, p: PointerPoint): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

export function createShell(cfg: ShellConfig): GameFactory {
  return (): GameModule => {
    let root: HTMLDivElement | null = null;
    let disposePointer: (() => void) | null = null;
    let disposeResize: (() => void) | null = null;
    let loop: ReturnType<typeof createLoop> | null = null;
    let paused = false;
    let destroyed = false;
    let hostCtx: GameContext | null = null;
    let controller: Controller | null = null;
    let g2d: CanvasRenderingContext2D | null = null;
    let clock = 0;
    let level = 1; // 1-based
    let best = 0;
    let resolved = false; // win/lose side effects already fired for this attempt

    const clampLevel = (n: number) => Math.max(1, Math.min(cfg.levelCount, Math.floor(n) || 1));

    const save = (currentLevel = level) => {
      if (destroyed || !hostCtx) return;
      const value: Progress = { currentLevel, bestLevel: best };
      hostCtx.storage.set("progress", value).catch(() => {});
    };

    const load = (n: number) => {
      level = clampLevel(n);
      resolved = false;
      controller?.loadLevel(level - 1);
      save();
    };

    const layout = () => {
      const vp = hostCtx!.viewport;
      const sa = vp.safeArea;
      const left = sa.left;
      const right = vp.width - sa.right;
      const top = sa.top;
      const bottom = vp.height - sa.bottom;
      const hud: Area = { x: left, y: top, w: right - left, h: HUD_H };
      const play: Area = { x: left, y: top + HUD_H, w: right - left, h: bottom - top - HUD_H };
      return { vp, hud, play };
    };

    const hudButtons = (): Button[] => {
      const { hud } = layout();
      const bh = MIN_TOUCH;
      const by = hud.y + (HUD_H - bh) / 2;
      const rw = 80;
      const uw = 60;
      const restartX = hud.x + hud.w - 8 - rw;
      const undoX = restartX - 8 - uw;
      return [
        { id: "exit", label: "Back", x: hud.x + 8, y: by, w: 52, h: bh, enabled: true },
        {
          id: "undo",
          label: "Undo",
          x: undoX,
          y: by,
          w: uw,
          h: bh,
          enabled: !!controller?.canUndo(),
        },
        { id: "restart", label: "Restart", x: restartX, y: by, w: rw, h: bh, enabled: true },
      ];
    };

    const overlayButtons = (): Button[] => {
      const { play } = layout();
      const st = controller?.status();
      const cx = play.x + play.w / 2;
      const cy = play.y + play.h / 2;
      if (st === "won") {
        const last = level >= cfg.levelCount;
        return [
          {
            id: last ? "again" : "next",
            label: last ? "Play again" : "Next level",
            x: cx - 90,
            y: cy + 20,
            w: 180,
            h: 52,
            enabled: true,
            primary: true,
          },
        ];
      }
      if (st === "lost") {
        return [
          {
            id: "undo",
            label: "Undo",
            x: cx - 130,
            y: cy + 24,
            w: 120,
            h: 52,
            enabled: !!controller?.canUndo(),
          },
          {
            id: "restart",
            label: "Restart",
            x: cx + 10,
            y: cy + 24,
            w: 120,
            h: 52,
            enabled: true,
            primary: true,
          },
        ];
      }
      return [];
    };

    const overlayVisible = () => {
      const st = controller?.status();
      return (st === "won" || st === "lost") && !controller!.busy();
    };

    const afterStatusChange = () => {
      if (!controller || resolved || !hostCtx) return;
      const st = controller.status();
      if (st === "won") {
        resolved = true;
        best = Math.max(best, level);
        hostCtx.audio.play("win");
        hostCtx.haptics.impact("medium");
        hostCtx.events.levelComplete(level);
        // Resume point is the next level once this one is cleared.
        save(Math.min(level + 1, cfg.levelCount));
      } else if (st === "lost") {
        resolved = true;
        hostCtx.audio.play("fail");
      }
    };

    const doAction = (id: string) => {
      if (!controller || !hostCtx) return;
      switch (id) {
        case "exit":
          hostCtx.exit();
          break;
        case "undo":
          if (controller.canUndo()) {
            controller.undo();
            resolved = false;
            hostCtx.audio.play("move");
          }
          break;
        case "restart":
          controller.restart();
          resolved = false;
          hostCtx.audio.play("tap");
          break;
        case "next":
          hostCtx.audio.play("tap");
          load(level + 1);
          break;
        case "again":
          hostCtx.audio.play("tap");
          load(1);
          break;
      }
    };

    const drawButton = (g: CanvasRenderingContext2D, b: Button) => {
      const t = cfg.theme;
      g.save();
      g.globalAlpha = b.enabled ? 1 : 0.4;
      roundRectPath(g, b.x, b.y, b.w, b.h, 12);
      g.fillStyle = b.primary ? t.accent : t.buttonFill;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = t.muted;
      g.stroke();
      g.fillStyle = b.primary ? t.accentText : t.text;
      g.font = `600 ${b.h >= 52 ? 18 : 14}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      g.restore();
    };

    const draw = () => {
      if (!g2d || !controller || !hostCtx) return;
      const g = g2d;
      const { vp, hud, play } = layout();
      const t = cfg.theme;
      g.fillStyle = t.bg;
      g.fillRect(0, 0, vp.width, vp.height);
      controller.draw(g, play, clock);
      // HUD
      g.fillStyle = t.panel;
      g.fillRect(hud.x, hud.y, hud.w, hud.h);
      g.fillStyle = t.text;
      g.font = `700 18px ${FONT}`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(`Level ${level}`, hud.x + 68, hud.y + HUD_H / 2 - 7);
      g.fillStyle = t.muted;
      g.font = `500 12px ${FONT}`;
      g.fillText(`of ${cfg.levelCount}`, hud.x + 68, hud.y + HUD_H / 2 + 12);
      for (const b of hudButtons()) drawButton(g, b);
      if (overlayVisible()) {
        const st = controller.status();
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.fillRect(play.x, play.y, play.w, play.h);
        const cw = Math.min(play.w - 32, 300);
        const ch = 190;
        const cx = play.x + play.w / 2;
        const cy = play.y + play.h / 2;
        roundRectPath(g, cx - cw / 2, cy - ch / 2 - 20, cw, ch, 20);
        g.fillStyle = t.panel;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = t.accent;
        g.stroke();
        g.fillStyle = t.text;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `700 22px ${FONT}`;
        if (st === "won") {
          const last = level >= cfg.levelCount;
          g.fillText(last ? "All levels cleared!" : `Level ${level} complete!`, cx, cy - 50);
          g.font = `500 15px ${FONT}`;
          g.fillStyle = t.muted;
          g.fillText(last ? "You finished every level." : "Nicely done.", cx, cy - 18);
        } else {
          g.fillText("Stuck", cx, cy - 50);
          g.font = `500 15px ${FONT}`;
          g.fillStyle = t.muted;
          g.fillText(controller.lostMessage(), cx, cy - 18);
        }
        for (const b of overlayButtons()) drawButton(g, b);
      }
    };

    const onTap = (p: PointerPoint) => {
      if (destroyed || paused || !controller || !hostCtx) return;
      for (const b of hudButtons()) {
        if (b.enabled && hit(b, p)) {
          doAction(b.id);
          draw();
          return;
        }
      }
      if (overlayVisible()) {
        for (const b of overlayButtons()) {
          if (b.enabled && hit(b, p)) {
            doAction(b.id);
            draw();
            return;
          }
        }
        return;
      }
      const { play } = layout();
      if (p.y < play.y) return;
      controller.tap(p, play);
      afterStatusChange();
      draw();
    };

    return {
      slug: cfg.slug,
      async mount(container: HTMLElement, ctx: GameContext) {
        hostCtx = ctx;
        root = document.createElement("div");
        root.style.cssText = "position:absolute;inset:0;overflow:hidden;user-select:none";
        root.setAttribute("role", "application");
        root.setAttribute("aria-label", cfg.title);
        container.appendChild(root);
        const { canvas, ctx: g, resize } = createCanvas(root, ctx.viewport);
        g2d = g;
        controller = cfg.create({
          audio: ctx.audio,
          haptics: ctx.haptics,
          reducedMotion: ctx.prefersReducedMotion,
        });
        let saved: Partial<Progress> | undefined;
        try {
          saved = await ctx.storage.get<Partial<Progress>>("progress");
        } catch {
          saved = undefined;
        }
        if (destroyed) return;
        best = Math.max(0, Math.min(cfg.levelCount, Math.floor(Number(saved?.bestLevel)) || 0));
        level = clampLevel(Number(saved?.currentLevel) || 1);
        load(level);
        disposePointer = onPointer(canvas, { down: onTap });
        disposeResize = ctx.viewport.onResize(() => {
          if (destroyed) return;
          resize();
          draw();
        });
        loop = createLoop((dt) => {
          clock += dt;
          controller?.update(dt);
          afterStatusChange();
          draw();
        });
        draw();
      },
      start() {
        loop?.start();
      },
      pause() {
        if (paused || destroyed) return;
        paused = true;
        loop?.pause();
      },
      resume() {
        if (!paused || destroyed) return;
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
        controller = null;
        g2d = null;
        hostCtx = null;
      },
    };
  };
}
