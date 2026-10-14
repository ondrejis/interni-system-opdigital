import { defineConfig } from "vitest/config";

// `_donor` = kód odstraněných a přepracovaných modulů jako zdroj pro nové agenty; mimo workspace, netestuje se
const exclude = ["**/node_modules/**", "**/.next/**", "**/e2e/**", "**/_donor/**"];

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
