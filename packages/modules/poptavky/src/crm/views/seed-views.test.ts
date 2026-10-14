import { describe, expect, it } from "vitest";
import {
  OPERATORS_BY_TYPE,
  VALUELESS_OPERATORS,
  type Condition,
  type FilterGroup,
} from "@rebar/core/shared";
import { jobEntity } from "@rebar/zakazky/server";
import { CRM_VIEWS } from "./seed-views";
import { DEAL_QUICK_CONDITIONS } from "./quick-conditions";
import { DEAL_LIST_DEFAULT_FILTER } from "./logic";

const attrs = new Map(jobEntity.attributes.map((a) => [a.key, a]));

function conditions(g: FilterGroup | undefined): Condition[] {
  return (g?.conditions ?? []).flatMap((c) => ("conditions" in c ? conditions(c) : [c]));
}

/** Podmínka musí odkazovat na existující atribut, povolený operátor tohoto typu a mít hodnotu, když ji operátor chce. */
function check(c: Condition, where: string) {
  const a = attrs.get(c.attr);
  expect(a, `${where}: atribut ${c.attr}`).toBeDefined();
  expect(OPERATORS_BY_TYPE[a!.type], `${where}: ${c.attr} ${c.op}`).toContain(c.op);
  expect(a!.filterable, `${where}: ${c.attr} je filtrovatelný`).not.toBe(false);
  if (!VALUELESS_OPERATORS.includes(c.op))
    expect(c.value, `${where}: hodnota ${c.attr}`).not.toBeUndefined();
}

describe("výchozí pohledy CRM (seed)", () => {
  it("obsahují pohledy ze zadání a čištění dat", () => {
    const names = CRM_VIEWS.map((v) => v.name);
    for (const n of [
      "Moje otevřené",
      "Bez další aktivity",
      "Zhnilé",
      "Uzavření tento měsíc",
      "Prohrané za čtvrtletí",
    ])
      expect(names).toContain(n);
    expect(names.filter((n) => n.startsWith("Čištění:"))).toHaveLength(3);
    expect(new Set(names).size).toBe(names.length);
    for (const v of CRM_VIEWS) expect(v.name.length).toBeLessThanOrEqual(60);
  });

  it("odkazují jen na existující atributy zakázky a povolené operátory", () => {
    for (const v of CRM_VIEWS) {
      expect(v.entityType).toBe("job");
      for (const c of conditions(v.config.filters as FilterGroup | undefined)) check(c, v.name);
      for (const k of [...(v.config.columns ?? []), ...(v.config.sort ?? []).map((s) => s.attr)])
        expect(attrs.has(k), `${v.name}: sloupec nebo řazení ${k}`).toBe(true);
    }
  });

  it("pohledy otevřených obchodů nepočítají archivované", () => {
    for (const v of CRM_VIEWS.filter((x) => !x.name.startsWith("Prohrané"))) {
      const archived = conditions(v.config.filters as FilterGroup | undefined).find(
        (c) => c.attr === "crmArchivedAt",
      );
      expect(archived, v.name).toMatchObject({ op: "empty" });
    }
  });

  it("navržené podmínky a výchozí filtr seznamu jsou platné", () => {
    for (const q of DEAL_QUICK_CONDITIONS)
      check({ ...q.condition, value: q.condition.value ?? 0 }, q.id);
    for (const c of conditions(DEAL_LIST_DEFAULT_FILTER)) check(c, "výchozí filtr");
    expect(new Set(DEAL_QUICK_CONDITIONS.map((q) => q.id)).size).toBe(DEAL_QUICK_CONDITIONS.length);
  });
});
