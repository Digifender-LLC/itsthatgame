// Ring Sort: sort glossy donut rings so every peg holds one colour.
//
// Rules live in logic.ts (pure, tested); this file is rendering, input and juice on top of
// the shared level shell (createLevelGame). Everything is drawn procedurally.
import {
  FONT,
  PIECE_COLORS,
  PIECE_GLYPHS,
  approach,
  clamp,
  createLevelGame,
  ease,
  inkFor,
  lerp,
  roundRectPath,
  shade,
  starPath,
  drawIcon,
  type Area,
  type Env,
  type LevelController,
  type PointerPoint,
} from "@itg/game-sdk";
import { INTROS, LEVEL_COUNT, WORLDS, getLevel, starLimits, starsFor } from "./levels";
import {
  RingGame,
  canonicalKey,
  isComplete,
  isLocked,
  moveCount,
  solve,
  topRun,
  type Move,
} from "./logic";

export const SLUG = "ring-sort";

const GOLD = "#FFD54A";
const GOLD_DARK = "#B8860B";
const WOOD = "#C28A55";
const STEEL = "#8392A8";

interface Look {
  base: string;
  dark: string;
  light: string;
  deep: string;
  ink: string;
}

function lookOf(base: string): Look {
  return {
    base,
    dark: shade(base, -0.38),
    light: shade(base, 0.5),
    deep: shade(base, -0.78),
    ink: inkFor(base),
  };
}

const LOOKS: Look[] = PIECE_COLORS.map((c) => lookOf(c));
const HIDDEN_LOOK = lookOf("#66758B");
const WOOD_LOOK = { base: WOOD, dark: shade(WOOD, -0.32), light: shade(WOOD, 0.35) };
const STEEL_LOOK = { base: STEEL, dark: shade(STEEL, -0.35), light: shade(STEEL, 0.4) };

interface Layout {
  cols: number;
  rows: number;
  cellW: number;
  rowH: number;
  top: number;
  left: number;
  ringW: number;
  eh: number;
  pitch: number;
  n: number;
}

interface Flight {
  from: number;
  to: number;
  colors: number[];
  x0: number[];
  y0: number[];
  /** Index on the destination peg where the lowest flying ring lands. */
  slot0: number;
  t: number;
  landed: number;
  move: Move | null;
}

const FLY_MS = 300;
const STAGGER_MS = 46;
const DRAG_PX = 12;

class RingController implements LevelController {
  private game: RingGame;
  private index = 0;
  private L: Layout = {
    cols: 1,
    rows: 1,
    cellW: 1,
    rowH: 1,
    top: 0,
    left: 0,
    ringW: 40,
    eh: 24,
    pitch: 16,
    n: 0,
  };
  private area: Area | null = null;

  // per-peg visual state
  private pending: number[] = [];
  private bump: number[] = [];
  private landAge: number[] = [];
  private landN: number[] = [];
  private revealAge: number[] = [];
  private capAge: number[] = [];
  private lockAge: number[] = [];

  // interaction
  private selected: number | null = null;
  private run = 0;
  private liftX = 0;
  private liftY = 0;
  private velX = 0;
  private velY = 0;
  private dragCand = false;
  private dragging = false;
  private dragStart: PointerPoint = { x: 0, y: 0 };
  private dragPoint: PointerPoint = { x: 0, y: 0 };
  private hoverPeg: number | null = null;

  private flights: Flight[] = [];
  private chain = 0;
  private hintMove: { from: number; to: number } | null = null;
  private hintKey = "";

  constructor(private readonly env: Env) {
    this.game = new RingGame(getLevel(0));
    this.resetVisuals();
  }

  // ---- LevelController -----------------------------------------------------------

