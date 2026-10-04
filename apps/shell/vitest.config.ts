import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: { environment: "happy-dom", include: ["src/**/*.test.{ts,tsx}"] },
});
