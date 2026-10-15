import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { visibleRecordTitles } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, type Ctx } from "@rebar/core/rbac";
import { addDaysIso, localParts, todayIso } from "@rebar/core/time";
import { task, taskAttendee, taskType } from "../schema";
import type {
  ListTasksInput,
  ListTasksResult,
  RecordTasksResult,
  TaskAttendee,
  TaskCounts,
  TaskDetailDto,
  TaskDto,
  TaskLinkDto,
} from "../contract";
import { CLOSED_STATUSES, OPEN_STATUSES, type TaskPriority, type TaskStatus } from "./constants";
import type { TaskRow } from "./events";
import { dueState, normalizeTime } from "./logic/due";
import { phaseNames, readColumns } from "./external";
import { visibleTasks } from "./scope";

const OPEN = [...OPEN_STATUSES];
const CLOSED = [...CLOSED_STATUSES];
const open = () => inArray(task.status, OPEN);

const PRIORITY_RANK = sql`case ${task.priority} when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end`;

/** Je úkol po termínu (otevřený; datum v minulosti, nebo dnes a čas už uplynul)? SQL podmínka. */
export function overdueCond(now: Date): SQL {
  const { date, time } = localParts(now);
  return and(
    open(),
    sql`(${task.dueDate} < ${date}::date or (${task.dueDate} = ${date}::date and ${task.dueTime} is not null and ${task.dueTime} < ${time}::time))`,
  )!;
}

/* ---------- řádky → DTO ---------- */

const link = (id: string | null, titles: Record<string, string>): TaskLinkDto | null =>
  id ? { id, title: titles[id] ?? null } : null;

/**
 * Úkoly v podobě pro UI: typ (ikona, barva), jména (řešitel, zadavatel), názvy vazeb jen z toho, co aktér smí vidět,
 * počty podúkolů, číslo zakázky a název fáze, stav termínu. Pevný počet dotazů (bez N+1).
 */
