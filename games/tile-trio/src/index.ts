// Tile Trio: tap free tiles into the tray; three equal symbols clear; empty the board.
// Rules live in logic.ts, levels in levels.ts, symbol art in symbols.ts; this file is the
// controller for the shared level shell (HUD, level map, win/stuck cards come from the SDK).
import {
  FONT,
  createLevelGame,
  ease,
  roundRectPath,
  shade,
  type Area,
  type Env,
  type LevelController,
  type PointerPoint,
} from "@itg/game-sdk";
import { LEVEL_COUNT, WORLDS, getLevel, mulberry32, type BuiltLevel } from "./levels";
import { TILE_UNITS, TRAY_SIZE, TileGame, solveFrom } from "./logic";
import { INK, SYMBOL_COLORS, drawSymbol } from "./symbols";

export { drawSymbol };
export const SLUG = "tile-trio";

/** Tray size up to which a win earns 3 stars; 5 earns 2 stars; 6 earns 1. */
export const STAR3_PEAK = 4;
export const STAR2_PEAK = 5;
const COMBO_GAP = 4;
const HELPER_MAX = 3;
const FLY_MS = 280;

const COLORS = {
  face: "#FFF9EC",
  plate: "#F2E6CC",
  edge: "#6B5A45",
  side: "#BFA98A",
  shadow: "rgba(10,8,30,0.30)",
  covered: "rgba(26,22,60,0.52)",
  tray: "#161C3D",
  slot: "#2A3470",
  warn: "#FFC857",
  danger: "#FF5A5F",
  ice: "rgba(150,210,255,0.62)",
  iceBadge: "#1E4E8C",
  text: "#FFFFFF",
};

const WORLD_WASH = ["#FF9A62", "#58C8F0", "#6FD28A", "#C682F0", "#FFD35E"];

export interface Geo {
  u: number;
  bx: number;
  by: number;
  slot: number;
  trayX: number;
  trayY: number;
  helperY: number;
  helperH: number;
}

export function computeGeo(area: Area, level: BuiltLevel): Geo {
  const slot = Math.max(34, Math.min(54, Math.floor((area.w - 20) / TRAY_SIZE)));
  const helperH = 48;
  const helperY = area.y + area.h - 8 - helperH;
  const trayY = helperY - 12 - slot - 6;
  const boardTop = area.y + 30;
  const boardH = trayY - 6 - 26 - boardTop;
  const u = Math.max(
    8,
    Math.min(42, Math.floor(Math.min((area.w - 16) / level.width, boardH / level.height))),
  );
  return {
    u,
    slot,
    bx: area.x + (area.w - level.width * u) / 2,
    by: boardTop + (boardH - level.height * u) / 2,
    trayX: area.x + (area.w - slot * TRAY_SIZE) / 2,
    trayY,
    helperY,
    helperH,
  };
}

/** Centre of a tile on the board, in canvas pixels. */
export function tileCenter(geo: Geo, level: BuiltLevel, id: number): { x: number; y: number } {
  const t = level.tiles[id]!;
  return { x: geo.bx + (t.x + 1) * geo.u, y: geo.by + (t.y + 1) * geo.u };
}

type HelperId = "undo" | "back" | "shuffle";
const HELPERS: HelperId[] = ["undo", "back", "shuffle"];
const HELPER_LABEL: Record<HelperId, string> = { undo: "Undo", back: "Back 3", shuffle: "Shuffle" };

export function helperRects(area: Area, geo: Geo): Record<HelperId, Area> {
  const total = Math.min(area.w - 24, 400);
  const gap = 8;
  const w = (total - gap * 2) / 3;
  const x0 = area.x + (area.w - total) / 2;
  const rect = (i: number): Area => ({ x: x0 + i * (w + gap), y: geo.helperY, w, h: geo.helperH });
  return { undo: rect(0), back: rect(1), shuffle: rect(2) };
}

interface Sprite {
  id: number;
  type: number;
  x: number;
  y: number;
  size: number;
  phase: "fly" | "rest" | "pop";
  t: number;
  ms: number;
  fx: number;
  fy: number;
  fsize: number;
  squash: number;
  group: number;
  appear: number;
}

interface Ret {
  id: number;
  type: number;
  fx: number;
  fy: number;
  fsize: number;
  t: number;
  ms: number;
  delay: number;
}

interface Group {
  ids: number[];
  landed: number;
  type: number;
}

class TileController implements LevelController {
  private index = 0;
  private level: BuiltLevel;
  private game: TileGame;
  private sprites: Sprite[] = [];
  private rets: Ret[] = [];
  private groups: Group[] = [];
  private vtray: number[] = [];
  private nextGroup = 1;
  private clock = 0;
  private introT = 0;
  private charges: Record<HelperId, number> = { undo: 1, back: 1, shuffle: 1 };
  private helperPulse: Record<HelperId, number> = { undo: 0, back: 0, shuffle: 0 };
  private pressedHelper: HelperId | null = null;
  private combo = 0;
  private gap = 0;
  private comboFade = 0;
  private shuffleCount = 0;
  private shufT = -1;
  private shufOld: number[] = [];
  private tileShake: number[] = [];
  private tilePulse: number[] = [];
  private hintId = -1;
  private hintT = 0;
  private warnLevel = 0;
  private lastFrozen = new Set<number>();
  private celebrated = false;
  private lastArea: Area = { x: 0, y: 60, w: 390, h: 720 };

