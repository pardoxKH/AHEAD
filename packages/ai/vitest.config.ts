import { configDefaults, defineProject } from "vitest/config";

export default defineProject({
  // Evals call the real API; run them with `pnpm --filter @ahead/ai eval`.
  test: { name: "ai", exclude: [...configDefaults.exclude, "**/*.eval.ts"] },
});
