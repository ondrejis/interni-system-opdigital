import { describe, expect, it } from "vitest";
import {
  availablePresets,
  parseWidget,
  presetAvailable,
  type DashboardEnv,
} from "@rebar/core/dashboards";
import { opsysDashboards } from "../../../../clients/opsys/dashboards";
import type { DashboardMetricDef } from "@rebar/core/module-server";
import type { Actor, Ctx } from "@rebar/core/rbac";
import { WIDGET_PRESETS } from "./presets";

const ctxOf = (perms: string[], unrestricted = false): Ctx => ({
  actor: {
    kind: "user",
    userId: "u1",
    roleKey: "x",
    permissions: new Map(perms.map((p) => [p, "all" as const])),
    unrestricted,
    restriction: null,
  } as Actor,
  db: {} as never,
});

const metricDef = (key: string, permissions: string[]): DashboardMetricDef => ({
  key,
  label: key,
  format: "number",
  shape: "scalar",
  permissions,
  compute: async () => ({ kind: "scalar", value: 1 }),
});

/** Prostředí se zadanými metrikami (= zapnutými moduly); registr entit je prázdný, jen „task“ jde zapnout. */
const envOf = (metrics: DashboardMetricDef[], entities: string[] = []): DashboardEnv =>
  ({
    registry: {
      get: (k: string) =>
        entities.includes(k) ? { key: k, permissions: { read: `${k}.read` } } : undefined,
      all: () => [],
    },
    deps: {} as never,
    metrics: new Map(metrics.map((m) => [m.key, m])),
    builtins: { myTasks: async () => [] },
    presets: WIDGET_PRESETS,
  }) as unknown as DashboardEnv;

describe("katalog widgetů Přehledu", () => {
  it("klíče jsou jedinečné a každý widget projde schématem nástěnky", () => {
    expect(new Set(WIDGET_PRESETS.map((p) => p.key)).size).toBe(WIDGET_PRESETS.length);
    for (const p of WIDGET_PRESETS) {
      expect(() => parseWidget({ ...p.widget, id: "w-test-1" }), p.key).not.toThrow();
    }
  });

  it("obsahuje všechny widgety MVP ze spec 00 a widgety v2", () => {
    const titles = WIDGET_PRESETS.filter((p) => p.phase === "mvp").map((p) => p.title);
    for (const t of [
      "Úkoly na dnes",
      "Pipeline v Kč",
      "Moje otevřené obchody",
      "Zakázky ve skluzu",
      "Příjmy tento měsíc",
      "Saldo vyrovnání",
      "Nezaplacené platby",
      "Poslední změny",
      "Rychlé odkazy",
      "Číslo z pohledu",
      "Seznam z pohledu",
    ])
      expect(titles).toContain(t);
    const v2 = WIDGET_PRESETS.filter((p) => p.phase === "v2").map((p) => p.title);
    for (const t of ["Nadcházející schůzky", "Leady a CPL", "Hodiny tento týden", "Expirace"])
      expect(v2).toContain(t);
    expect(v2.some((t) => t.startsWith("Retainery"))).toBe(true);
  });

  it("widget vypnutého modulu se nenabízí (metrika neexistuje)", () => {
    const owner = ctxOf([], true);
    const keys = (env: DashboardEnv) => availablePresets(owner, env).map((p) => p.key);
    expect(keys(envOf([]))).not.toContain("pipeline");
    expect(
      keys(
        envOf([
          metricDef("obchody.pipeline_total", []),
          metricDef("obchody.pipeline_weighted", []),
        ]),
      ),
    ).toContain("pipeline");
  });

  it("widget zapnutého modulu bez oprávnění se nenabízí (Expirace, Retainery z Můj prostor)", () => {
    const metrics = [
      metricDef("muj-prostor.expirations", ["muj-prostor.domains", "muj-prostor.hosting"]),
      metricDef("muj-prostor.retainers", ["muj-prostor.hosting"]),
      metricDef("finance.income_month", ["finance.read"]),
    ];
    const env = envOf(metrics);
    const partner = ctxOf(["finance.read", "prehled.read"]);
    const owner = ctxOf([], true);
    const partnerKeys = availablePresets(partner, env).map((p) => p.key);
    const ownerKeys = availablePresets(owner, env).map((p) => p.key);
    expect(partnerKeys).toContain("prijmy-mesic");
    expect(partnerKeys).not.toContain("expirace");
    expect(partnerKeys).not.toContain("hosting-prijem");
    expect(ownerKeys).toEqual(expect.arrayContaining(["expirace", "hosting-prijem"]));
  });

  it("Úkoly na dnes potřebují modul úkolů (entita task) a poskytovatele úkolů", () => {
    const p = WIDGET_PRESETS.find((x) => x.key === "ukoly-dnes")!;
    const owner = ctxOf([], true);
    expect(presetAvailable(owner, envOf([]), p)).toBe(false);
    expect(presetAvailable(owner, envOf([], ["task"]), p)).toBe(true);
    expect(presetAvailable(ctxOf([]), envOf([], ["task"]), p)).toBe(false);
  });

  it("Číslo a Seznam z pohledu a Rychlé odkazy jsou dostupné vždy (a otevřou nastavení)", () => {
    for (const key of ["cislo-z-pohledu", "seznam-z-pohledu", "rychle-odkazy"]) {
      const p = WIDGET_PRESETS.find((x) => x.key === key)!;
      expect(p.configure).toBe(true);
      expect(presetAvailable(ctxOf([]), envOf([]), p)).toBe(true);
    }
  });
});

