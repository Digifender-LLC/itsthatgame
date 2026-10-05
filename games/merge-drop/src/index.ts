// Merge Drop (TDD §8): drop numbered tiles into one of five columns; equal tiles that touch
// merge (chains allowed); the run ends when a column overflows.
// Rules live in logic.ts (pure, seeded, tested). This file is the controller for the SDK's
// endless-game shell (`createRunGame`): it animates the already-resolved merge list step by
// step (fall, squash, slide, pop), draws the tiles and handles aiming input.
import {
  PIECE_GLYPHS,
  FONT,
  approach,
  clamp,
  createRunGame,
  ease,
  inkFor,
  lerp,
  roundRectPath,
  shade,
  type Area,
  type Env,
  type PointerPoint,
  type RunController,
  type RunStatus,
} from "@itg/game-sdk";
import {
  COLS,
  GOALS,
  ROWS,
  danger,
  drop,
  goalIndex,
  newGame,
  newGoals,
  wouldMerge,
  type MergeEvent,
  type MergeState,
} from "./logic";

export const SLUG = "merge-drop";

/** Own tile palette (distinct hue per value), cycling with a gold rim past 2048. */
const TILE_COLORS = [
  "#5CC8FF", // 2
  "#5EE6A8", // 4
  "#B6E64C", // 8
  "#FFD23F", // 16
  "#FF9F43", // 32
  "#FF6B6B", // 64
  "#FF5CA8", // 128
  "#D65CFF", // 256
  "#8F6BFF", // 512
  "#4F7CFF", // 1024
  "#FFC933", // 2048
  "#F4F0FF", // 4096
] as const;

const THEME = {
  // No bg2: the SDK test canvas has no gradients (see report); solid indigo reads fine.
  bg: "#221A52",
  panel: "#2A2160",
  text: "#FFFFFF",
  muted: "#C9C2F2",
  accent: "#FFC94D",
  accentText: "#2B1B00",
  buttonFill: "#3B2F83",
  star: "#FFD76A",
  confetti: ["#5CC8FF", "#5EE6A8", "#FFD23F", "#FF9F43", "#FF5CA8", "#D65CFF"],
};

const WELL = "#120D30";
const DANGER = "#FF5A5F";
const TOP_H = 46;
/** Gravity in rows per ms^2 and the cap on fall speed (rows per ms). */
const GRAVITY = 0.00022;
const SLIDE_MS = 150;

function tileIndex(v: number): number {
  return Math.max(0, Math.round(Math.log2(v)) - 1);
}
function tileColor(v: number): string {
  return TILE_COLORS[tileIndex(v) % TILE_COLORS.length]!;
}

interface Tile {
  v: number;
  /** Display row (0 = bottom), eased down to its stack index by gravity. */
  row: number;
  vel: number;
  sx: number;
  sy: number;
  /** Set while sliding into a merge cell. */
  slide: { fc: number; fr: number; tc: number; tr: number; k: number } | null;
  seed: number;
}

interface Layout {
  cell: number;
  boardX: number;
  boardY: number;
  boardW: number;
  topY: number;
  area: Area;
}

type Phase = "idle" | "fall" | "slide" | "settle";

function layout(area: Area): Layout {
  const cell = Math.floor(
    clamp(Math.min((area.w - 16) / COLS, (area.h - TOP_H - 22) / (ROWS + 1.05)), 36, 80),
  );
  const boardW = cell * COLS;
  const topY = area.y + 4;
  // Spare height (tall phones) goes above the board so the thumb zone stays central.
  const spare = area.h - TOP_H - 22 - cell * (ROWS + 1.05);
  const shift = Math.round(clamp(spare * 0.45, 0, 70));
  return {
    cell,
    boardW,
    boardX: Math.round(area.x + (area.w - boardW) / 2),
    boardY: Math.round(topY + TOP_H + 4 + cell * 1.05 + shift),
    topY,
    area,
  };
}

