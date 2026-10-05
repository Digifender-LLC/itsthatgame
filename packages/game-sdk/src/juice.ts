// Game feel helpers (D13): easing, tweens, particles, screen shake and floating text.
// Everything is driven by the game's own loop (update(dt) + draw(g)); nothing here starts
// timers or animation frames, so destroy() stays trivial. With reduced motion, particles
// are thinned out and shake is disabled (NFR-4).

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  smooth: (t: number) => t * t * (3 - 2 * t),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  /** 0 → 1 → 0, for pulses. */
  pulse: (t: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, t))),
} satisfies Record<string, Ease>;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent exponential approach: move `current` toward `target`. */
export function approach(current: number, target: number, rate: number, dtMs: number): number {
  return target + (current - target) * Math.exp(-rate * (dtMs / 1000));
}

// ---- Tweens --------------------------------------------------------------------

interface TweenItem {
  t: number;
  ms: number;
  delay: number;
  ease: Ease;
  step(v: number): void;
  done?: () => void;
}

/** Minimal tween runner: `tweens.add(300, v => obj.scale = v, { ease: ease.outBack })`. */
export class Tweens {
  private items: TweenItem[] = [];

  add(
    ms: number,
    step: (v: number) => void,
    opts: { ease?: Ease; delay?: number; done?: () => void } = {},
  ): void {
    this.items.push({
      t: 0,
      ms: Math.max(1, ms),
      delay: opts.delay ?? 0,
      ease: opts.ease ?? ease.outCubic,
      step,
      done: opts.done,
    });
    if ((opts.delay ?? 0) <= 0) step(0);
  }

  get active(): boolean {
    return this.items.length > 0;
  }

  update(dtMs: number): void {
    if (this.items.length === 0) return;
    const finished: TweenItem[] = [];
    for (const it of this.items) {
      if (it.delay > 0) {
        it.delay -= dtMs;
        if (it.delay > 0) continue;
        dtMs = -it.delay;
        it.delay = 0;
      }
      it.t = Math.min(it.ms, it.t + dtMs);
      it.step(it.ease(it.t / it.ms));
      if (it.t >= it.ms) finished.push(it);
    }
    if (finished.length) {
      this.items = this.items.filter((i) => !finished.includes(i));
      for (const f of finished) f.done?.();
    }
  }

  /** Jump every tween to its end. */
  finish(): void {
    const all = this.items;
    this.items = [];
    for (const it of all) {
      it.step(1);
      it.done?.();
    }
  }

  clear(): void {
    this.items = [];
  }
}

// ---- Particles -----------------------------------------------------------------

export type ParticleShape = "circle" | "square" | "spark" | "ring" | "star";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: ParticleShape;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  count?: number;
  colors?: readonly string[];
  /** Initial speed in px/s (randomized ±40%). */
  speed?: number;
  /** Lifetime in ms (randomized ±30%). */
  life?: number;
  size?: number;
  /** px/s² downward. */
  gravity?: number;
  shape?: ParticleShape;
  /** Emission direction in radians and spread; default is a full circle. */
  angle?: number;
  spread?: number;
  /** Velocity damping per second (0 = none). */
  drag?: number;
}

const MAX_PARTICLES = 600;

/** Pooled particle system. Deterministic enough for tests (uses the injected rng). */
export class Particles {
  private list: Particle[] = [];

  constructor(
    private readonly reducedMotion = false,
    private readonly rng: () => number = Math.random,
  ) {}

  get count(): number {
    return this.list.length;
  }

