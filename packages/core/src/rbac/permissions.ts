import { eq, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { PermissionError } from "./errors";
import { SELF_SERVICE_PERMISSIONS, type Ctx, type Scope } from "./types";

/** Záznam, jehož vlastníci rozhodují o přístupu při rozsahu `own`. */
export type OwnedRecord = { ownerIds: ReadonlyArray<string | null | undefined> };

/** Jaký rozsah má aktér u oprávnění (`null` = nemá ho vůbec). */
export function scopeOf(ctx: Ctx, key: string): Scope | null {
  const { actor } = ctx;
  if (actor.restriction && !SELF_SERVICE_PERMISSIONS.includes(key)) return null;
  if (actor.unrestricted) return "all";
  return actor.permissions.get(key) ?? null;
}

/**
 * Smí aktér provést akci? Bez `record` odpovídá na „má k tomu vůbec přístup“
 * (rozsah `own` stačí). S `record` u rozsahu `own` musí být aktér mezi vlastníky.
 */
export function can(ctx: Ctx, key: string, record?: OwnedRecord): boolean {
  const scope = scopeOf(ctx, key);
  if (!scope) return false;
  if (scope === "all" || !record) return true;
  const me = ctx.actor.userId;
  return !!me && record.ownerIds.includes(me);
}

/**
 * Smí aktér vidět soukromé záznamy (zámek)? Jen s oprávněním `private.read`, které má vlastník (role `owner`) a které
 * nejde přidělit jiné roli. Partner nikdy; systémový aktér (úlohy, n8n) ano.
 */
export function canSeePrivate(ctx: Ctx): boolean {
  return scopeOf(ctx, "private.read") !== null;
}

/** Aktér musí mít kterékoli z oprávnění (`PermissionError`, když žádné). */
export function assertCanAny(ctx: Ctx, ...keys: string[]): void {
  if (!keys.some((k) => can(ctx, k))) throw new PermissionError();
}

export function assertCan(ctx: Ctx, key: string, record?: OwnedRecord): void {
  if (!can(ctx, key, record)) throw new PermissionError();
}

/** Vrátí rozsah, nebo vyhodí PermissionError. */
export function requireScope(ctx: Ctx, key: string): Scope {
  const scope = scopeOf(ctx, key);
  if (!scope) throw new PermissionError();
  return scope;
}

/**
 * Podmínka do `WHERE` pro seznamy: u rozsahu `all` nic (`undefined`), u `own` jen záznamy,
 * kde je aktér v kterémkoli ze sloupců s vlastníkem. Bez oprávnění vyhodí PermissionError.
 * Každý dotaz nad záznamy s rozsahem musí podmínku použít (kontrola je v datové vrstvě).
 */
export function scopedWhere(
  ctx: Ctx,
  key: string,
  ownerColumns: readonly AnyColumn[],
): SQL | undefined {
  const scope = requireScope(ctx, key);
  if (scope === "all") return undefined;
  const me = ctx.actor.userId;
  if (!me || ownerColumns.length === 0) return sql`false`;
  const conds = ownerColumns.map((c) => eq(c, me));
  return conds.length === 1 ? conds[0] : or(...conds);
}