export class MergeDrop implements RunController {
  private state: MergeState = newGame(1);
  private vis: Tile[][] = [];
  private st: RunStatus = "ready";
  private phase: Phase = "idle";
  private faller: { v: number; col: number; row: number; vel: number } | null = null;
  private queue: MergeEvent[] = [];
  private qi = 0;
  private sliders: Tile[] = [];
  private toTile: Tile | null = null;
  private slideT = 0;
  private settleT = 0;
  private shown = 0;
  private top = 2;
  private goalsDone = 0;
  private aim = 2;
  private aimX = 2;
  private dragging = false;
  private skipUp = false;
  private pending = -1;
  private heldScale = 1;
  private dangerSeen = [0, 0, 0, 0, 0];
  private banner: { text: string; sub: number; t: number; ms: number } | null = null;
  private pipPop = 0;
  private lastLay: Layout | null = null;
  private clock = 0;
  private seedCounter = 1;
  private mergeDone = false;

  constructor(private readonly env: Env) {
    this.reset(1);
  }

  // ---- RunController -------------------------------------------------------------

  reset(seed: number): void {
    this.state = newGame(seed);
    this.vis = Array.from({ length: COLS }, () => []);
    this.st = "ready";
    this.phase = "idle";
    this.faller = null;
    this.queue = [];
    this.qi = 0;
    this.sliders = [];
    this.toTile = null;
    this.shown = 0;
    this.top = 2;
    this.goalsDone = goalIndex(2);
    this.aim = Math.floor(COLS / 2);
    this.aimX = this.aim;
    this.dragging = false;
    this.skipUp = false;
    this.pending = -1;
    this.heldScale = 1;
    this.dangerSeen = [0, 0, 0, 0, 0];
    this.banner = null;
    this.pipPop = 0;
  }

  /** Snapshot of the board values (for tests). */
  board(): number[][] {
    return this.state.cols.map((c) => [...c]);
  }

  status(): RunStatus {
    if (this.st === "ready") return "ready";
    return this.state.over && this.phase === "idle" ? "over" : "playing";
  }

  score(): number {
    return this.shown;
  }

  busy(): boolean {
    return this.phase !== "idle";
  }

  hudInfo(): string {
    const g = GOALS[this.goalsDone];
    return g ? `Top ${this.top} → ${g}` : `Top ${this.top}`;
  }

  readyText(): string {
    return "Drag to aim, release to drop";
  }

  overMessage(): string {
    return `Highest tile ${this.top} after ${this.state.drops} drops. Merge equal tiles to keep columns low.`;
  }

  down(p: PointerPoint, area: Area): void {
    if (this.st === "ready") {
      this.st = "playing";
      this.skipUp = true; // the starting touch must not also drop a tile
    }
    this.dragging = true;
    this.aimAt(p.x, area);
  }

  move(p: PointerPoint, area: Area): void {
    if (this.dragging) this.aimAt(p.x, area);
  }

