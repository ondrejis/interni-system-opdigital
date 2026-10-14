import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { countActive, type DeleteBlocker } from "@rebar/core/entities";
import { job, jobChange, jobCost, jobOrder, workStatement } from "./schema";

const LOCKED_FIX = "takovou zakázku nejde smazat, uzavřete ji nebo ji označte jako prohranou";

/**
 * Co brání smazání firmy, osoby a zakázky z pohledu Zakázek. Firma a osoba s navázanou zakázkou se nesmažou;
 * zakázka se zamčenými doklady (schválená změna, soupis, schválená či přijatá objednávka) taky ne, uzavírá se.
 */
export const deleteBlockers: DeleteBlocker[] = [
  {
    id: "zakazky.company-jobs",
    entity: "company",
    noun: ["zakázku", "zakázky", "zakázek"],
    count: (ctx, id) => countActive(ctx, job, eq(job.companyId, id)),
  },
  {
    id: "zakazky.company-orders",
    entity: "company",
    noun: ["objednávku", "objednávky", "objednávek"],
    count: (ctx, id) => countActive(ctx, jobOrder, eq(jobOrder.supplierId, id)),
  },
  {
    id: "zakazky.company-costs",
    entity: "company",
    noun: ["náklad zakázky", "náklady zakázek", "nákladů zakázek"],
    count: (ctx, id) => countActive(ctx, jobCost, eq(jobCost.supplierId, id)),
  },
  {
    id: "zakazky.person-jobs",
    entity: "person",
    noun: ["zakázku", "zakázky", "zakázek"],
    count: (ctx, id) => countActive(ctx, job, eq(job.personId, id)),
  },
  {
    id: "zakazky.job-locked",
    entity: "job",
    noun: ["zamčený doklad", "zamčené doklady", "zamčených dokladů"],
    fix: LOCKED_FIX,
    count: async (ctx, id) =>
      (await countActive(ctx, jobChange, eq(jobChange.jobId, id), isNotNull(jobChange.lockedAt))) +
      (await countActive(
        ctx,
        workStatement,
        eq(workStatement.jobId, id),
        isNotNull(workStatement.lockedAt),
      )) +
      (await countActive(
        ctx,
        jobOrder,
        eq(jobOrder.jobId, id),
        or(isNotNull(jobOrder.lockedAt), sql`${jobOrder.status} in ('approved', 'received')`),
      )),
  },
  {
    id: "zakazky.job-orders",
    entity: "job",
    noun: ["objednávku", "objednávky", "objednávek"],
    count: (ctx, id) =>
      countActive(
        ctx,
        jobOrder,
        and(
          eq(jobOrder.jobId, id),
          isNull(jobOrder.lockedAt),
          sql`${jobOrder.status} not in ('approved', 'received', 'cancelled')`,
        ),
      ),
  },
];
