import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { auditChange, recordAudit } from "@rebar/core/audit";
import { usersWithPermission } from "@rebar/core/collab";
import { schema } from "@rebar/core/db";
import {
  assertEntityAccess,
  recordTitles,
  resolveEntity,
  visibleIds,
  visibleRecordTitles,
} from "@rebar/core/entities";
import { defineCommand, type ModuleDeps } from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { can, inTx, NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { addMonthsIso, monthRange, todayIso } from "@rebar/core/time";
import { maskCosts } from "./costs";
import {
  FleetError,
  SERVICE_KIND_VALUES,
  checkFuel,
  checkLog,
  consumption,
  consumptionUnit,
  deadlineState,
  deadlinesFor,
  formatMeter,
  intervalDue,
  intervalText,
  type Tone,
} from "./fleet";
import {
  STROJE_DEFECT,
  STROJE_DEFECT_BLOCKING,
  STROJE_DEFECT_RESOLVED,
  STROJE_FUEL,
  STROJE_RESERVATION,
} from "./notifications";
import {
  asset,
  assetDefect,
  assetFuel,
  assetInterval,
  assetLog,
  assetReservation,
  assetService,
} from "./schema";

const id = z.uuid();
const dateInput = z.iso.date("Vyplňte datum.");
const num = z.number().finite();
const meterInput = z.number().min(0).max(99_999_999);
const minorInput = z.number().int().min(0).max(1_000_000_000_000);

const ANY_LOG = ["stroje.log", "stroje.write"] as const;
const manages = (ctx: Ctx) => can(ctx, "stroje.write");

async function engineCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FleetError) throw new UserError(err.message);
    throw err;
  }
}

async function loadAsset(ctx: Ctx, assetId: string, mode: "read" | "write" = "read") {
  await assertEntityAccess(ctx, "asset", assetId, mode);
  const [a] = await ctx.db
    .select()
    .from(asset)
    .where(and(eq(asset.id, assetId), isNull(asset.deletedAt)));
  if (!a) throw new NotFoundError("Stroj nebo vozidlo nenalezeno.");
  return a;
}

/** Zakázka musí existovat a aktér ji musí smět vidět. Bez modulu Zakázky se zakázka zadat nedá. */
async function checkJob(c: Ctx, jobId: string | null | undefined) {
  if (!jobId) return;
  try {
    await assertEntityAccess(c, "job", jobId, "read");
  } catch (err) {
    if (err instanceof NotFoundError) throw new UserError("Zakázka neexistuje.");
    if (err instanceof PermissionError)
      throw new UserError("Zakázku nelze zadat (modul Zakázky není zapnutý).");
    throw err;
  }
}

/** Zapisovat za jiného člověka smí jen správce vozového parku. */
function writerOf(ctx: Ctx, userId: string | null | undefined): string {
  const me = ctx.actor.userId;
  if (!me) throw new PermissionError();
  if (!userId || userId === me) return me;
  if (!manages(ctx)) throw new UserError("Zapisovat můžete jen za sebe.");
  return userId;
}

/** Odpovědnost: smazat cizí záznam smí jen správce. */
function assertOwnOrManager(ctx: Ctx, ownerId: string | null) {
  if (!manages(ctx) && ownerId !== ctx.actor.userId)
    throw new UserError("Smazat můžete jen své záznamy.");
}

const num1 = (v: string | number | null) => (v === null ? null : Number(v));
const str1 = (n: number) => n.toFixed(1);

/* ---------- přehled ---------- */

type Alert = { label: string; tone: Tone; text: string };

function alertsOf(
  a: typeof asset.$inferSelect,
  intervals: (typeof assetInterval.$inferSelect)[],
  today: string,
) {
  const deadlines = deadlinesFor(a.kind).map((d) => ({
    key: d.key,
    label: d.label,
    date: a[d.key],
    ...deadlineState(a[d.key], today),
  }));
  const services = intervals.map((i) => {
    const due = intervalDue(
      {
        everyMeter: i.everyMeter,
        everyMonths: i.everyMonths,
        lastDate: i.lastDate,
        lastMeter: num1(i.lastMeter),
      },
      Number(a.meterValue),
      today,
    );
    return { id: i.id, label: i.title, ...due, text: intervalText(due, a.meter) };
  });
  const alerts: Alert[] = [
    ...deadlines.filter((d) => d.tone === "overdue" || d.tone === "soon"),
    ...services.filter((s) => s.tone !== "ok"),
  ].map((x) => ({ label: x.label, tone: x.tone as Tone, text: x.text }));
  return { deadlines, services, alerts };
}

async function visibleAssetIds(ctx: Ctx, deps: ModuleDeps): Promise<string[]> {
  const def = deps.registry.get("asset");
  if (!def) return [];
  return visibleIds(ctx, await resolveEntity(ctx.db, def));
}

