import { describe, expect, it } from "vitest";
import { buildLevel } from "./generator";
import { INTROS, LEVEL_COUNT, WORLDS, getLevel, getPar } from "./levels";
import { LEVEL_DATA } from "./levelData";
import {
  PinDropGame,
  analyze,
  parseLevel,
  pullPin,
  replay,
  solve,
  status,
  type PinDropLevel,
} from "./logic";

const lvl = (...rows: string[]): PinDropLevel => ({ rows });

describe("physics rules", () => {
  it("a ball rests on an unpulled pin and falls into the cup when it is pulled", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#.#", "#U#"));
    expect(g.state.balls[0]).toMatchObject({ x: 1, y: 0 });
    expect(g.status()).toBe("playing");
    const frames = g.pull(0)!;
    expect(frames.length).toBeGreaterThan(1);
    expect(g.state.collected).toBe(1);
    expect(g.state.cups[0]!.n).toBe(1);
    expect(g.status()).toBe("won");
  });

  it("balls placed in the air settle before play starts", () => {
    const s = parseLevel(lvl("#g#", "#.#", "#.#", "###"));
    expect(s.balls[0]).toMatchObject({ x: 1, y: 2 });
  });

  it("slides carry balls sideways", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#>U"));
    g.pull(0);
    expect(g.status()).toBe("won");
  });

  it("balls stack on each other", () => {
    const s = parseLevel(lvl("#g#", "#g#", "#.#", "###"));
    expect(s.balls.map((b) => b.y).sort()).toEqual([1, 2]);
  });

  it("a rock in the cup loses", () => {
    const g = new PinDropGame(lvl("#r#g#", "#P#P#", "#U#.#", "#####"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("rock");
  });

  it("a rock touching a ball destroys it and loses", () => {
    const g = new PinDropGame(lvl("#.r#", "#.P#", "#g.#", "####"));
    expect(g.status()).toBe("playing");
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("crush");
  });

  it("running out of pins with balls stranded loses", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "###"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("stuck");
  });

  it("cannot pull a pulled pin or pull after the game ended", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#U#"));
    expect(g.pull(0)).not.toBeNull();
    expect(g.pull(0)).toBeNull();
    expect(pullPin(g.state, 3)).toBeNull();
  });

  it("is deterministic", () => {
    const run = () => {
      const g = new PinDropGame(getLevel(12));
      for (const i of solve(getLevel(12))!) g.pull(i);
      return JSON.stringify(g.state);
    };
    expect(run()).toBe(run());
  });
});

describe("lava", () => {
  it("burns a ball that falls in", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#~#", "#U#"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    expect(g.reason()).toBe("lava");
  });

  it("is cooled for good by a rock, which is used up", () => {
    const g = new PinDropGame(lvl("#r#g#", "#P#P#", "#~#.#", "#U#.#", "#####"));
    // the rock falls into lava (cooling it, no loss); the lone ball then reaches the cup
    const f = g.pull(0)!;
    expect(g.state.lost).toBeNull();
    expect(f.some((fr) => fr.removed.some((r) => r.why === "cool"))).toBe(true);
    expect(g.state.cooled).toHaveLength(1);
    expect(g.state.balls.filter((b) => b.kind === "rock")).toHaveLength(0);
  });
});

describe("gates and sensors", () => {
  const rows = ["#g#r#", "#P#P#", "#G#s#", "#U###"];
  it("a closed gate blocks until any ball touches a sensor", () => {
    const g = new PinDropGame(lvl(...rows));
    g.pull(0);
    expect(g.state.collected).toBe(0);
    expect(g.state.balls[0]).toMatchObject({ x: 1, y: 1 }); // resting on the closed gate
    const frames = g.pull(1)!;
    expect(frames.some((fr) => fr.opened === 1)).toBe(true);
    expect(g.state.open).toBe(1);
    expect(g.status()).toBe("won");
  });

  it("the second channel is independent", () => {
    const g = new PinDropGame(lvl("#g#r#", "#P#P#", "#H#t#", "#U###"));
    g.pull(1);
    expect(g.state.open).toBe(2);
    g.pull(0);
    expect(g.status()).toBe("won");
  });
});

describe("coloured cups", () => {
  it("accepts the matching colour and loses on a mismatch", () => {
    const ok = new PinDropGame(lvl("#a#", "#P#", "#A#"));
    ok.pull(0);
    expect(ok.status()).toBe("won");
    const bad = new PinDropGame(lvl("#b#", "#P#", "#A#"));
    bad.pull(0);
    expect(bad.status()).toBe("lost");
    expect(bad.reason()).toBe("wrong");
  });

  it("an open cup takes any colour and gauges need per cup", () => {
    const s = parseLevel(lvl("#ab#", "#PP#", "#AB#"));
    expect(s.cups.map((c) => c.need)).toEqual([1, 1]);
    expect(parseLevel(lvl("#g#", "#P#", "#U#")).cups[0]!.need).toBe(1);
  });
});