describe("výchozí přehledy OPSYS (PRE-03)", () => {
  const seeds = opsysDashboards();
  const byKey = (k: string) => seeds.find((s) => s.key === k)!;
  const titles = (k: string) => byKey(k).definition.widgets.map((w) => w.title);

  it("owner i partner mají Den a Finance; všechny definice jsou platné", () => {
    expect(seeds.map((s) => `${s.role}:${s.name}`).sort()).toEqual([
      "owner:Den",
      "owner:Finance",
      "partner:Den",
      "partner:Finance",
    ]);
    for (const s of seeds)
      for (const w of s.definition.widgets)
        expect(() => parseWidget(w), `${s.key}/${w.id}`).not.toThrow();
  });

  it("Den obsahuje šest widgetů ze spec: úkoly, pipeline, zakázky ve skluzu, příjmy, saldo, poslední změny", () => {
    for (const k of ["owner-den", "partner-den"])
      expect(titles(k)).toEqual(
        expect.arrayContaining([
          "Úkoly na dnes",
          "Pipeline v Kč",
          "Zakázky ve skluzu",
          "Příjmy tento měsíc",
          "Saldo vyrovnání",
          "Poslední změny",
        ]),
      );
    expect(byKey("owner-den").definition.widgets).toHaveLength(6);
  });

  it("partner nemá Expirace ani Retainery z Můj prostor, owner ano", () => {
    const partner = seeds
      .filter((s) => s.role === "partner")
      .flatMap((s) => JSON.stringify(s.definition));
    expect(partner.join("")).not.toContain("muj-prostor");
    expect(JSON.stringify(byKey("owner-finance").definition)).toContain("muj-prostor.expirations");
    expect(JSON.stringify(byKey("owner-finance").definition)).toContain("muj-prostor.retainers");
  });

  it("widgety výchozích přehledů odpovídají katalogu (stejné zdroje)", () => {
    const sources = new Set(WIDGET_PRESETS.map((p) => JSON.stringify(p.widget.source)));
    for (const s of seeds)
      for (const w of s.definition.widgets) {
        // dlaždice a metriky ze seedu musí existovat v katalogu se stejným zdrojem (parametry mohou mít navíc výchozí)
        const src = w.source;
        if (src.kind === "builtin" && src.builtin === "my_tasks") continue;
        const same = [...sources].some((x) => {
          const c = JSON.parse(x) as typeof src;
          if (c.kind !== src.kind) return false;
          if (c.kind === "metric" && src.kind === "metric") return c.metric === src.metric;
          if (c.kind === "builtin" && src.kind === "builtin")
            return JSON.stringify(c.params?.tileIds) === JSON.stringify(src.params?.tileIds);
          return false;
        });
        expect(same, `${s.key}/${w.title}`).toBe(true);
      }
  });
});
