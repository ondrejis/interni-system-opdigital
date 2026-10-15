import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { schema, type Executor } from "@rebar/core/db";
import { canSeePrivate, scopeOf, type Ctx } from "@rebar/core/rbac";
import { job, jobMember } from "./schema";

export { canSeePrivate };

/**
 * Podmínka do `WHERE`, která ze soukromých záznamů nechá jen ty, které aktér smí vidět (vlastník vše, ostatní
 * jen nesoukromé). Povinná v každém ručním čtení modulu (D §5.1). Stejná jako `privateScope` z jádra; místní kopie
 * proto, aby modul nezávisel na pořadí dodávek C1.
 */
export function privateScope(ctx: Ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined {
  return canSeePrivate(ctx) ? undefined : sql`not ${table.isPrivate}`;
}

/** Rozsah „jen moje“ u zakázek: vlastník nebo člen týmu. `undefined` = rozsah „vše“. */
export function jobOwnScope(ctx: Ctx, key = "zakazky.read"): SQL | undefined {
  const scope = scopeOf(ctx, key);
  if (!scope) return sql`false`;
  if (scope === "all") return undefined;
  const me = ctx.actor.userId;
  if (!me) return sql`false`;
  return or(
    eq(job.ownerId, me),
    sql`exists (select 1 from ${jobMember} where ${jobMember.jobId} = ${job.id} and ${jobMember.userId} = ${me} and ${jobMember.deletedAt} is null)`,
  );
}

/**
 * Zakázky, které aktér smí číst: nesmazané, v rozsahu oprávnění `zakazky.read` a bez cizích soukromých. Použít
 * ve všech ručních dotazech (metriky, vrstvy, služby, příspěvky karty klienta).
 */
export function visibleJobs(ctx: Ctx, ...extra: (SQL | undefined)[]): SQL {
  return and(isNull(job.deletedAt), jobOwnScope(ctx), privateScope(ctx, job), ...extra)!;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Je záznam právě soukromý? Čte `private_record`, takže nepotřebuje znát tabulku entity. */
export async function isPrivateRecord(
  db: Executor,
  entityType: string,
  id: string,
): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(schema.privateRecord)
    .where(
      and(eq(schema.privateRecord.entityType, entityType), eq(schema.privateRecord.entityId, id)),
    );
  return !!row;
}

/** Zapíše (nebo odebere) záznam v `private_record` společně se změnou zámku (průřezové dotazy bez znalosti tabulek). */
export async function syncPrivateRecord(
  db: Executor,
  entityType: string,
  id: string,
  isPrivate: boolean,
): Promise<void> {
  if (isPrivate)
    await db
      .insert(schema.privateRecord)
      .values({ entityType, entityId: id })
      .onConflictDoNothing();
  else
    await db
      .delete(schema.privateRecord)
      .where(
        and(eq(schema.privateRecord.entityType, entityType), eq(schema.privateRecord.entityId, id)),
      );
}
