import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { privateScope } from "@rebar/core/entities";
import { PermissionError, scopeOf, type Ctx } from "@rebar/core/rbac";
import { task } from "../schema";

/** Rozsah „jen moje“ pro úkoly: přidělený mně, nebo jsem ho zadal. */
export function ownTaskScope(ctx: Ctx): SQL {
  const me = ctx.actor.userId;
  if (!me) return sql`false`;
  return or(eq(task.assigneeId, me), eq(task.createdBy, me))!;
}

/**
 * Podmínka `WHERE` pro každý ruční dotaz nad tabulkou `task`: nesmazané, bez soukromých záznamů cizích aktérů
 * (`privateScope`) a s rozsahem „jen moje“, má-li aktér `ukoly.read` jen takto. Bez oprávnění `ukoly.read` vyhodí
 * `PermissionError`; `lenient` (služby pro jiné moduly) bez oprávnění `ukoly.read` bere jen sdílené záznamy.
 */
export function visibleTasks(ctx: Ctx, opts: { lenient?: boolean } = {}): SQL {
  const scope = scopeOf(ctx, "ukoly.read");
  if (!scope && !opts.lenient) throw new PermissionError();
  return and(
    isNull(task.deletedAt),
    privateScope(ctx, task),
    scope === "own" ? ownTaskScope(ctx) : undefined,
  )!;
}
