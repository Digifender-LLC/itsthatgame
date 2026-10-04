// Tile Trio: tap free tiles into the tray; three equal symbols clear; empty the board.
import { PIECE_COLORS, type PointerPoint } from "@itg/game-sdk";
import { getLevel, LEVEL_COUNT, type BuiltLevel } from "./levels";
import { TILE_UNITS, TRAY_SIZE, TileGame } from "./logic";
import { createShell, FONT, roundRectPath, type Area, type Controller, type Env } from "./shell";

export const SLUG = "tile-trio";

const FLY_MS = 150;
const TRAY_PAD = 14;

const COLORS = {
  face: "#FFFDF6",
  edge: "#3A3340",
  side: "#B7AA93",
  shadow: "rgba(58,51,64,0.25)",
  covered: "rgba(58,40,70,0.42)",
  tray: "#3A3340",
  slot: "#5A506A",
  ink: "#1B1B1F",
};

export function drawSymbol(
  g: CanvasRenderingContext2D,
  kind: number,
  cx: number,
  cy: number,
  r: number,
): void {
  const fill = PIECE_COLORS[kind % PIECE_COLORS.length]!;
  g.beginPath();
  switch (kind % 9) {
    case 0:
      g.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 1:
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 1.0, cy + r * 0.8);
      g.lineTo(cx - r * 1.0, cy + r * 0.8);
      g.closePath();
      break;
    case 2:
      g.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 3:
      g.moveTo(cx, cy - r * 1.1);
      g.lineTo(cx + r * 0.9, cy);
      g.lineTo(cx, cy + r * 1.1);
      g.lineTo(cx - r * 0.9, cy);
      g.closePath();
      break;
    case 4:
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r * 1.1 : r * 0.48;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    case 5: {
      const a = r * 0.34;
      const b = r * 1.0;
      g.moveTo(cx - a, cy - b);
      g.lineTo(cx + a, cy - b);
      g.lineTo(cx + a, cy - a);
      g.lineTo(cx + b, cy - a);
      g.lineTo(cx + b, cy + a);
      g.lineTo(cx + a, cy + a);
      g.lineTo(cx + a, cy + b);
      g.lineTo(cx - a, cy + b);
      g.lineTo(cx - a, cy + a);
      g.lineTo(cx - b, cy + a);
      g.lineTo(cx - b, cy - a);
      g.lineTo(cx - a, cy - a);
      g.closePath();
      break;
    }
    case 6:
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    case 7:
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.moveTo(cx + r * 0.45, cy);
      g.arc(cx, cy, r * 0.45, 0, Math.PI * 2, true);
      break;
    default: {
      const pts: Array<[number, number]> = [
        [0.15, -1],
        [-0.65, 0.12],
        [-0.08, 0.12],
        [-0.25, 1],
        [0.7, -0.2],
        [0.08, -0.2],
      ];
      pts.forEach(([px, py], i) => {
        if (i === 0) g.moveTo(cx + px * r, cy + py * r);
        else g.lineTo(cx + px * r, cy + py * r);
      });
      g.closePath();
    }
  }
  g.fillStyle = fill;
  g.fill("evenodd");
  g.lineWidth = Math.max(1.5, r * 0.16);
  g.lineJoin = "round";
  g.strokeStyle = COLORS.ink;
  g.stroke();
}

interface Geo {
  u: number;
  bx: number;
  by: number;
  slot: number;
  trayX: number;
  trayY: number;
}

interface Fly {
  id: number;
  from: { x: number; y: number };
  preTray: number[];
  slot: number;
  cleared: boolean;
  t: number;
}

export function computeGeo(area: Area, level: BuiltLevel): Geo {
  const slot = Math.max(30, Math.min(52, Math.floor((area.w - 16) / TRAY_SIZE)));
  const trayH = slot + TRAY_PAD * 2;
  const boardH = area.h - trayH - 28;
  const u = Math.max(
    8,
    Math.min(36, Math.floor(Math.min((area.w - 16) / level.width, (boardH - 8) / level.height))),
  );
  return {
    u,
    slot,
    bx: area.x + (area.w - level.width * u) / 2,
    by: area.y + 24 + (boardH - level.height * u) / 2,
    trayX: area.x + (area.w - slot * TRAY_SIZE) / 2,
    trayY: area.y + area.h - slot - TRAY_PAD - 6,
  };
}

class TileController implements Controller {
  private level: BuiltLevel;
  private game: TileGame;
  private fly: Fly | null = null;

  constructor(private readonly env: Env) {
    this.level = getLevel(0);
    this.game = new TileGame(this.level);
  }

  loadLevel(index: number): void {
    this.level = getLevel(index);
    this.game = new TileGame(this.level);
    this.fly = null;
  }
  restart(): void {
    this.game.restart();
    this.fly = null;
  }
  undo(): void {
    this.game.undo();
    this.fly = null;
  }
  canUndo(): boolean {
    return this.game.canUndo();
  }
  status() {
    return this.game.status();
  }
  busy(): boolean {
    return this.fly !== null;
  }
  lostMessage(): string {
    return "The tray is full. Undo or restart.";
  }

