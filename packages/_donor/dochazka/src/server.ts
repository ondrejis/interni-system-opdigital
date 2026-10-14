import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { schema, type Executor } from "@rebar/core/db";
import { defineEntity, resolveEntity, visibleIds, visibleRecordTitles } from "@rebar/core/entities";
import {
  defineCommand,
  defineModuleJob,
  defineModuleServer,
  type AttentionItem,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { can, inTx, NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import {
  addDaysIso,
  eachDayIso,
  formatMinutes,
  holidayName,
  isWorkday,
  localParts,
  monthFundMinutes,
  monthOf,
  monthRange,
  todayIso,
  weekStartIso,
  workingDays,
  zonedToUtc,
} from "@rebar/core/time";
import {
  assertDayLimit,
  PAID_ABSENCE,
  clockMinutes,
  editedStatus,
  entryMinutes,
  isAbsence,
  TIME_KIND_VALUES,
  TimeRuleError,
  TIME_KINDS,
} from "./rules";
import { dochazkaSetting, type DochazkaSettings } from "./settings";
import { sendEveningReminders, sendForgottenClockOut, sendMissingClockIn } from "./notices";
import { TIME_APPROVED, TIME_RETURNED, TIME_SUBMITTED } from "./notifications";
import { dashboardMetrics } from "./metrics";
import { timeEntry, timeLock } from "./schema";
/* ---------- entita (jen čtení: zapisuje se přes příkazy a stránku Docházka) ---------- */

const READONLY = "Docházku zapisujte na stránce Docházka (týden, píchačka).";

export const timeEntryEntity = defineEntity({
  key: "time_entry",
  listPath: "/dochazka/zaznamy",
  module: "dochazka",
  label: { one: "Záznam docházky", many: "Záznamy docházky" },
  table: timeEntry,
  titleKey: "date",
  permissions: { read: "dochazka.read", write: "dochazka.approve" },
  noCreate: READONLY,
  noDelete: READONLY,
  ownerColumns: [timeEntry.userId],
  beforeCreate: async () => {
    throw new UserError(READONLY);
  },
  afterUpdate: async () => {
    throw new UserError(READONLY);
  },
  beforeDelete: async () => {
    throw new UserError(READONLY);
  },
  attributes: [
    {
      key: "date",
      label: "Datum",
      type: "date",
      field: "date",
      readonly: true,
      width: 120,
      defaultVisible: true,
    },
    {
      key: "user",
      label: "Zaměstnanec",
      type: "user",
      field: "userId",
      readonly: true,
      width: 180,
      defaultVisible: true,
    },
    {
      key: "kind",
      label: "Druh",
      type: "select",
      field: "kind",
      readonly: true,
      choices: TIME_KINDS.map((k) => ({ value: k.value, label: k.label, color: k.color })),
      width: 140,
      defaultVisible: true,
    },
    {
      key: "minutes",
      label: "Minuty",
      type: "number",
      field: "minutes",
      readonly: true,
      aggregate: ["sum"],
      width: 100,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      readonly: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      readonly: true,
      choices: [
        { value: "draft", label: "Rozpracováno", color: "gray" },
        { value: "submitted", label: "Ke schválení", color: "blue" },
        { value: "approved", label: "Schváleno", color: "green" },
        { value: "returned", label: "Vráceno", color: "red" },
      ],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "note",
      label: "Poznámka",
      type: "text",
      field: "note",
      readonly: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "source",
      label: "Zdroj",
      type: "select",
      field: "source",
      readonly: true,
      choices: [
        { value: "manual", label: "Ručně", color: "gray" },
        { value: "clock", label: "Píchačka", color: "teal" },
      ],
      width: 110,
    },
  ],
  search: (r) => ({ title: String(r.date) }),
  url: () => "/dochazka/zaznamy",
});

/* ---------- pomocníky ---------- */

const me = (ctx: Ctx) => {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
};
const canApprove = (ctx: Ctx) => can(ctx, "dochazka.approve");
const bestScope = (ctx: Ctx, keys: readonly string[]): "all" | "own" | null => {
  const scopes = keys.map((k) => scopeOf(ctx, k));
  return scopes.includes("all") ? "all" : scopes.includes("own") ? "own" : null;
};
/** Rozsah, ve kterém aktér vidí docházku jiných: `all` (vedení, kancelář), `own` (mistr: jeho tým), nebo nic. */
const readScope = (ctx: Ctx) => bestScope(ctx, ["dochazka.read", "dochazka.approve"]);
/** Mzdové náklady (sazba × hodiny) vidí jen držitel ekonomiky zakázek, ne ten, kdo jen schvaluje hodiny. */
const canSeeLabourCost = (ctx: Ctx) => can(ctx, "zakazky.finance");

/**
 * Tým aktéra s rozsahem „jen moje“: on sám a lidé, kteří zapsali docházku na zakázky, které aktér smí vidět
 * (vede je, nebo je jejich členem). Cizí lidé se tváří jako neexistující. Modul Zakázky se neimportuje; zakázky
 * dává registr entit.
 */
async function teamUserIds(ctx: Ctx, deps: ModuleDeps): Promise<Set<string>> {
  const self = me(ctx);
  const team = new Set<string>([self]);
  const def = deps.registry.get("job");
  if (!def) return team;
  const jobs = await visibleIds(ctx, await resolveEntity(ctx.db, def), {}, 2000);
  if (!jobs.length) return team;
  const rows = await ctx.db
    .selectDistinct({ userId: timeEntry.userId })
    .from(timeEntry)
    .where(and(inArray(timeEntry.jobId, jobs), isNull(timeEntry.deletedAt)));
  for (const r of rows) team.add(r.userId);
  return team;
}

/** Vlastní docházka: zápis vyžaduje `dochazka.own` (nebo právo schvalovat). */
function selfUser(ctx: Ctx, mode: "read" | "write"): string {
  const self = me(ctx);
  if (mode === "write" && !can(ctx, "dochazka.own") && !canApprove(ctx))
    throw new PermissionError();
  return self;
}

/** Zapisovat za jiné smí jen ten, kdo schvaluje (v rozsahu „vše“, nebo jen svůj tým); zápis za sebe vyžaduje `dochazka.own`. */
async function targetUser(
  ctx: Ctx,
  deps: ModuleDeps,
  userId: string | null | undefined,
  mode: "read" | "write",
): Promise<string> {
  const self = me(ctx);
  const target = userId ?? self;
  if (target === self) return selfUser(ctx, mode);
  const scope = mode === "write" ? bestScope(ctx, ["dochazka.approve"]) : readScope(ctx);
  if (!scope) throw new PermissionError();
  if (scope === "own" && !(await teamUserIds(ctx, deps)).has(target)) throw new NotFoundError();
  return target;
}

async function settingsOf(ctx: Ctx, deps: ModuleDeps): Promise<DochazkaSettings> {
  return deps.settings.get(ctx.db, dochazkaSetting);
}

async function assertMonthOpen(db: Executor, date: string) {
  const [lock] = await db
    .select()
    .from(timeLock)
    .where(eq(timeLock.month, monthOf(date)));
  if (lock)
    throw new UserError(
      `Měsíc ${monthOf(date).split("-").reverse().join("/")} je uzavřený, docházku v něm už nejde měnit.`,
    );
}

async function hourlyCostOf(c: Ctx, userId: string, s: DochazkaSettings): Promise<number> {
  const [e] = await c.db
    .select({ h: schema.employee.hourlyCostMinor })
    .from(schema.employee)
    .where(eq(schema.employee.userId, userId));
  return e?.h ?? s.defaultHourlyCostMinor;
}

async function workloadOf(db: Executor, userId: string): Promise<number> {
  const [e] = await db
    .select({ w: schema.employee.workload })
    .from(schema.employee)
    .where(eq(schema.employee.userId, userId));
  return e ? Number(e.w) : 1;
}

const toRow = (e: typeof timeEntry.$inferSelect) => ({
  id: e.id,
  userId: e.userId,
  date: e.date,
  kind: e.kind,
  startTime: e.startedAt && e.source === "manual" ? localParts(e.startedAt).time : null,
  endTime: e.endedAt && e.source === "manual" ? localParts(e.endedAt).time : null,
  breakMinutes: e.breakMinutes,
  minutes: e.minutes,
  jobId: e.jobId,
  phaseId: e.phaseId,
  note: e.note,
  status: e.status,
  source: e.source,
  reviewNote: e.reviewNote,
});

const iso = z.iso.date();

/* ---------- týden ---------- */

export const week = defineCommand({
  name: "dochazka.week",
  input: z.object({ weekStart: iso, userId: z.uuid().optional() }),
  handler: async (ctx, i, deps) => {
    const userId = await targetUser(ctx, deps, i.userId, "read");
    const start = weekStartIso(i.weekStart);
    const end = addDaysIso(start, 6);
    const s = await settingsOf(ctx, deps);
    const rows = await ctx.db
      .select()
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, start),
          lte(timeEntry.date, end),
          isNull(timeEntry.deletedAt),
        ),
      )
      .orderBy(asc(timeEntry.date), asc(timeEntry.startedAt), asc(timeEntry.createdAt));
    const jobTitles = await visibleRecordTitles(ctx, deps.registry, "job", [
      ...new Set(rows.map((r) => r.jobId).filter((x): x is string => !!x)),
    ]);
    const locks = await ctx.db
      .select({ month: timeLock.month })
      .from(timeLock)
      .where(inArray(timeLock.month, [monthOf(start), monthOf(end)]));
    const workload = await workloadOf(ctx.db, userId);
    const days = eachDayIso(start, end).map((date) => ({
      date,
      holiday: holidayName(date) ?? null,
      workday: isWorkday(date, s.workDays),
      minutes: rows.filter((r) => r.date === date).reduce((a, r) => a + r.minutes, 0),
    }));
    const [u] = await ctx.db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    return {
      weekStart: start,
      userId,
      userName: u?.name ?? "",
      isSelf: userId === ctx.actor.userId,
      entries: rows.map((r) => ({
        ...toRow(r),
        jobTitle: r.jobId ? (jobTitles[r.jobId] ?? null) : null,
      })),
      days,
      totalMinutes: days.reduce((a, d) => a + d.minutes, 0),
      fundMinutes: Math.round(
        workingDays(start, end, s.workDays).length * s.hoursPerDay * 60 * workload,
      ),
      lockedMonths: locks.map((l) => l.month),
      requireApproval: s.requireApproval,
      canApprove: canApprove(ctx),
    };
  },
});