  loadLevel(index: number): void {
    this.index = index;
    this.game = new RingGame(getLevel(index));
    this.resetVisuals();
  }
  restart(): void {
    this.game.restart();
    this.resetVisuals();
  }
  undo(): void {
    if (!this.game.undo()) return;
    this.flights = [];
    this.selected = null;
    this.dragCand = false;
    this.dragging = false;
    this.hintMove = null;
    this.chain = 0;
    const s = this.game.state;
    for (let p = 0; p < s.pegs.length; p++) {
      this.pending[p] = 0;
      this.capAge[p] = isComplete(s, p) ? (this.capAge[p]! >= 0 ? this.capAge[p]! : 9999) : -1;
      this.lockAge[p] = isLocked(s, p) ? -1 : this.lockAge[p]! >= 0 ? this.lockAge[p]! : -1;
    }
    this.env.audio.play("whoosh", { pitch: 1.2, volume: 0.4 });
  }
  canUndo(): boolean {
    return this.game.canUndo();
  }
  status() {
    return this.game.status();
  }
  busy(): boolean {
    return this.flights.length > 0;
  }
  lostMessage(): string {
    return "No legal moves left. Undo or restart.";
  }
  stars(): number {
    return starsFor(this.index, this.game.moves);
  }
  hudInfo(): string {
    return `Moves ${this.game.moves} · ★★★ ≤ ${starLimits(this.index).three}`;
  }
  intro(index: number): string | undefined {
    return INTROS[index];
  }

  hint(): boolean {
    if (this.game.status() !== "playing" || this.flights.length > 0) return false;
    const s = this.game.state;
    const key = canonicalKey(s) + "|" + s.open.join("");
    let move = this.hintKey === key ? this.hintMove : null;
    if (!move) {
      const sol = solve(s, 90_000, 1.4);
      const first = sol?.[0];
      if (!first) {
        this.hintMove = null;
        this.hintKey = "";
        const a = this.area;
        if (a) {
          this.env.juice.text.spawn(
            a.x + a.w / 2,
            a.y + a.h / 2,
            "Dead end: try Undo",
            "#FFB4A8",
            22,
          );
        }
        return false;
      }
      move = { from: first.from, to: first.to };
      this.hintKey = key;
    }
    this.hintMove = move;
    this.selected = null;
    this.dragCand = false;
    this.dragging = false;
    return true;
  }

  // ---- state helpers -------------------------------------------------------------

  private resetVisuals(): void {
    const s = this.game.state;
    const n = s.pegs.length;
    const zeros = () => new Array<number>(n).fill(0);
    this.pending = zeros();
    this.bump = zeros();
    this.landAge = new Array<number>(n).fill(9999);
    this.landN = zeros();
    this.revealAge = new Array<number>(n).fill(9999);
    this.capAge = new Array<number>(n).fill(-1);
    this.lockAge = s.pegs.map((_, p) => (isLocked(s, p) ? -1 : -2));
    this.flights = [];
    this.selected = null;
    this.run = 0;
    this.dragCand = false;
    this.dragging = false;
    this.hoverPeg = null;
    this.chain = 0;
    this.hintMove = null;
    this.hintKey = "";
    this.env.juice.clear();
  }

  // ---- layout --------------------------------------------------------------------

  private layout(area: Area): Layout {
    const s = this.game.state;
    const n = s.pegs.length;
    const L = this.L;
    const maxCap = Math.max(...s.caps);
    L.n = n;
    L.rows = n <= 3 ? 1 : 2;
    L.cols = L.rows === 1 ? n : Math.ceil(n / 2);
    L.cellW = area.w / L.cols;
    const ringW0 = Math.min(L.cellW - 10, 104);
    const room = maxCap + 4.8;
    const ehW = ringW0 * 0.6;
    L.rowH = Math.min(area.h / L.rows, 380, ehW * 0.66 * room + 52);
    L.top = area.y + (area.h - L.rowH * L.rows) / 2;
    L.left = area.x;
    L.eh = Math.max(20, Math.min(ehW, (L.rowH - 52) / room / 0.66));
    L.ringW = Math.max(40, Math.min(ringW0, L.eh / 0.5));
    L.pitch = L.eh * 0.66;
    return L;
  }

  private pegX(p: number): number {
    const L = this.L;
    return L.left + L.cellW * ((p % L.cols) + 0.5);
  }
  private baseY(p: number): number {
    const L = this.L;
    return L.top + L.rowH * (Math.floor(p / L.cols) + 1) - 22;
  }
  private rodH(p: number): number {
    return (this.game.state.caps[p]! + 0.7) * this.L.pitch + this.L.eh * 0.55;
  }
  private rodTop(p: number): number {
    return this.baseY(p) - this.rodH(p);
  }
  private slotY(p: number, k: number): number {
    return this.baseY(p) - k * this.L.pitch - this.L.eh * 0.5 - 2;
  }
  private runSpacing(run: number): number {
    return run > 1 ? Math.min(this.L.pitch * 0.8, (this.L.pitch * 1.6) / (run - 1)) : 0;
  }
  private hoverY(p: number, k: number, run: number): number {
    return this.rodTop(p) - this.L.eh * 0.6 - k * this.runSpacing(run);
  }