  update(dtMs: number): void {
    const f = this.fly;
    if (!f) return;
    f.t += dtMs;
    if (f.t >= FLY_MS) {
      if (f.cleared) this.env.audio.play("success");
      this.fly = null;
    }
  }

  private tileRect(geo: Geo, id: number) {
    const t = this.game.tiles[id]!;
    return {
      x: geo.bx + t.x * geo.u,
      y: geo.by + t.y * geo.u,
      w: TILE_UNITS * geo.u,
      h: TILE_UNITS * geo.u,
    };
  }

  tap(p: PointerPoint, area: Area): void {
    if (this.fly || this.game.status() !== "playing") return;
    const geo = computeGeo(area, this.level);
    let hitId = -1;
    let hitZ = -1;
    for (const t of this.game.tiles) {
      if (this.game.removed[t.id]) continue;
      const r = this.tileRect(geo, t.id);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        if (t.z > hitZ || (t.z === hitZ && t.id > hitId)) {
          hitZ = t.z;
          hitId = t.id;
        }
      }
    }
    if (hitId < 0) return;
    const rect = this.tileRect(geo, hitId);
    const res = this.game.take(hitId);
    if (!res) {
      this.env.audio.play("fail");
      return;
    }
    this.env.audio.play("move");
    this.env.haptics.impact("light");
    if (this.env.reducedMotion) {
      if (res.cleared.length) this.env.audio.play("success");
      return;
    }
    this.fly = {
      id: hitId,
      from: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
      preTray: res.trayBeforeClear,
      slot: res.trayBeforeClear.indexOf(hitId),
      cleared: res.cleared.length > 0,
      t: 0,
    };
  }

  private drawTile(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    type: number,
    covered: boolean,
  ) {
    const d = Math.max(2, size * 0.07);
    const r = size * 0.16;
    roundRectPath(g, x + 1, y + 1 + d, size - 2, size - 2, r);
    g.fillStyle = COLORS.side;
    g.fill();
    roundRectPath(g, x + 1, y + 1, size - 2, size - 2 - d * 0.5, r);
    g.fillStyle = COLORS.face;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = COLORS.edge;
    g.stroke();
    drawSymbol(g, type, x + size / 2, y + size / 2 - d * 0.25, size * 0.28);
    if (covered) {
      roundRectPath(g, x + 1, y + 1, size - 2, size - 2 - d * 0.5, r);
      g.fillStyle = COLORS.covered;
      g.fill();
    }
  }

  draw(g: CanvasRenderingContext2D, area: Area): void {
    const geo = computeGeo(area, this.level);
    const game = this.game;
    const order = game.tiles
      .filter((t) => !game.removed[t.id])
      .sort((a, b) => a.z - b.z || a.id - b.id);
    for (const t of order) {
      const r = this.tileRect(geo, t.id);
      this.drawTile(g, r.x, r.y, r.w, t.type, !game.isFree(t.id));
    }
    // tray
    const f = this.fly;
    const shown = f ? f.preTray : game.tray;
    roundRectPath(g, geo.trayX - 6, geo.trayY - 6, geo.slot * TRAY_SIZE + 12, geo.slot + 12, 14);
    g.fillStyle = COLORS.tray;
    g.fill();
    for (let i = 0; i < TRAY_SIZE; i++) {
      roundRectPath(g, geo.trayX + i * geo.slot + 2, geo.trayY + 2, geo.slot - 4, geo.slot - 4, 8);
      g.fillStyle = COLORS.slot;
      g.fill();
    }
    shown.forEach((id, i) => {
      if (f && id === f.id) return;
      this.drawTile(
        g,
        geo.trayX + i * geo.slot + 3,
        geo.trayY + 3,
        geo.slot - 6,
        game.tiles[id]!.type,
        false,
      );
    });
    if (f) {
      const e = Math.min(1, f.t / FLY_MS);
      const k = e * e * (3 - 2 * e);
      const size = TILE_UNITS * geo.u + (geo.slot - 6 - TILE_UNITS * geo.u) * k;
      const tx = geo.trayX + f.slot * geo.slot + 3 + (geo.slot - 6) / 2;
      const ty = geo.trayY + 3 + (geo.slot - 6) / 2;
      const cx = f.from.x + (tx - f.from.x) * k;
      const cy = f.from.y + (ty - f.from.y) * k;
      this.drawTile(g, cx - size / 2, cy - size / 2, size, game.tiles[f.id]!.type, false);
    }
    g.fillStyle = COLORS.ink;
    g.font = `600 13px ${FONT}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText(`Tiles left ${game.remaining}`, area.x + 12, area.y + 12);
    g.textAlign = "right";
    g.fillText(`Tray ${shown.length}/${TRAY_SIZE}`, area.x + area.w - 12, area.y + 12);
  }
}

export default createShell({
  slug: SLUG,
  title: "Tile Trio",
  levelCount: LEVEL_COUNT,
  theme: {
    bg: "#EFE3CC",
    panel: "#FFF8EA",
    text: "#1B1B1F",
    muted: "#6C6256",
    accent: "#CC79A7",
    accentText: "#1B1B1F",
    buttonFill: "#F7EBD3",
  },
  create: (env) => new TileController(env),
});