/* ---------- zápis záznamu ---------- */

const entryInput = z.object({
  id: z.uuid().optional(),
  userId: z.uuid().nullish(),
  date: iso,
  kind: z.enum(TIME_KIND_VALUES),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
  breakMinutes: z.number().int().min(0).max(240).default(0),
  hours: z.number().min(0).max(24).nullish(),
  jobId: z.uuid().nullish(),
  phaseId: z.uuid().nullish(),
  note: z.string().trim().max(500).nullish(),
});

async function dayMinutes(db: Executor, userId: string, date: string, exceptId?: string) {
  const [r] = await db
    .select({ t: sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::int` })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        eq(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
        exceptId ? ne(timeEntry.id, exceptId) : undefined,
      ),
    );
  return r?.t ?? 0;
}

const rule = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TimeRuleError) throw new UserError(e.message);
    throw e;
  }
};

export const save = defineCommand({
  name: "dochazka.save",
  input: entryInput,
  handler: async (ctx, i, deps) => {
    const userId = await targetUser(ctx, deps, i.userId, "write");
    return inTx(ctx, async (c) => {
      await assertMonthOpen(c.db, i.date);
      const s = await settingsOf(c, deps);
      const manual = !!(i.startTime && i.endTime);
      const minutes = rule(() =>
        entryMinutes({
          startTime: i.startTime ?? null,
          endTime: i.endTime ?? null,
          breakMinutes: i.breakMinutes,
          hours: i.hours ?? null,
        }),
      );
      const absence = isAbsence(i.kind);
      const jobId = absence ? null : (i.jobId ?? null);
      const values = {
        userId,
        date: i.date,
        kind: i.kind,
        startedAt: manual ? zonedToUtc(i.date, i.startTime!) : null,
        endedAt: manual ? zonedToUtc(i.date, i.endTime!) : null,
        breakMinutes: manual ? i.breakMinutes : 0,
        minutes,
        jobId,
        phaseId: jobId ? (i.phaseId ?? null) : null,
        note: i.note || null,
        updatedBy: c.actor.userId,
      };
      const already = await dayMinutes(c.db, userId, i.date, i.id);
      rule(() => assertDayLimit(already, minutes));

      if (i.id) {
        const [before] = await c.db
          .select()
          .from(timeEntry)
          .where(and(eq(timeEntry.id, i.id), isNull(timeEntry.deletedAt)));
        if (!before) throw new NotFoundError("Záznam nenalezen.");
        await targetUser(c, deps, before.userId, "write");
        await assertMonthOpen(c.db, before.date);
        const status = rule(() =>
          editedStatus({
            status: before.status,
            isOwner: before.userId === c.actor.userId,
            canApprove: canApprove(c),
          }),
        );
        // Záznam z píchačky se úpravou v hodinách nesmí stát „běžící píchačkou“ (zdroj `clock` bez konce): časy příchodu
        // a odchodu zůstanou, ruční zadání od–do z něj udělá ruční záznam.
        const fromClock = before.source === "clock";
        await c.db
          .update(timeEntry)
          .set({
            ...values,
            ...(fromClock && !manual
              ? { startedAt: before.startedAt, endedAt: before.endedAt }
              : {}),
            ...(manual ? { source: "manual" as const } : {}),
            status,
          })
          .where(eq(timeEntry.id, i.id));
        return { id: i.id };
      }
      const auto = !s.requireApproval;
      const [row] = await c.db
        .insert(timeEntry)
        .values({
          ...values,
          hourlyCostMinor: await hourlyCostOf(c, userId, s),
          status: auto ? "approved" : "draft",
          reviewerId: auto ? c.actor.userId : null,
          reviewedAt: auto ? new Date() : null,
          createdBy: c.actor.userId,
        })
        .returning({ id: timeEntry.id });
      return { id: row!.id };
    });
  },
});

export const remove = defineCommand({
  name: "dochazka.delete",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i, deps) => {
    await inTx(ctx, async (c) => {
      const [e] = await c.db
        .select()
        .from(timeEntry)
        .where(and(eq(timeEntry.id, i.id), isNull(timeEntry.deletedAt)));
      if (!e) throw new NotFoundError("Záznam nenalezen.");
      await targetUser(c, deps, e.userId, "write");
      await assertMonthOpen(c.db, e.date);
      if ((e.status === "approved" || e.status === "submitted") && !canApprove(c))
        throw new UserError("Odeslaný nebo schválený záznam nejde smazat.");
      await c.db
        .update(timeEntry)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(timeEntry.id, i.id));
    });
  },
});

/* ---------- odeslání, schválení ---------- */

const weekBounds = (weekStart: string) => ({
  from: weekStartIso(weekStart),
  to: addDaysIso(weekStartIso(weekStart), 6),
});

export const submitWeek = defineCommand({
  name: "dochazka.submitWeek",
  input: z.object({ weekStart: iso }),
  handler: async (ctx, i) => {
    const userId = selfUser(ctx, "write");
    const { from, to } = weekBounds(i.weekStart);
    return inTx(ctx, async (c) => {
      await assertMonthOpen(c.db, from);
      await assertMonthOpen(c.db, to);
      const rows = await c.db
        .update(timeEntry)
        .set({ status: "submitted", updatedBy: c.actor.userId })
        .where(
          and(
            eq(timeEntry.userId, userId),
            gte(timeEntry.date, from),
            lte(timeEntry.date, to),
            inArray(timeEntry.status, ["draft", "returned"]),
            isNull(timeEntry.deletedAt),
            // běžící píchačka (zdroj `clock` bez konce) se neodesílá: není hotová a po odchodu by si stav přepsala
            sql`not (${timeEntry.source} = 'clock' and ${timeEntry.endedAt} is null)`,
          ),
        )
        .returning({ minutes: timeEntry.minutes });
      if (!rows.length) throw new UserError("Tento týden nemáte nic k odeslání.");
      const total = rows.reduce((a, r) => a + r.minutes, 0);
      const [u] = await c.db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
      await notify(c.db, TIME_SUBMITTED, {
        params: {
          name: u?.name,
          period: `${formatDate(from)} – ${formatDate(to)}`,
          hours: formatMinutes(total),
        },
        actorId: userId,
      });
      return { count: rows.length, minutes: total };
    });
  },
});

export const withdrawWeek = defineCommand({
  name: "dochazka.withdrawWeek",
  input: z.object({ weekStart: iso }),
  handler: async (ctx, i) => {
    const userId = selfUser(ctx, "write");
    const { from, to } = weekBounds(i.weekStart);
    await assertMonthOpen(ctx.db, from);
    await ctx.db
      .update(timeEntry)
      .set({ status: "draft", updatedBy: ctx.actor.userId })
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, from),
          lte(timeEntry.date, to),
          eq(timeEntry.status, "submitted"),
          isNull(timeEntry.deletedAt),
        ),
      );
  },
});

export const reviewWeek = defineCommand({
  name: "dochazka.reviewWeek",
  permission: "dochazka.approve",
  input: z.object({
    userId: z.uuid(),
    weekStart: iso,
    decision: z.enum(["approve", "return"]),
    note: z.string().trim().max(500).nullish(),
  }),
  handler: async (ctx, i, deps) => {
    await targetUser(ctx, deps, i.userId, "write");
    if (i.decision === "return" && !i.note?.trim())
      throw new UserError("Napište, co je potřeba opravit.");
    const { from, to } = weekBounds(i.weekStart);
    return inTx(ctx, async (c) => {
      await assertMonthOpen(c.db, from);
      await assertMonthOpen(c.db, to);
      const rows = await c.db
        .update(timeEntry)
        .set({
          status: i.decision === "approve" ? "approved" : "returned",
          reviewerId: c.actor.userId,
          reviewedAt: new Date(),
          reviewNote: i.note?.trim() || null,
          updatedBy: c.actor.userId,
        })
        .where(
          and(
            eq(timeEntry.userId, i.userId),
            gte(timeEntry.date, from),
            lte(timeEntry.date, to),
            eq(timeEntry.status, "submitted"),
            isNull(timeEntry.deletedAt),
          ),
        )
        .returning({ minutes: timeEntry.minutes });
      if (!rows.length) throw new UserError("Týden už není ke schválení.");
      const total = rows.reduce((a, r) => a + r.minutes, 0);
      await recordAudit(c, {
        action: "update",
        entityType: "time_entry",
        entityId: i.userId,
        summary: `Docházka ${from} – ${to}: ${i.decision === "approve" ? "schváleno" : "vráceno"} (${formatMinutes(total)})`,
      });
      const period = `${formatDate(from)} – ${formatDate(to)}`;
      if (i.decision === "approve")
        await notify(c.db, TIME_APPROVED, {
          params: { period, hours: formatMinutes(total), week: from },
          to: { person: [i.userId] },
          actorId: c.actor.userId,
        });
      else
        await notify(c.db, TIME_RETURNED, {
          params: { period, note: i.note!.trim(), week: from },
          to: { person: [i.userId] },
          actorId: c.actor.userId,
        });
      return { count: rows.length };
    });
  },
});

export const approvals = defineCommand({
  name: "dochazka.approvals",
  permission: "dochazka.approve",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const team =
      bestScope(ctx, ["dochazka.approve"]) === "all" ? null : [...(await teamUserIds(ctx, deps))];
    const rows = await ctx.db
      .select({
        userId: timeEntry.userId,
        name: schema.user.name,
        week: sql<string>`to_char(date_trunc('week', ${timeEntry.date}::timestamp), 'YYYY-MM-DD')`,
        minutes: sql<number>`sum(${timeEntry.minutes})::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(timeEntry)
      .innerJoin(schema.user, eq(schema.user.id, timeEntry.userId))
      .where(
        and(
          eq(timeEntry.status, "submitted"),
          isNull(timeEntry.deletedAt),
          team ? inArray(timeEntry.userId, team) : undefined,
        ),
      )
      .groupBy(
        timeEntry.userId,
        schema.user.name,
        sql`date_trunc('week', ${timeEntry.date}::timestamp)`,
      )
      .orderBy(sql`2`, sql`3`);
    return rows;
  },
});

