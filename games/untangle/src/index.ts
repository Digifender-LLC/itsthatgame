// Untangle: glowing beads on elastic threads. Drag the beads until no two threads cross.
// All visuals are procedural Canvas 2D; node positions are normalized (0..1) and mapped onto
// a tall board inside the play area the shell hands us. The shell (createLevelGame) owns the
// HUD, level map, win card and saves; this controller owns the rules, drawing and touch.
import {
  FONT,
  approach,
  clamp,
  createLevelGame,
  ease,
  roundRectPath,
  shade,
  type Area,
  type Env,
  type LevelController,
  type PointerPoint,
  type Status,
  type Theme,
} from "@itg/game-sdk";
import { LEVELS, LEVEL_COUNT } from "./levels";
import {
  bestRelocation,
  commitMove,
  createState,
  crossingPairs,
  intersectionPoint,
  isPinned,
  moveCount,
  moveNode,
  partnerOf,
  starLimits,
  starsFor,
  undo as undoState,
  type Point,
  type UntangleState,
} from "./logic";

export const SLUG = "untangle";

export const THEME: Theme = {
  bg: "#0D1330",
  bg2: "#1A1F4D",
  panel: "#18204E",
  text: "#F3F5FF",
  muted: "#B4BDEB",
  accent: "#FFC857",
  accentText: "#241A00",
  buttonFill: "#2B3677",
  star: "#FFD35A",
  confetti: ["#5EE6C8", "#FFC857", "#FF7AB6", "#9B8CFF", "#6FC3FF"],
};

export const WORLDS = [
  { name: "Loose Threads", from: 1 },
  { name: "Knot Garden", from: 11 },
  { name: "Pinned Down", from: 21 },
  { name: "Twin Beads", from: 31 },
  { name: "Loom Hall", from: 41 },
  { name: "The Grand Web", from: 51 },
];

const INTROS: Record<number, string> = {
  0: "Drag the beads until no thread crosses",
  10: "Knot Garden: more beads, bigger tangles",
  20: "New: pinned beads (steel studs) never move",
  30: "New: twin beads (gold clasp) move as one",
  40: "Loom Hall: pins and twins together",
  50: "The Grand Web: the biggest tangles yet",
};

const BEAD_COLORS = ["#5EE6C8", "#FFC857", "#FF7AB6", "#9B8CFF", "#6FC3FF"];
const THREAD = "#8DA2F5";
const CROSS = "#FF6B5E";
const GOLD = "#FFD166";
const STEEL = "#C7D0E6";
const GRAB_RADIUS = 44; // px, generous: the nearest bead within this is grabbed
const LIFT = 34; // px the held bead floats above the fingertip
const MIN_SOUND_GAP = 110; // ms between crossing-change sounds

interface Board {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Marker {
  x: number;
  y: number;
}

interface Hint {
  node: number;
  to: Point;
  age: number;
}

type Phase = "play" | "celebrate" | "won";

export class UntangleController implements LevelController {
  private state: UntangleState = createState(LEVELS[0]!);
  private idx = 0;
  private phase: Phase = "play";
  private clock = 0;
  private area: Area = { x: 0, y: 60, w: 390, h: 720 };

  // drag
  private grab = -1; // lead node being dragged
  private touch: PointerPoint = { x: 0, y: 0 };
  private before: Point[] = [];
  private settling = -1; // node still easing to its drop point
  private settleTarget: Point = { x: 0, y: 0 };

  // per-bead motion (spring-driven lift, landing flag, pin rejection shake)
  private lift: number[] = [];
  private liftVel: number[] = [];
  private landed: boolean[] = [];
  private nudge: number[] = [];

  // crossings
  private markers = new Map<number, Marker>();
  private crossCount = 0;
  private soundAt = -1e9;
  private streak = 0;
  private streakAt = -1e9;
  private countPulse = 0;

  // undo slide
  private slide: { t: number; from: Point[]; to: Point[] } | null = null;