  constructor(private readonly env: Env) {
    this.level = getLevel(0);
    this.game = new TileGame(this.level);
  }

  // ---- lifecycle

  loadLevel(index: number): void {
    this.index = index;
    this.level = getLevel(index);
    this.game = new TileGame(this.level);
    this.reset(true);
  }

  restart(): void {
    this.game.restart();
    this.reset(false);
  }

  private reset(fresh: boolean): void {
    this.sprites = [];
    this.rets = [];
    this.groups = [];
    this.vtray = [];
    this.charges = { undo: 1, back: 1, shuffle: 1 };
    this.combo = 0;
    this.gap = 0;
    this.comboFade = 0;
    this.shufT = -1;
    this.hintId = -1;
    this.warnLevel = 0;
    this.celebrated = false;
    this.tileShake = this.level.tiles.map(() => 0);
    this.tilePulse = this.level.tiles.map(() => 0);
    this.lastFrozen = new Set(
      this.game.tiles.filter((t) => this.game.isFrozen(t.id)).map((t) => t.id),
    );
    this.introT = this.env.reducedMotion ? 9999 : fresh ? 0 : 200;
  }

  status() {
    return this.game.status();
  }

  busy(): boolean {
    return this.sprites.some((s) => s.phase !== "rest") || this.rets.length > 0 || this.shufT >= 0;
  }

  lostMessage(): string {
    return this.game.lossReason() === "stuck"
      ? "Nothing can be tapped. Undo a move or retry."
      : "The tray is full. Undo a move or retry.";
  }

  intro(index: number): string | undefined {
    return (
      {
        0: "Tap tiles to the tray. Match 3 to clear!",
        1: "Dim tiles are covered. Clear the top first.",
        2: "Helpers below: Undo, Back 3, Shuffle.",
        6: "Clear 3 trios in a row for a bonus helper!",
        10: "Ice! Frozen tiles thaw after N taps.",
        20: "Fog! Buried tiles hide their symbols.",
        30: "Ice and fog together. Plan ahead!",
        40: "Final world: all 12 symbols!",
      } as Record<number, string>
    )[index];
  }

  hudInfo(): string {
    return `Peak ${this.game.peak} · ★★★ ≤${STAR3_PEAK}`;
  }

  stars(): number {
    const p = this.game.peak;
    return p <= STAR3_PEAK ? 3 : p <= STAR2_PEAK ? 2 : 1;
  }

  // ---- helpers

  canUndo(): boolean {
    if (!this.game.canUndo()) return false;
    return this.charges.undo > 0 || this.game.status() === "lost";
  }

  undo(): void {
    if (!this.canUndo()) return;
    if (this.game.status() !== "lost") this.charges.undo--;
    const before = [...this.game.removed];
    this.game.undo();
    this.combo = 0;
    this.gap = 0;
    this.hintId = -1;
    this.resync(before);
    this.helperFx("undo");
  }

  private useBack(): boolean {
    if (this.charges.back <= 0 || this.game.status() !== "playing") return false;
    const before = [...this.game.removed];
    const ids = this.game.returnFromTray(3);
    if (!ids) return false;
    this.charges.back--;
    this.combo = 0;
    this.hintId = -1;
    this.resync(before);
    this.helperFx("back");
    return true;
  }

  private useShuffle(): boolean {
    if (this.charges.shuffle <= 0 || this.game.status() !== "playing") return false;
    const old = this.game.tiles.map((t) => t.type);
    const rnd = mulberry32(this.index * 977 + ++this.shuffleCount * 31 + 7);
    if (!this.game.shuffle(rnd)) return false;
    this.charges.shuffle--;
    this.shufOld = old;
    this.shufT = this.env.reducedMotion ? 0 : 0.0001;
    if (this.env.reducedMotion) this.shufT = -1;
    this.hintId = -1;
    this.helperFx("shuffle");
    return true;
  }

  private helperFx(id: HelperId): void {
    this.helperPulse[id] = 1;
    this.env.audio.play("whoosh", { pitch: id === "shuffle" ? 1.2 : 1.35, volume: 0.6 });
    this.env.haptics.impact("light");
  }

  hint(): boolean {
    if (this.game.status() !== "playing") return false;
    let id = -1;
    const sol = solveFrom(this.game, 20000);
    if (sol && sol.length) id = sol[0]!;
    if (id < 0) {
      let best = -1e9;
      for (const f of this.game.freeTiles()) {
        const ty = this.game.tiles[f]!.type;
        const have = this.game.tray.filter((t) => this.game.tiles[t]!.type === ty).length;
        const v = have * 100 - this.game.coverCount(f);
        if (v > best) {
          best = v;
          id = f;
        }
      }
    }
    if (id < 0) return false;
    this.hintId = id;
    this.hintT = 0;
    return true;
  }

  // ---- sprites

  private slotCenter(geo: Geo, slot: number): { x: number; y: number } {
    return { x: geo.trayX + slot * geo.slot + geo.slot / 2, y: geo.trayY + geo.slot / 2 };
  }