/* ---------- píchačka ---------- */

const runningOf = (db: Executor, userId: string) =>
  db
    .select()
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        eq(timeEntry.source, "clock"),
        isNull(timeEntry.endedAt),
        isNotNull(timeEntry.startedAt),
        isNull(timeEntry.deletedAt),
      ),
    )
    .then((r) => r[0]);

/** Nejdéle zpožděný zápis píchačky (offline fronta v terminálu); starší se zapisuje ručně v týdenním výkazu. */
const MAX_CLOCK_LATE_HOURS = 72;

/**
 * Čas příchodu, přestávky nebo odchodu: čas z mobilu (zápis odložený bez signálu), je-li rozumný, jinak teď.
 * Čas v budoucnosti se srovná na „teď“, příliš starý se odmítne.
 */
function clockTime(at: string | null | undefined): Date {
  const now = new Date();
  if (!at) return now;
  const t = new Date(at);
  if (Number.isNaN(t.getTime()) || t.getTime() > now.getTime()) return now;
  if (now.getTime() - t.getTime() > MAX_CLOCK_LATE_HOURS * 3_600_000)
    throw new UserError(
      "Zápis píchačky je starší než 3 dny, zapište docházku ručně na stránce Docházka.",
    );
  return t;
}
const clockAt = z.iso.datetime({ offset: true }).nullish();

