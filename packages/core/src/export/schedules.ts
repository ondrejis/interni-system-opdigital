import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import { defineJob, type JobDef } from "../jobs/jobs";
import { loadActor } from "../rbac/actor";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { isoWeek } from "../dashboards/periods";
import { isoWeekday, localParts, monthRange, addDaysIso, zonedToUtc } from "../time/dates";
import { exportRunJob, insertQueuedRun } from "./runs";
import type { ExportRuntime } from "./runtime";
import { assertSpecUsable } from "./templates";
import { exportFileStem, exportSpecSchema, type ExportSpec } from "./spec";

export type Frequency = "daily" | "weekly" | "monthly";
export type Deliver = "email" | "myexports" | "both";

export type ScheduleTiming = {
  frequency: Frequency;
  /** 1 = pondělí … 7 = neděle (týdně). */
  weekday: number | null;
  /** 1–28, nebo 0 = poslední den měsíce (měsíčně). */
  monthDay: number | null;
  /** `HH:MM` v místním čase (Europe/Prague). */
  timeLocal: string;
};

/** Den vyhovuje plánu? */
function matchesDay(date: string, t: ScheduleTiming): boolean {
  if (t.frequency === "daily") return true;
  if (t.frequency === "weekly") return isoWeekday(date) === (t.weekday ?? 1);
  const day = Number(date.slice(8, 10));
  const md = t.monthDay ?? 1;
  return md === 0 ? date === monthRange(date.slice(0, 7)).to : day === md;
}

/**
 * Nejbližší spuštění po okamžiku `after` v místním čase Europe/Prague. Den po dni (nejdál rok dopředu), v každém dni
 * se čas převádí na okamžik zvlášť, takže přechod letního času čas nezkreslí (neexistující jarní hodina se posune
 * dopředu, podzimní se bere poprvé).
 */
export function computeNextRun(t: ScheduleTiming, after: Date): Date {
  let date = localParts(after).date;
  for (let i = 0; i < 400; i++, date = addDaysIso(date, 1)) {
    if (!matchesDay(date, t)) continue;
    const at = zonedToUtc(date, t.timeLocal);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new UserError("Plán nemá žádné další spuštění.");
}

/** Klíč periody, do které spuštění patří: pro stejný plán, uživatele a periodu vznikne nejvýš jeden export. */
export function periodKeyOf(frequency: Frequency, slot: Date): string {
  const { date } = localParts(slot);
  if (frequency === "daily") return date;
  if (frequency === "monthly") return date.slice(0, 7);
  const w = isoWeek(date);
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

const timing = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  weekday: z.number().int().min(1).max(7).nullable().default(null),
  monthDay: z.number().int().min(0).max(28).nullable().default(null),
  timeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Čas ve tvaru HH:MM."),
});

const scheduleInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Vyplňte název plánu.").max(60),
    templateId: z.uuid().nullish(),
    spec: exportSpecSchema,
    recipients: z.array(z.uuid()).max(20, "Plán může mít nejvýš 20 příjemců."),
    deliver: z.enum(["email", "myexports", "both"]),
    active: z.boolean().default(true),
  })
  .and(timing);
export type ScheduleInput = z.input<typeof scheduleInput>;

export type ScheduleInfo = {
  id: string;
  name: string;
  entity: string;
  entityLabel: string;
  spec: ExportSpec;
  templateId: string | null;
  frequency: Frequency;
  weekday: number | null;
  monthDay: number | null;
  timeLocal: string;
  recipients: { id: string; name: string }[];
  deliver: Deliver;
  active: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  ownerName: string;
  mine: boolean;
  /** Jsem příjemce (smím se odhlásit). */
  subscribed: boolean;
};

const me = (ctx: Ctx) => {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
};