  private mkSprite(id: number, x: number, y: number, size: number, group: number): Sprite {
    return {
      id,
      type: this.game.tiles[id]!.type,
      x,
      y,
      size,
      phase: "fly",
      t: 0,
      ms: FLY_MS,
      fx: x,
      fy: y,
      fsize: size,
      squash: 0,
      group,
      appear: 1,
    };
  }

  /** Pops a clearing trio now: sprites burst in place and the tray closes the gap. */
  private popGroup(gr: Group): void {
    const geo = computeGeo(this.lastArea, this.level);
    this.groups = this.groups.filter((x) => x !== gr);
    this.vtray = this.vtray.filter((id) => !gr.ids.includes(id));
    const color = SYMBOL_COLORS[gr.type % SYMBOL_COLORS.length]!;
    let cx = 0;
    let cy = 0;
    for (const id of gr.ids) {
      const s = this.sprites.find((q) => q.id === id);
      if (!s) continue;
      s.phase = "pop";
      s.t = 0;
      s.ms = this.env.reducedMotion ? 1 : 260;
      cx += s.x / 3;
      cy += s.y / 3;
      this.env.juice.particles.burst(s.x, s.y, {
        count: 12,
        colors: [color, "#FFFFFF", shade(color, 0.4)],
        speed: 260,
        life: 620,
        size: 5,
        gravity: 380,
        shape: "star",
      });
    }
    this.env.juice.particles.burst(cx, cy, {
      count: 1,
      colors: [color],
      speed: 0,
      life: 420,
      size: geo.slot * 0.9,
      gravity: 0,
      shape: "ring",
    });
    const pitch = 1 + 0.12 * Math.min(8, this.combo - 1);
    this.env.audio.play("pop", { pitch });
    if (this.combo >= 2)
      this.env.audio.play("combo", { pitch: 1 + 0.1 * Math.min(8, this.combo - 2) });
    this.env.haptics.impact(this.combo >= 3 ? "medium" : "light");
    this.env.juice.text.spawn(cx, cy - geo.slot * 0.8, "+1", "#FFE27A", 24);
    if (this.combo >= 2)
      this.env.juice.text.spawn(cx, cy - geo.slot * 1.5, `Combo x${this.combo}`, "#FFFFFF", 20);
  }

  private finalizeGroups(): void {
    for (const g of [...this.groups]) this.popGroup(g);
  }

  /** Rebuilds tray sprites and board returns after undo / helpers. */
  private resync(beforeRemoved: boolean[]): void {
    const geo = computeGeo(this.lastArea, this.level);
    this.finalizeGroups();
    this.vtray = [...this.game.tray];
    const trayCentre = this.slotCenter(geo, 3);
    const tileSize = geo.slot - 6;
    // tiles that went back to the board
    let n = 0;
    for (const t of this.game.tiles) {
      if (!beforeRemoved[t.id] || this.game.removed[t.id]) continue;
      const s = this.sprites.find((q) => q.id === t.id);
      const from = s ? { x: s.x, y: s.y, size: s.size } : { ...trayCentre, size: tileSize };
      this.sprites = this.sprites.filter((q) => q.id !== t.id);
      this.rets.push({
        id: t.id,
        type: t.type,
        fx: from.x,
        fy: from.y,
        fsize: from.size,
        t: 0,
        ms: this.env.reducedMotion ? 1 : 340,
        delay: this.env.reducedMotion ? 0 : n * 70,
      });
      n++;
    }
    // sprites for tray tiles that have none, and drop sprites no longer in the tray
    this.sprites = this.sprites.filter((s) => s.phase === "pop" || this.vtray.includes(s.id));
    this.vtray.forEach((id, slot) => {
      if (this.sprites.some((s) => s.id === id)) return;
      const c = this.slotCenter(geo, slot);
      const s = this.mkSprite(id, c.x, c.y, tileSize, 0);
      s.phase = "rest";
      s.appear = 0;
      this.sprites.push(s);
    });
    this.celebrated = false;
  }

  // ---- update