/** Přehled vozového parku: karty se stavem, termíny, závadami a dnešní rezervací. */
export const fleet = defineCommand({
  name: "stroje.fleet",
  permission: "stroje.read",
  input: z.object({ includeRetired: z.boolean().optional() }),
  handler: async (ctx, i, deps) => {
    const ids = await visibleAssetIds(ctx, deps);
    if (!ids.length) return { assets: [], today: todayIso() };
    const today = todayIso();
    const month = monthRange(today.slice(0, 7));
    const rows = await ctx.db
      .select({ a: asset, responsibleName: schema.user.name })
      .from(asset)
      .leftJoin(schema.user, eq(schema.user.id, asset.responsibleId))
      .where(
        and(
          inArray(asset.id, ids),
          isNull(asset.deletedAt),
          i.includeRetired ? undefined : ne(asset.status, "retired"),
        ),
      )
      .orderBy(
        sql`case when ${asset.kind} in ('car','van','truck') then 0 else 1 end`,
        asc(asset.name),
      );
    const shown = rows.map((r) => r.a.id);
    const [intervals, defects, usage, reservations] = shown.length
      ? await Promise.all([
          ctx.db
            .select()
            .from(assetInterval)
            .where(and(inArray(assetInterval.assetId, shown), isNull(assetInterval.deletedAt))),
          ctx.db
            .select({
              assetId: assetDefect.assetId,
              n: sql<number>`count(*)::int`,
              blocking: sql<number>`count(*) filter (where ${assetDefect.severity} = 'blocking')::int`,
            })
            .from(assetDefect)
            .where(
              and(
                inArray(assetDefect.assetId, shown),
                eq(assetDefect.status, "open"),
                isNull(assetDefect.deletedAt),
              ),
            )
            .groupBy(assetDefect.assetId),
          ctx.db
            .select({ assetId: assetLog.assetId, amount: sql<string>`sum(${assetLog.amount})` })
            .from(assetLog)
            .where(
              and(
                inArray(assetLog.assetId, shown),
                gte(assetLog.date, month.from),
                lte(assetLog.date, month.to),
                isNull(assetLog.deletedAt),
              ),
            )
            .groupBy(assetLog.assetId),
          ctx.db
            .select({
              assetId: assetReservation.assetId,
              dateTo: assetReservation.dateTo,
              jobId: assetReservation.jobId,
              userName: schema.user.name,
            })
            .from(assetReservation)
            .leftJoin(schema.user, eq(schema.user.id, assetReservation.userId))
            .where(
              and(
                inArray(assetReservation.assetId, shown),
                lte(assetReservation.dateFrom, today),
                gte(assetReservation.dateTo, today),
                isNull(assetReservation.deletedAt),
              ),
            ),
        ])
      : [[], [], [], []];
    const jobs = await visibleRecordTitles(
      ctx,
      deps.registry,
      "job",
      reservations.flatMap((r) => (r.jobId ? [r.jobId] : [])),
    );
    return {
      today,
      assets: rows.map((r) => {
        const x = alertsOf(
          r.a,
          intervals.filter((v) => v.assetId === r.a.id),
          today,
        );
        const d = defects.find((v) => v.assetId === r.a.id);
        const res = reservations.find((v) => v.assetId === r.a.id);
        return {
          id: r.a.id,
          name: r.a.name,
          kind: r.a.kind,
          plate: r.a.plate,
          status: r.a.status,
          meter: r.a.meter,
          meterValue: r.a.meterValue,
          responsibleName: r.responsibleName,
          openDefects: d?.n ?? 0,
          blockingDefects: d?.blocking ?? 0,
          monthAmount: usage.find((v) => v.assetId === r.a.id)?.amount ?? "0",
          today: res
            ? {
                job: res.jobId ? (jobs[res.jobId] ?? null) : null,
                user: res.userName,
                to: res.dateTo,
              }
            : null,
          ...x,
        };
      }),
    };
  },
});

/** Stroje pro výběr ve formulářích a údaje o přihlášeném. */
export const options = defineCommand({
  name: "stroje.options",
  permission: ["stroje.read", "stroje.log"],
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const ids = await visibleAssetIds(ctx, deps);
    const rows = ids.length
      ? await ctx.db
          .select({
            id: asset.id,
            name: asset.name,
            kind: asset.kind,
            plate: asset.plate,
            meter: asset.meter,
            meterValue: asset.meterValue,
            fuel: asset.fuel,
            status: asset.status,
            tankLiters: asset.tankLiters,
            responsibleId: asset.responsibleId,
          })
          .from(asset)
          .where(and(inArray(asset.id, ids), isNull(asset.deletedAt), ne(asset.status, "retired")))
          .orderBy(asc(asset.name))
      : [];
    return { assets: rows, me: { id: ctx.actor.userId, canManage: manages(ctx) } };
  },
});

/** Poslední stav tachometru a trasa pro předvyplnění formuláře. */
export const lastMeter = defineCommand({
  name: "stroje.lastMeter",
  permission: [...ANY_LOG, "stroje.read"],
  input: z.object({ assetId: id }),
  handler: async (ctx, i) => {
    const a = await loadAsset(ctx, i.assetId);
    const [last] = await ctx.db
      .select({ route: assetLog.route })
      .from(assetLog)
      .where(
        and(
          eq(assetLog.assetId, i.assetId),
          eq(assetLog.userId, ctx.actor.userId ?? "00000000-0000-0000-0000-000000000000"),
          isNull(assetLog.deletedAt),
        ),
      )
      .orderBy(desc(assetLog.date), desc(assetLog.createdAt))
      .limit(1);
    return { meterValue: a.meterValue, meter: a.meter, lastRoute: last?.route ?? null };
  },
});

/* ---------- kniha jízd ---------- */

