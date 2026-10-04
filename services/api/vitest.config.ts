import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Test-only values; real secrets are set with `wrangler secret put` (SEC-2).
          bindings: {
            TEST_MIGRATIONS: migrations,
            TURNSTILE_SECRET: "test-turnstile-secret",
            ACCESS_AUD: "test-access-aud",
            HASH_PEPPER: "test-pepper",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
