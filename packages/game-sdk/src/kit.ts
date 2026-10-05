// Shared game shells (D13): the lifecycle, HUD, level map, win/lose cards, stars, best
// scores and celebration effects every game used to re-implement. A game supplies a
// controller with its rules and drawing; the shell does the rest.
//
//   createLevelGame — puzzle games with numbered levels, 1–3 stars and a level map.
//   createRunGame   — endless games with a score, a best score and "play again".
//
// Both satisfy the IF-5 lifecycle (LLD §1) and pass the conformance suite: all motion runs
// on the single createLoop() frame loop, so destroy() leaves nothing behind.
import {
  createCanvas,
  createLoop,
  onPointer,
  type GameContext,
  type GameFactory,
  type GameModule,
  type PointerPoint,
} from "./index";
import { Juice, clamp, ease, starPath } from "./juice";

export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const HUD_H = 60;
export const MIN_TOUCH = 44;

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Theme {
  bg: string;
  /** Optional second background colour for a vertical gradient. */
  bg2?: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  buttonFill: string;
  /** Star fill on win cards and the level map (default warm gold). */
  star?: string;
  /** Colours used for confetti and celebration bursts. */
  confetti?: readonly string[];
}

export interface Env {
  audio: GameContext["audio"];
  haptics: GameContext["haptics"];
  reducedMotion: boolean;
  /** Shared effects, drawn above the controller in canvas coordinates. */
  juice: Juice;
  theme: Theme;
}

export type Status = "playing" | "won" | "lost";

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

export function inside(a: Area, p: PointerPoint): boolean {
  return p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;
}

/** Relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Near-black or white, whichever contrasts more with the fill. */
export function inkFor(hex: string): string {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#101418" : "#FFFFFF";
}

/** Lighten (amount > 0) or darken (amount < 0) a #RRGGBB colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (v: number) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))
      .toString(16)
      .padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

export type IconName =
  "back" | "levels" | "undo" | "restart" | "hint" | "lock" | "play" | "next" | "close";

/** Simple stroked icons so the HUD needs no image assets. */
export function drawIcon(
  g: CanvasRenderingContext2D,
  name: IconName,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size / 2;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = Math.max(2, size / 9);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  switch (name) {
    case "back":
      g.moveTo(cx + s * 0.35, cy - s * 0.7);
      g.lineTo(cx - s * 0.35, cy);
      g.lineTo(cx + s * 0.35, cy + s * 0.7);
      g.stroke();
      break;
    case "next":
    case "play":
      g.moveTo(cx - s * 0.4, cy - s * 0.7);
      g.lineTo(cx + s * 0.6, cy);
      g.lineTo(cx - s * 0.4, cy + s * 0.7);
      g.closePath();
      g.fill();
      break;
    case "levels": {
      const c = s * 0.36;
      for (let r = -1; r <= 1; r += 2)
        for (let q = -1; q <= 1; q += 2) {
          roundRectPath(g, cx + q * c * 1.25 - c, cy + r * c * 1.25 - c, c * 2, c * 2, c * 0.5);
          g.fill();
        }
      break;
    }
    case "undo":
      g.arc(cx + s * 0.1, cy + s * 0.15, s * 0.55, Math.PI * 1.05, Math.PI * 0.45, false);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - s * 0.75, cy - s * 0.35);
      g.lineTo(cx - s * 0.45, cy + s * 0.2);
      g.lineTo(cx - s * 0.05, cy - s * 0.25);
      g.stroke();
      break;
    case "restart":
      g.arc(cx, cy, s * 0.6, -Math.PI * 0.35, Math.PI * 1.45, false);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + s * 0.15, cy - s * 0.95);
      g.lineTo(cx + s * 0.45, cy - s * 0.5);
      g.lineTo(cx - s * 0.05, cy - s * 0.35);
      g.stroke();
      break;
    case "hint":
      g.arc(cx, cy - s * 0.2, s * 0.5, Math.PI * 0.8, Math.PI * 2.2);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - s * 0.25, cy + s * 0.55);
      g.lineTo(cx + s * 0.25, cy + s * 0.55);
      g.moveTo(cx - s * 0.18, cy + s * 0.8);
      g.lineTo(cx + s * 0.18, cy + s * 0.8);
      g.stroke();
      break;
    case "lock":
      roundRectPath(g, cx - s * 0.55, cy - s * 0.1, s * 1.1, s * 0.85, s * 0.18);
      g.fill();
      g.beginPath();
      g.arc(cx, cy - s * 0.15, s * 0.35, Math.PI, 0);
      g.stroke();
      break;
    case "close":
      g.moveTo(cx - s * 0.5, cy - s * 0.5);
      g.lineTo(cx + s * 0.5, cy + s * 0.5);
      g.moveTo(cx + s * 0.5, cy - s * 0.5);
      g.lineTo(cx - s * 0.5, cy + s * 0.5);
      g.stroke();
      break;
  }
  g.restore();
}

// ---- Shared plumbing --------------------------------------------------------------

interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  label?: string;
  icon?: IconName;
  primary?: boolean;
}

const DEFAULT_STAR = "#FFC83D";
const DEFAULT_CONFETTI = ["#FFC83D", "#56B4E9", "#E69F00", "#009E73", "#CC79A7", "#F0E442"];

function drawBackground(g: CanvasRenderingContext2D, t: Theme, w: number, h: number): void {
  if (t.bg2) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, t.bg);
    grad.addColorStop(1, t.bg2);
    g.fillStyle = grad;
  } else {
    g.fillStyle = t.bg;
  }
  g.fillRect(0, 0, w, h);
}

