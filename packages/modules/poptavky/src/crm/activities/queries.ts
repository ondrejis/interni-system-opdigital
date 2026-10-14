import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { assertEntityAccess, visibleRecordTitles, type EntityRegistry } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";
import { person } from "@rebar/kontakty/schema";
import { job, jobParticipant } from "@rebar/zakazky/schema";
import { crmActivity, crmActivityType, crmNote } from "../../schema";
import { dayOf, rangeBounds } from "./logic";
import { toNoteDtos, visibleNotes } from "./notes";
import { toActivityDtos, visibleActivities, type ActivityRow } from "./service";
import type { ActivityDto, ActivityRange, ListMineResult, NoteDto, UpcomingResult } from "./types";

/** Na co se aktivita nebo poznámka váže; stačí jedna vazba, `aggregate` přidá zakázky a osoby firmy (osoby: její zakázky). */
export type Target = { jobId?: string; companyId?: string; personId?: string };

/** Zakázky, firmy a osoby, ke kterým se osa nebo seznam vztahuje. */
export type TargetSets = { jobIds: string[]; companyIds: string[]; personIds: string[] };

/** Strop zakázek a osob, ze kterých se skládá souhrnná osa firmy nebo osoby. */
const AGGREGATE_LIMIT = 60;

/**
 * Záznamy, ke kterým se osa nebo seznam vztahuje. Aktér musí smět číst zadaný záznam (jinak NotFound); zakázky a osoby
 * navíc jen ty, které smí vidět. Bez `aggregate` jen to, co je zadané.
 */
export async function resolveTargets(
  ctx: Ctx,
  registry: EntityRegistry,
  target: Target,
  aggregate: boolean,
): Promise<TargetSets> {
  const sets: TargetSets = { jobIds: [], companyIds: [], personIds: [] };
  if (target.jobId) {
    await assertEntityAccess(ctx, "job", target.jobId, "read");
    sets.jobIds.push(target.jobId);
  }
  if (target.companyId) {
    await assertEntityAccess(ctx, "company", target.companyId, "read");
    sets.companyIds.push(target.companyId);
    if (aggregate) {
      const jobs = await ctx.db
        .select({ id: job.id })
        .from(job)
        .where(and(eq(job.companyId, target.companyId), isNull(job.deletedAt)))
        .orderBy(desc(job.createdAt))
        .limit(AGGREGATE_LIMIT);
      const persons = await ctx.db
        .select({ id: person.id })
        .from(person)
        .where(and(eq(person.companyId, target.companyId), isNull(person.deletedAt)))
        .limit(AGGREGATE_LIMIT);
      sets.jobIds.push(
        ...Object.keys(
          await visibleRecordTitles(
            ctx,
            registry,
            "job",
            jobs.map((j) => j.id),
          ),
        ),
      );
      sets.personIds.push(
        ...Object.keys(
          await visibleRecordTitles(
            ctx,
            registry,
            "person",
            persons.map((p) => p.id),
          ),
        ),
      );
    }
  }
  if (target.personId) {
    await assertEntityAccess(ctx, "person", target.personId, "read");
    sets.personIds.push(target.personId);
    if (aggregate) {
      const direct = await ctx.db
        .select({ id: job.id })
        .from(job)
        .where(and(eq(job.personId, target.personId), isNull(job.deletedAt)))
        .limit(AGGREGATE_LIMIT);
      const participant = await ctx.db
        .select({ id: jobParticipant.jobId })
        .from(jobParticipant)
        .where(eq(jobParticipant.personId, target.personId))
        .limit(AGGREGATE_LIMIT);
      const ids = [...new Set([...direct, ...participant].map((r) => r.id))];
      sets.jobIds.push(...Object.keys(await visibleRecordTitles(ctx, registry, "job", ids)));
    }
  }
  const uniq = (l: string[]) => [...new Set(l)];
  return {
    jobIds: uniq(sets.jobIds),
    companyIds: uniq(sets.companyIds),
    personIds: uniq(sets.personIds),
  };
}

/** Aktivity, které se váží na kterýkoli ze záznamů. */
export function activityLinkedTo(sets: TargetSets): SQL {
  const parts: SQL[] = [];
  if (sets.jobIds.length) parts.push(inArray(crmActivity.jobId, sets.jobIds));
  if (sets.companyIds.length) parts.push(inArray(crmActivity.companyId, sets.companyIds));
  if (sets.personIds.length) parts.push(inArray(crmActivity.personId, sets.personIds));
  return parts.length ? or(...parts)! : sql`false`;
}

/** Poznámky, které se váží na kterýkoli ze záznamů. */
export function noteLinkedTo(sets: TargetSets): SQL {
  const parts: SQL[] = [];
  if (sets.jobIds.length)
    parts.push(and(eq(crmNote.entityType, "job"), inArray(crmNote.entityId, sets.jobIds))!);
  if (sets.companyIds.length)
    parts.push(and(eq(crmNote.entityType, "company"), inArray(crmNote.entityId, sets.companyIds))!);
  if (sets.personIds.length)
    parts.push(and(eq(crmNote.entityType, "person"), inArray(crmNote.entityId, sets.personIds))!);
  return parts.length ? or(...parts)! : sql`false`;
}

/** Otevřené aktivity nejdřív (nejbližší termín, bez termínu na konec), pak hotové od nejnovější. */
const orderOpenFirst = [
  sql`(${crmActivity.doneAt} is not null) asc`,
  sql`${crmActivity.dueAt} asc nulls last`,
  sql`${crmActivity.doneAt} desc nulls last`,
  asc(crmActivity.id),
];