  private pegAt(pt: PointerPoint, strict: boolean): number | null {
    const L = this.L;
    const col = Math.floor((pt.x - L.left) / L.cellW);
    const row = Math.floor((pt.y - L.top) / L.rowH);
    const cc = clamp(col, 0, L.cols - 1);
    const rr = clamp(row, 0, L.rows - 1);
    if (strict && (row < -1 || row > L.rows)) return null;
    const p = rr * L.cols + cc;
    return p < L.n ? p : null;
  }

  // ---- input ---------------------------------------------------------------------

  down(pt: PointerPoint, area: Area): void {
    this.area = area;
    this.layout(area);
    if (this.game.status() !== "playing") return;
    const p = this.pegAt(pt, false);
    if (p === null) return;
    this.dragCand = false;
    if (this.selected === null) {
      if (this.pick(p)) {
        this.dragCand = true;
        this.dragStart = pt;
        this.dragPoint = pt;
      }
      return;
    }
    if (this.selected === p) {
      this.deselect(true);
      return;
    }
    this.tryMove(this.selected, p);
  }

  move(pt: PointerPoint, area: Area): void {
    this.area = area;
    if (!this.dragCand || this.selected === null) return;
    if (!this.dragging) {
      if (Math.hypot(pt.x - this.dragStart.x, pt.y - this.dragStart.y) < DRAG_PX) return;
      this.dragging = true;
    }
    this.dragPoint = pt;
    this.hoverPeg = this.pegAt(pt, true);
  }

  up(pt: PointerPoint, area: Area): void {
    this.area = area;
    const wasDrag = this.dragging;
    this.dragging = false;
    this.dragCand = false;
    const hover = this.hoverPeg;
    this.hoverPeg = null;
    if (!wasDrag || this.selected === null) return;
    const target = this.pegAt(pt, true) ?? hover;
    if (target === null || target === this.selected) {
      this.deselect(true);
      return;
    }
    this.tryMove(this.selected, target);
  }

  private pick(p: number): boolean {
    const s = this.game.state;
    const peg = s.pegs[p]!;
    if (peg.length === 0) {
      this.env.audio.play("tap", { volume: 0.4 });
      return false;
    }
    if (isLocked(s, p)) {
      this.bumpPeg(p, "Locked");
      return false;
    }
    if (this.pending[p]! > 0) {
      this.bumpPeg(p);
      return false;
    }
    const run = topRun(peg, s.hid[p]);
    this.selected = p;
    this.run = run;
    this.liftX = this.pegX(p);
    this.liftY = this.slotY(p, peg.length - run);
    this.velX = 0;
    this.velY = this.env.reducedMotion ? 0 : -260;
    this.env.audio.play("select", { pitch: 1 + 0.05 * (run - 1), volume: 0.7 });
    this.env.haptics.impact("light");
    return true;
  }

  /** Put the lifted run back where it came from. */
  private deselect(sound: boolean): void {
    const p = this.selected;
    if (p === null) return;
    const s = this.game.state;
    const peg = s.pegs[p]!;
    const colors = peg.slice(peg.length - this.run);
    this.startFlight(p, p, colors, this.run, null);
    this.selected = null;
    this.run = 0;
    if (sound) this.env.audio.play("tap", { pitch: 0.9, volume: 0.5 });
  }

  private tryMove(from: number, to: number): void {
    const s = this.game.state;
    const dst = s.pegs[to]!;
    if (isLocked(s, to)) {
      this.deselect(false);
      this.bumpPeg(to, "Locked");
      return;
    }
    if (this.pending[to]! > 0 && dst.length >= s.caps[to]!) {
      this.deselect(false);
      this.bumpPeg(to);
      return;
    }
    if (moveCount(s, from, to) === 0) {
      const full = dst.length >= s.caps[to]!;
      if (!full && dst.length > 0 && this.pending[to] === 0) {
        // not a legal target but a real peg: just switch the lift to it
        this.deselect(false);
        this.pick(to);
        return;
      }
      this.deselect(false);
      this.bumpPeg(to, full ? "Full" : undefined);
      return;
    }
    const run = this.run;
    const srcLen = s.pegs[from]!.length;
    const colors = s.pegs[from]!.slice(srcLen - run);
    const m = this.game.move(from, to)!;
    const spacing = this.runSpacing(run);
    // rings that stayed behind (run longer than the free space) settle back down
    const left = run - m.count;
    if (left > 0) {
      this.startFlight(from, from, colors.slice(0, left), left, null, spacing, 0);
    }
    this.startFlight(from, to, colors.slice(left), m.count, m, spacing, left);
    this.selected = null;
    this.run = 0;
    this.hintMove = null;
    this.hintKey = "";
    this.env.haptics.impact("light");
  }

