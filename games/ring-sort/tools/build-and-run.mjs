// Bundles tools/generate-levels.ts with the repo's esbuild and runs it with node.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = new URL("../../..", import.meta.url).pathname;
const pnpmDir = join(root, "node_modules/.pnpm");
const esbuildDir = readdirSync(pnpmDir).find((d) => d.startsWith("esbuild@"));
const esbuildPath = require.resolve("esbuild", {
  paths: [join(pnpmDir, esbuildDir, "node_modules")],
});
const { buildSync } = await import(esbuildPath);
const dir = mkdtempSync(join(tmpdir(), "ring-sort-gen-"));
const outfile = join(dir, "gen.mjs");
buildSync({
  entryPoints: [new URL("./generate-levels.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  define: { "import.meta.url": JSON.stringify(new URL("../tools/x", import.meta.url).href) },
});
execFileSync("node", [outfile, ...process.argv.slice(2)], { stdio: "inherit" });