  // win wave
  private waveT = 0;
  private waveOrder: number[] = [];
  private waveNext = 0;
  private pulseAt: number[] = [];
  private waveDur = 1500;

  private hintState: Hint | null = null;

  constructor(private readonly env: Env) {
    this.loadLevel(0);
  }

  // ---- LevelController ------------------------------------------------------------

  loadLevel(index: number): void {
    this.idx = Math.max(0, Math.min(LEVEL_COUNT - 1, index));
    this.resetState();
  }

  restart(): void {
    this.resetState();
  }

  private resetState(): void {
    const level = LEVELS[this.idx]!;
    this.state = createState(level);
    const n = level.nodeCount;
    this.phase = "play";
    this.grab = -1;
    this.settling = -1;
    this.slide = null;
    this.hintState = null;
    this.lift = new Array<number>(n).fill(0);
    this.liftVel = new Array<number>(n).fill(0);
    this.landed = new Array<boolean>(n).fill(true);
    this.nudge = new Array<number>(n).fill(0);
    this.pulseAt = new Array<number>(n).fill(-1e9);
    this.streak = 0;
    this.refreshCrossings(false);
  }

  status(): Status {
    return this.phase === "won" ? "won" : "playing";
  }

  busy(): boolean {
    return this.phase === "celebrate";
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.finishSettle();
    this.grab = -1;
    const from = this.state.pos.map((p) => ({ ...p }));
    this.state = undoState(this.state);
    const to = this.state.pos.map((p) => ({ ...p }));
    this.state = { ...this.state, pos: from };
    this.slide = this.env.reducedMotion ? null : { t: 0, from, to };
    if (!this.slide) this.state = { ...this.state, pos: to };
    this.hintState = null;
    this.refreshCrossings(true);
  }

  canUndo(): boolean {
    return this.phase === "play" && this.state.history.length > 0 && this.slide === null;
  }

  stars(): number {
    return starsFor(this.state.level.par, moveCount(this.state));
  }

  hudInfo(): string {
    const { par } = this.state.level;
    const [three, two] = starLimits(par);
    const m = moveCount(this.state);
    const tier = m <= three ? `★★★ ≤ ${three}` : m <= two ? `★★ ≤ ${two}` : "★";
    return `Moves ${m} · ${tier}`;
  }

  intro(index: number): string | undefined {
    return INTROS[index];
  }

  hint(): boolean {
    if (this.phase !== "play") return false;
    this.finishSettle();
    if (this.grab >= 0) return false;
    const r = bestRelocation(this.state);
    if (!r) return false;
    this.hintState = { node: r.node, to: r.to, age: 0 };
    return true;
  }

  // ---- input ------------------------------------------------------------------------

  private board(area: Area): Board {
    const padX = 26;
    const top = 44; // room for the crossings readout
    const bottom = 26;
    return {
      x: area.x + padX,
      y: area.y + top,
      w: Math.max(40, area.w - padX * 2),
      h: Math.max(40, area.h - top - bottom),
    };
  }

  private px(b: Board, p: Point): Point {
    return { x: b.x + p.x * b.w, y: b.y + p.y * b.h };
  }

