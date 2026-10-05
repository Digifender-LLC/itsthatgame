// Park Out controller: rendering, touch input and juice on top of the shared level shell.
// Rules live in logic.ts; levels in levels.ts; art in draw.ts; geometry in layout.ts.
import {
  approach,
  clamp,
  ease,
  type Area,
  type Env,
  type LevelController,
  type PointerPoint,
  type Status,
} from "@itg/game-sdk";
import {
  GOLD,
  HERO_T,
  HERO_U,
  STYLES,
  drawArrow,
  drawBollard,
  drawGate,
  drawLot,
  drawVehicle,
  makeSpecks,
  type GateDraw,
} from "./draw";
import { boardLayout, cellAt, cellCenter, type BoardLayout } from "./layout";
import { LEVELS, introFor } from "./levels";
import {
  heroOut,
  isSolved,
  moveCount,
  newPuzzle,
  occupancy,
  posOf,
  reset,
  slideRange,
  slideTo,
  solve,
  starsFor,
  undo,
  type Puzzle,
} from "./logic";

interface Drag {
  i: number;
  /** Pointer offset from the vehicle origin along its axis, in cells. */
  grab: number;
  start: number;
  min: number;
  max: number;
  pos: number;
  moved: boolean;
  down: PointerPoint;
  lastCell: number;
  bumpArmed: boolean;
}

interface ExitHero {
  i: number;
  delay: number;
  off: number;
  vel: number;
  puff: number;
  started: boolean;
}

interface ExitState {
  t: number;
  heroes: ExitHero[];
  done: boolean;
  whooshed: boolean;
}

const TAP_SLOP = 8;
const HINT_MS = 4200;

export class ParkController implements LevelController {
  private puzzle: Puzzle;
  private index = 0;
  private lay: BoardLayout | null = null;
  private specks: number[] = [];
  private disp: number[] = [];
  private lift: number[] = [];
  private squash: number[] = [];
  private jit: number[] = [];
  private gen: number[] = [];
  private bollardJit = { cell: -1, v: 0 };
  private drag: Drag | null = null;
  private selected = -1;
  private exit: ExitState | null = null;
  private hintMove: { i: number; to: number } | null = null;
  private hintT = 0;
  private clock = 0;
  private idle = 0;
  private gateOpen = 0;

  constructor(private readonly env: Env) {
    this.puzzle = newPuzzle(LEVELS[0]!.rows);
  }

  // ---- LevelController -------------------------------------------------------------

  loadLevel(index: number): void {
    this.index = clamp(index, 0, LEVELS.length - 1);
    this.puzzle = newPuzzle(LEVELS[this.index]!.rows);
    this.specks = makeSpecks(this.puzzle.lot.size, this.index + 1);
    this.resetVisuals();
  }

  restart(): void {
    reset(this.puzzle);
    this.resetVisuals();
  }

  undo(): void {
    if (this.exit) return;
    const s = undo(this.puzzle);
    if (!s) return;
    this.clearTransient();
    this.animateTo(s.v, s.from, 200, ease.outCubic);
    this.env.audio.play("move", { pitch: 0.8, volume: 0.4 });
  }

  canUndo(): boolean {
    return !this.exit && this.puzzle.history.length > 0;
  }

  status(): Status {
    return this.exit?.done ? "won" : "playing";
  }

  busy(): boolean {
    return !!this.exit && !this.exit.done;
  }

  stars(): number {
    return starsFor(moveCount(this.puzzle.history), this.par());
  }

  hudInfo(): string {
    return `Moves ${moveCount(this.puzzle.history)} · par ${this.par()}`;
  }

  intro(index: number): string | undefined {
    return introFor(index);
  }

  hint(): boolean {
    if (this.exit || isSolved(this.puzzle.lot, this.puzzle.vehicles)) return false;
    const sol = solve(this.puzzle.lot, this.puzzle.vehicles, 1_500_000);
    const first = sol?.path[0];
    if (!first) return false;
    this.hintMove = { i: first[0], to: first[1] };
    this.hintT = HINT_MS;
    this.selected = -1;
    return true;
  }