  private bumpPeg(p: number, text?: string): void {
    this.bump[p] = 320;
    this.env.audio.play("bump");
    this.env.haptics.impact("light");
    this.env.juice.shake.kick(0.12);
    if (text) {
      this.env.juice.text.spawn(this.pegX(p), this.rodTop(p) - 14, text, "#FFE9B0", 18, 800);
    }
  }

  // ---- flights -------------------------------------------------------------------

  private startFlight(
    from: number,
    to: number,
    colors: number[],
    count: number,
    move: Move | null,
    spacing = this.runSpacing(this.run),
    firstRunIndex = 0,
  ): void {
    const s = this.game.state;
    const x0: number[] = [];
    const y0: number[] = [];
    for (let i = 0; i < count; i++) {
      x0.push(this.liftX);
      y0.push(this.liftY - (firstRunIndex + i) * spacing);
    }
    const slot0 = s.pegs[to]!.length - count;
    this.pending[to] = this.pending[to]! + count;
    const f: Flight = { from, to, colors, x0, y0, slot0, t: 0, landed: 0, move };
    if (this.env.reducedMotion) {
      f.t = FLY_MS + STAGGER_MS * count;
    }
    this.flights.push(f);
    if (this.env.reducedMotion) this.stepFlights(0);
  }

  private stepFlights(dt: number): void {
    if (this.flights.length === 0) return;
    for (const f of this.flights) {
      f.t += dt;
      const n = f.colors.length;
      while (f.landed < n && f.t >= f.landed * STAGGER_MS + FLY_MS) {
        this.landRing(f, f.landed);
        f.landed++;
      }
    }
    this.flights = this.flights.filter((f) => f.landed < f.colors.length);
  }

  private landRing(f: Flight, k: number): void {
    const to = f.to;
    this.pending[to] = Math.max(0, this.pending[to]! - 1);
    if (k === 0) {
      this.landAge[to] = 0;
      this.landN[to] = f.colors.length;
    }
    const L = this.L;
    const x = this.pegX(to);
    const y = this.baseY(to) - (f.slot0 + k + 1) * L.pitch;
    if (f.move) {
      this.env.audio.play("drop", { pitch: 0.92 + 0.07 * k, volume: 0.75 });
    }
    if (!f.move && k === 0) this.env.audio.play("drop", { pitch: 0.8, volume: 0.35 });
    if (!this.env.reducedMotion) {
      this.env.juice.particles.burst(x, y + L.eh * 0.3, {
        count: 4,
        colors: ["#FFFFFF", "#F1D9B5"],
        speed: 90,
        life: 280,
        size: 2.2,
        gravity: 260,
        angle: -Math.PI / 2,
        spread: Math.PI,
      });
    }
    if (k === f.colors.length - 1 && f.move) this.finishMove(f.move);
  }