/** Příjemce plánu musí být aktivní uživatel, který má na exportovaná data právo (jinak by data dostal bez oprávnění). */
async function checkRecipients(
  ctx: Ctx,
  rt: ExportRuntime,
  spec: ExportSpec,
  ids: readonly string[],
): Promise<void> {
  const def = rt.registry.get(spec.entity);
  if (!def) throw new UserError("Tento typ záznamů v systému není (vypnutý modul).");
  const perm = def.permissions.export ?? def.permissions.read;
  for (const id of ids) {
    const actor = await loadActor(ctx.db, id, { catalog: rt.catalog });
    const [u] = await ctx.db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, id));
    if (!actor || !u) throw new UserError("Některý z příjemců neexistuje nebo je deaktivovaný.");
    if (!scopeOf({ ...ctx, actor }, perm))
      throw new UserError(
        `${u.name} nemá právo na data „${def.label.many}“, proto jí export nejde posílat.`,
      );
  }
}

export async function saveSchedule(
  ctx: Ctx,
  rt: ExportRuntime,
  raw: ScheduleInput,
): Promise<{ id: string; nextRunAt: string }> {
  const owner = me(ctx);
  if (!rt.config.scheduled) throw new UserError("Plánované exporty jsou v tomto systému vypnuté.");
  if (!can(ctx, "exports.schedule")) throw new PermissionError();
  const input = scheduleInput.parse(raw);
  if (input.frequency === "weekly" && input.weekday === null)
    throw new UserError("Vyberte den v týdnu.");
  if (input.frequency === "monthly" && input.monthDay === null)
    throw new UserError("Vyberte den v měsíci.");
  await assertSpecUsable(ctx, rt, input.spec);
  const recipients = [...new Set(input.recipients)];
  if (!recipients.length) throw new UserError("Vyberte aspoň jednoho příjemce.");
  await checkRecipients(ctx, rt, input.spec, recipients);
  const t: ScheduleTiming = {
    frequency: input.frequency,
    weekday: input.frequency === "weekly" ? input.weekday : null,
    monthDay: input.frequency === "monthly" ? input.monthDay : null,
    timeLocal: input.timeLocal,
  };
  const nextRunAt = computeNextRun(t, new Date());
  return inTx(ctx, async (c) => {
    const values = {
      name: input.name,
      templateId: input.templateId ?? null,
      spec: input.spec,
      ...t,
      recipients,
      deliver: input.deliver,
      active: input.active,
      nextRunAt: input.active ? nextRunAt : null,
      updatedBy: owner,
    };
    if (input.id) {
      const [s] = await c.db
        .select()
        .from(schema.exportSchedule)
        .where(
          and(eq(schema.exportSchedule.id, input.id), isNull(schema.exportSchedule.deletedAt)),
        );
      if (!s || (s.ownerId !== owner && !can(c, "exports.manage")))
        throw new NotFoundError("Plán nenalezen.");
      await c.db
        .update(schema.exportSchedule)
        .set(values)
        .where(eq(schema.exportSchedule.id, input.id));
      await recordAudit(c, {
        action: "update",
        entityType: "export_schedule",
        entityId: input.id,
        summary: `Plánovaný export „${input.name}“`,
      });
      return { id: input.id, nextRunAt: nextRunAt.toISOString() };
    }
    const [row] = await c.db
      .insert(schema.exportSchedule)
      .values({ ...values, ownerId: owner, createdBy: owner })
      .returning({ id: schema.exportSchedule.id });
    await recordAudit(c, {
      action: "create",
      entityType: "export_schedule",
      entityId: row!.id,
      summary: `Plánovaný export „${input.name}“ (${input.spec.entity}, ${input.frequency})`,
    });
    return { id: row!.id, nextRunAt: nextRunAt.toISOString() };
  });
}