export async function toTaskDtos(
  ctx: Ctx,
  deps: ModuleDeps,
  rows: readonly TaskRow[],
  now: Date = new Date(),
): Promise<TaskDto[]> {
  if (!rows.length) return [];
  const ids = (pick: (r: TaskRow) => string | null) => [
    ...new Set(rows.map(pick).filter((v): v is string => !!v)),
  ];
  const taskIds = rows.map((r) => r.id);
  const types = new Map((await ctx.db.select().from(taskType)).map((t) => [t.key, t]));
  const userIds = [...new Set([...ids((r) => r.assigneeId), ...ids((r) => r.createdBy)])];
  const users = userIds.length
    ? new Map(
        (
          await ctx.db
            .select({ id: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(inArray(schema.user.id, userIds))
        ).map((u) => [u.id, u.name]),
      )
    : new Map<string, string>();
  const titles = (entity: string, list: string[]): Promise<Record<string, string>> =>
    list.length ? visibleRecordTitles(ctx, deps.registry, entity, list) : Promise.resolve({});
  const [deals, companies, persons, jobs, parents] = await Promise.all([
    titles(
      "deal",
      ids((r) => r.dealId),
    ),
    titles(
      "company",
      ids((r) => r.companyId),
    ),
    titles(
      "person",
      ids((r) => r.personId),
    ),
    titles(
      "job",
      ids((r) => r.jobId),
    ),
    ids((r) => r.parentId).length
      ? ctx.db
          .select({ id: task.id, title: task.title })
          .from(task)
          .where(
            and(
              inArray(
                task.id,
                ids((r) => r.parentId),
              ),
              visibleTasks(ctx),
            ),
          )
          .then((x) => new Map(x.map((p) => [p.id, p.title])))
      : Promise.resolve(new Map<string, string>()),
  ]);
  const visibleJobIds = Object.keys(jobs);
  const [jobInfo, phases, subCounts] = await Promise.all([
    readColumns(ctx.db, deps.registry, "job", visibleJobIds, ["number"]),
    phaseNames(
      ctx.db,
      deps.registry,
      ids((r) => (r.jobId && jobs[r.jobId] ? r.jobPhaseId : null)),
    ),
    ctx.db
      .select({
        parentId: task.parentId,
        total: count(),
        done: sql<number>`count(*) filter (where ${task.status} = 'done')::int`,
      })
      .from(task)
      .where(and(inArray(task.parentId, taskIds), visibleTasks(ctx)))
      .groupBy(task.parentId),
  ]);
  const subs = new Map(subCounts.map((s) => [s.parentId, s]));
  const me = ctx.actor.userId;
  return rows.map((r) => {
    const t = types.get(r.typeKey);
    const sub = subs.get(r.id);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      typeKey: r.typeKey,
      typeName: t?.name ?? r.typeKey,
      typeIcon: t?.icon ?? null,
      typeColor: t?.color ?? null,
      isCalendarEvent: t?.isCalendarEvent ?? false,
      status: r.status as TaskStatus,
      priority: r.priority as TaskPriority,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeId ? (users.get(r.assigneeId) ?? null) : null,
      createdById: r.createdBy,
      createdByName: r.createdBy ? (users.get(r.createdBy) ?? null) : null,
      dueDate: r.dueDate,
      dueTime: normalizeTime(r.dueTime),
      durationMin: r.durationMin,
      allDay: r.allDay,
      place: r.place,
      estimateMin: r.estimateMin,
      outcome: r.outcome,
      completedAt: r.completedAt?.toISOString() ?? null,
      parentId: r.parentId,
      parentTitle: r.parentId ? (parents.get(r.parentId) ?? null) : null,
      subtasks: { total: sub?.total ?? 0, done: sub?.done ?? 0 },
      deal: link(r.dealId, deals),
      company: link(r.companyId, companies),
      person: link(r.personId, persons),
      job: link(r.jobId, jobs),
      jobNumber: r.jobId ? ((jobInfo.get(r.jobId)?.number as string | undefined) ?? null) : null,
      jobPhaseId: r.jobPhaseId,
      jobPhaseName: r.jobPhaseId ? (phases.get(r.jobPhaseId) ?? null) : null,
      tags: r.tags,
      sendInvites: r.sendInvites,
      state: dueState(r, now),
      isPrivate: r.isPrivate,
      delegated: !!me && r.createdBy === me && !!r.assigneeId && r.assigneeId !== me,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** Úkol podle id v podobě pro UI; kdo ho nesmí vidět, tomu neexistuje. */
export async function getTaskDto(
  ctx: Ctx,
  deps: ModuleDeps,
  id: string,
  now: Date = new Date(),
): Promise<TaskDto> {
  const [row] = await ctx.db
    .select()
    .from(task)
    .where(and(eq(task.id, id), visibleTasks(ctx)));
  if (!row) throw new NotFoundError("Úkol nenalezen.");
  return (await toTaskDtos(ctx, deps, [row], now))[0]!;
}

/** Úkol s podúkoly a účastníky. */
export async function getTask(
  ctx: Ctx,
  deps: ModuleDeps,
  id: string,
  now: Date = new Date(),
): Promise<TaskDetailDto> {
  const dto = await getTaskDto(ctx, deps, id, now);
  const kids = await ctx.db
    .select()
    .from(task)
    .where(and(eq(task.parentId, id), visibleTasks(ctx)))
    .orderBy(asc(task.createdAt));
  const attendeeRows = await ctx.db
    .select()
    .from(taskAttendee)
    .where(and(eq(taskAttendee.taskId, id), isNull(taskAttendee.deletedAt)))
    .orderBy(asc(taskAttendee.createdAt));
  const userRefs = attendeeRows.filter((a) => a.kind === "user").map((a) => a.ref);
  const personRefs = attendeeRows.filter((a) => a.kind === "person").map((a) => a.ref);
  const userNames = userRefs.length
    ? new Map(
        (
          await ctx.db
            .select({ id: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(inArray(schema.user.id, userRefs))
        ).map((u) => [u.id, u.name]),
      )
    : new Map<string, string>();
  const personNames = personRefs.length
    ? await visibleRecordTitles(ctx, deps.registry, "person", personRefs)
    : {};
  return {
    ...dto,
    subtaskList: await toTaskDtos(ctx, deps, kids, now),
    attendees: attendeeRows.map((a) => ({
      kind: a.kind,
      ref: a.ref,
      label:
        a.kind === "user"
          ? (userNames.get(a.ref) ?? null)
          : a.kind === "person"
            ? (personNames[a.ref] ?? null)
            : null,
    })) as (TaskAttendee & { label: string | null })[],
  };
}

/* ---------- seznamy ---------- */

/** Podmínky seznamu „Moje úkoly“ z pohledu a filtrů. */
function listConditions(ctx: Ctx, input: ListTasksInput, now: Date): SQL[] {
  const me = ctx.actor.userId;
  const today = todayIso("Europe/Prague", now);
  const view = input.view ?? "today";
  const conds: SQL[] = [visibleTasks(ctx)];
  if (input.includeSubtasks === false) conds.push(isNull(task.parentId));

  if (view === "delegated") {
    conds.push(
      me
        ? and(eq(task.createdBy, me), sql`${task.assigneeId} is not null`, ne(task.assigneeId, me))!
        : sql`false`,
    );
  } else if (input.assigneeId) conds.push(eq(task.assigneeId, input.assigneeId));
  else if ((input.scope ?? "mine") === "mine")
    conds.push(me ? eq(task.assigneeId, me) : sql`false`);

  switch (view) {
    case "today":
      conds.push(open(), sql`${task.dueDate} <= ${today}::date`);
      break;
    case "next7":
      conds.push(
        open(),
        sql`${task.dueDate} > ${today}::date and ${task.dueDate} <= ${addDaysIso(today, 7)}::date`,
      );
      break;
    case "nodate":
      conds.push(open(), isNull(task.dueDate));
      break;
    case "delegated":
      conds.push(open());
      break;
    case "done":
      conds.push(eq(task.status, "done"));
      break;
    case "all":
      break;
  }

  if (input.typeKey) conds.push(eq(task.typeKey, input.typeKey));
  if (input.status?.length) conds.push(inArray(task.status, input.status));
  if (input.priority?.length) conds.push(inArray(task.priority, input.priority));
  if (input.dealId) conds.push(eq(task.dealId, input.dealId));
  if (input.companyId) conds.push(eq(task.companyId, input.companyId));
  if (input.personId) conds.push(eq(task.personId, input.personId));
  if (input.jobId) conds.push(eq(task.jobId, input.jobId));
  if (input.jobPhaseId) conds.push(eq(task.jobPhaseId, input.jobPhaseId));
  if (input.tag) conds.push(sql`${task.tags} @> array[${input.tag}]::text[]`);
  if (input.calendarOnly)
    conds.push(
      sql`${task.typeKey} in (select ${taskType.key} from ${taskType} where ${taskType.isCalendarEvent} and ${taskType.deletedAt} is null)`,
    );
  if (input.q) {
    const like = `%${input.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(task.title, like), ilike(task.description, like))!);
  }
  return conds;
}

function listOrder(input: ListTasksInput): SQL[] {
  const view = input.view ?? "today";
  const sort = input.sort ?? (view === "done" ? "updated" : "due");
  const asc_ = (input.dir ?? (view === "done" ? "desc" : "asc")) === "asc";
  const dir = (c: SQL | typeof task.createdAt | typeof task.title | typeof task.updatedAt) =>
    asc_ ? asc(c) : desc(c);
  switch (sort) {
    case "priority":
      return [dir(PRIORITY_RANK), asc(sql`${task.dueDate} asc nulls last`)];
    case "created":
      return [dir(task.createdAt)];
    case "title":
      return [dir(task.title)];
    case "updated":
      return [
        view === "done"
          ? desc(sql`coalesce(${task.completedAt}, ${task.updatedAt})`)
          : dir(task.updatedAt),
      ];
    default:
      return [
        asc_ ? sql`${task.dueDate} asc nulls last` : sql`${task.dueDate} desc nulls last`,
        sql`${task.dueTime} asc nulls last`,
        desc(PRIORITY_RANK),
        asc(task.createdAt),
      ];
  }
}

/** Seznam úkolů: pohledy „Moje úkoly“ (UKO-04) a obecný výpis s filtry; seskupení dělá UI. */
export async function listTasks(
  ctx: Ctx,
  deps: ModuleDeps,
  input: ListTasksInput,
  now: Date = new Date(),
): Promise<ListTasksResult> {
  const where = and(...listConditions(ctx, input, now));
  const [{ n } = { n: 0 }] = await ctx.db.select({ n: count() }).from(task).where(where);
  const rows = await ctx.db
    .select()
    .from(task)
    .where(where)
    .orderBy(...listOrder(input))
    .limit(input.limit ?? 200)
    .offset(input.offset ?? 0);
  return { rows: await toTaskDtos(ctx, deps, rows, now), total: n };
}

/** Úkoly u obchodu, organizace, kontaktu nebo zakázky: otevřené podle termínu a nedávno dokončené. */
export async function tasksForRecord(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    dealId?: string | undefined;
    companyId?: string | undefined;
    personId?: string | undefined;
    jobId?: string | undefined;
    include?: "open" | "done" | "all" | undefined;
    limit?: number | undefined;
  },
  now: Date = new Date(),
): Promise<RecordTasksResult> {
  const links: SQL[] = [];
  if (input.dealId) links.push(eq(task.dealId, input.dealId));
  if (input.companyId) links.push(eq(task.companyId, input.companyId));
  if (input.personId) links.push(eq(task.personId, input.personId));
  if (input.jobId) links.push(eq(task.jobId, input.jobId));
  const base = and(visibleTasks(ctx), isNull(task.parentId), or(...links));
  const include = input.include ?? "all";
  const limit = input.limit ?? 200;
  const openRows =
    include === "done"
      ? []
      : await ctx.db
          .select()
          .from(task)
          .where(and(base, open()))
          .orderBy(
            sql`${task.dueDate} asc nulls last`,
            sql`${task.dueTime} asc nulls last`,
            asc(task.createdAt),
          )
          .limit(limit);
  const doneRows =
    include === "open"
      ? []
      : await ctx.db
          .select()
          .from(task)
          .where(and(base, inArray(task.status, CLOSED)))
          .orderBy(desc(sql`coalesce(${task.completedAt}, ${task.updatedAt})`))
          .limit(Math.min(limit, 100));
  const [stats] = await ctx.db
    .select({
      open: sql<number>`count(*) filter (where ${open()})::int`,
      overdue: sql<number>`count(*) filter (where ${overdueCond(now)})::int`,
      done: sql<number>`count(*) filter (where ${eq(task.status, "done")})::int`,
    })
    .from(task)
    .where(base);
  const dtos = await toTaskDtos(ctx, deps, [...openRows, ...doneRows], now);
  return {
    open: dtos.slice(0, openRows.length),
    done: dtos.slice(openRows.length),
    counts: { open: stats?.open ?? 0, overdue: stats?.overdue ?? 0, done: stats?.done ?? 0 },
  };
}

/** Počty pro záložky „Moje úkoly“ (otevřené úkoly přidělené mně a delegované). */
export async function taskCounts(ctx: Ctx, now: Date = new Date()): Promise<TaskCounts> {
  const me = ctx.actor.userId;
  if (!me) return { today: 0, overdue: 0, next7: 0, nodate: 0, delegated: 0 };
  const today = todayIso("Europe/Prague", now);
  const mine = eq(task.assigneeId, me);
  const delegated = and(
    eq(task.createdBy, me),
    sql`${task.assigneeId} is not null`,
    ne(task.assigneeId, me),
  )!;
  const [r] = await ctx.db
    .select({
      today: sql<number>`count(*) filter (where ${and(mine, sql`${task.dueDate} <= ${today}::date`)})::int`,
      overdue: sql<number>`count(*) filter (where ${and(mine, overdueCond(now))})::int`,
      next7: sql<number>`count(*) filter (where ${and(mine, sql`${task.dueDate} > ${today}::date and ${task.dueDate} <= ${addDaysIso(today, 7)}::date`)})::int`,
      nodate: sql<number>`count(*) filter (where ${and(mine, isNull(task.dueDate))})::int`,
      delegated: sql<number>`count(*) filter (where ${delegated})::int`,
    })
    .from(task)
    .where(and(visibleTasks(ctx), open(), or(mine, delegated)));
  return {
    today: r?.today ?? 0,
    overdue: r?.overdue ?? 0,
    next7: r?.next7 ?? 0,
    nodate: r?.nodate ?? 0,
    delegated: r?.delegated ?? 0,
  };
}
