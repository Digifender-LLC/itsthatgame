// Pin Drop: pull the pins in the right order so every ball lands in the cup. Rules and the
// solver live in logic.ts (pure, tested); this file animates the model and handles touch.
import {
  FONT,
  PIECE_COLORS,
  PIECE_GLYPHS,
  approach,
  clamp,
  createLevelGame,
  ease,
  inkFor,
  roundRectPath,
  shade,
  type Area,
  type Env,
  type LevelController,
  type PointerPoint,
} from "@itg/game-sdk";
import { INTROS, LEVEL_COUNT, WORLDS, getLevel, getPar } from "./levels";
import {
  PinDropGame,
  cellAt,
  gateChannel,
  sensorChannel,
  solveFrom,
  type Frame,
  type FrameBall,
  type LossReason,
  type Removal,
  type Status,
} from "./logic";

export const SLUG = "pin-drop";

/** Milliseconds per gravity tick. */
const TICK_MS = 95;
/** Pin slides out before the contents start to move. */
const LEAD_MS = 170;
const TAIL_MS = 320;
const FAST_FORWARD = 4;
const SWIPE_PX = 14;

const COLORS = {
  void: "#101A24",
  wall: "#42566D",
  wallHi: "#6A83A0",
  wallLo: "#2A3A4B",
  frame: "#6F88A5",
  ramp: "#7FB0D0",
  rampHi: "#B8DAEE",
  rampLo: "#4D7D9C",
  brass: "#E0A93B",
  brassHi: "#F8DC8A",
  brassLo: "#8A5F14",
  rock: "#8A8793",
  rockEdge: "#2A2830",
  cupGeneric: "#3DDC97",
  lava: "#FF6A1F",
  lavaHi: "#FFC24A",
  lavaLo: "#8C230B",
  gate: "#F2B84B",
  gateAlt: "#B58CFF",
  ink: "#0B1118",
};

const DUST = ["#C9B99D", "#9C8F7C", "#E6DAC3"];
const STEAM = ["#FFFFFF", "#D9E6F0"];
const SPARKS = ["#FFC24A", "#FF6A1F", "#FFE9A8"];

const REASONS: Record<LossReason, string> = {
  crush: "A rock touched a ball. Keep them apart.",
  rock: "A rock fell into the cup.",
  stuck: "No pins left and balls are stranded.",
  lava: "A ball fell into lava. Cool it with a rock first.",
  wrong: "That ball went into the wrong cup.",
};

export interface Geometry {
  cell: number;
  x0: number;
  y0: number;
  ringR: number;
}

const RING_R = 14;

export function computeGeometry(area: Area, w: number, h: number): Geometry {
  const margin = RING_R * 2 + 6;
  const cell = Math.max(10, Math.floor(Math.min((area.w - 2 * margin) / w, (area.h - 24) / h)));
  return {
    cell,
    x0: area.x + (area.w - cell * w) / 2,
    y0: area.y + (area.h - cell * h) / 2 + 4,
    ringR: RING_R,
  };
}

/** -1 when the pin's handle sticks out of the left edge, +1 for the right edge. */
export function pinSides(pins: readonly { x: number; y: number }[], w: number): number[] {
  return pins.map((p, i) => {
    const row = pins
      .map((q, j) => ({ q, j }))
      .filter((o) => o.q.y === p.y)
      .sort((a, b) => a.q.x - b.q.x);
    if (row.length === 1) return p.x < (w - 1) / 2 ? -1 : 1;
    const k = row.findIndex((o) => o.j === i);
    return k < row.length / 2 ? -1 : 1;
  });
}

interface Anim {
  frames: Frame[];
  /** Milliseconds into the animation; negative while the pin slides out. */
  t: number;
  k: number;
  speed: number;
}

interface Shown {
  open: number;
  cooled: Set<number>;
  cup: number[];
  collected: number;
}

const find = (list: readonly FrameBall[], id: number): FrameBall | undefined => {
  for (const b of list) if (b.id === id) return b;
  return undefined;
};

class PinDropController implements LevelController {
  private game: PinDropGame;
  private index = 0;
  private doOvers = 0;
  private anim: Anim | null = null;
  private shown: Shown = { open: 0, cooled: new Set(), cup: [], collected: 0 };
  private fill: number[] = [];
  private gateAmt = [0, 0];
  private cupPulse: number[] = [];
  private land = new Map<number, number>();
  private pinFx = new Map<number, number>();
  private press: { i: number; x: number; y: number } | null = null;
  private hintPin = -1;
  private hintT = 0;
  private clock = 0;
  private area: Area | null = null;
  private sides: number[] = [];

  constructor(private readonly env: Env) {
    this.game = new PinDropGame(getLevel(0));
    this.afterLoad();
  }

  // ---- lifecycle ----------------------------------------------------------

  private afterLoad(): void {
    const s = this.game.state;
    this.sides = pinSides(s.pins, s.w);
    this.anim = null;
    this.press = null;
    this.hintPin = -1;
    this.land.clear();
    this.pinFx.clear();
    this.syncShown();
    this.fill = this.shown.cup.map(() => 0);
    this.cupPulse = this.shown.cup.map(() => 0);
    this.gateAmt = [(this.shown.open & 1) !== 0 ? 1 : 0, (this.shown.open & 2) !== 0 ? 1 : 0];
  }

