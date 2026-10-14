import fs from "node:fs";
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import docsPlugin from "./scripts/docs/eslint-plugin.mjs";

// Moduly se zjišťují ze složky packages/modules (smazání modulu nesmí shodit lint).
const MODULES = fs
  .readdirSync(new URL("./packages/modules/", import.meta.url), { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(new URL(`./packages/modules/${d.name}/package.json`, import.meta.url)),
  )
  .map((d) => d.name)
  .sort();

// Modul smí importovat jen moduly, na kterých výslovně závisí (dependencies v package.json = dependsOn v manifestu; hlídá test).
const moduleDeps = (m) =>
  Object.keys(
    JSON.parse(
      fs.readFileSync(new URL(`./packages/modules/${m}/package.json`, import.meta.url), "utf8"),
    ).dependencies ?? {},
  )
    .filter((d) => d.startsWith("@rebar/") && !["@rebar/core", "@rebar/ui"].includes(d))
    .map((d) => d.slice("@rebar/".length));

const layer = (files, allowed, message) => ({
  files,
  rules: {
    "no-restricted-imports": [
      "error",
      { patterns: [{ group: ["@rebar/*", ...allowed.map((a) => `!@rebar/${a}`)], message }] },
    ],
  },
});

export default defineConfig(
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "apps/web/public/**",
    "**/dist/**",
    "**/next-env.d.ts",
    "**/test-results/**",
    "**/test-results-crawl/**",
    "**/playwright-report/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Vrstvy: jádro nezná nic, UI zná jen jádro, modul zná jen jádro a UI (spolupráce modulů jde přes sloty a události).
  layer(["packages/core/**"], [], "Jádro nesmí záviset na UI, modulech ani aplikaci."),
  layer(["packages/ui/**"], ["core"], "UI smí záviset jen na jádru."),
  ...MODULES.map((m) =>
    layer(
      [`packages/modules/${m}/**`],
      ["core", "ui", ...moduleDeps(m)],
      "Modul smí záviset jen na @rebar/core, @rebar/ui a modulech, na kterých výslovně závisí (dependsOn). Spolupráce ostatních modulů jde přes sloty a události.",
    ),
  ),
  // Dokumentace z kódu: exportované funkce, třídy a typy mají mít JSDoc s popisem; staré výjimky jsou v docs/jsdoc-baseline.json
  // (ratchet, smí se jen zmenšovat). Testy se nekontrolují, React komponenty a konstanty se nevyžadují (ADR 022).
  {
    files: [
      "packages/core/src/**/*.{ts,tsx}",
      "packages/modules/*/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
    plugins: { docs: docsPlugin },
    rules: { "docs/exported-description": "error" },
  },
);