function drawButton(
  g: CanvasRenderingContext2D,
  t: Theme,
  b: Button,
  pressed: boolean,
  alpha = 1,
): void {
  g.save();
  g.globalAlpha = (b.enabled ? 1 : 0.35) * alpha;
  const k = pressed ? 0.92 : 1;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const w = b.w * k;
  const h = b.h * k;
  const r = Math.min(14, h / 2);
  const fill = b.primary ? t.accent : t.buttonFill;
  // drop edge gives buttons a pressable, tactile look
  if (!pressed) {
    roundRectPath(g, cx - w / 2, cy - h / 2 + 3, w, h, r);
    g.fillStyle = shade(fill, -0.35);
    g.fill();
  }
  roundRectPath(g, cx - w / 2, cy - h / 2 + (pressed ? 2 : 0), w, h, r);
  g.fillStyle = fill;
  g.fill();
  const ink = b.primary ? t.accentText : t.text;
  const oy = pressed ? 2 : 0;
  if (b.icon && b.label) {
    drawIcon(g, b.icon, cx + w / 2 - 22, cy + oy, 18, ink);
    g.fillStyle = ink;
    g.font = `700 ${h >= 52 ? 19 : 15}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(b.label, cx - 10, cy + oy + 1);
  } else if (b.icon) {
    drawIcon(g, b.icon, cx, cy + oy, Math.min(22, h * 0.5), ink);
  } else if (b.label) {
    g.fillStyle = ink;
    g.font = `700 ${h >= 52 ? 19 : 15}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(b.label, cx, cy + oy + 1);
  }
  g.restore();
}

function drawStar(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  filled: boolean,
  color: string,
  emptyColor: string,
): void {
  starPath(g, cx, cy, r, r * 0.48);
  if (filled) {
    g.fillStyle = color;
    g.fill();
    g.lineWidth = Math.max(1.5, r / 7);
    g.strokeStyle = shade(color, -0.4);
    g.stroke();
  } else {
    g.fillStyle = emptyColor;
    g.fill();
  }
}

function hitButton(list: Button[], p: PointerPoint): Button | undefined {
  // generous hit slop: phones need it more than pixel precision
  const slop = 6;
  return list.find(
    (b) =>
      b.enabled &&
      p.x >= b.x - slop &&
      p.x <= b.x + b.w + slop &&
      p.y >= b.y - slop &&
      p.y <= b.y + b.h + slop,
  );
}

/** Cancels a button press when the finger slides this far. */
const DRAG_CANCEL_PX = 14;

interface Frame {
  vp: GameContext["viewport"];
  hud: Area;
  play: Area;
  full: Area;
}

function frameOf(vp: GameContext["viewport"]): Frame {
  const sa = vp.safeArea;
  const left = sa.left;
  const right = vp.width - sa.right;
  const top = sa.top;
  const bottom = vp.height - sa.bottom;
  return {
    vp,
    hud: { x: left, y: top, w: right - left, h: HUD_H },
    play: { x: left, y: top + HUD_H, w: right - left, h: bottom - top - HUD_H },
    full: { x: left, y: top, w: right - left, h: bottom - top },
  };
}

// ---- Level games -------------------------------------------------------------------

export interface LevelController {
  /** Load level `index` (0-based) fresh. */
  loadLevel(index: number): void;
  restart(): void;
  undo?(): void;
  canUndo?(): boolean;
  status(): Status;
  /** True while an animation runs; the win/lose card waits for it. */
  busy(): boolean;
  /** Shown on the "stuck" card. */
  lostMessage?(): string;
  update(dtMs: number): void;
  draw(g: CanvasRenderingContext2D, area: Area, nowMs: number): void;
  /** Finger down inside the play area. `tap` is accepted as an alias. */
  down?(p: PointerPoint, area: Area): void;
  tap?(p: PointerPoint, area: Area): void;
  move?(p: PointerPoint, area: Area): void;
  up?(p: PointerPoint, area: Area): void;
  /** Stars (1–3) earned for the level just won; default 3. */
  stars?(): number;
  /** Second HUD line, e.g. "Moves 4 · ★★★ ≤ 6". */
  hudInfo?(): string | undefined;
  /** Banner when a level starts, used to introduce a new mechanic. */
  intro?(index: number): string | undefined;
  /** Show a hint; return false when none is available. Enables the hint button. */
  hint?(): boolean;
}

export interface LevelProgress {
  /** 1-based level to resume. */
  currentLevel: number;
  /** Highest level cleared (0 = none). */
  bestLevel: number;
  /** Best stars per level, index 0 = level 1. */
  stars: number[];
}

export interface LevelGameConfig {
  slug: string;
  title: string;
  levelCount: number;
  theme: Theme;
  create(env: Env): LevelController;
  /** Named groups on the level map; `from` is 1-based and should start a row (1, 11, 21…). */
  worlds?: { name: string; from: number }[];
}

export function sanitizeLevelProgress(
  raw: Partial<LevelProgress> | undefined,
  levelCount: number,
): LevelProgress {
  const clampLevel = (n: number) => Math.max(1, Math.min(levelCount, Math.floor(n) || 1));
  const best = Math.max(0, Math.min(levelCount, Math.floor(Number(raw?.bestLevel)) || 0));
  const stars: number[] = [];
  for (let i = 0; i < levelCount; i++) {
    const v = Array.isArray(raw?.stars) ? Number(raw!.stars[i]) : 0;
    stars.push(Number.isFinite(v) ? clamp(Math.floor(v), 0, 3) : 0);
  }
  // Levels cleared before stars existed count as one star so the map is not empty.
  for (let i = 0; i < best; i++) if (stars[i] === 0) stars[i] = 1;
  const current = Math.min(clampLevel(Number(raw?.currentLevel) || 1), best + 1);
  return { currentLevel: current, bestLevel: best, stars };
}

type LevelScreen = "play" | "map";

