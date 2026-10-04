#!/usr/bin/env node
// NFR-3: report the shell's built web bundle and fail if it exceeds the budget.
// The web assets are only part of the installed app size; the native shell adds the
// rest and is measured on device builds (docs/runbooks/mobile-builds.md).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "apps/shell/dist");
const TOTAL_BUDGET = 20 * 1024 * 1024; // web assets inside the 150 MB app budget
const INITIAL_JS_GZIP_BUDGET = 150 * 1024; // keeps cold start fast (NFR-1)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(dist);
} catch {
  console.error("check_bundle_size: apps/shell/dist not found; run `pnpm build` first");
  process.exit(1);
}
const total = files.reduce((n, f) => n + statSync(f).size, 0);
const html = readFileSync(join(dist, "index.html"), "utf8");
const entryScripts = [...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g)].map((m) => m[1]);
const initialGzip = entryScripts.reduce(
  (n, s) => n + gzipSync(readFileSync(join(dist, s))).length,
  0,
);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`check_bundle_size: total ${kb(total)} in ${files.length} files`);
console.log(
  `check_bundle_size: initial JS (gzip) ${kb(initialGzip)} [${entryScripts.map((s) => relative(".", s)).join(", ")}]`,
);
if (total > TOTAL_BUDGET || initialGzip > INITIAL_JS_GZIP_BUDGET) {
  console.error(
    `check_bundle_size: over budget (total ≤ ${kb(TOTAL_BUDGET)}, initial JS gzip ≤ ${kb(INITIAL_JS_GZIP_BUDGET)})`,
  );
  process.exit(1);
}