  up(p: PointerPoint, area: Area): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.aimAt(p.x, area);
    if (this.skipUp) {
      this.skipUp = false;
      return;
    }
    if (this.state.over) return;
    if (this.phase === "idle") this.startDrop(this.aim);
    else if (this.pending < 0) this.pending = this.aim;
    else this.env.audio.play("bump", { volume: 0.5 });
  }

  // ---- input helpers -------------------------------------------------------------

  private aimAt(x: number, area: Area): void {
    const L = this.lastLay && this.lastLay.area === area ? this.lastLay : layout(area);
    const c = clamp(Math.floor((x - L.boardX) / L.cell), 0, COLS - 1);
    if (c !== this.aim) {
      this.aim = c;
      this.env.audio.play("tap", { volume: 0.25, pitch: 1.4 });
    }
  }

  // ---- sequencing ----------------------------------------------------------------

  private startDrop(col: number): void {
    const v = this.state.current;
    const res = drop(this.state, col);
    if (!res.ok) return;
    this.faller = { v, col, row: ROWS, vel: 0.002 };
    this.queue = res.merges;
    this.qi = 0;
    this.phase = "fall";
    this.heldScale = 0;
    this.env.juice.tweens.add(260, (k) => (this.heldScale = k), {
      delay: this.env.reducedMotion ? 0 : 140,
      ease: ease.outBack,
    });
    this.env.audio.play("whoosh", { volume: 0.3, pitch: 1.5 });
  }

  private pos(L: Layout, c: number, row: number): { x: number; y: number } {
    return {
      x: L.boardX + (c + 0.5) * L.cell,
      y: L.boardY + (ROWS - row - 0.5) * L.cell,
    };
  }

  private land(): void {
    const f = this.faller!;
    this.faller = null;
    const col = this.vis[f.col]!;
    const t: Tile = {
      v: f.v,
      row: col.length,
      vel: 0,
      sx: 1.16,
      sy: 0.72,
      slide: null,
      seed: this.seedCounter++ * 1.7,
    };
    col.push(t);
    this.env.juice.tweens.add(380, (k) => this.squash(t, 1.16, 0.72, k), { ease: ease.outElastic });
    this.env.audio.play("drop", { volume: 0.8 });
    this.env.haptics.impact("light");
    const L = this.lastLay;
    if (L) {
      const p = this.pos(L, f.col, t.row);
      this.env.juice.particles.burst(p.x, p.y + L.cell * 0.4, {
        count: 6,
        colors: ["#FFFFFF", shade(tileColor(f.v), 0.4)],
        speed: 110,
        life: 320,
        size: 3,
        gravity: 260,
        angle: -Math.PI / 2,
        spread: Math.PI,
        shape: "circle",
      });
    }
    this.noteTop(f.v, f.col, t.row);
    this.checkDanger();
    this.mergeDone = false;
    this.phase = "settle";
    this.settleT = 0;
  }

  private squash(t: Tile, sx: number, sy: number, k: number): void {
    t.sx = lerp(sx, 1, k);
    t.sy = lerp(sy, 1, k);
  }

  private checkDanger(): void {
    for (let c = 0; c < COLS; c++) {
      const d = danger(this.vis[c]!.length);
      if (d >= 2 && this.dangerSeen[c]! < 2)
        this.env.audio.play("bump", { volume: 0.55, pitch: 0.7 });
      this.dangerSeen[c] = d;
    }
  }

  private beginMerge(m: MergeEvent): void {
    const to = m.to;
    this.toTile = this.vis[to.col]![to.row] ?? null;
    this.sliders = [];
    for (const f of m.from) {
      if (f.col === to.col && f.row === to.row) continue;
      const t = this.vis[f.col]![f.row];
      if (!t) continue;
      t.slide = { fc: f.col, fr: t.row, tc: to.col, tr: to.row, k: 0 };
      this.sliders.push(t);
    }
    this.slideT = 0;
    this.phase = "slide";
  }

  private finishMerge(m: MergeEvent): void {
    const { juice, audio, haptics } = this.env;
    const to = this.toTile;
    for (let c = 0; c < COLS; c++) {
      const col = this.vis[c]!;
      if (col.some((t) => t.slide)) this.vis[c] = col.filter((t) => !t.slide);
    }
    this.sliders = [];
    this.mergeDone = true;
    if (to) {
      to.v = m.value;
      to.sx = 1.42;
      to.sy = 1.42;
      juice.tweens.add(520, (k) => this.squash(to, 1.42, 1.42, k), { ease: ease.outElastic });
    }
    const pts = m.value * m.chain;
    this.shown += pts;
    const color = tileColor(m.value);
    audio.play("pop", { pitch: 1 + 0.12 * (m.chain - 1), volume: 0.9 });
    if (m.chain >= 2) audio.play("combo", { pitch: 1 + 0.1 * (m.chain - 2), volume: 0.6 });
    if (m.chain >= 3) haptics.impact("medium");
    else haptics.impact("light");
    const L = this.lastLay;
    if (L) {
      const p = this.pos(L, m.to.col, m.to.row);
      const n = Math.min(26, 8 + m.from.length * 2 + m.chain * 3);
      juice.particles.burst(p.x, p.y, {
        count: n,
        colors: [color, shade(color, 0.45), "#FFFFFF"],
        speed: 200 + m.chain * 25,
        life: 560,
        size: 5,
        gravity: 380,
        shape: "star",
      });
      juice.particles.burst(p.x, p.y, {
        count: 1,
        colors: [color],
        size: 8,
        life: 380,
        shape: "ring",
      });
      juice.text.spawn(p.x, p.y, `+${pts}`, shade(color, 0.5), 22 + Math.min(10, m.chain * 2));
      if (m.chain >= 2) {
        juice.text.spawn(
          L.boardX + L.boardW / 2,
          L.boardY + L.cell * 1.4 - (m.chain - 2) * 6,
          `Chain x${m.chain}!`,
          "#FFE27A",
          26 + Math.min(14, m.chain * 3),
          1100,
        );
      }
      juice.shake.kick(Math.min(0.5, 0.1 + m.chain * 0.08 + m.value / 4096));
      this.noteTop(m.value, m.to.col, m.to.row);
    }
    this.checkDanger();
    this.phase = "settle";
    this.settleT = 0;
  }

  private noteTop(v: number, col: number, row: number): void {
    if (v <= this.top) return;
    const gained = newGoals(this.top, v);
    this.top = v;
    const L = this.lastLay;
    if (gained.length === 0 || !L) return;
    const goal = gained[gained.length - 1]!;
    this.goalsDone = goalIndex(v);
    const { juice, audio, haptics } = this.env;
    const big = goal >= 128;
    const p = this.pos(L, col, row);
    audio.play("unlock", { pitch: big ? 1 : 0.9 });
    if (big) juice.tweens.add(1, () => {}, { delay: 220, done: () => audio.play("star") });
    haptics.impact(big ? "heavy" : "medium");
    juice.shake.kick(big ? 0.6 : 0.3);
    const colors = THEME.confetti;
    juice.particles.burst(p.x, p.y, {
      count: big ? 28 : 16,
      colors: [tileColor(goal), "#FFFFFF", "#FFD76A"],
      speed: 320,
      life: 800,
      size: 6,
      shape: "star",
    });
    if (big) juice.particles.confetti(L.area.x, L.boardY - L.cell, L.area.w, colors, 60);
    this.banner = { text: `NEW TILE ${goal}!`, sub: goal, t: 0, ms: big ? 2000 : 1500 };
    this.pipPop = 1;
    juice.tweens.add(600, (k) => (this.pipPop = 1 - k), { ease: ease.linear });
  }

  private settled(): boolean {
    for (const col of this.vis)
      for (let i = 0; i < col.length; i++) if (col[i]!.row !== i) return false;
    return true;
  }

  private nextStep(): void {
    if (this.qi < this.queue.length) {
      this.beginMerge(this.queue[this.qi]!);
      return;
    }
    this.phase = "idle";
    this.queue = [];
    this.qi = 0;
    if (this.state.over) {
      this.pending = -1;
      return;
    }
    if (this.pending >= 0) {
      const c = this.pending;
      this.pending = -1;
      this.startDrop(c);
    }
  }

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 50);
    this.clock += dt;
    const sp = this.env.reducedMotion ? 2.2 : 1;
    const adt = dt * sp;
    this.aimX = approach(this.aimX, this.aim, 28, dt);
    if (Math.abs(this.aimX - this.aim) < 0.002) this.aimX = this.aim;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.ms) this.banner = null;
    }
    // Gravity for stacked tiles.
    for (const col of this.vis) {
      for (let i = 0; i < col.length; i++) {
        const t = col[i]!;
        if (t.slide || t.row <= i) {
          if (!t.slide && t.row !== i) t.row = i;
          continue;
        }
        t.vel = Math.min(0.02, t.vel + GRAVITY * adt);
        t.row -= t.vel * adt;
        if (t.row <= i) {
          if (t.vel > 0.004 && !this.env.reducedMotion) {
            t.sx = 1.1;
            t.sy = 0.86;
            this.env.juice.tweens.add(260, (k) => this.squash(t, 1.1, 0.86, k), {
              ease: ease.outElastic,
            });
          }
          t.row = i;
          t.vel = 0;
        }
      }
    }
    switch (this.phase) {
      case "fall": {
        const f = this.faller!;
        f.vel = Math.min(0.02, f.vel + GRAVITY * 1.4 * adt);
        f.row -= f.vel * adt;
        if (f.row <= this.vis[f.col]!.length) {
          f.row = this.vis[f.col]!.length;
          this.land();
        }
        break;
      }
      case "slide": {
        this.slideT += adt;
        const k = clamp(this.slideT / SLIDE_MS, 0, 1);
        const e = ease.inQuad(k);
        for (const t of this.sliders) if (t.slide) t.slide.k = e;
        if (k >= 1) this.finishMerge(this.queue[this.qi]!);
        break;
      }
      case "settle": {
        this.settleT += adt;
        if (this.settled() && this.settleT >= 90) {
          if (this.mergeDone) this.qi++;
          this.mergeDone = false;
          this.nextStep();
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- drawing -------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, area: Area, nowMs: number): void {
    const L = layout(area);
    this.lastLay = L;
    const { cell, boardX, boardY, boardW } = L;
    const reduced = this.env.reducedMotion;
    const t = nowMs / 1000;
    this.drawTopBar(g, L, t);

    // Well.
    roundRectPath(g, boardX - 4, boardY - 4, boardW + 8, cell * ROWS + 8, 14);
    g.fillStyle = "#4B3D96";
    g.fill();
    roundRectPath(g, boardX, boardY, boardW, cell * ROWS, 10);
    g.fillStyle = WELL;
    g.fill();
    for (let c = 0; c < COLS; c++) {
      if (c % 2 === 0) {
        g.fillStyle = "rgba(255,255,255,0.035)";
        g.fillRect(boardX + c * cell, boardY, cell, cell * ROWS);
      }
    }
    // Aimed column highlight.
    const playing = this.st !== "over" && !this.state.over;
    if (playing) {
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 5);
      g.fillStyle = `rgba(255,201,77,${0.08 + (this.dragging ? 0.08 : 0.03) + pulse * 0.03})`;
      g.fillRect(boardX + this.aim * cell, boardY - cell, cell, cell * (ROWS + 1));
      g.strokeStyle = `rgba(255,201,77,${0.35 + pulse * 0.25})`;
      g.lineWidth = 2;
      g.strokeRect(
        boardX + this.aim * cell + 1,
        boardY - cell + 1,
        cell - 2,
        cell * (ROWS + 1) - 2,
      );
    }
    this.drawDanger(g, L, t);

    // Landing ghost + guide.
    if (playing && this.st === "playing") this.drawGhost(g, L, t);

    // Tiles: sliders underneath, the rest on top.
    for (let c = 0; c < COLS; c++) {
      for (const tile of this.vis[c]!) if (tile.slide) this.drawStackTile(g, L, c, tile, t);
    }
    for (let c = 0; c < COLS; c++) {
      for (const tile of this.vis[c]!) if (!tile.slide) this.drawStackTile(g, L, c, tile, t);
    }

    // Falling tile with a short speed streak.
    if (this.faller) {
      const f = this.faller;
      const p = this.pos(L, f.col, f.row);
      const streak = Math.min(cell * 0.9, f.vel * 2200);
      if (streak > 4) {
        g.globalAlpha = 0.22;
        drawTile(g, f.v, p.x, p.y - streak * 0.55, cell, 1, 1, t, 0);
        g.globalAlpha = 1;
      }
      drawTile(g, f.v, p.x, p.y, cell, 1 - streak / cell / 10, 1 + streak / cell / 5, t, 0);
    }

    // Held tile in the lane above the board.
    if (this.st === "playing" && !this.state.over) {
      const hx = boardX + (this.aimX + 0.5) * cell;
      const bob = reduced ? 0 : Math.sin(t * 3) * 2;
      const hy = boardY - cell * 0.5 - 3 + bob;
      // Shadow.
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath();
      g.ellipse(hx, boardY - 2, cell * 0.3 * this.heldScale, 4, 0, 0, Math.PI * 2);
      g.fill();
      if (this.heldScale > 0.02) {
        const lift = this.dragging ? 1.08 : 1;
        drawTile(g, this.state.current, hx, hy, cell * lift * this.heldScale, 1, 1, t, 1);
      }
    }

    if (this.banner) this.drawBanner(g, L);
  }

  private drawStackTile(
    g: CanvasRenderingContext2D,
    L: Layout,
    c: number,
    tile: Tile,
    t: number,
  ): void {
    let x: number;
    let y: number;
    if (tile.slide) {
      const s = tile.slide;
      const a = this.pos(L, s.fc, s.fr);
      const b = this.pos(L, s.tc, s.tr);
      x = lerp(a.x, b.x, s.k);
      y = lerp(a.y, b.y, s.k);
      g.globalAlpha = 1 - 0.25 * s.k;
    } else {
      const p = this.pos(L, c, tile.row);
      x = p.x;
      y = p.y;
    }
    drawTile(g, tile.v, x, y, L.cell, tile.sx, tile.sy, t, tile.seed);
    g.globalAlpha = 1;
  }

  private drawDanger(g: CanvasRenderingContext2D, L: Layout, t: number): void {
    const { cell, boardX, boardY } = L;
    const reduced = this.env.reducedMotion;
    for (let c = 0; c < COLS; c++) {
      const len = this.vis[c]!.length;
      const d = danger(len);
      if (d === 0) continue;
      const x = boardX + c * cell;
      const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * (d >= 2 ? 11 : 5));
      const alpha = d === 1 ? 0.1 + 0.06 * pulse : 0.2 + 0.2 * pulse;
      g.save();
      g.beginPath();
      g.rect(x, boardY, cell, cell * 2);
      g.clip();
      g.strokeStyle = DANGER;
      g.globalAlpha = alpha;
      g.lineWidth = 6;
      const off = reduced ? 0 : (t * 24) % 16;
      for (let k = -cell * 2 + off; k < cell; k += 16) {
        g.beginPath();
        g.moveTo(x + k, boardY + cell * 2);
        g.lineTo(x + k + cell * 2, boardY);
        g.stroke();
      }
      g.restore();
      if (d >= 2) {
        g.fillStyle = DANGER;
        g.globalAlpha = 0.55 + 0.45 * pulse;
        g.fillRect(x + 2, boardY - 3, cell - 4, 4);
        g.globalAlpha = 1;
      }
    }
  }

  private drawGhost(g: CanvasRenderingContext2D, L: Layout, t: number): void {
    const { cell } = L;
    const col = this.vis[this.aim]!;
    const row = col.length;
    if (row > ROWS) return;
    const p = this.pos(L, this.aim, row);
    const hx = L.boardX + (this.aimX + 0.5) * cell;
    // Dotted guide from the held tile to the landing cell.
    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 2;
    g.setLineDash([3, 7]);
    g.beginPath();
    g.moveTo(hx, L.boardY);
    g.lineTo(p.x, p.y - cell * 0.4);
    g.stroke();
    g.setLineDash([]);
    const merge =
      this.phase === "idle" && wouldMerge(this.state.cols, this.aim, this.state.current);
    g.globalAlpha = merge ? 0.55 + (this.env.reducedMotion ? 0 : 0.2 * Math.sin(t * 8)) : 0.32;
    drawTile(g, this.state.current, p.x, p.y, cell * 0.94, 1, 1, t, 2);
    g.globalAlpha = 1;
    if (merge) {
      roundRectPath(g, p.x - cell * 0.47, p.y - cell * 0.47, cell * 0.94, cell * 0.94, cell * 0.2);
      g.strokeStyle = "#FFFFFF";
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.stroke();
      g.setLineDash([]);
    }
  }

  private drawTopBar(g: CanvasRenderingContext2D, L: Layout, t: number): void {
    const { area } = L;
    const y = L.topY;
    const cy = y + TOP_H / 2;
    // Next tile.
    g.fillStyle = THEME.muted;
    g.font = `800 10px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("NEXT", area.x + 12, cy);
    const mini = 34;
    drawTile(g, this.state.next, area.x + 12 + 42 + mini / 2, cy + 1, mini, 1, 1, t, 3);
    // Goal ladder: a sliding window of five goals around the next one.
    const x0 = area.x + 12 + 42 + mini + 14;
    const avail = area.x + area.w - 10 - x0;
    const pw = 48;
    const gap = 6;
    const n = clamp(Math.floor((avail + gap) / (pw + gap)), 2, 5);
    const first = clamp(this.goalsDone - 1, 0, GOALS.length - n);
    const total = n * pw + (n - 1) * gap;
    const sx = x0 + Math.max(0, (avail - total) / 2);
    for (let i = 0; i < n; i++) {
      const gi = first + i;
      const goal = GOALS[gi]!;
      const x = sx + i * (pw + gap);
      const reached = gi < this.goalsDone;
      const next = gi === this.goalsDone;
      const pop = next || gi === this.goalsDone - 1 ? 1 + 0.18 * ease.pulse(this.pipPop) : 1;
      g.save();
      g.translate(x + pw / 2, cy);
      g.scale(pop, pop);
      roundRectPath(g, -pw / 2, -14, pw, 28, 9);
      if (reached) {
        const c = tileColor(goal);
        g.fillStyle = c;
        g.fill();
        g.fillStyle = inkFor(c);
      } else {
        g.fillStyle = next ? "#3B2F83" : "#1F1850";
        g.fill();
        if (next) {
          g.lineWidth = 2;
          g.strokeStyle = THEME.accent;
          g.stroke();
        }
        g.fillStyle = next ? THEME.text : THEME.muted;
      }
      g.font = `800 ${goal >= 1000 ? 12 : 14}px ${FONT}`;
      g.textAlign = "center";
      g.fillText(String(goal), 0, reached ? 1 : 0);
      g.restore();
      if (next) {
        // Progress toward the next goal.
        const f = clamp((Math.log2(this.top) - 1) / (Math.log2(goal) - 1), 0, 1);
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(x + 4, cy + 17, pw - 8, 3);
        g.fillStyle = THEME.accent;
        g.fillRect(x + 4, cy + 17, (pw - 8) * f, 3);
      }
    }
  }

  private drawBanner(g: CanvasRenderingContext2D, L: Layout): void {
    const b = this.banner!;
    const k = b.t / b.ms;
    const pop = this.env.reducedMotion ? 1 : ease.outBack(clamp(b.t / 320, 0, 1));
    const alpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const cx = L.boardX + L.boardW / 2;
    const cy = L.boardY + L.cell * 3.1;
    const w = Math.min(L.boardW + 8, 300);
    g.save();
    g.globalAlpha = alpha;
    g.translate(cx, cy);
    g.scale(pop, pop);
    roundRectPath(g, -w / 2, -34 + 4, w, 68, 20);
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fill();
    roundRectPath(g, -w / 2, -34, w, 68, 20);
    g.fillStyle = THEME.panel;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = THEME.star;
    g.stroke();
    drawTile(g, b.sub, -w / 2 + 40, 0, 46, 1, 1, this.clock / 1000, 5);
    g.fillStyle = THEME.star;
    g.font = `900 22px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(b.text, 24, -8);
    g.fillStyle = THEME.muted;
    g.font = `700 12px ${FONT}`;
    g.fillText(b.sub >= 128 ? "Unlocked a new highest tile" : "Goal reached", 24, 16);
    g.restore();
  }
}

