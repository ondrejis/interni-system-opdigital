import { describe, expect, it } from "vitest";
import type { ModuleManifest, TerminalWidgetDef } from "../modules/manifest";
import { clientConfigSchema } from "../config/schema";
import {
  DEFAULT_TERMINAL_SETTINGS,
  mergeTerminalConfig,
  migrateTerminalSettings,
  terminalConfigSchema,
} from "./config";
import {
  CORE_TERMINAL_WIDGETS,
  bottomTiles,
  collectTerminalWidgets,
  isTerminalOnlyRole,
  resolveTerminalTiles,
  terminalCommandAllowed,
  validateTerminalSetup,
  visibleTerminalTiles,
} from "./resolve";

const w = (key: string, extra: Partial<TerminalWidgetDef> = {}): TerminalWidgetDef => ({
  key,
  label: key,
  description: `popis ${key}`,
  icon: "clock",
  ...extra,
});

const DEFS: TerminalWidgetDef[] = [
  ...CORE_TERMINAL_WIDGETS,
  w("dochazka.clock", { permission: "dochazka.own", commands: ["dochazka.clock.in"], page: true }),
  w("zakazky.today", { permission: "zakazky.read", page: true }),
  w("sklad.issue", { permission: "sklad.issue", commands: ["sklad.post"], page: true }),
  w("stroje.fleet", { permission: ["stroje.log", "stroje.read"], page: true }),
  w("realizace.report", { permission: "realizace.write", defaultEnabled: false }),
];
const cfg = (tiles: { widget: string; enabled?: boolean; label?: string }[]) => ({
  tiles: tiles.map((t) => ({ enabled: true, ...t })),
});
const keys = (t: { key: string }[]) => t.map((x) => x.key);

describe("registr dlaždic terminálu", () => {
  it("pořadí určuje konfigurace, ostatní dlaždice se přidají na konec v pořadí modulů", () => {
    const tiles = resolveTerminalTiles(
      DEFS,
      cfg([{ widget: "sklad.issue" }, { widget: "dochazka.clock" }]),
    );
    expect(keys(tiles).slice(0, 2)).toEqual(["sklad.issue", "dochazka.clock"]);
    expect(keys(tiles)).toEqual([
      "sklad.issue",
      "dochazka.clock",
      "core.tasks",
      "zakazky.today",
      "stroje.fleet",
      "realizace.report",
    ]);
  });

  it("dlaždice z konfigurace, jejíž modul není zapnutý, se přeskočí (bez chyby)", () => {
    const tiles = resolveTerminalTiles(
      DEFS.filter((d) => !d.key.startsWith("sklad.")),
      cfg([{ widget: "sklad.issue" }, { widget: "dochazka.clock" }]),
    );
    expect(keys(tiles)).not.toContain("sklad.issue");
    expect(keys(tiles)[0]).toBe("dochazka.clock");
  });

  it("vypnutá dlaždice a dlaždice s defaultEnabled false jsou vypnuté, přejmenování se projeví", () => {
    const tiles = resolveTerminalTiles(
      DEFS,
      cfg([
        { widget: "dochazka.clock", label: "  Píchačka  " },
        { widget: "zakazky.today", enabled: false },
      ]),
    );
    expect(tiles.find((t) => t.key === "dochazka.clock")).toMatchObject({
      label: "Píchačka",
      defaultLabel: "dochazka.clock",
    });
    expect(tiles.find((t) => t.key === "zakazky.today")!.enabled).toBe(false);
    expect(tiles.find((t) => t.key === "realizace.report")!.enabled).toBe(false);
  });

  it("duplicitní klíč v konfiguraci se použije jen jednou", () => {
    const tiles = resolveTerminalTiles(DEFS, {
      tiles: [
        { widget: "core.tasks", enabled: true },
        { widget: "core.tasks", enabled: false },
      ],
    });
    expect(keys(tiles).filter((k) => k === "core.tasks")).toHaveLength(1);
    expect(tiles.find((t) => t.key === "core.tasks")!.enabled).toBe(true);
  });

  it("uživatel vidí jen zapnuté dlaždice, na které má oprávnění", () => {
    const can = (perms: string[]) => (p: string) => perms.includes(p);
    const config = cfg([{ widget: "zakazky.today", enabled: false }]);
    const worker = visibleTerminalTiles(DEFS, config, can(["dochazka.own", "sklad.issue"]));
    expect(keys(worker)).toEqual(["core.tasks", "dochazka.clock", "sklad.issue"]);
    // stačí kterékoli z uvedených oprávnění
    expect(keys(visibleTerminalTiles(DEFS, config, can(["stroje.read"])))).toContain(
      "stroje.fleet",
    );
    // bez oprávnění jen dlaždice platformy
    expect(keys(visibleTerminalTiles(DEFS, config, can([])))).toEqual(["core.tasks"]);
  });

  it("příkaz smí z terminálu jen tehdy, když ho deklaruje viditelná dlaždice", () => {
    const tiles = visibleTerminalTiles(DEFS, cfg([]), (p) => p === "dochazka.own");
    expect(terminalCommandAllowed(tiles, "dochazka.clock.in")).toBe(true);
    expect(terminalCommandAllowed(tiles, "core.tasks.complete")).toBe(true);
    // dlaždice sklad.issue bez oprávnění není vidět, jeho příkaz tedy neprojde
    expect(terminalCommandAllowed(tiles, "sklad.post")).toBe(false);
    expect(terminalCommandAllowed(tiles, "zakazky.budget.save")).toBe(false);
  });

  it("spodní lišta má nejvýš tři dlaždice s vlastní obrazovkou (s Dnes a Více pět položek)", () => {
    const tiles = visibleTerminalTiles(DEFS, cfg([]), () => true);
    const bottom = bottomTiles(tiles);
    expect(bottom).toHaveLength(3);
    expect(bottom.every((t) => t.page)).toBe(true);
    expect(keys(bottom)).toEqual(keys(tiles.filter((t) => t.page).slice(0, 3)));
  });

  it("collectTerminalWidgets: platforma plus zapnuté moduly", () => {
    const mods = [{ terminalWidgets: [w("a.x")] }, {}, { terminalWidgets: [w("b.y"), w("b.z")] }];
    expect(keys(collectTerminalWidgets(mods))).toEqual(["core.tasks", "a.x", "b.y", "b.z"]);
  });
});

