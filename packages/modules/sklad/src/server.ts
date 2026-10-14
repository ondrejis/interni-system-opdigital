import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { countActive, type DeleteBlocker } from "@rebar/core/entities";
import {
  defineModuleServer,
  type AttentionItem,
  type CalendarItem,
  type CostLine,
} from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { commands } from "./commands";
import { dashboardMetrics } from "./metrics";
import { terminalItems } from "./terminal";
import { canSeePrices } from "./prices";
import {
  entities,
  purchaseOrderEntity,
  stockCountEntity,
  stockDocEntity,
  stockItemEntity,
  warehouseEntity,
} from "./entities";
import {
  purchaseOrder,
  purchaseOrderLine,
  stockCount,
  stockCountLine,
  stockDoc,
  stockDocLine,
  stockItem,
  stockLevel,
  warehouse,
} from "./schema";
import { formatQty } from "./stock-math";

/** Firma jako dodavatel skladu a zakázka s výdejkami se nemažou (zmizely by doklady a náklady). */
const deleteBlockers: DeleteBlocker[] = [
  {
    id: "sklad.company-orders",
    entity: "company",
    noun: ["skladovou objednávku", "skladové objednávky", "skladových objednávek"],
    count: (ctx, id) => countActive(ctx, purchaseOrder, eq(purchaseOrder.supplierId, id)),
  },
  {
    id: "sklad.company-docs",
    entity: "company",
    noun: ["skladový doklad", "skladové doklady", "skladových dokladů"],
    count: (ctx, id) => countActive(ctx, stockDoc, eq(stockDoc.supplierId, id)),
  },
  {
    id: "sklad.company-items",
    entity: "company",
    noun: ["skladovou kartu", "skladové karty", "skladových karet"],
    count: (ctx, id) => countActive(ctx, stockItem, eq(stockItem.supplierId, id)),
  },
  {
    id: "sklad.job-docs",
    entity: "job",
    noun: ["skladový doklad", "skladové doklady", "skladových dokladů"],
    count: (ctx, id) => countActive(ctx, stockDoc, eq(stockDoc.jobId, id)),
  },
  {
    id: "sklad.job-orders",
    entity: "job",
    noun: ["skladovou objednávku", "skladové objednávky", "skladových objednávek"],
    count: (ctx, id) => countActive(ctx, purchaseOrder, eq(purchaseOrder.jobId, id)),
  },
];