  private finishMove(m: Move): void {
    const env = this.env;
    const L = this.L;
    const to = m.to;
    const cx = this.pegX(to);
    if (m.revealed) {
      this.revealAge[m.from] = 0;
      env.audio.play("pop", { pitch: 1.1, volume: 0.7 });
      env.juice.particles.burst(
        this.pegX(m.from),
        this.slotY(m.from, this.game.state.pegs[m.from]!.length - 1),
        {
          count: 8,
          colors: ["#FFFFFF", "#CFE3FF"],
          shape: "star",
          speed: 120,
          size: 4,
          life: 420,
        },
      );
    }
    if (m.completed >= 0) {
      this.chain++;
      this.capAge[to] = 0;
      const look = LOOKS[m.completed % LOOKS.length]!;
      const top = this.rodTop(to) - 8;
      env.audio.play(this.chain > 1 ? "combo" : "success", {
        pitch: 1 + 0.12 * (this.chain - 1),
      });
      env.haptics.impact(this.chain > 1 ? "medium" : "light");
      env.juice.particles.burst(cx, top, {
        count: 14 + Math.min(this.chain, 4) * 4,
        colors: [look.base, look.light, GOLD, "#FFFFFF"],
        shape: "star",
        speed: 260,
        size: 6,
        life: 800,
        gravity: 200,
      });
      env.juice.particles.burst(cx, this.baseY(to) - L.eh, {
        count: 10,
        colors: [GOLD, "#FFFFFF"],
        shape: "ring",
        speed: 140,
        size: 5,
        life: 600,
      });
      env.juice.text.spawn(
        cx,
        top - 10,
        this.chain > 1 ? `Combo x${this.chain}!` : "Complete!",
        this.chain > 1 ? "#FFE680" : "#FFFFFF",
        this.chain > 1 ? 24 : 20,
        1000,
      );
      if (this.chain > 1) env.juice.shake.kick(0.2);
    } else {
      this.chain = 0;
    }
    for (const q of m.unlocked) {
      this.lockAge[q] = 0;
      env.audio.play("unlock", { volume: 0.9 });
      env.haptics.impact("medium");
      env.juice.particles.burst(this.pegX(q), this.rodTop(q) - 24, {
        count: 16,
        colors: [GOLD, "#FFFFFF", "#FFF2B0"],
        shape: "spark",
        speed: 220,
        size: 6,
        life: 700,
      });
      env.juice.text.spawn(this.pegX(q), this.rodTop(q) - 44, "Unlocked!", GOLD, 20, 1000);
    }
  }

  // ---- update --------------------------------------------------------------------

  update(dtMs: number): void {
    this.stepFlights(dtMs);
    const s = this.game.state;
    for (let p = 0; p < s.pegs.length; p++) {
      if (this.bump[p]! > 0) this.bump[p] = Math.max(0, this.bump[p]! - dtMs);
      if (this.landAge[p]! < 9000) this.landAge[p] = this.landAge[p]! + dtMs;
      if (this.revealAge[p]! < 9000) this.revealAge[p] = this.revealAge[p]! + dtMs;
      if (this.capAge[p]! >= 0 && this.capAge[p]! < 9000) this.capAge[p] = this.capAge[p]! + dtMs;
      if (this.lockAge[p]! >= 0 && this.lockAge[p]! < 9000)
        this.lockAge[p] = this.lockAge[p]! + dtMs;
    }
    // spring the lifted run toward the hover spot (or the finger while dragging)
    if (this.selected !== null && this.area) {
      const sel = this.selected;
      let tx = this.pegX(sel);
      let ty = this.hoverY(sel, 0, this.run);
      if (this.dragging) {
        tx = this.dragPoint.x;
        ty = Math.max(this.area.y + this.L.eh, this.dragPoint.y - 44);
      }
      if (this.env.reducedMotion) {
        this.liftX = tx;
        this.liftY = ty;
      } else {
        const dt = Math.min(dtMs, 33) / 1000;
        const K = 700;
        const C = 30;
        this.velX += ((tx - this.liftX) * K - this.velX * C) * dt;
        this.velY += ((ty - this.liftY) * K - this.velY * C) * dt;
        this.liftX += this.velX * dt;
        this.liftY += this.velY * dt;
        if (this.dragging) {
          this.liftX = approach(this.liftX, tx, 30, dtMs);
        }
      }
    }
  }

  // ---- drawing -------------------------------------------------------------------

