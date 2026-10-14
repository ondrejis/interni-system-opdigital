/**
 * Veřejné rozhraní oblasti „changes“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `changesApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { jobChange } from "../schema";
import { changeLabel } from "./calc";
import { createDraftChange } from "./commands";

/**
 * Založí koncept změny (ZBV); s `itemId` rovnou s řádkem „změna množství“ té položky rozpočtu realizace
 * (množství předvyplněné stávajícím). Vrací id změny; editor je na `/zakazky/<jobId>?tab=zmeny&change=<id>`.
 * Vyžaduje zápis do zakázky a `zakazky.economics`.
 */
export function createDraft(
  ctx: Ctx,
  input: { jobId: string; itemId?: string; title?: string },
): Promise<{ id: string }> {
  return createDraftChange(ctx, input);
}

/**
 * Rozpracované změny zakázky (koncept, odeslané ke schválení), například pro kontrolu před předáním.
 * Bez kontroly oprávnění: slouží interním kontrolám přechodů; `labels` je nejvýš 5 popisků (`VP-3 Název`).
 */
export async function countOpenChanges(
  ctx: Ctx,
  jobId: string,
): Promise<{ count: number; labels: string[] }> {
  const rows = await ctx.db
    .select({ number: jobChange.number, amount: jobChange.amountMinor, title: jobChange.title })
    .from(jobChange)
    .where(
      and(
        eq(jobChange.jobId, jobId),
        inArray(jobChange.status, ["draft", "sent"]),
        isNull(jobChange.deletedAt),
      ),
    )
    .orderBy(asc(jobChange.number));
  return {
    count: rows.length,
    labels: rows.slice(0, 5).map((r) => `${changeLabel(r.number, r.amount)} ${r.title}`),
  };
}