export const clockStatus = defineCommand({
  name: "dochazka.clock.status",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const userId = selfUser(ctx, "read");
    const running = await runningOf(ctx.db, userId);
    const today = localParts(new Date()).date;
    const [t] = await ctx.db
      .select({ m: sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::int` })
      .from(timeEntry)
      .where(
        and(eq(timeEntry.userId, userId), eq(timeEntry.date, today), isNull(timeEntry.deletedAt)),
      );
    const titles = running?.jobId
      ? await visibleRecordTitles(ctx, deps.registry, "job", [running.jobId])
      : {};
    return {
      running: running
        ? {
            id: running.id,
            startedAt: running.startedAt!.toISOString(),
            breakStartedAt: running.breakStartedAt?.toISOString() ?? null,
            breakMinutes: running.breakMinutes,
            kind: running.kind,
            jobId: running.jobId,
            jobTitle: running.jobId ? (titles[running.jobId] ?? null) : null,
            note: running.note,
          }
        : null,
      todayMinutes: t?.m ?? 0,
    };
  },
});

export const clockIn = defineCommand({
  name: "dochazka.clock.in",
  permission: "dochazka.own",
  input: z.object({
    jobId: z.uuid().nullish(),
    kind: z.enum(["work", "travel", "workshop", "admin"]).default("work"),
    note: z.string().trim().max(500).nullish(),
    /** Čas, kdy se na zařízení ťuklo (zápis z offline fronty). */
    at: clockAt,
  }),
  handler: async (ctx, i, deps) => {
    const userId = me(ctx);
    return inTx(ctx, async (c) => {
      const now = clockTime(i.at);
      const date = localParts(now).date;
      await assertMonthOpen(c.db, date);
      if (await runningOf(c.db, userId))
        throw new UserError("Píchačka už běží. Nejdřív zaznamenejte odchod.");
      const s = await settingsOf(c, deps);
      const [row] = await c.db
        .insert(timeEntry)
        .values({
          userId,
          date,
          kind: i.kind,
          startedAt: now,
          source: "clock",
          jobId: i.jobId ?? null,
          note: i.note || null,
          hourlyCostMinor: await hourlyCostOf(c, userId, s),
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: timeEntry.id });
      return { id: row!.id, startedAt: now.toISOString() };
    });
  },
});

export const clockBreak = defineCommand({
  name: "dochazka.clock.break",
  permission: "dochazka.own",
  input: z.object({ action: z.enum(["start", "end"]), at: clockAt }),
  handler: async (ctx, i) => {
    const userId = me(ctx);
    await inTx(ctx, async (c) => {
      const run = await runningOf(c.db, userId);
      if (!run) throw new UserError("Píchačka neběží.");
      const when = clockTime(i.at);
      if (when.getTime() < run.startedAt!.getTime())
        throw new UserError("Přestávka nemůže být před příchodem.");
      if (i.action === "start") {
        if (run.breakStartedAt) throw new UserError("Přestávka už běží.");
        await c.db.update(timeEntry).set({ breakStartedAt: when }).where(eq(timeEntry.id, run.id));
      } else {
        if (!run.breakStartedAt) throw new UserError("Přestávka neběží.");
        const minutes = Math.max(
          0,
          Math.round((when.getTime() - run.breakStartedAt.getTime()) / 60_000),
        );
        await c.db
          .update(timeEntry)
          .set({ breakStartedAt: null, breakMinutes: run.breakMinutes + minutes })
          .where(eq(timeEntry.id, run.id));
      }
    });
  },
});

export const clockOut = defineCommand({
  name: "dochazka.clock.out",
  permission: "dochazka.own",
  input: z.object({
    note: z.string().trim().max(500).nullish(),
    jobId: z.uuid().nullish(),
    /** Čas, kdy se na zařízení ťuklo (zápis z offline fronty). */
    at: clockAt,
  }),
  handler: async (ctx, i, deps) => {
    const userId = me(ctx);
    return inTx(ctx, async (c) => {
      const run = await runningOf(c.db, userId);
      if (!run) throw new UserError("Píchačka neběží.");
      const now = clockTime(i.at);
      if (now.getTime() < run.startedAt!.getTime())
        throw new UserError("Odchod nemůže být dřív než příchod.");
      let breaks = run.breakMinutes;
      if (run.breakStartedAt)
        breaks += Math.max(0, Math.round((now.getTime() - run.breakStartedAt.getTime()) / 60_000));
      const elapsed = clockMinutes(run.startedAt!, now, breaks);
      if (elapsed === 0) {
        await c.db
          .update(timeEntry)
          .set({ deletedAt: now, endedAt: now })
          .where(eq(timeEntry.id, run.id));
        return { discarded: true as const, minutes: 0, capped: false };
      }
      await assertMonthOpen(c.db, run.date);
      const already = await dayMinutes(c.db, userId, run.date, run.id);
      // Zapomenutý odchod (píchačka běží přes víkend) nesmí zablokovat píchačku navždy: doba se zkrátí na to, co se do
      // dne vejde, a záznam se vrátí k opravě. Kdyby se nevešlo nic, záznam se zahodí.
      const room = Math.max(0, 24 * 60 - already);
      const capped = elapsed > room;
      const minutes = capped ? room : elapsed;
      if (minutes === 0) {
        await c.db
          .update(timeEntry)
          .set({ deletedAt: now, endedAt: now })
          .where(eq(timeEntry.id, run.id));
        return { discarded: true as const, minutes: 0, capped: true };
      }
      const s = await settingsOf(c, deps);
      const auto = !s.requireApproval && !capped;
      await c.db
        .update(timeEntry)
        .set({
          endedAt: now,
          breakStartedAt: null,
          breakMinutes: breaks,
          minutes,
          note: i.note || run.note,
          jobId: i.jobId ?? run.jobId,
          status: capped ? "returned" : auto ? "approved" : "draft",
          reviewNote: capped
            ? `Píchačka běžela ${formatMinutes(elapsed)}, doba je zkrácena na ${formatMinutes(minutes)}. Opravte ji podle skutečnosti.`
            : null,
          reviewerId: auto ? userId : null,
          reviewedAt: auto ? now : null,
          updatedBy: userId,
        })
        .where(eq(timeEntry.id, run.id));
      return { discarded: false as const, minutes, capped };
    });
  },
});

/* ---------- měsíc, přehled, uzávěrka ---------- */

export const month = defineCommand({
  name: "dochazka.month",
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), userId: z.uuid().optional() }),
  handler: async (ctx, i, deps) => {
    const userId = await targetUser(ctx, deps, i.userId, "read");
    const { from, to } = monthRange(i.month);
    const s = await settingsOf(ctx, deps);
    const rows = await ctx.db
      .select({
        date: timeEntry.date,
        kind: timeEntry.kind,
        minutes: sql<number>`sum(${timeEntry.minutes})::int`,
        status: timeEntry.status,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, from),
          lte(timeEntry.date, to),
          isNull(timeEntry.deletedAt),
        ),
      )
      .groupBy(timeEntry.date, timeEntry.kind, timeEntry.status);
    const [lock] = await ctx.db.select().from(timeLock).where(eq(timeLock.month, i.month));
    const workload = await workloadOf(ctx.db, userId);
    const byKind: Record<string, number> = {};
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + r.minutes;
    const sumOf = (pred: (kind: string) => boolean) =>
      Object.entries(byKind)
        .filter(([k]) => pred(k))
        .reduce((a, [, m]) => a + m, 0);
    const worked = sumOf((k) => !isAbsence(k));
    const paidAbsence = sumOf((k) => PAID_ABSENCE.includes(k));
    const fund = monthFundMinutes(i.month, s.hoursPerDay, s.workDays, workload);
    return {
      month: i.month,
      locked: !!lock,
      days: eachDayIso(from, to).map((date) => ({
        date,
        holiday: holidayName(date) ?? null,
        workday: isWorkday(date, s.workDays),
        minutes: rows.filter((r) => r.date === date).reduce((a, r) => a + r.minutes, 0),
      })),
      byKind,
      workedMinutes: worked,
      paidAbsenceMinutes: paidAbsence,
      absenceMinutes: sumOf(isAbsence),
      fundMinutes: fund,
      balanceMinutes: worked + paidAbsence - fund,
      pending: rows.filter((r) => r.status !== "approved").reduce((a, r) => a + r.minutes, 0),
    };
  },
});

export const report = defineCommand({
  name: "dochazka.report",
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
  handler: async (ctx, i, deps) => {
    const scope = readScope(ctx);
    if (!scope) throw new PermissionError();
    const team = scope === "all" ? null : [...(await teamUserIds(ctx, deps))];
    const { from, to } = monthRange(i.month);
    const s = await settingsOf(ctx, deps);
    const rows = await ctx.db
      .select({
        userId: timeEntry.userId,
        kind: timeEntry.kind,
        status: timeEntry.status,
        minutes: sql<number>`sum(${timeEntry.minutes})::int`,
        // zaokrouhleno po záznamech stejně jako v nákladech zakázky (poskytovatel `dochazka`), ať se součty shodují na haléř
        cost: sql<number>`sum(round(${timeEntry.minutes} * ${timeEntry.hourlyCostMinor} / 60.0))::bigint`,
      })
      .from(timeEntry)
      .where(
        and(
          gte(timeEntry.date, from),
          lte(timeEntry.date, to),
          isNull(timeEntry.deletedAt),
          team ? inArray(timeEntry.userId, team) : undefined,
        ),
      )
      .groupBy(timeEntry.userId, timeEntry.kind, timeEntry.status);
    const users = await ctx.db
      .select({ id: schema.user.id, name: schema.user.name, workload: schema.employee.workload })
      .from(schema.user)
      .leftJoin(schema.employee, eq(schema.employee.userId, schema.user.id))
      .where(and(eq(schema.user.active, true), isNull(schema.user.deletedAt)))
      .orderBy(asc(schema.user.name));
    const [lock] = await ctx.db.select().from(timeLock).where(eq(timeLock.month, i.month));
    const present = new Set(rows.map((r) => r.userId));
    return {
      month: i.month,
      locked: !!lock,
      canClose: can(ctx, "dochazka.close_month"),
      users: users
        .filter((u) => present.has(u.id))
        .map((u) => {
          const mine = rows.filter((r) => r.userId === u.id);
          const sum = (f: (r: (typeof rows)[number]) => boolean) =>
            mine.filter(f).reduce((a, r) => a + r.minutes, 0);
          const fund = monthFundMinutes(
            i.month,
            s.hoursPerDay,
            s.workDays,
            u.workload ? Number(u.workload) : 1,
          );
          const worked = sum((r) => !isAbsence(r.kind));
          return {
            userId: u.id,
            name: u.name,
            workedMinutes: worked,
            absenceMinutes: sum((r) => isAbsence(r.kind)),
            fundMinutes: fund,
            balanceMinutes:
              worked +
              sum((r) => ["vacation", "holiday", "sick", "doctor"].includes(r.kind)) -
              fund,
            pendingMinutes: sum((r) => r.status !== "approved"),
            costMinor: canSeeLabourCost(ctx)
              ? mine.filter((r) => !isAbsence(r.kind)).reduce((a, r) => a + Number(r.cost), 0)
              : null,
          };
        }),
    };
  },
});

export const lockMonth = defineCommand({
  name: "dochazka.lockMonth",
  permission: "dochazka.close_month",
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), locked: z.boolean() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      if (i.locked) {
        const [p] = await c.db
          .select({ n: sql<number>`count(*)::int` })
          .from(timeEntry)
          .where(
            and(
              sql`to_char(${timeEntry.date}, 'YYYY-MM') = ${i.month}`,
              inArray(timeEntry.status, ["draft", "submitted", "returned"]),
              isNull(timeEntry.deletedAt),
            ),
          );
        await c.db
          .insert(timeLock)
          .values({ month: i.month, lockedBy: c.actor.userId })
          .onConflictDoNothing();
        await recordAudit(c, {
          action: "update",
          entityType: "time_entry",
          entityId: c.actor.userId!,
          summary: `Uzavřena docházka za ${i.month}${p?.n ? ` (neschválených záznamů: ${p.n})` : ""}`,
        });
      } else {
        await c.db.delete(timeLock).where(eq(timeLock.month, i.month));
        await recordAudit(c, {
          action: "update",
          entityType: "time_entry",
          entityId: c.actor.userId!,
          summary: `Znovu otevřena docházka za ${i.month}`,
        });
      }
    });
  },
});

/* ---------- nastavení ---------- */

export const getSettings = defineCommand({
  name: "dochazka.settings.get",
  permission: "settings.manage",
  input: z.object({}),
  handler: async (ctx, _i, deps) =>
    (await deps.settings.getForAdmin(ctx, dochazkaSetting)).value as DochazkaSettings,
});

export const saveSettings = defineCommand({
  name: "dochazka.settings.save",
  permission: "settings.manage",
  input: z.object({
    hoursPerDay: z.number().min(1).max(24),
    workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    requireApproval: z.boolean(),
    defaultHourlyCostMinor: z.number().int().min(0).max(100_000_00),
    reminder: z.boolean(),
  }),
  handler: async (ctx, i, deps) => deps.settings.set(ctx, dochazkaSetting, i),
});

/* ---------- poskytovatelé pro ostatní moduly ---------- */

const canRead = (ctx: Ctx) => scopeOf(ctx, "dochazka.read") !== null || can(ctx, "dochazka.own");

export const server = defineModuleServer({
  entities: [timeEntryEntity],
  dashboardMetrics,
  commands: [
    week,
    save,
    remove,
    submitWeek,
    withdrawWeek,
    reviewWeek,
    approvals,
    clockStatus,
    clockIn,
    clockBreak,
    clockOut,
    month,
    report,
    lockMonth,
    getSettings,
    saveSettings,
  ],
  attention: [
    async (ctx, deps) => {
      const out: AttentionItem[] = [];
      const userId = ctx.actor.userId;
      if (!userId) return out;
      if (canApprove(ctx)) {
        const team =
          bestScope(ctx, ["dochazka.approve"]) === "all"
            ? null
            : [...(await teamUserIds(ctx, deps))];
        const [r] = await ctx.db
          .select({
            n: sql<number>`count(distinct (${timeEntry.userId}, date_trunc('week', ${timeEntry.date}::timestamp)))::int`,
          })
          .from(timeEntry)
          .where(
            and(
              eq(timeEntry.status, "submitted"),
              isNull(timeEntry.deletedAt),
              team ? inArray(timeEntry.userId, team) : undefined,
            ),
          );
        if (r?.n)
          out.push({
            id: "time-approval",
            module: "dochazka",
            severity: "info",
            title: `Docházka ke schválení: ${r.n}`,
            href: "/dochazka/schvalovani",
          });
      }
      if (can(ctx, "dochazka.own")) {
        const [r] = await ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(timeEntry)
          .where(
            and(
              eq(timeEntry.userId, userId),
              eq(timeEntry.status, "returned"),
              isNull(timeEntry.deletedAt),
            ),
          );
        if (r?.n)
          out.push({
            id: "time-returned",
            module: "dochazka",
            severity: "warning",
            title: `Vrácená docházka k opravě: ${r.n} záznamů`,
            href: "/dochazka",
          });
      }
      return out;
    },
  ],
  widgets: [
    async (ctx) => {
      const userId = ctx.actor.userId;
      if (!userId || !can(ctx, "dochazka.own")) return [];
      const start = weekStartIso(todayIso());
      const [r] = await ctx.db
        .select({ m: sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::int` })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, userId),
            gte(timeEntry.date, start),
            lte(timeEntry.date, addDaysIso(start, 6)),
            isNull(timeEntry.deletedAt),
          ),
        );
      return [
        {
          id: "time-week",
          module: "dochazka",
          title: "Odpracováno tento týden",
          value: formatMinutes(r?.m ?? 0),
          href: "/dochazka",
          order: 5,
        },
      ];
    },
  ],
  calendarLayers: [
    {
      key: "dochazka.absence",
      label: "Absence",
      color: "yellow",
      items: async (ctx, range, deps) => {
        if (!canRead(ctx)) return [];
        const self = ctx.actor.userId;
        // absence (nemoc, lékař) vidí všichni jen u vedení a kanceláře; mistr jen u svého týmu, ostatní u sebe
        const scope = readScope(ctx);
        const all = scope === "all";
        const team = scope === "own" ? [...(await teamUserIds(ctx, deps))] : null;
        const rows = await ctx.db
          .select({
            id: timeEntry.id,
            date: timeEntry.date,
            kind: timeEntry.kind,
            name: schema.user.name,
          })
          .from(timeEntry)
          .innerJoin(schema.user, eq(schema.user.id, timeEntry.userId))
          .where(
            and(
              inArray(timeEntry.kind, ["vacation", "sick", "doctor", "comp"]),
              gte(timeEntry.date, range.from),
              lte(timeEntry.date, range.to),
              isNull(timeEntry.deletedAt),
              all || !self
                ? undefined
                : team
                  ? inArray(timeEntry.userId, team)
                  : eq(timeEntry.userId, self),
            ),
          );
        return rows.map((r) => ({
          id: `abs-${r.id}`,
          layer: "dochazka.absence",
          title: `${TIME_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}: ${r.name}`,
          start: r.date,
          allDay: true,
        }));
      },
    },
  ],
  jobs: [
    defineModuleJob({
      name: "dochazka.reminder",
      schema: z.object({}),
      cron: "30 17 * * 1-5",
      retryLimit: 1,
      async handler(deps) {
        const s = await deps.settings.get(deps.db, dochazkaSetting);
        await sendEveningReminders(deps.db, s);
      },
    }),
    defineModuleJob({
      name: "dochazka.missing_clock_in",
      schema: z.object({}),
      cron: "30 8 * * 1-5",
      retryLimit: 1,
      async handler(deps) {
        const s = await deps.settings.get(deps.db, dochazkaSetting);
        await sendMissingClockIn(deps.db, s);
      },
    }),
    defineModuleJob({
      name: "dochazka.forgot_clock_out",
      schema: z.object({}),
      // každou půlhodinu ve dne; okno 6–22 h hlídá i samotné rozhodnutí (`forgottenClockStage`)
      cron: "*/30 6-21 * * *",
      retryLimit: 1,
      async handler(deps) {
        await sendForgottenClockOut(deps.db);
      },
    }),
  ],
});

export { timeEntry, timeLock };
export * from "./rules";
export * from "./notices";
export * from "./notice-rules";
export const entities = [timeEntryEntity];
export { dochazkaSetting } from "./settings";
