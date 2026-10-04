// Catalog service (SDD §2, LLD §4): validates the bundled manifest, maps slugs to
// code-split game modules, and computes the "New" badge (RULE-12).
import { gameSlug } from "@itg/contracts";
import type { GameFactory } from "@itg/game-sdk";
import manifest from "./catalog.json";

export type Tier = "free" | "premium";

export interface CatalogGame {
  slug: string;
  title: string;
  tier: Tier;
  addedInVersion: string;
  releasable: boolean;
  /**
   * `drawn:<key>` renders a CSS/SVG icon drawn by the shell (components/GameIcon.tsx);
   * any other value is treated as an image path relative to the app root.
   */
  icon: string;
  module: string;
}

export interface Catalog {
  schemaVersion: 1;
  games: CatalogGame[];
}

export type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; errors: string[] };

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const KEYS = ["slug", "title", "tier", "addedInVersion", "releasable", "icon", "module"] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Pure manifest validator (LLD §4 rules). Reusable from repo scripts and CI.
 * `knownModules`, when given, must contain every entry's `module`.
 */
export function validateCatalog(json: unknown, knownModules?: readonly string[]): CatalogResult {
  const errors: string[] = [];
  if (!isObject(json)) return { ok: false, errors: ["manifest must be an object"] };
  if (json.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(json.games))
    return { ok: false, errors: [...errors, "games must be an array"] };

  const seen = new Set<string>();
  json.games.forEach((g: unknown, i: number) => {
    const at = `games[${i}]`;
    if (!isObject(g)) {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const key of Object.keys(g)) {
      if (!(KEYS as readonly string[]).includes(key)) errors.push(`${at}.${key} is not allowed`);
    }
    if (typeof g.slug !== "string" || !gameSlug.safeParse(g.slug).success) {
      errors.push(`${at}.slug must match ^[a-z0-9-]{3,40}$`);
    } else if (seen.has(g.slug)) {
      errors.push(`${at}.slug "${g.slug}" is duplicated`);
    } else {
      seen.add(g.slug);
    }
    if (typeof g.title !== "string" || g.title.trim().length === 0 || g.title.length > 40) {
      errors.push(`${at}.title must be 1-40 characters`);
    }
    if (g.tier !== "free" && g.tier !== "premium") errors.push(`${at}.tier must be free|premium`);
    if (typeof g.addedInVersion !== "string" || !SEMVER.test(g.addedInVersion)) {
      errors.push(`${at}.addedInVersion must be semver`);
    }
    if (typeof g.releasable !== "boolean") errors.push(`${at}.releasable must be a boolean`);
    if (typeof g.icon !== "string" || g.icon.length === 0) errors.push(`${at}.icon is required`);
    if (typeof g.module !== "string" || g.module.length === 0) {
      errors.push(`${at}.module is required`);
    } else if (knownModules && !knownModules.includes(g.module)) {
      errors.push(`${at}.module "${g.module}" has no game package`);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, catalog: json as unknown as Catalog };
}

/** Code-split loaders: each game becomes its own chunk, loaded only on launch (NFR-1). */
export const GAME_MODULES: Record<string, () => Promise<{ default: GameFactory }>> = {
  "ring-sort": () => import("@itg/game-ring-sort"),
  "pin-drop": () => import("@itg/game-pin-drop"),
  "tile-trio": () => import("@itg/game-tile-trio"),
  "stack-up": () => import("@itg/game-stack-up"),
  "park-out": () => import("@itg/game-park-out"),
  "merge-drop": () => import("@itg/game-merge-drop"),
  "paint-path": () => import("@itg/game-paint-path"),
  untangle: () => import("@itg/game-untangle"),
};

function majorMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/** RULE-12: added in the installed major.minor and not yet opened (`seen:<slug>` unset). */
export function isNew(game: CatalogGame, appVersion: string, seen: boolean): boolean {
  return !seen && majorMinor(game.addedInVersion) === majorMinor(appVersion);
}

export const seenKey = (slug: string): string => `seen:${slug}`;

/** RULE-9: release builds list only releasable entries. */
export function visibleGames(catalog: Catalog, releaseBuild: boolean): CatalogGame[] {
  return releaseBuild ? catalog.games.filter((g) => g.releasable) : catalog.games;
}

/** Validates the bundled manifest; throws at startup if it is broken. */
export function loadCatalog(): Catalog {
  const result = validateCatalog(manifest, Object.keys(GAME_MODULES));
  if (!result.ok) throw new Error(`Invalid catalog.json:\n${result.errors.join("\n")}`);
  return result.catalog;
}
