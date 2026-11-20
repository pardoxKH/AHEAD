import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "ai-eval", include: ["src/**/*.eval.ts"], testTimeout: 300_000 },
});
