// Pin Drop: pull the pins in the right order so every colored ball lands in the cup.
import { PALETTE, PIECE_COLORS, PIECE_GLYPHS, type PointerPoint } from "@itg/game-sdk";
import { getLevel, LEVEL_COUNT } from "./levels";
import { PinDropGame, type Frame, type FrameBall, type LossReason, type Removal } from "./logic";
import { createShell, FONT, roundRectPath, type Area, type Controller, type Env } from "./shell";

export const SLUG = "pin-drop";

const TICK_MS = 90;
const TAIL_MS = 160;
const LEGEND_H = 26;

const COLORS = {
  board: "#F6F2E8",
  wall: "#4A5A67",
  wallEdge: "#33414C",
  slide: "#D7E3EA",
  slideArrow: "#5B7A8C",
  pin: "#F0E442",
  pinEdge: "#6B5E00",
  cup: "#009E73",
  rock: "#7B7B86",
  rockEdge: "#2E2E36",
  ink: "#1B1B1F",
};

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function inkFor(hex: string): string {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#101418" : "#FFFFFF";
}

interface Anim {
  frames: Frame[];
  t: number;
  frameIndex: number;
  ghost: { x: number; y: number };
}

export interface Geometry {
  cell: number;
  x0: number;
  y0: number;
}

const REASONS: Record<LossReason, string> = {
  crush: "A rock touched a colored ball.",
  rock: "A rock fell into the cup.",
  stuck: "No pins left and balls are stranded.",
};

export function computeGeometry(area: Area, w: number, h: number): Geometry {
  const availH = area.h - LEGEND_H;
  const cell = Math.max(10, Math.floor(Math.min((area.w - 8) / w, (availH - 8) / h)));
  return {
    cell,
    x0: area.x + (area.w - cell * w) / 2,
    y0: area.y + LEGEND_H + (availH - cell * h) / 2,
  };
}

class PinDropController implements Controller {
  private game: PinDropGame;
  private anim: Anim | null = null;

  constructor(private readonly env: Env) {
    this.game = new PinDropGame(getLevel(0));
  }

  loadLevel(index: number): void {
    this.game = new PinDropGame(getLevel(index));
    this.anim = null;
  }
  restart(): void {
    this.game.restart();
    this.anim = null;
  }
  undo(): void {
    this.game.undo();
    this.anim = null;
  }
  canUndo(): boolean {
    return this.game.canUndo();
  }
  status() {
    return this.game.status();
  }
  busy(): boolean {
    return this.anim !== null;
  }
  lostMessage(): string {
    const r = this.game.reason();
    return r ? REASONS[r] : "Try again.";
  }

  update(dtMs: number): void {
    const a = this.anim;
    if (!a) return;
    a.t += dtMs;
    const idx = Math.min(a.frames.length - 1, Math.floor(a.t / TICK_MS));
    while (a.frameIndex < idx) {
      a.frameIndex++;
      for (const r of a.frames[a.frameIndex]!.removed) {
        if (r.why === "cup") this.env.audio.play("success");
      }
    }
    if (a.t >= (a.frames.length - 1) * TICK_MS + TAIL_MS) this.anim = null;
  }

  private geometry(area: Area): Geometry {
    const s = this.game.state;
    return computeGeometry(area, s.w, s.h);
  }

