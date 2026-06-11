import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests hit a live local Supabase; skip unless explicitly opted in.
    exclude: runIntegration ? [] : ["tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Thresholds are scoped to the webhook ingest code this phase hardens.
      include: ["lib/webhooks/**", "app/api/webhooks/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
