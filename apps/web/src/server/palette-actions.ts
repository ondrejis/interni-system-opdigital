"use server";

import { searchAll } from "@rebar/core/entities";
import {
  exportHistoryCsv,
  historyFilterSchema,
  listRecent,
  queryHistory,
} from "@rebar/core/history";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Server actions palety Cmd+K (hledání, nedávné záznamy) a stránky `/historie` (výpis, export CSV). Viditelnost
  (soukromé záznamy, rozsah „jen moje“) vynucují funkce jádra (`searchAll`, `listRecent`, `auditReadScope`), ne tyto akce.
*/

/** Hledání napříč entitami: nálezy seskupí klient podle typu; z jednoho typu nejvýše 6, celkem 30. */
export const paletteSearch = defineAction({
  input: z.object({ q: z.string().max(100) }),
  handler: async (ctx, { q }) =>
    searchAll(ctx, getServices().registry.all(), q, 30, { perType: 6 }),
});

/** Posledních 8 otevřených záznamů uživatele (`recent_record`), jen ty, které smí vidět. */
export const paletteRecent = defineAction({
  input: z.object({}),
  handler: async (ctx) => listRecent(ctx, getServices().registry),
});

const filters = historyFilterSchema.omit({ limit: true, offset: true });

/** Stránka globální historie změn (filtry, hledání, před → po); čte výhradně přes `auditReadScope`. */
export const historyList = defineAction({
  permission: "activity.read",
  input: filters.extend({
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
  }),
  handler: async (ctx, i) => queryHistory(ctx, getServices().registry, i),
});

/** Export historie do CSV se stejnými filtry; jen s právem `activity.export` (výchozí vlastník). */
export const historyExport = defineAction({
  permission: "activity.export",
  input: filters,
  handler: async (ctx, i) => exportHistoryCsv(ctx, getServices().registry, i),
});