  update(dtMs: number): void {
    this.clock += dtMs;
    this.introT += dtMs;
    this.hintT += dtMs;
    if (this.hintId >= 0 && (this.hintT > 4000 || !this.game.isFree(this.hintId))) this.hintId = -1;
    const geo = computeGeo(this.lastArea, this.level);
    const tileSize = geo.slot - 6;
    for (let i = 0; i < this.tileShake.length; i++) {
      if (this.tileShake[i]! > 0) this.tileShake[i] = Math.max(0, this.tileShake[i]! - dtMs);
      if (this.tilePulse[i]! > 0) this.tilePulse[i] = Math.max(0, this.tilePulse[i]! - dtMs);
    }
    for (const k of HELPERS) this.helperPulse[k] = Math.max(0, this.helperPulse[k] - dtMs / 450);
    if (this.shufT >= 0) {
      this.shufT += dtMs;
      if (this.shufT > 620) this.shufT = -1;
    }
    if (this.combo < 2) this.comboFade = Math.max(0, this.comboFade - dtMs / 300);
    for (const r of this.rets) {
      if (r.delay > 0) {
        r.delay -= dtMs;
        continue;
      }
      r.t += dtMs;
    }
    for (const r of this.rets.filter((x) => x.delay <= 0 && x.t >= x.ms)) {
      this.tilePulse[r.id] = 260;
      this.env.audio.play("drop", { pitch: 1.2, volume: 0.5 });
    }
    this.rets = this.rets.filter((r) => r.delay > 0 || r.t < r.ms);
    for (const s of [...this.sprites]) {
      const slot = this.vtray.indexOf(s.id);
      if (s.appear < 1) s.appear = Math.min(1, s.appear + dtMs / 220);
      if (s.squash > 0) s.squash = Math.max(0, s.squash - dtMs / 260);
      if (s.phase === "fly") {
        s.t += dtMs;
        if (s.t >= s.ms) {
          s.phase = "rest";
          s.squash = 1;
          if (slot >= 0) {
            const c = this.slotCenter(geo, slot);
            s.x = c.x;
            s.y = c.y;
          }
          s.size = tileSize;
          this.env.audio.play("drop", { pitch: 0.9 + 0.06 * Math.max(0, slot), volume: 0.7 });
          const gr = this.groups.find((q) => q.ids.includes(s.id));
          if (gr && ++gr.landed >= 3) this.popGroup(gr);
        }
      } else if (s.phase === "rest") {
        if (slot >= 0) {
          const c = this.slotCenter(geo, slot);
          const k = 1 - Math.exp(-16 * (dtMs / 1000));
          s.x += (c.x - s.x) * k;
          s.y += (c.y - s.y) * k;
          s.size += (tileSize - s.size) * k;
        }
      } else {
        s.t += dtMs;
        if (s.t >= s.ms) this.sprites = this.sprites.filter((q) => q !== s);
      }
    }
    // frozen tiles that just thawed
    for (const id of [...this.lastFrozen]) {
      if (!this.game.isFrozen(id)) {
        this.lastFrozen.delete(id);
        if (!this.game.removed[id]) this.thawFx(geo, id);
      }
    }
    // tray warning
    const len = this.game.tray.length;
    const wl = len >= TRAY_SIZE - 1 ? 2 : len >= TRAY_SIZE - 2 ? 1 : 0;
    if (wl > this.warnLevel && this.game.status() === "playing") {
      this.env.audio.play("bump", { pitch: 0.7 + 0.15 * wl, volume: 0.7 });
      if (wl === 2) this.env.haptics.impact("medium");
    }
    this.warnLevel = wl;
    // lost: shake and flash
    if (this.game.status() === "lost" && !this.celebrated) {
      this.celebrated = true;
      this.env.juice.shake.kick(0.5);
    }
    if (this.game.status() === "won" && !this.celebrated && !this.busy()) {
      this.celebrated = true;
      const cx = this.lastArea.x + this.lastArea.w / 2;
      const cy = this.lastArea.y + this.lastArea.h * 0.4;
      this.env.juice.particles.burst(cx, cy, {
        count: 36,
        colors: ["#FFE27A", "#FFFFFF", "#FF9A62", "#8FE3FF"],
        speed: 420,
        life: 900,
        size: 7,
        shape: "star",
        gravity: 300,
      });
      this.env.juice.text.spawn(cx, cy, "Board clear!", "#FFE27A", 30, 1200);
    }
  }

  private thawFx(geo: Geo, id: number): void {
    const c = tileCenter(geo, this.level, id);
    this.env.juice.particles.burst(c.x, c.y, {
      count: 10,
      colors: ["#CFEFFF", "#FFFFFF", "#7CC4FF"],
      speed: 200,
      life: 500,
      size: 4,
      shape: "square",
      gravity: 500,
    });
    this.env.audio.play("select", { pitch: 1.5, volume: 0.6 });
    this.tilePulse[id] = 300;
  }

  // ---- input

