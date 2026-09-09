import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure modules run on node; component and hook tests opt into jsdom
    // with a `// @vitest-environment jsdom` pragma at the top of the file.
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