export const logs = defineCommand({
  name: "stroje.logs",
  permission: "stroje.read",
  input: z.object({
    assetId: id.optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    userId: id.optional(),
  }),
  handler: async (ctx, i, deps) => {
    if (i.assetId) await loadAsset(ctx, i.assetId);
    const ids = i.assetId ? [i.assetId] : await visibleAssetIds(ctx, deps);
    if (!ids.length) return { rows: [], total: "0" };
    const where = [inArray(assetLog.assetId, ids), isNull(assetLog.deletedAt)];
    if (i.month) {
      const r = monthRange(i.month);
      where.push(gte(assetLog.date, r.from), lte(assetLog.date, r.to));
    }
    if (i.userId) where.push(eq(assetLog.userId, i.userId));
    const rows = await ctx.db
      .select({
        id: assetLog.id,
        assetId: assetLog.assetId,
        assetName: asset.name,
        plate: asset.plate,
        meter: asset.meter,
        date: assetLog.date,
        userId: assetLog.userId,
        userName: schema.user.name,
        meterStart: assetLog.meterStart,
        meterEnd: assetLog.meterEnd,
        amount: assetLog.amount,
        route: assetLog.route,
        purpose: assetLog.purpose,
        jobId: assetLog.jobId,
        private: assetLog.private,
      })
      .from(assetLog)
      .innerJoin(asset, eq(asset.id, assetLog.assetId))
      .leftJoin(schema.user, eq(schema.user.id, assetLog.userId))
      .where(and(...where))
      .orderBy(desc(assetLog.date), desc(assetLog.createdAt))
      .limit(500);
    const jobs = await visibleRecordTitles(
      ctx,
      deps.registry,
      "job",
      rows.flatMap((r) => (r.jobId && !r.private ? [r.jobId] : [])),
    );
    const me = ctx.actor.userId;
    const all = manages(ctx);
    return {
      total: rows.reduce((a, r) => a + Number(r.amount), 0).toFixed(1),
      rows: rows.map((r) => {
        // soukromou jízdu cizího člověka vidí ostatní jen jako „soukromá“, bez trasy a účelu
        const hidden = r.private && !all && r.userId !== me;
        return {
          ...r,
          route: hidden ? null : r.route,
          purpose: hidden ? null : r.purpose,
          job: r.jobId && !r.private ? (jobs[r.jobId] ?? null) : null,
          canDelete: all || r.userId === me,
        };
      }),
    };
  },
});

const logInput = z.object({
  assetId: id,
  date: dateInput,
  userId: id.nullish(),
  meterStart: meterInput.nullish(),
  meterEnd: meterInput.nullish(),
  amount: meterInput.nullish(),
  route: z.string().trim().max(200).nullish(),
  purpose: z.string().trim().max(200).nullish(),
  jobId: id.nullish(),
  private: z.boolean().optional(),
});

