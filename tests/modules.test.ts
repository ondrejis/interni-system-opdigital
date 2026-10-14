import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_IDS } from "@rebar/core";
import { ALL_MODULES } from "../apps/web/src/modules";
import { MODULE_UI } from "../apps/web/src/modules-ui";
import { COMMAND_PREFIXES, collectServers } from "../apps/web/src/server/modules-server";

describe("moduly jsou zapojené do aplikace", () => {
  const collected = collectServers(ALL_MODULES);

  it("každá entita deklarovaná v manifestu je v registru entit (modul není zapomenutý v modules-server.ts)", () => {
    const keys = new Set(collected.entities.map((e) => e.key));
    for (const m of ALL_MODULES) {
      for (const entity of m.entities ?? [])
        expect(keys.has(entity), `${m.id}: entita „${entity}“`).toBe(true);
    }
  });

  it("entity patří modulu, který je dodává, a mají unikátní klíč i adresu seznamu", () => {
    const keys = collected.entities.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    const paths = collected.entities.map((e) => e.listPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const e of collected.entities) {
      const owner = ALL_MODULES.find((m) => m.id === e.module);
      expect(owner?.entities).toContain(e.key);
    }
  });

  it("každá stránka modulu z manifestu má vykreslení v UI modulu a nepřekrývá adresu entity", () => {
    const entityPaths = collected.entities.map((e) => e.listPath);
    for (const m of ALL_MODULES) {
      for (const page of m.pages ?? []) {
        const rendered = MODULE_UI[m.id]?.pages?.some((p) => p.path === page.path);
        expect(rendered, `${m.id}: stránka ${page.path}`).toBe(true);
        expect(entityPaths).not.toContain(page.path);
      }
    }
  });

  it("každý modul z MODULE_IDS má balíček s exporty ., ./schema, ./server, ./ui a ./api a sdílená místa v apps/web", () => {
    const root = path.resolve(import.meta.dirname, "..");
    for (const id of MODULE_IDS) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(root, "packages/modules", id, "package.json"), "utf8"),
      ) as { name: string; exports: Record<string, string> };
      expect(pkg.name).toBe(`@rebar/${id}`);
      for (const key of [".", "./schema", "./server", "./ui", "./api"])
        expect(pkg.exports[key], `${id}: export ${key}`).toBeTruthy();
      expect(MODULE_UI[id], `${id}: UI v MODULE_UI`).toBeTruthy();
      expect(
        ALL_MODULES.some((m) => m.id === id),
        `${id}: manifest v ALL_MODULES`,
      ).toBe(true);
    }
  });

  it("příkazy mají předponu modulu a oprávnění z katalogu", () => {
    const permissions = new Set(ALL_MODULES.flatMap((m) => m.permissions.map((p) => p.key)));
    for (const [name, cmd] of collected.commands) {
      const prefix = name.split(".")[0];
      // další předpony modulů jsou v `COMMAND_PREFIXES`; `core.*` jsou příkazy platformy, ne modulu
      expect([
        ...MODULE_IDS,
        "core",
        ...Object.values(COMMAND_PREFIXES).flat(),
      ] as readonly string[]).toContain(prefix);
      for (const key of [cmd.permission ?? []].flat()) {
        expect(
          permissions.has(key) || ["settings.manage", "users.manage", "roles.manage"].includes(key),
          `${name}: oprávnění ${key}`,
        ).toBe(true);
      }
    }
  });
});

describe("rozhraní modulů se dá sestavit pro prohlížeč", () => {
  it("manifesty modulů importují z @rebar/core/manifest (kořen jádra táhne zod, ~90 kB gzip, do každé stránky)", () => {
    const dir = path.resolve(import.meta.dirname, "../packages/modules");
    for (const m of fs.readdirSync(dir)) {
      const index = path.join(dir, m, "src", "index.ts");
      if (!fs.existsSync(index)) continue;
      expect(fs.readFileSync(index, "utf8"), m).not.toMatch(/from "@rebar\/core";/);
    }
  });

  // Produkční build selže, když se do klientského balíku dostane serverový kód (databáze, Node). Tady to zjistíme hned.
  const FORBIDDEN = [
    /^@rebar\/core\/(db|entities|module-server|rbac|audit|collab|files|jobs|numbering|pdf|auth|security|config-data|admin)$/,
    /^@rebar\/core$/, // kořen jádra táhne zod (konfigurace klienta); manifest se importuje z @rebar/core/manifest
    /^zod(\/|$)/,
    /^drizzle-orm/,
    /^node:/,
    /^postgres$/,
  ];
  const root = path.resolve(import.meta.dirname, "../packages/modules");

  function importsOf(file: string): string[] {
    const src = fs.readFileSync(file, "utf8");
    // `import type` / `export type` se při sestavení zahodí, do prohlížeče nic nenesou
    const out: string[] = [];
    for (const m of src.matchAll(
      /(?:import|export)\s+(type\s+)?(?:[\w*${}\s,]*?\s+from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ))
      if (!m[1]) out.push((m[2] ?? m[3])!);
    return out;
  }
  function resolveRelative(from: string, spec: string): string | null {
    const base = path.resolve(path.dirname(from), spec);
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      if (fs.existsSync(base + ext)) return base + ext;
    }
    return null;
  }

  for (const module of fs.readdirSync(root)) {
    const ui = path.join(root, module, "src", "ui.tsx");
    if (!fs.existsSync(ui)) continue;
    it(`${module}: ui.tsx a jeho importy neobsahují serverový kód`, () => {
      const seen = new Set<string>();
      const bad: string[] = [];
      const visit = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        for (const spec of importsOf(file)) {
          if (spec.startsWith(".")) {
            const next = resolveRelative(file, spec);
            if (next) visit(next);
          } else if (FORBIDDEN.some((re) => re.test(spec))) {
            bad.push(`${path.relative(root, file)} → ${spec}`);
          }
        }
      };
      visit(ui);
      expect(bad).toEqual([]);
    });
  }
});
