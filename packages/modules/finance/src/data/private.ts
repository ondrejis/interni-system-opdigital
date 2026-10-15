import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { schema, type Executor } from "@rebar/core/db";
import { canSeePrivate, type Ctx } from "@rebar/core/rbac";

/*
  Soukromé záznamy (zámek) v ručních dotazech modulu (D §5.1, §5.4): každý dotaz nad `payment` a nad zakázkami, který
  nejde přes engine entit (příkazy, služby, metriky, příspěvky), musí přidat tuto podmínku. Totéž co `privateScope`
  z jádra (`entities/visibility.ts`); až ho jádro vyexportuje z `@rebar/core/entities`, stačí změnit tenhle soubor.
*/

export { canSeePrivate };

/** Podmínka do `WHERE`: vlastník (`private.read`) vidí vše (`undefined`), ostatní jen záznamy, které nejsou soukromé. */
export function privateScope(ctx: Ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined {
  return canSeePrivate(ctx) ? undefined : sql`not ${table.isPrivate}`;
}

/**
 * Udržuje `private_record` a příznak v hledání u záznamu, který vznikl nebo změnil zámek mimo engine entit
 * (platba založená příkazem). Volat v téže transakci jako změnu.
 */
export async function syncPrivate(
  db: Executor,
  entityType: string,
  id: string,
  isPrivate: boolean,
): Promise<void> {
  if (isPrivate)
    await db.insert(schema.privateRecord).values({ entityType, entityId: id }).onConflictDoNothing();
  else
    await db
      .delete(schema.privateRecord)
      .where(and(eq(schema.privateRecord.entityType, entityType), eq(schema.privateRecord.entityId, id)));
  await db
    .update(schema.searchDocument)
    .set({ isPrivate })
    .where(
      and(eq(schema.searchDocument.entityType, entityType), eq(schema.searchDocument.entityId, id)),
    );
}