export const logSave = defineCommand({
  name: "stroje.log.save",
  permission: ANY_LOG,
  input: logInput,
  handler: async (ctx, i) =>
    engineCall(() =>
      inTx(ctx, async (c) => {
        const a = await loadAsset(c, i.assetId);
        if (a.status === "retired") throw new UserError("Vyřazený stroj už nejde používat.");
        const today = todayIso();
        if (i.date > today) throw new UserError("Jízdu nelze zapsat do budoucnosti.");
        const isPrivate = i.private ?? false;
        const userId = writerOf(c, i.userId);
        await checkJob(c, isPrivate ? null : i.jobId);
        const amount = checkLog({
          meter: a.meter,
          date: i.date,
          today,
          currentMeter: Number(a.meterValue),
          meterStart: i.meterStart ?? null,
          meterEnd: i.meterEnd ?? null,
          amount: i.amount ?? null,
          private: isPrivate,
          purpose: i.purpose || null,
          jobId: i.jobId ?? null,
        });
        const [row] = await c.db
          .insert(assetLog)
          .values({
            assetId: a.id,
            date: i.date,
            userId,
            meterStart: i.meterStart == null ? null : str1(i.meterStart),
            meterEnd: i.meterEnd == null ? null : str1(i.meterEnd),
            amount: str1(amount),
            route: i.route || null,
            purpose: i.purpose || null,
            jobId: isPrivate ? null : (i.jobId ?? null),
            private: isPrivate,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning({ id: assetLog.id });
        const end = i.meterEnd ?? Number(a.meterValue) + amount;
        if (end > Number(a.meterValue))
          await c.db
            .update(asset)
            .set({ meterValue: str1(end), updatedBy: c.actor.userId })
            .where(eq(asset.id, a.id));
        await recordAudit(c, {
          action: "create",
          entityType: "asset",
          entityId: a.id,
          summary: `Zápis do knihy: ${formatMeter(amount, a.meter)}${isPrivate ? " (soukromá)" : ""}`,
        });
        return { id: row!.id, amount: str1(amount) };
      }),
    ),
});

export const logDelete = defineCommand({
  name: "stroje.log.delete",
  permission: ANY_LOG,
  input: z.object({ id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(assetLog)
        .where(and(eq(assetLog.id, i.id), isNull(assetLog.deletedAt)));
      if (!row) throw new NotFoundError("Záznam nenalezen.");
      await assertEntityAccess(c, "asset", row.assetId, "read");
      assertOwnOrManager(c, row.userId);
      await c.db
        .update(assetLog)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(assetLog.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "asset",
        entityId: row.assetId,
        summary: `Smazán zápis z knihy jízd ze dne ${formatDate(row.date)}`,
      });
    }),
});

/* ---------- tankování ---------- */

export const fuelList = defineCommand({
  name: "stroje.fuel",
  permission: "stroje.read",
  input: z.object({
    assetId: id.optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  handler: async (ctx, i, deps) => {
    if (i.assetId) await loadAsset(ctx, i.assetId);
    const ids = i.assetId ? [i.assetId] : await visibleAssetIds(ctx, deps);
    if (!ids.length) return { rows: [], avg: null, unit: "l/100 km" };
    const where = [inArray(assetFuel.assetId, ids), isNull(assetFuel.deletedAt)];
    if (i.month) {
      const r = monthRange(i.month);
      where.push(gte(assetFuel.date, r.from), lte(assetFuel.date, r.to));
    }
    const rows = await ctx.db
      .select({
        id: assetFuel.id,
        assetId: assetFuel.assetId,
        assetName: asset.name,
        meter: asset.meter,
        date: assetFuel.date,
        userId: assetFuel.userId,
        userName: schema.user.name,
        liters: assetFuel.liters,
        totalMinor: assetFuel.totalMinor,
        meterValue: assetFuel.meterValue,
        fullTank: assetFuel.fullTank,
        station: assetFuel.station,
        payment: assetFuel.payment,
        jobId: assetFuel.jobId,
      })
      .from(assetFuel)
      .innerJoin(asset, eq(asset.id, assetFuel.assetId))
      .leftJoin(schema.user, eq(schema.user.id, assetFuel.userId))
      .where(and(...where))
      .orderBy(desc(assetFuel.date), desc(assetFuel.createdAt))
      .limit(500);
    // spotřeba potřebuje i tankování mimo zvolený měsíc
    const touched = [...new Set(rows.map((r) => r.assetId))];
    const every = touched.length
      ? await ctx.db
          .select()
          .from(assetFuel)
          .where(and(inArray(assetFuel.assetId, touched), isNull(assetFuel.deletedAt)))
      : [];
    const per = new Map<string, number>();
    let avg: number | null = null;
    for (const aid of touched) {
      const meter = rows.find((r) => r.assetId === aid)!.meter;
      const res = consumption(
        every
          .filter((x) => x.assetId === aid)
          .map((x) => ({
            id: x.id,
            liters: Number(x.liters),
            meterValue: num1(x.meterValue),
            fullTank: x.fullTank,
          })),
        meter,
      );
      for (const [k, v] of res.perFuel) per.set(k, v);
      if (i.assetId) avg = res.avg;
    }
    const jobs = await visibleRecordTitles(
      ctx,
      deps.registry,
      "job",
      rows.flatMap((r) => (r.jobId ? [r.jobId] : [])),
    );
    const me = ctx.actor.userId;
    return {
      avg,
      unit: consumptionUnit(rows[0]?.meter ?? "km"),
      rows: maskCosts(
        ctx,
        rows.map((r) => ({
          ...r,
          consumption: per.get(r.id) ?? null,
          job: r.jobId ? (jobs[r.jobId] ?? null) : null,
          canDelete: manages(ctx) || r.userId === me,
        })),
        ["totalMinor"],
      ),
    };
  },
});

export const fuelSave = defineCommand({
  name: "stroje.fuel.save",
  permission: ANY_LOG,
  input: z.object({
    assetId: id,
    date: dateInput,
    userId: id.nullish(),
    liters: num.positive("Zadejte počet litrů.").max(2000),
    totalMinor: minorInput.refine((n) => n > 0, "Zadejte částku z účtenky."),
    meterValue: meterInput.nullish(),
    fullTank: z.boolean(),
    station: z.string().trim().max(120).nullish(),
    payment: z.enum(["card", "cash"]),
    jobId: id.nullish(),
    vatRate: num.min(0).max(30).optional(),
  }),
  handler: async (ctx, i) => {
    const res = await engineCall(() =>
      inTx(ctx, async (c) => {
        const a = await loadAsset(c, i.assetId);
        if (a.status === "retired") throw new UserError("Vyřazený stroj už nejde používat.");
        if (i.date > todayIso()) throw new UserError("Tankování nelze zapsat do budoucnosti.");
        checkFuel({
          fuel: a.fuel,
          meter: a.meter,
          tankLiters: a.tankLiters,
          liters: i.liters,
          meterValue: i.meterValue ?? null,
          date: i.date,
          today: todayIso(),
          currentMeter: Number(a.meterValue),
        });
        const userId = writerOf(c, i.userId);
        await checkJob(c, i.jobId);
        const [row] = await c.db
          .insert(assetFuel)
          .values({
            assetId: a.id,
            date: i.date,
            userId,
            liters: i.liters.toFixed(2),
            totalMinor: i.totalMinor,
            vatRate: String(i.vatRate ?? 21),
            meterValue: str1(i.meterValue!),
            fullTank: i.fullTank,
            station: i.station || null,
            payment: i.payment,
            jobId: i.jobId ?? null,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning({ id: assetFuel.id });
        if (i.meterValue! > Number(a.meterValue))
          await c.db
            .update(asset)
            .set({ meterValue: str1(i.meterValue!), updatedBy: c.actor.userId })
            .where(eq(asset.id, a.id));

        const every = await c.db
          .select()
          .from(assetFuel)
          .where(and(eq(assetFuel.assetId, a.id), isNull(assetFuel.deletedAt)));
        const { perFuel } = consumption(
          every.map((x) => ({
            id: x.id,
            liters: Number(x.liters),
            meterValue: num1(x.meterValue),
            fullTank: x.fullTank,
          })),
          a.meter,
        );
        const mine = perFuel.get(row!.id) ?? null;
        const others = [...perFuel.entries()].filter(([k]) => k !== row!.id).map(([, v]) => v);
        const unusual =
          mine !== null && others.length >= 3
            ? (() => {
                const avg = others.reduce((x, y) => x + y, 0) / others.length;
                return mine > avg * 1.3 ? { mine, avg } : null;
              })()
            : null;
        // neobvyklá spotřeba (o 30 % nad průměrem) → správci vozového parku, v transakci zápisu
        if (unusual) {
          const [who] = await c.db
            .select({ name: schema.user.name })
            .from(schema.user)
            .where(eq(schema.user.id, userId));
          const unit = consumptionUnit(a.meter);
          const f = (n: number) => n.toFixed(1).replace(".", ",");
          await notify(c.db, STROJE_FUEL, {
            params: {
              asset: a.name,
              consumption: `${f(unusual.mine)} ${unit}`,
              usual: `${f(unusual.avg)} ${unit}`,
              who: who?.name ?? "—",
            },
            record: { type: "asset", id: a.id },
            actorId: c.actor.userId,
          });
        }
        return { id: row!.id, consumption: mine };
      }),
    );
    return { id: res.id, consumption: res.consumption };
  },
});

export const fuelDelete = defineCommand({
  name: "stroje.fuel.delete",
  permission: ANY_LOG,
  input: z.object({ id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(assetFuel)
        .where(and(eq(assetFuel.id, i.id), isNull(assetFuel.deletedAt)));
      if (!row) throw new NotFoundError("Záznam nenalezen.");
      await assertEntityAccess(c, "asset", row.assetId, "read");
      assertOwnOrManager(c, row.userId);
      await c.db
        .update(assetFuel)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(assetFuel.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "asset",
        entityId: row.assetId,
        summary: `Smazáno tankování ze dne ${formatDate(row.date)}`,
      });
    }),
});

/* ---------- servis a intervaly ---------- */

export const serviceInfo = defineCommand({
  name: "stroje.service",
  permission: "stroje.read",
  input: z.object({ assetId: id }),
  handler: async (ctx, i) => {
    const a = await loadAsset(ctx, i.assetId);
    const today = todayIso();
    const [services, intervals] = await Promise.all([
      ctx.db
        .select()
        .from(assetService)
        .where(and(eq(assetService.assetId, i.assetId), isNull(assetService.deletedAt)))
        .orderBy(desc(assetService.date), desc(assetService.createdAt)),
      ctx.db
        .select()
        .from(assetInterval)
        .where(and(eq(assetInterval.assetId, i.assetId), isNull(assetInterval.deletedAt)))
        .orderBy(asc(assetInterval.createdAt)),
    ]);
    return {
      meter: a.meter,
      meterValue: a.meterValue,
      services: maskCosts(
        ctx,
        services.map((s) => ({
          id: s.id,
          date: s.date,
          kind: s.kind,
          title: s.title,
          vendor: s.vendor,
          costMinor: s.costMinor,
          meterValue: s.meterValue,
          intervalId: s.intervalId,
          note: s.note,
        })),
        ["costMinor"],
      ),
      intervals: intervals.map((v) => {
        const due = intervalDue(
          {
            everyMeter: v.everyMeter,
            everyMonths: v.everyMonths,
            lastDate: v.lastDate,
            lastMeter: num1(v.lastMeter),
          },
          Number(a.meterValue),
          today,
        );
        return {
          id: v.id,
          title: v.title,
          everyMeter: v.everyMeter,
          everyMonths: v.everyMonths,
          lastDate: v.lastDate,
          lastMeter: v.lastMeter,
          ...due,
          text: intervalText(due, a.meter),
        };
      }),
    };
  },
});

export const serviceSave = defineCommand({
  name: "stroje.service.save",
  permission: "stroje.write",
  input: z.object({
    assetId: id,
    date: dateInput,
    kind: z.enum(SERVICE_KIND_VALUES),
    title: z.string().trim().min(2, "Napište, co se dělalo.").max(200),
    vendor: z.string().trim().max(120).nullish(),
    costMinor: minorInput.nullish(),
    meterValue: meterInput.nullish(),
    intervalId: id.nullish(),
    nextStkDate: dateInput.nullish(),
    note: z.string().trim().max(500).nullish(),
  }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const a = await loadAsset(c, i.assetId, "write");
      if (i.intervalId) {
        const [iv] = await c.db
          .select({ id: assetInterval.id })
          .from(assetInterval)
          .where(
            and(
              eq(assetInterval.id, i.intervalId),
              eq(assetInterval.assetId, a.id),
              isNull(assetInterval.deletedAt),
            ),
          );
        if (!iv) throw new UserError("Servisní interval k tomuto stroji nepatří.");
      }
      const [row] = await c.db
        .insert(assetService)
        .values({
          assetId: a.id,
          date: i.date,
          kind: i.kind,
          title: i.title,
          vendor: i.vendor || null,
          costMinor: i.costMinor ?? 0,
          meterValue: i.meterValue == null ? null : str1(i.meterValue),
          intervalId: i.intervalId ?? null,
          note: i.note || null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: assetService.id });
      if (i.intervalId)
        await c.db
          .update(assetInterval)
          .set({
            lastDate: i.date,
            lastMeter: i.meterValue == null ? a.meterValue : str1(i.meterValue),
            updatedBy: c.actor.userId,
          })
          .where(eq(assetInterval.id, i.intervalId));
      const patch: Partial<typeof asset.$inferInsert> = {};
      if (i.kind === "inspection" && i.nextStkDate) patch.stkDate = i.nextStkDate;
      if (i.meterValue != null && i.meterValue > Number(a.meterValue))
        patch.meterValue = str1(i.meterValue);
      if (Object.keys(patch).length)
        await c.db
          .update(asset)
          .set({ ...patch, updatedBy: c.actor.userId })
          .where(eq(asset.id, a.id));
      await recordAudit(c, {
        action: "create",
        entityType: "asset",
        entityId: a.id,
        summary: `Servis: ${i.title}`,
      });
      return { id: row!.id };
    }),
});

export const intervalSave = defineCommand({
  name: "stroje.interval.save",
  permission: "stroje.write",
  input: z.object({
    id: id.optional(),
    assetId: id,
    title: z.string().trim().min(2, "Vyplňte název, např. Výměna oleje.").max(120),
    everyMeter: z.number().int().min(1).max(10_000_000).nullish(),
    everyMonths: z.number().int().min(1).max(600).nullish(),
    lastDate: dateInput.nullish(),
    lastMeter: meterInput.nullish(),
  }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      await loadAsset(c, i.assetId, "write");
      if (!i.everyMeter && !i.everyMonths)
        throw new UserError("Zadejte interval v km nebo mth, nebo v měsících.");
      const values = {
        title: i.title,
        everyMeter: i.everyMeter ?? null,
        everyMonths: i.everyMonths ?? null,
        lastDate: i.lastDate ?? null,
        lastMeter: i.lastMeter == null ? null : str1(i.lastMeter),
        updatedBy: c.actor.userId,
      };
      if (i.id) {
        const [row] = await c.db
          .update(assetInterval)
          .set(values)
          .where(
            and(
              eq(assetInterval.id, i.id),
              eq(assetInterval.assetId, i.assetId),
              isNull(assetInterval.deletedAt),
            ),
          )
          .returning({ id: assetInterval.id });
        if (!row) throw new NotFoundError("Interval nenalezen.");
        return { id: row.id };
      }
      const [row] = await c.db
        .insert(assetInterval)
        .values({ ...values, assetId: i.assetId, createdBy: c.actor.userId })
        .returning({ id: assetInterval.id });
      return { id: row!.id };
    }),
});

export const intervalDelete = defineCommand({
  name: "stroje.interval.delete",
  permission: "stroje.write",
  input: z.object({ id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(assetInterval)
        .where(and(eq(assetInterval.id, i.id), isNull(assetInterval.deletedAt)));
      if (!row) throw new NotFoundError("Interval nenalezen.");
      await loadAsset(c, row.assetId, "write");
      await c.db
        .update(assetInterval)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(assetInterval.id, i.id));
    }),
});

/* ---------- rezervace ---------- */

export const reservations = defineCommand({
  name: "stroje.reservations",
  permission: "stroje.read",
  input: z.object({ from: dateInput, to: dateInput, assetId: id.optional() }),
  handler: async (ctx, i, deps) => {
    if (i.assetId) await loadAsset(ctx, i.assetId);
    const ids = i.assetId ? [i.assetId] : await visibleAssetIds(ctx, deps);
    if (!ids.length) return [];
    const rows = await ctx.db
      .select({
        id: assetReservation.id,
        assetId: assetReservation.assetId,
        assetName: asset.name,
        dateFrom: assetReservation.dateFrom,
        dateTo: assetReservation.dateTo,
        jobId: assetReservation.jobId,
        userId: assetReservation.userId,
        userName: schema.user.name,
        note: assetReservation.note,
      })
      .from(assetReservation)
      .innerJoin(asset, eq(asset.id, assetReservation.assetId))
      .leftJoin(schema.user, eq(schema.user.id, assetReservation.userId))
      .where(
        and(
          inArray(assetReservation.assetId, ids),
          lte(assetReservation.dateFrom, i.to),
          gte(assetReservation.dateTo, i.from),
          isNull(assetReservation.deletedAt),
        ),
      )
      .orderBy(asc(assetReservation.dateFrom), asc(asset.name));
    const jobs = await visibleRecordTitles(
      ctx,
      deps.registry,
      "job",
      rows.flatMap((r) => (r.jobId ? [r.jobId] : [])),
    );
    return rows.map((r) => ({ ...r, job: r.jobId ? (jobs[r.jobId] ?? null) : null }));
  },
});

export const reservationSave = defineCommand({
  name: "stroje.reservation.save",
  permission: "stroje.write",
  input: z.object({
    id: id.optional(),
    assetId: id,
    dateFrom: dateInput,
    dateTo: dateInput,
    jobId: id.nullish(),
    userId: id.nullish(),
    note: z.string().trim().max(300).nullish(),
  }),
  handler: async (ctx, i, deps) => {
    const saved = await inTx(ctx, async (c) => {
      if (i.dateTo < i.dateFrom) throw new UserError("Konec rezervace je před začátkem.");
      const a = await loadAsset(c, i.assetId, "write");
      if (a.status === "retired") throw new UserError("Vyřazený stroj nejde rezervovat.");
      await checkJob(c, i.jobId);
      const [clash] = await c.db
        .select({
          from: assetReservation.dateFrom,
          to: assetReservation.dateTo,
          jobId: assetReservation.jobId,
          who: schema.user.name,
        })
        .from(assetReservation)
        .leftJoin(schema.user, eq(schema.user.id, assetReservation.userId))
        .where(
          and(
            eq(assetReservation.assetId, a.id),
            lte(assetReservation.dateFrom, i.dateTo),
            gte(assetReservation.dateTo, i.dateFrom),
            isNull(assetReservation.deletedAt),
            i.id ? ne(assetReservation.id, i.id) : undefined,
          ),
        );
      if (clash) {
        const job = clash.jobId
          ? (await visibleRecordTitles(c, deps.registry, "job", [clash.jobId]))[clash.jobId]
          : null;
        throw new UserError(
          `${a.name} je ${formatDate(clash.from)} – ${formatDate(clash.to)} už rezervovaný${job ? ` na ${job}` : ""}${clash.who ? ` (${clash.who})` : ""}.`,
        );
      }
      const values = {
        dateFrom: i.dateFrom,
        dateTo: i.dateTo,
        jobId: i.jobId ?? null,
        userId: i.userId ?? null,
        note: i.note || null,
        updatedBy: c.actor.userId,
      };
      let reservationId = i.id;
      if (i.id) {
        const [row] = await c.db
          .update(assetReservation)
          .set(values)
          .where(
            and(
              eq(assetReservation.id, i.id),
              eq(assetReservation.assetId, a.id),
              isNull(assetReservation.deletedAt),
            ),
          )
          .returning({ id: assetReservation.id });
        if (!row) throw new NotFoundError("Rezervace nenalezena.");
      } else {
        const [row] = await c.db
          .insert(assetReservation)
          .values({ ...values, assetId: a.id, createdBy: c.actor.userId })
          .returning({ id: assetReservation.id });
        reservationId = row!.id;
      }
      await recordAudit(c, {
        action: i.id ? "update" : "create",
        entityType: "asset",
        entityId: a.id,
        summary: `Rezervace ${formatDate(i.dateFrom)}${i.dateTo !== i.dateFrom ? ` – ${formatDate(i.dateTo)}` : ""}`,
      });
      if (i.userId) {
        const job = i.jobId
          ? (await recordTitles(c.db, deps.registry, "job", [i.jobId]))[i.jobId]
          : null;
        await notify(c.db, STROJE_RESERVATION, {
          params: {
            asset: a.name,
            when:
              i.dateFrom === i.dateTo
                ? formatDate(i.dateFrom)
                : `${formatDate(i.dateFrom)} – ${formatDate(i.dateTo)}`,
            detail: job ?? i.note ?? "Rezervace stroje",
          },
          to: { driver: [i.userId] },
          record: { type: "asset", id: a.id },
          actorId: c.actor.userId,
        });
      }
      return { id: reservationId!, asset: a };
    });
    return { id: saved.id };
  },
});

export const reservationDelete = defineCommand({
  name: "stroje.reservation.delete",
  permission: "stroje.write",
  input: z.object({ id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(assetReservation)
        .where(and(eq(assetReservation.id, i.id), isNull(assetReservation.deletedAt)));
      if (!row) throw new NotFoundError("Rezervace nenalezena.");
      await loadAsset(c, row.assetId, "write");
      await c.db
        .update(assetReservation)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(assetReservation.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "asset",
        entityId: row.assetId,
        summary: `Zrušena rezervace ${formatDate(row.dateFrom)}`,
      });
    }),
});

