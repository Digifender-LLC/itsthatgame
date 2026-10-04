// Ring Sort: sort colored rings so every peg holds a single color.
import { PALETTE, PIECE_COLORS, PIECE_GLYPHS, type PointerPoint } from "@itg/game-sdk";
import { getLevel, LEVEL_COUNT } from "./levels";
import { RingGame, type Move } from "./logic";
import { createShell, FONT, roundRectPath, type Area, type Controller, type Env } from "./shell";

export const SLUG = "ring-sort";

const ANIM_MS = 220;

interface Layout {
  cols: number;
  rows: number;
  cellW: number;
  rowH: number;
  ringW: number;
  ringH: number;
  top: number;
  left: number;
}

interface Anim {
  move: Move;
  color: number;
  t: number;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Black or white, whichever contrasts more with the given fill. */
function inkFor(hex: string): string {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#101418" : "#FFFFFF";
}

class RingController implements Controller {
  private game: RingGame;
  private selected: number | null = null;
  private anim: Anim | null = null;

  constructor(private readonly env: Env) {
    this.game = new RingGame(getLevel(0));
  }

  loadLevel(index: number): void {
    this.game = new RingGame(getLevel(index));
    this.selected = null;
    this.anim = null;
  }
  restart(): void {
    this.game.restart();
    this.selected = null;
    this.anim = null;
  }
  undo(): void {
    this.game.undo();
    this.selected = null;
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
    return "No legal moves left. Undo or restart.";
  }
  update(dtMs: number): void {
    if (this.anim) {
      this.anim.t += dtMs;
      if (this.anim.t >= ANIM_MS) this.anim = null;
    }
  }

  private layout(area: Area): Layout {
    const n = this.game.state.pegs.length;
    const cap = this.game.state.cap;
    const cols = n <= 5 ? n : Math.ceil(n / 2);
    const rows = n <= 5 ? 1 : 2;
    const cellW = area.w / cols;
    const rowH = Math.min(area.h / rows, 330);
    const ringW = Math.max(40, Math.min(cellW - 10, 92));
    const ringH = Math.max(
      18,
      Math.min(36, Math.floor((rowH - 56) / (cap + 0.6)), Math.floor(ringW * 0.5)),
    );
    const top = area.y + (area.h - rowH * rows) / 2;
    return { cols, rows, cellW, rowH, ringW, ringH, top, left: area.x };
  }

  private pegCenter(l: Layout, i: number): { cx: number; baseY: number } {
    const col = i % l.cols;
    const row = Math.floor(i / l.cols);
    return {
      cx: l.left + l.cellW * (col + 0.5),
      baseY: l.top + l.rowH * (row + 1) - 18,
    };
  }

  tap(p: PointerPoint, area: Area): void {
    if (this.anim) return;
    if (this.game.status() !== "playing") return;
    const l = this.layout(area);
    const col = Math.floor((p.x - l.left) / l.cellW);
    const row = Math.floor((p.y - l.top) / l.rowH);
    if (col < 0 || col >= l.cols || row < 0 || row >= l.rows) return;
    const i = row * l.cols + col;
    if (i >= this.game.state.pegs.length) return;
    const peg = this.game.state.pegs[i]!;
    if (this.selected === null) {
      if (peg.length > 0) {
        this.selected = i;
        this.env.audio.play("tap");
      }
      return;
    }
    if (this.selected === i) {
      this.selected = null;
      this.env.audio.play("tap");
      return;
    }
    const from = this.selected;
    const color = this.game.state.pegs[from]![this.game.state.pegs[from]!.length - 1]!;
    const m = this.game.move(from, i);
    if (m) {
      this.selected = null;
      this.env.audio.play("move");
      this.env.haptics.impact("light");
      if (!this.env.reducedMotion) this.anim = { move: m, color, t: 0 };
    } else if (peg.length > 0) {
      this.selected = i;
      this.env.audio.play("tap");
    } else {
      this.selected = null;
      this.env.audio.play("fail");
    }
  }