  update(dt: number): void {
    this.clock += dt;
    this.idle += dt;
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintMove = null;
    }
    for (let i = 0; i < this.lift.length; i++) {
      const target = this.drag?.i === i && this.drag.moved ? 1 : 0;
      this.lift[i] = approach(this.lift[i]!, target, 22, dt);
    }
    this.gateOpen = approach(this.gateOpen, this.exit ? 1 : 0, 12, dt);
    this.updateExit(dt);
    this.idleEffects();
  }

  draw(g: CanvasRenderingContext2D, area: Area, nowMs: number): void {
    const lot = this.puzzle.lot;
    const l = boardLayout(area, lot.size);
    this.lay = l;
    drawLot(g, l, this.specks);
    for (const gate of this.gates()) drawGate(g, l, gate, nowMs);
    lot.walls.forEach((w, c) => {
      if (!w) return;
      const cx = c % lot.size;
      const cy = Math.floor(c / lot.size);
      const p = cellCenter(l, cx, cy);
      drawBollard(g, p.x, p.y, l.cell, this.bollardJit.cell === c ? this.bollardJit.v : 0);
    });
    this.drawSelection(g, l);
    const order = this.puzzle.vehicles
      .map((_, i) => i)
      .sort((a, b) => this.lift[a]! - this.lift[b]!);
    for (const i of order) this.drawOne(g, l, i, nowMs);
    this.drawHint(g, l, nowMs);
  }

  down(p: PointerPoint, area: Area): void {
    if (this.exit) return;
    const l = (this.lay = boardLayout(area, this.puzzle.lot.size));
    this.hintMove = null;
    const cell = cellAt(l, p.x, p.y);
    // tap-to-move: a free cell in line with the selected vehicle
    if (this.selected >= 0 && cell && this.tapMove(cell)) return;
    const hit = this.pick(l, p);
    if (hit < 0) {
      if (cell && this.puzzle.lot.walls[cell.cy * this.puzzle.lot.size + cell.cx]) {
        this.bumpBollard(cell.cy * this.puzzle.lot.size + cell.cx);
      }
      this.selected = -1;
      return;
    }
    const v = this.puzzle.vehicles[hit]!;
    const range = slideRange(this.puzzle.lot, this.puzzle.vehicles, hit);
    const pos = posOf(v);
    const axis = v.horizontal ? p.x : p.y;
    const origin = v.horizontal ? l.x : l.y;
    this.gen[hit]!++;
    this.disp[hit] = pos;
    this.drag = {
      i: hit,
      grab: clamp((axis - origin) / l.cell - pos, 0, v.len),
      start: pos,
      min: range.min,
      max: range.max,
      pos,
      moved: false,
      down: p,
      lastCell: pos,
      bumpArmed: true,
    };
    this.env.audio.play("select", { volume: 0.35, pitch: 1.15 });
  }

  move(p: PointerPoint, area: Area): void {
    const d = this.drag;
    if (!d || this.exit) return;
    const l = (this.lay = boardLayout(area, this.puzzle.lot.size));
    const v = this.puzzle.vehicles[d.i]!;
    if (!d.moved && Math.hypot(p.x - d.down.x, p.y - d.down.y) < TAP_SLOP) return;
    const axis = v.horizontal ? p.x : p.y;
    const origin = v.horizontal ? l.x : l.y;
    const raw = (axis - origin) / l.cell - d.grab;
    const pos = clamp(raw, d.min, d.max);
    if (Math.abs(pos - d.start) > 0.05) d.moved = true;
    d.pos = pos;
    this.disp[d.i] = pos;
    const over = raw < d.min ? d.min - raw : raw > d.max ? raw - d.max : 0;
    if (over > 0.14 && d.bumpArmed && d.min !== d.max) {
      d.bumpArmed = false;
      this.bump(d.i, raw > d.max ? 1 : -1);
    } else if (over < 0.04) {
      d.bumpArmed = true;
    }
    const c = Math.round(pos);
    if (c !== d.lastCell) {
      this.env.audio.play("move", { volume: 0.25, pitch: 0.95 + 0.04 * (c % 4) });
      d.lastCell = c;
    }
  }

  up(_p: PointerPoint, _area: Area): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) {
      // a tap: select / deselect the vehicle for tap-to-move
      this.disp[d.i] = d.start;
      this.selected = this.selected === d.i ? -1 : d.i;
      if (d.min === d.max) {
        this.selected = -1;
        this.bump(d.i, 1);
      }
      return;
    }
    this.selected = -1;
    const target = clamp(Math.round(d.pos), d.min, d.max);
    this.commit(d.i, target, d.pos);
  }

  // ---- internals -------------------------------------------------------------------

  private par(): number {
    return LEVELS[this.index]!.optimal;
  }

  private resetVisuals(): void {
    const n = this.puzzle.vehicles.length;
    this.disp = this.puzzle.vehicles.map(posOf);
    this.lift = new Array<number>(n).fill(0);
    this.squash = new Array<number>(n).fill(0);
    this.jit = new Array<number>(n).fill(0);
    this.gen = new Array<number>(n).fill(0);
    this.bollardJit = { cell: -1, v: 0 };
    this.clearTransient();
    this.exit = null;
    this.gateOpen = 0;
  }

  private clearTransient(): void {
    this.drag = null;
    this.selected = -1;
    this.hintMove = null;
    this.hintT = 0;
  }

  private gates(): GateDraw[] {
    return this.puzzle.vehicles
      .filter((v) => v.hero)
      .map((v) => ({ row: v.y, side: v.exit, open: this.gateOpen }));
  }

  /** Vehicle under a point, forgiving by a few px; -1 when none. */
  private pick(l: BoardLayout, p: PointerPoint): number {
    const vs = this.puzzle.vehicles;
    const pad = Math.max(4, l.cell * 0.12);
    let best = -1;
    let bestD = Infinity;
    vs.forEach((v, i) => {
      const x0 = l.x + v.x * l.cell;
      const y0 = l.y + v.y * l.cell;
      const w = (v.horizontal ? v.len : 1) * l.cell;
      const h = (v.horizontal ? 1 : v.len) * l.cell;
      const inside =
        p.x >= x0 - pad && p.x <= x0 + w + pad && p.y >= y0 - pad && p.y <= y0 + h + pad;
      if (!inside) return;
      const d = Math.hypot(p.x - (x0 + w / 2), p.y - (y0 + h / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private tapMove(cell: { cx: number; cy: number }): boolean {
    const i = this.selected;
    const v = this.puzzle.vehicles[i]!;
    const pos = posOf(v);
    const range = slideRange(this.puzzle.lot, this.puzzle.vehicles, i);
    const inLine = v.horizontal ? cell.cy === v.y : cell.cx === v.x;
    if (!inLine) return false;
    const c = v.horizontal ? cell.cx : cell.cy;
    let target = pos;
    if (c >= pos + v.len) target = c - v.len + 1;
    else if (c < pos) target = c;
    target = clamp(target, range.min, range.max);
    if (target === pos) return false;
    this.selected = -1;
    this.commit(i, target, pos);
    return true;
  }

  /** Apply a slide and play the landing: ease with overshoot, squash, dust, sound. */
  private commit(i: number, target: number, from: number): void {
    const before = this.puzzle.vehicles.map((v) => heroOut(this.puzzle.lot, v));
    const ok = slideTo(this.puzzle, i, target);
    if (!ok) {
      this.animateTo(i, posOf(this.puzzle.vehicles[i]!), 170, ease.outCubic, from);
      return;
    }
    const dist = Math.abs(target - from);
    this.animateTo(i, target, 150 + 25 * Math.min(dist, 4), ease.outBack, from);
    this.env.audio.play("drop", { volume: 0.7, pitch: 0.95 + Math.min(dist, 4) * 0.03 });
    this.env.haptics.impact("light");
    if (!this.env.reducedMotion) {
      this.env.juice.tweens.add(260, (v) => (this.squash[i] = Math.sin(v * Math.PI) * 0.9), {
        ease: ease.linear,
        delay: 120,
      });
    }
    this.dust(i, target);
    const lot = this.puzzle.lot;
    if (isSolved(lot, this.puzzle.vehicles)) {
      this.startExit();
    } else if (
      this.puzzle.vehicles[i]!.hero &&
      !before[i] &&
      heroOut(lot, this.puzzle.vehicles[i]!)
    ) {
      this.gateReached(i);
    }
  }

  private animateTo(
    i: number,
    to: number,
    ms: number,
    fn: (t: number) => number,
    from?: number,
  ): void {
    const a = from ?? this.disp[i]!;
    const gen = ++this.gen[i]!;
    if (this.env.reducedMotion || a === to) {
      this.disp[i] = to;
      return;
    }
    this.env.juice.tweens.add(
      ms,
      (v) => {
        if (this.gen[i] === gen) this.disp[i] = a + (to - a) * v;
      },
      {
        ease: fn,
        done: () => {
          if (this.gen[i] === gen) this.disp[i] = to;
        },
      },
    );
  }

  private vehiclePx(i: number): { cx: number; cy: number; ux: number; uy: number } | null {
    const l = this.lay;
    if (!l) return null;
    const v = this.puzzle.vehicles[i]!;
    const p = this.disp[i]!;
    const w = (v.horizontal ? v.len : 1) * l.cell;
    const h = (v.horizontal ? 1 : v.len) * l.cell;
    const x = l.x + (v.horizontal ? p : v.x) * l.cell;
    const y = l.y + (v.horizontal ? v.y : p) * l.cell;
    return { cx: x + w / 2, cy: y + h / 2, ux: v.horizontal ? 1 : 0, uy: v.horizontal ? 0 : 1 };
  }

  private dust(i: number, target: number): void {
    const pt = this.vehiclePx(i);
    const l = this.lay;
    if (!pt || !l) return;
    const v = this.puzzle.vehicles[i]!;
    const p0 = this.disp[i]!;
    const dir = target >= p0 ? -1 : 1; // dust trails behind the direction of travel
    const back = (v.len * l.cell) / 2;
    const tx = pt.cx + (target - p0) * l.cell * pt.ux + dir * pt.ux * back;
    const ty = pt.cy + (target - p0) * l.cell * pt.uy + dir * pt.uy * back;
    this.env.juice.particles.burst(tx, ty, {
      count: 5,
      colors: ["#B9B6C6", "#8F8C9E"],
      speed: 70,
      life: 360,
      size: 3.5,
      gravity: 0,
      drag: 3,
    });
  }

  private bump(i: number, dir: number): void {
    const l = this.lay;
    this.env.audio.play("bump", { volume: 0.7 });
    this.env.haptics.impact("light");
    if (!this.env.reducedMotion) {
      this.env.juice.tweens.add(
        240,
        (v) => (this.jit[i] = Math.sin(v * Math.PI * 7) * 3.2 * (1 - v)),
        { ease: ease.linear },
      );
    }
    const pt = this.vehiclePx(i);
    if (pt && l) {
      const v = this.puzzle.vehicles[i]!;
      const e = (v.len * l.cell) / 2;
      this.env.juice.particles.burst(pt.cx + dir * pt.ux * e, pt.cy + dir * pt.uy * e, {
        count: 5,
        colors: [GOLD, "#FFFFFF"],
        speed: 150,
        life: 260,
        size: 2.5,
        gravity: 0,
        shape: "spark",
      });
    }
  }

  private bumpBollard(cell: number): void {
    this.env.audio.play("bump", { volume: 0.6, pitch: 0.8 });
    this.env.haptics.impact("light");
    if (this.env.reducedMotion) return;
    this.bollardJit.cell = cell;
    this.env.juice.tweens.add(
      240,
      (v) => (this.bollardJit.v = Math.sin(v * Math.PI * 6) * 3 * (1 - v)),
      { ease: ease.linear },
    );
  }

  private gateReached(i: number): void {
    const l = this.lay;
    const v = this.puzzle.vehicles[i]!;
    this.env.audio.play("combo", { volume: 0.8 });
    if (!l) return;
    const gx = v.exit === 1 ? l.x + l.w : l.x;
    const gy = l.y + (v.y + 0.5) * l.cell;
    this.env.juice.particles.burst(gx, gy, {
      count: 14,
      colors: [GOLD, "#58E08F", "#FFFFFF"],
      speed: 220,
      shape: "star",
      size: 4,
      gravity: 200,
    });
    this.env.juice.text.spawn(gx - v.exit * 34, gy - 22, "At the gate!", GOLD, 16);
  }

  private startExit(): void {
    const heroes: ExitHero[] = [];
    this.puzzle.vehicles.forEach((v, i) => {
      if (v.hero) {
        heroes.push({
          i,
          delay: 140 + heroes.length * 110,
          off: 0,
          vel: 0,
          puff: 0,
          started: false,
        });
      }
    });
    this.selected = -1;
    this.hintMove = null;
    this.exit = { t: 0, heroes, done: false, whooshed: false };
    if (this.env.reducedMotion) {
      this.exit.done = true;
      this.exit.heroes.forEach((h) => (h.off = 99));
    }
  }

  private updateExit(dt: number): void {
    const ex = this.exit;
    if (!ex || ex.done) return;
    ex.t += dt;
    const sec = dt / 1000;
    let allGone = true;
    for (const h of ex.heroes) {
      const v = this.puzzle.vehicles[h.i]!;
      const gone = v.len + 0.8;
      if (h.off >= gone) continue;
      allGone = false;
      if (ex.t < h.delay) continue;
      if (!h.started) {
        h.started = true;
        this.env.audio.play("move", { pitch: 0.65, volume: 0.6 });
        this.env.haptics.impact("light");
      }
      h.vel += 17 * sec;
      h.off += h.vel * sec;
      if (!ex.whooshed && h.vel > 4) {
        ex.whooshed = true;
        this.env.audio.play("whoosh", { volume: 0.9 });
      }
      h.puff -= dt;
      const l = this.lay;
      if (h.puff <= 0 && l) {
        h.puff = 45;
        const centre = l.x + (this.disp[h.i]! + v.len / 2 + v.exit * h.off) * l.cell;
        const cx = centre - (v.exit * (v.len * l.cell)) / 2;
        const cy = l.y + (v.y + 0.5) * l.cell;
        this.env.juice.particles.burst(cx, cy, {
          count: 2,
          colors: ["#D8D5E2", "#A7A4B6", "#7C7A8A"],
          speed: 60,
          life: 520,
          size: 5,
          gravity: -30,
          drag: 2,
          angle: v.exit === 1 ? Math.PI : 0,
          spread: 0.9,
        });
      }
    }
    if (allGone) ex.done = true;
  }

  private idleEffects(): void {
    if (this.exit || this.env.reducedMotion || !this.lay || this.idle < 1400) return;
    this.idle = 0;
    const l = this.lay;
    for (const v of this.puzzle.vehicles) {
      if (!v.hero || heroOut(this.puzzle.lot, v)) continue;
      const cx = l.x + (v.x + (v.exit === 1 ? 0 : v.len)) * l.cell;
      this.env.juice.particles.burst(cx - v.exit * 2, l.y + (v.y + 0.5) * l.cell, {
        count: 1,
        colors: ["#9A98A8"],
        speed: 16,
        life: 700,
        size: 3,
        gravity: -8,
        drag: 1,
        angle: v.exit === 1 ? Math.PI : 0,
        spread: 0.6,
      });
    }
  }

  // ---- drawing ---------------------------------------------------------------------

  private drawOne(g: CanvasRenderingContext2D, l: BoardLayout, i: number, nowMs: number): void {
    const v = this.puzzle.vehicles[i]!;
    const hero = v.hero;
    const style = hero ? (v.exit === 1 ? HERO_T : HERO_U) : STYLES[styleIndex(v.id)]!;
    let p = this.disp[i]!;
    const ex = this.exit?.heroes.find((h) => h.i === i);
    if (ex) p += v.exit * ex.off;
    const jit = this.jit[i]!;
    const w = (v.horizontal ? v.len : 1) * l.cell;
    const h = (v.horizontal ? 1 : v.len) * l.cell;
    const x = l.x + (v.horizontal ? p : v.x) * l.cell + (v.horizontal ? 0 : jit);
    const y = l.y + (v.horizontal ? v.y : p) * l.cell + (v.horizontal ? jit : 0);
    // headings: heroes face their gate; the rest face by id
    const flip = (v.id.charCodeAt(0) & 1) === 1;
    const angle = v.horizontal
      ? (hero ? v.exit === -1 : flip)
        ? Math.PI
        : 0
      : flip
        ? -Math.PI / 2
        : Math.PI / 2;
    const idleWobble =
      hero && !this.exit && !heroOut(this.puzzle.lot, v) ? Math.sin(nowMs / 90) * 0.35 : 0;
    drawVehicle(g, {
      cx: x + w / 2 + (v.horizontal ? 0 : idleWobble),
      cy: y + h / 2 + (v.horizontal ? idleWobble : 0),
      len: v.len,
      cell: l.cell,
      angle,
      style,
      hero,
      lift: this.lift[i]!,
      squash: this.squash[i]!,
      selected: this.selected === i,
      glow: hero ? 0.5 + 0.5 * Math.sin(nowMs / 380) : 0,
    });
  }

  private drawSelection(g: CanvasRenderingContext2D, l: BoardLayout): void {
    if (this.selected < 0 || this.exit) return;
    const v = this.puzzle.vehicles[this.selected]!;
    const range = slideRange(this.puzzle.lot, this.puzzle.vehicles, this.selected);
    const pos = posOf(v);
    const occ = occupancy(this.puzzle.lot, this.puzzle.vehicles, this.selected);
    g.fillStyle = "rgba(255,255,255,0.14)";
    for (let q = range.min; q < range.max + v.len; q++) {
      if (q >= pos && q < pos + v.len) continue;
      const cx = v.horizontal ? q : v.x;
      const cy = v.horizontal ? v.y : q;
      if (occ[cy * l.size + cx] !== -1) continue;
      g.fillRect(l.x + cx * l.cell + 3, l.y + cy * l.cell + 3, l.cell - 6, l.cell - 6);
    }
    const pulse = 0.6 + 0.4 * Math.sin(this.clock / 180);
    const arrow = (dirSign: number) => {
      const edge = dirSign > 0 ? pos + v.len : pos;
      const cl = dirSign > 0 ? range.max + v.len : range.min;
      if (Math.abs(cl - edge) < 0.5) return;
      const a = edge + dirSign * 0.5;
      const x = v.horizontal ? l.x + a * l.cell : l.x + (v.x + 0.5) * l.cell;
      const y = v.horizontal ? l.y + (v.y + 0.5) * l.cell : l.y + a * l.cell;
      const ang = v.horizontal
        ? dirSign > 0
          ? 0
          : Math.PI
        : dirSign > 0
          ? Math.PI / 2
          : -Math.PI / 2;
      drawArrow(g, x, y, ang, l.cell * 0.2 * (0.9 + 0.2 * pulse), "#FFFFFF");
    };
    arrow(1);
    arrow(-1);
  }

  private drawHint(g: CanvasRenderingContext2D, l: BoardLayout, nowMs: number): void {
    const h = this.hintMove;
    if (!h || this.exit) return;
    const v = this.puzzle.vehicles[h.i]!;
    const pos = posOf(v);
    const sign = h.to > pos ? 1 : -1;
    const fade = Math.min(1, this.hintT / 400);
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 170);
    g.save();
    g.globalAlpha = fade;
    // ghost outline at the destination
    const gx = l.x + (v.horizontal ? h.to : v.x) * l.cell;
    const gy = l.y + (v.horizontal ? v.y : h.to) * l.cell;
    const gw = (v.horizontal ? v.len : 1) * l.cell;
    const gh = (v.horizontal ? 1 : v.len) * l.cell;
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeStyle = GOLD;
    g.strokeRect(gx + 4, gy + 4, gw - 8, gh - 8);
    g.setLineDash([]);
    // pulsing arrow on the vehicle, pointing the way it should go
    const p = this.disp[h.i]!;
    const cx = l.x + (v.horizontal ? p + v.len / 2 : v.x + 0.5) * l.cell;
    const cy = l.y + (v.horizontal ? v.y + 0.5 : p + v.len / 2) * l.cell;
    const bob = sign * pulse * l.cell * 0.14;
    const ang = v.horizontal ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    drawArrow(
      g,
      cx + (v.horizontal ? bob : 0),
      cy + (v.horizontal ? 0 : bob),
      ang,
      l.cell * (0.26 + 0.05 * pulse),
      GOLD,
    );
    g.restore();
  }
}

/** Stable colour/symbol per vehicle letter. */
export function styleIndex(id: string): number {
  return (id.charCodeAt(0) * 7 + 3) % STYLES.length;
}