describe("role jen pro terminál", () => {
  it("zamyká jen role z konfigurace a jen když je terminál zapnutý", () => {
    const on = { enabled: true, roles: ["worker"] };
    expect(isTerminalOnlyRole(on, "worker")).toBe(true);
    expect(isTerminalOnlyRole(on, "foreman")).toBe(false);
    expect(isTerminalOnlyRole(on, null)).toBe(false);
    expect(isTerminalOnlyRole({ ...on, enabled: false }, "worker")).toBe(false);
  });
});

describe("konfigurace terminálu v config.ts", () => {
  const base = {
    slug: "x",
    branding: { name: "Firma", shortName: "Firma", accentColor: "#2563eb" },
    modules: ["kontakty"],
  };

  it("výchozí hodnoty jsou rozumné a konfigurace klienta je volitelná", () => {
    const c = clientConfigSchema.parse(base);
    expect(c.terminal.enabled).toBe(true);
    expect(c.terminal.roles).toEqual(["worker"]);
    expect(c.terminal.tiles.map((t) => t.widget)).toContain("dochazka.clock");
    expect(c.terminal.attendance).toEqual({
      requireJob: false,
      allowJobChange: true,
      showHours: true,
    });
    expect(c.terminal.diary.requirePhoto).toBe(false);
  });

  it("neplatné hodnoty se odmítnou", () => {
    const bad = (terminal: unknown) => clientConfigSchema.safeParse({ ...base, terminal }).success;
    expect(bad({ roles: ["owner"] })).toBe(false); // majitel nesmí být jen v terminálu
    expect(bad({ tiles: [{ widget: "bez-tecky" }] })).toBe(false);
    expect(bad({ tiles: [{ widget: "a.b" }, { widget: "a.b" }] })).toBe(false);
    expect(bad({ tiles: [{ widget: "a.b", label: "" }] })).toBe(false);
    expect(bad({ attendance: { requireJob: "ano" } })).toBe(false);
    expect(bad({ neznama: true })).toBe(false);
    expect(
      bad({
        tiles: [{ widget: "a.b", enabled: false, label: "Jiný" }],
        roles: ["worker", "foreman"],
      }),
    ).toBe(true);
  });

  it("sestava se kontroluje proti manifestům: neznámá dlaždice, předpona, oprávnění, příkaz", () => {
    const manifest = (id: string, widgets: TerminalWidgetDef[]) =>
      ({ id, terminalWidgets: widgets }) as unknown as ModuleManifest;
    const known = new Set(["dochazka.own"]);
    const ok = manifest("dochazka", [
      w("dochazka.clock", { permission: "dochazka.own", commands: ["dochazka.clock.in"] }),
    ]);
    expect(
      validateTerminalSetup(
        terminalConfigSchema.parse({ tiles: [{ widget: "dochazka.clock" }] }),
        [ok],
        known,
      ),
    ).toEqual([]);
    const problems = validateTerminalSetup(
      terminalConfigSchema.parse({ tiles: [{ widget: "dochazka.neexistuje" }] }),
      [
        manifest("dochazka", [
          w("jine.clock", { permission: "nic.read", commands: ["jine.cmd"] }),
          w("dochazka.clock"),
          w("dochazka.clock"),
        ]),
      ],
      known,
    );
    expect(problems.join("\n")).toContain("musí začínat „dochazka.“");
    expect(problems.join("\n")).toContain("definovaná dvakrát");
    expect(problems.join("\n")).toContain("neznámé oprávnění „nic.read“");
    expect(problems.join("\n")).toContain("dochazka.neexistuje");
  });
});

