import { describe, expect, it } from "vitest";
import { LEVEL_COUNT, MAX_SYMBOLS, PLANS, getLevel } from "./levels";
import { TRAY_SIZE, TileGame, replay, solve, type Tile, type TileLevel } from "./logic";

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
    const g = new TileGame(flat([1, 2, 3, 4, 0, 0, 0]));
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

describe("levels", () => {
  it("has at least 20 levels with growing size", () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(20);
    expect(getLevel(LEVEL_COUNT - 1).tiles.length).toBeGreaterThan(getLevel(0).tiles.length * 5);
    for (let i = 1; i < LEVEL_COUNT; i++) {
      expect(PLANS[i]!.symbols).toBeGreaterThanOrEqual(PLANS[i - 1]!.symbols);
      expect(PLANS[i]!.layers).toBeGreaterThanOrEqual(PLANS[i - 1]!.layers);
    }
  });

  it("is deterministic and well formed", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const a = getLevel(i);
      expect(getLevel(i)).toEqual(a);
      expect(a.tiles.length % 3).toBe(0);
      const counts = new Map<number, number>();
      for (const t of a.tiles) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
      for (const [type, n] of counts) {
        expect(n % 3, `level ${i + 1} symbol ${type}`).toBe(0);
        expect(type).toBeLessThan(MAX_SYMBOLS);
      }
      // at least one tile is free at the start, and the top layer is free
      expect(new TileGame(a).freeTiles().length).toBeGreaterThan(0);
    }
  });

  it("the construction witness wins and never needs more than 6 tray slots", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const level = getLevel(i);
      expect(replay(level, level.witness), `level ${i + 1}`).toBe("won");
      const g = new TileGame(level);
      let peak = 0;
      for (const id of level.witness) {
        g.take(id);
        peak = Math.max(peak, g.tray.length);
      }
      expect(peak).toBeLessThan(TRAY_SIZE);
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

  it("naive play can lose: tapping free tiles in order of id fails somewhere", () => {
    let lost = 0;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const g = new TileGame(getLevel(i));
      while (g.status() === "playing") {
        const free = g.freeTiles();
        g.take(free[0]!);
      }
      if (g.status() === "lost") lost++;
    }
    expect(lost).toBeGreaterThan(0);
  });
});
