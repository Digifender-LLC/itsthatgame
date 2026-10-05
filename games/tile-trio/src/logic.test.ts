import { describe, expect, it } from "vitest";
import { LEVEL_COUNT, MAX_SYMBOLS, PLANS, WORLDS, getLevel, mulberry32 } from "./levels";
import {
  TRAY_SIZE,
  TileGame,
  peakOf,
  replay,
  solve,
  solveFrom,
  type Tile,
  type TileLevel,
} from "./logic";

const flat = (types: number[]): TileLevel => ({
  tiles: types.map((type, id) => ({ id, x: id * 2, y: 0, z: 0, type })),
});

describe("rules", () => {
  it("three equal symbols in the tray clear and the board empties to a win", () => {
    const g = new TileGame(flat([4, 4, 4]));
    g.take(0);
    g.take(1);
    expect(g.tray).toHaveLength(2);
    expect(g.status()).toBe("playing");
    const r = g.take(2)!;
    expect(r.cleared).toHaveLength(3);
    expect(g.tray).toHaveLength(0);
    expect(g.status()).toBe("won");
  });

  it("keeps equal symbols together in the tray", () => {
    const g = new TileGame(flat([1, 2, 1, 3, 2]));
    for (const id of [0, 1, 2, 3, 4]) g.take(id);
    expect(g.tray.map((id) => g.tiles[id]!.type)).toEqual([1, 1, 2, 2, 3]);
  });

  it("only uncovered tiles can be taken", () => {
    const tiles: Tile[] = [
      { id: 0, x: 0, y: 0, z: 0, type: 0 },
      { id: 1, x: 1, y: 1, z: 1, type: 0 },
      { id: 2, x: 6, y: 0, z: 0, type: 0 },
    ];
    const g = new TileGame({ tiles });
    expect(g.isFree(0)).toBe(false);
    expect(g.take(0)).toBeNull();
    expect(g.freeTiles()).toEqual([1, 2]);
    g.take(1);
    expect(g.isFree(0)).toBe(true);
    expect(g.take(0)).not.toBeNull();
  });

  it("does not cover tiles that merely touch edges", () => {
    const tiles: Tile[] = [
      { id: 0, x: 0, y: 0, z: 0, type: 0 },
      { id: 1, x: 2, y: 0, z: 1, type: 0 },
    ];
    expect(new TileGame({ tiles }).isFree(0)).toBe(true);
  });

  it("loses when the tray fills without a clear", () => {
    const g = new TileGame(flat([0, 1, 2, 3, 4, 5, 6, 0, 0]));
    for (let id = 0; id < TRAY_SIZE - 1; id++) {
      g.take(id);
      expect(g.status()).toBe("playing");
    }
    g.take(TRAY_SIZE - 1);
    expect(g.tray).toHaveLength(TRAY_SIZE);
    expect(g.status()).toBe("lost");
    expect(g.take(7)).toBeNull();
  });

  it("a seventh tile that completes a trio does not lose", () => {
    const g = new TileGame(flat([1, 2, 3, 4, 0, 0, 0, 5, 5, 5]));
    for (let id = 0; id < 6; id++) g.take(id);
    expect(g.tray).toHaveLength(6);
    const r = g.take(6)!;
    expect(r.trayBeforeClear).toHaveLength(7);
    expect(g.tray).toHaveLength(4);
    expect(g.status()).toBe("playing");
  });

  it("undo and restart restore the board and tray exactly", () => {
    const g = new TileGame(flat([0, 1, 0, 1, 0, 1]));
    g.take(0);
    g.take(1);
    g.take(2);
    const snapshot = JSON.stringify([g.removed, g.tray]);
    g.take(3);
    expect(g.undo()).toBe(true);
    expect(JSON.stringify([g.removed, g.tray])).toBe(snapshot);
    g.take(4); // completes the zeros
    expect(g.tray.map((id) => g.tiles[id]!.type)).toEqual([1]);
    g.undo();
    expect(g.tray).toHaveLength(3);
    g.restart();
    expect(g.tray).toHaveLength(0);
    expect(g.remaining).toBe(6);
    expect(g.canUndo()).toBe(false);
  });

  it("undo works after a loss", () => {
    const g = new TileGame(flat([0, 1, 2, 3, 4, 5, 6]));
    for (let id = 0; id < 7; id++) g.take(id);
    expect(g.status()).toBe("lost");
    g.undo();
    expect(g.status()).toBe("playing");
  });
});

