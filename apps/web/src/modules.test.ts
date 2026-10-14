import {
  CORE_PERMISSIONS,
  MODULE_IDS,
  collectNav,
  collectPermissions,
  resolveModules,
} from "@rebar/core";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "./modules";

describe("manifesty modulů", () => {
  it("jsou všechny moduly z MODULE_IDS, každý právě jednou", () => {
    expect(ALL_MODULES.map((m) => m.id).sort()).toEqual([...MODULE_IDS].sort());
  });

  it("klíče oprávnění mají tvar <modul>.<akce> a jsou unikátní", () => {
    const seen = new Set<string>();
    for (const m of ALL_MODULES) {
      for (const p of m.permissions) {
        expect(p.key, `${m.id}: ${p.key}`).toMatch(new RegExp(`^${m.id}\\.[a-z_]+$`));
        expect(seen.has(p.key), `duplicitní oprávnění ${p.key}`).toBe(false);
        seen.add(p.key);
      }
    }
    for (const p of CORE_PERMISSIONS) expect(seen.has(p.key)).toBe(false);
  });

  // Modul CRM má interní id `poptavky` (přejmenování je odložené, docs/CRM.md), ale adresy `/crm`.
  const ROUTE_ALIASES: Record<string, string[]> = { poptavky: ["/crm"] };

  it("položky navigace odkazují na oprávnění, která modul skutečně má", () => {
    for (const m of ALL_MODULES) {
      const own = new Set(m.permissions.map((p) => p.key));
      for (const item of m.nav) {
        const required = item.permission === undefined ? [] : [item.permission].flat();
        for (const key of required) expect(own.has(key), `${m.id}: nav → ${key}`).toBe(true);
        const prefixes = [`/${m.id}`, ...(ROUTE_ALIASES[m.id] ?? [])];
        expect(
          prefixes.some((p) => item.href.startsWith(p)),
          `${m.id}: ${item.href}`,
        ).toBe(true);
      }
    }
  });

  it("všechny moduly jdou zapnout naráz bez konfliktu závislostí", () => {
    expect(() => resolveModules([...MODULE_IDS], ALL_MODULES)).not.toThrow();
  });

  it("vypnutí zakázek vyžaduje vypnout i poptávky", () => {
    const without = MODULE_IDS.filter((id) => id !== "zakazky");
    expect(() => resolveModules(without, ALL_MODULES)).toThrow(/zakazky/);
  });

  it("sestava bez kalendáře nemá ve výsledku žádnou stopu kalendáře", () => {
    const enabled = resolveModules(
      MODULE_IDS.filter((id) => id !== "kalendar"),
      ALL_MODULES,
    );
    expect(collectNav(enabled).some((n) => n.href.startsWith("/kalendar"))).toBe(false);
    expect(collectPermissions(enabled).some((p) => p.key.startsWith("kalendar."))).toBe(false);
  });

  it("pořadí MODULE_IDS respektuje závislosti (migrace se spouští v tomto pořadí)", () => {
    for (const m of ALL_MODULES) {
      for (const dep of m.dependsOn ?? []) {
        expect(MODULE_IDS.indexOf(dep), `${m.id} závisí na ${dep}, ten musí být dřív`).toBeLessThan(
          MODULE_IDS.indexOf(m.id),
        );
      }
    }
  });

  it("závislosti v package.json modulu odpovídají dependsOn v manifestu", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    for (const m of ALL_MODULES) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(root, "packages/modules", m.id, "package.json"), "utf8"),
      ) as { dependencies?: Record<string, string> };
      const declared = Object.keys(pkg.dependencies ?? {})
        .filter((d) => d.startsWith("@rebar/") && !["@rebar/core", "@rebar/ui"].includes(d))
        .map((d) => d.slice("@rebar/".length))
        .sort();
      expect(declared, `modul ${m.id}`).toEqual([...(m.dependsOn ?? [])].sort());
    }
  });
});