export const server = defineModuleServer({
  entities,
  dashboardMetrics,
  commands: [...commands, terminalItems],
  deleteBlockers,
  costProviders: [
    {
      key: "sklad.material",
      // Řádek na úrovni dokladu (výdejka, vratka); `ref` je id dokladu, takže jde párovat na oddíl rozpočtu.
      // Kdo smí vidět ekonomiku zakázky, smí vidět i tyto částky (hlídá to zakázka).
      costs: async (ctx, jobId): Promise<CostLine[]> => {
        const docs = await ctx.db
          .select({
            id: stockDoc.id,
            number: stockDoc.number,
            type: stockDoc.type,
            date: stockDoc.date,
            total: stockDoc.totalMinor,
          })
          .from(stockDoc)
          .where(
            and(
              eq(stockDoc.jobId, jobId),
              inArray(stockDoc.type, ["issue", "return"]),
              isNull(stockDoc.deletedAt),
            ),
          )
          .orderBy(asc(stockDoc.date), asc(stockDoc.number));
        return docs.map((d): CostLine => ({
          category: "material",
          label: `${d.type === "issue" ? "Výdejka" : "Vratka"} ${d.number}`,
          amountMinor: d.type === "issue" ? Number(d.total) : -Number(d.total),
          source: "sklad",
          ref: d.id,
          date: d.date,
        }));
      },
    },
  ],
  diaryPrefill: [
    async (ctx, jobId, date) => {
      if (!can(ctx, "sklad.read")) return {};
      const rows = await ctx.db
        .select({
          name: stockItem.name,
          unit: stockItem.unit,
          qty: sql<string>`sum(${stockDocLine.qty})`,
        })
        .from(stockDocLine)
        .innerJoin(stockDoc, eq(stockDoc.id, stockDocLine.docId))
        .innerJoin(stockItem, eq(stockItem.id, stockDocLine.itemId))
        .where(and(eq(stockDoc.jobId, jobId), eq(stockDoc.date, date), eq(stockDoc.type, "issue")))
        .groupBy(stockItem.name, stockItem.unit)
        .orderBy(asc(stockItem.name));
      if (!rows.length) return {};
      return {
        materialRows: rows.map((r) => ({ name: r.name, qty: String(Number(r.qty)), unit: r.unit })),
        materials: rows.map((r) => `${r.name} (${formatQty(r.qty)} ${r.unit})`).join(", "),
      };
    },
  ],
  attention: [
    async (ctx) => {
      const out: AttentionItem[] = [];
      if (!can(ctx, "sklad.write")) return out;
      const [low] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(stockItem)
        .where(
          and(
            isNull(stockItem.deletedAt),
            eq(stockItem.active, true),
            eq(stockItem.belowMin, true),
          ),
        );
      if (low?.n)
        out.push({
          id: "stock-low",
          module: "sklad",
          severity: "warning",
          title: `Pod minimem: ${low.n} ${low.n === 1 ? "položka" : low.n < 5 ? "položky" : "položek"}`,
          href: "/sklad?low=1",
        });
      const [late] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(purchaseOrder)
        .where(
          and(
            isNull(purchaseOrder.deletedAt),
            inArray(purchaseOrder.status, ["sent", "partial"]),
            sql`${purchaseOrder.expectedDate} < ${todayIso()}`,
          ),
        );
      if (late?.n)
        out.push({
          id: "stock-orders-late",
          module: "sklad",
          severity: "warning",
          title: `Objednávky po termínu dodání: ${late.n}`,
          href: "/sklad/objednavky",
        });
      return out;
    },
  ],
  widgets: [
    async (ctx) => {
      if (!can(ctx, "sklad.read")) return [];
      const [r] = await ctx.db
        .select({
          items: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(${stockItem.valueMinor}), 0)::float`,
          low: sql<number>`count(*) filter (where ${stockItem.belowMin})::int`,
        })
        .from(stockItem)
        .where(and(isNull(stockItem.deletedAt), eq(stockItem.active, true)));
      return [
        // hodnotu zásob (nákupní ceny) vidí jen správce skladu a držitel ekonomiky, ostatní jen počet pod minimem
        ...(canSeePrices(ctx)
          ? [
              {
                id: "stock-value",
                module: "sklad",
                title: "Hodnota skladu",
                value: formatMinor(Math.round(r?.value ?? 0)),
                hint: `${r?.items ?? 0} aktivních položek`,
                href: "/sklad",
                order: 30,
              },
            ]
          : []),
        {
          id: "stock-below-min",
          module: "sklad",
          title: "Pod minimem",
          value: String(r?.low ?? 0),
          href: "/sklad?low=1",
          tone: r?.low ? "warning" : "success",
          order: 31,
        },
      ];
    },
  ],
  calendarLayers: [
    {
      key: "sklad.dodavky",
      label: "Dodávky materiálu",
      color: "teal",
      items: async (ctx, range): Promise<CalendarItem[]> => {
        if (!can(ctx, "sklad.read")) return [];
        const rows = await ctx.db
          .select({
            id: purchaseOrder.id,
            number: purchaseOrder.number,
            date: purchaseOrder.expectedDate,
            supplier: company.name,
          })
          .from(purchaseOrder)
          .innerJoin(company, eq(company.id, purchaseOrder.supplierId))
          .where(
            and(
              isNull(purchaseOrder.deletedAt),
              inArray(purchaseOrder.status, ["sent", "partial"]),
              gte(purchaseOrder.expectedDate, range.from),
              lte(purchaseOrder.expectedDate, range.to),
            ),
          );
        return rows.flatMap((r) =>
          r.date
            ? [
                {
                  id: `po-${r.id}`,
                  layer: "sklad.dodavky",
                  title: `Dodávka ${r.number} · ${r.supplier}`,
                  start: r.date,
                  allDay: true,
                  href: `/sklad/objednavky/${r.id}`,
                },
              ]
            : [],
        );
      },
    },
  ],
});

export {
  entities,
  purchaseOrder,
  purchaseOrderEntity,
  purchaseOrderLine,
  stockCount,
  stockCountEntity,
  stockCountLine,
  stockDoc,
  stockDocEntity,
  stockDocLine,
  stockItem,
  stockItemEntity,
  stockLevel,
  warehouse,
  warehouseEntity,
};
export * from "./stock-math";
export { postDoc } from "./engine";
export type { PostDocInput } from "./engine";
export { commands };
