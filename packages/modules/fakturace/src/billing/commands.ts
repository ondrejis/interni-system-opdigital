import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { can, inTx, UserError } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { workStatement } from "@rebar/zakazky/schema";
import { invoice, payment } from "../schema";
import {
  createDraftFromJob,
  createFromStatement as createFromStatementFn,
  finalSettlement as finalSettlementFn,
  invoicingOf,
  releaseRetention as releaseRetentionFn,
} from "./api";
import { loadInvoice } from "./core";
import { recomputeSummary } from "./integrations";
import { billedState, loadContract, loadHistory, loadJob, retentionState } from "./sources";

/** Záloha, dílčí a konečná faktura z rozpočtu zakázky. */
export const createFromJob = defineCommand({
  name: "fakturace.createFromJob",
  permission: "fakturace.write",
  input: z.object({
    jobId: z.uuid(),
    kind: z.enum(["proforma", "partial", "final"]),
    /** Záloha a ruční dílčí faktura: kolik procent smluvní ceny. */
    percent: z.number().min(0.01).max(100).optional(),
    /** Nebo pevná částka bez DPH v haléřích. */
    amountMinor: z.number().int().positive().max(9_000_000_000_000).optional(),
  }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    return createDraftFromJob(ctx, i, deps);
  },
});

export const createFromStatement = defineCommand({
  name: "fakturace.createFromStatement",
  permission: "fakturace.write",
  input: z.object({ statementId: z.uuid() }),
  handler: async (ctx, i, deps) => {
    const [s] = await ctx.db
      .select({ jobId: workStatement.jobId })
      .from(workStatement)
      .where(eq(workStatement.id, i.statementId));
    if (s) await assertEntityAccess(ctx, "job", s.jobId, "read");
    return createFromStatementFn(ctx, i.statementId, deps);
  },
});

export const releaseRetention = defineCommand({
  name: "fakturace.releaseRetention",
  permission: "fakturace.write",
  input: z.object({
    jobId: z.uuid(),
    amountMinor: z.number().int().positive().max(9_000_000_000_000).optional(),
  }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    return releaseRetentionFn(
      ctx,
      i.jobId,
      i.amountMinor !== undefined ? { amountMinor: i.amountMinor } : {},
      deps,
    );
  },
});

/** Podklady konečné faktury (rekapitulace s odečty); nic nezakládá. */
export const finalSettlement = defineCommand({
  name: "fakturace.finalSettlement",
  permission: "fakturace.read",
  input: z.object({ jobId: z.uuid() }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    return finalSettlementFn(ctx, i.jobId, deps);
  },
});

/** Přehled fakturace zakázky: čísla, zádržné, zálohy, soupisy k fakturaci (pro záložku Faktury). */
export const jobSummary = defineCommand({
  name: "fakturace.jobSummary",
  permission: "fakturace.read",
  input: z.object({ jobId: z.uuid() }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const j = await loadJob(ctx.db, i.jobId);
    const contract = await loadContract(ctx.db, j);
    const h = await loadHistory(ctx.db, i.jobId);
    const inv = invoicingOf(h);
    const bs = billedState(h);
    const r = retentionState(h);
    const real = h.docs.filter((d) => d.kind !== "proforma");
    const open = h.docs.filter((d) => d.state === "issued" || d.state === "partial");
    const statements = await ctx.db
      .select({
        id: workStatement.id,
        number: workStatement.number,
        periodFrom: workStatement.periodFrom,
        periodTo: workStatement.periodTo,
        status: workStatement.status,
        approvedMinor: workStatement.approvedMinor,
        invoiceId: workStatement.invoiceId,
      })
      .from(workStatement)
      .where(and(eq(workStatement.jobId, i.jobId), isNull(workStatement.deletedAt)))
      .orderBy(asc(workStatement.number));
    const [draftRelease] = await ctx.db
      .select({ id: invoice.id })
      .from(invoice)
      .where(
        and(
          eq(invoice.jobId, i.jobId),
          eq(invoice.kind, "retention"),
          eq(invoice.state, "draft"),
          isNull(invoice.deletedAt),
        ),
      );
    return {
      currency: j.currency,
      phase: j.phase,
      vatMode: j.vatMode,
      retentionBp: j.retentionBp,
      contractMinor: contract.contractMinor,
      originalContractMinor: contract.baseMinor,
      extraChangesMinor: contract.extraChanges.reduce((a, e) => a + e.amountMinor, 0),
      hasBudget: contract.budget.items.length > 0,
      invoicedNetMinor: real.reduce((a, d) => a + d.netMinor, 0),
      proformaNetMinor: h.docs
        .filter((d) => d.kind === "proforma" && d.state !== "credited")
        .reduce((a, d) => a + d.netMinor, 0),
      paidMinor: h.docs.reduce((a, d) => a + d.paidMinor, 0),
      outstandingMinor: open
        .filter((d) => d.kind !== "credit_note")
        .reduce((a, d) => a + (d.grossMinor - d.paidMinor), 0),
      invoicedMinor: inv.invoicedMinor,
      paidNetMinor: inv.paidMinor,
      remainingToInvoiceMinor: contract.contractMinor - inv.invoicedMinor,
      retentionHeldMinor: inv.retentionHeldMinor,
      retentionReleasedMinor: inv.retentionReleasedMinor,
      advancesPaidMinor: inv.advancesPaidMinor,
      advancesToDeduct: bs.advances.length,
      unpaidAdvances: bs.unpaidAdvances.length,
      finalIssued: bs.finalIssued,
      hasReleaseDraft: !!draftRelease,
      retentionOutstandingMinor: r.outstandingMinor,
      statements,
    };
  },
});

