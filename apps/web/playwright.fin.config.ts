import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...base,
  projects: base.projects!.map((p) =>
    p.name === "setup" ? { ...p, testMatch: /fin-auth\.setup\.ts/ } : { ...p, testIgnore: /auth\.setup\.ts/ },
  ),
});