export function createLevelGame(cfg: LevelGameConfig): GameFactory {
  return (): GameModule => {
    let root: HTMLDivElement | null = null;
    let disposers: (() => void)[] = [];
    let loop: ReturnType<typeof createLoop> | null = null;
    let paused = false;
    let destroyed = false;
    let host: GameContext | null = null;
    let ctl: LevelController | null = null;
    let juice: Juice | null = null;
    let g2d: CanvasRenderingContext2D | null = null;
    let clock = 0;
    let level = 1;
    let progress: LevelProgress = sanitizeLevelProgress(undefined, cfg.levelCount);
    let resolved = false;
    let screen: LevelScreen = "play";
    // win/lose card animation
    let cardT = -1; // ms since the card was scheduled; -1 = no card
    let earned = 0;
    let starsShown = 0;
    let newBest = false;
    // level-in fade and intro banner
    let fadeT = 0;
    let intro: string | undefined;
    let introT = 0;
    // pointer state
    let pressed: string | null = null;
    let pressStart: PointerPoint | null = null;
    let ctlGesture = false;
    // level map scrolling
    let mapScroll = 0;
    let mapVel = 0;
    let mapDrag: { y: number; scroll: number; moved: boolean; t: number } | null = null;

    const theme = cfg.theme;
    const starColor = theme.star ?? DEFAULT_STAR;
    const reduced = () => !!host?.prefersReducedMotion;
    const CARD_DELAY = () => (reduced() ? 0 : 380);
    const STAR_STEP = () => (reduced() ? 0 : 260);

    const save = () => {
      if (destroyed || !host) return;
      const value: LevelProgress = { ...progress, stars: [...progress.stars] };
      host.storage.set("progress", value).catch(() => {});
    };

    const unlocked = (n: number) => n <= progress.bestLevel + 1;

    const load = (n: number) => {
      level = clamp(Math.floor(n) || 1, 1, cfg.levelCount);
      resolved = false;
      cardT = -1;
      starsShown = 0;
      juice?.clear();
      ctl?.loadLevel(level - 1);
      progress.currentLevel = level;
      fadeT = reduced() ? 260 : 0;
      intro = ctl?.intro?.(level - 1);
      introT = 0;
      save();
    };

    const frame = () => frameOf(host!.viewport);

    const hudButtons = (): Button[] => {
      const { hud } = frame();
      const bh = MIN_TOUCH;
      const by = hud.y + (HUD_H - bh) / 2;
      const bw = 46;
      const list: Button[] = [
        { id: "exit", icon: "back", x: hud.x + 8, y: by, w: bw, h: bh, enabled: true },
      ];
      let x = hud.x + hud.w - 8 - bw;
      list.push({ id: "restart", icon: "restart", x, y: by, w: bw, h: bh, enabled: true });
      if (ctl?.undo) {
        x -= bw + 6;
        list.push({
          id: "undo",
          icon: "undo",
          x,
          y: by,
          w: bw,
          h: bh,
          enabled: !!ctl.canUndo?.() && ctl.status() === "playing",
        });
      }
      if (ctl?.hint) {
        x -= bw + 6;
        list.push({
          id: "hint",
          icon: "hint",
          x,
          y: by,
          w: bw,
          h: bh,
          enabled: ctl.status() === "playing" && !ctl.busy(),
        });
      }
      x -= bw + 6;
      list.push({ id: "map", icon: "levels", x, y: by, w: bw, h: bh, enabled: true });
      return list;
    };

    const cardRect = (): Area => {
      const { play } = frame();
      const w = Math.min(play.w - 32, 320);
      const h = 250;
      return { x: play.x + (play.w - w) / 2, y: play.y + (play.h - h) / 2 - 10, w, h };
    };

    const cardVisible = () => cardT >= CARD_DELAY();

    const cardButtons = (): Button[] => {
      if (!ctl || !cardVisible()) return [];
      const c = cardRect();
      const by = c.y + c.h - 72;
      const st = ctl.status();
      if (st === "won") {
        const last = level >= cfg.levelCount;
        return [
          {
            id: "replay",
            icon: "restart",
            x: c.x + 20,
            y: by,
            w: 56,
            h: 52,
            enabled: true,
          },
          {
            id: last ? "map" : "next",
            label: last ? "Levels" : "Next",
            icon: last ? "levels" : "next",
            x: c.x + 88,
            y: by,
            w: c.w - 108,
            h: 52,
            enabled: true,
            primary: true,
          },
        ];
      }
      if (st === "lost") {
        const half = (c.w - 52) / 2;
        return [
          {
            id: "undo",
            label: "Undo",
            x: c.x + 20,
            y: by,
            w: half,
            h: 52,
            enabled: !!ctl.canUndo?.(),
          },
          {
            id: "restart",
            label: "Retry",
            x: c.x + 32 + half,
            y: by,
            w: half,
            h: 52,
            enabled: true,
            primary: true,
          },
        ];
      }
      return [];
    };

    // ---- level map geometry
    const MAP_COLS = 5;
    const mapGeom = () => {
      const { full } = frame();
      const header = 64;
      const pad = 16;
      const gap = 10;
      const cell = Math.min(72, (full.w - pad * 2 - gap * (MAP_COLS - 1)) / MAP_COLS);
      const gridW = cell * MAP_COLS + gap * (MAP_COLS - 1);
      const left = full.x + (full.w - gridW) / 2;
      const worlds = cfg.worlds ?? [];
      // y offset of each level row, leaving room for world titles
      const rowsY: number[] = [];
      let y = 0;
      let row = -1;
      for (let i = 0; i < cfg.levelCount; i++) {
        const r = Math.floor(i / MAP_COLS);
        if (r !== row) {
          if (worlds.some((w) => w.from - 1 >= i && w.from - 1 < i + MAP_COLS)) y += 34;
          rowsY[r] = y;
          y += cell + gap + 14;
          row = r;
        }
      }
      const contentH = y + pad;
      const top = full.y + header;
      const viewH = full.h - header;
      const maxScroll = Math.max(0, contentH - viewH);
      return { full, header, cell, gap, left, rowsY, top, viewH, maxScroll };
    };

    const mapTileAt = (p: PointerPoint): number | null => {
      const m = mapGeom();
      if (p.y < m.top) return null;
      for (let i = 0; i < cfg.levelCount; i++) {
        const r = Math.floor(i / MAP_COLS);
        const c = i % MAP_COLS;
        const x = m.left + c * (m.cell + m.gap);
        const y = m.top + m.rowsY[r]! - mapScroll + 8;
        if (p.x >= x && p.x <= x + m.cell && p.y >= y && p.y <= y + m.cell) return i + 1;
      }
      return null;
    };

    const mapClose = (): Button => {
      const { full } = frameOf(host!.viewport);
      return {
        id: "mapclose",
        icon: "close",
        x: full.x + full.w - 54,
        y: full.y + 10,
        w: 46,
        h: 44,
        enabled: true,
      };
    };

    const openMap = () => {
      screen = "map";
      const m = mapGeom();
      const r = Math.floor((level - 1) / MAP_COLS);
      mapScroll = clamp((m.rowsY[r] ?? 0) - m.viewH / 2 + m.cell, 0, m.maxScroll);
      mapVel = 0;
      host?.audio.play("whoosh", { volume: 0.6 });
    };

    // ---- status side effects
    const afterStatusChange = () => {
      if (!ctl || resolved || !host || !juice) return;
      const st = ctl.status();
      if (st === "won") {
        resolved = true;
        earned = clamp(Math.round(ctl.stars?.() ?? 3), 1, 3);
        const prevStars = progress.stars[level - 1] ?? 0;
        newBest = earned > prevStars;
        progress.stars[level - 1] = Math.max(prevStars, earned);
        progress.bestLevel = Math.max(progress.bestLevel, level);
        progress.currentLevel = Math.min(level + 1, cfg.levelCount);
        save();
        host.audio.play("win");
        host.haptics.impact("medium");
        host.events.levelComplete(level);
        cardT = 0;
        starsShown = 0;
      } else if (st === "lost") {
        resolved = true;
        host.audio.play("fail");
        host.haptics.impact("heavy");
        juice.shake.kick(0.5);
        cardT = 0;
      }
    };

    const doAction = (id: string) => {
      if (!ctl || !host) return;
      host.haptics.impact("light");
      switch (id) {
        case "exit":
          host.audio.play("tap");
          host.exit();
          break;
        case "undo":
          if (ctl.canUndo?.()) {
            ctl.undo?.();
            resolved = false;
            cardT = -1;
            host.audio.play("whoosh", { pitch: 1.3, volume: 0.5 });
          }
          break;
        case "restart":
        case "replay":
          ctl.restart();
          resolved = false;
          cardT = -1;
          juice?.clear();
          fadeT = reduced() ? 260 : 80;
          host.audio.play("whoosh", { volume: 0.6 });
          break;
        case "hint":
          if (ctl.hint?.()) host.audio.play("select");
          else host.audio.play("bump");
          break;
        case "next":
          host.audio.play("tap");
          load(level + 1);
          break;
        case "map":
          openMap();
          break;
        case "mapclose":
          screen = "play";
          host.audio.play("tap");
          break;
      }
    };

    // ---- drawing
    const drawHud = (g: CanvasRenderingContext2D) => {
      const { hud } = frame();
      g.fillStyle = theme.panel;
      g.fillRect(hud.x, hud.y, hud.w, hud.h);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(hud.x, hud.y + hud.h, hud.w, 3);
      const buttons = hudButtons();
      for (const b of buttons) drawButton(g, theme, b, pressed === b.id);
      const leftEdge = hud.x + 62;
      const rightEdge = Math.min(...buttons.filter((b) => b.id !== "exit").map((b) => b.x)) - 6;
      const info = ctl?.hudInfo?.();
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillStyle = theme.text;
      g.font = `800 18px ${FONT}`;
      const label = `Level ${level}`;
      g.fillText(label, leftEdge, hud.y + HUD_H / 2 - (info ? 9 : 0), rightEdge - leftEdge);
      if (info) {
        g.fillStyle = theme.muted;
        g.font = `600 12px ${FONT}`;
        g.fillText(info, leftEdge, hud.y + HUD_H / 2 + 12, rightEdge - leftEdge);
      }
    };

    const drawCard = (g: CanvasRenderingContext2D) => {
      if (!ctl || cardT < 0) return;
      const t = cardT - CARD_DELAY();
      if (t < 0) return;
      const { play } = frame();
      const k = reduced() ? 1 : clamp(t / 320, 0, 1);
      g.fillStyle = `rgba(0,0,0,${0.55 * Math.min(1, t / 200 || 1)})`;
      g.fillRect(play.x, play.y, play.w, play.h);
      const c = cardRect();
      const s = reduced() ? 1 : ease.outBack(k);
      g.save();
      g.translate(c.x + c.w / 2, c.y + c.h / 2);
      g.scale(s, s);
      g.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
      roundRectPath(g, c.x, c.y + 5, c.w, c.h, 24);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fill();
      roundRectPath(g, c.x, c.y, c.w, c.h, 24);
      g.fillStyle = theme.panel;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = theme.accent;
      g.stroke();
      const cx = c.x + c.w / 2;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const st = ctl.status();
      if (st === "won") {
        const last = level >= cfg.levelCount;
        g.fillStyle = theme.text;
        g.font = `800 24px ${FONT}`;
        g.fillText(last ? "All levels cleared!" : `Level ${level} clear!`, cx, c.y + 38);
        for (let i = 0; i < 3; i++) {
          const sx = cx + (i - 1) * 64;
          const sy = c.y + 104 - (i === 1 ? 10 : 0);
          const shown = i < starsShown;
          const popT = shown ? clamp((t - STAR_STEP() * (i + 1)) / 260, 0, 1) : 0;
          const pop = shown ? (reduced() ? 1 : ease.outElastic(popT)) : 1;
          const r = (i === 1 ? 30 : 25) * (shown ? pop : 1);
          drawStar(g, sx, sy, r, shown && i < earned, starColor, "rgba(255,255,255,0.13)");
        }
        g.font = `600 14px ${FONT}`;
        g.fillStyle = theme.muted;
        const sub =
          earned === 3
            ? "Perfect!"
            : newBest
              ? "New best for this level"
              : "Solved. Go for 3 stars?";
        g.fillText(sub, cx, c.y + 150);
      } else {
        g.fillStyle = theme.text;
        g.font = `800 24px ${FONT}`;
        g.fillText("Stuck!", cx, c.y + 44);
        g.font = `500 15px ${FONT}`;
        g.fillStyle = theme.muted;
        wrapText(
          g,
          ctl.lostMessage?.() ?? "No moves left. Undo or retry.",
          cx,
          c.y + 96,
          c.w - 40,
          20,
        );
      }
      for (const b of cardButtons()) drawButton(g, theme, b, pressed === b.id);
      g.restore();
    };

    const drawIntro = (g: CanvasRenderingContext2D) => {
      if (!intro || screen !== "play") return;
      const DUR = 2600;
      if (introT > DUR) return;
      const { play } = frame();
      const inK = reduced() ? 1 : ease.outBack(clamp(introT / 300, 0, 1));
      const outK = introT > DUR - 300 ? (introT - (DUR - 300)) / 300 : 0;
      g.save();
      g.globalAlpha = 1 - outK;
      g.font = `700 15px ${FONT}`;
      const w = Math.min(play.w - 32, g.measureText(intro).width + 40);
      const h = 40;
      const x = play.x + (play.w - w) / 2;
      const y = play.y + 12 - (1 - inK) * 60;
      roundRectPath(g, x, y, w, h, h / 2);
      g.fillStyle = theme.accent;
      g.fill();
      g.fillStyle = theme.accentText;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(intro, x + w / 2, y + h / 2 + 1, w - 20);
      g.restore();
    };

    const drawMap = (g: CanvasRenderingContext2D) => {
      const m = mapGeom();
      const { full } = m;
      drawBackground(g, theme, host!.viewport.width, host!.viewport.height);
      g.save();
      g.beginPath();
      g.rect(full.x, m.top, full.w, m.viewH);
      g.clip();
      const worlds = cfg.worlds ?? [];
      for (let i = 0; i < cfg.levelCount; i++) {
        const r = Math.floor(i / MAP_COLS);
        const c = i % MAP_COLS;
        const x = m.left + c * (m.cell + m.gap);
        const y = m.top + m.rowsY[r]! - mapScroll + 8;
        if (y > m.top + m.viewH || y + m.cell + 20 < m.top) continue;
        const world = worlds.find((w) => w.from - 1 === i);
        if (world) {
          g.fillStyle = theme.muted;
          g.font = `800 13px ${FONT}`;
          g.textAlign = "left";
          g.textBaseline = "middle";
          g.fillText(world.name.toUpperCase(), m.left, y - 20);
        }
        const n = i + 1;
        const open = unlocked(n);
        const isPressed = pressed === `lvl${n}`;
        const k = isPressed ? 0.92 : 1;
        const w = m.cell * k;
        const tx = x + (m.cell - w) / 2;
        const ty = y + (m.cell - w) / 2;
        const fill = n === level ? theme.accent : open ? theme.buttonFill : theme.panel;
        if (open && !isPressed) {
          roundRectPath(g, tx, ty + 4, w, w, 16);
          g.fillStyle = shade(fill, -0.35);
          g.fill();
        }
        roundRectPath(g, tx, ty + (isPressed ? 3 : 0), w, w, 16);
        g.fillStyle = fill;
        g.fill();
        const ink = n === level ? theme.accentText : theme.text;
        if (open) {
          g.fillStyle = ink;
          g.font = `800 ${Math.round(m.cell * 0.34)}px ${FONT}`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(n), tx + w / 2, ty + w * 0.42 + (isPressed ? 3 : 0));
          const st = progress.stars[i] ?? 0;
          for (let s = 0; s < 3; s++) {
            drawStar(
              g,
              tx + w / 2 + (s - 1) * (w * 0.24),
              ty + w * 0.76 + (isPressed ? 3 : 0),
              w * 0.1,
              s < st,
              starColor,
              "rgba(0,0,0,0.25)",
            );
          }
        } else {
          drawIcon(g, "lock", tx + w / 2, ty + w / 2, w * 0.36, theme.muted);
        }
      }
      g.restore();
      // header
      g.fillStyle = theme.panel;
      g.fillRect(full.x, full.y, full.w, m.header);
      g.fillStyle = theme.text;
      g.font = `800 22px ${FONT}`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(cfg.title, full.x + 18, full.y + m.header / 2 - 8);
      const total = progress.stars.reduce((a, b) => a + b, 0);
      drawStar(g, full.x + 26, full.y + m.header / 2 + 14, 7, true, starColor, "");
      g.fillStyle = theme.muted;
      g.font = `700 13px ${FONT}`;
      g.fillText(`${total} / ${cfg.levelCount * 3}`, full.x + 38, full.y + m.header / 2 + 15);
      drawButton(g, theme, mapClose(), pressed === "mapclose");
    };

    const draw = () => {
      if (!g2d || !ctl || !host || !juice) return;
      const g = g2d;
      const { vp, play } = frame();
      if (screen === "map") {
        drawMap(g);
        return;
      }
      drawBackground(g, theme, vp.width, vp.height);
      const off = juice.shake.offset(9);
      g.save();
      g.translate(off.x, off.y);
      ctl.draw(g, play, clock);
      juice.draw(g);
      g.restore();
      if (fadeT < 260) {
        g.fillStyle = theme.bg;
        g.globalAlpha = 1 - ease.outQuad(fadeT / 260);
        g.fillRect(play.x, play.y, play.w, play.h);
        g.globalAlpha = 1;
      }
      drawIntro(g);
      drawHud(g);
      drawCard(g);
    };

    const update = (dt: number) => {
      if (!ctl || !juice || !host) return;
      clock += dt;
      fadeT = Math.min(260, fadeT + dt);
      introT += dt;
      ctl.update(dt);
      juice.update(dt);
      afterStatusChange();
      if (cardT >= 0 && !ctl.busy()) {
        const before = cardT;
        cardT += dt;
        const d = CARD_DELAY();
        if (before < d && cardT >= d && ctl.status() === "won") {
          const { play } = frame();
          juice.particles.confetti(play.x, play.y - 10, play.w, theme.confetti ?? DEFAULT_CONFETTI);
        }
        if (ctl.status() === "won") {
          const due = Math.min(earned, Math.floor((cardT - d) / Math.max(1, STAR_STEP())));
          const target = reduced() ? earned : clamp(due, 0, earned);
          while (starsShown < target) {
            starsShown++;
            host.audio.play("star", { pitch: 1 + (starsShown - 1) * 0.18 });
            host.haptics.impact("light");
            const c = cardRect();
            const sx = c.x + c.w / 2 + (starsShown - 2) * 64;
            juice.particles.burst(sx, c.y + 104, {
              count: 16,
              colors: [starColor, "#FFFFFF"],
              speed: 240,
              shape: "star",
              size: 5,
              gravity: 300,
            });
          }
        }
      }
      if (screen === "map" && !mapDrag && mapVel !== 0) {
        const m = mapGeom();
        mapScroll = clamp(mapScroll + mapVel * (dt / 1000), 0, m.maxScroll);
        mapVel *= Math.exp(-4 * (dt / 1000));
        if (Math.abs(mapVel) < 5) mapVel = 0;
      }
    };

    // ---- input
    const onDown = (p: PointerPoint) => {
      if (destroyed || paused || !ctl || !host) return;
      pressStart = p;
      if (screen === "map") {
        if (hitButton([mapClose()], p)) {
          pressed = "mapclose";
          return;
        }
        mapDrag = { y: p.y, scroll: mapScroll, moved: false, t: clock };
        mapVel = 0;
        const n = mapTileAt(p);
        pressed = n && unlocked(n) ? `lvl${n}` : null;
        if (n && !unlocked(n)) host.audio.play("bump", { volume: 0.5 });
        return;
      }
      if (cardT >= 0) {
        const b = hitButton(cardButtons(), p);
        pressed = b?.id ?? null;
        return;
      }
      const hb = hitButton(hudButtons(), p);
      if (hb) {
        pressed = hb.id;
        return;
      }
      const { play } = frame();
      if (!inside(play, p)) return;
      ctlGesture = true;
      (ctl.down ?? ctl.tap)?.call(ctl, p, play);
      afterStatusChange();
    };

    const onMove = (p: PointerPoint) => {
      if (destroyed || paused || !ctl) return;
      if (
        pressed &&
        pressStart &&
        Math.hypot(p.x - pressStart.x, p.y - pressStart.y) > DRAG_CANCEL_PX
      ) {
        if (!(screen === "map" && pressed === "mapclose")) pressed = null;
      }
      if (screen === "map" && mapDrag) {
        const m = mapGeom();
        const ns = clamp(mapDrag.scroll - (p.y - mapDrag.y), 0, m.maxScroll);
        mapVel = (ns - mapScroll) * 60;
        mapScroll = ns;
        return;
      }
      if (ctlGesture && ctl.move) {
        ctl.move(p, frame().play);
        afterStatusChange();
      }
    };

    const onUp = (p: PointerPoint) => {
      if (destroyed || !ctl || !host) return;
      const id = pressed;
      pressed = null;
      pressStart = null;
      if (screen === "map") {
        mapDrag = null;
        if (id === "mapclose") {
          if (hitButton([mapClose()], p)) doAction("mapclose");
          return;
        }
        if (id?.startsWith("lvl")) {
          const n = Number(id.slice(3));
          if (mapTileAt(p) === n) {
            screen = "play";
            mapVel = 0;
            host.audio.play("select");
            host.haptics.impact("light");
            load(n);
          }
        }
        return;
      }
      if (id) {
        const list = cardT >= 0 ? cardButtons() : hudButtons();
        const b = hitButton(list, p);
        if (b && b.id === id) doAction(id);
        return;
      }
      if (ctlGesture) {
        ctlGesture = false;
        ctl.up?.(p, frame().play);
        afterStatusChange();
      }
    };

    return {
      slug: cfg.slug,
      async mount(container: HTMLElement, ctx: GameContext) {
        host = ctx;
        root = document.createElement("div");
        root.style.cssText =
          "position:absolute;inset:0;overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent";
        root.setAttribute("role", "application");
        root.setAttribute("aria-label", cfg.title);
        container.appendChild(root);
        const { canvas, ctx: g, resize } = createCanvas(root, ctx.viewport);
        g2d = g;
        juice = new Juice({ reducedMotion: ctx.prefersReducedMotion, font: FONT });
        ctl = cfg.create({
          audio: ctx.audio,
          haptics: ctx.haptics,
          reducedMotion: ctx.prefersReducedMotion,
          juice,
          theme,
        });
        let saved: Partial<LevelProgress> | undefined;
        try {
          saved = await ctx.storage.get<Partial<LevelProgress>>("progress");
        } catch {
          saved = undefined;
        }
        if (destroyed) return;
        progress = sanitizeLevelProgress(saved, cfg.levelCount);
        load(progress.currentLevel);
        disposers.push(onPointer(canvas, { down: onDown, move: onMove, up: onUp }));
        disposers.push(
          ctx.viewport.onResize(() => {
            if (destroyed) return;
            resize();
            draw();
          }),
        );
        loop = createLoop((dt) => {
          update(dt);
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
        pressed = null;
        ctlGesture = false;
        mapDrag = null;
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
        for (const d of disposers) d();
        disposers = [];
        root?.remove();
        root = null;
        ctl = null;
        juice = null;
        g2d = null;
        host = null;
      },
    };
  };
}

function wrapText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => g.fillText(l, cx, y + (i - (lines.length - 1) / 2) * lineH));
}

