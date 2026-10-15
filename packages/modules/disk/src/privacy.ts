/*
  Soukromí (R-13, D §5.1): kdo smí vidět soukromé záznamy a které záznamy smí aktér vidět při čtení mimo engine
  entit. Dokud C1 nedodá `privateScope`, počítá se podle sloupce `is_private` entity a oprávnění `private.read`;
  po dodání C1 stačí nahradit `privateFilter` jeho voláním.
*/
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { EntityDef, EntityRegistry } from "@rebar/core/entities";
import { can, scopeOf, type Ctx } from "@rebar/core/rbac";
import type { DriveEntityType } from "./types";

/** Smí aktér vidět soukromé záznamy? (jen vlastník Ondřej, oprávnění `private.read`) */
export const canSeePrivate = (ctx: Ctx): boolean => can(ctx, "private.read");

/** Podmínka do `WHERE`: aktér bez `private.read` nikdy nedostane soukromý záznam. */
export function privateFilter(ctx: Ctx, isPrivateColumn: AnyPgColumn | undefined): SQL | undefined {
  if (!isPrivateColumn || canSeePrivate(ctx)) return undefined;
  return eq(isPrivateColumn, false);
}

/** Podmínka rozsahu čtení („jen moje“) entity: `undefined` = vše, `sql\`false\`` = nic. */
function scopeFilter(ctx: Ctx, def: EntityDef): SQL | undefined | null {
  const scope = scopeOf(ctx, def.permissions.read);
  if (!scope) return null;
  if (scope === "all") return undefined;
  if (def.scope) return def.scope(ctx);
  const me = ctx.actor.userId;
  const cols = def.ownerColumns ?? [];
  if (!me || !cols.length) return sql`false`;
  return or(...cols.map((c) => eq(c, me)));
}

/**
 * ID záznamů (klientů, zakázek) ze zadaných, které aktér smí vidět: oprávnění ke čtení, rozsah „jen moje“ a soukromí.
 * Záznam, který aktér vidět nesmí, tu prostě není (nikdy se nezjistí, že existuje).
 */
export async function visibleEntityIds(
  ctx: Ctx,
  registry: EntityRegistry,
  type: DriveEntityType,
  ids: readonly string[],
): Promise<Set<string>> {
  const def = registry.get(type);
  if (!def || !ids.length) return new Set();
  const scope = scopeFilter(ctx, def);
  if (scope === null) return new Set();
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const rows = await ctx.db
    .select({ id: cols.id! })
    .from(def.table)
    .where(
      and(
        inArray(cols.id!, [...ids]),
        isNull(cols.deletedAt!),
        scope,
        privateFilter(ctx, cols.isPrivate),
      ),
    );
  return new Set(rows.map((r) => String(r.id)));
}