  private syncShown(): void {
    const s = this.game.state;
    this.shown = {
      open: s.open,
      cooled: new Set(s.cooled),
      cup: s.cups.map((c) => c.n),
      collected: s.collected,
    };
  }

  loadLevel(index: number): void {
    this.index = index;
    this.game = new PinDropGame(getLevel(index));
    this.doOvers = 0;
    this.afterLoad();
  }

  restart(): void {
    if (this.game.status() !== "won" && this.game.pulled() > 0) this.doOvers++;
    this.game.restart();
    this.afterLoad();
  }

  undo(): void {
    if (!this.game.canUndo()) return;
    this.doOvers++;
    this.game.undo();
    this.anim = null;
    this.press = null;
    this.land.clear();
    this.pinFx.clear();
    this.syncShown();
  }

  canUndo(): boolean {
    return this.game.canUndo();
  }

  status(): Status {
    return this.anim ? "playing" : this.game.status();
  }

  busy(): boolean {
    return this.anim !== null;
  }

  lostMessage(): string {
    const r = this.game.reason();
    return r ? REASONS[r] : "Try again.";
  }

  intro(index: number): string | undefined {
    return INTROS[index];
  }

  hudInfo(): string {
    const s = this.game.state;
    return `Pins ${this.game.pulled()} · par ${getPar(this.index)} · Cup ${this.shown.collected}/${s.totalGood}`;
  }

  /**
   * 3 stars: no more than par pins and at most one do-over (undo, restart or a lost try).
   * 2 stars: at most one pin over par and few do-overs. 1 star: any win.
   */
  stars(): number {
    const extra = Math.max(0, this.game.pulled() - getPar(this.index));
    const penalty = extra * 2 + this.doOvers;
    return penalty <= 1 ? 3 : penalty <= 4 ? 2 : 1;
  }

  hint(): boolean {
    if (this.anim || this.game.status() !== "playing") return false;
    const sol = solveFrom(this.game.state);
    if (!sol || sol.length === 0) return false;
    this.hintPin = sol[0]!;
    this.hintT = 3600;
    return true;
  }

  // ---- input --------------------------------------------------------------

  private geo(area: Area): Geometry {
    const s = this.game.state;
    return computeGeometry(area, s.w, s.h);
  }

  /** The pin under a touch: its rod, ring and a generous band around it. */
  private pinAt(p: PointerPoint, area: Area): number {
    const geo = this.geo(area);
    const c = geo.cell;
    const s = this.game.state;
    const band = Math.max(c * 0.5, 22);
    let best = -1;
    let bestD = Infinity;
    s.pins.forEach((pin, i) => {
      if (pin.pulled) return;
      const cx = geo.x0 + (pin.x + 0.5) * c;
      const cy = geo.y0 + (pin.y + 0.5) * c;
      const side = this.sides[i]!;
      const edge = side < 0 ? geo.x0 - geo.ringR * 2 - 6 : geo.x0 + s.w * c + geo.ringR * 2 + 6;
      const xa = Math.min(edge, cx - c * 0.5);
      const xb = Math.max(edge, cx + c * 0.5);
      const inBand = p.x >= xa && p.x <= xb && Math.abs(p.y - cy) <= band;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (inBand || d <= Math.max(c * 1.1, 30)) {
        const score = Math.abs(p.y - cy) * 2 + Math.abs(p.x - cx) * 0.2;
        if (score < bestD) {
          bestD = score;
          best = i;
        }
      }
    });
    return best;
  }

  down(p: PointerPoint, area: Area): void {
    this.area = area;
    if (this.anim) {
      this.anim.speed = FAST_FORWARD;
      return;
    }
    if (this.game.status() !== "playing") return;
    const i = this.pinAt(p, area);
    if (i < 0) return;
    this.press = { i, x: p.x, y: p.y };
    this.env.audio.play("tap", { volume: 0.4, pitch: 1.4 });
  }

  move(p: PointerPoint): void {
    const pr = this.press;
    if (!pr) return;
    if (Math.hypot(p.x - pr.x, p.y - pr.y) >= SWIPE_PX) {
      this.press = null;
      this.pull(pr.i);
    }
  }

  up(): void {
    const pr = this.press;
    this.press = null;
    if (pr) this.pull(pr.i);
  }

  private pull(i: number): void {
    if (this.anim) return;
    const frames = this.game.pull(i);
    if (!frames) return;
    this.hintPin = -1;
    this.env.audio.play("whoosh", { pitch: 1.15, volume: 0.8 });
    this.env.haptics.impact("light");
    if (this.env.reducedMotion) {
      for (let k = 1; k < frames.length; k++) this.onFrame(frames, k, true);
      this.syncShown();
      return;
    }
    this.pinFx.set(i, 0);
    this.anim = { frames, t: -LEAD_MS, k: 0, speed: 1 };
  }

  // ---- animation events ---------------------------------------------------

  private centre(x: number, y: number): { x: number; y: number } {
    const geo = this.geo(this.area ?? { x: 0, y: 60, w: 390, h: 720 });
    return { x: geo.x0 + (x + 0.5) * geo.cell, y: geo.y0 + (y + 0.5) * geo.cell };
  }

  private cellPx(): number {
    return this.geo(this.area ?? { x: 0, y: 60, w: 390, h: 720 }).cell;
  }