/** Plány, které aktér vidí: vlastní a ty, jejichž je příjemcem (správce exportů vidí všechny). */
export async function listSchedules(
  ctx: Ctx,
  rt: Pick<ExportRuntime, "registry">,
): Promise<ScheduleInfo[]> {
  const user = me(ctx);
  const all = can(ctx, "exports.manage");
  const rows = await ctx.db
    .select({ s: schema.exportSchedule, owner: schema.user.name })
    .from(schema.exportSchedule)
    .innerJoin(schema.user, eq(schema.user.id, schema.exportSchedule.ownerId))
    .where(
      and(
        isNull(schema.exportSchedule.deletedAt),
        all
          ? undefined
          : or(
              eq(schema.exportSchedule.ownerId, user),
              sql`${schema.exportSchedule.recipients} ? ${user}::text`,
            ),
      ),
    )
    .orderBy(asc(schema.exportSchedule.name));
  const ids = [...new Set(rows.flatMap((r) => r.s.recipients))];
  const names = new Map<string, string>();
  if (ids.length) {
    const users = await ctx.db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(
        sql`${schema.user.id} in (${sql.join(
          ids.map((i) => sql`${i}::uuid`),
          sql`, `,
        )})`,
      );
    for (const u of users) names.set(u.id, u.name);
  }
  return rows.flatMap(({ s, owner }) => {
    const spec = exportSpecSchema.safeParse(s.spec);
    if (!spec.success) return [];
    const def = rt.registry.get(spec.data.entity);
    return [
      {
        id: s.id,
        name: s.name,
        entity: spec.data.entity,
        entityLabel: def?.label.many ?? spec.data.entity,
        spec: spec.data,
        templateId: s.templateId,
        frequency: s.frequency,
        weekday: s.weekday,
        monthDay: s.monthDay,
        timeLocal: s.timeLocal,
        recipients: s.recipients.map((id) => ({ id, name: names.get(id) ?? "Neznámý uživatel" })),
        deliver: s.deliver,
        active: s.active,
        nextRunAt: s.nextRunAt?.toISOString() ?? null,
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
        lastStatus: s.lastStatus,
        ownerName: owner,
        mine: s.ownerId === user,
        subscribed: s.recipients.includes(user),
      },
    ];
  });
}

async function loadMine(ctx: Ctx, id: string) {
  const user = me(ctx);
  const [s] = await ctx.db
    .select()
    .from(schema.exportSchedule)
    .where(and(eq(schema.exportSchedule.id, id), isNull(schema.exportSchedule.deletedAt)));
  if (!s || (s.ownerId !== user && !can(ctx, "exports.manage")))
    throw new NotFoundError("Plán nenalezen.");
  return s;
}

/** Zastaví (nebo znovu zapne) plán; autor nebo správce exportů. */
export async function setScheduleActive(ctx: Ctx, id: string, active: boolean): Promise<void> {
  const s = await loadMine(ctx, id);
  await inTx(ctx, async (c) => {
    await c.db
      .update(schema.exportSchedule)
      .set({
        active,
        nextRunAt: active
          ? computeNextRun(
              {
                frequency: s.frequency,
                weekday: s.weekday,
                monthDay: s.monthDay,
                timeLocal: s.timeLocal,
              },
              new Date(),
            )
          : null,
        updatedBy: me(c),
      })
      .where(eq(schema.exportSchedule.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "export_schedule",
      entityId: id,
      summary: `Plánovaný export „${s.name}“ ${active ? "znovu zapnut" : "zastaven"}`,
    });
  });
}

export async function deleteSchedule(ctx: Ctx, id: string): Promise<void> {
  const s = await loadMine(ctx, id);
  await inTx(ctx, async (c) => {
    await c.db
      .update(schema.exportSchedule)
      .set({ deletedAt: new Date(), active: false, nextRunAt: null, updatedBy: me(c) })
      .where(eq(schema.exportSchedule.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "export_schedule",
      entityId: id,
      summary: `Plánovaný export „${s.name}“`,
    });
  });
}

/**
 * Odhlášení z plánovaného exportu: příjemce se odebere ze seznamu. Plán, který nemá žádného příjemce, se zastaví.
 * Smí kterýkoli příjemce i bez práva plánovat.
 */
export async function unsubscribeFromSchedule(ctx: Ctx, id: string): Promise<void> {
  const user = me(ctx);
  await inTx(ctx, async (c) => {
    const [s] = await c.db
      .select()
      .from(schema.exportSchedule)
      .where(and(eq(schema.exportSchedule.id, id), isNull(schema.exportSchedule.deletedAt)));
    if (!s || !s.recipients.includes(user)) throw new NotFoundError("Plán nenalezen.");
    const rest = s.recipients.filter((r) => r !== user);
    await c.db
      .update(schema.exportSchedule)
      .set({
        recipients: rest,
        ...(rest.length ? {} : { active: false, nextRunAt: null }),
      })
      .where(eq(schema.exportSchedule.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "export_schedule",
      entityId: id,
      summary: `Odhlášení z plánovaného exportu „${s.name}“`,
    });
  });
}