// ---- Run (endless) games -------------------------------------------------------------

export type RunStatus = "ready" | "playing" | "over";

export interface RunController {
  /** Start a fresh run; `seed` varies per run for seeded randomness. */
  reset(seed: number): void;
  status(): RunStatus;
  score(): number;
  /** True while an animation runs; the game-over card waits for it. */
  busy(): boolean;
  update(dtMs: number): void;
  draw(g: CanvasRenderingContext2D, area: Area, nowMs: number): void;
  /** Finger down in the play area. The first touch in "ready" also lands here. */
  down?(p: PointerPoint, area: Area): void;
  move?(p: PointerPoint, area: Area): void;
  up?(p: PointerPoint, area: Area): void;
  /** Second HUD line, e.g. "Speed 3". */
  hudInfo?(): string | undefined;
  /** Prompt on the ready screen, default "Tap to start". */
  readyText?(): string;
  /** Line under the score on the game-over card. */
  overMessage?(): string;
}

export interface RunProgress {
  best: number;
  runs: number;
}

export interface RunGameConfig {
  slug: string;
  title: string;
  theme: Theme;
  /** Label for the score, default "Score". */
  scoreLabel?: string;
  create(env: Env): RunController;
}

export function sanitizeRunProgress(raw: Partial<RunProgress> | undefined): RunProgress {
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);
  return { best: n(raw?.best), runs: n(raw?.runs) };
}