describe("session", () => {
  it("supports undo and restart", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "#.#", "#U#"));
    const before = JSON.stringify(g.state);
    expect(g.canUndo()).toBe(false);
    g.pull(0);
    expect(g.canUndo()).toBe(true);
    expect(g.undo()).toBe(true);
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.undo()).toBe(false);
    g.pull(0);
    g.restart();
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.canUndo()).toBe(false);
  });

  it("a lost game can be undone back to playing", () => {
    const g = new PinDropGame(lvl("#g#", "#P#", "###"));
    g.pull(0);
    expect(g.status()).toBe("lost");
    g.undo();
    expect(g.status()).toBe("playing");
  });
});

describe("solver", () => {
  it("returns a shortest order", () => {
    // pin 0 is a decoy that only wastes a pull
    const level = lvl("#g#.#", "#P#P#", "#U#.#", "#####");
    expect(solve(level)).toEqual([0]);
  });
});

describe("levels", () => {
  it("has 40 to 60 levels in worlds aligned to rows of five", () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(40);
    expect(LEVEL_COUNT).toBeLessThanOrEqual(60);
    expect(WORLDS.length).toBeGreaterThanOrEqual(3);
    for (const w of WORLDS) expect((w.from - 1) % 5).toBe(0);
    expect(WORLDS[0]!.from).toBe(1);
    for (const i of Object.keys(INTROS)) expect(Number(i)).toBeLessThan(LEVEL_COUNT);
  });

  it("every level is regenerated exactly from its recorded plan", () => {
    LEVEL_DATA.forEach((e, i) => {
      expect(buildLevel(e.plan)?.rows, `level ${i + 1}`).toEqual(e.rows);
    });
  });

  it("every level starts playable (no instant loss/win) with balls and pins", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const s = parseLevel(getLevel(i));
      expect(s.lost, `level ${i + 1}`).toBeNull();
      expect(status(s), `level ${i + 1}`).toBe("playing");
      expect(s.totalGood).toBeGreaterThanOrEqual(1);
      expect(s.pins.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every level is solvable and its par is the solver's fewest pulls", () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const level = getLevel(i);
      const sol = solve(level);
      expect(sol, `level ${i + 1} unsolved`).not.toBeNull();
      expect(replay(level, sol!), `level ${i + 1} replay`).toBe("won");
      expect(sol!.length, `level ${i + 1} par`).toBe(getPar(i));
      expect(analyze(level).minPulls, `level ${i + 1} analyze`).toBe(getPar(i));
    }
  });

  it("mechanics appear where the intro banners say", () => {
    const has = (i: number, re: RegExp) => re.test(getLevel(i).rows.join(""));
    for (let i = 0; i < 5; i++) expect(has(i, /r/), `level ${i + 1} rocks`).toBe(false);
    expect(has(5, /r/)).toBe(true);
    for (let i = 0; i < 10; i++) expect(has(i, /~/)).toBe(false);
    expect(has(10, /~/)).toBe(true);
    for (let i = 0; i < 20; i++) expect(has(i, /[Gs]/)).toBe(false);
    expect(has(20, /G/) && has(20, /s/)).toBe(true);
    for (let i = 0; i < 30; i++) expect(has(i, /[ABab]/)).toBe(false);
    expect(has(30, /A/) && has(30, /B/)).toBe(true);
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const w = WORLDS.filter((x) => x.from - 1 <= i).length - 1;
      if (w === 1) expect(has(i, /~/), `level ${i + 1} lava`).toBe(true);
      if (w === 2) expect(has(i, /G/), `level ${i + 1} gate`).toBe(true);
      if (w === 3) expect(has(i, /A/) && has(i, /B/), `level ${i + 1} cups`).toBe(true);
    }
  });

  it("every level from the rocks world on can be lost (puzzles are not luck-proof)", () => {
    for (let i = 5; i < LEVEL_COUNT; i++) {
      const a = analyze(getLevel(i));
      expect(a.wins, `level ${i + 1}`).toBeGreaterThan(0);
      expect(a.wins, `level ${i + 1}`).toBeLessThan(a.sequences);
    }
  });

  it("difficulty rises: later worlds have more pins and a smaller winning fraction", () => {
    const pins = (i: number) => parseLevel(getLevel(i)).pins.length;
    expect(pins(LEVEL_COUNT - 1)).toBeGreaterThan(pins(0));
    const rate = (i: number) => {
      const a = analyze(getLevel(i));
      return a.wins / a.sequences;
    };
    expect(rate(LEVEL_COUNT - 1)).toBeLessThan(rate(5));
  });
});
