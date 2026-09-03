import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    // Tests run sequentially against a real Postgres database (no
    // mocking), so avoid parallel workers stepping on shared rows.
    fileParallelism: false,
  },
});
