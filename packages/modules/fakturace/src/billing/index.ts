import { and, asc, eq, isNull } from "drizzle-orm";
import type { AttentionItem, ModuleServer } from "@rebar/core/module-server";
import { scopeOf } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { job, workStatement } from "@rebar/zakazky/schema";
import { jobInvoicing, retentionOutstanding } from "./api";
import { commands } from "./commands";

/**
 * Oblast „billing“ modulu Fakturace (ADR 015): vydané faktury: přenesená daňová povinnost, zádržné, konečná faktura
 * po zálohách, faktura ze soupisu, zamykání dokladů. Do této složky píše jen její vlastník.
 */
export const area: ModuleServer = {
  commands,
  /** Souhrn zakázky (vyfakturováno a uhrazeno bez DPH) pro `recomputeJobSummary`. */
  jobInvoicing: [
    async (ctx, jobId) => {
      const r = await jobInvoicing(ctx, jobId);
      return { invoicedMinor: r.invoicedMinor, paidMinor: r.paidMinor };
    },
  ],
  phaseHooks: [
    {
      id: "billing.closed-retention",
      entity: "job",
      to: ["closed"],
      check: async (ctx, row) => {
        const open = await retentionOutstanding(ctx, String(row.id));
        return open > 0
          ? `Zádržné ${formatMinor(open, String(row.currency ?? "CZK"))} zakázky ještě nebylo uvolněno. Uvolněte ho ve Fakturaci a pak zakázku uzavřete.`
          : null;
      },
    },
  ],
  attention: [
    async (ctx) => {
      if (scopeOf(ctx, "fakturace.write") === null) return [];
      const rows = await ctx.db
        .select({
          id: workStatement.id,
          jobId: workStatement.jobId,
          number: workStatement.number,
          approved: workStatement.approvedMinor,
          jobNumber: job.number,
          currency: job.currency,
        })
        .from(workStatement)
        .innerJoin(job, eq(job.id, workStatement.jobId))
        .where(
          and(
            eq(workStatement.status, "approved"),
            isNull(workStatement.invoiceId),
            isNull(workStatement.deletedAt),
          ),
        )
        .orderBy(asc(workStatement.decidedAt))
        .limit(8);
      return rows.map((r): AttentionItem => ({
        id: `statement-uninvoiced-${r.id}`,
        module: "fakturace",
        severity: "info",
        title: `Soupis č. ${r.number} zakázky ${r.jobNumber} čeká na fakturu`,
        detail: `Schváleno ${formatMinor(r.approved, r.currency)} bez DPH`,
        href: `/zakazky/${r.jobId}?tab=fakturace`,
      }));
    },
  ],
};