export function createRunGame(cfg: RunGameConfig): GameFactory {
  return (): GameModule => {
    let root: HTMLDivElement | null = null;
    let disposers: (() => void)[] = [];
    let loop: ReturnType<typeof createLoop> | null = null;
    let paused = false;
    let destroyed = false;
    let host: GameContext | null = null;
    let ctl: RunController | null = null;
    let juice: Juice | null = null;
    let g2d: CanvasRenderingContext2D | null = null;
    let clock = 0;
    let progress: RunProgress = { best: 0, runs: 0 };
    let resolved = false;
    let cardT = -1;
    let newBest = false;
    let shownScore = 0;
    let scorePop = 0;
    let lastScore = 0;
    let pressed: string | null = null;
    let pressStart: PointerPoint | null = null;
    let ctlGesture = false;
    let seed = 1;
    const theme = cfg.theme;
    const label = cfg.scoreLabel ?? "Score";
    const reduced = () => !!host?.prefersReducedMotion;
    const CARD_DELAY = () => (reduced() ? 0 : 450);
    // Prevent a frantic tap from skipping the result.
    const CARD_INPUT_DELAY = 400;

    const save = () => {
      if (destroyed || !host) return;
      host.storage.set("progress", { ...progress }).catch(() => {});
    };

    const frame = () => frameOf(host!.viewport);

    const newRun = () => {
      seed = (Math.floor(clock) ^ (progress.runs * 2654435761)) >>> 0 || 1;
      ctl?.reset(seed);
      resolved = false;
      cardT = -1;
      newBest = false;
      shownScore = 0;
      lastScore = 0;
      juice?.clear();
    };

    const hudButtons = (): Button[] => {
      const { hud } = frame();
      const by = hud.y + (HUD_H - MIN_TOUCH) / 2;
      return [
        { id: "exit", icon: "back", x: hud.x + 8, y: by, w: 46, h: MIN_TOUCH, enabled: true },
        {
          id: "restart",
          icon: "restart",
          x: hud.x + hud.w - 54,
          y: by,
          w: 46,
          h: MIN_TOUCH,
          enabled: ctl?.status() === "playing",
        },
      ];
    };

    const cardRect = (): Area => {
      const { play } = frame();
      const w = Math.min(play.w - 32, 320);
      const h = 260;
      return { x: play.x + (play.w - w) / 2, y: play.y + (play.h - h) / 2 - 10, w, h };
    };

    const cardButtons = (): Button[] => {
      if (cardT < CARD_DELAY()) return [];
      const c = cardRect();
      return [
        {
          id: "again",
          label: "Play again",
          icon: "restart",
          x: c.x + 24,
          y: c.y + c.h - 76,
          w: c.w - 48,
          h: 54,
          enabled: cardT >= CARD_DELAY() + CARD_INPUT_DELAY,
          primary: true,
        },
      ];
    };

    const afterStatusChange = () => {
      if (!ctl || !host || !juice) return;
      const sc = ctl.score();
      if (sc > lastScore) {
        scorePop = 1;
        lastScore = sc;
      }
      if (resolved || ctl.status() !== "over") return;
      resolved = true;
      progress.runs++;
      newBest = sc > progress.best && sc > 0;
      if (newBest) progress.best = sc;
      save();
      // Analytics `game_complete_level` counts finished runs for endless games.
      host.events.levelComplete(progress.runs);
      host.audio.play("fail");
      host.haptics.impact("heavy");
      juice.shake.kick(0.6);
      cardT = 0;
    };

    const doAction = (id: string) => {
      if (!host || !ctl) return;
      host.haptics.impact("light");
      switch (id) {
        case "exit":
          host.audio.play("tap");
          host.exit();
          break;
        case "restart":
        case "again":
          host.audio.play("whoosh", { volume: 0.6 });
          newRun();
          break;
      }
    };

    const drawHud = (g: CanvasRenderingContext2D) => {
      const { hud } = frame();
      g.fillStyle = theme.panel;
      g.fillRect(hud.x, hud.y, hud.w, hud.h);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(hud.x, hud.y + hud.h, hud.w, 3);
      for (const b of hudButtons()) drawButton(g, theme, b, pressed === b.id);
      const cx = hud.x + hud.w / 2;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const pop = 1 + 0.25 * ease.pulse(scorePop);
      g.save();
      g.translate(cx, hud.y + 24);
      g.scale(pop, pop);
      g.fillStyle = theme.text;
      g.font = `900 24px ${FONT}`;
      g.fillText(String(Math.round(shownScore)), 0, 0);
      g.restore();
      g.fillStyle = theme.muted;
      g.font = `600 11px ${FONT}`;
      const info = ctl?.hudInfo?.();
      g.fillText(
        `BEST ${Math.max(progress.best, ctl?.score() ?? 0)}${info ? `  ·  ${info}` : ""}`,
        cx,
        hud.y + 47,
      );
    };

    const drawCard = (g: CanvasRenderingContext2D) => {
      if (!ctl) return;
      const { play } = frame();
      if (ctl.status() === "ready") {
        const t = clock / 1000;
        g.save();
        // scrim so the title reads over any scene
        const sw = Math.min(play.w - 32, 300);
        const sh = progress.best > 0 ? 130 : 104;
        roundRectPath(g, play.x + (play.w - sw) / 2, play.y + play.h * 0.28 - 40, sw, sh, 22);
        g.fillStyle = "rgba(0,0,0,0.45)";
        g.fill();
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = theme.text;
        g.font = `900 34px ${FONT}`;
        g.fillText(cfg.title, play.x + play.w / 2, play.y + play.h * 0.28);
        g.globalAlpha = reduced() ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
        g.font = `700 18px ${FONT}`;
        g.fillStyle = theme.accent;
        g.fillText(
          ctl.readyText?.() ?? "Tap to start",
          play.x + play.w / 2,
          play.y + play.h * 0.28 + 44,
        );
        if (progress.best > 0) {
          g.globalAlpha = 1;
          g.fillStyle = theme.muted;
          g.font = `600 14px ${FONT}`;
          g.fillText(`Best: ${progress.best}`, play.x + play.w / 2, play.y + play.h * 0.28 + 76);
        }
        g.restore();
        return;
      }
      if (cardT < 0) return;
      const t = cardT - CARD_DELAY();
      if (t < 0) return;
      const k = reduced() ? 1 : clamp(t / 320, 0, 1);
      g.fillStyle = `rgba(0,0,0,${0.55 * Math.min(1, t / 200 || 1)})`;
      g.fillRect(play.x, play.y, play.w, play.h);
      const c = cardRect();
      const s = reduced() ? 1 : ease.outBack(k);
      g.save();
      g.translate(c.x + c.w / 2, c.y + c.h / 2);
      g.scale(s, s);
      g.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
      roundRectPath(g, c.x, c.y + 5, c.w, c.h, 24);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fill();
      roundRectPath(g, c.x, c.y, c.w, c.h, 24);
      g.fillStyle = theme.panel;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = newBest ? (theme.star ?? DEFAULT_STAR) : theme.accent;
      g.stroke();
      const cx = c.x + c.w / 2;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = theme.muted;
      g.font = `700 14px ${FONT}`;
      g.fillText(label.toUpperCase(), cx, c.y + 32);
      g.fillStyle = theme.text;
      g.font = `900 52px ${FONT}`;
      g.fillText(String(ctl.score()), cx, c.y + 78);
      if (newBest) {
        g.fillStyle = theme.star ?? DEFAULT_STAR;
        g.font = `900 18px ${FONT}`;
        const wob = reduced() ? 0 : Math.sin(clock / 120) * 0.06;
        g.save();
        g.translate(cx, c.y + 122);
        g.rotate(wob);
        g.fillText("NEW BEST!", 0, 0);
        g.restore();
      } else {
        g.fillStyle = theme.muted;
        g.font = `600 15px ${FONT}`;
        g.fillText(`Best: ${progress.best}`, cx, c.y + 122);
      }
      const msg = ctl.overMessage?.();
      if (msg) {
        g.fillStyle = theme.muted;
        g.font = `500 14px ${FONT}`;
        wrapText(g, msg, cx, c.y + 154, c.w - 40, 18);
      }
      for (const b of cardButtons()) drawButton(g, theme, b, pressed === b.id);
      g.restore();
    };

    const draw = () => {
      if (!g2d || !ctl || !host || !juice) return;
      const g = g2d;
      const { vp, play } = frame();
      drawBackground(g, theme, vp.width, vp.height);
      const off = juice.shake.offset(10);
      g.save();
      g.translate(off.x, off.y);
      ctl.draw(g, play, clock);
      juice.draw(g);
      g.restore();
      drawHud(g);
      drawCard(g);
    };

    const update = (dt: number) => {
      if (!ctl || !juice || !host) return;
      clock += dt;
      ctl.update(dt);
      juice.update(dt);
      afterStatusChange();
      const target = ctl.score();
      shownScore = reduced()
        ? target
        : Math.min(target, shownScore + Math.max(1, (target - shownScore) * 0.25));
      if (shownScore > target) shownScore = target;
      scorePop = Math.max(0, scorePop - dt / 250);
      if (cardT >= 0 && !ctl.busy()) {
        const before = cardT;
        cardT += dt;
        if (newBest && before < CARD_DELAY() && cardT >= CARD_DELAY()) {
          const { play } = frame();
          juice.particles.confetti(play.x, play.y - 10, play.w, theme.confetti ?? DEFAULT_CONFETTI);
          host.audio.play("win");
        }
      }
    };

    const onDown = (p: PointerPoint) => {
      if (destroyed || paused || !ctl || !host) return;
      pressStart = p;
      if (cardT >= 0) {
        pressed = hitButton(cardButtons(), p)?.id ?? null;
        return;
      }
      const hb = hitButton(hudButtons(), p);
      if (hb) {
        pressed = hb.id;
        return;
      }
      const { play } = frame();
      if (!inside(play, p)) return;
      ctlGesture = true;
      ctl.down?.(p, play);
      afterStatusChange();
    };

    const onMove = (p: PointerPoint) => {
      if (destroyed || paused || !ctl) return;
      if (
        pressed &&
        pressStart &&
        Math.hypot(p.x - pressStart.x, p.y - pressStart.y) > DRAG_CANCEL_PX
      )
        pressed = null;
      if (ctlGesture && ctl.move) {
        ctl.move(p, frame().play);
        afterStatusChange();
      }
    };

    const onUp = (p: PointerPoint) => {
      if (destroyed || !ctl) return;
      const id = pressed;
      pressed = null;
      pressStart = null;
      if (id) {
        const b = hitButton(cardT >= 0 ? cardButtons() : hudButtons(), p);
        if (b && b.id === id) doAction(id);
        return;
      }
      if (ctlGesture) {
        ctlGesture = false;
        ctl.up?.(p, frame().play);
        afterStatusChange();
      }
    };

    return {
      slug: cfg.slug,
      async mount(container: HTMLElement, ctx: GameContext) {
        host = ctx;
        root = document.createElement("div");
        root.style.cssText =
          "position:absolute;inset:0;overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent";
        root.setAttribute("role", "application");
        root.setAttribute("aria-label", cfg.title);
        container.appendChild(root);
        const { canvas, ctx: g, resize } = createCanvas(root, ctx.viewport);
        g2d = g;
        juice = new Juice({ reducedMotion: ctx.prefersReducedMotion, font: FONT });
        ctl = cfg.create({
          audio: ctx.audio,
          haptics: ctx.haptics,
          reducedMotion: ctx.prefersReducedMotion,
          juice,
          theme,
        });
        let saved: Partial<RunProgress> | undefined;
        try {
          saved = await ctx.storage.get<Partial<RunProgress>>("progress");
        } catch {
          saved = undefined;
        }
        if (destroyed) return;
        progress = sanitizeRunProgress(saved);
        newRun();
        disposers.push(onPointer(canvas, { down: onDown, move: onMove, up: onUp }));
        disposers.push(
          ctx.viewport.onResize(() => {
            if (destroyed) return;
            resize();
            draw();
          }),
        );
        loop = createLoop((dt) => {
          update(dt);
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
        pressed = null;
        ctlGesture = false;
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
        for (const d of disposers) d();
        disposers = [];
        root?.remove();
        root = null;
        ctl = null;
        juice = null;
        g2d = null;
        host = null;
      },
    };
  };
}
