import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Each game is reached only through a dynamic import in src/catalog.ts, so Rollup emits
// one chunk per game and the initial bundle stays independent of library size (NFR-1).
export default defineConfig({
  plugins: [preact()],
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Name game chunks after their folder (games/<slug>/src/index.ts → game-<slug>-*.js).
        chunkFileNames: (chunk) => {
          const m = chunk.facadeModuleId?.match(/games\/([^/]+)\/src\/index\.ts$/);
          return m ? `assets/game-${m[1]}-[hash].js` : "assets/[name]-[hash].js";
        },
      },
    },
  },
  server: { port: 5174 },
  preview: { port: 4174 },
});
