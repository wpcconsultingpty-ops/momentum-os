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
    // Integration tests hit a live local Supabase; skip unless explicitly opted
    // in. The global setup fails fast if the stack is unreachable.
    exclude: runIntegration ? [] : ["tests/integration/**"],
    globalSetup: runIntegration
      ? ["tests/integration/global-setup.ts"]
      : [],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Unit mode hardens the webhook ingest surface; integration mode widens
      // coverage to the SSR helpers, auth routes, and dashboard server actions
      // that can only be exercised against a real Supabase + RLS.
      include: runIntegration
        ? [
            "lib/**",
            "app/auth/**",
            "app/dashboard/**/actions.ts",
            "app/api/webhooks/**",
          ]
        : ["lib/webhooks/**", "app/api/webhooks/**"],
      // Lower branches in integration mode: Next.js cookie/redirect code paths
      // are hard to fully exercise from a test harness.
      thresholds: runIntegration
        ? { lines: 75, functions: 80, branches: 65, statements: 75 }
        : { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