  burst(x: number, y: number, o: BurstOptions = {}): void {
    let count = o.count ?? 14;
    if (this.reducedMotion) count = Math.ceil(count / 4);
    const colors = o.colors ?? ["#FFFFFF"];
    const r = this.rng;
    for (let i = 0; i < count && this.list.length < MAX_PARTICLES; i++) {
      const spread = o.spread ?? Math.PI * 2;
      const a = (o.angle ?? 0) + (r() - 0.5) * spread;
      const sp = (o.speed ?? 220) * (0.6 + r() * 0.8);
      const max = (o.life ?? 650) * (0.7 + r() * 0.6);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: max,
        max,
        size: (o.size ?? 5) * (0.6 + r() * 0.8),
        color: colors[Math.floor(r() * colors.length) % colors.length]!,
        shape: o.shape ?? "circle",
        rot: r() * Math.PI * 2,
        vr: (r() - 0.5) * 12,
        gravity: o.gravity ?? 520,
        drag: o.drag ?? 1.2,
      });
    }
  }

  /** Celebration rain across a rectangle. */
  confetti(x: number, y: number, w: number, colors: readonly string[], count = 70): void {
    for (let i = 0; i < count; i++) {
      this.burst(x + this.rng() * w, y, {
        count: 1,
        colors,
        speed: 260,
        angle: -Math.PI / 2,
        spread: 1.6,
        life: 1600,
        size: 7,
        gravity: 420,
        shape: this.rng() < 0.5 ? "square" : "circle",
        drag: 0.9,
      });
    }
  }

  update(dtMs: number): void {
    if (this.list.length === 0) return;
    const dt = dtMs / 1000;
    for (const p of this.list) {
      p.life -= dtMs;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(g: CanvasRenderingContext2D): void {
    if (this.list.length === 0) return;
    g.save();
    for (const p of this.list) {
      const t = p.life / p.max;
      g.globalAlpha = Math.min(1, t * 1.6);
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      const s = p.size * (p.shape === "ring" ? 2 - t : 0.4 + 0.6 * t);
      switch (p.shape) {
        case "circle":
          g.beginPath();
          g.arc(p.x, p.y, s, 0, Math.PI * 2);
          g.fill();
          break;
        case "ring":
          g.lineWidth = 2;
          g.beginPath();
          g.arc(p.x, p.y, s * 2, 0, Math.PI * 2);
          g.stroke();
          break;
        case "square":
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
          g.restore();
          break;
        case "spark": {
          const len = Math.hypot(p.vx, p.vy) * 0.03 + s;
          const a = Math.atan2(p.vy, p.vx);
          g.lineWidth = Math.max(1, s * 0.5);
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
          g.stroke();
          break;
        }
        case "star":
          starPath(g, p.x, p.y, s * 1.4, s * 0.6, p.rot);
          g.fill();
          break;
      }
    }
    g.restore();
  }

  clear(): void {
    this.list = [];
  }
}

/** Five-pointed star path centred on (cx, cy). */
export function starPath(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  rot = 0,
): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

// ---- Screen shake ----------------------------------------------------------------

export class Shake {
  private trauma = 0;
  private time = 0;

  constructor(private readonly disabled = false) {}

  /** Add trauma in 0..1; shake strength grows with its square. */
  kick(amount: number): void {
    if (this.disabled) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(dtMs: number): void {
    this.time += dtMs;
    this.trauma = Math.max(0, this.trauma - dtMs / 600);
  }

  /** Offset in px to translate the play area by this frame. */
  offset(maxPx = 10): { x: number; y: number } {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma * maxPx;
    const t = this.time / 1000;
    return {
      x: s * Math.sin(t * 53.1) * Math.cos(t * 21.7),
      y: s * Math.sin(t * 47.3 + 1.3) * Math.cos(t * 17.9),
    };
  }
}

// ---- Floating text ---------------------------------------------------------------

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  ms: number;
}

/** "+40", "Perfect!", "Combo x3" labels that pop, rise and fade. */
export class FloatingText {
  private list: Floater[] = [];

  constructor(private readonly font: string) {}

  spawn(x: number, y: number, text: string, color = "#FFFFFF", size = 22, ms = 900): void {
    this.list.push({ x, y, text, color, size, t: 0, ms });
  }

  update(dtMs: number): void {
    if (this.list.length === 0) return;
    for (const f of this.list) f.t += dtMs;
    this.list = this.list.filter((f) => f.t < f.ms);
  }

  draw(g: CanvasRenderingContext2D): void {
    if (this.list.length === 0) return;
    g.save();
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const f of this.list) {
      const k = f.t / f.ms;
      const pop = k < 0.2 ? ease.outBack(k / 0.2) : 1;
      g.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      g.font = `800 ${Math.round(f.size * (0.6 + 0.4 * pop))}px ${this.font}`;
      const y = f.y - ease.outCubic(k) * 46;
      g.lineWidth = Math.max(3, f.size / 5);
      g.lineJoin = "round";
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.strokeText(f.text, f.x, y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, y);
    }
    g.restore();
  }

  clear(): void {
    this.list = [];
  }
}

// ---- Bundle ------------------------------------------------------------------------

/** One object a game owns: call update(dt) every frame, draw(g) after its scene. */
export class Juice {
  readonly tweens = new Tweens();
  readonly particles: Particles;
  readonly shake: Shake;
  readonly text: FloatingText;

  constructor(opts: { reducedMotion: boolean; font: string; rng?: () => number }) {
    this.particles = new Particles(opts.reducedMotion, opts.rng);
    this.shake = new Shake(opts.reducedMotion);
    this.text = new FloatingText(opts.font);
  }

  get busy(): boolean {
    return this.tweens.active;
  }

  update(dtMs: number): void {
    this.tweens.update(dtMs);
    this.particles.update(dtMs);
    this.shake.update(dtMs);
    this.text.update(dtMs);
  }

  draw(g: CanvasRenderingContext2D): void {
    this.particles.draw(g);
    this.text.draw(g);
  }

  clear(): void {
    this.tweens.clear();
    this.particles.clear();
    this.text.clear();
  }
}