/* ---------- závady ---------- */

/** Hlášení z terénu: závada, úkol odpovědné osobě; blokující závada stroj odstaví. */
export const defectReport = defineCommand({
  name: "stroje.defect.report",
  permission: ANY_LOG,
  input: z.object({
    assetId: id,
    title: z.string().trim().min(3, "Popište závadu.").max(200),
    description: z.string().trim().max(2000).nullish(),
    severity: z.enum(["normal", "blocking"]),
  }),
  handler: async (ctx, i) => {
    const res = await inTx(ctx, async (c) => {
      const a = await loadAsset(c, i.assetId);
      const me = c.actor.userId;
      if (!me) throw new PermissionError();
      const managers = await usersWithPermission(c.db, "stroje.write");
      // řešitel: odpovědná osoba, pokud spravuje vozový park, jinak jiný správce, až pak ten, kdo hlásí
      const assignee =
        a.responsibleId && managers.includes(a.responsibleId)
          ? a.responsibleId
          : (managers.find((m) => m !== me) ?? managers[0] ?? me);
      const blocking = i.severity === "blocking";
      const [d] = await c.db
        .insert(assetDefect)
        .values({
          assetId: a.id,
          title: i.title,
          description: i.description || null,
          severity: i.severity,
          reportedBy: me,
          createdBy: me,
          updatedBy: me,
        })
        .returning({ id: assetDefect.id });
      const [who] = await c.db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, me));
      // úkol zakládá systém: kdo závadu hlásí z terénu, nemusí mít právo přidělovat úkoly
      const [t] = await c.db
        .insert(schema.task)
        .values({
          title: `Závada: ${a.name}, ${i.title}`,
          description: [i.description, `Nahlásil(a) ${who?.name ?? "—"}.`]
            .filter(Boolean)
            .join("\n\n"),
          assigneeId: assignee,
          dueDate: todayIso(),
          priority: blocking ? "high" : "normal",
          entityType: "asset_defect",
          entityId: d!.id,
          createdBy: me,
          updatedBy: me,
        })
        .returning({ id: schema.task.id });
      await c.db.update(assetDefect).set({ taskId: t!.id }).where(eq(assetDefect.id, d!.id));
      if (blocking && a.status === "active")
        await c.db
          .update(asset)
          .set({ status: "service", updatedBy: me })
          .where(eq(asset.id, a.id));
      await recordAudit(c, {
        action: "create",
        entityType: "asset_defect",
        entityId: d!.id,
        summary: `${a.name}: ${i.title}${blocking ? " (mimo provoz)" : ""}`,
      });
      // blokující závada jde navíc všem správcům vozového parku (příjemci podle pravidel události)
      await notify(c.db, blocking ? STROJE_DEFECT_BLOCKING : STROJE_DEFECT, {
        params: { asset: a.name, defect: i.title, reporter: who?.name ?? "—" },
        to: { assignee: [assignee], responsible: [a.responsibleId] },
        record: { type: "asset_defect", id: d!.id },
        actorId: me,
      });
      return { id: d!.id, taskId: t!.id, blocking };
    });
    return res;
  },
});

