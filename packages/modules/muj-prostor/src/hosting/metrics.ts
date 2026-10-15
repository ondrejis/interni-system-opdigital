import { defineDashboardMetric } from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { selectServices } from "./data";
import { summarizeServices } from "./logic";

/** Souhrn služeb; kdo nemá oprávnění k hostingu, dostane prázdný (nulový) souhrn, ne cizí čísla. */
const summaryOf = async (ctx: Parameters<typeof selectServices>[0], today: string) => {
  if (!can(ctx, "muj-prostor.hosting")) return summarizeServices([], today);
  const rows = await selectServices(ctx);
  return summarizeServices(
    rows.map((r) => ({
      kind: r.kind,
      period: r.period,
      status: r.status,
      priceMinor: r.priceMinor === null ? null : Number(r.priceMinor),
      nextRenewal: r.nextRenewal,
    })),
    today,
  );
};

/**
 * Metriky widgetu „Retainery“ (v2): opakovaný příjem z hostingu a údržby. Počítají se jen aktivní služby, roční
 * ekvivalent měsíčních je × 12. Jen pro vlastníka (oprávnění `muj-prostor.hosting`).
 */
export const hostingMetrics = [
  defineDashboardMetric({
    key: "muj-prostor.retainers",
    label: "Opakovaný příjem z hostingu a údržby (měsíčně)",
    description:
      "Měsíční ekvivalent opakovaných plateb z aktivních služeb hostingu a údržby (roční cena / 12). Pozastavené a zrušené se nepočítají.",
    format: "money",
    shape: "scalar",
    permissions: ["muj-prostor.hosting"],
    compute: async (ctx, input) => ({
      kind: "scalar",
      value: (await summaryOf(ctx, input.today)).monthlyMinor,
    }),
  }),
  defineDashboardMetric({
    key: "muj-prostor.retainers_arr",
    label: "Opakovaný příjem z hostingu a údržby (ročně)",
    description: "Roční opakovaný příjem z aktivních služeb hostingu a údržby (měsíční ceny × 12).",
    format: "money",
    shape: "scalar",
    permissions: ["muj-prostor.hosting"],
    compute: async (ctx, input) => ({
      kind: "scalar",
      value: (await summaryOf(ctx, input.today)).annualMinor,
    }),
  }),
  defineDashboardMetric({
    key: "muj-prostor.retainers_active",
    label: "Aktivní služby hostingu a údržby",
    description: "Počet aktivních služeb hostingu a údržby.",
    format: "number",
    shape: "scalar",
    permissions: ["muj-prostor.hosting"],
    compute: async (ctx, input) => ({
      kind: "scalar",
      value: (await summaryOf(ctx, input.today)).activeCount,
    }),
  }),
];