  private drawRing(
    g: CanvasRenderingContext2D,
    cx: number,
    yBottom: number,
    l: Layout,
    color: number,
    lifted: boolean,
  ): void {
    const fill = PIECE_COLORS[color % PIECE_COLORS.length]!;
    const w = l.ringW;
    const h = l.ringH - 3;
    const x = cx - w / 2;
    const y = yBottom - l.ringH + 1.5;
    roundRectPath(g, x, y, w, h, h / 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = lifted ? 4 : 2;
    g.strokeStyle = lifted ? "#FFFFFF" : "#0B0F12";
    g.stroke();
    // hole of the ring
    g.fillStyle = "rgba(0,0,0,0.18)";
    roundRectPath(g, x + w * 0.22, y + h * 0.3, w * 0.56, h * 0.4, h * 0.2);
    g.fill();
    g.fillStyle = inkFor(fill);
    g.font = `700 ${Math.round(h * 0.62)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const glyph = PIECE_GLYPHS[color % PIECE_GLYPHS.length]!;
    g.fillText(glyph, cx - w * 0.3, y + h / 2 + 1);
    g.fillText(glyph, cx + w * 0.3, y + h / 2 + 1);
  }

  draw(g: CanvasRenderingContext2D, area: Area): void {
    const s = this.game.state;
    const l = this.layout(area);
    const rodH = l.ringH * (s.cap + 0.6);
    for (let i = 0; i < s.pegs.length; i++) {
      const { cx, baseY } = this.pegCenter(l, i);
      const sel = this.selected === i;
      // base plate and rod
      roundRectPath(g, cx - l.ringW / 2 - 4, baseY, l.ringW + 8, 10, 5);
      g.fillStyle = sel ? PALETTE.paper : "#6E7C86";
      g.fill();
      roundRectPath(g, cx - 5, baseY - rodH, 10, rodH + 2, 5);
      g.fillStyle = sel ? PALETTE.paper : "#8FA0AB";
      g.fill();
      const peg = s.pegs[i]!;
      const run = (() => {
        if (!sel) return 0;
        const top = peg[peg.length - 1];
        let n = 0;
        for (let k = peg.length - 1; k >= 0 && peg[k] === top; k--) n++;
        return n;
      })();
      // hide rings that are still in flight to this peg
      let hidden = 0;
      if (this.anim && this.anim.move.to === i) hidden = this.anim.move.count;
      for (let k = 0; k < peg.length - hidden; k++) {
        const lifted = sel && k >= peg.length - run;
        const yb = baseY - k * l.ringH - (lifted ? 12 : 0);
        this.drawRing(g, cx, yb, l, peg[k]!, lifted);
      }
    }
    if (this.anim) {
      const a = this.anim;
      const e = Math.min(1, a.t / ANIM_MS);
      const ease = e * e * (3 - 2 * e);
      const from = this.pegCenter(l, a.move.from);
      const to = this.pegCenter(l, a.move.to);
      const toLen = s.pegs[a.move.to]!.length;
      const fromLen = s.pegs[a.move.from]!.length;
      for (let k = 0; k < a.move.count; k++) {
        const y0 = from.baseY - (fromLen + a.move.count - 1 - k) * l.ringH;
        const y1 = to.baseY - (toLen - a.move.count + k) * l.ringH;
        const arc = Math.sin(Math.PI * ease) * (l.ringH * (s.cap + 1.5));
        const cx = from.cx + (to.cx - from.cx) * ease;
        const yb = y0 + (y1 - y0) * ease - arc;
        this.drawRing(g, cx, yb, l, s.pegs[a.move.to]![toLen - a.move.count + k]!, false);
      }
    }
  }
}

export default createShell({
  slug: SLUG,
  title: "Ring Sort",
  levelCount: LEVEL_COUNT,
  theme: {
    bg: "#1F2A33",
    panel: "#2B3943",
    text: "#F4EFE4",
    muted: "#A9B6BF",
    accent: "#F0E442",
    accentText: "#1B1B1F",
    buttonFill: "#34444F",
  },
  create: (env) => new RingController(env),
});
