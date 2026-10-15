import { asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { queryRecords, resolveEntity } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { PermissionError, scopeOf, type Ctx } from "@rebar/core/rbac";
import {
  addDaysIso,
  eachDayIso,
  holidayName,
  isWorkday,
  todayIso,
  weekStartIso,
} from "@rebar/core/time";
import { me, myEntries, readScope, visibleEntries } from "../access";
import type {
  EntryDto,
  ForTaskOutput,
  JobRef,
  JobSummaryOutput,
  JobsOutput,
  ReportInput,
  ReportOutput,
  WeekOutput,
} from "../contract";
import { computeJobEffort } from "../logic/effort";
import { buildWeekGrid } from "../logic/grid";
import { dayTotals, groupHours, periodOf, type HourFact } from "../logic/report";
import { timeEntry } from "../schema";
import { estimateOf, incomeByUser, jobRefs, loadJob, loadTask, taskTitles, userNames } from "./lookups";

type Row = typeof timeEntry.$inferSelect;

/** Zakázka, ke které aktér nemá přístup, ale hodiny na ní jsou (zakázka se mezitím zamkla nebo ztratil členství). */
const hiddenJob = (id: string): JobRef => ({
  id,
  number: null,
  title: "Jiná zakázka",
  status: null,
  isPrivate: false,
});

const byTitle = (a: JobRef, b: JobRef) =>
  a.title.localeCompare(b.title, "cs") || a.id.localeCompare(b.id);

function entryDto(r: Row, titles: Record<string, string>): EntryDto {
  return {
    id: r.id,
    userId: r.userId,
    jobId: r.jobId,
    taskId: r.taskId,
    taskTitle: r.taskId ? (titles[r.taskId] ?? null) : null,
    date: r.date,
    minutes: r.minutes,
    note: r.note,
  };
}

/** Týdenní výkaz přihlášeného: mřížka zakázka × den, záznamy týdne a nabídka zakázek z posledních týdnů. */
export async function weekView(
  ctx: Ctx,
  deps: ModuleDeps,
  weekStart: string | undefined,
): Promise<WeekOutput> {
  readScope(ctx);
  const today = todayIso();
  const start = weekStartIso(weekStart ?? today);
  const end = addDaysIso(start, 6);
  const days = eachDayIso(start, end);

  const rows = await ctx.db
    .select()
    .from(timeEntry)
    .where(myEntries(ctx, gte(timeEntry.date, start), lte(timeEntry.date, end)))
    .orderBy(asc(timeEntry.date), asc(timeEntry.createdAt));
  const grid = buildWeekGrid(days, rows);
  const refs = await jobRefs(
    ctx,
    deps,
    grid.rows.map((r) => r.jobId),
  );
  const titles = await taskTitles(
    ctx,
    deps,
    rows.map((r) => r.taskId).filter((t): t is string => !!t),
  );

  const present = new Set(grid.rows.map((r) => r.jobId));
  const recent = await ctx.db
    .select({ jobId: timeEntry.jobId, last: sql<string>`max(${timeEntry.date})` })
    .from(timeEntry)
    .where(myEntries(ctx, gte(timeEntry.date, addDaysIso(start, -28)), lt(timeEntry.date, start)))
    .groupBy(timeEntry.jobId)
    .orderBy(desc(sql`max(${timeEntry.date})`))
    .limit(20);
  const recentRefs = await jobRefs(
    ctx,
    deps,
    recent.map((r) => r.jobId).filter((id) => !present.has(id)),
  );

  return {
    weekStart: start,
    weekEnd: end,
    today,
    days: days.map((date) => ({
      date,
      holiday: holidayName(date) ?? null,
      workday: isWorkday(date),
      minutes: grid.dayTotals[date] ?? 0,
    })),
    rows: grid.rows
      .map((r) => ({
        job: refs.get(r.jobId) ?? hiddenJob(r.jobId),
        cells: r.cells,
        totalMinutes: r.totalMinutes,
      }))
      .sort((a, b) => byTitle(a.job, b.job)),
    totalMinutes: grid.totalMinutes,
    entries: rows.map((r) => entryDto(r, titles)),
    recentJobs: recent
      .map((r) => recentRefs.get(r.jobId))
      .filter((j): j is JobRef => !!j)
      .slice(0, 8),
  };
}

/** Zakázky, ke kterým jde zapsat čas: aktivní, plánované a pozastavené (s `includeClosed` i hotové), podle názvu. */
export async function pickJobs(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { q?: string | undefined; includeClosed?: boolean | undefined },
): Promise<JobsOutput> {
  const def = deps.registry.get("job");
  if (!def || !scopeOf(ctx, def.permissions.read)) return [];
  const found = await queryRecords(ctx, deps.registry, await resolveEntity(ctx.db, def), {
    ...(input.q ? { q: input.q } : {}),
    ...(input.includeClosed
      ? {}
      : {
          filters: {
            op: "and" as const,
            conditions: [
              { attr: "status", op: "is_any_of" as const, value: ["planned", "active", "paused"] },
            ],
          },
        }),
    sort: [{ attr: "title", dir: "asc" }],
    limit: 30,
  });
  const refs = await jobRefs(
    ctx,
    deps,
    found.rows.map((r) => r.id),
  );
  return found.rows.map((r) => refs.get(r.id)).filter((j): j is JobRef => !!j);
}

/** Čas zapsaný u úkolu: zakázka úkolu, odhad, součty a záznamy (jen ty, které aktér smí číst). */
export async function taskView(
  ctx: Ctx,
  deps: ModuleDeps,
  taskId: string,
): Promise<ForTaskOutput> {
  readScope(ctx);
  const task = await loadTask(ctx, deps, taskId);
  const job = task.jobId ? ((await jobRefs(ctx, deps, [task.jobId])).get(task.jobId) ?? null) : null;
  const rows = await ctx.db
    .select()
    .from(timeEntry)
    .where(visibleEntries(ctx, eq(timeEntry.taskId, taskId)))
    .orderBy(desc(timeEntry.date), desc(timeEntry.createdAt))
    .limit(200);
  const names = await userNames(
    ctx,
    rows.map((r) => r.userId),
  );
  const mine = me(ctx);
  return {
    taskId,
    taskTitle: task.title,
    job,
    estimateMin: task.estimateMin && task.estimateMin > 0 ? task.estimateMin : null,
    totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
    myMinutes: rows.filter((r) => r.userId === mine).reduce((a, r) => a + r.minutes, 0),
    entries: rows.map((r) => ({ ...entryDto(r, { [taskId]: task.title }), userName: names[r.userId] ?? "" })),
  };
}

/** Přehled hodin za týden nebo měsíc: moje, nebo všech (jen s rozsahem „vše“), podle zakázky nebo osoby. */
export async function report(
  ctx: Ctx,
  deps: ModuleDeps,
  input: ReportInput,
): Promise<ReportOutput> {
  const canSeeAll = readScope(ctx) === "all";
  const scope = input.scope ?? "mine";
  if (scope === "all" && !canSeeAll)
    throw new PermissionError("Hodiny ostatních smíte vidět jen s oprávněním k hodinám všech.");
  const by = input.by ?? "job";
  const period = periodOf(input.period ?? "week", input.anchor ?? todayIso());
  const rows = await ctx.db
    .select({
      userId: timeEntry.userId,
      jobId: timeEntry.jobId,
      date: timeEntry.date,
      minutes: sql<number>`sum(${timeEntry.minutes})::int`,
    })
    .from(timeEntry)
    .where(
      visibleEntries(
        ctx,
        gte(timeEntry.date, period.from),
        lte(timeEntry.date, period.to),
        scope === "mine" ? eq(timeEntry.userId, me(ctx)) : undefined,
      ),
    )
    .groupBy(timeEntry.userId, timeEntry.jobId, timeEntry.date);
  const facts: HourFact[] = rows.map((r) => ({ ...r, minutes: Number(r.minutes) }));
  const groups = groupHours(facts, by);
  const total = facts.reduce((a, f) => a + f.minutes, 0);

  const jobIds = [...new Set(facts.map((f) => f.jobId))];
  const jobs = await jobRefs(ctx, deps, jobIds);
  const names = await userNames(ctx, [...new Set(facts.map((f) => f.userId))]);
  const jobLabel = (id: string) => {
    const j = jobs.get(id);
    return j ? (j.number ? `${j.number} · ${j.title}` : j.title) : "Jiná zakázka";
  };
  const personLabel = (id: string) => names[id] ?? "Uživatel";
  const [groupLabel, partLabel] = by === "job" ? [jobLabel, personLabel] : [personLabel, jobLabel];

  return {
    period: period.kind,
    from: period.from,
    to: period.to,
    scope,
    by,
    totalMinutes: total,
    rows: groups.map((g) => ({
      id: g.id,
      label: groupLabel(g.id),
      minutes: g.minutes,
      sharePct: total > 0 ? Math.round((g.minutes / total) * 1000) / 10 : 0,
      parts: g.parts.map((p) => ({ id: p.id, label: partLabel(p.id), minutes: p.minutes })),
    })),
    days: dayTotals(period, facts),
    canSeeAll,
  };
}

/**
 * Souhrn hodin zakázky (HOD-03): odpracováno vs. odhad úkolů a efektivní hodinová sazba každého (jeho podíl na příjmech
 * ÷ jeho hodiny). Peníze jen s `finance.read` a s rozsahem „vše“ u hodin (jinak by chyběly hodiny druhého).
 */
export async function jobSummary(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
): Promise<JobSummaryOutput> {
  const scope = readScope(ctx);
  const job = await loadJob(ctx, deps, jobId);
  const perUser = await ctx.db
    .select({ userId: timeEntry.userId, minutes: sql<number>`sum(${timeEntry.minutes})::int` })
    .from(timeEntry)
    .where(visibleEntries(ctx, eq(timeEntry.jobId, jobId)))
    .groupBy(timeEntry.userId);
  const estimate = await estimateOf(ctx, deps, jobId);
  const income = scope === "all" ? await incomeByUser(ctx, deps, jobId) : null;
  const effort = computeJobEffort({
    hours: perUser.map((r) => ({ userId: r.userId, minutes: Number(r.minutes) })),
    estimateMin: estimate?.estimateMin ?? null,
    incomeByUser: income,
  });

  const recentRows = await ctx.db
    .select()
    .from(timeEntry)
    .where(visibleEntries(ctx, eq(timeEntry.jobId, jobId)))
    .orderBy(desc(timeEntry.date), desc(timeEntry.createdAt))
    .limit(10);
  const names = await userNames(ctx, [
    ...effort.users.map((u) => u.userId),
    ...recentRows.map((r) => r.userId),
  ]);
  const titles = await taskTitles(
    ctx,
    deps,
    recentRows.map((r) => r.taskId).filter((t): t is string => !!t),
  );
  return {
    job,
    scope,
    workedMinutes: effort.workedMinutes,
    estimateMin: effort.estimateMin,
    estimateTasks: estimate?.tasks ?? null,
    remainingMinutes: effort.remainingMinutes,
    overrunMinutes: effort.overrunMinutes,
    progressPct: effort.progressPct,
    users: effort.users.map((u) => ({ ...u, name: names[u.userId] ?? "Uživatel" })),
    moneyAvailable: income !== null,
    totalIncomeMinor: effort.totalIncomeMinor,
    effectiveRateMinor: effort.effectiveRateMinor,
    recent: recentRows.map((r) => ({ ...entryDto(r, titles), userName: names[r.userId] ?? "" })),
  };
}
