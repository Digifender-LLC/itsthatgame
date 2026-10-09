// Stack Up (TDD §8): a one-tap timing game on the shared run shell (createRunGame).
// A slab slides over the tower; tap to drop it, the overhang is trimmed and falls away, and
// the run ends when a slab misses completely. Rules live in logic.ts (pure, tested); this
// file renders (isometric-looking slabs, a day-to-night sky, camera) and wires input/feel.
import {
  FONT,
  PIECE_GLYPHS,
  approach,
  clamp,
  createRunGame,
  ease,
  inkFor,
  roundRectPath,
  shade,
  type Area,
  type Env,
  type PointerPoint,
  type RunController,
  type Theme,
} from "@itg/game-sdk";
import {
  FIELD,
  STREAK_FOR_GROWTH,
  drop,
  hueAt,
  isMilestone,
  newGame,
  nextMilestone,
  perfectPitch,
  skyProgress,
  step,
  type StackState,
} from "./logic";

export const SLUG = "stack-up";

const THEME: Theme = {
  bg: "#0F1B3D",
  panel: "#1A2B57",
  text: "#FFFFFF",
  muted: "#B9C6EC",
  accent: "#FFC83D",
  accentText: "#101418",
  buttonFill: "#2C4180",
  star: "#FFD35A",
  confetti: ["#FFD35A", "#FF7A90", "#6FD3FF", "#8DF0A8", "#C9A0FF", "#FFFFFF"],
};

/** Taps closer together than this are one gesture, never two drops. */
const DROP_LOCK_MS = 90;
/** Ignore drops this soon after the run starts (the starting tap must not drop a block). */
const START_LOCK_MS = 160;
const GRAVITY = 1500;
const DEBRIS_MS = 1500;
const LAND_MS = 280;
const GLOW_MS = 650;
const RIPPLE_MS = 520;
const BANNER_MS = 1900;
const MAX_DEBRIS = 10;
const MAX_RIPPLES = 6;

const BANNER_LINES = [
  "Nice climb",
  "Into the dusk",
  "Starlight ahead",
  "Among the stars",
  "Touching the moon",
  "Above it all",
];

// ---- Colour helpers ----------------------------------------------------------------

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1, 7), 16);
  const y = parseInt(b.slice(1, 7), 16);
  const ch = (sh: number) =>
    Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

interface Cols {
  top: string;
  front: string;
  side: string;
  ink: string;
}

const colsCache = new Map<number, Cols>();
/** Face colours for a floor: top face lightest, front mid, right face darkest. */
function colsFor(floor: number): Cols {
  let c = colsCache.get(floor);
  if (!c) {
    const base = hslToHex(hueAt(floor), 0.62, 0.58);
    const front = base;
    c = { top: shade(base, 0.32), front, side: shade(base, -0.34), ink: inkFor(front) };
    colsCache.set(floor, c);
  }
  return c;
}

const SKY_TOP = ["#4FB0F2", "#4B3F86", "#060A22"] as const;
const SKY_BOT = ["#CDEEFF", "#FF9C78", "#1B2A5E"] as const;

// ---- Entities ----------------------------------------------------------------------

interface Debris {
  /** Left edge in px, width in px, world top y of the front face. */
  x: number;
  w: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  floor: number;
  age: number;
}

interface Ripple {
  x: number;
  y: number;
  w: number;
  age: number;
}

interface Layout {
  unit: number;
  fieldX: number;
  bh: number;
  d: number;
  ox: number;
  oy: number;
  baseline: number;
  cx: number;
}

type Status = "ready" | "playing" | "over";

class StackController implements RunController {
  private state: StackState;
  private st: Status = "ready";
  private clock = 0;
  private cam = 0;
  private sc = 1;
  private skyF = 0;
  private overMs = 0;
  private startedAt = 0;
  private lastDropAt = -1000;
  private perfects = 0;
  private bestStreak = 0;
  private landIdx = -1;
  private landT = 1;
  private glowIdx = -1;
  private glowT = 1;
  private banner: { floor: number; age: number } | null = null;
  private debris: Debris[] = [];
  private ripples: Ripple[] = [];
  private area: Area | null = null;
  private readonly lay: Layout = {
    unit: 1,
    fieldX: 0,
    bh: 20,
    d: 16,
    ox: 12,
    oy: -8,
    baseline: 0,
    cx: 0,
  };
  private readonly pt = { x: 0, y: 0 };
  private readonly speedMul: number;
  private skyKey = -1;
  private skyTop = SKY_TOP[0] as string;
  private skyBot = SKY_BOT[0] as string;
  private readonly starX = new Float32Array(64);
  private readonly starY = new Float32Array(64);
  private readonly starS = new Float32Array(64);
  private readonly starP = new Float32Array(64);
  private readonly dash = [7, 7];

