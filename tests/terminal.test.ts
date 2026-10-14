import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_IDS, collectPermissions, resolveModules } from "@rebar/core";
import {
  BOTTOM_TILE_LIMIT,
  CORE_TERMINAL_WIDGETS,
  bottomTiles,
  collectTerminalWidgets,
  validateTerminalSetup,
  visibleTerminalTiles,
} from "@rebar/core/terminal";
import { ALL_MODULES } from "../apps/web/src/modules";
import { MODULE_UI } from "../apps/web/src/modules-ui";
import { collectServers } from "../apps/web/src/server/modules-server";
import defaultTemplate from "../clients/_template/config";
import demo from "../clients/demo/config";

const root = path.resolve(import.meta.dirname, "..");
const permissions = new Set(collectPermissions(ALL_MODULES).map((p) => p.key));

describe("dlaždice terminálu v modulech", () => {
  const defs = collectTerminalWidgets(ALL_MODULES);

  it("každá dlaždice z manifestu má UI v modulu a každé UI dlaždice má manifest", () => {
    for (const m of ALL_MODULES) {
      const declared = (m.terminalWidgets ?? []).map((w) => w.key).sort();
      const rendered = Object.keys(MODULE_UI[m.id]?.terminalWidgets ?? {}).sort();
      expect(rendered, `modul ${m.id}`).toEqual(declared);
    }
  });

  it("dlaždice platformy má UI v aplikaci", () => {
    const host = fs.readFileSync(
      path.join(root, "apps/web/src/app/(terminal)/t/widget-host.tsx"),
      "utf8",
    );
    for (const w of CORE_TERMINAL_WIDGETS) expect(host, w.key).toContain(`"${w.key}"`);
  });

  it("klíče jsou unikátní, s předponou modulu, a odkazují na existující oprávnění a příkazy", () => {
    const collected = collectServers(ALL_MODULES);
    const seen = new Set<string>();
    for (const m of ALL_MODULES) {
      for (const w of m.terminalWidgets ?? []) {
        expect(seen.has(w.key), `duplicitní ${w.key}`).toBe(false);
        seen.add(w.key);
        expect(w.key.startsWith(`${m.id}.`), w.key).toBe(true);
        for (const p of [w.permission ?? []].flat())
          expect(permissions.has(p), `${w.key}: oprávnění ${p}`).toBe(true);
        for (const c of w.commands ?? []) {
          expect(c.startsWith(`${m.id}.`), `${w.key}: příkaz ${c}`).toBe(true);
          expect(collected.commands.has(c), `${w.key}: příkaz ${c} neexistuje`).toBe(true);
        }
        expect(w.label.length).toBeLessThanOrEqual(40);
      }
    }
    for (const w of CORE_TERMINAL_WIDGETS)
      for (const c of w.commands ?? [])
        expect(collected.commands.has(c), `${w.key}: příkaz ${c}`).toBe(true);
  });

  it("texty dlaždic neobsahují interní název jádra", () => {
    for (const w of defs) expect(`${w.label} ${w.description}`, w.key).not.toMatch(/rebar/i);
  });

  it("příkazy dlaždic nikdy nevrací ceny: dlaždice terminálu nesmí vyžadovat ekonomiku zakázky", () => {
    const economy = new Set([
      "zakazky.economics",
      "zakazky.budget",
      "zakazky.approve",
      "fakturace.read",
    ]);
    for (const w of defs)
      for (const p of [w.permission ?? []].flat()) expect(economy.has(p), w.key).toBe(false);
  });

  it("spodní lišta má při všech zapnutých modulech nejvýš pět položek včetně Dnes a Více", () => {
    const tiles = visibleTerminalTiles(defs, { tiles: [] }, () => true);
    expect(2 + bottomTiles(tiles).length).toBeLessThanOrEqual(5);
    expect(bottomTiles(tiles).length).toBeLessThanOrEqual(BOTTOM_TILE_LIMIT);
  });

  it("vypnutý modul nezanechá v terminálu stopu", () => {
    const without = resolveModules(
      MODULE_IDS.filter((id) => id !== "sklad" && id !== "stroje"),
      ALL_MODULES,
    );
    const keys = collectTerminalWidgets(without).map((w) => w.key);
    expect(keys.some((k) => k.startsWith("sklad.") || k.startsWith("stroje."))).toBe(false);
    expect(keys).toContain("dochazka.clock");
  });
});

describe("konfigurace terminálu klientů", () => {
  for (const [name, config] of [
    ["clients/_template", defaultTemplate],
    ["clients/demo", demo],
  ] as const) {
    it(`${name}: dlaždice existují, oprávnění a příkazy sedí`, () => {
      expect(validateTerminalSetup(config.terminal, ALL_MODULES, permissions)).toEqual([]);
    });
  }

  it("demo a šablona používají terminál pro roli worker", () => {
    expect(demo.terminal.roles).toEqual(["worker"]);
    expect(defaultTemplate.terminal.roles).toContain("worker");
  });
});

describe("kancelářské stránky jsou zavřené roli jen pro terminál", () => {
  // Stránky v `(app)` volají `requireCtx`/`requireCan`, které roli jen pro terminál přesměrují na /t. Stránka bez nich by ji
  // pustila dál, proto se hlídá, že žádná nechybí (a že výjimky jsou jen stránky vlastního účtu).
  const appDir = path.join(root, "apps/web/src/app/(app)");
  const pages: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") pages.push(p);
    }
  })(appDir);

  it("každá stránka (app) kontroluje přihlášení přes requireCtx nebo requireCan", () => {
    expect(pages.length).toBeGreaterThan(10);
    const missing = pages.filter((p) => !/requireC(tx|an)\(/.test(fs.readFileSync(p, "utf8")));
    expect(missing.map((p) => path.relative(appDir, p))).toEqual([]);
  });

  it("jen stránky vlastního účtu pouštějí roli jen pro terminál (allowTerminalOnly)", () => {
    const allowed = pages
      .filter((p) => /allowTerminalOnly:\s*true/.test(fs.readFileSync(p, "utf8")))
      .map((p) => path.relative(appDir, p).split(path.sep).join("/"))
      .sort();
    expect(allowed).toEqual([
      "nastaveni/ucet/page.tsx",
      "nastaveni/upozorneni/page.tsx",
      "nastaveni/zabezpeceni/page.tsx",
    ]);
  });
});
