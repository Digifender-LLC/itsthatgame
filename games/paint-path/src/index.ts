// Paint Path: one-stroke painting puzzle. Drag a wet brush so every tile gets paint exactly
// once (crossings twice). Rules live in logic.ts; this file is rendering, touch and juice,
// on top of the shared level shell (HUD, level map, win card, stars, saves).
import {
  FONT,
  createLevelGame,
  ease,
  approach,
  clamp,
  roundRectPath,
  shade,
  starPath,
  type Area,
  type Env,
  type LevelController,
  type PointerPoint,
  type Status,
  type Theme,
} from "@itg/game-sdk";
import { Board, K_BRIDGE, K_OPEN, K_PORTAL, K_TURN, K_WALL, hintFor } from "./logic";
import { LEVELS, LEVEL_COUNT, WORLDS, introFor, worldOf } from "./levels";

export const SLUG = "paint-path";

const THEME: Theme = {
  bg: "#FFF3E4",
  bg2: "#F6DCC9",
  panel: "#2B2140",
  text: "#FFFFFF",
  muted: "#CDC3E3",
  accent: "#FF8A4C",
  accentText: "#2B2140",
  buttonFill: "#43355F",
  star: "#FFC23A",
  confetti: ["#FF8A4C", "#F2527F", "#A83FD0", "#22C1B0", "#FFC23A", "#2B8FE0"],
};

const INK = "#2B2140";
const TILE = "#FFFDF9";
const TILE_EDGE = "#D9C9E8";
const BOARD = "#E4D5F0";
const GLYPH = "#7D6C9C";
const WALL = "#2B2140";
const WALL_HATCH = "#58467B";
const PORTAL_COLORS = ["#7B61FF", "#00A3A3", "#E8590C"] as const;
const PENTA = [1, 1.125, 1.25, 1.5, 1.667] as const;