/** Aktivity zakázky: otevřené podle termínu, pak hotové od nejnovější. */
export async function listForDeal(
  ctx: Ctx,
  registry: EntityRegistry,
  jobId: string,
  opts: { include?: "open" | "done" | "all"; limit?: number } = {},
): Promise<ActivityDto[]> {
  await assertEntityAccess(ctx, "job", jobId, "read");
  const include = opts.include ?? "all";
  const rows = await ctx.db
    .select()
    .from(crmActivity)
    .where(
      and(
        visibleActivities(ctx),
        eq(crmActivity.jobId, jobId),
        include === "open" ? isNull(crmActivity.doneAt) : undefined,
        include === "done" ? isNotNull(crmActivity.doneAt) : undefined,
      ),
    )
    .orderBy(...orderOpenFirst)
    .limit(opts.limit ?? 200);
  return toActivityDtos(ctx, registry, rows);
}

/**
 * „Další kroky“: nadcházející (otevřené) aktivity a připnuté poznámky záznamu. S `aggregate` i těch zakázek a osob firmy
 * (nebo zakázek osoby), které aktér smí vidět.
 */
export async function listUpcoming(
  ctx: Ctx,
  registry: EntityRegistry,
  target: Target,
  opts: { aggregate?: boolean; limit?: number } = {},
): Promise<UpcomingResult> {
  const sets = await resolveTargets(ctx, registry, target, opts.aggregate === true);
  const [activities, notes] = await Promise.all([
    ctx.db
      .select()
      .from(crmActivity)
      .where(and(visibleActivities(ctx), isNull(crmActivity.doneAt), activityLinkedTo(sets)))
      .orderBy(sql`${crmActivity.dueAt} asc nulls last`, asc(crmActivity.id))
      .limit(opts.limit ?? 50),
    ctx.db
      .select()
      .from(crmNote)
      .where(and(visibleNotes(ctx), eq(crmNote.pinned, true), noteLinkedTo(sets)))
      .orderBy(desc(crmNote.createdAt))
      .limit(20),
  ]);
  return {
    activities: await toActivityDtos(ctx, registry, activities),
    notes: await toNoteDtos(ctx, notes),
  };
}

/** Podmínka rychlého časového filtru (dnešek podle `now` v pražském čase). */
export function rangeWhere(range: ActivityRange, now: Date = new Date()): SQL | undefined {
  const b = rangeBounds(range, now);
  const day = sql`((${crmActivity.dueAt} at time zone 'Europe/Prague')::date)`;
  const parts: (SQL | undefined)[] = [
    b.done ? isNotNull(crmActivity.doneAt) : isNull(crmActivity.doneAt),
  ];
  if (b.fromDay) parts.push(sql`${day} >= ${b.fromDay}::date`);
  if (b.toDay) parts.push(sql`${day} <= ${b.toDay}::date`);
  if (b.overdue) {
    const today = dayOf(now);
    parts.push(
      isNotNull(crmActivity.dueAt),
      sql`(case when ${crmActivity.allDay} then ${day} < ${today}::date else ${crmActivity.dueAt} < ${now.toISOString()}::timestamptz end)`,
    );
  }
  return and(...parts);
}

/** Seznam aktivit s rychlými filtry; `mine` = přiřazeno mně, `all` = vše, co aktér smí vidět. */
export async function listMine(
  ctx: Ctx,
  registry: EntityRegistry,
  opts: {
    scope?: "mine" | "all";
    range?: ActivityRange;
    typeKey?: string;
    limit?: number;
    offset?: number;
  } = {},
  now: Date = new Date(),
): Promise<ListMineResult> {
  const me = ctx.actor.userId;
  const typeIds = opts.typeKey
    ? (
        await ctx.db
          .select({ id: crmActivityType.id })
          .from(crmActivityType)
          .where(and(eq(crmActivityType.key, opts.typeKey), isNull(crmActivityType.deletedAt)))
      ).map((t) => t.id)
    : null;
  const where = and(
    visibleActivities(ctx),
    (opts.scope ?? "mine") === "mine"
      ? me
        ? eq(crmActivity.assigneeId, me)
        : sql`false`
      : undefined,
    rangeWhere(opts.range ?? "open", now),
    typeIds ? (typeIds.length ? inArray(crmActivity.typeId, typeIds) : sql`false`) : undefined,
  );
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select()
      .from(crmActivity)
      .where(where)
      .orderBy(
        ...(opts.range === "done"
          ? [desc(crmActivity.doneAt), asc(crmActivity.id)]
          : orderOpenFirst),
      )
      .limit(Math.min(opts.limit ?? 100, 500))
      .offset(opts.offset ?? 0),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(crmActivity)
      .where(where),
  ]);
  return {
    rows: await toActivityDtos(ctx, registry, rows as ActivityRow[], now),
    total: count?.n ?? 0,
  };
}

/** Jedna aktivita v podobě pro UI, nebo `null`, když neexistuje nebo ji aktér nesmí vidět. */
export async function getActivityDto(
  ctx: Ctx,
  registry: EntityRegistry,
  id: string,
): Promise<ActivityDto | null> {
  const [row] = await ctx.db
    .select()
    .from(crmActivity)
    .where(and(visibleActivities(ctx), eq(crmActivity.id, id)));
  return row ? ((await toActivityDtos(ctx, registry, [row]))[0] ?? null) : null;
}

export type { NoteDto };