  private onFrame(frames: Frame[], k: number, quiet: boolean): void {
    const f = frames[k]!;
    const prev = frames[k - 1]!;
    const next = frames[k + 1];
    const s = this.game.state;
    const { audio, juice, haptics } = this.env;
    const c = this.cellPx();
    if (f.opened) {
      for (let ch = 0; ch < 2; ch++) {
        if (!(f.opened & (1 << ch))) continue;
        this.shown.open |= 1 << ch;
        audio.play("unlock", { volume: 0.9 });
        haptics.impact("medium");
        for (let y = 0; y < s.h; y++) {
          for (let x = 0; x < s.w; x++) {
            if (gateChannel(s.cells[y]![x]!) === ch) {
              const p = this.centre(x, y);
              juice.particles.burst(p.x, p.y, {
                count: 10,
                colors: [ch ? COLORS.gateAlt : COLORS.gate, "#FFFFFF"],
                speed: 160,
                shape: "spark",
                size: 4,
                gravity: 200,
              });
            }
          }
        }
      }
    }
    for (const r of f.removed) this.onRemoval(r, c);
    // landings: moved this tick and at rest on the next
    let plinks = 0;
    for (const b of f.balls) {
      const pb = find(prev.balls, b.id);
      if (!pb || (pb.x === b.x && pb.y === b.y)) continue;
      if (next) {
        const nb = find(next.balls, b.id);
        if (!nb || nb.x !== b.x || nb.y !== b.y) continue;
      }
      this.land.set(b.id, 0);
      if (quiet || plinks >= 2) continue;
      plinks++;
      if (b.kind === "rock") {
        audio.play("drop", { pitch: 0.55, volume: 0.9 });
        const p = this.centre(b.x, b.y);
        juice.particles.burst(p.x, p.y + c * 0.3, {
          count: 5,
          colors: DUST,
          speed: 70,
          gravity: 60,
          size: 4,
          life: 500,
          angle: -Math.PI / 2,
          spread: Math.PI,
        });
      } else {
        audio.play("drop", { pitch: 0.85 + b.x * 0.07 + (b.id % 3) * 0.05, volume: 0.7 });
      }
    }
  }

  private onRemoval(r: Removal, c: number): void {
    const { audio, juice, haptics } = this.env;
    const s = this.game.state;
    const p = this.centre(r.x, r.y);
    const tint = r.kind === "good" ? PIECE_COLORS[r.color % PIECE_COLORS.length]! : COLORS.rock;
    switch (r.why) {
      case "cup": {
        this.shown.cup[r.cup] = (this.shown.cup[r.cup] ?? 0) + 1;
        this.shown.collected++;
        this.cupPulse[r.cup] = 1;
        const n = this.shown.collected;
        const total = s.totalGood;
        audio.play("success", { pitch: Math.min(2, 0.9 + 0.1 * n), volume: 0.9 });
        haptics.impact("light");
        juice.particles.burst(p.x, p.y - c * 0.2, {
          count: 14,
          colors: [tint, "#FFFFFF"],
          speed: 230,
          angle: -Math.PI / 2,
          spread: 1.5,
          gravity: 760,
          size: 4.5,
        });
        juice.particles.burst(p.x, p.y - c * 0.35, {
          count: 1,
          colors: ["#FFFFFF"],
          speed: 0,
          shape: "ring",
          size: c * 0.18,
          life: 420,
          gravity: 0,
        });
        juice.text.spawn(p.x, p.y - c * 0.8, `${n}/${total}`, "#FFFFFF", 18);
        if (n === total) {
          audio.play("perfect", { volume: 0.9 });
          juice.particles.burst(p.x, p.y - c * 0.5, {
            count: 22,
            colors: [...PIECE_COLORS],
            speed: 320,
            shape: "star",
            gravity: 500,
            size: 6,
            life: 1000,
          });
        }
        break;
      }
      case "crush":
      case "rock":
        audio.play("bump", { pitch: 0.55, volume: 1 });
        haptics.impact("heavy");
        juice.shake.kick(0.6);
        juice.particles.burst(p.x, p.y, {
          count: 22,
          colors: DUST,
          speed: 150,
          gravity: 90,
          size: 7,
          life: 800,
          drag: 2.2,
        });
        juice.particles.burst(p.x, p.y, {
          count: 1,
          colors: ["#FF6B5E"],
          speed: 0,
          shape: "ring",
          size: c * 0.5,
          life: 460,
          gravity: 0,
        });
        break;
      case "wrong":
        audio.play("bump", { pitch: 0.7 });
        haptics.impact("heavy");
        juice.shake.kick(0.5);
        juice.particles.burst(p.x, p.y - c * 0.2, {
          count: 12,
          colors: ["#FF6B5E", tint],
          speed: 180,
          size: 4,
          gravity: 500,
        });
        break;
      case "lava":
        audio.play("bump", { pitch: 0.5 });
        audio.play("pop", { pitch: 0.5, volume: 0.6 });
        haptics.impact("heavy");
        juice.shake.kick(0.5);
        juice.particles.burst(p.x, p.y - c * 0.2, {
          count: 20,
          colors: SPARKS,
          speed: 260,
          angle: -Math.PI / 2,
          spread: 2,
          shape: "spark",
          gravity: 600,
          size: 5,
        });
        break;
      case "cool":
        this.shown.cooled.add(r.y * s.w + r.x);
        audio.play("pop", { pitch: 0.6, volume: 0.9 });
        audio.play("whoosh", { pitch: 1.8, volume: 0.5 });
        haptics.impact("medium");
        juice.particles.burst(p.x, p.y - c * 0.2, {
          count: 14,
          colors: STEAM,
          speed: 70,
          angle: -Math.PI / 2,
          spread: 1.2,
          gravity: -140,
          size: 8,
          life: 1000,
          drag: 0.8,
        });
        break;
    }
  }

