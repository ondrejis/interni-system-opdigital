import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Executor } from "@rebar/core/db";
import { defineModuleJob } from "@rebar/core/module-server";
import { countOf, notify } from "@rebar/core/notifications";
import { systemCtx } from "@rebar/core/rbac";
import {
  addDaysIso,
  addWorkdays,
  isWorkday,
  localParts,
  todayIso,
  zonedToUtc,
} from "@rebar/core/time";
import { job } from "@rebar/zakazky/schema";
import { crmActivity } from "../../schema";
import { recomputeAllJobsCrm } from "../deals/recompute";
import {
  CRM_ACTIVITIES_TODAY,
  CRM_DEALS_ROTTING,
  CRM_DEALS_WITHOUT_ACTIVITY,
} from "./notifications";
import { dayOf } from "./logic";

/*
  Plánované úlohy CRM (cron běží v Europe/Prague přes pg-boss; „dnes“ se počítá místním datem, takže přechod letního času
  nic nezdvojí ani nevynechá). Všechny jsou idempotentní: upozornění mají `dedupe: "day"`, opakované spuštění ve stejný
  den nic nepřidá. O víkendech a státních svátcích se ranní přehledy neposílají.
*/

/** Fáze zakázky, ve kterých obchod ještě běží. */
const OPEN_PHASES = ["inquiry", "offer"];

const listText = (titles: string[], max = 3) =>
  titles.slice(0, max).join(" · ") +
  (titles.length > max ? ` · …a ${titles.length - max} dalších` : "");

/**
 * Ranní přehled aktivit: každému, kdo má otevřené aktivity s dnešním termínem nebo po termínu, přijde jedno upozornění.
 * Aktivita na dnes, jejíž čas už uplynul, se počítá do „dnes“ (rozhoduje den, ne hodina).
 */
export async function sendActivityDigests(
  db: Executor,
  now: Date = new Date(),
): Promise<{ users: number; created: number }> {
  const today = todayIso("Europe/Prague", now);
  if (!isWorkday(today)) return { users: 0, created: 0 };
  const day = sql`((${crmActivity.dueAt} at time zone 'Europe/Prague')::date)`;
  const rows = await db
    .select({
      assigneeId: crmActivity.assigneeId,
      subject: crmActivity.subject,
      dueAt: crmActivity.dueAt,
    })
    .from(crmActivity)
    .where(
      and(
        isNull(crmActivity.doneAt),
        isNull(crmActivity.deletedAt),
        isNotNull(crmActivity.assigneeId),
        isNotNull(crmActivity.dueAt),
        sql`${day} <= ${today}::date`,
      ),
    )
    .orderBy(crmActivity.dueAt);
  const byUser = new Map<string, { today: string[]; overdue: string[] }>();
  for (const r of rows) {
    const e = byUser.get(r.assigneeId!) ?? { today: [], overdue: [] };
    (dayOf(r.dueAt!) === today ? e.today : e.overdue).push(r.subject);
    byUser.set(r.assigneeId!, e);
  }
  let created = 0;
  for (const [userId, e] of byUser) {
    const parts = [
      e.today.length
        ? `${countOf(e.today.length, "aktivita", "aktivity", "aktivit")} na dnes`
        : null,
      e.overdue.length ? `${e.overdue.length} po termínu` : null,
    ].filter(Boolean);
    const r = await notify(db, CRM_ACTIVITIES_TODAY, {
      to: { assignee: [userId] },
      at: now,
      params: { summary: parts.join(", "), list: listText([...e.overdue, ...e.today]) },
    });
    created += r.created;
  }
  return { users: byUser.size, created };
}

/**
 * Ranní upozornění „zakázka bez další aktivity“: vedoucímu otevřených obchodů (poptávka, nabídka; ne archivovaných), které
 * nemají žádnou otevřenou aktivitu. Zakázky založené dnes se nehlásí (obchodník ještě nestihl nic naplánovat).
 */