describe("nastavení správce a jeho migrace", () => {
  const base = terminalConfigSchema.parse({});

  it("null znamená výchozí z konfigurace, uložená hodnota ji přepíše", () => {
    expect(mergeTerminalConfig(base, DEFAULT_TERMINAL_SETTINGS)).toEqual(base);
    const merged = mergeTerminalConfig(base, {
      ...DEFAULT_TERMINAL_SETTINGS,
      roles: ["worker", "foreman"],
      attendance: { requireJob: true, allowJobChange: false, showHours: false },
    });
    expect(merged.roles).toEqual(["worker", "foreman"]);
    expect(merged.attendance.requireJob).toBe(true);
    expect(merged.tiles).toEqual(base.tiles);
    expect(merged.diary).toEqual(base.diary);
  });

  it("prázdné nebo nesmyslné nastavení dá výchozí hodnoty", () => {
    for (const raw of [null, undefined, "x", 5, []]) {
      expect(migrateTerminalSettings(raw)).toEqual({
        value: DEFAULT_TERMINAL_SETTINGS,
        problems: [],
      });
    }
  });

  it("aktuální verze projde beze změny", () => {
    const stored = {
      ...DEFAULT_TERMINAL_SETTINGS,
      tiles: [{ widget: "core.tasks", enabled: false, label: "Úkoly" }],
      diary: { requirePhoto: true },
    };
    expect(migrateTerminalSettings(stored)).toEqual({ value: stored, problems: [] });
  });

  it("starší tvar bez verze (seznam klíčů a skryté dlaždice) se převede na aktuální", () => {
    const { value, problems } = migrateTerminalSettings({
      order: ["sklad.issue", "dochazka.clock", "core.tasks"],
      hidden: ["core.tasks"],
    });
    expect(problems).toEqual([]);
    expect(value.tiles).toEqual([
      { widget: "sklad.issue", enabled: true },
      { widget: "dochazka.clock", enabled: true },
      { widget: "core.tasks", enabled: false },
    ]);
    expect(value.version).toBe(1);
  });

  it("novější verze a poškozené položky nesrazí terminál: zahodí se jen to, co je špatně", () => {
    const newer = migrateTerminalSettings({ version: 99, tiles: [] });
    expect(newer.value).toEqual(DEFAULT_TERMINAL_SETTINGS);
    expect(newer.problems[0]).toContain("novější verze");

    const broken = migrateTerminalSettings({
      version: 1,
      roles: ["worker"],
      tiles: [{ widget: "bez-tecky" }],
      attendance: { requireJob: "ano" },
    });
    expect(broken.value.roles).toEqual(["worker"]);
    expect(broken.value.tiles).toBeNull();
    expect(broken.value.attendance).toBeNull();
    expect(broken.problems).toHaveLength(2);
  });
});
