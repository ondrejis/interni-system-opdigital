import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { PermissionError, canSeePrivate, scopeOf, type Ctx } from "@rebar/core/rbac";
import { timeEntry } from "./schema";

export { canSeePrivate };

/**
 * Podmínka do `WHERE`, která ze soukromých záznamů nechá jen ty, které aktér smí vidět (vlastník vše, ostatní jen
 * nesoukromé). Povinná v každém ručním čtení modulu (D §5.1): hodiny soukromé zakázky jsou soukromé.
 */
export function privateScope(ctx: Ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined {
  return canSeePrivate(ctx) ? undefined : sql`not ${table.isPrivate}`;
}

/** Id přihlášeného uživatele; bez něj (systémový aktér bez uživatele) vyhodí chybu oprávnění. */
export function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

/** Rozsah čtení hodin: `all` = hodiny všech, `own` = jen vlastní. Bez oprávnění `hodiny.read` vyhodí chybu. */
export function readScope(ctx: Ctx): "all" | "own" {
  const scope = scopeOf(ctx, "hodiny.read");
  if (!scope) throw new PermissionError();
  return scope;
}

/**
 * Záznamy hodin, které aktér smí číst: nesmazané, v rozsahu oprávnění `hodiny.read` (při „jen moje“ vlastní) a bez
 * cizích soukromých. Použít ve všech ručních dotazech (přehledy, metriky, služba, příspěvky).
 */
export function visibleEntries(ctx: Ctx, ...extra: (SQL | undefined)[]): SQL {
  const own = readScope(ctx) === "own" ? eq(timeEntry.userId, me(ctx)) : undefined;
  return and(isNull(timeEntry.deletedAt), own, privateScope(ctx, timeEntry), ...extra)!;
}

/** Vlastní záznamy aktéra (týdenní výkaz, úpravy): nesmazané, jeho, bez soukromých, které nesmí vidět. */
export function myEntries(ctx: Ctx, ...extra: (SQL | undefined)[]): SQL {
  return and(
    isNull(timeEntry.deletedAt),
    eq(timeEntry.userId, me(ctx)),
    privateScope(ctx, timeEntry),
    ...extra,
  )!;
}