export async function notifyDealsWithoutActivity(
  db: Executor,
  now: Date = new Date(),
): Promise<{ deals: number; created: number }> {
  const today = todayIso("Europe/Prague", now);
  if (!isWorkday(today)) return { deals: 0, created: 0 };
  const rows = await db
    .select({ id: job.id, title: job.title, managerId: job.managerId })
    .from(job)
    .where(
      and(
        isNull(job.deletedAt),
        isNull(job.crmArchivedAt),
        isNotNull(job.managerId),
        inArray(job.phase, OPEN_PHASES),
        eq(job.crmOpenActivities, 0),
        lt(job.createdAt, zonedToUtc(today, "00:00")),
      ),
    )
    .orderBy(job.createdAt);
  const byOwner = new Map<string, string[]>();
  for (const r of rows) byOwner.set(r.managerId!, [...(byOwner.get(r.managerId!) ?? []), r.title]);
  let created = 0;
  for (const [ownerId, titles] of byOwner) {
    const r = await notify(db, CRM_DEALS_WITHOUT_ACTIVITY, {
      to: { owner: [ownerId] },
      at: now,
      params: {
        summary: `${countOf(titles.length, "zakázka", "zakázky", "zakázek")} bez další aktivity`,
        list: listText(titles),
      },
    });
    created += r.created;
  }
  return { deals: rows.length, created };
}

/**
 * Denní úloha hnití: přepočítá `crm_*` všech zakázek (hnití se mění během dne, i když se nic nepsalo) a vedoucím upozorní na
 * obchody, které přestaly hnít „čerstvě“, tj. překročily limit stavu od posledního pracovního dne. Bez stavu v databázi:
 * den překročení limitu se spočítá z posledního pohybu a limitu stavu, takže opakované spuštění nic nezdvojí.
 */
export async function refreshRotting(
  db: Executor,
  now: Date = new Date(),
): Promise<{ recomputed: number; notified: number }> {
  const recomputed = await recomputeAllJobsCrm(systemCtx(db), now);
  const today = todayIso("Europe/Prague", now);
  if (!isWorkday(today)) return { recomputed, notified: 0 };
  const previous = addWorkdays(today, -1);
  const rows = await db
    .select({
      id: job.id,
      title: job.title,
      managerId: job.managerId,
      enteredAt: job.crmStageEnteredAt,
      lastAt: job.crmLastActivityAt,
      rottingDays: schema.pipelineStage.rottingDays,
    })
    .from(job)
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, job.stageId))
    .where(
      and(
        isNull(job.deletedAt),
        isNull(job.crmArchivedAt),
        isNotNull(job.managerId),
        eq(job.crmRotting, true),
      ),
    );
  const byOwner = new Map<string, string[]>();
  for (const r of rows) {
    const stamps = [r.enteredAt, r.lastAt].filter((d): d is Date => !!d).map((d) => d.getTime());
    if (!stamps.length || !r.rottingDays) continue;
    const rottedOn = addDaysIso(localParts(new Date(Math.max(...stamps))).date, r.rottingDays);
    if (rottedOn > previous && rottedOn <= today)
      byOwner.set(r.managerId!, [...(byOwner.get(r.managerId!) ?? []), r.title]);
  }
  let notified = 0;
  for (const [ownerId, titles] of byOwner) {
    const r = await notify(db, CRM_DEALS_ROTTING, {
      to: { owner: [ownerId] },
      at: now,
      params: {
        summary: titles.length === 1 ? "1 zakázka hnije" : `${titles.length} zakázek hnije`,
        list: listText(titles),
      },
    });
    notified += r.created;
  }
  return { recomputed, notified };
}

/** Pracovní dny v 7:10: přehled aktivit na dnešek a po termínu. */
export const activityDigestJob = defineModuleJob({
  name: "crm.activities.digest",
  schema: z.object({}),
  cron: "10 7 * * 1-5",
  retryLimit: 2,
  keepCompletedSeconds: 600,
  async handler(deps) {
    await sendActivityDigests(deps.db);
  },
});

/** Pracovní dny v 7:15: obchody bez další aktivity. */
export const dealsAttentionJob = defineModuleJob({
  name: "crm.deals.attention",
  schema: z.object({}),
  cron: "15 7 * * 1-5",
  retryLimit: 2,
  keepCompletedSeconds: 600,
  async handler(deps) {
    await notifyDealsWithoutActivity(deps.db);
  },
});

/** Denně v 5:30: přepočet hnití všech zakázek (`crmApi.recomputeAllJobsCrm`) a upozornění na nově zhnilé. */
export const rottingRefreshJob = defineModuleJob({
  name: "crm.rotting.refresh",
  schema: z.object({}),
  cron: "30 5 * * *",
  retryLimit: 2,
  keepCompletedSeconds: 600,
  async handler(deps) {
    await refreshRotting(deps.db);
  },
});

export const activityJobs = [activityDigestJob, dealsAttentionJob, rottingRefreshJob];