export const defectResolve = defineCommand({
  name: "stroje.defect.resolve",
  permission: "stroje.write",
  input: z.object({ id, resolution: z.string().trim().max(1000).nullish() }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [def] = await c.db
        .select()
        .from(assetDefect)
        .where(and(eq(assetDefect.id, i.id), isNull(assetDefect.deletedAt)))
        .for("update");
      if (!def) throw new NotFoundError("Závada nenalezena.");
      const a = await loadAsset(c, def.assetId, "write");
      if (def.status !== "open") throw new UserError("Závada už je vyřešená.");
      await c.db
        .update(assetDefect)
        .set({
          status: "resolved",
          resolution: i.resolution || null,
          resolvedAt: new Date(),
          updatedBy: c.actor.userId,
        })
        .where(eq(assetDefect.id, i.id));
      if (def.taskId)
        await c.db
          .update(schema.task)
          .set({ doneAt: new Date(), updatedBy: c.actor.userId })
          .where(and(eq(schema.task.id, def.taskId), isNull(schema.task.doneAt)));
      // poslední blokující závada vyřešena → stroj zpět do provozu
      const [open] = await c.db
        .select({ n: sql<number>`count(*)::int` })
        .from(assetDefect)
        .where(
          and(
            eq(assetDefect.assetId, def.assetId),
            eq(assetDefect.status, "open"),
            eq(assetDefect.severity, "blocking"),
            isNull(assetDefect.deletedAt),
          ),
        );
      let back = false;
      if (!open?.n && a.status === "service") {
        await c.db
          .update(asset)
          .set({ status: "active", updatedBy: c.actor.userId })
          .where(eq(asset.id, a.id));
        back = true;
      }
      await auditChange(c, {
        entityType: "asset_defect",
        entityId: i.id,
        before: { Stav: "open" },
        after: { Stav: "resolved" },
        summary: `Vyřešeno${i.resolution ? `: ${i.resolution}` : ""}`,
      });
      if (def.reportedBy)
        await notify(c.db, STROJE_DEFECT_RESOLVED, {
          params: { asset: a.name, detail: i.resolution || def.title },
          to: { reporter: [def.reportedBy] },
          record: { type: "asset_defect", id: def.id },
          actorId: c.actor.userId,
        });
      return { backInService: back };
    }),
});