/** One tile, centred at (x, y). Squash is applied about the tile's bottom edge. */
function drawTile(
  g: CanvasRenderingContext2D,
  v: number,
  x: number,
  y: number,
  size: number,
  sx: number,
  sy: number,
  t: number,
  seed: number,
): void {
  const idx = tileIndex(v);
  const color = tileColor(v);
  const s = size - 6;
  const r = s * 0.22;
  g.save();
  g.translate(x, y + s / 2);
  g.scale(sx, sy);
  // Soft drop shadow, then the darker slab that gives the tile thickness.
  roundRectPath(g, -s / 2 + 1, -s + 6, s, s, r);
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.fill();
  roundRectPath(g, -s / 2, -s + 4, s, s, r);
  g.fillStyle = shade(color, -0.38);
  g.fill();
  roundRectPath(g, -s / 2, -s, s, s, r);
  g.fillStyle = color;
  g.fill();
  // Gloss band with a slow idle shimmer.
  const shimmer = 0.2 + 0.07 * Math.sin(t * 2 + seed);
  roundRectPath(g, -s / 2 + s * 0.07, -s + s * 0.06, s * 0.86, s * 0.28, r * 0.7);
  g.fillStyle = `rgba(255,255,255,${shimmer})`;
  g.fill();
  const ink = inkFor(color);
  // Visual richness grows with the value: ring, gems, double ring, crown.
  if (idx >= 3) {
    roundRectPath(g, -s / 2 + 4, -s + 4, s - 8, s - 8, r * 0.7);
    g.strokeStyle = "rgba(255,255,255,0.5)";
    g.lineWidth = 2;
    g.stroke();
  }
  if (idx >= 5) {
    g.fillStyle = "rgba(255,255,255,0.9)";
    const d = s * 0.075;
    for (const [gx, gy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const cx = gx * (s / 2 - s * 0.15);
      const cy = -s / 2 + gy * (s / 2 - s * 0.15);
      g.beginPath();
      g.moveTo(cx, cy - d);
      g.lineTo(cx + d, cy);
      g.lineTo(cx, cy + d);
      g.lineTo(cx - d, cy);
      g.closePath();
      g.fill();
    }
  }
  if (idx >= 7) {
    roundRectPath(g, -s / 2 + 8, -s + 8, s - 16, s - 16, r * 0.5);
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.lineWidth = 1.5;
    g.stroke();
    const a = Math.max(0, Math.sin(t * 3 + seed * 2));
    if (a > 0.05) {
      g.globalAlpha *= a;
      g.fillStyle = "#FFFFFF";
      const sp = s * 0.1;
      const px = Math.sin(seed) * s * 0.28;
      const py = -s / 2 + Math.cos(seed * 1.3) * s * 0.28;
      g.beginPath();
      g.moveTo(px, py - sp);
      g.lineTo(px + sp * 0.25, py - sp * 0.25);
      g.lineTo(px + sp, py);
      g.lineTo(px + sp * 0.25, py + sp * 0.25);
      g.lineTo(px, py + sp);
      g.lineTo(px - sp * 0.25, py + sp * 0.25);
      g.lineTo(px - sp, py);
      g.lineTo(px - sp * 0.25, py - sp * 0.25);
      g.closePath();
      g.fill();
      g.globalAlpha /= a;
    }
  }
  const crown = idx >= 9;
  if (crown) {
    roundRectPath(g, -s / 2, -s, s, s, r);
    g.strokeStyle = "#FFD76A";
    g.lineWidth = 3;
    g.stroke();
    const cw = s * 0.4;
    const cy = -s + s * 0.12;
    g.beginPath();
    g.moveTo(-cw / 2, cy + s * 0.14);
    g.lineTo(-cw / 2, cy);
    g.lineTo(-cw / 4, cy + s * 0.07);
    g.lineTo(0, cy - s * 0.02);
    g.lineTo(cw / 4, cy + s * 0.07);
    g.lineTo(cw / 2, cy);
    g.lineTo(cw / 2, cy + s * 0.14);
    g.closePath();
    g.fillStyle = "#FFD76A";
    g.fill();
    g.strokeStyle = "#8A5A00";
    g.lineWidth = 1.5;
    g.stroke();
  }
  // Number.
  const digits = String(v).length;
  const fs = s * (digits <= 2 ? 0.44 : digits === 3 ? 0.35 : digits === 4 ? 0.29 : 0.24);
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${Math.round(fs)}px ${FONT}`;
  g.fillText(String(v), 0, -s / 2 + (crown ? s * 0.1 : 0) + 1);
  // Corner glyph for the small values (colour is never the only cue).
  if (idx < 5 && size > 30) {
    g.font = `700 ${Math.round(s * 0.2)}px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "top";
    g.globalAlpha *= 0.85;
    g.fillText(PIECE_GLYPHS[idx % PIECE_GLYPHS.length]!, -s / 2 + s * 0.1, -s + s * 0.07);
    g.globalAlpha /= 0.85;
  }
  g.restore();
}

export default createRunGame({
  slug: SLUG,
  title: "Merge Drop",
  theme: THEME,
  create: (env) => new MergeDrop(env),
});
