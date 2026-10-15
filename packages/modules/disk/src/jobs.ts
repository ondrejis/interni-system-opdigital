/*
  Úloha `disk.timeout` (každou minutu): udržuje stavy požadavků na složky.
  1. doručení webhooku (`webhook_delivery`) posune `pending → sent`, trvale selhané doručení je chyba;
  2. požadavek, pro který neexistuje žádné doručení (chybí aktivní webhook, nebo pro soukromý záznam žádný s
     „Doručovat i soukromé“), skončí chybou hned, ne po 10 minutách;
  3. otevřený požadavek bez odpovědi déle než 10 minut je `timeout` („Zkusit znovu“);
  4. požadavek, který čeká na dokončený, se odešle (pojistka, kdyby se při dokončení nepodařilo).
*/
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rebar/core/db";
import { defineModuleJob, type ModuleJobDeps } from "@rebar/core/module-server";
import { inTx, systemCtx, type Ctx } from "@rebar/core/rbac";
import { driveEndpoints } from "./endpoints";
import { releaseNext, REQUEST_MESSAGES, settleRequest } from "./requests";
import { driveRequest } from "./schema";
import { isOverdue } from "./state";
import type { DriveRequestState } from "./types";

/** Prodleva, po které se bez jakéhokoli doručení požadavek označí chybou (doručení vzniká ve stejné transakci jako požadavek). */
const NO_DELIVERY_AFTER_MS = 60_000;

/** Jeden běh údržby; vrací počty změn (pro testy a log). */
export async function maintainRequests(
  ctx: Ctx,
  env: Pick<ModuleJobDeps, "registry" | "settings" | "baseURL">,
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; timedOut: number; released: number }> {
  const out = { sent: 0, failed: 0, timedOut: 0, released: 0 };
  await inTx(ctx, async (c) => {
    const open = await c.db
      .select()
      .from(driveRequest)
      .where(inArray(driveRequest.state, ["pending", "sent"]))
      .orderBy(driveRequest.id);
    if (!open.length) return;

    const deliveries = await c.db
      .select({
        eventId: schema.webhookDelivery.eventId,
        status: schema.webhookDelivery.status,
        lastError: schema.webhookDelivery.lastError,
      })
      .from(schema.webhookDelivery)
      .where(
        inArray(
          schema.webhookDelivery.eventId,
          open.map((r) => r.eventId).filter((v): v is string => !!v),
        ),
      );
    const byEvent = new Map<string, typeof deliveries>();
    for (const d of deliveries) byEvent.set(d.eventId, [...(byEvent.get(d.eventId) ?? []), d]);
    const endpoints = await driveEndpoints(c.db);

    for (const r of open) {
      const state = r.state as DriveRequestState;
      // 4. čeká na požadavek, který už skončil (nebo zmizel)
      if (r.blockedBy) {
        const [blocker] = await c.db
          .select({ state: driveRequest.state })
          .from(driveRequest)
          .where(eq(driveRequest.id, r.blockedBy));
        if (!blocker || (blocker.state !== "pending" && blocker.state !== "sent")) {
          await releaseNext(c, env, r.blockedBy);
          out.released += 1;
        }
        continue;
      }
      const mine = r.eventId ? (byEvent.get(r.eventId) ?? []) : [];
      // 1. doručení webhooku
      if (mine.some((d) => d.status === "delivered") && state === "pending") {
        await settleRequest(c, env, r.id, "delivered");
        out.sent += 1;
      } else if (mine.length && mine.every((d) => d.status === "failed")) {
        await settleRequest(
          c,
          env,
          r.id,
          "delivery_failed",
          `${REQUEST_MESSAGES.deliveryFailed}${mine[0]?.lastError ? ` (${mine[0].lastError})` : ""}`,
        );
        out.failed += 1;
        continue;
      } else if (
        !mine.length &&
        r.sentAt &&
        now.getTime() - r.sentAt.getTime() > NO_DELIVERY_AFTER_MS
      ) {
        // 2. nikomu se nedoručovalo
        const eligible = endpoints.some((e) => !r.isPrivate || e.includePrivate);
        if (!eligible) {
          await settleRequest(
            c,
            env,
            r.id,
            "delivery_failed",
            r.isPrivate && endpoints.length
              ? REQUEST_MESSAGES.noPrivateEndpoint
              : REQUEST_MESSAGES.noEndpoint,
          );
          out.failed += 1;
          continue;
        }
      }
      // 3. lhůta na odpověď
      const [fresh] = await c.db.select().from(driveRequest).where(eq(driveRequest.id, r.id));
      if (
        fresh &&
        isOverdue(
          {
            state: fresh.state as DriveRequestState,
            requestedAt: fresh.requestedAt,
            sentAt: fresh.sentAt,
            blockedBy: fresh.blockedBy,
          },
          now,
        )
      ) {
        await settleRequest(c, env, r.id, "timeout");
        out.timedOut += 1;
      }
    }
  });
  return out;
}

/** Každou minutu: stavy požadavků na složky (viz `maintainRequests`). */
export const diskTimeoutJob = defineModuleJob({
  name: "disk.timeout",
  schema: z.object({}),
  cron: "* * * * *",
  retryLimit: 1,
  keepCompletedSeconds: 300,
  async handler(deps) {
    await maintainRequests(systemCtx(deps.db), deps);
  },
});

/** Úlohy modulu. */
export const jobs = [diskTimeoutJob];