  private hitTile(p: PointerPoint, geo: Geo): number {
    let hitId = -1;
    let hitZ = -1;
    const slop = 0;
    for (const t of this.game.tiles) {
      if (this.game.removed[t.id] || this.isReturning(t.id)) continue;
      const c = tileCenter(geo, this.level, t.id);
      const half = geo.u * TILE_UNITS * 0.5 + slop;
      if (Math.abs(p.x - c.x) <= half && Math.abs(p.y - c.y) <= half) {
        if (t.z > hitZ || (t.z === hitZ && t.id > hitId)) {
          hitZ = t.z;
          hitId = t.id;
        }
      }
    }
    if (hitId >= 0) return hitId;
    // generous snap: nearest free tile within ~12px of its edge
    let best = -1;
    let bestD = 12;
    for (const id of this.game.freeTiles()) {
      const c = tileCenter(geo, this.level, id);
      const half = geo.u * TILE_UNITS * 0.5;
      const d = Math.max(Math.abs(p.x - c.x) - half, Math.abs(p.y - c.y) - half);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private isReturning(id: number): boolean {
    return this.rets.some((r) => r.id === id);
  }

  private helperAt(p: PointerPoint, area: Area): HelperId | null {
    const rects = helperRects(area, computeGeo(area, this.level));
    for (const k of HELPERS) {
      const r = rects[k];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 4 && p.y <= r.y + r.h + 4) return k;
    }
    return null;
  }

  down(p: PointerPoint, area: Area): void {
    this.lastArea = area;
    const h = this.helperAt(p, area);
    if (h) {
      this.pressedHelper = h;
      return;
    }
    this.pressedHelper = null;
    if (this.game.status() !== "playing") return;
    const geo = computeGeo(area, this.level);
    const id = this.hitTile(p, geo);
    if (id < 0) return;
    this.tapTile(id, geo);
  }

  move(p: PointerPoint, area: Area): void {
    if (this.pressedHelper && this.helperAt(p, area) !== this.pressedHelper)
      this.pressedHelper = null;
  }

  up(p: PointerPoint, area: Area): void {
    const h = this.pressedHelper;
    this.pressedHelper = null;
    if (!h || this.helperAt(p, area) !== h) return;
    let ok = false;
    if (h === "undo") {
      if (this.canUndo() && this.game.canUndo()) {
        this.undo();
        ok = true;
      }
    } else if (h === "back") ok = this.useBack();
    else ok = this.useShuffle();
    if (!ok) {
      this.env.audio.play("bump");
      this.helperPulse[h] = 0;
    }
  }

  private tapTile(id: number, geo: Geo): void {
    const c = tileCenter(geo, this.level, id);
    if (!this.game.isFree(id)) {
      this.tileShake[id] = 320;
      this.env.audio.play("bump");
      if (this.game.isFrozen(id) && this.game.isUncovered(id)) {
        const left = (this.game.tiles[id]!.ice ?? 0) - this.game.taps;
        this.env.juice.text.spawn(c.x, c.y - geo.u, `Thaws in ${left}`, "#BFE6FF", 16, 800);
      }
      return;
    }
    this.finalizeGroups();
    const res = this.game.take(id);
    if (!res) return;
    this.hintId = -1;
    const tileType = this.game.tiles[id]!.type;
    this.env.audio.play("move", { pitch: 0.95 + 0.04 * this.game.tray.length });
    this.env.haptics.impact("light");
    this.vtray = [...res.trayBeforeClear];
    let gid = 0;
    if (res.cleared.length) {
      gid = this.nextGroup++;
      this.groups.push({ ids: [...res.cleared], landed: 0, type: tileType });
      this.gap++;
      this.combo = this.combo > 0 && this.gap <= COMBO_GAP ? this.combo + 1 : 1;
      this.gap = 0;
      this.comboFade = 1;
      if (this.combo === 3) this.bonusHelper(geo, c);
      this.groups[this.groups.length - 1]!.landed = res.cleared.filter(
        (x) => x !== id && this.sprites.some((s) => s.id === x && s.phase !== "fly"),
      ).length;
    } else {
      this.gap++;
      if (this.gap > COMBO_GAP) this.combo = 0;
    }
    // the sprite for this tile flies from the board to its tray slot
    const slot = this.vtray.indexOf(id);
    const to = this.slotCenter(geo, slot);
    const s = this.mkSprite(id, c.x, c.y, geo.u * TILE_UNITS, gid);
    if (this.env.reducedMotion) {
      s.x = to.x;
      s.y = to.y;
      s.size = geo.slot - 6;
      s.t = s.ms;
    }
    s.fx = c.x;
    s.fy = c.y;
    s.fsize = geo.u * TILE_UNITS;
    this.sprites.push(s);
  }

  private bonusHelper(geo: Geo, at: { x: number; y: number }): void {
    const order: HelperId[] = ["back", "undo", "shuffle"];
    let pick: HelperId | null = null;
    for (const k of order)
      if (this.charges[k] < HELPER_MAX && (!pick || this.charges[k] < this.charges[pick])) pick = k;
    if (!pick) return;
    this.charges[pick]++;
    this.helperPulse[pick] = 1;
    this.env.audio.play("unlock");
    this.env.juice.text.spawn(
      at.x,
      at.y - geo.u * 2,
      `+1 ${HELPER_LABEL[pick]}!`,
      "#9CF0B8",
      20,
      1200,
    );
  }

  // ---- drawing

  private tileScale(t: { id: number; z: number }): number {
    if (this.introT >= 700) return 1;
    const delay = t.z * 70 + (t.id % 9) * 14;
    return ease.outBack(Math.max(0, Math.min(1, (this.introT - delay) / 340)));
  }

  private drawTile(
    g: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    type: number,
    o: {
      dim?: boolean;
      hide?: boolean;
      frozenN?: number;
      lift?: number;
      scaleX?: number;
      scaleY?: number;
      glow?: number;
      shadow?: boolean;
    } = {},
  ): void {
    size = Math.max(4, size);
    const sx = o.scaleX ?? 1;
    const sy = o.scaleY ?? 1;
    const w = size * sx;
    const h = size * sy;
    const d = Math.max(2, size * 0.1);
    const lift = o.lift ?? 0;
    const x = cx - w / 2;
    const y = cy - h / 2 - lift;
    const r = size * 0.18;
    if (o.shadow !== false) {
      roundRectPath(g, x + d * 0.5, y + d * 1.6, w, h, r);
      g.fillStyle = COLORS.shadow;
      g.fill();
    }
    roundRectPath(g, x, y + d, w, h, r);
    g.fillStyle = COLORS.side;
    g.fill();
    g.lineWidth = 1.4;
    g.strokeStyle = COLORS.edge;
    g.stroke();
    roundRectPath(g, x, y, w, h, r);
    g.fillStyle = COLORS.face;
    g.fill();
    g.stroke();
    // recessed plate and top highlight
    roundRectPath(g, x + w * 0.09, y + h * 0.09, w * 0.82, h * 0.82, r * 0.7);
    g.fillStyle = COLORS.plate;
    g.fill();
    if (o.hide) {
      g.fillStyle = "#9C8FB8";
      g.font = `800 ${Math.round(size * 0.5)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("?", cx, cy - lift + size * 0.03);
    } else {
      g.save();
      g.translate(cx, cy - lift);
      g.scale(sx, sy);
      drawSymbol(g, type, 0, size * 0.01, size * 0.29);
      g.restore();
    }
    if (o.glow) {
      roundRectPath(g, x, y, w, h, r);
      g.fillStyle = `rgba(255,255,255,${0.5 * o.glow})`;
      g.fill();
    }
    if (o.frozenN) {
      roundRectPath(g, x, y, w, h, r);
      g.fillStyle = COLORS.ice;
      g.fill();
      g.beginPath();
      g.moveTo(x + w * 0.15, y + h * 0.35);
      g.lineTo(x + w * 0.4, y + h * 0.15);
      g.moveTo(x + w * 0.6, y + h * 0.95);
      g.lineTo(x + w * 0.95, y + h * 0.6);
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 2;
      g.stroke();
      const br = size * 0.21;
      g.beginPath();
      g.arc(x + w * 0.5, y + h * 0.5, br, 0, Math.PI * 2);
      g.fillStyle = COLORS.iceBadge;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#FFFFFF";
      g.stroke();
      g.fillStyle = "#FFFFFF";
      g.font = `800 ${Math.round(br * 1.25)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(o.frozenN), x + w * 0.5, y + h * 0.5 + 1);
    }
    if (o.dim) {
      roundRectPath(g, x, y, w, h, r);
      g.fillStyle = COLORS.covered;
      g.fill();
    }
  }

  draw(g: CanvasRenderingContext2D, area: Area): void {
    this.lastArea = area;
    const geo = computeGeo(area, this.level);
    const game = this.game;
    const clock = this.clock;
    this.drawBackdrop(g, area);

    // board
    const returning = new Set(this.rets.map((r) => r.id));
    const order = game.tiles
      .filter((t) => !game.removed[t.id] && !returning.has(t.id))
      .sort((a, b) => a.z - b.z || a.id - b.id);
    const sweep = ((clock / 1000) % 5) * (geo.u * 8) - geo.u * 10;
    for (const t of order) {
      const sc = this.tileScale(t);
      if (sc <= 0.01) continue;
      const c = tileCenter(geo, this.level, t.id);
      const free = game.isFree(t.id);
      const covers = game.coverCount(t.id);
      let cx = c.x;
      const sh = this.tileShake[t.id]!;
      if (sh > 0) cx += Math.sin(sh / 22) * (sh / 320) * geo.u * 0.35;
      const pulse = this.tilePulse[t.id]! / 300;
      let scale = sc * (1 + 0.12 * Math.sin(Math.PI * Math.min(1, pulse)) * (pulse > 0 ? 1 : 0));
      let type = t.type;
      let scaleX = 1;
      if (this.shufT >= 0) {
        const k = Math.max(0, Math.min(1, (this.shufT - t.z * 40 - (t.id % 5) * 15) / 300));
        scaleX = Math.max(0.05, Math.abs(Math.cos(Math.PI * k)));
        if (k < 0.5) type = this.shufOld[t.id] ?? type;
      }
      let glow = 0;
      if (free) {
        const dd = Math.abs(c.x + c.y - sweep - geo.u * 4);
        if (dd < geo.u * 2.2) glow = (1 - dd / (geo.u * 2.2)) * 0.45;
        if (t.id === this.hintId) glow = 0.4 + 0.4 * Math.sin(this.hintT / 110);
        if (t.id === this.hintId) scale *= 1 + 0.05 * Math.sin(this.hintT / 110);
      }
      const frozen = game.isFrozen(t.id);
      this.drawTile(g, cx, c.y, geo.u * TILE_UNITS * scale - 2, type, {
        dim: !free && !(frozen && game.isUncovered(t.id)),
        hide: game.fog && covers >= 2,
        frozenN: frozen ? (t.ice ?? 0) - game.taps : undefined,
        lift: free ? geo.u * 0.12 : 0,
        scaleX,
        glow,
      });
    }

    // returning tiles fly back to the board
    for (const r of this.rets) {
      if (r.delay > 0) continue;
      const k = Math.min(1, r.t / r.ms);
      const e = ease.outCubic(k);
      const to = tileCenter(geo, this.level, r.id);
      const x = r.fx + (to.x - r.fx) * e;
      const y = r.fy + (to.y - r.fy) * e - Math.sin(Math.PI * k) * 40;
      const size = r.fsize + (geo.u * TILE_UNITS - r.fsize) * e;
      this.drawTile(g, x, y, size, r.type, { lift: Math.sin(Math.PI * k) * 6 });
    }

    // tray
    this.drawTray(g, area, geo);

    // flying and resting tray sprites
    for (const s of this.sprites) {
      let x = s.x;
      let y = s.y;
      let size = s.size;
      let sx = 1;
      let sy = 1;
      let lift = 0;
      if (s.phase === "fly") {
        const k = Math.min(1, s.t / s.ms);
        const e = ease.inOutSine(k);
        const slot = this.vtray.indexOf(s.id);
        const to = this.slotCenter(geo, Math.max(0, slot));
        const tsize = geo.slot - 6;
        x = s.fx + (to.x - s.fx) * e;
        const dist = Math.hypot(to.x - s.fx, to.y - s.fy);
        y = s.fy + (to.y - s.fy) * e - Math.sin(Math.PI * k) * Math.min(90, dist * 0.22);
        size = s.fsize + (tsize - s.fsize) * e;
        lift = Math.sin(Math.PI * k) * 8;
        const tilt = Math.sin(Math.PI * k) * 0.0;
        sx = 1 + tilt;
      } else if (s.phase === "pop") {
        const k = Math.min(1, s.t / s.ms);
        const sc =
          k < 0.35 ? 1 + 0.3 * ease.outQuad(k / 0.35) : 1.3 * (1 - ease.inQuad((k - 0.35) / 0.65));
        sx = sy = Math.max(0.01, sc);
        g.save();
        g.globalAlpha = 1 - ease.inQuad(k);
      }
      if (s.squash > 0) {
        const q = Math.sin(Math.PI * s.squash) * ease.outQuad(s.squash);
        sy *= 1 - 0.18 * q;
        sx *= 1 + 0.12 * q;
      }
      if (s.appear < 1) {
        const a = ease.outBack(s.appear);
        sx *= a;
        sy *= a;
      }
      this.drawTile(g, x, y, size, s.type, {
        scaleX: sx,
        scaleY: sy,
        lift,
        shadow: s.phase !== "pop",
      });
      if (s.phase === "pop") g.restore();
    }

    this.drawLabels(g, area, geo);
    this.drawHelpers(g, area, geo);
  }

  private drawBackdrop(g: CanvasRenderingContext2D, area: Area): void {
    const wash = WORLD_WASH[Math.min(WORLD_WASH.length - 1, Math.floor(this.index / 10))]!;
    g.save();
    g.globalAlpha = 0.1;
    g.fillStyle = wash;
    g.fillRect(area.x, area.y, area.w, area.h);
    g.restore();
    // slow drifting motes keep the screen alive
    const t = this.clock / 1000;
    g.save();
    g.fillStyle = wash;
    for (let i = 0; i < 9; i++) {
      const px = area.x + ((i * 0.137 + 0.05 + Math.sin(t * 0.2 + i) * 0.03) % 1) * area.w;
      const py = area.y + area.h - ((t * 14 + i * 97) % (area.h + 20));
      g.globalAlpha = 0.12 + 0.08 * Math.sin(t + i * 2);
      g.beginPath();
      g.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawTray(g: CanvasRenderingContext2D, area: Area, geo: Geo): void {
    const len = this.game.tray.length;
    const warn = this.warnLevel;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock / (warn === 2 ? 110 : 220));
    const w = geo.slot * TRAY_SIZE;
    if (warn > 0) {
      const col = warn === 2 ? COLORS.danger : COLORS.warn;
      roundRectPath(g, geo.trayX - 10, geo.trayY - 10, w + 20, geo.slot + 20, 18);
      g.fillStyle = col;
      g.globalAlpha = 0.18 + 0.32 * pulse;
      g.fill();
      g.globalAlpha = 1;
    }
    roundRectPath(g, geo.trayX - 6, geo.trayY - 6, w + 12, geo.slot + 12, 14);
    g.fillStyle = COLORS.tray;
    g.fill();
    if (warn > 0) {
      g.lineWidth = 3;
      g.strokeStyle = warn === 2 ? COLORS.danger : COLORS.warn;
      g.stroke();
    }
    for (let i = 0; i < TRAY_SIZE; i++) {
      roundRectPath(g, geo.trayX + i * geo.slot + 2, geo.trayY + 2, geo.slot - 4, geo.slot - 4, 8);
      g.fillStyle =
        warn > 0 && i >= TRAY_SIZE - 2 ? (warn === 2 ? "#5A2A4A" : "#4A4270") : COLORS.slot;
      g.fill();
    }
    void len;
    void area;
  }

  private drawLabels(g: CanvasRenderingContext2D, area: Area, geo: Geo): void {
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = `700 13px ${FONT}`;
    g.textAlign = "left";
    g.fillText(`Tiles ${this.game.remaining}`, area.x + 14, area.y + 16);
    if (this.warnLevel > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock / 150);
      g.textAlign = "center";
      g.fillStyle = this.warnLevel === 2 ? COLORS.danger : COLORS.warn;
      g.globalAlpha = 0.7 + 0.3 * pulse;
      g.font = `800 14px ${FONT}`;
      g.fillText(
        this.warnLevel === 2 ? "Tray nearly full!" : "Tray filling up",
        area.x + area.w / 2,
        geo.trayY - 20,
      );
      g.globalAlpha = 1;
    }
    if (this.combo >= 2) {
      const left = Math.max(0, COMBO_GAP - this.gap);
      g.save();
      g.globalAlpha = this.combo >= 2 ? 1 : this.comboFade;
      const label = `Combo x${Math.max(this.combo, 1)}`;
      g.font = `800 13px ${FONT}`;
      const pw = 96;
      const px = area.x + area.w - pw - 12;
      roundRectPath(g, px, area.y + 4, pw, 24, 12);
      g.fillStyle = "#FFC857";
      g.fill();
      g.fillStyle = INK;
      g.textAlign = "center";
      g.fillText(label, px + pw / 2, area.y + 14);
      for (let i = 0; i < COMBO_GAP; i++) {
        g.beginPath();
        g.arc(px + pw / 2 + (i - (COMBO_GAP - 1) / 2) * 9, area.y + 24, 1.8, 0, Math.PI * 2);
        g.fillStyle = i < left ? INK : "rgba(42,33,64,0.25)";
        g.fill();
      }
      g.restore();
    }
  }

  private drawHelpers(g: CanvasRenderingContext2D, area: Area, geo: Geo): void {
    const rects = helperRects(area, geo);
    const playing = this.game.status() === "playing";
    for (const k of HELPERS) {
      const r = rects[k];
      const n = this.charges[k];
      const usable =
        playing &&
        n > 0 &&
        (k === "undo"
          ? this.game.canUndo()
          : k === "back"
            ? this.game.tray.length > 0
            : this.game.remaining >= 3);
      const press = this.pressedHelper === k ? 0.94 : 1;
      const pulse = this.helperPulse[k];
      const sc = press * (1 + 0.1 * Math.sin(Math.PI * Math.min(1, pulse)));
      g.save();
      g.translate(r.x + r.w / 2, r.y + r.h / 2);
      g.scale(sc, sc);
      g.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      g.globalAlpha = usable ? 1 : 0.5;
      roundRectPath(g, r.x, r.y + 4, r.w, r.h, 14);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fill();
      roundRectPath(g, r.x, r.y, r.w, r.h, 14);
      g.fillStyle = usable ? "#3C4C96" : "#2A3270";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = usable ? "#FFC857" : "rgba(255,255,255,0.25)";
      g.stroke();
      this.drawHelperIcon(g, k, r.x + 26, r.y + r.h / 2, 11);
      g.fillStyle = "#FFFFFF";
      g.font = `700 14px ${FONT}`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(HELPER_LABEL[k], r.x + 44, r.y + r.h / 2 + 1, r.w - 52);
      // charge badge
      const bx = r.x + r.w - 6;
      const by = r.y + 4;
      g.beginPath();
      g.arc(bx, by, 11, 0, Math.PI * 2);
      g.fillStyle = n > 0 ? "#FFC857" : "#6C7399";
      g.fill();
      g.fillStyle = INK;
      g.font = `800 13px ${FONT}`;
      g.textAlign = "center";
      g.fillText(String(n), bx, by + 1);
      g.restore();
    }
  }

  private drawHelperIcon(
    g: CanvasRenderingContext2D,
    k: HelperId,
    cx: number,
    cy: number,
    s: number,
  ): void {
    g.save();
    g.strokeStyle = "#FFFFFF";
    g.fillStyle = "#FFFFFF";
    g.lineWidth = 2.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    if (k === "undo") {
      g.arc(cx, cy + 1, s * 0.8, Math.PI * 1.1, Math.PI * 2.2);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - s * 1.0, cy - s * 0.55);
      g.lineTo(cx - s * 0.55, cy + s * 0.2);
      g.lineTo(cx - s * 1.0 + s * 1.25, cy - s * 0.2);
      g.closePath();
      g.fill();
    } else if (k === "back") {
      g.moveTo(cx, cy + s * 0.6);
      g.lineTo(cx, cy - s * 0.8);
      g.moveTo(cx - s * 0.6, cy - s * 0.2);
      g.lineTo(cx, cy - s * 0.85);
      g.lineTo(cx + s * 0.6, cy - s * 0.2);
      g.moveTo(cx - s * 0.9, cy + s * 0.95);
      g.lineTo(cx + s * 0.9, cy + s * 0.95);
      g.stroke();
    } else {
      g.moveTo(cx - s, cy - s * 0.5);
      g.bezierCurveTo(cx - s * 0.2, cy - s * 0.5, cx - s * 0.2, cy + s * 0.5, cx + s, cy + s * 0.5);
      g.moveTo(cx - s, cy + s * 0.5);
      g.bezierCurveTo(cx - s * 0.2, cy + s * 0.5, cx - s * 0.2, cy - s * 0.5, cx + s, cy - s * 0.5);
      g.moveTo(cx + s * 0.55, cy - s * 0.95);
      g.lineTo(cx + s, cy - s * 0.5);
      g.lineTo(cx + s * 0.55, cy - s * 0.05);
      g.moveTo(cx + s * 0.55, cy + s * 0.05);
      g.lineTo(cx + s, cy + s * 0.5);
      g.lineTo(cx + s * 0.55, cy + s * 0.95);
      g.stroke();
    }
    g.restore();
  }
}

export default createLevelGame({
  slug: SLUG,
  title: "Tile Trio",
  levelCount: LEVEL_COUNT,
  worlds: WORLDS.map((w) => ({ name: w.name, from: w.from })),
  theme: {
    bg: "#27346A",
    bg2: "#3E2B6B",
    panel: "#18204A",
    text: "#FFFFFF",
    muted: "#C3CCF0",
    accent: "#FFC857",
    accentText: "#18204A",
    buttonFill: "#3C4C96",
    star: "#FFC857",
    confetti: ["#FFC857", "#FF6B8B", "#6FE0C0", "#7DB8FF", "#FFFFFF"],
  },
  create: (env) => new TileController(env),
});
