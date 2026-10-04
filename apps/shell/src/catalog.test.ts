import { describe, expect, it } from "vitest";
import manifest from "./catalog.json";
import {
  GAME_MODULES,
  isNew,
  loadCatalog,
  validateCatalog,
  visibleGames,
  type CatalogGame,
} from "./catalog";

const entry = (over: Partial<CatalogGame> = {}): CatalogGame => ({
  slug: "ring-sort",
  title: "Ring Sort",
  tier: "free",
  addedInVersion: "1.0.0",
  releasable: true,
  icon: "drawn:ring-sort",
  module: "ring-sort",
  ...over,
});

describe("validateCatalog", () => {
  it("accepts the bundled manifest with 8 games, 3 free and 5 premium (Roadmap D6)", () => {
    const r = validateCatalog(manifest, Object.keys(GAME_MODULES));
    expect(r.ok).toBe(true);
    const games = loadCatalog().games;
    expect(games).toHaveLength(8);
    expect(games.filter((g) => g.tier === "free").map((g) => g.slug)).toEqual([
      "ring-sort",
      "pin-drop",
      "tile-trio",
    ]);
    expect(games.filter((g) => g.tier === "premium")).toHaveLength(5);
  });

  it("every entry has a code-split module loader", () => {
    for (const g of loadCatalog().games) expect(GAME_MODULES[g.module]).toBeTypeOf("function");
  });

  it.each([
    [{ slug: "Bad Slug" }, "slug"],
    [{ slug: "ab" }, "slug"],
    [{ tier: "gold" }, "tier"],
    [{ addedInVersion: "1.0" }, "addedInVersion"],
    [{ releasable: "yes" }, "releasable"],
    [{ title: "" }, "title"],
    [{ icon: "" }, "icon"],
    [{ module: "" }, "module"],
  ])("rejects %j", (over, field) => {
    const r = validateCatalog({ schemaVersion: 1, games: [{ ...entry(), ...over }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain(field);
  });

  it("rejects duplicate slugs, unknown keys, wrong schemaVersion and unknown modules", () => {
    const r = validateCatalog(
      {
        schemaVersion: 2,
        games: [entry(), { ...entry(), extra: 1 }, entry({ slug: "x-y-z", module: "nope" })],
      },
      ["ring-sort"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join("\n");
    expect(all).toContain("schemaVersion");
    expect(all).toContain("duplicated");
    expect(all).toContain("extra is not allowed");
    expect(all).toContain('"nope" has no game package');
  });

  it("rejects non-objects", () => {
    expect(validateCatalog(null).ok).toBe(false);
    expect(validateCatalog({ schemaVersion: 1 }).ok).toBe(false);
    expect(validateCatalog({ schemaVersion: 1, games: [42] }).ok).toBe(false);
  });
});

describe("isNew (RULE-12)", () => {
  it("is new when added in the installed major.minor and not yet seen", () => {
    expect(isNew(entry({ addedInVersion: "1.0.0" }), "1.0.0", false)).toBe(true);
    expect(isNew(entry({ addedInVersion: "1.2.0" }), "1.2.3", false)).toBe(true);
  });
  it("is not new once opened", () => {
    expect(isNew(entry(), "1.0.0", true)).toBe(false);
  });
  it("is not new when added in an earlier version", () => {
    expect(isNew(entry({ addedInVersion: "1.0.0" }), "1.1.0", false)).toBe(false);
    expect(isNew(entry({ addedInVersion: "1.1.5" }), "2.1.0", false)).toBe(false);
  });
});

describe("visibleGames (RULE-9)", () => {
  const catalog = {
    schemaVersion: 1 as const,
    games: [entry(), entry({ slug: "wip-game", releasable: false })],
  };
  it("hides non-releasable entries in release builds only", () => {
    expect(visibleGames(catalog, true).map((g) => g.slug)).toEqual(["ring-sort"]);
    expect(visibleGames(catalog, false)).toHaveLength(2);
  });
});
