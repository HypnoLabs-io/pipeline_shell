import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws unless bundled for React Server Components. Tests import lib/ directly.
      "server-only": path.join(root, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["vitest.setup.ts"],
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
