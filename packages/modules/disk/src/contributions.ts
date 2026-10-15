/*
  Příspěvek modulu „disk“ ke kartě klienta (D §2.5, `contributions.clientCard`): stav složky na Přehledu klienta a
  ve sloupci seznamu klientů.

  Soukromí: metody příspěvku nedostávají `deps` (kontrakt `ClientTabProvider`), proto modul nemá přístup k registru
  entit. Klienta, kterého aktér nesmí vidět (soukromý, smazaný), odfiltruje dotaz na tabulku `company` přímo
  (název tabulky je kontrakt z S1). Chybí-li tabulka (modul `kontakty` není zapnutý), příspěvek je prázdný.
*/
import { sql } from "drizzle-orm";
import type { ClientTabProvider } from "@rebar/core/contracts";
import type { Ctx } from "@rebar/core/rbac";
import { folderInfosOf } from "./facts";
import { canSeePrivate } from "./privacy";

/** ID klientů ze zadaných, které aktér smí vidět (soukromí a smazání; rozsah čtení klientů řeší volající modul). */
export async function visibleClientIds(ctx: Ctx, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const hidePrivate = canSeePrivate(ctx) ? sql`` : sql`and is_private = false`;
  try {
    // vnořená transakce: chybějící tabulka nesmí zneplatnit transakci volajícího
    return await ctx.db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`select id from company where id in (${idList}) and deleted_at is null ${hidePrivate}`,
      );
      return [...rows].map((r) => String((r as { id: unknown }).id));
    });
  } catch {
    return [];
  }
}

/** Příspěvek ke kartě klienta (`ModuleServer.contributions.clientCard`). */
export const clientCardProvider: ClientTabProvider = {
  async summary(ctx, companyId) {
    const visible = await visibleClientIds(ctx, [companyId]);
    const info = (await folderInfosOf(ctx.db, "company", visible, new Map())).get(companyId);
    return info ? { drive: { state: info.state, url: info.url } } : {};
  },
  async listMetrics(ctx, companyIds) {
    const visible = await visibleClientIds(ctx, companyIds);
    const infos = await folderInfosOf(ctx.db, "company", visible, new Map());
    return Object.fromEntries([...infos].map(([id, i]) => [id, { driveState: i.state }]));
  },
};