  // ---- update -------------------------------------------------------------

  update(dt: number): void {
    this.clock += dt;
    for (const [id, t] of this.land) {
      if (t + dt > TAIL_MS) this.land.delete(id);
      else this.land.set(id, t + dt);
    }
    for (const [i, t] of this.pinFx) {
      if (t + dt > 460) this.pinFx.delete(i);
      else this.pinFx.set(i, t + dt);
    }
    if (this.hintT > 0) this.hintT -= dt;
    const s = this.game.state;
    for (let i = 0; i < this.fill.length; i++) {
      const cup = s.cups[i]!;
      const target = cup.need > 0 ? (this.shown.cup[i] ?? 0) / cup.need : 0;
      this.fill[i] = approach(this.fill[i]!, target, 7, dt);
      this.cupPulse[i] = Math.max(0, (this.cupPulse[i] ?? 0) - dt / 360);
    }
    for (let ch = 0; ch < 2; ch++) {
      const target = (this.shown.open & (1 << ch)) !== 0 ? 1 : 0;
      this.gateAmt[ch] = approach(this.gateAmt[ch]!, target, 9, dt);
    }
    const a = this.anim;
    if (!a) return;
    a.t += dt * a.speed;
    const idx = a.t < 0 ? 0 : Math.min(a.frames.length - 1, Math.floor(a.t / TICK_MS));
    while (a.k < idx) {
      a.k++;
      this.onFrame(a.frames, a.k, false);
    }
    if (a.t >= (a.frames.length - 1) * TICK_MS + TAIL_MS * 0.6) {
      this.anim = null;
      this.syncShown();
    }
  }

