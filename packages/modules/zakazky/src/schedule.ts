import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@rebar/core/db";
import { defineModuleJob, defineModuleServer, type ModuleServer } from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { isWorkday, localParts } from "@rebar/core/time";
import { JOB_STARTS_TODAY } from "./notifications";
import { job, jobMember } from "./schema";

/** Fáze, ve kterých má smysl hlásit začátek: zakázka je vyhraná a chystá se nebo běží stavba. */
const ACTIVE_PHASES = ["preparation", "execution"];

/**
 * Ranní upozornění „Zakázka dnes začíná“: zakázky s plánovaným začátkem (`start_date`) dnes, které jsou v přípravě
 * nebo realizaci, oznámí vedoucímu a týmu. Den se počítá v Europe/Prague. Idempotentní (`dedupe: "day"` události),
 * opakované spuštění ve stejný den nic nezdvojí. O víkendech a státních svátcích se neposílá.
 */
export async function notifyJobsStartingToday(
  db: Executor,
  now = new Date(),
): Promise<{ jobs: number; created: number }> {
  const today = localParts(now).date;
  if (!isWorkday(today)) return { jobs: 0, created: 0 };
  const rows = await db
    .select({
      id: job.id,
      number: job.number,
      title: job.title,
      address: job.address,
      managerId: job.managerId,
    })
    .from(job)
    .where(and(eq(job.startDate, today), inArray(job.phase, ACTIVE_PHASES), isNull(job.deletedAt)));
  let created = 0;
  for (const j of rows) {
    const members = await db
      .select({ userId: jobMember.userId })
      .from(jobMember)
      .where(eq(jobMember.jobId, j.id));
    const r = await notify(db, JOB_STARTS_TODAY, {
      params: { number: j.number, title: j.title, address: j.address },
      to: { team: [j.managerId, ...members.map((m) => m.userId)] },
      record: { type: "job", id: j.id },
      at: now,
    });
    created += r.created;
  }
  return { jobs: rows.length, created };
}

/** Cron běží v Europe/Prague (pg-boss), takže se přechod letního času řeší sám. */
export const startsTodayJob = defineModuleJob({
  name: "zakazky.starts_today",
  schema: z.object({}),
  cron: "30 6 * * 1-5",
  retryLimit: 2,
  async handler(deps) {
    await notifyJobsStartingToday(deps.db);
  },
});

export const area: ModuleServer = defineModuleServer({ jobs: [startsTodayJob] });
