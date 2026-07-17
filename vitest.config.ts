import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["engine/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["engine/src/**/*.ts"],
      exclude: ["engine/src/index.ts"],
    },
  },
});