/* ---------- náklady ---------- */

/** Náklady stroje za posledních 12 měsíců: palivo bez DPH, servis a provoz; na jednotku. */
export const assetCosts = defineCommand({
  name: "stroje.assetCosts",
  permission: "stroje.write",
  input: z.object({ assetId: id }),
  handler: async (ctx, i) => {
    const a = await loadAsset(ctx, i.assetId);
    const from = addMonthsIso(todayIso(), -12);
    const [fuel] = await ctx.db
      .select({
        liters: sql<string>`coalesce(sum(${assetFuel.liters}), 0)`,
        // po záznamech zaokrouhleno stejně jako řádky nákladů zakázky (poskytovatel `stroje.machines`), ať se součty shodují na haléř
        net: sql<number>`coalesce(sum(round(${assetFuel.totalMinor} / (1 + ${assetFuel.vatRate} / 100))), 0)::float`,
      })
      .from(assetFuel)
      .where(
        and(
          eq(assetFuel.assetId, i.assetId),
          gte(assetFuel.date, from),
          isNull(assetFuel.deletedAt),
        ),
      );
    const [svc] = await ctx.db
      .select({ cost: sql<number>`coalesce(sum(${assetService.costMinor}), 0)::float` })
      .from(assetService)
      .where(
        and(
          eq(assetService.assetId, i.assetId),
          gte(assetService.date, from),
          isNull(assetService.deletedAt),
        ),
      );
    const [use] = await ctx.db
      .select({ amount: sql<string>`coalesce(sum(${assetLog.amount}), 0)` })
      .from(assetLog)
      .where(
        and(eq(assetLog.assetId, i.assetId), gte(assetLog.date, from), isNull(assetLog.deletedAt)),
      );
    const fuelNet = Math.round(fuel?.net ?? 0);
    const service = Math.round(svc?.cost ?? 0);
    const amount = Number(use?.amount ?? 0);
    return {
      since: from,
      meter: a.meter,
      amount,
      liters: fuel?.liters ?? "0",
      fuelNetMinor: fuelNet,
      serviceMinor: service,
      totalMinor: fuelNet + service,
      perUnitMinor: amount > 0 ? Math.round((fuelNet + service) / amount) : null,
    };
  },
});