export type DueResult = { schedules: number; runs: number; skipped: string[] };

/**
 * Spustí plány, kterým nastal čas. Bezpečné proti dvojímu spuštění: řádky plánů se zamykají (`FOR UPDATE SKIP LOCKED`),
 * `next_run_at` se posune ve stejné transakci a každý export periody má jednoznačný klíč (plán, uživatel, perioda),
 * takže opakované volání ve stejné minutě i souběh dvou workerů nevytvoří export dvakrát. Po výpadku se zameškané
 * periody nedohánějí, spustí se jen poslední.
 */
export async function runDueSchedules(rt: ExportRuntime, now = new Date()): Promise<DueResult> {
  const result: DueResult = { schedules: 0, runs: 0, skipped: [] };
  const created: string[] = [];
  await rt.db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schema.exportSchedule)
      .where(
        and(
          eq(schema.exportSchedule.active, true),
          isNull(schema.exportSchedule.deletedAt),
          lte(schema.exportSchedule.nextRunAt, now),
        ),
      )
      .orderBy(asc(schema.exportSchedule.nextRunAt))
      .limit(25)
      .for("update", { skipLocked: true });
    for (const s of due) {
      result.schedules++;
      const slot = s.nextRunAt ?? now;
      const periodKey = periodKeyOf(s.frequency, slot);
      const spec = exportSpecSchema.safeParse(s.spec);
      const def = spec.success ? rt.registry.get(spec.data.entity) : undefined;
      const notes: string[] = [];
      let made = 0;
      if (spec.success && def) {
        const perm = def.permissions.export ?? def.permissions.read;
        const stem = exportFileStem(spec.data.fileName, s.name.toLowerCase(), slot);
        for (const userId of s.recipients) {
          const actor = await loadActor(tx, userId, { catalog: rt.catalog });
          if (!actor || !scopeOf({ actor, db: tx }, perm)) {
            notes.push("příjemce bez oprávnění přeskočen");
            result.skipped.push(userId);
            continue;
          }
          const id = await insertQueuedRun(
            { actor, db: tx },
            {
              userId,
              source: "schedule",
              templateId: s.templateId,
              scheduleId: s.id,
              periodKey,
              entityType: def.key,
              label: s.name,
              spec: spec.data,
              fileName: `${stem}.${spec.data.format}`,
              deliverEmail: s.deliver !== "myexports",
            },
          );
          // export téže periody už existuje: nic se nezdvojí
          if (id) {
            created.push(id);
            made++;
          }
        }
      } else notes.push("zdroj dat plánu už neexistuje");
      result.runs += made;
      await tx
        .update(schema.exportSchedule)
        .set({
          lastRunAt: now,
          lastStatus: notes.length ? `Spuštěno ${made}×; ${notes.join("; ")}` : `Spuštěno ${made}×`,
          nextRunAt: computeNextRun(
            {
              frequency: s.frequency,
              weekday: s.weekday,
              monthDay: s.monthDay,
              timeLocal: s.timeLocal,
            },
            now,
          ),
        })
        .where(eq(schema.exportSchedule.id, s.id));
    }
  });
  // do fronty až po potvrzení transakce, ať úloha vždy najde svůj záznam
  for (const runId of created) await rt.queue.send(exportRunJob, { runId });
  return result;
}

export const exportScheduleTickJob: JobDef<
  z.ZodObject<Record<string, never>>,
  ExportRuntime
> = defineJob({
  name: "export.schedule.tick",
  schema: z.object({}),
  cron: "*/5 * * * *",
  retryLimit: 0,
  keepCompletedSeconds: 300,
  async handler(rt) {
    if (!rt.config.enabled || !rt.config.scheduled) return;
    await runDueSchedules(rt);
  },
});
