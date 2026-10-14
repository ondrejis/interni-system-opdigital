import type { Ctx } from "@rebar/core/rbac";
import { costsApi, statementsApi } from "@rebar/zakazky/server";

/** Styk s ostatními oblastmi Zakázek na jednom místě (rozhraní `costsApi` a `statementsApi`). */

/** Po každé změně faktury, úhrady nebo zádržného: přepočet souhrnu zakázky, jako poslední krok transakce. */
export async function recomputeSummary(c: Ctx, jobId: string | null | undefined): Promise<void> {
  if (!jobId) return;
  await costsApi.recomputeJobSummary(c, jobId);
}

/** Soupis prací označí jako vyfakturovaný (`null` = uvolnit, např. po stornu faktury dobropisem). */
export async function markStatementInvoiced(
  c: Ctx,
  statementId: string,
  invoiceId: string | null,
): Promise<void> {
  if (invoiceId) await statementsApi.markInvoiced(c, statementId, invoiceId);
  else await statementsApi.clearInvoiced(c, statementId);
}

export const statementDraft = statementsApi.createInvoiceDraft;
