import { defineConfig } from "vitest/config";

const exclude = ["**/node_modules/**", "**/.next/**", "**/.next-*/**", "**/e2e/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["**/*.test.ts"],
          exclude: [...exclude, "**/*.int.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["**/*.int.test.ts"],
          exclude,
          environment: "node",
          globalSetup: ["./packages/core/src/testing/global-setup.ts"],
          setupFiles: ["./packages/core/src/testing/setup-file.ts"],
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