  constructor(private readonly env: Env) {
    this.speedMul = env.reducedMotion ? 0.55 : 1;
    this.state = newGame(this.speedMul);
    let s = 20261005;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 64; i++) {
      this.starX[i] = rnd();
      this.starY[i] = rnd();
      this.starS[i] = 1 + rnd() * 1.6;
      this.starP[i] = rnd() * 6.28;
    }
  }

  // ---- RunController -----------------------------------------------------------

  reset(): void {
    this.state = newGame(this.speedMul);
    this.st = "ready";
    this.cam = 0;
    this.sc = 1;
    this.skyF = 0;
    this.overMs = 0;
    this.startedAt = 0;
    this.lastDropAt = -1000;
    this.perfects = 0;
    this.bestStreak = 0;
    this.landIdx = -1;
    this.landT = 1;
    this.glowIdx = -1;
    this.glowT = 1;
    this.banner = null;
    this.debris.length = 0;
    this.ripples.length = 0;
  }

  status(): Status {
    return this.st;
  }

  score(): number {
    return this.state.score;
  }

  busy(): boolean {
    return this.st === "over" && !this.env.reducedMotion && this.overMs < 700;
  }

  hudInfo(): string | undefined {
    if (this.st !== "playing") return undefined;
    const next = `Next ${nextMilestone(this.state.score)}`;
    return this.state.streak >= 2 ? `Streak x${this.state.streak}  ·  ${next}` : next;
  }

  readyText(): string {
    return "Tap to start, tap to drop";
  }

  overMessage(): string {
    const n = this.state.score;
    return `${n} ${n === 1 ? "floor" : "floors"} high  ·  ${this.perfects} perfect ${
      this.perfects === 1 ? "drop" : "drops"
    }  ·  best streak ${this.bestStreak}`;
  }

  down(_p: PointerPoint, area: Area): void {
    if (this.st === "over") return;
    if (this.st === "ready") {
      // The first touch only starts the run: it must never also drop a block.
      this.state = newGame(this.speedMul);
      this.st = "playing";
      this.startedAt = this.clock;
      this.env.audio.play("select", { pitch: 1.25, volume: 0.7 });
      return;
    }
    if (this.clock - this.startedAt < START_LOCK_MS) return;
    if (this.clock - this.lastDropAt < DROP_LOCK_MS) return;
    this.doDrop(area);
  }

  update(dtMs: number): void {
    const env = this.env;
    this.clock += dtMs;
    if (this.st === "over") this.overMs += dtMs;
    else step(this.state, dtMs / 1000);

    const reduced = env.reducedMotion;
    if (this.area) {
      const L = this.layout(this.area);
      const n = this.state.tower.length;
      let camT = Math.max(0, this.area.y + this.area.h * 0.5 - (L.baseline - n * L.bh));
      let scT = 1;
      if (this.st === "over") {
        const towerPx = n * L.bh + 3 * L.d;
        scT = clamp((L.baseline - this.area.y - 30) / towerPx, 0.35, 1);
        if (scT < 1) camT = 0;
      }
      this.cam = reduced ? camT : approach(this.cam, camT, 5, dtMs);
      this.sc = reduced ? scT : approach(this.sc, scT, 3.5, dtMs);
    }
    this.skyF = reduced ? this.state.score : approach(this.skyF, this.state.score, 2.5, dtMs);

    if (this.landT < 1) this.landT = Math.min(1, this.landT + dtMs / LAND_MS);
    if (this.glowT < 1) this.glowT = Math.min(1, this.glowT + dtMs / GLOW_MS);
    if (this.banner) {
      this.banner.age += dtMs;
      if (this.banner.age > BANNER_MS) this.banner = null;
    }
    const dt = dtMs / 1000;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      d.age += dtMs;
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (d.age > DEBRIS_MS) this.debris.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.age += dtMs;
      if (r.age > RIPPLE_MS) this.ripples.splice(i, 1);
    }
  }

  // ---- Game feel ---------------------------------------------------------------

  private layout(area: Area): Layout {
    const L = this.lay;
    L.unit = Math.min(area.w - 32, 420) / FIELD;
    L.fieldX = area.x + (area.w - FIELD * L.unit) / 2;
    L.bh = Math.max(20, Math.min(38, L.unit * 7.5));
    L.d = L.bh * 0.8;
    L.ox = L.d * 0.75;
    L.oy = -L.d * 0.55;
    L.baseline = area.y + area.h - 70;
    L.cx = area.x + area.w / 2;
    return L;
  }

  /** World (x, y) to screen px under the current camera and zoom; reuses one object. */
  private toScreen(x: number, y: number): { x: number; y: number } {
    const L = this.lay;
    this.pt.x = L.cx + (x - L.cx) * this.sc;
    this.pt.y = L.baseline + (y + this.cam - L.baseline) * this.sc;
    return this.pt;
  }

  private doDrop(area: Area): void {
    const env = this.env;
    const L = this.layout(area);
    const s = this.state;
    const reduced = env.reducedMotion;
    const topIdx = s.tower.length - 1;
    const top = s.tower[topIdx]!;
    const mx = s.mover.x;
    const mw = s.mover.w;
    const moverY = L.baseline - s.tower.length * L.bh;
    const r = drop(s);
    this.lastDropAt = this.clock;

    if (r.kind === "miss") {
      this.st = "over";
      this.overMs = 0;
      if (!reduced) {
        const dir = mx + mw / 2 < top.x + top.w / 2 ? -1 : 1;
        this.spawnDebris(mx, mw, moverY, s.tower.length, dir * 90, -260);
      }
      env.audio.play("bump", { pitch: 0.55 });
      return;
    }

    const placed = s.tower[r.index]!;
    const wy = L.baseline - r.index * L.bh;
    const px = L.fieldX + placed.x * L.unit;
    const pw = placed.w * L.unit;
    const centreX = px + pw / 2 - L.ox / 2;
    this.landIdx = r.index;
    this.landT = 0;
    env.haptics.impact("light");

    if (r.kind === "perfect") {
      this.perfects++;
      this.bestStreak = Math.max(this.bestStreak, s.streak);
      env.audio.play("perfect", { pitch: perfectPitch(s.streak) });
      const grew = placed.w > top.w + 1e-9;
      if (grew) {
        this.glowIdx = r.index;
        this.glowT = 0;
      }
      if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
      this.ripples.push({ x: centreX, y: wy + L.oy / 2, w: pw, age: 0 });
      const at = this.toScreen(centreX, wy);
      const cols = colsFor(r.index);
      env.juice.particles.burst(at.x, at.y + L.oy / 2, {
        count: s.streak >= STREAK_FOR_GROWTH ? 16 : 10,
        colors: [cols.top, "#FFFFFF", "#FFE08A"],
        speed: 240,
        life: 520,
        size: 3.4,
        gravity: 260,
        shape: s.streak >= STREAK_FOR_GROWTH ? "star" : "spark",
        angle: -Math.PI / 2,
        spread: Math.PI * 1.1,
      });
      const label = s.streak >= 2 ? `Perfect x${s.streak}` : "Perfect";
      env.juice.text.spawn(at.x, at.y - 34, grew ? `${label} · wider!` : label, "#FFE08A", 24);
    } else {
      env.audio.play("drop", { pitch: 0.85 });
      env.audio.play("bump", { pitch: 0.5, volume: 0.6 });
      env.juice.shake.kick(0.12);
      if (r.debris) {
        const dx = L.fieldX + r.debris.x * L.unit;
        const dw = r.debris.w * L.unit;
        const dir = r.debris.x < top.x ? -1 : 1;
        if (!reduced) this.spawnDebris(dx, dw, wy, r.index, dir * 70, -120);
        const cutX = dir < 0 ? px : px + pw;
        const at = this.toScreen(cutX - L.ox / 2, wy);
        env.juice.particles.burst(at.x, at.y + L.bh * 0.5, {
          count: 6,
          colors: [colsFor(r.index).side, colsFor(r.index).front],
          speed: 120,
          life: 420,
          size: 3,
          gravity: 700,
          shape: "square",
          angle: dir < 0 ? Math.PI * 0.75 : Math.PI * 0.25,
          spread: 1.4,
        });
      }
    }

    if (isMilestone(s.score)) {
      this.banner = { floor: s.score, age: 0 };
      env.audio.play("unlock");
      env.haptics.impact("medium");
      env.juice.particles.confetti(area.x, area.y - 10, area.w, THEME.confetti ?? []);
    }
  }

  private spawnDebris(x: number, w: number, y: number, floor: number, vx: number, vy: number) {
    if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
    this.debris.push({
      x,
      w,
      y,
      vx,
      vy,
      rot: 0,
      vr: vx > 0 ? 2.4 : -2.4,
      floor,
      age: 0,
    });
  }

  // ---- Drawing -----------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, area: Area): void {
    this.area = area;
    const L = this.layout(area);
    this.drawSky(g, area);

    g.save();
    g.translate(L.cx, L.baseline);
    g.scale(this.sc, this.sc);
    g.translate(-L.cx, -L.baseline + this.cam);
    this.drawWorld(g, area, L);
    g.restore();

    if (this.st === "ready") {
      // Keeps the shell's title text readable over the bright day sky.
      const y = area.y + area.h * 0.28 - 40;
      roundRectPath(g, area.x + 28, y, area.w - 56, 138, 22);
      g.fillStyle = "rgba(10,16,40,0.78)";
      g.fill();
    }
    if (this.banner) this.drawBanner(g, area, this.banner);
  }

  private drawSky(g: CanvasRenderingContext2D, area: Area): void {
    const p = skyProgress(this.skyF);
    const key = Math.round(p * 200);
    if (key !== this.skyKey) {
      this.skyKey = key;
      const q = key / 200;
      const lo = Math.min(1, Math.floor(q));
      const hi = Math.min(2, lo + 1);
      const t = q - lo;
      this.skyTop = mixHex(SKY_TOP[lo]!, SKY_TOP[hi]!, t);
      this.skyBot = mixHex(SKY_BOT[lo]!, SKY_BOT[hi]!, t);
    }
    const x = area.x - 14;
    const y = area.y - 90;
    const w = area.w + 28;
    const h = area.h + 104;
    // The recording test canvas returns nothing for createLinearGradient; fall back to flat.
    const grad = g.createLinearGradient(0, area.y, 0, area.y + area.h) as
      CanvasGradient | undefined;
    if (grad) {
      grad.addColorStop(0, this.skyTop);
      grad.addColorStop(1, this.skyBot);
      g.fillStyle = grad;
    } else {
      g.fillStyle = this.skyTop;
    }
    g.fillRect(x, y, w, h);

    const reduced = this.env.reducedMotion;
    const t = this.clock / 1000;
    // Stars fade in through dusk and twinkle.
    const starA = ease.smooth(clamp((p - 0.7) / 1.1, 0, 1));
    if (starA > 0.02) {
      g.fillStyle = "#FFFFFF";
      for (let i = 0; i < this.starX.length; i++) {
        const tw = reduced ? 0.8 : 0.65 + 0.35 * Math.sin(t * 2.2 + this.starP[i]!);
        g.globalAlpha = starA * tw;
        const sx = area.x + this.starX[i]! * area.w;
        const sy = area.y + ((this.starY[i]! * area.h + this.cam * 0.04) % area.h);
        const s = this.starS[i]!;
        g.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
      g.globalAlpha = 1;
    }
    // Soft clouds drift in the day sky and thin out by night.
    const cloudA = clamp(1 - p * 0.75, 0, 1) * 0.8;
    if (cloudA > 0.02) {
      g.fillStyle = p < 0.5 ? "#FFFFFF" : mixHex("#FFFFFF", "#FFC9B0", clamp(p - 0.5, 0, 0.5) * 2);
      g.globalAlpha = cloudA;
      for (let i = 0; i < 5; i++) {
        const sp = 6 + i * 3;
        const cx0 = (((i * 0.37 + 0.1) * area.w + (reduced ? 0 : t * sp)) % (area.w + 220)) - 110;
        const cy0 = area.y + (((i * 0.23 + 0.08) * area.h + this.cam * 0.25) % (area.h + 120)) - 60;
        const r = 14 + (i % 3) * 6;
        g.beginPath();
        g.moveTo(area.x + cx0 + r * 1.9, cy0);
        g.arc(area.x + cx0 + r, cy0, r * 0.9, 0, Math.PI * 2);
        g.moveTo(area.x + cx0 + r * 2.9, cy0 - r * 0.3);
        g.arc(area.x + cx0 + r * 1.9, cy0 - r * 0.3, r * 1.15, 0, Math.PI * 2);
        g.moveTo(area.x + cx0 + r * 3.7, cy0 + r * 0.05);
        g.arc(area.x + cx0 + r * 2.9, cy0 + r * 0.05, r * 0.85, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  /** One isometric-looking slab: lighter top face, mid front face, darker right face. */
  private slab(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    cols: Cols,
    glyph: string | null,
  ): void {
    const { ox, oy } = this.lay;
    g.fillStyle = cols.side;
    g.beginPath();
    g.moveTo(x + w, y);
    g.lineTo(x + w + ox, y + oy);
    g.lineTo(x + w + ox, y + oy + h);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
    g.fillStyle = cols.top;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + ox, y + oy);
    g.lineTo(x + w + ox, y + oy);
    g.lineTo(x + w, y);
    g.closePath();
    g.fill();
    g.fillStyle = cols.front;
    g.fillRect(x, y, w, h);
    // Crisp highlight along the front-top edge.
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(x, y, w, 1.5);
    if (glyph && w > this.lay.bh * 1.6) {
      // A glyph on every slab so colour is never the only cue (NFR-4).
      g.globalAlpha = 0.5;
      g.fillStyle = cols.ink;
      g.fillText(glyph, x + w / 2, y + h / 2 + 1);
      g.globalAlpha = 1;
    }
  }

  private flash(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    a: number,
  ): void {
    const { ox, oy } = this.lay;
    g.globalAlpha = a;
    g.fillStyle = "#FFF6C8";
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y);
    g.lineTo(x + ox, y + oy);
    g.lineTo(x + w + ox, y + oy);
    g.lineTo(x + w + ox, y + oy + h);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  private drawWorld(g: CanvasRenderingContext2D, area: Area, L: Layout): void {
    const s = this.state;
    const n = s.tower.length;
    const shiftX = -L.ox / 2;
    const reduced = this.env.reducedMotion;
    const inv = 1 / this.sc;
    const topLimit = (area.y - 40 - L.baseline) * inv + L.baseline - this.cam;
    const botLimit = (area.y + area.h + 40 - L.baseline) * inv + L.baseline - this.cam;

    // Ground.
    const gy = L.baseline + L.bh;
    g.fillStyle = "#26324F";
    g.fillRect(L.cx - 3000, gy, 6000, 4000);
    g.fillStyle = "#3C4C74";
    g.fillRect(L.cx - 3000, gy, 6000, 4);

    // Milestone lines: a dashed marker at each tenth floor, including the next goal.
    g.font = `800 12px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "bottom";
    for (let m = 10; m <= n + 14; m += 10) {
      const my = L.baseline - m * L.bh;
      if (my < topLimit || my > botLimit) continue;
      const reached = s.score >= m;
      g.globalAlpha = reached ? 0.28 : 0.55;
      g.strokeStyle = "#FFFFFF";
      g.lineWidth = 2;
      g.setLineDash(this.dash);
      g.beginPath();
      g.moveTo(L.cx - 3000, my);
      g.lineTo(L.cx + 3000, my);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      const lx = area.x + 10;
      g.lineWidth = 3;
      g.strokeStyle = "rgba(8,12,36,0.7)";
      g.strokeText(String(m), lx, my - 4);
      g.fillStyle = "#FFFFFF";
      g.fillText(String(m), lx, my - 4);
    }

    // Guide: a faint column above the top block shows where the slab must land.
    const top = s.tower[n - 1]!;
    const topY = L.baseline - (n - 1) * L.bh;
    if (this.st !== "over") {
      const gx = L.fieldX + top.x * L.unit + shiftX;
      const gw = top.w * L.unit;
      g.fillStyle = "rgba(255,255,255,0.10)";
      g.fillRect(gx, topY - 1600, gw + L.ox, 1600);
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fillRect(gx, topY - 1600, 1.5, 1600);
      g.fillRect(gx + gw - 1.5, topY - 1600, 1.5, 1600);
    }

    g.font = `800 ${Math.round(L.bh * 0.55)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";

    // Placed slabs.
    for (let i = 0; i < n; i++) {
      const wy = L.baseline - i * L.bh;
      if (wy < topLimit - L.bh || wy > botLimit + L.bh) continue;
      const b = s.tower[i]!;
      const x = L.fieldX + b.x * L.unit + shiftX;
      const w = b.w * L.unit;
      let y = wy;
      let h = L.bh;
      if (i === this.landIdx && this.landT < 1 && !reduced) {
        const sq = 1 - 0.18 * ease.pulse(this.landT);
        h = L.bh * sq;
        y = wy + L.bh - h;
      }
      this.slab(g, x, y, w, h, colsFor(i), PIECE_GLYPHS[i % PIECE_GLYPHS.length]!);
      if (i === this.glowIdx && this.glowT < 1) {
        this.flash(g, x, y, w, h, 0.7 * (1 - this.glowT));
      }
    }

    // The sliding slab, with a pulsing halo while a streak is building toward regrowth.
    if (this.st !== "over") {
      const m = s.mover;
      const x = L.fieldX + m.x * L.unit + shiftX;
      const w = m.w * L.unit;
      const y = L.baseline - n * L.bh;
      if (s.streak >= STREAK_FOR_GROWTH - 1) {
        const pulse = reduced ? 0.7 : 0.55 + 0.35 * Math.sin(this.clock / 130);
        g.globalAlpha = 0.45 * pulse;
        g.fillStyle = "#FFE08A";
        roundRectPath(g, x - 5, y + L.oy - 5, w + L.ox + 10, L.bh - L.oy + 10, 8);
        g.fill();
        g.globalAlpha = 1;
      }
      this.slab(g, x, y, w, L.bh, colsFor(n), PIECE_GLYPHS[n % PIECE_GLYPHS.length]!);
    }

    // Ripples from perfect drops: a flattened ring that spreads along the top face.
    for (const r of this.ripples) {
      const k = r.age / RIPPLE_MS;
      const rx = r.w / 2 + 6 + ease.outCubic(k) * 46;
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = "#FFF6C8";
      g.lineWidth = 3 * (1 - k) + 1;
      g.beginPath();
      g.ellipse(r.x, r.y, rx, rx * 0.34, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // Trimmed overhang tumbling away.
    for (const d of this.debris) {
      const cols = colsFor(d.floor);
      g.save();
      g.globalAlpha = clamp(1 - d.age / DEBRIS_MS, 0, 1) * 0.95;
      g.translate(d.x + d.w / 2 + shiftX, d.y + L.bh / 2);
      g.rotate(d.rot);
      this.slab(g, -d.w / 2, -L.bh / 2, d.w, L.bh, cols, null);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  private drawBanner(
    g: CanvasRenderingContext2D,
    area: Area,
    b: { floor: number; age: number },
  ): void {
    const reduced = this.env.reducedMotion;
    const k = reduced ? 1 : ease.outBack(clamp(b.age / 320, 0, 1));
    const fade = b.age > BANNER_MS - 450 ? clamp((BANNER_MS - b.age) / 450, 0, 1) : 1;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h * 0.2;
    const w = 232;
    const h = 66;
    g.save();
    g.globalAlpha = fade;
    g.translate(cx, cy);
    g.scale(k, k);
    roundRectPath(g, -w / 2, -h / 2 + 4, w, h, 18);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fill();
    roundRectPath(g, -w / 2, -h / 2, w, h, 18);
    g.fillStyle = "rgba(14,20,46,0.9)";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#FFD35A";
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#FFD35A";
    g.font = `900 26px ${FONT}`;
    g.fillText(`FLOOR ${b.floor}`, 0, -9);
    g.fillStyle = "#DCE4FF";
    g.font = `600 13px ${FONT}`;
    g.fillText(BANNER_LINES[(b.floor / 10 - 1) % BANNER_LINES.length]!, 0, 17);
    g.restore();
  }
}

export default createRunGame({
  slug: SLUG,
  title: "Stack Up",
  theme: THEME,
  scoreLabel: "Height",
  create: (env) => new StackController(env),
});
