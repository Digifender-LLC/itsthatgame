#!/usr/bin/env node
// FR-GAME-2 / RULE-9: every releasable catalog game must have a game package and a
// committed ORIGINALITY.md and QA.md. Also checks slug uniqueness and that each
// catalog slug matches its package's exported SLUG.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "apps/shell/src/catalog.json"), "utf8"));
const errors = [];
const seen = new Set();

for (const game of catalog.games) {
  if (seen.has(game.slug)) errors.push(`duplicate slug ${game.slug}`);
  seen.add(game.slug);
  const dir = join(root, "games", game.slug);
  if (!existsSync(join(dir, "package.json"))) {
    errors.push(`${game.slug}: no package at games/${game.slug}`);
    continue;
  }
  const src = readFileSync(join(dir, "src/index.ts"), "utf8");
  if (!src.includes(`SLUG = "${game.slug}"`))
    errors.push(`${game.slug}: src/index.ts SLUG does not match`);
  if (game.releasable) {
    for (const f of ["ORIGINALITY.md", "QA.md", "README.md", "ASSETS.md"]) {
      if (!existsSync(join(dir, f))) errors.push(`${game.slug}: releasable but missing ${f}`);
    }
  }
}

const free = catalog.games.filter((g) => g.tier === "free").length;
if (errors.length) {
  console.error(`check_catalog: ${errors.length} problem(s)`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log(`check_catalog: OK (${catalog.games.length} games, ${free} free)`);