/** Stars from how much help (undo button = 1, hint = 2) was used. */
export function starsForHelp(undos: number, hints: number): number {
  const cost = undos + 2 * hints;
  return cost === 0 ? 3 : cost <= 3 ? 2 : 1;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const f = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${f(ar, br)}${f(ag, bg)}${f(ab, bb)}`;
}

function gradientAt(stops: readonly string[], t: number): string {
  const x = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mixHex(stops[i]!, stops[i + 1]!, x - i);
}

/** Pitch for the k-th painted tile: a pentatonic run that climbs as the path grows. */
export function notePitch(k: number, required: number): number {
  const frac = required <= 1 ? 0 : k / (required - 1);
  const d = Math.min(9, Math.floor(frac * 9) + (k & 1));
  return clamp(0.78 * PENTA[d % 5]! * Math.pow(2, Math.floor(d / 5)), 0.5, 3);
}

const PASS_NEAR = 0.62; // finger must pass this far from the head centre (in tiles) to count
const GRAB_RANGE = 1.9; // a touch this close to the head grabs the brush

class PaintController implements LevelController {
  private idx = 0;
  private board: Board;
  private stops: readonly string[] = WORLDS[0]!.palette;
  private colors: string[] = [];
  private lights: string[] = [];
  private darks: string[] = [];
  private undos = 0;
  private hints = 0;
  /** Displayed path (longer than the real one while the brush retracts) and head position. */
  private trail: number[] = [];
  private vis = 0;
  private pop = new Float32Array(0);
  private clock = 0;
  private winT = -1;
  private winDur = 0;
  private winSpark = -1;
  private winNotes = 0;
  private shakeT = 0;
  private flashCell = -1;
  private flashT = 0;
  private lastBumpAt = -1000;
  private lastWhooshAt = -1000;
  private hintCells: number[] = [];
  private cachedStatus: Status = "playing";
  private cachedMoves: number[] = [];
  private stuckNoMoves = false;
  private grabbed = false;
  private offX = 0;
  private offY = 0;
  private rawX = 0;
  private rawY = 0;
  private area: Area = { x: 0, y: 60, w: 390, h: 720 };
  private gx = 0;
  private gy = 0;
  private cell = 40;

  constructor(private readonly env: Env) {
    this.board = new Board(LEVELS[0]!);
    this.setupLevel(0);
  }

  // ---- LevelController ---------------------------------------------------------------

  loadLevel(index: number): void {
    this.setupLevel(index);
  }

  restart(): void {
    this.board.reset();
    this.pop.fill(0);
    this.winT = -1;
    this.hintCells = [];
    this.grabbed = false;
    this.afterChange();
  }

  undo(): void {
    if (this.board.popMove()) {
      this.undos++;
      this.hintCells = [];
      this.afterChange();
    }
  }

  canUndo(): boolean {
    return this.board.path.length > 1 && this.cachedStatus === "playing";
  }

  status(): Status {
    return this.cachedStatus;
  }

  busy(): boolean {
    return this.winT >= 0 && this.winT < this.winDur;
  }

  lostMessage(): string {
    return this.stuckNoMoves
      ? "The brush is boxed in. Undo a few steps or restart."
      : "Some tiles can't be reached any more. Undo a few steps or restart.";
  }

  stars(): number {
    return starsForHelp(this.undos, this.hints);
  }

  hudInfo(): string {
    const parts = [
      `${this.board.path.length}/${this.board.required} tiles`,
      "★".repeat(this.stars()),
    ];
    if (this.hints) parts.push(`${this.hints} hint${this.hints > 1 ? "s" : ""}`);
    if (this.undos) parts.push(`${this.undos} undo${this.undos > 1 ? "s" : ""}`);
    return parts.join(" · ");
  }

  intro(index: number): string | undefined {
    return introFor(index);
  }

  hint(): boolean {
    if (this.cachedStatus !== "playing" || this.busy()) return false;
    const r = hintFor(this.board, 3);
    if (!r || r.cells.length === 0) return false;
    if (r.rewindTo !== null) this.board.rewindTo(r.rewindTo);
    this.hints++;
    this.afterChange();
    this.hintCells = r.cells.slice();
    return true;
  }

  // ---- level setup -------------------------------------------------------------------

  private setupLevel(index: number): void {
    this.idx = index;
    const level = LEVELS[index]!;
    this.board = new Board(level);
    const world = worldOf(index);
    this.stops = world.palette;
    const n = Math.max(2, this.board.required);
    this.colors = [];
    this.lights = [];
    this.darks = [];
    for (let k = 0; k < n; k++) {
      const c = gradientAt(this.stops, k / (n - 1));
      this.colors.push(c);
      this.lights.push(shade(c, 0.5));
      this.darks.push(shade(c, -0.32));
    }
    this.pop = new Float32Array(this.board.total);
    this.undos = 0;
    this.hints = 0;
    this.winT = -1;
    this.hintCells = [];
    this.grabbed = false;
    this.shakeT = 0;
    this.flashT = 0;
    this.trail = this.board.path.slice();
    this.vis = 0;
    this.afterChange();
  }

  private afterChange(): void {
    const b = this.board;
    if (b.isWon()) {
      this.cachedStatus = "won";
      this.cachedMoves = [];
    } else {
      this.cachedMoves = b.moves();
      this.stuckNoMoves = this.cachedMoves.length === 0;
      this.cachedStatus = this.stuckNoMoves || !b.reachable() ? "lost" : "playing";
      if (this.cachedStatus === "lost") this.cachedMoves = [];
    }
    // keep the displayed trail in step with the real path
    const path = b.path;
    let prefix = this.trail.length >= path.length;
    for (let i = 0; prefix && i < path.length; i++) if (this.trail[i] !== path[i]) prefix = false;
    if (!prefix || path.length > this.trail.length || this.trail.length === path.length) {
      this.trail = path.slice();
    }
    this.vis = Math.min(this.vis, this.trail.length - 1);
    if (this.hintCells.length) {
      const k = this.hintCells.indexOf(b.head());
      this.hintCells = k >= 0 ? this.hintCells.slice(k + 1) : [];
    }
  }

  // ---- geometry ----------------------------------------------------------------------

  private layout(area: Area): void {
    this.area = area;
    const level = this.board.level;
    const pad = 16;
    const aw = area.w - pad * 2;
    const ah = area.h - pad * 2;
    this.cell = Math.max(10, Math.min(78, Math.floor(Math.min(aw / level.cols, ah / level.rows))));
    const gw = this.cell * level.cols;
    const gh = this.cell * level.rows;
    this.gx = Math.round(area.x + (area.w - gw) / 2);
    this.gy = Math.round(area.y + (area.h - gh) / 2);
  }

  private cx(c: number): number {
    return this.gx + (c % this.board.level.cols) * this.cell + this.cell / 2;
  }

  private cy(c: number): number {
    return this.gy + Math.floor(c / this.board.level.cols) * this.cell + this.cell / 2;
  }

  // ---- input -------------------------------------------------------------------------

  down(p: PointerPoint, area: Area): void {
    if (this.cachedStatus !== "playing") return;
    this.layout(area);
    this.offX = 0;
    this.offY = 0;
    this.rawX = p.x;
    this.rawY = p.y;
    const b = this.board;
    const h = b.head();
    const near = Math.hypot(p.x - this.cx(h), p.y - this.cy(h)) <= GRAB_RANGE * this.cell;
    if (near) {
      this.grabbed = true;
      this.dragTo(p.x, p.y);
      return;
    }
    const level = b.level;
    const c = Math.floor((p.x - this.gx) / this.cell);
    const r = Math.floor((p.y - this.gy) / this.cell);
    if (c >= 0 && r >= 0 && c < level.cols && r < level.rows) {
      const cell = r * level.cols + c;
      const idx = b.lastIndexOf(cell);
      if (idx >= 0) {
        this.rewindTo(idx);
        this.grabbed = true;
        return;
      }
    }
    this.grabbed = false;
    this.bumpAt(-1);
  }

  move(p: PointerPoint, area: Area): void {
    if (!this.grabbed || this.cachedStatus !== "playing") return;
    this.layout(area);
    this.rawX = p.x;
    this.rawY = p.y;
    this.dragTo(p.x + this.offX, p.y + this.offY);
  }

  up(): void {
    this.grabbed = false;
  }

  /** Resolve the finger position into brush steps (forgiving of diagonals and fast drags). */
  private dragTo(px: number, py: number): void {
    const b = this.board;
    const cols = b.level.cols;
    const rows = b.level.rows;
    for (let iter = 0; iter < 8 && this.cachedStatus === "playing"; iter++) {
      const h = b.head();
      const hc = h % cols;
      const hr = Math.floor(h / cols);
      const vx = (px - this.cx(h)) / this.cell;
      const vy = (py - this.cy(h)) / this.cell;
      const span = (v: number) =>
        Math.abs(v) < PASS_NEAR ? 0 : Math.sign(v) * Math.floor(Math.abs(v) + 0.38);
      let sx = span(vx);
      let sy = span(vy);
      if (sx === 0 && sy === 0) return;
      if (sx !== 0 && sy !== 0) {
        // Diagonal: take the nearer orthogonal neighbour first, and only commit to the
        // second axis once the finger is clearly inside that tile.
        if (Math.min(Math.abs(vx), Math.abs(vy)) < 0.8) {
          if (Math.abs(vx) >= Math.abs(vy)) sy = 0;
          else sx = 0;
        }
      }
      const cands: number[] = [];
      const horiz = hc + Math.sign(sx) >= 0 && hc + Math.sign(sx) < cols ? h + Math.sign(sx) : -1;
      const vert =
        hr + Math.sign(sy) >= 0 && hr + Math.sign(sy) < rows ? h + Math.sign(sy) * cols : -1;
      if (sx !== 0 && sy !== 0) {
        if (Math.abs(vx) >= Math.abs(vy)) cands.push(horiz, vert);
        else cands.push(vert, horiz);
      } else if (sx !== 0) cands.push(horiz);
      else cands.push(vert);
      let did = false;
      for (const n of cands) {
        if (n < 0) continue;
        if (b.landing(n) >= 0) {
          this.extend(n, px, py);
          did = true;
          break;
        }
        if (b.path.length >= 2 && n === b.path[b.path.length - 2]) {
          this.rewindTo(b.path.length - 2);
          did = true;
          break;
        }
      }
      if (!did) {
        // A fast drag back over the trail: rewind to the tile under the finger.
        const tc = clamp(hc + sx, 0, cols - 1);
        const tr = clamp(hr + sy, 0, rows - 1);
        const t = tr * cols + tc;
        const at = b.lastIndexOf(t);
        if (at >= 0 && at < b.path.length - 2 && b.path.length - 1 - at <= 6) {
          this.rewindTo(at);
          continue;
        }
        this.bumpAt(cands.find((n) => n >= 0) ?? -1);
        return;
      }
      if ((this.cachedStatus as Status) === "won") return;
      // after a portal jump the finger "becomes" the brush at its new place
      const nh = b.head();
      if (b.kind[nh] === K_PORTAL) {
        px = this.cx(nh);
        py = this.cy(nh);
        this.offX = px - this.rawX;
        this.offY = py - this.rawY;
      }
    }
  }

  private bumpAt(cell: number): void {
    if (this.clock - this.lastBumpAt < 240) return;
    this.lastBumpAt = this.clock;
    this.env.audio.play("bump", { volume: 0.6 });
    this.env.haptics.impact("light");
    if (!this.env.reducedMotion) this.shakeT = 220;
    this.flashCell = cell;
    this.flashT = 320;
  }

  private rewindTo(index: number): void {
    const b = this.board;
    const before = b.path.length;
    const removed = b.rewindTo(index);
    if (removed === 0) return;
    const juice = this.env.juice;
    // a few erased droplets from the retracting tip
    for (let k = before - 1; k >= b.path.length && k >= before - 3; k--) {
      const cell = this.trail[k] ?? b.head();
      juice.particles.burst(this.cx(cell), this.cy(cell), {
        count: 2,
        colors: [this.lights[Math.min(k, this.lights.length - 1)]!],
        speed: 70,
        life: 300,
        size: 2.4,
        gravity: 200,
      });
    }
    if (this.clock - this.lastWhooshAt > 70) {
      this.lastWhooshAt = this.clock;
      this.env.audio.play("whoosh", { pitch: 0.7, volume: 0.35 });
    }
    this.hintCells = [];
    this.afterChange();
  }

  private extend(n: number, _px: number, _py: number): void {
    const b = this.board;
    const wasKind = b.kind[n];
    const wasVisited = b.visitCount(n) > 0;
    b.push(n);
    const k = b.path.length - 1;
    const landed = b.head();
    const env = this.env;
    const juice = env.juice;
    this.pop[n] = 1;
    this.pop[landed] = 1;
    const colorIdx = Math.min(k, this.colors.length - 1);
    juice.particles.burst(this.cx(landed), this.cy(landed), {
      count: 3,
      colors: [this.colors[colorIdx]!, this.lights[colorIdx]!],
      speed: 110,
      life: 420,
      size: 3,
      gravity: 380,
      drag: 1.6,
    });
    env.audio.play("select", { pitch: notePitch(k, b.required), volume: 0.45 });
    if (wasKind === K_PORTAL) {
      juice.particles.burst(this.cx(n), this.cy(n), {
        count: 10,
        colors: [PORTAL_COLORS[this.portalIndex(n)]!, "#FFFFFF"],
        shape: "ring",
        speed: 40,
        life: 420,
        size: 6,
        gravity: 0,
      });
      juice.particles.burst(this.cx(landed), this.cy(landed), {
        count: 10,
        colors: [PORTAL_COLORS[this.portalIndex(n)]!, "#FFFFFF"],
        shape: "spark",
        speed: 170,
        life: 460,
        size: 4,
        gravity: 0,
      });
      env.haptics.impact("light");
    } else if (wasKind === K_BRIDGE && wasVisited) {
      juice.text.spawn(this.cx(n), this.cy(n) - this.cell * 0.4, "Crossed!", "#FFFFFF", 16);
      env.haptics.impact("light");
    }
    this.hintCells = this.hintCells.slice();
    this.afterChange();
    if (this.cachedStatus === "won") this.startWin();
  }

  private portalIndex(cell: number): number {
    const ps = this.board.level.portals;
    for (let i = 0; i < ps.length; i++) if (ps[i]![0] === cell || ps[i]![1] === cell) return i % 3;
    return 0;
  }

  private startWin(): void {
    this.winT = 0;
    this.winDur = this.env.reducedMotion ? 250 : Math.min(1700, 750 + this.board.path.length * 16);
    this.winSpark = -1;
    this.winNotes = 0;
    this.env.haptics.impact("medium");
  }

  // ---- update ------------------------------------------------------------------------

  update(dt: number): void {
    this.clock += dt;
    const fast = this.env.reducedMotion ? 3 : 1;
    // paint pop decay
    const pop = this.pop;
    for (let i = 0; i < pop.length; i++) if (pop[i]! > 0) pop[i] = Math.max(0, pop[i]! - dt / 280);
    // trail growth / smooth erase
    const target = this.board.path.length - 1;
    const rate = (this.vis > target ? 26 : 20) * fast;
    this.vis = approach(this.vis, target, rate, dt);
    if (Math.abs(this.vis - target) < 0.02) this.vis = target;
    if (this.vis <= target + 0.001 && this.trail.length > this.board.path.length) {
      this.trail = this.board.path.slice();
    }
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.winT >= 0 && this.winT < this.winDur + 600) {
      this.winT += dt;
      this.updateWin();
    }
  }

  private updateWin(): void {
    const path = this.board.path;
    const reduced = this.env.reducedMotion;
    const wave = this.winProgress();
    const k = Math.floor(wave);
    while (this.winSpark < Math.min(k, path.length - 1) && !reduced) {
      this.winSpark++;
      const cell = path[this.winSpark]!;
      const ci = Math.min(this.winSpark, this.colors.length - 1);
      this.env.juice.particles.burst(this.cx(cell), this.cy(cell), {
        count: 2,
        colors: [this.lights[ci]!, "#FFFFFF"],
        shape: "star",
        speed: 90,
        life: 480,
        size: 4,
        gravity: -40,
      });
      const every = Math.max(2, Math.ceil(path.length / 11));
      if (this.winSpark % every === 0 && this.winNotes < 12) {
        this.winNotes++;
        this.env.audio.play("select", {
          pitch:
            notePitch(
              Math.floor((this.winSpark / path.length) * this.board.required),
              this.board.required,
            ) * 1.25,
          volume: 0.3,
        });
      }
    }
  }

  /** Shimmer head position along the path (in path indices), 0 until the wave begins. */
  private winProgress(): number {
    if (this.winT < 0) return -1;
    const delay = this.env.reducedMotion ? 0 : 120;
    const t = clamp((this.winT - delay) / Math.max(1, this.winDur - delay), 0, 1);
    return ease.inOutSine(t) * (this.board.path.length + 2) - 1;
  }

  // ---- drawing -----------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, area: Area, _now: number): void {
    this.layout(area);
    const level = this.board.level;
    const cell = this.cell;
    const shake = this.shakeT > 0 ? Math.sin(this.shakeT * 0.11) * 4 * (this.shakeT / 220) : 0;
    g.save();
    g.translate(shake, 0);
    this.drawBoard(g, level.cols, level.rows, cell);
    this.drawTrail(g);
    this.drawMarkers(g);
    g.restore();
  }

  private drawBoard(g: CanvasRenderingContext2D, cols: number, rows: number, cell: number): void {
    const b = this.board;
    const gx = this.gx;
    const gy = this.gy;
    const gw = cols * cell;
    const gh = rows * cell;
    const pad = Math.max(6, cell * 0.14);
    roundRectPath(g, gx - pad, gy - pad + 5, gw + pad * 2, gh + pad * 2, pad + 6);
    g.fillStyle = "rgba(43,33,64,0.16)";
    g.fill();
    roundRectPath(g, gx - pad, gy - pad, gw + pad * 2, gh + pad * 2, pad + 6);
    g.fillStyle = BOARD;
    g.fill();
    const inset = Math.max(1.5, cell * 0.045);
    const rad = cell * 0.2;
    for (let i = 0; i < b.total; i++) {
      const x = gx + (i % cols) * cell + inset;
      const y = gy + Math.floor(i / cols) * cell + inset;
      const s = cell - inset * 2;
      const kind = b.kind[i]!;
      if (kind === K_WALL) {
        roundRectPath(g, x, y + 2, s, s, rad);
        g.fillStyle = "rgba(43,33,64,0.35)";
        g.fill();
        roundRectPath(g, x, y, s, s, rad);
        g.fillStyle = WALL;
        g.fill();
        g.save();
        g.clip();
        g.strokeStyle = WALL_HATCH;
        g.lineWidth = Math.max(2, cell * 0.05);
        g.beginPath();
        const step = Math.max(8, cell * 0.22);
        for (let k = -cell; k < cell * 2; k += step) {
          g.moveTo(x + k, y + s);
          g.lineTo(x + k + s, y);
        }
        g.stroke();
        g.restore();
        continue;
      }
      roundRectPath(g, x, y + 2, s, s, rad);
      g.fillStyle = TILE_EDGE;
      g.fill();
      roundRectPath(g, x, y, s, s, rad);
      g.fillStyle = TILE;
      g.fill();
      const cx = x + s / 2;
      const cy = y + s / 2;
      if (kind === K_TURN) this.drawElbow(g, cx, cy, cell);
      else if (kind === K_BRIDGE) this.drawCrossing(g, cx, cy, cell, b.visitCount(i));
    }
  }

  private drawElbow(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number): void {
    const u = cell * 0.2;
    g.save();
    g.strokeStyle = GLYPH;
    g.fillStyle = GLYPH;
    g.lineWidth = Math.max(3, cell * 0.07);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(cx - u, cy + u * 1.1);
    g.lineTo(cx - u, cy - u);
    g.lineTo(cx + u * 0.6, cy - u);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + u * 1.35, cy - u);
    g.lineTo(cx + u * 0.5, cy - u * 1.7);
    g.lineTo(cx + u * 0.5, cy - u * 0.3);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawCrossing(
    g: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    cell: number,
    visits: number,
  ): void {
    const u = cell * 0.3;
    const gap = cell * 0.07;
    g.save();
    g.strokeStyle = GLYPH;
    g.lineWidth = Math.max(3, cell * 0.07);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - u, cy);
    g.lineTo(cx + u, cy);
    g.moveTo(cx, cy - u);
    g.lineTo(cx, cy - gap);
    g.moveTo(cx, cy + gap);
    g.lineTo(cx, cy + u);
    g.stroke();
    // two pips: how many of the two crossings are done
    for (let i = 0; i < 2; i++) {
      const px = cx + (i === 0 ? -1 : 1) * cell * 0.3;
      const py = cy + cell * 0.32;
      g.beginPath();
      g.arc(px, py, cell * 0.06, 0, Math.PI * 2);
      g.fillStyle = i < visits ? INK : "#FFFDF9";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = GLYPH;
      g.stroke();
    }
    g.restore();
  }

  private drawTrail(g: CanvasRenderingContext2D): void {
    const trail = this.trail;
    const vis = this.vis;
    const cell = this.cell;
    const b = this.board;
    const full = Math.min(Math.floor(vis), trail.length - 1);
    const frac = vis - full;
    const segs = full + (frac > 0.001 && full < trail.length - 1 ? 1 : 0);
    if (segs <= 0 && trail.length <= 1) return;
    const base = cell * 0.5;
    const wave = this.winProgress();
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < segs; k++) {
        const a = trail[k]!;
        const c2 = trail[k + 1]!;
        if (b.axisOf(a, c2) < 0) continue; // portal jump: no stroke
        const t = k + 1 <= vis ? 1 : frac;
        const x1 = this.cx(a);
        const y1 = this.cy(a);
        const x2 = x1 + (this.cx(c2) - x1) * t;
        const y2 = y1 + (this.cy(c2) - y1) * t;
        const p = Math.max(this.pop[a]!, this.pop[c2]!);
        const w = base * (1 + 0.3 * p);
        const ci = Math.min(k + 1, this.colors.length - 1);
        if (pass === 0) {
          g.strokeStyle = this.darks[ci]!;
          g.lineWidth = w + cell * 0.1;
        } else if (pass === 1) {
          g.strokeStyle = this.colors[ci]!;
          g.lineWidth = w;
        } else {
          g.strokeStyle = this.lights[ci]!;
          g.globalAlpha = 0.55;
          g.lineWidth = w * 0.28;
          // highlight rides on the upper-left edge of the wet stroke
          const o = w * 0.2;
          g.beginPath();
          g.moveTo(x1 - o * 0.5, y1 - o);
          g.lineTo(x2 - o * 0.5, y2 - o);
          g.stroke();
          g.globalAlpha = 1;
          if (wave >= 0) {
            const d = Math.abs(k + 0.5 - wave);
            if (d < 3) {
              g.globalAlpha = (1 - d / 3) * 0.85;
              g.strokeStyle = "#FFFFFF";
              g.lineWidth = w * (0.75 - d * 0.1);
              g.beginPath();
              g.moveTo(x1, y1);
              g.lineTo(x2, y2);
              g.stroke();
              g.globalAlpha = 1;
            }
          }
          continue;
        }
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
    }
    // single-tile trail: nothing to stroke, the brush head below shows the start
  }

  private drawMarkers(g: CanvasRenderingContext2D): void {
    const b = this.board;
    const cell = this.cell;
    const clock = this.clock;
    const level = b.level;
    const vis = this.vis;
    // portals
    level.portals.forEach(([pa, pb], i) => {
      const col = PORTAL_COLORS[i % 3]!;
      for (const [c, label] of [
        [pa, i + 1],
        [pb, i + 1],
      ] as const) {
        const x = this.cx(c);
        const y = this.cy(c);
        const k = this.trail.indexOf(c);
        const painted = k >= 0 && k <= vis + 0.5;
        const r = cell * 0.34;
        if (painted) {
          const ci = Math.min(k, this.colors.length - 1);
          g.beginPath();
          g.arc(x, y, r * (1 + 0.25 * this.pop[c]!), 0, Math.PI * 2);
          g.fillStyle = this.colors[ci]!;
          g.fill();
          g.lineWidth = Math.max(2, cell * 0.05);
          g.strokeStyle = this.darks[ci]!;
          g.stroke();
        }
        g.save();
        g.lineWidth = Math.max(2.5, cell * 0.07);
        g.strokeStyle = col;
        g.lineCap = "round";
        g.setLineDash([cell * 0.16, cell * 0.1]);
        g.lineDashOffset = -clock * 0.02 * (c === pa ? 1 : -1);
        g.beginPath();
        g.arc(x, y, r + (painted ? 3 : 0), 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.arc(x, y, r * 0.55, 0, Math.PI * 2);
        g.fillStyle = col;
        g.globalAlpha = painted ? 0.9 : 0.18;
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = painted ? "#FFFFFF" : col;
        g.font = `800 ${Math.round(cell * 0.3)}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(label), x, y + 1);
        g.restore();
      }
    });

    // next-move dots
    if (this.cachedStatus === "playing" && this.hintCells.length === 0) {
      const ci = Math.min(b.path.length, this.colors.length - 1);
      const pulse = 0.5 + 0.5 * Math.sin(clock * 0.006);
      g.fillStyle = this.colors[ci]!;
      for (const n of this.cachedMoves) {
        const land = b.landing(n);
        const target = land >= 0 && b.kind[n] === K_PORTAL ? n : n;
        g.globalAlpha = 0.28 + 0.3 * pulse;
        g.beginPath();
        g.arc(this.cx(target), this.cy(target), cell * (0.1 + 0.03 * pulse), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    // hint: the next cells of a valid solution
    if (this.hintCells.length) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 0.008);
      this.hintCells.forEach((c, i) => {
        const x = this.cx(c);
        const y = this.cy(c);
        const r = cell * (0.27 + 0.03 * pulse);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = "#FFFFFF";
        g.fill();
        g.lineWidth = Math.max(3, cell * 0.07);
        g.strokeStyle = THEME.accent;
        g.stroke();
        g.fillStyle = INK;
        g.font = `800 ${Math.round(cell * 0.3)}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(i + 1), x, y + 1);
      });
    }

    // blocked flash
    if (this.flashT > 0 && this.flashCell >= 0) {
      const x = this.cx(this.flashCell) - cell / 2;
      const y = this.cy(this.flashCell) - cell / 2;
      g.globalAlpha = (this.flashT / 320) * 0.5;
      roundRectPath(g, x + 2, y + 2, cell - 4, cell - 4, cell * 0.2);
      g.fillStyle = "#E5484D";
      g.fill();
      g.globalAlpha = 1;
    }

    // start star
    const sc = b.level.start;
    const bob = this.env.reducedMotion ? 0 : Math.sin(clock * 0.004) * cell * 0.02;
    starPath(
      g,
      this.cx(sc),
      this.cy(sc) + bob,
      cell * 0.27,
      cell * 0.12,
      Math.sin(clock * 0.0015) * 0.12,
    );
    g.fillStyle = "#FFD23F";
    g.fill();
    g.lineWidth = Math.max(2, cell * 0.05);
    g.lineJoin = "round";
    g.strokeStyle = INK;
    g.stroke();

    // brush head
    const trail = this.trail;
    const f = Math.min(Math.floor(vis), trail.length - 1);
    const a = trail[f]!;
    const nx = trail[Math.min(f + 1, trail.length - 1)]!;
    let hx = this.cx(a);
    let hy = this.cy(a);
    if (nx !== a && b.axisOf(a, nx) >= 0) {
      const t = vis - f;
      hx += (this.cx(nx) - hx) * t;
      hy += (this.cy(nx) - hy) * t;
    } else if (nx !== a && vis - f > 0.5) {
      hx = this.cx(nx);
      hy = this.cy(nx);
    }
    const ci = Math.min(Math.round(vis), this.colors.length - 1);
    const breathe = this.env.reducedMotion ? 0 : Math.sin(clock * 0.006) * cell * 0.015;
    const hp = this.pop[b.head()] ?? 0;
    const r = cell * 0.3 + breathe + hp * cell * 0.06;
    if (f > 0 || vis > 0.01) {
      g.beginPath();
      g.arc(hx, hy + 2, r + 2, 0, Math.PI * 2);
      g.fillStyle = "rgba(43,33,64,0.3)";
      g.fill();
      g.beginPath();
      g.arc(hx, hy, r, 0, Math.PI * 2);
      g.fillStyle = this.colors[ci]!;
      g.fill();
      g.lineWidth = Math.max(2, cell * 0.05);
      g.strokeStyle = this.darks[ci]!;
      g.stroke();
      g.beginPath();
      g.arc(hx - r * 0.3, hy - r * 0.34, r * 0.28, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.fill();
    } else {
      // waiting at the start: a breathing ring invites the first drag
      const pulse = 0.5 + 0.5 * Math.sin(clock * 0.005);
      g.beginPath();
      g.arc(hx, hy, cell * (0.4 + 0.05 * pulse), 0, Math.PI * 2);
      g.lineWidth = Math.max(2.5, cell * 0.06);
      g.strokeStyle = this.colors[0]!;
      g.globalAlpha = 0.9;
      g.stroke();
      g.globalAlpha = 1;
    }
    void K_OPEN;
  }
}

export default createLevelGame({
  slug: SLUG,
  title: "Paint Path",
  levelCount: LEVEL_COUNT,
  theme: THEME,
  worlds: WORLDS.map((w) => ({ name: w.name, from: w.from })),
  create: (env: Env) => new PaintController(env),
});