  private nodeAtPx(p: PointerPoint, b: Board): number {
    let best = -1;
    let bestD = Infinity;
    const level = this.state.level;
    for (let i = 0; i < this.state.pos.length; i++) {
      const q = this.px(b, this.state.pos[i]!);
      let d = Math.hypot(q.x - p.x, q.y - p.y);
      // pinned beads are only grabbed when the finger is really on them
      if (isPinned(level, i)) d *= 1.5;
      if (d <= GRAB_RADIUS && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  down(p: PointerPoint, area: Area): void {
    this.area = area;
    if (this.phase !== "play" || this.slide) return;
    this.finishSettle();
    const b = this.board(area);
    const node = this.nodeAtPx(p, b);
    if (node < 0) return;
    if (isPinned(this.state.level, node)) {
      this.nudge[node] = 1;
      this.env.audio.play("bump", { pitch: 0.9, volume: 0.6 });
      this.env.haptics.impact("light");
      return;
    }
    this.grab = node;
    this.touch = p;
    this.before = this.state.pos.map((q) => ({ ...q }));
    this.hintState = null;
    this.streak = 0;
    const partner = partnerOf(this.state.level, node);
    for (const k of partner >= 0 ? [node, partner] : [node]) {
      this.landed[k] = false;
      this.liftVel[k] = (this.liftVel[k] ?? 0) + 2;
    }
    this.env.audio.play("select", { pitch: 1.1, volume: 0.7 });
    this.env.haptics.impact("light");
  }

  move(p: PointerPoint, area: Area): void {
    this.area = area;
    if (this.grab >= 0) this.touch = p;
  }

  up(p: PointerPoint, area: Area): void {
    this.area = area;
    if (this.grab < 0) return;
    this.touch = p;
    this.settleTarget = this.dragTarget(area);
    this.settling = this.grab;
    this.grab = -1;
  }

  /** Normalized target for the dragged bead: above the fingertip, easing less near the bottom. */
  private dragTarget(area: Area): Point {
    const b = this.board(area);
    const bottom = area.y + area.h;
    const lift = LIFT * clamp((bottom - this.touch.y) / 80, 0.1, 1);
    return {
      x: (this.touch.x - b.x) / b.w,
      y: (this.touch.y - lift - b.y) / b.h,
    };
  }

  private finishSettle(): void {
    if (this.settling < 0) return;
    const node = this.settling;
    this.settling = -1;
    this.state = moveNode(this.state, node, this.settleTarget);
    this.afterDrop();
  }

  private afterDrop(): void {
    this.state = commitMove(this.state, this.before);
    this.refreshCrossings(true);
    if (this.crossCount === 0) this.startCelebration();
  }

  // ---- crossings ---------------------------------------------------------------------

  private refreshCrossings(announce: boolean): void {
    const { edges } = this.state.level;
    const pos = this.state.pos;
    const pairs = crossingPairs(edges, pos);
    const next = new Map<number, Marker>();
    for (const [i, j] of pairs) {
      const e = edges[i]!;
      const f = edges[j]!;
      const m = intersectionPoint(pos[e[0]]!, pos[e[1]]!, pos[f[0]]!, pos[f[1]]!);
      if (m) next.set(i * 1000 + j, m);
      else next.set(i * 1000 + j, pos[e[0]]!);
    }
    const prev = this.markers;
    const prevCount = this.crossCount;
    this.markers = next;
    this.crossCount = pairs.length;
    if (!announce) return;
    if (this.crossCount !== prevCount) this.countPulse = 1;
    const b = this.board(this.area);
    if (this.crossCount < prevCount) {
      let popped = 0;
      for (const [k, m] of prev) {
        if (next.has(k) || popped >= 6) continue;
        popped++;
        const q = this.px(b, m);
        this.env.juice.particles.burst(q.x, q.y, {
          count: 7,
          colors: [CROSS, "#FFFFFF", GOLD],
          speed: 150,
          life: 420,
          size: 3.2,
          gravity: 80,
          shape: "spark",
        });
        this.env.juice.particles.burst(q.x, q.y, {
          count: 1,
          colors: [CROSS],
          speed: 0,
          life: 380,
          size: 5,
          gravity: 0,
          shape: "ring",
        });
      }
      if (this.clock - this.soundAt > MIN_SOUND_GAP) {
        this.soundAt = this.clock;
        this.streak = this.clock - this.streakAt < 1600 ? this.streak + 1 : 0;
        this.streakAt = this.clock;
        this.env.audio.play("pop", { pitch: 1 + 0.12 * Math.min(this.streak, 9), volume: 0.8 });
        this.env.haptics.impact("light");
      }
    } else if (this.crossCount > prevCount && this.clock - this.soundAt > MIN_SOUND_GAP) {
      this.soundAt = this.clock;
      this.streak = 0;
      this.env.audio.play("bump", { pitch: 0.6, volume: 0.5 });
    }
  }

  // ---- win celebration ----------------------------------------------------------------

  private startCelebration(): void {
    this.phase = "celebrate";
    this.waveT = 0;
    this.waveNext = 0;
    this.waveDur = this.env.reducedMotion ? 450 : 1500;
    const pos = this.state.pos;
    this.waveOrder = pos.map((_, i) => i).sort((a, b) => pos[a]!.x - pos[b]!.x);
    this.env.audio.play("success", { volume: 0.8 });
  }

  /** The wave front, in normalized x, for the current wave time. */
  private waveFront(): number {
    return -0.12 + 1.24 * ease.inOutSine(clamp(this.waveT / this.waveDur, 0, 1));
  }

  // ---- update -------------------------------------------------------------------------

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 50);
    this.clock += dt;
    this.countPulse = Math.max(0, this.countPulse - dt / 320);
    if (this.hintState) {
      this.hintState.age += dt;
      if (this.hintState.age > 6000) this.hintState = null;
    }

    // dragged bead follows the finger with a slight lag
    const dragNode = this.grab >= 0 ? this.grab : this.settling;
    if (dragNode >= 0) {
      const target = this.grab >= 0 ? this.dragTarget(this.area) : this.settleTarget;
      const cur = this.state.pos[dragNode]!;
      const next = {
        x: approach(cur.x, target.x, 26, dt),
        y: approach(cur.y, target.y, 26, dt),
      };
      this.state = moveNode(this.state, dragNode, next);
      this.refreshCrossings(true);
      if (this.grab < 0) {
        const now = this.state.pos[dragNode]!;
        const b = this.board(this.area);
        const clampT = {
          x: clamp(target.x, 0, 1),
          y: clamp(target.y, 0, 1),
        };
        if (Math.hypot((now.x - clampT.x) * b.w, (now.y - clampT.y) * b.h) < 0.6) {
          this.finishSettle();
        } else if (partnerOf(this.state.level, dragNode) >= 0) {
          // a clamped pair can never reach its raw target; stop once it stops moving
          const moved = Math.hypot((now.x - cur.x) * b.w, (now.y - cur.y) * b.h);
          if (moved < 0.02) this.finishSettle();
        }
      }
    }

    // undo slide
    if (this.slide) {
      this.slide.t += dt;
      const k = ease.outCubic(clamp(this.slide.t / 240, 0, 1));
      const { from, to } = this.slide;
      this.state = {
        ...this.state,
        pos: from.map((p, i) => ({
          x: p.x + (to[i]!.x - p.x) * k,
          y: p.y + (to[i]!.y - p.y) * k,
        })),
      };
      if (this.slide.t >= 240) {
        this.state = { ...this.state, pos: to };
        this.slide = null;
      }
      this.refreshCrossings(true);
    }

    this.updateBeads(dt);

    if (this.phase === "celebrate") this.updateCelebration(dt);
  }

  private updateBeads(dt: number): void {
    const level = this.state.level;
    const held = this.grab >= 0 ? this.grab : -1;
    const heldPartner = held >= 0 ? partnerOf(level, held) : -1;
    // fixed small sub-steps keep the spring stable on slow frames
    const steps = Math.ceil(dt / 8);
    const h = dt / 1000 / steps;
    for (let i = 0; i < this.lift.length; i++) {
      this.nudge[i] = Math.max(0, this.nudge[i]! - dt / 320);
      const target = i === held || i === heldPartner ? 1 : 0;
      let x = this.lift[i]!;
      let v = this.liftVel[i]!;
      if (target === 0 && Math.abs(x) < 0.001 && Math.abs(v) < 0.01) {
        this.lift[i] = 0;
        this.liftVel[i] = 0;
        continue;
      }
      for (let s = 0; s < steps; s++) {
        v += (260 * (target - x) - 15 * v) * h;
        x += v * h;
      }
      this.lift[i] = x;
      this.liftVel[i] = v;
      if (target === 0 && !this.landed[i] && x < 0.04 && i !== this.settling) {
        this.landed[i] = true;
        this.land(i);
      }
    }
  }

  private land(i: number): void {
    const b = this.board(this.area);
    const q = this.px(b, this.state.pos[i]!);
    this.env.audio.play("drop", { volume: 0.55, pitch: 1.1 });
    this.env.juice.particles.burst(q.x, q.y + 6, {
      count: 1,
      colors: ["#FFFFFF"],
      speed: 0,
      life: 320,
      size: 4,
      gravity: 0,
      shape: "ring",
    });
  }

  private updateCelebration(dt: number): void {
    this.waveT += dt;
    const front = this.waveFront();
    const pos = this.state.pos;
    const b = this.board(this.area);
    const n = this.waveOrder.length;
    while (this.waveNext < n && pos[this.waveOrder[this.waveNext]!]!.x <= front) {
      const i = this.waveOrder[this.waveNext]!;
      const step = this.waveNext;
      this.waveNext++;
      this.pulseAt[i] = this.clock;
      const q = this.px(b, pos[i]!);
      this.env.audio.play("pop", { pitch: 0.9 + (1.1 * step) / Math.max(1, n - 1), volume: 0.45 });
      this.env.juice.particles.burst(q.x, q.y, {
        count: 6,
        colors: BEAD_COLORS,
        speed: 120,
        life: 480,
        size: 3,
        gravity: 60,
        shape: "star",
      });
    }
    if (this.waveT >= this.waveDur + 260) this.phase = "won";
  }

  // ---- drawing ------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, area: Area, nowMs: number): void {
    this.area = area;
    const b = this.board(area);
    const level = this.state.level;
    const pos = this.state.pos;
    const edges = level.edges;
    const t = nowMs / 1000;
    const R = clamp(Math.min(b.w, b.h) * 0.042, 11, 15);
    const pts = pos.map((p) => this.px(b, p));

    this.drawBoard(g, b);
    this.drawCounter(g, area);

    const crossing = new Set<number>();
    for (const k of this.markers.keys()) {
      crossing.add(Math.floor(k / 1000));
      crossing.add(k % 1000);
    }
    const heldNodes = new Set<number>();
    if (this.grab >= 0) {
      heldNodes.add(this.grab);
      const pr = partnerOf(level, this.grab);
      if (pr >= 0) heldNodes.add(pr);
    }
    const solvedNow = this.crossCount === 0;

    // threads: soft shadow, glow, body
    g.lineCap = "round";
    for (let i = 0; i < edges.length; i++) {
      const [a, c] = edges[i]!;
      const lift = Math.max(this.lift[a]!, this.lift[c]!, 0);
      g.strokeStyle = "rgba(0,0,0,0.28)";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(pts[a]!.x + 2, pts[a]!.y + 3 + lift * 4);
      g.lineTo(pts[c]!.x + 2, pts[c]!.y + 3 + lift * 4);
      g.stroke();
    }
    for (let i = 0; i < edges.length; i++) {
      const [a, c] = edges[i]!;
      const hot = heldNodes.has(a) || heldNodes.has(c);
      const bad = crossing.has(i);
      const pa = pts[a]!;
      const pc = pts[c]!;
      if (hot) {
        g.strokeStyle = solvedNow ? "rgba(94,230,200,0.35)" : "rgba(255,255,255,0.22)";
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(pa.x, pa.y);
        g.lineTo(pc.x, pc.y);
        g.stroke();
      }
      g.strokeStyle = bad ? CROSS : solvedNow ? "#7FF0D6" : hot ? "#DCE4FF" : THREAD;
      g.lineWidth = bad ? 3.6 : hot ? 3.6 : 3;
      if (bad) g.setLineDash([9, 6]);
      g.beginPath();
      g.moveTo(pa.x, pa.y);
      g.lineTo(pc.x, pc.y);
      g.stroke();
      if (bad) g.setLineDash([]);
      // thin sheen along the thread
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pa.x - 0.6, pa.y - 1);
      g.lineTo(pc.x - 0.6, pc.y - 1);
      g.stroke();
      if (!this.env.reducedMotion && this.phase === "play" && !bad) {
        // a slow glint travels along each calm thread
        const k = (t * 0.22 + i * 0.37) % 1;
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.beginPath();
        g.arc(pa.x + (pc.x - pa.x) * k, pa.y + (pc.y - pa.y) * k, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }

    if (this.phase !== "play") this.drawWave(g, b, pts);

    // pair clasps
    for (const [a, c] of level.pairs) this.drawClasp(g, pts[a]!, pts[c]!);

    // crossing markers
    for (const m of this.markers.values()) {
      const q = this.px(b, m);
      const pulse = 0.5 + 0.5 * Math.sin(t * 7 + q.x * 0.05);
      const dense = this.markers.size > 24;
      const s = (dense ? 4.2 : 6) + (dense ? 1 : 2.2) * pulse;
      if (!dense) {
        g.fillStyle = `rgba(255,107,94,${0.22 + 0.18 * pulse})`;
        g.beginPath();
        g.arc(q.x, q.y, s + 5, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.moveTo(q.x, q.y - s);
      g.lineTo(q.x + s, q.y);
      g.lineTo(q.x, q.y + s);
      g.lineTo(q.x - s, q.y);
      g.closePath();
      g.fillStyle = "#FFF3E0";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = CROSS;
      g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(q.x - s * 0.42, q.y - s * 0.42);
      g.lineTo(q.x + s * 0.42, q.y + s * 0.42);
      g.moveTo(q.x + s * 0.42, q.y - s * 0.42);
      g.lineTo(q.x - s * 0.42, q.y + s * 0.42);
      g.stroke();
    }

    this.drawHint(g, b, pts, R, t);

    // beads: resting ones first, the held one on top
    const order = pts.map((_, i) => i).sort((x, y) => this.lift[x]! - this.lift[y]!);
    for (const i of order) this.drawBead(g, i, pts[i]!, R, t, heldNodes.has(i), solvedNow);
  }

  private drawBoard(g: CanvasRenderingContext2D, b: Board): void {
    g.save();
    roundRectPath(g, b.x - 14, b.y - 14, b.w + 28, b.h + 28, 22);
    g.fillStyle = "rgba(255,255,255,0.045)";
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(180,189,235,0.2)";
    g.stroke();
    // faint dot grid for depth
    g.fillStyle = "rgba(180,189,235,0.12)";
    g.beginPath();
    for (let x = b.x; x <= b.x + b.w + 1; x += 32) {
      for (let y = b.y; y <= b.y + b.h + 1; y += 32) g.rect(x - 1, y - 1, 2, 2);
    }
    g.fill();
    g.restore();
  }

  private drawCounter(g: CanvasRenderingContext2D, area: Area): void {
    const cy = area.y + 22;
    const x = area.x + 20;
    const pop = 1 + 0.25 * ease.pulse(this.countPulse);
    g.save();
    g.textBaseline = "middle";
    g.textAlign = "left";
    const clear = this.crossCount === 0;
    // diamond icon + text so the state is never colour alone
    const s = 8 * pop;
    g.beginPath();
    g.moveTo(x + 8, cy - s);
    g.lineTo(x + 8 + s, cy);
    g.lineTo(x + 8, cy + s);
    g.lineTo(x + 8 - s, cy);
    g.closePath();
    g.fillStyle = clear ? "#7FF0D6" : CROSS;
    g.fill();
    g.fillStyle = THEME.text;
    g.font = `800 ${Math.round(16 * pop)}px ${FONT}`;
    g.fillText(clear ? "All clear" : `Crossings ${this.crossCount}`, x + 24, cy + 1);
    const r = this.state.level;
    const tags: string[] = [];
    if (r.pinned.length) tags.push(`${r.pinned.length} pinned`);
    if (r.pairs.length) tags.push(`${r.pairs.length} twin${r.pairs.length > 1 ? "s" : ""}`);
    if (tags.length) {
      g.textAlign = "right";
      g.fillStyle = THEME.muted;
      g.font = `600 13px ${FONT}`;
      g.fillText(tags.join(" · "), area.x + area.w - 20, cy + 1);
    }
    g.restore();
  }

  private drawClasp(g: CanvasRenderingContext2D, a: Point, c: Point): void {
    const mx = (a.x + c.x) / 2;
    const my = (a.y + c.y) / 2;
    const ang = Math.atan2(c.y - a.y, c.x - a.x);
    g.save();
    g.translate(mx, my);
    g.rotate(ang);
    roundRectPath(g, -11, -6.5, 22, 13, 5);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.translate(1.5, 2.5);
    g.fill();
    g.translate(-1.5, -2.5);
    roundRectPath(g, -11, -6.5, 22, 13, 5);
    g.fillStyle = GOLD;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = shade(GOLD, -0.45);
    g.stroke();
    g.strokeStyle = shade(GOLD, -0.45);
    g.beginPath();
    g.moveTo(-3, -3.5);
    g.lineTo(-3, 3.5);
    g.moveTo(3, -3.5);
    g.lineTo(3, 3.5);
    g.stroke();
    g.restore();
  }

  private drawBead(
    g: CanvasRenderingContext2D,
    i: number,
    p: Point,
    R: number,
    t: number,
    held: boolean,
    solved: boolean,
  ): void {
    const level = this.state.level;
    const pinned = isPinned(level, i);
    const paired = partnerOf(level, i) >= 0;
    const lift = this.lift[i]!;
    const pulse = ease.pulse((this.clock - this.pulseAt[i]!) / 420);
    const bob = pinned || this.env.reducedMotion || held ? 0 : Math.sin(t * 1.7 + i * 1.3) * 1.3;
    const shake = this.nudge[i]! > 0 ? Math.sin(this.nudge[i]! * 38) * 4 * this.nudge[i]! : 0;
    const squash = Math.max(0, -lift);
    const base = 1 + Math.max(lift, -0.3) * 0.38 + pulse * 0.45;
    const sx = base * (1 + 0.55 * squash);
    const sy = base * (1 - 0.45 * squash);
    const cx = p.x + shake;
    const cy = p.y + bob - Math.max(0, lift) * 6;
    const color = pinned ? STEEL : BEAD_COLORS[i % BEAD_COLORS.length]!;

    // soft drop shadow: a dark offset ellipse that grows and drifts as the bead lifts
    const sh = Math.max(0, lift);
    g.fillStyle = `rgba(0,0,0,${0.3 - 0.08 * Math.min(1, sh)})`;
    g.beginPath();
    g.ellipse(p.x + 2 + sh * 8, p.y + R * 0.7 + 3 + sh * 12, R * (1 + sh * 0.3), R * 0.55, 0, 0, 7);
    g.fill();

    // glow when held, when the board is solved, or pulsing in the win wave
    const glow = held ? 1 : pulse;
    if (glow > 0.02 || (solved && this.phase === "play")) {
      g.fillStyle = shade(color, 0.1);
      g.globalAlpha = (solved && this.phase === "play" ? 0.22 : 0.3) * Math.max(glow, 0.7);
      g.beginPath();
      g.arc(cx, cy, R * base * 1.9, 0, 7);
      g.fill();
      g.globalAlpha = 1;
    }
    if (this.hintState && this.hintState.node === i) {
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      g.strokeStyle = GOLD;
      g.lineWidth = 3;
      g.globalAlpha = 0.5 + 0.5 * k;
      g.beginPath();
      g.arc(cx, cy, R * 1.9 + k * 4, 0, 7);
      g.stroke();
      g.globalAlpha = 1;
    }

    g.save();
    g.translate(cx, cy);
    g.scale(sx, sy);
    // body, rim, inner light, highlight
    g.fillStyle = shade(color, -0.4);
    g.beginPath();
    g.arc(0, 0, R, 0, 7);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(-0.5, -1, R * 0.88, 0, 7);
    g.fill();
    g.fillStyle = shade(color, 0.38);
    g.beginPath();
    g.arc(-R * 0.22, -R * 0.3, R * 0.55, 0, 7);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.ellipse(-R * 0.36, -R * 0.45, R * 0.2, R * 0.13, -0.6, 0, 7);
    g.fill();
    if (pinned) {
      // screw head: dark disc with a slot, so pins read without colour
      g.fillStyle = "#2A3350";
      g.beginPath();
      g.arc(0, 0.5, R * 0.42, 0, 7);
      g.fill();
      g.strokeStyle = "#E6ECFA";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-R * 0.26, R * 0.26);
      g.lineTo(R * 0.26, -R * 0.2);
      g.stroke();
    }
    if (paired) {
      g.strokeStyle = GOLD;
      g.lineWidth = 2.6;
      g.beginPath();
      g.arc(0, 0, R + 1.2, 0, 7);
      g.stroke();
    }
    if (held) {
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, R + 1, 0, 7);
      g.stroke();
    }
    g.restore();
  }

  private drawHint(
    g: CanvasRenderingContext2D,
    b: Board,
    pts: Point[],
    R: number,
    t: number,
  ): void {
    const h = this.hintState;
    if (!h) return;
    const to = this.px(b, h.to);
    const from = pts[h.node]!;
    const fade = h.age > 5200 ? 1 - (h.age - 5200) / 800 : 1;
    g.save();
    g.globalAlpha = clamp(fade, 0, 1);
    g.strokeStyle = GOLD;
    g.lineWidth = 2.5;
    g.setLineDash([3, 8]);
    g.lineDashOffset = -t * 24;
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();
    g.setLineDash([6, 5]);
    const pulse = 1 + 0.12 * Math.sin(t * 6);
    const spots: Point[] = [to];
    const partner = partnerOf(this.state.level, h.node);
    if (partner >= 0) {
      const a = this.state.pos[h.node]!;
      const c = this.state.pos[partner]!;
      spots.push(this.px(b, { x: h.to.x + (c.x - a.x), y: h.to.y + (c.y - a.y) }));
    }
    for (const s of spots) {
      g.fillStyle = "rgba(255,209,102,0.16)";
      g.beginPath();
      g.arc(s.x, s.y, R * 1.3 * pulse, 0, 7);
      g.fill();
      g.beginPath();
      g.arc(s.x, s.y, R * 1.3 * pulse, 0, 7);
      g.stroke();
    }
    g.restore();
  }

  private drawWave(g: CanvasRenderingContext2D, b: Board, pts: Point[]): void {
    const front = this.px(b, { x: this.waveFront(), y: 0 }).x;
    const edges = this.state.level.edges;
    g.save();
    g.lineCap = "round";
    for (const [a, c] of edges) {
      const pa = pts[a]!;
      const pc = pts[c]!;
      const lo = Math.min(pa.x, pc.x);
      const hi = Math.max(pa.x, pc.x);
      if (front <= lo) continue;
      const k = hi - lo < 0.5 ? 1 : clamp((front - lo) / (hi - lo), 0, 1);
      // lit part runs from the left end toward the front
      const left = pa.x <= pc.x ? pa : pc;
      const right = pa.x <= pc.x ? pc : pa;
      const ex = left.x + (right.x - left.x) * k;
      const ey = left.y + (right.y - left.y) * k;
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(left.x, left.y);
      g.lineTo(ex, ey);
      g.stroke();
      g.strokeStyle = "#FFFFFF";
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(left.x, left.y);
      g.lineTo(ex, ey);
      g.stroke();
      if (k < 1) {
        g.fillStyle = "#FFFFFF";
        g.beginPath();
        g.arc(ex, ey, 5, 0, 7);
        g.fill();
      }
    }
    g.restore();
  }
}

const factory = createLevelGame({
  slug: SLUG,
  title: "Untangle",
  levelCount: LEVEL_COUNT,
  theme: THEME,
  worlds: WORLDS,
  create: (env) => new UntangleController(env),
});

export default factory;
