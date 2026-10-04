import { defineConfig } from "vite";

// Multi-page static build: no framework, no runtime dependencies beyond @itg/contracts.
export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: "index.html",
        privacy: "privacy.html",
        support: "support.html",
        terms: "terms.html",
        unsubscribe: "unsubscribe.html",
      },
    },
  },
  preview: { port: 4173, strictPort: true },
});
