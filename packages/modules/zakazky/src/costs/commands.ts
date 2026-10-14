import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { defineCommand } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import { jobOrder } from "../schema";
import {
  allocateCost,
  autoAllocate,
  budgetTargets,
  computeJobSummary,
  createManualCost,
  deleteManualCost,
  listJobCosts,
  loadBudget,
  planVsActual,
  recomputeJobSummary,
  updateManualCost,
} from "./api";
import { readMoney, writeCosts } from "./access";
import { COST_CATEGORY_LIST } from "./model";

const jobId = z.uuid();
const money = z.number().int().max(9_000_000_000_000);
const categories = COST_CATEGORY_LIST.map((c) => c.key) as [string, ...string[]];

/** Souhrn zakázky pro hlavičku, seznam a přehled (jediné místo, kde se čísla počítají). */
export const summary = defineCommand({
  name: "zakazky.summary",
  permission: "zakazky.economics",
  input: z.object({ jobId }),
  handler: async (ctx, i, deps) => {
    await readMoney(ctx, i.jobId);
    return recomputeJobSummary(ctx, i.jobId, deps);
  },
});

export const costsList = defineCommand({
  name: "zakazky.costs.list",
  permission: "zakazky.economics",
  input: z.object({
    jobId,
    source: z.string().max(40).optional(),
    category: z.string().max(40).optional(),
    sectionId: z.uuid().optional(),
    status: z.enum(["paired", "unpaired"]).optional(),
    q: z.string().max(100).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  }),
  handler: async (ctx, { jobId: id, ...filters }, deps) => {
    await readMoney(ctx, id);
    return listJobCosts(ctx, id, filters, deps);
  },
});

/** Oddíly a položky aktuálního rozpočtu zakázky (výběr při párování a v řádcích přijaté faktury). */
export const costsTargets = defineCommand({
  name: "zakazky.costs.targets",
  permission: "zakazky.economics",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await readMoney(ctx, i.jobId);
    return budgetTargets(await loadBudget(ctx, i.jobId));
  },
});

const manualInput = z.object({
  date: z.iso.date("Vyplňte datum."),
  category: z.enum(categories),
  title: z.string().trim().min(2, "Napište, za co náklad je.").max(200),
  supplierId: z.uuid().nullish(),
  supplierName: z.string().trim().max(200).nullish(),
  amountMinor: money.refine((n) => n !== 0, "Částka nesmí být nula."),
  sectionId: z.uuid().nullish(),
  itemId: z.uuid().nullish(),
  orderId: z.uuid().nullish(),
});

async function checkRefs(
  ctx: Ctx,
  id: string,
  i: { supplierId?: string | null | undefined; orderId?: string | null | undefined },
) {
  if (i.supplierId) {
    const [c] = await ctx.db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.id, i.supplierId), isNull(company.deletedAt)));
    if (!c) throw new UserError("Dodavatel nenalezen.");
  }
  if (i.orderId) {
    const [o] = await ctx.db
      .select({ id: jobOrder.id })
      .from(jobOrder)
      .where(and(eq(jobOrder.id, i.orderId), eq(jobOrder.jobId, id), isNull(jobOrder.deletedAt)));
    if (!o) throw new UserError("Objednávka nepatří k této zakázce.");
  }
}

/** Ruční náklad: nový (bez `id`) nebo úprava. Rozpad a párování automatických nákladů řeší `allocate`. */
export const costsSave = defineCommand({
  name: "zakazky.costs.save",
  permission: "zakazky.budget",
  input: manualInput.extend({ jobId, id: z.uuid().optional() }),
  handler: async (ctx, { jobId: jid, id, ...rest }) => {
    await writeCosts(ctx, jid);
    await checkRefs(ctx, jid, rest);
    if (id) return updateManualCost(ctx, id, rest);
    return createManualCost(ctx, { jobId: jid, ...rest });
  },
});

export const costsDelete = defineCommand({
  name: "zakazky.costs.delete",
  permission: "zakazky.budget",
  input: z.object({ jobId, id: z.uuid() }),
  handler: async (ctx, i) => {
    await writeCosts(ctx, i.jobId);
    await deleteManualCost(ctx, i.id);
  },
});

/**
 * Spáruje náklad na oddíl (a případně položku) rozpočtu. `source` a `ref` jsou z řádku seznamu (`allocSource`, `ref`).
 * Víc částí = rozpad na víc oddílů, součet musí sedět; prázdné `parts` párování zruší.
 */
export const costsAllocate = defineCommand({
  name: "zakazky.costs.allocate",
  permission: "zakazky.budget",
  input: z.object({
    jobId,
    source: z.string().min(1).max(40),
    ref: z.string().min(1).max(200),
    parts: z
      .array(
        z.object({
          sectionId: z.uuid(),
          itemId: z.uuid().nullish(),
          amountMinor: money.nullish(),
        }),
      )
      .max(20),
  }),
  handler: async (ctx, i, deps) => {
    await writeCosts(ctx, i.jobId);
    await allocateCost(ctx, i.jobId, { source: i.source, ref: i.ref, parts: i.parts }, deps);
  },
});

export const costsAutoAllocate = defineCommand({
  name: "zakazky.costs.autoAllocate",
  permission: "zakazky.budget",
  input: z.object({ jobId }),
  handler: async (ctx, i, deps) => {
    await writeCosts(ctx, i.jobId);
    return autoAllocate(ctx, i.jobId, deps);
  },
});

/** Plán vs skutečnost: strom objekt → oddíl s plánem, náklady, závazky, čerpáním a marží. */
export const costsPlan = defineCommand({
  name: "zakazky.costs.plan",
  permission: "zakazky.economics",
  input: z.object({ jobId }),
  handler: async (ctx, i, deps) => {
    await readMoney(ctx, i.jobId);
    return planVsActual(ctx, i.jobId, deps);
  },
});

export { computeJobSummary };

export const commands = [
  summary,
  costsList,
  costsTargets,
  costsSave,
  costsDelete,
  costsAllocate,
  costsAutoAllocate,
  costsPlan,
];