/**
 * Výjimečné vrácení vystaveného dokladu do konceptu (oprava hned po vystavení). Smí to držitel oprávnění
 * „schvaluje doklady bez limitu“, doklad nesmí mít úhrady ani dobropis a nesmí být odečtený jinde. Číslo z řady
 * zůstává dokladu (v řadě nevzniká díra) a zapíše se do auditu i s důvodem. Běžná oprava je dobropis.
 */
export const reopen = defineCommand({
  name: "fakturace.reopen",
  permission: "fakturace.write",
  input: z.object({ id: z.uuid(), reason: z.string().trim().min(3, "Napište důvod.").max(500) }),
  handler: async (ctx, i) => {
    if (!can(ctx, "zakazky.approve_all"))
      throw new UserError(
        "Vystavenou fakturu může vrátit do konceptu jen držitel oprávnění „Schvaluje doklady bez limitu“. Jinak ji opravte dobropisem.",
      );
    await assertEntityAccess(ctx, "invoice", i.id, "write");
    return inTx(ctx, async (c) => {
      // zámek řádku jako u úhrady a vystavení: souběžná úhrada by jinak mohla přijít mezi kontrolu a vrácení
      await c.db.execute(sql`select id from invoice where id = ${i.id} for update`);
      const cur = await loadInvoice(c.db, i.id);
      if (cur.kind === "credit_note")
        throw new UserError(
          "Vystavený dobropis nejde vrátit do konceptu, původní doklad by zůstal stornovaný bez dobropisu. Chybu opravte novým dokladem.",
        );
      if (cur.state !== "issued")
        throw new UserError(
          cur.state === "draft"
            ? "Doklad je koncept."
            : "Doklad je částečně nebo plně uhrazený, stornovaný nebo má dobropis. Opravte ho dobropisem.",
        );
      const [pay] = await c.db
        .select({ id: payment.id })
        .from(payment)
        .where(and(eq(payment.invoiceId, i.id), isNull(payment.deletedAt)));
      if (pay) throw new UserError("Doklad má zapsanou úhradu. Opravte ho dobropisem.");
      if (cur.jobId) {
        const h = await loadHistory(c.db, cur.jobId);
        const used = h.docs.some(
          (d) =>
            d.id !== cur.id && (h.lines.get(d.id) ?? []).some((l) => l.refInvoiceId === cur.id),
        );
        if (used) throw new UserError("Doklad je odečtený na jiné faktuře. Opravte ho dobropisem.");
        if (cur.kind !== "retention" && cur.kind !== "credit_note") {
          const hasRelease = h.docs.some((d) => d.kind === "retention");
          if (hasRelease && cur.retentionMinor > 0)
            throw new UserError("Zádržné z dokladu je už uvolněné. Opravte ho dobropisem.");
        }
      }
      await c.db
        .update(invoice)
        .set({
          state: "draft",
          lockedAt: null,
          issuedAt: null,
          overdue: false,
          updatedBy: c.actor.userId,
        })
        .where(eq(invoice.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "invoice",
        entityId: i.id,
        summary: `Vráceno do konceptu (${cur.number}): ${i.reason}`,
        changes: [{ field: "Stav", old: "Vystaveno", new: "Koncept" }],
      });
      await recomputeSummary(c, cur.jobId);
      return { number: cur.number, grossMinor: formatMinor(cur.grossMinor, cur.currency) };
    });
  },
});

export const commands = [
  createFromJob,
  createFromStatement,
  releaseRetention,
  finalSettlement,
  jobSummary,
  reopen,
];