describe("ice, helpers and stuck detection", () => {
  const iced = (): TileLevel => ({
    tiles: [
      { id: 0, x: 0, y: 0, z: 0, type: 0, ice: 2 },
      { id: 1, x: 2, y: 0, z: 0, type: 0 },
      { id: 2, x: 4, y: 0, z: 0, type: 1 },
      { id: 3, x: 6, y: 0, z: 0, type: 1 },
      { id: 4, x: 8, y: 0, z: 0, type: 1 },
      { id: 5, x: 10, y: 0, z: 0, type: 0 },
    ],
  });

  it("a frozen tile thaws after enough tiles are taken, and undo re-freezes it", () => {
    const g = new TileGame(iced());
    expect(g.isFrozen(0)).toBe(true);
    expect(g.take(0)).toBeNull();
    g.take(1);
    expect(g.isFree(0)).toBe(false);
    g.take(2);
    expect(g.isFree(0)).toBe(true);
    g.undo();
    expect(g.isFrozen(0)).toBe(true);
  });

  it("is lost (stuck) when only frozen tiles remain", () => {
    const g = new TileGame({
      tiles: [
        { id: 0, x: 0, y: 0, z: 0, type: 0, ice: 5 },
        { id: 1, x: 2, y: 0, z: 0, type: 0, ice: 5 },
        { id: 2, x: 4, y: 0, z: 0, type: 0, ice: 5 },
      ],
    });
    expect(g.status()).toBe("lost");
    expect(g.lossReason()).toBe("stuck");
  });

  it("returnFromTray puts the last taken tiles back and keeps the peak", () => {
    const g = new TileGame(flat([0, 1, 2, 3, 0, 1, 2, 3, 4, 4, 4, 5]));
    for (const id of [0, 1, 2, 3]) g.take(id);
    expect(g.peak).toBe(4);
    const ids = g.returnFromTray(3)!;
    expect(ids).toEqual([3, 2, 1]);
    expect(g.tray).toEqual([0]);
    expect(g.isFree(2)).toBe(true);
    expect(g.peak).toBe(4);
    g.undo();
    expect(g.tray).toHaveLength(4);
  });

  it("shuffle keeps the symbol multiset and leaves the level solvable from the current state", () => {
    for (const idx of [4, 9, 19, 29, 44]) {
      const level = getLevel(idx);
      const g = new TileGame(level);
      const rnd = mulberry32(idx);
      // play a few safe moves from the witness, then shuffle mid-level
      for (const id of level.witness.slice(0, 7)) g.take(id);
      const count = () => {
        const m = new Map<number, number>();
        for (const t of g.tiles) if (!g.removed[t.id]) m.set(t.type, (m.get(t.type) ?? 0) + 1);
        return [...m].sort((a, b) => a[0] - b[0]).join(";");
      };
      const before = count();
      expect(g.shuffle(rnd), `level ${idx + 1}`).toBe(true);
      expect(count()).toBe(before);
      const sol = solveFrom(g);
      expect(sol, `level ${idx + 1} after shuffle`).not.toBeNull();
      for (const id of sol!) expect(g.take(id)).not.toBeNull();
      expect(g.status()).toBe("won");
    }
  });
});

describe("levels", () => {
  it("has 50 levels in worlds that start on rows of five", () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(40);
    expect(LEVEL_COUNT).toBe(50);
    expect(WORLDS.length).toBeGreaterThanOrEqual(3);
    for (const w of WORLDS) expect((w.from - 1) % 5).toBe(0);
    expect(WORLDS[0]!.from).toBe(1);
  });

  it("grows: more tiles, more symbols, more layers, new shapes and twists", () => {
    expect(getLevel(LEVEL_COUNT - 1).tiles.length).toBeGreaterThan(getLevel(0).tiles.length * 8);
    expect(PLANS[0]!.symbols).toBe(3);
    expect(PLANS[LEVEL_COUNT - 1]!.symbols).toBe(MAX_SYMBOLS);
    expect(new Set(PLANS.map((p) => p.shape)).size).toBeGreaterThanOrEqual(6);
    expect(PLANS.slice(0, 10).every((p) => p.ice === 0 && !p.fog)).toBe(true);
    // ice first appears at level 11 and fog at level 21 (see intro banners)
    expect(PLANS.findIndex((p) => p.ice > 0)).toBe(10);
    expect(PLANS.findIndex((p) => p.fog)).toBe(20);
    for (let i = 1; i < LEVEL_COUNT; i++) {
      expect(PLANS[i]!.symbols, `level ${i + 1}`).toBeGreaterThanOrEqual(PLANS[i - 1]!.symbols - 2);
    }
  });

  it("is deterministic and well formed", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const a = getLevel(i);
      expect(a.tiles.length % 3).toBe(0);
      expect(a.tiles.filter((t) => t.ice).length, `level ${i + 1} ice`).toBe(PLANS[i]!.ice);
      expect(!!a.fog).toBe(PLANS[i]!.fog);
      const counts = new Map<number, number>();
      for (const t of a.tiles) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
      expect(counts.size).toBe(Math.min(PLANS[i]!.symbols, a.tiles.length / 3));
      for (const [type, n] of counts) {
        expect(n % 3, `level ${i + 1} symbol ${type}`).toBe(0);
        expect(type).toBeLessThan(MAX_SYMBOLS);
      }
      expect(new TileGame(a).freeTiles().length).toBeGreaterThan(0);
    }
  });

  it("the construction witness wins with a tray peak of at most 4 (3 stars are reachable)", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const level = getLevel(i);
      expect(replay(level, level.witness), `level ${i + 1}`).toBe("won");
      expect(peakOf(level, level.witness), `level ${i + 1} peak`).toBeLessThanOrEqual(4);
      expect(level.par).toBe(peakOf(level, level.witness));
    }
  });

  it("every level is solvable (independent solver finds a winning tap order)", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const level = getLevel(i);
      const sol = solve(level);
      expect(sol, `level ${i + 1} unsolved`).not.toBeNull();
      expect(replay(level, sol!), `level ${i + 1} replay`).toBe("won");
    }
  });

  it("naive play can lose: tapping the first free tile fails on later levels", () => {
    let lost = 0;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const g = new TileGame(getLevel(i));
      while (g.status() === "playing") g.take(g.freeTiles()[0]!);
      if (g.status() === "lost") lost++;
    }
    expect(lost).toBeGreaterThan(10);
  });
});
