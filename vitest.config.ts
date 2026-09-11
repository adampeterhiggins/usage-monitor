import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // State-wiring regressions inspect the generated stylesheet as raw text.
    css: { include: [/index\.css\?raw$/] },
  },
});