  // ---- drawing ------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, area: Area, now: number): void {
    this.area = area;
    const geo = this.geo(area);
    this.drawBoard(g, geo, now);
    this.drawPins(g, geo, now);
    this.drawBalls(g, geo, now);
    this.drawCupsFront(g, geo);
    this.drawHint(g, geo, now);
  }

  private wallAt(x: number, y: number): boolean {
    const s = this.game.state;
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return true;
    return s.cells[y]![x] === "#";
  }

  private drawBoard(g: CanvasRenderingContext2D, geo: Geometry, now: number): void {
    const s = this.game.state;
    const c = geo.cell;
    const bw = c * s.w;
    const bh = c * s.h;
    // soft drop shadow of the whole board, then the void behind the chambers
    roundRectPath(g, geo.x0 - 4, geo.y0 + 2, bw + 8, bh + 10, 14);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fill();
    roundRectPath(g, geo.x0 - 6, geo.y0 - 6, bw + 12, bh + 12, 14);
    g.fillStyle = COLORS.void;
    g.fill();
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const px = geo.x0 + x * c;
        const py = geo.y0 + y * c;
        const cell = cellAt(s, x, y);
        const raw = s.cells[y]![x]!;
        if (cell === "#") {
          g.fillStyle = COLORS.wall;
          g.fillRect(px, py, c + 0.6, c + 0.6);
          if (!this.wallAt(x, y - 1)) {
            g.fillStyle = COLORS.wallHi;
            g.fillRect(px, py, c + 0.6, 2.5);
          }
          if (!this.wallAt(x, y + 1)) {
            g.fillStyle = COLORS.wallLo;
            g.fillRect(px, py + c - 3, c + 0.6, 3.5);
          }
          if (!this.wallAt(x - 1, y)) {
            g.fillStyle = COLORS.wallHi;
            g.fillRect(px, py, 2, c + 0.6);
          }
          if (!this.wallAt(x + 1, y)) {
            g.fillStyle = COLORS.wallLo;
            g.fillRect(px + c - 2, py, 2.5, c + 0.6);
          }
        } else if (cell === ">" || cell === "<") {
          this.drawRamp(g, px, py, c, cell === ">" ? 1 : -1);
        } else if (cell === "." && raw === "~") {
          this.drawCooled(g, px, py, c);
        } else if (cell === "~") {
          this.drawLava(g, px, py, c, now, x);
        } else if (sensorChannel(cell) >= 0) {
          this.drawSensor(g, px, py, c, sensorChannel(cell));
        }
      }
    }
    // pin slots: the groove each rod slides in
    s.pins.forEach((pin, i) => {
      const cy = geo.y0 + (pin.y + 0.5) * c;
      const side = this.sides[i]!;
      const xa = side < 0 ? geo.x0 : geo.x0 + (pin.x + 0.5) * c;
      const xb = side < 0 ? geo.x0 + (pin.x + 0.5) * c : geo.x0 + bw;
      g.fillStyle = "rgba(0,0,0,0.38)";
      g.fillRect(xa, cy - c * 0.14, xb - xa, c * 0.28);
    });
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const cell = cellAt(s, x, y);
        const px = geo.x0 + x * c;
        const py = geo.y0 + y * c;
        if (gateChannel(cell) >= 0) this.drawGate(g, px, py, c, gateChannel(cell), now);
      }
    }
    s.cups.forEach((cup, i) => this.drawCupBack(g, geo, cup, i));
    // frame
    roundRectPath(g, geo.x0 - 6, geo.y0 - 6, bw + 12, bh + 12, 14);
    g.lineWidth = 4;
    g.strokeStyle = COLORS.frame;
    g.stroke();
  }

  private drawRamp(g: CanvasRenderingContext2D, px: number, py: number, c: number, dir: number) {
    const y1 = py + c * 0.5;
    const y2 = py + c * 0.9;
    const [ya, yb] = dir > 0 ? [y1, y2] : [y2, y1];
    g.beginPath();
    g.moveTo(px, ya);
    g.lineTo(px + c, yb);
    g.lineTo(px + c, py + c);
    g.lineTo(px, py + c);
    g.closePath();
    g.fillStyle = COLORS.ramp;
    g.fill();
    g.beginPath();
    g.moveTo(px, ya);
    g.lineTo(px + c, yb);
    g.lineWidth = 3;
    g.strokeStyle = COLORS.rampHi;
    g.lineCap = "round";
    g.stroke();
    // chevron
    const mx = px + c / 2;
    const my = py + c * 0.8;
    g.beginPath();
    g.moveTo(mx - dir * c * 0.12, my - c * 0.08);
    g.lineTo(mx + dir * c * 0.1, my);
    g.lineTo(mx - dir * c * 0.12, my + c * 0.08);
    g.lineWidth = Math.max(2, c * 0.06);
    g.strokeStyle = COLORS.rampLo;
    g.lineJoin = "round";
    g.stroke();
  }

  private drawLava(
    g: CanvasRenderingContext2D,
    px: number,
    py: number,
    c: number,
    now: number,
    seed: number,
  ) {
    g.fillStyle = COLORS.lavaLo;
    g.fillRect(px, py, c + 0.5, c + 0.5);
    // wavy glowing surface
    const top = py + c * 0.22;
    g.beginPath();
    g.moveTo(px, py + c);
    g.lineTo(px, top);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const fx = i / steps;
      g.lineTo(px + c * fx, top + Math.sin(now / 330 + seed + fx * 5) * c * 0.05);
    }
    g.lineTo(px + c, py + c);
    g.closePath();
    g.fillStyle = COLORS.lava;
    g.fill();
    g.fillStyle = COLORS.lavaHi;
    const bub = (Math.sin(now / 520 + seed * 2.3) + 1) / 2;
    g.beginPath();
    g.arc(px + c * 0.32, py + c * (0.7 - bub * 0.25), c * 0.07, 0, Math.PI * 2);
    g.arc(px + c * 0.7, py + c * (0.6 + bub * 0.15), c * 0.05, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px + c * 0.1, top - 1, c * 0.8, 2.5);
    // warning hatch so lava never relies on colour alone
    g.strokeStyle = "rgba(60,10,0,0.55)";
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      g.moveTo(px + c * (0.15 + i * 0.3), py + c * 0.95);
      g.lineTo(px + c * (0.3 + i * 0.3), py + c * 0.5);
    }
    g.stroke();
  }

  private drawCooled(g: CanvasRenderingContext2D, px: number, py: number, c: number) {
    roundRectPath(g, px + c * 0.06, py + c * 0.5, c * 0.88, c * 0.46, c * 0.12);
    g.fillStyle = "#3A3338";
    g.fill();
    g.strokeStyle = "rgba(255,120,40,0.7)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px + c * 0.2, py + c * 0.7);
    g.lineTo(px + c * 0.45, py + c * 0.62);
    g.lineTo(px + c * 0.6, py + c * 0.82);
    g.lineTo(px + c * 0.82, py + c * 0.7);
    g.stroke();
  }

  private chanColor(ch: number): string {
    return ch === 0 ? COLORS.gate : COLORS.gateAlt;
  }

  private drawSensor(g: CanvasRenderingContext2D, px: number, py: number, c: number, ch: number) {
    const pressed = (this.shown.open & (1 << ch)) !== 0;
    const col = this.chanColor(ch);
    const h = c * (pressed ? 0.1 : 0.2);
    roundRectPath(g, px + c * 0.12, py + c - h - 1, c * 0.76, h, 3);
    g.fillStyle = pressed ? shade(col, -0.35) : col;
    g.fill();
    // glyph: diamond for channel 0, circle for channel 1
    g.fillStyle = COLORS.ink;
    g.beginPath();
    const cx = px + c / 2;
    const cy = py + c - h / 2 - 1;
    const r = Math.min(h * 0.32, 3);
    if (ch === 0) {
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
    } else g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  private drawGate(
    g: CanvasRenderingContext2D,
    px: number,
    py: number,
    c: number,
    ch: number,
    now: number,
  ) {
    const amt = this.gateAmt[ch] ?? 0;
    const col = this.chanColor(ch);
    const full = c * 0.9;
    const h = full * (1 - amt);
    // housing
    g.fillStyle = shade(col, -0.4);
    g.fillRect(px, py, c, c * 0.1);
    if (h > 1) {
      const bars = 3;
      for (let i = 0; i < bars; i++) {
        const bx = px + c * (0.14 + (i * 0.72) / (bars - 1)) - c * 0.07;
        g.fillStyle = col;
        g.fillRect(bx, py + c * 0.1, c * 0.14, h);
        g.fillStyle = shade(col, 0.4);
        g.fillRect(bx, py + c * 0.1, c * 0.04, h);
      }
      // idle hum: a bright pip travels along the bars
      g.fillStyle = "rgba(255,255,255,0.7)";
      const t = (now / 900) % 1;
      g.fillRect(px + c * 0.07, py + c * 0.1 + h * t, c * 0.86, 2);
    }
    // cap glyph
    g.fillStyle = COLORS.ink;
    g.beginPath();
    const cx = px + c / 2;
    const cy = py + c * 0.05;
    const r = c * 0.045;
    if (ch === 0) {
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
    } else g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  private cupColor(cls: number): string {
    return cls >= 0 ? PIECE_COLORS[cls % PIECE_COLORS.length]! : COLORS.cupGeneric;
  }

  private cupPath(g: CanvasRenderingContext2D, px: number, py: number, c: number) {
    g.beginPath();
    g.moveTo(px + c * 0.1, py + c * 0.14);
    g.lineTo(px + c * 0.2, py + c * 0.94);
    g.lineTo(px + c * 0.8, py + c * 0.94);
    g.lineTo(px + c * 0.9, py + c * 0.14);
    g.closePath();
  }

  private drawCupBack(
    g: CanvasRenderingContext2D,
    geo: Geometry,
    cup: { x: number; y: number; cls: number },
    i: number,
  ) {
    const c = geo.cell;
    const px = geo.x0 + cup.x * c;
    const py = geo.y0 + cup.y * c;
    const col = this.cupColor(cup.cls);
    const pulse = ease.pulse(this.cupPulse[i] ?? 0);
    g.save();
    g.translate(px + c / 2, py + c * 0.94);
    g.scale(1 + pulse * 0.1, 1 - pulse * 0.08);
    g.translate(-(px + c / 2), -(py + c * 0.94));
    this.cupPath(g, px, py, c);
    g.fillStyle = "#1E3144";
    g.fill();
    g.save();
    this.cupPath(g, px, py, c);
    g.clip();
    const f = clamp(this.fill[i] ?? 0, 0, 1);
    const top = py + c * 0.94 - f * c * 0.78;
    g.fillStyle = col;
    g.fillRect(px, top, c, py + c - top);
    g.fillStyle = shade(col, 0.35);
    g.fillRect(px, top, c, 2.5);
    g.restore();
    g.restore();
  }

  private drawCupsFront(g: CanvasRenderingContext2D, geo: Geometry): void {
    const s = this.game.state;
    const c = geo.cell;
    s.cups.forEach((cup, i) => {
      const px = geo.x0 + cup.x * c;
      const py = geo.y0 + cup.y * c;
      const col = this.cupColor(cup.cls);
      const pulse = ease.pulse(this.cupPulse[i] ?? 0);
      g.save();
      g.translate(px + c / 2, py + c * 0.94);
      g.scale(1 + pulse * 0.1, 1 - pulse * 0.08);
      g.translate(-(px + c / 2), -(py + c * 0.94));
      this.cupPath(g, px, py, c);
      g.lineWidth = Math.max(3, c * 0.09);
      g.lineJoin = "round";
      g.strokeStyle = shade(col, 0.15);
      g.stroke();
      // glass highlight and rim lip
      g.beginPath();
      g.moveTo(px + c * 0.22, py + c * 0.26);
      g.lineTo(px + c * 0.28, py + c * 0.8);
      g.lineWidth = 2.5;
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.stroke();
      roundRectPath(g, px + c * 0.04, py + c * 0.08, c * 0.92, c * 0.1, c * 0.05);
      g.fillStyle = shade(col, 0.3);
      g.fill();
      g.restore();
      const n = this.shown.cup[i] ?? 0;
      const glyph = cup.cls >= 0 ? `${PIECE_GLYPHS[cup.cls % PIECE_GLYPHS.length]!} ` : "";
      g.font = `800 ${Math.max(10, Math.round(c * 0.27))}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const label = `${glyph}${n}/${cup.need}`;
      g.lineWidth = 3.5;
      g.lineJoin = "round";
      g.strokeStyle = "rgba(0,0,0,0.75)";
      g.strokeText(label, px + c / 2, py + c * 0.58);
      g.fillStyle = "#FFFFFF";
      g.fillText(label, px + c / 2, py + c * 0.58);
    });
  }

  private pinOffset(i: number, c: number): { dx: number; alpha: number } {
    const t = this.pinFx.get(i);
    if (t === undefined) return { dx: 0, alpha: 1 };
    const recoil = 90;
    const out = 280;
    const side = this.sides[i]!;
    let dist: number;
    if (t < recoil) dist = -ease.outQuad(t / recoil) * c * 0.14;
    else dist = -c * 0.14 + ease.outCubic(clamp((t - recoil) / out, 0, 1)) * c * 1.5;
    const alpha =
      t < recoil + out * 0.5 ? 1 : 1 - clamp((t - recoil - out * 0.5) / (out * 0.9), 0, 1);
    return { dx: dist * side, alpha };
  }

  private drawPins(g: CanvasRenderingContext2D, geo: Geometry, now: number): void {
    const s = this.game.state;
    const c = geo.cell;
    s.pins.forEach((pin, i) => {
      const fx = this.pinFx.has(i);
      if (pin.pulled && !fx) return;
      const side = this.sides[i]!;
      const cy = geo.y0 + (pin.y + 0.5) * c;
      const cellCx = geo.x0 + (pin.x + 0.5) * c;
      const { dx, alpha } = this.pinOffset(i, c);
      const pressed = this.press?.i === i;
      const thick = c * 0.22;
      const ringX = (side < 0 ? geo.x0 - geo.ringR - 3 : geo.x0 + s.w * c + geo.ringR + 3) + dx;
      const tipX = cellCx + (side < 0 ? c * 0.42 : -c * 0.42) + dx;
      const xa = Math.min(ringX, tipX);
      const xb = Math.max(ringX, tipX);
      // idle sway of the ring
      const sway = pressed || fx ? 0 : Math.sin(now / 700 + i * 1.3) * 1.2;
      g.save();
      g.globalAlpha = alpha;
      // shadow
      g.fillStyle = "rgba(0,0,0,0.35)";
      roundRectPath(g, xa, cy - thick / 2 + 3, xb - xa, thick, thick / 2);
      g.fill();
      // rod
      roundRectPath(g, xa, cy - thick / 2, xb - xa, thick, thick / 2);
      g.fillStyle = pressed ? COLORS.brassHi : COLORS.brass;
      g.fill();
      g.fillStyle = COLORS.brassHi;
      g.fillRect(xa + thick / 2, cy - thick / 2 + 2, xb - xa - thick, 2);
      g.fillStyle = COLORS.brassLo;
      g.fillRect(xa + thick / 2, cy + thick / 2 - 3, xb - xa - thick, 2);
      // ring handle
      const rr = geo.ringR * (pressed ? 1.08 : 1);
      g.beginPath();
      g.arc(ringX, cy + sway, rr, 0, Math.PI * 2);
      g.lineWidth = Math.max(4, rr * 0.5);
      g.strokeStyle = COLORS.brassLo;
      g.stroke();
      g.beginPath();
      g.arc(ringX, cy + sway, rr, 0, Math.PI * 2);
      g.lineWidth = Math.max(3, rr * 0.34);
      g.strokeStyle = pressed ? COLORS.brassHi : COLORS.brass;
      g.stroke();
      // shine sweeping around the ring
      const a0 = (now / 900 + i) % (Math.PI * 2);
      g.beginPath();
      g.arc(ringX, cy + sway, rr, a0, a0 + 0.7);
      g.lineWidth = Math.max(2, rr * 0.2);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineCap = "round";
      g.stroke();
      g.restore();
    });
  }

  private ballLift(x: number, y: number, c: number): number {
    const cell = this.game.state.cells[Math.round(y)]?.[Math.round(x)];
    return cell === ">" || cell === "<" ? -c * 0.12 : 0;
  }

  private drawBalls(g: CanvasRenderingContext2D, geo: Geometry, now: number): void {
    const s = this.game.state;
    const c = geo.cell;
    const a = this.anim;
    const px = (x: number) => geo.x0 + (x + 0.5) * c;
    const py = (y: number) => geo.y0 + (y + 0.5) * c;
    const still = (b: FrameBall) => {
      const l = this.land.get(b.id);
      let sx: number;
      let sy: number;
      let hop = 0;
      if (l !== undefined) {
        const u = l / TAIL_MS;
        const k = Math.sin(u * Math.PI * 2) * (1 - u) * 0.24;
        sy = 1 - k;
        sx = 1 + k * 0.8;
        if (u > 0.3) hop = Math.sin(((u - 0.3) / 0.7) * Math.PI) * c * 0.1 * (1 - u);
      } else {
        const br = Math.sin(now / 520 + b.id * 1.7) * 0.025;
        sx = 1 - br;
        sy = 1 + br;
      }
      this.drawBall(g, c, b, px(b.x), py(b.y) - hop + this.ballLift(b.x, b.y, c), sx, sy, 1);
    };
    if (!a || a.t < 0) {
      const list = a ? a.frames[0]!.balls : s.balls;
      for (const b of list) still(b);
      return;
    }
    const frames = a.frames;
    const idx = Math.min(frames.length - 1, Math.floor(a.t / TICK_MS));
    const u = clamp((a.t - idx * TICK_MS) / TICK_MS, 0, 1);
    const cur = frames[idx]!;
    const nxt = frames[idx + 1];
    if (!nxt) {
      for (const b of cur.balls) still(b);
      return;
    }
    const prevF = idx > 0 ? frames[idx - 1] : undefined;
    const after = frames[idx + 2];
    for (const b of nxt.balls) {
      const from = find(cur.balls, b.id) ?? b;
      if (from.x === b.x && from.y === b.y) {
        still(b);
        continue;
      }
      const pb = prevF ? find(prevF.balls, b.id) : undefined;
      const wasMoving = !!pb && (pb.x !== from.x || pb.y !== from.y);
      const na = after ? find(after.balls, b.id) : undefined;
      const willMove = !!na && (na.x !== b.x || na.y !== b.y);
      const k =
        wasMoving && willMove
          ? u
          : wasMoving
            ? ease.outQuad(u)
            : willMove
              ? ease.inQuad(u)
              : ease.smooth(u);
      const x = px(from.x) + (px(b.x) - px(from.x)) * k;
      const lift0 = this.ballLift(from.x, from.y, c);
      const lift1 = this.ballLift(b.x, b.y, c);
      const y = py(from.y) + (py(b.y) - py(from.y)) * k + lift0 + (lift1 - lift0) * k;
      // stretch a little along the fall
      const vertical = from.x === b.x;
      this.drawBall(g, c, b, x, y, vertical ? 0.94 : 1, vertical ? 1.08 : 1, 1);
    }
    for (const r of nxt.removed) {
      const from = find(cur.balls, r.id);
      const fx = from ? px(from.x) : px(r.x);
      const fy = from ? py(from.y) : py(r.y);
      const x = fx + (px(r.x) - fx) * ease.smooth(u);
      const y = fy + (py(r.y) - fy) * ease.smooth(u);
      switch (r.why) {
        case "cup":
          this.drawBall(g, c, r, x, y + u * c * 0.1, 1 - u * 0.45, 1 - u * 0.45, 1 - u * 0.6);
          break;
        case "lava":
        case "cool":
          this.drawBall(g, c, r, x, y + u * c * 0.25, 1 - u * 0.7, 1 - u * 0.7, 1 - u);
          break;
        default:
          this.drawBall(g, c, r, x, y, 1 + u * 0.5, 1 + u * 0.5, 1 - u);
      }
    }
  }

  private drawBall(
    g: CanvasRenderingContext2D,
    c: number,
    b: { kind: "good" | "rock"; color: number },
    cx: number,
    cy: number,
    sx: number,
    sy: number,
    alpha: number,
  ): void {
    const r = c * 0.36;
    if (alpha <= 0.02) return;
    g.save();
    g.globalAlpha = alpha;
    g.translate(cx, cy + r * (1 - sy));
    g.scale(sx, sy);
    // soft shadow: a darker offset shape
    g.beginPath();
    g.arc(r * 0.12, r * 0.18, r, 0, Math.PI * 2);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fill();
    if (b.kind === "good") {
      const fill = PIECE_COLORS[b.color % PIECE_COLORS.length]!;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = shade(fill, -0.3);
      g.fill();
      g.beginPath();
      g.arc(-r * 0.08, -r * 0.1, r * 0.88, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.beginPath();
      g.ellipse(-r * 0.35, -r * 0.45, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fill();
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.lineWidth = 2;
      g.strokeStyle = COLORS.ink;
      g.stroke();
      g.fillStyle = inkFor(fill);
      g.font = `800 ${Math.round(r * 1.05)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(PIECE_GLYPHS[b.color % PIECE_GLYPHS.length]!, 0, r * 0.06);
    } else {
      const pts = 7;
      g.beginPath();
      for (let i = 0; i < pts; i++) {
        const ang = (i / pts) * Math.PI * 2 + 0.3;
        const rad = r * (i % 2 === 0 ? 1.08 : 0.84);
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = COLORS.rock;
      g.fill();
      g.lineWidth = 2.5;
      g.lineJoin = "round";
      g.strokeStyle = COLORS.rockEdge;
      g.stroke();
      // lit facet
      g.beginPath();
      g.moveTo(-r * 0.7, -r * 0.1);
      g.lineTo(-r * 0.2, -r * 0.75);
      g.lineTo(r * 0.45, -r * 0.5);
      g.lineTo(-r * 0.05, -r * 0.05);
      g.closePath();
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fill();
      g.beginPath();
      g.moveTo(-r * 0.42, -r * 0.1);
      g.lineTo(r * 0.42, r * 0.5);
      g.moveTo(r * 0.42, -r * 0.1);
      g.lineTo(-r * 0.42, r * 0.5);
      g.lineWidth = 2.5;
      g.strokeStyle = "#F4EFE4";
      g.lineCap = "round";
      g.stroke();
    }
    g.restore();
  }

  private drawHint(g: CanvasRenderingContext2D, geo: Geometry, now: number): void {
    if (this.hintT <= 0 || this.hintPin < 0) return;
    const pin = this.game.state.pins[this.hintPin];
    if (!pin || pin.pulled) return;
    const c = geo.cell;
    const side = this.sides[this.hintPin]!;
    const x = side < 0 ? geo.x0 - geo.ringR - 3 : geo.x0 + this.game.state.w * c + geo.ringR + 3;
    const y = geo.y0 + (pin.y + 0.5) * c;
    const k = (now / 700) % 1;
    g.save();
    g.globalAlpha = (1 - k) * Math.min(1, this.hintT / 400);
    g.beginPath();
    g.arc(x, y, geo.ringR + 4 + k * 16, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.strokeStyle = "#FFFFFF";
    g.stroke();
    g.restore();
  }
}

export default createLevelGame({
  slug: SLUG,
  title: "Pin Drop",
  levelCount: LEVEL_COUNT,
  worlds: WORLDS,
  theme: {
    bg: "#15212D",
    bg2: "#24384C",
    panel: "#22313F",
    text: "#F4F1EA",
    muted: "#AEBBC8",
    accent: "#F2B84B",
    accentText: "#1A1408",
    buttonFill: "#2E4256",
    star: "#FFC857",
    confetti: ["#F2B84B", "#3DDC97", "#56B4E9", "#E69F00", "#CC79A7", "#FFFFFF"],
  },
  create: (env) => new PinDropController(env),
});
