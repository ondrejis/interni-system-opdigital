import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { canSeePrivate } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";

/*
  Soukromé záznamy (zámek) v ručních dotazech modulu (D §5.1, §5.4): každý dotaz nad `company` a `person`, který
  nejde přes engine entit (služby, API, příspěvky, hledání pro výběr), musí přidat tuto podmínku. Je to totéž co
  `privateScope` z jádra (`entities/visibility.ts`); až ji jádro vyexportuje z `@rebar/core/entities`, stačí
  změnit tenhle jediný soubor.
*/

export { canSeePrivate };

/** Podmínka do `WHERE`: vlastník (`private.read`) vidí vše (`undefined`), ostatní jen záznamy, které nejsou soukromé. */
export function privateScope(ctx: Ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined {
  return canSeePrivate(ctx) ? undefined : sql`not ${table.isPrivate}`;
}
