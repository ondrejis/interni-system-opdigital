import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { schema, type Executor } from "@rebar/core/db";
import { loadActor, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { company, person } from "@rebar/kontakty/schema";
import { canSeePrivate, jobOwnScope, privateScope } from "../access";
import { job, jobPhase, jobTemplate } from "../schema";
import type { ServiceType } from "@rebar/core/contracts";

/** Řádek zakázky. */
export type JobRow = typeof job.$inferSelect;
/** Řádek fáze zakázky. */
export type PhaseRow = typeof jobPhase.$inferSelect;
/** Řádek šablony zakázky. */
export type TemplateRow = typeof jobTemplate.$inferSelect;

/** Popisek, který se ukáže místo názvu soukromého záznamu, který aktér nesmí vidět. */
export const PRIVATE_NAME = "Soukromý záznam";

/**
 * Načte zakázku, kterou aktér smí číst (rozsah „jen moje“, soukromé jen vlastník); jinak `NotFoundError`.
 * `lock` zamkne řádek do konce transakce (změny stavu a fází se nesmí překrývat).
 */
export async function loadJob(
  ctx: Ctx,
  id: string,
  opts: { lock?: boolean } = {},
): Promise<JobRow> {
  const q = ctx.db
    .select()
    .from(job)
    .where(and(eq(job.id, id), isNull(job.deletedAt), jobOwnScope(ctx), privateScope(ctx, job)));
  const [row] = await (opts.lock ? q.for("update") : q);
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  return row;
}

/** Fáze zakázky v pořadí (bez smazaných). */
export async function loadPhases(db: Executor, jobId: string): Promise<PhaseRow[]> {
  return db
    .select()
    .from(jobPhase)
    .where(and(eq(jobPhase.jobId, jobId), isNull(jobPhase.deletedAt)))
    .orderBy(asc(jobPhase.position));
}

/** Názvy organizací podle id; soukromou organizaci, kterou aktér nesmí vidět, nahradí popiskem. */
export async function companyNames(ctx: Ctx, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const rows = await ctx.db
    .select({ id: company.id, name: company.name, isPrivate: company.isPrivate })
    .from(company)
    .where(inArray(company.id, unique));
  const mayPrivate = canSeePrivate(ctx);
  for (const r of rows) out.set(r.id, r.isPrivate && !mayPrivate ? PRIVATE_NAME : r.name);
  return out;
}

/** Jména uživatelů podle id. */
export async function userNames(db: Executor, ids: readonly (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(inArray(schema.user.id, unique));
  for (const r of rows) out.set(r.id, r.name);
  return out;
}

/** Jména osob podle id (soukromé osoby, které aktér nesmí vidět, se nahradí popiskem). */
export async function personNames(ctx: Ctx, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const rows = await ctx.db
    .select({ id: person.id, name: person.fullName, isPrivate: person.isPrivate })
    .from(person)
    .where(inArray(person.id, unique));
  const mayPrivate = canSeePrivate(ctx);
  for (const r of rows) out.set(r.id, r.isPrivate && !mayPrivate ? PRIVATE_NAME : (r.name ?? ""));
  return out;
}

/** Ověří, že všichni uvedení uživatelé existují a jsou aktivní; jinak `UserError`. */
export async function assertActiveUsers(db: Executor, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(
        inArray(schema.user.id, unique),
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
      ),
    );
  if (rows.length !== unique.length)
    throw new UserError("Uživatel nenalezen nebo je deaktivovaný.");
}

/**
 * Soukromá zakázka se nesmí přidělit člověku, který soukromé záznamy nevidí (VID-06): ověří, že všichni mají
 * oprávnění `private.read` (nebo jsou vlastník). Jinak `UserError`.
 */
export async function assertMaySeePrivate(db: Executor, ids: readonly string[]): Promise<void> {
  for (const id of new Set(ids)) {
    const actor = await loadActor(db, id);
    if (!actor) throw new UserError("Uživatel nenalezen nebo je deaktivovaný.");
    if (actor.unrestricted || actor.systemRole || actor.permissions.has("private.read")) continue;
    throw new UserError(
      "Soukromou zakázku nejde přidělit uživateli, který soukromé záznamy nevidí. Nejdřív ji zveřejněte.",
    );
  }
}

/**
 * Druhý partner agentury vůči `ownerId` (pro pravidlo „fakturuje druhý“): aktivní uživatel s oprávněním `finance.read`,
 * který není vlastník (nejdřív založený). Bez takového uživatele `null`.
 */
export async function otherPartnerId(db: Executor, ownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.user.roleId))
    .where(
      and(
        ne(schema.user.id, ownerId),
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
        eq(schema.rolePermission.permission, "finance.read"),
      ),
    )
    .orderBy(asc(schema.user.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Výchozí (neaarchivovaná) šablona typu, nebo `null`. */
export async function defaultTemplate(
  db: Executor,
  type: ServiceType,
): Promise<TemplateRow | null> {
  const [row] = await db
    .select()
    .from(jobTemplate)
    .where(
      and(
        eq(jobTemplate.type, type),
        eq(jobTemplate.isDefault, true),
        isNull(jobTemplate.archivedAt),
        isNull(jobTemplate.deletedAt),
      ),
    );
  return row ?? null;
}

/** Šablona podle id (i archivovaná), nebo `null`, když neexistuje. */
export async function loadTemplate(db: Executor, id: string): Promise<TemplateRow | null> {
  const [row] = await db
    .select()
    .from(jobTemplate)
    .where(and(eq(jobTemplate.id, id), isNull(jobTemplate.deletedAt)));
  return row ?? null;
}

/** Počet živých zakázek klienta kromě `exceptJobId` (planned, active, paused), které aktér vidí. */
export async function otherLiveJobs(ctx: Ctx, companyId: string, exceptJobId: string) {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(job)
    .where(
      and(
        eq(job.companyId, companyId),
        ne(job.id, exceptJobId),
        isNull(job.deletedAt),
        sql`${job.status} in ('planned', 'active', 'paused')`,
        privateScope(ctx, job),
      ),
    );
  return r?.n ?? 0;
}
