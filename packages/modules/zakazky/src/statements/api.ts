/**
 * Veřejné rozhraní oblasti „statements“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `statementsApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 */
import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { lineAmount } from "../budget/math";
import { workStatement } from "../schema";
import { statementLabel, toThousandths } from "./calc";
import { computedLines, loadStatement } from "./service";

export { createStatement } from "./commands";

export type InvoiceDraftPayload = {
  statementId: string;
  jobId: string;
  objectId: string | null;
  number: number;
  periodFrom: string;
  periodTo: string;
  note: string | null;
  /** Nárokováno za období, schváleno (může být nižší) a rozdíl; částky bez DPH v haléřích. */
  claimedMinor: number;
  approvedMinor: number;
  reductionMinor: number;
  /** Jen položky s provedeným množstvím za období. */
  lines: {
    budgetItemId: string;
    title: string;
    unit: string;
    vatRateBp: number;
    quantityPeriod: string;
    unitPriceMinor: number;
    amountMinor: number;
  }[];
};

/**
 * Podklady pro dílčí fakturu ze schváleného soupisu. Soupis musí být schválený a ještě bez faktury.
 * Fakturu skutečně vytváří Fakturace (`billingApi.createFromStatement`), po vystavení zavolá `markInvoiced`.
 */
export async function createInvoiceDraft(
  ctx: Ctx,
  statementId: string,
): Promise<InvoiceDraftPayload> {
  const s = await loadStatement(ctx, statementId);
  if (s.status !== "approved")
    throw new UserError(
      `${statementLabel(s.number)}: faktura jde vytvořit jen ze schváleného soupisu.`,
    );
  if (s.invoiceId) throw new UserError(`${statementLabel(s.number)}: faktura už vznikla.`);
  const lines = (await computedLines(ctx, s)).filter((l) => toThousandths(l.quantityPeriod) > 0);
  // schválené částky řádků jsou uložené v soupisu, faktura se ale skládá z živé ceny položky rozpočtu: po úpravě ceny
  // (nebo smazání položky) od schválení by se vyfakturovalo něco jiného, než zákazník schválil
  const changed = lines.find(
    (l) => lineAmount(l.quantityPeriod, l.unitPriceMinor) !== l.amountPeriodMinor,
  );
  if (changed)
    throw new UserError(
      `${statementLabel(s.number)}: cena položky „${changed.title}“ se v rozpočtu od schválení soupisu změnila, faktura by nesouhlasila se schválenou částkou. Vraťte soupis do konceptu a nechte ho schválit znovu.`,
    );
  return {
    statementId: s.id,
    jobId: s.jobId,
    objectId: s.objectId,
    number: s.number,
    periodFrom: s.periodFrom,
    periodTo: s.periodTo,
    note: s.note,
    claimedMinor: s.claimedMinor,
    approvedMinor: s.approvedMinor,
    reductionMinor: s.claimedMinor - s.approvedMinor,
    lines: lines.map((l) => ({
      budgetItemId: l.itemId,
      title: l.code ? `${l.code} ${l.title}` : l.title,
      unit: l.unit,
      vatRateBp: l.vatRateBp,
      quantityPeriod: l.quantityPeriod,
      unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountPeriodMinor,
    })),
  };
}

/** Označí soupis jako vyfakturovaný (zapíše odkaz na fakturu). Soupis musí být schválený a bez jiné faktury. */
export async function markInvoiced(ctx: Ctx, statementId: string, invoiceId: string) {
  const s = await loadStatement(ctx, statementId, { lock: true });
  if (s.status !== "approved")
    throw new UserError(`${statementLabel(s.number)}: vyfakturovat jde jen schválený soupis.`);
  if (s.invoiceId && s.invoiceId !== invoiceId)
    throw new UserError(`${statementLabel(s.number)}: faktura už vznikla.`);
  await ctx.db
    .update(workStatement)
    .set({ invoiceId, updatedBy: ctx.actor.userId })
    .where(and(eq(workStatement.id, statementId), isNull(workStatement.deletedAt)));
  await recordAudit(ctx, {
    action: "update",
    entityType: "job",
    entityId: s.jobId,
    summary: `${statementLabel(s.number)}: vyfakturováno`,
  });
}

/** Uvolní soupis k nové fakturaci (např. po stornu faktury dobropisem). */
export async function clearInvoiced(ctx: Ctx, statementId: string) {
  const s = await loadStatement(ctx, statementId, { lock: true });
  if (!s.invoiceId) return;
  await ctx.db
    .update(workStatement)
    .set({ invoiceId: null, updatedBy: ctx.actor.userId })
    .where(eq(workStatement.id, statementId));
  await recordAudit(ctx, {
    action: "update",
    entityType: "job",
    entityId: s.jobId,
    summary: `${statementLabel(s.number)}: faktura uvolněna, soupis lze vyfakturovat znovu`,
  });
}