  tap(p: PointerPoint, area: Area): void {
    if (this.anim || this.game.status() !== "playing") return;
    const geo = this.geometry(area);
    const s = this.game.state;
    const reach = Math.max(geo.cell * 1.1, 30);
    let best = -1;
    let bestD = Infinity;
    s.pins.forEach((pin, i) => {
      if (pin.pulled) return;
      const cx = geo.x0 + (pin.x + 0.5) * geo.cell;
      const cy = geo.y0 + (pin.y + 0.5) * geo.cell;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0 || bestD > reach) return;
    const pin = s.pins[best]!;
    const before = s.collected;
    const frames = this.game.pull(best);
    if (!frames) return;
    this.env.audio.play("pop");
    this.env.haptics.impact("light");
    if (this.env.reducedMotion) {
      if (this.game.state.collected > before) this.env.audio.play("success");
      return;
    }
    this.anim = { frames, t: 0, frameIndex: 0, ghost: { x: pin.x, y: pin.y } };
  }

  // ---- drawing ------------------------------------------------------------

  private drawBall(
    g: CanvasRenderingContext2D,
    geo: Geometry,
    b: { kind: "good" | "rock"; color: number },
    cx: number,
    cy: number,
    scale = 1,
    alpha = 1,
  ) {
    const r = geo.cell * 0.4 * scale;
    if (r <= 0.5) return;
    g.save();
    g.globalAlpha = alpha;
    if (b.kind === "good") {
      const fill = PIECE_COLORS[b.color % PIECE_COLORS.length]!;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = COLORS.ink;
      g.stroke();
      g.fillStyle = inkFor(fill);
      g.font = `700 ${Math.round(r * 1.1)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(PIECE_GLYPHS[b.color % PIECE_GLYPHS.length]!, cx, cy + 1);
    } else {
      // Rock: irregular dark-grey polygon with cracks (never a ball shape).
      const pts = 7;
      g.beginPath();
      for (let i = 0; i < pts; i++) {
        const ang = (i / pts) * Math.PI * 2 + 0.3;
        const rad = r * (i % 2 === 0 ? 1.05 : 0.82);
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = COLORS.rock;
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = COLORS.rockEdge;
      g.stroke();
      g.beginPath();
      g.moveTo(cx - r * 0.45, cy - r * 0.45);
      g.lineTo(cx + r * 0.45, cy + r * 0.45);
      g.moveTo(cx + r * 0.45, cy - r * 0.45);
      g.lineTo(cx - r * 0.45, cy + r * 0.45);
      g.lineWidth = 2.5;
      g.strokeStyle = "#F4EFE4";
      g.stroke();
    }
    g.restore();
  }

  private drawBoard(g: CanvasRenderingContext2D, geo: Geometry) {
    const s = this.game.state;
    const c = geo.cell;
    roundRectPath(g, geo.x0 - 4, geo.y0 - 4, c * s.w + 8, c * s.h + 8, 10);
    g.fillStyle = COLORS.board;
    g.fill();
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const cell = s.cells[y]![x]!;
        const px = geo.x0 + x * c;
        const py = geo.y0 + y * c;
        if (cell === "#") {
          g.fillStyle = COLORS.wall;
          g.fillRect(px, py, c + 0.5, c + 0.5);
          g.strokeStyle = COLORS.wallEdge;
          g.lineWidth = 1;
          g.strokeRect(px + 0.5, py + 0.5, c - 1, c - 1);
        } else if (cell === ">" || cell === "<") {
          g.fillStyle = COLORS.slide;
          g.fillRect(px, py, c, c);
          const dir = cell === ">" ? 1 : -1;
          const mx = px + c / 2;
          const my = py + c / 2;
          g.beginPath();
          g.moveTo(mx - dir * c * 0.22, my - c * 0.22);
          g.lineTo(mx + dir * c * 0.18, my);
          g.lineTo(mx - dir * c * 0.22, my + c * 0.22);
          g.lineWidth = Math.max(2, c * 0.08);
          g.strokeStyle = COLORS.slideArrow;
          g.lineCap = "round";
          g.lineJoin = "round";
          g.stroke();
        } else if (cell === "U") {
          g.fillStyle = "#CFEFE5";
          g.fillRect(px, py, c, c);
          g.beginPath();
          g.moveTo(px + c * 0.12, py + c * 0.1);
          g.lineTo(px + c * 0.22, py + c * 0.88);
          g.lineTo(px + c * 0.78, py + c * 0.88);
          g.lineTo(px + c * 0.88, py + c * 0.1);
          g.lineWidth = Math.max(3, c * 0.1);
          g.strokeStyle = COLORS.cup;
          g.lineCap = "round";
          g.lineJoin = "round";
          g.stroke();
        }
      }
    }
  }

  private drawPin(g: CanvasRenderingContext2D, geo: Geometry, x: number, y: number, a = 1) {
    const c = geo.cell;
    const px = geo.x0 + x * c;
    const py = geo.y0 + y * c;
    g.save();
    g.globalAlpha = a;
    roundRectPath(g, px, py + c * 0.36, c, c * 0.28, c * 0.14);
    g.fillStyle = COLORS.pin;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = COLORS.pinEdge;
    g.stroke();
    // pull ring
    g.beginPath();
    g.arc(px + c * 0.5, py + c * 0.5, c * 0.22, 0, Math.PI * 2);
    g.fillStyle = COLORS.pin;
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(px + c * 0.5, py + c * 0.5, c * 0.09, 0, Math.PI * 2);
    g.fillStyle = COLORS.board;
    g.fill();
    g.stroke();
    g.restore();
  }

  draw(g: CanvasRenderingContext2D, area: Area): void {
    const s = this.game.state;
    const geo = this.geometry(area);
    const c = geo.cell;
    this.drawBoard(g, geo);
    const a = this.anim;
    for (const pin of s.pins) {
      if (!pin.pulled) this.drawPin(g, geo, pin.x, pin.y);
    }
    let collected = s.collected;
    if (a) {
      const idx = Math.min(a.frames.length - 1, Math.floor(a.t / TICK_MS));
      const alpha = Math.min(1, (a.t - idx * TICK_MS) / TICK_MS);
      const cur = a.frames[idx]!;
      const nxt = a.frames[Math.min(a.frames.length - 1, idx + 1)]!;
      collected = cur.collected;
      if (idx === 0 && a.t < 140) this.drawPin(g, geo, a.ghost.x, a.ghost.y, 1 - a.t / 140);
      const prev = new Map<number, FrameBall>(cur.balls.map((b) => [b.id, b]));
      const pos = (x: number, y: number) => ({
        px: geo.x0 + (x + 0.5) * c,
        py: geo.y0 + (y + 0.5) * c,
      });
      if (nxt !== cur) {
        for (const b of nxt.balls) {
          const from = prev.get(b.id) ?? b;
          const p0 = pos(from.x, from.y);
          const p1 = pos(b.x, b.y);
          this.drawBall(
            g,
            geo,
            b,
            p0.px + (p1.px - p0.px) * alpha,
            p0.py + (p1.py - p0.py) * alpha,
          );
        }
        for (const r of nxt.removed) {
          const from = prev.get(r.id);
          const p0 = from ? pos(from.x, from.y) : pos(r.x, r.y);
          const p1 = pos(r.x, r.y);
          const x = p0.px + (p1.px - p0.px) * alpha;
          const y = p0.py + (p1.py - p0.py) * alpha;
          if (r.why === "cup") this.drawBall(g, geo, r, x, y, 1 - alpha * 0.6, 1 - alpha);
          else this.drawBall(g, geo, r, x, y, 1 + alpha * 0.5, 1 - alpha);
        }
        if (nxt.collected > cur.collected && alpha > 0.7) collected = nxt.collected;
      } else {
        for (const b of cur.balls) {
          const p = pos(b.x, b.y);
          this.drawBall(g, geo, b, p.px, p.py);
        }
      }
      this.drawCrushMarks(g, geo, nxt, alpha);
    } else {
      for (const b of s.balls) {
        this.drawBall(g, geo, b, geo.x0 + (b.x + 0.5) * c, geo.y0 + (b.y + 0.5) * c);
      }
    }
    // legend / counter
    g.fillStyle = COLORS.ink;
    g.font = `600 13px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    const ly = area.y + LEGEND_H / 2 + 2;
    g.fillText(`In cup ${collected}/${s.totalGood}`, area.x + 12, ly);
    g.textAlign = "right";
    g.fillStyle = "#5C6670";
    g.font = `500 12px ${FONT}`;
    g.fillText("Tap a pin. Rocks crush balls.", area.x + area.w - 12, ly);
  }

  private drawCrushMarks(g: CanvasRenderingContext2D, geo: Geometry, f: Frame, a: number) {
    for (const r of f.removed as Removal[]) {
      if (r.why !== "crush") continue;
      const cx = geo.x0 + (r.x + 0.5) * geo.cell;
      const cy = geo.y0 + (r.y + 0.5) * geo.cell;
      g.save();
      g.globalAlpha = 1 - a;
      g.strokeStyle = PALETTE.vermillion;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, geo.cell * (0.4 + a * 0.5), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }
}

export default createShell({
  slug: SLUG,
  title: "Pin Drop",
  levelCount: LEVEL_COUNT,
  theme: {
    bg: "#DCE6EC",
    panel: "#FAF7F0",
    text: "#1B1B1F",
    muted: "#5C6670",
    accent: "#0072B2",
    accentText: "#FFFFFF",
    buttonFill: "#EEF3F6",
  },
  create: (env) => new PinDropController(env),
});