  private ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }

  /** One chunky donut seen from slightly above. (cx, cy) is the centre of its top face. */
  private drawRing(
    g: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    color: number,
    hidden: boolean,
    squash = 0,
    flipX = 1,
    alpha = 1,
  ): void {
    const L = this.L;
    const look = hidden ? HIDDEN_LOOK : LOOKS[color % LOOKS.length]!;
    const w = L.ringW;
    const eh = L.eh;
    const rx = (w / 2) * flipX;
    const ry = eh / 2;
    const bottom = cy + ry;
    g.save();
    if (alpha < 1) g.globalAlpha = alpha;
    if (squash !== 0) {
      g.translate(cx, bottom);
      g.scale(1 + 0.18 * squash, 1 - 0.28 * squash);
      g.translate(-cx, -bottom);
    }
    // thickness
    g.fillStyle = look.dark;
    this.ellipse(g, cx, cy + eh * 0.12, rx, ry);
    g.fill();
    // top face
    g.fillStyle = look.base;
    this.ellipse(g, cx, cy - eh * 0.02, rx, ry * 0.96);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(0,0,0,0.38)";
    g.stroke();
    // puffy light
    g.globalAlpha = alpha * 0.32;
    g.fillStyle = look.light;
    this.ellipse(g, cx, cy - ry * 0.28, rx * 0.88, ry * 0.5);
    g.fill();
    g.globalAlpha = alpha;
    // hole with a glimpse of the peg
    g.fillStyle = look.deep;
    this.ellipse(g, cx, cy - eh * 0.02, rx * 0.4, ry * 0.4);
    g.fill();
    g.fillStyle = WOOD_LOOK.dark;
    g.fillRect(cx - 3, cy - eh * 0.2, 6, eh * 0.34);
    // glossy rim highlight and sparkle
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.strokeStyle = look.light;
    g.beginPath();
    g.ellipse(cx, cy - eh * 0.03, rx * 0.86, ry * 0.8, 0, Math.PI * 1.08, Math.PI * 1.55);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.85)";
    this.ellipse(
      g,
      cx - rx * 0.52,
      cy - ry * 0.42,
      Math.max(1.5, rx * 0.08),
      Math.max(1.2, ry * 0.1),
    );
    g.fill();
    // glyph on both shoulders (colour is never the only cue)
    if (Math.abs(flipX) > 0.5) {
      g.fillStyle = look.ink;
      g.font = `800 ${Math.round(eh * 0.4)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const glyph = hidden ? "?" : PIECE_GLYPHS[color % PIECE_GLYPHS.length]!;
      g.fillText(glyph, cx - rx * 0.7, cy + eh * 0.04);
      g.fillText(glyph, cx + rx * 0.7, cy + eh * 0.04);
    }
    g.restore();
  }

  private drawPegBody(
    g: CanvasRenderingContext2D,
    p: number,
    locked: boolean,
    glow: string | null,
  ): void {
    const L = this.L;
    const cx = this.pegX(p);
    const by = this.baseY(p);
    const rw = Math.max(8, L.eh * 0.2);
    const top = this.rodTop(p);
    const look = locked ? STEEL_LOOK : WOOD_LOOK;
    const plateRx = L.ringW * 0.56;
    const plateRy = L.eh * 0.3;
    // soft drop shadow
    g.fillStyle = "rgba(0,0,0,0.3)";
    this.ellipse(g, cx + 3, by + plateRy * 0.9 + 4, plateRx, plateRy);
    g.fill();
    // base plate
    g.fillStyle = look.dark;
    this.ellipse(g, cx, by + 5, plateRx, plateRy);
    g.fill();
    g.fillStyle = look.base;
    this.ellipse(g, cx, by, plateRx, plateRy);
    g.fill();
    if (glow) {
      g.lineWidth = 3.5;
      g.strokeStyle = glow;
      g.stroke();
    }
    // rod
    roundRectPath(g, cx - rw / 2, top, rw, by - top, rw / 2);
    g.fillStyle = look.base;
    g.fill();
    g.fillStyle = look.light;
    g.fillRect(cx - rw / 2 + 1, top + rw / 2, rw * 0.3, by - top - rw / 2);
    g.fillStyle = look.dark;
    g.fillRect(cx + rw * 0.2, top + rw / 2, rw * 0.3, by - top - rw / 2);
    // rod tip
    g.fillStyle = look.light;
    this.ellipse(g, cx, top + 1, rw * 0.62, rw * 0.5);
    g.fill();
  }

  private drawLockBadge(
    g: CanvasRenderingContext2D,
    p: number,
    scale: number,
    alpha: number,
  ): void {
    const s = this.game.state;
    const cx = this.pegX(p);
    const y = this.rodTop(p) - 26 - (1 - scale) * 26;
    const key = s.locks[p]!;
    g.save();
    g.globalAlpha = alpha;
    g.translate(cx, y);
    g.scale(scale, scale);
    g.fillStyle = "#1E2740";
    g.beginPath();
    g.arc(0, 0, 19, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = GOLD;
    g.stroke();
    drawIcon(g, "lock", 0, -3, 17, GOLD);
    // the colour that opens it, with its glyph
    const look = LOOKS[key % LOOKS.length]!;
    g.fillStyle = look.base;
    g.beginPath();
    g.arc(15, 14, 10, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#1E2740";
    g.stroke();
    g.fillStyle = look.ink;
    g.font = `800 12px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(PIECE_GLYPHS[key % PIECE_GLYPHS.length]!, 15, 14.5);
    g.restore();
  }

  private drawCapStar(g: CanvasRenderingContext2D, p: number, age: number, now: number): void {
    const cx = this.pegX(p);
    const k = clamp(age / 700, 0, 1);
    const sc = ease.outElastic(k);
    const bob = this.env.reducedMotion ? 0 : Math.sin(now / 380 + p) * 2.5;
    const y = this.rodTop(p) - 22 + bob;
    const R = 14 * sc;
    g.save();
    g.fillStyle = "rgba(0,0,0,0.25)";
    starPath(g, cx + 1.5, y + 2.5, R, R * 0.48, 0);
    g.fill();
    starPath(g, cx, y, R, R * 0.48, this.env.reducedMotion ? 0 : Math.sin(now / 900 + p) * 0.12);
    g.fillStyle = GOLD;
    g.fill();
    g.lineWidth = 2;
    g.lineJoin = "round";
    g.strokeStyle = GOLD_DARK;
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.75)";
    this.ellipse(g, cx - R * 0.28, y - R * 0.3, R * 0.14, R * 0.1);
    g.fill();
    g.restore();
    // twinkle
    if (!this.env.reducedMotion && age > 700) {
      const tw = (Math.sin(now / 420 + p * 2.1) + 1) / 2;
      if (tw > 0.85) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        const x = cx + 11;
        const yy = y - 10;
        g.fillRect(x - 0.8, yy - 4, 1.6, 8);
        g.fillRect(x - 4, yy - 0.8, 8, 1.6);
      }
    }
  }

  private drawArrow(g: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    const bob = this.env.reducedMotion ? 0 : Math.sin(now / 150) * 5;
    const pulse = this.env.reducedMotion ? 1 : 1 + Math.sin(now / 150) * 0.08;
    g.save();
    g.translate(x, y + bob);
    g.scale(pulse, pulse);
    g.beginPath();
    g.moveTo(-11, -12);
    g.lineTo(11, -12);
    g.lineTo(11, -2);
    g.lineTo(18, -2);
    g.lineTo(0, 16);
    g.lineTo(-18, -2);
    g.lineTo(-11, -2);
    g.closePath();
    g.fillStyle = "#FFF2B0";
    g.fill();
    g.lineWidth = 3;
    g.lineJoin = "round";
    g.strokeStyle = "#8A5A00";
    g.stroke();
    g.restore();
  }

  draw(g: CanvasRenderingContext2D, area: Area, now: number): void {
    this.area = area;
    const L = this.layout(area);
    const s = this.game.state;
    const n = s.pegs.length;
    const reduced = this.env.reducedMotion;

    // shelf panels behind each row
    for (let r = 0; r < L.rows; r++) {
      const y = L.top + r * L.rowH + 6;
      roundRectPath(g, area.x + 8, y, area.w - 16, L.rowH - 12, 22);
      g.fillStyle = "rgba(255,255,255,0.055)";
      g.fill();
    }

    const sel = this.selected;
    for (let p = 0; p < n; p++) {
      const peg = s.pegs[p]!;
      const locked = isLocked(s, p);
      const cx = this.pegX(p);
      let glow: string | null = null;
      if (sel === p) glow = "#FFE9A0";
      else if (this.dragging && this.hoverPeg === p && sel !== null) {
        glow = moveCount(s, sel, p) > 0 ? "#7CF2B0" : "#FF8A7A";
      } else if (this.hintMove && this.hintMove.from === p && sel === null) {
        glow = "#FFE9A0";
      } else if (this.hintMove && this.hintMove.to === p && sel === this.hintMove.from) {
        glow = "#7CF2B0";
      }
      const bumpK = this.bump[p]! / 320;
      const dx = bumpK > 0 && !reduced ? Math.sin((1 - bumpK) * 28) * 6 * bumpK : 0;
      g.save();
      if (dx !== 0) g.translate(dx, 0);
      this.drawPegBody(g, p, locked, glow);
      // resting rings
      const hiddenTop = this.pending[p]!;
      const liftedN = sel === p ? this.run : 0;
      const upto = peg.length - hiddenTop - liftedN;
      const landing = this.landAge[p]! < 400 ? this.landN[p]! : 0;
      const sq =
        landing > 0
          ? Math.pow(1 - this.landAge[p]! / 400, 2) *
            Math.cos((this.landAge[p]! / 400) * Math.PI * 2.5)
          : 0;
      for (let k = 0; k < upto; k++) {
        const isTop = k === peg.length - 1;
        const hidden = k < s.hid[p]!;
        const cy = this.slotY(p, k);
        const squash = k >= peg.length - landing && !reduced ? sq : 0;
        if (isTop && this.revealAge[p]! < 320 && !reduced) {
          const t = this.revealAge[p]! / 320;
          const flip = Math.abs(Math.cos(t * Math.PI));
          this.drawRing(g, cx, cy, peg[k]!, t < 0.5, 0, Math.max(0.12, flip));
        } else {
          this.drawRing(g, cx, cy, peg[k]!, hidden, squash, 1, locked ? 0.55 : 1);
        }
      }
      if (locked) {
        this.drawLockBadge(g, p, 1, 1);
      } else if (this.lockAge[p]! >= 0 && this.lockAge[p]! < 600) {
        const t = this.lockAge[p]! / 600;
        this.drawLockBadge(g, p, 1 - ease.outCubic(t), 1 - t);
      }
      if (this.capAge[p]! >= 0) this.drawCapStar(g, p, this.capAge[p]!, now);
      g.restore();
    }

    // lifted run, above every peg
    if (sel !== null && this.run > 0) {
      const peg = s.pegs[sel]!;
      const bob = !this.dragging && !reduced ? Math.sin(now / 240 + sel) * 3 : 0;
      const spacing = this.runSpacing(this.run);
      // shadow where it would land
      g.fillStyle = "rgba(0,0,0,0.22)";
      this.ellipse(
        g,
        this.liftX,
        this.slotY(sel, peg.length - this.run) + L.eh * 0.3,
        L.ringW * 0.4,
        L.eh * 0.22,
      );
      g.fill();
      for (let k = 0; k < this.run; k++) {
        this.drawRing(
          g,
          this.liftX,
          this.liftY + bob - k * spacing,
          peg[peg.length - this.run + k]!,
          false,
        );
      }
    }

    // flying rings
    for (const f of this.flights) {
      const n2 = f.colors.length;
      const tx = this.pegX(f.to);
      const spacing = this.runSpacing(n2);
      for (let k = f.landed; k < n2; k++) {
        const t = clamp((f.t - k * STAGGER_MS) / FLY_MS, 0, 1);
        const hoverEnd = this.rodTop(f.to) - L.eh * 0.6 - k * spacing;
        const slot = this.slotY(f.to, f.slot0 + k);
        let x: number;
        let y: number;
        if (t < 0.6) {
          const u = t / 0.6;
          const e = ease.smooth(u);
          x = lerp(f.x0[k]!, tx, e);
          const arc = f.from === f.to ? 0 : Math.sin(Math.PI * u) * L.pitch * 1.4;
          y = lerp(f.y0[k]!, hoverEnd, e) - arc;
        } else {
          const v = (t - 0.6) / 0.4;
          x = tx;
          y = lerp(hoverEnd, slot, ease.inQuad(v));
          g.fillStyle = `rgba(0,0,0,${0.12 + 0.12 * v})`;
          this.ellipse(g, tx, slot + L.eh * 0.3, L.ringW * (0.28 + 0.12 * v), L.eh * 0.18);
          g.fill();
        }
        this.drawRing(g, x, y, f.colors[k]!, false);
      }
    }

    // hint arrows
    if (this.hintMove && this.game.status() === "playing") {
      const h = this.hintMove;
      const target = sel === h.from ? h.to : h.from;
      this.drawArrow(
        g,
        this.pegX(target),
        this.rodTop(target) - (isLocked(s, target) ? 66 : 40),
        now,
      );
    }
  }
}

export default createLevelGame({
  slug: SLUG,
  title: "Ring Sort",
  levelCount: LEVEL_COUNT,
  worlds: WORLDS,
  theme: {
    bg: "#1B2A47",
    bg2: "#34507A",
    panel: "#263B5F",
    text: "#F7F1E3",
    muted: "#B9C6DC",
    accent: "#FFC857",
    accentText: "#1B1B1F",
    buttonFill: "#3A5683",
    star: "#FFD54A",
    confetti: [...PIECE_COLORS, "#FFFFFF"],
  },
  create: (env) => new RingController(env),
});
