import { eq } from "drizzle-orm";
import {
  notify,
  type AnyEventDef,
  type NotifyInput,
  type NotifyResult,
} from "@rebar/core/notifications";
import type { Executor } from "@rebar/core/db";
import { JOB_TEAM_AUDIENCES } from "./notifications";
import { job, jobMember } from "./schema";

/** Skupiny příjemců událostí přes `notifyJobTeam` (definice je v `notifications.ts`, aby ji viděl i manifest). */
export { JOB_TEAM_AUDIENCES };

/**
 * Upozorní tým zakázky událostí z katalogu. K parametrům doplní `number` (číslo zakázky), záznamem události je
 * zakázka (příjemce bez práva na zakázku upozornění nedostane). Odkaz se skládá ze šablony události; `urlSuffix`
 * ho zakončí (např. `?tab=fakturace`), `url` ho přepíše celý.
 */
export async function notifyJobTeam<D extends AnyEventDef>(
  db: Executor,
  jobId: string,
  actorId: string | null,
  event: D,
  params: Omit<NotifyInput<D>["params"], "number">,
  opts: {
    extraUserIds?: readonly (string | null | undefined)[];
    urlSuffix?: string;
    url?: string;
    dedupe?: string;
  } = {},
): Promise<NotifyResult | null> {
  const [j] = await db
    .select({ number: job.number, managerId: job.managerId })
    .from(job)
    .where(eq(job.id, jobId));
  if (!j) return null;
  const members = await db
    .select({ userId: jobMember.userId })
    .from(jobMember)
    .where(eq(jobMember.jobId, jobId));
  const team = [j.managerId, ...members.map((m) => m.userId)];
  const input = {
    params: { ...params, number: j.number },
    to: { team, extra: opts.extraUserIds ?? [] },
    record: { type: "job", id: jobId },
    actorId,
    ...(opts.url ? { url: opts.url } : {}),
    ...(opts.dedupe ? { dedupe: opts.dedupe } : {}),
  } as unknown as NotifyInput<D>;
  if (opts.urlSuffix && !opts.url)
    input.url = `${event.template.url.replace(/\{entityId\}/g, jobId)}${opts.urlSuffix}`;
  return notify(db, event, input);
}