/** Stroje na zakázce: provoz × interní sazba, palivo účtované na zakázku, rezervace. */
export const jobFleet = defineCommand({
  name: "stroje.jobFleet",
  permission: "stroje.read",
  input: z.object({ jobId: id }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const [usage, fuel, res] = await Promise.all([
      ctx.db
        .select({
          assetId: asset.id,
          name: asset.name,
          meter: asset.meter,
          rateMinor: asset.internalRateMinor,
          amount: sql<string>`sum(${assetLog.amount})`,
          days: sql<number>`count(distinct ${assetLog.date})::int`,
        })
        .from(assetLog)
        .innerJoin(asset, eq(asset.id, assetLog.assetId))
        .where(and(eq(assetLog.jobId, i.jobId), isNull(assetLog.deletedAt)))
        .groupBy(asset.id),
      ctx.db
        .select({
          assetId: assetFuel.assetId,
          liters: sql<string>`sum(${assetFuel.liters})`,
          // po záznamech zaokrouhleno stejně jako řádky nákladů zakázky (poskytovatel `stroje.machines`)
          net: sql<number>`sum(round(${assetFuel.totalMinor} / (1 + ${assetFuel.vatRate} / 100)))::float`,
        })
        .from(assetFuel)
        .where(and(eq(assetFuel.jobId, i.jobId), isNull(assetFuel.deletedAt)))
        .groupBy(assetFuel.assetId),
      ctx.db
        .select({
          id: assetReservation.id,
          assetName: asset.name,
          dateFrom: assetReservation.dateFrom,
          dateTo: assetReservation.dateTo,
          userName: schema.user.name,
        })
        .from(assetReservation)
        .innerJoin(asset, eq(asset.id, assetReservation.assetId))
        .leftJoin(schema.user, eq(schema.user.id, assetReservation.userId))
        .where(and(eq(assetReservation.jobId, i.jobId), isNull(assetReservation.deletedAt)))
        .orderBy(asc(assetReservation.dateFrom)),
    ]);
    void deps;
    // sazby a náklady zakázky vidí jen držitel ekonomiky (montér ví, co se používalo, ne kolik to stálo)
    const priced = can(ctx, "zakazky.economics");
    const rows = usage.map((u) => ({
      ...u,
      rateMinor: priced ? u.rateMinor : null,
      costMinor: priced ? Math.round(Number(u.amount) * (u.rateMinor ?? 0)) : 0,
      fuelLiters: fuel.find((f) => f.assetId === u.assetId)?.liters ?? "0",
      fuelNetMinor: priced ? Math.round(fuel.find((f) => f.assetId === u.assetId)?.net ?? 0) : 0,
    }));
    const fuelTotal = priced ? fuel.reduce((a, f) => a + Math.round(f.net ?? 0), 0) : 0;
    return {
      rows,
      reservations: res,
      usageMinor: rows.reduce((a, r) => a + r.costMinor, 0),
      fuelMinor: fuelTotal,
    };
  },
});

export const commands = [
  fleet,
  options,
  lastMeter,
  logs,
  logSave,
  logDelete,
  fuelList,
  fuelSave,
  fuelDelete,
  serviceInfo,
  serviceSave,
  intervalSave,
  intervalDelete,
  reservations,
  reservationSave,
  reservationDelete,
  defectReport,
  defectResolve,
  assetCosts,
  jobFleet,
];
