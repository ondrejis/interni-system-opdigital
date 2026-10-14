import { aggregateRecords, resolveEntity } from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import { defineDashboardMetric } from "@rebar/core/module-server";

/** Pojmenované metriky nástěnek modulu Sklad. */
export const dashboardMetrics = [
  defineDashboardMetric({
    key: "sklad.stock_value",
    label: "Hodnota skladu",
    description:
      "Součet hodnoty zásob aktivních skladových karet (množství × vážená nákupní cena bez DPH). Vyžaduje právo spravovat sklad, protože nákupní ceny ostatní nevidí.",
    format: "money",
    shape: "scalar",
    permissions: ["sklad.read", "sklad.write"],
    compute: async (ctx, _input, deps) => {
      const def = deps.registry.get("stock_item");
      if (!def) throw new UserError("Sklad není v systému dostupný.");
      const e = await resolveEntity(ctx.db, def);
      // cena je atribut s oprávněním `sklad.write`; bez něj ho datová vrstva aktérovi vůbec nenabídne
      const res = await aggregateRecords(ctx, deps.registry, e, {
        fn: "sum",
        attr: "value",
        filters: { op: "and", conditions: [{ attr: "active", op: "is_true" }] },
      });
      return { kind: "scalar", value: res.total.value };
    },
  }),
];
